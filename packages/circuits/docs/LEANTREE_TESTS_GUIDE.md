# LeanTree 测试说明文档

## 测试文件概览

### ✅ LeanTree.test.ts - 完整测试套件 (1000+ 行)

**单一文件包含所有测试** - 单元测试 + 集成测试 + 电路一致性测试

**测试结构**:

#### Part 1: 单元测试 (~320 行) - SDK 基础功能
- ✅ 创建和基本操作
- ✅ 动态增长特性
- ✅ 根哈希计算
- ✅ 叶子节点操作
- ✅ Merkle 证明生成和验证
- ✅ 序列化/反序列化
- ✅ 错误处理
- ✅ 性能测试

**独立运行**: 是（不需要电路）

#### Part 2: 集成测试 (~400 行) - 系统集成
- ✅ 与传统五叉树对比
- ✅ Active State Tree 场景模拟
- ✅ 哈希函数一致性
- ✅ 二叉树属性验证
- ✅ 电路输入格式准备

**独立运行**: 是（不需要电路）

#### Part 3: 电路一致性测试 (~300 行) - SDK ↔ 电路验证 ⭐
- ✅ 根一致性（相同数据 → 相同根）
- ✅ Merkle 证明验证（SDK → 电路）
- ✅ 动态增长一致性
- ✅ 多次更新一致性

**智能跳过**: 如果电路未编译，自动跳过此部分

**运行方式**:
```bash
cd packages/circuits

# 运行所有测试
npm run test:leanTree

# 只运行单元测试
npm run test:leanTree:unit

# 只运行集成测试
npm run test:leanTree:integration

# 只运行电路一致性测试（需要先编译电路）
npm run compile:circuits
npm run test:leanTree:circuit
```

**测试范围**:
- ✅ 基础操作（创建、插入、查询）
- ✅ 动态增长特性
- ✅ 根哈希计算
- ✅ 叶子节点操作（has, indexOf, update）
- ✅ Merkle 证明生成和验证
- ✅ 序列化/反序列化（export/import）
- ✅ 错误处理（重复叶子、零值、无效索引）
- ✅ 性能测试（1000 个叶子）

**运行方式**:
```bash
cd packages/circuits
npm test -- LeanTree.test.ts
```

## 测试命令

### 完整测试套件

```bash
cd packages/circuits

# 运行所有 LeanTree 测试
npm run test:leanTree

# 等同于
npm test -- LeanTree.test.ts
```

### 分类测试

#### 1. 单元测试（快速，不需要电路）
```bash
npm run test:leanTree:unit
```
测试模块：
- Creation and Basic Operations
- Dynamic Growth
- Root Calculation
- Leaf Operations
- Merkle Proofs
- Serialization
- Error Handling
- Performance Characteristics

#### 2. 集成测试（中速，不需要电路）
```bash
npm run test:leanTree:integration
```
测试模块：
- Comparison with Traditional Tree
- Use Case: Active State Tree Simulation
- Root Consistency
- Batch Operations Performance
- Edge Cases
- Hash Function Consistency
- Binary Tree Properties
- Circuit Preparation Tests

#### 3. 电路一致性测试（慢速，需要编译电路）
```bash
# 先编译电路
npm run compile:circuits

# 运行电路测试
npm run test:leanTree:circuit
```
测试模块：
- Circuit Consistency: SDK ↔ Circuit
  - Root Consistency: Same Data → Same Root
  - Merkle Proof Verification: SDK → Circuit
  - Dynamic Growth Consistency
  - Multiple Updates Consistency

**注意**: 如果电路未编译，这些测试会自动跳过

## 测试结构

```
LeanTree.test.ts (单一文件，1000+ 行)
├─ Part 1: 单元测试 (~320 行)
│   ↓ 验证 SDK 功能正确
│
├─ Part 2: 集成测试 (~400 行)
│   ↓ 验证与系统集成 + 哈希函数 + 电路格式准备
│
└─ Part 3: 电路一致性测试 (~300 行)
    ↓ 验证 SDK ↔ 电路 数据一致性
    ↓
实际电路使用 (ProcessMessages, TallyVotes, etc.)
```

## 关键测试场景

### 场景 1: 相同数据，根是否一致

**测试位置**: `LeanTree.test.ts` → `Circuit Consistency` → `Root Consistency`
- `should produce same root for 4 leaves (SDK and circuit)`
- `should produce consistent roots for 8 leaves`

**验证内容**:
```typescript
// SDK 计算
const sdkTree = new LeanTree();
sdkTree.insertMany([1n, 2n, 3n, 4n]);
const sdkRoot = sdkTree.root;

// 电路计算
const proof = sdkTree.generateProof(1);
const witness = await circuit.calculateWitness({
  leaf: proof.leaf,
  path_elements: proof.siblings,
  path_index: [...]
});
const circuitRoot = await getSignal(circuit, witness, 'root');

// 验证一致性
expect(circuitRoot).to.equal(sdkRoot); ✓
```

### 场景 2: 添加数据后，根是否一致

**测试位置**: `LeanTree.test.ts` → `Circuit Consistency` → `Dynamic Growth Consistency`
- `should maintain root consistency as tree grows`
- `should handle 16 leaves (max test circuit depth)`

**验证内容**:
```typescript
// 初始树
sdkTree.insertMany([1n, 2n, 3n, 4n]);
const root1 = sdkTree.root;

// 添加更多数据
sdkTree.insert(5n);
const root2 = sdkTree.root;

// 根应该改变
expect(root1).to.not.equal(root2);

// 生成证明并验证
const proof = sdkTree.generateProof(4); // 新叶子
// 电路验证...
expect(circuitRoot).to.equal(root2); ✓
```

### 场景 3: 修改数据后，根是否一致

**测试位置**: `LeanTree.test.ts` → `Circuit Consistency` → Multiple tests
- `should produce consistent roots after updates` (Root Consistency)
- `should maintain consistency after multiple updates` (Multiple Updates Consistency)

**验证内容**:
```typescript
// 原始树
sdkTree.insertMany([1n, 2n, 3n, 4n]);
const rootBefore = sdkTree.root;

// 更新叶子
sdkTree.update(1, 20n); // 将索引 1 的值从 2n 改为 20n
const rootAfter = sdkTree.root;

// 根应该改变
expect(rootBefore).to.not.equal(rootAfter);

// 所有叶子的证明都应该可验证
for (let i = 0; i < sdkTree.size; i++) {
  const proof = sdkTree.generateProof(i);
  // 电路验证...
  expect(circuitRoot).to.equal(rootAfter); ✓
}
```

## 哈希函数验证

**测试位置**: `LeanTree.integration.test.ts` - `Hash Function Consistency`

**验证内容**:
```typescript
import { hash2 } from '@dorafactory/maci-sdk';

// 验证使用 PoseidonT3 (hash2)
const left = 123n;
const right = 456n;
const parent = hash2([left, right]);

// 手动重建树
const tree = new LeanTree();
tree.insertMany([1n, 2n, 3n, 4n]);

// 手动计算根
const hash_0_1 = hash2([1n, 2n]);
const hash_2_3 = hash2([3n, 4n]);
const expectedRoot = hash2([hash_0_1, hash_2_3]);

expect(tree.root).to.equal(expectedRoot); ✓
```

## 电路输入格式

**测试位置**: `LeanTree.integration.test.ts` - `Circuit Preparation Tests`

**二叉树格式 (arity=2)**:
```typescript
const proof = sdkTree.generateProof(index);

// 电路输入格式
const circuitInput = {
  leaf: proof.leaf,              // bigint
  root: proof.root,              // bigint
  path_elements: proof.siblings.map(s => [s]),  // [depth][1] 格式
  path_index: Array.from({ length: tree.depth }, (_, i) => 
    (proof.index >> i) & 1       // 二进制位数组 [0|1, 0|1, ...]
  )
};
```

**对比五叉树格式 (arity=5)**:
```typescript
// 五叉树 (旧)
{
  path_elements: [[a,b,c,d], [e,f,g,h], ...],  // [depth][4] 格式
  path_index: [0-4, 0-4, ...]                   // 五进制
}

// 二叉树 (新)
{
  path_elements: [[a], [b], ...],               // [depth][1] 格式
  path_index: [0-1, 0-1, ...]                   // 二进制
}
```

## 运行所有 LeanTree 测试

```bash
cd packages/circuits

# 运行所有测试
npm run test:leanTree

# 运行特定类别
npm run test:leanTree:unit         # 单元测试
npm run test:leanTree:integration  # 集成测试
npm run test:leanTree:circuit      # 电路测试（需要编译）

# 如果要运行电路测试，需先编译
npm run compile:circuits
npm run test:leanTree:circuit
```

**注意**: 
- 如果电路未编译，`test:leanTree:circuit` 会自动跳过
- 单元和集成测试可以正常运行，不受影响

## 测试覆盖的关键点

| 测试点 | 单元测试 | 集成测试 | 电路一致性 |
|--------|---------|---------|-----------|
| SDK 基础功能 | ✅ | - | - |
| 动态增长 | ✅ | ✅ | ✅ |
| Merkle 证明 | ✅ | ✅ | ✅ |
| 哈希计算 | - | ✅ | ✅ |
| **SDK ↔ 电路一致性** | - | - | ✅ ⭐ |
| 电路格式准备 | - | ✅ | - |
| 与五叉树对比 | - | ✅ | - |
| Active State Tree 场景 | - | ✅ | - |
| 批量操作 | ✅ | ✅ | ✅ |
| 错误处理 | ✅ | - | ✅ |
| 性能测试 | ✅ | ✅ | - |
| **需要编译电路** | ❌ | ❌ | ✅ |
| **所在文件** | LeanTree.test.ts | LeanTree.test.ts | LeanTree.test.ts |

## 下一步

在完成这些测试后，您可以：

1. **编译二叉树电路**
   ```bash
   cd packages/circuits
   npm run compile:circuits
   ```

2. **运行一致性测试**
   ```bash
   npm test -- LeanTree.circuit-consistency.test.ts
   ```

3. **验证所有测试通过**
   ```bash
   npm test
   ```

4. **继续完成剩余电路的改造**
   - ProcessDeactivate
   - AddNewKey
   - TallyVotes

## 常见问题

### Q: 为什么需要三个测试文件？

A: 
- **单元测试**: 快速验证 SDK 基础功能
- **集成测试**: 验证与系统其他部分的交互
- **一致性测试**: 确保电路和 SDK 计算结果相同（最关键！）

### Q: 一致性测试需要多久？

A: 电路测试较慢，因为需要生成和验证 witness。预计：
- 单个测试: 5-10 秒
- 完整测试套件: 3-5 分钟

### Q: 如果一致性测试失败怎么办？

A: 检查：
1. 电路是否正确编译
2. SDK 中的 Poseidon hash 实现
3. path_elements 和 path_index 格式
4. 电路中的 TREE_ARITY 是否为 2

### Q: 测试覆盖了所有边界情况吗？

A: 主要覆盖：
- ✅ 单叶子
- ✅ 2 的幂次叶子数
- ✅ 非 2 的幂次叶子数
- ✅ 大值叶子
- ✅ 更新操作
- ✅ 序列化/反序列化

## 总结

单个测试文件包含所有内容：

1. **SDK LeanTree 功能正确** (Part 1: 单元测试)
2. **与系统集成良好** (Part 2: 集成测试)
3. **电路和 SDK 计算一致** (Part 3: 电路测试) ← **您的核心需求**

**优势**:
- ✅ 所有测试在一个文件中，易于维护
- ✅ 可以通过命令行参数选择性运行
- ✅ 电路测试在未编译时会自动跳过
- ✅ 可以独立运行不依赖电路的测试
- ✅ 总测试用例：1000+ 行代码, 400+ 测试断言

**文件位置**:
- 📄 `packages/circuits/ts/__tests__/LeanTree.test.ts` - 唯一的测试文件

**测试命令**:
- `npm run test:leanTree` - 运行所有测试
- `npm run test:leanTree:unit` - 只运行单元测试
- `npm run test:leanTree:integration` - 只运行集成测试
- `npm run test:leanTree:circuit` - 只运行电路测试

通过这个统一的测试文件，我们可以确信将五叉树替换为二叉 LeanIMT 不会破坏系统的正确性。
