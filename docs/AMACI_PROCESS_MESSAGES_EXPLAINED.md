# AMACI ProcessMessages 电路深度解析

## 目录
1. [概述](#概述)
2. [ProcessMessages 电路整体流程](#processmessages-电路整体流程)
3. [State Tree 更新机制详解](#state-tree-更新机制详解)
4. [Deactivate 和 AddNewKey 状态更新](#deactivate-和-addnewkey-状态更新)
5. [State Tree Depth 与容量管理](#state-tree-depth-与容量管理)
6. [完整示例](#完整示例)

---

## 概述

AMACI 的 `processMessages` 电路是整个系统的核心组件，负责验证用户投票消息的正确性并更新系统状态。与传统 MACI 不同，AMACI 引入了**匿名性机制**，增加了 deactivate tree 和 addNewKey 功能。

### 核心组件

- **State Tree**: 存储所有用户的状态叶子节点（public key, balance, vote option tree root, nonce, d1, d2）
- **Active State Tree**: 追踪用户激活状态（用于 deactivate 机制）
- **Deactivate Tree**: 存储 deactivate 信息
- **Vote Option Tree**: 每个用户的投票权重分配树

---

## ProcessMessages 电路整体流程

### 1. 电路签名

```circom
template ProcessMessages(
    stateTreeDepth,       // State tree 深度，决定最大用户数 = 5^depth
    voteOptionTreeDepth,  // 投票选项树深度，决定最大选项数 = 5^depth
    batchSize             // 批处理大小，一次处理多少条消息
)
```

### 2. 主要输入

#### 公开输入（Public Inputs）
```circom
signal input inputHash;           // SHA256 哈希，包含所有重要公开参数
signal input packedVals;          // 打包值：maxVoteOptions | numSignUps | isQuadraticCost
signal input batchStartHash;      // 消息链起始哈希
signal input batchEndHash;        // 消息链结束哈希
```

#### 私有输入（Private Inputs）
```circom
// Coordinator 信息
signal input coordPrivKey;        // Coordinator 私钥（用于解密消息）
signal input coordPubKey[2];      // Coordinator 公钥

// 消息数据
signal input msgs[batchSize][MSG_LENGTH];     // 加密的消息数组
signal input encPubKeys[batchSize][2];        // 消息的临时公钥（ECDH）

// State Tree 相关
signal input currentStateRoot;                                  // 当前状态树根
signal input currentStateLeaves[batchSize][STATE_LEAF_LENGTH];  // 待更新的状态叶子
signal input currentStateLeavesPathElements[...];               // Merkle 路径

// Active State & Deactivate 相关（AMACI 特有）
signal input activeStateRoot;                 // 激活状态树根
signal input deactivateRoot;                  // Deactivate 树根
signal input activeStateLeaves[batchSize];    // 激活状态叶子
signal input activeStateLeavesPathElements[...];

// Vote Option Tree 相关
signal input currentVoteWeights[batchSize];   // 当前投票权重
signal input currentVoteWeightsPathElements[...];
```

### 3. 电路处理流程（逐步详解）

#### Step 1: 验证 Commitment
```circom
// 验证 currentStateCommitment = hash(currentStateRoot, currentStateSalt)
component currentStateCommitmentHasher = HashLeftRight(); 
currentStateCommitmentHasher.left <== currentStateRoot;
currentStateCommitmentHasher.right <== currentStateSalt;
currentStateCommitmentHasher.hash === currentStateCommitment;

// 验证 deactivateCommitment = hash(activeStateRoot, deactivateRoot)
component deactivateCommitmentHasher = HashLeftRight();
deactivateCommitmentHasher.left <== activeStateRoot;
deactivateCommitmentHasher.right <== deactivateRoot;
deactivateCommitmentHasher.hash === deactivateCommitment;
```

**作用**：确保 operator 提供的状态根与合约中存储的 commitment 一致，防止 operator 作弊。

#### Step 2: 验证公开输入哈希
```circom
component inputHasher = ProcessMessagesInputHasher();
// 将所有重要参数打包并计算 SHA256
inputHasher.hash === inputHash;
```

**作用**：将多个公开参数压缩为单一哈希值，减少链上验证成本（gas 优化）。

#### Step 3: 验证消息链完整性
```circom
signal msgHashChain[batchSize + 1];
msgHashChain[0] <== batchStartHash;

for (var i = 0; i < batchSize; i ++) {
    messageHashers[i] = MessageHasher();
    // 如果消息为空，保持原哈希链；否则链接新消息
    msgHashChain[i + 1] = isEmptyMsg ? msgHashChain[i] : hash(hash(msg[i]), msgHashChain[i]);
}
msgHashChain[batchSize] === batchEndHash;
```

**作用**：确保处理的消息序列与合约中发布的消息完全一致，防止消息被篡改或遗漏。

#### Step 4: 解密消息为 Command
```circom
component derivedPubKey = PrivToPubKey();
derivedPubKey.privKey <== coordPrivKey;
derivedPubKey.pubKey[0] === coordPubKey[0];
derivedPubKey.pubKey[1] === coordPubKey[1];

for (var i = 0; i < batchSize; i ++) {
    commands[i] = MessageToCommand();
    commands[i].encPrivKey <== coordPrivKey;
    commands[i].encPubKey <== encPubKeys[i];
    commands[i].message <== msgs[i];
}
```

**作用**：
- 验证 operator 拥有 coordinator 私钥
- 使用 ECDH 共享密钥解密每条消息，得到用户的投票 Command

#### Step 5: 逆序处理消息（核心逻辑）

```circom
for (var i = batchSize - 1; i >= 0; i --) {
    processors[i] = ProcessOne(stateTreeDepth, voteOptionTreeDepth);
    
    // 输入当前状态
    processors[i].currentStateRoot <== stateRoots[i + 1];
    processors[i].activeStateRoot <== activeStateRoot;
    processors[i].stateLeaf <== currentStateLeaves[i];
    processors[i].activeStateLeaf <== activeStateLeaves[i];
    
    // 输入 Command
    processors[i].cmdStateIndex <== commands[i].stateIndex;
    processors[i].cmdNewPubKey <== commands[i].newPubKey;
    processors[i].cmdVoteOptionIndex <== commands[i].voteOptionIndex;
    processors[i].cmdNewVoteWeight <== commands[i].newVoteWeight;
    processors[i].cmdNonce <== commands[i].nonce;
    processors[i].cmdSigR8 <== commands[i].sigR8;
    processors[i].cmdSigS <== commands[i].sigS;
    
    // 输出新状态根
    stateRoots[i] <== processors[i].newStateRoot;
}
```

**为什么要逆序处理？**
- 逆序处理使得 operator 可以先提供**最终状态叶子**，然后电路从后向前验证
- 这样可以确保 operator 无法跳过某些消息或改变处理顺序
- 最终得到的 `stateRoots[0]` 就是处理完所有消息后的新状态根

#### Step 6: 验证新状态 Commitment
```circom
component stateCommitmentHasher = HashLeftRight();
stateCommitmentHasher.left <== stateRoots[0];
stateCommitmentHasher.right <== newStateSalt;
stateCommitmentHasher.hash === newStateCommitment;
```

**作用**：确保处理后的状态根被正确提交。

---

## ProcessOne 模板详解

每条消息的处理由 `ProcessOne` 模板完成：

### 1. Transform State Leaf（状态转换）

```circom
component transformer = StateLeafTransformer();
transformer.slPubKey <== stateLeaf[PUB_KEY];
transformer.slVoiceCreditBalance <== stateLeaf[BALANCE];
transformer.slNonce <== stateLeaf[NONCE];
transformer.slC1 <== stateLeaf[C1];  // AMACI: ElGamal 加密的 deactivate 状态
transformer.slC2 <== stateLeaf[C2];
transformer.deactivate <== activeStateLeaf;  // 是否被 deactivate

// Command 输入
transformer.cmdStateIndex <== cmdStateIndex;
transformer.cmdNewPubKey <== cmdNewPubKey;
transformer.cmdVoteOptionIndex <== cmdVoteOptionIndex;
transformer.cmdNewVoteWeight <== cmdNewVoteWeight;
transformer.cmdNonce <== cmdNonce;
transformer.cmdSigR8 <== cmdSigR8;
transformer.cmdSigS <== cmdSigS;

// 输出
transformer.isValid ==> isValid;         // Command 是否有效
transformer.newSlPubKey ==> newSlPubKey; // 新公钥
transformer.newSlNonce ==> newSlNonce;   // 新 nonce
transformer.newBalance ==> newBalance;   // 新余额
```

### 2. MessageValidator（消息验证）

在 `StateLeafTransformer` 内部调用 `MessageValidator`：

```circom
component messageValidator = MessageValidator();

// 验证项：
// a) stateTreeIndex < numSignUps（用户已注册）
// b) voteOptionIndex < maxVoteOptions（选项有效）
// c) nonce == originalNonce + 1（防止重放攻击）
// d) EdDSA 签名验证（用户授权）
// e) 是否有足够的 voice credits
```

**验证逻辑（6 项全部通过才有效）**：
```circom
component validUpdate = IsEqual();
validUpdate.in[0] <== 6;
validUpdate.in[1] <== validSignature.valid + 
                      sufficientVoiceCredits.out +
                      validVoteWeight.out +
                      validNonce.out +
                      validStateLeafIndex.out +
                      validVoteOptionIndex.out;
isValid <== validUpdate.out;
```

### 3. AMACI 特有：Deactivate 检查

```circom
// 解密 ElGamal 加密的 deactivate 状态
component decryptIsActive = ElGamalDecrypt();
decryptIsActive.c1 <== slC1;
decryptIsActive.c2 <== slC2;
decryptIsActive.privKey <== coordPrivKey;

// 检查激活状态
component activate = IsZero();
activate.in <== deactivate;

// 最终验证：必须同时满足
// 1. messageValidator.isValid == 1（消息有效）
// 2. activate.out == 1（未被 deactivate）
// 3. (1 - decryptIsActive.isOdd) == 1（ElGamal 解密确认激活）
component valid = IsEqual();
valid.in[0] <== 3;
valid.in[1] <== 1 - decryptIsActive.isOdd + activate.out + messageValidator.isValid;
```

### 4. 验证 Merkle 路径

```circom
// 4.1 验证原始 state leaf 存在于当前 state tree
component stateLeafQip = QuinTreeInclusionProof(stateTreeDepth);
stateLeafQip.leaf <== hash(stateLeaf);
stateLeafQip.path_elements <== stateLeafPathElements;
stateLeafQip.root === currentStateRoot;

// 4.2 验证 active state leaf
component activeStateLeafQip = QuinTreeInclusionProof(stateTreeDepth);
activeStateLeafQip.leaf <== activeStateLeaf;
activeStateLeafQip.root === activeStateRoot;

// 4.3 验证当前投票权重
component currentVoteWeightQip = QuinTreeInclusionProof(voteOptionTreeDepth);
currentVoteWeightQip.leaf <== currentVoteWeight;
currentVoteWeightQip.root === stateLeaf[VO_ROOT] || voTreeZeroRoot;
```

### 5. 更新 Vote Option Tree

```circom
component voteWeightMux = Mux1();
voteWeightMux.s <== transformer.isValid;
voteWeightMux.c[0] <== currentVoteWeight;  // 无效：保持不变
voteWeightMux.c[1] <== cmdNewVoteWeight;   // 有效：更新为新值

component newVoteOptionTreeQip = QuinTreeInclusionProof(voteOptionTreeDepth);
newVoteOptionTreeQip.leaf <== voteWeightMux.out;
newVoteOptionTreeQip.path_elements <== currentVoteWeightsPathElements;
// 计算新的 vote option tree root
```

### 6. 生成新的 State Leaf

```circom
component newStateLeafHasher = Hasher10();
newStateLeafHasher.in[0] <== transformer.newSlPubKey[0];
newStateLeafHasher.in[1] <== transformer.newSlPubKey[1];
newStateLeafHasher.in[2] <== voiceCreditBalanceMux.out;  // 新余额
newStateLeafHasher.in[3] <== newVoteOptionRootMux.out;   // 新 vote option root
newStateLeafHasher.in[4] <== newSlNonceMux.out;          // 新 nonce
newStateLeafHasher.in[5] <== stateLeaf[C1_0];            // C1[0] 不变
newStateLeafHasher.in[6] <== stateLeaf[C1_1];            // C1[1] 不变
newStateLeafHasher.in[7] <== stateLeaf[C2_0];            // C2[0] 不变
newStateLeafHasher.in[8] <== stateLeaf[C2_1];            // C2[1] 不变
newStateLeafHasher.in[9] <== 0;

// 计算新状态根
component newStateLeafQip = QuinTreeInclusionProof(stateTreeDepth);
newStateLeafQip.leaf <== newStateLeafHasher.hash;
newStateRoot <== newStateLeafQip.root;
```

---

## State Tree 更新机制详解

### State Leaf 结构（AMACI）

```
State Leaf = [
  pubKey.x,              // 索引 0: 用户公钥 x 坐标
  pubKey.y,              // 索引 1: 用户公钥 y 坐标
  voiceCreditBalance,    // 索引 2: 剩余投票权
  voteOptionTreeRoot,    // 索引 3: 用户的投票选项树根
  nonce,                 // 索引 4: 防重放 nonce
  c1[0],                 // 索引 5: ElGamal 加密的 c1.x
  c1[1],                 // 索引 6: ElGamal 加密的 c1.y
  c2[0],                 // 索引 7: ElGamal 加密的 c2.x
  c2[1],                 // 索引 8: ElGamal 加密的 c2.y
  0                      // 索引 9: 保留字段
]
```

### State Leaf Hash 计算（AMACI 双层哈希）

```javascript
// AMACI 使用双层 Poseidon 哈希
const layer1 = poseidon([pubKey.x, pubKey.y, balance, voTreeRoot, nonce]);
const layer2 = poseidon([c1[0], c1[1], c2[0], c2[1], 0]);
const stateLeafHash = poseidon([layer1, layer2]);
```

**与 MACI 的区别**：
- MACI: 单层哈希 `poseidon([pubKey.x, pubKey.y, balance, voTreeRoot, nonce])`
- AMACI: 双层哈希，增加 `c1, c2`（ElGamal 加密的激活状态）

### Operator 如何更新 State Tree？

#### 在 SDK 中（packages/sdk/src/operator.ts）

```typescript
async processMessages({ newStateSalt, wasmFile, zkeyFile }: ProcessMessageParams) {
  const batchStartIdx = this.processedMsgCount;
  const batchEndIdx = Math.min(batchStartIdx + this.batchSize!, this.messages.length);
  
  // 收集输入数据
  const currentStateLeaves = [];
  const currentStateLeavesPathElements = [];
  const currentVoteWeights = [];
  const activeStateLeaves = [];
  
  // 逆序处理消息（与电路一致）
  for (let i = batchSize - 1; i >= 0; i--) {
    const cmd = commands[i];
    const error = this.checkCommand(cmd);
    
    const stateIdx = error ? (5 ** this.stateTreeDepth - 1) : cmd.stateIndex;
    const s = this.stateLeaves.get(stateIdx);
    
    // 记录当前状态
    currentStateLeaves[i] = [
      ...s.pubKey,
      s.balance,
      s.voTree.root,
      s.nonce,
      ...s.d1,  // c1
      ...s.d2,  // c2
      0
    ];
    currentStateLeavesPathElements[i] = this.stateTree.pathElementOf(stateIdx);
    currentVoteWeights[i] = s.voTree.leaf(voIdx);
    activeStateLeaves[i] = this.activeStateTree.leaf(stateIdx);
    
    if (!error) {
      // 更新状态
      s.pubKey = [...cmd.newPubKey];
      if (this.isQuadraticCost) {
        s.balance = s.balance + currVotes * currVotes - cmd.newVotes * cmd.newVotes;
      } else {
        s.balance = s.balance + currVotes - cmd.newVotes;
      }
      s.voTree.updateLeaf(voIdx, cmd.newVotes);
      s.nonce = cmd.nonce;
      
      // 计算新的 state leaf hash
      const hash = poseidon([
        poseidon([...s.pubKey, s.balance, s.voTree.root, s.nonce]),
        poseidon([...s.d1, ...s.d2, 0n])
      ]);
      
      // 更新 state tree
      this.stateTree.updateLeaf(stateIdx, hash);
    }
  }
  
  const newStateRoot = this.stateTree.root;
  const newStateCommitment = poseidon([newStateRoot, newStateSalt]);
  
  // 生成证明并提交到合约
  // ...
}
```

#### 状态更新示例

**初始状态**：
```
用户 0 (stateIdx=0):
  pubKey: [pk0_x, pk0_y]
  balance: 100
  voTreeRoot: zero_root
  nonce: 0
```

**收到投票消息**：
```
Command: {
  stateIndex: 0,
  newPubKey: [pk0_x, pk0_y],  // 保持不变
  voteOptionIndex: 2,          // 投给选项 2
  newVoteWeight: 10,           // 投 10 票
  nonce: 1,                    // nonce + 1
  signature: [r, s]
}
```

**更新后状态**：
```
用户 0:
  pubKey: [pk0_x, pk0_y]       // 未变
  balance: 90                   // 100 - 10 = 90 (线性) 或 100 - 10^2 = 0 (二次)
  voTreeRoot: new_root          // 选项 2 的叶子更新为 10
  nonce: 1                      // nonce + 1
```

---

## Deactivate 和 AddNewKey 状态更新

### 问题 1: Deactivate 的工作原理

#### 什么是 Deactivate？

在 AMACI 中，用户可以"deactivate"自己的旧密钥，然后用新密钥重新注册，实现**匿名性重置**。

#### Deactivate 流程

**1. 用户发布 Deactivate Message（在投票期）**

```rust
// contracts/amaci/src/contract.rs
pub fn execute_publish_deactivate_message(
    deps: DepsMut,
    message: MessageData,
    enc_pub_key: PubKey,
) -> Result<Response, ContractError> {
    // 检查是否在投票期
    check_voting_time(env, voting_time)?;
    
    // 检查是否达到最大 deactivate 消息数
    // max = 5^(state_tree_depth + 2) - 1
    let max_deactivate_messages = 5^(state_tree_depth + 2) - 1;
    
    // 将消息加入 deactivate 消息链
    let dmsg_hash = hash([enc_pub_key, ...message.data]);
    DMSG_HASHES.save(dmsg_chain_length, dmsg_hash);
    
    // 记录当前状态根
    STATE_ROOT_BY_DMSG.save(dmsg_chain_length, current_state_root);
}
```

**2. Operator 处理 Deactivate Messages（任意时间）**

```typescript
// packages/sdk/src/operator.ts
async processDeactivateMessages({ inputSize, subStateTreeLength }) {
  const batchStartIdx = this.processedDMsgCount;
  const batchEndIdx = batchStartIdx + inputSize;
  
  const messages = this.dMessages.slice(batchStartIdx, batchEndIdx);
  const commands = this.dCommands.slice(batchStartIdx, batchEndIdx);
  
  const currentActiveStateRoot = this.activeStateTree.root;
  const currentDeactivateRoot = this.deactivateTree.root;
  
  // 处理每条 deactivate 消息
  for (let i = 0; i < batchSize; i++) {
    const cmd = commands[i];
    const error = this.checkDeactivateCommand(cmd);
    
    const stateIdx = error ? (5 ** this.stateTreeDepth - 1) : cmd.stateIdx;
    const s = this.stateLeaves.get(stateIdx);
    
    // 计算新的激活状态（递增计数器）
    const newActiveState = this.processedDMsgCount + i + 1;
    
    // 生成 deactivate leaf（ElGamal 加密）
    const sharedKey = genEcdhSharedKey(this.coordinator.privKey, s.pubKey);
    const deactivate = encryptOdevity(
      !!error,  // 如果消息无效，加密 false（不 deactivate）
      this.coordinator.pubKey,
      genStaticRandomKey(this.coordinator.privKey, 20040n, newActiveState)
    );
    
    const dLeaf = [
      deactivate.c1.x,
      deactivate.c1.y,
      deactivate.c2.x,
      deactivate.c2.y,
      poseidon(sharedKey)
    ];
    
    if (!error) {
      // 更新 active state tree（标记为已 deactivate）
      this.activeStateTree.updateLeaf(stateIdx, newActiveState);
      
      // 更新 deactivate tree
      this.deactivateTree.updateLeaf(deactivateIndex0 + i, poseidon(dLeaf));
    }
  }
  
  const newDeactivateRoot = this.deactivateTree.root;
  const newDeactivateCommitment = poseidon([activeStateRoot, newDeactivateRoot]);
  
  // 生成证明并提交到合约
  // ...
}
```

**关键点**：
- **Active State Tree**: 每个用户叶子初始为 0，deactivate 后变为递增计数器值
- **Deactivate Tree**: 存储 ElGamal 加密的 deactivate 信息
- **电路验证**: 在 `processMessages` 时检查 `activeStateLeaf` 和解密 `c1, c2` 确认用户未被 deactivate

#### 在 ProcessMessages 中如何检查 Deactivate？

```circom
// 在 StateLeafTransformer 中
component decryptIsActive = ElGamalDecrypt();
decryptIsActive.c1 <== slC1;  // 从 state leaf 读取
decryptIsActive.c2 <== slC2;
decryptIsActive.privKey <== coordPrivKey;

component activate = IsZero();
activate.in <== deactivate;  // deactivate 输入来自 activeStateLeaf

// 验证：必须同时满足
// 1. messageValidator.isValid == 1
// 2. activate.out == 1（activeStateLeaf == 0，表示未 deactivate）
// 3. (1 - decryptIsActive.isOdd) == 1（ElGamal 解密确认）
component valid = IsEqual();
valid.in[0] <== 3;
valid.in[1] <== 1 - decryptIsActive.isOdd + activate.out + messageValidator.isValid;
```

**逻辑**：
- 如果用户已被 deactivate，`activeStateLeaf` 会变成非零值（递增计数器）
- `activate.out` 会变为 0，导致 `valid.out` 为 0
- 该用户的投票消息被标记为无效，state tree 不更新

### 问题 2: AddNewKey 的工作原理

#### AddNewKey 流程

**1. 用户生成 AddNewKey 证明并提交（在投票期）**

```rust
// contracts/amaci/src/contract.rs
pub fn execute_add_new_key(
    deps: DepsMut,
    pubkey: PubKey,
    nullifier: Uint256,
    d: [Uint256; 4],
    groth16_proof: Groth16ProofType,
) -> Result<Response, ContractError> {
    // 检查投票期
    check_voting_time(env, voting_time)?;
    
    // 检查 nullifier 是否已使用（防止重复）
    if NULLIFIERS.has(nullifier) {
        return Err(ContractError::NewKeyExist {});
    }
    NULLIFIERS.save(nullifier, true);
    
    // 检查容量
    assert!(num_sign_ups < max_leaves_count, "full");
    
    // 构造证明输入
    let input = [
        DNODES[0],           // 当前 deactivate root
        COORDINATORHASH,     // coordinator 公钥哈希
        nullifier,           // nullifier（防止重复注册）
        d[0], d[1], d[2], d[3]  // ElGamal 随机数
    ];
    let input_hash = sha256(input) % snark_scalar_field;
    
    // 验证 Groth16 证明
    let is_passed = groth16_verify(&pvk, &proof, &[input_hash])?;
    if (!is_passed) {
        return Err(ContractError::InvalidProof { step: "AddNewKey" });
    }
    
    // 创建新的 state leaf（带 d1, d2）
    let state_leaf = StateLeaf {
        pub_key: pubkey,
        voice_credit_balance: VOICE_CREDIT_AMOUNT,
        vote_option_tree_root: 0,
        nonce: 0,
    };
    let hash = state_leaf.hash_new_key_state_leaf(d);
    
    // 加入 state tree
    state_enqueue(&mut deps, hash)?;
    num_sign_ups += 1;
    
    Ok(Response::new())
}
```

**2. State Leaf Hash 计算（AddNewKey）**

```rust
// contracts/amaci/src/state.rs
impl StateLeaf {
    pub fn hash_new_key_state_leaf(&self, d: [Uint256; 4]) -> Uint256 {
        let plaintext = [
            self.pub_key.x,
            self.pub_key.y,
            self.voice_credit_balance,
            0,  // vote_option_tree_root 初始为 0
            0   // nonce 初始为 0
        ];
        let layer1 = hash5(plaintext);
        let layer2 = hash5([d[0], d[1], d[2], d[3], 0]);
        hash2([layer1, layer2])
    }
}
```

**关键点**：
- `d[0..3]` 是 ElGamal 加密的随机数，存储在 state leaf 的 `c1, c2` 中
- 用户需要用旧密钥生成零知识证明，证明自己已被 deactivate
- 新密钥与旧密钥在链上无法关联（实现匿名性）

#### AddNewKey 是否占用 State Tree 容量？

**是的！** AddNewKey 会占用 state tree 的一个叶子位置。

```rust
let max_leaves_count = 5^state_tree_depth;
assert!(num_sign_ups < max_leaves_count, "full");

// 加入新叶子
state_enqueue(&mut deps, state_leaf_hash)?;
num_sign_ups += 1;  // 递增用户计数
```

#### PreAddNewKey vs AddNewKey

系统提供两个接口：

1. **AddNewKey**: 使用当前 `DNODES[0]`（deactivate root）验证
2. **PreAddNewKey**: 使用 `PRE_DEACTIVATE_ROOT` 验证

```rust
pub fn execute_pre_add_new_key(...) {
    let input = [
        PRE_DEACTIVATE_ROOT.load(deps.storage)?,  // 使用预存的旧 root
        PRE_DEACTIVATE_COORDINATOR_HASH.load(...)?  // 可能使用旧 coordinator
        nullifier,
        d[0], d[1], d[2], d[3]
    ];
    
    // 验证证明...
    let state_leaf_hash = state_leaf.hash_decativate_state_leaf();
    state_enqueue(&mut deps, state_leaf_hash)?;
}
```

**区别**：
- `PreAddNewKey` 允许用户提前生成证明，即使 deactivate tree 已更新也能注册
- `hash_decativate_state_leaf()` 使用固定哈希值而不是 `d`

---

## State Tree Depth 与容量管理

### 问题 3: State Tree Depth 的特殊之处

#### State Tree 容量计算

```
maxUsers = 5^state_tree_depth
```

**示例**：
- `state_tree_depth = 2`: 最多 5^2 = 25 个用户
- `state_tree_depth = 4`: 最多 5^4 = 625 个用户
- `state_tree_depth = 8`: 最多 5^8 = 390,625 个用户

#### Deactivate Tree Depth 特殊规则

```rust
// contracts/amaci/src/contract.rs
pub fn execute_publish_deactivate_message(...) {
    let max_deactivate_messages = 5^(state_tree_depth + 2) - 1;
    
    if dmsg_chain_length + 1 > max_deactivate_messages {
        return Err(ContractError::MaxDeactivateMessagesReached);
    }
}
```

**为什么是 `depth + 2`？**

因为：
1. **每个用户可能多次 deactivate**: 用户可以 deactivate → addNewKey → 投票 → 再次 deactivate
2. **安全裕度**: 提供额外容量，防止 deactivate 消息用尽

**示例**（`state_tree_depth = 2`）：
- 最大用户数: 5^2 = 25
- 最大 deactivate 消息数: 5^4 - 1 = 624
- 平均每用户可 deactivate: 624 / 25 ≈ 24 次

#### 合约中的 Depth 初始化

```rust
// contracts/amaci/src/contract.rs
pub fn instantiate(msg: InstantiateMsg) {
    let max_leaves_count = 5^msg.parameters.state_tree_depth;
    MAX_LEAVES_COUNT.save(deps.storage, &max_leaves_count)?;
    
    // 初始化 state tree 零根
    let mut zeros = [Uint256::zero(); 9];
    zeros[0] = hash5([0, 0, 0, 0, 0]);
    for i in 1..9 {
        zeros[i] = hash5([zeros[i-1]; 5]);
    }
    ZEROS.save(deps.storage, &zeros)?;
}
```

#### Operator 处理的 State Tree 管理

```typescript
// packages/sdk/src/operator.ts
export class OperatorClient {
  stateTree: IncrementalQuinTree;       // 主 state tree
  activeStateTree: IncrementalQuinTree; // active state tree
  deactivateTree: IncrementalQuinTree;  // deactivate tree
  
  async initMaci(contractState: ContractState) {
    this.stateTreeDepth = contractState.stateTreeDepth;
    this.batchSize = contractState.batchSize;
    this.numSignUps = contractState.numSignUps;
    
    // 初始化 state tree（depth = stateTreeDepth）
    this.stateTree = new IncrementalQuinTree(
      this.stateTreeDepth,
      0n,
      5,
      hash5
    );
    
    // 初始化 active state tree（同 depth）
    this.activeStateTree = new IncrementalQuinTree(
      this.stateTreeDepth,
      0n,
      5,
      hash5
    );
    
    // 初始化 deactivate tree（depth + 2）
    this.deactivateTree = new IncrementalQuinTree(
      this.stateTreeDepth + 2,  // 注意：+2 层
      0n,
      5,
      hash5
    );
    
    // 从合约加载现有叶子
    for (let i = 0n; i < this.numSignUps; i++) {
      const stateLeaf = await this.getStateLeaf(i);
      this.stateTree.insert(stateLeaf.hash);
      this.activeStateTree.insert(0n);  // 初始未 deactivate
    }
  }
}
```

---

## 完整示例

### 场景：3 个用户的投票流程

#### 初始设置

```
state_tree_depth = 2  (最多 5^2 = 25 个用户)
vote_option_tree_depth = 1  (最多 5 个选项)
batch_size = 5
isQuadraticCost = false  (线性投票)
voice_credit_amount = 100
```

#### Step 1: 用户注册（SignUp）

```
User A 注册:
  stateIdx = 0
  pubKey = [pkA_x, pkA_y]
  balance = 100
  voTreeRoot = 0
  nonce = 0
  c1 = [0, 0]
  c2 = [0, 0]
  hash = poseidon([
    poseidon([pkA_x, pkA_y, 100, 0, 0]),
    poseidon([0, 0, 0, 0, 0])
  ])

User B 注册 (stateIdx=1): 同上
User C 注册 (stateIdx=2): 同上

State Tree:
  leaf[0] = hashA
  leaf[1] = hashB
  leaf[2] = hashC
  leaf[3..24] = 0

Active State Tree:
  leaf[0..24] = 0  (所有用户激活)
```

#### Step 2: 用户发布投票消息

```
Message 0 (User A 投票给选项 1):
  encPubKey = [ephemeral_pk]
  ciphertext = encrypt([
    stateIndex: 0,
    newPubKey: [pkA_x, pkA_y],
    voteOptionIndex: 1,
    newVoteWeight: 30,
    nonce: 1,
    ...
  ], coordPubKey, ephemeral_sk)
  signature = sign(ciphertext, userA_privKey)

Message 1 (User B 投票给选项 2, 权重 50)
Message 2 (User C 投票给选项 1, 权重 20)
```

#### Step 3: Operator 处理消息

```typescript
// Operator 调用
const result = await operator.processMessages({
  newStateSalt: randomSalt
});

// 内部处理（逆序）
// i=2: Process Message 2 (User C)
//   验证签名 ✓
//   验证 nonce (0+1=1) ✓
//   验证余额 (100 >= 20) ✓
//   更新 User C:
//     balance: 100 - 20 = 80
//     voTreeRoot: updateLeaf(1, 20)
//     nonce: 1
//   newStateRoot2 = recalculate(stateTree, stateIdx=2, newLeaf)

// i=1: Process Message 1 (User B)
//   更新 User B:
//     balance: 100 - 50 = 50
//     voTreeRoot: updateLeaf(2, 50)
//     nonce: 1
//   newStateRoot1 = recalculate(stateTree, stateIdx=1, newLeaf)

// i=0: Process Message 0 (User A)
//   更新 User A:
//     balance: 100 - 30 = 70
//     voTreeRoot: updateLeaf(1, 30)
//     nonce: 1
//   newStateRoot0 = recalculate(stateTree, stateIdx=0, newLeaf)

// 最终状态
finalStateRoot = newStateRoot0
newStateCommitment = poseidon([finalStateRoot, newStateSalt])
```

#### Step 4: 用户 A 决定 Deactivate 并注册新密钥

```
1. User A 发布 Deactivate Message:
   encPubKey = [ephemeral_pk2]
   ciphertext = encrypt([
     stateIndex: 0,
     ...
   ], coordPubKey, ephemeral_sk2)
   signature = sign(ciphertext, userA_privKey)

2. Operator 处理 Deactivate Message:
   验证签名 ✓
   验证 stateIdx=0 有效 ✓
   更新 Active State Tree:
     leaf[0] = 1  (第 1 个 deactivate 消息)
   更新 Deactivate Tree:
     leaf[0] = hash([c1.x, c1.y, c2.x, c2.y, sharedKeyHash])

3. User A 生成 AddNewKey 证明:
   旧公钥: [pkA_x, pkA_y]
   新公钥: [pkA_new_x, pkA_new_y]
   nullifier: hash(pkA_old, randomness)
   d: [d0, d1, d2, d3]  (ElGamal 随机数)
   
   证明输入: [deactivateRoot, coordHash, nullifier, d0, d1, d2, d3]
   
4. 合约验证 AddNewKey 证明:
   验证 nullifier 未使用 ✓
   验证 Groth16 证明 ✓
   创建新 state leaf:
     stateIdx = 3
     pubKey = [pkA_new_x, pkA_new_y]
     balance = 100  (重新获得投票权)
     hash = hash_new_key_state_leaf(d)
   
5. User A (新密钥) 继续投票:
   Message 3 (stateIdx=3, voteOptionIndex=2, newVoteWeight=40)
```

#### Step 5: 最终状态

```
State Tree:
  leaf[0] = hashA (balance=70, nonce=1, 已 deactivate)
  leaf[1] = hashB (balance=50, nonce=1)
  leaf[2] = hashC (balance=80, nonce=1)
  leaf[3] = hashA_new (balance=60, nonce=1)  // 100 - 40
  
Active State Tree:
  leaf[0] = 1  (已 deactivate)
  leaf[1] = 0
  leaf[2] = 0
  leaf[3] = 0

Deactivate Tree:
  leaf[0] = hash([c1, c2, sharedKey])  // User A 的 deactivate 记录
```

### 电路输入完整示例（batchSize=5，处理 Message 0-2）

```json
{
  "inputHash": "0x1234...",
  "packedVals": "4294967301",  // (5 << 32) | (3 << 0) | (0 << 64)
  "coordPrivKey": "1234567890...",
  "coordPubKey": ["0x111...", "0x222..."],
  
  "currentStateRoot": "0xabc...",
  "currentStateCommitment": "0xdef...",
  "currentStateSalt": "0x789...",
  
  "activeStateRoot": "0x000...",
  "deactivateRoot": "0x000...",
  "deactivateCommitment": "0x123...",
  
  "batchStartHash": "0x456...",
  "batchEndHash": "0x789...",
  
  "msgs": [
    [msg0_data],  // User A 的消息
    [msg1_data],  // User B 的消息
    [msg2_data],  // User C 的消息
    [empty_msg],  // 空消息（填充）
    [empty_msg]   // 空消息（填充）
  ],
  
  "encPubKeys": [
    [ephemeral_pk0],
    [ephemeral_pk1],
    [ephemeral_pk2],
    [0, 0],  // 空消息标记
    [0, 0]
  ],
  
  "currentStateLeaves": [
    [pkA_x, pkA_y, 70, voRootA_new, 1, 0, 0, 0, 0, 0],   // Message 0 后的状态
    [pkB_x, pkB_y, 50, voRootB_new, 1, 0, 0, 0, 0, 0],   // Message 1 后的状态
    [pkC_x, pkC_y, 80, voRootC_new, 1, 0, 0, 0, 0, 0],   // Message 2 后的状态
    [dummy_leaf],
    [dummy_leaf]
  ],
  
  "currentStateLeavesPathElements": [
    [pathA],  // stateIdx=0 的 Merkle 路径
    [pathB],  // stateIdx=1 的 Merkle 路径
    [pathC],  // stateIdx=2 的 Merkle 路径
    [dummy_path],
    [dummy_path]
  ],
  
  "activeStateLeaves": [0, 0, 0, 0, 0],  // 所有用户未 deactivate
  
  "currentVoteWeights": [0, 0, 0, 0, 0],  // 原始投票权重（首次投票都为 0）
  
  "newStateCommitment": "0xnew...",
  "newStateSalt": "0xsalt..."
}
```

---

## 总结回答你的问题

### ❓ 问题 1: 用户的 State Tree 是如何更新的？

**答案**：
1. **用户发布加密消息**到合约（`publishMessage`）
2. **Operator 批量处理消息**：
   - 使用 coordinator 私钥解密消息
   - 验证每条消息的签名和有效性
   - 在本地更新 state tree（逆序处理）
   - 生成 ZK 证明
3. **提交证明到合约**（`processMessages`）：
   - 合约验证证明
   - 更新 `CURRENT_STATE_COMMITMENT`
4. **State leaf 更新内容**：
   - `pubKey`: 通常保持不变（除非 key change）
   - `balance`: 根据投票权重扣除
   - `voTreeRoot`: 更新对应选项的投票权重
   - `nonce`: +1（防重放）

### ❓ 问题 2: Deactivate 和 AddNewKey 如何更新状态？Operator 如何处理？

**答案**：

#### Deactivate 流程：
1. **用户发布 `publishDeactivateMessage`**（合约记录到 `DMSG_HASHES`）
2. **Operator 调用 `processDeactivateMessages`**：
   - 解密 deactivate 消息
   - 更新 `activeStateTree` 对应叶子（0 → 递增计数器）
   - 更新 `deactivateTree`（存储 ElGamal 加密的 deactivate 信息）
   - 生成证明并提交到合约
3. **后续 `processMessages` 检查**：
   - 读取 `activeStateLeaf`，如果非零则拒绝该用户的投票
   - 解密 state leaf 中的 `c1, c2` 验证一致性

#### AddNewKey 流程：
1. **用户生成 ZK 证明**（证明自己拥有被 deactivate 的旧密钥）
2. **调用 `addNewKey` 提交新公钥**
3. **合约验证证明后**：
   - 创建新 state leaf（`hash_new_key_state_leaf(d)`）
   - 插入 state tree（**占用一个新的 stateIdx**）
   - `numSignUps++`
4. **用户用新密钥投票**（链上无法关联新旧密钥）

**Operator 不直接处理 `addNewKey`**，只需在 `initMaci` 时同步合约的 `numSignUps` 和所有 state leaves。

### ❓ 问题 3: State Tree Depth 和 AddNewKey 的容量关系

**答案**：

#### State Tree 容量：
```
maxUsers = 5^state_tree_depth
```

#### AddNewKey **占用 State Tree 额度**：
- 每次 `addNewKey` 会插入一个新的 state leaf
- `numSignUps++`
- 如果 `numSignUps >= maxUsers`，无法再添加

#### Deactivate Tree 容量（特殊规则）：
```
maxDeactivateMessages = 5^(state_tree_depth + 2) - 1
```
- **比 state tree 多 2 层**，提供额外容量
- 允许用户多次 deactivate/addNewKey 循环

#### 示例（state_tree_depth = 2）：
- **State Tree 容量**: 5^2 = 25 个叶子
  - 初始 SignUp: 10 个用户（stateIdx 0-9）
  - AddNewKey: 5 个用户（stateIdx 10-14）
  - **剩余容量**: 25 - 15 = 10 个
- **Deactivate Tree 容量**: 5^4 - 1 = 624 条 deactivate 消息
  - 平均每用户可 deactivate 约 24 次

#### 合约维护的 Depth 没有特别之处：
- 合约只存储 `state_tree_depth`、`vote_option_tree_depth` 等参数
- Operator 根据这些参数初始化对应深度的树
- **Deactivate Tree** 使用 `state_tree_depth + 2` 是硬编码规则（在 Operator SDK 中实现）

---

## 附录：关键数据结构

### State Leaf（AMACI 完整版）

| 索引 | 字段 | 描述 |
|-----|------|------|
| 0 | `pubKey.x` | 用户公钥 x 坐标 |
| 1 | `pubKey.y` | 用户公钥 y 坐标 |
| 2 | `voiceCreditBalance` | 剩余投票权 |
| 3 | `voteOptionTreeRoot` | 投票选项树根 |
| 4 | `nonce` | 防重放 nonce |
| 5 | `c1[0]` | ElGamal c1.x |
| 6 | `c1[1]` | ElGamal c1.y |
| 7 | `c2[0]` | ElGamal c2.x |
| 8 | `c2[1]` | ElGamal c2.y |
| 9 | `reserved` | 保留（值为 0） |

### Command 结构

```typescript
interface Command {
  stateIndex: bigint;       // 用户索引
  newPubKey: [bigint, bigint];  // 新公钥（通常不变）
  voteOptionIndex: bigint;  // 投票选项索引
  newVoteWeight: bigint;    // 新投票权重
  nonce: bigint;            // nonce（必须 = 原 nonce + 1）
  pollId: bigint;           // Poll ID（保留）
  salt: bigint;             // Salt（保留）
  sigR8: [bigint, bigint];  // EdDSA 签名 R8
  sigS: bigint;             // EdDSA 签名 S
}
```

### 电路验证流程图

```
用户消息 → 合约存储 → Operator 读取 
                         ↓
                      解密消息
                         ↓
                    验证签名/nonce/余额
                         ↓
                    更新本地 State Tree
                         ↓
                    生成 ZK 证明
                         ↓
                    提交到合约验证
                         ↓
                    更新链上 Commitment
```

---

## 参考资料

- 电路代码: `packages/circuits/circom/amaci/power/processMessages.circom`
- 合约代码: `contracts/amaci/src/contract.rs`
- Operator SDK: `packages/sdk/src/operator.ts`
- State 管理: `contracts/amaci/src/state.rs`
- 测试用例: `e2e/tests/add-new-key.e2e.test.ts`
