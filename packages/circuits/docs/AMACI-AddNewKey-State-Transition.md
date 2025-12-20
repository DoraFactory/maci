# AMACI AddNewKey 状态转换详解

## 用户的疑问

> **AddNewKey 确实会继承之前的 d 消息（deactivate 数据），但是这样子不是意味着 AddNewKey 一直都是 deactivate 的？Operator 是如何判断这个账户是否是 active 的？**

这是一个非常好的问题！让我们深入分析整个流程。

## 关键理解：两棵树的作用

AMACI 使用**两个索引系统**来管理用户状态：

### 1. StateTree (状态树)
- **索引**: `stateIdx` (State Index)
- **作用**: 存储用户的完整状态（pubKey, balance, voTreeRoot, nonce, d1, d2）
- **特点**: 每个 signup/addNewKey 都会占用一个**新的** stateIdx

### 2. ActiveStateTree (活跃状态树)
- **索引**: 也是 `stateIdx`
- **作用**: **快速标记**哪些账户被 deactivate 了
- **规则**: 
  - `0` = Active（可以投票）
  - `非0` = Inactive（不能投票）

## 完整的生命周期流程

### 场景：Alice 的账户演变

#### 阶段 1: 初始 SignUp

```typescript
// 合约 SignUp
stateIdx = 5  // Alice 的第一个账户
StateTree[5] = hash([
  pubKey_A,
  balance: 100,
  voTreeRoot: 0,
  nonce: 0,
  d1: [0, 0],  // 初始 active
  d2: [0, 0]
])

ActiveStateTree[5] = 0  // 0 = Active ✅
```

**状态**:
- Alice 在 stateIdx=5
- d1, d2 = [0,0,0,0] → decrypt = 0 (偶数) → Active
- ActiveStateTree[5] = 0 → Active
- **可以投票！✅**

---

#### 阶段 2: Alice Deactivate

Alice 发送 deactivate 消息，operator 处理：

```typescript
// processDeactivateMessages
const error = checkDeactivateCommand(cmd);  // 假设 error = null (成功)

// 1. 生成新的加密 deactivate 数据
const deactivate = encryptOdevity(
  !!error,  // false → 加密为偶数 (Active)
  coordPubKey,
  randomKey
);

// 2. 更新 ActiveStateTree - 关键！
this.activeStateTree.updateLeaf(
  stateIdx: 5,
  newActiveState[i]  // 非0值，例如 processedDMsgCount + i + 1
);

// 3. 更新 DeactivateTree
const dLeaf = [c1, c2, poseidon(sharedKey)];
this.deactivateTree.updateLeaf(deactivateIndex, poseidon(dLeaf));
```

**结果**:
```typescript
StateTree[5] = 不变（还是 Alice 的旧状态）

ActiveStateTree[5] = 非0值 (例如 1001)  // 标记为 Inactive ❌

DeactivateTree[1001] = hash([c1, c2, sharedKeyHash])
```

**状态**:
- Alice 在 stateIdx=5
- **ActiveStateTree[5] = 1001 ≠ 0** → Inactive！❌
- 即使 d1, d2 还是 [0,0,0,0]，也**无法投票**！

---

#### 阶段 3: Alice AddNewKey

Alice 想重新激活，使用 AddNewKey：

```typescript
// 电路 AddNewKey
// 1. 验证 Alice 拥有 deactivateTree 中的数据
deactivateLeaf = hash([c1, c2, sharedKeyHash])
deactivateTree 中存在 ✅

// 2. Rerandomize
const rerandomized = rerandomize(coordPubKey, {c1, c2}, randomVal);
// d1_new, d2_new = rerandomized (奇偶性不变！)

// 3. 提交到合约
addNewKey(pubKey_B, nullifier, [d1_new, d2_new], proof)
```

**合约处理** (`contract.rs:1391-1402`):

```rust
// 1. 分配新的 stateIdx
let state_index = num_sign_ups;  // 例如 10（新的！）

// 2. 创建新的 StateLeaf
let state_leaf = StateLeaf {
    pub_key: pubkey_B,  // Alice 的新公钥
    voice_credit_balance: voice_credit_amount,
    vote_option_tree_root: 0,
    nonce: 0,
}.hash_new_key_state_leaf([d1_new, d2_new]);
// = hash2([
//     hash5([pubKey_B, balance, 0, 0]),
//     hash5([d1_new, d2_new, 0])  // 继承了 deactivate 数据！
//   ])

// 3. 入队到 StateTree
state_enqueue(state_leaf);  // 添加到 stateIdx=10

// 4. 更新 numSignUps
num_sign_ups += 1;
```

**结果**:
```typescript
// 旧账户（stateIdx=5）
StateTree[5] = 不变（Alice 的旧状态）
ActiveStateTree[5] = 1001 ≠ 0  // 仍然 Inactive ❌

// 新账户（stateIdx=10）
StateTree[10] = hash([
  pubKey_B,           // 新公钥
  balance: 100,       // 重新分配的余额
  voTreeRoot: 0,
  nonce: 0,
  d1: d1_new,         // 继承的 deactivate 数据（偶数）
  d2: d2_new
])

ActiveStateTree[10] = 0  // 默认值 = Active ✅
```

**关键点**：
- 🔑 **新账户在 stateIdx=10**，而不是旧的 stateIdx=5
- 🔑 **ActiveStateTree[10] = 0**（默认值）
- 🔑 虽然继承了 d1_new, d2_new，但这些数据是**偶数**（Active）

---

#### 阶段 4: Alice 用新账户投票

Alice 使用新公钥 `pubKey_B` 和新的 `stateIdx=10` 投票：

```typescript
// processMessages 中的 checkCommandNow
function checkCommandNow(cmd: Command) {
  const stateIdx = cmd.stateIdx;  // 10（新账户）
  const s = stateLeaves.get(10);  // 获取新账户的状态
  
  // ===== 检查 1: ActiveStateTree =====
  const as = activeStateTree.leaf(10);  // 0（默认值）
  if (as !== 0n) {
    return 'inactive';  // 快速拒绝
  }
  // ✅ ActiveStateTree[10] = 0，通过！
  
  // ===== 检查 2: 解密 d1, d2 =====
  const deactivate = decrypt(coordPrivKey, {
    c1: { x: s.d1[0], y: s.d1[1] },  // d1_new
    c2: { x: s.d2[0], y: s.d2[1] },  // d2_new
    xIncrement: 0n
  });
  if (deactivate % 2n === 1n) {
    return 'deactivated';  // 奇数 = deactivated
  }
  // ✅ deactivate % 2 = 0（偶数），通过！
  
  // ... 其他检查（nonce, signature, balance）
}
```

**结果**: ✅ **Alice 可以投票！**

---

## 核心机制总结

### 为什么 AddNewKey 后账户是 Active？

```
┌─────────────────────────────────────────────────────────────┐
│ 关键理解：AddNewKey 创建了一个新的 stateIdx！               │
└─────────────────────────────────────────────────────────────┘

旧账户 (stateIdx=5):
  StateTree[5]: 旧数据
  ActiveStateTree[5]: 1001 (Inactive) ❌
  
新账户 (stateIdx=10):
  StateTree[10]: 新数据 + 继承的 d1_new, d2_new
  ActiveStateTree[10]: 0 (Active) ✅  ← 默认值！
```

### 双重检查机制

Operator 在 `processMessages` 时检查两项：

```typescript
// 检查 1: ActiveStateTree (快速检查)
if (activeStateTree.leaf(stateIdx) !== 0) {
  return 'inactive';  // 这个 stateIdx 被标记为 inactive
}

// 检查 2: 解密 d1, d2 (隐私保护检查)
const decrypted = decrypt(coordPrivKey, {c1, c2});
if (decrypted % 2 === 1) {
  return 'deactivated';  // 加密数据表明 deactivated
}
```

**为什么需要两个检查？**

1. **ActiveStateTree**:
   - 快速标记（不需要解密）
   - 用于 `deactivate` 操作（用户主动停用）
   - 按 stateIdx 索引

2. **d1, d2 解密**:
   - 隐私保护（只有 coordinator 能解密）
   - 用于 `AddNewKey` 操作（继承状态）
   - 存储在 StateLeaf 中

### AddNewKey 的 d1, d2 来源

```typescript
// 在 AddNewKey 电路中
const rerandomized = rerandomize(coordPubKey, {c1, c2}, randomVal);

// Rerandomize 的特性：
// - 输入: c1, c2 (原始加密数据)
// - 输出: d1, d2 (新的加密数据)
// - 奇偶性不变！
//   - 如果 c1,c2 加密的是偶数 → d1,d2 加密的也是偶数
//   - 如果 c1,c2 加密的是奇数 → d1,d2 加密的也是奇数
```

**从 DeactivateTree 中取出的 c1, c2 是什么状态？**

回到 `processDeactivateMessages` (operator.ts:1112-1116):

```typescript
const deactivate = this.encryptOdevity(
  !!error,  // 如果 error = null (成功) → false
            // 如果 error 存在 (失败) → true
  coordPubKey,
  randomKey
);
```

**关键逻辑**:
```typescript
if (!error) {
  // 消息验证成功 → 用户确实想 deactivate
  // 但 encryptOdevity(false) → 加密偶数 (Active)
  // 为什么？因为这是为了 AddNewKey 准备的！
  
  this.activeStateTree.updateLeaf(stateIdx, newActiveState[i]);
  // 通过 ActiveStateTree 标记为 inactive
  
  this.deactivateTree.updateLeaf(index, poseidon(dLeaf));
  // 存储 Active 状态的加密数据到 DeactivateTree
}
```

**设计理念**:
- `ActiveStateTree` 负责标记当前账户是否 inactive
- `DeactivateTree` 存储的是**为 AddNewKey 准备的 Active 状态数据**
- 用户通过 AddNewKey 获取 Active 数据，创建新账户

---

## 完整的状态转换表

| 阶段 | stateIdx | StateTree | ActiveStateTree | d1, d2 状态 | 能否投票 |
|------|----------|-----------|-----------------|------------|----------|
| **1. SignUp** | 5 | Alice-A 状态 | `0` (Active) | [0,0,0,0] (偶数) | ✅ 可以 |
| **2. Deactivate** | 5 | Alice-A 状态 | `1001` (Inactive) | [0,0,0,0] (偶数) | ❌ 不能 (ActiveStateTree) |
| **3. AddNewKey** | **10** (新) | Alice-B 状态 | `0` (Active) | [d1,d2] (偶数,继承) | ✅ 可以 |
| **4. 如果再 Deactivate** | 10 | Alice-B 状态 | `1002` (Inactive) | [d1,d2] (偶数) | ❌ 不能 |

## 疑问解答

### Q1: AddNewKey 为什么不会"一直 deactivate"？

**答**: 因为 AddNewKey 创建的是**新的 stateIdx**！

```typescript
// 旧账户 stateIdx=5
ActiveStateTree[5] = 1001  // Inactive

// 新账户 stateIdx=10
ActiveStateTree[10] = 0    // Active（默认值）
```

### Q2: 继承的 d1, d2 是什么状态？

**答**: **偶数（Active）**！

```typescript
// processDeactivateMessages 中
const deactivate = encryptOdevity(
  !!error,  // error=null → false → 加密偶数
  coordPubKey,
  randomKey
);

// 所以 DeactivateTree 中存储的都是 Active 状态的加密数据
```

**为什么这样设计？**
- DeactivateTree 是为了让用户能够"重新激活"
- 用户通过 AddNewKey 从 DeactivateTree 获取 Active 数据
- Rerandomize 后仍然是 Active 数据
- 新账户可以正常使用

### Q3: 如果用户在 Deactivate 后又想再次 Deactivate 新账户呢？

**答**: 完全可以！流程会重复：

```typescript
// 1. 用 stateIdx=10 发送 deactivate 消息
// 2. Operator 处理：
ActiveStateTree[10] = 1002  // 标记为 Inactive

// 3. 生成新的 deactivate 数据存入 DeactivateTree[1002]

// 4. 用户可以再次 AddNewKey，获得 stateIdx=15
ActiveStateTree[15] = 0  // Active
```

### Q4: Operator 如何知道解密 d1, d2 后是偶数还是奇数？

**答**: Operator 拥有 coordinator 私钥，可以解密：

```typescript
const deactivate = decrypt(coordPrivKey, {
  c1: { x: s.d1[0], y: s.d1[1] },
  c2: { x: s.d2[0], y: s.d2[1] },
  xIncrement: 0n
});

if (deactivate % 2n === 1n) {
  // 奇数 → Deactivated
  return 'deactivated';
}
// 偶数 → Active
```

**在 AddNewKey 的情况下**:
- d1, d2 是从 DeactivateTree 中获取的
- DeactivateTree 中的数据都是 Active 状态（偶数）
- Rerandomize 后仍然是偶数
- ✅ 检查通过！

---

## 设计优势

### 1. 隐私保护
- 外部观察者无法知道哪个账户是 deactivated
- 只有 coordinator 能解密 d1, d2

### 2. 灵活性
- 用户可以多次 deactivate/reactivate
- 每次 AddNewKey 都是全新的账户

### 3. 效率
- ActiveStateTree 提供快速检查（不需要解密）
- 两层检查机制确保安全性

### 4. 防重放
- Nullifier 机制防止重复使用同一个 deactivate 数据
- 每个 AddNewKey 只能用一次

---

## 测试验证

### 测试场景 1: SignUp → Deactivate → AddNewKey → Vote

```typescript
// 1. SignUp
operator.initStateTree(5, pubKey_A, 100, [0n, 0n, 0n, 0n]);
// stateIdx=5, ActiveStateTree[5]=0

// 2. Deactivate
operator.pushDeactivateMessage(deactivateMsg, encPubKey);
await operator.processDeactivateMessages({...});
// ActiveStateTree[5]=1001 (Inactive)

// 3. AddNewKey
const addNewKeyInput = voter.genAddNewKeyInput({...});
await contract.addNewKey({...});
// stateIdx=10, ActiveStateTree[10]=0

// 4. Vote
const voteMsg = voter.genMessage(10, ...);
operator.pushMessage(voteMsg, encPubKey);
await operator.processMessages();
// ✅ 成功！checkCommandNow 通过
```

### 测试场景 2: 验证 d1, d2 的奇偶性

```typescript
// 从 DeactivateTree 获取的 c1, c2
const c1 = [deactivateLeaf[0], deactivateLeaf[1]];
const c2 = [deactivateLeaf[2], deactivateLeaf[3]];

// Rerandomize
const { d1, d2 } = rerandomize(coordPubKey, { c1, c2 }, randomVal);

// 解密 c1, c2
const decrypted_c = decrypt(coordPrivKey, { c1, c2, xIncrement: 0n });
console.log('c1,c2 decrypt:', decrypted_c % 2n);  // 0 (偶数)

// 解密 d1, d2
const decrypted_d = decrypt(coordPrivKey, { c1: d1, c2: d2, xIncrement: 0n });
console.log('d1,d2 decrypt:', decrypted_d % 2n);  // 0 (偶数)

// ✅ 奇偶性保持不变！
```

---

## 结论

### AddNewKey 的完整逻辑

1. **创建新 stateIdx**: 不是覆盖旧账户，而是创建全新账户
2. **ActiveStateTree[newIdx] = 0**: 默认值表示 Active
3. **继承 Active 数据**: 从 DeactivateTree 获取的是 Active 状态的加密数据
4. **Rerandomize 保持奇偶性**: d1, d2 仍然是偶数（Active）
5. **双重检查都通过**: 
   - ActiveStateTree[newIdx] = 0 ✅
   - decrypt(d1, d2) % 2 = 0 ✅
6. **可以正常投票**: 新账户完全激活！

### 关键要点

```
┌─────────────────────────────────────────────────────────────┐
│ AddNewKey 不是"修复" deactivated 状态                        │
│ 而是创建一个全新的 Active 账户！                             │
│                                                              │
│ 旧账户 (stateIdx=5): Inactive ❌                             │
│ 新账户 (stateIdx=10): Active ✅                              │
└─────────────────────────────────────────────────────────────┘
```

---

*文档版本: 1.0*  
*最后更新: 2024-12*  
*作者: MACI Development Team*

