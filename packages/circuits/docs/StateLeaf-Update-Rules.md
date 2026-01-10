# AMACI State Leaf 更新规则完整文档

## 目录

1. [State Leaf 结构](#state-leaf-结构)
2. [三种哈希计算方式](#三种哈希计算方式)
3. [Signup - 普通注册](#signup---普通注册)
4. [AddNewKey - 投票期间添加密钥](#addnewkey---投票期间添加密钥)
5. [PreAddNewKey - 投票前添加密钥](#preaddnewkey---投票前添加密钥)
6. [对比总结](#对比总结)
7. [技术细节](#技术细节)
8. [实际应用场景](#实际应用场景)

---

## State Leaf 结构

### 基础结构（Rust 合约）

```rust
pub struct StateLeaf {
    pub pub_key: PubKey,              // 用户公钥 (x, y)
    pub voice_credit_balance: Uint256, // 语音信用余额
    pub vote_option_tree_root: Uint256, // 投票选项树根
    pub nonce: Uint256,                // 防重放计数器
}

pub struct PubKey {
    pub x: Uint256,  // 公钥 X 坐标
    pub y: Uint256,  // 公钥 Y 坐标
}
```

### 完整结构（电路中）

```javascript
StateLeaf = [
  pubKey_x,           // [0] 用户公钥 X 坐标
  pubKey_y,           // [1] 用户公钥 Y 坐标
  voiceCreditBalance, // [2] 剩余投票积分
  voteOptionRoot,     // [3] 该用户的投票选项树根
  nonce,              // [4] 防重放攻击计数器
  c1_x,               // [5] ElGamal 密文 C1 的 X 坐标
  c1_y,               // [6] ElGamal 密文 C1 的 Y 坐标
  c2_x,               // [7] ElGamal 密文 C2 的 X 坐标
  c2_y,               // [8] ElGamal 密文 C2 的 Y 坐标
  // xIncrement       // [9] (已注释) X 坐标增量
]
// 长度: 10 个字段
```

---

## 三种哈希计算方式

### 方式1: `hash_state_leaf()` - 标准哈希

**使用场景**: ProcessMessages（投票消息处理）

**计算公式**:

```rust
pub fn hash_state_leaf(&self) -> Uint256 {
    let mut plaintext: [Uint256; 5] = [Uint256::from_u128(0); 5];

    plaintext[0] = self.pub_key.x;
    plaintext[1] = self.pub_key.y;
    plaintext[2] = self.voice_credit_balance;
    plaintext[3] = self.vote_option_tree_root;
    plaintext[4] = self.nonce;
    
    return hash5(plaintext);
}
```

**结构**:
```
hash5([
  pubKey.x,
  pubKey.y,
  voiceCreditBalance,
  voteOptionRoot,
  nonce
])
```

**特点**:
- ✅ 最简单的哈希方式
- ✅ 只包含 5 个核心字段
- ✅ 用于投票消息处理过程

---

### 方式2: `hash_decativate_state_leaf()` - 停用哈希

**使用场景**: 
- Signup（用户注册）
- PreAddNewKey（投票前添加密钥）

**计算公式**:

```rust
pub fn hash_decativate_state_leaf(&self) -> Uint256 {
    let mut plaintext: [Uint256; 5] = [Uint256::from_u128(0); 5];

    plaintext[0] = self.pub_key.x;
    plaintext[1] = self.pub_key.y;
    plaintext[2] = self.voice_credit_balance;
    // 注意：只有 3 个字段！
    
    return hash2([
        hash5(plaintext),
        uint256_from_hex_string(
            "2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc"
        )
    ]);
}
```

**结构**:
```
hash2([
  hash5([
    pubKey.x,
    pubKey.y,
    voiceCreditBalance,
    0,  // vote_option_tree_root 位置
    0   // nonce 位置
  ]),
  DEACTIVATE_CONSTANT  // 固定常量
])
```

**DEACTIVATE_CONSTANT**:
```
0x2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc
```

**特点**:
- ✅ 只使用 **3 个字段**: `pubKey.x`, `pubKey.y`, `voiceCreditBalance`
- ✅ `vote_option_tree_root` 和 `nonce` 的位置用 **0 填充**
- ✅ 外层再哈希一次固定常量
- ✅ 用于标记"可停用"状态的账户

**为什么叫 deactivate?**

这个名字表示该 state leaf 是"**可以被停用**"的状态：
- 在 Signup 和 PreAddNewKey 时，账户初始状态是**已激活但可停用**
- 通过 ProcessDeactivate 电路可以将账户停用
- 使用特殊的哈希格式来标识这种状态

---

### 方式3: `hash_new_key_state_leaf(d)` - 新密钥哈希

**使用场景**: AddNewKey（投票期间添加密钥）

**计算公式**:

```rust
pub fn hash_new_key_state_leaf(&self, d: [Uint256; 4]) -> Uint256 {
    let mut plaintext: [Uint256; 5] = [Uint256::from_u128(0); 5];

    plaintext[0] = self.pub_key.x;
    plaintext[1] = self.pub_key.y;
    plaintext[2] = self.voice_credit_balance;
    // 注意：只有 3 个字段！
    
    return hash2([
        hash5(plaintext),
        hash5([d[0], d[1], d[2], d[3], Uint256::from_u128(0u128)])
    ]);
}
```

**结构**:
```
hash2([
  hash5([
    pubKey.x,
    pubKey.y,
    voiceCreditBalance,
    0,  // vote_option_tree_root 位置
    0   // nonce 位置
  ]),
  hash5([
    d[0],  // d1.x (ElGamal 重随机化密文 D1 的 X 坐标)
    d[1],  // d1.y (ElGamal 重随机化密文 D1 的 Y 坐标)
    d[2],  // d2.x (ElGamal 重随机化密文 D2 的 X 坐标)
    d[3],  // d2.y (ElGamal 重随机化密文 D2 的 Y 坐标)
    0      // 填充
  ])
])
```

**参数 `d` 的含义**:

| 索引 | 字段 | 说明 |
|------|------|------|
| `d[0]` | `d1.x` | ElGamal 重随机化密文 D1 的 X 坐标 |
| `d[1]` | `d1.y` | ElGamal 重随机化密文 D1 的 Y 坐标 |
| `d[2]` | `d2.x` | ElGamal 重随机化密文 D2 的 X 坐标 |
| `d[3]` | `d2.y` | ElGamal 重随机化密文 D2 的 Y 坐标 |

**特点**:
- ✅ 只使用 **3 个字段**: `pubKey.x`, `pubKey.y`, `voiceCreditBalance`
- ✅ `vote_option_tree_root` 和 `nonce` 的位置用 **0 填充**
- ✅ 外层哈希使用 ElGamal 重随机化参数 `d`
- ✅ 用于投票期间添加新密钥

**为什么需要 `d` 参数?**

`d` 是 ElGamal 重随机化的结果，用于：
1. **证明旧密钥的所有权**: 只有拥有旧私钥的人才能生成正确的 `d`
2. **更新激活状态加密**: 将旧的 ElGamal 密文重随机化为新密文
3. **防止重复使用**: 每次添加密钥都需要新的随机值

---

## Signup - 普通注册

### 调用时机

- **阶段**: Voting 期间之前（Pending 期间）
- **操作**: 用户首次注册参与投票

### 合约代码

```rust:715:768
// contracts/amaci/src/contract.rs
pub fn execute_signup(
    mut deps: DepsMut,
    env: Env,
    info: MessageInfo,
    pubkey: PubKey,
    // ... 其他参数
) -> Result<Response, ContractError> {
    // 检查注册资格（白名单或 Oracle）
    // ...
    
    let voice_credit_amount = VOICE_CREDIT_AMOUNT.load(deps.storage)?;
    
    // 创建 state leaf
    let state_leaf = StateLeaf {
        pub_key: pubkey.clone(),
        voice_credit_balance: voice_credit_amount,
        vote_option_tree_root: Uint256::from_u128(0),
        nonce: Uint256::from_u128(0),
    }
    .hash_decativate_state_leaf();  // ⭐ 使用 hash_decativate_state_leaf()
    
    let state_index = num_sign_ups;
    // 将 state leaf 加入状态树
    state_enqueue(&mut deps, state_leaf)?;
    num_sign_ups += Uint256::from_u128(1u128);
    
    NUMSIGNUPS.save(deps.storage, &num_sign_ups)?;
    SIGNUPED.save(deps.storage, &(...), &state_index)?;
    
    Ok(Response::new()
        .add_attribute("action", "sign_up")
        .add_attribute("state_idx", state_index.to_string()))
}
```

### 哈希计算步骤

#### 步骤1: 准备 StateLeaf 数据

```javascript
StateLeaf = {
  pub_key: {
    x: user_pubkey_x,
    y: user_pubkey_y
  },
  voice_credit_balance: initial_credits,  // 例如: 1000
  vote_option_tree_root: 0,               // 初始值
  nonce: 0                                // 初始值
}
```

#### 步骤2: 计算 hash_decativate_state_leaf()

```javascript
// 第一步: hash5 前 3 个字段
plaintext = [
  user_pubkey_x,
  user_pubkey_y,
  initial_credits,
  0,  // vote_option_tree_root
  0   // nonce
]
inner_hash = hash5(plaintext)

// 第二步: hash2 与固定常量
DEACTIVATE_CONSTANT = 0x2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc

state_leaf_hash = hash2([
  inner_hash,
  DEACTIVATE_CONSTANT
])
```

### 完整示例

```javascript
// 输入
user_pubkey = {
  x: 0x123...abc,
  y: 0x456...def
}
initial_credits = 1000

// 计算
plaintext = [
  0x123...abc,  // pubkey.x
  0x456...def,  // pubkey.y
  1000,         // voice_credit_balance
  0,            // vote_option_tree_root (填充0)
  0             // nonce (填充0)
]

inner_hash = hash5(plaintext)
// 例如: 0x789...ghi

state_leaf_hash = hash2([
  0x789...ghi,
  0x2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc
])
// 最终哈希: 0xabc...xyz

// 加入状态树
stateTree.insert(state_index, 0xabc...xyz)
```

### 关键特点

| 特性 | 值 |
|------|-----|
| **哈希方式** | `hash_decativate_state_leaf()` |
| **使用字段数** | 3 个（pubKey.x, pubKey.y, voiceCreditBalance）|
| **vote_option_tree_root** | 0（填充）|
| **nonce** | 0（填充）|
| **外层哈希** | 固定常量 `DEACTIVATE_CONSTANT` |
| **状态索引** | `state_index = num_sign_ups`（从0开始）|
| **可停用** | ✅ 是 |

### 注意事项

1. **初始状态**: 
   - `vote_option_tree_root = 0`: 还没有投票
   - `nonce = 0`: 还没有发送消息

2. **可停用标记**:
   - 使用 `hash_decativate_state_leaf()` 标记该账户"可被停用"
   - 协调员可以通过 ProcessDeactivate 电路停用该账户

3. **注册检查**:
   - 白名单模式: 检查 `WHITELIST`
   - Oracle 模式: 检查 `ORACLE_WHITELIST` 和签名验证

---

## AddNewKey - 投票期间添加密钥

### 调用时机

- **阶段**: Voting 期间（投票已开始）
- **操作**: 用户在投票期间添加新密钥（可能丢失了旧密钥）

### 合约代码

```rust:1335:1397
// contracts/amaci/src/contract.rs
pub fn execute_add_new_key(
    mut deps: DepsMut,
    env: Env,
    info: MessageInfo,
    pubkey: PubKey,
    nullifier: Uint256,
    d: [Uint256; 4],
    groth16_proof: Groth16ProofType,
) -> Result<Response, ContractError> {
    // 验证投票期间
    // ...
    
    // 准备证明输入
    let mut input: [Uint256; 7] = [...];
    input[0] = load_nodes(...);  // 停用树根
    input[1] = COORDINATORHASH.load(deps.storage)?;
    input[2] = nullifier;
    input[3] = d[0];
    input[4] = d[1];
    input[5] = d[2];
    input[6] = d[3];
    
    // 验证 zk-SNARK 证明
    let input_hash = hash_256_uint256_list(&input) % snark_scalar_field;
    let is_passed = groth16_verify(&pvk, &pof, &[input_hash]);
    
    if !is_passed {
        return Err(ContractError::InvalidProof { 
            step: String::from("AddNewKey") 
        });
    }
    
    let voice_credit_amount = VOICE_CREDIT_AMOUNT.load(deps.storage)?;
    
    // 创建 state leaf
    let state_leaf = StateLeaf {
        pub_key: pubkey.clone(),
        voice_credit_balance: voice_credit_amount,
        vote_option_tree_root: Uint256::from_u128(0),
        nonce: Uint256::from_u128(0),
    }
    .hash_new_key_state_leaf(d);  // ⭐ 使用 hash_new_key_state_leaf(d)
    
    let state_index = num_sign_ups;
    state_enqueue(&mut deps, state_leaf)?;
    num_sign_ups += Uint256::from_u128(1u128);
    
    NUMSIGNUPS.save(deps.storage, &num_sign_ups)?;
    SIGNUPED.save(deps.storage, &(...), &state_index)?;
    
    Ok(Response::new()
        .add_attribute("action", "add_new_key")
        .add_attribute("state_idx", state_index.to_string())
        .add_attribute("d0", d[0].to_string())
        .add_attribute("d1", d[1].to_string())
        .add_attribute("d2", d[2].to_string())
        .add_attribute("d3", d[3].to_string()))
}
```

### 电路验证 (AddNewKey.circom)

```circom:14:115
template AddNewKey(stateTreeDepth) {
    signal input inputHash;
    signal input coordPubKey[2];
    signal input deactivateRoot;
    signal input deactivateIndex;
    signal input deactivateLeaf;
    signal input c1[2];
    signal input c2[2];
    signal input randomVal;
    signal input d1[2];
    signal input d2[2];
    signal input deactivateLeafPathElements[deactivateTreeDepth][TREE_ARITY - 1];
    signal input nullifier;
    signal input oldPrivateKey;
    
    // 1. 验证 nullifier = hash(oldPrivateKey, 'NULLIFIER')
    component nullifierHasher = HashLeftRight(); 
    nullifierHasher.left <== oldPrivateKey;
    nullifierHasher.right <== 1444992409218394441042; // 'NULLIFIER'
    nullifierHasher.hash === nullifier;
    
    // 2. 计算 ECDH 共享密钥
    component ecdh = Ecdh();
    ecdh.privKey <== oldPrivateKey;
    ecdh.pubKey[0] <== coordPubKey[0];
    ecdh.pubKey[1] <== coordPubKey[1];
    
    component sharedKeyHasher = HashLeftRight();
    sharedKeyHasher.left <== ecdh.sharedKey[0];
    sharedKeyHasher.right <== ecdh.sharedKey[1];
    
    // 3. 验证停用叶子
    component deactivateLeafHasher = Hasher5();
    deactivateLeafHasher.in[0] <== c1[0];
    deactivateLeafHasher.in[1] <== c1[1];
    deactivateLeafHasher.in[2] <== c2[0];
    deactivateLeafHasher.in[3] <== c2[1];
    deactivateLeafHasher.in[4] <== sharedKeyHasher.hash;
    
    deactivateLeafHasher.hash === deactivateLeaf;
    
    // 4. 验证停用叶子存在于停用树中
    component deactivateQie = QuinLeafExists(deactivateTreeDepth);
    deactivateQie.leaf <== deactivateLeaf;
    deactivateQie.root <== deactivateRoot;
    // ... 验证 Merkle proof
    
    // 5. ElGamal 重随机化
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
    
    // 6. 验证公共输入哈希
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
}
```

### 哈希计算步骤

#### 步骤1: 准备 StateLeaf 数据

```javascript
StateLeaf = {
  pub_key: {
    x: new_pubkey_x,  // 新公钥
    y: new_pubkey_y
  },
  voice_credit_balance: initial_credits,  // 例如: 1000
  vote_option_tree_root: 0,               // 初始值
  nonce: 0                                // 初始值
}
```

#### 步骤2: 生成 ElGamal 重随机化参数 d

在电路中，通过 ElGamalReRandomize 生成 `d`:

```circom
// ElGamalReRandomize 组件
// 输入: (C1, C2) - 旧的 ElGamal 密文
//      randomVal - 新的随机值
//      pubKey - 协调员公钥
// 输出: (D1, D2) - 重随机化后的密文

D1 = C1 + randomVal * G
D2 = C2 + randomVal * pubKey

// 展开为坐标
d[0] = D1.x
d[1] = D1.y
d[2] = D2.x
d[3] = D2.y
```

#### 步骤3: 计算 hash_new_key_state_leaf(d)

```javascript
// 第一步: hash5 前 3 个字段
plaintext = [
  new_pubkey_x,
  new_pubkey_y,
  initial_credits,
  0,  // vote_option_tree_root
  0   // nonce
]
inner_hash = hash5(plaintext)

// 第二步: hash5 参数 d
d_hash = hash5([
  d[0],  // D1.x
  d[1],  // D1.y
  d[2],  // D2.x
  d[3],  // D2.y
  0      // 填充
])

// 第三步: hash2 组合
state_leaf_hash = hash2([
  inner_hash,
  d_hash
])
```

### 完整示例

```javascript
// 输入
old_private_key = 0x111...aaa
new_pubkey = {
  x: 0x222...bbb,
  y: 0x333...ccc
}
initial_credits = 1000

// 1. 计算 nullifier
nullifier = hash2([old_private_key, 'NULLIFIER'])
// 例如: 0x444...ddd

// 2. 计算 ECDH 共享密钥
shared_key = ECDH(old_private_key, coord_pubkey)
shared_key_hash = hash2([shared_key.x, shared_key.y])

// 3. 从停用树中获取旧账户的加密状态
deactivate_leaf = hash5([C1.x, C1.y, C2.x, C2.y, shared_key_hash])

// 4. ElGamal 重随机化
random_val = random_scalar()
D1 = C1 + random_val * G
D2 = C2 + random_val * coord_pubkey

d = [D1.x, D1.y, D2.x, D2.y]

// 5. 计算 state leaf hash
plaintext = [
  0x222...bbb,  // new_pubkey.x
  0x333...ccc,  // new_pubkey.y
  1000,         // voice_credit_balance
  0,            // vote_option_tree_root (填充0)
  0             // nonce (填充0)
]

inner_hash = hash5(plaintext)
// 例如: 0x555...eee

d_hash = hash5([d[0], d[1], d[2], d[3], 0])
// 例如: 0x666...fff

state_leaf_hash = hash2([
  0x555...eee,
  0x666...fff
])
// 最终哈希: 0x777...ggg

// 6. 加入状态树
stateTree.insert(state_index, 0x777...ggg)
```

### 关键特点

| 特性 | 值 |
|------|-----|
| **哈希方式** | `hash_new_key_state_leaf(d)` |
| **使用字段数** | 3 个（pubKey.x, pubKey.y, voiceCreditBalance）|
| **vote_option_tree_root** | 0（填充）|
| **nonce** | 0（填充）|
| **外层哈希** | `hash5([d[0], d[1], d[2], d[3], 0])` |
| **需要证明** | ✅ 是（zk-SNARK） |
| **证明内容** | 1. 拥有旧私钥<br>2. 旧账户在停用树中<br>3. 正确重随机化 |
| **可停用** | ❌ 否（因为是新密钥） |

### ElGamal 重随机化详解

#### 为什么需要重随机化？

1. **更新加密状态**: 旧密钥对应的 ElGamal 密文 (C1, C2) 需要更新
2. **保持激活状态**: 新密钥继承旧密钥的激活状态
3. **防止关联**: 重随机化后外部无法关联新旧密钥

#### 重随机化过程

```
旧密文: (C1, C2)
新随机值: r

新密文: 
D1 = C1 + r * G
D2 = C2 + r * PubKey_coord

性质:
- Decrypt(D1, D2) = Decrypt(C1, C2)  // 解密结果相同
- (D1, D2) 看起来像全新的密文       // 无法关联
```

### 注意事项

1. **必须提供证明**:
   - 证明拥有旧私钥（通过 nullifier）
   - 证明旧账户存在于停用树中
   - 证明正确执行了 ElGamal 重随机化

2. **投票期间限制**:
   - 只能在 Voting 期间调用
   - 不能在 Pending、Processing、Tallying、Ended 期间调用

3. **状态继承**:
   - 新密钥继承旧密钥的语音信用余额
   - 新密钥继承旧密钥的激活状态

4. **参数 d 的重要性**:
   - `d` 是公开的（在合约中作为事件发出）
   - `d` 用于状态树哈希计算
   - `d` 证明了正确的重随机化

---

## PreAddNewKey - 投票前添加密钥

### 调用时机

- **阶段**: Voting 期间（投票已开始）
- **操作**: 用户在投票期间添加新密钥，但使用**投票前的停用树根**

### 合约代码

```rust:1470:1530
// contracts/amaci/src/contract.rs
pub fn execute_pre_add_new_key(
    mut deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    pubkey: PubKey,
    nullifier: Uint256,
    d: [Uint256; 4],
    groth16_proof: Groth16ProofType,
) -> Result<Response, ContractError> {
    // 验证投票期间
    // ...
    
    // 准备证明输入
    let mut input: [Uint256; 7] = [...];
    input[0] = load_nodes(...);  // 停用树根
    
    // ⭐ 关键差异：使用 PRE_DEACTIVATE_ROOT 或 PRE_DEACTIVATE_COORDINATOR_HASH
    input[1] = match PRE_DEACTIVATE_COORDINATOR_HASH.may_load(deps.storage)? {
        Some(hash) => hash,
        None => COORDINATORHASH.load(deps.storage)?,
    };
    
    input[2] = nullifier;
    input[3] = d[0];
    input[4] = d[1];
    input[5] = d[2];
    input[6] = d[3];
    
    // 验证 zk-SNARK 证明
    let input_hash = hash_256_uint256_list(&input) % snark_scalar_field;
    let is_passed = groth16_verify(&pvk, &pof, &[input_hash]);
    
    if !is_passed {
        return Err(ContractError::InvalidProof { 
            step: String::from("PreAddNewKey") 
        });
    }
    
    let voice_credit_amount = VOICE_CREDIT_AMOUNT.load(deps.storage)?;
    
    // 创建 state leaf
    let state_leaf = StateLeaf {
        pub_key: pubkey.clone(),
        voice_credit_balance: voice_credit_amount,
        vote_option_tree_root: Uint256::from_u128(0),
        nonce: Uint256::from_u128(0),
    }
    .hash_decativate_state_leaf();  // ⭐ 使用 hash_decativate_state_leaf()
    
    let state_index = num_sign_ups;
    state_enqueue(&mut deps, state_leaf)?;
    num_sign_ups += Uint256::from_u128(1u128);
    
    NUMSIGNUPS.save(deps.storage, &num_sign_ups)?;
    SIGNUPED.save(deps.storage, &(...), &state_index)?;
    
    Ok(Response::new()
        .add_attribute("action", "pre_add_new_key")
        .add_attribute("state_idx", state_index.to_string()))
}
```

### 哈希计算步骤

#### 步骤1: 准备 StateLeaf 数据

```javascript
StateLeaf = {
  pub_key: {
    x: new_pubkey_x,
    y: new_pubkey_y
  },
  voice_credit_balance: initial_credits,  // 例如: 1000
  vote_option_tree_root: 0,               // 初始值
  nonce: 0                                // 初始值
}
```

#### 步骤2: 计算 hash_decativate_state_leaf()

```javascript
// 第一步: hash5 前 3 个字段
plaintext = [
  new_pubkey_x,
  new_pubkey_y,
  initial_credits,
  0,  // vote_option_tree_root
  0   // nonce
]
inner_hash = hash5(plaintext)

// 第二步: hash2 与固定常量
DEACTIVATE_CONSTANT = 0x2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc

state_leaf_hash = hash2([
  inner_hash,
  DEACTIVATE_CONSTANT
])
```

### 完整示例

```javascript
// 输入（与 AddNewKey 类似）
old_private_key = 0x111...aaa
new_pubkey = {
  x: 0x222...bbb,
  y: 0x333...ccc
}
initial_credits = 1000

// 1. 计算 nullifier（相同）
nullifier = hash2([old_private_key, 'NULLIFIER'])

// 2. 计算 ECDH 共享密钥（相同）
shared_key = ECDH(old_private_key, coord_pubkey)
shared_key_hash = hash2([shared_key.x, shared_key.y])

// 3. 从**投票前的停用树**中获取旧账户的加密状态
// ⭐ 关键差异：使用 PRE_DEACTIVATE_ROOT
deactivate_root = PRE_DEACTIVATE_ROOT  // 投票前的停用树根

// 4. ElGamal 重随机化（相同）
random_val = random_scalar()
D1 = C1 + random_val * G
D2 = C2 + random_val * coord_pubkey

d = [D1.x, D1.y, D2.x, D2.y]

// 5. 计算 state leaf hash
// ⭐ 关键差异：使用 hash_decativate_state_leaf() 而不是 hash_new_key_state_leaf(d)
plaintext = [
  0x222...bbb,  // new_pubkey.x
  0x333...ccc,  // new_pubkey.y
  1000,         // voice_credit_balance
  0,            // vote_option_tree_root (填充0)
  0             // nonce (填充0)
]

inner_hash = hash5(plaintext)

state_leaf_hash = hash2([
  inner_hash,
  0x2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc  // 固定常量
])
// 最终哈希: 0x888...hhh

// 6. 加入状态树
stateTree.insert(state_index, 0x888...hhh)
```

### 与 AddNewKey 的关键区别

| 特性 | AddNewKey | PreAddNewKey |
|------|-----------|--------------|
| **停用树根** | 当前停用树根 | **投票前的停用树根** |
| **协调员哈希** | `COORDINATORHASH` | `PRE_DEACTIVATE_COORDINATOR_HASH` 或 `COORDINATORHASH` |
| **哈希方式** | `hash_new_key_state_leaf(d)` | **`hash_decativate_state_leaf()`** |
| **外层哈希** | `hash5([d[0], d[1], d[2], d[3], 0])` | **固定常量 `DEACTIVATE_CONSTANT`** |
| **可停用** | ❌ 否 | **✅ 是** |

### 关键特点

| 特性 | 值 |
|------|-----|
| **哈希方式** | `hash_decativate_state_leaf()` |
| **使用字段数** | 3 个（pubKey.x, pubKey.y, voiceCreditBalance）|
| **vote_option_tree_root** | 0（填充）|
| **nonce** | 0（填充）|
| **外层哈希** | 固定常量 `DEACTIVATE_CONSTANT` |
| **需要证明** | ✅ 是（zk-SNARK） |
| **证明内容** | 1. 拥有旧私钥<br>2. 旧账户在**投票前的停用树**中<br>3. 正确重随机化 |
| **可停用** | ✅ 是 |
| **停用树** | **投票前的停用树根** |

### 为什么需要 PreAddNewKey？

#### 问题场景

在投票开始后，协调员会开始处理停用消息（ProcessDeactivate）：

```
时间线:
T0: 投票开始 (Voting Period Start)
    停用树根 = Root_0
    
T1: 协调员处理停用消息
    停用树根 = Root_1 (包含新的停用账户)
    
T2: 用户 Alice 想添加新密钥
    但 Alice 的旧密钥是在 T0 时注册的
    停用树中 Alice 的位置基于 Root_0
```

#### 两种解决方案

**方案1: AddNewKey**
- 使用**当前停用树根** (Root_1)
- 要求旧密钥在当前停用树中存在
- 问题: 如果 Alice 的旧密钥在 Root_0 但不在 Root_1，则无法证明

**方案2: PreAddNewKey**
- 使用**投票前的停用树根** (Root_0)
- 要求旧密钥在投票开始时的停用树中存在
- 解决: Alice 可以使用 Root_0 来证明旧密钥所有权

#### 实际应用

```javascript
// 场景1: 用户在投票期间注册了，但需要换密钥
signup_time = T0.5  // 投票开始后
add_key_time = T2
→ 使用 AddNewKey（旧密钥在当前停用树中）

// 场景2: 用户在投票前注册，投票期间换密钥
signup_time = T_pre  // 投票开始前
add_key_time = T2
deactivate_processing_time = T1  // 停用树已更新
→ 使用 PreAddNewKey（旧密钥在投票前的停用树中）
```

### 注意事项

1. **停用树的选择**:
   - `PRE_DEACTIVATE_ROOT`: 投票开始时的停用树根
   - 如果用户的旧密钥是在投票前注册的，必须使用 `PRE_DEACTIVATE_ROOT`

2. **哈希方式的选择**:
   - PreAddNewKey 使用 `hash_decativate_state_leaf()`
   - 新密钥标记为"可停用"状态
   - 新密钥可以被协调员停用

3. **证明验证**:
   - 证明必须基于投票前的停用树根
   - 协调员哈希可能使用 `PRE_DEACTIVATE_COORDINATOR_HASH`

---

## 对比总结

### 三种操作对比表

| 特性 | Signup | AddNewKey | PreAddNewKey |
|------|--------|-----------|--------------|
| **调用阶段** | Pending 期间 | Voting 期间 | Voting 期间 |
| **哈希函数** | `hash_decativate_state_leaf()` | `hash_new_key_state_leaf(d)` | `hash_decativate_state_leaf()` |
| **外层哈希** | 固定常量 | `hash5([d[0], d[1], d[2], d[3], 0])` | 固定常量 |
| **使用字段** | 3 个 | 3 个 | 3 个 |
| **需要证明** | ❌ 否 | ✅ 是 | ✅ 是 |
| **证明旧密钥** | - | ✅ 是 | ✅ 是 |
| **停用树根** | - | 当前树根 | 投票前树根 |
| **可停用** | ✅ 是 | ❌ 否 | ✅ 是 |
| **用途** | 首次注册 | 投票期间换密钥（新账户） | 投票期间换密钥（旧账户） |

### 哈希计算对比

#### Signup 和 PreAddNewKey（相同哈希）

```javascript
plaintext = [pubKey.x, pubKey.y, voiceCreditBalance, 0, 0]
inner_hash = hash5(plaintext)
state_leaf_hash = hash2([
  inner_hash,
  0x2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc
])
```

#### AddNewKey（不同哈希）

```javascript
plaintext = [pubKey.x, pubKey.y, voiceCreditBalance, 0, 0]
inner_hash = hash5(plaintext)
d_hash = hash5([d[0], d[1], d[2], d[3], 0])
state_leaf_hash = hash2([
  inner_hash,
  d_hash  // ⭐ 使用 d 参数而不是固定常量
])
```

### 决策树

```
用户需要注册/添加密钥
    │
    ├─ 是否在投票期间？
    │   │
    │   ├─ 否 (Pending 期间)
    │   │   → 使用 Signup
    │   │       • hash_decativate_state_leaf()
    │   │       • 不需要证明
    │   │       • 可停用
    │   │
    │   └─ 是 (Voting 期间)
    │       │
    │       └─ 旧密钥何时注册？
    │           │
    │           ├─ 投票期间注册
    │           │   → 使用 AddNewKey
    │           │       • hash_new_key_state_leaf(d)
    │           │       • 需要证明
    │           │       • 使用当前停用树根
    │           │       • 不可停用
    │           │
    │           └─ 投票前注册
    │               → 使用 PreAddNewKey
    │                   • hash_decativate_state_leaf()
    │                   • 需要证明
    │                   • 使用投票前停用树根
    │                   • 可停用
```

---

## 技术细节

### 为什么只使用 3 个字段？

在所有三种哈希方式中，都只使用了 StateLeaf 的前 3 个字段：
- `pub_key.x`
- `pub_key.y`
- `voice_credit_balance`

而 `vote_option_tree_root` 和 `nonce` 的位置用 0 填充。

#### 原因分析

1. **初始状态**:
   - 注册时，用户还没有投票
   - `vote_option_tree_root = 0`（没有投票记录）
   - `nonce = 0`（没有发送消息）

2. **简化证明**:
   - 减少需要验证的字段
   - 降低电路复杂度
   - 提高证明生成速度

3. **后续更新**:
   - 投票后，通过 ProcessMessages 更新这些字段
   - ProcessMessages 使用完整的 `hash_state_leaf()`（5个字段）

### 固定常量的含义

```
DEACTIVATE_CONSTANT = 0x2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc
```

这个常量用于标识"可停用"状态的 state leaf。

#### 可能的生成方式

```javascript
// 推测：可能是某个字符串的哈希
DEACTIVATE_CONSTANT = hash("DEACTIVATE_STATE_LEAF")
// 或
DEACTIVATE_CONSTANT = hash("AMACI_DEACTIVATE_MARKER")
```

#### 作用

1. **标识可停用账户**: 只有使用这个常量哈希的 state leaf 可以被停用
2. **防止混淆**: 与其他类型的 state leaf 区分开
3. **统一格式**: Signup 和 PreAddNewKey 使用相同的格式

### ElGamal 加密与重随机化

#### ElGamal 加密基础

```
公钥: PubKey = privKey * G
加密: 
  选择随机数 r
  C1 = r * G
  C2 = M * G + r * PubKey
  
解密:
  M * G = C2 - privKey * C1
```

#### 重随机化

```
旧密文: (C1, C2)
新随机数: r'

新密文:
  D1 = C1 + r' * G
  D2 = C2 + r' * PubKey

性质:
  Decrypt(D1, D2) = Decrypt(C1, C2)
  但 (D1, D2) 看起来像全新的密文
```

#### 在 AMACI 中的应用

```
1. Signup 时: 
   生成初始 ElGamal 密文 (C1, C2)
   加密 isActive = 0 (激活状态)

2. AddNewKey / PreAddNewKey 时:
   重随机化 (C1, C2) → (D1, D2)
   保持 isActive 不变
   但外部无法关联新旧密文
```

### 状态树更新流程

#### Signup 流程

```
1. 验证用户资格（白名单或 Oracle）
   ↓
2. 创建 StateLeaf
   StateLeaf = {
     pub_key: user_pubkey,
     voice_credit_balance: initial_credits,
     vote_option_tree_root: 0,
     nonce: 0
   }
   ↓
3. 计算哈希
   hash = hash_decativate_state_leaf()
   ↓
4. 加入状态树
   stateTree.insert(num_sign_ups, hash)
   ↓
5. 更新计数器
   num_sign_ups += 1
```

#### AddNewKey 流程

```
1. 生成 zk-SNARK 证明
   证明内容:
   - 拥有旧私钥 (nullifier)
   - 旧账户在当前停用树中
   - 正确执行 ElGamal 重随机化
   ↓
2. 验证证明
   验证 input_hash 与证明匹配
   ↓
3. 创建 StateLeaf
   StateLeaf = {
     pub_key: new_pubkey,
     voice_credit_balance: initial_credits,
     vote_option_tree_root: 0,
     nonce: 0
   }
   ↓
4. 计算哈希
   hash = hash_new_key_state_leaf(d)
   ↓
5. 加入状态树
   stateTree.insert(num_sign_ups, hash)
   ↓
6. 更新计数器
   num_sign_ups += 1
```

#### PreAddNewKey 流程

```
1. 生成 zk-SNARK 证明
   证明内容:
   - 拥有旧私钥 (nullifier)
   - 旧账户在**投票前的停用树**中
   - 正确执行 ElGamal 重随机化
   ↓
2. 验证证明
   使用 PRE_DEACTIVATE_ROOT 和 PRE_DEACTIVATE_COORDINATOR_HASH
   ↓
3. 创建 StateLeaf
   StateLeaf = {
     pub_key: new_pubkey,
     voice_credit_balance: initial_credits,
     vote_option_tree_root: 0,
     nonce: 0
   }
   ↓
4. 计算哈希
   hash = hash_decativate_state_leaf()
   ↓
5. 加入状态树
   stateTree.insert(num_sign_ups, hash)
   ↓
6. 更新计数器
   num_sign_ups += 1
```

---

## 实际应用场景

### 场景1: 正常注册流程

**时间线**:
```
T0: Round 创建 (Pending 期间)
T1: Alice 注册 (Signup)
T2: 投票开始 (Voting 期间)
T3: Alice 投票
T4: 投票结束
```

**操作**:
```javascript
// T1: Alice 注册
await signup({
  pubkey: alice_pubkey,
  signature: oracle_signature  // 如果是 Oracle 模式
})

// 结果:
// state_index = 0
// state_leaf_hash = hash_decativate_state_leaf()
// 可停用: 是
```

---

### 场景2: 投票期间添加新密钥（新账户）

**时间线**:
```
T0: Round 创建
T1: 投票开始
T2: Alice 在投票期间注册 (Signup)
T3: Alice 丢失私钥，需要换密钥
T4: Alice 使用 AddNewKey 添加新密钥
```

**操作**:
```javascript
// T2: Alice 注册
await signup({ pubkey: alice_pubkey_1 })
// state_index = 0

// T4: Alice 换密钥
// 1. 生成证明
const proof = await generateAddNewKeyProof({
  old_private_key: alice_privkey_1,
  new_pubkey: alice_pubkey_2,
  deactivate_root: current_deactivate_root,  // 当前停用树根
  coord_pubkey: coordinator_pubkey
})

// 2. 调用合约
await addNewKey({
  pubkey: alice_pubkey_2,
  nullifier: proof.nullifier,
  d: proof.d,  // [D1.x, D1.y, D2.x, D2.y]
  groth16_proof: proof.proof
})

// 结果:
// state_index = 1 (新的索引)
// state_leaf_hash = hash_new_key_state_leaf(d)
// 可停用: 否
```

---

### 场景3: 投票期间添加新密钥（旧账户）

**时间线**:
```
T0: Round 创建
T1: Alice 注册 (Signup)
T2: 投票开始
T3: 协调员处理停用消息 (停用树更新)
T4: Alice 丢失私钥，需要换密钥
T5: Alice 使用 PreAddNewKey 添加新密钥
```

**操作**:
```javascript
// T1: Alice 注册（投票前）
await signup({ pubkey: alice_pubkey_1 })
// state_index = 0
// 停用树根 = Root_0

// T3: 停用树更新
// 停用树根 = Root_1

// T5: Alice 换密钥
// 1. 生成证明（使用投票前的停用树根）
const proof = await generatePreAddNewKeyProof({
  old_private_key: alice_privkey_1,
  new_pubkey: alice_pubkey_2,
  deactivate_root: PRE_DEACTIVATE_ROOT,  // 投票前的停用树根 (Root_0)
  coord_pubkey: coordinator_pubkey
})

// 2. 调用合约
await preAddNewKey({
  pubkey: alice_pubkey_2,
  nullifier: proof.nullifier,
  d: proof.d,
  groth16_proof: proof.proof
})

// 结果:
// state_index = 1 (新的索引)
// state_leaf_hash = hash_decativate_state_leaf()
// 可停用: 是
```

---

### 场景4: 停用账户后添加新密钥

**时间线**:
```
T0: Alice 注册
T1: 投票开始
T2: Alice 被协调员停用（ProcessDeactivate）
T3: Alice 需要添加新密钥继续参与
```

**操作**:
```javascript
// T0: Alice 注册
await signup({ pubkey: alice_pubkey_1 })

// T2: 协调员停用 Alice
// 停用树中添加 Alice 的停用记录

// T3: Alice 添加新密钥
// 可以使用 AddNewKey 或 PreAddNewKey
// 新密钥将创建新的 state leaf（新的 state_index）
// 旧的 state leaf 保持停用状态

await preAddNewKey({
  pubkey: alice_pubkey_2,
  nullifier: hash([alice_privkey_1, 'NULLIFIER']),
  d: rerandomize_result.d,
  groth16_proof: proof
})

// 结果:
// 旧账户: state_index = 0, 已停用
// 新账户: state_index = 1, 激活
```

---

### 场景5: 多次换密钥

**时间线**:
```
T0: Alice 注册 (pubkey_1)
T1: 投票开始
T2: Alice 换密钥 (pubkey_1 → pubkey_2)
T3: Alice 再次换密钥 (pubkey_2 → pubkey_3)
```

**操作**:
```javascript
// T0: 注册
await signup({ pubkey: pubkey_1 })
// state_index = 0

// T2: 第一次换密钥
await preAddNewKey({
  pubkey: pubkey_2,
  nullifier: hash([privkey_1, 'NULLIFIER']),
  d: d_1,
  groth16_proof: proof_1
})
// state_index = 1

// T3: 第二次换密钥
// 注意：需要使用 privkey_2 来生成证明
await addNewKey({
  pubkey: pubkey_3,
  nullifier: hash([privkey_2, 'NULLIFIER']),
  d: d_2,
  groth16_proof: proof_2
})
// state_index = 2

// 结果:
// state_index = 0: pubkey_1, 可停用
// state_index = 1: pubkey_2, 可停用
// state_index = 2: pubkey_3, 不可停用
```

---

## 常见问题 (FAQ)

### Q1: 为什么 Signup 和 PreAddNewKey 使用相同的哈希函数？

**A**: 因为它们的目的相同：创建一个**可停用**的 state leaf。

- Signup: 用户首次注册，创建可停用账户
- PreAddNewKey: 用户换密钥，新密钥继承旧密钥的可停用性质

### Q2: AddNewKey 为什么不可停用？

**A**: 因为 AddNewKey 使用了不同的哈希函数 `hash_new_key_state_leaf(d)`，其中 `d` 是动态生成的 ElGamal 重随机化参数，无法匹配固定的 `DEACTIVATE_CONSTANT`。

这样设计的原因：
- 防止简单的关联攻击
- 确保新密钥的独立性
- 增加隐私保护

### Q3: 什么时候使用 AddNewKey vs PreAddNewKey？

**A**: 根据**旧密钥的注册时间**选择：

| 旧密钥注册时间 | 使用函数 | 停用树根 |
|--------------|---------|---------|
| 投票期间注册 | AddNewKey | 当前停用树根 |
| 投票前注册 | PreAddNewKey | 投票前停用树根 |

**原因**: 
- 投票开始后，协调员会处理停用消息，停用树会更新
- 如果旧密钥在投票前注册，它的位置在旧的停用树中
- 如果旧密钥在投票期间注册，它的位置在新的停用树中

### Q4: 为什么 vote_option_tree_root 和 nonce 用 0 填充？

**A**: 因为在注册/添加密钥时：
- 用户还没有投票，所以 `vote_option_tree_root = 0`
- 用户还没有发送消息，所以 `nonce = 0`

这些字段会在后续的投票过程中通过 ProcessMessages 更新。

### Q5: 参数 d 包含什么信息？

**A**: `d` 是 ElGamal 重随机化的结果，包含：
- `d[0]`: D1.x (重随机化后的 C1 的 X 坐标)
- `d[1]`: D1.y (重随机化后的 C1 的 Y 坐标)
- `d[2]`: D2.x (重随机化后的 C2 的 X 坐标)
- `d[3]`: D2.y (重随机化后的 C2 的 Y 坐标)

其中 `(D1, D2) = rerandomize((C1, C2), randomVal)`

### Q6: 如何验证 state leaf 的类型？

**A**: 通过哈希值的结构：

```javascript
// 方法1: 检查是否包含 DEACTIVATE_CONSTANT
function isDeactivatable(state_leaf_hash) {
  // 如果是 hash_decativate_state_leaf() 的结果
  // 则外层哈希使用了 DEACTIVATE_CONSTANT
  return check_hash2_structure(state_leaf_hash, DEACTIVATE_CONSTANT)
}

// 方法2: 检查是否包含动态 d 参数
function isNewKey(state_leaf_hash, d) {
  // 如果是 hash_new_key_state_leaf(d) 的结果
  // 则外层哈希使用了 hash5([d[0], d[1], d[2], d[3], 0])
  d_hash = hash5([d[0], d[1], d[2], d[3], 0])
  return check_hash2_structure(state_leaf_hash, d_hash)
}
```

### Q7: 可以在 ProcessMessages 之后添加新密钥吗？

**A**: 不可以。AddNewKey 和 PreAddNewKey 只能在 **Voting 期间**调用，不能在 Processing、Tallying、Ended 期间调用。

**原因**:
- ProcessMessages 开始后，状态树被"冻结"
- 不再接受新的注册或密钥添加
- 保证投票过程的完整性

### Q8: 停用账户后还能投票吗？

**A**: 不能。停用账户的 ElGamal 密文会被更新为表示"停用"状态，在 StateLeafTransformer 电路中会被检测并拒绝。

```circom
// StateLeafTransformer.circom
component decryptIsActive = ElGamalDecrypt();
// ...
// decryptIsActive.isOdd == 0: 激活
// decryptIsActive.isOdd == 1: 停用

component valid = IsEqual();
valid.in[1] <== 1 - decryptIsActive.isOdd + ...
// 如果 isOdd == 1，则 valid.in[1] 减少 1，导致验证失败
```

---

## 附录

### A. 哈希函数定义

#### hash2

```javascript
function hash2([left, right]) {
  return poseidon([left, right])
}
```

#### hash5

```javascript
function hash5([a, b, c, d, e]) {
  return poseidon([a, b, c, d, e])
}
```

### B. 常量值

```javascript
// DEACTIVATE_CONSTANT
const DEACTIVATE_CONSTANT = 
  0x2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc

// NULLIFIER 字符串
const NULLIFIER_STRING = 1444992409218394441042n  // 'NULLIFIER'

// SNARK Scalar Field
const SNARK_SCALAR_FIELD = 
  0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001
```

### C. 数据结构

```rust
// StateLeaf
pub struct StateLeaf {
    pub pub_key: PubKey,
    pub voice_credit_balance: Uint256,
    pub vote_option_tree_root: Uint256,
    pub nonce: Uint256,
}

// PubKey
pub struct PubKey {
    pub x: Uint256,
    pub y: Uint256,
}
```

### D. 相关电路

- `AddNewKey.circom`: AddNewKey 证明电路
- `ProcessDeactivate.circom`: 停用账户处理电路
- `StateLeafTransformer.circom`: 状态转换电路
- `ProcessMessages.circom`: 投票消息处理电路

---

## 总结

### 核心要点

1. **三种哈希方式**:
   - `hash_state_leaf()`: 标准哈希（5个字段）
   - `hash_decativate_state_leaf()`: 停用哈希（3个字段 + 固定常量）
   - `hash_new_key_state_leaf(d)`: 新密钥哈希（3个字段 + d参数）

2. **三种操作**:
   - Signup: 首次注册，使用 `hash_decativate_state_leaf()`
   - AddNewKey: 投票期间换密钥（新账户），使用 `hash_new_key_state_leaf(d)`
   - PreAddNewKey: 投票期间换密钥（旧账户），使用 `hash_decativate_state_leaf()`

3. **可停用性**:
   - Signup 和 PreAddNewKey 创建的账户**可停用**
   - AddNewKey 创建的账户**不可停用**

4. **选择依据**:
   - 根据旧密钥的注册时间选择 AddNewKey 或 PreAddNewKey
   - AddNewKey: 旧密钥在投票期间注册
   - PreAddNewKey: 旧密钥在投票前注册

### 快速参考

| 操作 | 阶段 | 哈希函数 | 可停用 | 需要证明 |
|------|------|---------|-------|---------|
| Signup | Pending | `hash_decativate_state_leaf()` | ✅ | ❌ |
| AddNewKey | Voting | `hash_new_key_state_leaf(d)` | ❌ | ✅ |
| PreAddNewKey | Voting | `hash_decativate_state_leaf()` | ✅ | ✅ |

---

**文档版本**: v1.0  
**最后更新**: 2025-12-06  
**作者**: AMACI Development Team
