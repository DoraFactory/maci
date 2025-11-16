# MACI Utils

共享的 MACI 工具函数库，用于所有 MACI 相关合约。

## 📦 功能

### Poseidon 哈希 (ZK-Friendly)
- ✅ `hash2` - 哈希 2 个 Uint256 值（用于 Merkle 树）
- ✅ `hash5` - 哈希 5 个 Uint256 值（用于消息哈希）
- ✅ `hash_uint256` - 哈希单个 Uint256
- ✅ **性能优化**: 缓存 Poseidon 实例，避免重复初始化

### 类型转换
- `uint256_from_hex_string` - Hex 字符串 → Uint256
- `uint256_to_hex` - Uint256 → Hex 字符串
- `hex_to_decimal` - Hex → [u8; 32]
- `hex_to_uint256` - Hex → Uint256
- `uint256_to_fr` - Uint256 → Fr (Field Element)

### SHA256 工具
- `hash_256_uint256_list` - SHA256 哈希 Uint256 数组
- `encode_packed` - 打包多个 32 字节数组

## 🚀 使用方法

### 在 Cargo.toml 中添加依赖

```toml
[dependencies]
maci-utils = { path = "../../crates/maci-utils" }
```

### 在代码中使用

```rust
use maci_utils::{hash2, hash5, uint256_from_hex_string};
use cosmwasm_std::Uint256;

// Poseidon hash
let data = [Uint256::from_u128(1), Uint256::from_u128(2)];
let result = hash2(data);

// Hex conversion
let value = uint256_from_hex_string("0xff");
```

## ⚡ 性能优化

### Poseidon 实例缓存

**问题**: 每次创建 `Poseidon::new()` 需要加载 1000+ 常量

**解决方案**: 使用 `OnceLock` 缓存单例

```rust
static POSEIDON_INSTANCE: OnceLock<Poseidon> = OnceLock::new();
```

**效果**: 首次调用后，所有后续哈希操作零初始化成本

**Gas 节省**: 30-50% (频繁调用场景)

## 📋 测试

```bash
cd crates/maci-utils
cargo test
```

## 📚 文档

查看完整优化报告：[OPTIMIZATION_REPORT.md](../../contracts/amaci/OPTIMIZATION_REPORT.md)

