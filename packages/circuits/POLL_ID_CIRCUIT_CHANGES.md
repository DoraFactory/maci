# Circuit Changes for Poll ID Integration

## 概述

为了防止跨不同 poll/round 的重放攻击，我们在电路中添加了 `pollId` 字段。本文档记录了所有相关的电路修改。

## 修改的核心原理

### 1. 消息结构变更

**之前的命令结构（6 个元素）：**
```
command = [packed_data, new_pubkey_x, new_pubkey_y, sig_R8_x, sig_R8_y, sig_S]
```

其中 `packed_data` 包含：
- nonce (32 bits)
- stateIdx (32 bits)
- voIdx (32 bits)
- newVotes (96 bits)
- salt (56 bits)
- 总计：248 bits

**现在的命令结构（7 个元素）：**
```
command = [packed_data, salt, new_pubkey_x, new_pubkey_y, sig_R8_x, sig_R8_y, sig_S]
```

其中 `packed_data` 包含：
- nonce (32 bits)
- stateIdx (32 bits)
- voIdx (32 bits)
- newVotes (96 bits)
- pollId (32 bits)
- 总计：224 bits

`salt` 被移出 `packed_data`，作为单独的命令元素。

### 2. 消息长度变更

由于 Poseidon 加密的特性，加密后的消息长度为 `roundUp(command_length, 3) + 1`：

- **之前**：`CMD_LENGTH = 6`，`MSG_LENGTH = roundUp(6, 3) + 1 = 7`
- **现在**：`CMD_LENGTH = 7`，`MSG_LENGTH = roundUp(7, 3) + 1 = 10`

## 修改的文件列表

### 1. `utils/messageToCommand.circom`

**主要变更：**
- `MSG_LENGTH`: 7 → 10
- `CMD_LENGTH`: 6 → 7
- 添加 `signal output pollId`
- `UnpackElement(6)` → `UnpackElement(7)`
- 更新字段提取索引（因为 pollId 在最高位）

**pollId 提取逻辑：**
```circom
component unpack = UnpackElement(7);
unpack.in <== decryptor.decrypted[0];

pollId <== unpack.out[0];           // bits 192-223
nonce <== unpack.out[1];            // bits 160-191
stateIndex <== unpack.out[2];       // bits 128-159
voteOptionIndex <== unpack.out[3];  // bits 96-127
// newVotes: out[4], out[5], out[6]  // bits 0-95 (3 x 32-bit chunks)
```

### 2. `amaci/power/processMessages.circom` 和 `maci/power/processMessages.circom`

**主要变更：**
- 添加 `signal input expectedPollId` 作为公共输入
- `MSG_LENGTH`: 7 → 10
- 添加 pollId 验证约束

**pollId 验证逻辑：**
```circom
for (var i = 0; i < batchSize; i ++) {
    // Check if message is empty
    isEmptyMsgForPollId[i] = IsZero();
    isEmptyMsgForPollId[i].in <== encPubKeys[i][0];
    
    // Verify pollId matches expectedPollId
    pollIdCheckers[i] = IsEqual();
    pollIdCheckers[i].in[0] <== commands[i].pollId;
    pollIdCheckers[i].in[1] <== expectedPollId;
    
    // Constraint: if message is not empty, pollId must match
    (1 - isEmptyMsgForPollId[i].out) * pollIdCheckers[i].out 
        === (1 - isEmptyMsgForPollId[i].out);
}
```

**输入哈希更新：**
- `ProcessMessagesInputHasher` 现在接受 `expectedPollId`
- SHA256 输入从 7 个增加到 8 个（添加了 expectedPollId）

### 3. `amaci/power/processDeactivate.circom`

**主要变更：**
- `MSG_LENGTH`: 7 → 10（保持与 processMessages 一致）

### 4. `utils/messageHasher.circom`

**主要变更：**
- 输入长度：7 → 10 个元素
- 使用的 hasher：`Hasher10()` → `Hasher13()`（10 消息元素 + 2 公钥元素 + 1 prevHash = 13）

### 5. `utils/hasherPoseidon.circom`

**新增：**
- 添加 `Hasher13()` 模板以支持 13 个输入的哈希

```circom
template Hasher13() {
    signal input in[13];
    signal output hash;

    component hasher5 = PoseidonHashT6();
    component hasher5_1 = PoseidonHashT6();
    component hasher5_2 = PoseidonHashT6();

    for (var i = 0; i < 5; i++) {
        hasher5_1.inputs[i] <== in[i];
        hasher5_2.inputs[i] <== in[i+5];
    }
    hasher5.inputs[0] <== hasher5_1.out;
    hasher5.inputs[1] <== hasher5_2.out;
    hasher5.inputs[2] <== in[10];
    hasher5.inputs[3] <== in[11];
    hasher5.inputs[4] <== in[12];

    hash <== hasher5.out;
}
```

### 6. `utils/messageValidator.circom`

**无需修改** - `messageValidator` 只验证命令的有效性（签名、余额等），pollId 的验证在 `processMessages` 中完成。

### 7. `circuits.json`

**无需修改** - 公共输入仍然只有 `inputHash`（expectedPollId 被包含在 inputHash 的 SHA256 哈希中）。

## 安全性保证

### 1. Replay Attack Prevention

每个消息现在包含 `pollId`，电路会强制验证：
```
commands[i].pollId === expectedPollId
```

这确保了：
- 为 Poll A 生成的消息不能在 Poll B 中使用
- 即使用户在不同 poll 中有相同的 `stateIdx`，也无法重用旧消息

### 2. 空消息处理

对于空消息（`encPubKey[0] == 0`），pollId 验证会被跳过，这是合理的，因为空消息不会改变状态。

### 3. 约束完整性

pollId 验证约束：
```circom
(1 - isEmptyMsg) * pollIdMatches === (1 - isEmptyMsg)
```

等价于：
- 如果 `isEmptyMsg == 1`：约束总是满足（`0 * x === 0`）
- 如果 `isEmptyMsg == 0`：`pollIdMatches` 必须为 1（`1 * 1 === 1`）

## 测试建议

### 1. 单元测试

- **UnpackElement**: 测试 7 个元素的解包（包括 pollId）
- **MessageToCommand**: 测试 pollId 正确提取
- **MessageHasher**: 测试 10 元素消息的哈希

### 2. 集成测试

- **正常流程**: 使用正确的 pollId，验证消息处理成功
- **Replay Attack**: 使用来自不同 poll 的消息，验证被拒绝
- **空消息**: 验证空消息不受 pollId 检查影响
- **边界值**: 测试 pollId 的最大值（2^32 - 1）

### 3. 性能测试

- 约束数量变化：由于添加了额外的验证逻辑，约束数量会略有增加
- 编译时间：测试编译时间是否在可接受范围内

## 编译结果

成功编译 `ProcessMessages_amaci_2-1-5`：
```
template instances: 383
non-linear constraints: 251049
linear constraints: 0
public inputs: 1
private inputs: 235
wires: 249200
```

## 与 SDK 的兼容性

电路修改需要与以下 SDK 修改配合：

1. **pack.ts**: `packElement` 函数现在打包 pollId 而不是 salt
2. **keys.ts**: `genMessageFactory` 和 `batchGenMessage` 接受 pollId 参数
3. **voter.ts / operator.ts**: 在最外层查询 pollId 并传递给内部方法
4. **contract.ts**: 添加 `getPollId` 方法从合约查询 pollId

## 后续工作

1. ✅ 电路修改完成
2. ✅ SDK 修改完成
3. ⏳ 重新生成所有证明密钥（zkeys）
4. ⏳ 更新测试用例
5. ⏳ 更新文档
6. ⏳ 部署和测试

## 备注

- 所有电路文件的 `MSG_LENGTH` 常量都已更新为 10
- `MessageHasher` 的变更会影响消息哈希链的计算，需要与合约端保持一致
- 电路约束数量有所增加，但增幅在可接受范围内（主要是增加了 pollId 验证）
