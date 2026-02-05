# AMACI 和 MACI Poll ID 验证实现总结

## 概览

为两个电路系统（AMACI 和 MACI）都实现了 pollId 验证功能，防止跨 poll 重放攻击。

## 修改对比

### AMACI 优化
**之前**：pollId 验证在 `processMessages.circom` 主模板中通过独立循环实现
- 独立的 `pollIdCheckers[batchSize]` 组件数组
- 独立的 `isEmptyMsgForPollId[batchSize]` 组件数组
- 额外的验证循环（第229-250行）
- 对于 batchSize=10，约 30 个额外约束

**之后**：pollId 验证集成到 `MessageValidator` 中
- 移除独立的验证循环
- pollId 验证作为消息验证的一部分（第7项验证）
- 利用已有的消息处理循环
- 减少约 20 个约束（对于 batchSize=10）

### MACI 添加
**之前**：没有 pollId 验证
- 存在跨 poll 重放攻击风险
- MessageValidator 只有 6 项验证

**之后**：直接采用优化后的方案
- pollId 验证集成到 MessageValidator 中
- MessageValidator 增加到 7 项验证
- 与 AMACI 保持一致

## 修改的文件

### AMACI
1. `packages/circuits/circom/amaci/power/messageValidator.circom`
   - 添加 cmdPollId 和 expectedPollId 输入
   - 添加 validPollId 验证组件
   - 验证计数从 6 改为 7

2. `packages/circuits/circom/amaci/power/stateLeafTransformer.circom`
   - 添加 cmdPollId 和 expectedPollId 输入
   - 传递给 MessageValidator

3. `packages/circuits/circom/amaci/power/processMessages.circom`
   - ProcessOne 添加 cmdPollId 和 expectedPollId 输入
   - 移除独立的 pollId 检查循环（第229-250行）
   - 在 ProcessOne 调用中传递 pollId 参数

### MACI
1. `packages/circuits/circom/maci/power/messageValidator.circom`
   - 添加 cmdPollId 和 expectedPollId 输入
   - 添加 validPollId 验证组件
   - 验证计数从 6 改为 7

2. `packages/circuits/circom/maci/power/stateLeafTransformer.circom`
   - 添加 cmdPollId 和 expectedPollId 输入
   - 传递给 MessageValidator

3. `packages/circuits/circom/maci/power/processMessages.circom`
   - ProcessMessages 添加 expectedPollId 输入
   - ProcessOne 添加 cmdPollId 和 expectedPollId 输入
   - 在 ProcessOne 调用中传递 pollId 参数

## 参数传递链

两个系统现在使用相同的参数传递链：

```
ProcessMessages (主模板)
  └─ expectedPollId (输入)
      │
      └─> ProcessOne (子模板)
            ├─ expectedPollId (输入)
            └─ cmdPollId (从解密的命令获取)
                │
                └─> StateLeafTransformer
                      ├─ expectedPollId
                      └─ cmdPollId
                          │
                          └─> MessageValidator
                                ├─ expectedPollId
                                └─ cmdPollId
                                    │
                                    └─> validPollId = IsEqual()
                                          ├─ in[0] = cmdPollId
                                          └─ in[1] = expectedPollId
```

## 验证逻辑

### MessageValidator 验证项（两个系统一致）

1. ✅ 状态树索引有效 (validStateLeafIndex)
2. ✅ 投票选项索引有效 (validVoteOptionIndex)
3. ✅ Nonce 正确 (validNonce)
4. ✅ **Poll ID 匹配 (validPollId)** ⬅️ 新增
5. ✅ 签名有效 (validSignature)
6. ✅ 投票权重有效 (validVoteWeight)
7. ✅ 余额充足 (sufficientVoiceCredits)

所有 7 项验证必须全部通过，消息才被认为有效。

## 优化效果

### AMACI
- ✅ 减少约束数量：~20个约束（batchSize=10）
- ✅ 代码更简洁：移除22行重复代码
- ✅ 逻辑更清晰：验证集中在 MessageValidator

### MACI
- ✅ 安全性提升：防止跨 poll 重放攻击
- ✅ 与 AMACI 一致：使用相同的实现方式
- ✅ 最优方案：直接采用优化后的集成方式

## 安全性保证

1. **防止重放攻击**：消息的 pollId 必须匹配电路的 expectedPollId
2. **统一验证**：pollId 验证与其他验证一起进行，不能绕过
3. **约束保证**：验证失败会导致电路约束不满足，证明生成失败

## 后续工作

1. **测试更新**：更新所有相关测试以包含 expectedPollId 参数
2. **密钥重新生成**：需要重新生成证明密钥和验证密钥
3. **合约更新**：确保合约调用时提供正确的 expectedPollId 参数
4. **文档更新**：更新 API 文档和使用说明

## 相关文档

- `POLL_ID_VALIDATION_OPTIMIZATION.md` - AMACI pollId 验证优化详情
- `MACI_POLL_ID_SUPPORT.md` - MACI pollId 验证实现详情
