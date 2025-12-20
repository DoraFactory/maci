# AMACI ProcessMessages 全面测试套件总结

## 概述

本文档总结了为 AMACI ProcessMessages 电路创建的全面测试套件。这些测试涵盖了完整的生命周期、安全机制、边界情况以及 SDK 与电路的同步验证。

## 测试架构

```
AMACI ProcessMessages Test Suite
├── Part 1: 完整生命周期测试 (Integration)
│   ├── 标准投票流程
│   ├── Deactivate → AddNewKey 完整循环
│   ├── 多次 Deactivate/Reactivate 循环
│   └── 并发用户不同路径
│
├── Part 2: 安全机制验证 (Security)
│   ├── ActiveStateTree 电路验证
│   ├── 双重检查机制
│   ├── 防止 Operator 篡改
│   └── 防止消息跳过
│
├── Part 3: 边界情况测试 (Edge Cases)
│   ├── 无效消息生成奇数 c1/c2
│   ├── 奇数 d1/d2 账户被拒绝
│   ├── Nullifier 防重放
│   └── 链上数据同步
│
└── Part 4: SDK-电路同步验证 (Sync)
    ├── 状态树哈希一致性
    ├── ActiveStateTree 更新一致性
    ├── InputHash 计算一致性
    └── 完整流程端到端对比
```

## 测试文件清单

### 1. ProcessMessagesAmaciIntegration.test.ts

**路径**: `packages/circuits/ts/__tests__/ProcessMessagesAmaciIntegration.test.ts`

**测试内容**:
- **Test 1.1**: 标准投票流程（无 deactivate）
  - SignUp 3 个用户
  - 用户投票
  - ProcessMessages
  - 验证所有 activeStateTree 为 0，d1/d2 为 [0,0,0,0]

- **Test 1.2**: 完整 Deactivate → AddNewKey → Vote 循环
  - User A SignUp (stateIdx=0)
  - User A Vote
  - User A Deactivate
  - 验证 activeStateTree[0] != 0 (inactive)
  - ProcessDeactivateMessages
  - 验证 DeactivateTree 有偶数数据
  - User A AddNewKey (stateIdx=3, 新账户)
  - 验证 activeStateTree[3] == 0 (active)
  - 验证新 stateLeaf 有偶数 d1/d2
  - User A 用新密钥投票
  - 验证投票被接受

- **Test 1.3**: 多次 Deactivate/Reactivate 循环
  - User A: SignUp → Deactivate → AddNewKey → Deactivate → AddNewKey
  - 验证每步保持正确状态

- **Test 1.4**: 并发用户不同路径
  - User A: 标准投票（无 deactivate）
  - User B: 投票 → Deactivate
  - User C: 标准投票
  - 验证所有状态正确

**关键验证点**:
- ActiveStateTree 在 deactivate 后更新
- DeactivateTree 存储用于 AddNewKey 的数据
- AddNewKey 创建的新账户是 active 状态
- d1/d2 继承和验证机制

### 2. ProcessMessagesAmaciSecurity.test.ts

**路径**: `packages/circuits/ts/__tests__/ProcessMessagesAmaciSecurity.test.ts`

**测试内容**:
- **Test 2.1**: ActiveStateTree 电路验证
  - 验证 currentActiveState 在 currentActiveStateRoot 中存在
  - 验证 newActiveState 计算正确
  - 验证 Merkle proof
  - 尝试提供错误的 activeStateRoot → 电路失败

- **Test 2.2**: 双重检查机制
  - 场景 A: activeStateTree inactive, d1/d2 even → 被 activeStateTree 检查拒绝
  - 场景 B: activeStateTree active, d1/d2 odd → 被 d1/d2 检查拒绝
  - 场景 C: 两者都 active → 接受

- **Test 2.3**: 防止 Operator 篡改 activeStateTree
  - 用户已 deactivated
  - Operator 尝试伪造 activeStateLeaf = 0
  - 电路拒绝：Merkle proof 不匹配 activeStateRoot

- **Test 2.4**: 防止消息跳过
  - 提交 3 个 deactivate 消息
  - Operator 尝试只处理 2 个
  - 电路拒绝：batchStartHash/batchEndHash 不匹配

- **Test 2.5**: 综合安全属性
  - 完整流程中所有安全约束同时执行
  - 验证 Merkle proofs
  - 验证消息链完整性
  - 验证状态转换

**关键验证点**:
- 电路强制执行 Merkle proof 验证
- 双重检查机制防止绕过
- 消息哈希链防止跳过消息
- Operator 无法篡改关键数据

### 3. ProcessMessagesAmaciEdgeCases.test.ts

**路径**: `packages/circuits/ts/__tests__/ProcessMessagesAmaciEdgeCases.test.ts`

**测试内容**:
- **Test 3.1**: 无效消息生成奇数 c1/c2
  - 用户发送带错误签名的 deactivate 消息
  - Operator 处理：encryptOdevity(true) → 奇数 c1/c2
  - 验证：DeactivateTree 有奇数数据
  - 验证：activeStateTree 未更新（仍 active）

- **Test 3.2**: 奇数 d1/d2 账户被拒绝
  - 创建带奇数 d1/d2 的账户（模拟错误场景）
  - activeStateTree[idx] = 0 (active)
  - 用户尝试投票
  - 电路拒绝：decrypt(d1,d2) % 2 == 1
  - 测试所有组合的双重检查矩阵

- **Test 3.3**: Nullifier 防重放
  - User A AddNewKey with nullifier_1
  - 尝试再次用相同 nullifier_1 AddNewKey
  - 合约拒绝（已使用）

- **Test 3.4**: 链上数据同步
  - 手动设置带奇数 d1/d2 的 stateLeaf
  - activeStateTree[idx] = 0
  - 投票被 d1/d2 检查拒绝
  - 演示 d1/d2 检查的防御作用

- **Test 3.5**: 空消息和填充
  - 提交少于 batchSize 的消息
  - 验证空消息作为填充正确处理

**关键验证点**:
- 无效消息不更新 activeStateTree
- 奇数 d1/d2 总是被拒绝
- Nullifier 防止重用 deactivate 数据
- d1/d2 检查捕获损坏的链上数据

### 4. ProcessMessagesAmaciSync.test.ts

**路径**: `packages/circuits/ts/__tests__/ProcessMessagesAmaciSync.test.ts`

**测试内容**:
- **Test 4.1**: 状态树哈希一致性
  - 测试场景 1: 初始 SignUp (d1,d2 = [0,0,0,0])
  - 测试场景 2: AddNewKey (偶数 d1/d2)
  - 测试场景 3: 奇数 d1/d2
  - SDK 和电路产生相同的 stateLeafHash
  - 验证双层 Poseidon 哈希

- **Test 4.2**: ActiveStateTree 更新一致性
  - SDK 处理 deactivate
  - 电路处理 deactivate
  - 比较：activeStateRoot, newActiveState 值
  - 验证 genStaticRandomKey 产生一致结果

- **Test 4.3**: InputHash 计算一致性
  - SDK 计算 inputHash（7 个字段，包含 deactivateCommitment）
  - 电路计算 inputHash
  - 比较：必须完全匹配
  - 验证 deactivateCommitment = hash(activeStateRoot, deactivateRoot)

- **Test 4.4**: 完整流程端到端对比
  - 检查点 1: SignUp
  - 检查点 2: Vote
  - 检查点 3: Deactivate
  - 检查点 4: AddNewKey
  - 检查点 5: 用新密钥投票
  - 在每个检查点比较所有根值

**关键验证点**:
- SDK 和电路使用相同的哈希算法
- ActiveStateTree 更新逻辑一致
- AMACI 特有的 7 字段 inputHash 正确
- 所有状态转换在 SDK 和电路间同步

## 测试工具函数

**路径**: `packages/circuits/ts/__tests__/utils/utils.ts`

新增的测试工具函数：

1. **createAccountWithOddD1D2**: 创建带奇数 d1/d2 的账户（边界测试）
2. **verifyDualCheck**: 验证双重检查机制
3. **verifyMerkleProof**: 验证 Merkle proof
4. **generateTestAccounts**: 生成测试账户
5. **calculateStateLeafHash**: 计算 AMACI 双层 Poseidon 哈希
6. **isDeactivated**: 检查 d1/d2 解密是否为奇数
7. **genStaticRandomKey**: 生成静态随机密钥
8. **testScenarios**: 标准测试场景配置
9. **standardTestAccounts**: 标准测试账户

## 更新的现有测试

**路径**: `packages/circuits/ts/__tests__/ProcessMessagesAmaci.test.ts`

新增 Part 5：Deactivation Mechanism Tests - Quick Reference

包含：
- 对扩展测试套件的引用
- ActiveStateTree 是 AMACI 独有的验证
- 双重检查机制的说明
- d1/d2 存储目的的解释
- 正常操作预期的澄清

## 测试覆盖的关键安全点

### 1. 双重检查机制
- **Check 1**: ActiveStateTree[idx] == 0 ? (快速检查)
- **Check 2**: decrypt(d1, d2) % 2 == 0 ? (隐私检查)
- 两者都必须通过才能投票

### 2. ActiveStateTree 更新逻辑
- 由 ProcessDeactivateMessages 更新
- 使用 genStaticRandomKey(privKey, salt=20040n, newActiveState[i])
- newActiveState[i] 是递增序列号
- 每次 deactivate 生成唯一的非零值

### 3. d1/d2 的作用
- **隐私**: ElGamal 加密，外部无法判断奇偶
- **唯一性**: ECDH sharedKey 绑定特定 voter
- **防御**: 捕获损坏的链上数据
- **继承**: AddNewKey 继承偶数 d1/d2

### 4. 安全属性
- Operator 不能篡改 activeStateTree（Merkle proof 验证）
- Operator 不能跳过消息（哈希链验证）
- 无法重用他人的 deactivate 数据（ECDH + Nullifier）
- 电路强制执行所有约束

## 正常操作流程

### 场景 1: 标准投票（无 deactivate）
```
SignUp → Vote → ProcessMessages
- d1, d2 始终 [0,0,0,0] (偶数)
- activeStateTree[idx] 始终 0 (active)
```

### 场景 2: Deactivate → AddNewKey
```
SignUp → Vote → Deactivate → ProcessDeactivate → AddNewKey → Vote
1. Deactivate: activeStateTree[idx] = randomKey (非零)
2. DeactivateTree: 存储 encryptOdevity(false) (偶数)
3. AddNewKey: 新账户继承偶数 d1/d2
4. 新账户: activeStateTree[newIdx] = 0 (active)
```

### 无效场景（应被拒绝）
```
Invalid Deactivate (错误签名)
- DeactivateTree: encryptOdevity(true) (奇数)
- activeStateTree 不更新
- 无法用于 AddNewKey
```

## 术语澄清

- **Active**: activeStateTree[idx] == 0, 可以投票
- **Inactive**: activeStateTree[idx] != 0, 已 deactivate，不能投票
- **Deactivated**: decrypt(d1,d2) % 2 == 1, 数据损坏，被拒绝

正常情况下只有 active ↔ inactive 转换，deactivated 状态只在数据损坏时出现。

## 运行测试

### 运行单个测试套件
```bash
cd packages/circuits

# 集成测试
npm test -- ProcessMessagesAmaciIntegration.test.ts

# 安全测试
npm test -- ProcessMessagesAmaciSecurity.test.ts

# 边界情况测试
npm test -- ProcessMessagesAmaciEdgeCases.test.ts

# 同步验证测试
npm test -- ProcessMessagesAmaciSync.test.ts
```

### 运行所有 AMACI 测试
```bash
npm test -- ProcessMessagesAmaci
```

### 运行 Deactivation 相关测试
```bash
npm test -- Deactivate
```

## 测试统计

- **测试文件**: 5 个（包括更新的现有文件）
- **测试用例**: ~30+ 个
- **代码行数**: ~2500+ 行
- **覆盖的场景**: 15+ 个主要场景
- **工具函数**: 9 个新增工具函数

## 文档参考

相关文档：
1. `AMACI-ProcessMessages-Analysis.md` - ProcessMessages 电路详细分析
2. `AMACI-Tree-Structure-Analysis.md` - 树结构和 Merkle 证明分析
3. `AMACI-Deactivate-Detection-Flow.md` - Deactivation 检测流程
4. `AMACI-AddNewKey-Security-Analysis.md` - AddNewKey 安全分析
5. `AMACI-AddNewKey-State-Transition.md` - AddNewKey 状态转换
6. `Deactivate-Status-Detection-Tests.md` - Deactivation 状态检测测试文档

## 总结

这个全面的测试套件确保了 AMACI ProcessMessages 电路的：
- ✅ 功能正确性
- ✅ 安全性
- ✅ 边界情况处理
- ✅ SDK-电路一致性
- ✅ 所有讨论的设计细节都经过验证

所有测试都遵循了我们在讨论中提出的安全机制和设计决策，为 AMACI 的 deactivation 功能提供了完整的测试覆盖。

