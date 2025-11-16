# 迁移指南：使用共享 maci-utils 库

## 📋 概述

创建了共享的 `maci-utils` 库来统一 `amaci`、`api-maci` 和其他合约的工具函数。

## 🎯 为什么需要这个？

### 问题
- ❌ `amaci` 和 `api-maci` 都有独立的 `utils.rs` 
- ❌ 代码重复，维护困难
- ❌ `api-maci` 使用旧版本（未优化）
- ❌ 任何优化需要在多处更新

### 解决方案
- ✅ 创建共享库 `maci-utils`
- ✅ 统一优化（Poseidon 缓存等）
- ✅ 一次更新，所有合约受益
- ✅ 更好的测试覆盖

## 📦 新的项目结构

```
maci/
├── crates/
│   └── maci-utils/          # ✨ 新的共享库
│       ├── src/
│       │   ├── lib.rs
│       │   ├── poseidon.rs       # Poseidon 哈希（优化版）
│       │   ├── conversions.rs    # 类型转换
│       │   └── sha256_utils.rs   # SHA256 工具
│       ├── Cargo.toml
│       └── README.md
├── contracts/
│   ├── amaci/
│   │   └── src/
│   │       └── utils.rs      # ⚠️ 将被替换
│   ├── api-maci/
│   │   └── src/
│   │       └── utils.rs      # ⚠️ 将被替换
│   └── registry/
│       └── src/
│           └── utils.rs      # ⚠️ 可选：也可迁移
└── Cargo.toml                # 已更新 workspace
```

## 🔧 迁移步骤

### 步骤 1: 更新 amaci

#### 1.1 修改 `contracts/amaci/Cargo.toml`

```toml
[dependencies]
# 添加共享库
maci-utils = { path = "../../crates/maci-utils" }

# 可以移除这些（maci-utils 已包含）
# poseidon-rs = "0.0.10"  # 保留或移除都可以
# ff = ...
```

#### 1.2 修改 `contracts/amaci/src/lib.rs`

```rust
// 移除
// pub mod utils;

// 使用共享库
pub use maci_utils;
```

#### 1.3 更新 `contracts/amaci/src/contract.rs`

**修改前:**
```rust
use crate::utils::{hash2, hash5, hash_256_uint256_list, uint256_from_hex_string};
```

**修改后:**
```rust
use maci_utils::{hash2, hash5, hash_256_uint256_list, uint256_from_hex_string};
```

#### 1.4 删除旧的 `utils.rs`（可选）

```bash
# 备份（以防万一）
mv contracts/amaci/src/utils.rs contracts/amaci/src/utils.rs.backup

# 或者直接删除
rm contracts/amaci/src/utils.rs
```

---

### 步骤 2: 更新 api-maci

#### 2.1 修改 `contracts/api-maci/Cargo.toml`

```toml
[dependencies]
# 添加共享库
maci-utils = { path = "../../crates/maci-utils" }
```

#### 2.2 修改 `contracts/api-maci/src/lib.rs`

```rust
// 移除
// pub mod utils;

// 使用共享库
pub use maci_utils;
```

#### 2.3 更新所有导入

在 `contract.rs`、`multitest/` 等文件中：

**修改前:**
```rust
use crate::utils::{hash2, hash5, ...};
```

**修改后:**
```rust
use maci_utils::{hash2, hash5, ...};
```

#### 2.4 删除旧的 `utils.rs`

```bash
rm contracts/api-maci/src/utils.rs
```

---

### 步骤 3: 更新 registry（可选）

如果 `registry` 也使用相同的工具函数，可以按照相同步骤迁移。

---

## ✅ 验证迁移

### 编译测试

```bash
# 测试共享库
cd crates/maci-utils
cargo test

# 测试 amaci
cd ../../contracts/amaci
cargo check
cargo test

# 测试 api-maci
cd ../api-maci
cargo check
cargo test

# 测试整个 workspace
cd ../../
cargo check --workspace
cargo test --workspace
```

### 功能验证

确保以下功能正常：
- ✅ Poseidon hash2/hash5
- ✅ publish_message
- ✅ 所有使用 utils 的功能

---

## 📊 迁移对比

### 代码变化

| 项目 | 修改前 | 修改后 | 变化 |
|------|--------|--------|------|
| **amaci** | 独立 utils.rs (137 行) | 使用 maci-utils | -137 行 |
| **api-maci** | 独立 utils.rs (136 行, 旧版) | 使用 maci-utils | -136 行, +优化 |
| **共享库** | 不存在 | maci-utils (~200 行) | 新增 |
| **总计** | ~273 行重复 | ~200 行共享 | **-73 行** |

### 性能提升

| 合约 | 优化前 | 优化后 |
|------|--------|--------|
| **amaci** | ✅ 已优化 | ✅ 保持 |
| **api-maci** | ❌ 未优化 | ✅ **获得优化** |

**api-maci 的 publish_message Gas 节省**: **30-50%** 🎉

---

## 🔍 详细导入映射

### 所有可用函数

```rust
use maci_utils::{
    // Poseidon 哈希
    hash, hash2, hash5, hash_uint256, uint256_to_fr, Fr,
    
    // 类型转换
    hex_to_decimal, hex_to_uint256, 
    uint256_from_hex_string, uint256_to_hex,
    
    // SHA256
    encode_packed, hash_256_uint256_list,
};
```

---

## 🚨 注意事项

### 1. Fr 类型

**修改前:**
```rust
pub type Fr = poseidon_rs::Fr;
```

**修改后:**
```rust
use maci_utils::Fr;
```

### 2. contract.rs 中的 Fr

如果在 `contract.rs` 中使用了不同的 Fr (ff_ce::PrimeField):

```rust
// 保持不变
use ff_ce::PrimeField as Fr;

// 如果需要 poseidon Fr
use maci_utils::Fr as PoseidonFr;
```

### 3. 测试文件

确保更新所有测试文件中的导入：
- `multitest/tests.rs`
- `multitest/mod.rs`
- 其他测试模块

---

## 📝 完整示例

### amaci/src/contract.rs 迁移示例

**修改前:**
```rust
use crate::utils::{hash2, hash5, hash_256_uint256_list, uint256_from_hex_string};
use ff_ce::PrimeField as Fr;

pub fn hash_message_and_enc_pub_key(
    message: MessageData,
    enc_pub_key: PubKey,
    prev_hash: Uint256,
) -> Uint256 {
    let m_hash = hash5(m);
    let n_hash = hash5(n);
    let m_n_hash = hash2([m_hash, n_hash]);
    return m_n_hash;
}
```

**修改后:**
```rust
// 使用共享库
use maci_utils::{hash2, hash5, hash_256_uint256_list, uint256_from_hex_string};
use ff_ce::PrimeField as Fr;  // 保持不变

pub fn hash_message_and_enc_pub_key(
    message: MessageData,
    enc_pub_key: PubKey,
    prev_hash: Uint256,
) -> Uint256 {
    // 函数内容保持不变
    let m_hash = hash5(m);
    let n_hash = hash5(n);
    let m_n_hash = hash2([m_hash, n_hash]);
    return m_n_hash;
}
```

---

## 🎯 迁移检查清单

### amaci
- [ ] 更新 `Cargo.toml`
- [ ] 更新 `src/lib.rs`
- [ ] 更新 `src/contract.rs` 的导入
- [ ] 更新 `src/multitest/` 的导入
- [ ] 删除或备份 `src/utils.rs`
- [ ] 运行 `cargo check`
- [ ] 运行 `cargo test`

### api-maci
- [ ] 更新 `Cargo.toml`
- [ ] 更新 `src/lib.rs`
- [ ] 更新 `src/contract.rs` 的导入
- [ ] 更新 `src/multitest/` 的导入
- [ ] 删除或备份 `src/utils.rs`
- [ ] 运行 `cargo check`
- [ ] 运行 `cargo test`

### registry（可选）
- [ ] 评估是否需要迁移
- [ ] 如需要，按照相同步骤操作

---

## 📚 相关文档

- [maci-utils README](crates/maci-utils/README.md)
- [优化报告](contracts/amaci/OPTIMIZATION_REPORT.md)
- [Poseidon-rs 文档](https://github.com/arnaucube/poseidon-rs)

---

## 🆘 故障排除

### 编译错误：找不到 maci_utils

**问题**: `error: package maci_utils not found`

**解决方案**: 
```bash
# 确保在 workspace 根目录
cd /path/to/maci

# 重新构建
cargo clean
cargo build
```

### 类型不匹配错误

**问题**: `Fr` 类型不匹配

**解决方案**: 检查是否正确区分了 `poseidon_rs::Fr` 和 `ff_ce::PrimeField`

### 测试失败

**问题**: 某些测试失败

**解决方案**:
1. 检查所有导入是否正确更新
2. 确保 `maci-utils` 测试通过
3. 检查是否有遗漏的 `use crate::utils::...`

---

## ✨ 好处总结

1. **代码重用**: 消除重复代码
2. **性能优化**: api-maci 自动获得所有优化
3. **维护简化**: 一处更新，所有合约受益
4. **测试覆盖**: 共享库有独立的测试套件
5. **一致性**: 所有合约使用相同的实现
6. **模块化**: 更清晰的项目结构

---

**准备迁移时间**: ~30-60 分钟  
**风险等级**: 低（保持向后兼容）  
**收益**: 高（性能 + 可维护性）

