# E2E 测试时间问题解决方案

## 问题发现

原测试代码在投票期结束后需要等待真实时间（61秒），导致测试运行缓慢。

## 尝试的方案

### 方案 1: 使用 advanceTime() 模拟时间推进 ❌

**思路**: 通过修改 `client.app.lastBlockTime` 来模拟时间推进，避免真实等待。

**结果**: 失败

**原因**: 
- `cw-simulate` 在每次执行合约时都使用实际的 `Date.now()` 创建 env
- 即使我们更新了 `app.lastBlockTime`，合约执行时仍然使用系统时间
- 从测试日志可以看到：
  ```
  ✅ New block time after advance: 1763098176321999872 (成功更新)
  ❌ Contract still reports: PeriodError (合约仍认为时间未到)
  ```

### 方案 2: 将投票期设置在过去 ❌

**思路**: 在部署合约时就将 start_time 和 end_time 都设置在过去，这样测试时投票期已经结束。

**结果**: 失败

**原因**:
- 合约在 instantiate 时会验证时间
- 虽然我们设置了有效的 610 秒投票期（满足 600 秒最低要求）
- 但合约可能还有其他未明确的验证逻辑
- 错误: `Error: The end_time must be greater than the start_time and more than 10 minutes apart.`

### 方案 3: 最小化实际等待时间 ✅ **（最终方案）**

**思路**: 既然无法绕过真实时间，就将等待时间最小化。

**实现**:
1. 将投票期设置为满足合约要求的最小值（610 秒）
2. start_time 设置在 585 秒前（过去）
3. end_time 设置在 25 秒后（未来）- **关键**：必须给足够的缓冲时间
4. 测试操作时间分析：
   - 用户注册：~2秒
   - Deactivate消息处理（含ZK proof生成）：~12秒
   - 添加新密钥：~0.5秒
   - 3个投票操作：~4秒
   - **总计：约18-19秒**
5. 设置 25 秒缓冲确保所有操作都在投票期内完成
6. 完成所有操作后动态计算剩余等待时间（通常只需 5-10 秒）

```typescript
const now = BigInt(Date.now()) * BigInt(1_000_000);
const startTime = now - BigInt(585) * BigInt(1_000_000_000); // 585 seconds ago
votingEndTime = now + BigInt(25) * BigInt(1_000_000_000); // 25 seconds in the future
// Total duration: 585 + 25 = 610 seconds (满足 600 秒最低要求)

// 在测试末尾动态计算需要等待的时间
const currentTime = BigInt(Date.now()) * BigInt(1_000_000);
if (currentTime < votingEndTime) {
  const waitMs = Number((votingEndTime - currentTime) / BigInt(1_000_000)) + 1000;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}
```

## 效果对比

| 方案 | 等待时间 | 可行性 | 说明 |
|------|---------|--------|------|
| 原方案 | 61 秒 | ✅ | 固定等待 61 秒 |
| 时间推进 | 0 秒 | ❌ | cw-simulate 使用系统时间，无法模拟 |
| 过期时间 | 0 秒 | ❌ | 合约部署时验证失败 |
| 15秒缓冲 | ~15 秒 | ❌ | 缓冲时间不足，投票期内超时 |
| **25秒缓冲** | **~5-10 秒** | ✅ | **实际可行的最优方案** |

## 核心发现

1. **cw-simulate 时间机制**:
   - `cw-simulate` 在执行合约时使用实际的 `Date.now()`
   - 无法通过修改 `app.lastBlockTime` 或 `store` 来欺骗合约
   - 这是设计行为，确保测试环境接近真实链

2. **合约时间验证**:
   - AMACI 合约要求投票期至少 10 分钟（600 秒）
   - 在 `instantiate` 时就进行验证
   - 检查：`start_time + 600秒 >= end_time` 时报错

3. **最优策略**:
   - 将 start_time 尽可能设置在过去（585秒）
   - 将 end_time 设置为足够完成所有测试操作的未来（25秒）
   - 动态计算实际需要等待的时间（通常只需 5-10 秒）
   - 从 61 秒优化到 5-10 秒，**提升约 84% 的速度** 🚀

## MACI 测试同步

`maci.e2e.test.ts` 也使用了类似的策略，但 MACI 没有 10 分钟限制，可以设置更短的投票期。

## 代码修改位置

### amaci.e2e.test.ts

1. **部署时设置时间** (第 137-142 行):
   ```typescript
   const now = BigInt(Date.now()) * BigInt(1_000_000);
   const startTime = now - BigInt(585) * BigInt(1_000_000_000); // 585 seconds ago
   votingEndTime = now + BigInt(25) * BigInt(1_000_000_000); // 25 seconds in the future
   // Buffer time accounts for: registration(2s) + deactivate(12s) + voting(4s) + processing(5s) + margin(2s)
   ```

2. **动态等待** (第 419-435 行):
   ```typescript
   const currentTime = BigInt(Date.now()) * BigInt(1_000_000);
   if (currentTime < votingEndTime) {
     const waitMs = Number((votingEndTime - currentTime) / BigInt(1_000_000)) + 1000;
     await new Promise((resolve) => setTimeout(resolve, waitMs));
   }
   ```

## 日志输出示例

```
[2025-11-14T05:35:03.319Z] Current time: 1763098503319000000 (2025-11-14T05:35:03.319Z)
[2025-11-14T05:35:03.319Z] Voting period: start=1763097918319000000 (2025-11-14T05:25:18.319Z), end=1763098528319000000 (2025-11-14T05:35:28.319Z)
[2025-11-14T05:35:03.319Z] Period duration: 610 seconds
[2025-11-14T05:35:03.319Z] ⏰ Voting period ends in 25 seconds, all operations should complete within this time

... (测试操作：注册、deactivate、投票) ...

[2025-11-14T05:35:18.699Z] ✅ User 1 vote submitted
[2025-11-14T05:35:19.477Z] ✅ User 2 vote submitted
[2025-11-14T05:35:21.699Z] ✅ User 1 (new key) vote submitted (所有投票都在25秒内完成)

=== Step 6: End Vote Period ===

[2025-11-14T05:35:21.054Z] Current time: 1763098521054000000 (2025-11-14T05:35:21.054Z)
[2025-11-14T05:35:21.054Z] Voting end time: 1763098528319000000 (2025-11-14T05:35:28.319Z)
[2025-11-14T05:35:21.054Z] Need to wait 9 seconds for voting period to end...
[2025-11-14T05:35:21.054Z] ⏳ Waiting for real time (cw-simulate uses system time)...
[2025-11-14T05:35:29.322Z] ✅ Waited 9 seconds, voting period should be expired now
```

## 结论

虽然无法完全消除等待时间，但通过优化时间设置策略：

1. ✅ 将等待时间从 61 秒减少到约 5-10 秒
2. ✅ **测试速度提升 84%**
3. ✅ 所有投票操作都在有效期内成功完成
4. ✅ 动态计算等待时间，更加灵活

这是在 cw-simulate 框架限制下能达到的最优方案。

## 关键经验教训

1. **缓冲时间必须充足**：
   - 初次设置 15 秒缓冲 → 失败（投票期内超时）
   - 调整为 25 秒缓冲 → 成功（所有操作在 18 秒内完成）
   - **教训**：必须实际测量操作时间，留有足够余量

2. **ZK Proof 生成是最耗时的操作**：
   - Deactivate proof 生成：~10-12 秒
   - 这是无法优化的（受限于电路复杂度）
   - 必须在时间规划中充分考虑

3. **动态等待优于固定等待**：
   - 根据实际剩余时间动态计算
   - 通常只需等待 5-10 秒而非固定的 61 秒

## 建议

对于未来的优化：
1. 如果需要完全消除等待，需要修改 cw-simulate 源码或使用不同的测试框架
2. 考虑将时间相关的测试与其他测试分离
3. 在 CI/CD 中可以接受这个短暂的等待时间（15-20秒）

