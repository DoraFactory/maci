# Operator 处理多次 Payload 投票的完整逻辑

## 目录

1. [概述](#概述)
2. [核心概念](#核心概念)
3. [完整流程](#完整流程)
4. [详细案例](#详细案例)
5. [Nonce 机制详解](#nonce-机制详解)
6. [常见问题](#常见问题)
7. [关键理解](#关键理解)

---

## 概述

本文档详细解释 MACI 系统中，Operator 如何处理用户多次发送的 Payload 投票。这是理解 MACI 投票机制的关键。

### 核心问题

- Operator 如何收集和存储消息？
- Operator 如何处理多个 Payload 的消息？
- MessageValidator 何时进行验证？
- Nonce 机制如何影响消息处理？
- 为什么会出现覆盖行为？

---

## 核心概念

### 1. Payload vs Message

**Payload（载荷）**：
- 用户通过 `buildVotePayload()` 生成的一组投票选项
- 例如：`[{option: 1, vc: 5}, {option: 2, vc: 3}]`

**Message（消息）**：
- Payload 中的每个选项会生成一个独立的加密消息
- 例如：上面的 Payload 会生成 2 个消息

**关系**：
```
Payload (1个) → Messages (N个，N = 选项数量)
```

### 2. 消息存储

**存储结构**：
```typescript
operator.messages: Message[]  // 按推送顺序存储
operator.commands: Command[]  // 解密后的命令
```

**关键点**：
- 消息按推送顺序存储在数组中
- **没有"Payload"的概念**，只有"消息"的概念
- 所有消息都在同一个数组中，按时间顺序排列

### 3. 批次处理

**批次大小**：`batchSize` (例如 10)

**处理方式**：
- 每次处理一个批次（最多 `batchSize` 个消息）
- 从后往前处理（从高索引到低索引）
- 如果还有未处理的消息，需要再次调用 `processMessages()`

### 4. Nonce 机制

**全局 Nonce**：
- 每个用户的状态中有一个全局 `nonce` 字段
- 无论更新哪个选项，nonce 都必须递增
- 消息的 nonce 必须等于 `全局 nonce + 1`

**局部 Nonce**：
- 在同一个 Payload 内，每个消息的 nonce 从 1 开始递增
- 这些 nonce 只在 Payload 内部有意义

---

## 完整流程

### 阶段 1: 消息收集 (FILLING)

**状态**: `operator.states = 0` (FILLING)

**操作**: `operator.pushMessage(message, encPubKey)`

**流程**:
```typescript
// 用户发送 Payload 1
const payload1 = voter.buildVotePayload({
  selectedOptions: [{idx: 1, vc: 5}, {idx: 2, vc: 3}]
});

// Operator 收集消息
for (const payload of payload1) {
  const message = payload.msg.map((m) => BigInt(m));
  const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k));
  operator.pushMessage(message, messageEncPubKey);
  // messages[0] = 消息1
  // messages[1] = 消息2
}

// 用户发送 Payload 2
const payload2 = voter.buildVotePayload({
  selectedOptions: [{idx: 2, vc: 8}]
});

// Operator 继续收集
for (const payload of payload2) {
  operator.pushMessage(message, messageEncPubKey);
  // messages[2] = 消息3
}
```

**结果**:
```
messages[0] = Payload1消息1
messages[1] = Payload1消息2
messages[2] = Payload2消息1
```

**关键点**:
- 消息按推送顺序存储在数组中
- 没有"Payload"分组，所有消息都在同一个数组
- 状态保持为 FILLING，继续收集消息

---

### 阶段 2: 开始处理 (PROCESSING)

**操作**: `operator.endVotePeriod()`

**状态变化**: `operator.states = 0 → 1` (FILLING → PROCESSING)

**准备**:
- 消息链已构建完成
- 所有消息已收集完毕
- 可以开始批次处理

---

### 阶段 3: 批次处理

**操作**: `operator.processMessages()`

**批次计算**:
```typescript
const batchStartIdx = Math.max(0, operator.messages.length - batchSize);
const batchEndIdx = operator.messages.length;
const commands = operator.commands.slice(batchStartIdx, batchEndIdx);
```

**处理循环**:
```typescript
// 从后往前处理
for (let i = batchSize - 1; i >= 0; i--) {
  const cmd = commands[i];
  
  // 1. 验证消息
  const error = this.checkCommandNow(cmd);
  
  // 2. 获取当前状态
  const s = this.stateLeaves.get(stateIdx);
  const currVotes = s.voTree.leaf(voIdx);
  
  // 3. 准备电路输入
  currentStateLeaves[i] = [...s.pubKey, s.balance, s.voTree.root, s.nonce];
  currentVoteWeights[i] = currVotes;
  
  // 4. 如果验证通过，更新状态
  if (!error) {
    s.voTree.updateLeaf(voIdx, cmd.newVotes);
    s.nonce = cmd.nonce;
  }
}
```

**关键点**:
- 每次处理一个批次（最多 `batchSize` 个消息）
- 从后往前处理（高索引到低索引）
- 如果还有未处理的消息，需要再次调用 `processMessages()`

---

### 阶段 4: 消息验证

**验证发生在两个地方**:

#### 1. SDK 层面验证 (`checkCommandNow`)

```typescript
private checkCommandNow(cmd: Command): string | undefined {
  const s = this.stateLeaves.get(stateIdx);
  
  // 检查 nonce
  if (s.nonce + 1n !== cmd.nonce) {
    return 'nonce error';
  }
  
  // 检查签名
  const verified = verifySignature(cmd.msgHash, cmd.signature, s.pubKey);
  if (!verified) {
    return 'signature error';
  }
  
  return undefined; // 验证通过
}
```

#### 2. 电路层面验证 (MessageValidator)

在生成零知识证明时，MessageValidator 电路会验证：
1. 状态索引验证
2. 选项索引验证
3. Nonce 验证
4. 签名验证
5. 权重验证
6. 余额验证

**验证流程**:
```
消息 → checkCommandNow() → MessageValidator 电路 → 更新状态
```

---

## 详细案例

### 案例 1: 单个 Payload，多个选项

**场景**:
```javascript
// 用户发送一个 Payload，包含 3 个选项
buildVotePayload({
  selectedOptions: [
    { idx: 1, vc: 10 },
    { idx: 2, vc: 20 },
    { idx: 3, vc: 30 }
  ]
})
```

**生成的消息**:
```
消息0: {voIdx: 3, newVotes: 30, nonce: 3}  // 局部 nonce = 3
消息1: {voIdx: 2, newVotes: 20, nonce: 2}  // 局部 nonce = 2
消息2: {voIdx: 1, newVotes: 10, nonce: 1}  // 局部 nonce = 1
```

**Operator 收集**:
```
messages[0] = 消息0 (voIdx=3, nonce=3)
messages[1] = 消息1 (voIdx=2, nonce=2)
messages[2] = 消息2 (voIdx=1, nonce=1)
```

**处理顺序（从后往前）**:
```
1. 处理 messages[2] (voIdx=1, nonce=1):
   - 当前全局 nonce = 0
   - 验证: nonce=1 == 0+1 ✅
   - 更新: voTree[1] = 10, 全局 nonce = 1

2. 处理 messages[1] (voIdx=2, nonce=2):
   - 当前全局 nonce = 1
   - 验证: nonce=2 == 1+1 ✅
   - 更新: voTree[2] = 20, 全局 nonce = 2

3. 处理 messages[0] (voIdx=3, nonce=3):
   - 当前全局 nonce = 2
   - 验证: nonce=3 == 2+1 ✅
   - 更新: voTree[3] = 30, 全局 nonce = 3
```

**最终结果**:
```
voTree[1] = 10
voTree[2] = 20
voTree[3] = 30
全局 nonce = 3
```

**分析**:
- ✅ 所有消息都成功处理
- ✅ Nonce 严格递增
- ✅ 所有选项都正确更新

---

### 案例 2: 多个 Payload，同一批次处理

**场景**:
```javascript
// Payload 1
buildVotePayload({
  selectedOptions: [{idx: 1, vc: 5}, {idx: 2, vc: 3}]
})

// Payload 2
buildVotePayload({
  selectedOptions: [{idx: 2, vc: 8}]
})

// Payload 3
buildVotePayload({
  selectedOptions: [{idx: 3, vc: 10}]
})
```

**生成的消息**:
```
Payload 1:
  消息0: {voIdx: 2, newVotes: 3, nonce: 2}
  消息1: {voIdx: 1, newVotes: 5, nonce: 1}

Payload 2:
  消息2: {voIdx: 2, newVotes: 8, nonce: 1}

Payload 3:
  消息3: {voIdx: 3, newVotes: 10, nonce: 1}
```

**Operator 收集（按推送顺序）**:
```
messages[0] = Payload1消息0 (voIdx=2, nonce=2)
messages[1] = Payload1消息1 (voIdx=1, nonce=1)
messages[2] = Payload2消息0 (voIdx=2, nonce=1)
messages[3] = Payload3消息0 (voIdx=3, nonce=1)
```

**处理顺序（从后往前）**:
```
1. 处理 messages[3] (voIdx=3, nonce=1):
   - 当前全局 nonce = 0
   - 验证: nonce=1 == 0+1 ✅
   - 更新: voTree[3] = 10, 全局 nonce = 1

2. 处理 messages[2] (voIdx=2, nonce=1):
   - 当前全局 nonce = 1
   - 验证: nonce=1 == 1+1 ❌ (期望=2)
   - 拒绝消息，不更新状态

3. 处理 messages[1] (voIdx=1, nonce=1):
   - 当前全局 nonce = 1
   - 验证: nonce=1 == 1+1 ❌ (期望=2)
   - 拒绝消息，不更新状态

4. 处理 messages[0] (voIdx=2, nonce=2):
   - 当前全局 nonce = 1
   - 验证: nonce=2 == 1+1 ✅
   - 更新: voTree[2] = 3, 全局 nonce = 2
```

**最终结果**:
```
voTree[1] = 0   (消息被拒绝，保持初始值)
voTree[2] = 3   (消息0成功)
voTree[3] = 10  (消息3成功)
全局 nonce = 2
```

**分析**:
- ❌ 消息2和消息1被拒绝（nonce 不匹配）
- ✅ 只有消息3和消息0成功处理
- ⚠️ 选项1没有被更新（消息被拒绝）

---

### 案例 3: 理解处理顺序的重要性

**场景**:
```javascript
// Payload 1: 选项1和2
buildVotePayload({
  selectedOptions: [{idx: 1, vc: 100}, {idx: 2, vc: 200}]
})

// Payload 2: 只选项2
buildVotePayload({
  selectedOptions: [{idx: 2, vc: 300}]
})
```

**生成的消息**:
```
Payload 1:
  消息0: {voIdx: 2, newVotes: 200, nonce: 2}
  消息1: {voIdx: 1, newVotes: 100, nonce: 1}

Payload 2:
  消息2: {voIdx: 2, newVotes: 300, nonce: 1}
```

**Operator 收集**:
```
messages[0] = Payload1消息0 (voIdx=2, nonce=2)
messages[1] = Payload1消息1 (voIdx=1, nonce=1)
messages[2] = Payload2消息0 (voIdx=2, nonce=1)
```

**处理顺序（从后往前）**:
```
1. 处理 messages[2] (voIdx=2, nonce=1):
   - 当前全局 nonce = 0
   - 验证: nonce=1 == 0+1 ✅
   - 更新: voTree[2] = 300, 全局 nonce = 1

2. 处理 messages[1] (voIdx=1, nonce=1):
   - 当前全局 nonce = 1
   - 验证: nonce=1 == 1+1 ❌ (期望=2)
   - 拒绝消息

3. 处理 messages[0] (voIdx=2, nonce=2):
   - 当前全局 nonce = 1
   - 验证: nonce=2 == 1+1 ✅
   - 更新: voTree[2] = 200, 全局 nonce = 2
```

**最终结果**:
```
voTree[1] = 0   (消息被拒绝)
voTree[2] = 200 (消息0成功，覆盖了消息2的结果)
全局 nonce = 2
```

**关键理解**:
- 处理顺序是从后往前（高索引到低索引）
- 后发送的消息先被处理
- 如果 nonce 匹配，会更新状态
- 如果 nonce 不匹配，消息被拒绝

---

## Nonce 机制详解

### Nonce 的双重性

#### 1. 局部 Nonce（Payload 内部）

**生成方式**:
```typescript
for (let i = plan.length - 1; i >= 0; i--) {
  const msg = genMessage(..., i + 1, ...);  // nonce = i + 1
}
```

**特点**:
- 在同一个 Payload 内，nonce 从 1 开始递增
- 这些 nonce 只在 Payload 内部有意义
- SDK 不知道用户的全局 nonce，总是从 1 开始

**示例**:
```
Payload: [{option: 1, vc: 10}, {option: 2, vc: 20}]
生成的消息:
  消息1: nonce = 1
  消息2: nonce = 2
```

#### 2. 全局 Nonce（用户状态）

**存储位置**:
```typescript
stateLeaves[userId].nonce  // 全局 nonce
```

**验证规则**:
```typescript
if (s.nonce + 1n !== cmd.nonce) {
  return 'nonce error';
}
```

**更新规则**:
```typescript
if (!error) {
  s.nonce = cmd.nonce;  // 更新为消息的 nonce
}
```

**特点**:
- 每个用户只有一个全局 nonce
- 无论更新哪个选项，nonce 都必须递增
- 消息的 nonce 必须等于 `全局 nonce + 1`

### Nonce 冲突问题

**问题场景**:
```
用户当前全局 nonce = 2

Payload 1 的消息: nonce = 1, 2  (局部 nonce)
Payload 2 的消息: nonce = 1     (局部 nonce)
```

**处理结果**:
- Payload 2 的消息 nonce=1，但全局 nonce=2，期望=3
- 消息被拒绝 ❌

**解决方案**:
- SDK 需要知道用户的全局 nonce
- 在生成消息时使用正确的 nonce
- 或者用户每次发送完整的 Payload（包含所有选项）

---

## 常见问题

### Q1: Operator 是根据"最后的一组 payload"处理吗？

**A: 不是。**

Operator 按照消息在数组中的顺序，从后往前处理。没有"Payload"的概念，只有"消息"的概念。

**实际流程**:
```
所有消息 → messages[] 数组 → 从后往前处理
```

### Q2: MessageValidator 何时验证？

**A: 每个消息都会经过 MessageValidator 验证。**

验证发生在两个地方：
1. **SDK 层面**: `checkCommandNow()` 进行初步验证
2. **电路层面**: MessageValidator 电路进行完整验证（在生成证明时）

### Q3: 为什么会出现覆盖行为？

**A: 由于 Nonce 机制。**

- Payload 内的 nonce 是局部的（从 1 开始）
- 全局 nonce 必须严格递增
- 如果多个 Payload 的消息 nonce 冲突，只有部分会被处理
- 被拒绝的消息不会更新状态
- 未更新的选项保持之前的值或初始值 0

### Q4: 如何实现真正的累加？

**A: 理论上可以，但实际有限制。**

**理论上**:
- 每次 Payload 都包含所有选项（包括设置为 0 的）
- 这样可以保持所有选项的状态

**实际上**:
- `buildVotePayload` 会过滤掉 `vc=0` 的选项
- 无法显式将选项设置为 0
- 因此无法实现真正的累加

### Q5: 处理顺序为什么是从后往前？

**A: 因为消息链是单向链表。**

- 每个消息包含前一个消息的哈希
- 从后往前处理可以确保消息顺序的一致性
- 这样可以验证消息链的完整性

---

## 关键理解

### 1. 消息存储

- **没有"Payload"的概念**，只有"消息"的概念
- 所有消息按推送顺序存储在同一个数组中
- 消息之间没有分组或边界

### 2. 处理顺序

- **从后往前处理**（高索引到低索引）
- 每个消息独立验证和处理
- 后发送的消息先被处理

### 3. Nonce 机制

- **Nonce 是全局的**（每个用户只有一个）
- 消息的 nonce 必须等于 `全局 nonce + 1`
- Payload 内的 nonce 是局部的（从 1 开始）

### 4. 验证时机

- **每个消息都会验证**
- 验证时使用**当前**的全局 nonce
- 验证通过才更新状态

### 5. 覆盖行为

- **不是电路设计的限制**
- 而是 Nonce 机制的自然结果
- 如果只发送部分选项，之前的消息可能被拒绝

---

## 总结

### 核心流程

```
用户发送 Payload
    ↓
Operator.pushMessage() 收集消息
    ↓
messages[] 数组存储（按推送顺序）
    ↓
operator.endVotePeriod() 结束投票期
    ↓
operator.processMessages() 批次处理
    ↓
从后往前处理每个消息
    ↓
checkCommandNow() + MessageValidator 验证
    ↓
验证通过则更新状态
```

### 关键点

1. **消息存储**: 按推送顺序，没有"Payload"分组
2. **处理顺序**: 从后往前（高索引到低索引）
3. **验证时机**: 每个消息独立验证
4. **Nonce 机制**: 全局 nonce 必须严格递增
5. **覆盖行为**: 由于 nonce 机制，导致部分消息被拒绝

### 实际建议

1. **每次发送完整的 Payload**: 包含所有要更新的选项
2. **理解 Nonce 机制**: 知道全局 nonce 的限制
3. **避免部分更新**: 如果只更新部分选项，之前的消息可能被拒绝

---

## 相关文档

- `MessageValidator.md` - MessageValidator 电路详解
- `MessageValidator_VotingLogic.md` - 投票逻辑详解
- `MessageValidator_NonceAndOverwrite.md` - Nonce 机制和覆盖逻辑

---

## 测试用例

详细的测试用例请参考：
- `MessageValidatorMultiplePayloads.test.ts` - 多个 Payload 处理测试
- `MessageValidatorNonceAndOverwrite.test.ts` - Nonce 机制测试

运行测试：
```bash
pnpm test:messageValidatorMultiplePayloads
```

