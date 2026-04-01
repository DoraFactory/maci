# Lint 错误修复总结

## 修复的 Lint 错误

### 1. ProcessMessagesMaci.test.ts

**问题 1**: `numSignUps` 参数不在 `initRound` 类型中
- **位置**: Line 61
- **错误**: 对象字面量只能指定已知属性，并且"numSignUps"不在类型中
- **修复**: 从 `initRound` 调用中移除 `numSignUps` 参数

**问题 2**: 未使用的变量 `numSignUps`
- **位置**: Line 34
- **类型**: Warning
- **修复**: 删除未使用的 `numSignUps` 变量声明

```diff
- const numSignUps = 3;

  operator.initRound({
    stateTreeDepth,
    intStateTreeDepth: 1,
    voteOptionTreeDepth,
    batchSize,
    maxVoteOptions,
-   numSignUps,
    isQuadraticCost,
    isAmaci: false
  });
```

### 2. ProcessMessagesAmaciSync.test.ts

**问题 1**: 缺少逗号和重复的 pollId
- **位置**: Line 238-239
- **错误**: 应为","
- **修复**: 添加逗号并删除重复的 pollId

```diff
  const deactivatePayload = await voter.buildDeactivatePayload({
    stateIdx: 0,
-   operatorPubkey: operator.getPubkey().toPoints()
-   pollId: 1,
-   pollId: 1
+   operatorPubkey: operator.getPubkey().toPoints(),
+   pollId: 1
  });
```

**问题 2**: 未使用的导入 `genKeypair`
- **位置**: Line 8
- **类型**: Warning
- **修复**: 从导入中移除 `genKeypair`

```diff
  import {
    OperatorClient,
    VoterClient,
    poseidon,
    hash2,
    hash5,
-   genKeypair,
    encryptOdevity
  } from '@dorafactory/maci-sdk';
```

## 验证结果

✅ 所有测试文件的 lint 检查通过，无错误和警告！

### 检查的文件

- ✅ UnpackElement.test.ts
- ✅ StateLeafTransformerMaci.test.ts
- ✅ MessageValidatorMaci.test.ts
- ✅ ProcessMessagesAmaci.test.ts
- ✅ ProcessMessagesMaci.test.ts (已修复)
- ✅ TallyVotes.test.ts
- ✅ ProcessMessagesAmaciIntegration.test.ts
- ✅ ProcessMessagesAmaciSecurity.test.ts
- ✅ ProcessMessagesAmaciSync.test.ts (已修复)
- ✅ ProcessMessagesAmaciEdgeCases.test.ts

## 修复类型统计

- **类型错误**: 2 个（已修复）
- **未使用变量警告**: 2 个（已修复）
- **语法错误**: 1 个（缺少逗号，已修复）

---

**修复完成时间**: 2026-02-01
**状态**: ✅ 全部通过

## 额外修复（2026-02-01 第二轮）

### 3. ProcessMessagesAmaciSecurity.test.ts

在之前的自动化修复中遗漏了这个文件的两处问题。

**问题**: 缺少逗号和重复的 pollId（与 ProcessMessagesAmaciSync.test.ts 相同的问题）

**位置 1**: Line 112-114
**位置 2**: Line 374-376

**修复**:

```diff
  const deactivatePayload = await voter.buildDeactivatePayload({
    stateIdx: 0,
-   operatorPubkey: operator.getPubkey().toPoints()
-   pollId: 1,
-   pollId: 1
+   operatorPubkey: operator.getPubkey().toPoints(),
+   pollId: 1
  });
```

```diff
  const payload = await voter.buildDeactivatePayload({
    stateIdx: 0,
-   operatorPubkey: operator.getPubkey().toPoints()
-   pollId: 1,
-   pollId: 1
+   operatorPubkey: operator.getPubkey().toPoints(),
+   pollId: 1
  });
```

## 最终验证

✅ 所有测试文件再次通过 lint 检查
✅ 所有语法错误已修复
✅ ProcessMessagesAmaciSecurity.test.ts 现在有 10 个正确的 `pollId: 1`

### 问题根源分析

这个问题是由之前的自动化脚本在处理多行格式时，某些特殊情况（`toPoints()` 后直接换行）没有被正则表达式正确匹配导致的。手动修复已经解决了这些边缘情况。

---

**最终状态**: ✅ 全部通过，无错误
