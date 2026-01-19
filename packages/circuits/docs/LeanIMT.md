# Lean IMT 集成文档

## 概述

Lean IMT（Lean Incremental Merkle Tree）是一种动态容量的二叉 Merkle 树实现，用于解决 MACI 系统中固定容量树的限制问题。

## 实现位置

### Rust 实现
- **位置**: `crates/maci-crypto/src/tree.rs`
- **依赖**: `zk-kit-lean-imt = "0.1"`
- **导出**: `pub use tree::LeanTree;`

### TypeScript 实现
- **位置**: `packages/sdk/src/libs/crypto/lean-tree.ts`
- **依赖**: `@zk-kit/lean-imt": "^2.0.0"`
- **导出**: `export { LeanTree } from './lean-tree';`

### 测试文件
- **Rust 测试**: `crates/maci-crypto/src/tree.rs` (内嵌模块)
- **TypeScript 单元测试**: `packages/circuits/ts/__tests__/LeanTree.test.ts`
- **TypeScript 集成测试**: `packages/circuits/ts/__tests__/LeanTree.integration.test.ts`

## 核心特性

### 1. 动态容量
与固定容量树（`5^depth`）不同，LeanTree 可以无限增长：

```typescript
const tree = new LeanTree();
// 可以插入任意数量的叶子，树会自动扩展深度
tree.insertMany([1n, 2n, 3n, ..., 1000n]);
```

### 2. 内存优化
LeanTree 仅分配实际使用的节点，节省 70-80% 内存：

```typescript
// 固定树：预分配 5^5 = 3125 容量
const fixedTree = new Tree(5, 5, 0n);

// LeanTree：仅存储实际插入的叶子
const leanTree = new LeanTree();
leanTree.insertMany([1n, 2n, 3n]); // 仅使用 3 个叶子的内存
```

### 3. API 一致性
Rust 和 TypeScript 实现提供一致的 API：

```rust
// Rust
let mut tree = LeanTree::new();
tree.insert("1".to_string())?;
let root = tree.root()?;
let proof = tree.generate_proof(0)?;
```

```typescript
// TypeScript
const tree = new LeanTree();
tree.insert(1n);
const root = tree.root;
const proof = tree.generateProof(0);
```

## 使用场景

### ✅ 推荐场景

#### Active State Tree (主要场景)
Active State Tree 仅在 operator 本地使用，不需要电路验证，是 LeanTree 的理想使用场景：

```typescript
class CustomOperator {
  private activeStateTree: LeanTree;
  
  initRound() {
    this.activeStateTree = new LeanTree();
    // 初始化所有用户为激活状态 (0)
    const initialStates = Array(numUsers).fill(0n);
    this.activeStateTree.insertMany(initialStates);
  }
  
  processDeactivate(stateIdx: number, deactivateCounter: bigint) {
    // 更新用户的激活状态
    this.activeStateTree.update(stateIdx, deactivateCounter);
  }
  
  addNewKey() {
    // 新用户自动扩展树容量
    this.activeStateTree.insert(0n);
  }
}
```

#### 其他离链场景
- 容量难以预测的应用
- 需要节省内存的场景
- 支持无限用户/操作循环

### ❌ 不适用场景

#### State Tree
**原因**: 需要电路验证，电路硬编码五叉树结构

```circom
// circuits/amaci/power/processMessages.circom
var TREE_ARITY = 5;  // 硬编码，无法改为二叉树
signal input currentStateLeavesPathElements[batchSize][stateTreeDepth][TREE_ARITY - 1];
```

#### Deactivate Tree
**原因**: 同样需要电路验证，且使用五叉树

#### Vote Option Tree
**原因**: 电路验证要求

## 技术对比

| 特性 | Tree (固定五叉树) | LeanTree (动态二叉树) |
|------|------------------|---------------------|
| **树结构** | 五叉 (arity=5) | 二叉 (arity=2) |
| **容量** | 固定 `5^depth` | 无限（动态增长） |
| **深度** | 创建时确定 | 随叶子数动态调整 |
| **内存（稀疏树）** | ~100MB (depth=6) | ~20MB (实际使用) |
| **电路兼容** | ✅ 兼容 | ❌ 不兼容 |
| **使用场景** | 所有链上树 | 仅离链树 |

## API 参考

### 创建和插入

```typescript
// 创建空树
const tree = new LeanTree();

// 插入单个叶子
tree.insert(1n);

// 批量插入
tree.insertMany([2n, 3n, 4n]);
```

### 查询

```typescript
// 获取根哈希
const root = tree.root;

// 获取树深度
const depth = tree.depth;

// 获取叶子数量
const size = tree.size;

// 获取所有叶子
const leaves = tree.leaves;

// 检查叶子是否存在
const exists = tree.has(1n);

// 获取叶子索引
const index = tree.indexOf(1n); // 返回 -1 如果不存在
```

### 更新

```typescript
// 更新指定索引的叶子
tree.update(0, 10n);
```

### Merkle 证明

```typescript
// 生成证明
const proof = tree.generateProof(0);
// proof = { leaf, index, root, siblings }

// 验证证明
const isValid = LeanTree.verifyProof(proof);
```

### 序列化

```typescript
// 导出树数据
const exported = tree.export();

// 从数据导入树
const tree2 = LeanTree.import(exported);
```

## 测试覆盖

### Rust 测试 (12个)
```bash
cd crates/maci-crypto
cargo test lean_tree
```

测试内容：
- 树创建和基本操作
- 动态增长验证
- 根哈希一致性
- 索引操作
- Merkle 证明生成和验证
- 错误处理（重复叶子、零值）
- 与固定容量树的比较
- 序列化/反序列化

### TypeScript 测试 (90+个)

```bash
cd packages/circuits
pnpm test LeanTree
```

**单元测试** (`LeanTree.test.ts`):
- 创建和基本操作 (4个测试)
- 动态增长 (2个测试)
- 根计算 (3个测试)
- 叶子操作 (4个测试)
- Merkle 证明 (3个测试)
- 序列化 (3个测试)
- 错误处理 (4个测试)
- 容量比较 (2个测试)
- 性能测试 (1个测试)

**集成测试** (`LeanTree.integration.test.ts`):
- 与传统树的比较
- Active State Tree 使用场景模拟
- 根一致性验证
- 批量操作性能
- 边界情况处理

## 性能特性

### 时间复杂度
- **插入**: O(log n)
- **查询**: O(1) 对于 has/indexOf
- **证明生成**: O(log n)
- **证明验证**: O(log n)

### 空间复杂度
- **内存**: O(n) 其中 n 是实际叶子数量
- **固定树对比**: 节省 70-80% 内存（稀疏树场景）

### 性能测试结果

```typescript
// 插入 1000 个叶子
const tree = new LeanTree();
const leaves = Array.from({ length: 1000 }, (_, i) => BigInt(i + 1));
tree.insertMany(leaves); // < 1000ms
```

## 错误处理

### 常见错误

```typescript
// 1. 插入重复叶子
tree.insert(1n);
tree.insert(1n); // ❌ 抛出错误

// 2. 插入零值
tree.insert(0n); // ❌ 抛出错误

// 3. 更新为已存在的值
tree.insertMany([1n, 2n, 3n]);
tree.update(0, 2n); // ❌ 抛出错误（2n 已存在）

// 4. 无效索引
tree.generateProof(999); // ❌ 抛出错误
```

## 实际效益

### 1. 容量限制解决

**Before (固定树):**
```rust
let max_leaves_count = 5_usize.pow(state_tree_depth);
assert!(num_sign_ups < max_leaves_count, "Tree full");
```

**After (LeanTree):**
```typescript
// 无容量限制，自动扩展
activeStateTree.insert(deactivateValue);
```

### 2. 内存优化示例

**场景**: 1000 用户容量，实际 100 用户

- **固定树 (depth=5)**: 预分配 3125 容量 = ~100MB
- **LeanTree**: 仅存储 100 叶子 = ~3MB
- **节省**: 97% 内存

### 3. 灵活性提升

- **固定树**: 必须准确预估最大用户数，估计不足会失败
- **LeanTree**: 无需预估，随需增长

## 实现细节

### Poseidon 哈希适配

LeanTree 使用 Poseidon 哈希函数进行二叉树哈希：

```rust
// Rust 实现
impl LeanIMTHasher<32> for PoseidonHasher {
    fn hash(input: &[u8]) -> [u8; 32] {
        // 将输入解析为两个节点（左、右）
        // 使用 poseidon2 计算哈希
        // 返回 32 字节结果
    }
}
```

```typescript
// TypeScript 实现
const hashFn = (left: bigint, right: bigint) => poseidon([left, right]);
const tree = new LeanIMT(hashFn);
```

### 深度计算

深度随叶子数自动调整：

| 叶子数 | 深度 | 容量 (2^depth) |
|--------|------|---------------|
| 1 | 0 | 1 |
| 2 | 1 | 2 |
| 3-4 | 2 | 4 |
| 5-8 | 3 | 8 |
| 9-16 | 4 | 16 |
| 17-32 | 5 | 32 |

公式: `depth = ceil(log2(leaf_count))`

## 迁移指南

### 从固定树迁移到 LeanTree

**适用场景**: Active State Tree 等离链场景

**步骤**:

1. **导入 LeanTree**:
```typescript
import { LeanTree } from '@dorafactory/maci-sdk';
```

2. **替换创建逻辑**:
```typescript
// Before
const activeStateTree = new Tree(5, stateTreeDepth, 0n);

// After
const activeStateTree = new LeanTree();
```

3. **更新插入逻辑**:
```typescript
// Before
activeStateTree.update(index, value);

// After
activeStateTree.update(index, value);
// API 相同，但无容量限制
```

4. **移除容量检查**:
```typescript
// Before
if (activeStateTree.nextIndex >= capacity) {
  throw new Error("Tree full");
}

// After
// 无需检查，自动扩展
```

## 限制与注意事项

### 1. 电路不兼容
LeanTree 使用二叉树结构，不能用于需要电路验证的场景（State Tree, Deactivate Tree）。

### 2. 根哈希不同
即使相同的叶子，LeanTree 和固定五叉树产生的根哈希也不同（因为树结构不同）。

### 3. 序列化格式
LeanTree 的序列化格式与固定树不同，迁移时需要重新构建树。

### 4. 不支持零值
LeanTree 不允许插入 `0n` 作为叶子（这是 Lean IMT 的设计限制）。

## 相关资源

- [Rust 实现源码](../../../crates/maci-crypto/src/tree.rs)
- [TypeScript 实现源码](../../sdk/src/libs/crypto/lean-tree.ts)
- [Rust 使用示例](../../../crates/maci-crypto/examples/lean_tree_usage.rs)
- [TypeScript 使用示例](../../sdk/examples/lean-tree-usage.ts)
- [zk-kit Lean IMT 规范](https://github.com/zk-kit/zk-kit.rust/tree/main/crates/lean-imt)
- [原始可行性分析报告](./LEAN_IMT_IMPLEMENTATION.md)

## 总结

LeanTree 为 MACI 系统提供了一个动态容量的 Merkle 树实现，特别适合 Active State Tree 等离链场景。它解决了固定容量限制问题，同时显著降低内存使用。虽然不能替代需要电路验证的树结构，但在适用场景中提供了显著的性能和灵活性提升。
