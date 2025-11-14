# AMACI E2E 测试时间优化 - 最终方案

## ✅ 问题已解决

将 AMACI E2E 测试的等待时间从 **61 秒** 优化到 **5-10 秒**，**速度提升 84%** 🚀

## 核心问题

AMACI 合约要求投票期至少 10 分钟（600秒），原测试方案：
- start_time: 600秒前
- end_time: 60秒后
- **需要等待 61 秒才能进入处理阶段**

## 最终解决方案

### 策略：最小化真实等待时间

由于 `cw-simulate` 使用系统时间，无法模拟时间推进，我们采用以下方案：

```typescript
// 1. 设置最小有效投票期（610秒）
const now = BigInt(Date.now()) * BigInt(1_000_000);
const startTime = now - BigInt(585) * BigInt(1_000_000_000); // 585秒前
votingEndTime = now + BigInt(25) * BigInt(1_000_000_000); // 25秒后

// 2. 所有测试操作在 25 秒内完成
// - 用户注册：~2秒
// - Deactivate + ZK proof：~12秒
// - 添加新密钥：~0.5秒
// - 3个投票操作：~4秒
// 总计：~18-19秒

// 3. 动态计算剩余等待时间
const currentTime = BigInt(Date.now()) * BigInt(1_000_000);
if (currentTime < votingEndTime) {
  const waitMs = Number((votingEndTime - currentTime) / BigInt(1_000_000)) + 1000;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}
// 通常只需等待 5-10 秒
```

## 关键改进

| 项目 | 修改前 | 修改后 | 提升 |
|------|--------|--------|------|
| 等待时间 | 固定 61秒 | 动态 5-10秒 | **84%** ⚡ |
| 可控性 | ❌ 写死 | ✅ 动态计算 | ✅ |
| 日志 | ❌ 无详情 | ✅ 完整时间信息 | ✅ |
| 投票成功率 | ✅ | ✅ | ✅ |

## 实测效果

### 测试日志（2025-11-14）

```
[05:35:03] Current time: 05:35:03
[05:35:03] Voting period end: 05:35:28 (25秒后)
[05:35:03] ⏰ Voting period ends in 25 seconds

... 测试操作 ...

[05:35:18] ✅ User 1 vote submitted
[05:35:19] ✅ User 2 vote submitted  
[05:35:21] ✅ User 1 (new key) vote submitted

[05:35:21] Need to wait 9 seconds for voting period to end...
[05:35:29] ✅ Waited 9 seconds, voting period should be expired now
```

**结果**：
- ✅ 所有投票在 18 秒内完成
- ✅ 动态等待仅 9 秒
- ✅ 总运行时间 ~27 秒（vs 原来 61+ 秒）

## 关键经验

### 1. 缓冲时间计算

**错误尝试**：15秒缓冲 → 投票超时失败

**原因分析**：
- ZK proof 生成需要 10-12 秒（最耗时）
- 其他操作需要 6-7 秒
- 总共需要 ~18 秒

**正确方案**：25秒缓冲
- 提供足够余量
- 确保所有操作都在投票期内完成

### 2. 时间推进尝试失败

尝试使用 `advanceTime()` 模拟时间推进：
```typescript
app.lastBlockTime = newTime; // ❌ 无效
```

**失败原因**：
- `cw-simulate` 每次执行合约时都使用 `Date.now()`
- 无法欺骗合约的时间检查
- 这是设计行为，确保测试接近真实环境

### 3. 动态时间管理

不要写死等待时间：
```typescript
// ❌ 不好
await new Promise(resolve => setTimeout(resolve, 61000));

// ✅ 好
const remainingTime = votingEndTime - currentTime;
if (remainingTime > 0) {
  await new Promise(resolve => setTimeout(resolve, remainingTime + buffer));
}
```

## 代码变更

### 主要修改文件

1. **e2e/tests/amaci.e2e.test.ts** (2处修改)
   - 第 137-149 行：设置投票时间（585秒前 + 25秒后）
   - 第 419-435 行：动态计算等待时间

### 修改概览

```diff
- const startTime = now - BigInt(600) * BigInt(1_000_000_000); // 600 seconds ago
- votingEndTime = now + BigInt(60) * BigInt(1_000_000_000); // 60 seconds in the future
+ const startTime = now - BigInt(585) * BigInt(1_000_000_000); // 585 seconds ago
+ votingEndTime = now + BigInt(25) * BigInt(1_000_000_000); // 25 seconds in the future

- await new Promise((resolve) => setTimeout(resolve, 61000)); // 固定61秒
+ const waitMs = Number((votingEndTime - currentTime) / BigInt(1_000_000)) + 1000;
+ await new Promise((resolve) => setTimeout(resolve, waitMs)); // 动态等待
```

## 局限性

1. **无法完全消除等待**：
   - cw-simulate 使用系统时间
   - 必须等待真实时间（虽然已最小化）

2. **仍需约 5-10 秒**：
   - 相比原来的 61 秒已经大幅改善
   - 是当前框架下的最优解

3. **依赖操作时间**：
   - 如果添加更多操作，可能需要增加缓冲时间
   - 需要根据实际情况调整

## 未来改进方向

1. **完全消除等待**：
   - 需要修改 cw-simulate 源码
   - 或使用不同的测试框架

2. **并行测试**：
   - 将时间敏感的测试与其他测试分离
   - 时间测试可以在后台运行

3. **CI/CD 优化**：
   - 在 CI 中，5-10 秒的等待是可接受的
   - 相比原来节省了大量时间

## 结论

通过精心设计的时间策略：
- ✅ 满足合约 600 秒最低要求
- ✅ 所有操作在有效期内完成
- ✅ 等待时间从 61 秒降到 5-10 秒
- ✅ **测试速度提升 84%**

这是在 `cw-simulate` 框架限制下能达到的**最优方案** 🎉

## 文档

详细技术分析和尝试过程，请参考：
- [TIME_ISSUE_RESOLUTION.md](./TIME_ISSUE_RESOLUTION.md) - 完整问题解决过程
- [TIME_OPTIMIZATION.md](./TIME_OPTIMIZATION.md) - 时间优化技术文档
- [CHANGES_SUMMARY.md](./CHANGES_SUMMARY.md) - 代码变更总结

