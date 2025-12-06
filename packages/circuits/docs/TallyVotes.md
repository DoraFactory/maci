# TallyVotes 电路详细文档

## 目录

1. [概述](#概述)
2. [电路架构](#电路架构)
3. [核心模板详解](#核心模板详解)
4. [依赖组件功能说明](#依赖组件功能说明)
5. [完整流程分析](#完整流程分析)
6. [实际应用示例](#实际应用示例)
7. [安全特性分析](#安全特性分析)
8. [与 ProcessMessages 的关系](#与-processmessages-的关系)

---

## 概述

### 电路位置
```
packages/circuits/circom/maci/power/tallyVotes.circom
```

### 核心功能

`TallyVotes` 是 MACI 系统的**最终统计电路**，负责：

1. **批量读取用户投票** - 从状态树中读取每个用户的投票数据
2. **验证投票树根** - 确保投票数据来自有效的状态叶子
3. **累加投票结果** - 计算每个选项的总票数
4. **生成结果承诺** - 创建可验证的投票结果
5. **生成零知识证明** - 证明统计过程的正确性

### 设计理念

```
输入: 最终状态树 + 所有用户的投票数据
  ↓
处理: 批量验证、累加统计（零知识）
  ↓
输出: 投票结果 + 正确性证明
```

**关键特性**：
- ✅ **可验证性** - 任何人可以验证统计的正确性
- ✅ **批量处理** - 分批统计，适应大规模投票
- ✅ **增量计算** - 支持多批次累加结果
- ✅ **防篡改** - 通过承诺保证结果完整性

### ProcessMessages vs TallyVotes

```
投票流程完整链条:

1. SignUp
   用户注册 → 添加到状态树
   
2. PublishMessage  
   用户发送加密投票 → 存储在链上
   
3. ProcessMessages ← 你已理解
   Operator 解密并处理消息 → 更新状态树
   每个用户的 stateLeaf 包含其投票选项树根 (voteOptionRoot)
   
4. TallyVotes ← 本文档
   Operator 读取所有用户的投票 → 统计最终结果
   输出每个选项的总票数
```

---

## 电路架构

### 三个核心模板

```
TallyVotes (主电路)
    │
    ├─> ResultCommitmentVerifier (结果承诺验证)
    │       │
    │       ├─> QuinCheckRoot (计算投票结果树根)
    │       └─> HashLeftRight (计算承诺)
    │
    └─> TallyVotesInputHasher (公共输入打包)
```

### 参数配置

```
2-1-1-5
4-2-2-25
state tree - int state - vote option - batch size 
```



```circom
template TallyVotes(
    stateTreeDepth,        // 状态树深度 (例如: 4)
    intStateTreeDepth,     // 中间树深度 (例如: 2) 
    voteOptionTreeDepth    // 投票选项树深度 (例如: 2)
)
```

**参数约束**：
```circom
assert(voteOptionTreeDepth > 0);
assert(intStateTreeDepth > 0);
assert(intStateTreeDepth < stateTreeDepth);
```

**批次大小计算**：
```javascript
batchSize = 5^intStateTreeDepth
numVoteOptions = 5^voteOptionTreeDepth

// 例如:
intStateTreeDepth = 2 → batchSize = 25 (一次处理 25 个用户)
voteOptionTreeDepth = 2 → numVoteOptions = 25 (最多 25 个选项)
```

**实际配置示例**：
```javascript
// 小型投票
stateTreeDepth: 4          // 最多 625 个用户
intStateTreeDepth: 2       // 每批处理 25 个用户 (需要 625/25 = 25 批)
voteOptionTreeDepth: 2     // 最多 25 个选项

// 大型投票
stateTreeDepth: 6          // 最多 15,625 个用户
intStateTreeDepth: 3       // 每批处理 125 个用户
voteOptionTreeDepth: 2     // 最多 25 个选项
```

---

## 核心模板详解

### 模板 1: TallyVotes (主电路)

**职责**：批量读取用户投票并累加到结果中

#### 输入信号分类

##### 1. 公共输入（Public Inputs）

```circom
signal input inputHash;              // SHA256 哈希（唯一的公共输入）
signal input packedVals;             // 打包的系统参数
signal input stateCommitment;        // 状态承诺
signal input currentTallyCommitment; // 当前统计承诺
signal input newTallyCommitment;     // 新统计承诺
```

**`inputHash` 的计算**：
```javascript
inputHash = SHA256(
  packedVals,              // 打包参数 (batchNum, numSignUps)
  stateCommitment,         // 状态树承诺
  currentTallyCommitment,  // 当前结果承诺
  newTallyCommitment       // 新结果承诺
)
```

##### 2. 状态树相关

```circom
signal input stateRoot;              // 最终状态根（不会改变）
signal input stateSalt;              // 状态盐值
```

**重要**：与 ProcessMessages 不同，TallyVotes 的 stateRoot 在整个统计期间保持不变！

##### 3. 批次数据

```circom
signal input stateLeaf[batchSize][STATE_LEAF_LENGTH];  // 用户状态叶子
signal input statePathElements[k][TREE_ARITY - 1];    // 批次的 Merkle 路径
signal input votes[batchSize][numVoteOptions];         // 每个用户的投票数据
```

**状态叶子结构**（复习）：
```javascript
StateLeaf = [
  pubKey_x,           // [0] 用户公钥 X 坐标
  pubKey_y,           // [1] 用户公钥 Y 坐标
  voiceCreditBalance, // [2] 剩余投票积分
  voteOptionRoot,     // [3] 该用户的投票选项树根 ← 关键！
  nonce               // [4] nonce
]
```

**投票数据结构**：
```javascript
votes[i] = [
  weight_for_option_0,   // 用户 i 给选项 0 的票数
  weight_for_option_1,   // 用户 i 给选项 1 的票数
  weight_for_option_2,   // 用户 i 给选项 2 的票数
  // ... 共 numVoteOptions 个
]

// 例如: 用户 Alice 的投票
votes[3] = [0, 0, 25, 0, 0]  // 给选项 2 投了 25 票
```

##### 4. 结果相关

```circom
signal input currentResults[numVoteOptions];   // 当前累加结果
signal input currentResultsRootSalt;           // 当前结果盐值
signal input newResultsRootSalt;               // 新结果盐值
```

#### 主要处理步骤

##### 步骤 1: 验证状态承诺（第 63-67 行）

```circom
component stateCommitmentHasher = HashLeftRight();
stateCommitmentHasher.left <== stateRoot;
stateCommitmentHasher.right <== stateSalt;
stateCommitmentHasher.hash === stateCommitment;
```

**作用**：确保使用的是正确的最终状态树。

##### 步骤 2: 验证输入哈希（第 70-76 行）

```circom
component inputHasher = TallyVotesInputHasher();
inputHasher.stateCommitment <== stateCommitment;
inputHasher.currentTallyCommitment <== currentTallyCommitment;
inputHasher.newTallyCommitment <== newTallyCommitment;
inputHasher.packedVals <== packedVals;
inputHasher.hash === inputHash;
```

**解包参数**：
```javascript
packedVals 包含:
  - numSignUps: 总用户数
  - batchNum: 当前批次编号（0, 1, 2, ...）
```

##### 步骤 3: 验证批次参数（第 78-90 行）

```circom
numSignUps <== inputHasher.numSignUps;
batchStartIndex <== inputHasher.batchNum * batchSize;

// 验证 batchStartIndex <= numSignUps
component validNumSignups = LessEqThan(32);
validNumSignups.in[0] <== batchStartIndex;
validNumSignups.in[1] <== numSignUps;
validNumSignups.out === 1;
```

**批次索引示例**：
```javascript
// 假设 batchSize = 25, numSignUps = 100

batchNum = 0: batchStartIndex = 0   (处理用户 0-24)
batchNum = 1: batchStartIndex = 25  (处理用户 25-49)
batchNum = 2: batchStartIndex = 50  (处理用户 50-74)
batchNum = 3: batchStartIndex = 75  (处理用户 75-99)
batchNum = 4: batchStartIndex = 100 (结束)
```

##### 步骤 4: 验证批次状态叶子（第 93-116 行）

```circom
// 1. 哈希每个状态叶子
component stateLeafHasher[batchSize];
for (var i = 0; i < batchSize; i++) {
    stateLeafHasher[i] = Hasher5();
    for (var j = 0; j < STATE_LEAF_LENGTH; j++) {
        stateLeafHasher[i].in[j] <== stateLeaf[i][j];
    }
    stateSubroot.leaves[i] <== stateLeafHasher[i].hash;
}

// 2. 计算批次子树根
component stateSubroot = QuinCheckRoot(intStateTreeDepth);
// stateSubroot.root = 这批 25 个用户的子树根

// 3. 验证子树根在状态树中
component stateQle = QuinLeafExists(k);
stateQle.leaf <== stateSubroot.root;
stateQle.root <== stateRoot;
// 使用 statePathElements 验证
```

**树结构示例** (stateTreeDepth=4, intStateTreeDepth=2):

```
              StateRoot (Level 4)
             /    |    |    \    \
           /      |    |      \      \
    SubRoot0 SubRoot1 ... SubRoot24  (Level 2) ← 每个是 25 个用户
       / | \ | \                     
      /  |  \|  \
    U0 U1...U24 U25...              (Level 0) ← 625 个用户

第一批: 验证 SubRoot0 在 StateRoot 中
第二批: 验证 SubRoot1 在 StateRoot 中
...
```

##### 步骤 5: 验证投票选项树根（第 119-142 行）

```circom
// 计算零投票树根（全为 0 的树）
component calculateVOTreeZeroRoot = ZeroRoot(voteOptionTreeDepth);
signal voTreeZeroRoot;
voTreeZeroRoot <== calculateVOTreeZeroRoot.out;

// 为每个用户验证投票树
component voteTree[batchSize];
for (var i = 0; i < batchSize; i++) {
    // 1. 用投票数据重建树根
    voteTree[i] = QuinCheckRoot(voteOptionTreeDepth);
    for (var j = 0; j < numVoteOptions; j++) {
        voteTree[i].leaves[j] <== votes[i][j];
    }
    
    // 2. 处理从未投票的用户（voRoot = 0）
    component slvoRootIsZero = IsZero();
    slvoRootIsZero.in <== stateLeaf[i][STATE_LEAF_VO_ROOT_IDX];
    
    component voRootMux = Mux1();
    voRootMux.s <== slvoRootIsZero.out;
    voRootMux.c[0] <== stateLeaf[i][STATE_LEAF_VO_ROOT_IDX];  // 正常用户
    voRootMux.c[1] <== voTreeZeroRoot;                        // 未投票用户
    
    // 3. 验证根匹配
    voteTree[i].root === voRootMux.out;
}
```

**投票树验证示例**：
```javascript
// 用户 Alice (index=3) 的状态叶子
stateLeaf[3] = [
  pubKey_x,
  pubKey_y,
  631,              // 剩余积分
  0x7a8f...,        // voteOptionRoot ← 这是投票树的根
  5                 // nonce
]

// Operator 提供的投票数据
votes[3] = [0, 0, 25, 0, 0]  // 给选项 2 投了 25 票

// 电路验证:
calculatedRoot = QuinCheckRoot([0, 0, 25, 0, 0])
require(calculatedRoot === 0x7a8f...)  ✓

// 如果数据不匹配，证明生成失败！
```

##### 步骤 6: 累加新结果（第 144-160 行）

```circom
component isFirstBatch = IsZero();
isFirstBatch.in <== batchStartIndex;

component iz = IsZero();
iz.in <== isFirstBatch.out;
// iz.out = 1 如果不是第一批（需要累加）
// iz.out = 0 如果是第一批（从零开始）

var MAX_VOTES = 10 ** 24;
component newResults[numVoteOptions];
for (var i = 0; i < numVoteOptions; i++) {
    newResults[i] = CalculateTotal(batchSize + 1);
    
    // 累加当前结果（如果不是第一批）
    newResults[i].nums[batchSize] <== currentResults[i] * iz.out;
    
    // 累加这批用户的投票
    for (var j = 0; j < batchSize; j++) {
        newResults[i].nums[j] <== votes[j][i] * (votes[j][i] + MAX_VOTES);
    }
}
```

**累加逻辑详解**：

让我们用实际数据来说明累加过程：

```javascript
// 配置
MAX_VOTES = 10^24
batchSize = 5 (假设 intStateTreeDepth=1)

// === 第一批 (batchNum=0, isFirstBatch=1, iz.out=0) ===
currentResults[2] = 0

// 用户投票情况
votes[0][2] = 0    // 用户 0 给选项 2: 0 票
votes[1][2] = 3    // 用户 1 给选项 2: 3 票
votes[2][2] = 0    // 用户 2 给选项 2: 0 票
votes[3][2] = 5    // 用户 3 给选项 2: 5 票
votes[4][2] = 0    // 用户 4 给选项 2: 0 票

// 电路计算
nums[0] = 0 * (0 + 10^24) = 0
// v * (v + MAX_VOTES)
nums[1] = 3 * (3 + 10^24) = 3 * 10^24 + 9
nums[2] = 0 * (0 + 10^24) = 0
nums[3] = 5 * (5 + 10^24) = 5 * 10^24 + 25
nums[4] = 0 * (0 + 10^24) = 0
nums[5] = currentResults[2] * iz.out = 0 * 0 = 0

newResults[2].sum = 0 + (3*10^24 + 9) + 0 + (5*10^24 + 25) + 0 + 0
                  = 8 * 10^24 + 34

// === 第二批 (batchNum=1, isFirstBatch=0, iz.out=1) ===
currentResults[2] = 8 * 10^24 + 34  // 上一批的结果

// 新用户投票
votes[0][2] = 2    // 用户 5 给选项 2: 2 票
votes[1][2] = 0    // 用户 6 给选项 2: 0 票
votes[2][2] = 4    // 用户 7 给选项 2: 4 票
votes[3][2] = 0
votes[4][2] = 0

// 电路计算
nums[0] = 2 * (2 + 10^24) = 2 * 10^24 + 4
nums[1] = 0
nums[2] = 4 * (4 + 10^24) = 4 * 10^24 + 16
nums[3] = 0
nums[4] = 0
nums[5] = currentResults[2] * iz.out = (8*10^24 + 34) * 1 = 8*10^24 + 34

newResults[2].sum = (2*10^24 + 4) + 0 + (4*10^24 + 16) + 0 + 0 + (8*10^24 + 34)
                  = 14 * 10^24 + 54

// 实际票数: 3 + 5 + 2 + 4 = 14 票 ✓
```

**为什么用 `votes[j][i] * (votes[j][i] + MAX_VOTES)` 公式？**

这个公式 `v * (v + MAX_VOTES) = v² + v * MAX_VOTES` 同时编码了两个信息：

```javascript
MAX_VOTES = 10^24

// 1. 零值处理
如果 votes[j][i] = 0:
  result = 0 * (0 + 10^24) = 0 ✓

// 2. 编码投票数据
如果 votes[j][i] = 3:
  result = 3 * (3 + 10^24) 
         = 3² + 3 * 10^24
         = 9 + 3 * 10^24
  
如果 votes[j][i] = 25:
  result = 25 * (25 + 10^24) 
         = 625 + 25 * 10^24

// 公式的作用:
// - 主信息: v * MAX_VOTES (票数的大数编码)
// - 附加信息: v² (二次方值，用于支持 Quadratic Voting)
// - 这两部分在有限域中都被保留，不会丢失精度

// 注意：结果不是"约等于"，而是精确的 v² + v*MAX_VOTES
```

**链下解码方法**：

```javascript
// 从编码值恢复实际票数
function decodeVotes(encodedSum) {
  // encodedSum = ∑(v² + v * MAX_VOTES)
  //            = ∑v² + MAX_VOTES * ∑v
  
  // 解二次方程: v² + MAX_VOTES * v - encodedSum = 0
  // v = (-MAX_VOTES + √(MAX_VOTES² + 4*encodedSum)) / 2
  
  // 简化方法（因为 v² << v * MAX_VOTES）:
  const actualVotes = encodedSum / MAX_VOTES;
  const squaresSum = encodedSum % MAX_VOTES;
  
  return { votes: actualVotes, squaresSum: squaresSum };
}

// 示例
const encoded = 14n * 10n**24n + 54n;
const decoded = decodeVotes(encoded);
// decoded.votes = 14 (总票数)
// decoded.squaresSum = 54 (3² + 5² + 2² + 4² = 9 + 25 + 4 + 16)
```

##### 步骤 7: 验证结果承诺（第 162-174 行）

```circom
component rcv = ResultCommitmentVerifier(voteOptionTreeDepth);
rcv.isFirstBatch <== isFirstBatch.out;
rcv.currentTallyCommitment <== currentTallyCommitment;
rcv.newTallyCommitment <== newTallyCommitment;

rcv.currentResultsRootSalt <== currentResultsRootSalt;
rcv.newResultsRootSalt <== newResultsRootSalt;

for (var i = 0; i < numVoteOptions; i++) {
    rcv.currentResults[i] <== currentResults[i];
    rcv.newResults[i] <== newResults[i].sum;
}
```

---

### 模板 2: ResultCommitmentVerifier (结果承诺验证)

**职责**：验证当前结果承诺，计算新结果承诺

```circom
template ResultCommitmentVerifier(voteOptionTreeDepth) {
    signal input isFirstBatch;
    signal input currentTallyCommitment;
    signal input newTallyCommitment;
    
    signal input currentResults[numVoteOptions];
    signal input currentResultsRootSalt;
    
    signal input newResults[numVoteOptions];
    signal input newResultsRootSalt;
```

#### 步骤 1: 计算当前结果承诺（第 198-206 行）

```circom
// 1. 计算当前结果的树根
component currentResultsRoot = QuinCheckRoot(voteOptionTreeDepth);
for (var i = 0; i < numVoteOptions; i++) {
    currentResultsRoot.leaves[i] <== currentResults[i];
}

// 2. 加盐哈希
component currentTallyCommitmentHasher = HashLeftRight();
currentTallyCommitmentHasher.left <== currentResultsRoot.root;
currentTallyCommitmentHasher.right <== currentResultsRootSalt;
```

#### 步骤 2: 条件验证（第 208-222 行）

```circom
component iz = IsZero();
iz.in <== isFirstBatch;
// iz.out = 1 如果不是第一批
// iz.out = 0 如果是第一批

signal hz;
hz <== iz.out * currentTallyCommitmentHasher.hash;

hz === currentTallyCommitment;
```

**验证逻辑**：
```javascript
// 第一批 (isFirstBatch=1, iz.out=0)
hz = 0 * currentTallyCommitmentHasher.hash = 0
currentTallyCommitment 应该为 0 ✓

// 后续批次 (isFirstBatch=0, iz.out=1)
hz = 1 * currentTallyCommitmentHasher.hash = 哈希值
currentTallyCommitment 必须等于这个哈希值 ✓
```

#### 步骤 3: 计算新结果承诺（第 224-235 行）

```circom
// 1. 计算新结果的树根
component newResultsRoot = QuinCheckRoot(voteOptionTreeDepth);
for (var i = 0; i < numVoteOptions; i++) {
    newResultsRoot.leaves[i] <== newResults[i];
}

// 2. 加盐哈希
component newTallyCommitmentHasher = HashLeftRight();
newTallyCommitmentHasher.left <== newResultsRoot.root;
newTallyCommitmentHasher.right <== newResultsRootSalt;

newTallyCommitmentHasher.hash === newTallyCommitment;
```

---

### 模板 3: TallyVotesInputHasher

**职责**：打包公共输入

```circom
template TallyVotesInputHasher() {
    signal input stateCommitment;
    signal input currentTallyCommitment;
    signal input newTallyCommitment;
    signal input packedVals;
    
    signal output numSignUps;
    signal output batchNum;
    signal output hash;
```

#### 解包参数（第 248-251 行）

```circom
component unpack = UnpackElement(2);
unpack.in <== packedVals;
batchNum <== unpack.out[1];
numSignUps <== unpack.out[0];
```

**打包格式**：
```javascript
packedVals = numSignUps + (batchNum << 32)

// 示例
numSignUps = 100
batchNum = 3
packedVals = 100 + (3 << 32) = 100 + 12884901888 = 12884901988
```

#### SHA256 哈希（第 253-259 行）

```circom
component hasher = Sha256Hasher4();
hasher.in[0] <== packedVals;
hasher.in[1] <== stateCommitment;
hasher.in[2] <== currentTallyCommitment;
hasher.in[3] <== newTallyCommitment;

hash <== hasher.hash;
```

---

## 依赖组件功能说明

### 1. QuinCheckRoot

**文件**: `utils/trees/calculateTotal.circom`

**功能**: 从叶子节点计算五叉树的根

```circom
template QuinCheckRoot(levels) {
    signal input leaves[5^levels];
    signal output root;
    
    // 自底向上构建树
    // Level 0: 叶子节点
    // Level 1: 每 5 个叶子哈希成一个父节点
    // ...
    // Level n: 根节点
}
```

**示例** (depth=1, 5 个选项):
```javascript
leaves = [10, 25, 30, 5, 0]  // 5 个选项的票数

root = Poseidon5([10, 25, 30, 5, 0])
```

### 2. QuinLeafExists

**文件**: `utils/trees/incrementalQuinTree.circom`

**功能**: 验证叶子存在于五叉树中（给定路径）

```circom
template QuinLeafExists(levels) {
    signal input leaf;
    signal input root;
    signal input path_index[levels];
    signal input path_elements[levels][TREE_ARITY - 1];
    
    // 验证从叶子到根的路径
}
```

### 3. CalculateTotal

**文件**: `utils/trees/calculateTotal.circom`

**功能**: 计算数组的总和

```circom
template CalculateTotal(n) {
    signal input nums[n];
    signal output sum;
    
    sum = nums[0] + nums[1] + ... + nums[n-1];
}
```

### 4. ZeroRoot

**文件**: `utils/trees/zeroRoot.circom`

**功能**: 计算全零树的根（预计算优化）

```circom
template ZeroRoot(levels) {
    signal output out;
    
    // 计算 QuinCheckRoot([0, 0, 0, 0, 0, ...])
}
```

**用途**：处理从未投票的用户（他们的 voteOptionRoot = 0）

---

## 完整流程分析

### 流程图

```
┌─────────────────────────────────────────────────────────────┐
│              Step 0: 准备阶段（ProcessMessages 已完成）       │
│  - 所有消息已处理                                             │
│  - 状态树已最终确定                                           │
│  - 每个用户的投票存储在其 voteOptionRoot 中                   │
└───────────────────────────┬─────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│           Step 1: Coordinator 准备第一批数据                  │
│  batchNum = 0, batchSize = 25                               │
│                                                              │
│  for i in 0..24:                                            │
│    stateLeaf[i] = stateTree.getLeaf(i)                      │
│    voteTree = reconstructTree(stateLeaf[i].voteOptionRoot)  │
│    votes[i] = voteTree.getAllLeaves()                       │
│                                                              │
│  statePathElements = getSubrootPath(batchNum=0)             │
└───────────────────────────┬─────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Step 2: 生成第一批证明                           │
│  输入:                                                        │
│    - stateRoot (不变)                                        │
│    - stateLeaf[0..24]                                       │
│    - votes[0..24]                                           │
│    - currentResults = [0, 0, ..., 0]  (第一批)              │
│    - currentTallyCommitment = 0                             │
│                                                              │
│  电路验证:                                                    │
│    ✓ 验证状态承诺                                             │
│    ✓ 验证批次在范围内                                         │
│    ✓ 验证状态叶子存在                                         │
│    ✓ 验证每个用户的投票树根                                   │
│                                                              │
│  累加结果:                                                    │
│    for option in 0..numVoteOptions:                         │
│      newResults[option] = sum(votes[i][option] for i in 0..24) │
│                                                              │
│  例如:                                                        │
│    newResults = [120, 85, 190, 45, 10]                      │
│                                                              │
│  生成承诺:                                                    │
│    newTallyCommitment = hash(                               │
│      QuinRoot(newResults),                                  │
│      newResultsRootSalt                                     │
│    )                                                         │
└───────────────────────────┬─────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│           Step 3: 提交第一批证明到链上                        │
│  contract.tallyVotes(                                       │
│    newTallyCommitment,                                      │
│    proof,                                                   │
│    inputHash                                                │
│  )                                                           │
│                                                              │
│  链上验证通过后:                                              │
│    currentTallyCommitment = newTallyCommitment              │
└───────────────────────────┬─────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│        Step 4: Coordinator 准备第二批数据                     │
│  batchNum = 1, batchSize = 25                               │
│                                                              │
│  for i in 25..49:                                           │
│    stateLeaf[i-25] = stateTree.getLeaf(i)                   │
│    votes[i-25] = getVotes(stateLeaf[i-25])                  │
│                                                              │
│  currentResults = [120, 85, 190, 45, 10]  (从第一批)         │
└───────────────────────────┬─────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│             Step 5: 生成第二批证明                            │
│  输入:                                                        │
│    - currentResults = [120, 85, 190, 45, 10]                │
│    - currentTallyCommitment (从第一批)                       │
│    - votes[25..49]                                          │
│                                                              │
│  累加结果:                                                    │
│    newResults[option] = currentResults[option] +            │
│                         sum(votes[i][option] for i in 25..49)│
│                                                              │
│  例如:                                                        │
│    newResults = [120+80, 85+95, 190+110, 45+30, 10+5]       │
│               = [200, 180, 300, 75, 15]                     │
└───────────────────────────┬─────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Step 6: 重复直到所有批次完成                      │
│  批次 3, 4, 5, ... 直到处理所有用户                           │
└───────────────────────────┬─────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                Step 7: 最终结果公开                           │
│  最后一批的 newTallyCommitment 包含最终结果                   │
│                                                              │
│  Coordinator 可以公开:                                       │
│    finalResults = [500, 380, 720, 180, 90]                  │
│    newResultsRootSalt                                       │
│                                                              │
│  任何人可以验证:                                              │
│    commitment === hash(QuinRoot(finalResults), salt) ✓      │
└─────────────────────────────────────────────────────────────┘
```

### 详细步骤说明

#### 阶段 1: 链下准备（Coordinator）

```javascript
// 1. 获取最终状态树
const finalStateRoot = await maciContract.getStateRoot();
const stateTree = reconstructStateTree(finalStateRoot);

// 2. 确定批次数量
const numSignUps = await maciContract.numSignUps();
const batchSize = 5 ** intStateTreeDepth;  // 例如 25
const numBatches = Math.ceil(numSignUps / batchSize);

console.log(`Total users: ${numSignUps}`);
console.log(`Batch size: ${batchSize}`);
console.log(`Number of batches: ${numBatches}`);

// 3. 准备第一批 (batchNum=0)
const batch0Inputs = prepareBatch({
  batchNum: 0,
  batchSize: 25,
  stateTree: stateTree,
  currentResults: [0, 0, 0, 0, 0],  // 全零开始
  currentTallyCommitment: 0n
});

function prepareBatch(params) {
  const { batchNum, batchSize, stateTree, currentResults, currentTallyCommitment } = params;
  
  const startIndex = batchNum * batchSize;
  const stateLeaves = [];
  const votes = [];
  
  // 读取每个用户的状态和投票
  for (let i = 0; i < batchSize; i++) {
    const userIndex = startIndex + i;
    
    if (userIndex < stateTree.numLeaves) {
      // 真实用户
      const leaf = stateTree.getLeaf(userIndex);
      stateLeaves.push(leaf);
      
      // 从 voteOptionRoot 重建投票树
      const voteTree = reconstructVoteTree(leaf.voteOptionRoot);
      const userVotes = voteTree.getAllLeaves();
      votes.push(userVotes);
    } else {
      // 填充虚拟用户（如果批次不满）
      stateLeaves.push(emptyStateLeaf);
      votes.push([0, 0, 0, 0, 0]);
    }
  }
  
  // 获取批次的 Merkle 路径
  const k = stateTreeDepth - intStateTreeDepth;
  const statePathElements = getSubrootPath(stateTree, batchNum, k);
  
  // 计算新结果（使用编码公式）
  const MAX_VOTES = 10n ** 24n;
  const newResults = [...currentResults];
  
  for (let i = 0; i < votes.length; i++) {
    for (let j = 0; j < votes[i].length; j++) {
      const v = votes[i][j];
      // 使用电路中相同的编码公式: v * (v + MAX_VOTES)
      const encoded = v * (v + MAX_VOTES);
      newResults[j] += encoded;
    }
  }
  
  // 注意：newResults 现在包含编码后的值
  // 例如: 如果实际投票是 [3, 5, 2]
  // 编码后: [3*10^24 + 9, 5*10^24 + 25, 2*10^24 + 4]
  
  // 生成新的盐值和承诺
  const newResultsRootSalt = randomBigInt();
  const newResultsRoot = quinCheckRoot(newResults);
  const newTallyCommitment = poseidon([newResultsRoot, newResultsRootSalt]);
  
  return {
    // 状态数据
    stateRoot: stateTree.root,
    stateSalt: stateSalt,
    stateLeaf: stateLeaves,
    statePathElements: statePathElements,
    
    // 投票数据
    votes: votes,
    
    // 结果数据
    currentResults: currentResults,
    currentResultsRootSalt: currentResultsRootSalt,
    currentTallyCommitment: currentTallyCommitment,
    
    newResults: newResults,
    newResultsRootSalt: newResultsRootSalt,
    newTallyCommitment: newTallyCommitment,
    
    // 公共参数
    packedVals: packVals(numSignUps, batchNum),
    stateCommitment: poseidon([stateTree.root, stateSalt])
  };
}
```

#### 阶段 2: 生成证明

```javascript
// 为每一批生成证明
for (let batchNum = 0; batchNum < numBatches; batchNum++) {
  console.log(`Processing batch ${batchNum}/${numBatches}`);
  
  // 准备输入
  const inputs = prepareBatch({
    batchNum: batchNum,
    batchSize: batchSize,
    stateTree: stateTree,
    currentResults: batchNum === 0 ? [0, 0, 0, 0, 0] : previousResults,
    currentTallyCommitment: batchNum === 0 ? 0n : previousCommitment
  });
  
  // 生成证明（耗时）
  const { proof, publicSignals } = await groth16.fullProve(
    inputs,
    "tallyVotes.wasm",
    "tallyVotes.zkey"
  );
  
  console.log(`Proof generated for batch ${batchNum}`);
  console.log(`New results:`, inputs.newResults);
  
  // 提交到链上
  const tx = await maciContract.tallyVotes(
    inputs.newTallyCommitment,
    proof,
    publicSignals[0]  // inputHash
  );
  
  await tx.wait();
  console.log(`Batch ${batchNum} submitted`);
  
  // 更新状态供下一批使用
  previousResults = inputs.newResults;
  previousCommitment = inputs.newTallyCommitment;
  previousResultsRootSalt = inputs.newResultsRootSalt;
}

console.log("Tally complete!");
console.log("Final results:", previousResults);
```

---

## 实际应用示例

### 示例 1: 小型投票完整流程

**背景**：
- 5 个用户
- 3 个选项
- 配置: stateTreeDepth=2, intStateTreeDepth=1, voteOptionTreeDepth=1
- batchSize = 5^1 = 5 (一批处理完)

#### 用户投票情况

```javascript
// ProcessMessages 完成后的状态
users = [
  {
    index: 0,
    pubKey: [pk0_x, pk0_y],
    balance: 900,
    voteOptionRoot: 0xabc...,  // 对应投票 [10, 0, 0]
    nonce: 1
  },
  {
    index: 1,
    pubKey: [pk1_x, pk1_y],
    balance: 375,
    voteOptionRoot: 0xdef...,  // 对应投票 [0, 25, 0]
    nonce: 1
  },
  {
    index: 2,
    pubKey: [pk2_x, pk2_y],
    balance: 100,
    voteOptionRoot: 0x0,       // 未投票 [0, 0, 0]
    nonce: 0
  },
  {
    index: 3,
    pubKey: [pk3_x, pk3_y],
    balance: 640,
    voteOptionRoot: 0x123...,  // 对应投票 [0, 0, 30]
    nonce: 1
  },
  {
    index: 4,
    pubKey: [pk4_x, pk4_y],
    balance: 780,
    voteOptionRoot: 0x456...,  // 对应投票 [20, 0, 0]
    nonce: 1
  }
];
```

#### Coordinator 统计过程

```javascript
// 1. 准备数据
const stateLeaves = [
  [pk0_x, pk0_y, 900, 0xabc, 1],
  [pk1_x, pk1_y, 375, 0xdef, 1],
  [pk2_x, pk2_y, 100, 0x0, 0],
  [pk3_x, pk3_y, 640, 0x123, 1],
  [pk4_x, pk4_y, 780, 0x456, 1]
];

// 2. 重建每个用户的投票
const votes = [
  [10, 0, 0],   // 用户 0
  [0, 25, 0],   // 用户 1
  [0, 0, 0],    // 用户 2 (未投票)
  [0, 0, 30],   // 用户 3
  [20, 0, 0]    // 用户 4
];

// 3. 验证投票树根
for (let i = 0; i < 5; i++) {
  const calculatedRoot = quinCheckRoot(votes[i]);
  
  if (stateLeaves[i][3] === 0n) {
    // 未投票用户
    const zeroRoot = calculateZeroRoot(voteOptionTreeDepth);
    assert(calculatedRoot === zeroRoot, `User ${i} vote tree mismatch`);
  } else {
    // 已投票用户
    assert(calculatedRoot === stateLeaves[i][3], `User ${i} vote tree mismatch`);
  }
}
console.log("All vote trees verified ✓");

// 4. 链下理解：计算实际票数（未编码）
const actualVotes = [0, 0, 0];
for (let i = 0; i < 5; i++) {
  for (let j = 0; j < 3; j++) {
    actualVotes[j] += votes[i][j];
  }
}
console.log("Actual votes:", actualVotes);
// Output: Actual votes: [30, 25, 30]

// 5. 电路输入：计算编码后的结果
const MAX_VOTES = 10n ** 24n;
const encodedResults = [0n, 0n, 0n];
for (let i = 0; i < 5; i++) {
  for (let j = 0; j < 3; j++) {
    const v = votes[i][j];
    encodedResults[j] += v * (v + MAX_VOTES);
  }
}
console.log("Encoded results for circuit:", encodedResults);
// Output: [30*10^24 + 500, 25*10^24 + 625, 30*10^24 + 900]

// 6. 生成证明
const circuitInputs = {
  // 状态
  stateRoot: stateTree.root,
  stateSalt: salt,
  stateLeaf: stateLeaves,
  statePathElements: [[/* 4 siblings */]],  // depth=1, 需要 1 层
  
  // 投票
  votes: votes,
  
  // 结果 (第一批，从零开始)
  currentResults: [0n, 0n, 0n],
  currentResultsRootSalt: 0n,
  currentTallyCommitment: 0n,
  
  // 编码后的新结果
  newResults: encodedResults,  // [30*10^24 + 500, 25*10^24 + 625, 30*10^24 + 900]
  newResultsRootSalt: randomBigInt(),
  
  // 计算新承诺（使用编码后的结果）
  newTallyCommitment: poseidon([
    quinCheckRoot(encodedResults),
    newResultsRootSalt
  ]),
  
  // 公共参数
  packedVals: packVals(5, 0),  // 5 个用户, 批次 0
  stateCommitment: poseidon([stateTree.root, salt]),
  
  inputHash: sha256([
    packedVals,
    stateCommitment,
    0n,  // currentTallyCommitment
    newTallyCommitment
  ])
};

const { proof, publicSignals } = await groth16.fullProve(
  circuitInputs,
  "tallyVotes.wasm",
  "tallyVotes.zkey"
);

// 6. 提交链上
await maciContract.tallyVotes(
  circuitInputs.newTallyCommitment,
  proof,
  circuitInputs.inputHash
);

console.log("Tally complete! ✓");
```

#### 电路内部处理

```circom
// 批次 0 处理

// Step 1: 验证状态承诺
stateCommitment = hash(stateRoot, stateSalt) ✓

// Step 2: 验证 inputHash
inputHash = SHA256([
  packedVals,
  stateCommitment,
  0,  // currentTallyCommitment (第一批)
  newTallyCommitment
]) ✓

// Step 3: 验证批次参数
batchStartIndex = 0 * 5 = 0
0 <= 5 (numSignUps) ✓

// Step 4: 验证状态叶子
stateSubroot = QuinCheckRoot([
  hash(stateLeaf[0]),
  hash(stateLeaf[1]),
  hash(stateLeaf[2]),
  hash(stateLeaf[3]),
  hash(stateLeaf[4])
])
QuinLeafExists(stateSubroot, statePathElements, stateRoot) ✓

// Step 5: 验证投票树
for i in 0..4:
  calculatedRoot = QuinCheckRoot(votes[i])
  
  // 用户 0
  QuinCheckRoot([10, 0, 0]) === 0xabc ✓
  
  // 用户 1
  QuinCheckRoot([0, 25, 0]) === 0xdef ✓
  
  // 用户 2 (未投票)
  QuinCheckRoot([0, 0, 0]) === ZeroRoot ✓
  stateLeaf[2][3] === 0 → 使用 ZeroRoot ✓
  
  // 用户 3
  QuinCheckRoot([0, 0, 30]) === 0x123 ✓
  
  // 用户 4
  QuinCheckRoot([20, 0, 0]) === 0x456 ✓

// Step 6: 累加结果
isFirstBatch = 1
iz.out = 0
MAX_VOTES = 10^24

// 选项 0 (用户 0 投 10 票，用户 4 投 20 票)
nums[0] = votes[0][0] * (votes[0][0] + MAX_VOTES) = 10 * (10 + 10^24) = 10*10^24 + 100
nums[1] = votes[1][0] * (votes[1][0] + MAX_VOTES) = 0 * (0 + 10^24) = 0
nums[2] = 0
nums[3] = 0
nums[4] = votes[4][0] * (votes[4][0] + MAX_VOTES) = 20 * (20 + 10^24) = 20*10^24 + 400
nums[5] = currentResults[0] * iz.out = 0 * 0 = 0

newResults[0].sum = (10*10^24 + 100) + 0 + 0 + 0 + (20*10^24 + 400) + 0
                  = 30*10^24 + 500 ✓
// 实际票数: 30 票 (10 + 20)

// 选项 1 (用户 1 投 25 票)
nums[0] = 0
nums[1] = 25 * (25 + 10^24) = 25*10^24 + 625
nums[2] = 0
nums[3] = 0
nums[4] = 0
nums[5] = 0

newResults[1].sum = 0 + (25*10^24 + 625) + 0 + 0 + 0 + 0
                  = 25*10^24 + 625 ✓
// 实际票数: 25 票

// 选项 2 (用户 3 投 30 票)
newResults[2].sum = 30*10^24 + 900 ✓
// 实际票数: 30 票

// Step 7: 验证新承诺
// 使用编码后的结果计算根
newResultsRoot = QuinCheckRoot([30*10^24 + 500, 25*10^24 + 625, 30*10^24 + 900])
newTallyCommitment = hash(newResultsRoot, newResultsRootSalt) ✓

// 证明生成成功! ✓
```

### 示例 2: 多批次统计

**背景**：
- 100 个用户
- 5 个选项
- batchSize = 25
- 需要 4 批

**注意**：下面的示例使用简化表示（实际票数）来说明多批次流程。在实际电路中，所有结果都会使用 `v * (v + MAX_VOTES)` 编码。

#### 批次 0: 用户 0-24

```javascript
// 准备输入
currentResults = [0, 0, 0, 0, 0]  // 简化表示
currentTallyCommitment = 0

// 统计这 25 个用户（简化表示）
actualVotes = [50, 80, 120, 30, 20]

// 电路中实际使用编码值
// encodedResults = [50*10^24 + Σv², 80*10^24 + Σv², ...]

// 生成承诺（使用编码值）
newResultsRootSalt = 0x7a8f...
newTallyCommitment = hash(QuinRoot(encodedResults), 0x7a8f...)

// 提交证明 ✓
```

#### 批次 1: 用户 25-49

```javascript
// 准备输入
currentResults = [50, 80, 120, 30, 20]  // 从批次 0
currentResultsRootSalt = 0x7a8f...      // 从批次 0
currentTallyCommitment = hash(...)      // 从批次 0

// 电路验证当前承诺
calculatedCommitment = hash(QuinRoot([50, 80, 120, 30, 20]), 0x7a8f...)
require(calculatedCommitment === currentTallyCommitment) ✓

// 累加新用户
newResults = [50+45, 80+60, 120+90, 30+25, 20+15]
          = [95, 140, 210, 55, 35]

// 生成新承诺
newResultsRootSalt = 0x9bc2...  // 新的盐值
newTallyCommitment = hash(QuinRoot([95, 140, 210, 55, 35]), 0x9bc2...)

// 提交证明 ✓
```

#### 批次 2: 用户 50-74

```javascript
currentResults = [95, 140, 210, 55, 35]
currentTallyCommitment = hash(QuinRoot([95, 140, 210, 55, 35]), 0x9bc2...)

newResults = [95+40, 140+70, 210+100, 55+20, 35+10]
          = [135, 210, 310, 75, 45]

newTallyCommitment = hash(QuinRoot([135, 210, 310, 75, 45]), newSalt)

// 提交证明 ✓
```

#### 批次 3: 用户 75-99

```javascript
currentResults = [135, 210, 310, 75, 45]

newResults = [135+35, 210+50, 310+80, 75+15, 45+5]
          = [170, 260, 390, 90, 50]

// 这是最后一批
finalTallyCommitment = hash(QuinRoot([170, 260, 390, 90, 50]), finalSalt)

// 提交证明 ✓

console.log("Final results:");
console.log("Option 0:", 170);
console.log("Option 1:", 260);
console.log("Option 2:", 390);  // 获胜者!
console.log("Option 3:", 90);
console.log("Option 4:", 50);
```

### 示例 3: 未投票用户处理

**场景**：批次中有些用户从未投票

```javascript
// 批次中的用户状态
users = [
  { voRoot: 0xabc, votes: [10, 0, 0] },     // 已投票
  { voRoot: 0x0, votes: [0, 0, 0] },        // 未投票 ←
  { voRoot: 0xdef, votes: [0, 15, 0] },     // 已投票
  { voRoot: 0x0, votes: [0, 0, 0] },        // 未投票 ←
  { voRoot: 0x123, votes: [0, 0, 20] }      // 已投票
];

// 电路处理
for (let i = 0; i < 5; i++) {
  const calculatedRoot = QuinCheckRoot(votes[i]);
  
  if (stateLeaf[i].voRoot === 0) {
    // 未投票用户 → 使用 ZeroRoot
    const zeroRoot = ZeroRoot(voteOptionTreeDepth);
    require(calculatedRoot === zeroRoot);  ✓
    
    // votes[i] = [0, 0, 0] 对结果无影响
  } else {
    // 已投票用户 → 验证实际的根
    require(calculatedRoot === stateLeaf[i].voRoot);  ✓
  }
}

// 累加结果
newResults = [10+0+0+0+0, 0+0+15+0+0, 0+0+0+0+20]
          = [10, 15, 20]
```

---

## 安全特性分析

### 1. 数据完整性

**状态树验证**：
```circom
// 必须使用最终的状态树
stateCommitment = hash(stateRoot, stateSalt)
// 任何对状态树的篡改都会被检测到
```

**投票树验证**：
```circom
// 每个用户的投票必须匹配其 voteOptionRoot
calculatedRoot = QuinCheckRoot(votes[i])
require(calculatedRoot === stateLeaf[i].voRoot)
// Operator 无法伪造或修改用户投票
```

### 2. 增量验证

**承诺链**：
```javascript
Batch 0: commitment0 = hash(results0, salt0)
         ↓
Batch 1: verify(commitment0) → commitment1 = hash(results1, salt1)
         ↓
Batch 2: verify(commitment1) → commitment2 = hash(results2, salt2)
         ↓
         ...
         
// 每一批都验证前一批的承诺
// 无法跳过或修改之前的结果
```

**防止回滚攻击**：
```javascript
// 链上存储
mapping(uint256 => uint256) public tallyCommitments;
uint256 public currentBatchNum;

function tallyVotes(...) external {
  require(batchNum == currentBatchNum, "Wrong batch");
  require(verifyProof(...), "Invalid proof");
  
  tallyCommitments[batchNum] = newTallyCommitment;
  currentBatchNum++;
}

// Operator 必须按顺序提交，无法跳过或重做批次
```

### 3. 可验证性

**公开验证**：
```javascript
// Coordinator 公开最终结果和盐值
finalResults = [170, 260, 390, 90, 50]
finalSalt = 0xabc...

// 任何人可以验证
calculatedRoot = quinCheckRoot(finalResults)
calculatedCommitment = poseidon([calculatedRoot, finalSalt])

assert(calculatedCommitment === finalTallyCommitment)  ✓

// 如果 Coordinator 撒谎，承诺无法匹配
```

**审计友好**：
```javascript
// Coordinator 可以公开每个用户的投票（可选）
publishedVotes = [
  [10, 0, 0],  // 用户 0
  [0, 25, 0],  // 用户 1
  // ...
]

// 审计者可以：
// 1. 验证每个用户的投票树根
// 2. 手动累加结果
// 3. 对比 finalResults

// 注意：即使公开，也无法追溯到用户身份（隐私保护）
```

### 4. 防篡改

**批次范围验证**：
```circom
batchStartIndex = batchNum * batchSize
require(batchStartIndex <= numSignUps)

// 防止处理超出范围的用户
// 防止重复处理同一批次
```

**状态叶子存在性验证**：
```circom
// 验证批次的子树根存在于状态树中
QuinLeafExists(stateSubroot, statePathElements, stateRoot)

// Operator 无法添加虚假用户
// 无法使用错误的状态树
```

### 5. 零知识属性

**隐私保护**（有限）：
```javascript
// 证明内容：
// "我正确统计了这批用户的投票"

// 不泄露：
// ❌ 每个用户的具体投票（votes 是私有输入）
// ❌ 用户的公钥和余额（stateLeaf 是私有输入）

// 但是：
// ⚠️ 最终结果是公开的（finalResults）
// ⚠️ Coordinator 可以选择是否公开详细投票数据

// 隐私级别：
// - 对外界：完全隐私（只看到最终结果）
// - 对 Coordinator：无隐私（看到所有投票）
```

---

## 与 ProcessMessages 的关系

### 完整工作流

```
┌─────────────────────────────────────────────────────────┐
│                  Phase 1: 注册期                         │
│  用户调用 signUp() → 添加到状态树                        │
└────────────────┬────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────┐
│                  Phase 2: 投票期                         │
│  用户调用 publishMessage() → 加密投票存储链上            │
└────────────────┬────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────┐
│              Phase 3: ProcessMessages                    │
│  Coordinator 批量处理消息：                              │
│    - 解密消息                                            │
│    - 验证签名、nonce、余额                               │
│    - 更新每个用户的状态叶子:                             │
│        * voiceCreditBalance (扣除)                      │
│        * voteOptionRoot (更新) ← 关键输出                │
│        * nonce (递增)                                    │
│    - 生成新的状态树根                                    │
│                                                          │
│  输出: 最终状态树（包含所有用户的 voteOptionRoot）       │
└────────────────┬────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────┐
│                 Phase 4: TallyVotes                      │
│  Coordinator 批量统计投票：                              │
│    - 读取最终状态树（不修改）                            │
│    - 从每个用户的 voteOptionRoot 提取投票               │
│    - 验证投票树根的正确性                                │
│    - 累加所有用户的投票                                  │
│    - 生成最终结果承诺                                    │
│                                                          │
│  输出: 最终投票结果 + 证明                               │
└─────────────────────────────────────────────────────────┘
```

### 数据流转

```javascript
// ProcessMessages 的输出 → TallyVotes 的输入

// 1. ProcessMessages 处理消息
message = {
  stateIndex: 3,
  voteOptionIndex: 2,
  newVoteWeight: 25,
  // ...
}

// 更新用户 3 的投票树
userVoteTree[3].update(2, 25)  // 选项 2 → 25 票
newVoteOptionRoot = userVoteTree[3].root

// 更新状态树
stateTree.update(3, {
  pubKey: [...],
  balance: 631,
  voteOptionRoot: newVoteOptionRoot,  ← 存储投票树根
  nonce: 5
})

finalStateRoot = stateTree.root  ← ProcessMessages 的最终输出

// ─────────────────────────────────────────

// 2. TallyVotes 读取状态
stateLeaf = stateTree.getLeaf(3)
// {
//   pubKey: [...],
//   balance: 631,
//   voteOptionRoot: 0x7a8f...,  ← 读取
//   nonce: 5
// }

// 从 voteOptionRoot 重建投票树
voteTree = reconstructTree(0x7a8f...)
votes = voteTree.getAllLeaves()
// [0, 0, 25, 0, 0]  ← 提取投票数据

// 验证
calculatedRoot = QuinCheckRoot([0, 0, 25, 0, 0])
require(calculatedRoot === 0x7a8f...)  ✓

// 累加到结果
results[2] += 25
```

### 关键区别

| 特性 | ProcessMessages | TallyVotes |
|------|----------------|------------|
| **阶段** | 投票处理期 | 统计期 |
| **输入** | 加密消息 | 最终状态树 |
| **处理** | 解密、验证、更新状态 | 读取投票、验证、累加 |
| **状态树** | 修改（每批更新根） | 只读（根不变） |
| **输出** | 新状态根 | 投票结果 |
| **私钥** | 需要（解密消息） | 不需要 |
| **批次依赖** | 顺序依赖（状态链） | 独立（可并行） |
| **隐私** | 高（解密在电路中） | 中（结果公开） |

### TallyVotes 的独立性

```javascript
// ProcessMessages: 批次间有依赖
batch0: currentState → [process] → newState1
batch1: newState1 → [process] → newState2
batch2: newState2 → [process] → newState3
// 必须顺序执行

// TallyVotes: 批次间可并行（理论上）
const finalState = stateTree.root;  // 固定

// 这些可以并行准备
batch0 = prepareTally(finalState, users[0:24])
batch1 = prepareTally(finalState, users[25:49])
batch2 = prepareTally(finalState, users[50:74])
// ...

// 但链上提交必须顺序（因为承诺链）
await submitTally(batch0)  // commitment0
await submitTally(batch1)  // verify commitment0 → commitment1
await submitTally(batch2)  // verify commitment1 → commitment2
```

---

## 性能与优化

### 电路规模估算

```javascript
// 配置
stateTreeDepth = 4          // 625 用户
intStateTreeDepth = 2       // batchSize = 25
voteOptionTreeDepth = 2     // 25 个选项

// 约束数量估算（单批）
TallyVotesInputHasher: ~1,000 constraints
StateLeafHasher × 25: ~200 × 25 = 5,000
QuinCheckRoot (state subroot): ~1,500
QuinLeafExists (verify subroot): ~2,000
QuinCheckRoot (vote trees) × 25: ~800 × 25 = 20,000
CalculateTotal × 25: ~100 × 25 = 2,500
ResultCommitmentVerifier: ~2,000

总计: ~35,000 constraints

// 证明时间（M1 Mac）
Groth16 Prove: ~6-12 秒
Groth16 Verify (链上): ~280,000 gas

// 全量统计（625 用户）
批次数 = 625 / 25 = 25 批
总证明时间 = 25 × 10 秒 = 250 秒 (~4 分钟)
总 gas 消耗 = 25 × 280,000 = 7,000,000 gas
```

### Gas 优化技巧

**1. 增加批次大小**：
```javascript
// 小批次
intStateTreeDepth = 1  // batchSize = 5
需要批次数 = 625 / 5 = 125 批
Gas 消耗 = 125 × 280,000 = 35,000,000 gas

// 大批次
intStateTreeDepth = 3  // batchSize = 125
需要批次数 = 625 / 125 = 5 批
Gas 消耗 = 5 × 280,000 = 1,400,000 gas
节省 96% gas! ✓

// 但：电路约束增加，证明时间更长
```

**2. 并行生成证明**：
```javascript
// 链下准备所有批次数据
const allBatches = prepareAllBatches(finalStateTree);

// 并行生成证明（如果有多台机器）
const proofs = await Promise.all(
  allBatches.map(batch => generateProof(batch))
);

// 顺序提交链上
for (const proof of proofs) {
  await submitTally(proof);
}
```

**3. 使用 Plonk 替代 Groth16**：
```javascript
// Groth16: 需要 Trusted Setup，验证 gas ~280k
// Plonk: 通用 Setup，验证 gas ~350k

// 如果有多个电路版本，Plonk 更灵活
```

---

## 总结

`TallyVotes` 电路是 MACI 投票系统的**最后一环**，负责将 ProcessMessages 产生的最终状态转换为可验证的投票结果。

### 核心特点

1. **只读状态树** - 不修改状态，只读取和验证
2. **批量累加** - 分批处理大规模投票，支持增量统计
3. **双重验证** - 同时验证状态叶子和投票树根
4. **承诺链** - 通过承诺链确保多批次结果的连续性
5. **可公开验证** - 任何人可以验证最终结果的正确性

### 与 ProcessMessages 的协作

```
ProcessMessages:
  消息 → 解密 → 验证 → 更新状态
  输出: 每个用户的 voteOptionRoot

TallyVotes:
  voteOptionRoot → 提取投票 → 验证 → 累加
  输出: 最终投票结果
```

### 信任模型

- **不需信任 Coordinator** - 所有计算都有零知识证明
- **可公开审计** - 任何人可以验证链上承诺
- **防篡改** - 无法伪造或修改投票数据
- **增量验证** - 每批都验证前一批的承诺

通过 ProcessMessages + TallyVotes 的组合，MACI 实现了一个完整的隐私投票系统：**用户隐私投票 → Coordinator 处理 → 可验证统计 → 公开结果**！

---

## 附录：快速参考

### 常量定义

```circom
TREE_ARITY = 5                     // 五叉树
STATE_LEAF_LENGTH = 5              // 状态叶子字段数
STATE_LEAF_VO_ROOT_IDX = 3         // voteOptionRoot 索引
STATE_LEAF_NONCE_IDX = 4           // nonce 索引
```

### 关键公式

```javascript
// 批次大小
batchSize = 5^intStateTreeDepth

// 选项数量
numVoteOptions = 5^voteOptionTreeDepth

// 批次数量
numBatches = ceil(numSignUps / batchSize)

// 批次索引
batchStartIndex = batchNum * batchSize

// 树深度关系
k = stateTreeDepth - intStateTreeDepth

// 投票编码（电路中使用）
MAX_VOTES = 10^24
encodedVote = v * (v + MAX_VOTES) = v² + v * MAX_VOTES

// 投票解码（链下使用）
actualVotes = encodedSum / MAX_VOTES
squaresSum = encodedSum % MAX_VOTES
// 或精确求解: v = (-MAX_VOTES + √(MAX_VOTES² + 4*encodedSum)) / 2
```

### 关键文件

```
tallyVotes.circom              - 主电路
calculateTotal.circom          - 求和组件
checkRoot.circom               - 树根验证
zeroRoot.circom                - 零树根计算
incrementalQuinTree.circom     - Merkle 证明
```

### 链上接口

```solidity
function tallyVotes(
    uint256 newTallyCommitment,
    uint256[8] calldata proof,
    uint256 inputHash
) external {
    // 验证证明
    require(verifier.verifyProof(proof, [inputHash]));
    
    // 更新承诺
    tallyCommitment = newTallyCommitment;
    currentBatchNum++;
}

function verifyTallyResult(
    uint256[] calldata results,
    uint256 salt
) public view returns (bool) {
    uint256 calculatedCommitment = hashLeftRight(
        quinCheckRoot(results),
        salt
    );
    return calculatedCommitment == tallyCommitment;
}
```

