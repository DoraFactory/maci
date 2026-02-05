# ProcessDeactivate Poll ID 验证 - SDK 更新说明

## 更新日期
2026-02-01 (最终版本)

## 🔄 重要变更

### 从参数传入改为使用内部状态

**之前的设计**:
```typescript
async processDeactivateMessages({
  inputSize,
  subStateTreeLength,
  expectedPollId = 0n  // ❌ 通过参数传入
}: {
  inputSize: number;
  subStateTreeLength: number;
  expectedPollId?: bigint;  // ❌ 可选参数
}): Promise<ProcessDeactivateResult>
```

**现在的设计** (与 `processMessages` 一致):
```typescript
async processDeactivateMessages({
  inputSize,
  subStateTreeLength,
  wasmFile,
  zkeyFile,
  derivePathParams
}: {
  inputSize: number;
  subStateTreeLength: number;
  wasmFile?: ZKArtifact;
  zkeyFile?: ZKArtifact;
  derivePathParams?: DerivePathParams;
}): Promise<ProcessDeactivateResult>
```

## ✅ 主要改进

### 1. 一致性设计
现在 `processDeactivateMessages` 和 `processMessages` 使用完全相同的 poll ID 处理方式：
- ✅ 都从 `this.pollId` 读取
- ✅ 都在函数开始时验证 `this.pollId` 已设置
- ✅ 都使用 `BigInt(this.pollId!)` 进行类型转换

### 2. 添加 Poll ID 验证
```typescript
if (this.pollId === undefined) {
  throw new Error('Poll ID not set. Ensure initRound was called with pollId parameter.');
}
```

### 3. 直接使用内部状态
```typescript
// 在 inputHash 计算中
const inputHash = computeInputHash([
  newDeactivateRoot,
  this.pubKeyHasher!,
  batchStartHash,
  batchEndHash,
  currentDeactivateCommitment,
  newDeactivateCommitment,
  subStateTree.root,
  BigInt(this.pollId!)  // ✅ 直接使用 this.pollId
]);

// 在电路输入中
const input = {
  // ... other fields ...
  expectedPollId: BigInt(this.pollId!)  // ✅ 直接使用 this.pollId
};
```

## 📋 修改详情

### 文件: `packages/sdk/src/operator.ts`

#### 修改 1: 函数签名
- ❌ 移除 `expectedPollId` 参数
- ✅ 保持与 `processMessages` 相同的参数结构

#### 修改 2: 添加 Poll ID 验证
```typescript
// Lines 1144-1147
if (this.pollId === undefined) {
  throw new Error('Poll ID not set. Ensure initRound was called with pollId parameter.');
}
```

#### 修改 3: 使用 this.pollId
```typescript
// Line 1262: 在 computeInputHash 中
BigInt(this.pollId!)

// Line 1290: 在电路输入对象中
expectedPollId: BigInt(this.pollId!)
```

## 🎯 使用示例

### 正确的使用方式

```typescript
import { OperatorClient } from '@dorafactory/maci-sdk';

const operator = new OperatorClient({
  network: 'testnet',
  secretKey: process.env.OPERATOR_KEY
});

// 1. 初始化 MACI
await operator.initMaci({
  /* ... 配置 ... */
});

// 2. 初始化 round（设置 pollId）
await operator.initRound({
  pollId: 1n,  // ✅ 在这里设置 poll ID
  /* ... 其他配置 ... */
});

// 3. 处理停用消息（无需传入 pollId）
const result = await operator.processDeactivateMessages({
  inputSize: 10,
  subStateTreeLength: 256,
  // ✅ poll ID 自动从 this.pollId 读取
  wasmFile: './circuits/processDeactivate.wasm',
  zkeyFile: './circuits/processDeactivate.zkey'
});

console.log('Proof generated:', result.proof);
```

### 错误处理

```typescript
try {
  await operator.processDeactivateMessages({
    inputSize: 10,
    subStateTreeLength: 256
  });
} catch (error) {
  if (error.message.includes('Poll ID not set')) {
    console.error('Please call initRound with pollId parameter first');
  }
}
```

## 🔍 与 processMessages 的对比

两个函数现在使用完全相同的 poll ID 处理模式：

### processMessages
```typescript
// Lines 1402-1404: 验证
if (this.pollId === undefined) {
  throw new Error('Poll ID not set. Ensure initRound was called with pollId parameter.');
}

// Line 1528: 使用
inputHash = computeInputHash([
  // ... other fields ...
  BigInt(this.pollId!)  // AMACI mode
]);

// Line 1540: 使用
inputHash = computeInputHash([
  // ... other fields ...
  BigInt(this.pollId!)  // MACI mode
]);
```

### processDeactivateMessages (现在)
```typescript
// Lines 1144-1147: 验证（相同）
if (this.pollId === undefined) {
  throw new Error('Poll ID not set. Ensure initRound was called with pollId parameter.');
}

// Line 1262: 使用（相同）
inputHash = computeInputHash([
  // ... other fields ...
  BigInt(this.pollId!)
]);

// Line 1290: 使用（相同）
const input = {
  // ... other fields ...
  expectedPollId: BigInt(this.pollId!)
};
```

## 📊 影响分析

### 破坏性变更
❌ **这是一个破坏性变更**（但更合理）

**之前的代码**:
```typescript
// 需要手动传入 pollId
await operator.processDeactivateMessages({
  inputSize: 10,
  expectedPollId: 1n  // 手动传入
});
```

**现在的代码**:
```typescript
// pollId 从内部状态自动读取
await operator.processDeactivateMessages({
  inputSize: 10
  // 不再需要传入 pollId
});
```

### 优点
1. ✅ **一致性**: 与 `processMessages` 完全一致
2. ✅ **简洁性**: 调用更简单，无需传入 pollId
3. ✅ **可靠性**: 避免传入错误的 pollId
4. ✅ **单一数据源**: Poll ID 只在一个地方管理（`this.pollId`）

### 缺点
1. ❌ **灵活性降低**: 无法为每次调用指定不同的 pollId
   - **反驳**: 这实际上是一个优点，因为在同一个 round 中 pollId 不应该改变

## 🚀 迁移指南

### 如果你的代码使用了旧版本

**旧代码**:
```typescript
await operator.processDeactivateMessages({
  inputSize: 10,
  subStateTreeLength: 256,
  expectedPollId: somePollId  // ❌ 不再需要
});
```

**新代码**:
```typescript
// 确保在 initRound 中设置了 pollId
await operator.initRound({
  pollId: somePollId,  // ✅ 在这里设置
  // ... other config ...
});

// 然后调用 processDeactivateMessages（无需传入 pollId）
await operator.processDeactivateMessages({
  inputSize: 10,
  subStateTreeLength: 256
  // ✅ pollId 自动使用
});
```

## ✅ 验证清单

- [x] 移除 `expectedPollId` 参数
- [x] 添加 `this.pollId` 验证
- [x] 使用 `BigInt(this.pollId!)` 在 inputHash 计算中
- [x] 使用 `BigInt(this.pollId!)` 在电路输入中
- [x] 与 `processMessages` 保持一致的模式
- [x] 更新文档和使用示例

## 📝 相关文件

### 已修改
- ✅ `packages/sdk/src/operator.ts` - processDeactivateMessages 函数

### 需要更新（如果有）
- ⏳ 使用该函数的测试代码
- ⏳ 示例代码和文档

## 📞 总结

这次更新将 `processDeactivateMessages` 的 poll ID 处理方式改为与 `processMessages` 完全一致：
- **从内部状态读取**: 使用 `this.pollId` 而不是函数参数
- **统一验证**: 确保 pollId 已设置
- **简化调用**: 用户无需传入 pollId，避免错误

这是一个更合理、更一致的设计，虽然是破坏性变更，但提高了代码质量和可维护性。
