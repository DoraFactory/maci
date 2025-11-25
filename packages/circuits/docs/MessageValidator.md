# MessageValidator 电路文档

## 目录

1. [概述](#概述)
2. [电路位置](#电路位置)
3. [输入输出](#输入输出)
4. [验证组件详解](#验证组件详解)
5. [成本计算机制](#成本计算机制)
6. [使用的 Circomlib 组件](#使用的-circomlib-组件)
7. [完整示例](#完整示例)
8. [常见场景](#常见场景)
9. [错误处理](#错误处理)

---

## 概述

`MessageValidator` 是 MACI（Minimal Anti-Collusion Infrastructure）投票系统中的核心验证电路。它负责验证投票消息的有效性，确保只有合法、有效的投票才能被处理。

### 核心功能

该电路执行 **6 项关键验证**，所有验证必须全部通过（总和 = 6）消息才被视为有效：

1. **状态叶子索引验证** - 确保用户已注册
2. **投票选项索引验证** - 确保选项有效
3. **Nonce 验证** - 防止重放攻击
4. **签名验证** - 验证消息真实性
5. **投票权重验证** - 防止溢出
6. **语音信用验证** - 确保有足够余额

### 电路文件位置

```
packages/circuits/circom/maci/power/messageValidator.circom
```

---

## 输入输出

### 输入信号 (Input Signals)

| 信号名 | 类型 | 说明 |
|--------|------|------|
| `stateTreeIndex` | `signal` | 用户在状态树中的索引 |
| `numSignUps` | `signal` | 已注册用户总数 |
| `voteOptionIndex` | `signal` | 投票选项的索引 |
| `maxVoteOptions` | `signal` | 最大投票选项数 |
| `originalNonce` | `signal` | 用户当前的 nonce 值 |
| `nonce` | `signal` | 消息中的 nonce 值（应为 originalNonce + 1） |
| `cmd[3]` | `signal[3]` | 打包的命令数据（包含 nonce, stateIdx, voIdx, votes, salt） |
| `pubKey[2]` | `signal[2]` | 用户的公钥 [x, y] |
| `sigR8[2]` | `signal[2]` | EdDSA 签名的 R8 点 [x, y] |
| `sigS` | `signal` | EdDSA 签名的 S 标量 |
| `isQuadraticCost` | `signal` | 成本模式：0=线性，1=二次 |
| `currentVoiceCreditBalance` | `signal` | 用户当前的语音信用余额 |
| `currentVotesForOption` | `signal` | 该选项当前的累计投票数 |
| `voteWeight` | `signal` | 本次投票的权重 |

### 输出信号 (Output Signals)

| 信号名 | 类型 | 说明 |
|--------|------|------|
| `isValid` | `signal` | 消息是否有效（1=有效，0=无效） |
| `newBalance` | `signal` | 投票后的新余额 |

---

## 验证组件详解

### 1. 状态叶子索引验证 (validStateLeafIndex)

**组件**: `LessEqThan(252)`

**验证逻辑**:
```circom
validStateLeafIndex.in[0] <== stateTreeIndex;
validStateLeafIndex.in[1] <== numSignUps;
```

**功能**: 检查 `stateTreeIndex <= numSignUps`

**目的**: 确保用户已注册（索引不能超过已注册用户数）

**示例**:
- ✅ 有效: `stateTreeIndex = 5`, `numSignUps = 10` → 通过
- ❌ 无效: `stateTreeIndex = 15`, `numSignUps = 10` → 失败

**输出**: `validStateLeafIndex.out` = 1（通过）或 0（失败）

---

### 2. 投票选项索引验证 (validVoteOptionIndex)

**组件**: `LessThan(252)`

**验证逻辑**:
```circom
validVoteOptionIndex.in[0] <== voteOptionIndex;
validVoteOptionIndex.in[1] <== maxVoteOptions;
```

**功能**: 检查 `voteOptionIndex < maxVoteOptions`

**目的**: 确保投票选项索引在有效范围内

**示例**:
- ✅ 有效: `voteOptionIndex = 2`, `maxVoteOptions = 5` → 通过
- ❌ 无效: `voteOptionIndex = 5`, `maxVoteOptions = 5` → 失败（索引从 0 开始）

**输出**: `validVoteOptionIndex.out` = 1（通过）或 0（失败）

---

### 3. Nonce 验证 (validNonce)

**组件**: `IsEqual()`

**验证逻辑**:
```circom
validNonce.in[0] <== originalNonce + 1;
validNonce.in[1] <== nonce;
```

**功能**: 检查 `nonce == originalNonce + 1`

**目的**: 防止重放攻击，确保消息按顺序处理

**工作原理**:
- 用户第一次投票: `originalNonce = 0`, `nonce = 1` ✅
- 用户第二次投票: `originalNonce = 1`, `nonce = 2` ✅
- 重放攻击: `originalNonce = 1`, `nonce = 1` ❌（nonce 必须递增）

**示例**:
- ✅ 有效: `originalNonce = 3`, `nonce = 4` → 通过
- ❌ 无效: `originalNonce = 3`, `nonce = 3` → 失败（nonce 未递增）
- ❌ 无效: `originalNonce = 3`, `nonce = 5` → 失败（nonce 跳跃）

**输出**: `validNonce.out` = 1（通过）或 0（失败）

---

### 4. 签名验证 (validSignature)

**组件**: `VerifySignature()`

**验证逻辑**:
```circom
component validSignature = VerifySignature();
validSignature.pubKey[0] <== pubKey[0];
validSignature.pubKey[1] <== pubKey[1];
validSignature.R8[0] <== sigR8[0];
validSignature.R8[1] <== sigR8[1];
validSignature.S <== sigS;
for (var i = 0; i < PACKED_CMD_LENGTH; i ++) {
    validSignature.preimage[i] <== cmd[i];
}
```

**功能**: 验证 EdDSA 签名

**签名方案**: EdDSA on BabyJubJub curve with Poseidon hash

**验证过程**:
1. 对命令数据 `cmd[3]` 进行 Poseidon 哈希
2. 使用公钥 `pubKey` 验证签名 `(R8, S)`
3. 验证签名方程: `S * G = R8 + H(R8, pubKey, message) * pubKey`

**目的**: 确保消息来自合法的用户，且未被篡改

**示例**:
- ✅ 有效: 使用正确的私钥签名 → 通过
- ❌ 无效: 使用错误的私钥签名 → 失败
- ❌ 无效: 签名与消息不匹配 → 失败

**输出**: `validSignature.valid` = 1（通过）或 0（失败）

---

### 5. 投票权重验证 (validVoteWeight)

**组件**: `LessEqThan(252)`

**验证逻辑**:
```circom
validVoteWeight.in[0] <== voteWeight;
validVoteWeight.in[1] <== 147946756881789319005730692170996259609;
```

**功能**: 检查 `voteWeight <= 147946756881789319005730692170996259609`

**目的**: 防止在二次成本模式下计算 `voteWeight²` 时发生溢出

**技术细节**:
- 最大值 = `sqrt(SNARK_FIELD_SIZE)` ≈ `147946756881789319005730692170996259609`
- 这是 BabyJubJub 曲线标量域大小的平方根
- 确保 `voteWeight²` 不会超过域大小

**示例**:
- ✅ 有效: `voteWeight = 100` → 通过
- ✅ 有效: `voteWeight = 1000000` → 通过
- ❌ 无效: `voteWeight = 147946756881789319005730692170996259610` → 失败（超过最大值）

**输出**: `validVoteWeight.out` = 1（通过）或 0（失败）

---

### 6. 语音信用验证 (sufficientVoiceCredits)

**组件**: `GreaterEqThan(252)`

**验证逻辑**:
```circom
sufficientVoiceCredits.in[0] <== currentCostsForOption.out + currentVoiceCreditBalance;
sufficientVoiceCredits.in[1] <== cost.out;
```

**功能**: 检查 `currentVoiceCreditBalance + currentCostsForOption >= cost`

**目的**: 确保用户有足够的语音信用支付投票成本

**成本计算**:
- `currentCostsForOption`: 当前选项的已有成本（会被退回）
- `cost`: 新投票的成本
- 验证: `余额 + 退回成本 >= 新成本`

**示例**:
- ✅ 有效: `余额 = 100`, `退回 = 5`, `新成本 = 10` → `100 + 5 >= 10` ✅
- ❌ 无效: `余额 = 5`, `退回 = 0`, `新成本 = 10` → `5 + 0 >= 10` ❌

**输出**: `sufficientVoiceCredits.out` = 1（通过）或 0（失败）

---

## 成本计算机制

### 成本模式选择器 (Mux1)

电路使用 `Mux1`（多路复用器）根据 `isQuadraticCost` 选择成本计算方式：

```circom
component currentCostsForOption = Mux1();
currentCostsForOption.s <== isQuadraticCost;
currentCostsForOption.c[0] <== currentVotesForOption;        // 线性模式
currentCostsForOption.c[1] <== currentVotesForOption * currentVotesForOption; // 二次模式
```

**Mux1 工作原理**:
- 如果 `s = 0`: 输出 `c[0]`（线性模式）
- 如果 `s = 1`: 输出 `c[1]`（二次模式）

### 线性成本模式 (isQuadraticCost = 0)

**成本计算**:
- 当前选项已有成本: `currentCostsForOption = currentVotesForOption`
- 新投票成本: `cost = voteWeight`
- 余额验证: `currentVoiceCreditBalance + currentVotesForOption >= voteWeight`
- 新余额: `newBalance = currentVoiceCreditBalance + currentVotesForOption - voteWeight`

**示例场景**:
```
初始状态:
  currentVoiceCreditBalance = 100
  currentVotesForOption = 3
  voteWeight = 5

计算过程:
  currentCostsForOption = 3
  cost = 5
  验证: 100 + 3 >= 5 ✅
  newBalance = 100 + 3 - 5 = 98
```

### 二次成本模式 (isQuadraticCost = 1)

**成本计算**:
- 当前选项已有成本: `currentCostsForOption = currentVotesForOption²`
- 新投票成本: `cost = voteWeight²`
- 余额验证: `currentVoiceCreditBalance + currentVotesForOption² >= voteWeight²`
- 新余额: `newBalance = currentVoiceCreditBalance + currentVotesForOption² - voteWeight²`

**示例场景**:
```
初始状态:
  currentVoiceCreditBalance = 100
  currentVotesForOption = 3
  voteWeight = 2

计算过程:
  currentCostsForOption = 3² = 9
  cost = 2² = 4
  验证: 100 + 9 >= 4 ✅
  newBalance = 100 + 9 - 4 = 105
```

**二次成本的优势**:
- 防止投票操纵：越往后投票成本越高
- 鼓励早期投票：早期投票成本更低
- 实现更公平的投票分配

### 投票修改的成本退款机制

当用户修改之前的投票时，系统会：
1. **退回旧成本**: `+ currentCostsForOption`
2. **扣除新成本**: `- cost`
3. **更新余额**: `newBalance = balance + 退回 - 扣除`

**示例：用户修改投票（二次成本）**:
```
第一次投票:
  currentVotesForOption = 0
  voteWeight = 5
  cost = 5² = 25
  newBalance = 100 + 0 - 25 = 75

第二次投票（修改）:
  currentVotesForOption = 5  (之前的投票)
  voteWeight = 3              (新的投票)
  currentCostsForOption = 5² = 25  (退回)
  cost = 3² = 9                   (扣除)
  newBalance = 75 + 25 - 9 = 91
```

---

## 使用的 Circomlib 组件

### LessEqThan(n)

**功能**: 比较两个数，检查 `in[0] <= in[1]`

**参数**: `n` - 位宽（252 位）

**使用场景**:
- `validStateLeafIndex`: 检查 `stateTreeIndex <= numSignUps`
- `validVoteWeight`: 检查 `voteWeight <= MAX_VOTE_WEIGHT`

**输出**: 1 如果 `in[0] <= in[1]`，否则 0

---

### LessThan(n)

**功能**: 比较两个数，检查 `in[0] < in[1]`

**参数**: `n` - 位宽（252 位）

**使用场景**:
- `validVoteOptionIndex`: 检查 `voteOptionIndex < maxVoteOptions`

**输出**: 1 如果 `in[0] < in[1]`，否则 0

---

### GreaterEqThan(n)

**功能**: 比较两个数，检查 `in[0] >= in[1]`

**参数**: `n` - 位宽（252 位）

**使用场景**:
- `sufficientVoiceCredits`: 检查 `余额 + 退回成本 >= 新成本`

**输出**: 1 如果 `in[0] >= in[1]`，否则 0

---

### IsEqual()

**功能**: 检查两个数是否相等

**使用场景**:
- `validNonce`: 检查 `nonce == originalNonce + 1`
- `validUpdate`: 检查所有验证结果之和是否等于 6

**输出**: 1 如果 `in[0] == in[1]`，否则 0

---

### Mux1()

**功能**: 1 位多路复用器（二选一）

**工作原理**:
- 如果 `s = 0`: 输出 `c[0]`
- 如果 `s = 1`: 输出 `c[1]`

**使用场景**:
- `currentCostsForOption`: 选择线性或二次成本
- `cost`: 选择线性或二次成本

**公式**: `out = s * c[1] + (1 - s) * c[0]`

---

### VerifySignature()

**功能**: 验证 EdDSA 签名

**输入**:
- `pubKey[2]`: 公钥 [x, y]
- `R8[2]`: 签名的 R8 点 [x, y]
- `S`: 签名的 S 标量
- `preimage[3]`: 要签名的数据

**验证过程**:
1. 对 `preimage` 进行 Poseidon 哈希得到 `message`
2. 计算 `h = Poseidon(R8, pubKey, message)`
3. 验证: `S * G = R8 + h * pubKey`

**输出**: `valid` = 1（签名有效）或 0（签名无效）

---

## 完整示例

### 示例 1: 首次投票（线性成本）

**场景**: 用户 Alice 第一次投票，选择选项 1，投票权重 10

**输入参数**:
```javascript
{
  stateTreeIndex: 0n,           // Alice 的索引
  numSignUps: 100n,             // 总共 100 个用户
  voteOptionIndex: 1n,           // 选项 1
  maxVoteOptions: 10n,           // 总共 10 个选项
  originalNonce: 0n,             // 首次投票，nonce 为 0
  nonce: 1n,                     // 新 nonce 为 1
  cmd: [packaged, pubKeyX, pubKeyY],  // 打包的命令
  pubKey: [pubKeyX, pubKeyY],    // Alice 的公钥
  sigR8: [R8x, R8y],             // 签名 R8
  sigS: S,                       // 签名 S
  isQuadraticCost: 0n,           // 线性成本模式
  currentVoiceCreditBalance: 1000n,  // 余额 1000
  currentVotesForOption: 0n,     // 首次投票，之前为 0
  voteWeight: 10n                // 投票权重 10
}
```

**验证过程**:

1. **状态索引验证**: `0 <= 100` ✅ → `validStateLeafIndex.out = 1`
2. **选项索引验证**: `1 < 10` ✅ → `validVoteOptionIndex.out = 1`
3. **Nonce 验证**: `1 == 0 + 1` ✅ → `validNonce.out = 1`
4. **签名验证**: EdDSA 签名有效 ✅ → `validSignature.valid = 1`
5. **权重验证**: `10 <= MAX` ✅ → `validVoteWeight.out = 1`
6. **余额验证**: 
   - `currentCostsForOption = 0` (线性模式)
   - `cost = 10`
   - `1000 + 0 >= 10` ✅ → `sufficientVoiceCredits.out = 1`

**最终验证**:
```
validUpdate.in[0] = 6
validUpdate.in[1] = 1 + 1 + 1 + 1 + 1 + 1 = 6
isValid = 1 ✅
```

**新余额计算**:
```
newBalance = 1000 + 0 - 10 = 990
```

---

### 示例 2: 修改投票（二次成本）

**场景**: 用户 Bob 修改之前的投票，从权重 5 改为权重 8

**输入参数**:
```javascript
{
  stateTreeIndex: 5n,
  numSignUps: 100n,
  voteOptionIndex: 2n,
  maxVoteOptions: 10n,
  originalNonce: 1n,             // 之前投过票，nonce 为 1
  nonce: 2n,                     // 新 nonce 为 2
  cmd: [packaged, pubKeyX, pubKeyY],
  pubKey: [pubKeyX, pubKeyY],
  sigR8: [R8x, R8y],
  sigS: S,
  isQuadraticCost: 1n,           // 二次成本模式
  currentVoiceCreditBalance: 950n,  // 当前余额
  currentVotesForOption: 5n,     // 之前的投票权重为 5
  voteWeight: 8n                 // 新的投票权重为 8
}
```

**验证过程**:

1. **状态索引验证**: `5 <= 100` ✅
2. **选项索引验证**: `2 < 10` ✅
3. **Nonce 验证**: `2 == 1 + 1` ✅
4. **签名验证**: EdDSA 签名有效 ✅
5. **权重验证**: `8 <= MAX` ✅
6. **余额验证**:
   - `currentCostsForOption = 5² = 25` (退回旧成本)
   - `cost = 8² = 64` (新成本)
   - `950 + 25 >= 64` ✅ → `975 >= 64` ✅

**最终验证**: 所有 6 项验证通过 → `isValid = 1` ✅

**新余额计算**:
```
newBalance = 950 + 25 - 64 = 911
```

**成本分析**:
- 退回: +25 (之前 5² 的成本)
- 扣除: -64 (新的 8² 的成本)
- 净变化: -39

---

### 示例 3: 余额不足（失败案例）

**场景**: 用户 Charlie 余额不足，无法投票

**输入参数**:
```javascript
{
  stateTreeIndex: 10n,
  numSignUps: 100n,
  voteOptionIndex: 0n,
  maxVoteOptions: 10n,
  originalNonce: 0n,
  nonce: 1n,
  cmd: [packaged, pubKeyX, pubKeyY],
  pubKey: [pubKeyX, pubKeyY],
  sigR8: [R8x, R8y],
  sigS: S,
  isQuadraticCost: 1n,           // 二次成本
  currentVoiceCreditBalance: 10n,  // 余额只有 10
  currentVotesForOption: 0n,
  voteWeight: 5n                // 需要 5² = 25
}
```

**验证过程**:

1. **状态索引验证**: `10 <= 100` ✅ → `validStateLeafIndex.out = 1`
2. **选项索引验证**: `0 < 10` ✅ → `validVoteOptionIndex.out = 1`
3. **Nonce 验证**: `1 == 0 + 1` ✅ → `validNonce.out = 1`
4. **签名验证**: EdDSA 签名有效 ✅ → `validSignature.valid = 1`
5. **权重验证**: `5 <= MAX` ✅ → `validVoteWeight.out = 1`
6. **余额验证**:
   - `currentCostsForOption = 0² = 0`
   - `cost = 5² = 25`
   - `10 + 0 >= 25` ❌ → `sufficientVoiceCredits.out = 0`

**最终验证**:
```
validUpdate.in[0] = 6
validUpdate.in[1] = 1 + 0 + 1 + 1 + 1 + 1 = 5
isValid = 0 ❌
```

**结果**: 消息无效，投票被拒绝

---

## 常见场景

### 场景 1: 首次投票

**特点**:
- `currentVotesForOption = 0`
- `originalNonce = 0`
- `nonce = 1`

**成本计算（线性）**:
```
currentCostsForOption = 0
cost = voteWeight
newBalance = currentVoiceCreditBalance - voteWeight
```

**成本计算（二次）**:
```
currentCostsForOption = 0
cost = voteWeight²
newBalance = currentVoiceCreditBalance - voteWeight²
```

---

### 场景 2: 修改投票

**特点**:
- `currentVotesForOption > 0` (有之前的投票)
- `originalNonce > 0` (之前投过票)
- `nonce = originalNonce + 1`

**成本计算（线性）**:
```
退回: +currentVotesForOption
扣除: -voteWeight
newBalance = balance + currentVotesForOption - voteWeight
```

**成本计算（二次）**:
```
退回: +currentVotesForOption²
扣除: -voteWeight²
newBalance = balance + currentVotesForOption² - voteWeight²
```

**示例**:
```
之前投票: 5
新投票: 3
余额: 100

线性模式:
  退回: +5
  扣除: -3
  新余额: 100 + 5 - 3 = 102

二次模式:
  退回: +25 (5²)
  扣除: -9 (3²)
  新余额: 100 + 25 - 9 = 116
```

---

### 场景 3: 撤回投票

**特点**:
- `voteWeight = 0` (将投票权重设为 0)
- `currentVotesForOption > 0` (之前有投票)

**成本计算**:
```
退回: +currentCostsForOption
扣除: -0
newBalance = balance + currentCostsForOption
```

**示例（二次模式）**:
```
之前投票: 5
撤回投票: 0
余额: 100

退回: +25 (5²)
扣除: -0
新余额: 100 + 25 - 0 = 125
```

---

### 场景 4: 增加投票权重

**特点**:
- `voteWeight > currentVotesForOption`

**成本计算（二次模式）**:
```
退回: +currentVotesForOption²
扣除: -voteWeight²
净成本: voteWeight² - currentVotesForOption²
```

**示例**:
```
之前投票: 3 (成本 9)
新投票: 5 (成本 25)
余额: 100

退回: +9
扣除: -25
新余额: 100 + 9 - 25 = 84
净成本: 16
```

---

### 场景 5: 减少投票权重

**特点**:
- `voteWeight < currentVotesForOption`

**成本计算（二次模式）**:
```
退回: +currentVotesForOption²
扣除: -voteWeight²
净退款: currentVotesForOption² - voteWeight²
```

**示例**:
```
之前投票: 5 (成本 25)
新投票: 3 (成本 9)
余额: 100

退回: +25
扣除: -9
新余额: 100 + 25 - 9 = 116
净退款: 16
```

---

## 错误处理

### 验证失败的情况

当任何一项验证失败时，`isValid = 0`，消息将被拒绝：

| 验证项 | 失败原因 | 示例 |
|--------|----------|------|
| 状态索引 | `stateTreeIndex > numSignUps` | 索引 15，但只有 10 个用户 |
| 选项索引 | `voteOptionIndex >= maxVoteOptions` | 选项 5，但只有 5 个选项（索引从 0 开始） |
| Nonce | `nonce != originalNonce + 1` | nonce 跳跃或重复 |
| 签名 | 签名无效 | 使用错误的私钥或消息被篡改 |
| 权重 | `voteWeight > MAX` | 投票权重超过最大值 |
| 余额 | `余额 + 退回 < 新成本` | 余额不足 |

### 验证结果汇总

电路通过 `IsEqual` 组件汇总所有验证结果：

```circom
component validUpdate = IsEqual();
validUpdate.in[0] <== 6;  // 期望值：6 项验证全部通过
validUpdate.in[1] <== validSignature.valid + 
                      sufficientVoiceCredits.out +
                      validVoteWeight.out +
                      validNonce.out +
                      validStateLeafIndex.out +
                      validVoteOptionIndex.out;
isValid <== validUpdate.out;
```

**逻辑**:
- 如果所有 6 项验证都通过，总和 = 6 → `isValid = 1`
- 如果任何一项失败，总和 < 6 → `isValid = 0`

---

## 技术细节

### 命令打包格式 (cmd[3])

命令数据被打包成 3 个字段元素：

```javascript
const packaged = packElement({
  nonce: 1,           // 32 bits
  stateIdx: 5,        // 32 bits
  voIdx: 2,           // 32 bits
  newVotes: 100,      // 96 bits
  salt: 0             // 剩余 bits
});

cmd = [packaged, newPubKey[0], newPubKey[1]];
```

### 签名验证流程

1. **命令哈希**: `messageHash = Poseidon(cmd[0], cmd[1], cmd[2])`
2. **签名生成**: 使用私钥对 `messageHash` 签名
3. **签名验证**: 在电路中验证 `(R8, S)` 是否与 `pubKey` 和 `messageHash` 匹配

### 余额更新逻辑

余额更新公式：
```
newBalance = currentVoiceCreditBalance + currentCostsForOption - cost
```

其中：
- `currentCostsForOption`: 根据 `isQuadraticCost` 选择线性或二次
- `cost`: 根据 `isQuadraticCost` 选择线性或二次

这确保了：
- 退回之前投票的成本
- 扣除新投票的成本
- 正确更新余额

---

## 快速参考表

### 验证条件汇总

| # | 验证项 | 组件 | 条件 | 输出信号 |
|---|--------|------|------|----------|
| 1 | 状态索引 | `LessEqThan(252)` | `stateTreeIndex <= numSignUps` | `validStateLeafIndex.out` |
| 2 | 选项索引 | `LessThan(252)` | `voteOptionIndex < maxVoteOptions` | `validVoteOptionIndex.out` |
| 3 | Nonce | `IsEqual()` | `nonce == originalNonce + 1` | `validNonce.out` |
| 4 | 签名 | `VerifySignature()` | EdDSA 签名有效 | `validSignature.valid` |
| 5 | 权重 | `LessEqThan(252)` | `voteWeight <= MAX` | `validVoteWeight.out` |
| 6 | 余额 | `GreaterEqThan(252)` | `余额 + 退回 >= 成本` | `sufficientVoiceCredits.out` |

### 成本计算公式

**线性模式** (`isQuadraticCost = 0`):
```
退回成本 = currentVotesForOption
新成本 = voteWeight
新余额 = currentVoiceCreditBalance + currentVotesForOption - voteWeight
```

**二次模式** (`isQuadraticCost = 1`):
```
退回成本 = currentVotesForOption²
新成本 = voteWeight²
新余额 = currentVoiceCreditBalance + currentVotesForOption² - voteWeight²
```

### 验证流程图

```
输入消息
    ↓
┌─────────────────────────────────────┐
│  1. 状态索引验证 (stateTreeIndex)    │
│     stateTreeIndex <= numSignUps?    │
└─────────────────────────────────────┘
    ↓ ✅
┌─────────────────────────────────────┐
│  2. 选项索引验证 (voteOptionIndex)   │
│     voteOptionIndex < maxVoteOptions?│
└─────────────────────────────────────┘
    ↓ ✅
┌─────────────────────────────────────┐
│  3. Nonce 验证                       │
│     nonce == originalNonce + 1?      │
└─────────────────────────────────────┘
    ↓ ✅
┌─────────────────────────────────────┐
│  4. 签名验证 (EdDSA)                 │
│     签名是否有效?                    │
└─────────────────────────────────────┘
    ↓ ✅
┌─────────────────────────────────────┐
│  5. 权重验证                         │
│     voteWeight <= MAX?               │
└─────────────────────────────────────┘
    ↓ ✅
┌─────────────────────────────────────┐
│  6. 余额验证                         │
│     余额 + 退回 >= 成本?             │
└─────────────────────────────────────┘
    ↓ ✅
┌─────────────────────────────────────┐
│  所有验证通过?                       │
│  isValid = 1                        │
│  newBalance = 计算新余额             │
└─────────────────────────────────────┘
```

---

## 实际应用示例

### 示例 A: 完整的投票流程

**用户信息**:
- 用户: Alice
- 状态索引: 2
- 当前余额: 1000
- 当前 nonce: 0

**投票信息**:
- 选项: 选项 3 (索引 2)
- 投票权重: 10
- 成本模式: 线性

**步骤 1: 准备命令**
```javascript
const cmd = packElement({
  nonce: 1,        // originalNonce + 1
  stateIdx: 2,
  voIdx: 2,
  newVotes: 10,
  salt: 0
});
```

**步骤 2: 生成签名**
```javascript
const messageHash = poseidon([cmd, newPubKey[0], newPubKey[1]]);
const signature = keypair.sign(messageHash);
// signature = { R8: [R8x, R8y], S: S }
```

**步骤 3: 电路验证**
```javascript
const inputs = {
  stateTreeIndex: 2n,
  numSignUps: 100n,
  voteOptionIndex: 2n,
  maxVoteOptions: 10n,
  originalNonce: 0n,
  nonce: 1n,
  cmd: [cmd, newPubKey[0], newPubKey[1]],
  pubKey: [pubKeyX, pubKeyY],
  sigR8: [R8x, R8y],
  sigS: S,
  isQuadraticCost: 0n,
  currentVoiceCreditBalance: 1000n,
  currentVotesForOption: 0n,  // 首次投票
  voteWeight: 10n
};

// 电路输出
const result = await circuit.calculateWitness(inputs);
// result.isValid = 1 ✅
// result.newBalance = 990
```

---

### 示例 B: 投票修改场景

**初始状态**:
- 用户: Bob
- 选项 1 已有投票: 5 (线性成本模式下，成本为 5)
- 当前余额: 100

**修改投票**:
- 新投票权重: 8
- 成本模式: 线性

**计算过程**:
```
退回成本 = 5 (之前的投票)
新成本 = 8 (新的投票)
验证: 100 + 5 >= 8 ✅
新余额 = 100 + 5 - 8 = 97
```

**如果使用二次成本**:
```
退回成本 = 5² = 25
新成本 = 8² = 64
验证: 100 + 25 >= 64 ✅
新余额 = 100 + 25 - 64 = 61
```

---

### 示例 C: 二次成本的优势演示

**场景**: 3 个用户对同一选项投票，使用二次成本

| 用户 | 投票顺序 | 投票权重 | 成本 | 累计成本 |
|------|----------|----------|------|----------|
| Alice | 第 1 个 | 10 | 10² = 100 | 100 |
| Bob | 第 2 个 | 10 | 10² = 100 | 200 |
| Charlie | 第 3 个 | 10 | 10² = 100 | 300 |

**如果使用线性成本**:
| 用户 | 投票顺序 | 投票权重 | 成本 | 累计成本 |
|------|----------|----------|------|----------|
| Alice | 第 1 个 | 10 | 10 | 10 |
| Bob | 第 2 个 | 10 | 10 | 20 |
| Charlie | 第 3 个 | 10 | 10 | 30 |

**二次成本的优势**:
- 每个用户支付相同的成本（都是 10² = 100）
- 总成本更高，防止投票操纵
- 鼓励用户合理分配投票权重

---

## 总结

`MessageValidator` 电路是 MACI 系统的安全核心，它通过 6 项严格的验证确保：

1. ✅ **身份验证**: 只有注册用户才能投票
2. ✅ **选项验证**: 投票选项在有效范围内
3. ✅ **防重放**: Nonce 机制防止消息重放
4. ✅ **消息完整性**: 签名验证确保消息未被篡改
5. ✅ **防止溢出**: 投票权重限制防止计算溢出
6. ✅ **余额管理**: 确保用户有足够余额，并正确计算新余额

所有验证必须在零知识环境中完成，确保投票的隐私性和安全性。

### 关键要点

- **所有验证必须通过**: 6 项验证的总和必须等于 6，消息才有效
- **成本退款机制**: 修改投票时会退回旧成本，扣除新成本
- **二次成本优势**: 防止投票操纵，鼓励公平分配
- **Nonce 机制**: 确保消息按顺序处理，防止重放攻击
- **签名验证**: 确保消息来自合法用户且未被篡改

---

## 代码示例

### 示例 1: 使用 VoterClient 生成投票消息

```typescript
import { VoterClient, poseidon, packElement } from '@dorafactory/maci-sdk';

// 初始化投票客户端
const voter = new VoterClient({
  network: 'testnet',
  secretKey: 123456n
});

const keypair = voter.getSigner();
const coordPubKey = operator.getPubkey().toPoints();

// 创建投票消息
function createVoteMessage(
  stateIdx: number,
  voIdx: number,
  voteWeight: bigint,
  nonce: number
) {
  // 1. 打包命令数据
  const salt = 0n;
  const packaged = packElement({
    nonce,
    stateIdx,
    voIdx,
    newVotes: voteWeight,
    salt
  });

  // 2. 构建命令数组
  const newPubKey = [0n, 0n]; // 最后一次命令，pubKey 设为 0
  const cmd = [packaged, newPubKey[0], newPubKey[1]];

  // 3. 计算消息哈希
  const msgHash = poseidon(cmd);

  // 4. 签名
  const signature = keypair.sign(msgHash);

  return {
    cmd,
    pubKey: keypair.getPublicKey().toPoints(),
    sigR8: signature.R8,
    sigS: signature.S
  };
}

// 使用示例
const vote = createVoteMessage(0, 1, 10n, 1);
```

### 示例 2: 准备电路输入

```typescript
// 准备 MessageValidator 电路的输入
const circuitInputs = {
  // 基本验证参数
  stateTreeIndex: 0n,
  numSignUps: 100n,
  voteOptionIndex: 1n,
  maxVoteOptions: 10n,
  
  // Nonce 验证
  originalNonce: 0n,
  nonce: 1n,
  
  // 签名验证
  cmd: vote.cmd,
  pubKey: vote.pubKey,
  sigR8: vote.sigR8,
  sigS: vote.sigS,
  
  // 成本计算
  isQuadraticCost: 0n, // 0=线性, 1=二次
  currentVoiceCreditBalance: 1000n,
  currentVotesForOption: 0n,
  voteWeight: 10n
};

// 计算 witness
const witness = await circuit.calculateWitness(circuitInputs);

// 获取结果
const isValid = await getSignal(circuit, witness, 'isValid');
const newBalance = await getSignal(circuit, witness, 'newBalance');

console.log('Message valid:', isValid === 1n);
console.log('New balance:', newBalance.toString());
```

### 示例 3: 完整的投票验证流程

```typescript
async function validateVoteMessage(
  stateTreeIndex: bigint,
  numSignUps: bigint,
  voteOptionIndex: bigint,
  maxVoteOptions: bigint,
  originalNonce: bigint,
  nonce: bigint,
  cmd: [bigint, bigint, bigint],
  pubKey: [bigint, bigint],
  sigR8: [bigint, bigint],
  sigS: bigint,
  isQuadraticCost: bigint,
  currentVoiceCreditBalance: bigint,
  currentVotesForOption: bigint,
  voteWeight: bigint
): Promise<{ isValid: boolean; newBalance: bigint }> {
  const circuitInputs = {
    stateTreeIndex,
    numSignUps,
    voteOptionIndex,
    maxVoteOptions,
    originalNonce,
    nonce,
    cmd,
    pubKey,
    sigR8,
    sigS,
    isQuadraticCost,
    currentVoiceCreditBalance,
    currentVotesForOption,
    voteWeight
  };

  const witness = await circuit.calculateWitness(circuitInputs);
  await circuit.expectConstraintPass(witness);

  const isValid = await getSignal(circuit, witness, 'isValid');
  const newBalance = await getSignal(circuit, witness, 'newBalance');

  return {
    isValid: isValid === 1n,
    newBalance
  };
}

// 使用示例
const result = await validateVoteMessage(
  0n,    // stateTreeIndex
  100n,  // numSignUps
  1n,    // voteOptionIndex
  10n,   // maxVoteOptions
  0n,    // originalNonce
  1n,    // nonce
  [cmd0, cmd1, cmd2],  // cmd
  [pubKeyX, pubKeyY],  // pubKey
  [R8x, R8y],          // sigR8
  S,                   // sigS
  0n,                  // isQuadraticCost
  1000n,               // currentVoiceCreditBalance
  0n,                  // currentVotesForOption
  10n                  // voteWeight
);

if (result.isValid) {
  console.log('Vote accepted! New balance:', result.newBalance.toString());
} else {
  console.log('Vote rejected!');
}
```

---

## 调试技巧

### 启用调试输出

电路中有注释掉的调试输出，可以取消注释来查看各个验证项的结果：

```circom
// 取消注释这些行来启用调试输出
signal output isValidSignature;
signal output isValidVc;
signal output isValidNonce;
signal output isValidSli;
signal output isValidVoi;

isValidSignature <== validSignature.valid;
isValidVc <== sufficientVoiceCredits.out;
isValidNonce <== validNonce.out;
isValidSli <== validStateLeafIndex.out;
isValidVoi <== validVoteOptionIndex.out;
```

### 常见问题排查

1. **isValid = 0，但不知道哪项失败**
   - 启用调试输出，查看各个验证项的结果
   - 检查每项验证的输入值

2. **余额计算不正确**
   - 确认 `isQuadraticCost` 的值（0 或 1）
   - 检查 `currentVotesForOption` 是否正确
   - 验证成本计算公式

3. **签名验证失败**
   - 确认 `cmd` 数组格式正确
   - 检查签名是否使用正确的私钥
   - 验证 `pubKey` 是否匹配签名

---

## 相关资源

- **电路文件**: `packages/circuits/circom/maci/power/messageValidator.circom`
- **测试文件**: `packages/circuits/ts/__tests__/MessageValidator.test.ts`
- **使用示例**: 参考 `AmaciIntegration.test.ts` 和 `MaciIntegration.test.ts`
- **集成测试**: `packages/circuits/ts/__tests__/AmaciIntegration.test.ts`

---

## 附录

### A. 常量值

- **最大投票权重**: `147946756881789319005730692170996259609`
- **命令长度**: `PACKED_CMD_LENGTH = 3`
- **位宽**: `252` (用于比较器组件)

### B. 数据格式

**命令打包格式** (packed element):
```
Bits [0-31]:    nonce (32 bits)
Bits [32-63]:   stateIdx (32 bits)
Bits [64-95]:   voIdx (32 bits)
Bits [96-191]:  newVotes (96 bits)
Bits [192+]:    salt (随机值)
```

**命令数组** (cmd[3]):
```
cmd[0] = packaged (包含 nonce, stateIdx, voIdx, votes, salt)
cmd[1] = newPubKey[0]
cmd[2] = newPubKey[1]
```

### C. 验证结果汇总公式

```circom
isValid = (validSignature.valid + 
           sufficientVoiceCredits.out +
           validVoteWeight.out +
           validNonce.out +
           validStateLeafIndex.out +
           validVoteOptionIndex.out) == 6 ? 1 : 0
```

只有当所有 6 项验证都返回 1 时，总和才等于 6，`isValid = 1`。

