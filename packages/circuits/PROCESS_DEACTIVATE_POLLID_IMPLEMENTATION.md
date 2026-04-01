# ProcessDeactivate Poll ID 验证实现报告

## 修改日期
2026-02-01

## 修改目标
为 `processDeactivate.circom` 电路添加 Poll ID 验证功能，防止跨投票轮次的重放攻击。

## 安全问题分析

### 漏洞场景
在没有 Poll ID 验证的情况下：
```
1. Alice 在 Poll 1 中发送停用请求
2. 攻击者捕获这个停用消息
3. 在 Poll 2 中重放这个消息
4. Alice 在 Poll 2 中被意外停用（即使她想在 Poll 2 中投票）
```

### 解决方案
通过验证消息中的 `cmdPollId` 与电路期望的 `expectedPollId` 匹配，确保停用消息只能在指定的 poll 中有效。

## 电路修改详情

### 1. ProcessDeactivateMessages 模板

#### 添加输入信号
```circom
// Line 89-90
// Expected poll ID for replay attack prevention
signal input expectedPollId;
```

#### 更新 InputHasher 调用
```circom
// Line 109
inputHasher.expectedPollId <== expectedPollId;
```

#### 传递参数给 ProcessOne
```circom
// Line 235
processors[i].cmdPollId <== commands[i].pollId;

// Line 243
processors[i].expectedPollId <== expectedPollId;
```

### 2. ProcessOne 模板

#### 添加输入信号
```circom
// Line 302
signal input cmdPollId;

// Line 307
signal input expectedPollId;
```

#### 添加 Poll ID 验证逻辑
```circom
// Lines 338-347
// 1.3 Verify Poll ID matches (prevent replay attacks across different polls)
component validPollId = IsEqual();
validPollId.in[0] <== cmdPollId;
validPollId.in[1] <== expectedPollId;

component valid = IsEqual();
valid.in[0] <== 3;  // Changed from 2 to 3
valid.in[1] <== validSignature.valid +
                1 - decryptCurrentIsActive.isOdd +
                validPollId.out;  // Added poll ID validation
```

#### 验证逻辑说明
停用消息有效需要满足三个条件：
1. ✅ `validSignature.valid = 1` - 签名有效
2. ✅ `1 - decryptCurrentIsActive.isOdd = 1` - 用户当前是活跃状态（未停用）
3. ✅ `validPollId.out = 1` - Poll ID 匹配

### 3. ProcessDeactivateMessagesInputHasher 模板

#### 添加输入并更新哈希计算
```circom
// Line 478
signal input expectedPollId;

// Lines 489-496
// 2. Hash the 8 inputs with SHA256 (changed from 7 to 8)
component hasher = Sha256Hasher(8);
hasher.in[0] <== newDeactivateRoot;
hasher.in[1] <== pubKeyHasher.hash;
hasher.in[2] <== batchStartHash;
hasher.in[3] <== batchEndHash;
hasher.in[4] <== currentDeactivateCommitment;
hasher.in[5] <== newDeactivateCommitment;
hasher.in[6] <== currentStateRoot;
hasher.in[7] <== expectedPollId;  // Added
```

## 数据流图

```
Contract (AMACI)
    │
    ├─> expectedPollId (from poll state)
    │
    ↓
ProcessDeactivateMessages
    │
    ├─> InputHasher (includes expectedPollId in public input hash)
    │
    ├─> MessageToCommand (extracts pollId from encrypted message)
    │       │
    │       └─> commands[i].pollId
    │
    └─> ProcessOne (for each message)
            │
            ├─> cmdPollId = commands[i].pollId
            ├─> expectedPollId (from contract)
            │
            └─> validPollId.out = IsEqual(cmdPollId, expectedPollId)
                    │
                    └─> valid = validSignature + isActive + validPollId
```

## 后续需要的修改

### 1. 合约代码 (contracts/amaci/src/contract.rs)

需要修改的函数：
- `processDeactivate` - 添加 `expectedPollId` 参数
- 输入哈希计算 - 包含 `expectedPollId`

```rust
// 伪代码示例
pub fn process_deactivate(
    // ... existing params ...
    expected_poll_id: Uint256,
) -> Result<Response, ContractError> {
    // Get current poll ID from state
    let current_poll_id = POLL_ID.load(deps.storage)?;
    
    // Calculate input hash (now includes 8 inputs instead of 7)
    let input_hash = calculate_input_hash(
        new_deactivate_root,
        coord_pub_key_hash,
        batch_start_hash,
        batch_end_hash,
        current_deactivate_commitment,
        new_deactivate_commitment,
        current_state_root,
        expected_poll_id,  // NEW
    );
    
    // Verify proof with updated input hash
    // ...
}
```

### 2. SDK 代码 (packages/sdk/src/operator.ts)

需要修改的函数：
- `OperatorClient.processDeactivate` - 添加 `expectedPollId` 参数

```typescript
// 伪代码示例
async processDeactivate(
    // ... existing params ...
    expectedPollId: bigint,
): Promise<ProcessDeactivateResult> {
    // Generate proof inputs
    const circuitInputs = {
        // ... existing inputs ...
        expectedPollId: expectedPollId.toString(),
    };
    
    // Generate proof
    const proof = await generateProof(circuitInputs);
    
    // Call contract with expectedPollId
    // ...
}
```

### 3. 测试代码

需要添加的测试用例：

#### A. 正常情况测试
```typescript
it('should accept deactivate message with matching poll ID', async () => {
    const expectedPollId = 1n;
    const cmdPollId = 1n;  // Match
    // Test should pass
});
```

#### B. Poll ID 不匹配测试
```typescript
it('should reject deactivate message with mismatched poll ID', async () => {
    const expectedPollId = 2n;
    const cmdPollId = 1n;  // Mismatch
    // Test should fail - message invalid
});
```

#### C. 重放攻击防护测试
```typescript
it('should prevent replay attacks across polls', async () => {
    // 1. User deactivates in Poll 1
    const poll1Message = createDeactivateMessage(pollId: 1);
    await processDeactivate(poll1Message, expectedPollId: 1);  // Success
    
    // 2. Attacker tries to replay in Poll 2
    await processDeactivate(poll1Message, expectedPollId: 2);  // Should fail
});
```

### 4. 电路编译和测试

需要重新编译的电路：
```bash
cd packages/circuits
pnpm run compile:amaci  # 重新编译 AMACI 电路
pnpm test:processDeactivate  # 运行测试（需要先更新测试）
```

## 兼容性影响

### 破坏性变更
⚠️ **这是一个破坏性变更**

1. **电路接口变更**：
   - 输入数量从 N 个增加到 N+1 个（添加 `expectedPollId`）
   - InputHasher 从 7 个输入改为 8 个输入

2. **合约接口变更**：
   - `processDeactivate` 函数需要新的 `expectedPollId` 参数

3. **proof 不兼容**：
   - 使用旧电路生成的 proof 无法在新电路中验证
   - 需要重新生成所有 trusted setup 文件

### 迁移建议

1. **开发环境**：
   - 直接应用所有修改
   - 重新编译电路和合约
   - 更新测试

2. **测试网部署**：
   - 部署新的电路验证合约
   - 更新 AMACI 合约
   - 通知所有集成方更新 SDK

3. **主网部署**（如果已上线）：
   - 需要合约升级
   - 协调所有运营商更新
   - 提前公告给用户

## 安全性提升

### 攻击向量消除

✅ **Poll 间重放攻击** - 已防护
```
Before: 攻击者可以在不同 poll 中重放停用消息
After: Poll ID 验证确保消息只在指定 poll 有效
```

✅ **一致性保证**
```
投票消息和停用消息现在使用相同的安全机制
```

### 验证层级

```
Level 1: Contract - 检查 poll 状态
         ↓
Level 2: Circuit - 验证 poll ID 匹配
         ↓
Level 3: Signature - 验证消息签名
         ↓
Level 4: State - 验证用户活跃状态
```

## 性能影响

### 电路约束数增加
- 新增 1 个 `IsEqual` 组件
- 新增 1 个加法运算
- InputHasher 从 7 输入增加到 8 输入

**预估约束增加**：约 10-20 个约束（相对于整个电路约束数可忽略）

### 证明生成时间
预计增加 < 1%（几乎无影响）

### Gas 成本
InputHash 计算多了 1 个输入，预计增加约 100-200 gas

## 验证清单

在部署到生产环境前，确保完成以下检查：

- [ ] 电路修改完成并编译通过
- [ ] 合约代码已更新
- [ ] SDK 代码已更新
- [ ] 单元测试已更新并通过
- [ ] 集成测试已通过
- [ ] 重放攻击测试已添加并通过
- [ ] 文档已更新
- [ ] 审计报告已完成（如需要）

## 总结

本次修改成功为 ProcessDeactivate 电路添加了 Poll ID 验证功能，消除了一个潜在的重放攻击漏洞。修改遵循了与投票消息处理相同的安全模式，保持了系统的一致性和完整性。

**安全等级**: ⬆️ 提升
**性能影响**: ➡️ 可忽略
**优先级**: 🔴 高（建议尽快部署）
