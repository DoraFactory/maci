# MACI InputHash 修复 - 包含 expectedPollId

## 问题

MACI 电路的 `ProcessMessagesInputHasher` 模板没有包含 `expectedPollId`，与 AMACI 不一致，也与 operator.ts 的实现不匹配。

### 发现的不一致性

1. **AMACI 电路**：`ProcessMessagesInputHasher` 包含 8 个字段
   - packedVals
   - coordPubKeyHash
   - batchStartHash
   - batchEndHash
   - currentStateCommitment
   - newStateCommitment
   - deactivateCommitment
   - **expectedPollId** ✅

2. **MACI 电路（修复前）**：`ProcessMessagesInputHasher` 只有 6 个字段
   - packedVals
   - coordPubKeyHash
   - batchStartHash
   - batchEndHash
   - currentStateCommitment
   - newStateCommitment
   - ❌ **缺少 expectedPollId**

3. **operator.ts**：已经正确传入了 expectedPollId
   - AMACI：8 个字段（包含 deactivateCommitment 和 expectedPollId）
   - MACI：7 个字段（包含 expectedPollId）✅

## 修复内容

### 修改文件：`packages/circuits/circom/maci/power/processMessages.circom`

#### 1. ProcessMessagesInputHasher 模板
添加 `expectedPollId` 输入并包含在 hash 计算中：

```circom
template ProcessMessagesInputHasher() {
    // ... 注释更新 ...
    // Other inputs that can't be compressed or packed:
    // - batchStartHash, batchEndHash, currentStateCommitment,
    //   newStateCommitment, expectedPollId

    signal input packedVals;
    signal input coordPubKey[2];
    signal input batchStartHash;
    signal input batchEndHash;
    signal input currentStateCommitment;
    signal input newStateCommitment;
    signal input expectedPollId;  // NEW: Expected poll ID
    
    // ... 其他代码 ...
    
    // 3. Hash the 7 inputs with SHA256 (changed from 6 to 7)
    component hasher = Sha256Hasher(7);  // Changed from Sha256Hasher6()
    hasher.in[0] <== packedVals;
    hasher.in[1] <== pubKeyHasher.hash;
    hasher.in[2] <== batchStartHash;
    hasher.in[3] <== batchEndHash;
    hasher.in[4] <== currentStateCommitment;
    hasher.in[5] <== newStateCommitment;
    hasher.in[6] <== expectedPollId;  // NEW
    
    hash <== hasher.hash;
}
```

#### 2. ProcessMessages 主模板
传递 expectedPollId 给 inputHasher：

```circom
component inputHasher = ProcessMessagesInputHasher();
inputHasher.packedVals <== packedVals;
inputHasher.coordPubKey[0] <== coordPubKey[0];
inputHasher.coordPubKey[1] <== coordPubKey[1];
inputHasher.batchStartHash <== batchStartHash;
inputHasher.batchEndHash <== batchEndHash;
inputHasher.currentStateCommitment <== currentStateCommitment;
inputHasher.newStateCommitment <== newStateCommitment;
inputHasher.expectedPollId <== expectedPollId;  // NEW
```

## 修复后的一致性

### MACI 电路（修复后）
`ProcessMessagesInputHasher` 现在有 7 个字段：
- packedVals
- coordPubKeyHash
- batchStartHash
- batchEndHash
- currentStateCommitment
- newStateCommitment
- **expectedPollId** ✅

### 与 operator.ts 的匹配

**operator.ts 的 MACI inputHash 计算**：
```typescript
// MACI: 7 fields (no deactivateCommitment, but includes expectedPollId)
inputHash = computeInputHash([
  packedVals,
  this.pubKeyHasher!,
  batchStartHash,
  batchEndHash,
  this.stateCommitment,
  newStateCommitment,
  BigInt(this.pollId!)  // expectedPollId
]);
```

**operator.ts 的电路输入**：
```typescript
const input = {
  inputHash,
  packedVals,
  expectedPollId: this.pollId,  // ✅ 已经传入
  // ... 其他字段
};
```

现在电路和 operator 完全匹配！✅

## 对比表格

| 组件 | 修复前 | 修复后 |
|------|--------|--------|
| AMACI 电路 | 8 字段（含 deactivateCommitment 和 expectedPollId） | 无变化 ✅ |
| MACI 电路 | 6 字段（**缺少 expectedPollId**）❌ | 7 字段（含 expectedPollId）✅ |
| operator.ts AMACI | 8 字段 ✅ | 无变化 ✅ |
| operator.ts MACI | 7 字段 ✅ | 无变化 ✅ |
| operator.ts 输入 | expectedPollId 已传入 ✅ | 无变化 ✅ |

## 安全性影响

修复前的问题：
- ❌ MACI 电路的 inputHash 不包含 expectedPollId
- ❌ 但 MessageValidator 会验证 pollId
- ❌ 这导致 inputHash 和实际验证逻辑不一致

修复后：
- ✅ MACI 电路的 inputHash 现在包含 expectedPollId
- ✅ MessageValidator 验证 pollId
- ✅ inputHash 和验证逻辑完全一致
- ✅ 防止跨 poll 重放攻击

## 相关修改

这个修复是 Poll ID 验证功能的补充，与以下修改相关：
1. MessageValidator 添加 pollId 验证
2. StateLeafTransformer 传递 pollId 参数
3. ProcessOne 传递 pollId 参数
4. **ProcessMessagesInputHasher 包含 expectedPollId**（本次修复）

## 后续工作

1. **重新生成密钥**：需要重新生成 MACI 的证明密钥和验证密钥
2. **更新测试**：确保所有测试正确传入 expectedPollId
3. **验证一致性**：运行完整的测试套件验证修改

## 相关文档

- `MACI_POLL_ID_SUPPORT.md` - MACI pollId 验证实现
- `POLL_ID_IMPLEMENTATION_SUMMARY.md` - 完整实现总结
