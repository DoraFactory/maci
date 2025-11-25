# StateLeafTransformer 使用示例

本文档提供 `StateLeafTransformer` 电路的实际使用示例，帮助理解如何在不同场景下使用该电路。

## 示例 1：基本投票流程

### 场景描述
用户 Alice（状态索引 0）想要为选项 1 投票，投票权重为 3。

### 输入数据

```javascript
// 系统配置
const isQuadraticCost = false;  // 使用线性成本
const numSignUps = 10;          // 总共 10 个注册用户
const maxVoteOptions = 5;       // 最多 5 个投票选项

// 当前状态叶子（Alice 的状态）
const stateLeaf = {
  pubKey: [123456789n, 987654321n],  // Alice 的公钥
  voiceCreditBalance: 100n,           // Alice 有 100 个语音信用
  nonce: 2n,                          // 当前 nonce 为 2
  currentVotesForOption: 0n           // 选项 1 还没有投票
};

// 命令（Alice 想要执行的投票）
const command = {
  stateIndex: 0n,                     // Alice 的状态索引
  newPubKey: [111222333n, 444555666n], // 新公钥（密钥轮换）
  voteOptionIndex: 1n,                 // 投票给选项 1
  newVoteWeight: 3n,                   // 投票权重为 3
  nonce: 3n,                           // 新 nonce（2 + 1）
  sigR8: [777888999n, 111222333n],    // 签名 R8
  sigS: 444555666n,                    // 签名 S
  packedCommand: [                    // 打包的命令（用于签名验证）
    123456789n,
    987654321n,
    1000000000n
  ]
};
```

### 电路执行过程

1. **MessageValidator 验证**：
   - ✅ 状态索引检查：`0 < 10` ✓
   - ✅ 投票选项检查：`1 < 5` ✓
   - ✅ Nonce 检查：`3 == 2 + 1` ✓
   - ✅ 签名验证：使用 `stateLeaf.pubKey` 验证 `packedCommand` 的签名 ✓
   - ✅ 余额检查：`100 >= 3` ✓

2. **成本计算**（线性模式）：
   ```
   已用成本 = currentVotesForOption = 0
   新成本 = newVoteWeight = 3
   新余额 = 100 + 0 - 3 = 97
   ```

3. **状态更新**（因为 `isValid = 1`）：
   ```
   newSlPubKey = [111222333n, 444555666n]  // 使用新公钥
   newSlNonce = 3n                          // 使用新 nonce
   ```

### 输出结果

```javascript
{
  newSlPubKey: [111222333n, 444555666n],
  newSlNonce: 3n,
  isValid: 1n,        // 命令有效
  newBalance: 97n     // 新余额
}
```

---

## 示例 2：二次成本模式下的投票

### 场景描述
用户 Bob（状态索引 5）在二次成本模式下为选项 2 投票，投票权重为 4。该选项已经有 2 个投票权重。

### 输入数据

```javascript
// 系统配置
const isQuadraticCost = true;   // 使用二次成本
const numSignUps = 10;
const maxVoteOptions = 5;

// 当前状态叶子
const stateLeaf = {
  pubKey: [555666777n, 888999000n],
  voiceCreditBalance: 200n,
  nonce: 1n,
  currentVotesForOption: 2n    // 选项 2 已有 2 个投票权重
};

// 命令
const command = {
  stateIndex: 5n,
  newPubKey: [111222333n, 444555666n],
  voteOptionIndex: 2n,
  newVoteWeight: 4n,
  nonce: 2n,
  sigR8: [777888999n, 111222333n],
  sigS: 444555666n,
  packedCommand: [555666777n, 888999000n, 2000000000n]
};
```

### 成本计算（二次模式）

```
已用成本 = currentVotesForOption² = 2² = 4
新成本 = newVoteWeight² = 4² = 16
总成本 = 4 + 16 = 20
新余额 = 200 - 16 = 184
```

### 验证过程

- ✅ 所有验证通过
- ✅ 余额检查：`200 + 4 >= 16` ✓

### 输出结果

```javascript
{
  newSlPubKey: [111222333n, 444555666n],
  newSlNonce: 2n,
  isValid: 1n,
  newBalance: 184n
}
```

---

## 示例 3：无效命令 - Nonce 错误

### 场景描述
用户 Charlie 尝试使用错误的 nonce 提交命令。

### 输入数据

```javascript
const stateLeaf = {
  pubKey: [111111111n, 222222222n],
  voiceCreditBalance: 50n,
  nonce: 5n  // 当前 nonce 是 5
};

const command = {
  stateIndex: 2n,
  newPubKey: [333333333n, 444444444n],
  voteOptionIndex: 0n,
  newVoteWeight: 2n,
  nonce: 7n,  // ❌ 错误！应该是 6 (5 + 1)
  // ... 其他字段
};
```

### 验证过程

- ✅ 状态索引检查通过
- ✅ 投票选项检查通过
- ❌ **Nonce 检查失败**：`7 != 5 + 1`
- 其他验证不再进行（因为 nonce 已失败）

### 输出结果

```javascript
{
  newSlPubKey: [111111111n, 222222222n],  // 保持原公钥
  newSlNonce: 5n,                          // 保持原 nonce
  isValid: 0n,                             // 命令无效
  newBalance: 50n                          // 余额不变
}
```

---

## 示例 4：无效命令 - 余额不足

### 场景描述
用户 David 尝试投票，但余额不足。

### 输入数据

```javascript
const isQuadraticCost = false;

const stateLeaf = {
  pubKey: [999999999n, 888888888n],
  voiceCreditBalance: 5n,      // 只有 5 个信用
  nonce: 0n,
  currentVotesForOption: 0n
};

const command = {
  stateIndex: 3n,
  newPubKey: [777777777n, 666666666n],
  voteOptionIndex: 1n,
  newVoteWeight: 10n,          // 需要 10 个信用
  nonce: 1n,
  // ... 其他字段
};
```

### 验证过程

- ✅ 状态索引检查通过
- ✅ 投票选项检查通过
- ✅ Nonce 检查通过
- ✅ 签名验证通过
- ❌ **余额检查失败**：`5 < 10`

### 输出结果

```javascript
{
  newSlPubKey: [999999999n, 888888888n],  // 保持原公钥
  newSlNonce: 0n,                          // 保持原 nonce
  isValid: 0n,
  newBalance: 5n                           // 余额不变
}
```

---

## 示例 5：无效命令 - 状态索引超出范围

### 场景描述
用户尝试使用超出注册范围的状态索引。

### 输入数据

```javascript
const numSignUps = 10;  // 只有 10 个注册用户（索引 0-9）

const command = {
  stateIndex: 15n,  // ❌ 超出范围！应该是 0-9
  // ... 其他字段
};
```

### 验证过程

- ❌ **状态索引检查失败**：`15 >= 10`
- 其他验证不再进行

### 输出结果

```javascript
{
  isValid: 0n,
  // 所有状态保持不变
}
```

---

## 示例 6：无效命令 - 投票选项超出范围

### 场景描述
用户尝试投票给不存在的选项。

### 输入数据

```javascript
const maxVoteOptions = 5;  // 只有 5 个选项（索引 0-4）

const command = {
  stateIndex: 1n,
  voteOptionIndex: 10n,  // ❌ 超出范围！应该是 0-4
  // ... 其他字段
};
```

### 验证过程

- ✅ 状态索引检查通过
- ❌ **投票选项检查失败**：`10 >= 5`
- 其他验证不再进行

### 输出结果

```javascript
{
  isValid: 0n,
  // 所有状态保持不变
}
```

---

## 示例 7：无效命令 - 签名验证失败

### 场景描述
用户使用错误的私钥签名，导致签名验证失败。

### 输入数据

```javascript
const stateLeaf = {
  pubKey: [123456789n, 987654321n],  // Alice 的公钥
  // ...
};

const command = {
  stateIndex: 0n,
  // ...
  sigR8: [111111111n, 222222222n],   // ❌ 使用错误的签名
  sigS: 333333333n,                   // ❌ 签名不匹配公钥
  packedCommand: [123456789n, 987654321n, 1000000000n]
};
```

### 验证过程

- ✅ 状态索引检查通过
- ✅ 投票选项检查通过
- ✅ Nonce 检查通过
- ❌ **签名验证失败**：签名与公钥不匹配

### 输出结果

```javascript
{
  isValid: 0n,
  // 所有状态保持不变
}
```

---

## 示例 8：复杂场景 - 多次投票累积

### 场景描述
用户 Eve 在二次成本模式下多次为同一选项投票，观察余额变化。

### 第一次投票

```javascript
const stateLeaf1 = {
  pubKey: [111111111n, 222222222n],
  voiceCreditBalance: 100n,
  nonce: 0n,
  currentVotesForOption: 0n
};

const command1 = {
  newVoteWeight: 3n,
  nonce: 1n,
  // ...
};

// 成本计算
// 已用成本 = 0² = 0
// 新成本 = 3² = 9
// 新余额 = 100 - 9 = 91
```

**结果：**
- `newBalance = 91n`
- `currentVotesForOption = 3n`（更新后）

### 第二次投票（在同一选项上）

```javascript
const stateLeaf2 = {
  pubKey: [111111111n, 222222222n],
  voiceCreditBalance: 91n,        // 使用第一次的结果
  nonce: 1n,
  currentVotesForOption: 3n        // 选项已有 3 个投票权重
};

const command2 = {
  newVoteWeight: 2n,
  nonce: 2n,
  // ...
};

// 成本计算
// 已用成本 = 3² = 9
// 新成本 = 2² = 4
// 新余额 = 91 - 4 = 87
```

**结果：**
- `newBalance = 87n`
- `currentVotesForOption = 5n`（3 + 2）

### 第三次投票

```javascript
const stateLeaf3 = {
  voiceCreditBalance: 87n,
  nonce: 2n,
  currentVotesForOption: 5n
};

const command3 = {
  newVoteWeight: 4n,
  nonce: 3n,
  // ...
};

// 成本计算
// 已用成本 = 5² = 25
// 新成本 = 4² = 16
// 新余额 = 87 - 16 = 71
```

**结果：**
- `newBalance = 71n`
- `currentVotesForOption = 9n`（5 + 4）

---

## 示例 9：密钥轮换场景

### 场景描述
用户 Frank 想要轮换公钥，但不进行投票（投票权重为 0）。

### 输入数据

```javascript
const stateLeaf = {
  pubKey: [111111111n, 222222222n],  // 旧公钥
  voiceCreditBalance: 100n,
  nonce: 3n,
  currentVotesForOption: 0n
};

const command = {
  stateIndex: 4n,
  newPubKey: [999999999n, 888888888n],  // 新公钥
  voteOptionIndex: 0n,
  newVoteWeight: 0n,                     // 不投票，只轮换密钥
  nonce: 4n,
  // ... 签名使用旧公钥验证
};
```

### 验证过程

- ✅ 所有验证通过
- ✅ 余额检查：`100 >= 0` ✓（投票权重为 0，不需要成本）

### 输出结果

```javascript
{
  newSlPubKey: [999999999n, 888888888n],  // 使用新公钥
  newSlNonce: 4n,
  isValid: 1n,
  newBalance: 100n                        // 余额不变（没有投票）
}
```

---

## 总结

这些示例展示了 `StateLeafTransformer` 电路在不同场景下的行为：

1. **有效命令**：正确更新状态，包括公钥、nonce 和余额
2. **无效命令**：保持原状态不变，确保系统安全性
3. **成本模式**：支持线性和二次成本计算
4. **累积投票**：支持多次投票的累积效果
5. **密钥轮换**：支持在不投票的情况下更新公钥

关键要点：
- 所有验证必须通过，命令才会被执行
- 使用 Mux1 确保原子性更新（要么全部更新，要么全部保持）
- Nonce 机制防止重放攻击
- 余额检查确保用户有足够的信用进行投票

