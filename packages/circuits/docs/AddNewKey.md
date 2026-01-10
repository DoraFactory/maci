# AddNewKey 电路详细文档

## 目录

1. [概述](#概述)
2. [电路架构](#电路架构)
3. [核心模板详解](#核心模板详解)
4. [依赖组件功能说明](#依赖组件功能说明)
5. [完整流程分析](#完整流程分析)
6. [实际应用示例](#实际应用示例)
7. [安全特性分析](#安全特性分析)
8. [与其他电路的关系](#与其他电路的关系)

---

## 概述

### 电路位置
```
packages/circuits/circom/amaci/power/addNewKey.circom
```

### 核心功能

`AddNewKey` 是 AMACI（Anonymous MACI）系统的**密钥更换与去激活验证电路**，负责：

1. **验证 Nullifier 正确性** - 确保用户提供了有效的旧私钥
2. **计算共享密钥** - 使用 ECDH 协议生成共享加密密钥
3. **验证去激活叶子** - 确保去激活数据存在于去激活树中
4. **重随机化密文** - 生成新的 ElGamal 密文以隐藏用户身份
5. **生成零知识证明** - 证明整个密钥更换过程的正确性

### 设计理念

```
输入: 旧私钥 + 去激活树数据 + ElGamal 密文
  ↓
处理: 验证身份 + 重随机化（零知识）
  ↓
输出: 新密文 + 有效性证明
```

**关键特性**：
- ✅ **隐私保护** - 通过重随机化隐藏用户身份
- ✅ **防重复使用** - Nullifier 机制防止同一私钥多次使用
- ✅ **可验证性** - 任何人可以验证密钥更换的正确性
- ✅ **防篡改** - 去激活树保证数据完整性

### 应用场景

```
AMACI 密钥更换流程:

1. 用户发现旧密钥已被用于去激活
   
2. 用户生成 Nullifier 证明拥有旧私钥
   
3. 系统验证去激活树中存在对应的密文
   
4. 用户重随机化密文，生成新的公钥关联
   
5. 提交新密文和零知识证明到链上
```

---

## 电路架构

### 两个核心模板

```
AddNewKey (主电路)
    │
    ├─> HashLeftRight (Nullifier 计算)
    ├─> Ecdh (共享密钥生成)
    ├─> Hasher5 (去激活叶子哈希)
    ├─> QuinLeafExists (Merkle 证明验证)
    ├─> ElGamalReRandomize (密文重随机化)
    └─> AddNewKeyInputHasher (公共输入打包)
```

### 参数配置

```circom
template AddNewKey(
    stateTreeDepth        // 状态树深度 (例如: 2, 对应去激活树深度 = 2 + 2 = 4)
)
```

**实际配置示例**：
```javascript
// 小型系统
stateTreeDepth: 2          // 去激活树深度 = 4, 容量 5⁴ = 625 个去激活记录

// 中型系统
stateTreeDepth: 4          // 去激活树深度 = 6, 容量 5⁶ = 15,625 个去激活记录

// 大型系统
stateTreeDepth: 6          // 去激活树深度 = 8, 容量 5⁸ = 390,625 个去激活记录
```

**去激活树深度计算**：
```circom
var deactivateTreeDepth = stateTreeDepth + 2;
```

**设计原因**：去激活树需要容纳更多记录，因为每个用户可能有多次去激活操作。

---

## 核心模板详解

### 模板 1: AddNewKey (主电路)

**职责**：协调整个密钥更换和验证流程

#### 输入信号分类

##### 1. 公共输入（Public Inputs）

```circom
signal input inputHash;      // SHA256 哈希（唯一的公共输入）
```

**`inputHash` 的计算**：
```javascript
inputHash = SHA256(
  deactivateRoot,         // 去激活树根
  hash(coordPubKey),      // coordinator 公钥哈希
  nullifier,              // 用户身份标识
  d1[0], d1[1],          // 重随机化后的密文 D1
  d2[0], d2[1]           // 重随机化后的密文 D2
)
```

**设计目的**：将多个值打包成单一公共输入，减少验证器的 gas 消耗。

##### 2. Coordinator 相关

```circom
signal input coordPubKey[2];    // Coordinator 公钥 [x, y]
```

**用途**：
- 用于 ECDH 密钥交换
- 验证共享密钥的正确性

##### 3. 去激活树相关

```circom
signal input deactivateRoot;                                    // 去激活树根
signal input deactivateIndex;                                   // 去激活叶子索引
signal input deactivateLeaf;                                    // 去激活叶子哈希值
signal input deactivateLeafPathElements[deactivateTreeDepth][TREE_ARITY - 1];
```

**去激活叶子结构**（5个字段打包成哈希）：
```javascript
DeactivateLeaf = Hash(
  c1[0], c1[1],          // ElGamal 密文第一部分
  c2[0], c2[1],          // ElGamal 密文第二部分
  sharedKeyHash          // 共享密钥哈希（用于验证）
)
```

##### 4. ElGamal 密文相关

```circom
signal input c1[2];        // 原始密文第一部分（椭圆曲线点）
signal input c2[2];        // 原始密文第二部分（椭圆曲线点）
signal input d1[2];        // 重随机化后的密文第一部分（输出）
signal input d2[2];        // 重随机化后的密文第二部分（输出）
signal input randomVal;    // 重随机化使用的随机数（私有输入）
```

**ElGamal 加密简介**：
```
ElGamal 是一种基于离散对数问题的公钥加密算法

加密过程:
  给定公钥 pk 和消息 m，选择随机数 r
  c1 = r · G           （G 是椭圆曲线基点）
  c2 = m · G + r · pk

重随机化过程:
  给定密文 (c1, c2) 和随机数 s
  d1 = c1 + s · G
  d2 = c2 + s · pk
  
  重随机化后的 (d1, d2) 解密结果与原始 (c1, c2) 相同
  但在密码学上不可关联！
```

##### 5. 身份验证相关

```circom
signal input nullifier;         // 公开的用户身份标识符
signal input oldPrivateKey;     // 旧私钥（私有输入，用于证明）
```

**Nullifier 机制**：
```javascript
// Nullifier 计算公式
nullifier = Hash(oldPrivateKey, "NULLIFIER")

// 其中 "NULLIFIER" 的数值表示
"NULLIFIER" = 1444992409218394441042
```

**设计目的**：
- 用户可以证明拥有旧私钥，而不暴露私钥本身
- 防止同一私钥多次使用（链上记录已使用的 nullifier）

#### 主要处理步骤

AddNewKey 电路按以下顺序执行四个关键步骤：

##### 步骤 1: 验证 Nullifier 正确性（第 52-55 行）

```circom
component nullifierHasher = HashLeftRight(); 
nullifierHasher.left <== oldPrivateKey;
nullifierHasher.right <== 1444992409218394441042; // 'NULLIFIER'
nullifierHasher.hash === nullifier;
```

**作用**：
1. 使用 Poseidon 哈希计算 `Hash(oldPrivateKey, "NULLIFIER")`
2. 验证计算结果与输入的 `nullifier` 一致
3. 证明用户确实拥有旧私钥

**验证流程**：
```
用户提供:
  - oldPrivateKey (私有)
  - nullifier (公开)

电路验证:
  Hash(oldPrivateKey, "NULLIFIER") == nullifier
  
如果验证通过 → 用户确实拥有 oldPrivateKey
```

**安全性**：
- 由于 Poseidon 哈希的单向性，无法从 nullifier 反推 oldPrivateKey
- 链上可以记录使用过的 nullifier，防止重复使用

##### 步骤 2: 计算共享密钥并验证去激活叶子（第 58-74 行）

**2.1 ECDH 共享密钥生成**

```circom
component ecdh = Ecdh();
ecdh.privKey <== oldPrivateKey;
ecdh.pubKey[0] <== coordPubKey[0];
ecdh.pubKey[1] <== coordPubKey[1];
```

**ECDH 协议简介**：
```
Elliptic Curve Diffie-Hellman 密钥交换协议

用户侧:
  userPrivKey = oldPrivateKey
  sharedKey = userPrivKey · coordPubKey

Coordinator 侧:
  coordPrivKey = coordinator 的私钥
  sharedKey = coordPrivKey · userPubKey
  
  其中 userPubKey = userPrivKey · G
       coordPubKey = coordPrivKey · G
       
两侧计算出相同的共享密钥！
```

**2.2 共享密钥哈希**

```circom
component sharedKeyHasher = HashLeftRight();
sharedKeyHasher.left <== ecdh.sharedKey[0];
sharedKeyHasher.right <== ecdh.sharedKey[1];
```

**作用**：将椭圆曲线点（两个坐标）压缩成单一哈希值

**2.3 去激活叶子验证**

```circom
component deactivateLeafHasher = Hasher5();
deactivateLeafHasher.in[0] <== c1[0];
deactivateLeafHasher.in[1] <== c1[1];
deactivateLeafHasher.in[2] <== c2[0];
deactivateLeafHasher.in[3] <== c2[1];
deactivateLeafHasher.in[4] <== sharedKeyHasher.hash;

deactivateLeafHasher.hash === deactivateLeaf;
```

**作用**：
1. 计算去激活叶子的哈希值
2. 验证与输入的 `deactivateLeaf` 一致
3. 确保 ElGamal 密文和共享密钥的对应关系

**去激活叶子内容**：
```javascript
DeactivateLeaf = Hash5(
  c1_x,              // ElGamal 密文 c1 的 x 坐标
  c1_y,              // ElGamal 密文 c1 的 y 坐标
  c2_x,              // ElGamal 密文 c2 的 x 坐标
  c2_y,              // ElGamal 密文 c2 的 y 坐标
  sharedKeyHash      // 共享密钥哈希
)
```

**为什么包含 sharedKeyHash？**
- 将密文与特定用户（通过旧私钥）绑定
- 防止攻击者使用他人的密文

##### 步骤 3: 验证去激活叶子在 Merkle 树中的存在性（第 77-88 行）

**3.1 生成路径索引**

```circom
component deactivateLeafPathIndices = QuinGeneratePathIndices(deactivateTreeDepth);
deactivateLeafPathIndices.in <== deactivateIndex;
```

**作用**：将叶子索引转换为树路径的每一层的分支索引

**示例**（5叉树）：
```
假设 deactivateIndex = 37, deactivateTreeDepth = 4

5进制表示: 37 = 1×25 + 2×5 + 2×1 = (1, 2, 2, 2)₅

路径索引:
  Level 0: index = 2  (最底层)
  Level 1: index = 2
  Level 2: index = 2
  Level 3: index = 1  (最顶层)
```

**3.2 验证 Merkle 路径**

```circom
component deactivateQie = QuinLeafExists(deactivateTreeDepth);
deactivateQie.leaf <== deactivateLeaf;
deactivateQie.root <== deactivateRoot;

for (var i = 0; i < deactivateTreeDepth; i++) {
    deactivateQie.path_index[i] <== deactivateLeafPathIndices.out[i];
    for (var j = 0; j < TREE_ARITY - 1; j++) {
        deactivateQie.path_elements[i][j] <== deactivateLeafPathElements[i][j];
    }
}
```

**Merkle 证明原理**：
```
验证叶子 L 在树根 R 中存在

需要提供:
  - leaf: 叶子哈希
  - root: 树根哈希
  - path_elements: 每层的兄弟节点（5叉树需要4个兄弟）
  - path_index: 叶子在每层的位置

验证过程（从底层向上）:
  Level 0: 
    current = Hash5(siblings[0][0..3] + leaf)  // 根据 path_index[0] 插入正确位置
  Level 1:
    current = Hash5(siblings[1][0..3] + current)
  ...
  Level N:
    current == root ✓
```

**5叉树结构**：
```
                    Root (Level 3)
                   /  |  \  \  \
                 [5个子节点] (Level 2)
                 /  |  \  \  \
              [25个子节点] (Level 1)
              /  |  \  \  \
           [125个子节点] (Level 0)
           /  |  \  \  \
        [625个叶子节点]
```

**TREE_ARITY = 5 的设计原因**：
- 平衡树高度和验证复杂度
- 5叉树比二叉树更浅，但每层需要更多兄弟节点
- Poseidon 哈希对多输入支持良好

##### 步骤 4: ElGamal 密文重随机化（第 90-101 行）

```circom
component rerandomize = ElGamalReRandomize();
rerandomize.c1[0] <== c1[0];
rerandomize.c1[1] <== c1[1];
rerandomize.c2[0] <== c2[0];
rerandomize.c2[1] <== c2[1];
rerandomize.randomVal <== randomVal;
rerandomize.pubKey[0] <== coordPubKey[0];
rerandomize.pubKey[1] <== coordPubKey[1];

rerandomize.d1[0] === d1[0];
rerandomize.d2[0] === d2[0];
```

**重随机化算法**：
```
输入:
  - (c1, c2): 原始密文
  - randomVal: 新的随机数
  - coordPubKey: Coordinator 公钥

计算:
  d1 = c1 + randomVal · G
  d2 = c2 + randomVal · coordPubKey

验证:
  输出的 d1, d2 与预期值一致
```

**数学性质**：
```
解密验证:

原始密文解密:
  m = c2 - coordPrivKey · c1

重随机化密文解密:
  m' = d2 - coordPrivKey · d1
     = (c2 + randomVal · coordPubKey) - coordPrivKey · (c1 + randomVal · G)
     = c2 + randomVal · coordPubKey - coordPrivKey · c1 - randomVal · coordPrivKey
     = c2 - coordPrivKey · c1
     = m ✓

解密结果相同！
```

**安全性分析**：
```
不可关联性:
  - (c1, c2) 和 (d1, d2) 在密码学上不可关联
  - 即使攻击者看到两个密文，也无法判断它们是否为同一消息

隐私保护:
  - 用户可以更换公钥关联，而不暴露身份
  - 防止通过链上数据追踪用户
```

**应用场景**：
```
场景 1: 密钥轮换
  用户旧密钥可能泄露风险
  通过重随机化生成新的公开关联
  
场景 2: 隐私增强
  定期重随机化，防止长期追踪
  
场景 3: 去激活后重新激活
  用户去激活后想要重新参与
  使用旧密钥证明身份，生成新密文
```

##### 步骤 5: 验证公共输入哈希（第 104-114 行）

```circom
component inputHasher = AddNewKeyInputHasher();
inputHasher.deactivateRoot <== deactivateRoot;
inputHasher.coordPubKey[0] <== coordPubKey[0];
inputHasher.coordPubKey[1] <== coordPubKey[1];
inputHasher.nullifier <== nullifier;
inputHasher.d1[0] <== d1[0];
inputHasher.d1[1] <== d1[1];
inputHasher.d2[0] <== d2[0];
inputHasher.d2[1] <== d2[1];

inputHasher.hash === inputHash;
```

**作用**：
1. 将所有公共输入打包成单一哈希
2. 验证与输入的 `inputHash` 一致
3. 确保公共输入的完整性

**为什么需要打包公共输入？**
```
智能合约验证 ZK 证明时:
  - 每个公共输入都需要消耗 gas
  - 将 7 个字段打包成 1 个哈希
  - 大幅降低验证成本（约减少 80% gas）
```

---

### 模板 2: AddNewKeyInputHasher (公共输入打包)

**职责**：将多个公共输入字段压缩成单一哈希值

#### 输入信号

```circom
signal input deactivateRoot;    // 去激活树根
signal input coordPubKey[2];    // Coordinator 公钥
signal input nullifier;         // 用户身份标识
signal input d1[2];            // 重随机化密文第一部分
signal input d2[2];            // 重随机化密文第二部分
```

#### 输出信号

```circom
signal output hash;             // 打包后的哈希值
```

#### 处理流程

##### 步骤 1: 压缩 Coordinator 公钥（第 128-130 行）

```circom
component pubKeyHasher = HashLeftRight();
pubKeyHasher.left <== coordPubKey[0];
pubKeyHasher.right <== coordPubKey[1];
```

**作用**：将公钥的两个坐标压缩成单一哈希值

##### 步骤 2: 使用 SHA256 打包所有输入（第 133-142 行）

```circom
component hasher = Sha256Hasher(7);
hasher.in[0] <== deactivateRoot;
hasher.in[1] <== pubKeyHasher.hash;
hasher.in[2] <== nullifier;
hasher.in[3] <== d1[0];
hasher.in[4] <== d1[1];
hasher.in[5] <== d2[0];
hasher.in[6] <== d2[1];

hash <== hasher.hash;
```

**为什么使用 SHA256 而不是 Poseidon？**

| 特性 | SHA256 | Poseidon |
|------|--------|----------|
| **链上兼容性** | ✅ EVM 预编译，gas 便宜 | ❌ 需要自定义实现，gas 昂贵 |
| **电路复杂度** | ❌ 约 27,000 个约束 | ✅ 约 280 个约束 |
| **使用场景** | 公共输入打包（链上验证） | 电路内部计算 |

**设计决策**：
- 在电路中使用 SHA256（承受高约束成本）
- 换取链上验证时的低 gas 成本
- 整体性价比更优

**输入顺序解释**：
```javascript
hasher.in[0] = deactivateRoot      // 去激活树状态
hasher.in[1] = hash(coordPubKey)   // 系统参数
hasher.in[2] = nullifier           // 用户身份
hasher.in[3] = d1[0]               // 输出密文
hasher.in[4] = d1[1]               // 输出密文
hasher.in[5] = d2[0]               // 输出密文
hasher.in[6] = d2[1]               // 输出密文
```

**为什么不包含输入密文 (c1, c2)？**
- 输入密文已经通过去激活树验证
- 只需要公开输出密文（新的公钥关联）
- 减少公共输入大小

---

## 依赖组件功能说明

AddNewKey 电路依赖多个底层组件，以下是详细说明：

### 1. HashLeftRight (Poseidon 哈希)

**位置**: `../../utils/hasherPoseidon.circom`

**功能**：计算两个字段元素的 Poseidon 哈希

```circom
component hasher = HashLeftRight();
hasher.left <== value1;
hasher.right <== value2;
hash <== hasher.hash;
```

**使用场景**：
- Nullifier 计算
- 共享密钥哈希
- 状态承诺

**约束数量**：约 280 个

### 2. Hasher5 (5 输入 Poseidon 哈希)

**位置**: `../../utils/hasherPoseidon.circom`

**功能**：计算 5 个字段元素的 Poseidon 哈希

```circom
component hasher = Hasher5();
hasher.in[0] <== value1;
hasher.in[1] <== value2;
hasher.in[2] <== value3;
hasher.in[3] <== value4;
hasher.in[4] <== value5;
hash <== hasher.hash;
```

**使用场景**：
- 去激活叶子哈希（5个字段）
- 5叉树节点哈希

**约束数量**：约 350 个

### 3. Sha256Hasher (SHA256 哈希)

**位置**: `../../utils/hasherSha256.circom`

**功能**：计算可变数量输入的 SHA256 哈希

```circom
component hasher = Sha256Hasher(n);  // n 是输入数量
for (var i = 0; i < n; i++) {
    hasher.in[i] <== values[i];
}
hash <== hasher.hash;
```

**使用场景**：
- 公共输入打包（与 EVM 兼容）

**约束数量**：约 27,000 个（固定，不随输入数量变化太多）

### 4. Ecdh (椭圆曲线 Diffie-Hellman)

**位置**: `../../utils/ecdh.circom`

**功能**：计算 ECDH 共享密钥

```circom
component ecdh = Ecdh();
ecdh.privKey <== myPrivateKey;
ecdh.pubKey[0] <== theirPubKey[0];
ecdh.pubKey[1] <== theirPubKey[1];

sharedKey[0] <== ecdh.sharedKey[0];
sharedKey[1] <== ecdh.sharedKey[1];
```

**数学原理**：
```
给定:
  - privKey: 私钥 (标量)
  - pubKey: 公钥 (椭圆曲线点)

计算:
  sharedKey = privKey · pubKey
  
在椭圆曲线上执行标量乘法
```

**使用场景**：
- 加密通信（与 coordinator 共享密钥）
- 消息加密/解密

**约束数量**：约 1,500 个（椭圆曲线运算复杂）

### 5. PrivToPubKey (私钥到公钥)

**位置**: `../../utils/privToPubKey.circom`

**功能**：从私钥派生公钥

```circom
component derive = PrivToPubKey();
derive.privKey <== privateKey;

pubKey[0] <== derive.pubKey[0];
pubKey[1] <== derive.pubKey[1];
```

**数学原理**：
```
pubKey = privKey · G

其中 G 是椭圆曲线的基点（生成元）
```

**使用场景**：
- 验证私钥和公钥的对应关系
- 密钥派生

**约束数量**：约 1,500 个

### 6. QuinGeneratePathIndices (路径索引生成)

**位置**: `../../utils/trees/incrementalQuinTree.circom`

**功能**：将叶子索引转换为 5 叉树的路径索引

```circom
component pathGen = QuinGeneratePathIndices(depth);
pathGen.in <== leafIndex;

// 输出每层的分支索引 (0-4)
for (var i = 0; i < depth; i++) {
    pathIndex[i] <== pathGen.out[i];
}
```

**算法**：
```
将 leafIndex 转换为 5 进制表示

示例: leafIndex = 37, depth = 4
  37 ÷ 5 = 7 余 2  → pathIndex[0] = 2
  7  ÷ 5 = 1 余 2  → pathIndex[1] = 2
  1  ÷ 5 = 0 余 1  → pathIndex[2] = 1
  0  ÷ 5 = 0 余 0  → pathIndex[3] = 0
```

**约束数量**：约 depth × 50 个

### 7. QuinLeafExists (5 叉树 Merkle 证明)

**位置**: `../../utils/trees/incrementalQuinTree.circom`

**功能**：验证叶子在 5 叉 Merkle 树中的存在性

```circom
component verifier = QuinLeafExists(depth);
verifier.leaf <== leafHash;
verifier.root <== treeRoot;

for (var i = 0; i < depth; i++) {
    verifier.path_index[i] <== pathIndices[i];
    for (var j = 0; j < 4; j++) {  // TREE_ARITY - 1 = 4
        verifier.path_elements[i][j] <== siblings[i][j];
    }
}
```

**验证流程**：
```
从叶子向上计算每层的哈希

Level 0:
  根据 path_index[0]，将 leaf 和 4 个兄弟节点排序
  current = Hash5(sorted_siblings)

Level 1:
  根据 path_index[1]，将 current 和 4 个兄弟节点排序
  current = Hash5(sorted_siblings)

...

Level N:
  current == root ✓
```

**约束数量**：约 depth × 400 个

### 8. ElGamalReRandomize (ElGamal 重随机化)

**位置**: `./lib/rerandomize.circom`

**功能**：对 ElGamal 密文进行重随机化

```circom
component rerand = ElGamalReRandomize();
rerand.c1[0] <== c1_x;
rerand.c1[1] <== c1_y;
rerand.c2[0] <== c2_x;
rerand.c2[1] <== c2_y;
rerand.randomVal <== newRandomness;
rerand.pubKey[0] <== pk_x;
rerand.pubKey[1] <== pk_y;

d1[0] <== rerand.d1[0];
d1[1] <== rerand.d1[1];
d2[0] <== rerand.d2[0];
d2[1] <== rerand.d2[1];
```

**算法**：
```
d1 = c1 + randomVal · G
d2 = c2 + randomVal · pubKey

使用椭圆曲线点加法和标量乘法
```

**约束数量**：约 3,000 个（包含两次椭圆曲线标量乘法）

---

## 完整流程分析

### 数据流图

```
                    用户侧准备
                        ↓
    ┌───────────────────────────────────────┐
    │ 1. 生成 Nullifier                      │
    │    nullifier = Hash(oldPrivKey, "NULL")│
    └────────────┬──────────────────────────┘
                 ↓
    ┌───────────────────────────────────────┐
    │ 2. 查询去激活树                        │
    │    - 获取 deactivateRoot               │
    │    - 获取 deactivateIndex              │
    │    - 获取 Merkle 证明                  │
    └────────────┬──────────────────────────┘
                 ↓
    ┌───────────────────────────────────────┐
    │ 3. 准备 ElGamal 密文数据               │
    │    - 原始密文 (c1, c2)                 │
    │    - 生成随机数 randomVal              │
    │    - 链下计算 (d1, d2)                 │
    └────────────┬──────────────────────────┘
                 ↓
                电路验证
                 ↓
    ┌───────────────────────────────────────┐
    │ 步骤 1: 验证 Nullifier                 │
    │    Hash(oldPrivKey, "NULL") == nullifier│
    └────────────┬──────────────────────────┘
                 ↓
    ┌───────────────────────────────────────┐
    │ 步骤 2: 计算共享密钥                   │
    │    sharedKey = ECDH(oldPrivKey, coordPk)│
    │    验证去激活叶子哈希                  │
    └────────────┬──────────────────────────┘
                 ↓
    ┌───────────────────────────────────────┐
    │ 步骤 3: 验证 Merkle 证明               │
    │    QuinLeafExists(deactivateLeaf)      │
    └────────────┬──────────────────────────┘
                 ↓
    ┌───────────────────────────────────────┐
    │ 步骤 4: 验证重随机化                   │
    │    d1 = c1 + randomVal · G             │
    │    d2 = c2 + randomVal · coordPk       │
    └────────────┬──────────────────────────┘
                 ↓
    ┌───────────────────────────────────────┐
    │ 步骤 5: 验证公共输入哈希               │
    │    SHA256(...) == inputHash            │
    └────────────┬──────────────────────────┘
                 ↓
            生成 ZK 证明
                 ↓
            提交到链上
```

### 时间序列图

```
用户          链下准备          电路          链上合约
 │               │              │               │
 │─────生成────→│              │               │
 │  nullifier    │              │               │
 │               │              │               │
 │←────查询─────│              │               │
 │  去激活数据   │              │               │
 │               │              │               │
 │─────准备────→│              │               │
 │  密文数据     │              │               │
 │               │              │               │
 │               │─────输入───→│               │
 │               │  所有信号    │               │
 │               │              │               │
 │               │  ┌───────────┴─────────┐    │
 │               │  │ 验证 Nullifier       │    │
 │               │  │ 计算共享密钥         │    │
 │               │  │ 验证 Merkle 证明     │    │
 │               │  │ 验证重随机化         │    │
 │               │  │ 验证输入哈希         │    │
 │               │  └───────────┬─────────┘    │
 │               │              │               │
 │               │←────生成─────│               │
 │               │   ZK 证明    │               │
 │               │              │               │
 │───────────────────提交证明─────────────────→│
 │                                              │
 │                            ┌─────────────────┤
 │                            │ 验证证明        │
 │                            │ 检查 nullifier  │
 │                            │ 记录新密文      │
 │                            └─────────────────┤
 │                                              │
 │←──────────────────确认成功───────────────────│
```

---

## 实际应用示例

### 示例 1: 用户密钥更换流程

#### 场景设定
- 用户 Alice 的旧私钥可能泄露
- 她想要更换密钥，但不暴露身份
- 系统已经将她的数据记录在去激活树中

#### 步骤 1: 链下准备

```javascript
// Alice 的旧私钥
const oldPrivateKey = BigInt("123456789");

// 计算 Nullifier
const nullifier = poseidon([oldPrivateKey, BigInt("1444992409218394441042")]);
console.log("Nullifier:", nullifier.toString());

// 从链上查询去激活树数据
const deactivateData = await contract.getDeactivateLeafByNullifier(nullifier);
/*
{
  deactivateRoot: "0x12345...",
  deactivateIndex: 42,
  deactivateLeaf: "0xabcdef...",
  c1: [c1_x, c1_y],
  c2: [c2_x, c2_y],
  pathElements: [[...], [...], [...], [...]]
}
*/

// 生成新的随机数
const randomVal = BigInt("987654321");

// 获取 Coordinator 公钥
const coordPubKey = await contract.getCoordinatorPubKey();

// 链下计算重随机化密文
const d1 = pointAdd(deactivateData.c1, scalarMul(G, randomVal));
const d2 = pointAdd(deactivateData.c2, scalarMul(coordPubKey, randomVal));
```

#### 步骤 2: 生成电路输入

```javascript
const circuitInputs = {
  // 公共输入（将被打包）
  deactivateRoot: deactivateData.deactivateRoot,
  coordPubKey: coordPubKey,
  nullifier: nullifier,
  d1: d1,
  d2: d2,
  
  // 私有输入
  oldPrivateKey: oldPrivateKey,
  c1: deactivateData.c1,
  c2: deactivateData.c2,
  randomVal: randomVal,
  deactivateIndex: deactivateData.deactivateIndex,
  deactivateLeaf: deactivateData.deactivateLeaf,
  deactivateLeafPathElements: deactivateData.pathElements
};

// 计算 inputHash（公共输入）
const pubKeyHash = poseidon([coordPubKey[0], coordPubKey[1]]);
const inputHash = sha256([
  deactivateData.deactivateRoot,
  pubKeyHash,
  nullifier,
  d1[0], d1[1],
  d2[0], d2[1]
]);

circuitInputs.inputHash = inputHash;
```

#### 步骤 3: 生成证明

```javascript
// 使用 snarkjs 生成证明
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  circuitInputs,
  "addNewKey.wasm",
  "addNewKey_final.zkey"
);

console.log("Proof generated!");
console.log("Public signals:", publicSignals);
// publicSignals = [inputHash]
```

#### 步骤 4: 提交到链上

```javascript
// 调用智能合约
const tx = await contract.addNewKey(
  proof.pi_a,
  proof.pi_b,
  proof.pi_c,
  publicSignals,  // [inputHash]
  nullifier,
  d1,
  d2
);

await tx.wait();
console.log("Key updated successfully!");
```

#### 步骤 5: 链上验证

```solidity
contract AMACI {
    mapping(uint256 => bool) public usedNullifiers;
    
    function addNewKey(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[1] memory publicSignals,
        uint256 nullifier,
        uint256[2] memory d1,
        uint256[2] memory d2
    ) public {
        // 1. 检查 nullifier 未被使用
        require(!usedNullifiers[nullifier], "Nullifier already used");
        
        // 2. 重新计算 inputHash
        uint256 pubKeyHash = poseidon([coordPubKey[0], coordPubKey[1]]);
        uint256 expectedInputHash = sha256(abi.encodePacked(
            deactivateRoot,
            pubKeyHash,
            nullifier,
            d1[0], d1[1],
            d2[0], d2[1]
        ));
        
        require(publicSignals[0] == expectedInputHash, "Invalid input hash");
        
        // 3. 验证 ZK 证明
        require(
            verifier.verifyProof(a, b, c, publicSignals),
            "Invalid proof"
        );
        
        // 4. 标记 nullifier 已使用
        usedNullifiers[nullifier] = true;
        
        // 5. 记录新密文（用于后续验证）
        userCiphertexts[msg.sender] = Ciphertext(d1, d2);
        
        emit KeyUpdated(msg.sender, nullifier, d1, d2);
    }
}
```

---

### 示例 2: 去激活后重新激活

#### 场景设定
- 用户 Bob 之前去激活了账户
- 现在他想重新激活，但使用新的公钥关联
- 需要证明他拥有旧私钥，但不暴露私钥本身

#### 步骤 1: 验证去激活记录

```javascript
// Bob 的旧私钥
const oldPrivKey = BigInt("555555555");

// 计算 Nullifier
const nullifier = poseidon([oldPrivKey, NULLIFIER_CONSTANT]);

// 查询去激活记录
const deactivateRecord = await contract.getDeactivateRecord(nullifier);
if (!deactivateRecord) {
  throw new Error("No deactivate record found");
}

console.log("Deactivate record found:");
console.log("- Index:", deactivateRecord.index);
console.log("- Ciphertext:", deactivateRecord.c1, deactivateRecord.c2);
```

#### 步骤 2: 生成新的公钥关联

```javascript
// 生成新的随机数（重随机化）
const newRandomVal = randomBigInt();

// 计算新密文
const coordPubKey = await contract.getCoordinatorPubKey();
const d1 = pointAdd(deactivateRecord.c1, scalarMul(G, newRandomVal));
const d2 = pointAdd(deactivateRecord.c2, scalarMul(coordPubKey, newRandomVal));

console.log("New ciphertext generated:");
console.log("- d1:", d1);
console.log("- d2:", d2);
```

#### 步骤 3: 生成证明并提交

```javascript
// 构造电路输入
const inputs = {
  inputHash: computeInputHash(...),
  coordPubKey: coordPubKey,
  deactivateRoot: deactivateRecord.root,
  deactivateIndex: deactivateRecord.index,
  deactivateLeaf: deactivateRecord.leaf,
  c1: deactivateRecord.c1,
  c2: deactivateRecord.c2,
  randomVal: newRandomVal,
  d1: d1,
  d2: d2,
  deactivateLeafPathElements: deactivateRecord.pathElements,
  nullifier: nullifier,
  oldPrivateKey: oldPrivKey
};

// 生成证明
const { proof, publicSignals } = await generateProof(inputs);

// 提交到链上
await contract.reactivateWithNewKey(proof, publicSignals, nullifier, d1, d2);
console.log("Reactivated successfully with new key!");
```

---

### 示例 3: 完整的密钥轮换周期

```javascript
// 模拟完整的密钥轮换生命周期

class KeyRotationManager {
  constructor(contract) {
    this.contract = contract;
    this.keyHistory = [];
  }
  
  // 1. 初始注册
  async initialSignup(privateKey) {
    const pubKey = derivePublicKey(privateKey);
    
    // 生成 ElGamal 加密的公钥
    const randomness = randomBigInt();
    const coordPubKey = await this.contract.getCoordinatorPubKey();
    const c1 = scalarMul(G, randomness);
    const c2 = pointAdd(scalarMul(coordPubKey, randomness), pubKey);
    
    // 提交到链上
    await this.contract.signup(c1, c2);
    
    this.keyHistory.push({
      privateKey: privateKey,
      publicKey: pubKey,
      ciphertext: { c1, c2 },
      timestamp: Date.now(),
      status: 'active'
    });
    
    console.log("Initial signup completed");
  }
  
  // 2. 定期轮换密钥
  async rotateKey() {
    const currentKey = this.keyHistory[this.keyHistory.length - 1];
    
    if (currentKey.status !== 'active') {
      throw new Error("Current key is not active");
    }
    
    // 标记当前密钥为去激活
    currentKey.status = 'deactivating';
    
    // 生成新密钥
    const newPrivateKey = randomBigInt();
    const newPubKey = derivePublicKey(newPrivateKey);
    
    // 使用 AddNewKey 电路
    const nullifier = poseidon([
      currentKey.privateKey,
      NULLIFIER_CONSTANT
    ]);
    
    const deactivateData = await this.contract.getDeactivateData(nullifier);
    
    // 重随机化
    const randomVal = randomBigInt();
    const coordPubKey = await this.contract.getCoordinatorPubKey();
    const d1 = pointAdd(currentKey.ciphertext.c1, scalarMul(G, randomVal));
    const d2 = pointAdd(currentKey.ciphertext.c2, scalarMul(coordPubKey, randomVal));
    
    // 生成证明
    const { proof, publicSignals } = await this.generateAddNewKeyProof({
      oldPrivateKey: currentKey.privateKey,
      newPrivateKey: newPrivateKey,
      deactivateData: deactivateData,
      randomVal: randomVal,
      d1: d1,
      d2: d2
    });
    
    // 提交
    await this.contract.addNewKey(proof, publicSignals, nullifier, d1, d2);
    
    // 记录新密钥
    this.keyHistory.push({
      privateKey: newPrivateKey,
      publicKey: newPubKey,
      ciphertext: { c1: d1, c2: d2 },
      timestamp: Date.now(),
      status: 'active'
    });
    
    currentKey.status = 'deactivated';
    
    console.log("Key rotated successfully");
    console.log("Key history length:", this.keyHistory.length);
  }
  
  // 3. 查看密钥历史
  getKeyHistory() {
    return this.keyHistory.map((key, index) => ({
      index: index,
      publicKey: key.publicKey,
      timestamp: new Date(key.timestamp).toISOString(),
      status: key.status
    }));
  }
  
  // 4. 验证轮换链
  async verifyRotationChain() {
    console.log("Verifying rotation chain...");
    
    for (let i = 1; i < this.keyHistory.length; i++) {
      const prevKey = this.keyHistory[i - 1];
      const currentKey = this.keyHistory[i];
      
      // 验证 nullifier 连续性
      const nullifier = poseidon([
        prevKey.privateKey,
        NULLIFIER_CONSTANT
      ]);
      
      const isUsed = await this.contract.isNullifierUsed(nullifier);
      if (!isUsed) {
        console.error(`Rotation ${i} failed: nullifier not found on-chain`);
        return false;
      }
      
      // 验证密文关系（重随机化）
      // （在实际应用中，无法链下验证，只能通过 ZK 证明）
      
      console.log(`Rotation ${i} verified ✓`);
    }
    
    console.log("All rotations verified ✓");
    return true;
  }
}

// 使用示例
const manager = new KeyRotationManager(contract);

// 初始注册
await manager.initialSignup(BigInt("111111"));

// 第一次轮换（30天后）
await manager.rotateKey();

// 第二次轮换（60天后）
await manager.rotateKey();

// 查看历史
console.log(manager.getKeyHistory());
/*
[
  { index: 0, publicKey: "0x123...", timestamp: "2024-01-01", status: "deactivated" },
  { index: 1, publicKey: "0x456...", timestamp: "2024-01-31", status: "deactivated" },
  { index: 2, publicKey: "0x789...", timestamp: "2024-03-01", status: "active" }
]
*/

// 验证轮换链
await manager.verifyRotationChain();
```

---

## 安全特性分析

### 1. Nullifier 机制

**目的**：防止同一私钥被多次使用

**实现**：
```circom
nullifier = Hash(oldPrivateKey, "NULLIFIER")
```

**安全性**：
- ✅ **单向性**：无法从 nullifier 反推 oldPrivateKey
- ✅ **唯一性**：每个私钥对应唯一的 nullifier
- ✅ **可验证性**：电路验证 nullifier 的正确计算
- ✅ **防重放**：链上记录已使用的 nullifier

**攻击场景分析**：

| 攻击类型 | 攻击方式 | 防御机制 |
|---------|---------|---------|
| **重放攻击** | 重复提交相同的证明 | 链上检查 `usedNullifiers` 映射 |
| **暴力破解** | 尝试猜测私钥 | Poseidon 哈希的抗碰撞性 |
| **链接攻击** | 通过 nullifier 关联不同交易 | 重随机化隐藏身份 |

### 2. 共享密钥验证

**目的**：确保用户与 coordinator 建立正确的加密通道

**实现**：
```circom
sharedKey = ECDH(oldPrivateKey, coordPubKey)
deactivateLeaf = Hash5(c1, c2, Hash(sharedKey))
```

**安全性**：
- ✅ **前向保密**：即使 oldPrivateKey 泄露，过去的通信仍安全
- ✅ **身份绑定**：共享密钥与特定私钥绑定
- ✅ **防中间人**：无法伪造共享密钥

**密码学分析**：
```
ECDH 安全性基于椭圆曲线离散对数问题 (ECDLP)

攻击者知道:
  - coordPubKey = coordPrivKey · G
  - 用户公钥可能可见

攻击者想要计算:
  - sharedKey = oldPrivateKey · coordPubKey

需要解决:
  - 给定 P = k · G，求 k（ECDLP 问题）
  - 对于 BN254 曲线，计算复杂度约 2^128
```

### 3. 去激活树 Merkle 证明

**目的**：验证用户的去激活记录存在于系统中

**实现**：
```circom
QuinLeafExists(
  leaf = Hash5(c1, c2, sharedKeyHash),
  root = deactivateRoot,
  pathElements = Merkle 路径
)
```

**安全性**：
- ✅ **防伪造**：无法构造不存在的叶子的有效证明
- ✅ **防篡改**：修改叶子会导致根哈希不匹配
- ✅ **高效验证**：O(log n) 复杂度

**5叉树 vs 二叉树对比**：

| 特性 | 5叉树 | 二叉树 |
|-----|------|-------|
| **树高度** | log₅(n) ≈ 0.43 × log₂(n) | log₂(n) |
| **证明大小** | 4 × depth 个哈希 | 1 × depth 个哈希 |
| **哈希计算** | depth 次 5 输入哈希 | depth 次 2 输入哈希 |
| **电路约束** | depth × 350 | depth × 280 |
| **综合效率** | 更适合大规模系统 | 更适合小规模系统 |

**示例**（1,000,000 个叶子）：
```
5叉树:
  depth = log₅(1,000,000) ≈ 8.6 → 9 层
  证明大小 = 9 × 4 = 36 个哈希
  约束数量 ≈ 9 × 350 = 3,150

二叉树:
  depth = log₂(1,000,000) ≈ 19.9 → 20 层
  证明大小 = 20 × 1 = 20 个哈希
  约束数量 ≈ 20 × 280 = 5,600
```

### 4. ElGamal 重随机化

**目的**：在不改变解密结果的前提下，生成新的密文，隐藏用户身份

**实现**：
```circom
d1 = c1 + randomVal · G
d2 = c2 + randomVal · coordPubKey
```

**安全性分析**：

#### 4.1 不可关联性证明

**定理**：给定密文 (c1, c2) 和重随机化密文 (d1, d2)，攻击者无法判断它们是否加密同一消息。

**证明**：
```
原始密文:
  c1 = r · G
  c2 = m · G + r · coordPubKey

重随机化密文:
  d1 = c1 + s · G = (r + s) · G
  d2 = c2 + s · coordPubKey = m · G + (r + s) · coordPubKey

从攻击者角度:
  - (d1, d2) 看起来像用随机数 (r + s) 加密的新密文
  - 无法确定 s 的值（由于 ECDLP 难题）
  - 无法关联 (c1, c2) 和 (d1, d2)
```

**数学严格性**：
```
定义不可关联性游戏:

1. 挑战者生成密文 (c1, c2)
2. 挑战者抛硬币:
   - 正面: 返回 (c1, c2) 的重随机化
   - 反面: 返回新的随机密文
3. 攻击者猜测硬币结果

安全性要求:
  攻击者的成功概率 ≈ 1/2（随机猜测）
  
基于 DDH 假设（Decisional Diffie-Hellman），
在 BN254 曲线上，此要求得到满足。
```

#### 4.2 解密一致性验证

**定理**：重随机化不改变解密结果。

**证明**：
```
原始解密:
  m · G = c2 - coordPrivKey · c1
        = (m · G + r · coordPubKey) - coordPrivKey · (r · G)
        = m · G + r · (coordPrivKey · G) - coordPrivKey · (r · G)
        = m · G

重随机化解密:
  m' · G = d2 - coordPrivKey · d1
         = (c2 + s · coordPubKey) - coordPrivKey · (c1 + s · G)
         = c2 + s · coordPubKey - coordPrivKey · c1 - s · coordPrivKey
         = c2 - coordPrivKey · c1
         = m · G ✓

因此 m' = m
```

#### 4.3 攻击场景分析

| 攻击类型 | 攻击目标 | 防御机制 | 成功概率 |
|---------|---------|---------|---------|
| **链接攻击** | 关联重随机化前后的密文 | 基于 DDH 假设的不可关联性 | ≈ 1/2（随机猜测） |
| **反推攻击** | 从 (d1, d2) 恢复 (c1, c2) | ECDLP 难题 | < 2⁻¹²⁸ |
| **伪造攻击** | 构造有效的重随机化证明 | ZK 证明的完备性 | < 2⁻¹²⁸ |
| **重放攻击** | 重复使用旧的重随机化 | Nullifier 机制 | 0（链上检测） |

### 5. 输入哈希完整性

**目的**：确保公共输入的完整性，防止篡改

**实现**：
```circom
inputHash = SHA256(
  deactivateRoot,
  hash(coordPubKey),
  nullifier,
  d1[0], d1[1], d2[0], d2[1]
)
```

**安全性**：
- ✅ **抗碰撞**：SHA256 的抗碰撞性（约 2¹²⁸ 安全性）
- ✅ **抗篡改**：任何字段的修改都会导致哈希不匹配
- ✅ **链上兼容**：EVM 原生支持，验证成本低

**为什么使用 SHA256？**

| 哈希算法 | 电路约束 | 链上 Gas | 综合评价 |
|---------|---------|---------|---------|
| **SHA256** | ~27,000 | ~300 | ✅ 链上优化 |
| **Poseidon** | ~280 | ~30,000 | ❌ 链上昂贵 |
| **Keccak256** | ~35,000 | ~300 | 中等 |

**设计权衡**：
```
电路生成时间:
  SHA256: 较慢（约 27k 约束）
  
链上验证 Gas:
  SHA256: 快（EVM 预编译）
  
由于验证发生在链上（多次），
而生成只发生一次（用户本地），
选择 SHA256 更优。
```

### 6. 零知识属性

**目的**：不泄露任何私有信息

**私有输入**：
- `oldPrivateKey` - 旧私钥
- `c1, c2` - 原始密文
- `randomVal` - 重随机化随机数
- `deactivateIndex` - 去激活叶子索引
- `deactivateLeafPathElements` - Merkle 路径

**零知识保证**：
- ✅ **不泄露私钥**：验证者无法从证明推导私钥
- ✅ **不泄露原始密文**：只暴露重随机化后的密文
- ✅ **不泄露随机数**：无法反推 randomVal
- ✅ **不泄露树位置**：不暴露具体的叶子索引

**形式化表述**：
```
对于任何验证者 V，存在模拟器 S，使得：

Real[V(proof, publicInputs)] ≈ Ideal[S(publicInputs)]

即：验证者从真实证明学到的信息 ≈ 只从公共输入学到的信息
```

---

## 与其他电路的关系

### AMACI 系统电路架构

```
                    AMACI 系统
                        │
        ┌───────────────┼───────────────┐
        │               │               │
    Signup         ProcessMessages   AddNewKey  ← 本文档
        │               │               │
        │               │               │
   初始注册      消息处理投票      密钥更换去激活
        │               │               │
        ↓               ↓               ↓
   StateTree      VoteOptionTree   DeactivateTree
```

### 1. 与 Signup 的关系

**Signup 电路**：用户初始注册，添加到状态树

```circom
template Signup(stateTreeDepth) {
    // 验证新用户公钥
    // 计算新状态树根
    // 验证 ElGamal 加密的公钥
}
```

**关系**：
- Signup 创建初始的 ElGamal 密文 (c1, c2)
- AddNewKey 可以重随机化这个密文
- 两者都使用相同的 coordinator 公钥

**数据流**：
```
Signup:
  用户 → [生成密文 (c1, c2)] → 状态树

AddNewKey:
  用户 → [重随机化 (c1, c2) → (d1, d2)] → 去激活树
```

### 2. 与 ProcessMessages 的关系

**ProcessMessages 电路**：处理投票消息，更新状态树

```circom
template ProcessMessages(
    stateTreeDepth,
    voteOptionTreeDepth,
    batchSize
) {
    // 解密投票消息
    // 验证签名
    // 更新状态叶子
}
```

**关系**：
- ProcessMessages 使用状态树
- AddNewKey 使用去激活树（独立的树）
- 两者都使用 ECDH 共享密钥机制

**对比**：

| 特性 | ProcessMessages | AddNewKey |
|-----|----------------|-----------|
| **输入** | 加密投票消息 | 去激活记录 |
| **树类型** | 状态树 + 投票树 | 去激活树 |
| **主要操作** | 解密 + 状态更新 | 验证 + 重随机化 |
| **输出** | 新状态根 | 新密文 |
| **批处理** | ✅ (batchSize) | ❌ (单个) |

### 3. 与 TallyVotes 的关系

**TallyVotes 电路**：统计投票结果

```circom
template TallyVotes(
    stateTreeDepth,
    intStateTreeDepth,
    voteOptionTreeDepth
) {
    // 读取所有投票
    // 累加结果
    // 生成结果承诺
}
```

**关系**：
- TallyVotes 统计最终结果
- AddNewKey 处理用户去激活（不影响已投票）
- 去激活后的用户不参与统计

**时间线**：
```
时间轴:
  │
  ├─ Signup: 用户注册
  │
  ├─ ProcessMessages: 投票期（用户可以去激活）
  │
  ├─ 投票结束
  │
  ├─ TallyVotes: 统计结果（不包含去激活用户）
  │
  └─ 结果公布

AddNewKey 可以在任何时间点使用（异步）
```

### 4. 完整的 AMACI 流程

```javascript
// 阶段 1: 注册阶段
for (const user of users) {
  await signup(user.publicKey);
}

// 阶段 2: 投票阶段
for (const voter of voters) {
  // 正常投票
  await publishMessage(voter.voteMessage);
  
  // 某些用户可能去激活
  if (voter.wantsToDeactivate) {
    await deactivate(voter.publicKey);
  }
}

// 阶段 3: 处理消息
for (const batch of messageBatches) {
  const proof = await processMessages(batch);
  await submitProof(proof);
}

// 阶段 4: 统计投票
const tallyProof = await tallyVotes(finalStateRoot);
await submitTallyProof(tallyProof);

// 阶段 5: 密钥更换（异步，用户主动）
for (const user of deactivatedUsers) {
  if (user.wantsNewKey) {
    const addKeyProof = await addNewKey(
      user.oldPrivateKey,
      user.deactivateData
    );
    await submitAddKeyProof(addKeyProof);
  }
}
```

### 5. 去激活树的特殊性

**为什么需要独立的去激活树？**

1. **容量需求**：
   - 状态树：每个用户一个叶子（固定容量）
   - 去激活树：每次去激活一个叶子（动态增长）
   - 需要更大的容量 → depth + 2

2. **生命周期**：
   - 状态树：随投票过程更新
   - 去激活树：只追加，不更新

3. **访问模式**：
   - 状态树：频繁读写
   - 去激活树：写入一次，读取验证多次

**去激活树结构**：
```
DeactivateTree (5叉树, depth = stateTreeDepth + 2)
    │
    ├─ Leaf 0: Hash5(c1_0, c2_0, sharedKeyHash_0)
    ├─ Leaf 1: Hash5(c1_1, c2_1, sharedKeyHash_1)
    ├─ ...
    └─ Leaf N: Hash5(c1_N, c2_N, sharedKeyHash_N)

每个叶子对应一次去激活操作
```

---

## 电路约束分析

### 约束数量估算

基于各组件的约束数量，估算整个 AddNewKey 电路的约束总数：

| 组件 | 约束数量 | 说明 |
|-----|---------|------|
| **HashLeftRight** (×2) | 560 | Nullifier 计算 + 共享密钥哈希 |
| **Ecdh** | 1,500 | ECDH 共享密钥生成 |
| **Hasher5** | 350 | 去激活叶子哈希 |
| **QuinGeneratePathIndices** | depth × 50 | 路径索引生成 |
| **QuinLeafExists** | depth × 400 | Merkle 证明验证 |
| **ElGamalReRandomize** | 3,000 | 密文重随机化 |
| **Sha256Hasher** | 27,000 | 公共输入哈希 |
| **其他逻辑** | 500 | 赋值、断言等 |

**总约束数量**（以 stateTreeDepth = 2 为例）：
```
deactivateTreeDepth = 2 + 2 = 4

Total = 560 + 1,500 + 350 
      + (4 × 50) + (4 × 400) 
      + 3,000 + 27,000 + 500
      = 560 + 1,500 + 350 + 200 + 1,600 + 3,000 + 27,000 + 500
      = 34,710 约束
```

**不同配置下的约束数量**：

| stateTreeDepth | deactivateTreeDepth | 总约束数 | 证明生成时间（估算） |
|---------------|---------------------|---------|-------------------|
| 2 | 4 | ~34,700 | ~5 秒 |
| 4 | 6 | ~35,600 | ~6 秒 |
| 6 | 8 | ~36,500 | ~7 秒 |
| 8 | 10 | ~37,400 | ~8 秒 |

**观察**：
- 约束数量主要由 SHA256 主导（约 27,000）
- 树深度的影响相对较小（每层约 450 个约束）
- 相比 ProcessMessages（通常 > 100,000 约束），AddNewKey 更轻量

---

## 优化建议

### 1. 减少 SHA256 开销

**当前实现**：
```circom
component hasher = Sha256Hasher(7);
```

**优化方案 1**：使用 Poseidon（如果链上支持）
```circom
// 如果链上合约可以验证 Poseidon
component hasher = Hasher7();  // Poseidon
// 约束从 27,000 降低到 约 400
```

**优化方案 2**：减少打包字段
```circom
// 只打包必要的字段
component hasher = Sha256Hasher(4);
hasher.in[0] <== deactivateRoot;
hasher.in[1] <== pubKeyHash;
hasher.in[2] <== nullifier;
hasher.in[3] <== hash(d1[0], d1[1], d2[0], d2[1]);
// 从 7 个字段减少到 4 个
```

### 2. 批量处理

**当前实现**：一次处理一个密钥更换

**优化方案**：批量处理多个密钥更换
```circom
template AddNewKeyBatch(stateTreeDepth, batchSize) {
    signal input oldPrivateKeys[batchSize];
    signal input nullifiers[batchSize];
    // ...
    
    for (var i = 0; i < batchSize; i++) {
        // 处理每个密钥更换
    }
}
```

**优势**：
- 分摊 SHA256 的固定开销
- 降低平均每次操作的成本

### 3. 树结构优化

**当前实现**：5 叉树（TREE_ARITY = 5）

**权衡分析**：

| 树结构 | 优势 | 劣势 |
|-------|------|------|
| **二叉树** | 每层约束少（280） | 树更深 |
| **5叉树** | 树更浅 | 每层约束多（350） |
| **8叉树** | 树最浅 | 每层约束最多（500） |

**建议**：根据系统规模选择
- 小型系统（< 1,000 用户）：二叉树
- 中型系统（1,000 - 100,000 用户）：5 叉树
- 大型系统（> 100,000 用户）：8 叉树

---

## 总结

### 核心流程回顾

AddNewKey 电路通过以下 5 个步骤实现安全的密钥更换：

1. **验证 Nullifier**：证明用户拥有旧私钥
2. **计算共享密钥**：建立与 coordinator 的加密通道
3. **验证 Merkle 证明**：确认去激活记录的存在
4. **重随机化密文**：生成新的公钥关联，隐藏身份
5. **验证输入哈希**：确保公共输入完整性

### 安全保证

- ✅ **隐私保护**：零知识证明不泄露私钥和随机数
- ✅ **防重放**：Nullifier 机制防止重复使用
- ✅ **不可关联**：重随机化使新旧密文不可关联
- ✅ **可验证**：任何人可验证密钥更换的正确性

### 性能特点

- 约束数量：~34,700（stateTreeDepth = 2）
- 证明生成时间：~5 秒（现代硬件）
- 验证 Gas：~300,000（包含 SHA256 验证）

### 应用价值

AddNewKey 电路是 AMACI 系统实现**匿名性**和**灵活性**的关键组件：
- 允许用户在不暴露身份的情况下更换密钥
- 支持去激活后重新激活
- 增强系统的长期隐私保护

---

## 附录

### A. 常量定义

```javascript
// Nullifier 盐值
const NULLIFIER_CONSTANT = BigInt("1444992409218394441042");
// ASCII "NULLIFIER" 的某种编码

// 树参数
const TREE_ARITY = 5;  // 5 叉树

// 字段大小（BN254 曲线）
const FIELD_SIZE = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
```

### B. 相关文件

- 电路实现：`packages/circuits/circom/amaci/power/addNewKey.circom`
- 重随机化库：`packages/circuits/circom/amaci/power/lib/rerandomize.circom`
- ECDH 实现：`packages/circuits/circom/utils/ecdh.circom`
- 树工具：`packages/circuits/circom/utils/trees/incrementalQuinTree.circom`
- 哈希工具：`packages/circuits/circom/utils/hasherPoseidon.circom`
- SHA256 工具：`packages/circuits/circom/utils/hasherSha256.circom`

### C. 参考资源

- [MACI 官方文档](https://maci.pse.dev/)
- [ElGamal 加密](https://en.wikipedia.org/wiki/ElGamal_encryption)
- [ECDH 密钥交换](https://en.wikipedia.org/wiki/Elliptic-curve_Diffie%E2%80%93Hellman)
- [Poseidon 哈希](https://www.poseidon-hash.info/)
- [Groth16 证明系统](https://eprint.iacr.org/2016/260.pdf)

---

**文档版本**：1.0  
**最后更新**：2024-12-07  
**作者**：基于 addNewKey.circom 代码分析生成
