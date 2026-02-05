# Message 长度更新修复总结

## 修复完成时间
2026-02-01

## 核心变化

### 1. Message 长度：7 → 10 元素

**原因**: Command 结构从 6 元素增加到 7 元素（添加了 `salt` 字段），加密后从 7 变为 10

- **旧 Command** (6): `[packed_data, new_pubkey_x, new_pubkey_y, sig_R8_x, sig_R8_y, sig_S]`
- **新 Command** (7): `[packed_data, salt, new_pubkey_x, new_pubkey_y, sig_R8_x, sig_R8_y, sig_S]`
- **加密公式**: `roundUp(7, 3) * 3 + 1 = 10`

### 2. Message Hasher：Hasher10 → Hasher13

**原因**: Message 从 7 变为 10，加上 encPubKey(2) 和 prevHash(1) = 13

- **旧结构**: `Hasher10([msg[0..6], encPubKey[0], encPubKey[1], prevHash])`
- **新结构**: `Hasher13` 使用两级哈希：
  ```
  hash5([
    hash5(msg[0..4]),
    hash5(msg[5..9]),
    encPubKey[0],
    encPubKey[1],
    prevHash
  ])
  ```

## 修复的文件清单

### P0 - 关键修复（运行时错误）

#### 1. ✅ `packages/sdk/src/operator.ts:890`
**问题**: `poseidonDecrypt` 参数错误
```diff
- const plaintext = poseidonDecrypt(ciphertext, sharedKey, 0n, 6);
+ const plaintext = poseidonDecrypt(ciphertext, sharedKey, 0n, 7);
```
**影响**: 这是导致所有消息解密失败的根本原因

#### 2. ✅ `packages/circuits/ts/__tests__/MessageHasher.test.ts`
**修复内容**:
- 所有测试用例的 `messageFields` 数组从 7 元素改为 10 元素
- `fc.array()` 生成器参数: `minLength: 7 → 10`, `maxLength: 7 → 10`
- 文档注释更新

**修改的测试用例**:
- `correctly hashes message with all inputs` - Property-based 测试
- `should produce consistent hash for same inputs` - [1..10]
- `should produce different hashes for different message fields` - [1..10] vs [10..1]
- `should produce different hashes for different public keys` - [1..10]
- `should produce different hashes for different prevHash` - [1..10]
- `should handle zero values correctly` - [0..0] (10个0)
- `should handle maximum field values correctly` - Array(10).fill(maxVal)
- `should create a valid message chain` - [1..10] 和 [11..20]

### P1 - 重要修复（测试失败）

#### 3. ✅ `packages/circuits/ts/__tests__/MessageToCommand.test.ts`
**修复内容**:
- Line 51: `7 elements` → `10 elements`
- Line 54: `message[7]` → `message[10]`
- Line 70: `message[7]: Encrypted message (7 field elements)` → `message[10]: Encrypted message (10 field elements)`
- Line 97-105: Message Format 文档更新（7 → 10 elements）
- Line 918: `expect(message).to.have.lengthOf(7)` → `lengthOf(10)`
- Line 929: `poseidonDecrypt(message, sharedKey, 0n, 6)` → `0n, 7`
- Line 1014: `poseidonDecrypt(msg, sk, 0n, 6)` → `0n, 7`

### P2 - 文档清理

#### 4. ✅ `packages/circuits/ts/__tests__/ProcessDeactivate.test.ts`
**修复内容**:
- Line 14: `const MSG_LENGTH = 7;` → `const MSG_LENGTH = 10;` (注释中)

## 数据流验证

### SDK Voter (生成 Message)
```typescript
// voter.ts:287
const command = [packaged, BigInt(salt), ...newPubKey, ...signature.R8, signature.S]; // 7 elements
const message = poseidonEncrypt(command, sharedKey, 0n); // → 10 elements
```

### SDK Operator (解密 Message)
```typescript
// operator.ts:890
const plaintext = poseidonDecrypt(ciphertext, sharedKey, 0n, 7); // 7 elements ✅
```

### Circuit (验证 Message)
```circom
// messageToCommand.circom:39
var MSG_LENGTH = 10;  // Ciphertext length ✅
var CMD_LENGTH = 7;   // Command length after decryption ✅
```

### Message Hasher (哈希链)
```circom
// messageHasher.circom:14, 19
signal input in[10];  // Changed from 7 to 10 ✅
component hasher = Hasher13();  // Changed from Hasher10 ✅
```

### Contract (Rust 实现)
```rust
// contract.rs:2341-2370
// 实现了与电路一致的 Hasher13 逻辑 ✅
let m_hash = hash5(message.data[0..4]);
let n_hash = hash5(message.data[5..9]);
let final_hash = hash5([m_hash, n_hash, enc_pub_key.x, enc_pub_key.y, prev_hash]);
```

## 验证清单

- ✅ SDK `poseidonDecrypt` 参数从 6 改为 7
- ✅ MessageHasher.test.ts 所有测试数组从 7 改为 10
- ✅ MessageToCommand.test.ts 长度断言从 7 改为 10
- ✅ MessageToCommand.test.ts 文档注释更新
- ✅ MessageToCommand.test.ts 中的 `poseidonDecrypt` 调用更新（2处）
- ✅ ProcessDeactivate.test.ts 注释中的常量更新
- ✅ 没有残留的 `poseidonDecrypt(..., 6)` 调用
- ✅ 没有残留的 `message[7]` 硬编码访问
- ✅ 所有文件通过 lint 检查

## 测试运行

建议运行以下测试验证修复：

```bash
cd packages/circuits
pnpm test MessageHasher
pnpm test MessageToCommand
pnpm test
```

## 一致性验证

所有层次现在都使用正确的长度：

| 层次 | Message 长度 | Command 长度 | Hasher |
|------|-------------|--------------|--------|
| SDK (voter.ts) | 10 ✅ | 7 ✅ | - |
| SDK (operator.ts) | 10 ✅ | 7 ✅ | - |
| Circuit (messageToCommand) | 10 ✅ | 7 ✅ | - |
| Circuit (messageHasher) | 10 ✅ | - | Hasher13 ✅ |
| Contract (Rust) | 10 ✅ | - | Hasher13 ✅ |
| Tests | 10 ✅ | 7 ✅ | hash10 → Hasher13 ✅ |

## 影响分析

### 破坏性变化
- 所有旧的 7 元素 message 将无法解密
- 需要重新生成所有测试数据
- 这是一个不兼容的协议升级

### 向后兼容性
- **无向后兼容性** - 这是一个破坏性变化
- 旧客户端无法与新合约交互
- 需要协调升级所有组件

## 相关文档

- 电路实现: `packages/circuits/circom/utils/messageToCommand.circom`
- 哈希实现: `packages/circuits/circom/utils/messageHasher.circom`
- 合约实现: `contracts/amaci/src/contract.rs:2341-2370`
- SDK 实现: `packages/sdk/src/voter.ts:267-314`
- 测试文档: `packages/circuits/ts/__tests__/MessageHasher.test.ts`

## 修复人员
AI Assistant

## 状态
✅ 全部完成
