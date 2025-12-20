# AMACI ProcessMessages 电路深度分析

## 📋 目录

- [1. 概述](#1-概述)
- [2. ProcessMessages 电路结构](#2-processmessages-电路结构)
- [3. AMACI vs MACI 核心差异](#3-amaci-vs-maci-核心差异)
- [4. Deactivate 机制详解](#4-deactivate-机制详解)
- [5. Operator 处理流程](#5-operator-处理流程)
- [6. 完整工作流程](#6-完整工作流程)
- [7. 安全性分析](#7-安全性分析)

---

## 1. 概述

AMACI (Anonymous MACI) 是 MACI 的增强版本，增加了账户 deactivate/reactivate 功能，使用 ElGamal 加密来保护用户的激活状态隐私。ProcessMessages 电路是 AMACI 中最核心的电路之一，负责批量处理和验证投票消息。

### 1.1 主要功能

- **消息验证**：验证消息链的完整性和有效性
- **命令解密**：使用 ECDH 共享密钥解密投票命令
- **状态转换**：更新 State Tree 和 Vote Option Tree
- **Deactivate 检查**：验证账户的激活状态（AMACI 特有）
- **零知识证明**：生成状态转换的有效性证明

---

## 2. ProcessMessages 电路结构

### 2.1 主模板定义

```circom
template ProcessMessages(
    stateTreeDepth,      // 状态树深度
    voteOptionTreeDepth, // 投票选项树深度
    batchSize            // 批量处理消息数量
)
```

### 2.2 关键输入信号

#### 公共输入
- `inputHash`: SHA256 哈希，用于压缩多个公共输入
- `packedVals`: 打包的参数 (maxVoteOptions, numSignUps, isQuadraticCost)

#### 私有输入
```circom
// 协调者信息
signal input coordPrivKey;           // 协调者私钥
signal input coordPubKey[2];         // 协调者公钥

// 消息数据
signal input msgs[batchSize][7];     // 加密消息
signal input encPubKeys[batchSize][2]; // 消息的临时公钥

// 状态树信息
signal input currentStateRoot;       // 当前状态树根
signal input currentStateLeaves[batchSize][STATE_LEAF_LENGTH];
signal input currentStateLeavesPathElements[batchSize][stateTreeDepth][4];

// 状态承诺
signal input currentStateCommitment; // hash(stateRoot, salt)
signal input currentStateSalt;
signal input newStateCommitment;
signal input newStateSalt;

// 投票权重
signal input currentVoteWeights[batchSize];
signal input currentVoteWeightsPathElements[batchSize][voteOptionTreeDepth][4];

// AMACI 特有：deactivate 相关
signal input activeStateRoot;        // 活跃状态树根
signal input deactivateRoot;         // deactivate 树根
signal input deactivateCommitment;   // hash(activeStateRoot, deactivateRoot)
signal input activeStateLeaves[batchSize];
signal input activeStateLeavesPathElements[batchSize][stateTreeDepth][4];
```

### 2.3 电路处理流程

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 输入验证                                                  │
│    ├─ 验证 currentStateCommitment                           │
│    ├─ 验证 deactivateCommitment (AMACI)                     │
│    ├─ 验证 inputHash                                        │
│    └─ 验证 maxVoteOptions 和 numSignUps 范围               │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. 消息链验证                                                │
│    ├─ 计算每条消息的哈希                                     │
│    ├─ 验证消息链的连续性                                     │
│    └─ msgHashChain[batchSize] === batchEndHash              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. 协调者身份验证                                            │
│    ├─ 从 coordPrivKey 派生公钥                              │
│    └─ 验证派生公钥 === coordPubKey                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. 消息解密                                                  │
│    ├─ 使用 ECDH 派生共享密钥                                │
│    └─ 解密消息得到命令 (Command)                            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. 逆序处理消息 (i = batchSize-1 到 0)                      │
│    对每条消息：                                              │
│    ├─ StateLeafTransformer: 应用命令到状态叶                │
│    │   ├─ MessageValidator: 验证签名、nonce、余额           │
│    │   ├─ ElGamalDecrypt: 解密 deactivate 状态 (AMACI)     │
│    │   └─ 输出 isValid 标志                                 │
│    ├─ 根据 isValid 选择状态索引                             │
│    ├─ 验证原始状态叶在 currentStateRoot 中                  │
│    ├─ 验证 activeStateLeaf (AMACI)                          │
│    ├─ 验证 currentVoteWeight 在投票树中                     │
│    ├─ 更新投票树根                                          │
│    └─ 计算新的状态树根                                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. 输出验证                                                  │
│    └─ hash(newStateRoot, newStateSalt) === newStateCommitment│
└─────────────────────────────────────────────────────────────┘
```

---

## 3. AMACI vs MACI 核心差异

### 3.1 State Leaf 结构对比

#### MACI State Leaf (5 字段)
```
[pubKey[0], pubKey[1], balance, voRoot, nonce]
```
- 总计 5 个字段
- 使用单层 Poseidon 哈希

#### AMACI State Leaf (10 字段)
```
[pubKey[0], pubKey[1], balance, voRoot, nonce, c1[0], c1[1], c2[0], c2[1], 0]
```
- 总计 10 个字段
- `c1`, `c2`: ElGamal 加密的 deactivate 状态
- 使用双层 Poseidon 哈希

```typescript
// MACI 哈希计算
hash = poseidon([pubKey[0], pubKey[1], balance, voRoot, nonce])

// AMACI 哈希计算
hash = poseidon([
  poseidon([pubKey[0], pubKey[1], balance, voRoot, nonce]),  // 第一层
  poseidon([c1[0], c1[1], c2[0], c2[1], 0])                  // 第二层
])
```

### 3.2 InputHash 计算对比

#### MACI (6 个输入)
```circom
component hasher = Sha256Hasher6();
hasher.in[0] <== packedVals;
hasher.in[1] <== pubKeyHash;
hasher.in[2] <== batchStartHash;
hasher.in[3] <== batchEndHash;
hasher.in[4] <== currentStateCommitment;
hasher.in[5] <== newStateCommitment;
```

#### AMACI (7 个输入)
```circom
component hasher = Sha256Hasher(7);
hasher.in[0] <== packedVals;
hasher.in[1] <== pubKeyHash;
hasher.in[2] <== batchStartHash;
hasher.in[3] <== batchEndHash;
hasher.in[4] <== currentStateCommitment;
hasher.in[5] <== newStateCommitment;
hasher.in[6] <== deactivateCommitment;  // AMACI 新增
```

### 3.3 验证逻辑对比

#### MACI StateLeafTransformer
```circom
// 只验证消息有效性
isValid <== messageValidator.isValid
```

#### AMACI StateLeafTransformer
```circom
// 三重验证：消息有效性 + 未被 deactivate + 不是 deactivate 消息
component decryptIsActive = ElGamalDecrypt();
decryptIsActive.c1[0] <== slC1[0];
decryptIsActive.c1[1] <== slC1[1];
decryptIsActive.c2[0] <== slC2[0];
decryptIsActive.c2[1] <== slC2[1];
decryptIsActive.privKey <== coordPrivKey;

component activate = IsZero();
activate.in <== deactivate;

component valid = IsEqual();
valid.in[0] <== 3;
valid.in[1] <== (1 - decryptIsActive.isOdd) +  // 未被 deactivate
                activate.out +                   // 不是 deactivate 消息
                messageValidator.isValid;        // 消息有效
```

验证通过条件：
- `decryptIsActive.isOdd == 0` → 账户未被停用（偶数=active）
- `activate.out == 1` → 当前不是 deactivate 消息
- `messageValidator.isValid == 1` → 签名、nonce、余额等验证通过

### 3.4 额外的树结构

#### MACI
- State Tree: 存储用户状态

#### AMACI
- State Tree: 存储用户状态（包含加密的 deactivate 信息）
- Active State Tree: 跟踪用户活跃度（0=active, 非0=inactive）
- Deactivate Tree: 存储 deactivate 消息的哈希

---

## 4. Deactivate 机制详解

### 4.1 ElGamal 加密原理

AMACI 使用 **ElGamal 加密的奇偶性** 来编码 deactivate 状态：

```
plaintext = 0 (偶数) → Active (可以投票)
plaintext = 1 (奇数) → Deactivated (不能投票)
```

#### 加密过程
```typescript
function encryptOdevity(isOdd: boolean, pubKey: PubKey, randomKey: PrivKey) {
  // ElGamal 加密
  // c1 = randomKey * G
  // c2 = message * G + randomKey * pubKey
  // 其中 message = isOdd ? 1 : 0
}
```

#### 解密过程
```circom
template ElGamalDecrypt() {
  signal input c1[2];
  signal input c2[2];
  signal input privKey;
  
  // m * G = c2 - privKey * c1
  // 检查 m 的奇偶性
  signal output isOdd;
}
```

### 4.2 完整 Deactivate 流程

```
┌─────────────────────────────────────────────────────────────┐
│ 阶段 1: 用户注册 (SignUp)                                   │
├─────────────────────────────────────────────────────────────┤
│ 输入: pubKey, balance                                        │
│ 输出: State Leaf                                             │
│                                                              │
│ 1. 生成初始 c1, c2                                          │
│    c = encryptOdevity(false, coordPubKey, randomKey)        │
│    // false = 0 (偶数) = Active                             │
│                                                              │
│ 2. 创建 State Leaf                                          │
│    leaf = [pubKey[0], pubKey[1], balance, 0, 0,             │
│            c1[0], c1[1], c2[0], c2[1], 0]                   │
│                                                              │
│ 3. 计算叶子哈希并插入 State Tree                            │
│    hash = poseidon([                                         │
│      poseidon([pubKey[0], pubKey[1], balance, 0, 0]),       │
│      poseidon([c1[0], c1[1], c2[0], c2[1], 0])              │
│    ])                                                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 阶段 2: 用户发起 Deactivate                                 │
├─────────────────────────────────────────────────────────────┤
│ 用户操作:                                                    │
│ 1. 生成 deactivate 消息                                     │
│    message = encryptMessage({                               │
│      stateIdx: userStateIdx,                                │
│      voIdx: 0,           // 特殊标记                        │
│      newVotes: 0,        // 特殊标记                        │
│      newPubKey: [0, 0],  // 最后一条命令标记                │
│      nonce: currentNonce + 1,                               │
│      signature                                              │
│    }, coordPubKey)                                          │
│                                                              │
│ 2. 发送到链上                                               │
│    publishDeactivateMessage(message, encPubKey)             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 阶段 3: Operator 处理 Deactivate 消息                       │
├─────────────────────────────────────────────────────────────┤
│ processDeactivateMessages() 流程:                           │
│                                                              │
│ For each deactivate message:                                │
│   1. 解密并验证消息                                         │
│      cmd = decrypt(message, coordPrivKey)                   │
│      error = checkDeactivateCommand(cmd)                    │
│                                                              │
│   2. 获取用户当前状态                                       │
│      stateLeaf = stateTree.leaf(cmd.stateIdx)              │
│                                                              │
│   3. 检查是否已经 deactivated                               │
│      currentDeactivate = decrypt(coordPrivKey, {            │
│        c1: stateLeaf.c1,                                    │
│        c2: stateLeaf.c2                                     │
│      })                                                      │
│      if (currentDeactivate % 2 == 1) {                      │
│        error = "already deactivated"                        │
│      }                                                       │
│                                                              │
│   4. 生成新的加密 deactivate 标记                           │
│      newDeactivate = encryptOdevity(                        │
│        !error,              // 如果没有错误，设为 true (奇数) │
│        coordPubKey,                                          │
│        genStaticRandomKey() // 确定性随机数                 │
│      )                                                       │
│                                                              │
│   5. 更新 Active State Tree                                 │
│      if (!error) {                                          │
│        activeStateTree.updateLeaf(                          │
│          stateIdx,                                          │
│          newActiveState[i] // 非零值表示 inactive          │
│        )                                                     │
│      }                                                       │
│                                                              │
│   6. 更新 Deactivate Tree                                   │
│      dLeaf = [                                              │
│        newDeactivate.c1[0], newDeactivate.c1[1],           │
│        newDeactivate.c2[0], newDeactivate.c2[1],           │
│        poseidon(sharedKey)  // 用于后续 reactivate         │
│      ]                                                       │
│      deactivateTree.updateLeaf(dIndex, hash(dLeaf))        │
│                                                              │
│   7. 生成 ZK 证明                                           │
│      proof = generateProof(processDeactivateCircuit, {      │
│        currentStateRoot, activeStateRoot,                   │
│        deactivateRoot, newDeactivateRoot,                   │
│        messages, stateLeaves, pathElements, ...             │
│      })                                                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 阶段 4: 投票时验证 Deactivate 状态                          │
├─────────────────────────────────────────────────────────────┤
│ ProcessMessages 电路验证:                                    │
│                                                              │
│ 1. 读取 State Leaf                                          │
│    stateLeaf = [pubKey, balance, voRoot, nonce,             │
│                 c1[0], c1[1], c2[0], c2[1], 0]              │
│                                                              │
│ 2. 解密 deactivate 状态                                     │
│    decryptIsActive.c1 <== [c1[0], c1[1]]                   │
│    decryptIsActive.c2 <== [c2[0], c2[1]]                   │
│    decryptIsActive.privKey <== coordPrivKey                 │
│    isOdd = decryptIsActive.isOdd                            │
│                                                              │
│ 3. 检查 Active State                                        │
│    activeStateLeaf = activeStateTree.leaf(stateIdx)         │
│    activate.in <== activeStateLeaf                          │
│    // activate.out = 1 if activeStateLeaf == 0 (active)    │
│                                                              │
│ 4. 综合验证                                                 │
│    valid = (1 - isOdd) + activate.out + msgValidator.isValid│
│    // 必须等于 3 才通过                                     │
│    // 即: isOdd=0 (active) + activate=1 + valid=1          │
│                                                              │
│ 5. 如果验证失败                                             │
│    → 使用默认索引 (MAX_INDEX - 1)                          │
│    → 不更新状态                                             │
│    → 但仍然处理消息链（保证完整性）                         │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 阶段 5: 用户重新激活 (AddNewKey)                            │
├─────────────────────────────────────────────────────────────┤
│ 1. 用户在 Deactivate Tree 中找到自己的 deactivate leaf     │
│    - 通过 sharedKeyHash 匹配                                │
│                                                              │
│ 2. 生成 rerandomize 证明                                    │
│    - 证明拥有对应的私钥                                     │
│    - Rerandomize c1, c2 得到 d1, d2                         │
│    - 生成 nullifier 防止重复使用                            │
│                                                              │
│ 3. 链上验证并重新注册                                       │
│    - 验证 ZK 证明                                           │
│    - 验证 nullifier 未使用                                  │
│    - 创建新的 State Leaf (deactivate 状态重置为 0)         │
│                                                              │
│ 4. 用户可以继续投票                                         │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 安全性保障

#### 4.3.1 隐私保护
- ElGamal 加密保护 deactivate 状态
- 只有 coordinator 能解密状态
- 链上观察者无法知道用户是否被 deactivate

#### 4.3.2 防止重复激活
- 使用 nullifier 机制
- nullifier = poseidon([privKey, constant])
- 每个私钥只能生成一次相同的 nullifier

#### 4.3.3 Rerandomization
- 使用 rerandomize 技术重新加密
- 保持相同的明文，但改变密文
- 防止链接攻击（linking attack）

```typescript
function rerandomize(
  pubKey: PubKey,
  oldCiphertext: { c1: PubKey, c2: PubKey },
  randomVal: bigint
): { d1: PubKey, d2: PubKey } {
  // d1 = c1 + randomVal * G
  // d2 = c2 + randomVal * pubKey
  // 解密结果保持不变
}
```

---

## 5. Operator 处理流程

### 5.1 初始化

```typescript
operator.initMaci({
  stateTreeDepth: 2,       // 状态树深度，可容纳 5^2 = 25 用户
  intStateTreeDepth: 1,    // 中间树深度，用于 tally
  voteOptionTreeDepth: 1,  // 投票选项树深度，5^1 = 5 选项
  batchSize: 5,            // 每批处理 5 条消息
  maxVoteOptions: 5,
  numSignUps: 25,
  isQuadraticCost: false,  // 线性成本
  isAmaci: true,           // 启用 AMACI 模式
  derivePathParams
})
```

初始化后的状态：
- `stateTree`: 初始化为空树，零值为 `zeroHash10`（双层哈希）
- `activeStateTree`: 初始化为空树，零值为 `0n`（全 0 表示 active）
- `deactivateTree`: 初始化为空树
- `voTreeZeroRoot`: 空投票选项树的根
- `stateCommitment`: `poseidon([stateTree.root, 0n])`

### 5.2 用户注册流程

```typescript
// 注册用户
operator.initStateTree(
  leafIdx: 0,
  pubKey: [user1PubX, user1PubY],
  balance: 100,
  c: [0n, 0n, 0n, 0n]  // 初始 deactivate 状态为 0 (active)
)
```

更新的数据结构：
```typescript
stateLeaves.set(0, {
  pubKey: [user1PubX, user1PubY],
  balance: 100n,
  voTree: new Tree(5, 1, 0n),  // 空投票树
  nonce: 0n,
  voted: false,
  d1: [0n, 0n],
  d2: [0n, 0n]
})

// 计算并更新 State Tree
hash = poseidon([
  poseidon([user1PubX, user1PubY, 100, 0, 0]),
  poseidon([0, 0, 0, 0, 0])
])
stateTree.updateLeaf(0, hash)
```

### 5.3 消息处理流程

#### 5.3.1 接收消息

```typescript
const { message, command } = operator.pushMessage(
  ciphertext,  // 加密的投票命令
  encPubKey    // 临时公钥
)
```

处理步骤：
1. 计算消息哈希链
2. 解密消息得到命令
3. 存储到 `messages` 和 `commands` 数组

#### 5.3.2 结束投票期

```typescript
operator.endVotePeriod()
```

状态转换：
- `states` → `PROCESSING`
- `msgEndIdx` = 消息总数
- 重置 `stateSalt` 和 `stateCommitment`

#### 5.3.3 批量处理消息

```typescript
const result = await operator.processMessages({
  newStateSalt: 0n,
  wasmFile: 'path/to/ProcessMessages.wasm',
  zkeyFile: 'path/to/ProcessMessages.zkey',
  derivePathParams
})
```

详细处理逻辑：

```typescript
// 1. 确定批次范围
batchStartIdx = floor((msgEndIdx - 1) / batchSize) * batchSize
batchEndIdx = min(batchStartIdx + batchSize, msgEndIdx)

// 2. 填充空消息（如果不足 batchSize）
while (messages.length < batchSize) {
  messages.push(emptyMessage)
  commands.push(null)
}

// 3. 逆序处理消息（从后往前）
for (i = batchSize - 1; i >= 0; i--) {
  cmd = commands[i]
  error = checkCommandNow(cmd)
  
  // 3.1 确定状态索引
  if (error) {
    stateIdx = 5^stateTreeDepth - 1  // 使用最后一个索引（哨兵）
  } else {
    stateIdx = cmd.stateIdx
  }
  
  // 3.2 构建 currentStateLeaves
  s = stateLeaves.get(stateIdx)
  if (isAmaci) {
    currentStateLeaves[i] = [
      ...s.pubKey,
      s.balance,
      s.voted ? s.voTree.root : 0n,
      s.nonce,
      ...s.d1,  // c1
      ...s.d2,  // c2
      0n
    ]
  }
  
  // 3.3 收集 Merkle 路径
  currentStateLeavesPathElements[i] = stateTree.pathElementOf(stateIdx)
  currentVoteWeightsPathElements[i] = s.voTree.pathElementOf(voIdx)
  activeStateLeaves[i] = activeStateTree.leaf(stateIdx)
  activeStateLeavesPathElements[i] = activeStateTree.pathElementOf(stateIdx)
  
  // 3.4 如果命令有效，更新状态
  if (!error) {
    s.pubKey = [...cmd.newPubKey]
    s.balance = s.balance + currVotes - cmd.newVotes
    s.voTree.updateLeaf(voIdx, cmd.newVotes)
    s.nonce = cmd.nonce
    s.voted = true
    
    // 重新计算叶子哈希
    hash = poseidon([
      poseidon([...s.pubKey, s.balance, s.voTree.root, s.nonce]),
      poseidon([...s.d1, ...s.d2, 0n])
    ])
    stateTree.updateLeaf(stateIdx, hash)
  }
}

// 4. 计算新的状态承诺
newStateRoot = stateTree.root
newStateCommitment = poseidon([newStateRoot, newStateSalt])

// 5. 生成输入哈希
if (isAmaci) {
  inputHash = computeInputHash([
    packedVals,
    pubKeyHasher,
    batchStartHash,
    batchEndHash,
    currentStateCommitment,
    newStateCommitment,
    deactivateCommitment  // AMACI 特有
  ])
}

// 6. 生成 ZK 证明
proof = await groth16.fullProve(input, wasmFile, zkeyFile)

// 7. 更新 operator 状态
msgEndIdx = batchStartIdx
stateCommitment = newStateCommitment
stateSalt = newStateSalt
```

### 5.4 命令验证逻辑

```typescript
private checkCommandNow(cmd: Command | null): string | undefined {
  if (!cmd) return 'empty command'
  
  // 1. 检查索引范围
  if (cmd.stateIdx > numSignUps) return 'state leaf index overflow'
  if (cmd.voIdx > maxVoteOptions) return 'vote option index overflow'
  
  const stateIdx = Number(cmd.stateIdx)
  const s = stateLeaves.get(stateIdx)
  
  // 2. AMACI: 检查是否在活跃状态
  const as = activeStateTree.leaf(stateIdx)
  if (as !== 0n) return 'inactive'
  
  // 3. AMACI: 检查是否被 deactivate
  const deactivate = decrypt(coordPrivKey, {
    c1: { x: s.d1[0], y: s.d1[1] },
    c2: { x: s.d2[0], y: s.d2[1] },
    xIncrement: 0n
  })
  if (deactivate % 2n === 1n) return 'deactivated'
  
  // 4. 检查 nonce
  if (s.nonce + 1n !== cmd.nonce) return 'nonce error'
  
  // 5. 验证签名
  const verified = verifySignature(cmd.msgHash, cmd.signature, s.pubKey)
  if (!verified) return 'signature error'
  
  // 6. 检查余额
  if (s.balance + currVotes < cmd.newVotes) return 'insufficient balance'
  
  return undefined  // 验证通过
}
```

---

## 6. 完整工作流程

### 6.1 时序图

```
用户 A          用户 B          Operator         链上合约         电路
  │               │                │                │              │
  │ ─────────── SignUp ──────────→ │                │              │
  │               │                │ ─── initStateTree ───────→    │
  │               │                │                │              │
  │               │ ─── SignUp ───→│                │              │
  │               │                │ ─── initStateTree ───────→    │
  │               │                │                │              │
  │ ─── publishMessage(vote) ────→ │                │              │
  │               │                │ ─── pushMessage ──────────→   │
  │               │                │                │              │
  │               │ ─── publishMessage(deactivate) →│              │
  │               │                │ ─── pushDeactivateMessage ──→ │
  │               │                │                │              │
  │               │                │ ─── endVotePeriod ────────→   │
  │               │                │                │              │
  │               │                │ ─── processDeactivateMessages ──────→
  │               │                │                │              │ [验证]
  │               │                │ ←──── proof, deactivateRoot ──┘
  │               │                │                │              │
  │               │                │ ─── submitDeactivateProof ──→ │
  │               │                │                │ [验证 proof] │
  │               │                │                │ [更新状态]   │
  │               │                │                │              │
  │               │                │ ─── processMessages ──────────────→
  │               │                │                │              │ [验证]
  │               │                │                │              │ [检查 deactivate]
  │               │                │ ←──── proof, newStateRoot ────┘
  │               │                │                │              │
  │               │                │ ─── submitMessageProof ──────→│
  │               │                │                │ [验证 proof] │
  │               │                │                │ [更新状态]   │
  │               │                │                │              │
  │               │ ─── addNewKey(proof, d, nullifier) ───────────→│
  │               │                │                │ [验证 proof] │
  │               │                │                │ [检查 nullifier]
  │               │                │                │ [重新注册]   │
  │               │                │                │              │
  │               │ ─── publishMessage(vote) ─────→ │              │
  │               │                │ ─── pushMessage ──────────→   │
  │               │                │                │              │
  │               │                │ ─── processTally ─────────────────→
  │               │                │ ←──── proof, tallyResults ────┘
  │               │                │                │              │
```

### 6.2 数据流

```
┌─────────────────────────────────────────────────────────────┐
│ 链上数据 (On-chain)                                         │
├─────────────────────────────────────────────────────────────┤
│ - 消息队列: [msg1, msg2, ..., msgN]                        │
│ - Deactivate 消息队列: [dmsg1, dmsg2, ..., dmsgM]         │
│ - State Commitment                                          │
│ - Deactivate Commitment                                     │
│ - Coordinator Public Key                                    │
│ - Nullifier Set (防止重复 addNewKey)                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Operator 本地状态 (Off-chain)                               │
├─────────────────────────────────────────────────────────────┤
│ - State Tree: Merkle Tree of state leaves                   │
│   └─ Each leaf: hash([pubKey, balance, voRoot, nonce],      │
│                      [c1, c2, 0])                            │
│                                                              │
│ - Active State Tree: 跟踪用户活跃状态                       │
│   └─ Each leaf: 0 (active) or timestamp (inactive)          │
│                                                              │
│ - Deactivate Tree: 存储 deactivate 信息                    │
│   └─ Each leaf: hash([c1, c2, sharedKeyHash])               │
│                                                              │
│ - State Leaves Map: 完整的状态叶数据                        │
│   └─ {pubKey, balance, voTree, nonce, voted, d1, d2}        │
│                                                              │
│ - Messages & Commands: 解密后的消息                         │
│                                                              │
│ - Processing State: msgEndIdx, stateCommitment, etc.        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 电路输入 (Circuit Inputs)                                    │
├─────────────────────────────────────────────────────────────┤
│ Public Inputs:                                               │
│ - inputHash (SHA256)                                         │
│                                                              │
│ Private Inputs:                                              │
│ - coordPrivKey, coordPubKey                                  │
│ - msgs[batchSize][7], encPubKeys[batchSize][2]              │
│ - currentStateRoot, currentStateLeaves[batchSize][10]       │
│ - currentStateLeavesPathElements[batchSize][depth][4]       │
│ - activeStateRoot, activeStateLeaves[batchSize]             │
│ - deactivateRoot, deactivateCommitment                      │
│ - currentVoteWeights, voteWeightsPathElements               │
│ - stateCommitments, salts                                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 电路输出 (Circuit Outputs)                                   │
├─────────────────────────────────────────────────────────────┤
│ - ZK Proof (Groth16)                                         │
│ - Public Signals: inputHash                                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 链上验证 (On-chain Verification)                            │
├─────────────────────────────────────────────────────────────┤
│ 1. 验证 ZK Proof                                            │
│ 2. 检查 inputHash 匹配                                      │
│ 3. 更新 State Commitment                                     │
│ 4. 更新 Deactivate Commitment (如果是 deactivate 批次)     │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. 安全性分析

### 7.1 威胁模型

#### 7.1.1 Operator 作恶场景

| 攻击类型 | 描述 | 防御机制 |
|---------|------|---------|
| 审查攻击 | Operator 拒绝处理某些消息 | 消息链验证，必须按顺序处理 |
| 伪造投票 | Operator 篡改投票内容 | 签名验证，只有私钥持有者能签名 |
| 重放攻击 | 重复使用旧消息 | Nonce 机制，严格递增 |
| 错误状态转换 | 不正确地更新状态树 | ZK 证明验证状态转换正确性 |
| 泄露隐私 | 公开用户的 deactivate 状态 | ElGamal 加密，链上只有密文 |

#### 7.1.2 用户作恶场景

| 攻击类型 | 描述 | 防御机制 |
|---------|------|---------|
| 双重投票 | 尝试多次投票 | Nonce 机制 + State Tree 验证 |
| 余额透支 | 投票超过可用余额 | 余额检查在 MessageValidator 中 |
| 伪造身份 | 使用他人公钥投票 | 签名验证 |
| 绕过 Deactivate | 在被停用后继续投票 | ElGamalDecrypt + 三重验证 |

### 7.2 隐私保护级别

#### 7.2.1 投票隐私
- ✅ **投票内容隐私**：使用 ECDH + Poseidon 加密，只有 coordinator 能解密
- ✅ **投票者匿名性**：消息加密后无法关联到具体用户
- ✅ **投票时间隐私**：批量处理，无法确定具体投票时间

#### 7.2.2 Deactivate 状态隐私
- ✅ **状态加密**：ElGamal 加密，链上只有密文
- ✅ **解密权限**：只有 coordinator 能解密
- ✅ **Rerandomization**：重新激活时改变密文，防止链接

#### 7.2.3 可能的隐私泄露
- ⚠️ **Active State Tree**：如果 coordinator 恶意，可能泄露哪些用户被 deactivate
- ⚠️ **消息模式分析**：通过消息长度、时间戳等元数据可能推断部分信息
- ⚠️ **最终结果**：Tally 结果是公开的，可能通过结果推断投票模式

### 7.3 完整性保证

#### 7.3.1 消息链完整性
```circom
// 确保所有消息都被处理，且顺序正确
msgHashChain[0] <== batchStartHash;
for (i = 0; i < batchSize; i++) {
  msgHashChain[i+1] <== hash(msgHashChain[i], msgs[i])
}
msgHashChain[batchSize] === batchEndHash;
```

#### 7.3.2 状态树完整性
```circom
// 验证每个状态转换的 Merkle 证明
QuinTreeInclusionProof.verify(
  leaf: stateLeafHash,
  root: currentStateRoot,
  pathElements: stateLeafPathElements,
  pathIndices: stateLeafPathIndices
)
```

#### 7.3.3 承诺绑定
```circom
// State Commitment 绑定状态树根和盐值
currentStateCommitment === hash(currentStateRoot, currentStateSalt)
newStateCommitment === hash(newStateRoot, newStateSalt)

// Deactivate Commitment 绑定两棵树
deactivateCommitment === hash(activeStateRoot, deactivateRoot)
```

### 7.4 防重放机制

#### 7.4.1 Nonce 机制
- 每个用户维护独立的 nonce
- 必须严格递增：`newNonce = oldNonce + 1`
- 验证失败的消息不更新 nonce

#### 7.4.2 Nullifier 机制（AddNewKey）
```typescript
nullifier = poseidon([privKey, CONSTANT])
```
- 每个私钥只能生成一个 nullifier
- 链上维护 nullifier 集合，防止重复使用
- 使用确定性常量确保可重现性

#### 7.4.3 消息哈希链
- 每条消息包含前一条消息的哈希
- 形成不可篡改的消息链
- 防止消息被删除或重新排序

---

## 8. 性能优化建议

### 8.1 电路优化

1. **批量大小调整**
   - 较大的 batchSize 可减少证明次数
   - 但会增加单次证明时间和内存消耗
   - 推荐：5-10 条消息/批次

2. **树深度权衡**
   - 较深的树可容纳更多用户/选项
   - 但会增加 Merkle 证明的约束数量
   - 推荐：stateTreeDepth ≤ 4, voteOptionTreeDepth ≤ 2

3. **哈希函数选择**
   - Poseidon: 对 ZK 友好，约束少
   - SHA256: 用于 inputHash，减少链上验证成本
   - 合理搭配使用

### 8.2 Operator 优化

1. **并行处理**
   ```typescript
   // 可以并行准备多个批次的输入
   const batch1 = prepareBatchInput(0, batchSize)
   const batch2 = prepareBatchInput(batchSize, 2*batchSize)
   
   // 但证明生成必须串行（资源密集）
   const proof1 = await generateProof(batch1)
   const proof2 = await generateProof(batch2)
   ```

2. **状态缓存**
   ```typescript
   // 缓存常用的 Merkle 路径
   const pathCache = new Map<number, bigint[][]>()
   
   // 缓存投票树根
   const voTreeRootCache = new Map<number, bigint>()
   ```

3. **增量更新**
   - 只更新变化的叶子
   - 使用 Copy-on-Write 树结构
   - 避免重复计算哈希

### 8.3 链上优化

1. **输入压缩**
   - 使用 SHA256 压缩多个公共输入为 inputHash
   - 减少 calldata 成本

2. **批量验证**
   - 一次交易提交多个批次的证明
   - 摊销固定成本

3. **存储优化**
   - 只存储承诺（commitment），不存储完整树
   - 使用事件（event）发布详细数据

---

## 9. 常见问题 (FAQ)

### Q1: 为什么要逆序处理消息？

**A:** 为了实现高效的状态树更新。

```
前向处理需要：
  state0 → state1 → state2 → state3 (需要存储所有中间状态)

逆序处理：
  state3 → state2 → state1 → state0 (只需存储最终状态)
  证明时：从 state3 开始，每次证明一步转换
```

在电路中，我们从 `stateRoots[batchSize]` 开始（当前状态），逆序计算到 `stateRoots[0]`（新状态）。

### Q2: 为什么 deactivate 使用奇偶性而不是 0/1？

**A:** ElGamal 加密天然适合编码离散对数问题的解。在椭圆曲线上，判断一个点是否代表奇数或偶数比解密完整消息更高效。

```
传统方案：解密得到 m，判断 m == 0 or m == 1
奇偶性方案：只需判断 m % 2，无需完全解密
```

在 circom 中，实现 `isOdd` 检查的约束数量远少于完整解密。

### Q3: 为什么需要 activeStateTree 和 State Leaf 中的 c1/c2？

**A:** 双重保护机制。

- **activeStateTree**: 快速检查，O(1) 查找
- **c1/c2 in State Leaf**: 加密保护，隐私性强

```
activeStateTree: 用于 processDeactivateMessages 更新
State Leaf c1/c2: 用于 processMessages 验证
```

两者配合使用，既保证效率又保证隐私。

### Q4: inputHash 为什么使用 SHA256 而不是 Poseidon？

**A:** 权衡链上和链下成本。

| 哈希函数 | 电路约束 | 链上验证成本 | 适用场景 |
|---------|---------|-------------|---------|
| Poseidon | ~150 | 高 | 电路内部计算 |
| SHA256 | ~25000 | 低（预编译） | 链上验证的公共输入 |

使用 SHA256 压缩公共输入，在 Solidity 中验证成本很低（gas < 100），但能显著减少 calldata 大小。

### Q5: 如何确保 Operator 不会审查消息？

**A:** 消息链机制 + 超时保护。

```
1. 消息链强制顺序处理
   msgHash[i+1] = hash(msgHash[i], msg[i])
   
2. 链上超时机制（在合约中实现）
   if (block.timestamp > deadline && !processed) {
     coordinator = anyone  // 允许任何人成为临时 coordinator
   }
   
3. 社区监督
   任何人都可以下载消息，验证 Operator 是否正确处理
```

### Q6: Rerandomize 如何工作？

**A:** 利用 ElGamal 加密的同态性质。

```typescript
// 原始加密
c1 = r * G
c2 = m * G + r * pubKey

// Rerandomize
d1 = c1 + r' * G = (r + r') * G
d2 = c2 + r' * pubKey = m * G + (r + r') * pubKey

// 解密结果相同
m * G = d2 - privKey * d1
      = c2 - privKey * c1
```

密文改变了（c1→d1, c2→d2），但解密后的明文 m 保持不变。

---

## 10. 参考资料

### 10.1 相关文档
- [ProcessMessages.md](./ProcessMessages.md) - MACI 版本的 ProcessMessages 说明
- [StateLeafTransformer.md](./StateLeafTransformer.md) - 状态转换器详解
- [MessageValidator.md](./MessageValidator.md) - 消息验证逻辑
- [TallyVotes.md](./TallyVotes.md) - 投票计数电路

### 10.2 相关代码
- 电路实现：`packages/circuits/circom/amaci/power/processMessages.circom`
- Operator 实现：`packages/sdk/src/operator.ts`
- 合约实现：`contracts/amaci/src/contract.rs`

### 10.3 学术资源
- [MACI 原始论文](https://github.com/privacy-scaling-explorations/maci)
- [ElGamal 加密](https://en.wikipedia.org/wiki/ElGamal_encryption)
- [Groth16 证明系统](https://eprint.iacr.org/2016/260.pdf)

---

## 附录 A: 关键数据结构

### State Leaf (AMACI)
```typescript
{
  pubKey: [bigint, bigint],     // EdDSA 公钥
  balance: bigint,              // 剩余投票积分
  voTree: Tree,                 // 投票选项树（存储各选项的投票数）
  nonce: bigint,                // 防重放计数器
  voted: boolean,               // 是否已投票
  d1: [bigint, bigint],         // ElGamal c1
  d2: [bigint, bigint]          // ElGamal c2
}
```

### Command
```typescript
{
  nonce: bigint,                // 命令的 nonce
  stateIdx: bigint,             // 状态叶索引
  voIdx: bigint,                // 投票选项索引
  newVotes: bigint,             // 新的投票数
  newPubKey: [bigint, bigint],  // 新公钥（用于密钥更换）
  signature: {
    R8: [bigint, bigint],       // EdDSA 签名 R 点
    S: bigint                   // EdDSA 签名 S 值
  },
  msgHash: bigint               // 消息哈希
}
```

### Message
```typescript
{
  ciphertext: bigint[7],        // 加密的命令
  encPubKey: [bigint, bigint],  // 临时公钥
  prevHash: bigint,             // 前一条消息的哈希
  hash: bigint                  // 当前消息的哈希
}
```

---

## 附录 B: 电路约束数量估算

基于 `stateTreeDepth=2, voteOptionTreeDepth=1, batchSize=5`:

| 组件 | 约束数量 (估算) | 说明 |
|-----|----------------|------|
| InputHasher (SHA256) | ~25,000 | 7 个输入的 SHA256 |
| MessageHasher × 5 | ~125,000 | 5 条消息，每条 ~25k |
| MessageToCommand × 5 | ~50,000 | ECDH + Poseidon 解密 |
| StateLeafTransformer × 5 | ~15,000 | 包含 ElGamalDecrypt |
| Merkle Proof × 5 | ~10,000 | QuinTree depth=2 |
| VoteWeight Proof × 5 | ~5,000 | QuinTree depth=1 |
| ActiveState Proof × 5 | ~10,000 | QuinTree depth=2 |
| **总计** | **~240,000** | 约 24 万约束 |

证明时间（RTX 3090）：~30 秒
内存消耗：~16 GB
Proof 大小：~300 bytes (Groth16)

---

*文档版本: 1.0*  
*最后更新: 2024-12*  
*作者: MACI Development Team*

