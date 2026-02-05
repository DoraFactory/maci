# 电路测试更新指南

## 问题概述

由于引入了 `poll_id` 概念，SDK 中的多个关键函数签名发生了变化，导致电路测试失败。

## 核心变化

### 1. `packElement` 函数签名变化

**之前（7 元素，无 pollId）：**
```typescript
export function packElement({
  nonce,
  stateIdx,
  voIdx,
  newVotes,
  salt
}: {
  nonce: number | bigint;
  stateIdx: number | bigint;
  voIdx: number | bigint;
  newVotes: number | bigint;
  salt: bigint;
}): bigint
```

**现在（8 元素，包含 pollId）：**
```typescript
export function packElement({
  nonce,
  stateIdx,
  voIdx,
  newVotes,
  pollId  // 新增必需参数
}: {
  nonce: number | bigint;
  stateIdx: number | bigint;
  voIdx: number | bigint;
  newVotes: number | bigint;
  pollId: number | bigint;  // 新增必需参数
}): bigint
```

### 2. `buildVotePayload` 函数签名变化

**之前（无 pollId）：**
```typescript
buildVotePayload({
  stateIdx,
  operatorPubkey,
  selectedOptions
}: {
  stateIdx: number;
  operatorPubkey: bigint | string | PubKey;
  selectedOptions: { idx: number; vc: number; }[];
})
```

**现在（需要 pollId）：**
```typescript
buildVotePayload({
  stateIdx,
  operatorPubkey,
  selectedOptions,
  pollId  // 新增必需参数
}: {
  stateIdx: number;
  operatorPubkey: bigint | string | PubKey;
  selectedOptions: { idx: number; vc: number; }[];
  pollId: number;  // 新增必需参数
})
```

### 3. `buildDeactivatePayload` 函数签名变化

**之前（无 pollId）：**
```typescript
buildDeactivatePayload({
  stateIdx,
  operatorPubkey
}: {
  stateIdx: number;
  operatorPubkey: bigint | string | PubKey;
})
```

**现在（需要 pollId）：**
```typescript
buildDeactivatePayload({
  stateIdx,
  operatorPubkey,
  pollId  // 新增必需参数
}: {
  stateIdx: number;
  operatorPubkey: bigint | string | PubKey;
  pollId: number;  // 新增必需参数
})
```

## 需要更新的测试文件

### A. 直接使用 `packElement` 的测试

这些文件需要在调用 `packElement` 时添加 `pollId` 参数：

1. **`packages/circuits/ts/__tests__/MessageValidatorMaci.test.ts`**
   - 第 113 行：`packElement({ nonce, stateIdx, voIdx, newVotes, salt })`
   - **修复**：添加 `pollId: 1` 参数

2. **`packages/circuits/ts/__tests__/StateLeafTransformerMaci.test.ts`**
   - 第 97 行：`packElement({ nonce, stateIdx, voIdx, newVotes, salt })`
   - **修复**：添加 `pollId: 1` 参数

3. **`packages/circuits/ts/__tests__/UnpackElement.test.ts`**
   - 多处调用 `packElement`
   - **修复**：在所有 `packElement` 调用中添加 `pollId: 1` 参数

### B. 使用 `buildVotePayload` 的测试

这些文件需要在调用 `buildVotePayload` 时添加 `pollId` 参数：

1. **`packages/circuits/ts/__tests__/TallyVotes.test.ts`**
   - 95, 108, 186, 256, 364, 432, 509, 604, 698, 758, 847 行等
   - **修复**：添加 `pollId: 1` 参数

2. **`packages/circuits/ts/__tests__/ProcessMessagesMaci.test.ts`**
   - 94, 368, 418, 714 行等
   - **修复**：添加 `pollId: 1` 参数

3. **`packages/circuits/ts/__tests__/ProcessMessagesAmaci.test.ts`**
   - 92 行的 `submitVotes` 函数中
   - **修复**：添加 `pollId: 1` 参数

4. **`packages/circuits/ts/__tests__/ProcessMessagesAmaciSync.test.ts`**
   - 184, 325, 364, 437 行等
   - **修复**：添加 `pollId: 1` 参数

5. **`packages/circuits/ts/__tests__/ProcessMessagesAmaciSecurity.test.ts`**
   - 187, 246, 440 行等
   - **修复**：添加 `pollId: 1` 参数

6. **`packages/circuits/ts/__tests__/ProcessMessagesAmaciIntegration.test.ts`**
   - 73, 154, 269, 283, 405, 496 行等
   - **修复**：添加 `pollId: 1` 参数

7. **`packages/circuits/ts/__tests__/ProcessMessagesAmaciEdgeCases.test.ts`**
   - 207, 527, 570 行等
   - **修复**：添加 `pollId: 1` 参数

8. **`packages/circuits/ts/__tests__/MessageValidatorMaci.test.ts`**
   - 1029, 1062 行等（多个 payload 测试）
   - **修复**：添加 `pollId: 1` 参数

### C. 使用 `buildDeactivatePayload` 的测试

这些文件需要在调用 `buildDeactivatePayload` 时添加 `pollId` 参数：

1. **`packages/circuits/ts/__tests__/ProcessMessagesAmaciEdgeCases.test.ts`**
   - 50, 103 行等
   - **修复**：添加 `pollId: 1` 参数

2. **`packages/circuits/ts/__tests__/ProcessMessagesAmaciIntegration.test.ts`**
   - 118, 207, 260 行等
   - **修复**：添加 `pollId: 1` 参数

3. **`packages/circuits/ts/__tests__/ProcessMessagesAmaciSecurity.test.ts`**
   - 47, 90, 131, 191, 256, 299, 349 行等
   - **修复**：添加 `pollId: 1` 参数

4. **`packages/circuits/ts/__tests__/ProcessMessagesAmaciSync.test.ts`**
   - 184 行等
   - **修复**：添加 `pollId: 1` 参数

## 修复示例

### 示例 1: 修复 `packElement` 调用

**修复前：**
```typescript
const packaged = packElement({ 
  nonce, 
  stateIdx, 
  voIdx, 
  newVotes, 
  salt 
});
```

**修复后：**
```typescript
const packaged = packElement({ 
  nonce, 
  stateIdx, 
  voIdx, 
  newVotes, 
  pollId: 1  // 新增：使用默认测试 pollId
});
```

### 示例 2: 修复 `buildVotePayload` 调用

**修复前：**
```typescript
const votePayload = voter.buildVotePayload({
  stateIdx: 0,
  operatorPubkey: coordPubKey,
  selectedOptions: [{ idx: 1, vc: 10 }]
});
```

**修复后：**
```typescript
const votePayload = voter.buildVotePayload({
  stateIdx: 0,
  operatorPubkey: coordPubKey,
  selectedOptions: [{ idx: 1, vc: 10 }],
  pollId: 1  // 新增：使用默认测试 pollId
});
```

### 示例 3: 修复 `buildDeactivatePayload` 调用

**修复前：**
```typescript
const deactivatePayload = voter.buildDeactivatePayload({
  stateIdx: 0,
  operatorPubkey: coordPubKey
});
```

**修复后：**
```typescript
const deactivatePayload = voter.buildDeactivatePayload({
  stateIdx: 0,
  operatorPubkey: coordPubKey,
  pollId: 1  // 新增：使用默认测试 pollId
});
```

### 示例 4: 修复 `submitVotes` 辅助函数

**修复前：**
```typescript
function submitVotes(
  operator: OperatorClient,
  voters: VoterClient[],
  votes: { voterIdx: number; optionIdx: number; weight: number }[]
) {
  const coordPubKey = operator.getPubkey().toPoints();

  votes.forEach(({ voterIdx, optionIdx, weight }) => {
    const voter = voters[voterIdx];
    const votePayload = voter.buildVotePayload({
      stateIdx: voterIdx,
      operatorPubkey: coordPubKey,
      selectedOptions: [{ idx: optionIdx, vc: weight }]
    });
    // ... rest
  });
}
```

**修复后：**
```typescript
function submitVotes(
  operator: OperatorClient,
  voters: VoterClient[],
  votes: { voterIdx: number; optionIdx: number; weight: number }[]
) {
  const coordPubKey = operator.getPubkey().toPoints();

  votes.forEach(({ voterIdx, optionIdx, weight }) => {
    const voter = voters[voterIdx];
    const votePayload = voter.buildVotePayload({
      stateIdx: voterIdx,
      operatorPubkey: coordPubKey,
      selectedOptions: [{ idx: optionIdx, vc: weight }],
      pollId: 1  // 新增
    });
    // ... rest
  });
}
```

## 测试统计

根据错误日志，总共有 **142 个测试失败**，分布如下：

- **MessageValidator 测试**: ~44 个失败
- **ProcessMessages AMACI 测试**: ~60 个失败
- **ProcessMessages MACI 测试**: ~20 个失败
- **StateLeafTransformer 测试**: ~19 个失败
- **TallyVotes 测试**: ~10 个失败
- **UnpackElement 测试**: ~7 个失败

## 测试迁移清单

- [ ] `MessageValidatorMaci.test.ts` - 添加 pollId 到所有 packElement 和 buildVotePayload 调用
- [ ] `StateLeafTransformerMaci.test.ts` - 添加 pollId 到 packElement 调用
- [ ] `UnpackElement.test.ts` - 添加 pollId 到所有 packElement 调用
- [ ] `TallyVotes.test.ts` - 添加 pollId 到所有 buildVotePayload 调用
- [ ] `ProcessMessagesMaci.test.ts` - 添加 pollId 到所有 buildVotePayload 调用
- [ ] `ProcessMessagesAmaci.test.ts` - 添加 pollId 到 submitVotes 函数
- [ ] `ProcessMessagesAmaciSync.test.ts` - 添加 pollId
- [ ] `ProcessMessagesAmaciSecurity.test.ts` - 添加 pollId 到 buildVotePayload 和 buildDeactivatePayload
- [ ] `ProcessMessagesAmaciIntegration.test.ts` - 添加 pollId
- [ ] `ProcessMessagesAmaciEdgeCases.test.ts` - 添加 pollId

## 推荐的测试配置

为了让测试更容易维护，建议在测试文件的开头定义常量：

```typescript
// 在测试文件顶部添加
const TEST_POLL_ID = 1;  // 默认测试 poll ID

// 然后在所有调用中使用
const payload = voter.buildVotePayload({
  stateIdx: 0,
  operatorPubkey: coordPubKey,
  selectedOptions: [{ idx: 1, vc: 10 }],
  pollId: TEST_POLL_ID  // 使用常量
});
```

## 自动化修复建议

可以使用正则表达式批量查找和替换：

### 查找模式 1: `buildVotePayload` 调用
```regex
buildVotePayload\(\{([^}]*?)\}\)
```

### 查找模式 2: `buildDeactivatePayload` 调用
```regex
buildDeactivatePayload\(\{([^}]*?)\}\)
```

### 查找模式 3: `packElement` 调用
```regex
packElement\(\{([^}]*?)\}\)
```

对于每个匹配，在闭合的 `}` 之前添加 `,\n  pollId: 1`。

## 相关文件

- **SDK Pack**: `/packages/sdk/src/libs/crypto/pack.ts`
- **SDK Voter**: `/packages/sdk/src/voter.ts`
- **测试目录**: `/packages/circuits/ts/__tests__/`

## 修复日期

需要修复日期：2026-02-01
