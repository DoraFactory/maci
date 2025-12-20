# AMACI ProcessMessages 测试套件使用指南

## 快速开始

### 运行所有 AMACI 相关测试
```bash
cd packages/circuits
npm test -- --grep "AMACI"
```

## 测试套件结构

### 1. 集成测试 (Integration)
**文件**: `ProcessMessagesAmaciIntegration.test.ts`

测试完整的用户生命周期：
- ✅ 标准投票流程
- ✅ Deactivate → AddNewKey 完整循环
- ✅ 多次循环测试
- ✅ 并发用户场景

```bash
npm test -- ProcessMessagesAmaciIntegration
```

### 2. 安全测试 (Security)
**文件**: `ProcessMessagesAmaciSecurity.test.ts`

验证安全机制：
- ✅ ActiveStateTree 电路验证
- ✅ 双重检查机制
- ✅ 防止 Operator 作恶
- ✅ 防止消息跳过

```bash
npm test -- ProcessMessagesAmaciSecurity
```

### 3. 边界情况测试 (Edge Cases)
**文件**: `ProcessMessagesAmaciEdgeCases.test.ts`

测试异常场景：
- ✅ 无效消息处理
- ✅ 奇数 d1/d2 拒绝
- ✅ Nullifier 防重放
- ✅ 数据同步错误处理

```bash
npm test -- ProcessMessagesAmaciEdgeCases
```

### 4. SDK-电路同步测试 (Sync)
**文件**: `ProcessMessagesAmaciSync.test.ts`

验证一致性：
- ✅ 状态树哈希一致性
- ✅ ActiveStateTree 更新一致性
- ✅ InputHash 计算一致性
- ✅ 端到端一致性

```bash
npm test -- ProcessMessagesAmaciSync
```

### 5. 主测试文件 (Updated)
**文件**: `ProcessMessagesAmaci.test.ts`

包含原有的 15 个检查点 + 新增的 deactivation 参考测试。

```bash
npm test -- ProcessMessagesAmaci.test.ts
```

### 6. Deactivation 检测测试
**文件**: `DeactivateStatusDetection.test.ts`

专注于 deactivation 状态检测机制。

```bash
npm test -- DeactivateStatusDetection
```

## 按功能分类运行

### 测试 Deactivation 功能
```bash
npm test -- --grep "deactivate|Deactivate"
```

### 测试安全机制
```bash
npm test -- --grep "security|Security|tampering|prevent"
```

### 测试双重检查
```bash
npm test -- --grep "dual|check|activeState"
```

### 测试同步验证
```bash
npm test -- --grep "sync|consistency|match"
```

## 测试工具函数

位置: `ts/__tests__/utils/utils.ts`

新增的工具函数：
- `createAccountWithOddD1D2()` - 创建奇数 d1/d2 账户
- `verifyDualCheck()` - 验证双重检查
- `calculateStateLeafHash()` - 计算状态叶哈希
- `isDeactivated()` - 检查 deactivation 状态
- `genStaticRandomKey()` - 生成静态随机密钥

## 关键概念速查

### ActiveStateTree
- 0 = active (可投票)
- 非零 = inactive (已 deactivate)

### d1/d2 状态
- 偶数 = active/正常
- 奇数 = deactivated/损坏

### 双重检查
两者都必须通过：
1. ActiveStateTree[idx] == 0
2. decrypt(d1, d2) % 2 == 0

## 调试技巧

### 启用详细输出
测试中包含大量 console.log 输出，运行时会自动显示关键步骤和验证点。

### 单独运行某个测试
```bash
npm test -- ProcessMessagesAmaciIntegration.test.ts --grep "complete full deactivate"
```

### 增加超时时间
如果测试超时，编辑测试文件中的：
```typescript
this.timeout(900000); // 15 分钟
```

## 常见问题

### Q: 为什么需要这么多测试？
A: AMACI 的 deactivation 机制涉及多个安全层（activeStateTree, d1/d2, Merkle proofs），需要全面测试确保没有漏洞。

### Q: 测试运行需要多长时间？
A: 
- 单个测试文件：3-5 分钟
- 所有 AMACI 测试：15-20 分钟

### Q: 可以并行运行吗？
A: 是的，不同测试文件可以并行运行：
```bash
npm test -- --parallel
```

### Q: 如何查看电路约束？
A: 测试失败时会显示约束错误。也可以查看 circom 编译输出。

## 测试数据

### 标准测试账户
```typescript
coordinator: 111111n
voterA: 222222n
voterB: 333333n
voterC: 444444n
```

### 测试参数
```typescript
stateTreeDepth: 2
voteOptionTreeDepth: 2
batchSize: 5
maxVoteOptions: 5
```

## 文档链接

详细文档请参考：
- `docs/AMACI-ProcessMessages-Tests-Summary.md` - 测试总结
- `docs/AMACI-ProcessMessages-Analysis.md` - 电路分析
- `docs/AMACI-AddNewKey-Security-Analysis.md` - 安全分析
- `docs/Deactivate-Status-Detection-Tests.md` - 检测测试文档

## 贡献指南

添加新测试时：
1. 选择合适的测试文件（Integration/Security/EdgeCases/Sync）
2. 使用 describe/it 结构
3. 添加详细的 console.log 输出
4. 使用 utils 中的工具函数
5. 验证所有相关状态（activeStateTree, stateTree, deactivateTree）

## 支持

遇到问题？检查：
1. 是否在 packages/circuits 目录下
2. 是否安装了所有依赖 (`npm install`)
3. 是否编译了电路 (`npm run build`)
4. 查看测试输出中的详细日志

---

**注意**: 这些测试涵盖了我们讨论的所有关键设计决策和安全机制。运行这些测试可以确保 AMACI deactivation 功能的正确性和安全性。

