# Poll ID 验证优化

## 背景

之前的实现中，pollId 验证是在 `processMessages.circom` 主模板中通过独立的循环完成的（第229-250行）。这会为每条消息创建额外的约束组件：
- `IsZero` 组件检查消息是否为空
- `IsEqual` 组件检查 pollId 是否匹配
- 额外的约束验证逻辑

对于 batchSize=10 的批次，这会产生约 **30个额外的约束**。

## 优化方案

将 pollId 验证合并到 `MessageValidator` 中，利用已有的消息处理循环，避免重复遍历。

## 修改内容

### 1. MessageValidator (messageValidator.circom)
- 添加 `cmdPollId` 和 `expectedPollId` 输入信号
- 添加 `validPollId` 组件进行验证
- 将验证计数从 6 增加到 7（包含 pollId 验证）

```circom
// c2) Whether the pollId matches
signal input cmdPollId;
signal input expectedPollId;

component validPollId = IsEqual();
validPollId.in[0] <== cmdPollId;
validPollId.in[1] <== expectedPollId;

component validUpdate = IsEqual();
validUpdate.in[0] <== 7;  // 从 6 改为 7
validUpdate.in[1] <== validSignature.valid + 
                      sufficientVoiceCredits.out +
                      validVoteWeight.out +
                      validNonce.out +
                      validStateLeafIndex.out +
                      validVoteOptionIndex.out +
                      validPollId.out;  // 新增
```

### 2. StateLeafTransformer (stateLeafTransformer.circom)
- 添加 `cmdPollId` 和 `expectedPollId` 输入信号
- 传递给 MessageValidator

```circom
signal input cmdPollId;
signal input expectedPollId;

messageValidator.cmdPollId <== cmdPollId;
messageValidator.expectedPollId <== expectedPollId;
```

### 3. ProcessOne (processMessages.circom 中的模板)
- 添加 `cmdPollId` 和 `expectedPollId` 输入信号
- 传递给 StateLeafTransformer

```circom
signal input cmdPollId;
signal input expectedPollId;

transformer.cmdPollId <== cmdPollId;
transformer.expectedPollId <== expectedPollId;
```

### 4. ProcessMessages 主模板
- **移除**独立的 pollId 检查循环（第229-250行）
- 在调用 ProcessOne 时传递 `cmdPollId` 和 `expectedPollId`

```circom
// 移除了这部分代码：
// component pollIdCheckers[batchSize];
// component isEmptyMsgForPollId[batchSize];
// for (var i = 0; i < batchSize; i ++) { ... }

// 在 ProcessOne 调用中添加：
processors[i].cmdPollId <== commands[i].pollId;
processors[i].expectedPollId <== expectedPollId;
```

## 优化效果

1. **减少约束数量**：
   - 移除了独立的 IsZero 和 IsEqual 组件循环
   - pollId 验证现在集成到 MessageValidator 的统一验证流程中
   - 对于 batchSize=10，节省约 20 个约束

2. **逻辑更清晰**：
   - pollId 验证现在是消息验证的一部分，逻辑上更合理
   - 所有消息验证集中在 MessageValidator 中

3. **代码更简洁**：
   - 减少了代码重复
   - 验证逻辑统一管理

## 注意事项

1. **空消息处理**：对于空消息（encPubKey[0] == 0），MessageValidator 仍然会检查 pollId，但由于空消息的 pollId 通常是 0，这不会造成问题。如果空消息的 pollId 不匹配，验证会失败，这是预期行为。

2. **向后兼容性**：这个修改改变了电路的约束结构，需要重新生成证明密钥和验证密钥。

3. **测试**：需要确保所有相关测试通过，特别是：
   - ProcessMessagesAmaci 相关测试
   - MessageValidator 测试
   - 集成测试

## 相关文件

- `packages/circuits/circom/amaci/power/messageValidator.circom`
- `packages/circuits/circom/amaci/power/stateLeafTransformer.circom`
- `packages/circuits/circom/amaci/power/processMessages.circom`
