# StateLeafTransformer 电路文档

## 目录

1. [概述](#概述)
2. [电路位置](#电路位置)
3. [输入输出](#输入输出)
4. [核心组件详解](#核心组件详解)
5. [状态更新机制](#状态更新机制)
6. [使用的 Circomlib 组件](#使用的-circomlib-组件)
7. [完整示例](#完整示例)
8. [常见场景](#常见场景)
9. [错误处理](#错误处理)
10. [技术细节](#技术细节)
11. [快速参考表](#快速参考表)

---

## 概述

`StateLeafTransformer` 是 MACI（Minimal Anti-Collusion Infrastructure）投票系统中的核心状态转换电路。它负责将用户提交的命令（command）应用到当前的状态叶子（state leaf）上，生成新的状态。

### 核心功能

该电路执行以下关键操作：

1. **命令验证** - 通过 `MessageValidator` 验证命令的有效性
2. **状态转换** - 根据验证结果更新或保持状态叶子
3. **余额计算** - 计算投票后的新语音信用余额
4. **原子性更新** - 确保状态要么全部更新，要么全部保持不变

### 工作原理

```
输入: 当前状态叶子 + 命令
    ↓
验证: MessageValidator (6 项验证)
    ↓
结果: isValid (0 或 1)
    ↓
选择: Mux1 (根据 isValid 选择输出)
    ↓
输出: 新状态叶子 (有效) 或 原状态叶子 (无效)
```

### 电路文件位置

```
packages/circuits/circom/maci/power/stateLeafTransformer.circom
```

---

## 输入输出

### 输入信号 (Input Signals)

#### 系统配置参数

| 信号名 | 类型 | 说明 |
|--------|------|------|
| `isQuadraticCost` | `signal` | 成本模式：0=线性，1=二次 |
| `numSignUps` | `signal` | 已注册用户总数 |
| `maxVoteOptions` | `signal` | 最大投票选项数 |

#### 当前状态叶子 (State Leaf)

| 信号名 | 类型 | 说明 |
|--------|------|------|
| `slPubKey[2]` | `signal[2]` | 当前状态叶子的公钥 [x, y] |
| `slVoiceCreditBalance` | `signal` | 当前语音信用余额 |
| `slNonce` | `signal` | 当前 nonce 值（用于防止重放攻击） |
| `currentVotesForOption` | `signal` | 该选项当前的累计投票权重 |

#### 命令 (Command)

| 信号名 | 类型 | 说明 |
|--------|------|------|
| `cmdStateIndex` | `signal` | 命令对应的状态树索引 |
| `cmdNewPubKey[2]` | `signal[2]` | 新的公钥 [x, y]（用于密钥轮换） |
| `cmdVoteOptionIndex` | `signal` | 投票选项的索引 |
| `cmdNewVoteWeight` | `signal` | 本次投票的权重 |
| `cmdNonce` | `signal` | 命令中的 nonce（应为 slNonce + 1） |
| `cmdSigR8[2]` | `signal[2]` | EdDSA 签名的 R8 点 [x, y] |
| `cmdSigS` | `signal` | EdDSA 签名的 S 标量 |
| `packedCommand[3]` | `signal[3]` | 打包的命令数据（用于签名验证） |

### 输出信号 (Output Signals)

| 信号名 | 类型 | 说明 |
|--------|------|------|
| `newSlPubKey[2]` | `signal[2]` | 新的状态叶子公钥 [x, y] |
| `newSlNonce` | `signal` | 新的 nonce 值 |
| `isValid` | `signal` | 命令是否有效（1=有效，0=无效） |
| `newBalance` | `signal` | 投票后的新语音信用余额 |

---

## 核心组件详解

### 1. MessageValidator 组件

**组件**: `MessageValidator()`

**功能**: 验证命令的有效性，执行 6 项关键验证

**连接关系**:

```circom
component messageValidator = MessageValidator();

// 基本验证参数
messageValidator.stateTreeIndex <== cmdStateIndex;
messageValidator.numSignUps <== numSignUps;
messageValidator.voteOptionIndex <== cmdVoteOptionIndex;
messageValidator.maxVoteOptions <== maxVoteOptions;

// Nonce 验证
messageValidator.originalNonce <== slNonce;
messageValidator.nonce <== cmdNonce;

// 签名验证
for (var i = 0; i < PACKED_CMD_LENGTH; i ++) {
    messageValidator.cmd[i] <== packedCommand[i];
}
messageValidator.pubKey[0] <== slPubKey[0];
messageValidator.pubKey[1] <== slPubKey[1];
messageValidator.sigR8[0] <== cmdSigR8[0];
messageValidator.sigR8[1] <== cmdSigR8[1];
messageValidator.sigS <== cmdSigS;

// 成本计算参数
messageValidator.isQuadraticCost <== isQuadraticCost;
messageValidator.currentVoiceCreditBalance <== slVoiceCreditBalance;
messageValidator.currentVotesForOption <== currentVotesForOption;
messageValidator.voteWeight <== cmdNewVoteWeight;
```

**验证项**（详见 MessageValidator 文档）:

1. ✅ 状态索引有效性: `cmdStateIndex <= numSignUps`
2. ✅ 投票选项有效性: `cmdVoteOptionIndex < maxVoteOptions`
3. ✅ Nonce 正确性: `cmdNonce == slNonce + 1`
4. ✅ 签名有效性: EdDSA 签名验证
5. ✅ 投票权重有效性: `cmdNewVoteWeight <= MAX`
6. ✅ 余额充足性: `余额 + 退回成本 >= 新成本`

**输出**:
- `messageValidator.isValid`: 1（所有验证通过）或 0（任何验证失败）
- `messageValidator.newBalance`: 计算后的新余额

---

### 2. 公钥更新多路复用器 (newSlPubKey0Mux)

**组件**: `Mux1()`

**功能**: 根据 `isValid` 选择输出新的或保持原公钥的 x 坐标

**连接关系**:

```circom
component newSlPubKey0Mux = Mux1();
newSlPubKey0Mux.s <== messageValidator.isValid;
newSlPubKey0Mux.c[0] <== slPubKey[0];        // 原公钥 x
newSlPubKey0Mux.c[1] <== cmdNewPubKey[0];    // 新公钥 x
newSlPubKey[0] <== newSlPubKey0Mux.out;
```

**工作原理**:
- 如果 `isValid = 0`: 输出 `slPubKey[0]`（保持原公钥）
- 如果 `isValid = 1`: 输出 `cmdNewPubKey[0]`（使用新公钥）

---

### 3. 公钥更新多路复用器 (newSlPubKey1Mux)

**组件**: `Mux1()`

**功能**: 根据 `isValid` 选择输出新的或保持原公钥的 y 坐标

**连接关系**:

```circom
component newSlPubKey1Mux = Mux1();
newSlPubKey1Mux.s <== messageValidator.isValid;
newSlPubKey1Mux.c[0] <== slPubKey[1];        // 原公钥 y
newSlPubKey1Mux.c[1] <== cmdNewPubKey[1];    // 新公钥 y
newSlPubKey[1] <== newSlPubKey1Mux.out;
```

**工作原理**:
- 如果 `isValid = 0`: 输出 `slPubKey[1]`（保持原公钥）
- 如果 `isValid = 1`: 输出 `cmdNewPubKey[1]`（使用新公钥）

---

### 4. Nonce 更新多路复用器 (newSlNonceMux)

**组件**: `Mux1()`

**功能**: 根据 `isValid` 选择输出新的或保持原 nonce

**连接关系**:

```circom
component newSlNonceMux = Mux1();
newSlNonceMux.s <== messageValidator.isValid;
newSlNonceMux.c[0] <== slNonce;      // 原 nonce
newSlNonceMux.c[1] <== cmdNonce;     // 新 nonce
newSlNonce <== newSlNonceMux.out;
```

**工作原理**:
- 如果 `isValid = 0`: 输出 `slNonce`（保持原 nonce）
- 如果 `isValid = 1`: 输出 `cmdNonce`（使用新 nonce）

---

## 状态更新机制

### 原子性更新原则

`StateLeafTransformer` 确保状态更新的原子性：要么全部更新，要么全部保持不变。这是通过使用 `isValid` 信号作为所有 Mux1 组件的选择信号实现的。

### 更新逻辑表

| isValid | newSlPubKey | newSlNonce | newBalance | 说明 |
|---------|-------------|------------|------------|------|
| 1 | `cmdNewPubKey` | `cmdNonce` | `messageValidator.newBalance` | 命令有效，全部更新 |
| 0 | `slPubKey` | `slNonce` | `messageValidator.newBalance` | 命令无效，保持原状 |

**注意**: 即使命令无效，`newBalance` 仍然会输出 `messageValidator.newBalance`，但在实际使用中，如果 `isValid = 0`，这个值通常不会被使用。

### 更新流程图

```
┌─────────────────────────────────────┐
│  输入: 当前状态叶子 + 命令            │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  MessageValidator 验证               │
│  - 6 项验证全部通过?                 │
└──────────────┬──────────────────────┘
               │
        ┌──────┴──────┐
        │             │
    通过 (1)      失败 (0)
        │             │
        ▼             ▼
┌─────────────┐ ┌─────────────┐
│ 使用新值     │ │ 保持原值     │
│ - 新公钥     │ │ - 原公钥     │
│ - 新 nonce   │ │ - 原 nonce   │
│ - 新余额     │ │ - 原余额     │
└─────────────┘ └─────────────┘
        │             │
        └──────┬──────┘
               │
               ▼
┌─────────────────────────────────────┐
│  输出: 新状态叶子                     │
└─────────────────────────────────────┘
```

---

## 使用的 Circomlib 组件

### MessageValidator()

**功能**: 验证命令的有效性（详见 MessageValidator 文档）

**输入**: 状态索引、选项索引、nonce、签名、余额等

**输出**: 
- `isValid`: 验证结果（1 或 0）
- `newBalance`: 计算后的新余额

---

### Mux1()

**功能**: 1 位多路复用器（二选一）

**工作原理**:
- 如果 `s = 0`: 输出 `c[0]`
- 如果 `s = 1`: 输出 `c[1]`

**公式**: `out = s * c[1] + (1 - s) * c[0]`

**在 StateLeafTransformer 中的使用**:
- `newSlPubKey0Mux`: 选择公钥 x 坐标
- `newSlPubKey1Mux`: 选择公钥 y 坐标
- `newSlNonceMux`: 选择 nonce 值

---

## 完整示例

### 示例 1: 有效的投票命令（线性成本）

**场景**: 用户 Alice 第一次投票，选择选项 1，投票权重 10

**输入参数**:

```javascript
{
  // 系统配置
  isQuadraticCost: 0n,           // 线性成本模式
  numSignUps: 100n,              // 总共 100 个用户
  maxVoteOptions: 10n,           // 总共 10 个选项
  
  // 当前状态叶子
  slPubKey: [123456789n, 987654321n],  // Alice 的当前公钥
  slVoiceCreditBalance: 1000n,         // 当前余额 1000
  slNonce: 0n,                          // 当前 nonce 为 0
  currentVotesForOption: 0n,            // 选项 1 还没有投票
  
  // 命令
  cmdStateIndex: 0n,                   // Alice 的状态索引
  cmdNewPubKey: [111222333n, 444555666n], // 新公钥（密钥轮换）
  cmdVoteOptionIndex: 1n,               // 投票给选项 1
  cmdNewVoteWeight: 10n,                 // 投票权重 10
  cmdNonce: 1n,                         // 新 nonce（0 + 1）
  cmdSigR8: [777888999n, 111222333n],   // 签名 R8
  cmdSigS: 444555666n,                   // 签名 S
  packedCommand: [                      // 打包的命令
    123456789n,
    987654321n,
    1000000000n
  ]
}
```

**执行过程**:

1. **MessageValidator 验证**:
   - ✅ 状态索引: `0 <= 100` ✓
   - ✅ 选项索引: `1 < 10` ✓
   - ✅ Nonce: `1 == 0 + 1` ✓
   - ✅ 签名: EdDSA 签名有效 ✓
   - ✅ 权重: `10 <= MAX` ✓
   - ✅ 余额: `1000 + 0 >= 10` ✓
   - **结果**: `isValid = 1`

2. **余额计算**（线性模式）:
   ```
   currentCostsForOption = 0
   cost = 10
   newBalance = 1000 + 0 - 10 = 990
   ```

3. **状态更新**（因为 `isValid = 1`）:
   ```
   newSlPubKey[0] = cmdNewPubKey[0] = 111222333n
   newSlPubKey[1] = cmdNewPubKey[1] = 444555666n
   newSlNonce = cmdNonce = 1n
   ```

**输出结果**:

```javascript
{
  newSlPubKey: [111222333n, 444555666n],
  newSlNonce: 1n,
  isValid: 1n,
  newBalance: 990n
}
```

---

### 示例 2: 修改投票（二次成本）

**场景**: 用户 Bob 修改之前的投票，从权重 5 改为权重 8

**输入参数**:

```javascript
{
  // 系统配置
  isQuadraticCost: 1n,           // 二次成本模式
  numSignUps: 100n,
  maxVoteOptions: 10n,
  
  // 当前状态叶子
  slPubKey: [555666777n, 888999000n],
  slVoiceCreditBalance: 950n,   // 当前余额
  slNonce: 1n,                   // 之前投过票，nonce 为 1
  currentVotesForOption: 5n,      // 选项 2 已有 5 个投票权重
  
  // 命令
  cmdStateIndex: 5n,
  cmdNewPubKey: [111222333n, 444555666n],
  cmdVoteOptionIndex: 2n,
  cmdNewVoteWeight: 8n,          // 新的投票权重为 8
  cmdNonce: 2n,                 // 新 nonce（1 + 1）
  // ... 签名等
}
```

**执行过程**:

1. **MessageValidator 验证**:
   - ✅ 所有验证通过
   - **结果**: `isValid = 1`

2. **余额计算**（二次模式）:
   ```
   currentCostsForOption = 5² = 25  (退回旧成本)
   cost = 8² = 64                    (新成本)
   验证: 950 + 25 >= 64 ✅
   newBalance = 950 + 25 - 64 = 911
   ```

3. **状态更新**:
   ```
   newSlPubKey = [111222333n, 444555666n]
   newSlNonce = 2n
   ```

**输出结果**:

```javascript
{
  newSlPubKey: [111222333n, 444555666n],
  newSlNonce: 2n,
  isValid: 1n,
  newBalance: 911n
}
```

---

### 示例 3: 无效命令 - Nonce 错误

**场景**: 用户 Charlie 使用错误的 nonce 提交命令

**输入参数**:

```javascript
{
  // 当前状态叶子
  slPubKey: [111111111n, 222222222n],
  slVoiceCreditBalance: 50n,
  slNonce: 5n,                   // 当前 nonce 是 5
  currentVotesForOption: 0n,
  
  // 命令
  cmdStateIndex: 2n,
  cmdNewPubKey: [333333333n, 444444444n],
  cmdVoteOptionIndex: 0n,
  cmdNewVoteWeight: 2n,
  cmdNonce: 7n,                  // ❌ 错误！应该是 6 (5 + 1)
  // ... 其他字段
}
```

**执行过程**:

1. **MessageValidator 验证**:
   - ✅ 状态索引: 通过
   - ✅ 选项索引: 通过
   - ❌ **Nonce 验证失败**: `7 != 5 + 1`
   - **结果**: `isValid = 0`

2. **状态更新**（因为 `isValid = 0`）:
   ```
   newSlPubKey[0] = slPubKey[0] = 111111111n  (保持原公钥)
   newSlPubKey[1] = slPubKey[1] = 222222222n
   newSlNonce = slNonce = 5n                  (保持原 nonce)
   ```

**输出结果**:

```javascript
{
  newSlPubKey: [111111111n, 222222222n],  // 保持原公钥
  newSlNonce: 5n,                          // 保持原 nonce
  isValid: 0n,                            // 命令无效
  newBalance: 50n                         // 余额不变（实际使用中可能不使用）
}
```

---

### 示例 4: 无效命令 - 余额不足

**场景**: 用户 David 余额不足，无法投票

**输入参数**:

```javascript
{
  isQuadraticCost: 0n,           // 线性成本
  numSignUps: 100n,
  maxVoteOptions: 10n,
  
  // 当前状态叶子
  slPubKey: [999999999n, 888888888n],
  slVoiceCreditBalance: 5n,      // 只有 5 个信用
  slNonce: 0n,
  currentVotesForOption: 0n,
  
  // 命令
  cmdStateIndex: 3n,
  cmdNewPubKey: [777777777n, 666666666n],
  cmdVoteOptionIndex: 1n,
  cmdNewVoteWeight: 10n,          // 需要 10 个信用
  cmdNonce: 1n,
  // ... 其他字段
}
```

**执行过程**:

1. **MessageValidator 验证**:
   - ✅ 状态索引: 通过
   - ✅ 选项索引: 通过
   - ✅ Nonce: 通过
   - ✅ 签名: 通过
   - ✅ 权重: 通过
   - ❌ **余额验证失败**: `5 + 0 >= 10` ❌
   - **结果**: `isValid = 0`

2. **状态更新**: 保持原状态不变

**输出结果**:

```javascript
{
  newSlPubKey: [999999999n, 888888888n],  // 保持原公钥
  newSlNonce: 0n,                          // 保持原 nonce
  isValid: 0n,                            // 命令无效
  newBalance: 5n                          // 余额不变
}
```

---

## 常见场景

### 场景 1: 首次投票

**特点**:
- `currentVotesForOption = 0`
- `slNonce = 0`
- `cmdNonce = 1`

**状态更新**:
- 如果有效: `newSlPubKey = cmdNewPubKey`, `newSlNonce = 1`
- 如果无效: `newSlPubKey = slPubKey`, `newSlNonce = 0`

---

### 场景 2: 修改投票

**特点**:
- `currentVotesForOption > 0` (有之前的投票)
- `slNonce > 0` (之前投过票)
- `cmdNonce = slNonce + 1`

**状态更新**:
- 如果有效: 更新为新值，余额会退回旧成本并扣除新成本
- 如果无效: 保持原状态

---

### 场景 3: 密钥轮换（不投票）

**特点**:
- `cmdNewVoteWeight = 0` (不投票，只轮换密钥)
- `cmdNewPubKey != slPubKey` (新公钥)

**状态更新**:
- 如果有效: `newSlPubKey = cmdNewPubKey`, `newSlNonce = cmdNonce`
- 余额不变（因为投票权重为 0）

---

### 场景 4: 撤回投票

**特点**:
- `cmdNewVoteWeight = 0` (将投票权重设为 0)
- `currentVotesForOption > 0` (之前有投票)

**状态更新**:
- 如果有效: 更新状态，余额会退回之前的成本
- 如果无效: 保持原状态

---

## 错误处理

### 验证失败的情况

当 `MessageValidator` 的任何一项验证失败时，`isValid = 0`，状态将保持不变：

| 验证项 | 失败原因 | 状态更新结果 |
|--------|----------|--------------|
| 状态索引 | `cmdStateIndex > numSignUps` | 保持原状态 |
| 选项索引 | `cmdVoteOptionIndex >= maxVoteOptions` | 保持原状态 |
| Nonce | `cmdNonce != slNonce + 1` | 保持原状态 |
| 签名 | 签名无效 | 保持原状态 |
| 权重 | `cmdNewVoteWeight > MAX` | 保持原状态 |
| 余额 | `余额 + 退回 < 新成本` | 保持原状态 |

### 原子性保证

通过使用 `isValid` 作为所有 Mux1 组件的选择信号，确保：

1. **全部更新**: 如果 `isValid = 1`，所有状态字段都更新
2. **全部保持**: 如果 `isValid = 0`，所有状态字段都保持原状
3. **无部分更新**: 不会出现部分字段更新、部分字段保持的情况

---

## 技术细节

### 命令打包格式 (packedCommand[3])

命令数据被打包成 3 个字段元素：

```javascript
const packaged = packElement({
  nonce: 1,           // 32 bits
  stateIdx: 5,        // 32 bits
  voIdx: 2,           // 32 bits
  newVotes: 100,      // 96 bits
  salt: 0             // 剩余 bits
});

packedCommand = [packaged, cmdNewPubKey[0], cmdNewPubKey[1]];
```

### 状态更新逻辑

状态更新通过 Mux1 组件实现：

```circom
// 公钥 x 坐标
newSlPubKey[0] = isValid ? cmdNewPubKey[0] : slPubKey[0];

// 公钥 y 坐标
newSlPubKey[1] = isValid ? cmdNewPubKey[1] : slPubKey[1];

// Nonce
newSlNonce = isValid ? cmdNonce : slNonce;
```

### 余额计算

余额计算由 `MessageValidator` 完成，直接传递：

```circom
newBalance <== messageValidator.newBalance;
```

余额计算公式（详见 MessageValidator 文档）:
- **线性模式**: `newBalance = balance + currentVotesForOption - voteWeight`
- **二次模式**: `newBalance = balance + currentVotesForOption² - voteWeight²`

---

## 快速参考表

### 输入输出汇总

| 类别 | 信号名 | 类型 | 说明 |
|------|--------|------|------|
| **系统配置** | `isQuadraticCost` | `signal` | 成本模式（0=线性，1=二次） |
| | `numSignUps` | `signal` | 注册用户总数 |
| | `maxVoteOptions` | `signal` | 最大投票选项数 |
| **状态叶子** | `slPubKey[2]` | `signal[2]` | 当前公钥 |
| | `slVoiceCreditBalance` | `signal` | 当前余额 |
| | `slNonce` | `signal` | 当前 nonce |
| | `currentVotesForOption` | `signal` | 当前选项投票权重 |
| **命令** | `cmdStateIndex` | `signal` | 状态索引 |
| | `cmdNewPubKey[2]` | `signal[2]` | 新公钥 |
| | `cmdVoteOptionIndex` | `signal` | 投票选项索引 |
| | `cmdNewVoteWeight` | `signal` | 投票权重 |
| | `cmdNonce` | `signal` | 命令 nonce |
| | `cmdSigR8[2]` | `signal[2]` | 签名 R8 |
| | `cmdSigS` | `signal` | 签名 S |
| | `packedCommand[3]` | `signal[3]` | 打包的命令 |
| **输出** | `newSlPubKey[2]` | `signal[2]` | 新公钥 |
| | `newSlNonce` | `signal` | 新 nonce |
| | `isValid` | `signal` | 验证结果 |
| | `newBalance` | `signal` | 新余额 |

### 状态更新规则

| isValid | newSlPubKey | newSlNonce | 说明 |
|---------|-------------|------------|------|
| 1 | `cmdNewPubKey` | `cmdNonce` | 命令有效，使用新值 |
| 0 | `slPubKey` | `slNonce` | 命令无效，保持原值 |

### 组件依赖关系

```
StateLeafTransformer
    ├── MessageValidator (验证命令)
    │   ├── LessEqThan (状态索引验证)
    │   ├── LessThan (选项索引验证)
    │   ├── IsEqual (Nonce 验证)
    │   ├── VerifySignature (签名验证)
    │   ├── LessEqThan (权重验证)
    │   ├── GreaterEqThan (余额验证)
    │   └── Mux1 (成本模式选择)
    └── Mux1 × 3 (状态更新选择)
        ├── newSlPubKey0Mux
        ├── newSlPubKey1Mux
        └── newSlNonceMux
```

---

## 代码示例

### 示例 1: 准备电路输入

```typescript
// 准备 StateLeafTransformer 电路的输入
const circuitInputs = {
  // 系统配置
  isQuadraticCost: 0n,  // 0=线性, 1=二次
  numSignUps: 100n,
  maxVoteOptions: 10n,
  
  // 当前状态叶子
  slPubKey: [pubKeyX, pubKeyY],
  slVoiceCreditBalance: 1000n,
  slNonce: 0n,
  currentVotesForOption: 0n,
  
  // 命令
  cmdStateIndex: 0n,
  cmdNewPubKey: [newPubKeyX, newPubKeyY],
  cmdVoteOptionIndex: 1n,
  cmdNewVoteWeight: 10n,
  cmdNonce: 1n,
  cmdSigR8: [R8x, R8y],
  cmdSigS: S,
  packedCommand: [cmd0, cmd1, cmd2]
};

// 计算 witness
const witness = await circuit.calculateWitness(circuitInputs);

// 获取结果
const isValid = await getSignal(circuit, witness, 'isValid');
const newSlPubKey = [
  await getSignal(circuit, witness, 'newSlPubKey[0]'),
  await getSignal(circuit, witness, 'newSlPubKey[1]')
];
const newSlNonce = await getSignal(circuit, witness, 'newSlNonce');
const newBalance = await getSignal(circuit, witness, 'newBalance');

console.log('Command valid:', isValid === 1n);
console.log('New public key:', newSlPubKey);
console.log('New nonce:', newSlNonce.toString());
console.log('New balance:', newBalance.toString());
```

---

### 示例 2: 完整的投票处理流程

```typescript
async function processVoteCommand(
  stateLeaf: {
    pubKey: [bigint, bigint],
    voiceCreditBalance: bigint,
    nonce: bigint,
    currentVotesForOption: bigint
  },
  command: {
    stateIndex: bigint,
    newPubKey: [bigint, bigint],
    voteOptionIndex: bigint,
    voteWeight: bigint,
    nonce: bigint,
    sigR8: [bigint, bigint],
    sigS: bigint,
    packedCommand: [bigint, bigint, bigint]
  },
  config: {
    isQuadraticCost: bigint,
    numSignUps: bigint,
    maxVoteOptions: bigint
  }
): Promise<{
  isValid: boolean,
  newStateLeaf: {
    pubKey: [bigint, bigint],
    nonce: bigint,
    balance: bigint
  }
}> {
  const circuitInputs = {
    // 系统配置
    isQuadraticCost: config.isQuadraticCost,
    numSignUps: config.numSignUps,
    maxVoteOptions: config.maxVoteOptions,
    
    // 当前状态叶子
    slPubKey: stateLeaf.pubKey,
    slVoiceCreditBalance: stateLeaf.voiceCreditBalance,
    slNonce: stateLeaf.nonce,
    currentVotesForOption: stateLeaf.currentVotesForOption,
    
    // 命令
    cmdStateIndex: command.stateIndex,
    cmdNewPubKey: command.newPubKey,
    cmdVoteOptionIndex: command.voteOptionIndex,
    cmdNewVoteWeight: command.voteWeight,
    cmdNonce: command.nonce,
    cmdSigR8: command.sigR8,
    cmdSigS: command.sigS,
    packedCommand: command.packedCommand
  };
  
  const witness = await circuit.calculateWitness(circuitInputs);
  await circuit.expectConstraintPass(witness);
  
  const isValid = await getSignal(circuit, witness, 'isValid');
  const newSlPubKey = [
    await getSignal(circuit, witness, 'newSlPubKey[0]'),
    await getSignal(circuit, witness, 'newSlPubKey[1]')
  ];
  const newSlNonce = await getSignal(circuit, witness, 'newSlNonce');
  const newBalance = await getSignal(circuit, witness, 'newBalance');
  
  return {
    isValid: isValid === 1n,
    newStateLeaf: {
      pubKey: newSlPubKey,
      nonce: newSlNonce,
      balance: newBalance
    }
  };
}

// 使用示例
const result = await processVoteCommand(
  {
    pubKey: [123456789n, 987654321n],
    voiceCreditBalance: 1000n,
    nonce: 0n,
    currentVotesForOption: 0n
  },
  {
    stateIndex: 0n,
    newPubKey: [111222333n, 444555666n],
    voteOptionIndex: 1n,
    voteWeight: 10n,
    nonce: 1n,
    sigR8: [R8x, R8y],
    sigS: S,
    packedCommand: [cmd0, cmd1, cmd2]
  },
  {
    isQuadraticCost: 0n,
    numSignUps: 100n,
    maxVoteOptions: 10n
  }
);

if (result.isValid) {
  console.log('Vote processed successfully!');
  console.log('New state:', result.newStateLeaf);
} else {
  console.log('Vote rejected!');
}
```

---

### 示例 3: 在 processMessages 中的使用

```typescript
// 在 processMessages.circom 中的使用示例
// 这是伪代码，展示 StateLeafTransformer 如何被使用

// 1. 实例化 StateLeafTransformer
component transformer = StateLeafTransformer();

// 2. 连接系统配置
transformer.isQuadraticCost <== isQuadraticCost;
transformer.numSignUps <== numSignUps;
transformer.maxVoteOptions <== maxVoteOptions;

// 3. 连接当前状态叶子
transformer.slPubKey[0] <== stateLeaf[STATE_LEAF_PUB_X_IDX];
transformer.slPubKey[1] <== stateLeaf[STATE_LEAF_PUB_Y_IDX];
transformer.slVoiceCreditBalance <== stateLeaf[STATE_LEAF_VOICE_CREDIT_BALANCE_IDX];
transformer.slNonce <== stateLeaf[STATE_LEAF_NONCE_IDX];
transformer.currentVotesForOption <== currentVoteWeight;

// 4. 连接命令
transformer.cmdStateIndex <== cmdStateIndex;
transformer.cmdNewPubKey[0] <== cmdNewPubKey[0];
transformer.cmdNewPubKey[1] <== cmdNewPubKey[1];
transformer.cmdVoteOptionIndex <== cmdVoteOptionIndex;
transformer.cmdNewVoteWeight <== cmdNewVoteWeight;
transformer.cmdNonce <== cmdNonce;
transformer.cmdSigR8[0] <== cmdSigR8[0];
transformer.cmdSigR8[1] <== cmdSigR8[1];
transformer.cmdSigS <== cmdSigS;
for (var i = 0; i < PACKED_CMD_LENGTH; i++) {
  transformer.packedCommand[i] <== packedCmd[i];
}

// 5. 使用结果
// 如果 isValid = 1，使用 transformer 的输出更新状态树
// 如果 isValid = 0，保持原状态不变
```

---

## 调试技巧

### 常见问题排查

1. **isValid = 0，但不知道原因**
   - 检查 `MessageValidator` 的各项验证
   - 确认所有输入参数正确
   - 验证签名是否正确

2. **状态没有更新**
   - 确认 `isValid = 1`
   - 检查 Mux1 组件的连接
   - 验证 `cmdNewPubKey` 和 `cmdNonce` 的值

3. **余额计算不正确**
   - 确认 `isQuadraticCost` 的值
   - 检查 `currentVotesForOption` 是否正确
   - 参考 MessageValidator 文档中的余额计算公式

---

## 相关资源

- **电路文件**: `packages/circuits/circom/maci/power/stateLeafTransformer.circom`
- **MessageValidator 文档**: `packages/circuits/docs/MessageValidator.md`
- **使用示例**: 参考 `processMessages.circom`
- **测试文件**: 参考相关集成测试

---

## 总结

`StateLeafTransformer` 电路是 MACI 系统的核心状态转换组件，它通过以下机制确保系统的安全性和一致性：

1. ✅ **命令验证**: 通过 `MessageValidator` 执行 6 项严格验证
2. ✅ **原子性更新**: 使用 Mux1 确保状态要么全部更新，要么全部保持不变
3. ✅ **余额管理**: 正确计算投票后的新余额
4. ✅ **密钥轮换**: 支持在投票时更新公钥
5. ✅ **防重放**: 通过 nonce 机制防止命令重复执行

### 关键要点

- **原子性**: 所有状态字段同时更新或同时保持，不会出现部分更新
- **验证依赖**: 依赖 `MessageValidator` 进行所有验证，确保安全性
- **条件选择**: 使用 Mux1 根据验证结果选择输出值
- **状态一致性**: 确保状态转换的一致性和可预测性

---

## 附录

### A. 常量值

- **命令长度**: `PACKED_CMD_LENGTH = 3`
- **公钥维度**: `2` (x, y 坐标)

### B. 数据流

```
输入数据
    ↓
MessageValidator (验证)
    ↓
isValid (0 或 1)
    ↓
Mux1 × 3 (条件选择)
    ↓
输出数据 (新状态或原状态)
```

### C. 状态更新公式

```circom
newSlPubKey[0] = isValid ? cmdNewPubKey[0] : slPubKey[0]
newSlPubKey[1] = isValid ? cmdNewPubKey[1] : slPubKey[1]
newSlNonce = isValid ? cmdNonce : slNonce
newBalance = messageValidator.newBalance
isValid = messageValidator.isValid
```

只有当 `MessageValidator` 的所有 6 项验证都通过时，`isValid = 1`，状态才会更新。
