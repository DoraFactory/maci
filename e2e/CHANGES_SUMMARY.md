# E2E 测试时间优化 - 变更总结

## 问题
在 E2E 测试中，需要等待真实时间才能让投票期结束：
- `amaci.e2e.test.ts`: 等待 61 秒
- `maci.e2e.test.ts`: 等待 11 秒

这导致测试执行缓慢，影响开发体验。

## 解决方案
使用 `advanceTime()` 函数模拟时间推进，无需真实等待。

## 修改内容

### 1. amaci.e2e.test.ts
**修改位置**: 第 418-426 行

**修改前**:
```typescript
const waitTime = 61;
log(`Waiting for voting period to expire (${waitTime} seconds)...`);
await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
log('✅ Voting period expired, starting process period');
```

**修改后**:
```typescript
const waitTime = 61;
log(`Advancing block time by ${waitTime} seconds to end voting period...`);
log('⚡ Using simulated time - instant completion, no waiting!');
await advanceTime(client, waitTime);
log('✅ Voting period expired (simulated), starting process period');
```

### 2. maci.e2e.test.ts
**修改位置**: 第 349-354 行

**修改前**:
```typescript
log('Waiting 11 seconds for voting period to expire...');
await new Promise((resolve) => setTimeout(resolve, 11000));
log('Voting period has ended');
```

**修改后**:
```typescript
log('Advancing block time by 11 seconds to end voting period...');
log('⚡ Using simulated time - instant completion, no waiting!');
await advanceTime(client, 11);
log('Voting period has ended (simulated)');
```

### 3. 导入变更
两个测试文件都添加了 `advanceTime` 导入：
```typescript
import {
  // ... 其他导入
  advanceTime
} from '../src';
```

## 效果
- ✅ 不再需要等待真实时间（节省 70+ 秒）
- ✅ 测试执行速度大幅提升
- ✅ 保持测试逻辑完整性
- ✅ 合约时间检查正常工作

## 技术原理
`advanceTime()` 函数通过直接修改 `cw-simulate` 的内部状态（`store.lastBlockTime`）来模拟时间推进，让合约认为时间已经过去。

详细技术文档: [TIME_OPTIMIZATION.md](./TIME_OPTIMIZATION.md)

## 测试验证
修改后运行测试（需先准备电路文件）：
```bash
cd e2e
pnpm setup-circuits  # 下载并提取电路文件
pnpm test            # 运行测试
```

## 相关文件
- ✅ `e2e/tests/amaci.e2e.test.ts` - 已修改
- ✅ `e2e/tests/maci.e2e.test.ts` - 已修改
- 📖 `e2e/TIME_OPTIMIZATION.md` - 技术文档
- 📖 `e2e/CHANGES_SUMMARY.md` - 本文件

## 注意事项
1. 此优化仅适用于 `cw-simulate` 测试环境
2. 真实链上无法使用时间推进功能
3. 确保 `advanceTime` 的参数足够满足合约的最小时间要求

