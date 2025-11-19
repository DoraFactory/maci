# Batch Publish Message 功能说明

## 概述

`PublishMessageBatch` 允许用户在一笔交易中批量发布多条消息，显著减少交易数量和手续费成本。

## 使用方法

### 消息格式

```json
{
  "publish_message_batch": {
    "messages": [
      [
        {
          "data": [
            "message_field_0",
            "message_field_1",
            "message_field_2",
            "message_field_3",
            "message_field_4",
            "message_field_5",
            "message_field_6"
          ]
        },
        {
          "x": "enc_pubkey_x",
          "y": "enc_pubkey_y"
        }
      ],
      // ... 更多消息
    ]
  }
}
```

每条消息是一个包含两个元素的数组：
1. `MessageData`: 包含7个字段的消息数据
2. `PubKey`: 加密公钥（x, y 坐标）

## 功能特性

### 批量大小
- **无限制**：批量大小由调用者控制，没有硬性限制
- 建议根据区块 gas 限制合理控制批量大小（建议10-50条）

### 失败处理
- **原子性执行**：如果批次中任何消息验证失败，整个批次回滚
- 常见失败原因：
  - enc_pub_key 已被使用（`EncPubKeyAlreadyUsed`）
  - enc_pub_key 无效（不在有效域内）
  - 不在投票期间（`PeriodError`）

### 事件属性

批量发布成功后，会生成以下事件属性：

#### 批次统计信息
- `action`: "publish_message_batch"
- `batch_size`: 批次中消息的总数
- `start_chain_length`: 批次开始前的消息链长度
- `end_chain_length`: 批次结束后的消息链长度

#### 每条消息的独立属性
对于批次中的每条消息（索引为 i）：
- `msg_{i}_chain_length`: 该消息在链上的位置
- `msg_{i}_data`: 消息数据（7个字段的数组）
- `msg_{i}_enc_pub_key`: 加密公钥（x, y 坐标）

### 示例事件输出

```
action: publish_message_batch
batch_size: 3
start_chain_length: 0
msg_0_chain_length: 0
msg_0_data: [field0, field1, field2, field3, field4, field5, field6]
msg_0_enc_pub_key: pubkey_x,pubkey_y
msg_1_chain_length: 1
msg_1_data: [field0, field1, field2, field3, field4, field5, field6]
msg_1_enc_pub_key: pubkey_x,pubkey_y
msg_2_chain_length: 2
msg_2_data: [field0, field1, field2, field3, field4, field5, field6]
msg_2_enc_pub_key: pubkey_x,pubkey_y
end_chain_length: 3
```

## 性能优化

相比单条发布（`PublishMessage`），批量发布具有以下优化：

1. **减少交易数量**：N 条消息从 N 笔交易减少到 1 笔交易
2. **降低 gas 成本**：
   - 投票时间检查只执行一次
   - snark_scalar_field 只加载一次
   - MSG_CHAIN_LENGTH 只保存一次（批次结束时）
3. **减少网络拥堵**：更少的交易意味着更低的网络负担

## 使用建议

1. **批量大小选择**：
   - 小批量（5-10条）：适合快速确认
   - 中批量（20-30条）：平衡 gas 成本和确认速度
   - 大批量（40-50条）：最大化 gas 节省，但注意 gas 限制

2. **错误处理**：
   - 确保所有 enc_pub_key 都是唯一且未使用的
   - 在投票期间内调用
   - 准备好处理整个批次失败的情况

3. **监控事件**：
   - 使用事件属性追踪每条消息的位置
   - 验证 `batch_size` 与预期一致
   - 检查 `end_chain_length` 确认所有消息已处理

## 与单条发布的对比

| 特性 | PublishMessage | PublishMessageBatch |
|------|----------------|---------------------|
| 每笔交易消息数 | 1 | 多条（无限制） |
| Gas 成本 | 高（N 笔交易） | 低（1 笔交易） |
| 失败处理 | 单条失败 | 整批失败 |
| 事件粒度 | 单条消息 | 批次统计 + 每条消息 |
| 使用场景 | 单条发布 | 批量发布 |

## 技术细节

### 验证流程
1. 检查投票时间（一次性）
2. 加载 snark_scalar_field（一次性）
3. 对每条消息：
   - 验证 enc_pub_key 有效性
   - 检查 enc_pub_key 未被使用
   - 标记 enc_pub_key 为已使用
   - 计算消息哈希
   - 更新 MSG_HASHES
   - 递增消息链长度
4. 保存最终消息链长度（一次性）

### 存储更新
- `MSG_HASHES`: 每条消息更新一次
- `USED_ENC_PUB_KEYS`: 每条消息标记一次
- `MSG_CHAIN_LENGTH`: 批次结束时更新一次

## 常见问题

**Q: 批量发布失败后需要重新提交整个批次吗？**  
A: 是的，由于原子性保证，任何失败都会导致整个批次回滚，需要重新提交。

**Q: 可以在批次中混合使用不同的 enc_pub_key 吗？**  
A: 可以，每个消息可以使用不同的 enc_pub_key，只要它们都是有效且未被使用的。

**Q: 批量发布会影响消息处理顺序吗？**  
A: 不会，批次中的消息按顺序处理，消息链保持正确的顺序。

**Q: 如何确定最佳批量大小？**  
A: 建议从 10-20 条开始测试，根据实际 gas 使用情况和确认时间调整。注意不要超过区块 gas 限制。

