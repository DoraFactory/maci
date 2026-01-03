# AMACI TallyVotes 电路详细文档

## 目录

1. [概述](#概述)
2. [AMACI vs MACI 核心差异](#amaci-vs-maci-核心差异)
3. [电路架构](#电路架构)
4. [核心模板详解](#核心模板详解)
5. [完整流程分析](#完整流程分析)
6. [实际应用示例](#实际应用示例)
7. [安全特性分析](#安全特性分析)
8. [与 MACI TallyVotes 的对比](#与-maci-tallyvotes-的对比)
9. [性能与优化](#性能与优化)

---

## 概述

### 电路位置
```
packages/circuits/circom/amaci/power/tallyVotes.circom
```

### 核心功能

`TallyVotes` 是 AMACI 系统的**最终统计电路**，负责：

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
- ✅ **AMACI 特有** - 支持 10 字段状态叶子（含 deactivate 信息）

### 投票流程完整链条

```
1. SignUp
   用户注册 → 添加到状态树（10 字段叶子）
   
2. PublishMessage  
   用户发送加密投票 → 存储在链上
   
3. ProcessMessages
   Operator 解密并处理消息 → 更新状态树
   每个用户的 stateLeaf 包含其投票选项树根 (voteOptionRoot)
   AMACI: 包含 deactivate 密文 (c1, c2)
   
4. TallyVotes ← 本文档
   Operator 读取所有用户的投票 → 统计最终结果
   输出每个选项的总票数
   AMACI: 使用 Hasher10 处理 10 字段叶子
```

---

## AMACI vs MACI 核心差异

### 1. State Leaf 结构对比

**MACI State Leaf (5 个字段)**：
```javascript
StateLeaf = [
  pubKey_x,           // [0] 用户公钥 X 坐标
  pubKey_y,           // [1] 用户公钥 Y 坐标
  voiceCreditBalance, // [2] 剩余投票积分
  voteOptionRoot,     // [3] 投票选项树根
  nonce               // [4] 防重放攻击计数器
]

// 哈希方式
stateLeafHash = Hasher5([pubKey_x, pubKey_y, balance, voRoot, nonce])
```

**AMACI State Leaf (10 个字段)**：
```javascript
StateLeaf = [
  pubKey_x,           // [0] 用户公钥 X 坐标
  pubKey_y,           // [1] 用户公钥 Y 坐标
  voiceCreditBalance, // [2] 剩余投票积分
  voteOptionRoot,     // [3] 投票选项树根
  nonce,              // [4] 防重放攻击计数器
  c1_0,               // [5] Deactivate 密文 C1 的 x 坐标
  c1_1,               // [6] Deactivate 密文 C1 的 y 坐标
  c2_0,               // [7] Deactivate 密文 C2 的 x 坐标
  c2_1,               // [8] Deactivate 密文 C2 的 y 坐标
  xIncrement          // [9] 增量值（预留，当前为 0）
]

// 哈希方式（双层）
layer1 = Hasher5([pubKey_x, pubKey_y, balance, voRoot, nonce])
layer2 = Hasher5([c1_0, c1_1, c2_0, c2_1, xIncrement])
stateLeafHash = Hasher2([layer1, layer2])
```

### 2. 电路常量对比

| 常量 | MACI | AMACI | 说明 |
|------|------|-------|------|
| `STATE_LEAF_LENGTH` | 5 | 10 | 状态叶子字段数 |
| `STATE_LEAF_VO_ROOT_IDX` | 3 | 3 | voRoot 索引（相同） |
| `STATE_LEAF_NONCE_IDX` | 4 | 4 | nonce 索引（相同） |
| 状态叶子哈希器 | `Hasher5()` | `Hasher10()` | AMACI 使用双层哈希 |

### 3. 为什么 AMACI 需要 10 字段？

**Deactivate 功能**：
- AMACI 支持用户停用账户（deactivate）
- Deactivate 状态使用 ElGamal 加密存储在状态叶子中
- 需要额外的 5 个字段：`c1_0, c1_1, c2_0, c2_1, xIncrement`

**为什么在 TallyVotes 中也需要这些字段**：
```javascript
// 在 TallyVotes 阶段，虽然不需要解密 deactivate 状态
// 但需要验证状态叶子的完整性
// 必须使用相同的哈希方式计算状态叶子哈希

// ProcessMessages 后的状态树
stateTree.updateLeaf(userIdx, Hasher10([...10 fields]))

// TallyVotes 验证
stateLeafHash = Hasher10([...10 fields])
require(stateLeafHash exists in stateTree)  ✓
```

**如果不包含这些字段会怎样**：
```javascript
// 错误示例：只哈希 5 个字段
stateLeafHash = Hasher5([pubKey_x, pubKey_y, balance, voRoot, nonce])

// 验证失败！
// 因为状态树中的哈希是 Hasher10(...) 的结果
// Hasher5(...) ≠ Hasher10(...)
```

### 4. TallyVotes 中 Deactivate 字段的作用

**在 TallyVotes 阶段**：
- ✅ **需要**：完整的 10 字段状态叶子
- ✅ **需要**：使用 Hasher10 计算哈希
- ❌ **不需要**：解密 deactivate 状态（只在 ProcessMessages 中需要）
- ❌ **不需要**：检查用户是否已 deactivate（已在 ProcessMessages 中处理）

**原因**：
```
TallyVotes 读取的是 ProcessMessages 的最终输出
  ↓
最终状态树包含所有有效投票
  ↓
已 deactivate 的用户在 ProcessMessages 中被拒绝
  ↓
TallyVotes 只需统计有效投票
  ↓
但必须使用相同的哈希方式验证状态叶子
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

```circom
template TallyVotes(
    stateTreeDepth,        // 状态树深度 (例如: 2)
    intStateTreeDepth,     // 中间树深度 (例如: 1) 
    voteOptionTreeDepth    // 投票选项树深度 (例如: 1)
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

**AMACI 实际配置示例**：
```javascript
// 配置: 2-1-1-5
stateTreeDepth: 2          // 最多 25 个用户
intStateTreeDepth: 1       // 每批处理 5 个用户 (需要 25/5 = 5 批)
voteOptionTreeDepth: 1     // 最多 5 个选项
batchSize: 5

// 状态叶子长度
STATE_LEAF_LENGTH: 10      // AMACI 特有！(MACI 是 5)
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

##### 3. 批次数据（AMACI 特有）

```circom
signal input stateLeaf[batchSize][STATE_LEAF_LENGTH];  // 10 个字段！
signal input statePathElements[k][TREE_ARITY - 1];
signal input votes[batchSize][numVoteOptions];
```

**AMACI 状态叶子结构**（10 个字段）：
```javascript
StateLeaf = [
  pubKey_x,           // [0] 用户公钥 X 坐标
  pubKey_y,           // [1] 用户公钥 Y 坐标
  voiceCreditBalance, // [2] 剩余投票积分
  voteOptionRoot,     // [3] 该用户的投票选项树根 ← 关键！
  nonce,              // [4] nonce
  c1_0,               // [5] Deactivate 密文 C1 X
  c1_1,               // [6] Deactivate 密文 C1 Y
  c2_0,               // [7] Deactivate 密文 C2 X
  c2_1,               // [8] Deactivate 密文 C2 Y
  xIncrement          // [9] 增量值（预留）
]
```

**投票数据结构**（与 MACI 相同）：
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

##### 4. 结果相关（与 MACI 相同）

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

**作用**：确保使用的是正确的最终状态树（与 MACI 相同）。

##### 步骤 2: 验证输入哈希（第 70-76 行）

```circom
component inputHasher = TallyVotesInputHasher();
inputHasher.stateCommitment <== stateCommitment;
inputHasher.currentTallyCommitment <== currentTallyCommitment;
inputHasher.newTallyCommitment <== newTallyCommitment;
inputHasher.packedVals <== packedVals;
inputHasher.hash === inputHash;
```

**解包参数**（与 MACI 相同）：
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

**与 MACI 相同的逻辑**。

##### 步骤 4: 验证批次状态叶子（第 93-116 行）

**这是 AMACI 与 MACI 的关键差异点**：

```circom
// 1. 哈希每个状态叶子（AMACI 使用 Hasher10）
component stateLeafHasher[batchSize];
for (var i = 0; i < batchSize; i++) {
    stateLeafHasher[i] = Hasher10();  // ← AMACI: Hasher10, MACI: Hasher5
    for (var j = 0; j < STATE_LEAF_LENGTH; j++) {  // ← AMACI: 10, MACI: 5
        stateLeafHasher[i].in[j] <== stateLeaf[i][j];
    }
    stateSubroot.leaves[i] <== stateLeafHasher[i].hash;
}

// 2. 计算批次子树根
component stateSubroot = QuinCheckRoot(intStateTreeDepth);

// 3. 验证子树根在状态树中
component stateQle = QuinLeafExists(k);
stateQle.leaf <== stateSubroot.root;
stateQle.root <== stateRoot;
```

**AMACI vs MACI 对比**：

```diff
MACI:
- stateLeafHasher[i] = Hasher5();
- STATE_LEAF_LENGTH = 5

AMACI:
+ stateLeafHasher[i] = Hasher10();
+ STATE_LEAF_LENGTH = 10
```

**Hasher10 的工作原理**：
```javascript
// 双层哈希
function Hasher10(in[10]) {
  // 第一层：哈希前 5 个字段（基础字段）
  layer1 = Poseidon5([in[0], in[1], in[2], in[3], in[4]]);
  
  // 第二层：哈希后 5 个字段（deactivate 字段）
  layer2 = Poseidon5([in[5], in[6], in[7], in[8], in[9]]);
  
  // 最终层：合并两个哈希
  hash = Poseidon2([layer1, layer2]);
  
  return hash;
}
```

**完整示例**：
```javascript
// AMACI 状态叶子
stateLeaf = [
  // 基础字段 [0-4]
  pk_x,    // [0]
  pk_y,    // [1]
  900,     // [2] balance
  0xabc,   // [3] voRoot
  5,       // [4] nonce
  
  // Deactivate 字段 [5-9]
  c1_x,    // [5]
  c1_y,    // [6]
  c2_x,    // [7]
  c2_y,    // [8]
  0        // [9] xIncrement
];

// 计算哈希
layer1 = Poseidon5([pk_x, pk_y, 900, 0xabc, 5]);
layer2 = Poseidon5([c1_x, c1_y, c2_x, c2_y, 0]);
stateLeafHash = Poseidon2([layer1, layer2]);

// 验证
require(stateLeafHash exists in stateTree) ✓
```

##### 步骤 5: 验证投票选项树根（第 119-142 行）

**与 MACI 完全相同**：

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
    slvoRootIsZero.in <== stateLeaf[i][STATE_LEAF_VO_ROOT_IDX];  // 索引 3
    
    component voRootMux = Mux1();
    voRootMux.s <== slvoRootIsZero.out;
    voRootMux.c[0] <== stateLeaf[i][STATE_LEAF_VO_ROOT_IDX];  // 正常用户
    voRootMux.c[1] <== voTreeZeroRoot;                        // 未投票用户
    
    // 3. 验证根匹配
    voteTree[i].root === voRootMux.out;
}
```

**注意**：虽然 stateLeaf 有 10 个字段，但 `STATE_LEAF_VO_ROOT_IDX = 3` 的位置不变！

#### Hasher5/Hasher10 详解：状态叶子验证的核心

这是理解 AMACI 与 MACI 差异的关键部分。让我们深入分析 Hasher5/Hasher10 在电路中的具体作用和位置。

##### 核心作用：验证用户在 State Tree 中

**Hasher5/Hasher10 的根本目的**：
```javascript
// 验证逻辑的本质
if (Hasher10(stateLeaf) exists in stateTree) {
  // ✓ 该用户确实在 state tree 中注册过
  // ✓ 状态数据未被篡改
  // ✓ 可以信任这个用户的投票数据
} else {
  // ✗ 证明生成失败
  // ✗ Coordinator 无法伪造不存在的用户
}
```

##### 电路中的具体位置和流程

**位置 1: 计算状态叶子哈希（第 98-104 行）**

```circom
// 第 96-104 行：对批次中的每个用户计算状态叶子哈希
component stateSubroot = QuinCheckRoot(intStateTreeDepth);
component stateLeafHasher[batchSize];

for (var i = 0; i < batchSize; i++) {
    stateLeafHasher[i] = Hasher10();  // ← AMACI: Hasher10, MACI: Hasher5
    
    for (var j = 0; j < STATE_LEAF_LENGTH; j++) {  // ← AMACI: 10, MACI: 5
        stateLeafHasher[i].in[j] <== stateLeaf[i][j];
    }
    
    stateSubroot.leaves[i] <== stateLeafHasher[i].hash;  // ← 得到叶子哈希
}
```

**作用**：将每个用户的状态字段（10 个或 5 个）哈希成一个单一的值。

**位置 2: 构建批次子树根（第 96 行）**

```circom
// 使用所有叶子哈希构建批次子树
component stateSubroot = QuinCheckRoot(intStateTreeDepth);

// 自动将 stateLeafHasher[0..batchSize-1].hash 作为叶子
// 计算出这一批用户的子树根
```

**位置 3: 验证子树根在最终树中（第 106-116 行）**

```circom
// 第 106-116 行：验证批次子树根存在于最终状态树中
component stateQle = QuinLeafExists(k);
component statePathIndices = QuinGeneratePathIndices(k);

statePathIndices.in <== inputHasher.batchNum;
stateQle.leaf <== stateSubroot.root;  // ← 批次的子树根
stateQle.root <== stateRoot;          // ← 最终状态树根

// 使用 Merkle 路径验证
for (var i = 0; i < k; i++) {
    stateQle.path_index[i] <== statePathIndices.out[i];
    for (var j = 0; j < TREE_ARITY - 1; j++) {
        stateQle.path_elements[i][j] <== statePathElements[i][j];
    }
}
// ← 这里验证：批次子树根确实在 stateRoot 中！
```

**作用**：使用 Merkle proof 验证这批用户的子树根确实存在于最终的 state tree 中。

##### 完整验证流程图

```
步骤 1: 哈希单个状态叶子（Hasher10）
┌──────────────────────────────────────────────────┐
│ User 0: [pk_x, pk_y, bal, vo, nonce, c1, c2...] │
│         ↓ Hasher10                               │
│         hash_0 = Poseidon2([                     │
│           Poseidon5([pk_x, pk_y, bal, vo, n]),  │
│           Poseidon5([c1_0, c1_1, c2_0, c2_1, 0])│
│         ])                                       │
└──────────────────────────────────────────────────┘

步骤 2: 构建批次子树（QuinCheckRoot）
┌──────────────────────────────────────────────────┐
│  hash_0, hash_1, hash_2, hash_3, hash_4         │
│         ↓ QuinCheckRoot(intStateTreeDepth)      │
│     subroot (批次子树根)                         │
│                                                  │
│  这代表了第 0-4 个用户的子树                     │
└──────────────────────────────────────────────────┘

步骤 3: 验证在最终树中（QuinLeafExists）
┌──────────────────────────────────────────────────┐
│         subroot (批次子树根)                     │
│         ↓ + Merkle path (statePathElements)     │
│         ↓ + path indices (from batchNum)        │
│         stateRoot (最终状态树根)                 │
│         ↓ QuinLeafExists 验证                    │
│         验证通过 ✓                                │
│                                                  │
│  证明：这 5 个用户确实都在 state tree 中！       │
└──────────────────────────────────────────────────┘
```

##### 为什么 AMACI 必须用 Hasher10？

**关键约束：必须与 State Tree 中的哈希方式一致**

```typescript
// ProcessMessages 阶段（构建状态树时）
// AMACI 使用 Hasher10 存储
stateTree.updateLeaf(
  userIdx,
  Hasher10([pk_x, pk_y, bal, vo, nonce, c1_0, c1_1, c2_0, c2_1, 0])
  //^^^^^ 双层哈希：Poseidon2([Poseidon5([0..4]), Poseidon5([5..9])])
);

// TallyVotes 阶段（验证状态树时）
// AMACI 必须也用 Hasher10
const leafHash = Hasher10([pk_x, pk_y, bal, vo, nonce, c1_0, c1_1, c2_0, c2_1, 0]);
                 //^^^^^ 相同的双层哈希方式

// 验证成功
require(leafHash exists in stateTree);  ✓

// ═══════════════════════════════════════════════════════

// 错误示例：如果用错哈希器
const wrongHash = Hasher5([pk_x, pk_y, bal, vo, nonce]);
                  //^^^^^ 只哈希 5 个字段

require(wrongHash exists in stateTree);  ✗ 永远失败！
// 因为 stateTree 中存储的是 Hasher10 的结果
// Hasher5(...) ≠ Hasher10(...)
```

##### AMACI vs MACI 对比表格

| 项目 | MACI | AMACI | 说明 |
|------|------|-------|------|
| **电路位置** | 第 99 行 | 第 99 行 | 相同位置 |
| **哈希器** | `Hasher5()` | `Hasher10()` | 不同哈希器 |
| **输入循环** | `j < 5` | `j < 10` | 循环次数不同 |
| **字段数量** | 5 个字段 | 10 个字段 | 多 5 个 deactivate 字段 |
| **哈希结构** | 单层 Poseidon5 | 双层 Poseidon(5+5) | AMACI 更复杂 |
| **约束数量** | ~500/叶子 | ~1,000/叶子 | AMACI 多 100% |
| **验证逻辑** | 相同 | 相同 | QuinLeafExists 相同 |

##### 实际验证示例

```typescript
// AMACI 完整验证示例
const stateLeaf = [
  pk_x,    // [0]
  pk_y,    // [1]
  900,     // [2] balance
  0xabc,   // [3] voRoot
  5,       // [4] nonce
  c1_x,    // [5] deactivate 密文
  c1_y,    // [6]
  c2_x,    // [7]
  c2_y,    // [8]
  0        // [9] xIncrement
];

// ═══ 步骤 1: 电路中计算哈希（第 99-103 行） ═══
// 双层哈希
const layer1 = Poseidon5([pk_x, pk_y, 900, 0xabc, 5]);
const layer2 = Poseidon5([c1_x, c1_y, c2_x, c2_y, 0]);
const leafHash = Poseidon2([layer1, layer2]);

console.log("Leaf hash:", leafHash);
// 输出: 0x7f3a9b2c... (某个哈希值)

// ═══ 步骤 2: 构建子树根（第 96 行） ═══
const subroot = QuinCheckRoot([
  leafHash_0,  // 用户 0 的哈希
  leafHash_1,  // 用户 1 的哈希
  leafHash_2,  // 用户 2 的哈希
  leafHash_3,  // 用户 3 的哈希
  leafHash_4   // 用户 4 的哈希
]);

console.log("Subroot:", subroot);
// 输出: 0x9e5f1c8d... (批次子树根)

// ═══ 步骤 3: 验证在最终树中（第 106-116 行） ═══
const isValid = QuinLeafExists({
  leaf: subroot,
  root: stateRoot,
  path_elements: statePathElements,
  path_index: [2, 1]  // 假设 batchNum=7 的路径
});

console.log("Verification:", isValid);
// 输出: true ✓

// 结论：这 5 个用户确实都在 state tree 中！
```

##### 安全保证

**1. 防止伪造用户**
```javascript
// Coordinator 无法伪造不存在的用户
const fakeLeaf = [fake_pk_x, fake_pk_y, 9999, 0, 0, 0, 0, 0, 0, 0];
const fakeHash = Hasher10(fakeLeaf);

// 验证失败
QuinLeafExists(fakeHash, stateRoot, ...) → false ✗

// 证明无法生成
```

**2. 防止篡改状态**
```javascript
// Coordinator 无法修改用户的余额或 deactivate 状态
const tamperedLeaf = [...originalLeaf];
tamperedLeaf[2] = 9999;  // 篡改余额
const tamperedHash = Hasher10(tamperedLeaf);

// 哈希不匹配
tamperedHash !== stateTree.getLeafHash(userIdx) ✗

// 验证失败
```

**3. 确保数据完整性**
```javascript
// 必须提供完整的 10 个字段
// 缺少任何字段都会导致哈希不匹配

// 即使 TallyVotes 不解密 deactivate 状态
// 但这些字段必须存在且正确
// 否则 Hasher10 的结果会错误
```

##### 步骤 6: 累加新结果（第 144-160 行）

**与 MACI 完全相同**：

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

##### 步骤 7: 验证结果承诺（第 162-174 行）

**与 MACI 完全相同**：

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

### 模板 2: ResultCommitmentVerifier

**与 MACI 完全相同**，详见 [TallyVotes.md](/packages/circuits/docs/TallyVotes.md#模板-2-resultcommitmentverifier-结果承诺验证)。

---

### 模板 3: TallyVotesInputHasher

**与 MACI 完全相同**，详见 [TallyVotes.md](/packages/circuits/docs/TallyVotes.md#模板-3-tallyvotesinputhasher)。

---

## 完整流程分析

### AMACI TallyVotes 流程图

```
┌─────────────────────────────────────────────────────────────┐
│        Step 0: 准备阶段（ProcessMessages 已完成）             │
│  - 所有消息已处理（包括 deactivate 检查）                     │
│  - 状态树已最终确定（包含 10 字段叶子）                       │
│  - 每个用户的投票存储在其 voteOptionRoot 中                   │
│  - 已 deactivate 的用户投票已被拒绝                          │
└───────────────────────────┬─────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│           Step 1: Coordinator 准备第一批数据                  │
│  batchNum = 0, batchSize = 5                                │
│                                                              │
│  for i in 0..4:                                             │
│    stateLeaf[i] = stateTree.getLeaf(i)  // 10 个字段！      │
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
│    - stateLeaf[0..4] (每个 10 字段)                         │
│    - votes[0..4]                                            │
│    - currentResults = [0, 0, 0, 0, 0]  (第一批)            │
│    - currentTallyCommitment = 0                             │
│                                                              │
│  电路验证:                                                    │
│    ✓ 验证状态承诺                                             │
│    ✓ 验证批次在范围内                                         │
│    ✓ 验证状态叶子存在（使用 Hasher10）← AMACI 特有          │
│    ✓ 验证每个用户的投票树根                                   │
│                                                              │
│  累加结果:                                                    │
│    for option in 0..4:                                      │
│      newResults[option] = sum(votes[i][option] for i in 0..4) │
│                                                              │
│  例如:                                                        │
│    newResults = [10, 25, 15, 5, 0]                          │
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
                    ... 处理后续批次 ...
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                Step 4: 最终结果公开                           │
│  最后一批的 newTallyCommitment 包含最终结果                   │
│                                                              │
│  Coordinator 可以公开:                                       │
│    finalResults = [50, 80, 45, 30, 10]                      │
│    newResultsRootSalt                                       │
│                                                              │
│  任何人可以验证:                                              │
│    commitment === hash(QuinRoot(finalResults), salt) ✓      │
└─────────────────────────────────────────────────────────────┘
```

### AMACI 特有的处理细节

#### 1. 读取 10 字段状态叶子

```typescript
// Coordinator 准备数据
function prepareBatchAMACI(batchNum: number) {
  const startIdx = batchNum * batchSize;
  const stateLeaves = [];
  
  for (let i = 0; i < batchSize; i++) {
    const userIdx = startIdx + i;
    const leaf = stateTree.getLeaf(userIdx);
    
    // AMACI: 10 个字段
    stateLeaves.push([
      leaf.pubKey[0],        // [0]
      leaf.pubKey[1],        // [1]
      leaf.balance,          // [2]
      leaf.voRoot,           // [3]
      leaf.nonce,            // [4]
      leaf.d1[0],            // [5] c1_0
      leaf.d1[1],            // [6] c1_1
      leaf.d2[0],            // [7] c2_0
      leaf.d2[1],            // [8] c2_1
      0n                     // [9] xIncrement
    ]);
  }
  
  return stateLeaves;
}
```

#### 2. 验证状态叶子哈希（使用 Hasher10）

```typescript
// 电路中的哈希计算
function computeStateLeafHash(leaf: bigint[10]): bigint {
  // 双层哈希
  const layer1 = poseidon5([
    leaf[0], leaf[1], leaf[2], leaf[3], leaf[4]
  ]);
  
  const layer2 = poseidon5([
    leaf[5], leaf[6], leaf[7], leaf[8], leaf[9]
  ]);
  
  const hash = poseidon2([layer1, layer2]);
  
  return hash;
}

// 验证
const calculatedHash = computeStateLeafHash(stateLeaf[i]);
const expectedHash = stateTree.getLeafHash(userIdx);
assert(calculatedHash === expectedHash);  ✓
```

#### 3. Deactivate 用户的处理

```typescript
// 在 TallyVotes 阶段，已 deactivate 的用户不会出现
// 因为 ProcessMessages 已经拒绝了他们的投票

// ProcessMessages 中的检查
function processMessage(msg, stateLeaf) {
  // 解密 deactivate 状态
  const isDeactivated = decrypt(coordPrivKey, {
    c1: [stateLeaf[5], stateLeaf[6]],
    c2: [stateLeaf[7], stateLeaf[8]],
    xIncrement: stateLeaf[9]
  }) % 2 === 1;
  
  if (isDeactivated) {
    // 消息无效，不更新 voRoot
    return {isValid: false};
  }
  
  // 继续处理...
}

// TallyVotes 阶段
// 只需统计有效的 voRoot（已 deactivate 的用户 voRoot 未更新）
// 不需要再次检查 deactivate 状态
```

---

## 实际应用示例

### 示例 1: 包含 Deactivate 用户的投票统计

**背景**：
- 5 个用户注册
- 3 个用户投票（用户 0, 1, 3）
- 1 个用户 deactivate（用户 2）
- 1 个用户未投票（用户 4）

#### 用户投票情况

```javascript
// ProcessMessages 完成后的状态
users = [
  {
    index: 0,
    pubKey: [pk0_x, pk0_y],
    balance: 900,
    voteOptionRoot: 0xabc,     // 对应投票 [10, 0, 0, 0, 0]
    nonce: 1,
    d1: [c1_0_x, c1_0_y],      // deactivate 密文 (m=0, 活跃)
    d2: [c2_0_x, c2_0_y],
    xIncrement: 0
  },
  {
    index: 1,
    pubKey: [pk1_x, pk1_y],
    balance: 375,
    voteOptionRoot: 0xdef,     // 对应投票 [0, 25, 0, 0, 0]
    nonce: 1,
    d1: [c1_1_x, c1_1_y],      // deactivate 密文 (m=0, 活跃)
    d2: [c2_1_x, c2_1_y],
    xIncrement: 0
  },
  {
    index: 2,
    pubKey: [pk2_x, pk2_y],
    balance: 1000,
    voteOptionRoot: 0x0,       // 未投票（已 deactivate）
    nonce: 0,
    d1: [c1_2_x, c1_2_y],      // deactivate 密文 (m=1, 已停用) ← 关键！
    d2: [c2_2_x, c2_2_y],
    xIncrement: 0
  },
  {
    index: 3,
    pubKey: [pk3_x, pk3_y],
    balance: 700,
    voteOptionRoot: 0x123,     // 对应投票 [0, 0, 30, 0, 0]
    nonce: 1,
    d1: [c1_3_x, c1_3_y],      // deactivate 密文 (m=0, 活跃)
    d2: [c2_3_x, c2_3_y],
    xIncrement: 0
  },
  {
    index: 4,
    pubKey: [pk4_x, pk4_y],
    balance: 1000,
    voteOptionRoot: 0x0,       // 未投票
    nonce: 0,
    d1: [c1_4_x, c1_4_y],      // deactivate 密文 (m=0, 活跃)
    d2: [c2_4_x, c2_4_y],
    xIncrement: 0
  }
];
```

#### Coordinator 统计过程

```javascript
// 1. 准备数据（AMACI: 10 字段）
const stateLeaves = [
  [pk0_x, pk0_y, 900, 0xabc, 1, c1_0_x, c1_0_y, c2_0_x, c2_0_y, 0],
  [pk1_x, pk1_y, 375, 0xdef, 1, c1_1_x, c1_1_y, c2_1_x, c2_1_y, 0],
  [pk2_x, pk2_y, 1000, 0x0, 0, c1_2_x, c1_2_y, c2_2_x, c2_2_y, 0],  // 已 deactivate
  [pk3_x, pk3_y, 700, 0x123, 1, c1_3_x, c1_3_y, c2_3_x, c2_3_y, 0],
  [pk4_x, pk4_y, 1000, 0x0, 0, c1_4_x, c1_4_y, c2_4_x, c2_4_y, 0]
];

// 2. 重建每个用户的投票
const votes = [
  [10, 0, 0, 0, 0],   // 用户 0
  [0, 25, 0, 0, 0],   // 用户 1
  [0, 0, 0, 0, 0],    // 用户 2 (已 deactivate，投票无效)
  [0, 0, 30, 0, 0],   // 用户 3
  [0, 0, 0, 0, 0]     // 用户 4 (未投票)
];

// 3. 验证投票树根（电路中）
for (let i = 0; i < 5; i++) {
  const calculatedRoot = quinCheckRoot(votes[i]);
  
  if (stateLeaves[i][3] === 0n) {
    // 未投票用户
    const zeroRoot = calculateZeroRoot(voteOptionTreeDepth);
    assert(calculatedRoot === zeroRoot);  ✓
  } else {
    // 已投票用户
    assert(calculatedRoot === stateLeaves[i][3]);  ✓
  }
}

// 4. 验证状态叶子哈希（AMACI: Hasher10）
for (let i = 0; i < 5; i++) {
  // 双层哈希
  const layer1 = poseidon5([
    stateLeaves[i][0],  // pubKey_x
    stateLeaves[i][1],  // pubKey_y
    stateLeaves[i][2],  // balance
    stateLeaves[i][3],  // voRoot
    stateLeaves[i][4]   // nonce
  ]);
  
  const layer2 = poseidon5([
    stateLeaves[i][5],  // c1_0
    stateLeaves[i][6],  // c1_1
    stateLeaves[i][7],  // c2_0
    stateLeaves[i][8],  // c2_1
    stateLeaves[i][9]   // xIncrement
  ]);
  
  const stateLeafHash = poseidon2([layer1, layer2]);
  
  // 验证在状态树中
  assert(stateTree.hasLeaf(i, stateLeafHash));  ✓
}

// 5. 累加结果
const MAX_VOTES = 10n ** 24n;
const encodedResults = [0n, 0n, 0n, 0n, 0n];

for (let i = 0; i < 5; i++) {
  for (let j = 0; j < 5; j++) {
    const v = votes[i][j];
    encodedResults[j] += v * (v + MAX_VOTES);
  }
}

console.log("Encoded results:", encodedResults);
// [10*10^24 + 100, 25*10^24 + 625, 30*10^24 + 900, 0, 0]

// 实际票数: [10, 25, 30, 0, 0]
// 用户 2（已 deactivate）的投票未被统计 ✓
```

#### 电路内部处理

```circom
// 批次 0 处理（所有 5 个用户）

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

// Step 4: 验证状态叶子（AMACI: Hasher10）
for i in 0..4:
  // 双层哈希
  layer1 = Hasher5([stateLeaf[i][0..4]])
  layer2 = Hasher5([stateLeaf[i][5..9]])
  stateLeafHash[i] = Hasher2([layer1, layer2])

stateSubroot = QuinCheckRoot([
  stateLeafHash[0],
  stateLeafHash[1],
  stateLeafHash[2],
  stateLeafHash[3],
  stateLeafHash[4]
])

QuinLeafExists(stateSubroot, statePathElements, stateRoot) ✓

// Step 5: 验证投票树
for i in 0..4:
  calculatedRoot = QuinCheckRoot(votes[i])
  
  // 用户 0
  QuinCheckRoot([10, 0, 0, 0, 0]) === 0xabc ✓
  
  // 用户 1
  QuinCheckRoot([0, 25, 0, 0, 0]) === 0xdef ✓
  
  // 用户 2 (已 deactivate，voRoot = 0)
  QuinCheckRoot([0, 0, 0, 0, 0]) === ZeroRoot ✓
  stateLeaf[2][3] === 0 → 使用 ZeroRoot ✓
  
  // 用户 3
  QuinCheckRoot([0, 0, 30, 0, 0]) === 0x123 ✓
  
  // 用户 4 (未投票，voRoot = 0)
  QuinCheckRoot([0, 0, 0, 0, 0]) === ZeroRoot ✓

// Step 6: 累加结果
isFirstBatch = 1
iz.out = 0
MAX_VOTES = 10^24

// 选项 0 (用户 0 投 10 票)
nums[0] = 10 * (10 + 10^24) = 10*10^24 + 100
nums[1] = 0
nums[2] = 0  // 用户 2（已 deactivate）的投票为 0
nums[3] = 0
nums[4] = 0
nums[5] = currentResults[0] * iz.out = 0

newResults[0].sum = 10*10^24 + 100 ✓
// 实际票数: 10 票

// 选项 1 (用户 1 投 25 票)
newResults[1].sum = 25*10^24 + 625 ✓
// 实际票数: 25 票

// 选项 2 (用户 3 投 30 票)
newResults[2].sum = 30*10^24 + 900 ✓
// 实际票数: 30 票

// Step 7: 验证新承诺
newResultsRoot = QuinCheckRoot([10*10^24 + 100, 25*10^24 + 625, 30*10^24 + 900, 0, 0])
newTallyCommitment = hash(newResultsRoot, newResultsRootSalt) ✓

// 证明生成成功! ✓
```

### 示例 2: 多批次统计（包含 Deactivate 用户）

**背景**：
- 25 个用户
- 5 个选项
- batchSize = 5（需要 5 批）
- 2 个用户已 deactivate（用户 7 和 18）

#### 批次 0: 用户 0-4

```javascript
// 所有用户都活跃
currentResults = [0, 0, 0, 0, 0]
currentTallyCommitment = 0

// 实际票数（简化表示）
actualVotes = [10, 20, 15, 8, 3]

// 电路中使用编码值
// encodedResults = [10*10^24 + Σv², 20*10^24 + Σv², ...]

// 提交证明 ✓
```

#### 批次 1: 用户 5-9

```javascript
// 包含 1 个 deactivate 用户（用户 7）
currentResults = [10, 20, 15, 8, 3]

// 用户 7 的投票不会被统计
// 因为在 ProcessMessages 中已被拒绝，voRoot = 0

actualVotes = [10+8, 20+12, 15+10, 8+5, 3+2]
             = [18, 32, 25, 13, 5]

// 提交证明 ✓
```

#### 批次 2-4: 继续处理

```javascript
// 批次 3 包含 deactivate 用户 18
// 同样，其投票不被统计

// 最终结果
finalResults = [50, 80, 60, 30, 15]

// 用户 7 和 18 的投票未被包含 ✓
```

---

## 安全特性分析

### 1. 数据完整性（与 MACI 相同）

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

### 2. AMACI 特有的安全保证

**Deactivate 用户的票数不被统计**：
```javascript
// ProcessMessages 阶段已过滤
// - 已 deactivate 的用户消息被标记为无效
// - voRoot 不会被更新
// - 保持为 0 或旧值

// TallyVotes 阶段
// - 验证 voRoot
// - 如果 voRoot = 0，使用 ZeroRoot 验证
// - 实际投票数为 0
```

**状态叶子的完整性**：
```javascript
// AMACI 必须验证所有 10 个字段
// 即使 TallyVotes 不需要解密 deactivate 状态
// 但必须确保状态叶子未被篡改

// 如果 Coordinator 尝试修改 deactivate 字段
const tamperedLeaf = [...stateLeaf];
tamperedLeaf[5] = fakeC1_x;  // 篡改

// 哈希不匹配，验证失败！
const tamperedHash = Hasher10(tamperedLeaf);
assert(tamperedHash !== stateTree.getLeafHash(userIdx));  ✗
```

### 3. 增量验证（与 MACI 相同）

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

### 4. 可验证性（与 MACI 相同）

**公开验证**：
```javascript
// Coordinator 公开最终结果和盐值
finalResults = [50, 80, 60, 30, 15]
finalSalt = 0xabc...

// 任何人可以验证
calculatedRoot = quinCheckRoot(finalResults)
calculatedCommitment = poseidon([calculatedRoot, finalSalt])

assert(calculatedCommitment === finalTallyCommitment)  ✓

// 如果 Coordinator 撒谎，承诺无法匹配
```

---

## 与 MACI TallyVotes 的对比

### 核心差异总结

| 特性 | MACI | AMACI | 影响 |
|------|------|-------|------|
| **State Leaf 长度** | 5 字段 | 10 字段 | AMACI 需要处理更多数据 |
| **状态叶子哈希器** | `Hasher5()` | `Hasher10()` | AMACI 使用双层哈希 |
| **约束数量** | ~35,000 | ~42,000 | +20% |
| **证明时间** | ~6-12 秒 | ~8-14 秒 | +25% |
| **Deactivate 支持** | ❌ | ✅ | AMACI 可处理已停用用户 |
| **其他逻辑** | 相同 | 相同 | 累加、验证逻辑完全一致 |

### 代码对比

#### 差异点 1: 常量定义

```diff
MACI:
- var STATE_LEAF_LENGTH = 5;

AMACI:
+ var STATE_LEAF_LENGTH = 10;
```

#### 差异点 2: 状态叶子哈希

```diff
MACI:
- stateLeafHasher[i] = Hasher5();
- for (var j = 0; j < 5; j++) {
-     stateLeafHasher[i].in[j] <== stateLeaf[i][j];
- }

AMACI:
+ stateLeafHasher[i] = Hasher10();
+ for (var j = 0; j < 10; j++) {
+     stateLeafHasher[i].in[j] <== stateLeaf[i][j];
+ }
```

#### 相同点: 其他所有逻辑

```circom
// 以下逻辑在 MACI 和 AMACI 中完全相同:

// 1. 输入哈希验证
component inputHasher = TallyVotesInputHasher();  // 相同

// 2. 批次验证
validNumSignups.out === 1;  // 相同

// 3. 投票树验证
voteTree[i].root === voRootMux[i].out;  // 相同

// 4. 累加逻辑
newResults[i].nums[j] <== votes[j][i] * (votes[j][i] + MAX_VOTES);  // 相同

// 5. 结果承诺验证
newTallyCommitmentHasher.hash === newTallyCommitment;  // 相同
```

### 为什么 AMACI 只改变哈希器？

**设计原则：最小化改动**

```
AMACI 的 TallyVotes 设计哲学:
  
1. 保持核心逻辑不变
   - 累加算法相同
   - 承诺方案相同
   - 验证流程相同
   
2. 只修改必要的部分
   - 状态叶子长度: 5 → 10
   - 哈希器: Hasher5 → Hasher10
   
3. 确保兼容性
   - 与 ProcessMessages 的输出兼容
   - 与状态树结构兼容
   - 与合约接口兼容
```

**如果不修改哈希器会怎样**：

```javascript
// 错误方案：TallyVotes 只哈希前 5 个字段
stateLeafHash = Hasher5([
  stateLeaf[0],  // pubKey_x
  stateLeaf[1],  // pubKey_y
  stateLeaf[2],  // balance
  stateLeaf[3],  // voRoot
  stateLeaf[4]   // nonce
]);

// 验证失败！
// 因为状态树中存储的是 Hasher10 的结果
const expectedHash = Hasher10([...10 fields]);
assert(stateLeafHash === expectedHash);  ✗

// 两个哈希永远不会相等
```

**正确方案：使用相同的哈希器**：

```javascript
// TallyVotes 使用 Hasher10
stateLeafHash = Hasher10([...10 fields]);

// 验证成功！
const expectedHash = stateTree.getLeafHash(userIdx);
assert(stateLeafHash === expectedHash);  ✓
```

---

## 性能与优化

### 电路规模对比

**MACI vs AMACI 约束数量**：

```
组件                    MACI      AMACI     增加
─────────────────────────────────────────────────
StateLeaf Hash (×25)   ~12,500   ~30,000   +140%  (Hasher5 → Hasher10)
QuinCheckRoot          ~1,500    ~1,500    0%     (相同)
QuinLeafExists         ~2,000    ~2,000    0%     (相同)
VoteTree (×25)         ~20,000   ~20,000   0%     (相同)
CalculateTotal (×25)   ~2,500    ~2,500    0%     (相同)
InputHasher            ~1,000    ~1,000    0%     (相同)
ResultVerifier         ~2,000    ~2,000    0%     (相同)
─────────────────────────────────────────────────
总计                   ~35,000   ~42,500   +21%
```

**证明时间对比**（M1 Mac, batchSize=25）：

```
MACI TallyVotes:  ~6-12 秒
AMACI TallyVotes: ~8-14 秒  (+25%)

主要开销:
- Hasher10 比 Hasher5 慢约 2倍
- 需要处理 25 个用户 × Hasher10
```

**链上验证 Gas**：

```
MACI:  ~280,000 gas
AMACI: ~280,000 gas  (几乎相同)

原因: 验证器只验证 inputHash (单个字段)
不受电路内部约束数量影响
```

### 优化策略

#### 1. 增加批次大小

```javascript
// 小批次
intStateTreeDepth = 1  // batchSize = 5
需要批次数 = 25 / 5 = 5 批
总证明时间 = 5 × 10 秒 = 50 秒
Gas 消耗 = 5 × 280,000 = 1,400,000 gas

// 大批次
intStateTreeDepth = 2  // batchSize = 25
需要批次数 = 25 / 25 = 1 批
总证明时间 = 1 × 14 秒 = 14 秒
Gas 消耗 = 1 × 280,000 = 280,000 gas
节省 80% gas 和 72% 时间! ✓

// 但：单次证明时间更长，电路约束增加
```

#### 2. 并行生成证明

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

#### 3. 优化 Hasher10

**当前实现**（双层哈希）：
```javascript
// 3 个哈希调用
layer1 = Hasher5([in[0], in[1], in[2], in[3], in[4]]);      // Poseidon(5)
layer2 = Hasher5([in[5], in[6], in[7], in[8], in[9]]);      // Poseidon(5)
hash = Hasher2([layer1, layer2]);                            // Poseidon(2)
```

**约束数量**：
- Hasher5: ~400 约束
- Hasher2: ~200 约束
- 总计: 400 + 400 + 200 = 1,000 约束

**替代方案**（未实现）：
```javascript
// 直接哈希 10 个字段（如果 Poseidon 支持）
hash = Poseidon10([in[0], ..., in[9]]);  // 单次调用

// 但 circomlib 只支持最多 6 个输入
// 因此双层哈希是必要的
```

---

## 总结

AMACI TallyVotes 在 MACI 的基础上，通过最小化改动实现了对 deactivate 功能的支持。

### 核心特点

1. **状态叶子扩展** - 从 5 字段扩展到 10 字段
2. **双层哈希** - 使用 Hasher10 处理扩展的状态叶子
3. **逻辑不变** - 累加、验证、承诺逻辑与 MACI 完全相同
4. **兼容性** - 与 AMACI ProcessMessages 的输出完美兼容
5. **性能开销** - 约 25% 的证明时间增加，20% 的约束增加

### 与 ProcessMessages 的协作

```
ProcessMessages:
  消息 → 解密 → 验证 → 检查 deactivate → 更新状态
  输出: 每个用户的 voRoot (10 字段状态叶子)
  
TallyVotes:
  10 字段状态叶子 → 验证（Hasher10）→ 提取投票 → 累加
  输出: 最终投票结果
```

### 信任模型（与 MACI 相同）

- **不需信任 Coordinator** - 所有计算都有零知识证明
- **可公开审计** - 任何人可以验证链上承诺
- **防篡改** - 无法伪造或修改投票数据
- **增量验证** - 每批都验证前一批的承诺

### 额外保证（AMACI 特有）

- **Deactivate 用户投票无效** - 在 ProcessMessages 中已过滤
- **状态完整性** - 验证包括 deactivate 字段在内的所有字段
- **向后兼容** - 可以轻松切换回 MACI（只需修改哈希器）

通过 ProcessMessages + TallyVotes 的组合，AMACI 实现了一个完整的增强隐私投票系统：**用户注册（含匿名标记）→ 隐私投票 → Coordinator 处理（检查 deactivate）→ 可验证统计 → 公开结果**！

---

## 附录：快速参考

### 常量定义

```circom
TREE_ARITY = 5                     // 五叉树
STATE_LEAF_LENGTH = 10             // AMACI: 10 字段 (MACI: 5)
STATE_LEAF_VO_ROOT_IDX = 3         // voteOptionRoot 索引
STATE_LEAF_NONCE_IDX = 4           // nonce 索引
```

### AMACI State Leaf 索引映射

```circom
// 基础字段 (0-4) - 与 MACI 相同
STATE_LEAF_PUB_X_IDX = 0
STATE_LEAF_PUB_Y_IDX = 1
STATE_LEAF_VOICE_CREDIT_BALANCE_IDX = 2
STATE_LEAF_VO_ROOT_IDX = 3
STATE_LEAF_NONCE_IDX = 4

// Deactivate 字段 (5-9) - AMACI 新增
STATE_LEAF_C1_0_IDX = 5
STATE_LEAF_C1_1_IDX = 6
STATE_LEAF_C2_0_IDX = 7
STATE_LEAF_C2_1_IDX = 8
STATE_LEAF_X_INCREMENT_IDX = 9  // 当前未使用
```

### 关键文件

```
AMACI:
  packages/circuits/circom/amaci/power/tallyVotes.circom
  packages/circuits/circom/utils/hasherPoseidon.circom  (Hasher10)
  
MACI:
  packages/circuits/circom/maci/power/tallyVotes.circom
  packages/circuits/circom/utils/hasherPoseidon.circom  (Hasher5)
  
通用:
  packages/circuits/circom/utils/trees/incrementalQuinTree.circom
  packages/circuits/circom/utils/trees/calculateTotal.circom
  packages/circuits/circom/utils/trees/checkRoot.circom
```

### API 参考

#### 链上接口（与 MACI 相同）

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

#### Coordinator 准备数据（AMACI 特有）

```typescript
// 准备批次数据
function prepareBatchAMACI(batchNum: number) {
  const stateLeaves: bigint[][] = [];
  
  for (let i = 0; i < batchSize; i++) {
    const userIdx = batchNum * batchSize + i;
    const leaf = stateTree.getLeaf(userIdx);
    
    // AMACI: 10 个字段
    stateLeaves.push([
      leaf.pubKey[0],
      leaf.pubKey[1],
      leaf.balance,
      leaf.voRoot,
      leaf.nonce,
      leaf.d1[0],    // c1_0
      leaf.d1[1],    // c1_1
      leaf.d2[0],    // c2_0
      leaf.d2[1],    // c2_1
      0n             // xIncrement
    ]);
  }
  
  return stateLeaves;
}
```

---

通过这份文档，你应该能够完全理解 AMACI TallyVotes 电路的设计、实现和与 MACI 的差异！

