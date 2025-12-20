# AMACI 树结构深度解析

## 📋 目录

- [1. 概述](#1-概述)
- [2. State Tree 结构](#2-state-tree-结构)
- [3. State Leaf 详解](#3-state-leaf-详解)
- [4. Vote Option Tree](#4-vote-option-tree)
- [5. 哈希计算详解](#5-哈希计算详解)
- [6. 树的更新流程](#6-树的更新流程)
- [7. Active State Tree](#7-active-state-tree)
- [8. Deactivate Tree](#8-deactivate-tree)
- [9. 实际示例](#9-实际示例)

---

## 1. 概述

AMACI 使用多个 Merkle Tree 来管理投票系统的状态。主要包括：

```
┌─────────────────────────────────────────────────────────────┐
│                      AMACI 树结构体系                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐      ┌──────────────┐                    │
│  │  State Tree  │      │ Active State │                    │
│  │              │      │     Tree     │                    │
│  │   (主状态)    │      │   (活跃度)   │                    │
│  └──────┬───────┘      └──────────────┘                    │
│         │                                                   │
│         │ 每个 State Leaf 包含:                             │
│         ├─ pubKey (公钥)                                    │
│         ├─ balance (余额)                                   │
│         ├─ nonce (防重放)                                   │
│         ├─ voTree (投票树) ────┐                           │
│         ├─ c1, c2 (deactivate加密)                         │
│         └─ xIncrement                                       │
│                                  │                          │
│                                  ▼                          │
│                          ┌──────────────┐                  │
│                          │   Vote Tree  │                  │
│                          │              │                  │
│                          │  (投票选项)   │                  │
│                          └──────────────┘                  │
│                                                              │
│  ┌──────────────┐                                          │
│  │ Deactivate   │                                          │
│  │    Tree      │                                          │
│  │ (停用记录)    │                                          │
│  └──────────────┘                                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.1 树的特性

| 树类型 | Arity | 深度 | 容量 | 叶子类型 | 零值 |
|-------|-------|------|------|---------|------|
| State Tree | 5 | 2-4 | 5^depth | StateLeaf Hash | zeroHash10 |
| Active State Tree | 5 | 2-4 | 5^depth | Timestamp/0 | 0n |
| Deactivate Tree | 5 | depth+2 | 5^(depth+2) | Deactivate Leaf Hash | 0n |
| Vote Option Tree | 5 | 1-2 | 5^depth | Vote Count | 0n |

---

## 2. State Tree 结构

### 2.1 树的可视化结构

基于图片，我们可以看到一个 **5-ary Merkle Tree**（五叉树）：

```
                         Root (node[0])
                              │
                 ┌────────────┼────────────┐
                 │            │            │
        hash(hash(6,9,8,9), 0, 2,3,8,0)   │
                 │                         │
    ┌────────────┼────────────┬────────────┼────────────┐
    │            │            │            │            │
 node[1]      node[2]      node[3]      node[4]      node[5]
    │
    │ (展开 node[1])
    │
StateLeaf = {
  pubKey_x:              // [0] 用户公钥 X 坐标
  pubKey_y:              // [1] 用户公钥 Y 坐标  
  voiceCreditBalance:    // [2] 剩余投票积分
  voTreeRoot:            // [3] 投票选项树根哈希
  nonce:                 // [4] 防重放计数器
  <C₁_x>                 // [5] ElGamal 密文 c1 的 X 坐标
  <C₁_y>                 // [6] ElGamal 密文 c1 的 Y 坐标
  <C₂_x>                 // [7] ElGamal 密文 c2 的 X 坐标
  <C₂_y>                 // [8] ElGamal 密文 c2 的 Y 坐标
  xIncrement             // [9] 增量值（通常为 0）
}
```

### 2.2 State Tree 的层次结构

```
深度 0 (Root):        [                     Root                      ]
                                             │
深度 1:         ┌─────────┬─────────┬────────┼────────┬─────────┐
                │  n[1]   │  n[2]   │  n[3]  │  n[4]  │  n[5]   │
                │         │         │        │        │         │
深度 2:    ┌────┴────┐  (空的子树)                            
          │  │  │  │  │
         n[6-10]... 
                │
深度 3:    (叶子节点 - StateLeaf Hash)
```

### 2.3 索引计算

在 5-ary tree 中，索引计算规则：

```typescript
// 根节点
rootIndex = 0

// 第 i 个子节点（0-based）
childIndex(parentIndex, i) = parentIndex * 5 + i + 1

// 例如：
// node[0] 的子节点: node[1], node[2], node[3], node[4], node[5]
// node[1] 的子节点: node[6], node[7], node[8], node[9], node[10]

// 父节点
parentIndex(childIndex) = floor((childIndex - 1) / 5)
```

### 2.4 路径元素 (Path Elements)

在 Merkle 证明中，我们需要提供从叶子到根的路径上的兄弟节点：

```
示例：证明 node[6] 在树中

Level 2: 需要 [node[7], node[8], node[9], node[10]] (node[6] 的兄弟)
Level 1: 需要 [node[2], node[3], node[4], node[5]]  (node[1] 的兄弟)
Level 0: 根节点 (验证目标)

pathElements = [
  [node[7], node[8], node[9], node[10]],  // depth 2
  [node[2], node[3], node[4], node[5]]    // depth 1
]

pathIndices = [1, 0]  // node[6] 是 node[1] 的第1个子节点，node[1] 是 node[0] 的第0个子节点
```

---

## 3. State Leaf 详解

### 3.1 State Leaf 结构（AMACI）

从图片中可以看到 StateLeaf 包含 **10 个字段**：

```typescript
interface StateLeaf {
  // === 基础信息 (5个字段) ===
  [0] pubKey_x: bigint          // EdDSA 公钥的 X 坐标
  [1] pubKey_y: bigint          // EdDSA 公钥的 Y 坐标
  [2] voiceCreditBalance: bigint // 剩余投票积分（voice credits）
  [3] voTreeRoot: bigint        // 投票选项树的根哈希
  [4] nonce: bigint             // 命令序号（防重放攻击）
  
  // === AMACI 专属：Deactivate 加密数据 (4个字段) ===
  [5] c1_x: bigint              // ElGamal 密文 C₁ 点的 X 坐标
  [6] c1_y: bigint              // ElGamal 密文 C₁ 点的 Y 坐标
  [7] c2_x: bigint              // ElGamal 密文 C₂ 点的 X 坐标
  [8] c2_y: bigint              // ElGamal 密文 C₂ 点的 Y 坐标
  
  // === 保留字段 ===
  [9] xIncrement: bigint        // X 坐标增量（默认为 0）
}
```

### 3.2 字段说明

#### 3.2.1 公钥 (pubKey)
```
pubKey = [pubKey_x, pubKey_y]

用途：
- 验证用户签名
- 识别用户身份（链下）
- 用于 ECDH 密钥交换

注意：
- 使用 Baby Jubjub 曲线上的点
- 坐标在有限域 F_p 上，p 为 SNARK_FIELD_SIZE
```

#### 3.2.2 余额 (voiceCreditBalance)
```
初始余额：由合约在 signUp 时分配
更新规则：
  - 线性成本：balance = balance + oldVotes - newVotes
  - 二次成本：balance = balance + oldVotes² - newVotes²

约束：
  - balance ≥ 0（在 MessageValidator 中验证）
  - balance < 2^252（防止溢出）
```

#### 3.2.3 投票树根 (voTreeRoot)
```
voTreeRoot = hash(voteOptionTree)

特殊情况：
  - 如果用户从未投票：voTreeRoot = 0
  - 使用时，电路会选择：voTreeRoot == 0 ? voTreeZeroRoot : voTreeRoot
  
voTreeZeroRoot = calculateZeroRoot(voteOptionTreeDepth)
```

#### 3.2.4 Nonce
```
初始值：0
更新规则：nonce 必须严格递增（每次成功命令 +1）

验证：
  newNonce == oldNonce + 1

作用：
  - 防止重放攻击
  - 保证命令顺序
  - 拒绝过期命令
```

#### 3.2.5 ElGamal 加密数据 (c1, c2)
```
加密方案：ElGamal on Baby Jubjub curve

c1 = r * G                    // 临时公钥
c2 = m * G + r * pubKey      // 加密消息

其中：
- r: 随机数（random key）
- G: 曲线基点
- m: 明文消息（0 = active, 1 = deactivated）
- pubKey: coordinator 的公钥

解密：
m * G = c2 - privKey * c1

验证奇偶性：
isDeactivated = (m % 2 == 1)
```

### 3.3 State Leaf 哈希计算

#### AMACI 双层哈希
```typescript
// 第一层：哈希基础字段（前 5 个字段）
layer1 = poseidon([
  pubKey_x,
  pubKey_y,
  voiceCreditBalance,
  voTreeRoot,
  nonce
])

// 第二层：哈希 deactivate 加密字段
layer2 = poseidon([
  c1_x,
  c1_y,
  c2_x,
  c2_y,
  xIncrement  // 通常为 0
])

// 最终哈希：组合两层
stateLeafHash = poseidon([layer1, layer2])
```

#### MACI 单层哈希（对比）
```typescript
// MACI 只有 5 个字段，直接哈希
stateLeafHash = poseidon([
  pubKey_x,
  pubKey_y,
  voiceCreditBalance,
  voTreeRoot,
  nonce
])
```

### 3.4 可视化对比

```
MACI State Leaf:
┌─────────────────────────────────────┐
│ pubKey_x                            │
│ pubKey_y                            │
│ voiceCreditBalance                  │
│ voTreeRoot                          │
│ nonce                               │
└─────────────────────────────────────┘
           ↓ poseidon (5 inputs)
      State Leaf Hash


AMACI State Leaf:
┌─────────────────────────────────────┐
│ 第一层（基础字段）                    │
│ ├─ pubKey_x                         │
│ ├─ pubKey_y                         │
│ ├─ voiceCreditBalance               │
│ ├─ voTreeRoot                       │
│ └─ nonce                            │
└─────────────────────────────────────┘
           ↓ poseidon (5 inputs)
        [layer1 hash]
                        
┌─────────────────────────────────────┐
│ 第二层（Deactivate 字段）             │
│ ├─ c1_x                             │
│ ├─ c1_y                             │
│ ├─ c2_x                             │
│ ├─ c2_y                             │
│ └─ xIncrement                       │
└─────────────────────────────────────┘
           ↓ poseidon (5 inputs)
        [layer2 hash]
        
     [layer1, layer2]
           ↓ poseidon (2 inputs)
      State Leaf Hash
```

---

## 4. Vote Option Tree

### 4.1 结构说明

从图片底部可以看到两个 Vote Tree 的示例：

```
                Vote_Tree
                    │
        ┌───────────┼───────────┬───────────┬───────────┐
        │           │           │           │           │
       [1]         [2]         [3]         [4]         [5]
     (votes)     (votes)     (votes)     (votes)     (votes)
```

每个 State Leaf 都有自己独立的 Vote Option Tree。

### 4.2 Vote Tree 详细结构

```typescript
// 创建空的投票树
const voteTree = new Tree(
  5,                      // arity = 5
  voteOptionTreeDepth,    // 例如 depth = 1, 可存储 5 个选项
  0n                      // zero value = 0 (未投票)
)

// 树的容量
capacity = 5^depth
// depth=1 → 5 个选项
// depth=2 → 25 个选项
// depth=3 → 125 个选项
```

### 4.3 投票数据存储

```
选项索引: 0    1    2    3    4    ...
投票数:   10   5    20   0    3    ...

叶子节点存储的是该选项收到的投票数（voice credits）
```

### 4.4 投票更新流程

```typescript
// 初始状态
voteTree.leaf(0) = 0  // 选项 0 的投票数
voteTree.leaf(1) = 0
// ...

// 用户投票给选项 1，投 5 票
currentVotes = voteTree.leaf(1)  // = 0
newVotes = 5

// 更新
voteTree.updateLeaf(1, newVotes)  // 设置为 5

// 用户修改投票，从 5 票改为 10 票
currentVotes = voteTree.leaf(1)  // = 5
newVotes = 10

// 余额更新（线性成本）
balance = balance + currentVotes - newVotes
        = balance + 5 - 10
        = balance - 5

// 或（二次成本）
balance = balance + currentVotes² - newVotes²
        = balance + 25 - 100
        = balance - 75
```

### 4.5 投票树根的计算

```
voTreeRoot = calculateMerkleRoot(voteTree)

在 State Leaf 中：
- 如果从未投票：voTreeRoot = 0
- 如果已投票：voTreeRoot = voteTree.root

电路中的处理：
component voRootMux = Mux1();
voRootMux.s <== slvoRootIsZero.out;
voRootMux.c[0] <== stateLeaf[STATE_LEAF_VO_ROOT_IDX];  // 实际根
voRootMux.c[1] <== voTreeZeroRoot;                      // 零根
```

---

## 5. 哈希计算详解

### 5.1 Poseidon 哈希

AMACI 主要使用 Poseidon 哈希函数，因为它对 ZK 电路友好。

```typescript
// Poseidon 可以接受不同数量的输入
poseidon([input1])                          // 1 个输入
poseidon([input1, input2])                  // 2 个输入
poseidon([input1, input2, ..., input5])     // 5 个输入
poseidon([input1, input2, ..., input10])    // 10 个输入

// 输出始终是一个域元素 (field element)
output ∈ F_p, where p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
```

### 5.2 树节点哈希计算

#### 5-ary Tree 的内部节点
```typescript
// 对于 5 个子节点的哈希
nodeHash = poseidon([child0, child1, child2, child3, child4])

// 如果某些子节点是空的，使用零值
zeroValue = 0n  // 或 zeroHash10（取决于树类型）
```

#### State Tree 的特殊处理
```typescript
// AMACI State Tree 的零值
const zeroHash5 = poseidon([0n, 0n, 0n, 0n, 0n])
const zeroHash10 = poseidon([zeroHash5, zeroHash5])

// 这样空的叶子节点有统一的哈希值
```

### 5.3 根节点计算示例

假设我们有一个深度为 2 的 State Tree：

```
Level 2 (叶子):
  leaf[0] = hash(stateLeaf0) = h0
  leaf[1] = hash(stateLeaf1) = h1
  leaf[2] = zeroHash10        = z
  leaf[3] = zeroHash10        = z
  leaf[4] = zeroHash10        = z

Level 1 (内部节点):
  node[1] = poseidon([h0, h1, z, z, z])
  node[2] = poseidon([z, z, z, z, z]) = zeroHash(depth=1)
  node[3] = poseidon([z, z, z, z, z]) = zeroHash(depth=1)
  node[4] = poseidon([z, z, z, z, z]) = zeroHash(depth=1)
  node[5] = poseidon([z, z, z, z, z]) = zeroHash(depth=1)

Level 0 (根):
  root = poseidon([node[1], node[2], node[3], node[4], node[5]])
```

### 5.4 优化：预计算零值

```typescript
// 预计算各层的零值哈希
function calculateZeroHashes(depth: number, leafZero: bigint): bigint[] {
  const zeros = [leafZero]
  
  for (let i = 0; i < depth; i++) {
    // 5 个相同的子节点
    zeros.push(poseidon([zeros[i], zeros[i], zeros[i], zeros[i], zeros[i]]))
  }
  
  return zeros
}

// 使用示例
const stateTreeZeros = calculateZeroHashes(4, zeroHash10)
// stateTreeZeros[0] = zeroHash10 (叶子层)
// stateTreeZeros[1] = poseidon([zeroHash10, ...]) (深度 3)
// stateTreeZeros[2] = ...                         (深度 2)
// stateTreeZeros[3] = ...                         (深度 1)
// stateTreeZeros[4] = ...                         (根层)
```

---

## 6. 树的更新流程

### 6.1 插入新的 State Leaf

```typescript
// 1. 计算新叶子的哈希
const newLeaf = {
  pubKey: [pubKeyX, pubKeyY],
  balance: 100n,
  voTreeRoot: 0n,
  nonce: 0n,
  c1: [c1x, c1y],
  c2: [c2x, c2y],
  xIncrement: 0n
}

const layer1 = poseidon([
  newLeaf.pubKey[0],
  newLeaf.pubKey[1],
  newLeaf.balance,
  newLeaf.voTreeRoot,
  newLeaf.nonce
])

const layer2 = poseidon([
  newLeaf.c1[0],
  newLeaf.c1[1],
  newLeaf.c2[0],
  newLeaf.c2[1],
  newLeaf.xIncrement
])

const leafHash = poseidon([layer1, layer2])

// 2. 插入到树中
const leafIndex = 0  // 第一个用户
stateTree.updateLeaf(leafIndex, leafHash)
```

### 6.2 更新流程可视化

```
┌─────────────────────────────────────────────────────────────┐
│ 步骤 1: 计算新叶子哈希                                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  newLeafData → hash → newLeafHash                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 步骤 2: 更新叶子节点                                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Before:  leaf[i] = oldLeafHash                             │
│  After:   leaf[i] = newLeafHash                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 步骤 3: 向上更新父节点                                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  parentIndex = floor((leafIndex - 1) / 5)                   │
│                                                              │
│  获取该父节点的 5 个子节点                                   │
│  children = [child0, child1, ..., child4]                   │
│                                                              │
│  重新计算父节点哈希                                          │
│  newParentHash = poseidon(children)                         │
│                                                              │
│  更新父节点                                                  │
│  node[parentIndex] = newParentHash                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 步骤 4: 递归向上，直到根节点                                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  重复步骤 3，直到更新到 root (index=0)                       │
│                                                              │
│  最终：newRoot = stateTree.root                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 批量更新优化

```typescript
// 当需要更新多个叶子时，可以批量处理
function batchUpdateLeaves(
  tree: Tree,
  updates: Array<{ index: number, value: bigint }>
) {
  // 1. 收集所有需要更新的路径
  const affectedNodes = new Set<number>()
  
  for (const update of updates) {
    let currentIndex = update.index
    
    // 标记从叶子到根的所有节点
    while (currentIndex > 0) {
      affectedNodes.add(currentIndex)
      currentIndex = Math.floor((currentIndex - 1) / 5)
    }
    affectedNodes.add(0)  // 根节点
  }
  
  // 2. 按照从叶子到根的顺序更新
  const sortedNodes = Array.from(affectedNodes).sort((a, b) => b - a)
  
  for (const nodeIndex of sortedNodes) {
    if (nodeIndex >= tree.leafStartIndex) {
      // 叶子节点：直接设置
      const leafIndex = nodeIndex - tree.leafStartIndex
      const update = updates.find(u => u.index === leafIndex)
      if (update) {
        tree.nodes[nodeIndex] = update.value
      }
    } else {
      // 内部节点：重新计算哈希
      const children = tree.getChildren(nodeIndex)
      tree.nodes[nodeIndex] = poseidon(children)
    }
  }
  
  return tree.root
}
```

---

## 7. Active State Tree

### 7.1 结构说明

Active State Tree 跟踪用户的活跃状态，与 State Tree 有相同的结构，但叶子内容不同：

```
State Tree 叶子:          hash(StateLeaf) - 复杂哈希
Active State Tree 叶子:   0 或 timestamp - 简单数值
```

### 7.2 叶子值的含义

```typescript
activeStateLeaf = {
  0n:                    // 用户活跃（Active）
  非0值 (通常是timestamp): // 用户非活跃（Inactive）
}
```

### 7.3 可视化对比

```
┌──────────────────────────────────────────────────────────────┐
│                      State Tree                              │
├──────────────────────────────────────────────────────────────┤
│  Index:  0         1         2         3         4          │
│  Value:  h(leaf0)  h(leaf1)  h(leaf2)  0         0          │
│                                                               │
│  说明：存储完整的用户状态哈希                                 │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                   Active State Tree                          │
├──────────────────────────────────────────────────────────────┤
│  Index:  0         1         2         3         4          │
│  Value:  0         12345     0         0         0          │
│          ↑         ↑                                         │
│        Active    Inactive                                    │
│                (timestamp)                                    │
│                                                               │
│  说明：快速查找用户是否活跃                                   │
└──────────────────────────────────────────────────────────────┘
```

### 7.4 更新时机

```typescript
// 1. 初始状态：所有用户都是活跃的
activeStateTree.leaf(userIndex) = 0n

// 2. 用户发送 deactivate 消息并验证通过后
if (deactivateCommandValid) {
  const timestamp = getCurrentTimestamp()
  activeStateTree.updateLeaf(userIndex, timestamp)
}

// 3. 用户重新激活（AddNewKey）后
// 创建新的 state leaf，active state 自动为 0
```

### 7.5 在电路中的验证

```circom
// processMessages 电路中
component activeStateLeafQip = QuinTreeInclusionProof(stateTreeDepth);
activeStateLeafQip.leaf <== activeStateLeaf;
activeStateLeafQip.root === activeStateRoot;

// 检查是否活跃
component activate = IsZero();
activate.in <== activeStateLeaf;
// activate.out = 1 if activeStateLeaf == 0 (active)
// activate.out = 0 if activeStateLeaf != 0 (inactive)
```

---

## 8. Deactivate Tree

### 8.1 结构说明

Deactivate Tree 存储每次 deactivate 操作的记录，用于后续的 reactivate（AddNewKey）。

```
深度：stateTreeDepth + 2
容量：5^(stateTreeDepth + 2)

例如：
  stateTreeDepth = 2
  deactivateTreeDepth = 4
  容量 = 5^4 = 625 条 deactivate 记录
```

### 8.2 Deactivate Leaf 结构

```typescript
interface DeactivateLeaf {
  c1_x: bigint       // 新的 ElGamal c1.x
  c1_y: bigint       // 新的 ElGamal c1.y
  c2_x: bigint       // 新的 ElGamal c2.x
  c2_y: bigint       // 新的 ElGamal c2.y
  sharedKeyHash: bigint  // poseidon(ECDH_sharedKey)
}

// 叶子哈希
deactivateLeafHash = poseidon([c1_x, c1_y, c2_x, c2_y, sharedKeyHash])
```

### 8.3 为什么需要 Deactivate Tree？

```
┌─────────────────────────────────────────────────────────────┐
│ 问题：用户如何重新激活？                                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 1. 用户被 deactivate 后，State Leaf 中的 c1, c2 被更新      │
│    (从 encrypt(0) 变为 encrypt(1))                          │
│                                                              │
│ 2. 但是 State Tree 的叶子哈希已经改变                       │
│    用户无法直接访问旧的状态                                  │
│                                                              │
│ 3. 解决方案：Deactivate Tree 记录每次 deactivate 操作       │
│    - 存储新的加密数据 (c1', c2')                            │
│    - 存储 sharedKeyHash 用于用户查找                         │
│                                                              │
│ 4. 用户可以：                                                │
│    - 扫描 Deactivate Tree 找到自己的记录                     │
│    - 使用 rerandomize 生成新的密文 (d1, d2)                 │
│    - 提交 AddNewKey 证明重新注册                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 8.4 Deactivate Tree 更新流程

```typescript
// processDeactivateMessages 中
for (let i = 0; i < batchSize; i++) {
  const cmd = deactivateCommands[i]
  const stateIdx = cmd.stateIdx
  const stateLeaf = stateLeaves.get(stateIdx)
  
  // 1. 验证命令有效性
  const error = checkDeactivateCommand(cmd)
  
  // 2. 生成新的加密 deactivate 标记
  const newDeactivate = encryptOdevity(
    !error,  // true = deactivated (奇数)
    coordPubKey,
    randomKey
  )
  
  // 3. 计算 sharedKeyHash
  const sharedKey = genEcdhSharedKey(coordPrivKey, stateLeaf.pubKey)
  const sharedKeyHash = poseidon(sharedKey)
  
  // 4. 创建 deactivate leaf
  const dLeaf = [
    newDeactivate.c1[0],
    newDeactivate.c1[1],
    newDeactivate.c2[0],
    newDeactivate.c2[1],
    sharedKeyHash
  ]
  
  // 5. 插入到 Deactivate Tree
  const dIndex = processedDMsgCount + i
  deactivateTree.updateLeaf(dIndex, poseidon(dLeaf))
  
  // 6. 更新 Active State Tree
  if (!error) {
    activeStateTree.updateLeaf(stateIdx, timestamp)
  }
}
```

### 8.5 AddNewKey 流程

```typescript
// 用户重新激活的步骤
async function reactivate(userPrivKey: PrivKey, coordPubKey: PubKey) {
  // 1. 计算自己的 sharedKeyHash
  const sharedKey = genEcdhSharedKey(userPrivKey, coordPubKey)
  const mySharedKeyHash = poseidon(sharedKey)
  
  // 2. 扫描 Deactivate Tree 找到自己的记录
  let myDeactivateIndex = -1
  for (let i = 0; i < deactivateTree.leafCount; i++) {
    const dLeaf = deactivateLeaves[i]
    if (dLeaf[4] === mySharedKeyHash) {
      myDeactivateIndex = i
      break
    }
  }
  
  if (myDeactivateIndex < 0) {
    throw new Error('Deactivate record not found')
  }
  
  // 3. Rerandomize 密文
  const dLeaf = deactivateLeaves[myDeactivateIndex]
  const c1 = [dLeaf[0], dLeaf[1]]
  const c2 = [dLeaf[2], dLeaf[3]]
  
  const randomVal = genRandomSalt()
  const { d1, d2 } = rerandomize(coordPubKey, { c1, c2 }, randomVal)
  
  // 4. 生成 nullifier（防止重复使用）
  const nullifier = poseidon([userPrivKey, NULLIFIER_CONSTANT])
  
  // 5. 生成 Merkle 证明
  const deactivateLeafHash = poseidon(dLeaf)
  const pathElements = deactivateTree.pathElementOf(myDeactivateIndex)
  
  // 6. 计算 inputHash
  const inputHash = computeInputHash([
    deactivateTree.root,
    poseidon(coordPubKey),
    nullifier,
    d1[0], d1[1],
    d2[0], d2[1]
  ])
  
  // 7. 生成 ZK 证明
  const proof = await generateProof('AddNewKey', {
    inputHash,
    coordPubKey,
    deactivateRoot: deactivateTree.root,
    deactivateIndex: myDeactivateIndex,
    deactivateLeaf: deactivateLeafHash,
    c1, c2,
    randomVal,
    d1, d2,
    deactivateLeafPathElements: pathElements,
    nullifier,
    oldPrivateKey: userPrivKey
  })
  
  // 8. 提交到链上
  await contract.addNewKey(proof, d1, d2, nullifier)
}
```

---

## 9. 实际示例

### 9.1 完整场景：3 个用户投票

```typescript
// ============ 初始化 ============
const operator = new OperatorClient(config)
operator.initMaci({
  stateTreeDepth: 2,      // 最多 25 个用户
  voteOptionTreeDepth: 1, // 5 个投票选项
  batchSize: 5,
  maxVoteOptions: 5,
  numSignUps: 25,
  isAmaci: true
})

// 初始状态
console.log('Initial State Tree Root:', operator.stateTree.root)
console.log('Initial Active State Tree Root:', operator.activeStateTree.root)

// ============ 用户注册 ============
// 用户 1
const user1 = genKeypair()
operator.initStateTree(
  0,  // leafIdx
  user1.pubKey,
  100,  // balance
  [0n, 0n, 0n, 0n]  // c1, c2 (初始为 0 = active)
)

// 用户 2
const user2 = genKeypair()
operator.initStateTree(1, user2.pubKey, 100, [0n, 0n, 0n, 0n])

// 用户 3
const user3 = genKeypair()
operator.initStateTree(2, user3.pubKey, 100, [0n, 0n, 0n, 0n])

console.log('\n=== After SignUp ===')
console.log('State Tree Root:', operator.stateTree.root)
console.log('State Leaves:', operator.stateLeaves.size)

// ============ 投票阶段 ============
// 用户 1 投票给选项 0，10 票
const vote1 = operator.batchGenMessage(
  0,  // stateIdx
  coordPubKey,
  [[0, 10]],  // [optionIdx, votes]
  user1DeriveParams
)
operator.pushMessage(vote1[0].msg, vote1[0].encPubkeys)

// 用户 2 投票给选项 1，5 票
const vote2 = operator.batchGenMessage(
  1,
  coordPubKey,
  [[1, 5]],
  user2DeriveParams
)
operator.pushMessage(vote2[0].msg, vote2[0].encPubkeys)

// 用户 2 修改投票：选项 1 改为 8 票
const vote2_update = operator.batchGenMessage(
  1,
  coordPubKey,
  [[1, 8]],
  user2DeriveParams
)
operator.pushMessage(vote2_update[0].msg, vote2_update[0].encPubkeys)

// 用户 3 发起 deactivate
const deactivate3 = operator.buildDeactivatePayload({
  stateIdx: 2,
  operatorPubkey: coordPubKey,
  derivePathParams: user3DeriveParams
})
operator.pushDeactivateMessage(deactivate3.msg, deactivate3.encPubkeys)

console.log('\n=== After Voting ===')
console.log('Total Messages:', operator.messages.length)
console.log('Total Deactivate Messages:', operator.dMessages.length)

// ============ 结束投票期 ============
operator.endVotePeriod()

// ============ 处理 Deactivate 消息 ============
const deactivateResult = await operator.processDeactivateMessages({
  inputSize: 5,
  subStateTreeLength: 25,
  wasmFile: 'ProcessDeactivateMessages.wasm',
  zkeyFile: 'ProcessDeactivateMessages.zkey'
})

console.log('\n=== After Process Deactivate ===')
console.log('New Deactivate Root:', deactivateResult.input.newDeactivateRoot)
console.log('Active State Tree Root:', operator.activeStateTree.root)
console.log('User 3 Active State:', operator.activeStateTree.leaf(2))  // 非 0 = inactive

// ============ 处理投票消息 ============
// 第一批：消息 0-2
const batch1 = await operator.processMessages({
  newStateSalt: 0n,
  wasmFile: 'ProcessMessages.wasm',
  zkeyFile: 'ProcessMessages.zkey'
})

console.log('\n=== After Process Messages Batch 1 ===')
console.log('New State Root:', operator.stateTree.root)
console.log('User 1 Balance:', operator.stateLeaves.get(0)?.balance)  // 100 - 10 = 90
console.log('User 2 Balance:', operator.stateLeaves.get(1)?.balance)  // 100 - 8 = 92

// 验证 State Tree 结构
console.log('\n=== State Tree Structure ===')
for (let i = 0; i < 3; i++) {
  const leaf = operator.stateLeaves.get(i)
  if (leaf) {
    console.log(`\nUser ${i}:`)
    console.log('  pubKey:', leaf.pubKey)
    console.log('  balance:', leaf.balance)
    console.log('  nonce:', leaf.nonce)
    console.log('  voted:', leaf.voted)
    console.log('  voTree root:', leaf.voTree.root)
    console.log('  votes:', leaf.voTree.leaves())
  }
}

// ============ 用户 3 重新激活 ============
const addKeyPayload = await operator.buildAddNewKeyPayload({
  stateTreeDepth: 2,
  operatorPubkey: coordPubKey,
  deactivates: deactivateResult.newDeactivate,
  wasmFile: 'AddNewKey.wasm',
  zkeyFile: 'AddNewKey.zkey',
  derivePathParams: user3DeriveParams
})

console.log('\n=== AddNewKey Payload ===')
console.log('Proof:', addKeyPayload.proof)
console.log('d (rerandomized):', addKeyPayload.d)
console.log('Nullifier:', addKeyPayload.nullifier)

// 链上提交后，用户 3 可以重新注册并投票
```

### 9.2 树状态快照

```
=== 初始状态 ===

State Tree (depth=2):
                    root
                     │
        ┌────────────┼────────────┬────────────┬────────────┐
        │            │            │            │            │
       n1           z            z            z            z
        │
        └─ (全是零值)

Active State Tree:
                    root
                     │
        ┌────────────┼────────────┬────────────┬────────────┐
        │            │            │            │            │
        0            0            0            0            0
        │
        └─ (全是 0 = 全部活跃)

Deactivate Tree:
                    (空)


=== 用户注册后 ===

State Tree:
                    root'
                     │
        ┌────────────┼────────────┬────────────┬────────────┐
        │            │            │            │            │
       n1'          z            z            z            z
        │
    ┌───┼───┬───┬───┬───┐
    │   │   │   │   │   │
   h0  h1  h2  z   z

其中:
  h0 = hash(stateLeaf0)  // 用户 1
  h1 = hash(stateLeaf1)  // 用户 2
  h2 = hash(stateLeaf2)  // 用户 3

Active State Tree: (不变)
  所有叶子仍为 0


=== 投票后 ===

State Tree:
  (与注册后相同，因为还未处理)

Messages Queue:
  [msg0, msg1, msg2]  // 3 条投票消息

Deactivate Messages Queue:
  [dmsg0]  // 1 条 deactivate 消息


=== 处理 Deactivate 后 ===

Active State Tree:
                    root''
                     │
        ┌────────────┼────────────┬────────────┬────────────┐
        │            │            │            │            │
       n1''         0            0            0            0
        │
    ┌───┼───┬───┬───┬───┐
    │   │   │   │   │   │
    0   0  12345 0   0
             ↑
        用户 3 inactive

Deactivate Tree:
                    root
                     │
        ┌────────────┼────────────┬────────────┬────────────┐
        │            │            │            │            │
       n1           0            0            0            0
        │
    ┌───┼───┬───┬───┬───┐
    │   │   │   │   │   │
   d0   0   0   0   0

其中:
  d0 = hash([c1'_x, c1'_y, c2'_x, c2'_y, sharedKeyHash])


=== 处理投票消息后 ===

State Tree:
                    root'''
                     │
        ┌────────────┼────────────┬────────────┬────────────┐
        │            │            │            │            │
       n1'''        z            z            z            z
        │
    ┌───┼───┬───┬───┬───┐
    │   │   │   │   │   │
   h0' h1' h2  z   z

其中:
  h0' = hash(stateLeaf0')  // 用户 1 投票后
  h1' = hash(stateLeaf1')  // 用户 2 投票后
  h2 = 不变 (用户 3 的消息被拒绝)

StateLeaf 0' (用户 1):
  pubKey: [unchanged]
  balance: 90 (100 - 10)
  voTreeRoot: hash([10, 0, 0, 0, 0])  // 选项 0 有 10 票
  nonce: 1
  c1, c2: [unchanged]

StateLeaf 1' (用户 2):
  pubKey: [unchanged]
  balance: 92 (100 - 8)
  voTreeRoot: hash([0, 8, 0, 0, 0])  // 选项 1 有 8 票
  nonce: 2 (两条消息)
  c1, c2: [unchanged]
```

---

## 10. 性能分析

### 10.1 树操作复杂度

| 操作 | 时间复杂度 | 空间复杂度 | 说明 |
|-----|-----------|-----------|------|
| 插入/更新叶子 | O(depth) | O(1) | 需要更新从叶子到根的路径 |
| 查询叶子 | O(1) | O(1) | 直接索引访问 |
| 生成 Merkle 证明 | O(depth) | O(depth × arity) | 收集路径上的兄弟节点 |
| 验证 Merkle 证明 | O(depth) | O(1) | 电路中验证 |
| 批量更新 | O(k × depth) | O(k) | k 个叶子的批量更新 |

### 10.2 哈希计算成本

```
Poseidon 哈希 (5 inputs):
  - 电路约束: ~150
  - 计算时间: ~0.1ms (JS)

State Leaf 哈希 (AMACI):
  - 2 次 Poseidon(5) + 1 次 Poseidon(2)
  - 总约束: ~450
  - 计算时间: ~0.3ms

内部节点哈希:
  - 1 次 Poseidon(5)
  - 约束: ~150
  - 计算时间: ~0.1ms
```

### 10.3 树大小建议

```
根据用户数量选择 stateTreeDepth:

用户数 ≤ 5:     depth = 1
用户数 ≤ 25:    depth = 2  ✓ 推荐
用户数 ≤ 125:   depth = 3  ✓ 推荐
用户数 ≤ 625:   depth = 4
用户数 ≤ 3125:  depth = 5

考虑因素:
- 深度越大，Merkle 证明越长，电路约束越多
- 深度越小，树容量越小
- depth=2-3 是最佳平衡点
```

---

## 11. 常见问题

### Q1: 为什么使用 5-ary tree 而不是 binary tree？

**A:** 
- **减少深度**: 5-ary tree 深度为 log₅(n)，binary tree 深度为 log₂(n)
  - 例如 125 个叶子：5-ary depth=3, binary depth=7
- **减少约束**: Merkle 证明路径更短，电路约束更少
- **Poseidon 优化**: Poseidon 可以高效处理多个输入

### Q2: 为什么 State Tree 的零值是 zeroHash10？

**A:**
- AMACI 的 State Leaf 有 10 个字段
- 空叶子需要有一致的哈希值
- `zeroHash10 = hash(hash(0,0,0,0,0), hash(0,0,0,0,0))`
- 这样空叶子和"全零数据的叶子"有相同的哈希

### Q3: 如何快速查找用户的 State Leaf？

**A:**
链上合约维护一个映射：
```solidity
mapping(PubKey => StateIndex) pubKeyToIndex

// 用户查询
uint256 myIndex = pubKeyToIndex[myPubKey]
```

或者用户记住自己的 stateIdx（在 signUp 时返回）。

### Q4: Deactivate Tree 会不会无限增长？

**A:**
是的，每次 deactivate 操作都会添加一个新叶子。解决方案：
1. 设置足够大的深度（如 stateTreeDepth + 2）
2. 定期清理已使用的 deactivate 记录（通过 nullifier 标记）
3. 未来可以使用"滚动"机制，重置 tree

### Q5: 为什么需要 Active State Tree 和 State Leaf 中的 c1/c2？

**A:**
- **Active State Tree**: 快速检查，O(1) 查询，但不提供隐私
- **c1/c2 in State Leaf**: 加密保护，提供隐私，但需要解密

两者结合：
- Operator 处理时检查 Active State Tree（快速）
- 电路验证时解密 c1/c2（隐私）
- 双重保护，既快速又安全

---

## 12. 参考资料

### 相关文档
- [AMACI-ProcessMessages-Analysis.md](./AMACI-ProcessMessages-Analysis.md)
- [ProcessMessages.md](./ProcessMessages.md)
- [StateLeafTransformer.md](./StateLeafTransformer.md)

### 代码实现
- Tree 实现: `packages/sdk/src/libs/crypto/tree.ts`
- Operator: `packages/sdk/src/operator.ts`
- 电路: `packages/circuits/circom/amaci/power/`

### 学术资源
- [Merkle Tree (Wikipedia)](https://en.wikipedia.org/wiki/Merkle_tree)
- [Poseidon Hash](https://www.poseidon-hash.info/)
- [ElGamal Encryption](https://en.wikipedia.org/wiki/ElGamal_encryption)

---

*文档版本: 1.0*  
*最后更新: 2024-12*  
*作者: MACI Development Team*

