# AMACI 测试调试报告

## 当前问题总结

### 问题 1: `buildVotePayload` 过滤 `vc: 0`
**状态**: ✅ 已修复

**原因**: 
- `normalizeVoteOptions` 函数使用 `filter((o) => !!o.vc)` 过滤掉了 `vc: 0` 的选项
- 导致 deactivate 消息（使用 `vc: 0`）被过滤，返回空数组

**修复方案**:
- 使用专门的 `buildDeactivatePayload` 方法
- 该方法直接调用 `batchGenMessage` with `[[0, 0]]`，绕过过滤逻辑

**修复状态**: 已在所有测试文件中将 `buildVotePayload` 替换为 `buildDeactivatePayload`

---

### 问题 2: Deactivate 消息 "签名验证失败"  
**状态**: 🔍 正在调查

**症状**:
```
Process deactivate messages [0, 1)
- Message <0> signature error
```

**分析**:
1. Vote 消息成功处理，nonce 从 0 更新为 1
2. Deactivate 消息使用 nonce=1（因为它是第二条消息）
3. 但在 `processDeactivateMessages` 时，stateLeaf 的 nonce 已经是 1
4. 签名验证使用 stateLeaf.pubKey，但可能存在以下问题之一：
   - **Nonce 冲突**: Deactivate 消息的 nonce 与 stateLeaf 的 nonce 不匹配
   - **Vote 和 Deactivate 的 Nonce 应该独立**: 可能需要分开的 nonce 序列
   - **消息构建问题**: `buildDeactivatePayload` 构建的消息内容有问题

**调试输出**:
```
dCommands[0]: {
  nonce: 1n,        // Deactivate 消息的 nonce
  stateIdx: 0n,
  voIdx: 0n,
  newVotes: 0n,
  ...
}
```

**可能的根本原因**:
在 AMACI 中，**Deactivate 消息应该在 Vote 消息之后发送，但它们使用相同的 nonce 序列**。

问题流程：
1. 初始 stateLeaf.nonce = 0
2. Vote 消息 (nonce=0) → 处理后 stateLeaf.nonce = 1
3. Deactivate 消息也使用 nonce=1（因为是第二条消息）
4. 但当 processDeactivateMessages 验证时，stateLeaf.nonce 已经是 1
5. 验证期望 nonce = stateLeaf.nonce + 1 = 2，但实际是 1 → 签名验证失败？

**或者另一种可能**：
Deactivate 消息的签名是基于用户的原始私钥，但 msgHash 的计算可能与 Vote 消息不同，导致签名验证失败。

---

## 测试修复进度

### 已完成
1. ✅ 修复测试流程：deactivate 消息在 `endVotePeriod()` 之前推送
2. ✅ 使用 `buildDeactivatePayload` 替代 `buildVotePayload` 
3. ✅ 更新所有测试文件：
   - `ProcessMessagesAmaciIntegration.test.ts`
   - `ProcessMessagesAmaciSecurity.test.ts`
   - 确认 `ProcessMessagesAmaciEdgeCases.test.ts` 和 `ProcessMessagesAmaciSync.test.ts` 不需要修改

### 当前问题
- 🔍 **Deactivate 消息签名验证失败**

### 待办事项
1. 🔧 分析 Deactivate 消息的 nonce 管理机制
2. 🔧 检查 `buildDeactivatePayload` 生成的消息格式
3. 🔧 确认 Vote 和 Deactivate 是否应该使用独立的 nonce
4. 🔧 修复签名验证问题
5. 🔧 重新运行所有测试
6. 📊 生成最终测试报告

---

## 下一步行动

### 立即行动
1. 检查 `buildDeactivatePayload` 生成的消息
2. 对比正常 vote 消息和 deactivate 消息的差异
3. 确认 nonce 的正确处理方式

### 可能的修复方向
1. **方向 A**: Deactivate 消息应该使用独立的 nonce（从 0 开始）
2. **方向 B**: Deactivate 消息应该在 processMessages 之前处理
3. **方向 C**: `buildDeactivatePayload` 的实现有问题，需要修正

---

## 测试通过率

### Integration Tests
- ✅ Test 1.1: Standard Voting Flow
- ❌ Test 1.2: Full Deactivate Cycle (签名错误)
- ❌ Test 1.3: Multiple Cycles (签名错误)
- ✅ Test 1.4: Concurrent Users (部分通过)

**通过率**: 50% (2/4)

---

## 关键代码位置

### SDK
- `packages/sdk/src/voter.ts:566` - `buildDeactivatePayload` 方法
- `packages/sdk/src/voter.ts:212` - `batchGenMessage` 方法
- `packages/sdk/src/voter.ts:236` - `genMessageFactory` 方法（签名生成）
- `packages/sdk/src/operator.ts:913` - `pushDeactivateMessage` 方法
- `packages/sdk/src/operator.ts:1025` - `processDeactivateMessages` 方法
- `packages/sdk/src/operator.ts:1231` - 签名验证代码

### Tests
- `packages/circuits/ts/__tests__/ProcessMessagesAmaciIntegration.test.ts`
- `packages/circuits/ts/__tests__/ProcessMessagesAmaciSecurity.test.ts`
- `packages/circuits/ts/__tests__/ProcessMessagesAmaciEdgeCases.test.ts`
- `packages/circuits/ts/__tests__/ProcessMessagesAmaciSync.test.ts`

---

生成时间: 2025-12-19

