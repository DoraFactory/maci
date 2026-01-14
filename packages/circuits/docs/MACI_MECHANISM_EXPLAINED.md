# MACI 消息处理机制详解

## 目录
- [概述](#概述)
- [核心概念](#核心概念)
- [消息加密与签名](#消息加密与签名)
- [Voter端：消息生成](#voter端消息生成)
- [Operator端：消息处理](#operator端消息处理)
- [StateLeafTransformer处理流程](#stateleaftransformer处理流程)
- [Nonce机制与关键理解](#nonce机制与关键理解)
- [时间线与状态管理](#时间线与状态管理)
- [隐私保护机制](#隐私保护机制)

---

## 概述

MACI (Minimal Anti-Collusion Infrastructure) 是一个抗串谋的链上投票系统。它通过以下机制保护投票隐私和防止贿选：

1. **端到端加密**：投票内容使用 Poseidon 加密，只有 Coordinator（Operator）能解密
2. **EdDSA签名**：每条消息都由用户私钥签名，防止伪造
3. **ZK证明**：Operator 处理消息后生成零知识证明，证明计算正确性
4. **Nonce机制**：通过nonce顺序保证消息处理的正确性

---

## 核心概念

### 三个关键角色

1. **Voter（投票者）**
   - 拥有 EdDSA 密钥对
   - 生成加密的投票消息
   - 提交消息到链上

2. **Operator/Coordinator（协调者）**
   - 拥有另一个 EdDSA 密钥对
   - 能够解密所有投票消息
   - 处理消息并生成 ZK 证明
   - 受零知识证明约束，确保诚实执行

3. **Smart Contract（智能合约）**
   - 存储加密的消息队列
   - 验证 ZK 证明
   - 发布最终投票结果

### 状态管理

每个用户在系统中有一个 **State Leaf**：

```typescript
StateLeaf {
  pubKey: [bigint, bigint],    // 用户公钥
  balance: bigint,              // 剩余投票权重
  voTree: Tree,                 // 投票选项树（记录每个选项的投票）
  nonce: bigint,                // 消息序号
  voted: boolean                // 是否已投票
}
```

---

## 消息加密与签名

### 消息结构

一条完整的 MACI 消息包含以下内容：

```
Command (明文部分，6个字段):
├─ [0] packaged: 打包的投票信息
│      ├─ nonce: 消息序号
│      ├─ stateIdx: 用户在状态树中的索引
│      ├─ voIdx: 投票的选项索引
│      ├─ newVotes: 新的投票权重
│      └─ salt: 随机盐值
├─ [1] newPubKey.x: 新公钥 x 坐标（通常是当前公钥）
├─ [2] newPubKey.y: 新公钥 y 坐标
├─ [3] signature.R8.x: EdDSA 签名的 R8 点 x 坐标
├─ [4] signature.R8.y: EdDSA 签名的 R8 点 y 坐标
└─ [5] signature.S: EdDSA 签名的 S 值

加密后发送到链上:
Message = poseidonEncrypt(Command, ECDH_SharedKey)
```

### 加密过程（Voter端）

```typescript
// 1. 打包投票信息
const packaged = packElement({ nonce, stateIdx, voIdx, newVotes, salt });

// 2. 生成消息哈希并签名
const hash = poseidon([packaged, newPubKey[0], newPubKey[1]]);
const signature = voter.sign(hash);

// 3. 构建明文 command
const command = [
  packaged, 
  newPubKey[0], 
  newPubKey[1],
  signature.R8[0],
  signature.R8[1], 
  signature.S
];

// 4. 为每条消息生成临时密钥对
const encKeypair = genKeypair();

// 5. 使用 ECDH 生成共享密钥
const sharedKey = genEcdhSharedKey(
  encKeypair.privKey,      // 临时私钥
  coordinatorPubKey         // Coordinator 公钥
);

// 6. 用 Poseidon Cipher 加密
const message = poseidonEncrypt(command, sharedKey, 0n);

// 7. 发送到链上
{
  message: message,          // 加密的消息
  encPubKey: encKeypair.pubKey  // 临时公钥（用于 Coordinator 解密）
}
```

### 解密过程（Operator端）

```typescript
// 1. 使用 Coordinator 私钥和消息附带的临时公钥生成相同的共享密钥
const sharedKey = genEcdhSharedKey(
  coordinatorPrivKey,    // Coordinator 私钥
  message.encPubKey      // 消息附带的临时公钥
);

// 2. 解密消息
const plaintext = poseidonDecrypt(message.ciphertext, sharedKey, 0n, 6);

// 3. 解包投票信息
const { nonce, stateIdx, voIdx, newVotes } = unpackElement(plaintext[0]);

// 4. 提取完整的 command
const cmd: Command = {
  nonce,
  stateIdx,
  voIdx,
  newVotes,
  newPubKey: [plaintext[1], plaintext[2]],
  signature: {
    R8: [plaintext[3], plaintext[4]],
    S: plaintext[5]
  },
  msgHash: poseidon(plaintext.slice(0, 3))
};
```

---

## Voter端：消息生成

### buildVotePayload 方法

这是用户生成投票消息的主要方法：

```typescript
// 用法示例
const payload = voter.buildVotePayload({
  stateIdx: 0,                          // 用户的状态索引
  operatorPubkey: coordinatorPubKey,    // Coordinator 公钥
  selectedOptions: [
    { idx: 0, vc: 5 },                  // 给选项0投5票
    { idx: 2, vc: 3 }                   // 给选项2投3票
  ]
});

// 返回的 payload 是一个数组，每个元素对应一条消息
payload = [
  {
    msg: ['encrypted_msg_1'],           // 加密的消息1
    encPubkeys: ['temp_pubkey_1_x', 'temp_pubkey_1_y']
  },
  {
    msg: ['encrypted_msg_2'],           // 加密的消息2
    encPubkeys: ['temp_pubkey_2_x', 'temp_pubkey_2_y']
  }
]
```

### batchGenMessage 内部实现

```typescript
batchGenMessage(stateIdx, operatorPubkey, plan, derivePathParams) {
  const genMessage = this.genMessageFactory(...);
  const payload = [];
  
  // 关键：倒序生成消息
  // plan = [[0, 5], [2, 3]] 会生成：
  // - 第一条消息: nonce=2, vote for option 2
  // - 第二条消息: nonce=1, vote for option 0
  for (let i = plan.length - 1; i >= 0; i--) {
    const p = plan[i];
    const encAccount = genKeypair();  // 每条消息生成新的临时密钥对
    const isLastCmd = i === plan.length - 1;
    
    // nonce = i + 1 (从1开始)
    const msg = genMessage(
      BigInt(encAccount.privKey),
      i + 1,           // nonce
      p[0],            // voteOptionIndex
      p[1],            // voteWeight
      isLastCmd
    );

    payload.push({
      msg,
      encPubkeys: encAccount.pubKey
    });
  }

  return payload;
}
```

### 消息顺序的重要性

```
plan = [[0, 5], [2, 3]]

生成循环（倒序）:
i=1: nonce=2, vote option 2, weight 3 → payload[0]
i=0: nonce=1, vote option 0, weight 5 → payload[1]

提交到链上（按数组顺序）:
messages[0]: nonce=2, option 2
messages[1]: nonce=1, option 0

处理时（倒序处理）:
1. 先处理 messages[1] (nonce=1) ✅
2. 再处理 messages[0] (nonce=2) ✅
```

---

## Operator端：消息处理

### 处理流程概览

```
投票期 (Voting Period)
  ↓ 用户提交加密消息到链上
  ↓ 消息存储在合约中，不处理
  ↓
处理期 (Processing Period)
  ↓ Operator 解密所有消息
  ↓ 验证每条消息的有效性
  ↓ 批量处理消息（倒序）
  ↓ 生成 ZK 证明
  ↓ 提交证明到合约
  ↓
计票期 (Tallying Period)
  ↓ Operator 统计投票结果
  ↓ 生成 ZK 证明
  ↓ 提交最终结果
```

### processMessages 核心代码

```typescript
async processMessages() {
  // 1. 确定处理的批次
  const batchSize = this.batchSize;
  const batchStartIdx = Math.floor((this.msgEndIdx - 1) / batchSize) * batchSize;
  const batchEndIdx = Math.min(batchStartIdx + batchSize, this.msgEndIdx);

  console.log(`Process messages [${batchStartIdx}, ${batchEndIdx})`);

  const messages = this.messages.slice(batchStartIdx, batchEndIdx);
  const commands = this.commands.slice(batchStartIdx, batchEndIdx);

  // 2. 准备电路输入数组
  const currentStateLeaves = new Array(batchSize);
  const currentStateLeavesPathElements = new Array(batchSize);
  const currentVoteWeights = new Array(batchSize);
  const currentVoteWeightsPathElements = new Array(batchSize);

  // 3. 倒序处理消息
  for (let i = batchSize - 1; i >= 0; i--) {
    const cmd = commands[i];
    const error = this.checkCommandNow(cmd);

    let stateIdx = 5 ** this.stateTreeDepth! - 1;
    let voIdx = 0;
    if (!error) {
      stateIdx = Number(cmd!.stateIdx);
      voIdx = Number(cmd!.voIdx);
    }

    // 4. 获取当前状态（处理此消息前的状态）
    const s = this.stateLeaves.get(stateIdx) || this.emptyState();
    const currVotes = s.voTree.leaf(voIdx);

    // 5. 保存当前状态快照（给电路使用）
    currentStateLeaves[i] = [
      ...s.pubKey, 
      s.balance, 
      s.voted ? s.voTree.root : 0n, 
      s.nonce
    ];

    currentStateLeavesPathElements[i] = this.stateTree.pathElementOf(stateIdx);
    currentVoteWeights[i] = currVotes;
    currentVoteWeightsPathElements[i] = s.voTree.pathElementOf(voIdx);

    // 6. 更新状态（模拟处理后的效果）
    if (!error) {
      s.pubKey = [...cmd!.newPubKey];
      s.balance = s.balance + currVotes - cmd!.newVotes;
      s.voTree.updateLeaf(voIdx, cmd!.newVotes);
      s.nonce = cmd!.nonce;
      s.voted = true;

      this.stateLeaves.set(stateIdx, s);

      // 更新状态树
      const hash = poseidon([...s.pubKey, s.balance, s.voTree.root, s.nonce]);
      this.stateTree.updateLeaf(stateIdx, hash);
    }

    console.log(`- Message <${i}> ${error || '✓'}`);
  }

  // 7. 生成新的状态根
  const newStateRoot = this.stateTree.root;
  const newStateCommitment = poseidon([newStateRoot, newStateSalt]);

  // 8. 准备电路输入
  const input = {
    msgs: messages.map(msg => msg.ciphertext),
    coordPrivKey: signer.getFormatedPrivKey(),
    coordPubKey: signer.getPublicKey().toPoints(),
    encPubKeys: messages.map(msg => msg.encPubKey),
    currentStateLeaves,           // 每条消息处理前的状态
    currentStateLeavesPathElements,
    currentVoteWeights,           // 每条消息处理前的投票权重
    currentVoteWeightsPathElements,
    currentStateCommitment: this.stateCommitment,
    newStateCommitment,
    // ... 其他字段
  };

  // 9. 生成 ZK 证明
  let proof;
  if (wasmFile && zkeyFile) {
    const { proof: zkProof } = await groth16.fullProve(input, wasmFile, zkeyFile);
    proof = formatProofForContract(zkProof);
  }

  return { input, proof };
}
```

### checkCommandNow: 消息验证

```typescript
private checkCommandNow(cmd: Command | null): string | undefined {
  if (!cmd) {
    return 'empty command';
  }

  const stateIdx = Number(cmd.stateIdx);
  const s = this.stateLeaves.get(stateIdx) || this.emptyState();

  // 1. 验证 nonce
  if (s.nonce + 1n !== cmd.nonce) {
    return 'nonce error';
  }

  // 2. 验证签名（使用当前状态中的公钥）
  const verified = verifySignature(cmd.msgHash, cmd.signature, s.pubKey);
  if (!verified) {
    return 'signature error';
  }

  // 3. 验证余额是否足够
  const currVotes = s.voTree.leaf(voIdx);
  if (s.balance + currVotes < cmd.newVotes) {
    return 'insufficient balance';
  }

  // 4. 其他验证...
  
  return undefined; // 验证通过
}
```

---

## StateLeafTransformer处理流程

StateLeafTransformer 是 MACI 电路的核心组件，负责验证消息并更新状态。

### 电路输入

```circom
template StateLeafTransformer() {
    // 当前状态叶子信息
    signal input slPubKey[2];              // 当前公钥
    signal input slVoiceCreditBalance;     // 当前余额
    signal input slNonce;                  // 当前nonce
    signal input currentVotesForOption;    // 当前对该选项的投票

    // 命令信息
    signal input cmdStateIndex;            // 目标状态索引
    signal input cmdNewPubKey[2];          // 新公钥（通常是当前公钥）
    signal input cmdVoteOptionIndex;       // 投票选项
    signal input cmdNewVoteWeight;         // 新的投票权重
    signal input cmdNonce;                 // 消息nonce
    signal input cmdSigR8[2];              // 签名 R8
    signal input cmdSigS;                  // 签名 S
    signal input packedCommand[3];         // 打包的命令

    // 输出
    signal output newSlPubKey[2];          // 新公钥
    signal output newSlVoiceCreditBalance; // 新余额
    signal output newSlNonce;              // 新nonce
    signal output newSlVoTreeRoot;         // 新的投票树根
    signal output isValid;                 // 消息是否有效
}
```

### 验证流程

```circom
// 1. 调用 MessageValidator 验证消息
component messageValidator = MessageValidator();

// 验证 nonce
messageValidator.originalNonce <== slNonce;
messageValidator.nonce <== cmdNonce;

// 验证签名（使用当前状态的公钥！）
messageValidator.pubKey[0] <== slPubKey[0];
messageValidator.pubKey[1] <== slPubKey[1];
messageValidator.sigR8[0] <== cmdSigR8[0];
messageValidator.sigR8[1] <== cmdSigR8[1];
messageValidator.sigS <== cmdSigS;
for (var i = 0; i < PACKED_CMD_LENGTH; i++) {
    messageValidator.cmd[i] <== packedCommand[i];
}

// 验证余额
messageValidator.currentVoiceCreditBalance <== slVoiceCreditBalance;
messageValidator.currentVotesForOption <== currentVotesForOption;
messageValidator.voteWeight <== cmdNewVoteWeight;

// 2. 如果验证通过，更新状态
component newPubKeyMux = MultiMux1(2);
newPubKeyMux.s <== messageValidator.isValid;
newPubKeyMux.c[0][0] <== slPubKey[0];
newPubKeyMux.c[0][1] <== slPubKey[1];
newPubKeyMux.c[1][0] <== cmdNewPubKey[0];
newPubKeyMux.c[1][1] <== cmdNewPubKey[1];
newSlPubKey[0] <== newPubKeyMux.out[0];
newSlPubKey[1] <== newPubKeyMux.out[1];

component newBalanceMux = Mux1();
newBalanceMux.s <== messageValidator.isValid;
newBalanceMux.c[0] <== slVoiceCreditBalance;
newBalanceMux.c[1] <== messageValidator.newBalance;
newSlVoiceCreditBalance <== newBalanceMux.out;

component newNonceMux = Mux1();
newNonceMux.s <== messageValidator.isValid;
newNonceMux.c[0] <== slNonce;
newNonceMux.c[1] <== cmdNonce;
newSlNonce <== newNonceMux.out;
```

### ProcessOne 电路流程

```circom
template ProcessOne(stateTreeDepth, voteOptionTreeDepth) {
    // 1. 变换状态叶子（验证消息并计算新状态）
    component transformer = StateLeafTransformer();
    transformer.slPubKey[0] <== stateLeaf[0];
    transformer.slPubKey[1] <== stateLeaf[1];
    transformer.slVoiceCreditBalance <== stateLeaf[2];
    transformer.slNonce <== stateLeaf[4];
    // ... 设置其他输入

    // 2. 如果消息无效，使用虚拟索引（MAX_INDEX - 1）
    component stateIndexMux = Mux1();
    stateIndexMux.s <== transformer.isValid;
    stateIndexMux.c[0] <== MAX_INDEX - 1;  // 无效消息
    stateIndexMux.c[1] <== cmdStateIndex;  // 有效消息

    // 3. 验证当前状态叶子存在于状态树中
    component stateLeafQip = QuinTreeInclusionProof(stateTreeDepth);
    stateLeafQip.leaf <== hash(stateLeaf);
    stateLeafQip.root === currentStateRoot;

    // 4. 验证当前投票权重存在于投票选项树中
    component currentVoteWeightQip = QuinTreeInclusionProof(voteOptionTreeDepth);
    currentVoteWeightQip.leaf <== currentVoteWeight;
    // ...

    // 5. 更新投票选项树
    component newVoteOptionTreeQip = QuinTreeInclusionProof(voteOptionTreeDepth);
    newVoteOptionTreeQip.leaf <== newVoteWeight;
    // ...

    // 6. 计算新的状态树根
    component newStateLeafHasher = Hasher5();
    newStateLeafHasher.in[0] <== transformer.newSlPubKey[0];
    newStateLeafHasher.in[1] <== transformer.newSlPubKey[1];
    newStateLeafHasher.in[2] <== transformer.newSlVoiceCreditBalance;
    newStateLeafHasher.in[3] <== newVoteOptionTreeQip.root;
    newStateLeafHasher.in[4] <== transformer.newSlNonce;

    component newStateTreeQip = QuinTreeInclusionProof(stateTreeDepth);
    newStateTreeQip.leaf <== newStateLeafHasher.hash;
    // ...

    signal output newStateRoot <== newStateTreeQip.root;
}
```

---

## Nonce机制与关键理解

### Nonce的作用

Nonce（Number Once）确保消息按正确顺序处理：

1. 每个用户的 state 有一个 nonce，初始值为 0
2. 每条消息包含一个 nonce
3. 消息的 nonce 必须等于 state.nonce + 1
4. 处理后，state.nonce 更新为消息的 nonce

### 单个Payload的Nonce协调

```typescript
// SDK 生成 payload 时
plan = [[0, 5], [2, 3]]

// batchGenMessage 倒序生成：
for (let i = plan.length - 1; i >= 0; i--) {
  const nonce = i + 1;
  // i=1: nonce=2 → payload[0]
  // i=0: nonce=1 → payload[1]
}

// 提交到链上：
messages[0] = payload[0]  // nonce=2
messages[1] = payload[1]  // nonce=1

// Operator 倒序处理：
for (let i = batchSize - 1; i >= 0; i--) {
  // i=1: 处理 messages[1] (nonce=1)
  //      state.nonce=0, expect 0+1=1 ✅
  //      更新 state.nonce=1
  
  // i=0: 处理 messages[0] (nonce=2)
  //      state.nonce=1, expect 1+1=2 ✅
  //      更新 state.nonce=2
}
```

### 多Payload提交的问题

**❌ 错误：分多次提交**

```typescript
// 第1次提交（t1时刻，state.nonce=0）
const payload1 = voter.buildVotePayload({
  selectedOptions: [{ idx: 0, vc: 5 }]
});
// payload1[0]: nonce=1

// 第2次提交（t2时刻，合约中 state.nonce 仍然是 0！）
const payload2 = voter.buildVotePayload({
  selectedOptions: [{ idx: 2, vc: 3 }]
});
// payload2[0]: nonce=1 ❌ 重复了！

// 链上消息队列：
messages[0] = payload1[0]  // nonce=1
messages[1] = payload2[0]  // nonce=1

// Operator 处理（倒序）：
// 1. 处理 messages[1] (nonce=1)
//    state.nonce=0, expect 0+1=1 ✅
//    更新 state.nonce=1
//
// 2. 处理 messages[0] (nonce=1)
//    state.nonce=1, expect 1+1=2 ❌
//    nonce error! 消息被忽略
```

**结果：只有最后提交的 payload 被计数！**

### ✅ 正确做法

**在单个 payload 中完成所有操作：**

```typescript
// 一次性生成包含所有投票的 payload
const payload = voter.buildVotePayload({
  stateIdx: 0,
  operatorPubkey: coordPubKey,
  selectedOptions: [
    { idx: 0, vc: 5 },
    { idx: 2, vc: 3 },
    { idx: 1, vc: 2 }
  ]
});

// payload 包含3条消息，nonce分别为 1, 2, 3
// 一次性提交到链上
// Operator 倒序处理时，nonce 完美协调
```

---

## 时间线与状态管理

### 投票期 vs 处理期

```
═══════════════════════════════════════════════════════════════
                         时间线
═══════════════════════════════════════════════════════════════

投票期 (Voting Period)
│
├─ t1: 用户1提交 messages[0,1,2]
│      合约 state.nonce = 0 (不变)
│
├─ t2: 用户2提交 messages[3,4]
│      合约 state.nonce = 0 (不变)
│
├─ t3: 投票期结束
│      所有消息存储在链上，未处理
│
└─────────────────────────────────────────────────────────────

处理期 (Processing Period)
│
├─ t4: Operator 调用 startProcessPeriod()
│      开始处理消息
│
├─ t5: Operator 处理批次1 (messages[0-4])
│      • 解密所有消息
│      • 倒序验证和更新状态
│      • 生成 ZK 证明
│      • 提交证明到合约
│      合约 state 更新完成
│
└─────────────────────────────────────────────────────────────

计票期 (Tallying Period)
│
├─ t6: Operator 统计投票结果
│      • 遍历所有用户的投票树
│      • 生成 ZK 证明
│      • 提交最终结果
│
└─────────────────────────────────────────────────────────────
```

### Operator的状态模拟

**关键理解：Operator 的循环是"模拟处理"**

```typescript
// 初始状态
stateLeaves[0] = { pubKey: userKey, nonce: 0, balance: 10 }

// 处理 3 条消息
for (let i = 2; i >= 0; i--) {
  // ===== 循环 i=2 =====
  // 1. 读取当前 state
  const s = stateLeaves.get(0);
  // s = { pubKey: userKey, nonce: 0, balance: 10 }
  
  // 2. 保存为电路输入（处理前的快照）
  currentStateLeaves[2] = [userKey, 10, 0, 0];
  
  // 3. 验证消息
  checkCommand(messages[2]);
  // 期望 nonce = 0 + 1 = 1 ✅
  
  // 4. 更新 state（在内存中）
  s.nonce = 1;
  s.balance = 10 - 3 = 7;
  
  // ===== 循环 i=1 =====
  // 1. 读取当前 state（已被上次更新）
  const s = stateLeaves.get(0);
  // s = { pubKey: userKey, nonce: 1, balance: 7 } ⚡
  
  // 2. 保存为电路输入（当前状态）
  currentStateLeaves[1] = [userKey, 7, 0, 1];
  
  // 3. 验证消息
  checkCommand(messages[1]);
  // 期望 nonce = 1 + 1 = 2 ✅
  
  // 4. 更新 state
  s.nonce = 2;
  s.balance = 7 - 2 = 5;
  
  // ===== 循环 i=0 =====
  // 类似...
}

// 电路验证时：
// - messages[2] 用 currentStateLeaves[2] = [nonce: 0]
// - messages[1] 用 currentStateLeaves[1] = [nonce: 1]
// - messages[0] 用 currentStateLeaves[0] = [nonce: 2]
// 每条消息都用处理前的状态进行验证！
```

---

## 隐私保护机制

### 多层隐私保护

```
┌─────────────────────────────────────────────────────────┐
│              MACI 隐私保护层次                            │
└─────────────────────────────────────────────────────────┘

1. 对链上观察者
   ├─ 加密消息内容
   │  └─ 使用 Poseidon Cipher 加密
   ├─ 看到的内容：
   │  ├─ 加密的 ciphertext
   │  └─ 临时公钥 encPubKey
   └─ 看不到：
      ├─ 谁投了什么
      ├─ 投票权重
      └─ 用户身份关联

2. 对 Operator
   ├─ 能解密消息
   │  ├─ stateIdx（用户索引）
   │  ├─ voteOptionIndex（选项）
   │  └─ voteWeight（权重）
   ├─ 受到约束：
   │  ├─ 必须生成 ZK 证明
   │  ├─ 证明必须被合约验证
   │  └─ 无法伪造或审查投票
   └─ 信任假设：
      └─ Operator 不泄露个人投票信息

3. ZK 证明保护
   ├─ Operator 生成证明
   ├─ 合约验证证明
   ├─ 证明内容：
   │  ├─ 正确解密了所有消息
   │  ├─ 正确验证了所有签名
   │  ├─ 正确更新了状态树
   │  └─ 正确统计了结果
   └─ 不泄露：
      └─ 具体的投票细节

4. EdDSA 签名保护
   ├─ 防止伪造投票
   ├─ 验证消息来源
   └─ 使用用户私钥签名
```

### 加密vs签名的区别

```
加密（Encryption）
├─ 目的：隐藏消息内容
├─ 使用：ECDH + Poseidon Cipher
├─ 密钥：
│  ├─ Voter: encPrivKey (临时私钥)
│  └─ Operator: coordinatorPrivKey (长期私钥)
└─ 保护对象：链上观察者

签名（Signature）
├─ 目的：证明消息来源
├─ 使用：EdDSA-Poseidon
├─ 密钥：
│  ├─ Voter: voterPrivKey (长期私钥)
│  └─ 验证用: voterPubKey (state中的公钥)
└─ 保护对象：防止伪造
```

### Operator的权限与限制

```
Operator 能做的：
✅ 解密所有投票消息
✅ 看到每个人投了什么
✅ 处理消息并更新状态
✅ 生成统计结果

Operator 不能做的：
❌ 伪造投票（需要用户私钥签名）
❌ 审查投票（消息已上链）
❌ 修改投票（会导致签名验证失败）
❌ 提供假结果（ZK证明会失败）

ZK 证明约束：
├─ 输入：
│  ├─ 加密消息（公开）
│  ├─ Coordinator 私钥（私密）
│  └─ 当前状态（公开）
├─ 输出：
│  ├─ 新状态根（公开）
│  └─ 证明（公开）
└─ 约束：
   ├─ 必须用正确的私钥解密
   ├─ 必须验证所有签名
   ├─ 必须按顺序处理
   └─ 状态更新必须正确
```

---

## 总结

### 核心要点

1. **消息加密**
   - 使用 ECDH + Poseidon Cipher
   - 每条消息用临时密钥对加密
   - 只有 Operator 能解密

2. **消息签名**
   - 使用 EdDSA-Poseidon
   - 用户用自己的私钥签名
   - 防止伪造和篡改

3. **Nonce 机制**
   - 每个用户维护一个 nonce
   - 消息必须按 nonce 顺序处理
   - SDK 每次从 1 开始生成 nonce
   - **必须在单个 payload 中完成所有操作**

4. **倒序处理**
   - SDK 倒序生成消息（nonce从大到小）
   - Operator 倒序处理消息（从最后一条开始）
   - 电路验证时使用处理前的状态快照

5. **状态管理**
   - 投票期：消息上链，状态不变
   - 处理期：Operator 批量处理，生成证明
   - 计票期：统计结果，生成证明

6. **隐私保护**
   - 链上观察者：看不到投票内容
   - Operator：能看到但受 ZK 证明约束
   - 最终结果：公开且可验证

### 最佳实践

1. ✅ 使用 `buildVotePayload` 一次性生成包含所有投票的 payload
2. ✅ 在投票期内一次性提交所有消息
3. ✅ 确保 Operator 使用正确的电路参数
4. ✅ 验证所有 ZK 证明
5. ❌ 不要分多次提交 payload（会导致 nonce 冲突）
6. ❌ 不要尝试手动管理 nonce（SDK 会自动处理）

---

## 参考资源

- [MACI 官方文档](https://maci.pse.dev/)
- [Poseidon Hash 论文](https://eprint.iacr.org/2019/458)
- [EdDSA 签名方案](https://ed25519.cr.yp.to/)
- [零知识证明基础](https://zkp.science/)

---

**文档版本**: 1.0  
**最后更新**: 2025-11-21  
**作者**: MACI Development Team

