# ZK-Kit Integration Tests

这个目录包含了用于测试 Rust 实现的 Baby Jubjub 和 EdDSA-Poseidon 与 TypeScript 的 @zk-kit 库的兼容性测试。

## 概述

我们已经实现了 Rust 版本的两个核心加密原语：

- **crates/baby-jubjub**: Baby Jubjub 椭圆曲线操作
- **crates/eddsa-poseidon**: EdDSA 签名（使用 Poseidon 哈希）

这些测试验证我们的 Rust 实现与标准的 TypeScript 实现（@zk-kit）产生相同的结果。

## 架构

### 1. 测试向量生成（Rust）

位于 `crates/crypto-test-gen/`，包含两个二进制程序：

- `generate-baby-jubjub-vectors`: 生成 Baby Jubjub 测试向量
- `generate-eddsa-poseidon-vectors`: 生成 EdDSA-Poseidon 测试向量

这些程序使用我们的 Rust 实现生成测试数据，输出到 `e2e/crypto-test/*.json`。

### 2. E2E 测试（TypeScript）

位于 `e2e/tests/`，包含：

- `baby-jubjub.e2e.test.ts`: Baby Jubjub 兼容性测试
- `eddsa-poseidon.e2e.test.ts`: EdDSA-Poseidon 兼容性测试

这些测试加载 Rust 生成的测试向量，并使用 @zk-kit 库验证结果一致性。

## 使用方法

### 生成测试向量

从项目根目录运行：

```bash
# 生成 Baby Jubjub 测试向量
cargo run --bin generate-baby-jubjub-vectors

# 生成 EdDSA-Poseidon 测试向量
cargo run --bin generate-eddsa-poseidon-vectors

# 或者一次性生成所有向量
cd e2e
pnpm run generate:zk-kit-vectors
```

生成的文件：
- `e2e/crypto-test/baby-jubjub-test-vectors.json` (14 个测试向量)
- `e2e/crypto-test/eddsa-poseidon-test-vectors.json` (9 个测试向量)

### 运行测试

```bash
cd e2e

# 运行 Baby Jubjub 测试
pnpm run test:baby-jubjub

# 运行 EdDSA-Poseidon 测试
pnpm run test:eddsa-poseidon

# 运行所有 zk-kit 测试
pnpm run test:zk-kit
```

## 测试覆盖

### Baby Jubjub 测试

1. **Point Addition** (addPoint)
   - 单位元 + Base8
   
2. **Scalar Multiplication** (mulPointEscalar)
   - 多个标量值测试: 1, 2, 100, 324, 1000
   
3. **Pack/Unpack Points** (packPoint/unpackPoint)
   - 标准点打包/解包
   - 小 Y 坐标值（< 32 字节）
   
4. **Point Validation** (inCurve)
   - 有效点验证（Base8）
   - 无效点检测 [1, 0]

5. **Base8 Point**
   - 验证 Base8 点坐标
   - 验证 Base8 在曲线上

### EdDSA-Poseidon 测试

1. **Public Key Derivation** (derivePublicKey)
   - 字符串输入: "secret"
   - Buffer 输入: [115, 101, 99, 114, 101, 116]
   - Uint8Array 输入: [3, 2]
   - Secret scalar 验证

2. **Message Signing** (signMessage)
   - BigInt 消息: 2, 22
   - 十六进制消息: 0x12
   - 字符串消息: "message"
   - R8 点和 S 值验证

3. **Signature Verification** (verifySignature)
   - 所有签名消息的验证
   - 详细的消息 2 验证测试

4. **Signature Packing/Unpacking** (packSignature/unpackSignature)
   - 64 字节签名打包
   - 签名解包和重建

5. **Public Key Packing/Unpacking** (packPublicKey/unpackPublicKey)
   - 公钥打包到 BigInt
   - 公钥解包验证

## 测试结果

### Baby Jubjub
```
✓ 5 passing (15ms)
- 14 test vectors processed
- All operations match @zk-kit/baby-jubjub
```

### EdDSA-Poseidon
```
✓ 7 passing (575ms)
- 9 test vectors processed
- All operations match @zk-kit/eddsa-poseidon
```

## 依赖

### Rust 依赖
- `baby-jubjub`: 我们的 Baby Jubjub 实现
- `eddsa-poseidon`: 我们的 EdDSA-Poseidon 实现
- `ark-*`: Arkworks 加密库
- `serde_json`: JSON 序列化

### TypeScript 依赖
- `@zk-kit/baby-jubjub ^1.0.3`: Baby Jubjub 参考实现
- `@zk-kit/eddsa-poseidon ^1.1.0`: EdDSA-Poseidon 参考实现
- `mocha` + `chai`: 测试框架

## 实现细节

### Baby Jubjub (Rust)

实现位于 `crates/baby-jubjub/src/lib.rs`：

- 使用 Arkworks 的椭圆曲线库
- Edwards 曲线形式: `ax² + y² = 1 + dx²y²`
- 参数匹配 EIP-2494 标准
- Base8 点用于子群操作

主要函数:
- `add_point()`: 点加法
- `mul_point_escalar()`: 标量乘法
- `pack_point()` / `unpack_point()`: 点压缩
- `in_curve()`: 曲线点验证

### EdDSA-Poseidon (Rust)

实现位于 `crates/eddsa-poseidon/src/eddsa.rs`：

- 使用 Baby Jubjub 曲线
- Poseidon 哈希（5 输入）
- 支持 BLAKE-512 和 BLAKE2b 密钥派生

主要函数:
- `derive_secret_scalar()`: 从私钥派生秘密标量
- `derive_public_key()`: 公钥派生
- `sign_message()`: 消息签名
- `verify_signature()`: 签名验证
- `pack_signature()` / `unpack_signature()`: 签名序列化

## 开发

### 添加新测试向量

1. 编辑 `crates/crypto-test-gen/src/bin/generate_*_vectors.rs`
2. 添加新的测试案例到 `generate_vectors()` 函数
3. 重新生成向量: `cargo run --bin generate-*-vectors`
4. TypeScript 测试会自动加载新向量

### 调试测试失败

如果测试失败，检查：

1. **向量生成**: 确保 Rust 向量已生成
   ```bash
   ls -la e2e/crypto-test/*.json
   ```

2. **类型匹配**: 确保 TypeScript 类型定义匹配 JSON 结构

3. **数值精度**: 使用 `BigInt` 避免精度损失

4. **字节序**: 确保大小端一致（通常使用 little-endian）

## 参考

- [Baby Jubjub EIP-2494](https://eips.ethereum.org/EIPS/eip-2494)
- [zk-kit Documentation](https://github.com/privacy-scaling-explorations/zk-kit)
- [Arkworks Libraries](https://github.com/arkworks-rs)
- [Poseidon Hash](https://www.poseidon-hash.info/)

## 许可证

与主项目相同的许可证。

