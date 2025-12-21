# AMACI E2E Debug Test - 带详细调试日志

## 测试说明

已在 `add-new-key.e2e.test.ts` 中添加大量调试日志，用于分析 "Invalid proof" 问题。

## 执行命令

```bash
cd /Users/feng/Desktop/dora-work/new/maci/e2e
pnpm mocha-test tests/add-new-key.e2e.test.ts --grep "should reject old voter votes after AddNewKey" 2>&1 | tee /tmp/amaci-e2e-debug.log
```

## 调试日志说明

### 🔍 DEBUG 日志位置

1. **Phase 8 开始前**
   - Operator 状态（FILLING/PROCESSING/TALLYING）
   - 消息总数和 deactivate 消息总数
   - State tree root 和 Active state tree root

2. **endVotePeriod() 前后**
   - 所有待处理消息的内容
   - 每个 state leaf 的详细状态（pubKey, balance, nonce, voted, d1, d2, activeState）

3. **每个 batch 的 processMessages**
   - State tree root 变化
   - Message hash 变化
   - processResult 内容
   - 处理后的 state leaves 状态

4. **合约提交前后**
   - 合约当前的 state commitment
   - 提交的 newStateCommitment
   - ZK proof 内容

5. **失败时**
   - ❌ 完整的错误信息
   - 完整的 state tree root
   - 完整的 active state tree root
   - 完整的 message hash
   - 完整的 proof (JSON格式)

## 关键观察点

### 需要对比的数据

1. **State tree root 一致性**
   - SDK 的 state tree root
   - 合约的 state commitment
   - 是否匹配？

2. **Active state tree 状态**
   - USER_1_OLD (deactivated) 应该是 non-0
   - USER_1_NEW (active) 应该是 0
   - USER_2 (active) 应该是 0

3. **Message 处理顺序**
   - Message 0: voter1 old key 第一次投票（deactivate 前）
   - Message 1: voter1 old key 第二次投票（deactivate 后）← 应该被拒绝
   - Message 2: voter1 new key 投票
   - Message 3: voter2 投票

4. **State leaf 变化**
   - 在 processDeactivateMessages 后，USER_1_OLD 的 pubKey 是否被修改？
   - 在 processMessages 后，balance 和 voted 是否正确更新？

## 预期行为 vs 实际行为

### 预期

- ✅ processDeactivateMessages 成功
- ✅ ActiveStateTree[0] = non-0 (inactive)
- ✅ AddNewKey 成功
- ✅ ActiveStateTree[2] = 0 (active)
- ❌ processMessages **失败** with "Invalid proof"

### 可能的根本原因

1. **State root 不同步**
   - SDK 计算的 state root ≠ 合约的 state root
   - 可能在 `processDeactivateMessages` 后状态没有正确更新

2. **Active state tree 不被 circuit 识别**
   - Circuit 可能没有正确使用 activeStateTree 数据
   - 或者 activeStateTree 在 proof 生成时没有被包含

3. **Message 处理逻辑问题**
   - 在 deactivate 后发布的新消息可能导致状态不一致
   - Circuit input 可能缺少某些关键数据

## 调试步骤

1. **查看完整日志**
   ```bash
   cat /tmp/amaci-e2e-debug.log
   ```

2. **重点关注**
   - `🔍 DEBUG: State BEFORE endVotePeriod()` 段落
   - `🔍 DEBUG: ========== Processing batch 0 ==========` 段落
   - `❌ DEBUG: processMessage FAILED` 段落（如果失败）

3. **对比 state root**
   - SDK 的 `State tree root before processMessages`
   - 合约的 `Contract state commitment before submission`
   - 是否一致？

4. **检查 state leaves**
   - USER_1_OLD 的 pubKey 是否为 [0, 0]？
   - d1, d2 值是否正确？
   - activeState 是否正确？

## 下一步

根据日志分析结果，可能需要：

1. **修改 SDK**: 如果发现状态同步问题
2. **修改 Circuit**: 如果发现 proof 生成逻辑问题
3. **调整测试**: 如果发现是测试用例的问题
4. **接受限制**: 如果这是设计上的限制（需要文档说明）

