# SDK 命令验证 - Poll ID 检查增强

## 更新日期
2026-02-01

## 🎯 问题发现

在代码审查中发现，SDK 的命令验证函数 (`checkCommandNow` 和 `checkDeactivateCommand`) 缺少 **Poll ID 验证**。

虽然电路层面已经有 Poll ID 验证，但在 SDK 层面添加验证有以下重要优势：

### 🔒 为什么需要 SDK 层面的 Poll ID 验证

#### 1. **防御深度 (Defense in Depth)**
```
用户消息 → SDK验证 → 电路验证 → 链上验证
          ↑ 第一道防线  ↑ 第二道防线   ↑ 最终防线
```

#### 2. **提前发现错误**
- ✅ **在生成 proof 之前** 就拦截无效消息
- ✅ **避免浪费计算资源** 为无效消息生成昂贵的 zkSNARK proof
- ✅ **提供清晰的错误信息** "poll id mismatch" vs 电路的 "proof generation failed"

#### 3. **节省成本**
生成 zkSNARK proof 是**非常昂贵**的操作：
- ⏱️ 时间成本：几秒到几分钟
- 💾 内存成本：可能需要数 GB RAM
- ⚡ 计算成本：需要大量 CPU 周期

如果能在 SDK 层面提前检测出错误，可以避免这些开销。

#### 4. **更好的用户体验**
```typescript
// ❌ 没有 SDK 验证
await operator.processMessages(...);
// 几分钟后...
// Error: Proof generation failed (用户不知道为什么)

// ✅ 有 SDK 验证
await operator.processMessages(...);
// 立即返回
// Error: Message validation failed - poll id mismatch (明确的错误原因)
```

## ✅ 实现的修改

### 1. `checkDeactivateCommand` 函数

在 `packages/sdk/src/operator.ts` 第 1329-1332 行添加：

```typescript
// Check poll ID match
if (this.pollId !== undefined && cmd.pollId !== this.pollId) {
  return 'poll id mismatch';
}
```

**完整的验证顺序**:
```typescript
private checkDeactivateCommand(
  cmd: Command | null,
  subStateTreeLength: number
): string | undefined {
  if (!cmd) {
    return 'empty command';
  }
  if (cmd.stateIdx >= BigInt(subStateTreeLength)) {
    return 'state leaf index overflow';
  }
  
  // ✅ 新增：Poll ID 验证
  if (this.pollId !== undefined && cmd.pollId !== this.pollId) {
    return 'poll id mismatch';
  }
  
  const stateIdx = Number(cmd.stateIdx);
  const s = this.stateLeaves.get(stateIdx) || this.emptyState();

  // Check if already deactivated
  const deactivate = this.decryptDeactivate({
    c1: { x: s.d1[0], y: s.d1[1] },
    c2: { x: s.d2[0], y: s.d2[1] },
    xIncrement: 0n
  });
  if (deactivate % 2n === 1n) {
    return 'deactivated';
  }

  const verified = verifySignature(cmd.msgHash, cmd.signature, s.pubKey);
  if (!verified) {
    return 'signature error';
  }
}
```

### 2. `checkCommandNow` 函数

在 `packages/sdk/src/operator.ts` 第 1632-1635 行添加：

```typescript
// Check poll ID match
if (this.pollId !== undefined && cmd.pollId !== this.pollId) {
  return 'poll id mismatch';
}
```

**完整的验证顺序**:
```typescript
private checkCommandNow(
  cmd: Command | null,
  derivePathParams?: DerivePathParams
): string | undefined {
  const signer = this.getSigner(derivePathParams);

  if (!cmd) {
    return 'empty command';
  }
  if (cmd.stateIdx > BigInt(this.numSignUps!)) {
    return 'state leaf index overflow';
  }
  if (cmd.voIdx > BigInt(this.maxVoteOptions!)) {
    return 'vote option index overflow';
  }
  
  // ✅ 新增：Poll ID 验证
  if (this.pollId !== undefined && cmd.pollId !== this.pollId) {
    return 'poll id mismatch';
  }
  
  const stateIdx = Number(cmd.stateIdx);
  const voIdx = Number(cmd.voIdx);
  const s = this.stateLeaves.get(stateIdx) || this.emptyState();

  const as = this.activeStateTree!.leaf(stateIdx) || 0n;
  if (as !== 0n) {
    return 'inactive';
  }

  const deactivate = decrypt(signer.getFormatedPrivKey(), {
    c1: { x: s.d1[0], y: s.d1[1] },
    c2: { x: s.d2[0], y: s.d2[1] },
    xIncrement: 0n
  });
  if (deactivate % 2n === 1n) {
    return 'deactivated';
  }

  if (s.nonce + 1n !== cmd.nonce) {
    return 'nonce error';
  }
  const verified = verifySignature(cmd.msgHash, cmd.signature, s.pubKey);
  if (!verified) {
    return 'signature error';
  }
  // ... 继续其他验证 ...
}
```

## 🔍 验证逻辑说明

### 条件检查
```typescript
if (this.pollId !== undefined && cmd.pollId !== this.pollId) {
  return 'poll id mismatch';
}
```

**为什么使用 `this.pollId !== undefined`？**

1. **兼容性**: 允许在 `pollId` 尚未设置时（如初始化阶段）不进行验证
2. **灵活性**: 如果 round 还没开始，`this.pollId` 可能是 `undefined`
3. **安全性**: 一旦设置了 `pollId`，就会严格验证

### 验证时机

Poll ID 验证在 **所有其他验证之前**（除了基本的 null 检查和索引溢出检查）：

```
1. ✅ 基本检查 (cmd 是否为 null)
2. ✅ 索引溢出检查
3. ✅ Poll ID 验证 ← 新增
4. ✅ 状态检查 (deactivated, inactive)
5. ✅ Nonce 验证
6. ✅ 签名验证
7. ✅ 余额验证
```

**为什么放在这个位置？**
- 在昂贵的加密操作（解密、签名验证）之前
- 在需要访问状态树的操作之前
- 快速失败 (Fail Fast) 原则

## 📊 错误场景示例

### 场景 1: 跨 Poll 重放攻击

```typescript
// Round 1 (pollId = 1)
const voter1 = new VoterClient({ pollId: 1n });
const msg1 = voter1.publishMessage({
  stateIdx: 1n,
  voteOptionIndex: 0n,
  newVoteWeight: 5n
});

// Round 2 (pollId = 2)
const operator = new OperatorClient();
await operator.initRound({ pollId: 2n });

// 尝试在 Round 2 中处理 Round 1 的消息
await operator.processMessages();
// ❌ 在 checkCommandNow 中立即失败
// Error: Message <0> validation failed - poll id mismatch
// ✅ 避免了生成 proof 的开销
```

### 场景 2: 错误的 pollId 配置

```typescript
// 用户错误地使用了错误的 pollId
const voter = new VoterClient({ pollId: 999n }); // ❌ 错误的 pollId
const msg = voter.publishMessage({
  stateIdx: 1n,
  voteOptionIndex: 0n,
  newVoteWeight: 5n
});

const operator = new OperatorClient();
await operator.initRound({ pollId: 1n }); // ✅ 正确的 pollId

await operator.processMessages();
// ✅ SDK 立即检测到错误
// Console: - Message <0> poll id mismatch
// ✅ 消息被跳过，继续处理下一条
```

## 🛡️ 安全性分析

### 多层防御架构

```
┌─────────────────────────────────────────────┐
│ Layer 1: SDK Validation (checkCommandNow)  │ ← 新增
│ - Quick checks (ns ~ μs)                   │
│ - Immediate feedback                        │
│ - Poll ID mismatch detection               │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Layer 2: Circuit Validation                │
│ - zkSNARK proof generation (seconds)       │
│ - Mathematical guarantees                   │
│ - Poll ID constraint                        │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Layer 3: Contract Validation               │
│ - Proof verification (milliseconds)         │
│ - State consistency                         │
│ - Final authority                           │
└─────────────────────────────────────────────┘
```

### 性能对比

| 检测层 | 检测时间 | 成本 | 错误消息 |
|--------|----------|------|----------|
| SDK | < 1 μs | 极低 | ✅ "poll id mismatch" (清晰) |
| 电路 | 几秒 ~ 几分钟 | 高 | ❌ "proof generation failed" (模糊) |
| 合约 | 几 ms | 中等 | ⚠️ "invalid proof" (模糊) |

## 📝 测试建议

### 单元测试

```typescript
describe('checkCommandNow - Poll ID validation', () => {
  it('should reject command with mismatched poll ID', () => {
    const operator = new OperatorClient();
    await operator.initRound({ pollId: 1n });
    
    const cmd = {
      pollId: 2n, // ❌ 不匹配
      stateIdx: 1n,
      voIdx: 0n,
      // ... other fields
    };
    
    const error = operator['checkCommandNow'](cmd);
    expect(error).toBe('poll id mismatch');
  });

  it('should accept command with matching poll ID', () => {
    const operator = new OperatorClient();
    await operator.initRound({ pollId: 1n });
    
    const cmd = {
      pollId: 1n, // ✅ 匹配
      stateIdx: 1n,
      voIdx: 0n,
      // ... other fields
    };
    
    const error = operator['checkCommandNow'](cmd);
    expect(error).not.toBe('poll id mismatch');
  });

  it('should skip validation when pollId is undefined', () => {
    const operator = new OperatorClient();
    // 未调用 initRound，pollId 为 undefined
    
    const cmd = {
      pollId: 999n,
      stateIdx: 1n,
      voIdx: 0n,
      // ... other fields
    };
    
    const error = operator['checkCommandNow'](cmd);
    // ✅ 不会因为 poll ID 失败（因为 this.pollId 是 undefined）
    expect(error).not.toBe('poll id mismatch');
  });
});

describe('checkDeactivateCommand - Poll ID validation', () => {
  // 类似的测试用例...
});
```

### 集成测试

```typescript
describe('processMessages - Poll ID validation', () => {
  it('should skip messages with invalid poll ID', async () => {
    const operator = new OperatorClient();
    await operator.initMaci({ /* ... */ });
    await operator.initRound({ pollId: 1n });
    
    // 添加一条 pollId = 2 的消息（无效）
    const voter = new VoterClient({ pollId: 2n });
    await voter.publishMessage({ /* ... */ });
    
    // 添加一条 pollId = 1 的消息（有效）
    const validVoter = new VoterClient({ pollId: 1n });
    await validVoter.publishMessage({ /* ... */ });
    
    const result = await operator.processMessages();
    
    // ✅ 第一条消息应该被标记为错误
    // ✅ 第二条消息应该成功处理
    expect(result.processedCount).toBe(1);
  });
});
```

## ✅ 总结

### 修改内容
1. ✅ `checkDeactivateCommand`: 添加 Poll ID 验证（第 1329-1332 行）
2. ✅ `checkCommandNow`: 添加 Poll ID 验证（第 1632-1635 行）

### 安全增强
1. ✅ **提前检测**: 在生成 proof 之前发现 poll ID 不匹配
2. ✅ **节省资源**: 避免为无效消息生成昂贵的 zkSNARK proof
3. ✅ **更好的错误信息**: 返回清晰的 "poll id mismatch" 错误
4. ✅ **防御深度**: 与电路和合约层面的验证形成多层防护

### 向后兼容
✅ **完全兼容**: 通过 `this.pollId !== undefined` 条件判断，确保在 `pollId` 未设置时不进行验证

### 性能影响
✅ **几乎无影响**: 添加一个简单的 bigint 比较，耗时 < 1 μs
✅ **性能提升**: 对于无效消息，避免了昂贵的 proof 生成（节省几秒到几分钟）

这是一个**非常重要的安全改进**，感谢您的发现！🎉
