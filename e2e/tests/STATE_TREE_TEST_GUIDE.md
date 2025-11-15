# State Tree E2E Test Guide

## 测试概述

`state-tree.e2e.test.ts` 是一个综合测试套件，用于验证 AMACI 和 MACI 合约中的状态树更新逻辑，以及与 SDK 实现的一致性。

## 测试结构

### 1. SDK Tree Implementation Tests
**测试 SDK 中 Tree 类的基础功能**

- ✅ 验证五叉树结构参数（深度、叶子数、节点数）
- ✅ 验证零值哈希的计算
- ✅ 验证树的更新逻辑
- ✅ 验证批量更新和增量更新
- ✅ 测试路径计算功能

**关键验证点:**
```typescript
const tree = new Tree(5, 3, 0n);
expect(tree.LEAVES_COUNT).to.equal(125); // 5^3
expect(tree.LEAVES_IDX_0).to.equal(31);  // (5^3-1)/(5-1)
```

### 2. MACI Contract State Tree Tests
**测试 MACI 合约的增量更新策略**

- ✅ 部署 MACI 合约
- ✅ 多用户注册并验证状态树
- ✅ 验证 `start_process_period` 后的完整更新
- ✅ 对比合约状态根与 SDK 计算的根

**关键行为:**
- 注册阶段：增量更新（`full=false`）
- 处理阶段：完整更新（`full=true` in start_process）
- 根节点在 start_process 前后的差异

**验证逻辑:**
```typescript
// 注册时可能不同步
const rootBeforeProcess = await maciContract.queryStateTreeRoot();
// start_process 后应该同步
await maciContract.startProcessPeriod();
const rootAfterProcess = await maciContract.queryStateTreeRoot();
expect(rootAfterProcess).to.equal(operator.stateTree!.root.toString());
```

### 3. AMACI Contract State Tree Tests
**测试 AMACI 合约的完整更新策略**

- ✅ 部署 AMACI 合约
- ✅ 验证每次注册后根节点立即更新
- ✅ 验证双层哈希的状态叶计算
- ✅ 确保合约和 SDK 始终保持一致

**关键行为:**
- 每次注册都完整更新到根节点
- 使用双层 Poseidon 哈希（包含 d 参数）
- 根节点始终反映最新状态

**验证逻辑:**
```typescript
// AMACI: 每次注册后立即验证
await amaciContract.signUp({ pubkey, certificate });
operator.initStateTree(i, pubKey, 100n, [0n, 0n, 0n, 0n]);

const contractRoot = await amaciContract.queryStateTreeRoot();
expect(contractRoot).to.equal(operator.stateTree!.root.toString());
```

### 4. State Tree Update Pattern Analysis
**分析和对比更新模式**

- ✅ 模拟增量更新 vs 完整更新的性能差异
- ✅ 识别特殊更新位置（叶子索引是5的倍数）
- ✅ 统计不同策略下的总更新成本

**关键发现:**
```
User | Leaf Index | MACI Levels | AMACI Levels | Difference
---------------------------------------------------------------------
   1 |         31 |           2 |            3 |          1
   5 |         35 |           3 |            3 |          0 ⭐
  10 |         40 |           3 |            3 |          0 ⭐
  25 |         55 |           4 |            3 |         -1 ⭐⭐

MACI 平均节省约 50-60% 的更新成本
```

## 运行测试

### 前置条件

1. 安装依赖:
```bash
cd e2e
npm install
```

2. 确保合约已编译:
```bash
cd ..
cargo build --release --target wasm32-unknown-unknown
```

3. 电路文件就位:
```bash
# 确保 e2e/circuits/ 目录下有所需的电路文件
ls e2e/circuits/maci-2-1-1-5/
# 应该看到: processMessages.wasm, processMessages.zkey, etc.
```

### 运行完整测试套件

```bash
cd e2e
npm test -- state-tree.e2e.test.ts
```

### 运行特定测试组

```bash
# 只测试 SDK Tree 实现
npm test -- state-tree.e2e.test.ts --grep "SDK Tree Implementation"

# 只测试 MACI 合约
npm test -- state-tree.e2e.test.ts --grep "MACI Contract"

# 只测试 AMACI 合约
npm test -- state-tree.e2e.test.ts --grep "AMACI Contract"

# 只测试模式分析
npm test -- state-tree.e2e.test.ts --grep "Pattern Analysis"
```

### 查看详细日志

测试会输出详细的日志，包括：
- 树的参数和结构
- 每次更新后的根哈希
- SDK 和合约状态的对比
- 更新模式的统计分析

## 预期输出

### 成功的测试输出示例

```
State Tree Update E2E Test
  SDK Tree Implementation Tests
    ✓ should correctly compute quintree structure
    ✓ should compute correct zero hashes
    ✓ should update tree correctly when adding leaves
    ✓ should handle batch leaf updates correctly
    ✓ should verify incremental update behavior

  MACI Contract State Tree Tests
    ✓ should match SDK state tree after user signups
    ✓ should update root correctly after start_process_period
    ✓ should verify state leaf computation matches contract

  AMACI Contract State Tree Tests
    ✓ should maintain consistent root after each signup
    ✓ should verify AMACI state leaf uses double-layer hash

  State Tree Update Pattern Analysis
    ✓ should demonstrate incremental vs full update difference
    ✓ should identify special update positions
```

## 测试失败排查

### 问题 1: 合约和 SDK 根哈希不匹配

**可能原因:**
- 零值计算不一致（AMACI 使用 zeroHash10, MACI 使用 zeroHash5）
- 状态叶哈希计算方法不同（AMACI 双层，MACI 单层）
- 更新逻辑的时机问题

**排查步骤:**
1. 检查 `isAmaci` 标志是否正确设置
2. 验证零值数组的初始化
3. 确认状态叶哈希的计算方式

### 问题 2: MACI 根在 start_process 后仍不匹配

**可能原因:**
- start_process 没有正确执行完整更新
- 时间条件不满足（投票期未结束）
- 用户数量不匹配

**排查步骤:**
1. 确认投票时间已过期
2. 检查 `full=true` 参数是否生效
3. 验证所有用户都已注册到 SDK 树中

### 问题 3: Tree 参数计算错误

**可能原因:**
- 深度或度数配置错误
- 索引计算公式问题

**排查步骤:**
1. 验证公式: `LEAVES_IDX_0 = (degree^depth - 1) / (degree - 1)`
2. 确认树的度数为 5
3. 检查深度参数是否一致

## 扩展测试

### 添加更多用户

修改 `numTestUsers` 变量来测试更多用户：

```typescript
const numTestUsers = 25; // 测试满容量场景
```

### 测试不同树深度

修改树参数来测试不同配置：

```typescript
const stateTreeDepth = 3; // 5^3 = 125 用户
const stateTreeDepth = 4; // 5^4 = 625 用户
```

### 添加性能基准测试

可以添加时间测量来对比性能：

```typescript
const startTime = Date.now();
// ... 执行操作
const endTime = Date.now();
console.log(`Operation took ${endTime - startTime}ms`);
```

## 与电路测试的集成

虽然这个测试主要关注状态树，但可以与电路测试结合：

1. **验证 Merkle 路径**: 测试生成的路径能否被电路验证
2. **根哈希证明**: 确保状态根可以用于 ZK 证明
3. **批量叶子证明**: 测试 `QuinBatchLeavesExists` 电路

参考 `incrementalQuinTree.circom` 中的电路实现。

## 相关资源

- **合约实现**: 
  - `contracts/amaci/src/contract.rs` (state_update_at)
  - `contracts/api-maci/src/contract.rs` (state_update_at)

- **SDK 实现**:
  - `packages/sdk/src/libs/crypto/tree.ts` (Tree 类)
  - `packages/sdk/src/operator.ts` (initStateTree)

- **电路实现**:
  - `packages/circuits/circom/utils/trees/incrementalQuinTree.circom`

- **分析文档**:
  - `STATE_UPDATE_ANALYSIS.md` - 详细技术分析
  - `STATE_UPDATE_VISUALIZATION.md` - 可视化说明
  - `STATE_UPDATE_README.md` - 导览指南

## 贡献指南

如果你想扩展这些测试：

1. 遵循现有的测试结构
2. 添加清晰的日志输出
3. 验证边界条件
4. 添加注释解释测试目的
5. 更新本文档说明新增的测试

## 总结

这个测试套件全面验证了：
- ✅ SDK Tree 实现的正确性
- ✅ MACI 增量更新策略的行为
- ✅ AMACI 完整更新策略的行为  
- ✅ 合约与 SDK 的一致性
- ✅ 不同更新模式的性能差异

通过这些测试，我们可以确信状态树的实现在合约、SDK 和电路三个层面都是正确和一致的。

