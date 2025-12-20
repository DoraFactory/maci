# AMACI Deactivate/Active 状态检测机制详解

## 📋 目录

- [1. 概述](#1-概述)
- [2. 状态编码机制](#2-状态编码机制)
- [3. SignUp 时的初始化](#3-signup-时的初始化)
- [4. Operator 检测流程](#4-operator-检测流程)
- [5. Deactivate 过程](#5-deactivate-过程)
- [6. 电路验证机制](#6-电路验证机制)
- [7. 完整示例](#7-完整示例)

---

## 1. 概述

AMACI 使用 **ElGamal 加密** 来存储用户的 deactivate/active 状态。这种设计有两个关键特点：

1. **隐私性**：链上只有密文，外部观察者无法知道用户状态
2. **可验证性**：Operator 可以解密并在电路中验证状态

### 核心数据结构

```
State Leaf (AMACI) = [
  pubKey_x,              // [0]
  pubKey_y,              // [1]
  balance,               // [2]
  voTreeRoot,            // [3]
  nonce,                 // [4]
  c1_x,                  // [5] ← ElGamal 密文 c1
  c1_y,                  // [6]
  c2_x,                  // [7] ← ElGamal 密文 c2
  c2_y,                  // [8]
  xIncrement             // [9]
]
```

---

## 2. 状态编码机制

### 2.1 ElGamal 加密原理

```typescript
// 加密函数
function elgamalEncrypt(
  message: bigint,      // 0 = active, 1 = deactivated
  pubKey: PubKey,       // coordinator 公钥
  randomKey: bigint     // 随机数
): { c1: PubKey, c2: PubKey } {
  // c1 = randomKey * G (G 是椭圆曲线基点)
  const c1 = scalarMul(randomKey, G)
  
  // c2 = message * G + randomKey * pubKey
  const c2 = pointAdd(
    scalarMul(message, G),
    scalarMul(randomKey, pubKey)
  )
  
  return { c1, c2 }
}

// 解密函数
function elgamalDecrypt(
  c1: PubKey,
  c2: PubKey,
  privKey: bigint       // coordinator 私钥
): bigint {
  // message * G = c2 - privKey * c1
  const mG = pointSub(c2, scalarMul(privKey, c1))
  
  // 判断奇偶性（Baby Jubjub 曲线特性）
  // 如果 message = 0 → mG = (0, 1) → 偶数
  // 如果 message = 1 → mG ≈ G → 奇数
  return mG.x % 2n  // 0 = active, 1 = deactivated
}
```

### 2.2 状态映射

| 明文 | 含义 | ElGamal 解密结果 | 判断 |
|------|------|------------------|------|
| 0 | Active (可投票) | 偶数 | `isOdd = 0` |
| 1 | Deactivated (已停用) | 奇数 | `isOdd = 1` |

---

## 3. SignUp 时的初始化

### 3.1 预计算的零值哈希

在合约初始化时，预计算了一系列零值哈希：

```rust
// contracts/amaci/src/contract.rs (line 260-263)
let zeros: [Uint256; 8] = [
    Uint256::from_u128(0u128),  // zeros[0] = 0
    uint256_from_hex_string(
        "2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc"
    ),  // zeros[1] = hash5([0,0,0,0,0])
    // ... 其他深度的零值哈希
];
```

计算验证：
```typescript
import { poseidon } from './crypto/hashing'

const hash5_zeros = poseidon([0n, 0n, 0n, 0n, 0n])
console.log(hash5_zeros)
// 输出: 14655542659562014735865511769057053982292279840403315552050801315682099828156n
// 十六进制: 0x2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc
```

### 3.2 SignUp 时的状态叶哈希

```rust
// contracts/amaci/src/state.rs (line 106-118)
pub fn hash_decativate_state_leaf(&self) -> Uint256 {
    let mut plaintext: [Uint256; 5] = [Uint256::from_u128(0); 5];
    
    // 第一层：基础状态字段
    plaintext[0] = self.pub_key.x;
    plaintext[1] = self.pub_key.y;
    plaintext[2] = self.voice_credit_balance;
    plaintext[3] = 0;  // vote_option_tree_root (初始未投票)
    plaintext[4] = 0;  // nonce (初始为0)
    
    return hash2([
        hash5(plaintext),
        // ⬇️ 使用预计算的零值哈希
        // 代表 c1 = [0, 0], c2 = [0, 0], xIncrement = 0
        // 即：encrypt(0, coordPubKey, 0) = Active 状态
        uint256_from_hex_string(
            "2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc"
        ),
    ]);
}
```

**关键理解：**
- SignUp 时，c1 和 c2 都初始化为 [0, 0]
- 这代表加密后的 "Active" 状态（message = 0）
- 使用预计算哈希值是为了 **节省链上计算成本**

### 3.3 为什么不直接加密？

```
方案 A (AMACI 实际使用):
  signup → 存储 [0, 0, 0, 0] → 使用预计算哈希
  优点：链上无需 ElGamal 加密，节省 gas
  缺点：所有用户的初始 c1/c2 都相同（但仍然安全）

方案 B (理论方案):
  signup → elgamalEncrypt(0, coordPubKey, randomKey) → 存储 [c1_x, c1_y, c2_x, c2_y]
  优点：每个用户的密文都不同（更强隐私）
  缺点：链上需要椭圆曲线运算，gas 消耗高

AMACI 选择方案 A，因为：
1. 初始状态都是 Active，相同密文不泄露额外信息
2. Deactivate 时会生成真正的加密密文（带随机数）
3. 大幅降低 signup 的 gas 成本
```

---

## 4. Operator 检测流程

### 4.1 完整检测架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Operator 检测系统                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1. 链下状态管理 (Off-chain State)                    │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │                                                       │  │
│  │  stateLeaves: Map<number, StateLeaf>                 │  │
│  │  ├─ StateLeaf {                                      │  │
│  │  │    pubKey: [x, y]                                 │  │
│  │  │    balance: bigint                                │  │
│  │  │    voTree: Tree                                   │  │
│  │  │    nonce: bigint                                  │  │
│  │  │    voted: boolean                                 │  │
│  │  │    d1: [x, y]  ← 存储 c1 的副本                  │  │
│  │  │    d2: [x, y]  ← 存储 c2 的副本                  │  │
│  │  └─ }                                                │  │
│  │                                                       │  │
│  │  activeStateTree: Tree                               │  │
│  │  └─ 每个叶子: 0 (active) 或 timestamp (inactive)    │  │
│  │                                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 2. 解密检测 (Decryption Detection)                   │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │                                                       │  │
│  │  function checkDeactivateStatus(                     │  │
│  │    stateIdx: number,                                 │  │
│  │    coordPrivKey: bigint                              │  │
│  │  ): 'active' | 'deactivated' {                       │  │
│  │                                                       │  │
│  │    const s = stateLeaves.get(stateIdx)              │  │
│  │                                                       │  │
│  │    // 解密 ElGamal 密文                              │  │
│  │    const deactivate = decrypt(coordPrivKey, {        │  │
│  │      c1: { x: s.d1[0], y: s.d1[1] },                │  │
│  │      c2: { x: s.d2[0], y: s.d2[1] },                │  │
│  │      xIncrement: 0n                                  │  │
│  │    })                                                 │  │
│  │                                                       │  │
│  │    // 判断奇偶性                                     │  │
│  │    if (deactivate % 2n === 1n) {                     │  │
│  │      return 'deactivated'  // 奇数 = 已停用         │  │
│  │    }                                                  │  │
│  │    return 'active'  // 偶数 = 活跃                  │  │
│  │  }                                                    │  │
│  │                                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 3. 快速查找 (Fast Lookup via Active State Tree)     │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │                                                       │  │
│  │  function isActive(stateIdx: number): boolean {      │  │
│  │    const as = activeStateTree.leaf(stateIdx)         │  │
│  │    return as === 0n  // 0 = active, 非0 = inactive  │  │
│  │  }                                                    │  │
│  │                                                       │  │
│  │  优点：                                              │  │
│  │  - O(1) 查询，无需解密                              │  │
│  │  - 适合批量检查                                      │  │
│  │                                                       │  │
│  │  缺点：                                              │  │
│  │  - 不提供隐私保护                                   │  │
│  │  - 只在 processDeactivateMessages 后更新            │  │
│  │                                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 实际代码实现

```typescript
// packages/sdk/src/operator.ts

/**
 * 检查用户是否已被 deactivate
 */
private checkDeactivateCommand(
  cmd: Command | null,
  subStateTreeLength: number
): string | undefined {
  if (!cmd) {
    return 'empty command'
  }
  
  if (cmd.stateIdx >= BigInt(subStateTreeLength)) {
    return 'state leaf index overflow'
  }
  
  const stateIdx = Number(cmd.stateIdx)
  const s = this.stateLeaves.get(stateIdx) || this.emptyState()
  
  // ===== 方法 1: 解密 c1/c2 检查 deactivate 状态 =====
  const deactivate = this.decryptDeactivate({
    c1: { x: s.d1[0], y: s.d1[1] },
    c2: { x: s.d2[0], y: s.d2[1] },
    xIncrement: 0n
  })
  
  // 判断奇偶性
  if (deactivate % 2n === 1n) {
    return 'deactivated'  // 奇数 = 已停用
  }
  
  // 验证签名
  const verified = verifySignature(cmd.msgHash, cmd.signature, s.pubKey)
  if (!verified) {
    return 'signature error'
  }
  
  return undefined  // 验证通过
}

/**
 * 检查投票命令的有效性
 */
private checkCommandNow(
  cmd: Command | null,
  derivePathParams?: DerivePathParams
): string | undefined {
  const signer = this.getSigner(derivePathParams)
  
  if (!cmd) return 'empty command'
  if (cmd.stateIdx > BigInt(this.numSignUps!)) return 'state leaf index overflow'
  if (cmd.voIdx > BigInt(this.maxVoteOptions!)) return 'vote option index overflow'
  
  const stateIdx = Number(cmd.stateIdx)
  const s = this.stateLeaves.get(stateIdx) || this.emptyState()
  
  // ===== 方法 2: 检查 Active State Tree =====
  const as = this.activeStateTree!.leaf(stateIdx)
  if (as !== 0n) {
    return 'inactive'  // 非零值表示 inactive
  }
  
  // ===== 方法 1: 解密检查（双重保护）=====
  const deactivate = decrypt(signer.getFormatedPrivKey(), {
    c1: { x: s.d1[0], y: s.d1[1] },
    c2: { x: s.d2[0], y: s.d2[1] },
    xIncrement: 0n
  })
  
  if (deactivate % 2n === 1n) {
    return 'deactivated'  // 奇数 = 已停用
  }
  
  // ... 其他验证（nonce, signature, balance）
  
  return undefined  // 验证通过
}

/**
 * 辅助函数：解密 deactivate 状态
 */
private decryptDeactivate(
  encrypted: {
    c1: { x: bigint; y: bigint };
    c2: { x: bigint; y: bigint };
    xIncrement: bigint;
  },
  derivePathParams?: DerivePathParams
): bigint {
  const signer = this.getSigner(derivePathParams)
  return decrypt(signer.getFormatedPrivKey(), encrypted)
}
```

### 4.3 检测时机

```typescript
// 1. 处理 Deactivate 消息时
async processDeactivateMessages({...}) {
  for (let i = 0; i < batchSize; i++) {
    const cmd = commands[i]
    
    // 解密当前状态
    const error = this.checkDeactivateCommand(cmd, subStateTreeLength)
    
    if (error === 'deactivated') {
      console.log(`User ${cmd.stateIdx} already deactivated`)
      // 拒绝重复 deactivate
    } else if (!error) {
      // 生成新的加密状态（message = 1）
      const newDeactivate = encryptOdevity(true, coordPubKey, randomKey)
      
      // 更新 Active State Tree
      activeStateTree.updateLeaf(stateIdx, timestamp)
    }
  }
}

// 2. 处理投票消息时
async processMessages({...}) {
  for (let i = batchSize - 1; i >= 0; i--) {
    const cmd = commands[i]
    
    // 检查 1: Active State Tree（快速检查）
    if (activeStateTree.leaf(cmd.stateIdx) !== 0n) {
      console.log(`User ${cmd.stateIdx} is inactive`)
      continue  // 跳过此消息
    }
    
    // 检查 2: 解密 c1/c2（电路会做相同检查）
    const error = this.checkCommandNow(cmd)
    
    if (error === 'deactivated') {
      console.log(`User ${cmd.stateIdx} is deactivated`)
      continue  // 跳过此消息
    }
    
    // 处理有效消息
    // ...
  }
}
```

---

## 5. Deactivate 过程

### 5.1 完整流程

```
┌─────────────────────────────────────────────────────────────┐
│ 阶段 1: 用户注册 (SignUp)                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  State Leaf 初始化:                                          │
│  ├─ c1 = [0, 0]                                             │
│  ├─ c2 = [0, 0]                                             │
│  └─ hash = hash2(                                           │
│        hash5([pubKey, balance, 0, 0]),                      │
│        hash5([0, 0, 0, 0, 0])  ← 预计算值                  │
│      )                                                       │
│                                                              │
│  解密结果: 0 (偶数) → Active                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 阶段 2: 用户投票 (多次)                                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Operator 验证:                                              │
│  1. decrypt(c1, c2, coordPrivKey) = 0 → Active ✓           │
│  2. activeStateTree.leaf(stateIdx) = 0 → Active ✓          │
│  3. 其他验证（签名、余额等）✓                               │
│                                                              │
│  → 投票成功                                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 阶段 3: 用户发起 Deactivate                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  用户发送特殊消息:                                           │
│  message = encrypt({                                         │
│    stateIdx: userIdx,                                       │
│    voIdx: 0,           ← 特殊标记                           │
│    newVotes: 0,        ← 特殊标记                           │
│    newPubKey: [0, 0],  ← 最后一条命令标记                   │
│    nonce: nonce + 1,                                        │
│    signature                                                │
│  })                                                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 阶段 4: Operator 处理 Deactivate 消息                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  processDeactivateMessages():                               │
│                                                              │
│  For each deactivate message:                               │
│    1. 解密并验证                                            │
│       cmd = decrypt(message, coordPrivKey)                  │
│       error = checkDeactivateCommand(cmd)                   │
│                                                              │
│    2. 检查当前状态                                          │
│       currentDeactivate = decrypt(                          │
│         coordPrivKey,                                       │
│         { c1: s.d1, c2: s.d2, xIncrement: 0 }              │
│       )                                                      │
│       if (currentDeactivate % 2 === 1) {                    │
│         error = 'already deactivated'                       │
│       }                                                      │
│                                                              │
│    3. 生成新的加密状态                                      │
│       randomKey = genStaticRandomKey(                       │
│         coordPrivKey,                                       │
│         salt = 20040n,                                      │
│         index = timestamp                                   │
│       )                                                      │
│                                                              │
│       newDeactivate = encryptOdevity(                       │
│         !error,        // true = 已停用                     │
│         coordPubKey,                                        │
│         randomKey                                           │
│       )                                                      │
│       // 结果: c1' ≠ [0,0], c2' ≠ [0,0]                    │
│       // 解密: 1 (奇数) → Deactivated                      │
│                                                              │
│    4. 更新 Active State Tree                                │
│       if (!error) {                                         │
│         activeStateTree.updateLeaf(                         │
│           stateIdx,                                         │
│           timestamp  // 非零值 = inactive                  │
│         )                                                    │
│       }                                                      │
│                                                              │
│    5. 更新 Deactivate Tree (用于重新激活)                  │
│       dLeaf = [                                             │
│         newDeactivate.c1[0],                                │
│         newDeactivate.c1[1],                                │
│         newDeactivate.c2[0],                                │
│         newDeactivate.c2[1],                                │
│         poseidon(sharedKey)                                 │
│       ]                                                      │
│       deactivateTree.updateLeaf(dIndex, hash(dLeaf))       │
│                                                              │
│    6. 注意：State Tree 中的 c1/c2 暂时不更新               │
│       (会在 processMessages 时批量更新状态)                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 阶段 5: 用户尝试再次投票                                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Operator 验证 (processMessages):                           │
│                                                              │
│  1. 快速检查 Active State Tree                              │
│     as = activeStateTree.leaf(stateIdx)                     │
│     if (as !== 0) {                                         │
│       return 'inactive'  // 被拒绝 ✗                       │
│     }                                                        │
│                                                              │
│  2. 解密检查（如果 c1/c2 已更新）                           │
│     deactivate = decrypt(coordPrivKey, {c1, c2})           │
│     if (deactivate % 2 === 1) {                             │
│       return 'deactivated'  // 被拒绝 ✗                    │
│     }                                                        │
│                                                              │
│  → 投票失败，消息被跳过                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 关键细节

#### 为什么使用确定性随机数？

```typescript
private genStaticRandomKey(
  privKey: PrivKey,
  salt: bigint,
  index: bigint
): PrivKey {
  return poseidon([privKey, salt, index])
}

// 使用示例
const randomKey = genStaticRandomKey(
  coordPrivKey,
  20040n,        // 固定盐值
  timestamp      // 使用时间戳作为索引
)
```

**原因：**
1. **可重现性**：Operator 可以重新计算相同的随机数
2. **避免链上存储**：无需存储大量随机数
3. **安全性**：使用 coordinator 私钥作为熵源，外部无法预测

#### c1/c2 更新时机

```
SignUp:
  State Leaf.c1 = [0, 0]
  State Leaf.c2 = [0, 0]
  
processDeactivateMessages:
  Operator 内存中更新 stateLeaves.get(idx).d1 = new c1'
  Operator 内存中更新 stateLeaves.get(idx).d2 = new c2'
  但 State Tree 的叶子哈希不立即更新
  
processMessages:
  读取 Operator 内存中的 d1, d2
  验证消息时使用最新的 d1, d2
  如果消息有效，更新 State Tree 的叶子哈希
```

---

## 6. 电路验证机制

### 6.1 StateLeafTransformer 中的验证

```circom
// packages/circuits/circom/amaci/power/stateLeafTransformer.circom

template StateLeafTransformer() {
    // ... 输入信号 ...
    
    signal input slC1[2];  // State Leaf 中的 c1
    signal input slC2[2];  // State Leaf 中的 c2
    signal input coordPrivKey;
    signal input deactivate;  // 从 Active State Tree 读取
    
    // 1. 解密 deactivate 状态
    component decryptIsActive = ElGamalDecrypt();
    decryptIsActive.c1[0] <== slC1[0];
    decryptIsActive.c1[1] <== slC1[1];
    decryptIsActive.c2[0] <== slC2[0];
    decryptIsActive.c2[1] <== slC2[1];
    decryptIsActive.privKey <== coordPrivKey;
    // 输出: decryptIsActive.isOdd
    //       0 = active (偶数)
    //       1 = deactivated (奇数)
    
    // 2. 检查是否是 deactivate 消息
    component activate = IsZero();
    activate.in <== deactivate;
    // activate.out = 1 if deactivate == 0 (active)
    // activate.out = 0 if deactivate != 0 (inactive)
    
    // 3. 综合判断
    component valid = IsEqual();
    valid.in[0] <== 3;  // 期望值
    valid.in[1] <== (1 - decryptIsActive.isOdd) +  // 未被停用 = 1
                    activate.out +                   // 是活跃状态 = 1
                    messageValidator.isValid;        // 消息有效 = 1
    
    // 只有当三个条件都满足时，valid.out = 1
    // 即: 1 + 1 + 1 = 3
    
    isValid <== valid.out;
}
```

### 6.2 验证条件解析

```
三重验证机制:

条件 1: (1 - decryptIsActive.isOdd)
  ├─ 如果 decryptIsActive.isOdd = 0 (active)  → 贡献 1
  └─ 如果 decryptIsActive.isOdd = 1 (deactivated) → 贡献 0

条件 2: activate.out
  ├─ 如果 deactivate = 0 (active in tree) → 贡献 1
  └─ 如果 deactivate ≠ 0 (inactive in tree) → 贡献 0

条件 3: messageValidator.isValid
  ├─ 如果签名、nonce、余额等都有效 → 贡献 1
  └─ 如果任何验证失败 → 贡献 0

总和 = 3 → 消息有效，可以投票
总和 < 3 → 消息无效，使用默认索引（不更新状态）
```

### 6.3 签名时的区别

**初始状态 (c1=c2=[0,0]):**
```
State Leaf Hash = hash2(
  hash5([pubKey, balance, voRoot, nonce]),
  hash5([0, 0, 0, 0, 0])  ← 预计算值
)

电路中:
  decryptIsActive.c1 = [0, 0]
  decryptIsActive.c2 = [0, 0]
  
  解密: message * G = c2 - privKey * c1
               = [0,1] - privKey * [0,1]
               = [0,1]  (单位元)
  
  isOdd = 0  → Active
```

**Deactivate 后 (c1'≠[0,0], c2'≠[0,0]):**
```
State Leaf Hash = hash2(
  hash5([pubKey, balance, voRoot, nonce]),
  hash5([c1'_x, c1'_y, c2'_x, c2'_y, 0])  ← 真实加密值
)

电路中:
  decryptIsActive.c1 = [c1'_x, c1'_y]
  decryptIsActive.c2 = [c2'_x, c2'_y]
  
  解密: message * G = c2' - privKey * c1'
               ≈ G  (基点)
  
  isOdd = 1  → Deactivated
```

---

## 7. 完整示例

### 7.1 代码示例

```typescript
// ========== 初始化 ==========
const operator = new OperatorClient(config)
operator.initMaci({
  stateTreeDepth: 2,
  voteOptionTreeDepth: 1,
  batchSize: 5,
  maxVoteOptions: 5,
  numSignUps: 25,
  isAmaci: true,
  derivePathParams
})

// ========== 用户注册 ==========
const user1 = genKeypair()
operator.initStateTree(
  0,  // stateIdx
  user1.pubKey,
  100,  // balance
  [0n, 0n, 0n, 0n]  // c1_x, c1_y, c2_x, c2_y = [0, 0, 0, 0]
)

console.log('\n=== After SignUp ===')
const s = operator.stateLeaves.get(0)!
console.log('c1:', s.d1)  // [0, 0]
console.log('c2:', s.d2)  // [0, 0]

// Operator 解密检查
const status1 = operator['decryptDeactivate']({
  c1: { x: s.d1[0], y: s.d1[1] },
  c2: { x: s.d2[0], y: s.d2[1] },
  xIncrement: 0n
}, derivePathParams)

console.log('Deactivate value:', status1)  // 0 (偶数)
console.log('Is deactivated?', status1 % 2n === 1n)  // false → Active

// ========== 用户投票 ==========
const vote1 = operator.batchGenMessage(0, coordPubKey, [[0, 10]], user1DeriveParams)
const { message, command } = operator.pushMessage(vote1[0].msg, vote1[0].encPubkeys)

operator.endVotePeriod()

const result1 = await operator.processMessages({
  wasmFile: 'ProcessMessages.wasm',
  zkeyFile: 'ProcessMessages.zkey'
})

console.log('\n=== After Vote 1 ===')
console.log('Message processed successfully')
console.log('User balance:', operator.stateLeaves.get(0)!.balance)  // 90

// ========== 用户 Deactivate ==========
const deactivateMsg = operator.buildDeactivatePayload({
  stateIdx: 0,
  operatorPubkey: coordPubKey,
  derivePathParams: user1DeriveParams
})
operator.pushDeactivateMessage(deactivateMsg.msg, deactivateMsg.encPubkeys)

const deactivateResult = await operator.processDeactivateMessages({
  inputSize: 5,
  subStateTreeLength: 25,
  wasmFile: 'ProcessDeactivateMessages.wasm',
  zkeyFile: 'ProcessDeactivateMessages.zkey'
})

console.log('\n=== After Deactivate ===')
const s2 = operator.stateLeaves.get(0)!
console.log('c1:', s2.d1)  // [非零, 非零] ← 新的加密值
console.log('c2:', s2.d2)  // [非零, 非零]

// Operator 解密检查
const status2 = operator['decryptDeactivate']({
  c1: { x: s2.d1[0], y: s2.d1[1] },
  c2: { x: s2.d2[0], y: s2.d2[1] },
  xIncrement: 0n
}, derivePathParams)

console.log('Deactivate value:', status2)  // 1 (奇数)
console.log('Is deactivated?', status2 % 2n === 1n)  // true → Deactivated

// Active State Tree 检查
const as = operator.activeStateTree!.leaf(0)
console.log('Active state:', as)  // 非零 timestamp
console.log('Is active?', as === 0n)  // false

// ========== 用户尝试再次投票 ==========
const vote2 = operator.batchGenMessage(0, coordPubKey, [[1, 5]], user1DeriveParams)
operator.pushMessage(vote2[0].msg, vote2[0].encPubkeys)

const result2 = await operator.processMessages({
  wasmFile: 'ProcessMessages.wasm',
  zkeyFile: 'ProcessMessages.zkey'
})

console.log('\n=== After Vote 2 (Rejected) ===')
console.log('- Message <0> inactive')  // 或 'deactivated'
console.log('User balance:', operator.stateLeaves.get(0)!.balance)  // 仍然是 90 (未变化)
```

### 7.2 日志输出

```
=== After SignUp ===
c1: [ 0n, 0n ]
c2: [ 0n, 0n ]
Deactivate value: 0n
Is deactivated? false

=== After Vote 1 ===
Process messages [0, 1)
- Message <0> ✓
Message processed successfully
User balance: 90n

=== After Deactivate ===
Process deactivate messages [0, 1)
- Message <0> ✓
c1: [ 123456789n, 987654321n ]
c2: [ 111222333n, 444555666n ]
Deactivate value: 1n
Is deactivated? true
Active state: 1704067200n
Is active? false

=== After Vote 2 (Rejected) ===
Process messages [1, 2)
- Message <0> inactive
User balance: 90n
```

---

## 8. 总结

### 8.1 关键要点

1. **预计算哈希值 `2066be...95bc`**
   - 等于 `hash5([0, 0, 0, 0, 0])`
   - 代表初始的 Active 状态（c1=c2=[0,0]）
   - 节省链上 gas 成本

2. **双重检测机制**
   - **Active State Tree**: 快速查询（O(1)），无隐私
   - **ElGamal 解密**: 隐私保护，需要 coordinator 私钥

3. **状态编码**
   - 解密结果为 **偶数 (0)** → Active
   - 解密结果为 **奇数 (1)** → Deactivated

4. **三重验证**
   - 电路中同时验证：解密状态 + Active Tree + 消息有效性
   - 三者都通过才能投票

### 8.2 安全性

| 威胁 | 防御机制 |
|------|---------|
| 外部观察者识别用户状态 | ElGamal 加密，链上只有密文 |
| Operator 作恶跳过 deactivate | ZK 证明验证电路执行正确性 |
| 用户绕过 deactivate 继续投票 | 双重检测（Active Tree + 解密） |
| 重复使用 deactivate 记录 | Nullifier 机制（AddNewKey） |

---

*文档版本: 1.0*  
*最后更新: 2024-12*  
*作者: MACI Development Team*

