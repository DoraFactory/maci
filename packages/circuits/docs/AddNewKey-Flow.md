# AddNewKey 流程文档

## 📚 目录

1. [概述](#概述)
2. [整体架构](#整体架构)
3. [详细流程](#详细流程)
4. [代码示例](#代码示例)
5. [安全性分析](#安全性分析)
6. [常见问题](#常见问题)

---

## 概述

### 什么是 AddNewKey？

AddNewKey 是 aMACI（Anonymous MACI）系统中实现**用户匿名性**的关键机制。它允许用户在 deactivate（停用）旧密钥后，使用新密钥重新激活，同时**隐藏新旧身份之间的关联**。

### 核心特性

- ✅ **匿名性保护**：无法追踪新旧身份的对应关系
- ✅ **防重放攻击**：通过 nullifier 机制防止重复使用
- ✅ **零知识证明**：证明拥有旧密钥但不暴露私钥
- ✅ **重新随机化**：打破密文之间的数学关联

### 技术栈

- **加密算法**：ElGamal 加密（基于 BabyJubJub 椭圆曲线）
- **零知识证明**：Groth16
- **哈希函数**：Poseidon Hash
- **ECDH**：椭圆曲线 Diffie-Hellman 密钥交换

---

## 整体架构

### 三阶段流程

```
┌────────────────────────────────────────────────────────┐
│                     阶段 1: Deactivate                  │
│                                                         │
│  Voter 发送 deactivate 消息                             │
│  Operator 处理并生成 (c1, c2)                           │
│  上传 deactivate 数据到链上                              │
└────────────────────────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────┐
│                  阶段 2: Generate Proof                 │
│                                                         │
│  Voter 获取链上 deactivate 数据                         │
│  通过 sharedKey 找到自己的 deactivate                    │
│  重新随机化得到 (d1, d2)                                 │
│  生成 AddNewKey ZK 证明                                 │
└────────────────────────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────┐
│                  阶段 3: Verify & Activate              │
│                                                         │
│  智能合约验证 ZK 证明                                    │
│  检查 nullifier 未使用                                   │
│  创建新的状态叶子（包含 d1, d2）                         │
│  用户可以用新密钥投票                                     │
└────────────────────────────────────────────────────────┘
```

---

## 详细流程

### 阶段 1: Deactivate

#### 1.1 Voter 端

**操作**：发送 deactivate 消息

```typescript
// 1. 创建 deactivate 命令
const command = {
  stateIndex: voterIndex,
  voteOptionIndex: 0,    // 0 表示 deactivate
  newVoteWeight: 0       // 0 表示不投票
};

// 2. 签名命令
const signature = sign(voterPrivKey, command);

// 3. 加密消息（使用 coordinator 公钥）
const ephemeralKey = generateRandomKey();
const encryptedMessage = poseidonEncrypt(
  command, 
  ECDH(ephemeralKey.privKey, coordPubKey)
);

// 4. 提交到链上
await contract.publishDeactivateMessage({
  message: encryptedMessage,
  encPubKey: ephemeralKey.pubKey
});
```

**关键点**：
- Voter 此时**不生成** c1, c2
- 只发送一个普通的加密消息
- 消息内容 `[0, 0]` 表示 deactivate

#### 1.2 Operator 端

**操作**：处理 deactivate 消息并生成 c1, c2

```typescript
// 1. 解密消息
const command = decrypt(message, coordPrivKey, ephemeralPubKey);

// 2. 验证签名和状态
const isValid = verifySignature(command, voterPubKey);

// 3. 生成 ElGamal 密文 (c1, c2)
const r = genStaticRandomKey(coordPrivKey, 20040n, stateIndex);

// 找一个 x 坐标为偶数的椭圆曲线点（表示 deactivated）
const M = encryptOdevity(
  false,  // isOdd = false → 偶数 → deactivated
  coordPubKey,
  r
);

// ElGamal 加密
const c1 = g * r;                    // 椭圆曲线点
const c2 = M + coordPubKey * r;      // 椭圆曲线点

// 4. 计算 sharedKey
const sharedKey = ECDH(coordPrivKey, voterPubKey);
const sharedKeyHash = poseidon(sharedKey);

// 5. 创建 deactivate leaf
const deactivateLeaf = poseidon([
  c1.x, c1.y,
  c2.x, c2.y,
  sharedKeyHash
]);

// 6. 更新 deactivateTree
deactivateTree.updateLeaf(deactivateIndex, deactivateLeaf);

// 7. 生成 ZK 证明并提交到链上
const proof = generateProcessDeactivateProof({
  // ... inputs
});

await contract.processDeactivateMessage({
  proof,
  newDeactivateRoot,
  newDeactivateCommitment
});
```

**关键点**：
- Operator 生成 c1, c2（不是 Voter）
- 通过 x 坐标奇偶性编码状态：偶数=deactivated，奇数=active
- sharedKeyHash 用于 Voter 后续识别自己的 deactivate

#### 1.3 上传 Deactivate 数据

```typescript
// Operator 上传到链上（供 Voter 查询）
await contract.uploadDeactivateMessage([
  [
    c1.x,           // deactivate[0]
    c1.y,           // deactivate[1]
    c2.x,           // deactivate[2]
    c2.y,           // deactivate[3]
    sharedKeyHash   // deactivate[4]
  ],
  // ... 其他 deactivate
]);
```

**链上存储结构**：
```
MACI_DEACTIVATE_MESSAGE: Map<contractAddress, Vec<Vec<String>>>
```

---

### 阶段 2: Generate AddNewKey Proof

#### 2.1 获取 Deactivate 数据

```typescript
// 1. 从链上获取所有 deactivate 数据
const deactivates = await contract.fetchAllDeactivateLogs();

// 返回格式：
// [
//   [c1_1.x, c1_1.y, c2_1.x, c2_1.y, sharedKeyHash_1],
//   [c1_2.x, c1_2.y, c2_2.x, c2_2.y, sharedKeyHash_2],
//   ...
// ]
```

#### 2.2 找到自己的 Deactivate

```typescript
// 2. 计算自己的 sharedKey
const mySharedKey = ECDH(oldPrivKey, coordPubKey);
const mySharedKeyHash = poseidon(mySharedKey);

// 3. 查找匹配的 deactivate
const deactivateIndex = deactivates.findIndex(
  d => d[4] === mySharedKeyHash
);

if (deactivateIndex < 0) {
  throw new Error("Deactivate not found");
}

const myDeactivate = deactivates[deactivateIndex];

// 4. 提取 c1, c2
const c1 = [myDeactivate[0], myDeactivate[1]];
const c2 = [myDeactivate[2], myDeactivate[3]];
```

**关键点**：
- 只有拥有 oldPrivKey 的人能计算正确的 sharedKeyHash
- 通过 sharedKeyHash 匹配找到自己的 deactivate
- 其他人无法伪造或使用别人的 deactivate

#### 2.3 重新随机化

```typescript
// 5. 生成随机数
const randomVal = genRandomSalt();  // 随机的 253 位数

// 6. 重新随机化 ElGamal 密文
const d1 = c1 + g * randomVal;
const d2 = c2 + coordPubKey * randomVal;

// 数学验证：
// 解密 (c1, c2): M = c2 - c1 * coordPrivKey
// 解密 (d1, d2): M' = d2 - d1 * coordPrivKey
//                   = (c2 + pk*z) - (c1 + g*z) * sk
//                   = c2 + pk*z - c1*sk - g*z*sk
//                   = c2 - c1*sk + pk*z - g*z*sk
//                   = c2 - c1*sk + (g*sk)*z - g*z*sk
//                   = c2 - c1*sk
//                   = M
// 所以 M' === M ✅
```

**重新随机化的作用**：
- 打破 (c1, c2) 和 (d1, d2) 的数学关联
- 使得 (d1, d2) 看起来像完全随机的点
- 即使 operator 也无法判断对应关系

#### 2.4 生成 Nullifier

```typescript
// 7. 生成 nullifier（防止重复使用）
const nullifier = poseidon([
  oldPrivKey,
  1444992409218394441042n  // 'NULLIFIER' 常量
]);
```

**Nullifier 的作用**：
- 每个 oldPrivKey 对应唯一的 nullifier
- 链上记录所有已使用的 nullifier
- 防止同一个旧密钥多次重新激活

#### 2.5 生成 ZK 证明

```typescript
// 8. 构建 Merkle proof
const deactivateTree = new Tree(5, stateTreeDepth + 2, 0n);
const leaves = deactivates.map(d => poseidon(d));
deactivateTree.initLeaves(leaves);

const deactivateRoot = deactivateTree.root;
const deactivateLeafPathElements = deactivateTree.pathElementOf(deactivateIndex);

// 9. 构建 ZK 证明输入
const proofInput = {
  // 公开输入
  inputHash: computeInputHash([
    deactivateRoot,
    coordPubKeyHash,
    nullifier,
    d1[0], d1[1],
    d2[0], d2[1]
  ]),
  deactivateRoot,
  coordPubKey,
  nullifier,
  d1,
  d2,
  
  // 私密输入
  oldPrivateKey,
  c1,
  c2,
  randomVal,
  deactivateIndex,
  deactivateLeaf,
  deactivateLeafPathElements
};

// 10. 生成证明
const { proof } = await groth16.fullProve(
  proofInput,
  wasmFile,
  zkeyFile
);
```

**ZK 证明验证的约束**：

1. **Nullifier 验证**：
   ```circom
   nullifier === hash(oldPrivateKey, "NULLIFIER")
   ```

2. **ECDH 验证**：
   ```circom
   sharedKey = ECDH(oldPrivateKey, coordPubKey)
   sharedKeyHash = hash(sharedKey)
   ```

3. **Deactivate Leaf 验证**：
   ```circom
   deactivateLeaf === hash(c1, c2, sharedKeyHash)
   ```

4. **Merkle Proof 验证**：
   ```circom
   QuinLeafExists(deactivateLeaf, deactivateRoot, pathElements)
   ```

5. **重新随机化验证**：
   ```circom
   d1 === c1 + g^randomVal
   d2 === c2 + coordPubKey^randomVal
   ```

---

### 阶段 3: Verify & Activate

#### 3.1 提交到链上

```typescript
// Voter 提交 AddNewKey 交易
await contract.addNewKey({
  pubkey: newPubKey,
  nullifier,
  d: [d1[0], d1[1], d2[0], d2[1]],
  groth16_proof: proof
});
```

#### 3.2 智能合约验证

```rust
pub fn execute_add_new_key(
    deps: DepsMut,
    pubkey: PubKey,
    nullifier: Uint256,
    d: [Uint256; 4],
    groth16_proof: Groth16ProofType,
) -> Result<Response, ContractError> {
    // 1. 检查 nullifier 是否已使用
    if NULLIFIERS.has(deps.storage, nullifier.to_be_bytes().to_vec()) {
        return Err(ContractError::NewKeyExist {});
    }
    
    // 2. 记录 nullifier
    NULLIFIERS.save(deps.storage, nullifier.to_be_bytes().to_vec(), &true)?;
    
    // 3. 构造公开输入
    let mut input: [Uint256; 7] = [Uint256::zero(); 7];
    input[0] = deactivateRoot;
    input[1] = coordinatorPubKeyHash;
    input[2] = nullifier;
    input[3] = d[0];  // d1.x
    input[4] = d[1];  // d1.y
    input[5] = d[2];  // d2.x
    input[6] = d[3];  // d2.y
    
    // 4. 计算 inputHash
    let input_hash = hash_256(input);
    
    // 5. 验证 ZK 证明
    let is_passed = groth16_verify(&vkey, &proof, &[input_hash])?;
    
    if !is_passed {
        return Err(ContractError::InvalidProof);
    }
    
    // 6. 创建新的状态叶子
    let state_leaf = StateLeaf {
        pub_key: pubkey,
        voice_credit_balance: voiceCredits,
        vote_option_tree_root: 0,
        nonce: 0,
    };
    
    // 7. Hash 状态叶子（包含 d1, d2）
    let leaf_hash = hash_state_leaf_with_d(state_leaf, d);
    
    // 8. 更新状态树
    update_state_tree(leaf_hash);
    
    Ok(Response::new())
}
```

**验证步骤**：
1. ✅ Nullifier 未被使用
2. ✅ ZK 证明有效
3. ✅ 公钥有效
4. ✅ 状态树未满

#### 3.3 状态叶子结构

```rust
// 状态叶子包含 10 个字段
StateLeaf: [
  pubKey.x,          // 0 - 新公钥 x 坐标
  pubKey.y,          // 1 - 新公钥 y 坐标
  voiceCredits,      // 2 - 投票权余额
  voteOptionRoot,    // 3 - 投票选项树根
  nonce,             // 4 - 随机数
  d1.x,              // 5 - 重新随机化后的 d1.x
  d1.y,              // 6 - 重新随机化后的 d1.y
  d2.x,              // 7 - 重新随机化后的 d2.x
  d2.y,              // 8 - 重新随机化后的 d2.y
  0                  // 9 - 保留字段
]
```

**d1, d2 的用途**：
- 在 ProcessMessages 时验证用户是否 active
- Coordinator 可以解密验证状态
- 但无法追踪到原始的 (c1, c2)

---

## 代码示例

### 完整示例：用户执行 AddNewKey

```typescript
import { Operator, Voter, genKeypair } from '@maci/sdk';

// ===== 设置 =====
const oldKeypair = genKeypair();  // 旧密钥对
const newKeypair = genKeypair();  // 新密钥对
const coordPubKey = [coordPubKeyX, coordPubKeyY];
const contractAddress = "dora1...";

// ===== 步骤 1: Deactivate =====
const voter = new Voter({ maciKeypair: oldKeypair });

// 发送 deactivate 消息
await voter.deactivate({
  signer,
  contractAddress,
  operatorPubkey: coordPubKey
});

// 等待 operator 处理...
console.log("Waiting for operator to process deactivate...");

// ===== 步骤 2: 生成 AddNewKey 证明 =====

// 2.1 获取 deactivate 数据
const deactivates = await fetchAllDeactivateLogs(contractAddress);

// 2.2 查找自己的 deactivate
const sharedKey = genEcdhSharedKey(oldKeypair.privKey, coordPubKey);
const sharedKeyHash = poseidon(sharedKey);

const deactivateIdx = deactivates.findIndex(
  d => d[4] === sharedKeyHash
);

if (deactivateIdx < 0) {
  throw new Error("Deactivate not found!");
}

console.log(`Found deactivate at index: ${deactivateIdx}`);

// 2.3 生成证明输入
const addKeyInput = genAddKeyInput(
  stateTreeDepth + 2,
  {
    coordPubKey,
    oldKey: oldKeypair,
    deactivates: deactivates.map(d => d.map(BigInt))
  }
);

if (!addKeyInput) {
  throw new Error("Failed to generate addKey input");
}

console.log("Generated proof input:");
console.log("- Nullifier:", addKeyInput.nullifier);
console.log("- d1:", addKeyInput.d1);
console.log("- d2:", addKeyInput.d2);

// 2.4 生成 ZK 证明
const { proof } = await groth16.fullProve(
  addKeyInput,
  'circuits/addNewKey.wasm',
  'circuits/addNewKey.zkey'
);

console.log("ZK proof generated!");

// ===== 步骤 3: 提交 AddNewKey =====
const result = await contract.addNewKey({
  pubkey: {
    x: newKeypair.pubKey[0],
    y: newKeypair.pubKey[1]
  },
  nullifier: addKeyInput.nullifier,
  d: [
    addKeyInput.d1[0],
    addKeyInput.d1[1],
    addKeyInput.d2[0],
    addKeyInput.d2[1]
  ],
  groth16_proof: proof
});

console.log("✅ AddNewKey successful!");
console.log("Transaction hash:", result.transactionHash);
console.log("New pubKey:", newKeypair.pubKey);

// ===== 步骤 4: 用新密钥投票 =====
const newVoter = new Voter({ maciKeypair: newKeypair });

await newVoter.vote({
  signer,
  contractAddress,
  operatorPubkey: coordPubKey,
  options: [
    { idx: 0, vc: 100 },  // 给选项 0 投 100 票
    { idx: 1, vc: 50 }    // 给选项 1 投 50 票
  ]
});

console.log("✅ Vote submitted with new key!");
```

### SDK 使用示例

```typescript
import { Voter } from '@maci/sdk';

// 初始化 Voter
const voter = new Voter({
  maciKeypair: oldKeypair,
  rpcUrl: 'https://rpc.example.com',
  indexerUrl: 'https://indexer.example.com'
});

// 方法 1: 自动生成证明并提交
const result = await voter.buildAddNewKeyPayload({
  stateTreeDepth: 10,
  coordinatorPubkey: coordPubKey,
  newKeyPair: newKeypair,
  wasmFile: 'addNewKey.wasm',
  zkeyFile: 'addNewKey.zkey'
});

await voter.addNewKey({
  signer,
  contractAddress,
  payload: result
});

// 方法 2: 分步执行
// 步骤 1: 获取 deactivate 数据
const deactivates = await voter.fetchAllDeactivateLogs(contractAddress);

// 步骤 2: 生成证明输入
const input = genAddKeyInput(12, {
  coordPubKey,
  oldKey: oldKeypair,
  deactivates
});

// 步骤 3: 生成证明
const { proof } = await groth16.fullProve(input, wasmFile, zkeyFile);

// 步骤 4: 提交
await voter.addNewKey({
  signer,
  contractAddress,
  payload: {
    proof,
    d: [input.d1[0], input.d1[1], input.d2[0], input.d2[1]],
    nullifier: input.nullifier
  }
});
```

---

## 安全性分析

### 1. 匿名性保证

#### 1.1 重新随机化的密码学安全性

**数学基础**：
```
ElGamal 重新随机化：
d1 = c1 + g^randomVal
d2 = c2 + coordPubKey^randomVal

攻击者想要关联 (c1, c2) 和 (d1, d2)：
d1 - c1 = g^randomVal
d2 - c2 = coordPubKey^randomVal

需要求解：给定 g^randomVal，求 randomVal
这是椭圆曲线离散对数问题（ECDLP），是密码学难题！
```

**安全级别**：
- BabyJubJub 曲线提供 ~128 位安全性
- 2^128 次运算在实际中不可行
- 即使量子计算机也需要数年时间

#### 1.2 匿名集大小

```
匿名性 = log2(匿名集大小)

示例：
- 10 个 deactivate  → ~3.3 bits 匿名性
- 100 个 deactivate → ~6.6 bits 匿名性
- 1000 个 deactivate → ~10 bits 匿名性
- 10000 个 deactivate → ~13 bits 匿名性
```

**建议**：
- ✅ 鼓励更多用户参与以增加匿名集
- ✅ 可以设置最小匿名集阈值
- ✅ 批量处理 deactivate 以提高匿名性

#### 1.3 Operator 无法追踪

**Operator 的能力**：
- ✅ 可以解密 c1, c2 → 得到明文（奇偶性）
- ✅ 可以解密 d1, d2 → 得到明文（奇偶性）
- ❌ **无法** 关联 (c1, c2) 和 (d1, d2)

**原因**：
1. 明文只有 1 bit（奇偶性）
2. 所有 deactivate 的明文都相同（都是 0）
3. 需要求解 ECDLP 才能找到 randomVal
4. 可能的组合数 = N! × 2^253（天文数字）

### 2. 防止攻击

#### 2.1 防止伪造攻击

**攻击**：用户 B 尝试使用用户 A 的 deactivate 数据

**防御**：
```
ZK 证明验证：
1. sharedKey_B = ECDH(privKey_B, coordPubKey)
2. deactivateLeaf_A = hash(c1_A, c2_A, sharedKeyHash_A)
3. 尝试证明: hash(c1_A, c2_A, sharedKeyHash_B) === deactivateLeaf_A

因为 sharedKeyHash_B ≠ sharedKeyHash_A
所以约束无法满足 ❌
ZK 证明生成失败！
```

#### 2.2 防止重放攻击

**攻击**：用户尝试多次使用同一个 oldPrivKey

**防御**：
```rust
// 1. 生成唯一的 nullifier
nullifier = hash(oldPrivKey, "NULLIFIER")

// 2. 检查是否已使用
if NULLIFIERS.has(nullifier) {
    return Err(ContractError::NewKeyExist);
}

// 3. 记录 nullifier
NULLIFIERS.save(nullifier, true);
```

**结果**：
- ✅ 每个 oldPrivKey 只能生成一个唯一的 nullifier
- ✅ 链上记录所有已使用的 nullifier
- ✅ 防止重复使用

#### 2.3 防止时间关联攻击

**攻击**：通过时间戳关联 deactivate 和 addNewKey

**防御**：
```typescript
// 建议：延迟 addNewKey 的提交时间
const deactivateTime = getDeactivateTimestamp();
const randomDelay = Math.random() * 24 * 3600 * 1000; // 0-24小时

await sleep(randomDelay);
await submitAddNewKey();
```

**额外建议**：
- 批量处理混淆时间关联
- 使用中继服务隐藏 IP 地址
- 在不同设备上执行操作

### 3. ZK 证明安全性

#### 3.1 Groth16 安全性

**特性**：
- ✅ 证明大小小（~128 bytes）
- ✅ 验证时间快（~5ms）
- ✅ 零知识性强
- ⚠️ 需要可信设置（Trusted Setup）

**可信设置**：
```
Powers of Tau ceremony:
- 多方计算（MPC）
- 只要一个参与者诚实，就安全
- 常见的有 Perpetual Powers of Tau
```

#### 3.2 电路约束

**关键约束**：
1. Nullifier 验证
2. ECDH 计算
3. Deactivate Leaf 验证
4. Merkle Proof 验证
5. 重新随机化验证

**约束数量**：
- addNewKey 电路：~200k 约束
- 证明生成时间：~10-30 秒（取决于硬件）

---

## 常见问题

### Q1: 为什么要 deactivate 才能 addNewKey？

**A**: 这是为了防止女巫攻击（Sybil Attack）。

如果允许直接 addNewKey 而不 deactivate：
- ❌ 用户可以无限创建新身份
- ❌ 每个身份都有投票权
- ❌ 一个人可以控制多个账户

通过 deactivate → addNewKey 流程：
- ✅ 旧身份必须停用
- ✅ 总投票权保持不变
- ✅ 只是更换身份，不增加权力

### Q2: randomVal 是否需要真随机？

**A**: 是的，randomVal 必须是密码学安全的随机数。

如果使用弱随机数：
- ❌ 攻击者可能猜测 randomVal
- ❌ 可以尝试暴力破解
- ❌ 关联 (c1, c2) 和 (d1, d2)

建议：
```typescript
// ✅ 使用密码学安全的随机数生成器
const randomVal = genRandomSalt();  // 使用 crypto.getRandomValues()

// ❌ 不要使用 Math.random()
const randomVal = BigInt(Math.floor(Math.random() * 2**253));  // 不安全！
```

### Q3: 如果丢失 oldPrivKey 怎么办？

**A**: 无法恢复，这是不可逆的。

- ❌ 无法计算正确的 sharedKeyHash
- ❌ 无法找到自己的 deactivate
- ❌ 无法生成有效的 ZK 证明

**建议**：
- ✅ 备份 oldPrivKey
- ✅ 使用助记词恢复
- ✅ 考虑多签机制

### Q4: 可以跳过 deactivate 直接 addNewKey 吗？

**A**: 不可以。

系统要求：
1. 必须先 deactivate（生成 c1, c2）
2. Operator 处理并上传 deactivate 数据
3. 才能生成有效的 addNewKey 证明

如果尝试跳过：
- ❌ 无法找到有效的 deactivate 数据
- ❌ genAddKeyInput() 返回 null
- ❌ 无法生成证明

### Q5: 为什么需要 sharedKeyHash？

**A**: sharedKeyHash 实现了用户和 deactivate 的绑定。

**作用**：
1. **身份验证**：只有拥有 oldPrivKey 的人能计算正确的 sharedKeyHash
2. **数据查找**：通过 sharedKeyHash 找到自己的 deactivate
3. **防止伪造**：其他人无法伪造 sharedKeyHash

**ECDH 的对称性**：
```
Operator 计算：
sharedKey_op = coordPrivKey * voterPubKey

Voter 计算：
sharedKey_voter = voterPrivKey * coordPubKey

因为 ECDH 的对称性：
sharedKey_op === sharedKey_voter ✅
```

### Q6: d1, d2 存储在哪里？

**A**: 存储在状态叶子中。

**存储位置**：
```
StateLeaf[10] = {
  [0]: pubKey.x,
  [1]: pubKey.y,
  [2]: voiceCredits,
  [3]: voteOptionRoot,
  [4]: nonce,
  [5]: d1.x,      // ← 这里
  [6]: d1.y,      // ← 这里
  [7]: d2.x,      // ← 这里
  [8]: d2.y,      // ← 这里
  [9]: reserved
}
```

**用途**：
- ProcessMessages 时验证用户是否 active
- TallyVotes 时验证状态叶子完整性
- Operator 可以解密但无法追踪来源

### Q7: 匿名性有多强？

**A**: 取决于匿名集大小。

**计算公式**：
```
匿名性 = 1 / 匿名集大小

示例：
- 100 个 deactivate → 1/100 = 1% 被猜中的概率
- 1000 个 deactivate → 1/1000 = 0.1% 被猜中的概率
- 10000 个 deactivate → 1/10000 = 0.01% 被猜中的概率
```

**影响因素**：
- ✅ 参与人数越多越安全
- ⚠️ 时间关联可能减弱匿名性
- ⚠️ 链下行为模式可能暴露身份

### Q8: 性能如何？

**A**: 性能指标：

| 操作 | 时间 | Gas 消耗 |
|------|------|---------|
| Deactivate 消息 | ~1s | ~200k gas |
| Process Deactivate (batch 25) | ~20-30s | ~2M gas |
| Generate AddNewKey Proof | ~10-30s | N/A (客户端) |
| Verify AddNewKey Proof | ~5ms | ~300k gas |
| Update State Tree | ~100ms | 包含在上面 |

**优化建议**：
- 使用批量处理减少交易次数
- 预先生成证明以加快响应
- 使用 WASM 加速证明生成

### Q9: 如何调试 AddNewKey 失败？

**A**: 常见错误和解决方案：

```typescript
// 错误 1: Deactivate not found
// 原因：sharedKeyHash 不匹配
// 解决：
const mySharedKey = genEcdhSharedKey(oldPrivKey, coordPubKey);
const myHash = poseidon(mySharedKey);
console.log("My sharedKeyHash:", myHash);
console.log("Available hashes:", deactivates.map(d => d[4]));

// 错误 2: ZK proof generation failed
// 原因：输入数据不正确
// 解决：
console.log("Proof input:", {
  oldPrivateKey: oldPrivKey.toString(),
  c1: c1.map(x => x.toString()),
  c2: c2.map(x => x.toString()),
  deactivateRoot: deactivateRoot.toString()
});

// 错误 3: Nullifier already used
// 原因：该 oldPrivKey 已经使用过
// 解决：使用新的 oldPrivKey 或检查链上记录

// 错误 4: Invalid proof
// 原因：证明验证失败
// 解决：检查电路版本、输入格式、公开输入计算
```

### Q10: 未来改进方向？

**A**: 可能的改进：

1. **更强的匿名性**：
   - 使用 Ring Signatures
   - 增加 decoy deactivates
   - 实现 mix network

2. **更好的用户体验**：
   - 客户端预生成证明
   - 使用 ZK-STARK（无需可信设置）
   - 实现批量 addNewKey

3. **隐私增强**：
   - 添加时间延迟协议
   - 使用 Tor/I2P 隐藏网络
   - 实现本地证明生成

4. **性能优化**：
   - 使用 GPU 加速证明生成
   - 优化电路约束数量
   - 实现增量 Merkle tree 更新

---

## 参考资源

### 论文和文档

1. [MACI - Minimal Anti-Collusion Infrastructure](https://github.com/privacy-scaling-explorations/maci)
2. [ElGamal Encryption on Elliptic Curves](https://en.wikipedia.org/wiki/ElGamal_encryption)
3. [Rerandomizable Encryption](https://ethresear.ch/t/maci-anonymization-using-rerandomizable-encryption/7054)
4. [Groth16 ZK-SNARK](https://eprint.iacr.org/2016/260.pdf)

### 代码仓库

- [MACI SDK](https://github.com/DoraFactory/maci-sdk)
- [MACI Circuits](https://github.com/DoraFactory/maci-circuits)
- [MACI Contracts](https://github.com/DoraFactory/maci-contracts)

### 相关技术

- BabyJubJub 椭圆曲线
- Poseidon Hash 函数
- Groth16 证明系统
- Merkle Tree 数据结构

---

## 附录

### A. 密码学原语

#### A.1 ElGamal 加密

```typescript
// 加密
function encrypt(M: Point, pubKey: Point, r: bigint): [Point, Point] {
  const c1 = g.multiply(r);
  const c2 = M.add(pubKey.multiply(r));
  return [c1, c2];
}

// 解密
function decrypt(c1: Point, c2: Point, privKey: bigint): Point {
  const s = c1.multiply(privKey);
  const M = c2.subtract(s);
  return M;
}

// 重新随机化
function rerandomize(c1: Point, c2: Point, pubKey: Point, z: bigint): [Point, Point] {
  const d1 = c1.add(g.multiply(z));
  const d2 = c2.add(pubKey.multiply(z));
  return [d1, d2];
}
```

#### A.2 ECDH 密钥交换

```typescript
// Alice 计算共享密钥
function aliceComputeShared(alicePriv: bigint, bobPub: Point): Point {
  return bobPub.multiply(alicePriv);
}

// Bob 计算共享密钥
function bobComputeShared(bobPriv: bigint, alicePub: Point): Point {
  return alicePub.multiply(bobPriv);
}

// 结果相同：
// alicePriv * bobPub = alicePriv * (g * bobPriv) = g * (alicePriv * bobPriv)
// bobPriv * alicePub = bobPriv * (g * alicePriv) = g * (bobPriv * alicePriv)
```

#### A.3 Poseidon Hash

```typescript
// Poseidon 是针对 ZK 电路优化的哈希函数
function poseidon(inputs: bigint[]): bigint {
  // 使用 S-box: x^5
  // 使用 MDS 矩阵混淆
  // 针对 R1CS 约束优化
  return hash;
}
```

### B. 电路约束示例

```circom
// addNewKey.circom 的核心约束

// 1. Nullifier 验证
component nullifierHasher = HashLeftRight();
nullifierHasher.left <== oldPrivateKey;
nullifierHasher.right <== 1444992409218394441042;
nullifierHasher.hash === nullifier;

// 2. ECDH 计算
component ecdh = Ecdh();
ecdh.privKey <== oldPrivateKey;
ecdh.pubKey[0] <== coordPubKey[0];
ecdh.pubKey[1] <== coordPubKey[1];

// 3. Deactivate Leaf 验证
component deactivateLeafHasher = Hasher5();
deactivateLeafHasher.in[0] <== c1[0];
deactivateLeafHasher.in[1] <== c1[1];
deactivateLeafHasher.in[2] <== c2[0];
deactivateLeafHasher.in[3] <== c2[1];
deactivateLeafHasher.in[4] <== sharedKeyHash;
deactivateLeafHasher.hash === deactivateLeaf;

// 4. Merkle Proof 验证
component deactivateQie = QuinLeafExists(depth);
deactivateQie.leaf <== deactivateLeaf;
deactivateQie.root <== deactivateRoot;

// 5. 重新随机化验证
component rerandomize = ElGamalReRandomize();
rerandomize.c1 <== c1;
rerandomize.c2 <== c2;
rerandomize.randomVal <== randomVal;
rerandomize.pubKey <== coordPubKey;
rerandomize.d1 === d1;
rerandomize.d2 === d2;
```

### C. 状态转换图

```
┌─────────────────────────────────────────────────┐
│              用户状态转换                        │
└─────────────────────────────────────────────────┘

[初始状态]
   │
   │ SignUp (oldPubKey)
   ↓
[已注册] (oldPubKey, active)
   │
   │ PublishDeactivateMessage
   ↓
[等待处理]
   │
   │ ProcessDeactivateMessage (operator)
   ↓
[已停用] (oldPubKey, deactivated)
   │     ↑
   │     │ 存储: (c1, c2, sharedKeyHash)
   │     │
   │ AddNewKey (newPubKey)
   │     │ 验证: ZK proof
   │     │ 存储: (d1, d2) in StateLeaf
   ↓     │
[重新激活] (newPubKey, active)
   │
   │ Vote / Deactivate again
   ↓
...
```

---

## 版本历史

- **v1.0** (2024-01): 初始版本
- **v1.1** (2024-03): 添加安全性分析
- **v1.2** (2024-06): 添加代码示例和常见问题
- **v1.3** (2024-12): 完善文档结构和详细说明

## 贡献者

- MACI Team
- Dora Factory
- Community Contributors

## 许可证

MIT License

---

**文档结束**
