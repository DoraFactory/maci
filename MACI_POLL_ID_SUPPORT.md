# MACI Poll ID 验证支持

## 背景

MACI 电路之前没有 pollId 验证功能，存在跨 poll 重放攻击的风险。参考 AMACI 的实现，为 MACI 添加了相同的 pollId 验证机制。

## 实现方案

采用与 AMACI 相同的优化方案：将 pollId 验证集成到 `MessageValidator` 中，而不是使用独立的验证循环。

## 修改内容

### 1. MessageValidator (maci/power/messageValidator.circom)
- 添加 `cmdPollId` 和 `expectedPollId` 输入信号
- 添加 `validPollId` 组件进行验证
- 将验证计数从 6 增加到 7（包含 pollId 验证）

```circom
// c2) Whether the pollId matches
// This prevents replay attacks across different polls/rounds
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

### 2. StateLeafTransformer (maci/power/stateLeafTransformer.circom)
- 添加 `cmdPollId` 和 `expectedPollId` 输入信号
- 传递给 MessageValidator

```circom
// For pollId validation in MessageValidator
signal input cmdPollId;
signal input expectedPollId;

messageValidator.cmdPollId <== cmdPollId;
messageValidator.expectedPollId <== expectedPollId;
```

### 3. ProcessOne (maci/power/processMessages.circom 中的模板)
- 添加 `cmdPollId` 和 `expectedPollId` 输入信号
- 传递给 StateLeafTransformer

```circom
signal input cmdPollId;
signal input expectedPollId;

transformer.cmdPollId <== cmdPollId;
transformer.expectedPollId <== expectedPollId;
```

### 4. ProcessMessages 主模板
- 添加 `expectedPollId` 输入信号
- 在调用 ProcessOne 时传递 pollId 相关参数

```circom
// 新增输入
signal input expectedPollId;

// 在 ProcessOne 调用中传递
processors[i].cmdPollId <== commands[i].pollId;
processors[i].expectedPollId <== expectedPollId;
```

## 安全性

1. **防止重放攻击**：每条消息的 pollId 必须匹配电路的 expectedPollId，防止消息在不同 poll 之间重放
2. **统一验证**：pollId 验证集成在 MessageValidator 中，与其他消息验证一起进行
3. **约束效率**：相比独立验证循环，这种方案更加高效，减少了约束数量

## 与 AMACI 的一致性

MACI 现在与 AMACI 使用完全相同的 pollId 验证机制：
- 相同的验证逻辑
- 相同的集成方式（MessageValidator）
- 相同的参数传递链（ProcessMessages → ProcessOne → StateLeafTransformer → MessageValidator）

## 注意事项

1. **向后兼容性**：这个修改改变了电路的约束结构，需要重新生成证明密钥和验证密钥
2. **合约支持**：需要确保调用 MACI 合约时提供正确的 expectedPollId 参数
3. **测试**：需要更新相关测试以包含 expectedPollId 参数

## 相关文件

- `packages/circuits/circom/maci/power/messageValidator.circom`
- `packages/circuits/circom/maci/power/stateLeafTransformer.circom`
- `packages/circuits/circom/maci/power/processMessages.circom`

## 参考

- `POLL_ID_VALIDATION_OPTIMIZATION.md` - AMACI pollId 验证优化文档
