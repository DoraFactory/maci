# AMACI AddNewKey 安全性分析

## 问题背景

用户提出了一个重要的安全问题：

> **因为 deactivate 数据实际上就是一个奇偶点，voter 能否使用别人的 deactivate 数据生成 addNewKey proof？**

这是一个关于 AMACI 安全性的核心问题，涉及到 deactivate 数据的生成、验证和防重放机制。

## 关键组件分析

### 1. `genStaticRandomKey` 函数

**位置**: `packages/sdk/src/operator.ts:1240-1242`

```typescript
private genStaticRandomKey(privKey: PrivKey, salt: bigint, index: bigint): PrivKey {
  return poseidon([privKey, salt, index]);
}
```

**功能**:
- 生成一个**确定性**的随机数
- 输入: coordinator 私钥、盐值 (20040n)、索引值
- 输出: 用于 ElGamal 加密的随机数

**目的**:
- 确保相同输入总是产生相同的随机数（可重现性）
- 允许 operator 在需要时重新生成相同的加密数据
- 使用 poseidon 哈希保证安全性

### 2. `newActiveState[i]` 是什么？

**位置**: `packages/sdk/src/operator.ts:1076-1077`

```typescript
for (let i = 0; i < batchSize; i++) {
  newActiveState[i] = BigInt(this.processedDMsgCount + i + 1);
}
```

**含义**:
- `newActiveState[i]` 是一个**递增的序列号**
- 值 = `processedDMsgCount + i + 1`
- 每处理一个 deactivate 消息，序列号递增

**作用**:
- 作为 `genStaticRandomKey` 的 index 参数
- 确保每次处理消息时生成不同的随机数
- 防止使用相同的加密数据

**为什么需要它？**
```typescript
this.genStaticRandomKey(
  signer.getPrivateKey(),  // 固定的
  20040n,                  // 固定的
  newActiveState[i]        // 变化的！确保每次生成不同的随机数
)
```

### 3. 电路是否验证 `encryptOdevity`？

**答案**: **否！** 电路不验证 `encryptOdevity` 的生成过程。

**AddNewKey 电路验证的内容** (`addNewKey.circom`):

```circom
// 1. 验证 nullifier
component nullifierHasher = HashLeftRight(); 
nullifierHasher.left <== oldPrivateKey;
nullifierHasher.right <== 1444992409218394441042; // 'NULLIFIER'
nullifierHasher.hash === nullifier;

// 2. 验证 ECDH sharedKey
component ecdh = Ecdh();
ecdh.privKey <== oldPrivateKey;
ecdh.pubKey[0] <== coordPubKey[0];
ecdh.pubKey[1] <== coordPubKey[1];

// 3. 验证 deactivateLeaf 匹配
component deactivateLeafHasher = Hasher5();
deactivateLeafHasher.in[0] <== c1[0];
deactivateLeafHasher.in[1] <== c1[1];
deactivateLeafHasher.in[2] <== c2[0];
deactivateLeafHasher.in[3] <== c2[1];
deactivateLeafHasher.in[4] <== sharedKeyHasher.hash;  // 关键！
deactivateLeafHasher.hash === deactivateLeaf;

// 4. 验证 deactivateLeaf 在 deactivateTree 中存在
component deactivateQie = QuinLeafExists(deactivateTreeDepth);
deactivateQie.leaf <== deactivateLeaf;
deactivateQie.root <== deactivateRoot;

// 5. 验证 rerandomize 正确性
component rerandomize = ElGamalReRandomize();
rerandomize.c1[0] <== c1[0];
rerandomize.c1[1] <== c1[1];
rerandomize.c2[0] <== c2[0];
rerandomize.c2[1] <== c2[1];
rerandomize.randomVal <== randomVal;
rerandomize.d1[0] === d1[0];
rerandomize.d2[0] === d2[0];
```

**电路不验证的内容**:
- ❌ **不验证** c1, c2 的奇偶性（是否真的是 deactivated）
- ❌ **不验证** c1, c2 是如何生成的
- ❌ **不验证** randomVal 的来源

**为什么不验证？**
- 因为 c1, c2 的内容对 AddNewKey 来说不重要
- 重要的是：这个 c1, c2 属于这个 voter（通过 sharedKey 验证）
- Rerandomize 后，奇偶性保持不变

## 主要安全问题：能否使用别人的 deactivate 数据？

### 场景分析

**假设**:
- Voter A 想生成 AddNewKey proof
- Voter B 的 deactivateLeaf 在 deactivateTree 中
- Voter A 尝试使用 Voter B 的 c1, c2

### deactivateLeaf 的结构

```typescript
const dLeaf = [
  deactivate.c1[0],    // c1_x
  deactivate.c1[1],    // c1_y
  deactivate.c2[0],    // c2_x
  deactivate.c2[1],    // c2_y
  poseidon(sharedKey)  // 第5个元素：关键防护！
];
```

### sharedKey 的生成

**Operator 生成时**:
```typescript
const sharedKey = signer.genEcdhSharedKey(s.pubKey);
// = ECDH(coordPrivKey, voterPubKey)
```

**Voter 在电路中**:
```circom
component ecdh = Ecdh();
ecdh.privKey <== oldPrivateKey;  // voterPrivKey
ecdh.pubKey[0] <== coordPubKey[0];
// = ECDH(voterPrivKey, coordPubKey)
```

**ECDH 对称性**:
```
ECDH(coordPrivKey, voterPubKey) = ECDH(voterPrivKey, coordPubKey)
```

### 攻击尝试

**Voter A 尝试使用 Voter B 的数据**:

1. Voter A 提供:
   - `oldPrivateKey` = Voter A 的私钥
   - `c1`, `c2` = Voter B 的数据
   - `deactivateLeaf` = Voter B 的 deactivateLeaf

2. 电路计算:
   ```circom
   sharedKey_A = ECDH(voterA_PrivKey, coordPubKey)
   
   deactivateLeafHasher.in[4] = hash(sharedKey_A)
   deactivateLeafHasher.hash = hash([c1_B, c2_B, sharedKey_A])
   ```

3. 验证失败:
   ```circom
   deactivateLeafHasher.hash ≠ deactivateLeaf_B
   ```
   因为:
   ```
   hash([c1_B, c2_B, sharedKey_A]) ≠ hash([c1_B, c2_B, sharedKey_B])
   ```

**结论**: ❌ **Voter A 无法使用 Voter B 的 deactivate 数据！**

### 第二个问题：能否重复使用自己的 deactivate 数据？

**场景**:
- Voter A 已经用过一次 AddNewKey
- Voter A 尝试从 deactivateTree 中提取自己的旧 deactivateLeaf
- Voter A 再次生成 AddNewKey proof

**Nullifier 防重放机制** (`contracts/amaci/src/contract.rs:1310-1315`):

```rust
if NULLIFIERS.has(deps.storage, nullifier.to_be_bytes().to_vec()) {
    return Err(ContractError::NewKeyExist {});
}

NULLIFIERS.save(deps.storage, nullifier.to_be_bytes().to_vec(), &true)?;
```

**Nullifier 的生成** (电路 `addNewKey.circom:52-55`):

```circom
component nullifierHasher = HashLeftRight(); 
nullifierHasher.left <== oldPrivateKey;
nullifierHasher.right <== 1444992409218394441042; // 'NULLIFIER'
nullifierHasher.hash === nullifier;
```

**防御机制**:
- `nullifier = hash(oldPrivateKey, 'NULLIFIER')`
- 每个 `oldPrivateKey` 只能生成一个唯一的 nullifier
- 合约记录所有使用过的 nullifier
- 如果重复提交，合约拒绝交易

**结论**: ❌ **Voter 无法重复使用自己的 deactivate 数据！**

## 完整的安全机制总结

### 1. ECDH sharedKey 绑定

```
deactivateLeaf = hash([c1, c2, hash(ECDH(voterPrivKey, coordPubKey))])
```

**防护**: 每个 voter 的 deactivateLeaf 都与其私钥唯一绑定，无法使用别人的数据。

### 2. Nullifier 防重放

```
nullifier = hash(oldPrivateKey, 'NULLIFIER')
```

**防护**: 每个私钥只能使用一次，防止重复使用相同的 deactivate 数据。

### 3. Merkle Tree 验证

```circom
component deactivateQie = QuinLeafExists(deactivateTreeDepth);
deactivateQie.leaf <== deactivateLeaf;
deactivateQie.root <== deactivateRoot;
```

**防护**: 只有 operator 生成并添加到 deactivateTree 的数据才能使用。

### 4. Rerandomize 机制

```circom
component rerandomize = ElGamalReRandomize();
rerandomize.c1 <== c1;
rerandomize.c2 <== c2;
rerandomize.randomVal <== randomVal;
```

**作用**: 
- 对 c1, c2 进行重新随机化
- 生成新的 d1, d2
- **保持奇偶性不变**（active 还是 active，deactivated 还是 deactivated）

## 为什么电路不验证 c1, c2 的奇偶性？

### 设计哲学

**AddNewKey 的目的**:
- 允许 voter 更换新的公钥
- 继承旧账户的 deactivate 状态

**关键理解**:
- c1, c2 的具体内容（奇偶性）对 AddNewKey 来说**不重要**
- 重要的是：
  1. 这个 c1, c2 属于这个 voter（sharedKey 验证）
  2. 这个 c1, c2 是 operator 认可的（在 deactivateTree 中）
  3. Rerandomize 后状态保持不变

**如果需要验证奇偶性**:
- Voter 可以在**链下**先 decrypt 检查
- 如果发现是 deactivated，可以选择不提交 AddNewKey
- 但这不影响协议安全性，因为：
  - Deactivated 账户的 AddNewKey 也会生成 deactivated 的新账户
  - 新账户仍然无法投票（operator 会在 processMessages 时检测）

## 潜在的设计改进

### 选项 1: 电路内验证奇偶性

```circom
component decrypt = ElGamalDecrypt();
decrypt.c1 <== c1;
decrypt.c2 <== c2;
decrypt.privKey <== coordPrivKey;  // 需要 coordinator 私钥！

// 要求必须是 active (even)
decrypt.isOdd === 0;
```

**问题**:
- ❌ 需要 voter 知道 coordinator 的私钥（不可能）
- ❌ 或者需要 coordinator 参与生成 proof（增加交互）

### 选项 2: 提供解密证明

```circom
signal input decryptResult;
signal input decryptProof;

// Verify decryptResult is correct
// Verify decryptResult is even
```

**问题**:
- ❌ 增加电路复杂度
- ❌ 需要额外的零知识证明
- ✅ 但可以实现完全的链上验证

### 当前设计的合理性

**当前设计选择了更简单的方案**:
- ✅ Voter 无法使用别人的数据（sharedKey 绑定）
- ✅ Voter 无法重复使用（nullifier 防重放）
- ✅ 状态继承正确（rerandomize 保持奇偶性）
- ✅ Operator 在 processMessages 时仍会检查状态

**安全性保证**:
- 即使 deactivated 的 voter 生成了 AddNewKey
- 新账户仍然是 deactivated 状态
- 无法通过 AddNewKey 绕过 deactivate 机制

## 测试验证

### 测试 1: 尝试使用别人的数据

```typescript
// Voter A 的私钥
const voterA_privKey = genKeypair().privKey;

// Voter B 的 deactivateLeaf（包含 c1, c2 和 sharedKey_B）
const voterB_deactivateLeaf = deactivateTree.leaf(voterB_index);

// Voter A 尝试生成 proof
const sharedKey_A = ECDH(voterA_privKey, coordPubKey);
const leafHash = poseidon([c1_B, c2_B, poseidon(sharedKey_A)]);

// 验证失败
expect(leafHash).to.not.equal(voterB_deactivateLeaf);
```

### 测试 2: 尝试重复使用

```typescript
// 第一次 AddNewKey
await contract.addNewKey(pubkey1, nullifier1, d1, proof1);
// 成功 ✅

// 第二次使用相同的 nullifier
await contract.addNewKey(pubkey2, nullifier1, d2, proof2);
// 失败: ContractError::NewKeyExist ❌
```

### 测试 3: Rerandomize 保持奇偶性

```typescript
// Deactivated 状态 (odd)
const encrypted_odd = encryptOdevity(true, coordPubKey, randomKey1);
const decrypted1 = decrypt(coordPrivKey, encrypted_odd);
expect(decrypted1 % 2n).to.equal(1n); // Odd

// Rerandomize
const rerandomized = rerandomize(coordPubKey, encrypted_odd, randomKey2);
const decrypted2 = decrypt(coordPrivKey, rerandomized);
expect(decrypted2 % 2n).to.equal(1n); // Still odd!
```

## 结论

### 回答用户的问题

1. **`genStaticRandomKey` 的功能**:
   - 生成确定性的随机数
   - 使用 coordinator 私钥、盐值和递增的 index
   - 确保每次生成不同的加密数据

2. **`newActiveState[i]` 是什么**:
   - 递增的序列号: `processedDMsgCount + i + 1`
   - 作为 `genStaticRandomKey` 的 index 参数
   - 确保每个 deactivate 消息使用不同的随机数

3. **电路是否验证 `encryptOdevity`**:
   - ❌ **否**，电路不验证 c1, c2 的生成过程和奇偶性
   - ✅ 只验证 c1, c2 属于这个 voter（sharedKey）
   - ✅ 只验证 c1, c2 在 deactivateTree 中

4. **主要问题：能否使用别人的 deactivate 数据**:
   - ❌ **不能！** sharedKey 绑定机制防止使用别人的数据
   - ❌ **不能重复使用！** Nullifier 机制防止重放攻击
   - ✅ **安全性得到保证**，通过多层防护机制

### 安全性评级

| 攻击场景 | 防护机制 | 安全性 |
|---------|---------|--------|
| 使用别人的 deactivate 数据 | ECDH sharedKey 绑定 | ✅ 安全 |
| 重复使用自己的数据 | Nullifier 防重放 | ✅ 安全 |
| 伪造 deactivate 数据 | Merkle Tree 验证 | ✅ 安全 |
| 修改 rerandomize 结果 | 电路约束验证 | ✅ 安全 |

### 设计建议

当前设计已经提供了足够的安全保障。如果需要额外的保护：

1. **链下验证**: Voter 在生成 AddNewKey 前，先检查自己的状态
2. **UI 提示**: 如果检测到 deactivated 状态，提示用户
3. **文档说明**: 明确说明 AddNewKey 继承 deactivate 状态

---

*文档版本: 1.0*  
*最后更新: 2024-12*  
*分析者: MACI Security Research Team*

