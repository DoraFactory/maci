# State Tree Root 查询功能

## 概述

为了支持测试和调试，我们在 MACI 和 AMACI 合约中添加了查询状态树根节点的功能。

## 新增功能

### 1. 合约查询方法

#### API-MACI 合约 (`contracts/api-maci`)

**QueryMsg 新增**:
```rust
#[returns(Uint256)]
GetStateTreeRoot {},
```

**实现位置**: `contracts/api-maci/src/contract.rs`
```rust
QueryMsg::GetStateTreeRoot {} => to_json_binary::<Uint256>(&state_root(deps)),
```

#### AMACI 合约 (`contracts/amaci`)

**QueryMsg 新增**:
```rust
#[returns(Uint256)]
GetStateTreeRoot {},
```

**实现位置**: `contracts/amaci/src/contract.rs`
```rust
QueryMsg::GetStateTreeRoot {} => to_json_binary::<Uint256>(&state_root(deps)),
```

### 2. 内部实现

两个合约都使用相同的内部函数来获取状态树根：

```rust
fn state_root(deps: Deps) -> Uint256 {
    let root = NODES
        .load(
            deps.storage,
            Uint256::from_u128(0u128).to_be_bytes().to_vec(),
        )
        .unwrap();
    root
}
```

这个函数直接从存储中读取索引为 0 的节点，即五叉树的根节点。

## 使用方法

### TypeScript/JavaScript 调用示例

```typescript
// 使用 ContractClient 查询
const stateTreeRoot = await maciContract.query({ 
  get_state_tree_root: {} 
});

console.log(`State Tree Root: ${stateTreeRoot}`);
```

### CosmWasm 智能查询

```json
{
  "get_state_tree_root": {}
}
```

返回值：
```json
"21526503558325068664033192388586640128492121680588893182274749683522508994597"
```

## 测试验证

### MACI 增量更新验证

```typescript
// 注册用户后
const numSignUps = await maciContract.query({ get_num_sign_up: {} });

// 查询当前状态根（可能不是最新的，因为使用增量更新）
const contractRoot = await maciContract.query({ get_state_tree_root: {} });
const sdkRoot = operator.stateTree!.root.toString();

console.log(`Contract: ${contractRoot}`);
console.log(`SDK:      ${sdkRoot}`);
console.log(`Note: Roots may differ due to incremental update strategy`);
```

### MACI Start Process 后完整验证

```typescript
// 启动处理周期（触发完整更新）
await maciContract.startProcessPeriod();

// 现在根应该匹配
const contractRoot = await maciContract.query({ get_state_tree_root: {} });
const sdkRoot = operator.stateTree!.root.toString();

expect(contractRoot).to.equal(sdkRoot); // 应该相等
```

### AMACI 实时验证

```typescript
// AMACI 每次注册后都完整更新，根应该始终匹配
for (let i = 0; i < numUsers; i++) {
  await amaciContract.signUp(pubkey, certificate);
  operator.initStateTree(i, pubkey, 100n, [0n, 0n, 0n, 0n]);
  
  const contractRoot = await amaciContract.query({ get_state_tree_root: {} });
  const sdkRoot = operator.stateTree!.root.toString();
  
  expect(contractRoot).to.equal(sdkRoot); // 始终相等
}
```

## 行为差异

### MACI (增量更新)

- **注册阶段**: 根节点可能不是最新的
  - 只有当叶子索引是 5 的倍数时才向上传播更新
  - 查询返回的根可能反映部分更新的状态
  
- **Start Process 后**: 根节点是最新的
  - `start_process_period` 执行完整更新（`full=true`）
  - 查询返回的根反映所有用户的最终状态

### AMACI (完整更新)

- **任何时候**: 根节点都是最新的
  - 每次用户注册都更新到根
  - 查询始终返回准确的状态树根

## 性能考虑

### 查询成本

- **Gas 消耗**: 极低
  - 只需要一次存储读取操作
  - 读取的是索引 0 的节点（根节点）

### 存储位置

```rust
// 根节点存储位置
NODES: Map<Vec<u8>, Uint256>
key = Uint256::from_u128(0u128).to_be_bytes()
```

## 应用场景

### 1. 测试验证
- 验证合约与 SDK 的状态树一致性
- 测试增量更新 vs 完整更新的行为
- 调试状态树计算问题

### 2. 监控和审计
- 监控状态树的变化
- 验证零知识证明的输入
- 审计投票系统的状态

### 3. 前端集成
- 显示当前状态树根
- 验证链下计算与链上状态的一致性
- 提供实时状态反馈

## 相关文件

### 合约代码
- `contracts/api-maci/src/msg.rs` - MACI 消息定义
- `contracts/api-maci/src/contract.rs` - MACI 查询实现
- `contracts/amaci/src/msg.rs` - AMACI 消息定义
- `contracts/amaci/src/contract.rs` - AMACI 查询实现

### 测试代码
- `e2e/tests/state-tree.e2e.test.ts` - 状态树 E2E 测试
- 验证 MACI 和 AMACI 的不同更新策略
- 对比合约根与 SDK 根的一致性

### 文档
- `STATE_UPDATE_ANALYSIS.md` - 状态更新详细分析
- `STATE_UPDATE_VISUALIZATION.md` - 可视化说明
- `STATE_UPDATE_README.md` - 导览指南

## 编译和部署

### 编译合约

```bash
# 编译所有合约
cargo build --release --target wasm32-unknown-unknown

# 或者分别编译
cargo build --release --target wasm32-unknown-unknown --lib --package cw-api-maci
cargo build --release --target wasm32-unknown-unknown --lib --package cw-amaci
```

### 生成的 WASM 文件

```
target/wasm32-unknown-unknown/release/cw_api_maci.wasm
target/wasm32-unknown-unknown/release/cw_amaci.wasm
```

## 运行测试

```bash
cd e2e
npm test -- state-tree.e2e.test.ts
```

测试将验证：
- ✅ SDK Tree 实现的正确性
- ✅ MACI 增量更新行为
- ✅ MACI Start Process 的完整更新
- ✅ AMACI 完整更新行为
- ✅ 合约与 SDK 的状态根一致性

## 总结

添加 `GetStateTreeRoot` 查询方法提供了：

1. **透明性**: 可以直接查询合约的状态树根
2. **可验证性**: 可以对比链上状态与链下计算
3. **可调试性**: 帮助定位状态树计算问题
4. **完整性**: 补充了合约的查询接口

这个功能对于测试、监控和审计 MACI/AMACI 投票系统非常重要。

