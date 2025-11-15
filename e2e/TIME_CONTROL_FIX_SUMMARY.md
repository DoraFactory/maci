# 时间控制问题修复总结

## 问题描述

在运行 `pnpm test:maci` 时遇到 `PeriodError`，测试在 "Start process period" 阶段失败。经过分析发现是由于时间控制方法不正确导致的。

### 原始错误
```
Error: Start process period failed: PeriodError
```

## 根本原因

1. **时间控制方法错误**：原有代码使用 `app.lastBlockTime` 和 `app.store` 来控制时间，但这不是 `cw-simulate` 的正确方式
2. **缺少状态转换**：API-MACI 合约需要显式调用 `stopProcessingPeriod` 来从 Processing 期转换到 Tallying 期
3. **缺少客户端方法**：`ApiMaciContractClient` 缺少必要的状态转换方法

## 解决方案

### 1. 修复时间控制方法

根据 `@oraichain/cw-simulate` 的正确用法，应该直接使用 `app.time` 属性：

**修改文件：**
- `e2e/src/utils/testHelpers.ts`
- `e2e/src/setup/chainSetup.ts`

**关键改动：**
```typescript
// ❌ 错误的方式
app.lastBlockTime = newTime;
app.height = newHeight;

// ✅ 正确的方式
app.time = newTime;
```

**新的 `advanceTime` 实现：**
```typescript
export async function advanceTime(client: SimulateCosmWasmClient, seconds: number): Promise<void> {
  const app: any = client.app;

  // CosmWasm uses nanoseconds for timestamps
  const nanoseconds = seconds * 1e9;

  // Get current time from app.time (if not set, use Date.now())
  if (!app.time || app.time === 0) {
    app.time = Date.now() * 1e6; // Convert milliseconds to nanoseconds
  }

  // Set the new time using app.time
  app.time = app.time + nanoseconds;
}
```

### 2. 初始化时间

在测试文件 `maci.e2e.test.ts` 中，确保在部署合约前初始化 `app.time`：

```typescript
// Initialize app.time for cw-simulate
const app: any = client.app;
if (!app.time || app.time === 0) {
  app.time = Date.now() * 1e6; // Convert milliseconds to nanoseconds
}

// Use app.time as the reference point for voting period
const currentTime = app.time;
const votingStartTime = currentTime.toString();
const votingEndTime = (currentTime + 10 * 1e9).toString();
```

### 3. 添加缺失的状态转换方法

在 `e2e/src/contracts/contractClients.ts` 的 `ApiMaciContractClient` 类中添加：

```typescript
/**
 * Stop processing period and transition to tallying
 */
async stopProcessingPeriod(): Promise<any> {
  return await this.execute({
    stop_processing_period: {}
  });
}

/**
 * Stop tallying period and finalize results
 */
async stopTallyingPeriod(results: string[], salt: string): Promise<any> {
  return await this.execute({
    stop_tallying_period: {
      results,
      salt
    }
  });
}
```

### 4. 更新测试流程

在消息处理完成后调用 `stopProcessingPeriod`：

```typescript
log(`All messages processed in ${batchCount} batches`);

// Stop processing period and transition to tallying
await assertExecuteSuccess(
  () => maciContract.stopProcessingPeriod(),
  'Stop processing period failed'
);
log('Processing period stopped, tallying period started');
```

## 验证

创建了临时测试 `time-control.test.ts` 来验证时间控制方法的正确性：

```typescript
it('should allow manual time control using app.time', async () => {
  // 设置时间为特定时间点
  const specificTime = new Date('2025-01-01T00:00:00Z').getTime() * 1e6;
  app.time = specificTime;
  
  expect(app.time).to.equal(specificTime);
  
  // 快进 1 小时
  app.time = app.time + (3600 * 1e9); // 1小时 = 3600秒
  
  expect(app.time).to.equal(specificTime + (3600 * 1e9));
});
```

**所有测试通过：** ✅ 5/5 tests passing

## 测试结果

运行 `pnpm mocha-test tests/maci.e2e.test.ts`：

```
✔ should complete the full MACI voting flow (23711ms)
✔ should handle multiple voters correctly

2 passing (25s)
```

### 测试流程成功验证：

1. ✅ 环境设置
2. ✅ 批量用户注册（5个用户）
3. ✅ 提交投票（6个消息，包括投票变更）
4. ✅ 等待投票期结束（使用 `app.time` 前进时间）
5. ✅ 开始处理期
6. ✅ 处理消息（2个批次）
7. ✅ 停止处理期，转换到计票期
8. ✅ 处理计票（1个批次）
9. ✅ 验证结果

## 关键要点

1. **使用 `app.time`**：这是 `@oraichain/cw-simulate` 的正确时间控制方式
2. **初始化时间**：在使用前确保 `app.time` 已初始化
   ```typescript
   const app: any = client.app;
   if (!app.time || app.time === 0) {
     app.time = Date.now() * 1e6; // Convert milliseconds to nanoseconds
   }
   ```
3. **状态转换**：API-MACI 合约需要显式的状态转换调用
   - `startProcessPeriod()` - 开始处理期
   - `stopProcessingPeriod()` - 结束处理期，转换到计票期
   - `stopTallyingPeriod()` - 结束计票期，最终化结果
4. **纳秒单位**：CosmWasm 使用纳秒作为时间戳单位（`1 秒 = 1e9 纳秒`）
   - `Date.now()` 返回毫秒，需要 `* 1e6` 转换为纳秒
   - 秒转纳秒：`seconds * 1e9`
5. **替换真实等待**：使用 `advanceTime` 替代 `setTimeout` 进行时间模拟
   - ❌ `await new Promise(resolve => setTimeout(resolve, ms))`
   - ✅ `await advanceTime(client, seconds)`

## 修改的文件

### 核心时间控制修复
1. `e2e/src/utils/testHelpers.ts` - 修复时间控制函数
2. `e2e/src/setup/chainSetup.ts` - 修复时间控制方法

### 合约客户端增强
3. `e2e/src/contracts/contractClients.ts` - 添加缺失的合约方法
   - `stopProcessingPeriod()` - 停止处理期并转换到计票期
   - `stopTallyingPeriod()` - 停止计票期并最终化结果

### 测试文件更新
4. `e2e/tests/maci.e2e.test.ts` ✅ 已更新
   - 初始化 `app.time`
   - 使用 `app.time` 设置投票时间
   - 使用 `advanceTime` 模拟时间流逝
   - 添加 `stopProcessingPeriod` 调用

5. `e2e/tests/amaci.e2e.test.ts` ✅ 已更新
   - 初始化 `app.time`
   - 使用 `app.time` 设置投票时间
   - 替换 `setTimeout` 真实等待为 `advanceTime` 时间模拟
   - 统一时间单位为纳秒

6. `e2e/tests/advanced.e2e.test.ts` ✅ 已更新
   - 初始化 `app.time` (3个测试套件)
   - 统一时间单位为纳秒（之前混用秒和纳秒）
   - 修复时间计算方式

7. `e2e/tests/registry.e2e.test.ts` ✅ 无需更新
   - 不使用时间前进功能

8. `e2e/tests/certificate.test.ts` ✅ 无需更新
   - 纯证书生成测试，不涉及时间控制

## 参考

- cw-simulate 文档：https://github.com/oraichain/cw-simulate
- API-MACI 合约状态机：`contracts/api-maci/src/contract.rs`

