# 🚀 Poseidon 一致性测试 - 快速开始

## ✅ 当前方案：JSON 测试向量

已采用简单、可靠的 JSON 测试向量方案，通过 TypeScript 工具自动生成和管理。

## 📁 项目结构

```
maci/
├── e2e/
│   ├── poseidon-test/                    ← 测试工具目录
│   │   ├── generate-vectors.ts           ← 生成测试向量
│   │   ├── load-vectors.ts               ← 加载工具
│   │   ├── test-vectors.d.ts             ← 类型定义
│   │   ├── test-vectors-rust.json        ← 生成的向量 (git-ignored)
│   │   └── README.md                     ← 详细文档
│   │
│   ├── tests/
│   │   └── poseidon-consistency.e2e.test.ts  ← 测试文件
│   │
│   └── package.json                      ← 包含自动化脚本
│
└── crates/
    └── maci-utils/
        └── src/bin/
            └── generate_test_vectors.rs  ← Rust 向量生成器
```

## 🎯 使用方法

### 方式 1：自动运行（推荐）

```bash
cd e2e

# 这个命令会自动：
# 1. 生成 Rust 测试向量
# 2. 运行一致性测试
pnpm test:poseidon
```

### 方式 2：分步运行

```bash
cd e2e

# 步骤 1: 手动生成测试向量
pnpm generate:vectors

# 步骤 2: 运行测试
pnpm test:poseidon
```

## 📊 测试输出示例

```
═══════════════════════════════════════════════════════
  Rust Test Vector Generator
═══════════════════════════════════════════════════════

🔧 Generating Poseidon hash test vectors from Rust...
   Working directory: /path/to/crates/maci-utils
✅ Generated 14 test vectors

🔍 Validating test vectors...
✅ All vectors valid

💾 Saved to: e2e/poseidon-test/test-vectors-rust.json

📊 Summary:
   Total vectors: 14
   - hash2: 7
   - hash5: 7

📝 Test vectors:
   - basic_hash2_small (hash2)
   - basic_hash5_sequential (hash5)
   - hash2_both_zeros (hash2)
   ...

✅ Test vectors generated successfully!

Poseidon Hash Consistency E2E Tests
  ✓ Setting up Poseidon consistency tests...
  ✓ Loaded 14 Rust test vectors

  1. SDK Poseidon Hash Tests
    ✓ should compute hash2 correctly
    ✓ should compute hash5 correctly
    
  3. Cross-Component Consistency Tests
    hash2 consistency
      ✓ basic_hash2_small - SDK vs Circuit vs Rust

  basic_hash2_small:
    Description: Simple small integers
    Inputs: [1, 2]
    SDK Result: 785320012077606287...
    Rust Result: 785320012077606287...
    ✓ SDK ↔ Rust: MATCH
    Circuit Result: 785320012077606287...
    ✓ SDK ↔ Circuit: MATCH
    ✓ Circuit ↔ Rust: MATCH
    ✅ All three implementations match!

  50 passing (45s)
```

## 🔄 工作流程

```
┌──────────────────────────────────────────────┐
│  开发者运行: pnpm test:poseidon             │
└──────────────┬───────────────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │ pretest:poseidon     │ (自动)
    │ 生成测试向量          │
    └──────────┬───────────┘
               │
               ├── 1. 运行 Rust binary
               │   (generate_test_vectors)
               │
               ├── 2. 捕获 JSON 输出
               │
               ├── 3. 验证格式
               │
               └── 4. 保存到文件
                   test-vectors-rust.json
                          │
                          ▼
    ┌────────────────────────────────┐
    │  test:poseidon                 │
    │  运行一致性测试                 │
    └────────────┬───────────────────┘
                 │
                 ├── 加载测试向量
                 │
                 ├── SDK 计算
                 │
                 ├── Rust 对比 (from JSON)
                 │
                 ├── Circuit 对比 (可选)
                 │
                 └── ✅ 验证一致性
```

## 🛠️ 可用命令

```bash
# 在 e2e 目录下

# 生成测试向量
pnpm generate:vectors

# 运行 Poseidon 测试（自动生成向量）
pnpm test:poseidon

# 运行所有测试
pnpm test

# 清理
pnpm clean
```

## 📝 添加新测试用例

### 步骤 1: 在 Rust 侧添加

编辑 `crates/maci-utils/src/bin/generate_test_vectors.rs`:

```rust
vectors.push(TestVector {
    name: "my_custom_test".to_string(),
    description: "My custom test case".to_string(),
    hash_type: "hash2".to_string(),
    inputs: vec!["0x0A".to_string(), "0x0B".to_string()],
    rust_result: uint256_to_hex(&hash2([
        Uint256::from_u128(10),
        Uint256::from_u128(11)
    ])),
});
```

### 步骤 2: 在 TypeScript 侧添加

编辑 `e2e/tests/poseidon-consistency.e2e.test.ts`:

```typescript
const TEST_VECTORS: TestVector[] = [
  // ... 现有向量
  {
    name: 'my_custom_test',
    inputs: [BigInt(10), BigInt(11)],
    hashType: 'hash2',
    description: 'My custom test case'
  }
];
```

### 步骤 3: 重新运行测试

```bash
cd e2e
pnpm test:poseidon
```

**重要**：确保 `name` 在 Rust 和 TypeScript 中完全一致！

## 🔍 故障排查

### 问题 1: 找不到测试向量

```
Error: Test vectors not found
Run: pnpm generate:vectors
```

**解决方案**：
```bash
cd e2e
pnpm generate:vectors
```

### 问题 2: Rust 编译失败

```
Error: cargo command failed
```

**解决方案**：
```bash
# 检查 Rust 是否安装
cargo --version

# 手动编译测试
cd crates/maci-utils
cargo build
```

### 问题 3: 结果不匹配

```
AssertionError: expected 123... to equal 456...
```

**调试步骤**：
1. 检查输入格式
2. 验证 Rust 和 SDK 使用相同的实现
3. 查看详细日志
4. 对比测试向量的 inputs 字段

### 问题 4: 测试向量名称不匹配

```
⚠ Rust result not available
```

**原因**：Rust 和 TypeScript 中的测试用例名称不一致

**解决方案**：确保 `name` 字段完全相同：
```typescript
// TypeScript
name: 'basic_hash2_small'  // ✅ 正确

// Rust
name: "basic_hash2_small"  // ✅ 匹配
```

## 🎯 CI/CD 集成

在 GitHub Actions 中：

```yaml
- name: Run Poseidon consistency tests
  run: |
    cd e2e
    pnpm test:poseidon
```

测试会自动：
1. 生成测试向量
2. 运行一致性测试
3. 验证所有实现匹配

## 📚 相关文档

- **详细文档**: `e2e/poseidon-test/README.md`
- **Rust 集成指南**: `RUST_INTEGRATION_GUIDE.md`
- **完整测试方案**: `POSEIDON_E2E_COMPLETE.md`
- **动态集成方案**: `RUST_TS_DYNAMIC_INTEGRATION.md`

## ✅ 验证安装

```bash
cd e2e

# 1. 生成测试向量
pnpm generate:vectors

# 2. 检查文件是否生成
ls -lh poseidon-test/test-vectors-rust.json

# 3. 运行测试
pnpm test:poseidon
```

如果所有步骤都成功，你就配置好了！✨

## 💡 提示

1. **自动化优先**: 使用 `pnpm test:poseidon`，它会自动生成向量
2. **版本控制**: `test-vectors-rust.json` 不会被提交（在 `.gitignore` 中）
3. **一致性**: 始终保持 Rust 和 TypeScript 测试定义同步
4. **验证**: 每次修改实现后重新运行完整测试

---

**最后更新**: 2025-11-15  
**状态**: ✅ 生产就绪  
**维护**: 自动化，零手动操作

