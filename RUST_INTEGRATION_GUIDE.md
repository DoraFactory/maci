# 🦀 Rust (maci-utils) 集成测试指南

## 问题：为什么需要特殊处理 Rust 测试？

### 原因

1. **maci-utils 是独立的 Rust library**
   - 不是 CosmWasm 合约
   - 不会编译成 WASM
   - 无法像合约那样通过 wasm 执行测试

2. **跨语言测试的挑战**
   - TypeScript (SDK)
   - Circom (Circuits)  
   - **Rust (maci-utils)** ← 无法直接在 Node.js 中调用

### 之前的方案（不适用）
```typescript
// ❌ 无法使用，因为 maci-utils 不是 WASM 合约
const client = new SimulateCosmWasmClient();
await client.execute(contractAddress, { test_hash2: {...} });
```

## ✅ 解决方案：测试向量文件桥接

### 架构图

```
┌────────────────────────────────────────────────────┐
│            Cross-Language Testing                  │
└────────────────────────────────────────────────────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
         ▼           ▼           ▼
    ┌────────┐  ┌────────┐  ┌────────┐
    │  SDK   │  │Circuit │  │  Rust  │
    │  (TS)  │  │(Circom)│  │(lib)   │
    └───┬────┘  └───┬────┘  └───┬────┘
        │           │           │
        │           │           │ Run binary
        │           │           ▼
        │           │      ┌──────────────┐
        │           │      │ cargo run    │
        │           │      │ --bin gen... │
        │           │      └──────┬───────┘
        │           │             │
        │           │             ▼
        │           │      ┌──────────────────┐
        │           │      │ test-vectors-    │
        │           │      │   rust.json      │
        │           │      └──────┬───────────┘
        │           │             │
        └───────────┴─────────────┴─────┐
                                        │
                                        ▼
                                 ┌──────────────┐
                                 │ E2E Tests    │
                                 │ Compare all  │
                                 └──────────────┘
```

### 工作流程

#### 1. Rust 生成测试向量

```bash
# 运行 Rust binary 生成测试向量
cd crates/maci-utils
cargo run --bin generate_test_vectors > ../../e2e/test-vectors-rust.json
```

生成的 JSON 格式：
```json
[
  {
    "name": "basic_hash2_small",
    "description": "Simple small integers",
    "hash_type": "hash2",
    "inputs": ["0x01", "0x02"],
    "rust_result": "0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a"
  },
  ...
]
```

#### 2. TypeScript 加载并验证

```typescript
// 加载 Rust 生成的向量
const rustVectors = JSON.parse(fs.readFileSync('test-vectors-rust.json'));

// SDK 计算
const sdkResult = hash2([BigInt(1), BigInt(2)]);

// Rust 结果
const rustResult = BigInt(rustVectors[0].rust_result);

// 对比
expect(sdkResult).to.equal(rustResult);
// ✅ SDK ↔ Rust: MATCH
```

#### 3. 完整的三方验证

```typescript
it('should match across all implementations', async () => {
  // 1. SDK
  const sdkResult = hash2([1n, 2n]);
  
  // 2. Rust (from generated file)
  const rustResult = BigInt(rustVector.rust_result);
  
  // 3. Circuit
  const witness = await circuit.calculateWitness({...});
  const circuitResult = await getSignal(circuit, witness, 'hash');
  
  // Verify all match
  expect(sdkResult).to.equal(rustResult);      // ✅ SDK ↔ Rust
  expect(sdkResult).to.equal(circuitResult);   // ✅ SDK ↔ Circuit
  expect(circuitResult).to.equal(rustResult);  // ✅ Circuit ↔ Rust
});
```

## 📂 文件结构

```
maci/
├── crates/
│   └── maci-utils/
│       ├── src/
│       │   ├── poseidon.rs           ← Rust 实现
│       │   └── bin/
│       │       └── generate_test_vectors.rs  ← 生成器
│       └── Cargo.toml                ← 包含 [[bin]] 配置
│
└── e2e/
    ├── test-vectors-rust.json        ← 生成的测试向量
    ├── scripts/
    │   └── generate-rust-vectors.sh  ← 快捷脚本
    └── tests/
        └── poseidon-consistency.e2e.test.ts  ← 读取并验证
```

## 🚀 使用方法

### 方式 1：手动生成

```bash
# Step 1: 生成 Rust 测试向量
cd crates/maci-utils
cargo run --bin generate_test_vectors > ../../e2e/test-vectors-rust.json

# Step 2: 运行 E2E 测试
cd ../../e2e
pnpm test:poseidon
```

### 方式 2：使用脚本

```bash
# 一键生成
./e2e/scripts/generate-rust-vectors.sh

# 然后运行测试
cd e2e
pnpm test:poseidon
```

### 方式 3：集成到测试命令

更新 `e2e/package.json`:
```json
{
  "scripts": {
    "pretest:poseidon": "cd ../crates/maci-utils && cargo run --quiet --bin generate_test_vectors 2>&1 | grep -A 999999 '^\\[' > ../../e2e/test-vectors-rust.json || true",
    "test:poseidon": "pnpm run mocha-test tests/poseidon-consistency.e2e.test.ts"
  }
}
```

## 📊 测试输出示例

```
Poseidon Hash Consistency E2E Tests
  
  3. Cross-Component Consistency Tests
    hash2 consistency
      ✓ basic_hash2_small - SDK vs Circuit vs Rust
  
  basic_hash2_small:
    Description: Simple small integers
    Inputs: [1, 2]
    SDK Result: 7853200120776062878684798364095072458815029376092732009249414926327459813530
    Rust Result: 7853200120776062878684798364095072458815029376092732009249414926327459813530
    ✓ SDK ↔ Rust: MATCH
    Circuit Result: 7853200120776062878684798364095072458815029376092732009249414926327459813530
    ✓ SDK ↔ Circuit: MATCH
    ✓ Circuit ↔ Rust: MATCH
    ✅ All three implementations match!
```

## 🔍 验证点

测试会验证：

### 1. SDK ↔ Rust 一致性
```typescript
expect(sdkResult).to.equal(rustResult, 'SDK and Rust results should match');
```

### 2. SDK ↔ Circuit 一致性
```typescript
expect(sdkResult).to.equal(circuitResult, 'SDK and Circuit results should match');
```

### 3. Circuit ↔ Rust 一致性
```typescript
expect(circuitResult).to.equal(rustResult, 'Circuit and Rust results should match');
```

## 🎯 为什么这个方案有效？

### 优势

1. **简单直接**
   - 不需要复杂的语言绑定
   - 不需要编译 Rust 为 WASM
   - 不需要 FFI (Foreign Function Interface)

2. **可维护性**
   - 纯文本 JSON 文件
   - 易于调试和查看
   - 版本控制友好

3. **灵活性**
   - 可以手动检查结果
   - 可以添加更多测试向量
   - 可以用于回归测试

4. **性能**
   - Rust binary 运行很快 (< 1 秒)
   - 文件读取开销小
   - 适合 CI/CD

### 对比其他方案

| 方案 | 复杂度 | 速度 | 可维护性 | 适用性 |
|------|--------|------|----------|--------|
| **测试向量文件** | ⭐ 低 | ⚡ 快 | ✅ 高 | ✅ 完美 |
| WASM 编译 | ⭐⭐⭐ 高 | 🐌 慢 | ❌ 低 | ❌ 不适用 |
| Neon/NAPI | ⭐⭐⭐⭐ 很高 | ⚡ 快 | ❌ 低 | ⚠️ 过度 |
| 外部进程调用 | ⭐⭐ 中 | 🐌 慢 | ⚠️ 中 | ⚠️ 笨拙 |

## 🔄 CI/CD 集成

### GitHub Actions 示例

```yaml
name: Poseidon Consistency Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install pnpm
        run: npm install -g pnpm
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Generate Rust test vectors
        run: |
          cd crates/maci-utils
          cargo run --bin generate_test_vectors > ../../e2e/test-vectors-rust.json
      
      - name: Run E2E consistency tests
        run: |
          cd e2e
          pnpm test:poseidon
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-vectors
          path: e2e/test-vectors-rust.json
```

## 📝 添加新的测试向量

### 在 Rust 侧

编辑 `crates/maci-utils/src/bin/generate_test_vectors.rs`:

```rust
vectors.push(TestVector {
    name: "my_new_test".to_string(),
    description: "My custom test case".to_string(),
    hash_type: "hash2".to_string(),
    inputs: vec!["0x0A".to_string(), "0x0B".to_string()],
    rust_result: uint256_to_hex(&hash2([
        Uint256::from_u128(10),
        Uint256::from_u128(11)
    ])),
});
```

### 在 TypeScript 侧

编辑 `e2e/tests/poseidon-consistency.e2e.test.ts`:

```typescript
const TEST_VECTORS: TestVector[] = [
  // ... 现有向量
  {
    name: 'my_new_test',
    inputs: [BigInt(10), BigInt(11)],
    hashType: 'hash2',
    description: 'My custom test case'
  }
];
```

### 重新生成并测试

```bash
# 重新生成
cargo run --bin generate_test_vectors > ../../e2e/test-vectors-rust.json

# 运行测试
cd ../../e2e && pnpm test:poseidon
```

## 🐛 故障排查

### 问题 1：test-vectors-rust.json 不存在

```bash
# 解决方案：生成文件
cd crates/maci-utils
cargo run --bin generate_test_vectors > ../../e2e/test-vectors-rust.json
```

### 问题 2：结果不匹配

```typescript
// 检查输入格式
console.log('SDK inputs:', sdkInputs);
console.log('Rust inputs:', rustVector.inputs);

// 检查大小端序
console.log('SDK result (hex):', sdkResult.toString(16));
console.log('Rust result (hex):', rustVector.rust_result);
```

### 问题 3：找不到测试向量

```typescript
// 确保名称完全匹配
const rustVector = rustTestVectors.find(v => v.name === vector.name);
if (!rustVector) {
  console.log('Available names:', rustTestVectors.map(v => v.name));
  console.log('Looking for:', vector.name);
}
```

## 📚 相关文档

- [E2E 测试完整方案](../POSEIDON_E2E_COMPLETE.md)
- [测试计划](../E2E_POSEIDON_TEST_PLAN.md)
- [技术集成总结](../E2E_POSEIDON_INTEGRATION_SUMMARY.md)

## ✅ 检查清单

测试运行前确认：

- [ ] Rust 编译通过：`cargo build`
- [ ] 测试向量已生成：`test-vectors-rust.json` 存在
- [ ] TypeScript 依赖已安装：`pnpm install`
- [ ] 测试向量名称匹配
- [ ] JSON 格式正确

---

**创建时间**: 2025-11-15  
**状态**: ✅ 生产就绪  
**方案**: 通过测试向量文件桥接 Rust 和 TypeScript

