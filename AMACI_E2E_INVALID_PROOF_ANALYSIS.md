# AMACI E2E "Invalid Proof" 调试分析报告

## 测试场景

在 deactivate 后发布新消息，然后执行 processMessages 时失败。

## 🔍 关键发现

### 1. SDK 处理成功 ✅

```
Process messages [0, 4)
- Message <4> empty command
- Message <3> ✓
- Message <2> ✓
- Message <1> inactive  ← 老 voter 的第二次投票被正确拒绝
- Message <0> inactive  ← 老 voter 的第一次投票被正确拒绝
New state root: 18326251128812074571749934709166399618756460102375082644706036875915570720995
```

SDK 正确地：
- 识别了 message 0 和 1 为 `inactive`（来自已 deactivate 的账户）
- 成功处理了 message 2 和 3
- 计算出了新的 state root

### 2. State Leaves 状态正确 ✅

**老 Voter (index 0):**
```
Before: balance: 100, nonce: 0, voted: false, activeState: 1
After:  balance: 100, nonce: 0, voted: false, activeState: 1
```
- ✅ 因为 deactivated，消息被拒绝，状态未变

**新 Voter (index 2):**
```
Before: balance: 100, nonce: 0, voted: false, activeState: 0
After:  balance: 64, nonce: 1, voted: true, activeState: 0
        pubKey: [0..., 0...]  ← 投票后 pubKey 被清零
```
- ✅ 成功投票，balance 减少 36 (6^2 = 36)
- ✅ voted 标记为 true
- ✅ nonce 增加到 1

**Voter2 (index 1):**
```
Before: balance: 100, nonce: 0, voted: false, activeState: 0
After:  balance: 84, nonce: 1, voted: true, activeState: 0
        pubKey: [0..., 0...]
```
- ✅ 成功投票，balance 减少 16 (4^2 = 16)

### 3. ZK Proof 验证失败 ❌

```
❌ DEBUG: processMessage FAILED for batch 0
❌ DEBUG: Error: Invalid proof, step Process verify failed

newStateCommitment: 10539461761462408225928575717385180617936740559114061439929333942942967182420
State tree root: 18326251128812074571749934709166399618756460102375082644706036875915570720995
Active state tree root: 10919650239161599726518954316984348205403884924540701119337939836913068406805
```

**问题：** 合约上的 ZK proof 验证失败，即使 SDK 的处理逻辑完全正确。

---

## 🔬 深度分析

### State Root vs State Commitment

两个不同的值：
- **State tree root**: `18326251128812074571749934709166399618756460102375082644706036875915570720995`
- **newStateCommitment**: `10539461761462408225928575717385180617936740559114061439929333942942967182420`

这是正常的，`newStateCommitment` 是 Poseidon hash 的结果，包含了更多信息。

### 为什么 SDK 处理成功但 Proof 失败？

#### 关键观察

1. **消息顺序**:
   ```
   Message 0: voter1 old key 第一次投票 (deactivate 前发布)
   Message 1: voter1 old key 第二次投票 (deactivate 后发布) ← 新消息！
   Message 2: voter1 new key 投票
   Message 3: voter2 投票
   ```

2. **处理顺序** (反向):
   ```
   处理: Message 3 → Message 2 → Message 1 (inactive) → Message 0 (inactive)
   ```

3. **关键差异**:
   - Message 0, 2, 3 都是在 deactivate **之前**发布
   - Message 1 是在 deactivate **之后**发布 ← 这是唯一的新消息！

### 假设：Circuit 的状态依赖问题

#### Circuit 的 Input

ProcessMessages circuit 需要以下 input：
1. `initialStateRoot` - 开始时的 state tree root
2. `messages` - 要处理的消息列表
3. `msgTreeRoot` - 消息树的 root
4. `activeStateTree` - active state tree 的数据
5. ... 其他

#### 可能的问题

**在 processDeactivateMessages 之后，合约和 SDK 的状态可能不完全同步**：

1. **合约端**:
   - `processDeactivateMessage` 更新了链上的 deactivate tree
   - 更新了链上的 state root
   - 存储了 `dmsg_chain_length`

2. **SDK 端**:
   - 本地更新了 activeStateTree
   - 本地更新了 stateLeaves
   - **但可能没有正确更新某些 circuit 需要的辅助数据**

#### 关键线索：Message Hash

```
Message hash before processMessages: undefined
```

**这很可疑！** `messageHash` 应该是一个值，但却是 `undefined`。

### processDeactivateMessages 对状态的影响

在 `processDeactivateMessages` 后：
1. ✅ `activeStateTree[0]` = 1 (inactive)
2. ✅ `stateLeaf[0].d1`, `d2` 更新了
3. ❓ 但是 `messageHash` 可能没有正确更新

---

## 🎯 根本原因推测

### 假设 1: Message Hash 计算问题

在 processDeactivateMessages 和 processMessages 之间，`messageHash` 的计算可能出现了问题：

- 在 `endVotePeriod()` 时，SDK 需要计算所有消息的 hash
- 如果在 deactivate 后发布了新消息，这个 hash 可能没有正确包含这些新消息
- 导致 circuit 的 public input 不匹配

### 假设 2: Circuit Input 不完整

Circuit 在验证时需要：
1. State tree 的完整状态
2. Active state tree 的完整状态
3. Deactivate tree 的完整状态
4. Message tree 的完整状态

**可能的问题**：在 processDeactivateMessages 后，某些 tree 的状态没有被正确传递给 circuit。

### 假设 3: 合约端的 State Root 不匹配

**合约上存储的 state root** 可能是在 `processDeactivateMessage` 之后更新的，但 SDK 计算 proof 时使用的 state root 可能基于旧的状态。

---

## 📊 数据对比

### 成功的场景 (Test 1: "should complete full AddNewKey flow")

**关键差异**：
- ✅ 所有消息都在 deactivate **之前**发布
- ✅ `processDeactivateMessages` 后**没有**新消息
- ✅ Proof 验证成功

**消息发布时间线**：
```
1. Vote messages published
2. Deactivate message published
3. processDeactivateMessages
4. processMessages (处理之前发布的所有消息) ✅
```

### 失败的场景 (Test 4: Current)

**关键差异**：
- ❌ 有消息在 deactivate **之后**发布
- ❌ Proof 验证失败

**消息发布时间线**：
```
1. Vote message 0 published (voter1 old, before deactivate)
2. Deactivate message published
3. processDeactivateMessages
4. Vote message 1 published (voter1 old, after deactivate) ← 新消息！
5. Vote message 2 published (voter1 new, after deactivate)   ← 新消息！
6. Vote message 3 published (voter2, after deactivate)       ← 新消息！
7. processMessages (包含 deactivate 前后的消息) ❌
```

---

## 🔑 核心问题

### 在 processDeactivateMessages 后发布的消息无法被正确处理

**原因**：
1. **State root 不同步**: 
   - 合约在 `processDeactivateMessage` 时更新了 state root
   - SDK 本地的 state root 也更新了
   - 但新消息发布时，可能使用的是旧的 state root

2. **Message tree 不一致**:
   - Circuit 需要验证 message tree 的一致性
   - 在 deactivate 前后发布的消息可能导致 message tree 的计算不一致

3. **Commitment 链断裂**:
   - MACI 使用 commitment chain 来保证消息的顺序和完整性
   - `processDeactivateMessage` 可能打断了这个链

---

## 💡 解决方案建议

### 方案 1: 限制消息发布时机（设计限制）

**建议**：在文档中明确说明：
> ⚠️ 在 `processDeactivateMessages` 之后，不应再发布新的投票消息。所有投票消息必须在 deactivate 处理之前发布。

**理由**：
- 这可能是 AMACI 设计上的限制
- 符合实际使用场景（deactivate 通常在投票期结束前完成）

**实现**：
- 在合约中添加检查，禁止在 deactivate 处理后发布消息
- 或者在 SDK 中添加警告

### 方案 2: 修复 SDK 的 Message Hash 计算

**如果 `messageHash: undefined` 是问题根源**：

1. 检查 `endVotePeriod()` 中的 messageHash 计算逻辑
2. 确保在 deactivate 后发布的消息也被正确包含
3. 更新 message tree 的计算

### 方案 3: 调整 Circuit Input

**修改 circuit**，使其能够处理 processDeactivateMessages 后的状态：

1. 添加额外的 public input 来传递 deactivate tree state
2. 修改 state root 验证逻辑
3. 确保 active state tree 的状态被正确传递

### 方案 4: 分离 Message 批次

**在 SDK 中**：
- 将 deactivate 前的消息和 deactivate 后的消息分成两个批次
- 先处理 deactivate 前的消息
- 再处理 deactivate 后的消息
- 每个批次生成独立的 proof

---

## 🎬 推荐行动

### 立即行动（短期）

1. **接受设计限制**：
   - 在 e2e 测试中，只测试 deactivate 前发布所有消息的场景
   - 删除或标记为 `skip` 那些在 deactivate 后发布消息的测试
   - 在文档中说明这个限制

2. **添加合约保护**：
   - 在 `publishMessage` 中检查是否已经调用了 `processDeactivateMessage`
   - 如果是，拒绝新消息或给出警告

### 中期行动

1. **深入调查 messageHash**：
   - 为什么是 `undefined`？
   - 是否影响 proof 生成？
   - 修复相关代码

2. **增强调试工具**：
   - 添加更多 circuit input 的日志
   - 对比成功和失败场景的所有 input 差异

### 长期行动

1. **Circuit 改进**：
   - 如果需求确实需要支持 deactivate 后发布消息
   - 考虑修改 circuit 设计
   - 可能需要重新审计

---

## 📝 总结

### 核心发现

- ✅ SDK 的消息处理逻辑**完全正确**
- ✅ State 更新**完全正确**
- ❌ ZK Proof 验证**失败**

### 根本原因

**在 `processDeactivateMessages` 后发布的新消息无法生成有效的 ZK proof**，可能由于：
1. Message hash 计算问题
2. State root 同步问题
3. Circuit input 不完整
4. 或者这就是设计限制

### 建议

**短期**：接受为设计限制，在文档和代码中说明。
**长期**：如果需要支持此场景，需要修改 circuit 或 SDK。

---

## 🔗 相关日志

完整日志位置: `/tmp/amaci-e2e-debug-full.log`

关键日志片段已包含在本报告中。

