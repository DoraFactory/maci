# 🔄 Rust + TypeScript 动态集成方案

## 问题：如何让 TypeScript 直接调用 Rust？

你想要的是：
```typescript
// 理想情况：直接调用 Rust
import { hash2 } from './rust-bindings';

const result = hash2([1n, 2n]); // 直接调用 Rust 函数
```

而不是：
```typescript
// 当前方案：通过 JSON 文件
const rustVectors = JSON.parse(fs.readFileSync('test-vectors.json'));
const result = BigInt(rustVectors[0].rust_result);
```

## 🎯 四种动态集成方案

### 方案 1: WASM-Pack (推荐 ⭐⭐⭐⭐⭐)

#### 优势
- ✅ 跨平台（浏览器 + Node.js）
- ✅ 安全沙箱
- ✅ 编译产物小
- ✅ 官方支持好

#### 实现步骤

##### 1. 添加 WASM 依赖

```toml
# crates/maci-utils/Cargo.toml
[lib]
crate-type = ["rlib", "cdylib"]  # 添加 cdylib

[dependencies]
cosmwasm-std = { version = "1.5.0", default-features = false }
# ... 现有依赖
wasm-bindgen = "0.2"

[target.'cfg(target_arch = "wasm32")'.dependencies]
wasm-bindgen = "0.2"
```

##### 2. 创建 WASM 绑定

```rust
// crates/maci-utils/src/wasm.rs
use wasm_bindgen::prelude::*;
use cosmwasm_std::Uint256;

#[wasm_bindgen]
pub struct WasmPoseidon;

#[wasm_bindgen]
impl WasmPoseidon {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        WasmPoseidon
    }

    /// Hash 2 elements
    /// Inputs: two hex strings like "0x01"
    /// Returns: hex string result
    #[wasm_bindgen]
    pub fn hash2(&self, input1: &str, input2: &str) -> String {
        let a = hex_to_uint256(input1);
        let b = hex_to_uint256(input2);
        
        let result = crate::hash2([a, b]);
        uint256_to_hex(&result)
    }

    /// Hash 5 elements
    #[wasm_bindgen]
    pub fn hash5(&self, input1: &str, input2: &str, input3: &str, input4: &str, input5: &str) -> String {
        let inputs = [
            hex_to_uint256(input1),
            hex_to_uint256(input2),
            hex_to_uint256(input3),
            hex_to_uint256(input4),
            hex_to_uint256(input5),
        ];
        
        let result = crate::hash5(inputs);
        uint256_to_hex(&result)
    }
}

fn hex_to_uint256(hex: &str) -> Uint256 {
    let hex = hex.trim_start_matches("0x");
    let bytes = hex::decode(hex).unwrap_or_else(|_| vec![0u8; 32]);
    let mut array = [0u8; 32];
    let len = bytes.len().min(32);
    array[32 - len..].copy_from_slice(&bytes[..len]);
    Uint256::from_be_bytes(array)
}

fn uint256_to_hex(value: &Uint256) -> String {
    format!("0x{}", hex::encode(value.to_be_bytes()))
}
```

##### 3. 编译为 WASM

```bash
# 安装 wasm-pack
cargo install wasm-pack

# 编译
cd crates/maci-utils
wasm-pack build --target nodejs --out-dir ../../e2e/wasm-bindings
```

##### 4. 在 TypeScript 中使用

```typescript
// e2e/tests/poseidon-consistency-wasm.e2e.test.ts
import { WasmPoseidon } from '../wasm-bindings';

describe('Poseidon WASM Tests', () => {
  let poseidon: WasmPoseidon;

  before(() => {
    poseidon = new WasmPoseidon();
  });

  it('should hash2 via WASM', () => {
    const result = poseidon.hash2('0x01', '0x02');
    console.log('WASM Result:', result);
    
    // 与 SDK 对比
    const sdkResult = hash2([BigInt(1), BigInt(2)]);
    expect(BigInt(result)).to.equal(sdkResult);
  });

  it('should hash5 via WASM', () => {
    const result = poseidon.hash5('0x01', '0x02', '0x03', '0x04', '0x05');
    
    const sdkResult = hash5([BigInt(1), BigInt(2), BigInt(3), BigInt(4), BigInt(5)]);
    expect(BigInt(result)).to.equal(sdkResult);
  });
});
```

#### 性能

```
初始化: ~10ms (一次性)
hash2:  ~0.1ms
hash5:  ~0.2ms
```

---

### 方案 2: napi-rs (性能最佳 ⭐⭐⭐⭐)

#### 优势
- ✅ 原生性能（无 WASM 开销）
- ✅ 类型安全
- ✅ 现代 Rust → Node.js 绑定

#### 劣势
- ❌ 需要为每个平台编译
- ❌ 不能在浏览器中使用

#### 实现步骤

##### 1. 创建 napi 项目

```bash
# 创建新的 napi 包
cd crates
npm install -g @napi-rs/cli
napi new maci-utils-napi
```

##### 2. 实现绑定

```rust
// crates/maci-utils-napi/src/lib.rs
#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;

// 重用 maci-utils 的实现
use maci_utils::{hash2 as rust_hash2, hash5 as rust_hash5};
use cosmwasm_std::Uint256;

#[napi]
pub fn hash2(input1: String, input2: String) -> String {
  let a = hex_to_uint256(&input1);
  let b = hex_to_uint256(&input2);
  
  let result = rust_hash2([a, b]);
  uint256_to_hex(&result)
}

#[napi]
pub fn hash5(input1: String, input2: String, input3: String, input4: String, input5: String) -> String {
  let inputs = [
    hex_to_uint256(&input1),
    hex_to_uint256(&input2),
    hex_to_uint256(&input3),
    hex_to_uint256(&input4),
    hex_to_uint256(&input5),
  ];
  
  let result = rust_hash5(inputs);
  uint256_to_hex(&result)
}

fn hex_to_uint256(hex: &str) -> Uint256 {
  // ... 实现
}

fn uint256_to_hex(value: &Uint256) -> String {
  format!("0x{}", hex::encode(value.to_be_bytes()))
}
```

##### 3. 构建

```bash
cd crates/maci-utils-napi
npm run build
```

##### 4. 在 TypeScript 中使用

```typescript
import { hash2, hash5 } from '@maci-utils/napi';

describe('Poseidon NAPI Tests', () => {
  it('should hash2 via native binding', () => {
    const result = hash2('0x01', '0x02');
    
    const sdkResult = hash2SDK([BigInt(1), BigInt(2)]);
    expect(BigInt(result)).to.equal(sdkResult);
  });
});
```

#### 性能对比

| 方法 | hash2 | hash5 | 初始化 |
|------|-------|-------|--------|
| NAPI | 0.05ms | 0.1ms | ~1ms |
| WASM | 0.1ms | 0.2ms | ~10ms |
| JSON | N/A | N/A | 0ms (预生成) |

---

### 方案 3: 子进程调用 (简单但慢 ⭐⭐)

#### 实现

```typescript
// e2e/tests/poseidon-subprocess.test.ts
import { execSync } from 'child_process';

function callRustHash2(input1: bigint, input2: bigint): bigint {
  const cmd = `cd ../../crates/maci-utils && cargo run --quiet --bin hash_cli -- hash2 ${input1} ${input2}`;
  const output = execSync(cmd, { encoding: 'utf-8' });
  return BigInt(output.trim());
}

it('should call Rust via subprocess', () => {
  const result = callRustHash2(1n, 2n);
  const sdkResult = hash2([1n, 2n]);
  expect(result).to.equal(sdkResult);
});
```

#### 性能
```
每次调用: ~200-500ms (启动 Rust 进程)
❌ 太慢，不适合大量测试
```

---

## 📊 方案对比

| 特性 | 当前 (JSON) | WASM-Pack | napi-rs | 子进程 |
|------|-------------|-----------|---------|--------|
| **性能** | N/A | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐ |
| **易用性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **维护成本** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **跨平台** | ✅ | ✅ | ❌ (需要各平台编译) | ✅ |
| **浏览器支持** | N/A | ✅ | ❌ | ❌ |
| **CI/CD** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **动态性** | ❌ | ✅ | ✅ | ✅ |

---

## 🎯 推荐方案

### 场景 1: 快速开发 (当前)
**使用 JSON 文件方案** ✅
- 最简单
- CI/CD 友好
- 适合当前阶段

### 场景 2: 需要动态测试
**使用 WASM-Pack** ⭐⭐⭐⭐⭐
- 跨平台
- 性能足够好
- 未来可在浏览器中使用

### 场景 3: 追求极致性能
**使用 napi-rs**
- 原生性能
- 但需要处理多平台编译

---

## 🚀 快速实现：WASM 方案

让我为你创建一个完整的 WASM 集成示例：

### 步骤 1: 添加 WASM 支持

```bash
cd crates/maci-utils

# 添加到 Cargo.toml
cat >> Cargo.toml << 'EOF'

[target.'cfg(target_arch = "wasm32")'.dependencies]
wasm-bindgen = "0.2"
EOF
```

### 步骤 2: 创建 WASM 模块

创建 `src/wasm.rs` (见上面代码)

### 步骤 3: 编译

```bash
# 安装工具
cargo install wasm-pack

# 编译
wasm-pack build --target nodejs --out-dir ../../e2e/wasm-bindings
```

### 步骤 4: 测试

```typescript
// e2e/tests/poseidon-wasm.test.ts
import { expect } from 'chai';
import { WasmPoseidon } from '../wasm-bindings';
import { hash2 as sdkHash2, hash5 as sdkHash5 } from '@dorafactory/maci-sdk';

describe('Poseidon WASM Dynamic Tests', () => {
  let wasmPoseidon: WasmPoseidon;

  before(async () => {
    wasmPoseidon = new WasmPoseidon();
    console.log('✓ WASM module loaded');
  });

  it('should dynamically compute hash2', () => {
    const wasmResult = wasmPoseidon.hash2('0x01', '0x02');
    const sdkResult = sdkHash2([BigInt(1), BigInt(2)]);
    
    console.log('WASM:', wasmResult);
    console.log('SDK:', sdkResult.toString(16));
    
    expect(BigInt(wasmResult)).to.equal(sdkResult);
  });

  it('should dynamically compute hash5', () => {
    const wasmResult = wasmPoseidon.hash5('0x01', '0x02', '0x03', '0x04', '0x05');
    const sdkResult = sdkHash5([BigInt(1), BigInt(2), BigInt(3), BigInt(4), BigInt(5)]);
    
    expect(BigInt(wasmResult)).to.equal(sdkResult);
  });

  // 可以动态测试任意输入！
  it('should handle arbitrary inputs', () => {
    for (let i = 0; i < 100; i++) {
      const a = BigInt(Math.floor(Math.random() * 1000));
      const b = BigInt(Math.floor(Math.random() * 1000));
      
      const wasmResult = wasmPoseidon.hash2(
        `0x${a.toString(16)}`,
        `0x${b.toString(16)}`
      );
      const sdkResult = sdkHash2([a, b]);
      
      expect(BigInt(wasmResult)).to.equal(sdkResult);
    }
    console.log('✓ 100 random tests passed');
  });
});
```

---

## 💡 混合方案 (最佳实践)

结合两种方案的优势：

```typescript
describe('Poseidon Consistency - Hybrid', () => {
  let wasmPoseidon: WasmPoseidon | null = null;
  let rustVectors: RustTestVector[] = [];

  before(() => {
    // 尝试加载 WASM
    try {
      wasmPoseidon = new WasmPoseidon();
      console.log('✓ WASM available - using dynamic testing');
    } catch (e) {
      console.log('⚠ WASM not available - falling back to JSON vectors');
    }

    // 总是加载 JSON 作为后备
    if (fs.existsSync(RUST_TEST_VECTORS_PATH)) {
      rustVectors = JSON.parse(fs.readFileSync(RUST_TEST_VECTORS_PATH, 'utf-8'));
    }
  });

  it('should test hash2', () => {
    const sdkResult = hash2([1n, 2n]);

    if (wasmPoseidon) {
      // 动态测试
      const wasmResult = wasmPoseidon.hash2('0x01', '0x02');
      expect(BigInt(wasmResult)).to.equal(sdkResult);
      console.log('✓ WASM dynamic test passed');
    } else {
      // 静态测试向量
      const vector = rustVectors.find(v => v.name === 'basic_hash2_small');
      if (vector) {
        expect(sdkResult).to.equal(BigInt(vector.rust_result));
        console.log('✓ JSON vector test passed');
      }
    }
  });
});
```

---

## 🎯 总结

### 当前方案 (JSON) ✅
- **何时使用**: 现在就用这个！
- **优点**: 简单、可靠、CI/CD 友好
- **缺点**: 不是"真正"的动态测试

### WASM 方案 ⭐ 推荐
- **何时使用**: 需要动态测试时
- **优点**: 跨平台、性能好、真正动态
- **实现难度**: 中等
- **时间投入**: 2-3 小时

### NAPI 方案
- **何时使用**: 需要极致性能
- **优点**: 最快
- **缺点**: 平台相关、维护复杂
- **时间投入**: 4-6 小时

### 我的建议

1. **短期** (现在)
   - 继续使用 JSON 方案 ✅
   - 简单、够用、可靠

2. **中期** (如果需要)
   - 添加 WASM 支持
   - 混合模式（WASM + JSON 后备）

3. **长期** (如果必要)
   - 考虑 NAPI
   - 但可能过度工程化

---

**你现在需要动态测试吗？** 如果是，我可以立即为你实现 WASM 方案！🚀

