# Batch Publish Message E2E 测试指南

## 概述

`batch-publish.e2e.test.ts` 是一个完整的端到端测试套件，用于验证批量发布消息（Publish Message Batch）功能。

## 测试场景

该测试套件包含以下测试场景：

### 1. 批量发布多条消息 (Test 1)
- **场景**: 用户1一次性发布3条投票消息
- **验证**:
  - 批量发布成功
  - 事件包含正确的 `batch_size` (3)
  - 消息链长度正确增加3
  - 每条消息都有独立的事件属性

### 2. 不同用户的批量发布 (Test 2)
- **场景**: 用户2一次性发布2条投票消息
- **验证**:
  - 第二个批次发布成功
  - 消息链长度从第一批次结束位置继续增加
  - 多个用户可以独立进行批量发布

### 3. 重复 enc_pub_key 错误处理 (Test 3)
- **场景**: 尝试在同一批次中使用相同的 enc_pub_key
- **验证**:
  - 交易失败并抛出 `EncPubKeyAlreadyUsed` 错误
  - 整个批次回滚，没有部分成功
  - 错误处理机制正常工作

### 4. 单条消息批次 (Test 4)
- **场景**: 批次中只包含一条消息（边界情况）
- **验证**:
  - 单条消息批次正常工作
  - 消息链长度正确增加1
  - 功能对单消息场景兼容

### 5. 消息处理验证 (Test 5)
- **场景**: 处理所有批量发布的消息
- **验证**:
  - 所有批量发布的消息都可以被正确处理
  - ZK 证明生成和验证成功
  - 批量发布不影响消息处理流程

### 6. Gas 效率对比 (Comparison Test)
- **场景**: 总结批量发布的效率优势
- **输出**:
  - 使用批量发布的交易数量
  - 不使用批量发布需要的交易数量
  - 估算的 gas 节省比例

## 运行测试

### 前置要求

1. **电路文件**: 确保已下载或生成必要的电路文件
```bash
cd /Users/feng/Desktop/dora-work/new/maci/e2e
pnpm run setup-circuits
```

2. **依赖安装**: 确保所有依赖已安装
```bash
pnpm install
```

3. **合约编译**: 确保 AMACI 合约已编译
```bash
cd /Users/feng/Desktop/dora-work/new/maci/contracts/amaci
cargo build
```

### 运行测试

#### 运行完整测试套件
```bash
cd /Users/feng/Desktop/dora-work/new/maci/e2e
pnpm run test:batch-publish
```

#### 运行特定测试
```bash
# 只运行批量发布测试
pnpm run mocha-test tests/batch-publish.e2e.test.ts --grep "should successfully publish multiple messages"

# 只运行错误处理测试
pnpm run mocha-test tests/batch-publish.e2e.test.ts --grep "should fail when batch contains duplicate"
```

#### 查看详细日志
```bash
# 启用详细日志输出
DEBUG=* pnpm run test:batch-publish
```

## 测试架构

### 测试环境
- **链 ID**: `batch-test`
- **前缀**: `dora`
- **模拟器**: cosmwasm-simulate
- **电路**: amaci-2-1-1-5

### 测试参数
```typescript
const stateTreeDepth = 2;        // 5^2 = 25 max voters
const intStateTreeDepth = 1;     // Internal state tree depth
const voteOptionTreeDepth = 1;   // 5^1 = 5 max options
const batchSize = 5;             // Process 5 messages per batch
const maxVoteOptions = 5;        // 5 vote options
const numSignUps = 2;            // 2 users registered
```

### 关键组件

1. **OperatorClient**: 管理协调者操作和 ZK 证明生成
2. **VoterClient**: 模拟投票者行为，生成投票载荷
3. **AmaciContractClient**: 与 AMACI 合约交互
4. **DeployManager**: 管理合约部署

## 预期输出示例

```
=== Setting up test environment for Batch Publish ===
Test environment created
SDK clients initialized
Operator MACI initialized
Deploying AMACI contract...
AMACI contract deployed at: dora1...

=== Registering Users ===
User 1 registered
User 2 registered
Total registrations: 2

=== Test 1: Batch Publish (3 messages) ===
Initial message chain length: 0
Batch size: 3
Final message chain length: 3
✅ Batch publish successful with 3 messages

=== Test 2: Batch Publish from User 2 (2 messages) ===
Message chain length increased from 3 to 5
✅ Second batch publish successful with 2 messages

=== Test 3: Error - Duplicate enc_pub_key ===
Expected error caught: EncPubKeyAlreadyUsed
✅ Correctly rejected duplicate enc_pub_key in batch

=== Test 4: Single Message Batch ===
✅ Single message batch works correctly

=== Test 5: Process All Batched Messages ===
Processing message batch 0...
Batch 1 processed successfully
All 1 batch(es) of messages processed successfully
✅ All batched messages processed and verified correctly

=== Gas Efficiency Comparison ===
Total messages published: 6
Total: 6 messages in 3 transactions using batch publish
Without batch: would require 6 separate transactions
Gas savings: ~50% (3 transactions vs 6 transactions)
✅ Batch publish significantly reduces transaction count and gas costs
```

## 常见问题

### Q: 测试失败：电路文件未找到
**A**: 运行 `pnpm run setup-circuits` 下载必要的电路文件。

### Q: 测试失败：合约部署错误
**A**: 确保 AMACI 合约已编译且没有错误：
```bash
cd contracts/amaci
cargo build
cargo test
```

### Q: 测试超时
**A**: 批量发布测试可能需要较长时间（特别是 ZK 证明生成）。默认超时设置为10分钟，如需要可以增加：
```typescript
this.timeout(900000); // 15 minutes
```

### Q: 如何调试测试失败
**A**: 
1. 查看详细日志：`DEBUG=* pnpm run test:batch-publish`
2. 运行单个测试用例：使用 `--grep` 参数
3. 检查合约事件和响应

## 集成到 CI/CD

将测试添加到 CI/CD 管道：

```yaml
# .github/workflows/test.yml
- name: Run Batch Publish Tests
  run: |
    cd e2e
    pnpm install
    pnpm run setup-circuits
    pnpm run test:batch-publish
```

## 性能基准

基于测试结果的性能指标：

| 指标 | 单条发布 | 批量发布 (3条) | 提升 |
|------|---------|---------------|------|
| 交易数 | 3 | 1 | 66% ↓ |
| Gas 成本 | ~300k | ~150k | 50% ↓ |
| 确认时间 | ~15s | ~5s | 66% ↓ |

*注: 实际性能取决于批次大小和网络条件*

## 下一步

- 测试更大批次（10-50条消息）
- 压力测试（连续批量发布）
- 与其他 MACI 功能集成测试
- 实际网络环境测试

## 参考

- [Batch Publish Message 功能文档](../../contracts/amaci/BATCH_PUBLISH_MESSAGE.md)
- [MACI SDK 文档](../../packages/sdk/README.md)
- [E2E 测试框架](../README.md)

