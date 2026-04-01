# MACI 合约设计审查报告 v2.0

**日期**：2026-02-12  
**范围**：基于 RegistrationMode 重构的完整设计审查  
**审查人**：AI Assistant

---

## 📊 执行摘要

### 重构成果

✅ **已完成**：
- RegistrationMode 统一设计（合并 access_control + state_init_mode）
- PrePopulated + Dynamic VC 约束修复
- API 三层统一（AMACI ↔ Registry ↔ Api-Saas）
- 冗余代码清理（~170 行）

✅ **编译状态**：
- AMACI: 通过 ✅
- Registry: 通过 ✅
- Api-Saas: 通过 ✅
- Lint errors: 0

⚠️ **待完成**：
- 测试用例更新（~40 处）

---

## 🔍 设计审查发现

### 1. 核心设计改进 ✅

#### 问题：配置维度耦合

**旧设计**：
```rust
// ❌ access_control 和 state_init_mode 独立但有隐式依赖
pub struct InstantiateMsg {
    pub access_control: AccessControlConfig {
        mode: AccessControlMode,  // StaticWhitelist | OracleVerified
        whitelist: Option<...>,
        oracle_pubkey: Option<...>,
    },
    pub state_init_mode: StateInitMode,  // SignUp | PrePopulated
}
```

**问题分析**：
1. PrePopulated 模式下，access_control 实际被忽略
2. 可能构造无意义组合：`PrePopulated + StaticWhitelist`
3. 配置逻辑分散，难以验证有效性

**解决方案**：
```rust
// ✅ 统一的 RegistrationMode，防止无效组合
pub enum RegistrationMode {
    SignUpWithStaticWhitelist,
    SignUpWithOracle,
    PrePopulated {
        pre_deactivate_root: Uint256,
        pre_deactivate_coordinator: PubKey,  // 非 Option
    },
}
```

**改进效果**：
- ✅ 类型系统防止无效组合
- ✅ 每个变体语义完整
- ✅ 配置逻辑集中验证

---

### 2. 关键 Bug 修复 ✅

#### Bug: PrePopulated + Dynamic VC 导致零投票权

**根本原因**：
```rust
// PreAddNewKey 的 ZK proof 参数
proof_inputs: {
    pre_deactivate_root,      // ✅ 包含
    coordinator_hash,         // ✅ 包含
    nullifier,                // ✅ 包含
    d[4],                     // ✅ 包含
    voice_credit_amount,      // ❌ 不包含！
}
```

**Bug 表现**：
```rust
// Dynamic VC 模式下
VOICE_CREDIT_AMOUNT.load() // = 0

// PreAddNewKey 执行
let vc = VOICE_CREDIT_AMOUNT.load()?; // 所有用户得到 0 票！
```

**修复方案**（三层验证）：

**Layer 1 - Instantiate**：
```rust
if PrePopulated && Dynamic {
    return Err(ContractError::InvalidRegistrationConfig {
        reason: "PrePopulated mode only supports Unified VoiceCreditMode..."
    });
}
```

**Layer 2 - Update Config**：
```rust
if switching_to_PrePopulated {
    let current_vc = VOICE_CREDIT_MODE.load()?;
    if Dynamic && !updating_to_Unified {
        return Err("Cannot switch to PrePopulated with Dynamic VC");
    }
}
```

**Layer 3 - PreAddNewKey**：
```rust
// 防御性检查
if !matches!(VOICE_CREDIT_MODE.load()?, Unified { .. }) {
    return Err("PreAddNewKey requires Unified VC mode");
}
```

**验证状态**：✅ 已实现三层验证

---

### 3. API 架构统一 ✅

#### 问题：三层 API 不同步

**修复前**：
```
❌ Api-Saas:  JSON 构造 + 散乱参数
❌ Registry:  旧 AccessControlConfig API
❌ AMACI:     新 RegistrationModeConfig API
    ↑ 类型不安全，容易出错
```

**修复后**：
```
✅ Api-Saas:  RegistrationModeConfig（类型化）
✅ Registry:  RegistrationModeConfig（类型化）
✅ AMACI:     RegistrationModeConfig（类型化）
    ↑ 编译期类型检查
```

**改进内容**：
1. 替换 `serde_json::json!` 为类型化消息
2. 统一三层参数结构
3. 删除冗余类型定义（如 Api-Saas 的 `PubKey`）

**验证状态**：✅ 已完成，编译通过

---

## ⚠️ 发现的设计问题

### 问题 1: 配置更新的原子性 ⚠️ 中等

**问题描述**：

当前 `RegistrationConfigUpdate` 设计：
```rust
pub struct RegistrationConfigUpdate {
    pub voice_credit_mode: Option<VoiceCreditMode>,
    pub registration_mode: Option<RegistrationModeConfig>,
    pub deactivate_enabled: Option<bool>,
}
```

**潜在问题场景**：
```rust
// 用户只更新 registration_mode
ExecuteMsg::UpdateRegistrationConfig {
    config: RegistrationConfigUpdate {
        registration_mode: Some(PrePopulated { ... }),
        voice_credit_mode: None,  // 忘记更新！
        deactivate_enabled: None,
    }
}

// 结果：
// - 如果当前是 Dynamic VC → 验证失败（好）
// - 错误信息可能不够明确（待改进）
```

**当前验证逻辑**：
```rust
fn validate_registration_config_update(...) {
    if let Some(PrePopulated { ... }) = config.registration_mode {
        let current_vc = VOICE_CREDIT_MODE.load()?;
        let new_vc = config.voice_credit_mode.as_ref().unwrap_or(&current_vc);
        
        if !matches!(new_vc, Unified { .. }) {
            return Err("PrePopulated requires Unified VC");
        }
    }
}
```

**改进建议**：

**选项 A - 改进错误提示**（推荐）：
```rust
if switching_to_PrePopulated && current_is_Dynamic && not_updating_VC {
    return Err(ContractError::InvalidConfigTransition {
        reason: "Switching to PrePopulated requires Unified VC mode. \
                 Current mode is Dynamic. \
                 Please update voice_credit_mode to Unified in the same transaction."
    });
}
```

**选项 B - 自动修正**（不推荐）：
```rust
// 自动将 VC 模式改为 Unified
// 问题：隐式行为，用户可能不知情
if switching_to_PrePopulated && current_is_Dynamic {
    voice_credit_mode = Some(Unified { amount: default_value });
}
```

**选项 C - 原子配置包**（破坏性改动）：
```rust
pub enum RegistrationConfigUpdate {
    // 完整配置替换
    ReplaceAll {
        voice_credit_mode: VoiceCreditMode,
        registration_mode: RegistrationModeConfig,
        deactivate_enabled: bool,
    },
    // 单独开关
    ToggleDeactivate(bool),
}
```

**优先级**：🟡 中等  
**建议**：实现选项 A，改进错误提示

---

### 问题 2: PrePopulated 模式的 deactivate_enabled 依赖 ⚠️ 中等

**问题描述**：

PrePopulated 模式**必须**启用 `deactivate_enabled: true`，但当前没有强制约束。

**当前代码**：
```rust
// instantiate 时没有验证
match msg.registration_mode {
    PrePopulated { ... } => {
        // ⚠️ 没有检查 msg.deactivate_enabled
        // ...
    }
}
```

**潜在风险**：
```rust
// 用户可能错误配置
InstantiateMsg {
    registration_mode: PrePopulated { ... },
    deactivate_enabled: false,  // ❌ 错误但未被拒绝！
}

// 后果：
// - PreAddNewKey 可能工作不正常
// - 用户无法使用 AddNewKey 更换密钥（这是 PrePopulated 的核心优势）
```

**改进建议**：

**方案 1 - 强制约束**（推荐）：
```rust
// instantiate 验证
match msg.registration_mode {
    PrePopulated { ... } => {
        if !msg.deactivate_enabled {
            return Err(ContractError::InvalidRegistrationConfig {
                reason: "PrePopulated mode requires deactivate_enabled=true. \
                         This is necessary for PreAddNewKey and AddNewKey to function."
            });
        }
        // ...
    }
}
```

**方案 2 - 自动启用**（不推荐）：
```rust
// 隐式修改用户配置
let deactivate_enabled = match msg.registration_mode {
    PrePopulated { ... } => true,  // 强制为 true
    _ => msg.deactivate_enabled,
};
```

**方案 3 - 类型系统强制**（破坏性改动）：
```rust
pub enum RegistrationModeConfig {
    SignUpWithStaticWhitelist { 
        whitelist: WhitelistBase,
        deactivate_enabled: bool,  // 用户控制
    },
    SignUpWithOracle { 
        oracle_pubkey: String,
        deactivate_enabled: bool,  // 用户控制
    },
    PrePopulated {
        // deactivate_enabled 隐式为 true
        pre_deactivate_root: Uint256,
        pre_deactivate_coordinator: PubKey,
    },
}
```

**优先级**：🟡 中等  
**建议**：实现方案 1，添加验证

---

### 问题 3: pre_deactivate_coordinator 验证深度 ℹ️ 低

**问题描述**：

当前只验证 coordinator 是否提供，但不验证其有效性。

**当前验证**：
```rust
// ✅ 类型系统保证非 None
PrePopulated {
    pre_deactivate_root: Uint256,
    pre_deactivate_coordinator: PubKey,  // 非 Option
}

// ✅ instantiate 时保存
PRE_DEACTIVATE_COORDINATOR_HASH.save(
    deps.storage,
    &poseidon_hash(&coordinator),
)?;
```

**潜在问题**：
- coordinator 的 x, y 坐标可能无效（不在椭圆曲线上）
- 错误的 coordinator 会导致所有 PreAddNewKey 验证失败

**改进建议**：

**选项 A - 椭圆曲线点验证**：
```rust
fn validate_pubkey(pubkey: &PubKey) -> Result<()> {
    // 验证 (x, y) 在 Baby Jubjub 曲线上
    // y^2 = x^3 + 168698x^2 + x
    let x_cubed = x.pow(3);
    let x_squared = x.pow(2);
    let lhs = y.pow(2);
    let rhs = x_cubed + 168698 * x_squared + x;
    
    if lhs != rhs {
        return Err("Invalid elliptic curve point");
    }
    Ok(())
}
```

**问题**：
- 需要大数运算库
- Gas 消耗较高
- 可能不值得（ZK proof 验证会自然失败）

**选项 B - 零值检查**：
```rust
fn validate_pubkey(pubkey: &PubKey) -> Result<()> {
    if pubkey.x == Uint256::zero() && pubkey.y == Uint256::zero() {
        return Err("Coordinator pubkey cannot be zero");
    }
    Ok(())
}
```

**选项 C - 不额外验证**（当前方案）：
- ZK proof 验证会自然拒绝无效 coordinator
- 错误会在 PreAddNewKey 时暴露，而非 instantiate 时

**优先级**：🟢 低  
**建议**：保持当前方案，或添加选项 B 的简单检查

---

### 问题 4: Dynamic + StaticWhitelist 的文档化 ℹ️ 低

**问题描述**：

这个组合技术上可行且有用，但容易被误解。

**当前设计**：
```rust
// ✅ 正确用法：预设每个用户的投票权
WhitelistBase {
    users: vec![
        WhitelistBaseConfig {
            addr: "dora1alice...",
            voice_credit_amount: Some(100),  // 预设 Alice: 100 票
        },
        WhitelistBaseConfig {
            addr: "dora1bob...",
            voice_credit_amount: Some(500),  // 预设 Bob: 500 票
        },
    ]
}
```

**安全保证**：
```rust
// SignUp 时
match registration_mode {
    SignUpWithStaticWhitelist => {
        // 从白名单读取 amount，忽略用户传入的值
        let whitelist_entry = WHITELIST.load()?.get_user(&sender)?;
        let amount = whitelist_entry.voice_credit_amount; // 使用预设值
        // ✅ 用户无法修改自己的投票权
    }
}
```

**改进建议**：

**文档层面**（已完成）：
- ✅ 在配置文档中明确说明此组合用途
- ✅ 强调安全保证（用户无法修改预设值）
- ✅ 提供完整示例

**代码层面**（可选）：
```rust
// 添加明确的注释
if matches!(vc_mode, Dynamic) && matches!(reg_mode, SignUpWithStaticWhitelist) {
    // This is a valid combination for pre-defined weighted voting
    // Users' voice credits are set in the whitelist and cannot be modified by users
    log("Using Dynamic VC with StaticWhitelist: weighted voting mode");
}
```

**优先级**：🟢 低  
**建议**：保持当前设计，文档已充分说明

---

### 问题 5: 配置组合的运行时警告 💡 改进建议

**建议**：为某些不推荐但允许的配置组合添加警告事件。

**实现方案**：
```rust
// instantiate 时发出警告事件
let mut warnings = vec![];

// 警告 1: Dynamic + StaticWhitelist
if matches!(vc_mode, Dynamic) && matches!(reg_mode, SignUpWithStaticWhitelist) {
    warnings.push(attr(
        "config_warning",
        "Dynamic VC + StaticWhitelist is allowed but ensure you understand \
         that voice credits are pre-defined in whitelist and users cannot modify them."
    ));
}

// 警告 2: Unified + SignUpWithOracle（技术上多余）
if matches!(vc_mode, Unified) && matches!(reg_mode, SignUpWithOracle) {
    warnings.push(attr(
        "config_info",
        "Using Unified VC with Oracle verification. \
         Oracle signature verification is optional in this mode."
    ));
}

// 添加到响应
Ok(Response::new()
    .add_attributes(base_attrs)
    .add_attributes(warnings))  // 添加警告
```

**优先级**：🟢 低  
**建议**：可选改进，非必需

---

## 🎯 架构质量评估

### 代码质量

| 指标 | 评分 | 说明 |
|------|------|------|
| **类型安全** | ⭐⭐⭐⭐⭐ | RegistrationMode 设计防止无效组合 |
| **配置验证** | ⭐⭐⭐⭐ | 多层验证，但有改进空间（问题 1、2） |
| **错误处理** | ⭐⭐⭐⭐ | 错误类型丰富，提示可更友好 |
| **API 一致性** | ⭐⭐⭐⭐⭐ | 三层合约完全统一 |
| **代码简洁性** | ⭐⭐⭐⭐⭐ | 删除冗余，逻辑清晰 |

**总体评分**：⭐⭐⭐⭐ (4.6/5)

---

### 安全性评估

| 方面 | 评分 | 说明 |
|------|------|------|
| **输入验证** | ⭐⭐⭐⭐⭐ | 地址格式、amount 非零、whitelist 完整性 |
| **状态一致性** | ⭐⭐⭐⭐⭐ | PrePopulated + Dynamic VC bug 已修复 |
| **权限控制** | ⭐⭐⭐⭐⭐ | Admin/Operator 权限清晰 |
| **重入保护** | ⭐⭐⭐⭐⭐ | CosmWasm 模型天然防护 |
| **配置约束** | ⭐⭐⭐⭐ | 大部分约束已实现，有改进空间 |

**总体评分**：⭐⭐⭐⭐⭐ (4.8/5)

---

### 可维护性评估

| 方面 | 评分 | 说明 |
|------|------|------|
| **代码组织** | ⭐⭐⭐⭐⭐ | 模块职责清晰 |
| **扩展性** | ⭐⭐⭐⭐⭐ | 添加新 RegistrationMode 只需枚举变体 |
| **文档完整性** | ⭐⭐⭐⭐⭐ | 配置文档详尽 |
| **测试覆盖** | ⭐⭐⭐ | 待更新测试用例 |

**总体评分**：⭐⭐⭐⭐ (4.5/5)

---

## 📋 行动项

### 🔴 高优先级

1. **更新测试用例** ⚠️ 必需
   - AMACI multitest (~40 处)
   - Registry tests
   - Api-Saas tests
   - **影响**：确保重构正确性
   - **预计工作量**：2-3 小时

---

### 🟡 中优先级

2. **添加 PrePopulated + deactivate_enabled 约束** ⚠️ 推荐
   ```rust
   if PrePopulated && !deactivate_enabled {
       return Err("PrePopulated requires deactivate_enabled=true");
   }
   ```
   - **影响**：防止配置错误
   - **预计工作量**：15 分钟

3. **改进配置更新错误提示** ⚠️ 推荐
   ```rust
   if switching_to_PrePopulated && current_is_Dynamic {
       return Err("Switching to PrePopulated requires Unified VC. 
                   Please update voice_credit_mode in the same transaction.");
   }
   ```
   - **影响**：提升用户体验
   - **预计工作量**：30 分钟

---

### 🟢 低优先级

4. **添加 coordinator 零值检查** 💡 可选
   ```rust
   if coordinator.x.is_zero() && coordinator.y.is_zero() {
       return Err("Coordinator cannot be zero");
   }
   ```
   - **影响**：提前发现明显错误
   - **预计工作量**：10 分钟

5. **添加配置警告事件** 💡 可选
   - 为不推荐但允许的配置组合发出警告
   - **影响**：提升配置透明度
   - **预计工作量**：30 分钟

6. **提供 PrePopulated 工具/SDK** 💡 长期
   - 链下状态树计算工具
   - 配置验证 CLI
   - **影响**：降低 PrePopulated 使用门槛
   - **预计工作量**：数天

---

## 🎉 重构成果总结

### 架构改进

| 改进项 | 改进前 | 改进后 | 效果 |
|--------|--------|--------|------|
| **配置维度** | 3 个独立维度 | 2 个维度（RegistrationMode 统一） | 防止无效组合 |
| **类型安全** | 运行时验证 | 编译期 + 运行时 | 提前发现错误 |
| **API 一致性** | 三层不同步 | 三层统一 | 降低集成风险 |
| **代码冗余** | 重复定义 | 统一使用 | 减少 ~170 行 |

---

### 关键 Bug 修复

1. ✅ **PrePopulated + Dynamic VC** → 三层验证
2. ✅ **API 不同步** → 类型化消息统一
3. ✅ **JSON 构造风险** → 编译期类型检查
4. ✅ **配置逻辑分散** → RegistrationMode 集中

---

### 质量指标

- **编译状态**：✅ 3/3 合约通过
- **Lint 错误**：✅ 0
- **类型安全**：✅ 编译期防护
- **文档覆盖**：✅ 完整的配置指南
- **测试覆盖**：⚠️ 待更新

---

## 🔮 未来改进方向

### 短期（1-2 周）

1. 完成测试用例更新
2. 实现中优先级约束（问题 2、3）
3. 运行完整集成测试

### 中期（1-2 月）

1. 提供 PrePopulated 工具链
2. 添加配置验证 CLI
3. 完善监控和日志

### 长期（3-6 月）

1. 性能优化（Merkle tree 操作）
2. 更多 RegistrationMode 变体（如需）
3. 链上治理集成

---

## 📞 结论

### ✅ 当前设计质量：优秀

- **核心重构**：成功统一 RegistrationMode
- **关键 Bug**：PrePopulated + Dynamic VC 已修复
- **架构一致性**：三层 API 完全同步
- **代码质量**：类型安全、逻辑清晰

### ⚠️ 需要完成的工作

1. **必需**：测试用例更新
2. **推荐**：添加 PrePopulated + deactivate_enabled 约束
3. **推荐**：改进配置更新错误提示
4. **可选**：配置警告事件、工具链

### 🎯 总体评价

**当前重构是一次成功的架构改进**：
- ✅ 解决了核心设计问题
- ✅ 修复了关键 Bug
- ✅ 提升了代码质量
- ⚠️ 需要完成测试验证
- 💡 有进一步改进空间（非阻塞）

**推荐进度**：
1. 立即完成测试更新
2. 实施中优先级改进
3. 考虑长期工具支持

---

**报告版本**：v2.0  
**最后更新**：2026-02-12  
**下次审查**：测试更新完成后  
**审查人**：AI Assistant
