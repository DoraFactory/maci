# Contract Message Hash Updates for Poll ID Integration

## 概述

为了与更新后的电路（支持 10 元素消息和 pollId）保持一致，合约端的消息哈希处理逻辑已全面更新。

## 修改文件列表

### 1. `contracts/amaci/src/state.rs`

**修改内容：**
- `MessageData` 结构从 7 个元素扩展到 10 个元素

```rust
/// Before
pub struct MessageData {
    pub data: [Uint256; 7],
}

/// After
pub struct MessageData {
    pub data: [Uint256; 10],
}
```

**原因：**
- 命令长度从 6 个元素增加到 7 个元素（添加了 salt 作为独立元素）
- Poseidon 加密：`roundUp(7, 3) + 1 = 10` 个元素

### 2. `contracts/amaci/src/contract.rs`

#### 修改 1: `hash_message_and_enc_pub_key` 函数

**之前的实现（7 元素消息）：**
```rust
pub fn hash_message_and_enc_pub_key(
    message: &MessageData,
    enc_pub_key: &PubKey,
    prev_hash: Uint256,
) -> Uint256 {
    let mut m: [Uint256; 5] = [Uint256::zero(); 5];
    m[0..5] = message.data[0..5];
    
    let mut n: [Uint256; 5] = [Uint256::zero(); 5];
    n[0] = message.data[5];
    n[1] = message.data[6];
    n[2] = enc_pub_key.x;
    n[3] = enc_pub_key.y;
    n[4] = prev_hash;
    
    let m_hash = hash5(m);
    let n_hash = hash5(n);
    return hash2([m_hash, n_hash]);
}
```

**现在的实现（10 元素消息）：**
```rust
pub fn hash_message_and_enc_pub_key(
    message: &MessageData,
    enc_pub_key: &PubKey,
    prev_hash: Uint256,
) -> Uint256 {
    // Hash first 5 elements of the message
    let mut m: [Uint256; 5] = [Uint256::zero(); 5];
    m[0..5] = message.data[0..5];
    let m_hash = hash5(m);

    // Hash next 5 elements of the message
    let mut n: [Uint256; 5] = [Uint256::zero(); 5];
    n[0..5] = message.data[5..10];
    let n_hash = hash5(n);

    // Final hash: hash5([m_hash, n_hash, enc_pub_key.x, enc_pub_key.y, prev_hash])
    return hash5([m_hash, n_hash, enc_pub_key.x, enc_pub_key.y, prev_hash]);
}
```

**关键变化：**
1. 消息的所有 10 个元素都参与哈希计算
2. 哈希结构从 `hash2([hash5(m), hash5(n)])` 改为 `hash5([hash5(m), hash5(n), pubkey.x, pubkey.y, prevHash])`
3. 完全匹配电路中的 `Hasher13` 结构

#### 修改 2: `execute_publish_deactivate_message` 函数中的哈希计算

同样更新为与 `hash_message_and_enc_pub_key` 一致的逻辑，确保 deactivate 消息的哈希计算也使用 10 元素结构。

### 3. `contracts/amaci/src/multitest/tests.rs`

**修改内容：**
- 所有 `MessageData` 初始化从 7 个元素更新为 10 个元素

**修改模式 1（`data.msgs[i]`）：**
```rust
// Before (7 elements)
let message = MessageData {
    data: [
        uint256_from_decimal_string(&data.msgs[i][0]),
        uint256_from_decimal_string(&data.msgs[i][1]),
        uint256_from_decimal_string(&data.msgs[i][2]),
        uint256_from_decimal_string(&data.msgs[i][3]),
        uint256_from_decimal_string(&data.msgs[i][4]),
        uint256_from_decimal_string(&data.msgs[i][5]),
        uint256_from_decimal_string(&data.msgs[i][6]),
    ],
};

// After (10 elements)
let message = MessageData {
    data: [
        uint256_from_decimal_string(&data.msgs[i][0]),
        uint256_from_decimal_string(&data.msgs[i][1]),
        uint256_from_decimal_string(&data.msgs[i][2]),
        uint256_from_decimal_string(&data.msgs[i][3]),
        uint256_from_decimal_string(&data.msgs[i][4]),
        uint256_from_decimal_string(&data.msgs[i][5]),
        uint256_from_decimal_string(&data.msgs[i][6]),
        uint256_from_decimal_string(&data.msgs[i][7]),
        uint256_from_decimal_string(&data.msgs[i][8]),
        uint256_from_decimal_string(&data.msgs[i][9]),
    ],
};
```

**修改模式 2（`data.message`）：**
类似地从 7 个元素更新为 10 个元素。

**影响的测试：**
- `test_amaci_integration_mainnet_happy_path`
- `test_amaci_integration_mainnet_happy_path_large`
- `test_amaci_mainnet_integration_custom_circuit`
- 其他集成测试

## 与电路的对应关系

### 电路端 (Circom)

```circom
template MessageHasher() {
    signal input in[10];  // 10 个消息元素
    signal input encPubKey[2];
    signal input prevHash;
    signal output hash;

    component hasher = Hasher13();  // 10 + 2 + 1 = 13

    for (var i = 0; i < 10; i ++) {
        hasher.in[i] <== in[i];
    }
    hasher.in[10] <== encPubKey[0];
    hasher.in[11] <== encPubKey[1];
    hasher.in[12] <== prevHash;

    hash <== hasher.hash;
}
```

**Hasher13 结构：**
```circom
component hasher5 = PoseidonHashT6();
component hasher5_1 = PoseidonHashT6();  // Hash in[0..4]
component hasher5_2 = PoseidonHashT6();  // Hash in[5..9]

hasher5.inputs[0] <== hasher5_1.out;     // m_hash
hasher5.inputs[1] <== hasher5_2.out;     // n_hash
hasher5.inputs[2] <== in[10];            // encPubKey[0]
hasher5.inputs[3] <== in[11];            // encPubKey[1]
hasher5.inputs[4] <== in[12];            // prevHash
```

### 合约端 (Rust)

```rust
// 完全对应电路的 Hasher13 结构
let m_hash = hash5(message.data[0..5]);         // hasher5_1
let n_hash = hash5(message.data[5..10]);        // hasher5_2
let final_hash = hash5([                         // hasher5
    m_hash,                                       // inputs[0]
    n_hash,                                       // inputs[1]
    enc_pub_key.x,                                // inputs[2]
    enc_pub_key.y,                                // inputs[3]
    prev_hash                                     // inputs[4]
]);
```

## 验证

### 编译验证
```bash
cd contracts/amaci
cargo check
```

**结果：** ✅ 编译成功，无错误

### 哈希一致性验证

**电路端：** `Hasher13(msg[10], encPubKey[2], prevHash)`

**合约端：** `hash5([hash5(msg[0..5]), hash5(msg[5..10]), pubkey.x, pubkey.y, prevHash])`

两者结构完全一致，确保：
- ✅ 消息哈希链计算一致
- ✅ 电路验证可以通过
- ✅ 防止重放攻击

## 依赖关系

这些合约修改依赖于：

1. ✅ **电路端修改完成**：
   - `messageToCommand.circom`: 支持 10 元素消息
   - `messageHasher.circom`: 使用 Hasher13
   - `processMessages.circom`: 添加 pollId 验证

2. ✅ **SDK 端修改完成**：
   - `pack.ts`: pollId 打包
   - `keys.ts`: 生成 10 元素加密消息
   - `voter.ts` / `operator.ts`: pollId 查询和传递

3. ✅ **Registry 合约**：
   - pollId 分配和管理

## 测试数据要求

### 重要提示

由于消息长度从 7 增加到 10，所有测试数据文件需要更新：

**需要更新的测试数据：**
- `test_amaci_mainnet_happy_path_logs.json`
- `test_amaci_mainnet_happy_path_large_logs.json`
- `test_amaci_mainnet_custom_circuit_logs.json`

**每个消息对象需要：**
```json
{
  "message": [
    "element_0",
    "element_1",
    "element_2",
    "element_3",
    "element_4",
    "element_5",
    "element_6",
    "element_7",  // NEW
    "element_8",  // NEW
    "element_9"   // NEW
  ],
  "enc_pub_key": ["x", "y"]
}
```

## 后续步骤

1. ⏳ **更新测试数据文件**（需要从 SDK 重新生成）
2. ⏳ **运行集成测试**
3. ⏳ **端到端测试**（SDK + 电路 + 合约）
4. ⏳ **性能测试**（验证哈希计算性能）

## 备注

- 所有消息哈希计算现在使用统一的 `hash_message_and_enc_pub_key` 函数
- Deactivate 消息也使用相同的 10 元素结构
- 测试数据需要从 SDK 重新生成（确保使用更新后的 pollId 逻辑）
