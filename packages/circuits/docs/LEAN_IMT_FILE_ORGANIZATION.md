# LeanIMT 文件整理总结

## 整理时间
2026-01-17

## 整理目标
将 LeanIMT 相关的测试文件和文档从 `packages/sdk` 移动到 `packages/circuits`，便于统一管理和测试。

## 整理内容

### 1. 测试文件移动

#### 从 `packages/sdk/test/` 移动到 `packages/circuits/ts/__tests__/`

**移动的文件：**
- `lean-tree.test.ts` → `LeanTree.test.ts` (单元测试，70+ 测试用例)
- `lean-tree.integration.test.ts` → `LeanTree.integration.test.ts` (集成测试，20+ 测试用例)

**修改内容：**
- 更新导入语句：从 `'../src/libs/crypto/lean-tree'` 改为 `'@dorafactory/maci-sdk'`
- 统一文件命名风格：使用 PascalCase (`LeanTree`) 与 circuits 目录中其他测试文件保持一致
- 保持测试内容完全一致，无功能修改

**测试覆盖：**
- 创建和基本操作 (4个测试)
- 动态增长 (2个测试)
- 根计算 (3个测试)
- 叶子操作 (4个测试)
- Merkle 证明 (3个测试)
- 序列化 (3个测试)
- 错误处理 (4个测试)
- 容量比较 (2个测试)
- 性能测试 (1个测试)
- 集成测试 (20+个测试)

### 2. 文档整理

#### 创建 `packages/circuits/docs/LeanIMT.md`

**内容：**
- LeanIMT 概述和核心特性
- 实现位置和依赖说明
- API 完整参考文档
- 使用场景和限制说明
- 技术对比（与固定树对比）
- 测试覆盖说明
- 性能特性分析
- 错误处理指南
- 实际效益展示
- 实现细节（Poseidon 哈希适配、深度计算）
- 迁移指南
- 限制与注意事项

#### 移动 `LEAN_IMT_IMPLEMENTATION.md`

**从：** 项目根目录 `/LEAN_IMT_IMPLEMENTATION.md`  
**到：** `packages/circuits/docs/LEAN_IMT_IMPLEMENTATION.md`

**内容：**
- 实施完成情况总结
- Rust 和 TypeScript 实现详情
- 测试结果报告
- 技术对比分析
- 实际效益说明
- 下一步建议
- 技术限制说明
- 文件清单

### 3. 更新 README

#### 更新 `packages/circuits/README.md`

**添加内容：**
- Lean IMT Support 小节
  - 功能特性介绍
  - 使用场景说明
  - 测试文件位置
- 文档部分
  - 添加 LeanIMT.md 和 LEAN_IMT_IMPLEMENTATION.md 引用

## 文件结构

### 最终的 LeanIMT 相关文件分布

```
maci/
├── crates/maci-crypto/
│   ├── Cargo.toml                          # zk-kit-lean-imt 依赖
│   ├── src/
│   │   ├── tree.rs                         # LeanTree Rust 实现 (12个单元测试)
│   │   └── lib.rs                          # 导出 LeanTree
│   └── examples/
│       └── lean_tree_usage.rs              # Rust 使用示例
│
├── packages/sdk/
│   ├── package.json                        # @zk-kit/lean-imt 依赖
│   ├── src/libs/crypto/
│   │   ├── lean-tree.ts                    # LeanTree TypeScript 实现
│   │   └── index.ts                        # 导出 LeanTree
│   └── examples/
│       └── lean-tree-usage.ts              # TypeScript 使用示例
│
└── packages/circuits/
    ├── docs/
    │   ├── LeanIMT.md                      # 使用文档（新建）
    │   └── LEAN_IMT_IMPLEMENTATION.md      # 实施总结（从根目录移动）
    ├── ts/__tests__/
    │   ├── LeanTree.test.ts                # 单元测试（从 sdk/test 移动）
    │   └── LeanTree.integration.test.ts    # 集成测试（从 sdk/test 移动）
    └── README.md                            # 更新：添加 Lean IMT 说明
```

## 删除的文件

以下文件已从原位置删除：

1. `/LEAN_IMT_IMPLEMENTATION.md` - 已移动到 circuits/docs
2. `packages/sdk/test/lean-tree.test.ts` - 已移动到 circuits
3. `packages/sdk/test/lean-tree.integration.test.ts` - 已移动到 circuits

## 保留的文件

以下文件保持在原位置：

1. `packages/sdk/src/libs/crypto/lean-tree.ts` - LeanTree 实现
2. `packages/sdk/examples/lean-tree-usage.ts` - 使用示例
3. `crates/maci-crypto/src/tree.rs` - Rust LeanTree 实现
4. `crates/maci-crypto/examples/lean_tree_usage.rs` - Rust 使用示例

## 运行测试

### Rust 测试
```bash
cd crates/maci-crypto
cargo test lean_tree
```

### TypeScript 测试
```bash
cd packages/circuits
pnpm test LeanTree
```

## 文档访问

- **使用指南**: `packages/circuits/docs/LeanIMT.md`
- **实施总结**: `packages/circuits/docs/LEAN_IMT_IMPLEMENTATION.md`
- **Circuits README**: `packages/circuits/README.md`

## 优势

### 1. 统一管理
- 所有测试文件集中在 circuits 目录
- 与其他 Merkle 树测试（IncrementalQuinaryTree.test.ts）放在一起
- 便于维护和查找

### 2. 文档完整性
- circuits 目录包含完整的 LeanIMT 文档
- 实施总结和使用指南都在同一位置
- README 中有清晰的索引

### 3. 测试一致性
- 测试文件命名风格统一（PascalCase）
- 导入方式统一（使用 @dorafactory/maci-sdk）
- 与其他 circuits 测试保持一致

## 兼容性

- ✅ 不影响现有代码功能
- ✅ LeanTree 实现保持在 SDK 中，可正常导入使用
- ✅ 测试从 SDK package 导入，确保测试的是实际发布的代码
- ✅ 所有测试保持原有覆盖率和功能

## 总结

成功将 LeanIMT 相关测试和文档整理到 circuits 目录，实现了：

1. **文件组织优化**: 测试文件与其他树结构测试放在一起
2. **文档集中管理**: 所有 LeanIMT 文档集中在 circuits/docs
3. **命名统一**: 遵循 circuits 目录的命名规范
4. **功能保持**: 所有实现和测试功能完全保留
5. **易于维护**: 清晰的文件结构便于后续维护

现在 LeanIMT 的所有相关资源都在正确的位置，开发者可以轻松找到文档和测试。
