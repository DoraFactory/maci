# Registry 创建 Round 事件属性对比

## AMACI Round 创建事件 (`reply_created_round`)

### 基础信息
- `action`: "created_round"
- `code_id`: AMACI code ID
- `round_addr`: AMACI 合约地址
- `poll_id`: 分配的 poll ID

### 角色信息
- `caller`: 调用者地址
- `admin`: 管理员地址
- `operator`: Operator 地址

### Coordinator 信息
- `coordinator_pubkey_x`: Coordinator 公钥 X 坐标
- `coordinator_pubkey_y`: Coordinator 公钥 Y 坐标

### 投票信息
- `max_voters`: 最大投票人数
- `vote_option_map`: 投票选项映射（JSON 数组）
- `voice_credit_amount`: 声音积分数量

### 时间信息
- `voting_start`: 投票开始时间（纳秒）
- `voting_end`: 投票结束时间（纳秒）

### Round 基本信息
- `round_title`: Round 标题
- `round_description`: Round 描述（可选）
- `round_link`: Round 链接（可选）

### 电路参数
- `state_tree_depth`: 状态树深度
- `int_state_tree_depth`: 内部状态树深度
- `vote_option_tree_depth`: 投票选项树深度
- `message_batch_size`: 消息批处理大小

### 系统配置
- `circuit_type`: 电路类型
- `certification_system`: 认证系统

### AMACI 特有配置
- `pre_deactivate_root`: 预停用根
- `penalty_rate`: 惩罚率
- `deactivate_timeout`: 停用超时（秒）
- `tally_timeout`: 计票超时（秒）

---

## MACI Round 创建事件 (`reply_created_maci_round`)

### 基础信息
- `action`: "created_maci_round"
- `code_id`: MACI code ID
- `maci_addr`: MACI 合约地址
- `poll_id`: 分配的 poll ID

### 角色信息
- `caller`: 调用者地址（无 admin/operator）

### Coordinator 信息
- `coordinator_pubkey_x`: Coordinator 公钥 X 坐标
- `coordinator_pubkey_y`: Coordinator 公钥 Y 坐标

### 投票信息
- `max_voters`: 最大投票人数
- `vote_option_map`: 投票选项映射（JSON 数组）

### 时间信息
- `voting_start`: 投票开始时间（纳秒）
- `voting_end`: 投票结束时间（纳秒）

### Round 基本信息
- `round_title`: Round 标题
- `round_description`: Round 描述（可选）
- `round_link`: Round 链接（可选）

### 电路参数
- `state_tree_depth`: 状态树深度
- `int_state_tree_depth`: 内部状态树深度
- `vote_option_tree_depth`: 投票选项树深度
- `message_batch_size`: 消息批处理大小

### 系统配置
- `circuit_type`: 电路类型
- `certification_system`: 认证系统

### MACI 特有配置
- `whitelist_backend_pubkey`: 白名单后端公钥
- `whitelist_voting_power_mode`: 白名单投票权重模式

---

## 差异总结

### AMACI 独有属性
1. **角色管理**:
   - `admin`: 管理员地址
   - `operator`: Operator 地址

2. **积分和停用机制**:
   - `voice_credit_amount`: 声音积分
   - `pre_deactivate_root`: 预停用根
   - `penalty_rate`: 惩罚率
   - `deactivate_timeout`: 停用超时
   - `tally_timeout`: 计票超时

### MACI 独有属性
1. **白名单配置**:
   - `whitelist_backend_pubkey`: 白名单后端公钥
   - `whitelist_voting_power_mode`: 投票权重模式（如 OnePersonOneVote, Linear 等）

### 共同属性（命名一致）
- `action` (不同值)
- `code_id`
- `poll_id`
- `caller`
- `coordinator_pubkey_x`
- `coordinator_pubkey_y`
- `max_voters`
- `voting_start`
- `voting_end`
- `round_title`
- `round_description` (可选)
- `round_link` (可选)
- `vote_option_map`
- `state_tree_depth`
- `int_state_tree_depth`
- `vote_option_tree_depth`
- `message_batch_size`
- `circuit_type`
- `certification_system`

### 地址字段命名差异
- AMACI: `round_addr`
- MACI: `maci_addr`

---

## 事件监听建议

### 前端/后端集成
当监听 Registry 合约的创建事件时：

1. **通过 `action` 区分类型**:
   - `action = "created_round"` → AMACI round
   - `action = "created_maci_round"` → MACI round

2. **通用字段**:
   所有 round 都包含的核心字段（poll_id, coordinator, voting_time, round_info 等）

3. **类型特定字段**:
   - AMACI: 需要关注 operator, admin, penalty_rate 等
   - MACI: 需要关注 whitelist 相关配置

### 事件查询示例

```typescript
// 监听所有 Round 创建
const events = await queryEvents({
  type: "wasm",
  attributes: [
    { key: "action", value: "created_round" },
    // OR
    { key: "action", value: "created_maci_round" }
  ]
});

// 提取通用信息
const roundInfo = {
  pollId: event.attributes.find(a => a.key === "poll_id").value,
  address: event.attributes.find(a => 
    a.key === "round_addr" || a.key === "maci_addr"
  ).value,
  title: event.attributes.find(a => a.key === "round_title").value,
  // ... 其他通用字段
};
```

---

## 实现位置

- **AMACI**: `/contracts/registry/src/contract.rs:699-823` (`reply_created_round`)
- **MACI**: `/contracts/registry/src/contract.rs:827-945` (`reply_created_maci_round`)
