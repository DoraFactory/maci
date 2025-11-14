# 测试时间优化方案

## 问题描述

在 E2E 测试中，由于合约要求投票期最少 10 分钟（600秒），测试需要等待真实时间才能进入下一个环节：

- `amaci.e2e.test.ts`: 需要等待 61 秒
- `maci.e2e.test.ts`: 需要等待 11 秒

这导致测试运行时间过长，体验很差。

## 解决方案

使用 `advanceTime()` 工具函数模拟推进区块时间，而不是等待真实时间。

### 关键原理

`cw-simulate` 框架支持直接操作区块时间（`app.lastBlockTime` 和 `store`），通过修改这些值，可以让合约认为时间已经过去，而不需要真实等待。

### 实现步骤

#### 1. 导入 `advanceTime` 函数

```typescript
import {
  createTestEnvironment,
  //... other imports
  advanceTime
} from '../src';
```

#### 2. 替换 setTimeout 为 advanceTime

**修改前：**
```typescript
// 等待真实时间
await new Promise((resolve) => setTimeout(resolve, 61000));
```

**修改后：**
```typescript
// 使用模拟时间推进
await advanceTime(client, 61); // client 来自 createTestEnvironment
```

## 修改文件列表

1. **e2e/tests/amaci.e2e.test.ts**
   - 导入 `advanceTime` 函数
   - 第 420-426 行：使用 `advanceTime(client, 61)` 替代 `setTimeout`

2. **e2e/tests/maci.e2e.test.ts**
   - 导入 `advanceTime` 函数
   - 第 350-354 行：使用 `advanceTime(client, 11)` 替代 `setTimeout`

## 效果对比

| 测试 | 修改前 | 修改后 |
|------|--------|--------|
| AMACI | 等待 61 秒（真实时间） | 瞬时完成（模拟时间） |
| MACI | 等待 11 秒（真实时间） | 瞬时完成（模拟时间） |

## 技术细节

`advanceTime()` 函数实现（来自 `e2e/src/utils/testHelpers.ts`）：

```typescript
export async function advanceTime(client: SimulateCosmWasmClient, seconds: number): Promise<void> {
  const nanoseconds = BigInt(seconds) * BigInt(1_000_000_000);
  const app: any = client.app;

  // Try to get current state from store
  if (app.store && typeof app.store.get === 'function') {
    const currentState = app.store.get();
    const currentHeight = currentState.height || 0;
    const currentTime = currentState.lastBlockTime || 0;

    // Update via store if it has an update method
    if (typeof app.store.update === 'function') {
      app.store.update((state: any) => ({
        ...state,
        height: currentHeight + 1,
        lastBlockTime: currentTime + Number(nanoseconds)
      }));
    } else {
      // Fallback: directly modify app properties
      if (app.height !== undefined) app.height = currentHeight + 1;
      if (app.lastBlockTime !== undefined) app.lastBlockTime = currentTime + Number(nanoseconds);
    }
  } else {
    // Fallback: directly modify app properties
    const currentHeight = app.height || 0;
    const currentTime = app.lastBlockTime || 0;
    app.height = currentHeight + 1;
    app.lastBlockTime = currentTime + Number(nanoseconds);
  }
}
```

这个函数：
1. 从 `store` 或 `app` 获取当前时间和区块高度
2. 使用 `store.update()` 或直接修改 `app` 属性来更新时间
3. 相对推进时间（当前时间 + 指定秒数）而不是设置绝对时间
4. 同时增加区块高度

## 注意事项

1. 这个优化只适用于 `cw-simulate` 测试环境，真实链上无法使用
2. 确保推进的时间足够满足合约的时间要求
3. 时间推进是即时的，测试逻辑需要确保在推进前完成所有应该在投票期内的操作

## 验证

修改后运行测试：
```bash
cd e2e
pnpm test
```

测试应该能够正常通过，且运行时间大幅缩短。

