# ProcessDeactivate 测试修复说明

## 问题描述

测试失败在 `ProcessDeactivateMessages` 电路的第 111 行：
```
Error: Assert Failed.
Error in template ProcessDeactivateMessages_376 line: 111
```

这是 `inputHasher.hash === inputHash` 的断言失败。

## 根本原因

测试代码使用了**硬编码的假 inputHash**：

```typescript
const circuitInputs = {
  inputHash: BigInt(123),  // ❌ 错误！这是一个随意的值
  // ... 其他输入
  expectedPollId: 1n
};
```

但是电路内部会使用 `ProcessDeactivateMessagesInputHasher` 计算正确的 inputHash，该 inputHash 基于 8 个参数：
1. newDeactivateRoot
2. coordPubKey (hash)
3. batchStartHash
4. batchEndHash
5. currentDeactivateCommitment
6. newDeactivateCommitment
7. currentStateRoot
8. **expectedPollId** ← 新增的参数

由于测试提供的 `inputHash: BigInt(123)` 与电路计算的实际 hash 不匹配，导致断言失败。

## 修复方案

**步骤 1**: 使用 `ProcessDeactivateMessagesInputHasher` 电路计算正确的 inputHash

```typescript
// 定义输入值
const newDeactivateRoot = BigInt(700);
const batchStartHash = BigInt(300);
const batchEndHash = BigInt(400);
const currentDeactivateCommitment = BigInt(600);
const newDeactivateCommitment = BigInt(800);
const currentStateRoot = BigInt(500);
const expectedPollId = 1n;

// 创建 InputHasher 电路实例
const inputHasherCircuit = await circomkitInstance.WitnessTester('ProcessDeactivateMessagesInputHasher', {
  file: 'amaci/power/processDeactivate',
  template: 'ProcessDeactivateMessagesInputHasher'
});

// 计算正确的 inputHash
const inputHasherInputs = {
  newDeactivateRoot,
  coordPubKey: coordPubKey as unknown as [bigint, bigint],
  batchStartHash,
  batchEndHash,
  currentDeactivateCommitment,
  newDeactivateCommitment,
  currentStateRoot,
  expectedPollId  // ✅ 包含 poll ID
};

const inputHashWitness = await inputHasherCircuit.calculateWitness(inputHasherInputs);
const inputHash = await getSignal(inputHasherCircuit, inputHashWitness, 'hash');
```

**步骤 2**: 使用计算出的 inputHash 作为主电路的输入

```typescript
const circuitInputs = {
  inputHash,  // ✅ 使用正确计算的 hash
  currentActiveStateRoot: BigInt(100),
  currentDeactivateRoot: BigInt(200),
  batchStartHash,
  batchEndHash,
  // ... 其他输入必须与 inputHasher 中使用的值一致
  currentDeactivateCommitment,
  newDeactivateRoot,
  newDeactivateCommitment,
  currentStateRoot,
  expectedPollId  // ✅ 保持一致
};
```

## 关键点

### 1. **InputHash 一致性**
`ProcessDeactivateMessages` 电路中的断言：
```circom
// Line 111
inputHasher.hash === inputHash;
```

这意味着：
- 电路会内部计算 `inputHasher.hash`
- 必须与外部提供的 `inputHash` 完全相同
- 如果不一致，电路会失败

### 2. **参数必须一致**
传递给 `ProcessDeactivateMessages` 的参数必须与用于计算 `inputHash` 的参数**完全相同**：

| 参数 | InputHasher 中的值 | ProcessDeactivate 中的值 | 必须相同 |
|------|-------------------|-------------------------|----------|
| newDeactivateRoot | ✅ 使用 | ✅ 使用 | ✅ 是 |
| coordPubKey | ✅ 使用 (hash) | ✅ 使用 | ✅ 是 |
| batchStartHash | ✅ 使用 | ✅ 使用 | ✅ 是 |
| batchEndHash | ✅ 使用 | ✅ 使用 | ✅ 是 |
| currentDeactivateCommitment | ✅ 使用 | ✅ 使用 | ✅ 是 |
| newDeactivateCommitment | ✅ 使用 | ✅ 使用 | ✅ 是 |
| currentStateRoot | ✅ 使用 | ✅ 使用 | ✅ 是 |
| expectedPollId | ✅ 使用 | ✅ 使用 | ✅ 是 |

### 3. **为什么不能硬编码 inputHash**

❌ **错误做法**:
```typescript
const circuitInputs = {
  inputHash: BigInt(123),  // 随意的值
  // ...
};
```

这不起作用因为：
1. 电路会根据实际输入计算 hash
2. 计算出的 hash 几乎不可能是 `123`
3. 断言会失败：`calculated_hash !== 123`

✅ **正确做法**:
```typescript
// 使用 InputHasher 电路计算正确的 hash
const inputHash = await calculateInputHash(parameters);

const circuitInputs = {
  inputHash,  // 使用计算出的值
  // ...
};
```

## 测试流程

修复后的测试流程：

```
1. 准备测试数据
   ↓
2. 使用 ProcessDeactivateMessagesInputHasher 计算 inputHash
   - 输入: newDeactivateRoot, coordPubKey, batchStartHash, etc.
   - 输出: inputHash (SHA256 hash)
   ↓
3. 使用计算出的 inputHash 作为 ProcessDeactivateMessages 的输入
   - 电路内部会重新计算 hash
   - 验证: calculated_hash === provided_inputHash
   ↓
4. 测试通过 ✅
```

## 与合约的对应关系

这个修复与我们之前在合约层的修复是对应的：

**合约层** (`contracts/amaci/src/contract.rs`):
```rust
let mut input: [Uint256; 8] = [Uint256::zero(); 8];
input[0] = new_deactivate_root;
input[1] = coordinator_hash;
input[2] = batch_start_hash;
input[3] = batch_end_hash;
input[4] = current_deactivate_commitment;
input[5] = new_deactivate_commitment;
input[6] = state_root;
input[7] = Uint256::from(POLL_ID.load(deps.storage)?);  // ✅ Poll ID

let input_hash = hash_256_uint256_list(&input);
```

**电路层** (`processDeactivate.circom`):
```circom
component inputHasher = ProcessDeactivateMessagesInputHasher();
inputHasher.newDeactivateRoot <== newDeactivateRoot;
inputHasher.coordPubKey[0] <== coordPubKey[0];
inputHasher.coordPubKey[1] <== coordPubKey[1];
inputHasher.batchStartHash <== batchStartHash;
inputHasher.batchEndHash <== batchEndHash;
inputHasher.currentDeactivateCommitment <== currentDeactivateCommitment;
inputHasher.newDeactivateCommitment <== newDeactivateCommitment;
inputHasher.currentStateRoot <== currentStateRoot;
inputHasher.expectedPollId <== expectedPollId;  // ✅ Poll ID

inputHasher.hash === inputHash;  // ← 这里会验证
```

**测试层** (现在已修复):
```typescript
// ✅ 使用电路计算正确的 inputHash
const inputHash = await calculateInputHashViaCircuit({
  newDeactivateRoot,
  coordPubKey,
  batchStartHash,
  batchEndHash,
  currentDeactivateCommitment,
  newDeactivateCommitment,
  currentStateRoot,
  expectedPollId  // ✅ Poll ID
});
```

所有三层现在都正确使用 8 个参数（包括 poll ID）计算 inputHash！

## 验证

运行测试：
```bash
pnpm test:processDeactivate
```

预期结果：
- ✅ `should verify ProcessDeactivateMessages with valid poll ID` 通过
- ✅ 所有 InputHasher 测试通过

## 总结

这个修复确保了测试层面的正确性，与之前修复的电路层和合约层形成完整的一致性：

- ✅ **电路层**: 使用 8 个参数计算 inputHash
- ✅ **合约层**: 使用 8 个参数计算 inputHash
- ✅ **测试层**: 使用 8 个参数计算 inputHash（本次修复）

现在整个系统在所有层面都正确实现了 Poll ID 验证！
