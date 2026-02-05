# MACI Fee Structure

## 费用模型差异

### AMACI 费用模型
AMACI 创建时收取完整的电路操作费用：
- **费用计算**: 基于 `max_voter` 和 `max_option` 计算完整的电路费用
- **用途**: 支付完整的电路验证和操作成本
- **公式**: `total_fee = calculate_round_fee_and_params(max_voter, max_option)`

### MACI 费用模型
MACI 创建时只收取管理费用（默认为基础费用的 10%）：
- **费用计算**: 基于同样的电路参数计算基础费用，然后只收取其中的百分比
- **用途**: 仅作为 Registry 管理费用
- **公式**: `management_fee = base_fee × fee_rate` (默认 fee_rate = 10%)

## 实现细节

### Registry 合约中的实现

```rust
// AMACI: 收取完整费用
pub fn execute_create_round(...) {
    let (required_fee, maci_parameters) = 
        calculate_round_fee_and_params(max_voter, max_option)?;
    // required_fee 是完整的电路操作费用
}

// MACI: 只收取管理费
pub fn execute_create_maci_round(...) {
    let circuit_charge_config = CIRCUIT_CHARGE_CONFIG.load(deps.storage)?;
    let (base_fee, _) = 
        calculate_round_fee_and_params(max_voter, max_option)?;
    
    // 只收取基础费用的一定百分比（默认 10%）
    let required_fee = base_fee * circuit_charge_config.fee_rate;
}
```

### API-SaaS 合约中的实现

API-SaaS 通过 Registry 创建 MACI round，也使用相同的 10% 费率：

```rust
pub fn execute_create_maci_round(...) {
    // Calculate base fee
    let (base_fee, _) = 
        cw_amaci_registry::utils::calculate_round_fee_and_params(max_voter, max_option)?;
    
    // For MACI, only charge 10% management fee (same as Registry's default fee_rate)
    let fee_rate = cosmwasm_std::Decimal::from_ratio(1u128, 10u128); // 10% = 0.1
    let required_fee = base_fee * fee_rate;
    
    // Check if SaaS contract has sufficient balance
    let total_balance = TOTAL_BALANCE.load(deps.storage)?;
    if total_balance < required_fee {
        return Err(ContractError::InsufficientBalance { ... });
    }
    
    // Deduct the fee from SaaS balance and forward to Registry
    TOTAL_BALANCE.save(deps.storage, &(total_balance - required_fee))?;
    
    // Call Registry's CreateMaciRound with the calculated fee
    let registry_msg = ExecuteMsg::CreateMaciRound { ... };
    // ... send with funds: required_fee
}
```

**关键点**：
1. API-SaaS 从自己的余额中扣除 10% 管理费
2. 将此费用转发给 Registry
3. Registry 使用这笔费用创建 MACI 合约
4. 两处的费率保持一致（都是 10%）

## 费用率配置

费用率可通过 Registry 合约的 `ChangeChargeConfig` 消息进行调整：

```rust
ExecuteMsg::ChangeChargeConfig {
    config: CircuitChargeConfig {
        fee_rate: Decimal::from_ratio(1u128, 10u128), // 10% = 0.1
    }
}
```

### 默认配置
在 Registry 实例化时设置：
```rust
let circuit_charge_config = CircuitChargeConfig {
    fee_rate: Decimal::from_ratio(1u128, 10u128), // 10%
};
```

**注意**: API-SaaS 中硬编码了 10% 费率。如果 Registry 的费率被修改，API-SaaS 的费率不会自动更新。

## 费用示例

假设某个配置的 `base_fee = 1000 peaka`：

| Round 类型 | 基础费用 | 费用率 | 实际收费 | 说明 |
|-----------|---------|--------|---------|------|
| AMACI | 1000 | 100% | 1000 | 收取完整费用 |
| MACI (直接通过 Registry) | 1000 | 10% | 100 | 只收取管理费 |
| MACI (通过 API-SaaS) | 1000 | 10% | 100 | API-SaaS 扣除 10%，转发给 Registry |

## 响应属性

### Registry 创建 MACI round 时返回的属性

```
action: "create_maci_round"
maci_code_id: "<code_id>"
poll_id: "<poll_id>"
base_fee: "<calculated_base_fee>"
management_fee: "<actual_fee_charged>"
fee_rate: "<fee_rate_percentage>"
```

### API-SaaS 创建 MACI round 时返回的属性

```
action: "create_maci_round_via_registry"
caller: "<caller_address>"
round_title: "<title>"
max_voters: "<max_voters>"
base_fee: "<calculated_base_fee>"
management_fee: "<actual_fee_charged>"
fee_rate: "<fee_rate_percentage>"
```

这样可以清楚地看到：
- `base_fee`: 理论上的完整电路费用
- `management_fee`: 实际收取的管理费
- `fee_rate`: 使用的费用率（默认 0.1 = 10%）

## 费用流程图

### 直接通过 Registry 创建 MACI
```
User → Registry (支付 100 peaka, 10% of base_fee)
       ↓
     Registry 创建 MACI 合约
```

### 通过 API-SaaS 创建 MACI
```
API-SaaS (余额 1000 peaka)
    ↓ 扣除 100 peaka (10% of base_fee)
API-SaaS → Registry (支付 100 peaka)
           ↓
         Registry 创建 MACI 合约

API-SaaS 新余额: 900 peaka
```

## 设计理由

1. **AMACI**: 作为完整的 MACI 实现，需要支付所有电路验证成本
2. **MACI**: 作为轻量级的投票系统，只需要收取平台管理费用，降低使用门槛
3. **API-SaaS**: 作为中间层，从预充值余额中扣除费用，简化用户操作流程

## 相关文件

- **Registry**: `/contracts/registry/src/contract.rs:274-380` (`execute_create_maci_round`)
- **API-SaaS**: `/contracts/api-saas/src/contract.rs:402-491` (`execute_create_maci_round`)
- **费用计算**: `/contracts/registry/src/utils.rs` (`calculate_round_fee_and_params`)
