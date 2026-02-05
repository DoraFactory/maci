# MACI Message Hash 函数修复

## 问题描述

在将 `MessageData` 从 7 元素升级到 10 元素时，MACI 合约中的 `hash_message_and_enc_pub_key` 函数没有正确更新，导致消息哈希计算与电路不匹配。

## 错误的实现（已修复）

```rust
pub fn hash_message_and_enc_pub_key(
    message: &MessageData,
    enc_pub_key: &PubKey,
    prev_hash: Uint256,
) -> Uint256 {
    // 只使用前 5 个元素
    let mut m: [Uint256; 5] = [Uint256::zero(); 5];
    m[0] = message.data[0];
    m[1] = message.data[1];
    m[2] = message.data[2];
    m[3] = message.data[3];
    m[4] = message.data[4];

    // 只使用 message.data[5] 和 [6]，然后直接混入 pubkey 和 prev_hash
    let mut n: [Uint256; 5] = [Uint256::zero(); 5];
    n[0] = message.data[5];
    n[1] = message.data[6];
    n[2] = enc_pub_key.x;      // ❌ 错误：这里应该是 message.data[7]
    n[3] = enc_pub_key.y;      // ❌ 错误：这里应该是 message.data[8]
    n[4] = prev_hash;          // ❌ 错误：这里应该是 message.data[9]

    let m_hash = hash5(m);
    let n_hash = hash5(n);
    
    // ❌ 错误：直接组合两个哈希，没有包含完整的 message data
    let m_n_hash = hash2([m_hash, n_hash]);
    return m_n_hash;
}
```

### 问题分析

1. **未使用全部 10 个元素**: message.data[7], [8], [9] 被忽略
2. **哈希结构错误**: 使用 `hash2` 组合两个哈希，而不是 `hash5` 组合所有必要元素
3. **与电路不匹配**: 电路使用 `Hasher13` (10 个 message 元素 + 2 个 pubkey + 1 个 prev_hash)

## 正确的实现

```rust
pub fn hash_message_and_enc_pub_key(
    message: &MessageData,
    enc_pub_key: &PubKey,
    prev_hash: Uint256,
) -> Uint256 {
    // Hash first 5 elements of the message
    let mut m: [Uint256; 5] = [Uint256::zero(); 5];
    m[0] = message.data[0];
    m[1] = message.data[1];
    m[2] = message.data[2];
    m[3] = message.data[3];
    m[4] = message.data[4];
    let m_hash = hash5(m);

    // Hash next 5 elements of the message (使用所有 10 个元素)
    let mut n: [Uint256; 5] = [Uint256::zero(); 5];
    n[0] = message.data[5];
    n[1] = message.data[6];
    n[2] = message.data[7];    // ✅ 正确：使用 message.data[7]
    n[3] = message.data[8];    // ✅ 正确：使用 message.data[8]
    n[4] = message.data[9];    // ✅ 正确：使用 message.data[9]
    let n_hash = hash5(n);

    // Final hash combining message hashes, public key, and previous hash
    // This matches the circuit's Hasher13 structure:
    // hasher5([m_hash, n_hash, encPubKey[0], encPubKey[1], prevHash])
    let final_hash = hash5([m_hash, n_hash, enc_pub_key.x, enc_pub_key.y, prev_hash]);

    return final_hash;
}
```

## 电路实现参考

### messageHasher.circom

```circom
template MessageHasher() {
    signal input in[10];  // Changed from 7 to 10
    signal input encPubKey[2];
    signal input prevHash;
    signal output hash;

    component hasher = Hasher13();  // Changed from Hasher10 to Hasher13 (10 + 2 + 1 = 13)

    for (var i = 0; i < 10; i ++) {  // Changed from 7 to 10
        hasher.in[i] <== in[i];
    }
    hasher.in[10] <== encPubKey[0];   // Shifted from in[7]
    hasher.in[11] <== encPubKey[1];   // Shifted from in[8]
    hasher.in[12] <== prevHash;       // Shifted from in[9]

    hash <== hasher.hash;
}
```

### hasherPoseidon.circom - Hasher13

```circom
template Hasher13() {
    // Hasher5(
    //     Hasher5_1(in[0], in[1], in[2], in[3], in[4]),
    //     Hasher5_2(in[5], in[6], in[7], in[8], in[9])
    //     in[10],
    //     in[11],
    //     in[12]
    // )

    signal input in[13];
    signal output hash;
    ...
}
```

## 哈希计算流程

### 1. 对 message 的前 5 个元素计算哈希
```
m_hash = hash5(message.data[0..4])
```

### 2. 对 message 的后 5 个元素计算哈希
```
n_hash = hash5(message.data[5..9])
```

### 3. 最终哈希组合所有元素
```
final_hash = hash5([m_hash, n_hash, enc_pub_key.x, enc_pub_key.y, prev_hash])
```

这样总共哈希了 13 个元素：
- 10 个 message 元素（通过两次 hash5 压缩为 2 个哈希值）
- 2 个 public key 坐标
- 1 个 previous hash

## 影响范围

这个修复影响以下功能：
1. **消息发布**: `execute_publish_message`
2. **批量消息发布**: `execute_publish_batch_message`
3. **消息哈希链验证**: 所有依赖 `hash_message_and_enc_pub_key` 的地方

## 验证

修复后与 AMACI 的实现完全一致，符合电路 `Hasher13` 的要求。

## 相关文件

- `/Users/feng/Desktop/dora-work/new/maci/contracts/maci/src/contract.rs:1671`
- `/Users/feng/Desktop/dora-work/new/maci/contracts/amaci/src/contract.rs:2341` (参考实现)
- `/Users/feng/Desktop/dora-work/new/maci/packages/circuits/circom/utils/messageHasher.circom`
- `/Users/feng/Desktop/dora-work/new/maci/packages/circuits/circom/utils/hasherPoseidon.circom`

## 修复日期

2026-02-01
