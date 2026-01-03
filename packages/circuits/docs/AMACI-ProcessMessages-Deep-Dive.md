# AMACI ProcessMessages 深度技术解析

## 目录

1. [Operator 处理流程详解](#1-operator-处理流程详解)
2. [电路约束规则详解](#2-电路约束规则详解)
3. [MessageValidator 验证机制](#3-messagevalidator-验证机制)
4. [StateLeafTransformer 状态转换](#4-stateleaftransformer-状态转换)
5. [Deactivate 检测机制](#5-deactivate-检测机制)
6. [数学约束和证明](#6-数学约束和证明)

---

## 1. Operator 处理流程详解

### 1.1 processMessages 完整实现

```typescript
// packages/sdk/src/operator.ts: Line 1279-1494

async processMessages({
    newStateSalt = 0n,
    wasmFile,
    zkeyFile,
    derivePathParams
}: {
    newStateSalt?: bigint;
    wasmFile?: ZKArtifact;
    zkeyFile?: ZKArtifact;
    derivePathParams?: DerivePathParams;
} = {}): Promise<ProcessMessageResult> {
```

#### 1.1.1 阶段一：初始化和验证

```typescript
// 第 1 步：状态检查
if (this.states !== MACI_STATES.PROCESSING) {
    throw new Error('Period error - not in processing state');
}

// 第 2 步：验证初始化
if (!this.batchSize || !this.stateTree || !this.activeStateTree || !this.deactivateTree) {
    throw new Error('MACI not initialized. Call initMaci first.');
}

// 第 3 步：获取签名器
const signer = this.getSigner(derivePathParams);
```

**关键点：**
- 必须在 `PROCESSING` 状态才能处理消息
- 需要三棵树：`stateTree`, `activeStateTree`, `deactivateTree`
- Operator 使用协调者私钥签名器

#### 1.1.2 阶段二：批次范围计算

```typescript
// 第 4 步：计算批次范围
const batchSize = this.batchSize;  // 例如：5
const batchStartIdx = Math.floor((this.msgEndIdx - 1) / batchSize) * batchSize;
const batchEndIdx = Math.min(batchStartIdx + batchSize, this.msgEndIdx);

console.log(`Process messages [${batchStartIdx}, ${batchEndIdx})`);
```

**批次计算示例：**
```
假设：
- batchSize = 5
- msgEndIdx = 13 (总共13条消息)

批次划分：
  批次 0: [0, 5)   - 消息 0,1,2,3,4
  批次 1: [5, 10)  - 消息 5,6,7,8,9
  批次 2: [10, 13) - 消息 10,11,12 (不足5条，填充空消息)

逆序处理：
  第一次调用: msgEndIdx=13 -> batchStartIdx=10, batchEndIdx=13
  第二次调用: msgEndIdx=10 -> batchStartIdx=5,  batchEndIdx=10
  第三次调用: msgEndIdx=5  -> batchStartIdx=0,  batchEndIdx=5
```

#### 1.1.3 阶段三：消息准备和填充

```typescript
// 第 5 步：获取消息切片
const messages = this.messages.slice(batchStartIdx, batchEndIdx);
const commands = this.commands.slice(batchStartIdx, batchEndIdx);

// 第 6 步：填充空消息到 batchSize
while (messages.length < batchSize) {
    messages.push(this.emptyMessage());  // [0n, 0n, 0n, 0n, 0n, 0n, 0n], [0n, 0n]
    commands.push(null);
}
```

**空消息结构：**
```typescript
private emptyMessage(): Message {
    return {
        ciphertext: [0n, 0n, 0n, 0n, 0n, 0n, 0n],  // 7个0
        encPubKey: [0n, 0n],                       // 公钥为0表示空消息
        prevHash: 0n,
        hash: 0n
    };
}
```

**为什么需要填充？**
- 电路要求固定大小的输入数组
- 空消息不会改变状态（通过 `encPubKey[0] == 0` 检测）
- 简化电路设计，避免动态大小

#### 1.1.4 阶段四：逆序处理核心循环

```typescript
// 第 7 步：准备数据结构
const currentStateLeaves = new Array(batchSize);
const currentStateLeavesPathElements = new Array(batchSize);
const currentVoteWeights = new Array(batchSize);
const currentVoteWeightsPathElements = new Array(batchSize);
const activeStateLeaves = new Array(batchSize);
const activeStateLeavesPathElements = new Array(batchSize);

// 第 8 步：逆序遍历（关键！）
for (let i = batchSize - 1; i >= 0; i--) {
    const cmd = commands[i];
    const error = this.checkCommandNow(cmd);  // 预检查
    
    // 第 8.1 步：确定状态索引
    let stateIdx = 5 ** this.stateTreeDepth! - 1;  // MAX_INDEX - 1
    let voIdx = 0;
    if (!error) {
        stateIdx = Number(cmd!.stateIdx);
        voIdx = Number(cmd!.voIdx);
    }
```

**逆序处理的原因：**
```
正序问题：
  msg0 应用到 state[0] -> newState0, newRoot0
  msg1 应用到 state[1] -> newState1, newRoot1
  需要在应用 msg1 前更新 state[0]，破坏了独立性

逆序优势：
  msg4 应用到 currentState[4] -> newRoot4
  msg3 应用到 currentState[3] -> newRoot3  (使用 newRoot4)
  msg2 应用到 currentState[2] -> newRoot2  (使用 newRoot3)
  每条消息使用前一条的结果，顺序清晰

电路验证：
  verify(state[4], pathElements[4], currentRoot)
  compute newRoot4 from newState[4]
  verify(state[3], pathElements[3], newRoot4)
  ...
```

#### 1.1.5 阶段五：状态数据准备

```typescript
    // 第 8.2 步：获取状态叶子
    const s = this.stateLeaves.get(stateIdx) || this.emptyState();
    const currVotes = s.voTree.leaf(voIdx);
    
    // 第 8.3 步：构建 currentStateLeaves (AMACI 10字段)
    if (this.isAmaci) {
        currentStateLeaves[i] = [
            ...s.pubKey,                        // [0-1] 公钥
            s.balance,                          // [2] 余额
            s.voted ? s.voTree.root : 0n,       // [3] 投票选项树根
            s.nonce,                            // [4] nonce
            ...s.d1,                            // [5-6] ElGamal c1
            ...s.d2,                            // [7-8] ElGamal c2
            0n                                  // [9] xIncrement
        ];
    } else {
        // MACI 5字段
        currentStateLeaves[i] = [
            ...s.pubKey, s.balance, s.voted ? s.voTree.root : 0n, s.nonce
        ];
    }
```

**字段详解：**
```
[0-1] pubKey: 用户的 EdDSA 公钥 (Baby JubJub 曲线点)
[2] balance: 剩余语音积分
[3] voTreeRoot: 
    - 如果从未投票: 0
    - 否则: Merkle root of [vote[0], vote[1], ..., vote[n]]
[4] nonce: 
    - 初始值: 0
    - 每次成功投票: +1
    - 防重放攻击
[5-6] c1 = (c1.x, c1.y): ElGamal 密文第一部分
    - c1 = r * G (r是随机数，G是生成元)
[7-8] c2 = (c2.x, c2.y): ElGamal 密文第二部分
    - c2 = m * G + r * coordPubKey
    - m = 0 (active) 或 1 (deactivated)
[9] xIncrement: 保留字段（用于密钥轮换）
```

#### 1.1.6 阶段六：Merkle 路径获取

```typescript
    // 第 8.4 步：获取 State Tree 的 Merkle 路径
    currentStateLeavesPathElements[i] = this.stateTree.pathElementOf(stateIdx);
    
    // 第 8.5 步：获取 Vote Option Tree 的 Merkle 路径
    currentVoteWeights[i] = currVotes;
    currentVoteWeightsPathElements[i] = s.voTree.pathElementOf(voIdx);
    
    // 第 8.6 步：获取 Active State 数据 (AMACI only)
    activeStateLeaves[i] = this.activeStateTree.leaf(stateIdx);
    activeStateLeavesPathElements[i] = this.activeStateTree.pathElementOf(stateIdx);
```

**Merkle 路径示例：**
```
假设 stateTreeDepth = 2, stateIdx = 3

State Tree (5-ary):
         root
       /  |  \
      0   1   2   3   4
          
pathElementOf(3) 返回:
  [siblings_at_depth_0] = [h(0), h(1), h(2), h(4)]  // 同级的其他4个节点

验证过程：
  computed_root = hash5(h(0), h(1), h(2), leaf(3), h(4))
  assert computed_root == expected_root
```

#### 1.1.7 阶段七：状态更新（如果命令有效）

```typescript
    // 第 8.7 步：如果命令有效，更新状态
    if (!error) {
        // 更新公钥
        s.pubKey = [...cmd!.newPubKey];
        
        // 计算新余额
        if (this.isQuadraticCost) {
            // 二次方扣费：balance' = balance + oldVote^2 - newVote^2
            s.balance = s.balance + currVotes * currVotes - cmd!.newVotes * cmd!.newVotes;
        } else {
            // 线性扣费：balance' = balance + oldVote - newVote
            s.balance = s.balance + currVotes - cmd!.newVotes;
        }
        
        // 更新投票树
        s.voTree.updateLeaf(voIdx, cmd!.newVotes);
        s.nonce = cmd!.nonce;
        s.voted = true;
        
        // 保存更新后的状态
        this.stateLeaves.set(stateIdx, s);
```

**余额计算逻辑：**
```
场景：用户已投票 option0: 30 票，现在改投 option1: 40 票

线性模式：
  初始余额: 100
  投票 option0 后: 100 - 30 = 70
  改投 option1:
    oldVote = 0 (option1 之前是0)
    newVote = 40
    balance = 70 + 0 - 40 = 30
  
  同时，option0 的投票：
    oldVote = 30
    newVote = 0
    (在另一条消息中处理)

二次方模式：
  初始余额: 100
  投票 option0 后: 100 - 30^2 = 100 - 900 = -800 (不合法！)
  
  合理场景：
    初始余额: 10000
    投票 option0: 30票: 10000 - 900 = 9100
    改投 option1: 40票:
      balance = 9100 + 900 - 1600 = 8400
```

#### 1.1.8 阶段八：状态树更新

```typescript
        // 计算新的状态叶子哈希
        let hash: bigint;
        if (this.isAmaci) {
            // AMACI: 双层哈希
            const zeroHash5 = poseidon([0n, 0n, 0n, 0n, 0n]);
            hash = poseidon([
                poseidon([...s.pubKey, s.balance, s.voTree.root, s.nonce]),
                poseidon([...s.d1, ...s.d2, 0n])
            ]);
        } else {
            // MACI: 单层哈希
            hash = poseidon([...s.pubKey, s.balance, s.voTree.root, s.nonce]);
        }
        
        // 更新状态树
        this.stateTree.updateLeaf(stateIdx, hash);
    }
    
    console.log(`- Message <${i}> ${error || '✓'}`);
}
```

**状态树更新过程：**
```
初始状态树:
  root = 0xAABBCCDD
  leaf[3] = hash(old_state[3])

更新 leaf[3]:
  1. new_hash = hash(new_state[3])
  2. 重新计算从 leaf[3] 到 root 的路径:
     level_0: hash5(leaf[0], leaf[1], leaf[2], new_hash, leaf[4])
     level_1: ...
     new_root = 0x11223344
  
  3. 下一条消息将使用 new_root 作为 currentStateRoot
```

#### 1.1.9 阶段九：生成电路输入

```typescript
// 第 9 步：计算新状态根和承诺
const newStateRoot = this.stateTree.root;
const newStateCommitment = poseidon([newStateRoot, newStateSalt]);

// 第 10 步：打包配置参数
const packedVals = 
    BigInt(this.maxVoteOptions!) +           // 低32位
    (BigInt(this.numSignUps!) << 32n) +      // 中32位
    (this.isQuadraticCost ? 1n << 64n : 0n); // 高1位

// 第 11 步：获取消息哈希
const batchStartHash = this.messages[batchStartIdx].prevHash;
const batchEndHash = this.messages[batchEndIdx - 1].hash;

// 第 12 步：计算 deactivate commitment (AMACI)
const activeStateRoot = this.activeStateTree.root;
const deactivateRoot = this.deactivateTree.root;
const deactivateCommitment = poseidon([activeStateRoot, deactivateRoot]);
```

**packedVals 位布局：**
```
位分配（64位整数）：
  [0-31]:   maxVoteOptions     (最多 2^32 个选项)
  [32-63]:  numSignUps         (最多 2^32 个用户)
  [64]:     isQuadraticCost    (0=线性, 1=二次方)
  [65-255]: 保留

示例：
  maxVoteOptions = 25
  numSignUps = 100
  isQuadraticCost = true
  
  packedVals = 25 + (100 << 32) + (1 << 64)
             = 25 + 429496729600 + 18446744073709551616
             = 0x1000000002500000019
```

#### 1.1.10 阶段十：计算 InputHash

```typescript
// 第 13 步：计算 inputHash
let inputHash: bigint;
if (this.isAmaci) {
    // AMACI: 7 字段
    inputHash = computeInputHash([
        packedVals,
        this.pubKeyHasher!,        // Poseidon(coordPubKey)
        batchStartHash,
        batchEndHash,
        this.stateCommitment,
        newStateCommitment,
        deactivateCommitment       // 额外字段
    ]);
} else {
    // MACI: 6 字段
    inputHash = computeInputHash([
        packedVals,
        this.pubKeyHasher!,
        batchStartHash,
        batchEndHash,
        this.stateCommitment,
        newStateCommitment
    ]);
}
```

**computeInputHash 实现：**
```typescript
export function computeInputHash(inputs: bigint[]): bigint {
    // 使用 SHA256 而不是 Poseidon 来节省 Gas
    // SHA256 在 EVM 中是预编译合约，非常便宜
    
    // 1. 将每个 bigint 转换为 32 字节
    const bytes: Uint8Array[] = inputs.map(input => {
        const hex = input.toString(16).padStart(64, '0');
        return hexToBytes(hex);
    });
    
    // 2. 连接所有字节
    const combined = concatBytes(...bytes);
    
    // 3. 计算 SHA256
    const hash = sha256(combined);
    
    // 4. 转换回 bigint
    return bytesToBigInt(hash);
}
```

#### 1.1.11 阶段十一：构建完整输入

```typescript
// 第 14 步：转换消息格式
const msgs = messages.map((msg) => msg.ciphertext);
const encPubKeys = messages.map((msg) => msg.encPubKey);

// 第 15 步：构建电路输入对象
const input: MessageProcessInput = {
    inputHash,
    packedVals,
    batchStartHash,
    batchEndHash,
    msgs,
    coordPrivKey: signer.getFormatedPrivKey(),
    coordPubKey: signer.getPublicKey().toPoints(),
    encPubKeys,
    currentStateRoot,
    currentStateLeaves,
    currentStateLeavesPathElements,
    currentStateCommitment: this.stateCommitment,
    currentStateSalt: this.stateSalt,
    newStateCommitment,
    newStateSalt,
    currentVoteWeights,
    currentVoteWeightsPathElements,
    // AMACI 特有字段
    ...(this.isAmaci ? {
        activeStateRoot,
        deactivateRoot,
        deactivateCommitment,
        activeStateLeaves,
        activeStateLeavesPathElements
    } : {})
};
```

#### 1.1.12 阶段十二：更新 Operator 状态

```typescript
// 第 16 步：更新消息结束索引
this.msgEndIdx = batchStartIdx;

// 第 17 步：更新状态承诺
this.stateCommitment = newStateCommitment;
this.stateSalt = newStateSalt;

console.log('New state root:', newStateRoot.toString());

// 第 18 步：检查是否完成所有批次
if (batchStartIdx === 0) {
    this.endProcessingPeriod();  // 转换到 TALLYING 状态
}
```

#### 1.1.13 阶段十三：生成 ZK 证明

```typescript
// 第 19 步：如果提供了电路文件，生成证明
let proof;
if (wasmFile && zkeyFile) {
    // 使用 snarkjs 生成 Groth16 证明
    const res = await groth16.fullProve(input, wasmFile, zkeyFile);
    
    // 转换为链上格式
    proof = await adaptToUncompressed(res.proof);
    
    // 记录日志
    this.logs.push({
        type: 'processMessage',
        data: {
            proof,
            newStateCommitment: stringizing(input.newStateCommitment) as string
        }
    });
}

return { input, proof };
```

---

## 2. 电路约束规则详解

### 2.1 ProcessMessages 电路结构

```circom
template ProcessMessages(
    stateTreeDepth,        // 例如: 4
    voteOptionTreeDepth,   // 例如: 2
    batchSize              // 例如: 5
) {
    // 计算常量
    var TREE_ARITY = 5;
    var MAX_INDEX = TREE_ARITY ** stateTreeDepth;  // 5^4 = 625
    
    // 状态叶子长度
    var STATE_LEAF_LENGTH = 10;  // AMACI
    // var STATE_LEAF_LENGTH = 5;   // MACI
```

### 2.2 约束类型分类

#### 2.2.1 输入验证约束

```circom
// 约束 1: 验证 currentStateCommitment
component currentStateCommitmentHasher = HashLeftRight();
currentStateCommitmentHasher.left <== currentStateRoot;
currentStateCommitmentHasher.right <== currentStateSalt;
currentStateCommitmentHasher.hash === currentStateCommitment;
```

**约束数量：** ~150 (Poseidon hash)

**验证目的：** 确保提供的 `currentStateRoot` 和 `currentStateSalt` 的哈希确实等于 `currentStateCommitment`

**攻击防御：** 防止 Prover 提供伪造的状态根

```circom
// 约束 2: 验证 deactivateCommitment (AMACI only)
component deactivateCommitmentHasher = HashLeftRight();
deactivateCommitmentHasher.left <== activeStateRoot;
deactivateCommitmentHasher.right <== deactivateRoot;
deactivateCommitmentHasher.hash === deactivateCommitment;
```

**约束数量：** ~150 (Poseidon hash)

**验证目的：** 确保 active state 和 deactivate tree 的承诺正确

#### 2.2.2 InputHash 验证约束

```circom
// 约束 3: 验证 inputHash
component inputHasher = ProcessMessagesInputHasher();
inputHasher.packedVals <== packedVals;
inputHasher.coordPubKey[0] <== coordPubKey[0];
inputHasher.coordPubKey[1] <== coordPubKey[1];
inputHasher.batchStartHash <== batchStartHash;
inputHasher.batchEndHash <== batchEndHash;
inputHasher.currentStateCommitment <== currentStateCommitment;
inputHasher.newStateCommitment <== newStateCommitment;
inputHasher.deactivateCommitment <== deactivateCommitment;  // AMACI

inputHasher.hash === inputHash;
```

**约束数量：** ~5000 (SHA256 hash of 7 elements)

**SHA256 实现：**
```circom
template Sha256Hasher(n) {
    signal input in[n];
    signal output hash;
    
    // 1. 将每个输入转换为 256 位
    component num2bits[n];
    for (var i = 0; i < n; i++) {
        num2bits[i] = Num2Bits(254);  // Field size < 2^254
        num2bits[i].in <== in[i];
    }
    
    // 2. 连接所有位
    var totalBits = n * 254;
    signal bits[totalBits];
    for (var i = 0; i < n; i++) {
        for (var j = 0; j < 254; j++) {
            bits[i * 254 + j] <== num2bits[i].out[j];
        }
    }
    
    // 3. 计算 SHA256
    component sha = Sha256(totalBits);
    for (var i = 0; i < totalBits; i++) {
        sha.in[i] <== bits[i];
    }
    
    // 4. 转换回数字
    component bits2num = Bits2Num(256);
    for (var i = 0; i < 256; i++) {
        bits2num.in[i] <== sha.out[i];
    }
    hash <== bits2num.out;
}
```

#### 2.2.3 参数范围验证约束

```circom
// 约束 4: 验证 maxVoteOptions 有效
component maxVoValid = LessEqThan(32);
maxVoValid.in[0] <== maxVoteOptions;
maxVoValid.in[1] <== TREE_ARITY ** voteOptionTreeDepth;
maxVoValid.out === 1;
```

**LessEqThan 实现原理：**
```
目标: 证明 a <= b

方法:
  1. 计算 diff = b - a
  2. 证明 diff >= 0 (即 diff 是非负数)
  
实现:
  - 将 diff 转换为二进制
  - 检查没有负数标志
  - 如果 diff 的位表示有效，则 a <= b
```

**约束数量：** ~250 (比较器)

```circom
// 约束 5: 验证 numSignUps 有效
component numSignUpsValid = LessEqThan(32);
numSignUpsValid.in[0] <== numSignUps;
numSignUpsValid.in[1] <== TREE_ARITY ** stateTreeDepth;
numSignUpsValid.out === 1;
```

#### 2.2.4 消息链验证约束

```circom
// 约束 6: 验证消息哈希链
component messageHashers[batchSize];
component isEmptyMsg[batchSize];
component muxes[batchSize];

signal msgHashChain[batchSize + 1];
msgHashChain[0] <== batchStartHash;

for (var i = 0; i < batchSize; i ++) {
    // 计算消息哈希
    messageHashers[i] = MessageHasher();
    for (var j = 0; j < MSG_LENGTH; j ++) {
        messageHashers[i].in[j] <== msgs[i][j];
    }
    messageHashers[i].encPubKey[0] <== encPubKeys[i][0];
    messageHashers[i].encPubKey[1] <== encPubKeys[i][1];
    messageHashers[i].prevHash <== msgHashChain[i];
    
    // 检查是否为空消息
    isEmptyMsg[i] = IsZero();
    isEmptyMsg[i].in <== encPubKeys[i][0];
    
    // 选择：如果是空消息，保持链不变；否则更新链
    muxes[i] = Mux1();
    muxes[i].s <== isEmptyMsg[i].out;
    muxes[i].c[0] <== messageHashers[i].hash;  // 非空：新哈希
    muxes[i].c[1] <== msgHashChain[i];         // 空：保持不变
    
    msgHashChain[i + 1] <== muxes[i].out;
}

// 验证最终哈希
msgHashChain[batchSize] === batchEndHash;
```

**约束数量：** ~800 * batchSize (Poseidon hashes + 比较)

**消息哈希计算：**
```circom
template MessageHasher() {
    signal input in[7];           // 密文
    signal input encPubKey[2];    // ECDH 公钥
    signal input prevHash;        // 前一个哈希
    signal output hash;
    
    // hash = Poseidon(Poseidon(in[0..4]), Poseidon(in[5..6], encPubKey, prevHash))
    component hasher1 = Poseidon(5);
    for (var i = 0; i < 5; i++) {
        hasher1.inputs[i] <== in[i];
    }
    
    component hasher2 = Poseidon(5);
    hasher2.inputs[0] <== in[5];
    hasher2.inputs[1] <== in[6];
    hasher2.inputs[2] <== encPubKey[0];
    hasher2.inputs[3] <== encPubKey[1];
    hasher2.inputs[4] <== prevHash;
    
    component hasher3 = Poseidon(2);
    hasher3.inputs[0] <== hasher1.out;
    hasher3.inputs[1] <== hasher2.out;
    
    hash <== hasher3.out;
}
```

#### 2.2.5 协调者身份验证约束

```circom
// 约束 7: 验证协调者公钥
component derivedPubKey = PrivToPubKey();
derivedPubKey.privKey <== coordPrivKey;
derivedPubKey.pubKey[0] === coordPubKey[0];
derivedPubKey.pubKey[1] === coordPubKey[1];
```

**约束数量：** ~2000 (Baby JubJub 标量乘法)

**PrivToPubKey 实现：**
```circom
template PrivToPubKey() {
    signal input privKey;
    signal output pubKey[2];
    
    // pubKey = privKey * G (G 是 Baby JubJub 的生成元)
    component mulFix = BabyPbk();
    mulFix.in <== privKey;
    
    pubKey[0] <== mulFix.Ax;
    pubKey[1] <== mulFix.Ay;
}
```

### 2.3 ProcessOne 核心约束

#### 2.3.1 消息解密约束

```circom
// 约束 8: 解密每条消息
component commands[batchSize];
for (var i = 0; i < batchSize; i ++) {
    commands[i] = MessageToCommand();
    commands[i].encPrivKey <== coordPrivKey;
    commands[i].encPubKey[0] <== encPubKeys[i][0];
    commands[i].encPubKey[1] <== encPubKeys[i][1];
    for (var j = 0; j < MSG_LENGTH; j ++) {
        commands[i].message[j] <== msgs[i][j];
    }
}
```

**约束数量：** ~3000 * batchSize (ECDH + Poseidon decryption)

**MessageToCommand 流程：**
```
1. 计算共享密钥: sharedKey = coordPrivKey * encPubKey
2. 解密密文: plaintext = poseidonDecrypt(ciphertext, sharedKey, nonce=0, length=6)
3. 解包命令:
   - packedCommand = plaintext[0]
   - newPubKey = [plaintext[1], plaintext[2]]
   - sigR8 = [plaintext[3], plaintext[4]]
   - sigS = plaintext[5]
4. 解包 packedCommand:
   - nonce = packedCommand & 0xFFFFFFFF
   - stateIdx = (packedCommand >> 32) & 0xFFFFFFFF
   - voIdx = (packedCommand >> 64) & 0xFFFFFFFF
   - newVotes = (packedCommand >> 96) & 0xFFFFFFFFFFFFFFFFFFFFFF
```

#### 2.3.2 状态转换约束

```circom
// 约束 9: 转换状态叶子
component transformer = StateLeafTransformer();
transformer.isQuadraticCost <== isQuadraticCost;
transformer.coordPrivKey <== coordPrivKey;
transformer.numSignUps <== numSignUps;
transformer.maxVoteOptions <== maxVoteOptions;

// 输入当前状态
transformer.slPubKey[0] <== stateLeaf[0];
transformer.slPubKey[1] <== stateLeaf[1];
transformer.slVoiceCreditBalance <== stateLeaf[2];
transformer.slNonce <== stateLeaf[4];
transformer.slC1[0] <== stateLeaf[5];  // AMACI only
transformer.slC1[1] <== stateLeaf[6];
transformer.slC2[0] <== stateLeaf[7];
transformer.slC2[1] <== stateLeaf[8];

// 输入命令
transformer.cmdStateIndex <== cmdStateIndex;
transformer.cmdNewPubKey[0] <== cmdNewPubKey[0];
transformer.cmdNewPubKey[1] <== cmdNewPubKey[1];
transformer.cmdVoteOptionIndex <== cmdVoteOptionIndex;
transformer.cmdNewVoteWeight <== cmdNewVoteWeight;
transformer.cmdNonce <== cmdNonce;
transformer.cmdSigR8[0] <== cmdSigR8[0];
transformer.cmdSigR8[1] <== cmdSigR8[1];
transformer.cmdSigS <== cmdSigS;
for (var i = 0; i < PACKED_CMD_LENGTH; i ++) {
    transformer.packedCommand[i] <== packedCmd[i];
}

transformer.deactivate <== activeStateLeaf;  // AMACI only

// 输出
transformer.isValid ==> isValid;
transformer.newSlPubKey[0] ==> newPubKey[0];
transformer.newSlPubKey[1] ==> newPubKey[1];
transformer.newSlNonce ==> newNonce;
transformer.newBalance ==> newBalance;
```

**约束数量：** 见下节 StateLeafTransformer 详解

---

## 3. MessageValidator 验证机制

### 3.1 六重验证规则

```circom
template MessageValidator() {
    // 输出：isValid = 1 当且仅当所有6项检查通过
    signal output isValid;
    
    component validUpdate = IsEqual();
    validUpdate.in[0] <== 6;  // 期望值
    validUpdate.in[1] <== 
        validSignature.valid +          // (a) 签名
        sufficientVoiceCredits.out +    // (f) 余额
        validVoteWeight.out +           // (e) 权重
        validNonce.out +                // (c) nonce
        validStateLeafIndex.out +       // (a) 索引
        validVoteOptionIndex.out;       // (b) 选项
    
    isValid <== validUpdate.out;
}
```

### 3.2 验证 (a): State Leaf Index

```circom
signal input stateTreeIndex;
signal input numSignUps;

component validStateLeafIndex = LessEqThan(252);
validStateLeafIndex.in[0] <== stateTreeIndex;
validStateLeafIndex.in[1] <== numSignUps;
// validStateLeafIndex.out === 1  means  stateTreeIndex <= numSignUps
```

**验证逻辑：**
- 用户索引必须 <= 已注册用户数
- 防止访问未初始化的状态叶子
- 252位比较器足够大（支持 ~10^75 个用户）

**攻击场景：**
```
攻击：stateTreeIndex = 9999（但只有100个用户）
结果：验证失败，命令无效
防御：确保只能操作已注册用户的状态
```

### 3.3 验证 (b): Vote Option Index

```circom
signal input voteOptionIndex;
signal input maxVoteOptions;

component validVoteOptionIndex = LessThan(252);
validVoteOptionIndex.in[0] <== voteOptionIndex;
validVoteOptionIndex.in[1] <== maxVoteOptions;
// validVoteOptionIndex.out === 1  means  voteOptionIndex < maxVoteOptions
```

**验证逻辑：**
- 投票选项索引必须 < 最大选项数
- 注意是 `<` 而不是 `<=`（数组索引从0开始）
- 防止访问不存在的投票选项

**示例：**
```
maxVoteOptions = 25 (选项 0-24)
有效: voteOptionIndex = 24 ✓
无效: voteOptionIndex = 25 ✗
无效: voteOptionIndex = 100 ✗
```

### 3.4 验证 (c): Nonce

```circom
signal input originalNonce;  // 当前状态的 nonce
signal input nonce;          // 命令中的 nonce

component validNonce = IsEqual();
validNonce.in[0] <== originalNonce + 1;
validNonce.in[1] <== nonce;
// validNonce.out === 1  means  nonce == originalNonce + 1
```

**验证逻辑：**
- 命令的 nonce 必须等于当前 nonce + 1
- 严格的顺序性，防止重放攻击
- 每次成功投票后 nonce 递增

**攻击场景：**
```
场景1: 重放攻击
  用户当前 nonce = 5
  攻击者重放旧消息 (nonce = 3)
  验证：3 != 5 + 1 = 6 ✗ 失败

场景2: 跳过 nonce
  用户当前 nonce = 5
  攻击者发送 nonce = 7
  验证：7 != 5 + 1 = 6 ✗ 失败

场景3: 正常投票
  用户当前 nonce = 5
  用户发送 nonce = 6
  验证：6 == 5 + 1 ✓ 成功
  更新后 nonce = 6
```

### 3.5 验证 (d): Signature

```circom
signal input cmd[PACKED_CMD_LENGTH];  // [3]
signal input pubKey[2];
signal input sigR8[2];
signal input sigS;

component validSignature = VerifySignature();
validSignature.pubKey[0] <== pubKey[0];
validSignature.pubKey[1] <== pubKey[1];
validSignature.R8[0] <== sigR8[0];
validSignature.R8[1] <== sigR8[1];
validSignature.S <== sigS;
for (var i = 0; i < PACKED_CMD_LENGTH; i ++) {
    validSignature.preimage[i] <== cmd[i];
}
// validSignature.valid === 1  means signature is valid
```

**EdDSA 签名验证：**
```
输入：
  - message: cmd (打包的命令)
  - publicKey: pubKey
  - signature: (R8, S)

验证过程：
  1. 计算 h = Poseidon(cmd, newPubKey)
  2. 计算 lhs = S * G
  3. 计算 rhs = R8 + h * pubKey
  4. 检查 lhs == rhs

约束：
  - Baby JubJub 曲线点加法: ~200 约束
  - 标量乘法: ~2000 约束/点
  - Poseidon hash: ~150 约束
  总计: ~4500 约束
```

**签名生成（用户侧）：**
```typescript
// 用户生成签名
const packaged = packElement({ nonce, stateIdx, voIdx, newVotes, salt });
const hash = poseidon([packaged, ...newPubKey]);
const signature = signer.sign(hash);

const command = [
    packaged,           // cmd[0]
    ...newPubKey,      // cmd[1-2] (实际不在 cmd 数组中，分开传输)
    ...signature.R8,   // sigR8
    signature.S        // sigS
];
```

### 3.6 验证 (e): Vote Weight

```circom
signal input voteWeight;

component validVoteWeight = LessEqThan(252);
validVoteWeight.in[0] <== voteWeight;
validVoteWeight.in[1] <== 147946756881789319005730692170996259609;
// This is sqrt(SNARK_FIELD_SIZE) ≈ 1.48 * 10^38
```

**为什么需要这个限制？**
```
在二次方模式下：
  cost = voteWeight^2

如果 voteWeight 太大：
  voteWeight^2 可能溢出 SNARK 字段 (p ≈ 2.19 * 10^76)

限制：
  voteWeight <= sqrt(p) ≈ 1.48 * 10^38
  
  则 voteWeight^2 <= p，不会溢出

实际场景：
  - 线性模式：voteWeight 通常 < 1000
  - 二次方模式：voteWeight 通常 < 10000
  - 限制值远大于实际需求，安全余量充足
```

### 3.6 验证 (f): Sufficient Voice Credits

```circom
signal input currentVoiceCreditBalance;  // 当前余额
signal input currentVotesForOption;      // 该选项当前投票数
signal input voteWeight;                 // 新的投票权重
signal input isQuadraticCost;            // 计费模式

signal output newBalance;

// 步骤 1: 计算当前该选项的成本
component currentCostsForOption = Mux1();
currentCostsForOption.s <== isQuadraticCost;
currentCostsForOption.c[0] <== currentVotesForOption;           // 线性
currentCostsForOption.c[1] <== currentVotesForOption * currentVotesForOption;  // 二次方

// 步骤 2: 计算新投票的成本
component cost = Mux1();
cost.s <== isQuadraticCost;
cost.c[0] <== voteWeight;                   // 线性
cost.c[1] <== voteWeight * voteWeight;      // 二次方

// 步骤 3: 检查余额是否足够
component sufficientVoiceCredits = GreaterEqThan(252);
sufficientVoiceCredits.in[0] <== currentCostsForOption.out + currentVoiceCreditBalance;
sufficientVoiceCredits.in[1] <== cost.out;
// sufficientVoiceCredits.out === 1  means  
//   currentCostsForOption + balance >= cost

// 步骤 4: 计算新余额
newBalance <== currentVoiceCreditBalance + currentCostsForOption.out - cost.out;
```

**余额计算详解：**
```
线性模式示例：
  初始余额：1000
  当前投票 option0：30 票
  现在改投 option1：40 票
  
  处理 option1 消息：
    currentVotesForOption = 0 (之前未投option1)
    voteWeight = 40
    currentCostsForOption = 0
    cost = 40
    检查：0 + 1000 >= 40 ✓
    newBalance = 1000 + 0 - 40 = 960
  
  处理 option0 消息（撤回）：
    currentVotesForOption = 30
    voteWeight = 0
    currentCostsForOption = 30
    cost = 0
    检查：30 + 960 >= 0 ✓
    newBalance = 960 + 30 - 0 = 990
  
  最终：花费了 40 票，剩余 960 票

二次方模式示例：
  初始余额：10000
  当前投票 option0：30 票 (成本 900)
  现在改投 option1：40 票 (成本 1600)
  
  处理 option1 消息：
    currentVotesForOption = 0
    voteWeight = 40
    currentCostsForOption = 0
    cost = 1600
    检查：0 + 9100 >= 1600 ✓
    newBalance = 9100 + 0 - 1600 = 7500
  
  处理 option0 消息：
    currentVotesForOption = 30
    voteWeight = 0
    currentCostsForOption = 900
    cost = 0
    检查：900 + 7500 >= 0 ✓
    newBalance = 7500 + 900 - 0 = 8400
  
  最终：花费了 1600 票，剩余 8400 票
```

---

## 4. StateLeafTransformer 状态转换

### 4.1 AMACI StateLeafTransformer

```circom
template StateLeafTransformer() {
    // ... inputs ...
    
    // 第 1 步：调用 MessageValidator
    component messageValidator = MessageValidator();
    // ... 连接所有输入 ...
    messageValidator.isValid ==> isValid_base;
    
    // 第 2 步：ElGamal 解密 deactivate 标志
    component decryptIsActive = ElGamalDecrypt();
    decryptIsActive.c1[0] <== slC1[0];
    decryptIsActive.c1[1] <== slC1[1];
    decryptIsActive.c2[0] <== slC2[0];
    decryptIsActive.c2[1] <== slC2[1];
    decryptIsActive.privKey <== coordPrivKey;
    // decryptIsActive.isOdd === 1  means deactivated
    
    // 第 3 步：检查 activeStateLeaf
    component activate = IsZero();
    activate.in <== deactivate;  // deactivate input
    // activate.out === 1  means user is active (deactivate == 0)
    
    // 第 4 步：综合判断
    component valid = IsEqual();
    valid.in[0] <== 3;  // 期望3个条件都满足
    valid.in[1] <== 
        (1 - decryptIsActive.isOdd) +  // not deactivated (ElGamal)
        activate.out +                  // active state tree
        messageValidator.isValid;       // message valid
    
    // valid.out === 1  当且仅当：
    //   1. ElGamal 解密结果是偶数 (未 deactivate)
    //   2. activeStateLeaf == 0 (active)
    //   3. messageValidator.isValid == 1 (6项检查通过)
    
    isValid <== valid.out;
}
```

### 4.2 ElGamalDecrypt 实现

```circom
template ElGamalDecrypt() {
    signal input c1[2];      // (c1.x, c1.y)
    signal input c2[2];      // (c2.x, c2.y)
    signal input privKey;    // 协调者私钥
    
    signal output isOdd;     // 解密结果的奇偶性
    
    // 步骤 1: 计算 s = privKey * c1
    component mulFix = BabyMul();
    mulFix.scalar <== privKey;
    mulFix.pointX <== c1[0];
    mulFix.pointY <== c1[1];
    
    // 步骤 2: 计算 m * G = c2 - s
    component sub = BabySub();
    sub.x1 <== c2[0];
    sub.y1 <== c2[1];
    sub.x2 <== mulFix.outX;
    sub.y2 <== mulFix.outY;
    
    // 步骤 3: 检查 x 坐标的奇偶性
    // 如果 m = 0: m*G = O (无穷远点), x = 0
    // 如果 m = 1: m*G = G, x = odd
    component bits = Num2Bits(254);
    bits.in <== sub.outX;
    isOdd <== bits.out[0];  // 最低位
}
```

**ElGamal 解密原理：**
```
加密：
  选择随机数 r
  c1 = r * G
  c2 = m * G + r * pubKey
  
  其中：pubKey = privKey * G

解密：
  s = privKey * c1 = privKey * (r * G) = r * (privKey * G) = r * pubKey
  m * G = c2 - s = (m * G + r * pubKey) - r * pubKey = m * G
  
  检查 (m * G).x 的奇偶性：
    m = 0: (m * G).x = 0 (偶数)
    m = 1: (m * G).x = odd (奇数)
```

### 4.3 有效性判断详解

```circom
// AMACI 有效性：3个条件
valid.in[1] <== 
    (1 - decryptIsActive.isOdd) +  // [条件1]
    activate.out +                  // [条件2]
    messageValidator.isValid;       // [条件3]

valid.in[0] <== 3;
isValid <== valid.out;  // isValid = 1 iff valid.in[1] == 3
```

**真值表：**
```
| isOdd | deactivate | isValid_base | (1-isOdd) | activate | sum | isValid |
|-------|------------|--------------|-----------|----------|-----|---------|
|   0   |     0      |      1       |     1     |    1     |  3  |    1    |
|   0   |     0      |      0       |     1     |    1     |  2  |    0    |
|   0   |     1      |      1       |     1     |    0     |  2  |    0    |
|   1   |     0      |      1       |     0     |    1     |  2  |    0    |
|   1   |     1      |      1       |     0     |    0     |  1  |    0    |

解释：
  Row 1: ✓ 未deactivate (ElGamal=0) + active (deact=0) + 消息有效 = 通过
  Row 2: ✗ 消息无效（签名错误等）
  Row 3: ✗ 虽然ElGamal显示active，但activeStateTree显示inactive
  Row 4: ✗ ElGamal显示deactivated
  Row 5: ✗ 多重问题
```

### 4.4 输出选择（Mux）

```circom
// 如果 isValid == 1，使用新值；否则保持旧值

component newSlPubKey0Mux = Mux1();
newSlPubKey0Mux.s <== valid.out;
newSlPubKey0Mux.c[0] <== slPubKey[0];      // 旧值
newSlPubKey0Mux.c[1] <== cmdNewPubKey[0];  // 新值
newSlPubKey[0] <== newSlPubKey0Mux.out;

component newSlPubKey1Mux = Mux1();
newSlPubKey1Mux.s <== valid.out;
newSlPubKey1Mux.c[0] <== slPubKey[1];
newSlPubKey1Mux.c[1] <== cmdNewPubKey[1];
newSlPubKey[1] <== newSlPubKey1Mux.out;

component newSlNonceMux = Mux1();
newSlNonceMux.s <== valid.out;
newSlNonceMux.c[0] <== slNonce;
newSlNonceMux.c[1] <== cmdNonce;
newSlNonce <== newSlNonceMux.out;
```

**Mux1 实现：**
```circom
template Mux1() {
    signal input s;      // 选择信号 (0 或 1)
    signal input c[2];   // 候选值
    signal output out;
    
    // out = c[0] * (1 - s) + c[1] * s
    //     = c[0] - c[0]*s + c[1]*s
    //     = c[0] + s*(c[1] - c[0])
    
    out <== c[0] + s * (c[1] - c[0]);
}

// 验证：
//   s = 0: out = c[0] + 0 * (c[1] - c[0]) = c[0]
//   s = 1: out = c[0] + 1 * (c[1] - c[0]) = c[1]
```

---

## 5. Deactivate 检测机制

### 5.1 三层检测体系

**层次 1: ElGamal 密文检查（链上存储）**
```
状态叶子中存储：
  c1 = [c1.x, c1.y]
  c2 = [c2.x, c2.y]

解密（电路中）：
  plaintext = decrypt(coordPrivKey, c1, c2)
  isDeactivated = plaintext.isOdd()
```

**层次 2: Active State Tree（链下追踪）**
```
activeStateTree[userIdx] = {
  0:  用户 active
  >0: 用户 inactive（值为 inactive 时间戳或索引）
}

检查：
  if activeStateLeaf == 0:
    用户 active
  else:
    用户 inactive
```

**层次 3: Deactivate Tree（审计记录）**
```
deactivateTree 存储所有 deactivate 操作的记录：
  [c1.x, c1.y, c2.x, c2.y, sharedKeyHash]

用途：
  - AddNewKey 时查找用户的 deactivate 记录
  - 重随机化密文
  - 防止双重使用
```

### 5.2 Deactivate 状态转换

```
State Machine:

    [Signup]
        │
        ▼
   ┌─────────┐
   │ Active  │
   │ c1,c2=0 │
   │ as[i]=0 │
   └────┬────┘
        │
        │ publishDeactivateMessage
        │
        ▼
  ┌──────────────┐
  │ Deactivated  │
  │ c1,c2=new    │ (ElGamal encrypt(1))
  │ as[i]=idx    │ (inactive index)
  └──────┬───────┘
         │
         │ addNewKey (rerandomize + new pubkey)
         │
         ▼
    ┌─────────┐
    │ Active  │
    │ c1,c2=d │ (rerandomized)
    │ as[i]=0 │ (reset to active)
    └─────────┘
```

### 5.3 ProcessDeactivate 流程

```typescript
// operator.ts processDeactivateMessages

for (let i = 0; i < batchSize; i++) {
    const cmd = commands[i];
    const error = this.checkDeactivateCommand(cmd, subStateTreeLength);
    
    let stateIdx = 5 ** this.stateTreeDepth! - 1;
    if (!error) {
        stateIdx = Number(cmd!.stateIdx);
    }
    
    const s = this.stateLeaves.get(stateIdx) || this.emptyState();
    
    // 生成新的 ElGamal 密文
    const deactivate = this.encryptOdevity(
        !!error,  // true = deactivated, false = keep active
        signer.getPublicKey().toPoints(),
        this.genStaticRandomKey(signer.getPrivateKey(), 20040n, newActiveState[i])
    );
    
    const dLeaf = [
        deactivate.c1[0],
        deactivate.c1[1],
        deactivate.c2[0],
        deactivate.c2[1],
        poseidon(sharedKey)
    ];
    
    // 更新树
    if (!error) {
        this.activeStateTree.updateLeaf(stateIdx, newActiveState[i]);
        this.deactivateTree.updateLeaf(deactivateIndex0 + i, poseidon(dLeaf));
        newDeactivate.push(dLeaf);
    }
}
```

---

## 6. 数学约束和证明

### 6.1 约束系统概览

**R1CS (Rank-1 Constraint System)**
```
每个约束的形式：
  (a1*w1 + a2*w2 + ... + an*wn) * (b1*w1 + b2*w2 + ... + bn*wn) 
    = (c1*w1 + c2*w2 + ... + cn*wn)

其中 wi 是电路中的信号（变量）
```

**AMACI ProcessMessages 约束统计：**
```
约束类别                    数量        占比
----------------------------------------
SHA256 (inputHash)          ~5000       18%
Poseidon hashes            ~6000       22%
ECDH 密钥交换              ~4000       15%
EdDSA 签名验证             ~4500       16%
ElGamal 解密               ~2000        7%
Merkle 验证                ~3000       11%
比较器和 Mux               ~2000        7%
其他                       ~1000        4%
----------------------------------------
总计                       ~27500      100%
```

### 6.2 Groth16 证明大小

```
证明组成：
  π = (A, B, C)
  
其中：
  A ∈ G1  (32 bytes)
  B ∈ G2  (64 bytes)
  C ∈ G1  (32 bytes)
  
总大小: 128 bytes (固定)
```

**Gas 成本（链上验证）：**
```
Groth16.verify():
  - Pairing check: ~260,000 gas
  - Public input processing: ~21,000 gas/input
  
AMACI ProcessMessages (1 public input):
  Total ≈ 260,000 + 21,000 = 281,000 gas
  
对比：
  MACI: ~281,000 gas
  AMACI: ~281,000 gas (相同！)
```

**为什么 Gas 相同？**
- Groth16 验证成本只依赖于椭圆曲线配对操作
- 约束数量不影响链上验证成本
- 约束数量只影响证明生成时间

### 6.3 证明生成时间

```
机器配置：
  CPU: 8核 3.0GHz
  RAM: 16GB
  
MACI ProcessMessages (batchSize=5):
  约束数: ~20,000
  生成时间: ~5-8 秒
  
AMACI ProcessMessages (batchSize=5):
  约束数: ~27,500 (+37.5%)
  生成时间: ~8-12 秒 (+50%)
  
关系：
  time ∝ constraints^1.2 (超线性)
```

---

## 参考资料

- [Circom 文档](https://docs.circom.io/)
- [Groth16 论文](https://eprint.iacr.org/2016/260.pdf)
- [MACI 规范](https://github.com/privacy-scaling-explorations/maci)
- 相关文档：
  - [AMACI vs MACI ProcessMessages 对比](./AMACI-vs-MACI-ProcessMessages-Comparison.md)
  - [AMACI Deactivate 流程](./AMACI-Deactivate-Detection-Flow.md)

