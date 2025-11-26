# MessageValidator 计票逻辑详解

## 核心概念

### 1. MessageValidator 的职责

`MessageValidator` 电路**只负责验证单个消息**，它不关心：
- 用户之前投过什么票
- 用户之后会投什么票
- 其他用户投了什么票

它只验证：**当前这个消息是否有效**

### 2. 消息的基本结构

每个消息包含：
- `stateIdx`: 用户索引
- `voIdx`: 投票选项索引
- `newVotes`: 新的投票权重（**不是增量，是绝对值**）
- `nonce`: 消息序号

### 3. Nonce 机制

**关键点**：Nonce 是**全局的**（每个用户只有一个 nonce），不是每个选项独立的。

- 用户第一次投票：nonce = 1
- 用户第二次投票：nonce = 2
- 用户第三次投票：nonce = 3

**无论用户更新哪个选项，nonce 都必须递增。**

---

## 计票逻辑详解

### 场景 1: 单次投票（多个选项）

**用户操作**：
```javascript
buildVotePayload({
  selectedOptions: [
    { idx: 1, vc: 2 },
    { idx: 2, vc: 1 }
  ]
})
```

**SDK 生成的消息**：
```
消息1: { stateIdx: 0, voIdx: 1, newVotes: 2, nonce: 1 }
消息2: { stateIdx: 0, voIdx: 2, newVotes: 1, nonce: 2 }
```

**处理过程**（从后往前）：
```
1. 处理消息2 (nonce=2):
   - MessageValidator 验证: ✅
   - 更新: voTree[2] = 1
   - 更新: user.nonce = 2

2. 处理消息1 (nonce=1):
   - MessageValidator 验证: ✅ (originalNonce=0, nonce=1, 匹配)
   - 更新: voTree[1] = 2
   - 更新: user.nonce = 1 (但此时已经是2了，所以实际是2)
```

**最终结果**：
```
voTree[1] = 2
voTree[2] = 1
user.nonce = 2
```

**关键理解**：
- 每个消息独立验证和更新
- 消息按顺序处理（从后往前）
- 每个消息只更新一个选项

---

### 场景 2: 多次投票（部分选项）

**第一次投票**：
```javascript
selectedOptions: [
  { idx: 1, vc: 2 },
  { idx: 2, vc: 1 }
]
```

**生成的消息**：
```
消息1: { voIdx: 1, newVotes: 2, nonce: 1 }
消息2: { voIdx: 2, newVotes: 1, nonce: 2 }
```

**处理后的状态**：
```
voTree[1] = 2
voTree[2] = 1
user.nonce = 2
```

**第二次投票**（只更新选项2）：
```javascript
selectedOptions: [
  { idx: 2, vc: 3 }
]
```

**生成的消息**：
```
消息3: { voIdx: 2, newVotes: 3, nonce: 3 }
```

**处理过程**（假设消息1、2、3都在同一批次）：
```
1. 处理消息3 (nonce=3):
   - MessageValidator 验证: ✅ (originalNonce=2, nonce=3, 匹配)
   - 更新: voTree[2] = 3
   - 更新: user.nonce = 3

2. 处理消息2 (nonce=2):
   - MessageValidator 验证: ❌ (originalNonce=3, nonce=2, 不匹配！)
   - 拒绝消息，不更新状态

3. 处理消息1 (nonce=1):
   - MessageValidator 验证: ❌ (originalNonce=3, nonce=1, 不匹配！)
   - 拒绝消息，不更新状态
```

**最终结果**：
```
voTree[1] = 0  (因为消息1被拒绝，选项1没有被更新，保持初始值0)
voTree[2] = 3  (消息3成功更新)
user.nonce = 3
```

**关键理解**：
- 如果只发送部分选项的消息，之前的消息会因为 nonce 不匹配被拒绝
- 被拒绝的消息不会更新状态
- 未更新的选项会保持之前的值（如果是首次投票，则为初始值0）

---

### 场景 3: 修改投票（完整选项）

**第一次投票**：
```javascript
selectedOptions: [
  { idx: 1, vc: 2 },
  { idx: 2, vc: 1 }
]
```

**第二次投票**（修改所有选项）：
```javascript
selectedOptions: [
  { idx: 1, vc: 0 },  // 想设置为0
  { idx: 2, vc: 3 }
]
```

**问题**：`buildVotePayload` 会过滤掉 `vc=0` 的选项：
```typescript
const options = selectedOptions.filter((o) => !!o.vc);
```

**实际生成的消息**：
```
消息3: { voIdx: 2, newVotes: 3, nonce: 3 }
// 注意：没有选项1的消息，因为 vc=0 被过滤了
```

**处理结果**：
```
voTree[1] = 0  (消息1被拒绝，选项1没有被更新)
voTree[2] = 3  (消息3成功更新)
```

**关键理解**：
- SDK 会过滤掉 `vc=0` 的选项
- 无法显式将选项设置为 0
- 如果之前的消息被拒绝，选项会保持之前的值或初始值

---

## MessageValidator 的验证逻辑

### 验证流程

对于每个消息，MessageValidator 执行以下验证：

```
1. 状态索引验证: stateTreeIndex <= numSignUps
2. 选项索引验证: voteOptionIndex < maxVoteOptions
3. Nonce 验证: nonce == originalNonce + 1
4. 签名验证: EdDSA 签名有效
5. 权重验证: voteWeight <= MAX
6. 余额验证: 余额 + 退回成本 >= 新成本
```

**所有 6 项验证必须全部通过，消息才有效。**

### 关键验证：Nonce

```circom
validNonce.in[0] <== originalNonce + 1;
validNonce.in[1] <== nonce;
```

**验证逻辑**：`nonce == originalNonce + 1`

**含义**：
- `originalNonce`: 用户当前的 nonce（在处理消息时从状态中读取）
- `nonce`: 消息中的 nonce（必须比 originalNonce 大 1）

**示例**：
- 用户当前 nonce = 2
- 消息 nonce = 3 ✅ (2 + 1 = 3)
- 消息 nonce = 2 ❌ (2 + 1 ≠ 2)
- 消息 nonce = 4 ❌ (2 + 1 ≠ 4)

---

## 状态更新逻辑

### 在 Operator 中的处理

```typescript
// 从状态中读取当前值
const s = this.stateLeaves.get(stateIdx);
const currVotes = s.voTree.leaf(voIdx);  // 当前选项的投票数
const originalNonce = s.nonce;            // 用户当前的 nonce

// MessageValidator 验证（在电路中）
// 如果验证通过，更新状态：
s.voTree.updateLeaf(voIdx, cmd.newVotes);  // 直接覆盖，不是累加
s.nonce = cmd.nonce;                        // 更新 nonce
```

**关键点**：
1. `voTree.updateLeaf(voIdx, newVotes)` 是**直接覆盖**，不是累加
2. `s.nonce = cmd.nonce` 会**更新全局 nonce**
3. 每个消息只更新一个选项

---

## 成本计算逻辑

### 成本计算（在 MessageValidator 中）

```circom
// 当前选项的已有成本（会被退回）
currentCostsForOption = isQuadraticCost ? 
  currentVotesForOption² : 
  currentVotesForOption;

// 新投票的成本
cost = isQuadraticCost ? 
  voteWeight² : 
  voteWeight;

// 余额验证
余额 + 退回成本 >= 新成本

// 新余额
newBalance = 余额 + 退回成本 - 新成本
```

**关键理解**：
- `currentVotesForOption`: 该选项**当前的投票数**（从状态中读取）
- `voteWeight`: 消息中的**新投票权重**
- 系统会**退回旧成本**，**扣除新成本**

**示例（线性成本）**：
```
当前状态: voTree[1] = 5, 余额 = 100
新消息: voIdx=1, newVotes=3

计算:
  退回成本 = 5
  新成本 = 3
  验证: 100 + 5 >= 3 ✅
  新余额 = 100 + 5 - 3 = 102
  更新: voTree[1] = 3
```

---

## 消息处理顺序

### 处理顺序：从后往前

```typescript
for (let i = batchSize - 1; i >= 0; i--) {
  const cmd = commands[i];
  // 处理消息
}
```

**原因**：
- 消息链是单向链表（每个消息包含前一个消息的哈希）
- 从后往前处理可以确保消息顺序的一致性

**影响**：
- 如果同一批次中有多个消息，后发送的消息会先被处理
- 这会影响 nonce 的验证顺序

---

## 总结

### MessageValidator 的计票逻辑

1. **单消息验证**：每个消息独立验证，只验证当前消息是否有效

2. **直接覆盖**：`voTree.updateLeaf(voIdx, newVotes)` 直接覆盖，不是累加

3. **全局 Nonce**：每个用户只有一个 nonce，无论更新哪个选项，nonce 都必须递增

4. **Nonce 机制导致覆盖行为**：
   - 如果只发送部分选项的消息，之前的消息会因为 nonce 不匹配被拒绝
   - 被拒绝的消息不会更新状态
   - 未更新的选项会保持之前的值（或初始值0）

5. **成本计算**：
   - 退回旧成本（基于 `currentVotesForOption`）
   - 扣除新成本（基于 `voteWeight`）
   - 更新余额

### 实际行为

**你的场景**：
```
第一次: [{option: 1, weight: 2}, {option: 2, weight: 1}]
第二次: [{option: 2, weight: 3}]
第三次: [{option: 3, weight: 5}]
```

**实际结果**：
```
第一次投票后: option1=2, option2=1, nonce=2
第二次投票后: option1=0, option2=3, nonce=3  (消息1被拒绝)
第三次投票后: option1=0, option2=0, option3=5, nonce=4  (消息1、2被拒绝)
```

**原因**：
- 每次投票只发送部分选项的消息
- 之前的消息因为 nonce 不匹配被拒绝
- 被拒绝的消息不会更新状态
- 未更新的选项保持之前的值或初始值0

### 关键理解

**MessageValidator 本身支持更新单个选项**，但由于：
1. Nonce 是全局的（不是每个选项独立）
2. 消息必须按 nonce 顺序处理
3. SDK 会过滤掉 `vc=0` 的选项

**实际行为是覆盖模式**，而不是累加模式。

