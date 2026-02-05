# 电路测试修复进度报告

## 已完成的修复 ✅

### 1. UnpackElement.test.ts
- ✅ 修复了 7 处 `packElement` 调用，全部添加了 `pollId: 1` 参数
- **位置**: 593, 636, 677, 720, 762, 807, 852 行

### 2. StateLeafTransformerMaci.test.ts
- ✅ 修复了 `createValidCommand` 辅助函数中的 `packElement` 调用
- **位置**: 第 97 行

### 3. MessageValidatorMaci.test.ts
- ✅ 修复了 `createValidCommand` 辅助函数中的 `packElement` 调用
- ✅ 修复了 9 处 `buildVotePayload` 调用
- **位置**: 113行（packElement）, 1029, 1063, 1072, 1078, 1121, 1176, 1204, 1255, 1280 行（buildVotePayload）

### 4. ProcessMessagesAmaci.test.ts
- ✅ 修复了 `submitVotes` 辅助函数中的 `buildVotePayload` 调用
- **位置**: 第 92 行

### 5. ProcessMessagesMaci.test.ts  
- ✅ 修复了 `submitVotes` 辅助函数中的 `buildVotePayload` 调用
- ✅ 修复了 4 处直接的 `buildVotePayload` 调用
- **位置**: 94行（submitVotes函数）, 369, 419, 715, 799 行（直接调用）

## 待修复的文件 📋

### 6. TallyVotes.test.ts
- **预估**: ~10处 `buildVotePayload` 调用需要修复

### 7. AMACI 集成测试文件
需要修复以下文件中的 `buildVotePayload` 和 `buildDeactivatePayload` 调用：
- ProcessMessagesAmaciIntegration.test.ts
- ProcessMessagesAmaciSecurity.test.ts
- ProcessMessagesAmaciSync.test.ts
- ProcessMessagesAmaciEdgeCases.test.ts

## 修复统计

- **已修复文件**: 5/10
- **已修复调用数**: ~30+ 处
- **进度**: 50%

## 下一步

1. 修复 TallyVotes.test.ts
2. 批量修复 AMACI 集成测试文件
3. 运行测试验证所有修复

## 修复模式

所有修复都遵循统一的模式：

```typescript
// packElement 修复
packElement({ nonce, stateIdx, voIdx, newVotes, pollId: 1 })

// buildVotePayload 修复
voter.buildVotePayload({
  stateIdx,
  operatorPubkey,
  selectedOptions,
  pollId: 1  // 新增
})

// buildDeactivatePayload 修复
voter.buildDeactivatePayload({
  stateIdx,
  operatorPubkey,
  pollId: 1  // 新增
})
```
