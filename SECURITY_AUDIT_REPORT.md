# MACI/AMACI Poll ID 验证 - 完整安全审计报告

## 审计日期
2026-02-01

## 审计范围
- ✅ 电路层 (Circom)
- ✅ SDK 层 (TypeScript)  
- ✅ 合约层 (Rust CosmWasm)
- ✅ 数据流完整性
- ✅ 类型一致性

---

## 🚨 发现的严重安全问题

### ❌ **严重问题 #1: 合约层缺少 Poll ID 验证**

#### 问题描述
在 `contracts/amaci/src/contract.rs` 和 `contracts/maci/src/contract.rs` 中，`execute_process_message` 和 `execute_process_deactivate_message` 函数在计算 `input_hash` 时使用的参数数量**与电路期望的参数数量不匹配**。

#### 受影响的函数

**1. AMACI - ProcessDeactivateMessage**
```rust
// contracts/amaci/src/contract.rs, 第 1255 行
let mut input: [Uint256; 7] = [Uint256::zero(); 7];  // ❌ 只有 7 个参数
input[0] = new_deactivate_root;
input[1] = COORDINATORHASH.load(deps.storage)?;
input[2] = batch_start_hash;
input[3] = batch_end_hash;
input[4] = current_deactivate_commitment;
input[5] = new_deactivate_commitment;
input[6] = state_root;
// ❌ 缺少 input[7] = poll_id
```

**对应的电路期望** (`processDeactivate.circom`, 第 109 行):
```circom
inputHasher.expectedPollId <== expectedPollId;  // ✅ 电路期望 8 个参数
```

**对应的 SDK** (`operator.ts`, 第 1262 行):
```typescript
const inputHash = computeInputHash([
  newDeactivateRoot,
  this.pubKeyHasher!,
  batchStartHash,
  batchEndHash,
  currentDeactivateCommitment,
  newDeactivateCommitment,
  subStateTree.root,
  BigInt(this.pollId!)  // ✅ SDK 使用 8 个参数
]);
```

**2. AMACI - ProcessMessage**
```rust
// contracts/amaci/src/contract.rs, 第 1701 行
let mut input: [Uint256; 7] = [Uint256::zero(); 7];  // ❌ 只有 7 个参数
// AMACI 模式下应该有 8 个参数（包括 deactivateCommitment）
// 但缺少 poll_id（应该是第 8 个参数）
```

**3. MACI - ProcessMessage**
```rust
// contracts/maci/src/contract.rs, 第 890 行
let mut input: [Uint256; 6] = [Uint256::zero(); 6];  // ❌ 只有 6 个参数
// MACI 模式下应该有 7 个参数（包括 poll_id）
```

#### 安全影响

**🔴 严重性: CRITICAL**

1. **绕过电路验证**: 
   - 电路内部对 Poll ID 进行了严格验证
   - 但合约在计算 `input_hash` 时**没有包含 `poll_id`**
   - 这意味着攻击者可以提交**任意 poll_id 的消息**，只要其他参数匹配即可

2. **跨 Poll 重放攻击**:
   ```
   场景：
   Round 1 (poll_id = 1): 用户投票给选项 A
   Round 2 (poll_id = 2): 攻击者可以重放 Round 1 的消息
   
   因为：
   - 电路内部会验证 poll_id = 2 ✅
   - 但合约计算 input_hash 时不包含 poll_id
   - 所以 Round 1 的 proof 仍然有效 ❌
   ```

3. **完全绕过 Poll ID 安全机制**:
   - 我们在电路层添加的所有 Poll ID 验证都变得**无效**
   - SDK 层的验证也只是"提前检查"，无法阻止恶意合约调用
   - 最终的安全保障（合约层）存在严重漏洞

#### 修复方案

**必须修改合约代码**，在计算 `input_hash` 时包含 `poll_id`：

**1. AMACI - ProcessDeactivateMessage**
```rust
// contracts/amaci/src/contract.rs
pub fn execute_process_deactivate_message(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    size: Uint256,
    new_deactivate_commitment: Uint256,
    new_deactivate_root: Uint256,
    groth16_proof: Groth16ProofType,
) -> Result<Response, ContractError> {
    // ... existing code ...
    
    // ✅ 修改: 使用 8 个参数
    let mut input: [Uint256; 8] = [Uint256::zero(); 8];
    input[0] = new_deactivate_root;
    input[1] = COORDINATORHASH.load(deps.storage)?;
    input[2] = DMSG_HASHES.load(deps.storage, batch_start_index.to_be_bytes().to_vec())?;
    input[3] = DMSG_HASHES.load(deps.storage, batch_end_index.to_be_bytes().to_vec())?;
    input[4] = CURRENT_DEACTIVATE_COMMITMENT.load(deps.storage)?;
    input[5] = new_deactivate_commitment;
    input[6] = STATE_ROOT_BY_DMSG.load(deps.storage, batch_end_index.to_be_bytes().to_vec())?;
    input[7] = Uint256::from(POLL_ID.load(deps.storage)?);  // ✅ 添加 poll_id
    
    // ... rest of the code ...
}
```

**2. AMACI - ProcessMessage**
```rust
// contracts/amaci/src/contract.rs
pub fn execute_process_message(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    new_state_commitment: Uint256,
    groth16_proof: Groth16ProofType,
) -> Result<Response, ContractError> {
    // ... existing code ...
    
    // ✅ 修改: 使用 8 个参数（AMACI 模式）
    let mut input: [Uint256; 8] = [Uint256::zero(); 8];
    input[0] = packedVals;
    input[1] = coordinator_hash;
    input[2] = batch_start_hash;
    input[3] = batch_end_hash;
    input[4] = current_state_commitment;
    input[5] = new_state_commitment;
    input[6] = CURRENT_DEACTIVATE_COMMITMENT.load(deps.storage)?;
    input[7] = Uint256::from(POLL_ID.load(deps.storage)?);  // ✅ 添加 poll_id
    
    // ... rest of the code ...
}
```

**3. MACI - ProcessMessage**
```rust
// contracts/maci/src/contract.rs
pub fn execute_process_message(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    new_state_commitment: Uint256,
    groth16_proof: Option<Groth16ProofType>,
    plonk_proof: Option<PlonkProofType>,
) -> Result<Response, ContractError> {
    // ... existing code ...
    
    // ✅ 修改: 使用 7 个参数（MACI 模式，不包含 deactivateCommitment）
    let mut input: [Uint256; 7] = [Uint256::zero(); 7];
    input[0] = packedVals;
    input[1] = coordinator_hash;
    input[2] = batch_start_hash;
    input[3] = batch_end_hash;
    input[4] = current_state_commitment;
    input[5] = new_state_commitment;
    input[6] = Uint256::from(POLL_ID.load(deps.storage)?);  // ✅ 添加 poll_id
    
    // ... rest of the code ...
}
```

---

## ⚠️ 发现的设计问题

### ⚠️ **问题 #2: SDK 中 pollId 类型不一致**

#### 问题描述
在 SDK 中，`pollId` 在不同地方使用了不同的类型：

**OperatorClient**
```typescript
// packages/sdk/src/operator.ts, 第 218 行
public pollId?: number;  // ⚠️ 使用 number 类型
```

**Command 类型**
```typescript
// packages/sdk/src/operator.ts, 第 57 行
type Command = {
  // ... other fields
  pollId: bigint;  // ⚠️ 使用 bigint 类型
  // ...
};
```

**验证代码中的类型转换**
```typescript
// packages/sdk/src/operator.ts, 第 1332 行
if (this.pollId !== undefined && cmd.pollId !== BigInt(this.pollId)) {
  return 'poll id mismatch';
}
```

#### 影响

🟡 **严重性: MEDIUM**

1. **类型转换开销**: 每次验证都需要 `BigInt()` 转换
2. **潜在的类型错误**: 虽然 JavaScript 的类型转换比较宽松，但这不是最佳实践
3. **代码可读性**: 类型不一致降低了代码的可维护性

#### 建议修复

**选项 1: 统一使用 bigint**（推荐）
```typescript
// packages/sdk/src/operator.ts
public pollId?: bigint;  // ✅ 改为 bigint

// 验证代码无需转换
if (this.pollId !== undefined && cmd.pollId !== this.pollId) {
  return 'poll id mismatch';
}
```

**选项 2: 保持现状但添加类型注释**
当前实现是可行的，因为：
- `pollId` 的范围通常很小（< 2^53）
- `number` 可以安全地表示这个范围
- 已经有转换逻辑

但应该添加文档说明这个设计决策。

---

## ✅ 验证通过的部分

### ✅ **电路层 Poll ID 验证 - 完全正确**

#### MACI MessageValidator
```circom
// packages/circuits/circom/maci/power/messageValidator.circom
// Lines 29-36
signal input cmdPollId;
signal input expectedPollId;

component validPollId = IsEqual();
validPollId.in[0] <== cmdPollId;
validPollId.in[1] <== expectedPollId;

// 包含在总验证中 (Line 104)
validUpdate.in[1] <== ... + validPollId.out;
```

✅ **状态**: 实现正确，包含了 7 个验证条件

#### AMACI MessageValidator
```circom
// packages/circuits/circom/amaci/power/messageValidator.circom
// Lines 28-36, 95-103
```

✅ **状态**: 与 MACI 相同，实现正确

#### ProcessDeactivateMessages
```circom
// packages/circuits/circom/amaci/power/processDeactivate.circom

// Line 90: 输入定义
signal input expectedPollId;

// Line 109: 传递给 InputHasher
inputHasher.expectedPollId <== expectedPollId;

// Lines 235, 243: 传递给每个消息处理器
processors[i].cmdPollId <== commands[i].pollId;
processors[i].expectedPollId <== expectedPollId;
```

✅ **状态**: 完整实现，正确传递 poll ID

#### ProcessOne (单个停用消息处理)
```circom
// Lines 302, 307: 输入定义
signal input cmdPollId;
signal input expectedPollId;

// Lines 339-341: Poll ID 验证
component validPollId = IsEqual();
validPollId.in[0] <== cmdPollId;
validPollId.in[1] <== expectedPollId;

// Lines 344-347: 包含在总验证中
valid.in[0] <== 3;
valid.in[1] <== validSignature.valid +
                1 - decryptCurrentIsActive.isOdd +
                validPollId.out;
```

✅ **状态**: 实现正确，验证了 3 个条件

#### ProcessDeactivateMessagesInputHasher
```circom
// Line 478: 输入定义
signal input expectedPollId;

// Line 489: Hasher 大小
component hasher = Sha256Hasher(8);  // ✅ 8 个参数

// Line 496: 包含在哈希中
hasher.in[7] <== expectedPollId;
```

✅ **状态**: 正确包含 8 个参数，与电路期望一致

---

### ✅ **SDK 层 Poll ID 处理 - 基本正确**

#### VoterClient - 消息生成
```typescript
// packages/sdk/src/voter.ts

// Line 287: 打包时包含 pollId
const packaged = packElement({ nonce, stateIdx, voIdx, newVotes, pollId });

// Line 302: 签名时使用打包后的数据（包含 pollId）
const hash = poseidon([packaged, ...newPubKey]);
const signature = signer.sign(hash);

// Line 306: 命令数组包含打包的数据
const command = [packaged, ...newPubKey, BigInt(salt), ...signature.R8, signature.S];
```

✅ **状态**: 正确将 poll ID 打包进消息

#### OperatorClient - 消息解析
```typescript
// packages/sdk/src/operator.ts

// Line 921: 解包时提取 pollId
const { nonce, stateIdx, voIdx, newVotes, pollId } = unpackElement(packaged);

// Lines 926-940: 构造 Command 对象
const cmd: Command = {
  nonce,
  stateIdx,
  voIdx,
  newVotes,
  newPubKey,
  pollId,  // ✅ 包含 poll ID
  signature: { R8: [...], S: ... },
  msgHash: poseidon([packaged, ...newPubKey])
};
```

✅ **状态**: 正确解析和存储 poll ID

#### 命令验证 - checkCommandNow
```typescript
// packages/sdk/src/operator.ts, Lines 1632-1635
if (this.pollId !== undefined && cmd.pollId !== BigInt(this.pollId)) {
  return 'poll id mismatch';
}
```

✅ **状态**: 添加了 SDK 层验证（快速失败）

#### 命令验证 - checkDeactivateCommand
```typescript
// packages/sdk/src/operator.ts, Lines 1330-1333
if (this.pollId !== undefined && cmd.pollId !== BigInt(this.pollId)) {
  return 'poll id mismatch';
}
```

✅ **状态**: 停用消息也添加了验证

#### processMessages - 使用 this.pollId
```typescript
// packages/sdk/src/operator.ts

// Lines 1402-1404: 验证 pollId 已设置
if (this.pollId === undefined) {
  throw new Error('Poll ID not set. Ensure initRound was called with pollId parameter.');
}

// Line 1528 (AMACI): 使用 this.pollId
inputHash = computeInputHash([
  packedVals,
  this.pubKeyHasher!,
  batchStartHash,
  batchEndHash,
  this.stateCommitment,
  newStateCommitment,
  deactivateCommitment,
  BigInt(this.pollId!)  // ✅ 直接使用内部状态
]);

// Line 1540 (MACI): 同样使用 this.pollId
inputHash = computeInputHash([
  // ...
  BigInt(this.pollId!)
]);
```

✅ **状态**: 正确使用内部状态，避免参数传入错误

#### processDeactivateMessages - 使用 this.pollId
```typescript
// packages/sdk/src/operator.ts

// Lines 1148-1150: 验证 pollId 已设置
if (this.pollId === undefined) {
  throw new Error('Poll ID not set. Ensure initRound was called with pollId parameter.');
}

// Line 1262: 在 inputHash 计算中使用
const inputHash = computeInputHash([
  newDeactivateRoot,
  this.pubKeyHasher!,
  batchStartHash,
  batchEndHash,
  currentDeactivateCommitment,
  newDeactivateCommitment,
  subStateTree.root,
  BigInt(this.pollId!)  // ✅ 直接使用内部状态
]);

// Line 1290: 在电路输入中使用
const input = {
  // ... other fields
  expectedPollId: BigInt(this.pollId!)  // ✅ 直接使用内部状态
};
```

✅ **状态**: 与 `processMessages` 保持一致的设计

---

### ✅ **Pack/Unpack 实现 - 完全正确**

```typescript
// packages/sdk/src/libs/crypto/pack.ts

export function packElement({
  nonce, stateIdx, voIdx, newVotes, pollId
}: {
  nonce: number | bigint;
  stateIdx: number | bigint;
  voIdx: number | bigint;
  newVotes: number | bigint;
  pollId: number | bigint;  // ✅ 接受 number 或 bigint
}): bigint {
  const packaged =
    BigInt(nonce) +
    (BigInt(stateIdx) << 32n) +
    (BigInt(voIdx) << 64n) +
    (BigInt(newVotes) << 96n) +
    (BigInt(pollId) << 192n);  // ✅ 左移 192 位

  return packaged;
}

export function unpackElement(packaged: bigint): {
  nonce: bigint;
  stateIdx: bigint;
  voIdx: bigint;
  newVotes: bigint;
  pollId: bigint;
} {
  const nonce = packaged % UINT32;
  const stateIdx = (packaged >> 32n) % UINT32;
  const voIdx = (packaged >> 64n) % UINT32;
  const newVotes = (packaged >> 96n) % UINT96;
  const pollId = (packaged >> 192n) % UINT32;  // ✅ 右移 192 位，范围 UINT32

  return { nonce, stateIdx, voIdx, newVotes, pollId };
}
```

✅ **状态**: 
- 打包/解包逻辑正确
- pollId 占用 32 位（位置 192-223）
- 与电路的 `messageToCommand.circom` 一致

---

## 📊 数据流完整性检查

### Poll ID 在各层的传递

```
用户层 (VoterClient)
  ↓ pollId: number
  └─→ packElement({ pollId })
      ↓ 打包到 packaged (bigint)
      └─→ poseidon([packaged, ...]) → msgHash
          └─→ sign(msgHash)
              ↓
合约层 (发布消息)
  ↓ 存储 encrypted message
  ↓
操作员层 (OperatorClient)
  ↓ 读取 messages
  └─→ decryptMessage(message)
      └─→ unpackElement(packaged)
          ↓ 提取 pollId: bigint
          └─→ Command { pollId }
              ↓
              ├─→ checkCommandNow / checkDeactivateCommand
              │   └─→ ✅ 验证 cmd.pollId === BigInt(this.pollId)
              │
              └─→ processMessages / processDeactivateMessages
                  └─→ computeInputHash([..., BigInt(this.pollId)])
                      ↓ inputHash
                      └─→ 生成 zkSNARK proof
                          ↓
合约层 (验证 proof)
  └─→ ❌ 计算 inputHash (缺少 poll_id)  ← 问题所在！
      └─→ verify_proof(inputHash)
          ↓
          ✅/❌ 验证结果
```

### 问题点分析

**第 1-5 步**: ✅ Poll ID 正确传递和打包  
**第 6-8 步**: ✅ Poll ID 正确解包和验证  
**第 9 步**: ✅ Poll ID 正确包含在 SDK 的 inputHash 中  
**第 10 步**: ✅ 电路正确验证 Poll ID  
**第 11 步**: ❌ **合约计算 inputHash 时缺少 poll_id**  

这导致：
- SDK 生成的 proof 使用的 inputHash **包含 poll_id**
- 合约验证时计算的 inputHash **不包含 poll_id**
- 如果当前只有一个 inputHash 值能通过验证，那是因为 **巧合**
- 攻击者可以利用这个差异进行攻击

---

## 🔍 安全影响评估

### 当前状态的安全性

| 防御层 | Poll ID 验证 | 状态 | 有效性 |
|--------|-------------|------|--------|
| SDK 层 | ✅ checkCommand | 已实现 | ⚠️ 可绕过（直接调用合约） |
| 电路层 | ✅ MessageValidator | 已实现 | ⚠️ 被合约漏洞架空 |
| 合约层 | ❌ inputHash 计算 | **缺失** | ❌ **关键漏洞** |

### 攻击场景

**场景 1: 跨 Poll 重放攻击**
```
1. Alice 在 Poll 1 中投票：
   - 生成消息 M1，包含 pollId=1
   - 提交到合约

2. Poll 2 开始：
   - Operator 调用 execute_process_message
   - 合约计算 inputHash（不包含 pollId）
   
3. 攻击者重放 Poll 1 的消息：
   - 电路内部会拒绝（pollId 不匹配）
   - 但攻击者可以修改 proof，因为 inputHash 不包含 pollId
   - 或者等待合约代码更新后利用

结果: ❌ 重放攻击理论上可行
```

**场景 2: Poll ID 伪造**
```
1. 攻击者生成消息，使用错误的 pollId
2. SDK 层会拒绝 ✅
3. 但如果攻击者直接调用合约：
   - 绕过 SDK 验证
   - 合约不验证 pollId
   
结果: ❌ 可以提交任意 pollId 的消息
```

---

## 📋 修复优先级

### 🔴 P0 - 立即修复（严重安全漏洞）

1. **修复合约层 inputHash 计算**
   - 文件: `contracts/amaci/src/contract.rs`
   - 函数: `execute_process_deactivate_message`
   - 修改: `input: [Uint256; 7]` → `input: [Uint256; 8]`
   - 添加: `input[7] = Uint256::from(POLL_ID.load(deps.storage)?);`

2. **修复合约层 inputHash 计算**
   - 文件: `contracts/amaci/src/contract.rs`
   - 函数: `execute_process_message`
   - 修改: `input: [Uint256; 7]` → `input: [Uint256; 8]`（AMACI 模式）
   - 添加: `input[7] = Uint256::from(POLL_ID.load(deps.storage)?);`

3. **修复合约层 inputHash 计算**
   - 文件: `contracts/maci/src/contract.rs`
   - 函数: `execute_process_message`
   - 修改: `input: [Uint256; 6]` → `input: [Uint256; 7]`（MACI 模式）
   - 添加: `input[6] = Uint256::from(POLL_ID.load(deps.storage)?);`

### 🟡 P1 - 高优先级（代码质量改进）

4. **统一 SDK 中的 pollId 类型**
   - 文件: `packages/sdk/src/operator.ts`
   - 修改: `public pollId?: number;` → `public pollId?: bigint;`
   - 影响: 需要更新所有使用 `this.pollId` 的地方

### 🟢 P2 - 中优先级（测试和文档）

5. **添加合约层 Poll ID 验证测试**
6. **更新集成测试**
7. **更新文档和 API 说明**

---

## ✅ 修复后的安全状态

修复合约层问题后，Poll ID 验证将形成完整的防御链：

```
用户消息 → SDK验证 → 电路验证 → 合约验证
          ↓          ↓          ↓
      poll_id    poll_id    poll_id
      匹配检查   电路约束   inputHash
      
防御深度: ✅ 三层防护
重放攻击: ✅ 完全阻止
类型安全: ✅ 多层验证
```

---

## 📝 测试建议

### 合约层测试

```rust
#[test]
fn test_process_message_with_wrong_poll_id() {
    // 1. 设置 poll_id = 1
    // 2. 生成使用 poll_id = 2 的消息和 proof
    // 3. 调用 execute_process_message
    // 4. 期望: Err(ContractError::InvalidProof)
}

#[test]
fn test_process_deactivate_with_poll_id() {
    // 验证 poll_id 正确包含在 inputHash 中
}
```

### SDK 集成测试

```typescript
describe('Poll ID Replay Attack Prevention', () => {
  it('should reject messages from different poll', async () => {
    // Round 1
    await operator.initRound({ pollId: 1 });
    const msg1 = voter.publishMessage({ /* ... */ });
    
    // Round 2
    await operator.initRound({ pollId: 2 });
    
    // 尝试处理 Round 1 的消息
    const result = await operator.processMessages();
    expect(result.errors).toContain('poll id mismatch');
  });
});
```

---

## 🎯 总结

### 当前状态
- ✅ 电路层: Poll ID 验证**完全正确**
- ✅ SDK 层: Poll ID 处理**基本正确**（有类型不一致的小问题）
- ❌ 合约层: Poll ID 验证**完全缺失**（严重安全漏洞）

### 关键发现
1. **严重安全漏洞**: 合约层 `inputHash` 计算缺少 `poll_id` 参数
2. **类型不一致**: SDK 中 `pollId` 使用 `number` 和 `bigint` 混用
3. **电路实现优秀**: 所有电路层面的 Poll ID 验证都正确实现

### 必须立即修复
合约层的 `inputHash` 计算必须包含 `poll_id`，否则电路层的所有安全措施都将失效。

### 建议
1. 立即修复合约层的三个函数
2. 重新部署合约
3. 进行完整的安全测试
4. 考虑统一 SDK 中的类型定义

---

## 📞 联系信息

如有疑问或需要进一步澄清，请参考：
- 电路实现: `packages/circuits/circom/`
- SDK 实现: `packages/sdk/src/`
- 合约实现: `contracts/amaci/src/contract.rs`, `contracts/maci/src/contract.rs`
- 相关文档: 项目根目录下的 `*.md` 文件

---

**审计完成日期**: 2026-02-01  
**审计员**: AI Assistant (Claude Sonnet 4.5)  
**审计版本**: 完整系统审计 v1.0
