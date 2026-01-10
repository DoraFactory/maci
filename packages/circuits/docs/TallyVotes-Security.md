# TallyVotes 防作恶机制详解

## 核心问题

**如何保证 Operator 在生成 `newTallyCommitment` 时，不会对 `currentTallyCommitment` 作弊？**

例如，Operator 是否可以：
- ❌ 伪造上一批次的结果？
- ❌ 跳过某些批次？
- ❌ 修改历史累加值？

## 防作恶机制

### 机制 1: 链上存储 + 电路验证

#### 链上状态

```solidity
contract MACI {
    // 存储当前的统计承诺（公开）
    uint256 public tallyCommitment;
    
    // 当前批次编号
    uint256 public currentBatchNum;
    
    function tallyVotes(
        uint256 newTallyCommitment,
        uint256[8] calldata proof,
        uint256 inputHash
    ) external {
        // 1. 验证批次顺序
        require(extractBatchNum(inputHash) == currentBatchNum, "Wrong batch");
        
        // 2. 从 inputHash 中提取 currentTallyCommitment
        // inputHash = SHA256(packedVals, stateCommitment, currentTallyCommitment, newTallyCommitment)
        uint256 expectedInputHash = sha256(
            packedVals,
            stateCommitment,
            tallyCommitment,  // ← 使用链上存储的值
            newTallyCommitment
        );
        require(inputHash == expectedInputHash, "Invalid input hash");
        
        // 3. 验证零知识证明
        require(verifier.verifyProof(proof, [inputHash]), "Invalid proof");
        
        // 4. 更新链上状态
        tallyCommitment = newTallyCommitment;  // ← 存储新承诺
        currentBatchNum++;
        
        emit TallyBatchProcessed(currentBatchNum - 1, newTallyCommitment);
    }
}
```

#### 电路验证

```circom
// 在 ResultCommitmentVerifier 中（第 197-222 行）

// 1. Operator 提供私有输入
signal input currentResults[numVoteOptions];      // 例如: [50, 80, 120, 30, 20]
signal input currentResultsRootSalt;              // 例如: 0x7a8f...

// 2. 电路重新计算承诺
currentResultsRoot = QuinCheckRoot(currentResults)
calculatedCommitment = hash(currentResultsRoot, currentResultsRootSalt)

// 3. 关键约束：计算出的承诺必须等于公共输入
if (isFirstBatch) {
    require(currentTallyCommitment == 0)
} else {
    require(calculatedCommitment == currentTallyCommitment)  // ← 强制验证
}
```

### 机制 2: 承诺链（Commitment Chain）

#### 完整流程

```
┌─────────────────────────────────────────────────────────────┐
│                      批次 0（第一批）                         │
├─────────────────────────────────────────────────────────────┤
│ 链下（Operator）:                                            │
│   currentResults = [0, 0, 0, 0, 0]  (初始)                  │
│   currentTallyCommitment = 0        (初始)                  │
│   currentResultsRootSalt = 不需要    (第一批特殊处理)         │
│                                                              │
│   统计用户 0-24:                                             │
│   newResults = [50, 80, 120, 30, 20]                        │
│   newResultsRootSalt = random()  (例如: 0xabc...)           │
│   newTallyCommitment = hash(                                │
│     QuinRoot([50, 80, 120, 30, 20]),                        │
│     0xabc...                                                │
│   ) = 0x1234...                                             │
│                                                              │
│ 电路验证:                                                     │
│   ✓ isFirstBatch = 1                                        │
│   ✓ currentTallyCommitment = 0                              │
│   ✓ 计算 newTallyCommitment = 0x1234...                     │
│                                                              │
│ 链上:                                                        │
│   inputHash = SHA256(                                       │
│     packedVals(numSignUps=100, batchNum=0),                │
│     stateCommitment,                                        │
│     0,           // ← currentTallyCommitment                │
│     0x1234...    // ← newTallyCommitment                    │
│   )                                                          │
│   验证证明 ✓                                                 │
│   tallyCommitment = 0x1234... // ← 存储到链上               │
│   currentBatchNum = 1                                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      批次 1（第二批）                         │
├─────────────────────────────────────────────────────────────┤
│ 链下（Operator）:                                            │
│   // Operator 必须记住上一批次的值                           │
│   currentResults = [50, 80, 120, 30, 20]  // ← 从批次 0     │
│   currentResultsRootSalt = 0xabc...       // ← 从批次 0     │
│   currentTallyCommitment = 0x1234...      // ← 从链上读取   │
│                                                              │
│   统计用户 25-49:                                            │
│   newResults = [50+45, 80+60, 120+90, 30+25, 20+15]        │
│              = [95, 140, 210, 55, 35]                       │
│   newResultsRootSalt = random()  (例如: 0xdef...)           │
│   newTallyCommitment = hash(                                │
│     QuinRoot([95, 140, 210, 55, 35]),                       │
│     0xdef...                                                │
│   ) = 0x5678...                                             │
│                                                              │
│ 电路验证:                                                     │
│   ✓ isFirstBatch = 0                                        │
│   ✓ 重新计算 currentTallyCommitment:                        │
│       hash(QuinRoot([50, 80, 120, 30, 20]), 0xabc...)       │
│       = 0x1234... ✓✓✓ 必须匹配链上的值！                    │
│   ✓ 验证累加正确:                                            │
│       newResults[i] = currentResults[i] + votes[i]          │
│   ✓ 计算 newTallyCommitment = 0x5678...                     │
│                                                              │
│ 链上:                                                        │
│   inputHash = SHA256(                                       │
│     packedVals(numSignUps=100, batchNum=1),                │
│     stateCommitment,                                        │
│     0x1234...,   // ← currentTallyCommitment (从链上)       │
│     0x5678...    // ← newTallyCommitment                    │
│   )                                                          │
│   验证证明 ✓                                                 │
│   tallyCommitment = 0x5678... // ← 更新链上值               │
│   currentBatchNum = 2                                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
                         重复...
```

### 机制 3: 密码学约束

#### 为什么 Operator 无法作弊？

**场景 1: Operator 尝试伪造 currentResults**

```javascript
// 批次 1 的真实情况
真实的 currentResults = [50, 80, 120, 30, 20]
真实的 currentResultsRootSalt = 0xabc...
链上的 currentTallyCommitment = 0x1234...

// Operator 尝试作弊（例如，想降低某个选项的票数）
伪造的 currentResults = [40, 80, 120, 30, 20]  // ← 修改了选项 0

// 电路计算
calculatedCommitment = hash(
  QuinRoot([40, 80, 120, 30, 20]),
  0xabc...
) = 0x9999...  // ← 不同的哈希值！

// 验证失败！
require(calculatedCommitment == currentTallyCommitment)
0x9999... ≠ 0x1234...  ✗

// 证明生成失败，无法提交到链上
```

**场景 2: Operator 尝试使用错误的 salt**

```javascript
// Operator 尝试用不同的 salt
伪造的 currentResultsRootSalt = 0xbad...

calculatedCommitment = hash(
  QuinRoot([50, 80, 120, 30, 20]),
  0xbad...  // ← 错误的 salt
) = 0x7777...

require(0x7777... == 0x1234...)  ✗
// 验证失败！
```

**场景 3: Operator 尝试跳过批次**

```javascript
// Operator 尝试直接从批次 0 跳到批次 2

// 在批次 2 的证明中
链上 currentBatchNum = 1
Operator 提供 batchNum = 2

// 链上验证
require(batchNum == currentBatchNum)
require(2 == 1)  ✗
// 交易回滚！
```

### 机制 4: Salt 的作用

#### 为什么需要 Salt？

**问题**：如果没有 salt，commitment 就是 `hash(results)`

```javascript
// 没有 salt 的情况
commitment = hash(QuinRoot([50, 80, 120, 30, 20]))

// 攻击者可以暴力破解（如果结果范围小）
for option0 in 0..1000:
  for option1 in 0..1000:
    for option2 in 0..1000:
      // ...
      if hash(QuinRoot([option0, option1, ...])) == commitment:
        print("找到了结果！")
```

**解决**：加入随机 salt

```javascript
// 有 salt 的情况
commitment = hash(QuinRoot(results), randomSalt)

// 攻击者无法破解（需要知道 salt）
// salt 是一个 254 位的随机数，暴力破解不可行
```

#### Salt 的管理

```javascript
// Operator 必须保存每个批次的 salt
const tallyState = {
  batch0: {
    results: [50, 80, 120, 30, 20],
    salt: 0xabc...,
    commitment: 0x1234...
  },
  batch1: {
    results: [95, 140, 210, 55, 35],
    salt: 0xdef...,
    commitment: 0x5678...
  },
  // ...
};

// 在生成批次 N+1 的证明时，需要批次 N 的 salt
function generateBatchProof(batchNum) {
  if (batchNum === 0) {
    // 第一批，不需要 currentResultsRootSalt
    currentResults = [0, 0, 0, 0, 0];
    currentResultsRootSalt = 0n;
  } else {
    // 后续批次，使用上一批的数据
    const prevBatch = tallyState[`batch${batchNum - 1}`];
    currentResults = prevBatch.results;
    currentResultsRootSalt = prevBatch.salt;  // ← 必须正确
  }
  
  // ... 生成证明
}
```

## 完整的信任链

```
批次 0:
  链下生成: newCommitment0 = hash(results0, salt0)
  链上存储: tallyCommitment = newCommitment0
  
    ↓ (承诺链接)
    
批次 1:
  链上读取: currentCommitment = tallyCommitment (= newCommitment0)
  链下必须: 提供正确的 results0 和 salt0
  电路验证: hash(results0, salt0) == currentCommitment ✓
  链下生成: newCommitment1 = hash(results1, salt1)
  链上存储: tallyCommitment = newCommitment1
  
    ↓ (承诺链接)
    
批次 2:
  链上读取: currentCommitment = tallyCommitment (= newCommitment1)
  链下必须: 提供正确的 results1 和 salt1
  电路验证: hash(results1, salt1) == currentCommitment ✓
  链下生成: newCommitment2 = hash(results2, salt2)
  链上存储: tallyCommitment = newCommitment2
  
    ↓ (承诺链接)
    
... 以此类推
```

每一批都通过密码学承诺锁定了前一批的结果，形成不可篡改的链条！

## 攻击场景分析

### 攻击 1: 修改历史结果

```javascript
// 攻击目标：在批次 3 中修改批次 2 的结果

批次 2 已提交:
  results2 = [200, 180, 300, 75, 15]
  salt2 = 0xaaa...
  commitment2 = 0x1111... (已存储在链上)

批次 3 尝试:
  攻击者声称 currentResults = [150, 180, 300, 75, 15]  // ← 修改了
  攻击者必须提供 salt

// 电路计算
calculatedCommitment = hash(QuinRoot([150, ...]), salt)

// 问题：攻击者需要找到一个 salt 使得
hash(QuinRoot([150, ...]), salt) == 0x1111...

// 这需要破解哈希函数（Poseidon），在密码学上不可行！
```

**结论**：❌ 攻击失败

### 攻击 2: 伪造新结果

```javascript
// 攻击目标：在新结果中添加虚假票数

真实统计:
  newResults = [200, 180, 300, 75, 15]

攻击者声称:
  newResults = [200, 180, 500, 75, 15]  // ← 给选项 2 多加了 200 票

// 电路验证累加
for i in 0..numVoteOptions:
  require(newResults[i] == currentResults[i] + sum(votes[j][i]))

// 攻击者还需要伪造 votes 数据
// 但 votes 必须与状态树中的 voteOptionRoot 匹配
// 这需要修改状态树，但状态树根是公开的且已被 ProcessMessages 锁定

// 验证失败：
calculatedVoteRoot = QuinRoot(fake_votes)
calculatedVoteRoot ≠ stateLeaf.voteOptionRoot  ✗
```

**结论**：❌ 攻击失败（受 stateTree 保护）

### 攻击 3: 重放旧批次

```javascript
// 攻击目标：重复提交批次 2 的证明

批次 2 的证明:
  batchNum = 2
  currentTallyCommitment = commitment1
  newTallyCommitment = commitment2

// 当前链上状态
currentBatchNum = 3
tallyCommitment = commitment2

// 攻击者尝试重新提交批次 2
// 链上验证
require(batchNum == currentBatchNum)
require(2 == 3)  ✗
// 交易回滚
```

**结论**：❌ 攻击失败（批次顺序保护）

## 关键代码分析

### 电路侧（第 208-222 行）

```circom
// 检查是否是第一批
component iz = IsZero();
iz.in <== isFirstBatch;
// iz.out = 1 如果不是第一批
// iz.out = 0 如果是第一批

// 计算验证值
signal hz;
hz <== iz.out * currentTallyCommitmentHasher.hash;

// 关键约束
hz === currentTallyCommitment;
```

**逻辑**：
```
如果 isFirstBatch = 1 (第一批):
  iz.out = 0
  hz = 0 * hash = 0
  require(0 == currentTallyCommitment)
  → currentTallyCommitment 必须为 0 ✓

如果 isFirstBatch = 0 (非第一批):
  iz.out = 1
  hz = 1 * hash = hash
  require(hash == currentTallyCommitment)
  → 必须提供正确的 currentResults 和 salt ✓
```

### 合约侧

```solidity
function tallyVotes(
    uint256 newTallyCommitment,
    uint256[8] calldata proof,
    uint256 inputHash
) external {
    // 1. 重构 inputHash（使用链上的 tallyCommitment）
    uint256 calculatedInputHash = sha256(
        packedVals,
        stateCommitment,
        tallyCommitment,  // ← 链上存储的值，operator 无法修改
        newTallyCommitment
    );
    
    require(inputHash == calculatedInputHash, "Invalid input");
    
    // 2. 验证证明
    require(verifyProof(proof, [inputHash]), "Invalid proof");
    
    // 3. 更新状态（只有证明有效才能执行）
    tallyCommitment = newTallyCommitment;
    currentBatchNum++;
}
```

## 总结

### 三层防护

1. **链上防护**：
   - 存储 currentTallyCommitment（公开，不可篡改）
   - 强制批次顺序
   - inputHash 包含链上的 commitment

2. **电路防护**：
   - 强制验证 currentResults 和 salt
   - 密码学约束：必须找到 preimage
   - 累加验证：newResults 必须正确计算

3. **状态树防护**：
   - votes 必须匹配 stateLeaf.voteOptionRoot
   - stateRoot 由 ProcessMessages 锁定
   - 无法伪造用户投票

### 信任模型

**不需要信任 Operator，因为**：
- ✅ 无法修改历史结果（密码学保护）
- ✅ 无法跳过批次（链上顺序保护）
- ✅ 无法伪造投票（状态树保护）
- ✅ 无法修改累加逻辑（电路约束）

**唯一的要求**：
- Operator 必须保存每批的 salt（否则无法继续）
- 这不影响安全性，最多导致流程中断（可由其他 operator 接手）

### 最终保证

**数学保证**：
```
如果 Operator 能够作弊，则意味着：
  找到 (results', salt') 使得
  hash(QuinRoot(results'), salt') == hash(QuinRoot(results), salt)
  且 results' ≠ results

这需要破解 Poseidon 哈希函数的抗碰撞性，
在密码学上被认为是不可行的。
```

因此，TallyVotes 通过**链上存储 + 电路验证 + 密码学承诺**的组合，实现了完全防止 Operator 作弊的目标！

