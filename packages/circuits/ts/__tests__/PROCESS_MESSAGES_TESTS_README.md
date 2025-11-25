# ProcessMessages 电路测试文档

## 概述

本目录包含对 MACI 和 AMACI ProcessMessages 电路的全面测试，确保电路行为与 SDK OperatorClient 实现完全一致。

## 测试文件

### 1. ProcessMessagesMaci.test.ts

测试标准 MACI 的 ProcessMessages 电路实现。

**电路位置**: `packages/circuits/circom/maci/power/processMessages.circom`  
**SDK 参考**: `packages/sdk/src/operator.ts` (isAmaci=false)

**参数配置**:
- State Tree Depth: 2
- Vote Option Tree Depth: 2
- Batch Size: 5
- Max Vote Options: 5
- Number of Sign-ups: 3

### 2. ProcessMessagesAmaci.test.ts

测试 AMACI 的 ProcessMessages 电路实现（支持匿名密钥更换）。

**电路位置**: `packages/circuits/circom/amaci/power/processMessages.circom`  
**SDK 参考**: `packages/sdk/src/operator.ts` (isAmaci=true)

**参数配置**: 与 MACI 相同

### 关键区别

| 特性 | MACI | AMACI |
|------|------|-------|
| 状态叶子字段数 | 5 | 10 |
| 状态叶子结构 | [pubKey, balance, voRoot, nonce] | [pubKey, balance, voRoot, nonce, d1, d2, xIncrement] |
| InputHash 字段数 | 6 | 7 |
| 额外树结构 | 无 | activeStateTree, deactivateTree |
| 哈希方式 | 单层 Poseidon | 双层 Poseidon |
| 匿名功能 | 不支持 | 支持密钥停用和更换 |

---

## 测试结构

两个测试文件都遵循相同的测试结构，覆盖以下方面：

### Part 1: 基础消息处理
- 单条有效消息处理
- 批量消息处理
- 批次填充（消息数少于 batchSize）

### Part 2: 状态更新验证
- 状态树根更新（线性成本）
- 状态树根更新（二次方成本）
- 投票选项树更新
- Nonce 更新

### Part 3: 无效消息处理
- 无效签名的消息
- 余额不足的消息
- 状态保持验证

### Part 4: 状态承诺验证
- 初始状态承诺生成
- 新状态承诺生成
- InputHash 计算验证

### Part 5: Merkle 路径验证
- 状态叶子 Merkle 路径
- 投票选项树 Merkle 路径

### Part 6: 消息哈希链验证
- 消息链维护
- 带填充的消息链

### Part 7: 边缘案例和复杂场景
- 投票修改（同一选项多次投票）
- 多投票者不同选项
- 有效和无效消息混合

### Part 8: SDK-电路一致性检查
- 哈希函数一致性
- 树结构一致性
- 成本计算一致性

---

## 15 个核心检查点验证

每个测试文件都包含对 ProcessMessages 电路 15 个核心检查点的完整验证：

### ✓ Checkpoint 1: 公共输入哈希验证
验证 SHA256 输入哈希的计算和验证。

**MACI**: 6 个字段  
**AMACI**: 7 个字段（包含 deactivateCommitment）

### ✓ Checkpoint 2: 状态承诺验证
验证当前状态承诺的正确性。

```
commitment = Poseidon(stateRoot, salt)
```

### ✓ Checkpoint 3: 参数范围验证
验证投票选项和用户数量不超过树的最大容量。

```
maxVoteOptions ≤ 5^voteOptionTreeDepth
numSignUps ≤ 5^stateTreeDepth
```

### ✓ Checkpoint 4: 消息哈希链验证
验证批次中所有消息形成有效的哈希链。

```
msgChainHash[i+1] = isEmpty 
  ? msgChainHash[i]
  : Poseidon(MessageHash(msg[i]), msgChainHash[i])
```

### ✓ Checkpoint 5: 协调员身份验证
验证证明者知道协调员的私钥。

```
PublicKey(coordPrivKey) === coordPubKey
```

### ✓ Checkpoint 6: 消息解密与命令提取
使用 ECDH 协议解密消息并提取投票命令。

### ✓ Checkpoint 7: 状态叶子转换
根据命令转换用户状态，执行投票逻辑。

- 签名验证
- Nonce 检查
- 余额检查
- 状态更新

### ✓ Checkpoint 8: 路径索引生成
根据命令有效性选择树索引并转换为 Merkle 路径索引。

```
actualIndex = isValid ? cmdStateIndex : (MAX_INDEX - 1)
```

### ✓ Checkpoint 9: 原始状态叶子包含性证明
验证原始状态叶子存在于当前状态树中。

### ✓ Checkpoint 10: 投票权重包含性证明
验证用户在特定投票选项的当前权重。

### ✓ Checkpoint 11: 更新投票选项树
使用新投票权重重新计算投票选项树根。

### ✓ Checkpoint 12: 生成新状态叶子
根据命令有效性选择性更新状态叶子字段。

### ✓ Checkpoint 13: 计算新状态根 ⭐ (核心)
使用新状态叶子和原 Merkle 路径计算更新后的状态树根。

### ✓ Checkpoint 14: 批量处理与状态链
反向处理批次中的所有消息，形成状态链。

### ✓ Checkpoint 15: 新状态承诺验证
验证最终状态根与新状态承诺的一致性。

---

## 运行测试

### 运行所有 ProcessMessages 测试

```bash
cd packages/circuits
npm test ProcessMessages
```

### 运行 MACI 测试

```bash
npm test ProcessMessagesMaci
```

### 运行 AMACI 测试

```bash
npm test ProcessMessagesAmaci
```

---

## 测试数据流

### 1. 设置阶段
```
OperatorClient.initMaci() 
→ 初始化状态树、投票选项树
→ 注册用户
```

### 2. 投票阶段
```
VoterClient.buildVotePayload()
→ 加密投票消息
→ OperatorClient.pushMessage()
→ 构建消息哈希链
```

### 3. 处理阶段
```
OperatorClient.endVotePeriod()
→ OperatorClient.processMessages()
  → 反向处理消息
  → 更新状态树
  → 生成电路输入
```

### 4. 验证阶段
```
Circuit.calculateWitness(input)
→ 验证所有约束
→ 确认与 SDK 行为一致
```

---

## 测试覆盖率

### 功能覆盖

| 功能 | MACI | AMACI |
|------|:----:|:-----:|
| 基础消息处理 | ✓ | ✓ |
| 状态树更新 | ✓ | ✓ |
| 线性投票成本 | ✓ | ✓ |
| 二次方投票成本 | ✓ | ✓ |
| 无效消息处理 | ✓ | ✓ |
| 状态承诺 | ✓ | ✓ |
| Merkle 证明 | ✓ | ✓ |
| 消息哈希链 | ✓ | ✓ |
| 批量处理 | ✓ | ✓ |
| 投票修改 | ✓ | ✓ |
| 停用树 | - | ✓ |
| 活跃状态树 | - | ✓ |
| 双层哈希 | - | ✓ |

### 场景覆盖

- ✓ 单用户单次投票
- ✓ 单用户多次投票
- ✓ 多用户不同选项
- ✓ 有效和无效消息混合
- ✓ 批次填充
- ✓ 余额不足
- ✓ 签名错误
- ✓ Nonce 错误
- ✓ 投票撤回
- ✓ 投票修改

---

## 性能指标

### 约束数量（估算）

| 组件 | 约束数 |
|------|--------|
| MessageHasher | ~500 |
| MessageToCommand | ~2000 |
| StateLeafTransformer | ~3000 |
| QuinTreeInclusionProof (depth 2) | ~300 |
| 单条消息总计 | ~6250 |
| 批次大小 5 | ~31,250 |

### 测试执行时间

- 电路编译: 30-60 秒
- 单个测试: 2-5 秒
- 完整测试套件: 5-10 分钟

---

## 错误处理

测试验证以下错误场景：

### 1. 命令验证错误
- **签名无效**: 状态保持不变
- **Nonce 错误**: 状态保持不变
- **余额不足**: 状态保持不变
- **索引越界**: 状态保持不变

### 2. 优雅降级
- 无效命令不会中断批次处理
- 无效命令使用最后一个树索引（MAX_INDEX - 1）
- 所有命令的处理路径相同（防侧信道攻击）

### 3. 状态一致性
- 原子性更新（要么全部更新，要么全部不更新）
- 状态树根必须匹配
- 承诺必须匹配

---

## 调试技巧

### 1. 启用详细日志

测试已包含详细的 console.log 输出，显示：
- 状态转换
- 哈希值
- 余额变化
- Merkle 路径

### 2. 验证特定检查点

可以单独运行特定检查点的测试：

```bash
npm test -- --grep "Checkpoint 13"
```

### 3. 比较 SDK 和电路输出

测试输出 SDK 计算的值和电路验证的值，便于对比。

### 4. 检查约束失败

如果约束失败，查看：
1. 输入数据格式是否正确
2. 树结构深度是否匹配
3. 哈希函数是否一致
4. 数值范围是否有效

---

## 与文档对照

测试实现与以下文档完全对应：

- **分析文档**: `docs/PROCESS_MESSAGES_CIRCUIT_ANALYSIS.md`
  - 15 个检查点详细说明
  - 每个检查点的工作原理
  - 完整示例和可视化

- **SDK 实现**: `packages/sdk/src/operator.ts`
  - processMessages 方法（1259-1486 行）
  - checkCommandNow 方法（1491-1541 行）

- **电路实现**: 
  - MACI: `packages/circuits/circom/maci/power/processMessages.circom`
  - AMACI: `packages/circuits/circom/amaci/power/processMessages.circom`

---

## 贡献指南

### 添加新测试

1. 在对应的测试文件中添加新的 `describe` 或 `it` 块
2. 使用 `createTestSetup()` 辅助函数创建测试环境
3. 使用 `submitVotes()` 辅助函数提交投票
4. 验证 SDK 和电路的一致性

### 测试模板

```typescript
it('should handle [scenario description]', async () => {
  const { operator, voters } = createTestSetup(isQuadraticCost);
  
  // Setup
  submitVotes(operator, voters, [/* votes */]);
  
  operator.endVotePeriod();
  
  // Get initial state
  const initialState = /* ... */;
  
  // Process
  const { input } = await operator.processMessages({ newStateSalt: /* ... */ });
  
  // Get new state
  const newState = /* ... */;
  
  // Assertions
  expect(newState).to.equal(expectedState);
  
  // Verify with circuit
  const witness = await processMessagesCircuit.calculateWitness(input as any);
  await processMessagesCircuit.expectConstraintPass(witness);
  
  console.log('✓ Test passed');
});
```

---

## 参考链接

- [MACI 机制说明](../../docs/MACI_MECHANISM_EXPLAINED.md)
- [电路详细分析](../../docs/PROCESS_MESSAGES_CIRCUIT_ANALYSIS.md)
- [SDK 文档](../../sdk/README.md)
- [Circom 语言](https://docs.circom.io/)
- [SnarkJS](https://github.com/iden3/snarkjs)

---

## 常见问题

### Q: 为什么测试运行这么慢？

A: 电路编译和约束计算需要大量计算。第一次运行会编译电路，后续运行会使用缓存。

### Q: 如何验证特定的 Merkle 路径？

A: 测试中包含 Merkle 路径验证。可以启用日志查看完整路径信息。

### Q: MACI 和 AMACI 的主要区别是什么？

A: AMACI 支持匿名密钥更换（通过 deactivate/addNewKey），使用 10 字段状态叶子和双层哈希。

### Q: 如何调试约束失败？

A: 
1. 检查 circomkit 的详细输出
2. 验证输入数据格式
3. 对比 SDK 计算的值
4. 使用更小的参数（如 batchSize=1）简化测试

### Q: 测试覆盖了所有边缘情况吗？

A: 测试覆盖了大多数重要场景。如果发现新的边缘情况，欢迎贡献测试用例。

---

**最后更新**: 2025-11-24  
**维护者**: MACI 开发团队  
**版本**: 1.0

