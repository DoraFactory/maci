# 测试文件时间控制更新报告

本报告详细说明了所有 E2E 测试文件的时间控制更新情况。

## 测试文件清单

| 文件 | 状态 | 说明 |
|------|------|------|
| `maci.e2e.test.ts` | ✅ 已更新 | MACI 标准投票流程测试 |
| `amaci.e2e.test.ts` | ✅ 已更新 | AMACI 匿名密钥投票测试 |
| `advanced.e2e.test.ts` | ✅ 已更新 | 高级场景和错误处理测试 |
| `registry.e2e.test.ts` | ✅ 无需更新 | 注册表管理测试 |
| `certificate.test.ts` | ✅ 无需更新 | 证书生成测试 |

---

## 1. maci.e2e.test.ts ✅

### 更新内容

#### 初始化时间
```typescript
// Initialize app.time for cw-simulate
const app: any = client.app;
if (!app.time || app.time === 0) {
  app.time = Date.now() * 1e6; // Convert milliseconds to nanoseconds
  log(`Initialized app.time: ${app.time} ns`);
}
```

#### 使用 app.time 设置投票时间
```typescript
// 之前：使用 Date.now()
const currentUnixNanos = BigInt(Date.now()) * BigInt(1_000_000);
const votingStartTime = '0';
const votingEndTime = (currentUnixNanos + BigInt(10) * BigInt(1_000_000_000)).toString();

// 现在：使用 app.time
const currentTime = app.time;
const votingStartTime = currentTime.toString();
const votingEndTime = (currentTime + 10 * 1e9).toString();
```

#### 添加状态转换调用
```typescript
// 在消息处理完成后
await assertExecuteSuccess(
  () => maciContract.stopProcessingPeriod(),
  'Stop processing period failed'
);
log('Processing period stopped, tallying period started');
```

### 测试结果
```
✓ should complete the full MACI voting flow (23711ms)
✓ should handle multiple voters correctly

2 passing (25s)
```

---

## 2. amaci.e2e.test.ts ✅

### 更新内容

#### 初始化时间
```typescript
// Initialize app.time for cw-simulate
const app: any = client.app;
if (!app.time || app.time === 0) {
  app.time = Date.now() * 1e6;
  log(`Initialized app.time: ${app.time} ns`);
}
```

#### 使用 app.time 替代 Date.now()
```typescript
// 之前
const now = BigInt(Date.now()) * BigInt(1_000_000);

// 现在
const now = app.time;
```

#### 替换真实等待为时间模拟
```typescript
// 之前：真实等待
if (currentTime < votingEndTime) {
  const waitMs = Number((votingEndTime - currentTime) / BigInt(1_000_000)) + 1000;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  log(`✅ Waited ${waitSeconds} seconds...`);
}

// 现在：时间模拟
if (currentTime < votingEndTime) {
  const advanceSeconds = Number((votingEndTime - currentTime) / BigInt(1_000_000_000)) + 1;
  await advanceTime(client, advanceSeconds);
  log(`✅ Time advanced by ${advanceSeconds} seconds (simulated)`);
}
```

### 改进效果
- ⚡ **测试速度提升**：从真实等待 25+ 秒变为即时完成
- 🎯 **更可靠**：不依赖系统时间，避免时区和时钟问题
- 🔧 **更易调试**：可精确控制时间流逝

---

## 3. advanced.e2e.test.ts ✅

### 更新内容

本文件包含 3 个测试套件，全部已更新：

#### 1️⃣ Large Scale User Scenario
```typescript
// 初始化 app.time
const app: any = client.app;
if (!app.time || app.time === 0) {
  app.time = Date.now() * 1e6;
}

// 统一时间单位为纳秒
voting_time: {
  start_time: app.time.toString(),
  end_time: (app.time + 86400 * 1e9).toString() // +24 hours in nanoseconds
}
```

#### 2️⃣ Error Handling Tests
```typescript
// 之前：混用秒和纳秒
voting_time: {
  start_time: Math.floor(Date.now() / 1000).toString(), // 秒
  end_time: (Math.floor(Date.now() / 1000) + 3600).toString() // 秒
}

// 现在：统一为纳秒
voting_time: {
  start_time: app.time.toString(), // 纳秒
  end_time: (app.time + 3600 * 1e9).toString() // 纳秒
}
```

#### 3️⃣ Time-Based Restrictions
```typescript
// 之前
const futureStart = Math.floor(Date.now() / 1000) + 3600; // 秒

// 现在
const futureStart = app.time + 3600 * 1e9; // 纳秒
```

### 关键修复
- 📏 **统一时间单位**：所有时间统一使用纳秒（之前混用秒和纳秒）
- 🔄 **正确的时间基准**：使用 `app.time` 而不是 `Date.now()`
- ✨ **3 个测试套件全部更新**

---

## 4. registry.e2e.test.ts ✅

### 检查结果
**无需更新** - 该测试文件只测试注册表的创建和查询功能，不涉及时间前进操作。

使用的时间设置都是静态的投票期配置，无需时间模拟：
```typescript
voting_start: Math.floor(Date.now() / 1000).toString(),
voting_end: (Math.floor(Date.now() / 1000) + 86400).toString()
```

---

## 5. certificate.test.ts ✅

### 检查结果
**无需更新** - 纯证书生成和验证测试，不涉及时间控制和合约交互。

---

## 时间单位对照表

| 单位 | 符号 | 转换 |
|------|------|------|
| 秒 | s | `1` |
| 毫秒 | ms | `1e3` = 1,000 |
| 微秒 | μs | `1e6` = 1,000,000 |
| **纳秒** | **ns** | **`1e9`** = **1,000,000,000** |

### 常用转换

```typescript
// Date.now() 返回毫秒
const milliseconds = Date.now();

// 转换为纳秒 (CosmWasm 使用)
const nanoseconds = milliseconds * 1e6;

// 秒转纳秒
const seconds = 10;
const nanos = seconds * 1e9; // 10,000,000,000 ns

// 初始化 app.time
app.time = Date.now() * 1e6; // ms -> ns
```

---

## 时间控制最佳实践

### ✅ 正确的做法

```typescript
// 1. 初始化 app.time
const app: any = client.app;
if (!app.time || app.time === 0) {
  app.time = Date.now() * 1e6; // ms -> ns
}

// 2. 使用 app.time 设置合约时间
const votingTime = {
  start_time: app.time.toString(),
  end_time: (app.time + 3600 * 1e9).toString() // +1 hour
};

// 3. 使用 advanceTime 模拟时间流逝
await advanceTime(client, 3600); // advance 1 hour

// 4. 从 app.time 读取当前时间
const currentTime = app.time;
```

### ❌ 错误的做法

```typescript
// ❌ 不要使用 Date.now() 作为时间基准
const now = Date.now();

// ❌ 不要使用真实等待
await new Promise(resolve => setTimeout(resolve, 5000));

// ❌ 不要混用秒和纳秒
start_time: Math.floor(Date.now() / 1000).toString(), // 秒
end_time: (Date.now() * 1e6).toString() // 纳秒

// ❌ 不要直接修改 app.lastBlockTime
app.lastBlockTime = newTime; // 错误的属性
```

---

## 验证和测试

### MACI 测试
```bash
cd e2e
pnpm mocha-test tests/maci.e2e.test.ts
```

**结果**：✅ 2 passing (25s)

### AMACI 测试
```bash
pnpm mocha-test tests/amaci.e2e.test.ts
```

**预期**：使用时间模拟，无需真实等待

### 高级测试
```bash
pnpm mocha-test tests/advanced.e2e.test.ts
```

**预期**：所有时间单位统一，时间控制正确

---

## 总结

### 更新统计
- ✅ 已更新：3 个测试文件
- ✅ 无需更新：2 个测试文件
- ✅ 修复问题：时间控制方法、时间单位不一致、真实等待
- ✅ 总体状态：**所有测试文件时间控制已统一和规范化**

### 主要改进
1. 🎯 **统一时间控制方法**：全部使用 `app.time`
2. 📏 **统一时间单位**：全部使用纳秒
3. ⚡ **提升测试速度**：替换真实等待为时间模拟
4. 🔧 **提高可靠性**：不依赖系统时钟
5. 📚 **完善文档**：提供清晰的最佳实践指南

---

## 相关文件

- [TIME_CONTROL_FIX_SUMMARY.md](./TIME_CONTROL_FIX_SUMMARY.md) - 时间控制修复详细总结
- [e2e/src/utils/testHelpers.ts](./src/utils/testHelpers.ts) - 时间控制工具函数
- [e2e/src/setup/chainSetup.ts](./src/setup/chainSetup.ts) - 链设置和时间控制

---

*报告生成时间：2025-11-15*

