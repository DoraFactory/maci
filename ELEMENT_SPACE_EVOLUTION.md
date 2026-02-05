# Message Structure Evolution: 7-Element to 10-Element

## 概述

为了支持 `pollId` 防止重放攻击，我们对消息结构进行了重大调整。本文档详细记录了整个变化过程，包括位空间分配、命令长度和加密消息长度的变化。

---

## 1. Packed Data 位空间分配变化

### 1.1 旧版本（无 pollId）

**总空间：248 bits**

```
┌─────────────────────────────────────────────────────────────────┐
│                     Packed Data (248 bits)                       │
├────────┬────────┬────────┬──────────┬──────────────────────────┤
│ nonce  │stateIdx│ voIdx  │ newVotes │         salt             │
│ 32bits │ 32bits │ 32bits │  96bits  │        56bits            │
├────────┼────────┼────────┼──────────┼──────────────────────────┤
│  0-31  │ 32-63  │ 64-95  │  96-191  │       192-247            │
└────────┴────────┴────────┴──────────┴──────────────────────────┘
```

**字段说明：**
| 字段 | 位置 | 长度 | 最大值 | 用途 |
|------|------|------|--------|------|
| `nonce` | 0-31 | 32 bits | 2³² - 1 | 命令序号，防止重放 |
| `stateIdx` | 32-63 | 32 bits | 2³² - 1 | 用户在状态树中的索引 |
| `voIdx` | 64-95 | 32 bits | 2³² - 1 | 投票选项索引 |
| `newVotes` | 96-191 | 96 bits | 2⁹⁶ - 1 | 新的投票权重 |
| `salt` | 192-247 | 56 bits | 2⁵⁶ - 1 | 随机盐值 |

**问题：**
- ❌ `salt` 占用了 56 bits，但在电路中被忽略（电路只解包前 192 bits）
- ❌ 没有空间添加 `pollId`
- ❌ 无法防止跨 poll 的重放攻击

### 1.2 新版本（带 pollId）

**总空间：224 bits**

```
┌─────────────────────────────────────────────────────────────────┐
│                     Packed Data (224 bits)                       │
├────────┬────────┬────────┬──────────┬────────────────────────────┤
│ nonce  │stateIdx│ voIdx  │ newVotes │        pollId              │
│ 32bits │ 32bits │ 32bits │  96bits  │       32bits               │
├────────┼────────┼────────┼──────────┼────────────────────────────┤
│  0-31  │ 32-63  │ 64-95  │  96-191  │       192-223              │
└────────┴────────┴────────┴──────────┴────────────────────────────┘

Salt 作为独立的命令元素存储（不在 packed data 中）
```

**字段说明：**
| 字段 | 位置 | 长度 | 最大值 | 用途 |
|------|------|------|--------|------|
| `nonce` | 0-31 | 32 bits | 2³² - 1 (4,294,967,295) | 命令序号 |
| `stateIdx` | 32-63 | 32 bits | 2³² - 1 (4,294,967,295) | 状态索引 |
| `voIdx` | 64-95 | 32 bits | 2³² - 1 (4,294,967,295) | 投票选项 |
| `newVotes` | 96-191 | 96 bits | 2⁹⁶ - 1 (~7.9×10²⁸) | 投票权重 |
| `pollId` | 192-223 | 32 bits | 2³² - 1 (4,294,967,295) | 轮次标识 |

**改进：**
- ✅ `pollId` 占用 32 bits，足够支持 42 亿个独立的 poll
- ✅ `salt` 移出 packed data，作为独立的命令元素
- ✅ 可以防止跨 poll 的重放攻击
- ✅ 电路可以验证所有 224 bits

### 1.3 位空间对比图

```
┌─────────────────────── 旧版 (248 bits) ────────────────────────┐
│ nonce │stateIdx│ voIdx │    newVotes    │        salt         │
│  32b  │  32b   │  32b  │      96b       │        56b          │
└────────────────────────────────────────────────────────────────┘
                                           ↓ 重新设计
┌─────────────────────── 新版 (224 bits) ────────────────────────┐
│ nonce │stateIdx│ voIdx │    newVotes    │      pollId         │
│  32b  │  32b   │  32b  │      96b       │       32b           │
└────────────────────────────────────────────────────────────────┘
                                           + salt (独立元素)
```

---

## 2. Command 数组结构变化

### 2.1 旧版本（6 元素）

```javascript
command = [
  packed_data,     // 包含: nonce, stateIdx, voIdx, newVotes, salt
  new_pubkey_x,    // 新公钥 x 坐标
  new_pubkey_y,    // 新公钥 y 坐标
  sig_R8_x,        // 签名 R8 点 x 坐标
  sig_R8_y,        // 签名 R8 点 y 坐标
  sig_S            // 签名 S 值
]
```

**长度：6 个 field elements**

**结构图：**
```
Command Array (6 elements)
┌──────────────────────────────────────────────────┐
│  Index  │  Content                                │
├─────────┼─────────────────────────────────────────┤
│    0    │  packed_data (248 bits)                │ ← 包含所有投票数据 + salt
│    1    │  new_pubkey_x                          │
│    2    │  new_pubkey_y                          │
│    3    │  sig_R8_x                              │
│    4    │  sig_R8_y                              │
│    5    │  sig_S                                 │
└─────────┴─────────────────────────────────────────┘
```

### 2.2 新版本（7 元素）

```javascript
command = [
  packed_data,     // 包含: nonce, stateIdx, voIdx, newVotes, pollId
  salt,            // 独立的盐值
  new_pubkey_x,    // 新公钥 x 坐标
  new_pubkey_y,    // 新公钥 y 坐标
  sig_R8_x,        // 签名 R8 点 x 坐标
  sig_R8_y,        // 签名 R8 点 y 坐标
  sig_S            // 签名 S 值
]
```

**长度：7 个 field elements**

**结构图：**
```
Command Array (7 elements)
┌──────────────────────────────────────────────────┐
│  Index  │  Content                                │
├─────────┼─────────────────────────────────────────┤
│    0    │  packed_data (224 bits)                │ ← 包含投票数据 + pollId
│    1    │  salt (独立元素)                        │ ← 新增：从 packed_data 分离
│    2    │  new_pubkey_x                          │
│    3    │  new_pubkey_y                          │
│    4    │  sig_R8_x                              │
│    5    │  sig_R8_y                              │
│    6    │  sig_S                                 │
└─────────┴─────────────────────────────────────────┘
```

### 2.3 Command 对比表

| 属性 | 旧版本 | 新版本 | 变化 |
|------|--------|--------|------|
| **命令长度** | 6 elements | 7 elements | +1 element |
| **packed_data 大小** | 248 bits | 224 bits | -24 bits |
| **salt 位置** | packed_data[192:247] | command[1] (独立) | 分离为独立元素 |
| **pollId 位置** | ❌ 不存在 | packed_data[192:223] | ✅ 新增 |
| **签名覆盖范围** | hash(packed_data, new_pubkey) | hash(packed_data, salt, new_pubkey) | salt 也参与签名 |

---

## 3. 加密后 Message 长度变化

### 3.1 Poseidon 加密机制

Poseidon 加密使用分组密码模式，每组处理 3 个 field elements。

**加密长度计算公式：**
```
encrypted_length = ceil(command_length / 3) * 3 + 1
```

其中 `+1` 是加密算法添加的校验元素。

### 3.2 旧版本

**计算：**
```
command_length = 6
encrypted_length = ceil(6 / 3) * 3 + 1
                 = ceil(2) * 3 + 1
                 = 2 * 3 + 1
                 = 7 elements
```

**加密过程可视化：**
```
Command (6 elements)
┌─────┬─────┬─────┬─────┬─────┬─────┐
│  0  │  1  │  2  │  3  │  4  │  5  │
└─────┴─────┴─────┴─────┴─────┴─────┘
         ↓ Poseidon Encrypt
         ↓ (分为 2 组，每组 3 个)
Message (7 elements)
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│  0  │  1  │  2  │  3  │  4  │  5  │  6  │ ← 第 7 个是校验元素
└─────┴─────┴─────┴─────┴─────┴─────┴─────┘
```

### 3.3 新版本

**计算：**
```
command_length = 7
encrypted_length = ceil(7 / 3) * 3 + 1
                 = ceil(2.33...) * 3 + 1
                 = 3 * 3 + 1
                 = 10 elements
```

**加密过程可视化：**
```
Command (7 elements)
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│  0  │  1  │  2  │  3  │  4  │  5  │  6  │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┘
         ↓ Poseidon Encrypt
         ↓ (需要填充到 9 个，分为 3 组)
Message (10 elements)
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│  0  │  1  │  2  │  3  │  4  │  5  │  6  │  7  │  8  │  9  │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
                                              ↑───────────↑
                                           填充元素  校验元素
```

### 3.4 Message 长度对比表

| 属性 | 旧版本 | 新版本 | 变化 |
|------|--------|--------|------|
| **Command 长度** | 6 elements | 7 elements | +1 (+16.7%) |
| **加密后 Message 长度** | 7 elements | 10 elements | +3 (+42.9%) |
| **Poseidon 分组数** | 2 组 | 3 组 | +1 组 |
| **填充元素数量** | 0 | 2 | +2 |
| **校验元素数量** | 1 | 1 | 不变 |

---

## 4. 消息哈希计算变化

### 4.1 MessageHasher 输入变化

消息哈希用于构建消息链，确保消息的完整性和顺序。

#### 旧版本（Hasher10）

**输入：**
```javascript
hash_input = [
  message[0],       // 加密消息元素 0
  message[1],       // 加密消息元素 1
  message[2],       // 加密消息元素 2
  message[3],       // 加密消息元素 3
  message[4],       // 加密消息元素 4
  message[5],       // 加密消息元素 5
  message[6],       // 加密消息元素 6
  enc_pubkey.x,     // 加密公钥 x
  enc_pubkey.y,     // 加密公钥 y
  prev_hash         // 前一个消息的哈希
]
// 总共：10 个输入
```

**哈希结构：**
```
Hasher10: hash2(hash5(input[0..4]), hash5(input[5..9]))
```

#### 新版本（Hasher13）

**输入：**
```javascript
hash_input = [
  message[0],       // 加密消息元素 0
  message[1],       // 加密消息元素 1
  message[2],       // 加密消息元素 2
  message[3],       // 加密消息元素 3
  message[4],       // 加密消息元素 4
  message[5],       // 加密消息元素 5
  message[6],       // 加密消息元素 6
  message[7],       // 加密消息元素 7
  message[8],       // 加密消息元素 8
  message[9],       // 加密消息元素 9
  enc_pubkey.x,     // 加密公钥 x
  enc_pubkey.y,     // 加密公钥 y
  prev_hash         // 前一个消息的哈希
]
// 总共：13 个输入
```

**哈希结构：**
```
Hasher13: hash5(
  hash5(input[0..4]),   // 前 5 个消息元素
  hash5(input[5..9]),   // 后 5 个消息元素
  input[10],            // enc_pubkey.x
  input[11],            // enc_pubkey.y
  input[12]             // prev_hash
)
```

### 4.2 哈希计算对比

| 属性 | 旧版本 (Hasher10) | 新版本 (Hasher13) | 变化 |
|------|-------------------|-------------------|------|
| **输入元素数量** | 10 | 13 | +3 |
| **消息元素数量** | 7 | 10 | +3 |
| **哈希层级** | 2 层 (hash2 + 2×hash5) | 2 层 (hash5 + 2×hash5) | 结构更统一 |
| **最外层哈希** | hash2 | hash5 | 输入容量更大 |

---

## 5. 电路约束变化

### 5.1 UnpackElement 变化

#### 旧版本
```circom
component unpack = UnpackElement(6);  // 6 x 32-bit = 192 bits
unpack.in <== decryptor.decrypted[0];

nonce <== unpack.out[5];           // bits 160-191
stateIndex <== unpack.out[4];      // bits 128-159
voteOptionIndex <== unpack.out[3]; // bits 96-127
// newVotes: out[0], out[1], out[2] = bits 0-95
```

#### 新版本
```circom
component unpack = UnpackElement(7);  // 7 x 32-bit = 224 bits
unpack.in <== decryptor.decrypted[0];

pollId <== unpack.out[0];           // bits 192-223 ← 新增
nonce <== unpack.out[1];            // bits 160-191
stateIndex <== unpack.out[2];       // bits 128-159
voteOptionIndex <== unpack.out[3];  // bits 96-127
// newVotes: out[4], out[5], out[6] = bits 0-95
```

### 5.2 ProcessMessages 输入变化

| 输入信号 | 旧版本 | 新版本 | 变化 |
|---------|--------|--------|------|
| `msgs[batchSize][MSG_LENGTH]` | `msgs[batchSize][7]` | `msgs[batchSize][10]` | +3 per message |
| `expectedPollId` | ❌ 不存在 | ✅ 新增公共输入 | 用于验证 |

### 5.3 约束数量变化

编译 `ProcessMessages_amaci_2-1-5` 的结果：

| 指标 | 估算变化 |
|------|---------|
| **非线性约束** | 增加约 5-10% |
| **线性约束** | 保持不变 (0) |
| **模板实例** | 增加 (IsZero, IsEqual 等) |
| **线路数量** | 增加约 3-5% |

主要增加来源：
- `UnpackElement(6)` → `UnpackElement(7)`: +32 个比特位的处理
- `Hasher10` → `Hasher13`: +3 个输入的哈希计算
- pollId 验证逻辑: 每个消息增加 2 个约束 (IsZero + IsEqual)

---

## 6. 存储和网络开销变化

### 6.1 单条消息的存储大小

假设每个 field element 是 32 字节 (256 bits)：

| 组件 | 旧版本 | 新版本 | 变化 |
|------|--------|--------|------|
| **Message 数据** | 7 × 32 = 224 bytes | 10 × 32 = 320 bytes | +96 bytes (+42.9%) |
| **Encryption PubKey** | 2 × 32 = 64 bytes | 2 × 32 = 64 bytes | 不变 |
| **单条消息总大小** | 288 bytes | 384 bytes | +96 bytes (+33.3%) |

### 6.2 批量消息的开销

以 1000 条消息为例：

| 指标 | 旧版本 | 新版本 | 增加 |
|------|--------|--------|------|
| **Message 数据** | 224 KB | 320 KB | +96 KB |
| **总消息大小** | 288 KB | 384 KB | +96 KB |

### 6.3 Gas 费用估算

假设每个 field element 的存储成本相同：

| 操作 | 旧版本 | 新版本 | 增加比例 |
|------|--------|--------|----------|
| **单条消息发布** | Base Gas | Base Gas × 1.43 | +43% |
| **消息哈希计算** | Moderate | Moderate × 1.3 | +30% |

---

## 7. SDK 代码变化示例

### 7.1 Pack Element (TypeScript)

#### 旧版本
```typescript
export function packElement({ 
  nonce, stateIdx, voIdx, newVotes, salt 
}: {
  nonce: number | bigint;
  stateIdx: number | bigint;
  voIdx: number | bigint;
  newVotes: number | bigint;
  salt: number | bigint;
}): bigint {
  const packaged =
    BigInt(nonce) +
    (BigInt(stateIdx) << 32n) +
    (BigInt(voIdx) << 64n) +
    (BigInt(newVotes) << 96n) +
    (BigInt(salt) << 192n);
  return packaged;
}
```

#### 新版本
```typescript
export function packElement({ 
  nonce, stateIdx, voIdx, newVotes, pollId 
}: {
  nonce: number | bigint;
  stateIdx: number | bigint;
  voIdx: number | bigint;
  newVotes: number | bigint;
  pollId: number | bigint;  // ← 替换 salt
}): bigint {
  const packaged =
    BigInt(nonce) +
    (BigInt(stateIdx) << 32n) +
    (BigInt(voIdx) << 64n) +
    (BigInt(newVotes) << 96n) +
    (BigInt(pollId) << 192n);  // ← 新位置
  return packaged;
}
```

### 7.2 Generate Message (TypeScript)

#### 旧版本
```typescript
const genMessageFactory = (
  stateIdx: number,
  signPriKey: PrivKey,
  signPubKey: PubKey,
  coordPubKey: PubKey
) => (
  encPriKey: PrivKey,
  nonce: number,
  voIdx: number,
  newVotes: number,
  isLastCmd: boolean,
  salt?: bigint
): bigint[] => {
  if (!salt) {
    salt = BigInt(`0x${CryptoJS.lib.WordArray.random(7).toString()}`);
  }
  const packaged = packElement({ nonce, stateIdx, voIdx, newVotes, salt });
  // ... 签名逻辑 ...
  const command = [packaged, ...newPubKey, ...signature.R8, signature.S];
  // Command length: 6
  const message = poseidonEncrypt(command, sharedKey, 0n);
  // Message length: 7
  return message;
};
```

#### 新版本
```typescript
const genMessageFactory = (
  stateIdx: number,
  signPriKey: PrivKey,
  signPubKey: PubKey,
  coordPubKey: PubKey,
  pollId: number  // ← 新增参数
) => (
  encPriKey: PrivKey,
  nonce: number,
  voIdx: number,
  newVotes: number,
  isLastCmd: boolean,
  salt?: bigint
): bigint[] => {
  if (!salt) {
    salt = BigInt(`0x${CryptoJS.lib.WordArray.random(7).toString()}`);
  }
  const packaged = packElement({ nonce, stateIdx, voIdx, newVotes, pollId });
  // ... 签名逻辑 ...
  const command = [packaged, BigInt(salt), ...newPubKey, ...signature.R8, signature.S];
  // Command length: 7 (salt 作为独立元素)
  const message = poseidonEncrypt(command, sharedKey, 0n);
  // Message length: 10
  return message;
};
```

---

## 8. 完整对比总结表

### 8.1 核心指标对比

| 层级 | 指标 | 旧版本 | 新版本 | 变化 | 影响 |
|------|------|--------|--------|------|------|
| **Packed Data** | 总位数 | 248 bits | 224 bits | -24 bits | 更紧凑 |
| | nonce | 32 bits | 32 bits | - | - |
| | stateIdx | 32 bits | 32 bits | - | - |
| | voIdx | 32 bits | 32 bits | - | - |
| | newVotes | 96 bits | 96 bits | - | - |
| | salt | 56 bits | ❌ 移除 | -56 bits | 分离为独立元素 |
| | pollId | ❌ 无 | 32 bits | +32 bits | 防重放攻击 |
| **Command** | 元素数量 | 6 | 7 | +1 | salt 独立 |
| **Message** | 加密后长度 | 7 | 10 | +3 | Poseidon 填充 |
| **MessageHasher** | 输入数量 | 10 | 13 | +3 | 包含完整消息 |
| **存储** | 单条消息 | 288 bytes | 384 bytes | +96 bytes | +33% |
| **Gas** | 发布消息 | Base | Base × 1.43 | +43% | 需要优化 |
| **电路** | UnpackElement | 6 × 32b | 7 × 32b | +32 bits | +1 字段 |
| | 约束数量 | Base | Base × 1.05-1.10 | +5-10% | 可接受 |

### 8.2 安全性对比

| 安全特性 | 旧版本 | 新版本 | 改进 |
|---------|--------|--------|------|
| **防重放攻击（同 poll）** | ✅ 通过 nonce | ✅ 通过 nonce | - |
| **防重放攻击（跨 poll）** | ❌ 无法防止 | ✅ 通过 pollId | 关键改进 |
| **消息完整性** | ✅ 哈希链 | ✅ 哈希链 | - |
| **签名验证** | ✅ EdDSA | ✅ EdDSA | - |
| **加密强度** | ✅ Poseidon | ✅ Poseidon | - |
| **盐值随机性** | ⚠️ 在 packed_data 中 | ✅ 独立元素，更灵活 | 改进 |

---

## 9. 迁移指南

### 9.1 对现有系统的影响

| 组件 | 需要更新 | 向后兼容 | 说明 |
|------|---------|---------|------|
| **SDK** | ✅ 必须 | ❌ 不兼容 | 消息格式完全变化 |
| **合约** | ✅ 必须 | ❌ 不兼容 | MessageData 从 7 改为 10 |
| **电路** | ✅ 必须 | ❌ 不兼容 | 需要重新生成 zkeys |
| **前端** | ⚠️ 可能需要 | - | 如果直接操作消息格式 |
| **测试数据** | ✅ 必须 | ❌ 不兼容 | 需要重新生成 |

### 9.2 升级步骤

1. **更新 SDK**
   - 更新 `pack.ts`, `keys.ts`, `voter.ts`, `operator.ts`
   - 所有调用 `packElement` 的地方传入 `pollId`
   - 所有调用 `batchGenMessage` 的地方传入 `pollId`

2. **更新合约**
   - `MessageData` 从 `[Uint256; 7]` 改为 `[Uint256; 10]`
   - 更新 `hash_message_and_enc_pub_key` 函数
   - 更新所有测试用例

3. **更新电路**
   - `messageToCommand.circom`: 添加 pollId 输出
   - `processMessages.circom`: 添加 pollId 验证
   - `messageHasher.circom`: 支持 10 元素消息
   - 重新编译所有电路
   - 重新生成所有 zkeys

4. **更新测试数据**
   - 使用新 SDK 重新生成所有测试数据
   - 确保每条消息包含 10 个元素

5. **部署新版本**
   - 部署新的 Registry 合约（管理 pollId）
   - 部署新的 AMACI 合约（支持 10 元素消息）
   - 上传新的电路验证密钥

---

## 10. 性能优化建议

### 10.1 减少消息长度影响

虽然消息长度增加了 43%，但可以通过以下方式优化：

1. **批量发布消息**
   - 使用 `PublishMessageBatch` 而不是单条发布
   - 分摊固定成本（如交易开销）

2. **压缩存储**
   - 链下存储完整消息
   - 链上只存储消息哈希链

3. **优化 Gas**
   - 使用更高效的存储结构
   - 考虑使用 Blob 存储（如果支持）

### 10.2 电路优化

1. **约束优化**
   - 使用更高效的 Poseidon 实现
   - 优化 UnpackElement 的位操作

2. **证明生成**
   - 使用更快的证明系统（Plonky2, Nova）
   - 并行处理多个消息

---

## 11. 总结

### 11.1 主要收益

✅ **安全性提升**
- 彻底防止跨 poll 重放攻击
- pollId 作为强制验证字段

✅ **架构改进**
- salt 独立存储，更灵活
- 消息结构更清晰，易于扩展

✅ **可维护性**
- 电路、合约、SDK 三端逻辑统一
- 文档完善，易于理解

### 11.2 主要成本

⚠️ **存储和带宽**
- 消息大小增加 33%
- 需要更多的链上存储

⚠️ **计算成本**
- Gas 费增加约 43%
- 电路约束增加 5-10%

⚠️ **迁移成本**
- 不向后兼容
- 需要完整的系统升级

### 11.3 最终评估

综合来看，虽然带来了存储和计算成本的增加，但**安全性收益远大于成本**。跨 poll 重放攻击是一个严重的安全漏洞，必须解决。通过批量操作和优化，可以有效降低额外成本。

**推荐：立即实施此更新。**

---

## 附录：快速参考

### A.1 关键数字速查表

```
旧版本 → 新版本

Packed Data:    248 bits → 224 bits  (-24 bits)
Command:        6 elements → 7 elements  (+1)
Message:        7 elements → 10 elements  (+3)
MessageHasher:  10 inputs → 13 inputs  (+3)
Storage:        288 bytes → 384 bytes  (+96)
Gas Cost:       Base → Base × 1.43  (+43%)
```

### A.2 文件修改清单

**SDK:**
- `pack.ts` ✅
- `keys.ts` ✅
- `voter.ts` ✅
- `operator.ts` ✅
- `contract.ts` ✅

**Contracts:**
- `amaci/src/state.rs` ✅
- `amaci/src/contract.rs` ✅
- `amaci/src/multitest/tests.rs` ✅

**Circuits:**
- `messageToCommand.circom` ✅
- `processMessages.circom` ✅
- `messageHasher.circom` ✅
- `hasherPoseidon.circom` ✅
- `processDeactivate.circom` ✅

---

**文档版本:** v1.0
**最后更新:** 2026-01-31
**作者:** MACI Development Team
