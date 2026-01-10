# TallyVotes 状态树批次验证详解

## 问题：这段代码在验证什么？

```circom
// 第 95-116 行
component stateSubroot = QuinCheckRoot(intStateTreeDepth);
component stateLeafHasher[batchSize];
for (var i = 0; i < batchSize; i ++) {
    stateLeafHasher[i] = Hasher5();
    for (var j = 0; j < STATE_LEAF_LENGTH; j ++) {
        stateLeafHasher[i].in[j] <== stateLeaf[i][j];
    }
    stateSubroot.leaves[i] <== stateLeafHasher[i].hash;
}

component stateQle = QuinLeafExists(k);
component statePathIndices = QuinGeneratePathIndices(k);
statePathIndices.in <== inputHasher.batchNum;
stateQle.leaf <== stateSubroot.root;
stateQle.root <== stateRoot;
for (var i = 0; i < k; i ++) {
    stateQle.path_index[i] <== statePathIndices.out[i];
    for (var j = 0; j < TREE_ARITY - 1; j ++) {
        stateQle.path_elements[i][j] <== statePathElements[i][j];
    }
}
```

## 核心功能

**这段代码在验证：Operator 提供的这批用户状态叶子，确实来自最终的状态树！**

防止 Operator：
- ❌ 伪造用户的投票数据
- ❌ 使用错误的状态树
- ❌ 添加不存在的用户
- ❌ 修改用户的投票记录

## 树结构理解

### 状态树的分层结构

```
配置示例:
  stateTreeDepth = 4       (总深度)
  intStateTreeDepth = 2    (中间深度)
  k = 4 - 2 = 2           (剩余深度)
  batchSize = 5^2 = 25    (每批 25 个用户)

状态树结构:
                        StateRoot (Level 4)
                    /    /    |    \    \
                   /    /     |     \    \
              SubRoot0...SubRoot24      (Level 2) ← intStateTreeDepth
              /  |  \                              ↑
             /   |   \                             │
            /    |    \                            │ 这是批次的子树根
        User0 User1...User24 (Level 0)            │
        │                                          │
        └─ 这批 25 个用户的叶子                     │
                                                   │
        验证: SubRoot0 存在于 StateRoot 中 ←────────┘
```

### 关键参数

```javascript
// 参数关系
stateTreeDepth = 4        // 完整状态树深度
intStateTreeDepth = 2     // 批次内部子树深度
k = stateTreeDepth - intStateTreeDepth = 2  // 子树根到总根的深度

// 批次大小
batchSize = 5^intStateTreeDepth = 5^2 = 25

// 总用户数
maxUsers = 5^stateTreeDepth = 5^4 = 625

// 批次数量
numBatches = 5^k = 5^2 = 25
```

## 验证流程分解

### 步骤 1: 哈希状态叶子（第 97-104 行）

```circom
component stateLeafHasher[batchSize];
for (var i = 0; i < batchSize; i ++) {
    stateLeafHasher[i] = Hasher5();
    for (var j = 0; j < STATE_LEAF_LENGTH; j ++) {
        stateLeafHasher[i].in[j] <== stateLeaf[i][j];
    }
    stateSubroot.leaves[i] <== stateLeafHasher[i].hash;
}
```

**功能**：将每个用户的状态叶子（5个字段）哈希成单个值

**示例**：
```javascript
// 用户 0 的状态叶子
stateLeaf[0] = [
  pubKey_x: 123456789...,
  pubKey_y: 987654321...,
  voiceCreditBalance: 631,
  voteOptionRoot: 0x7a8f...,
  nonce: 5
]

// 哈希
hash0 = Poseidon5([123456789, 987654321, 631, 0x7a8f, 5])
     = 0xabc123...

// 对所有 25 个用户重复
hashes = [hash0, hash1, hash2, ..., hash24]
```

### 步骤 2: 计算批次子树根（第 96 行）

```circom
component stateSubroot = QuinCheckRoot(intStateTreeDepth);
```

**功能**：从 25 个叶子哈希构建五叉树，得到批次的子树根

**示例**（intStateTreeDepth=2）：

```
Level 2 (子树根):
              SubRoot
           /  /  |  \  \
          /  /   |   \  \
    Level 1:
      Node0  Node1  Node2  Node3  Node4
      /|\    /|\    /|\    /|\    /|\
     / | \  / | \  / | \  / | \  / | \
Level 0 (叶子):
    H0 H1... H5... H10... H15... H20...
    │  │     │     │      │      │
    25 个用户的哈希值

计算过程:
  Node0 = Poseidon5([H0, H1, H2, H3, H4])
  Node1 = Poseidon5([H5, H6, H7, H8, H9])
  Node2 = Poseidon5([H10, H11, H12, H13, H14])
  Node3 = Poseidon5([H15, H16, H17, H18, H19])
  Node4 = Poseidon5([H20, H21, H22, H23, H24])
  
  SubRoot = Poseidon5([Node0, Node1, Node2, Node3, Node4])
```

### 步骤 3: 生成路径索引（第 107-108 行）

```circom
component statePathIndices = QuinGeneratePathIndices(k);
statePathIndices.in <== inputHasher.batchNum;
```

**功能**：将批次编号转换为五叉树的路径索引

**示例**：
```javascript
// k = 2 (从子树根到总根需要 2 层)
// batchNum = 7 (第 7 批)

// 五进制转换
7 (十进制) = 12 (五进制)
           = [2, 1] (从低位到高位)

pathIndices[0] = 2  // Level 0 的位置
pathIndices[1] = 1  // Level 1 的位置

// 批次编号对应关系 (k=2)
batchNum  五进制  pathIndices
0         00      [0, 0]
1         01      [1, 0]
2         02      [2, 0]
3         03      [3, 0]
4         04      [4, 0]
5         10      [0, 1]
6         11      [1, 1]
7         12      [2, 1]  ← 示例
...
24        44      [4, 4]
```

### 步骤 4: 验证子树根存在（第 106, 109-116 行）

```circom
component stateQle = QuinLeafExists(k);
stateQle.leaf <== stateSubroot.root;    // 子树根
stateQle.root <== stateRoot;            // 总状态根
for (var i = 0; i < k; i ++) {
    stateQle.path_index[i] <== statePathIndices.out[i];
    for (var j = 0; j < TREE_ARITY - 1; j ++) {
        stateQle.path_elements[i][j] <== statePathElements[i][j];
    }
}
```

**功能**：使用 Merkle 证明验证子树根在完整状态树中的正确位置

**示例**（k=2, batchNum=7）：

```
完整状态树 (stateTreeDepth=4):
                        StateRoot
                    /   /   |   \   \
                   /   /    |    \   \
          Level 3: L3-0 L3-1 ... L3-4
                     |
                     └─ L3-1 展开
                        /  /  |  \  \
               Level 2: L2-5 L2-6 L2-7 L2-8 L2-9
                                  |
                                  └─ L2-7 = SubRoot (我们的批次)
                                      /  /  |  \  \
                             Level 1: ...
                                      /  /  |  \  \
                             Level 0: User175...User199

验证路径:
  起点: SubRoot = L2-7
  
  Level 0 (从 L2-7 到 L3-1):
    path_index[0] = 2 (L2-7 在 5 个兄弟中的位置)
    siblings = [L2-5, L2-6, L2-8, L2-9] (其他 4 个兄弟)
    parent = Poseidon5([L2-5, L2-6, SubRoot, L2-8, L2-9])
           = L3-1 ✓
  
  Level 1 (从 L3-1 到 StateRoot):
    path_index[1] = 1 (L3-1 在 5 个兄弟中的位置)
    siblings = [L3-0, L3-2, L3-3, L3-4]
    root = Poseidon5([L3-0, L3-1, L3-2, L3-3, L3-4])
         = StateRoot ✓
  
验证成功！SubRoot 确实在正确的位置！
```

## Operator 完整处理流程

### 阶段 1: ProcessMessages 完成后

```javascript
// 经过 ProcessMessages，得到最终状态树
finalStateTree = {
  root: 0x9876...,
  leaves: [
    // 625 个用户的状态叶子
    [pk0_x, pk0_y, balance0, voRoot0, nonce0],
    [pk1_x, pk1_y, balance1, voRoot1, nonce1],
    // ...
    [pk624_x, pk624_y, balance624, voRoot624, nonce624]
  ]
}

console.log("State tree finalized!");
console.log("Root:", finalStateTree.root);
console.log("Total users:", 625);
```

### 阶段 2: 准备批次数据

```javascript
// 配置
const stateTreeDepth = 4;
const intStateTreeDepth = 2;
const k = stateTreeDepth - intStateTreeDepth;  // 2
const batchSize = 5 ** intStateTreeDepth;      // 25

function prepareBatch(batchNum) {
  const startIndex = batchNum * batchSize;
  
  console.log(`\n=== 准备批次 ${batchNum} ===`);
  console.log(`用户范围: ${startIndex} - ${startIndex + batchSize - 1}`);
  
  // 1. 读取这批用户的状态叶子
  const stateLeaves = [];
  for (let i = 0; i < batchSize; i++) {
    const userIndex = startIndex + i;
    const leaf = finalStateTree.getLeaf(userIndex);
    stateLeaves.push(leaf);
    
    console.log(`  用户 ${userIndex}:`, {
      balance: leaf[2],
      voRoot: leaf[3].toString(16).slice(0, 10) + "...",
      nonce: leaf[4]
    });
  }
  
  // 2. 准备子树根到总根的 Merkle 路径
  const statePathElements = getSubrootPath(finalStateTree, batchNum, k);
  
  console.log(`\n计算批次子树根...`);
  // 哈希每个叶子
  const leafHashes = stateLeaves.map(leaf => {
    return poseidon5(leaf);
  });
  
  // 构建子树
  const subRoot = buildQuinTree(leafHashes, intStateTreeDepth);
  console.log(`子树根: ${subRoot.toString(16).slice(0, 16)}...`);
  
  // 3. 验证路径（链下预检查）
  const isValid = verifyPath(subRoot, statePathElements, batchNum, finalStateTree.root, k);
  console.log(`路径验证: ${isValid ? '✓' : '✗'}`);
  
  return {
    stateLeaves,
    statePathElements,
    subRoot
  };
}

// 辅助函数：获取子树根到总根的路径
function getSubrootPath(tree, batchNum, depth) {
  // 将 batchNum 转换为五进制路径
  const pathIndices = [];
  let remaining = batchNum;
  for (let i = 0; i < depth; i++) {
    pathIndices.push(remaining % 5);
    remaining = Math.floor(remaining / 5);
  }
  
  // 获取每层的兄弟节点
  const pathElements = [];
  let currentNode = tree.getSubRoot(batchNum, intStateTreeDepth);
  
  for (let level = 0; level < depth; level++) {
    const siblings = tree.getSiblingsAtLevel(currentNode, stateTreeDepth - depth + level);
    pathElements.push(siblings);  // [4 个兄弟]
    currentNode = tree.getParent(currentNode);
  }
  
  return pathElements;
}

// 辅助函数：构建五叉树
function buildQuinTree(leaves, depth) {
  if (depth === 0) {
    return leaves[0];
  }
  
  const numLeaves = 5 ** depth;
  const levelSize = 5 ** (depth - 1);
  const parentLevel = [];
  
  for (let i = 0; i < 5; i++) {
    const childStart = i * levelSize;
    const children = leaves.slice(childStart, childStart + levelSize);
    const parent = poseidon5(children);
    parentLevel.push(parent);
  }
  
  if (depth === 1) {
    return poseidon5(parentLevel);
  }
  
  return buildQuinTree(parentLevel, depth - 1);
}
```

### 阶段 3: 实际执行示例

```javascript
// ============ 批次 0 示例 ============
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("处理批次 0");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const batch0 = prepareBatch(0);

// 输出示例:
// === 准备批次 0 ===
// 用户范围: 0 - 24
//   用户 0: { balance: 900, voRoot: '0x7a8f...', nonce: 1 }
//   用户 1: { balance: 375, voRoot: '0x4b2c...', nonce: 1 }
//   用户 2: { balance: 100, voRoot: '0x0000...', nonce: 0 }
//   ...
//   用户 24: { balance: 780, voRoot: '0x3e9d...', nonce: 1 }
// 
// 计算批次子树根...
// 子树根: 0x1a2b3c4d5e6f7890...
// 路径验证: ✓

console.log("\n生成电路输入...");
const circuitInputs = {
  // 状态数据
  stateRoot: finalStateTree.root,
  stateSalt: stateSalt,
  stateLeaf: batch0.stateLeaves,
  statePathElements: batch0.statePathElements,  // [k][4] = [2][4]
  
  // ... 其他输入
};

// 电路内部验证 (第 95-116 行代码执行):
console.log("\n电路验证:");
console.log("1. 哈希 25 个状态叶子...");
// [hash0, hash1, ..., hash24]

console.log("2. 构建子树根...");
// SubRoot = QuinCheckRoot([hash0, ..., hash24], depth=2)

console.log("3. 生成路径索引...");
// batchNum=0 → pathIndices=[0, 0]

console.log("4. 验证 Merkle 路径...");
// QuinLeafExists(SubRoot, pathElements, [0,0], StateRoot)
// ✓ 验证通过!

console.log("\n批次 0 证明生成成功!");

// ============ 批次 7 示例 ============
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("处理批次 7");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const batch7 = prepareBatch(7);

// 输出示例:
// === 准备批次 7 ===
// 用户范围: 175 - 199
//   用户 175: { balance: 450, voRoot: '0xa1b2...', nonce: 2 }
//   用户 176: { balance: 625, voRoot: '0xc3d4...', nonce: 1 }
//   ...
//   用户 199: { balance: 890, voRoot: '0xe5f6...', nonce: 3 }
// 
// 计算批次子树根...
// 子树根: 0x8d7c6b5a4f3e2d1c...
// 
// 路径信息:
// batchNum=7 → 五进制=12 → pathIndices=[2, 1]
// Level 0: 子树根在位置 2 (共 5 个)
//   siblings: [L2-5, L2-6, L2-8, L2-9]
// Level 1: 父节点在位置 1 (共 5 个)
//   siblings: [L3-0, L3-2, L3-3, L3-4]
// 
// 路径验证: ✓

console.log("\n生成电路输入...");
const circuitInputs7 = {
  stateRoot: finalStateTree.root,
  stateSalt: stateSalt,
  stateLeaf: batch7.stateLeaves,
  statePathElements: batch7.statePathElements,
  // statePathElements[0] = [L2-5_hash, L2-6_hash, L2-8_hash, L2-9_hash]
  // statePathElements[1] = [L3-0_hash, L3-2_hash, L3-3_hash, L3-4_hash]
};

console.log("\n电路验证:");
console.log("1. 哈希 25 个状态叶子 (用户 175-199)...");
console.log("2. 构建子树根: 0x8d7c6b5a...");
console.log("3. 生成路径索引: [2, 1]");
console.log("4. 验证 Merkle 路径:");
console.log("   Level 0: parent = Poseidon5([sibs[0], sibs[1], SubRoot, sibs[2], sibs[3]])");
console.log("   Level 1: root = Poseidon5([sibs[0], parent, sibs[1], sibs[2], sibs[3]])");
console.log("   ✓ root === StateRoot");

console.log("\n批次 7 证明生成成功!");
```

## 完整实例：详细跟踪

### 实例：批次 7 的完整验证

**配置**：
```javascript
stateTreeDepth = 4
intStateTreeDepth = 2
k = 2
batchSize = 25
numUsers = 625
numBatches = 25
```

**批次 7 包含的用户**：
```javascript
batchNum = 7
startIndex = 7 * 25 = 175
endIndex = 199

用户: [175, 176, 177, ..., 199]
```

**步骤 1: 读取状态叶子**
```javascript
stateLeaf[0] = [pk175_x, pk175_y, 450, 0xa1b2..., 2]  // 用户 175
stateLeaf[1] = [pk176_x, pk176_y, 625, 0xc3d4..., 1]  // 用户 176
// ...
stateLeaf[24] = [pk199_x, pk199_y, 890, 0xe5f6..., 3] // 用户 199
```

**步骤 2: 哈希叶子**
```javascript
hash175 = Poseidon5(stateLeaf[0]) = 0x1111...
hash176 = Poseidon5(stateLeaf[1]) = 0x2222...
// ...
hash199 = Poseidon5(stateLeaf[24]) = 0xaaaa...

allHashes = [hash175, hash176, ..., hash199]  // 25 个哈希
```

**步骤 3: 构建子树 (intStateTreeDepth=2)**
```
Level 0 (25 个叶子):
  hash175, hash176, hash177, hash178, hash179,
  hash180, hash181, hash182, hash183, hash184,
  hash185, hash186, hash187, hash188, hash189,
  hash190, hash191, hash192, hash193, hash194,
  hash195, hash196, hash197, hash198, hash199

Level 1 (5 个节点):
  node0 = Poseidon5([hash175, hash176, hash177, hash178, hash179])
  node1 = Poseidon5([hash180, hash181, hash182, hash183, hash184])
  node2 = Poseidon5([hash185, hash186, hash187, hash188, hash189])
  node3 = Poseidon5([hash190, hash191, hash192, hash193, hash194])
  node4 = Poseidon5([hash195, hash196, hash197, hash198, hash199])

Level 2 (子树根):
  SubRoot7 = Poseidon5([node0, node1, node2, node3, node4])
           = 0x8d7c6b5a...
```

**步骤 4: 计算路径索引**
```javascript
batchNum = 7
7 (十进制) = 12 (五进制)

pathIndices[0] = 7 % 5 = 2
pathIndices[1] = Math.floor(7 / 5) % 5 = 1

// [2, 1]
```

**步骤 5: 获取路径元素**
```javascript
// Level 0: SubRoot7 在其父节点的位置 2
// 需要 4 个兄弟 (位置 0, 1, 3, 4)
statePathElements[0] = [
  SubRoot5,   // 位置 0
  SubRoot6,   // 位置 1
  SubRoot8,   // 位置 3
  SubRoot9    // 位置 4
]

// Level 1: 父节点在总根的位置 1
// 需要 4 个兄弟 (位置 0, 2, 3, 4)
statePathElements[1] = [
  Level3_Node0,  // 位置 0
  Level3_Node2,  // 位置 2
  Level3_Node3,  // 位置 3
  Level3_Node4   // 位置 4
]
```

**步骤 6: 验证路径**
```javascript
// 电路内部执行

// Level 0 验证
parent1 = Poseidon5([
  statePathElements[0][0],  // SubRoot5 (位置 0)
  statePathElements[0][1],  // SubRoot6 (位置 1)
  SubRoot7,                 // 我们的子树根 (位置 2)
  statePathElements[0][2],  // SubRoot8 (位置 3)
  statePathElements[0][3]   // SubRoot9 (位置 4)
])
// parent1 = Level3_Node1

// Level 1 验证
calculatedRoot = Poseidon5([
  statePathElements[1][0],  // Level3_Node0 (位置 0)
  parent1,                  // Level3_Node1 (位置 1)
  statePathElements[1][1],  // Level3_Node2 (位置 2)
  statePathElements[1][2],  // Level3_Node3 (位置 3)
  statePathElements[1][3]   // Level3_Node4 (位置 4)
])

// 最终验证
require(calculatedRoot === stateRoot)  ✓
```

**验证成功！** 证明 SubRoot7 确实是 StateRoot 的一部分！

## 为什么需要这个验证？

### 防止攻击场景

**攻击 1: 伪造用户投票**
```javascript
// Operator 尝试修改用户 175 的投票
真实: stateLeaf[0] = [pk175, 450, 0xa1b2..., 2]  // voteOptionRoot=0xa1b2
伪造: stateLeaf[0] = [pk175, 450, 0xBAD..., 2]   // ← 修改了 voteOptionRoot

// 计算子树根
伪造的 hash175 = Poseidon5([pk175, 450, 0xBAD..., 2])
伪造的 SubRoot7 = QuinRoot([伪造的hash175, ...])

// 验证路径
calculatedRoot = verifyPath(伪造的SubRoot7, pathElements, ...)
calculatedRoot ≠ stateRoot  ✗

// 证明生成失败！
```

**攻击 2: 使用错误的状态树**
```javascript
// Operator 尝试使用旧的状态树
当前 stateRoot = 0x9876... (ProcessMessages 的最终根)
旧的 stateRoot = 0x1234... (某个中间状态)

// Operator 从旧树读取数据
oldStateLeaves = oldStateTree.getLeaves(175, 199)
oldSubRoot = QuinRoot(oldStateLeaves)

// 验证路径
calculatedRoot = verifyPath(oldSubRoot, pathElements, ...)
calculatedRoot ≠ 0x9876...  ✗

// 证明生成失败！
```

**攻击 3: 添加不存在的用户**
```javascript
// Operator 尝试添加额外的虚假用户
fakeLeaf = [fake_pk, 1000, 0xfake..., 0]
stateLeaves = [真实的25个用户... + fakeLeaf]  // 26 个

// 构建子树
fakeSubRoot = QuinRoot(stateLeaves)  // 用 26 个叶子

// 问题：电路期望 batchSize=25
// 电路约束失败！
```

## 总结

### 这段代码的作用

**95-104 行**：哈希状态叶子并构建批次子树
- 输入：25 个用户的状态叶子
- 输出：批次子树根

**106-116 行**：验证子树根在完整状态树中
- 输入：子树根 + Merkle 路径 + 批次编号
- 验证：子树根确实在正确位置
- 输出：验证通过 ✓

### 安全保证

通过这个验证，确保：
1. ✅ 状态叶子来自正确的最终状态树
2. ✅ 批次编号对应正确的用户范围
3. ✅ 无法伪造或修改用户投票数据
4. ✅ 无法使用错误的状态树
5. ✅ 无法添加或删除用户

### 数据流

```
ProcessMessages 输出
    ↓
最终状态树 (stateRoot 固定)
    ↓
TallyVotes 读取批次数据
    ↓
计算子树根
    ↓
验证子树根在状态树中 ← 这段代码
    ↓
提取投票并累加
    ↓
生成结果证明
```

这是 TallyVotes 安全性的基石之一！

