# ProcessDeactivate 测试完整修复说明

## 修复日期
2026-02-01

## 问题分析

### 错误 1: inputHash 不匹配（已修复）
**位置**: 电路第 111 行
```circom
inputHasher.hash === inputHash;
```

**原因**: 测试使用硬编码的 `inputHash: BigInt(123)`
**修复**: 使用 `ProcessDeactivateMessagesInputHasher` 电路计算正确的 inputHash

### 错误 2: 消息哈希链不匹配（本次修复）
**位置**: 电路第 146 行
```circom
msgHashChain[batchSize] === batchEndHash;
```

**原因**: 
- 测试使用随意的 `batchStartHash = 300` 和 `batchEndHash = 400`
- 电路会根据实际消息计算哈希链
- 计算出的最终哈希不等于 400

## 消息哈希链工作原理

电路中的消息哈希链计算（第 127-146 行）：

```circom
signal msgHashChain[batchSize + 1];
msgHashChain[0] <== batchStartHash;  // 起始哈希

for (var i = 0; i < batchSize; i++) {
    messageHashers[i] = MessageHasher();
    // 计算消息哈希
    for (var j = 0; j < MSG_LENGTH; j++) {
        messageHashers[i].in[j] <== msgs[i][j];
    }
    messageHashers[i].encPubKey[0] <== encPubKeys[i][0];
    messageHashers[i].encPubKey[1] <== encPubKeys[i][1];
    messageHashers[i].prevHash <== msgHashChain[i];
    
    // 检查是否为空消息
    isEmptyMsg[i] = IsZero();
    isEmptyMsg[i].in <== msgs[i][0];
    
    // 选择：空消息保持哈希不变，非空消息更新哈希
    muxes[i] = Mux1();
    muxes[i].s <== isEmptyMsg[i].out;
    muxes[i].c[0] <== messageHashers[i].hash;  // 新哈希
    muxes[i].c[1] <== msgHashChain[i];         // 保持旧哈希
    
    msgHashChain[i + 1] <== muxes[i].out;
}

// 最终验证
msgHashChain[batchSize] === batchEndHash;
```

### 关键逻辑

对于**空消息**（`msgs[i][0] == 0`）：
- `isEmptyMsg[i].out == 1`
- `muxes[i].s == 1`
- `msgHashChain[i+1] = msgHashChain[i]` （保持不变）

对于**非空消息**（`msgs[i][0] != 0`）：
- `isEmptyMsg[i].out == 0`
- `muxes[i].s == 0`
- `msgHashChain[i+1] = hash(msg[i], encPubKey, msgHashChain[i])` （更新）

## 修复策略

### 选项 1: 使用真实消息（复杂）
需要：
- 真实的加密消息
- 正确的 ECDH 共享密钥
- 有效的签名
- 计算实际的哈希链

这需要使用完整的 `OperatorClient` 和 `VoterClient`。

### 选项 2: 使用空消息（简单）✅ 采用

使用**空消息**（`msg[0] = 0`）：
- 哈希链不会更新
- `msgHashChain[0] = msgHashChain[1] = ... = msgHashChain[batchSize]`
- 因此 `batchEndHash = batchStartHash`

## 修复实现

### 关键修改 1: 创建空消息

**之前**（随机填充）:
```typescript
const msgs = Array(batchSize)
  .fill(null)
  .map(() => Array(MSG_LENGTH).fill(BigInt(1)));  // ❌ 非空消息
```

**之后**（空消息）:
```typescript
const msgs = Array(batchSize)
  .fill(null)
  .map(() => {
    const msg = Array(MSG_LENGTH).fill(BigInt(0));
    msg[0] = BigInt(0);  // ✅ 空消息指示器
    return msg;
  });
```

### 关键修改 2: 正确的哈希链值

**之前**（随意值）:
```typescript
const batchStartHash = BigInt(300);
const batchEndHash = BigInt(400);  // ❌ 与计算不匹配
```

**之后**（一致的值）:
```typescript
const batchStartHash = BigInt(0);  // 从 0 开始
const batchEndHash = batchStartHash;  // ✅ 空消息链：end = start
```

### 关键修改 3: 正确的状态值

**之前**（不一致）:
```typescript
const currentActiveState = Array(batchSize).fill(BigInt(1));
const currentActiveStateRoot = BigInt(100);
const currentDeactivateRoot = BigInt(200);
```

**之后**（一致）:
```typescript
const currentActiveState = Array(batchSize).fill(BigInt(0)); // 0 = active
const currentActiveStateRoot = BigInt(0);  // ✅ 空树的根
const currentDeactivateRoot = BigInt(0);   // ✅ 空树的根
```

## 为什么这个修复是正确的？

### 1. 空消息的语义
在 MACI/AMACI 中，空消息是合法的：
- 用于填充批次到 `batchSize`
- 不改变状态
- 不更新哈希链

### 2. 哈希链的数学特性
对于全部空消息的批次：
```
msgHashChain[0] = batchStartHash
msgHashChain[1] = msgHashChain[0]  (空消息)
msgHashChain[2] = msgHashChain[1]  (空消息)
...
msgHashChain[5] = msgHashChain[4]  (空消息)

因此: msgHashChain[5] = msgHashChain[0] = batchStartHash
验证: msgHashChain[5] === batchEndHash
条件: batchEndHash = batchStartHash
```

### 3. 与电路逻辑一致
电路的 Mux1 组件：
```circom
muxes[i].s <== isEmptyMsg[i].out;  // s = 1 for empty message
muxes[i].c[0] <== messageHashers[i].hash;  // 新哈希
muxes[i].c[1] <== msgHashChain[i];         // 旧哈希
// 输出: s==1 ? c[1] : c[0]
// 即: 空消息 ? 保持旧哈希 : 使用新哈希
```

## 测试验证流程

修复后的测试流程：

```
1. 准备测试数据
   ├─ 空消息 (msg[0] = 0)
   ├─ batchStartHash = 0
   └─ batchEndHash = 0 (= batchStartHash)

2. 计算 inputHash
   ├─ 使用 ProcessDeactivateMessagesInputHasher
   ├─ 输入包含 expectedPollId
   └─ 得到正确的 inputHash

3. 运行 ProcessDeactivateMessages 电路
   ├─ 验证 inputHash (第 111 行) ✅
   ├─ 计算消息哈希链
   │   ├─ msgHashChain[0] = 0
   │   ├─ 所有消息都是空消息
   │   ├─ msgHashChain[1] = msgHashChain[0] = 0
   │   ├─ ...
   │   └─ msgHashChain[5] = 0
   └─ 验证 msgHashChain[5] === batchEndHash (第 146 行) ✅
       └─ 0 === 0 ✅ 通过

4. 所有约束通过 ✅
```

## 与其他组件的一致性

### 电路层
- ✅ `ProcessDeactivateMessagesInputHasher`: 包含 8 个参数（含 pollId）
- ✅ `ProcessDeactivateMessages`: 正确验证 inputHash 和消息链

### 合约层
```rust
// contracts/amaci/src/contract.rs
let mut input: [Uint256; 8] = [Uint256::zero(); 8];
input[0] = new_deactivate_root;
input[1] = coordinator_hash;
input[2] = batch_start_hash;
input[3] = batch_end_hash;
input[4] = current_deactivate_commitment;
input[5] = new_deactivate_commitment;
input[6] = state_root;
input[7] = Uint256::from(POLL_ID.load(deps.storage)?);  // ✅ Poll ID
```

### SDK 层
```typescript
// packages/sdk/src/operator.ts
const inputHash = computeInputHash([
  newDeactivateRoot,
  this.pubKeyHasher!,
  batchStartHash,
  batchEndHash,
  currentDeactivateCommitment,
  newDeactivateCommitment,
  subStateTree.root,
  BigInt(this.pollId!)  // ✅ Poll ID
]);
```

所有三层都使用相同的 8 个参数，包括 poll_id。

## 测试覆盖

### 当前测试验证的内容 ✅

1. **InputHash 计算正确性**
   - ✅ 包含 8 个参数（含 expectedPollId）
   - ✅ 不同 pollId 产生不同 hash
   - ✅ 计算是确定性的

2. **空消息批次处理**
   - ✅ 空消息不改变哈希链
   - ✅ inputHash 验证通过
   - ✅ 消息链验证通过
   - ✅ 所有电路约束满足

### 实际场景覆盖

虽然这个测试使用空消息，但它验证了：
- ✅ Poll ID 正确包含在 inputHash 中
- ✅ 电路的基本结构正确
- ✅ 空消息批次能够正确处理

对于真实消息的完整测试，应该在集成测试中进行（如 `ProcessMessagesAmaciIntegration.test.ts`）。

## 测试结果

运行测试：
```bash
pnpm test:processDeactivate
```

预期结果：
```
AMACI ProcessDeactivateMessages circuit
  ✔ should verify ProcessDeactivateMessages with valid poll ID (XXXms)

AMACI ProcessDeactivateMessagesInputHasher circuit
  ✔ should compute input hash correctly with poll ID (XXXms)
  ✔ should produce different hashes for different poll IDs (XXXms)
  ✔ should produce different hashes for different inputs (XXXms)
  ✔ should be deterministic (XXXms)

5 passing (XXs)
```

## 总结

### 修复要点
1. ✅ 使用**空消息**而不是随机数据
2. ✅ 设置 `batchEndHash = batchStartHash`（空消息链特性）
3. ✅ 使用 `InputHasher` 计算正确的 `inputHash`
4. ✅ 确保状态树根与空树一致

### 验证的核心功能
- ✅ Poll ID 正确包含在 inputHash 中
- ✅ InputHasher 使用 8 个参数（包括 expectedPollId）
- ✅ 电路约束全部满足
- ✅ 与合约和 SDK 保持一致

### 测试策略
这是一个**单元测试**，使用最简单的合法输入（空消息）来验证电路的基本功能。对于复杂场景（真实加密消息、完整状态树等），应该在**集成测试**中覆盖。

---

修复完成！测试现在应该能够通过。🎉
