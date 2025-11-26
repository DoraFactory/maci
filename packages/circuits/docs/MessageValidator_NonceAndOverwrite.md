# MessageValidator Nonce 机制和覆盖逻辑详解

## 核心问题

1. **Nonce 是单个投票 payload 里 option message 的 nonce，还是全局的 nonce？**
2. **用户发了一次包含多个选项的 payload，之后又发了新的 payload，覆盖逻辑如何？**

---

## 答案总结

### 1. Nonce 机制

**Nonce 是全局的（每个用户只有一个 nonce），不是每个选项独立的。**

**关键点**：
- 每个用户的状态中有一个全局 `nonce` 字段
- 无论更新哪个选项，nonce 都必须递增
- 在同一个 payload 内，每个消息的 nonce 是递增的（1, 2, 3...），但这些是**局部 nonce**
- 当消息被处理时，会检查消息的 nonce 是否等于 `全局 nonce + 1`
- 处理成功后，全局 nonce 会更新为消息的 nonce

### 2. Payload 内的 Nonce 生成

**在 `buildVotePayload` 中**：

```typescript
for (let i = plan.length - 1; i >= 0; i--) {
  const p = plan[i];
  const msg = genMessage(..., i + 1, p[0], p[1], ...);
  //                                    ^^^^^
  //                                    nonce = i + 1
}
```

**示例**：
- Payload 有 3 个选项：`[{idx: 1, vc: 10}, {idx: 2, vc: 20}, {idx: 3, vc: 30}]`
- 生成的消息 nonce：`1, 2, 3`（从 1 开始递增）

**重要**：这些 nonce 是**局部**的，只在 payload 内部有意义。

### 3. 全局 Nonce 验证

**在 `checkCommandNow` 中**：

```typescript
const s = this.stateLeaves.get(stateIdx);
if (s.nonce + 1n !== cmd.nonce) {
  return 'nonce error';
}
```

**验证逻辑**：`消息的 nonce == 用户全局 nonce + 1`

**示例**：
- 用户当前全局 nonce = 2
- 新消息的 nonce 必须是 3 ✅
- 如果消息 nonce = 1 或 2，会被拒绝 ❌

### 4. 全局 Nonce 更新

**在 `processMessages` 中**：

```typescript
if (!error) {
  s.voTree.updateLeaf(voIdx, cmd.newVotes);
  s.nonce = cmd.nonce;  // 更新全局 nonce
}
```

**更新逻辑**：处理成功后，全局 nonce = 消息的 nonce

---

## 覆盖逻辑详解

### 场景：多次 Payload 投票

**第一次 Payload**：
```javascript
buildVotePayload({
  selectedOptions: [
    { idx: 1, vc: 2 },
    { idx: 2, vc: 1 }
  ]
})
```

**生成的消息**：
```
消息1: {voIdx: 1, newVotes: 2, nonce: 1}  // 局部 nonce = 1
消息2: {voIdx: 2, newVotes: 1, nonce: 2}  // 局部 nonce = 2
```

**处理过程**（从后往前）：
```
1. 处理消息2 (nonce=2):
   - 验证: originalNonce=0, nonce=2, 期望=1 ❌
   - 等等，这里有问题...

实际上，处理顺序是从后往前，但验证时：
   - 消息2: originalNonce=0, nonce=2, 期望=1 ❌
   - 消息1: originalNonce=0, nonce=1, 期望=1 ✅
   
所以应该是：
1. 处理消息2 (nonce=2):
   - 验证: originalNonce=0, nonce=2, 期望=1 ❌ (被拒绝)
2. 处理消息1 (nonce=1):
   - 验证: originalNonce=0, nonce=1, 期望=1 ✅
   - 更新: voTree[1] = 2, nonce = 1
3. 再次处理消息2 (nonce=2):
   - 验证: originalNonce=1, nonce=2, 期望=2 ✅
   - 更新: voTree[2] = 1, nonce = 2
```

**最终结果**：
```
voTree[1] = 2
voTree[2] = 1
全局 nonce = 2
```

**第二次 Payload**（只更新选项2）：
```javascript
buildVotePayload({
  selectedOptions: [
    { idx: 2, vc: 3 }
  ]
})
```

**生成的消息**：
```
消息3: {voIdx: 2, newVotes: 3, nonce: 1}  // 局部 nonce = 1
```

**处理过程**（假设所有消息在同一批次）：
```
处理顺序（从后往前）：
1. 处理消息3 (nonce=1):
   - 验证: originalNonce=2, nonce=1, 期望=3 ❌ (被拒绝)
2. 处理消息2 (nonce=2):
   - 验证: originalNonce=2, nonce=2, 期望=3 ❌ (被拒绝)
3. 处理消息1 (nonce=1):
   - 验证: originalNonce=2, nonce=1, 期望=3 ❌ (被拒绝)
```

**问题**：所有消息都被拒绝了！

**原因**：第二个 payload 的消息 nonce 是 1（局部 nonce），但全局 nonce 已经是 2，期望是 3。

**解决方案**：SDK 需要知道当前的全局 nonce，并在生成消息时使用正确的 nonce。

---

## 实际行为分析

### 问题：SDK 如何知道全局 Nonce？

**当前实现**：`buildVotePayload` 不知道用户的全局 nonce，总是从 1 开始生成局部 nonce。

**这意味着**：
- 第一次 payload：nonce = 1, 2, 3... ✅（全局 nonce 从 0 开始）
- 第二次 payload：nonce = 1, 2, 3... ❌（但全局 nonce 已经是 N）

**实际处理**：
- 如果第二个 payload 的消息 nonce 不匹配，会被拒绝
- 只有 nonce 匹配的消息才会被处理

### 覆盖逻辑的实际表现

**场景**：
```
第一次 payload: [{option: 1, vc: 2}, {option: 2, vc: 1}]
第二次 payload: [{option: 2, vc: 3}]
```

**如果第二个 payload 的消息 nonce 不匹配**：
- 消息被拒绝
- 选项2 不会被更新
- 选项1 保持原值（如果第一个 payload 的消息也被拒绝，则变为 0）

**如果第二个 payload 的消息 nonce 匹配**：
- 消息被处理
- 选项2 被更新为 3
- 选项1 保持原值（如果第一个 payload 的消息被拒绝，则变为 0）

---

## 关键理解

### 1. Nonce 的双重性

- **局部 Nonce**：在 payload 内部，从 1 开始递增
- **全局 Nonce**：在用户状态中，必须严格递增

### 2. 消息处理顺序

- 消息从后往前处理（`i = batchSize - 1; i >= 0; i--`）
- 每个消息独立验证和处理
- 全局 nonce 在每次成功处理后更新

### 3. 覆盖行为的原因

- **不是**因为电路设计导致覆盖
- **而是**因为 nonce 机制导致之前的消息被拒绝
- 被拒绝的消息不会更新状态
- 未更新的选项保持之前的值或初始值 0

### 4. 如何实现真正的累加？

**理论上**：如果每次 payload 都包含所有选项（包括设置为 0 的），可以实现累加效果。

**实际上**：
- `buildVotePayload` 会过滤掉 `vc=0` 的选项
- 无法显式将选项设置为 0
- 因此无法实现真正的累加

---

## 总结

### Nonce 机制

1. **Nonce 是全局的**（每个用户只有一个 nonce）
2. **Payload 内的 nonce 是局部的**（从 1 开始递增）
3. **验证时**：消息 nonce 必须等于 `全局 nonce + 1`
4. **更新时**：全局 nonce = 消息 nonce

### 覆盖逻辑

1. **每个消息独立处理**：只更新一个选项
2. **Nonce 不匹配导致拒绝**：如果消息 nonce 不匹配，会被拒绝
3. **被拒绝的消息不更新状态**：选项保持之前的值或初始值 0
4. **实际表现**：如果只发送部分选项，之前的消息可能被拒绝，导致覆盖行为

### 关键点

- MessageValidator 本身支持更新单个选项
- 但由于 nonce 机制，实际行为表现为覆盖模式
- 这不是电路设计的限制，而是 nonce 机制的自然结果

