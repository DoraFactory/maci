# EdDSA-Poseidon 兼容性问题分析

## 问题描述

`derive_public_key` 的结果与 zk-kit 的 TypeScript 实现不一致。

## 测试结果对比

### Private Key: `"secret"`

| 项目 | TypeScript (zk-kit) | Rust (当前实现) |
|------|---------------------|----------------|
| Secret Scalar | 6544992227624943856419766050818315045047569225455760139072025985369615672473 | 1382210768575369297839618037490482531253077113020039315859356910596302315976 |
| Public Key X | 17191193026255111087474416516591393721975640005415762645730433950079177536248 | 19889909361523696824181732189551155109995417824892832227485067161041693688052 |
| Public Key Y | 13751717961795090314625781035919035073474308127816403910435238282697898234143 | 4354697277479249798454062864225152224301199978098253831081656899183935682233 |

**比例**: TypeScript / Rust ≈ 4:1

## 根本原因

**Blake-512 哈希实现差异**

### 我们的实现
- 手动从 TypeScript 逐行翻译
- Hash 输出: `567dd38eeec706d202f91a9ee8d8eb404afd4cbc974b482088fbcb819c0a3bb9`

### zk-kit 的实现
- 使用 `blake-hash` npm 包
- Hash 输出: 需要验证

## 可能的问题点

### 1. Blake-512 实现细节 ⭐ 最可能
- 字节序处理（特别是在压缩函数中）
- 整数溢出/回绕行为
- 填充逻辑
- 轮函数中的位操作

### 2. 已验证正确的部分 ✅
- UTF-8 编码（`b"secret"` vs `Buffer.from("secret")`）
- prune_buffer 逻辑
- Shift right 操作
- 模运算

## 解决方案

### 选项 1: 使用生产级 Rust Blake 库 (推荐)

```toml
[dependencies]
# 替代方案 1: 使用标准的 Blake crate
blake = "3.0"

# 替代方案 2: 使用 blake-hash (如果有 Rust 版本)
# 需要找到与 npm blake-hash 兼容的 Rust 实现
```

**优点**:
- 经过充分测试
- 性能优化
- 与标准实现兼容

**缺点**:
- 需要验证与 npm blake-hash 的兼容性

### 选项 2: 调试当前实现

**步骤**:
1. 在 TypeScript 中打印 Blake-512 的中间步骤
2. 在 Rust 中对比每一步
3. 找出第一个差异点
4. 修复实现

**优点**:
- 完全控制实现
- 教育价值

**缺点**:
- 耗时
- 可能仍有隐藏的 bug

### 选项 3: 使用 Blake2b (临时方案)

```rust
// 测试 Blake2b 是否有更好的兼容性
let result = derive_public_key(private_key, HashingAlgorithm::Blake2b)?;
```

**注意**: 需要 zk-kit 也支持 Blake2b 才能对比

## 测试方法

### 运行调试示例

```bash
cargo run --example debug_comparison
cargo run --example analyze_difference
```

### 获取 TypeScript 的哈希输出

```typescript
import Blake512 from "./blake"

const privateKey = Buffer.from("secret")
const hasher = new Blake512()
hasher.update(privateKey)
const hash = hasher.digest()

console.log("Hash (hex):", hash.toString('hex'))
console.log("First 32 bytes:", hash.slice(0, 32).toString('hex'))
```

### 对比步骤

1. Blake-512 hash 输出
2. Prune 后的值
3. Shift right 后的值
4. Mod subOrder 后的值 (secret scalar)
5. Base8 * scalar 的结果 (public key)

## 当前状态

- ✅ 代码结构完整
- ✅ API 与 zk-kit 一致
- ✅ 基本功能实现
- ⚠️  Blake-512 需要调试或替换
- ✅ Blake2b 可能已经正确（需要测试）

## 建议的下一步

1. **立即**: 尝试使用成熟的 Rust Blake 库
2. **验证**: 与 TypeScript 对比 hash 输出
3. **测试**: Blake2b 算法的兼容性
4. **决定**: 保留手动实现还是使用库

## 相关文件

- `crates/eddsa-poseidon/src/blake512.rs` - 当前的 Blake-512 实现
- `crates/eddsa-poseidon/src/eddsa.rs` - 密钥派生逻辑
- `crates/eddsa-poseidon/examples/debug_comparison.rs` - 调试工具
- `crates/eddsa-poseidon/examples/analyze_difference.rs` - 分析工具

