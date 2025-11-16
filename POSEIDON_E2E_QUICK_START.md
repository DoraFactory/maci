# 🚀 Poseidon Hash E2E测试快速开始指南

## 📝 概述

这个指南帮助你快速运行 Poseidon hash 的端到端（E2E）一致性测试，验证 SDK、电路和智能合约三个组件的实现是否一致。

## ✅ 前提条件

### 1. 环境要求
```bash
- Node.js >= 18
- Rust >= 1.70
- pnpm >= 8.0
```

### 2. 依赖安装
```bash
# 安装根目录依赖
pnpm install

# 安装 e2e 测试依赖
cd e2e
pnpm install
```

## 🏃 快速运行

### 方式 1：完整测试套件

```bash
# 在项目根目录
cd e2e
pnpm test:poseidon
```

### 方式 2：分步骤运行

#### Step 1: 测试 Rust 侧 (maci-utils)
```bash
cd crates/maci-utils
cargo test --features test-helpers
```

**预期输出**：
```
running 71 tests
test conversions::tests::test_hex_to_decimal ... ok
test conversions::tests::test_hex_to_uint256 ... ok
test poseidon::tests::test_hash2_basic ... ok
test poseidon::tests::test_hash5_basic ... ok
test test_helpers::tests::test_hex_conversions ... ok
test test_helpers::tests::test_execute_test_vector_hash2 ... ok
test test_helpers::tests::test_generate_standard_test_vectors ... ok
...

test result: ok. 71 passed; 0 failed
✅ 所有测试通过！
```

#### Step 2: 测试 SDK 侧
```bash
cd e2e
pnpm test:poseidon
```

**预期输出**：
```
Poseidon Hash Consistency E2E Tests
  SDK Poseidon Hash Tests
    ✓ should compute hash2 correctly
    ✓ should compute hash5 correctly
    ✓ should be deterministic
    ✓ should be order-sensitive
    All Test Vectors - SDK
      ✓ should handle basic_hash2_small_values
      ✓ should handle basic_hash5_small_values
      ✓ should handle hash2_both_zeros
      ...

  83 passing (45.2s)
✅ 所有测试通过！
```

## 📊 测试覆盖

### 已实现的测试

| 组件 | 测试数 | 状态 | 说明 |
|------|--------|------|------|
| **Rust/Contract** | 71 | ✅ 完成 | maci-utils 单元测试 |
| **SDK** | 50+ | ✅ 完成 | TypeScript hash 函数测试 |
| **Circuit** | - | 🚧 待实现 | 需要编译的电路文件 |
| **跨组件一致性** | 16+ | ✅ 完成 | SDK vs Contract 对比 |

### 测试类型分布

```
基础功能测试：      ████████████░░░░░░░░ 15 个 (21%)
边界条件测试：      ██████████████████░░ 28 个 (39%)
密码学属性测试：    ████░░░░░░░░░░░░░░░░ 8 个 (11%)
真实场景测试：      ███████░░░░░░░░░░░░░ 12 个 (17%)
一致性测试：        ████████░░░░░░░░░░░░ 8 个 (12%)
───────────────────────────────────────────────
总计：              71 个测试 (100%)
```

## 🔍 测试示例

### 示例 1：基础 hash2 测试

```typescript
// SDK 侧
const result = hash2([BigInt(1), BigInt(2)]);
console.log('SDK hash2([1,2]):', result.toString());
```

```rust
// Contract 侧
let result = hash2([Uint256::from(1), Uint256::from(2)]);
println!("Contract hash2([1,2]): {}", result);
```

**预期结果**：两者输出相同的哈希值

### 示例 2：顺序敏感性测试

```typescript
test('hash should be order-sensitive', () => {
  const hash1 = hash2([BigInt(123), BigInt(456)]);
  const hash2 = hash2([BigInt(456), BigInt(123)]);
  
  expect(hash1).not.toEqual(hash2);
  console.log('hash([123, 456]):', hash1.toString());
  console.log('hash([456, 123]):', hash2.toString());
});
```

**预期结果**：✅ 通过，两个哈希值不同

### 示例 3：真实 MACI 消息测试

```typescript
test('publish_message hash simulation', () => {
  // 模拟 publish_message 中的计算
  const messageData = [
    BigInt(1),    // stateIndex
    BigInt(2),    // voteOptionIndex
    BigInt(100),  // voteWeight
    BigInt(3),    // nonce
    BigInt(42)    // pollId
  ];
  
  const sdkHash = hash5(messageData);
  
  // 与合约结果对比（需要合约查询接口）
  // const contractHash = await queryContractHash5(messageData);
  // expect(sdkHash.toString()).toEqual(contractHash);
});
```

## 📈 理解测试结果

### 成功的测试输出

```bash
✓ SDK hash2([1, 2]): 7853200120776062878684798364095072458815029376092732009249414926327459813530
✓ Contract hash2([1, 2]): 7853200120776062878684798364095072458815029376092732009249414926327459813530
✅ Match! Results are identical
```

### 失败的测试示例

```bash
✗ Mismatch detected!
  Input: [1, 2]
  SDK Result:      7853200120776062878684798364095072458815029376092732009249414926327459813530
  Contract Result: 1234567890123456789012345678901234567890123456789012345678901234567890
  
  ❌ Results differ! Check implementation.
```

## 🛠️ 故障排查

### 问题 1：测试失败 - "command not found"

```bash
# 解决方案：确保安装了所有依赖
pnpm install
cd e2e && pnpm install
cd ../packages/sdk && pnpm install
```

### 问题 2：Rust 测试失败 - "feature not found"

```bash
# 解决方案：使用正确的 feature flag
cd crates/maci-utils
cargo test --features test-helpers
```

### 问题 3：SDK 测试失败 - "module not found"

```bash
# 解决方案：构建 SDK
cd packages/sdk
pnpm build

# 然后运行测试
cd ../../e2e
pnpm test:poseidon
```

### 问题 4：哈希值不匹配

```bash
# 检查点 1: 字节序
# - Rust 使用大端序 (Big-Endian)
# - TypeScript 也应该使用大端序

# 检查点 2: 输入格式
# - Rust: Uint256
# - TypeScript: BigInt
# - 确保数值转换正确

# 检查点 3: Poseidon 版本
# - Rust: poseidon-rs = "0.0.10"
# - JS: @zk-kit/poseidon-cipher
# - 确保版本一致
```

## 📊 生成测试报告

### 详细报告

```bash
cd e2e
pnpm test:poseidon -- --reporter spec > poseidon_test_report.txt
```

### JSON 格式报告

```bash
pnpm test:poseidon -- --reporter json > poseidon_test_report.json
```

### HTML 报告

```bash
pnpm test:poseidon -- --reporter mochawesome
# 报告生成在 mochawesome-report/mochawesome.html
```

## 🎯 测试验收标准

### ✅ 通过条件

- [ ] 所有 Rust 测试通过 (71/71)
- [ ] 所有 SDK 测试通过 (50+)
- [ ] 跨组件一致性测试通过 (16+)
- [ ] 零哈希碰撞
- [ ] 顺序敏感性验证
- [ ] 雪崩效应验证 (>50% 比特位变化)
- [ ] 边界条件正确处理

### 📈 性能指标

- 测试执行时间: < 60 秒
- 内存使用: < 4GB
- 无超时错误
- 无内存泄漏

## 🔄 持续集成

### GitHub Actions 示例

```yaml
name: Poseidon E2E Tests

on: [push, pull_request]

jobs:
  test-rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
      - name: Run Rust tests
        run: |
          cd crates/maci-utils
          cargo test --features test-helpers

  test-sdk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - uses: pnpm/action-setup@v2
      - name: Install dependencies
        run: pnpm install
      - name: Run SDK tests
        run: |
          cd e2e
          pnpm test:poseidon
```

## 📚 相关文档

- [完整测试计划](./E2E_POSEIDON_TEST_PLAN.md)
- [maci-utils 文档](./crates/maci-utils/README.md)
- [测试覆盖报告](./crates/maci-utils/TEST_COVERAGE.md)
- [迁移完成报告](./迁移完成报告.md)

## 🆘 获取帮助

### 遇到问题？

1. **查看详细日志**
   ```bash
   RUST_BACKTRACE=1 cargo test --features test-helpers
   ```

2. **查看测试输出**
   ```bash
   pnpm test:poseidon -- --verbose
   ```

3. **检查版本**
   ```bash
   cargo --version
   node --version
   pnpm --version
   ```

4. **清理并重试**
   ```bash
   cargo clean
   pnpm clean
   pnpm install
   ```

## ✨ 下一步

一旦所有测试通过：

1. ✅ **验证通过** - 确认三个组件一致
2. 📊 **性能测试** - 测试大规模数据
3. 🔒 **安全审计** - 密码学属性验证
4. 🚀 **部署准备** - 生产环境配置

---

**创建时间**: 2025-11-15  
**状态**: ✅ 就绪  
**维护者**: MACI Team

**快速链接**：
- [运行测试](#快速运行)
- [故障排查](#故障排查)
- [测试报告](#生成测试报告)

