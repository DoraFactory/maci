# 统一 MACI 配置指南（v2.0 - RegistrationMode 重构版）

> 本文档基于最新的 RegistrationMode 重构，详细说明统一 MACI 合约的配置和使用

## 📋 目录

1. [重大变更说明](#重大变更说明)
2. [核心设计理念](#核心设计理念)
3. [配置维度详解](#配置维度详解)
4. [准入流程详解](#准入流程详解)
5. [常见配置组合](#常见配置组合)
6. [配置约束矩阵](#配置约束矩阵)
7. [配置更新机制](#配置更新机制)
8. [设计问题分析](#设计问题分析)
9. [快速参考](#快速参考)

---

## 🔥 重大变更说明

### v2.0 重构核心变化

#### **从三维独立配置 → 两维配置**

**旧设计（v1.x）**：
```rust
// ❌ 三个独立维度，可能产生无效组合
pub struct InstantiateMsg {
    pub voice_credit_mode: VoiceCreditMode,
    pub access_control: AccessControlConfig {
        mode: AccessControlMode,      // StaticWhitelist | OracleVerified
        whitelist: Option<...>,
        oracle_pubkey: Option<...>,
    },
    pub state_init_mode: StateInitMode,  // SignUp | PrePopulated
}
```

**新设计（v2.0）**：
```rust
// ✅ 统一的 RegistrationMode，防止无效组合
pub struct InstantiateMsg {
    pub voice_credit_mode: VoiceCreditMode,
    pub registration_mode: RegistrationModeConfig {
        // 三种互斥的注册模式，每种都包含完整配置
        SignUpWithStaticWhitelist { whitelist },
        SignUpWithOracle { oracle_pubkey },
        PrePopulated { pre_deactivate_root, pre_deactivate_coordinator },
    },
}
```

#### **关键改进**

1. **类型安全**：无效组合在编译期被拒绝
   ```rust
   // ❌ 旧设计允许：PrePopulated + StaticWhitelist（无意义）
   // ✅ 新设计：PrePopulated 不需要 access_control
   ```

2. **配置约束强化**：PrePopulated 只支持 Unified VC
   ```rust
   // ❌ 拒绝：PrePopulated + Dynamic VC
   // ✅ 允许：PrePopulated + Unified VC
   ```

3. **API 三层统一**：AMACI ↔ Registry ↔ Api-Saas 使用相同结构

---

## 核心设计理念

### 配置维度

统一 MACI 合约通过**两个配置维度**实现灵活组合：

```
┌──────────────────────────────────────────────────────┐
│            统一 MACI 合约配置                         │
├──────────────────────────────────────────────────────┤
│                                                       │
│  1️⃣  Voice Credit Mode      - 如何分配投票权        │
│      ├─ Unified: 所有人相同 VC                        │
│      └─ Dynamic: 每人不同 VC                          │
│                                                       │
│  2️⃣  Registration Mode      - 完整的注册准入方式     │
│      ├─ SignUpWithStaticWhitelist: 白名单 + 动态注册  │
│      ├─ SignUpWithOracle: Oracle验证 + 动态注册      │
│      └─ PrePopulated: 预填充 + 批量导入              │
│                                                       │
│  3️⃣  Deactivate Enabled     - 密钥更换功能开关       │
│      ├─ true: 允许 deactivate 和 AddNewKey          │
│      └─ false: 不允许密钥更换                         │
│                                                       │
└──────────────────────────────────────────────────────┘
```

**核心原则**：
- ✅ RegistrationMode 是**互斥**的，一个 round 只能有一种
- ✅ VoiceCreditMode 和 RegistrationMode **正交**（大部分情况）
- ⚠️ **例外**：PrePopulated 模式只支持 Unified VC

---

## 配置维度详解

### 1️⃣ Voice Credit Mode - 投票权分配方式

决定每个用户获得多少投票权（Voice Credits）。

```rust
pub enum VoiceCreditMode {
    // 统一模式：所有人相同的 VC
    Unified { amount: Uint256 },
    
    // 动态模式：每人提供的 amount 直接作为 VC
    Dynamic,
}
```

| 模式 | 说明 | amount 来源 | 适用场景 |
|------|------|------------|---------|
| **Unified** | 所有用户获得相同投票权 | 创建 round 时指定 | 公平投票、一人一票 |
| **Dynamic** | 每个用户投票权不同 | 注册时确定 | 基于资产/贡献的加权投票 |

**配置示例**：

```rust
// Unified 模式：所有人 100 票
voice_credit_mode: VoiceCreditMode::Unified { 
    amount: Uint256::from(100u128) 
}

// Dynamic 模式：每人注册时确定
voice_credit_mode: VoiceCreditMode::Dynamic
```

---

### 2️⃣ Registration Mode - 统一的注册准入方式

**核心变化**：将原来的 `access_control` + `state_init_mode` 合并为统一的 `RegistrationMode`。

```rust
pub enum RegistrationMode {
    // 模式1: 白名单 + 动态注册
    SignUpWithStaticWhitelist,
    
    // 模式2: Oracle验证 + 动态注册
    SignUpWithOracle,
    
    // 模式3: 预填充 + 批量导入（Pre-Deactivate 技术）
    PrePopulated {
        pre_deactivate_root: Uint256,
        pre_deactivate_coordinator: PubKey,
    },
}

// 配置消息使用更详细的结构
pub enum RegistrationModeConfig {
    SignUpWithStaticWhitelist { 
        whitelist: WhitelistBase 
    },
    SignUpWithOracle { 
        oracle_pubkey: String 
    },
    PrePopulated {
        pre_deactivate_root: Uint256,
        pre_deactivate_coordinator: PubKey,
    },
}
```

#### 模式对比

| 模式 | 准入控制 | 状态树填充 | 注册方式 | 适用场景 |
|------|---------|-----------|---------|---------|
| **SignUpWithStaticWhitelist** | 静态白名单 | 动态填充 | 用户调用 SignUp | 小规模固定参与者 |
| **SignUpWithOracle** | 后端签名验证 | 动态填充 | 用户调用 SignUp | 需要复杂验证逻辑 |
| **PrePopulated** | ZK proof 验证 | 预先填充 | 用户调用 PreAddNewKey | 大规模、高匿名性需求 |

#### 模式详解

##### 模式 1: SignUpWithStaticWhitelist

**特点**：
- ✅ 预定义地址白名单
- ✅ 用户通过 `SignUp` 逐个注册
- ✅ 支持 Unified 和 Dynamic VC 模式

**配置示例**：
```rust
registration_mode: RegistrationModeConfig::SignUpWithStaticWhitelist {
    whitelist: WhitelistBase {
        users: vec![
            WhitelistBaseConfig {
                addr: Addr::unchecked("dora1alice..."),
                voice_credit_amount: Some(Uint256::from(100)), // Dynamic VC 需要
            },
            WhitelistBaseConfig {
                addr: Addr::unchecked("dora1bob..."),
                voice_credit_amount: None, // Unified VC 可以为 None
            },
        ],
    },
}
```

**准入流程**：
```
用户 → SignUp → 检查白名单 → 验证通过 → 加入状态树
```

---

##### 模式 2: SignUpWithOracle

**特点**：
- ✅ 后端服务签名验证
- ✅ 用户通过 `SignUp` + certificate 注册
- ✅ 支持 Unified 和 Dynamic VC 模式

**配置示例**：
```rust
registration_mode: RegistrationModeConfig::SignUpWithOracle {
    oracle_pubkey: "04abc123...".to_string(), // secp256k1 pubkey
}
```

**准入流程**：
```
用户 → 向后端请求 certificate → SignUp(certificate) 
     → 验证签名 → 验证通过 → 加入状态树
```

**Certificate 签名内容**：
```json
{
    "amount": "100",
    "contract_address": "3472328296227680304...",
    "pubkey_x": "123...",
    "pubkey_y": "456..."
}
```

---

##### 模式 3: PrePopulated（Pre-Deactivate 技术）

**特点**：
- ⚠️ **只支持 Unified VC 模式**
- ✅ 用户通过 `PreAddNewKey` + ZK proof 注册
- ✅ 更强的匿名性
- ✅ 链下计算优化

**配置示例**：
```rust
registration_mode: RegistrationModeConfig::PrePopulated {
    pre_deactivate_root: Uint256::from_hex("0x123..."),
    pre_deactivate_coordinator: PubKey { x: ..., y: ... },
}
```

**准入流程**：
```
Coordinator 链下计算 
    → 所有用户 pre-deactivated
    → 生成 pre_deactivate_root
    → Round 创建时提供 root + coordinator

用户 
    → PreAddNewKey(proof) 
    → ZK proof 验证 
    → 验证通过 
    → 以 deactivated 状态加入
```

**重要约束**：
```rust
// ❌ 编译期/运行时拒绝
PrePopulated + Dynamic VC

// ✅ 唯一允许的组合
PrePopulated + Unified VC
```

**原因**：PreAddNewKey 的 ZK proof 不包含 `voice_credit_amount`，无法为每个用户设置不同的投票权。

---

### 3️⃣ Deactivate Enabled - 密钥更换功能

```rust
pub struct InstantiateMsg {
    // ...
    pub deactivate_enabled: bool,
}
```

| 值 | 效果 | 适用场景 |
|----|------|---------|
| `true` | 启用 deactivate 和 AddNewKey | 需要密钥更换、PrePopulated 模式 |
| `false` | 禁用密钥更换功能 | 简单投票场景 |

**重要说明**：
- ✅ PrePopulated 模式**必须**设置为 `true`
- ✅ 启用后，任何已注册用户都可以发起 deactivate

---

## 准入流程详解

### 流程 1: SignUp 模式注册

适用于：`SignUpWithStaticWhitelist` 和 `SignUpWithOracle`

```
用户调用 SignUp
    ↓
验证 RegistrationMode
    ├─ SignUpWithStaticWhitelist → 检查白名单
    └─ SignUpWithOracle → 验证 certificate
    ↓
计算 Voice Credit
    ├─ Unified → 使用预设值
    └─ Dynamic → 使用用户提供的 amount
    ↓
加入状态树
    └─ 分配 state_index，保存 voice_credit_balance
```

**代码示例**：

```rust
// 场景 1: Unified VC + 静态白名单
ExecuteMsg::SignUp {
    pubkey: user_pubkey,
    certificate: None,
    amount: None, // Unified 模式不需要
}

// 场景 2: Dynamic VC + Oracle 验证
ExecuteMsg::SignUp {
    pubkey: user_pubkey,
    certificate: Some(backend_cert), // 必需
    amount: Some(Uint256::from(500)), // 必需
}

// 场景 3: Dynamic VC + 静态白名单（预设投票权）
ExecuteMsg::SignUp {
    pubkey: user_pubkey,
    certificate: None,
    amount: None, // 从白名单读取预设值，用户无法修改
}
```

---

### 流程 2: PrePopulated 模式批量导入

适用于：`PrePopulated` 模式

```
链下准备（Coordinator）
    ↓
1. 收集所有用户信息
2. 将所有用户标记为 deactivated 状态
3. 构建完整的 Merkle 状态树
4. 计算 pre_deactivate_root
    ↓
创建 Round
    ├─ registration_mode: PrePopulated { root, coordinator }
    ├─ voice_credit_mode: Unified { amount }  // 必须
    └─ deactivate_enabled: true/false  // 可选（根据是否需要密钥更换）
    ↓
用户注册（逐个调用）
    ↓
用户调用 PreAddNewKey
    ├─ 提供 ZK proof
    ├─ 验证 proof 与 pre_deactivate_root 一致
    └─ 验证 coordinator hash
    ↓
用户以 deactivated 状态加入
    └─ 如果 deactivate_enabled=true，可以通过 AddNewKey 更换密钥
```

**重要限制**：

⚠️ PrePopulated 模式下：
- ❌ **禁止**调用 `SignUp`
- ✅ **只能**使用 `PreAddNewKey`
- ⚠️ **只支持** `Unified` VC 模式
- ℹ️ `deactivate_enabled` 可以是 true 或 false（与 PrePopulated 模式无关）

---

## 💡 重要概念澄清：PrePopulated vs deactivate_enabled

### 两个独立的配置项

很多人容易混淆 `PrePopulated` 模式和 `deactivate_enabled`，但它们是**完全独立**的配置：

#### PrePopulated 模式（状态树初始化方式）

**作用**：控制用户如何**加入**状态树

- 用户通过 `PreAddNewKey` + ZK proof 加入
- 用户初始处于 "pre-deactivated" 状态（这是预计算的初始状态）
- 与运行时的 deactivate 功能**无关**

#### deactivate_enabled（运行时密钥更换功能）

**作用**：控制用户是否可以在投票期间**更换密钥**

- 控制 `PublishDeactivateMessage`、`ProcessDeactivate`、`UploadDeactivate`
- 与用户如何加入状态树**无关**

### 配置组合

所有组合都是**合法**的：

| PrePopulated | deactivate_enabled | 说明 |
|--------------|-------------------|------|
| ✅ 是 | ✅ true | 用户通过 PreAddNewKey 加入，**可以**运行时更换密钥 |
| ✅ 是 | ✅ false | 用户通过 PreAddNewKey 加入，**不能**运行时更换密钥 |
| ❌ 否 | ✅ true | 用户通过 SignUp 加入，可以运行时更换密钥 |
| ❌ 否 | ✅ false | 用户通过 SignUp 加入，不能运行时更换密钥 |

### 典型场景

**场景 1：简单批量导入**
```rust
registration_mode: PrePopulated { ... },
deactivate_enabled: false,  // 不需要密钥更换
```
- 用户通过 PreAddNewKey 加入
- 不支持运行时密钥更换
- 适用于简单投票场景

**场景 2：高匿名性批量导入**
```rust
registration_mode: PrePopulated { ... },
deactivate_enabled: true,  // 支持密钥更换
```
- 用户通过 PreAddNewKey 加入
- 支持运行时密钥更换（更强匿名性）
- 适用于隐私要求高的场景

---

## 常见配置组合

### 组合矩阵

| 配置名称 | Voice Credit | Registration Mode | Deactivate | 说明 |
|---------|-------------|-------------------|-----------|------|
| **aMACI 经典** | Unified | SignUpWithStaticWhitelist | false | 传统模式：固定 VC + 白名单 |
| **aMACI-Oracle** | Unified | SignUpWithOracle | false | 统一 VC + 后端验证 |
| **MACI 经典** | Dynamic | SignUpWithOracle | false | 动态 VC + 后端验证 |
| **白名单加权** | Dynamic | SignUpWithStaticWhitelist | false | 白名单预设每人 VC |
| **批量导入-简单** | Unified | PrePopulated | false | 批量导入，无密钥更换 |
| **批量导入-高匿名** | Unified | PrePopulated | true | 批量导入 + 密钥更换 |

### 详细配置示例

#### 配置 1: aMACI 经典模式

```rust
InstantiateMsg {
    voice_credit_mode: VoiceCreditMode::Unified { 
        amount: Uint256::from(100) 
    },
    
    registration_mode: RegistrationModeConfig::SignUpWithStaticWhitelist {
        whitelist: WhitelistBase {
            users: vec![
                WhitelistBaseConfig {
                    addr: Addr::unchecked("dora1alice..."),
                    voice_credit_amount: None, // Unified 可以为 None
                },
                WhitelistBaseConfig {
                    addr: Addr::unchecked("dora1bob..."),
                    voice_credit_amount: None,
                },
            ],
        },
    },
    
    deactivate_enabled: false,
    // ... 其他参数
}
```

---

#### 配置 2: MACI 经典模式

```rust
InstantiateMsg {
    voice_credit_mode: VoiceCreditMode::Dynamic,
    
    registration_mode: RegistrationModeConfig::SignUpWithOracle {
        oracle_pubkey: "04abc123...".to_string(),
    },
    
    deactivate_enabled: false,
    // ... 其他参数
}
```

**用户注册**：
```rust
ExecuteMsg::SignUp {
    pubkey: user_pubkey,
    certificate: Some(backend_signature), // 包含 amount
    amount: Some(Uint256::from(500)), // 必须与签名匹配
}
```

---

#### 配置 3: 白名单加权投票

```rust
InstantiateMsg {
    voice_credit_mode: VoiceCreditMode::Dynamic,
    
    registration_mode: RegistrationModeConfig::SignUpWithStaticWhitelist {
        whitelist: WhitelistBase {
            users: vec![
                WhitelistBaseConfig {
                    addr: Addr::unchecked("dora1alice..."),
                    voice_credit_amount: Some(Uint256::from(100)), // 必须非零
                },
                WhitelistBaseConfig {
                    addr: Addr::unchecked("dora1bob..."),
                    voice_credit_amount: Some(Uint256::from(500)), // 必须非零
                },
            ],
        },
    },
    
    deactivate_enabled: false,
    // ... 其他参数
}
```

**安全保证**：
- ✅ 用户的 VC 由白名单预设决定
- ✅ 用户无法修改自己的投票权
- ✅ instantiate 时验证每个 amount 非零

---

#### 配置 4: PrePopulated 批量导入

```rust
InstantiateMsg {
    voice_credit_mode: VoiceCreditMode::Unified { 
        amount: Uint256::from(100) 
    },
    
    registration_mode: RegistrationModeConfig::PrePopulated {
        pre_deactivate_root: pre_computed_root,
        pre_deactivate_coordinator: coordinator_key,
    },
    
    deactivate_enabled: false, // 可选：根据是否需要密钥更换决定
    // ... 其他参数
}
```

⚠️ **注意**：
- 此配置如果尝试使用 `Dynamic` VC 会在 instantiate 时被拒绝
- `deactivate_enabled` 可以是 true 或 false，与 PrePopulated 模式无关

---

## 配置约束矩阵

### Voice Credit Mode vs Registration Mode

| Registration Mode | Unified VC | Dynamic VC |
|-------------------|------------|------------|
| **SignUpWithStaticWhitelist** | ✅ 支持 | ✅ 支持（需预设 amount） |
| **SignUpWithOracle** | ✅ 支持 | ✅ 支持 |
| **PrePopulated** | ✅ 支持 | ❌ **禁止** |

### 约束验证层级

```
层级 1: 编译期（类型系统）
    └─ RegistrationMode 互斥，无法构造无效组合

层级 2: Instantiate（创建时）
    ├─ PrePopulated + Dynamic VC → 拒绝
    ├─ PrePopulated 必须提供 coordinator → 拒绝 None
    ├─ Dynamic + StaticWhitelist 验证 amount 非零
    └─ 验证白名单地址格式（必须 dora1）

层级 3: Update Config（配置更新）
    ├─ num_signups > 0 时禁止修改 VC 模式
    ├─ num_signups > 0 时禁止修改 Registration 模式
    └─ 切换到 PrePopulated 时验证 VC 模式

层级 4: Execute PreAddNewKey（运行时）
    └─ 防御性检查：确保 Unified VC 模式
```

---

## 配置更新机制

### 可更新的配置

```rust
pub struct RegistrationConfigUpdate {
    // 随时可更新（voting 开始前）
    pub deactivate_enabled: Option<bool>,
    
    // 只能在 num_signups == 0 时更新
    pub voice_credit_mode: Option<VoiceCreditMode>,
    
    // 只能在 num_signups == 0 时更新
    pub registration_mode: Option<RegistrationModeConfig>,
}
```

### 更新约束

| 配置项 | 约束条件 | 原因 |
|--------|---------|------|
| `deactivate_enabled` | voting 开始前 | 功能开关，不影响已有数据 |
| `voice_credit_mode` | num_signups == 0 | 影响所有用户投票权 |
| `registration_mode` | num_signups == 0 | 影响准入方式和状态树 |

### 配置切换示例

```rust
// ✅ 允许：无用户注册时切换模式
ExecuteMsg::UpdateRegistrationConfig {
    config: RegistrationConfigUpdate {
        voice_credit_mode: Some(VoiceCreditMode::Dynamic),
        registration_mode: Some(
            RegistrationModeConfig::SignUpWithOracle {
                oracle_pubkey: "04abc...".to_string(),
            }
        ),
        deactivate_enabled: None,
    },
}

// ❌ 拒绝：已有用户注册后切换模式
// Error: ConfigModificationAfterSignup { current: 5 }
```

---

## 设计问题分析

### ✅ 已解决的问题

#### 1. **无效配置组合** ✅

**问题**：旧设计允许 `PrePopulated + StaticWhitelist`，但这个组合没有意义。

**解决**：
- ✅ `RegistrationMode` 枚举设计防止无效组合
- ✅ `PrePopulated` 变体不包含 access_control 字段
- ✅ 类型系统在编译期拒绝无效配置

---

#### 2. **PrePopulated + Dynamic VC Bug** ✅

**问题**：PreAddNewKey 的 ZK proof 不包含 `voice_credit_amount`，如果允许 Dynamic VC，所有用户投票权为 0。

**解决**：
```rust
// 层级 1: Instantiate 时验证
if PrePopulated && Dynamic {
    return Err("PrePopulated only supports Unified VC");
}

// 层级 2: Update Config 时验证
if switching to PrePopulated && current VC is Dynamic {
    return Err("Cannot switch to PrePopulated with Dynamic VC");
}

// 层级 3: PreAddNewKey 时防御性检查
if !Unified {
    return Err("PreAddNewKey requires Unified VC");
}
```

---

#### 3. **API 三层不同步** ✅

**问题**：AMACI、Registry、Api-Saas 三层合约的 API 结构不一致。

**解决**：
- ✅ 三层统一使用 `RegistrationModeConfig`
- ✅ 替换 JSON 构造为类型化消息
- ✅ 编译期类型检查

---

### ⚠️ 待优化的问题

#### 1. **PrePopulated 使用复杂度** ⚠️

**问题**：
- 需要链下计算完整状态树
- 需要理解 Pre-Deactivate 技术概念
- 配置参数多且复杂

**建议**：
- [ ] 提供链下工具/SDK
- [ ] 提供完整的使用示例
- [ ] 大部分场景使用 SignUp 模式

---

#### 2. **配置更新的原子性** ⚠️

**当前设计**：
```rust
pub struct RegistrationConfigUpdate {
    pub voice_credit_mode: Option<VoiceCreditMode>,
    pub registration_mode: Option<RegistrationModeConfig>,
    // ...
}
```

**潜在问题**：
- 如果只更新 `registration_mode` 到 `PrePopulated`
- 但忘记同时检查/更新 `voice_credit_mode` 到 `Unified`
- 会在验证时被拒绝，但错误信息可能不够清晰

**建议**：
```rust
// 提供更友好的错误提示
if switching to PrePopulated {
    let current_vc = VOICE_CREDIT_MODE.load()?;
    if !matches!(current_vc, Unified) && new_vc_mode.is_none() {
        return Err("Switching to PrePopulated requires Unified VC. 
                   Current VC mode is Dynamic. Please also update voice_credit_mode.");
    }
}
```

---

#### 3. **配置组合的文档化** 📝

**问题**：某些组合虽然技术上可行，但实际场景中不推荐。

**需要明确的组合**：

| 组合 | 技术可行性 | 推荐度 | 说明 |
|------|-----------|--------|------|
| Dynamic + StaticWhitelist | ✅ 可行 | ⚠️ 谨慎使用 | 适合预设加权投票 |
| PrePopulated + deactivate_enabled=false | ❌ 不可行 | ❌ 禁止 | PrePopulated 依赖 deactivate |
| Unified + SignUpWithOracle | ✅ 可行 | ✅ 推荐 | 统一 VC + 灵活准入 |

**建议**：
- [ ] 在合约中添加配置组合检查
- [ ] 提供配置验证工具
- [ ] 文档中明确最佳实践

---

#### 4. **Pre_deactivate_coordinator 可选性设计** ⚠️

**当前设计**：
```rust
pub enum RegistrationMode {
    PrePopulated {
        pre_deactivate_root: Uint256,
        pre_deactivate_coordinator: PubKey, // 非 Option
    },
}
```

**问题分析**：
- ✅ **正确**：coordinator 是 PreAddNewKey ZK proof 验证的必需参数
- ✅ **一致**：与代码实现一致（非 Option）
- ❌ **文档过时**：旧文档中 coordinator 标记为 `Option<PubKey>`

**确认**：当前设计是**正确**的，coordinator 必需。

---

### 🔍 深度设计审查

#### 审查点 1: WhitelistConfig 存储设计 ✅

**当前设计**：
```rust
// API 层（用户配置）
pub struct WhitelistBaseConfig {
    pub addr: Addr,
    pub voice_credit_amount: Option<Uint256>, // API 灵活性
}

// 存储层（合约内部）
pub struct WhitelistConfig {
    pub addr: Addr,
    pub voice_credit_amount: Uint256, // 确定值
    pub is_register: bool,
}
```

**设计优势**：
- ✅ API 层灵活：Unified 模式可传 None
- ✅ 存储层确定：合约 instantiate 时转换为确定值
- ✅ 语义清晰：amount 就是实际 voice credit

**确认**：设计合理，无需修改。

---

#### 审查点 2: 地址验证逻辑 ✅

**当前实现**：
```rust
// 所有白名单地址必须以 "dora1" 开头
fn validate_dora_address(address: &str) -> Result<()> {
    match bech32::decode(address) {
        Ok((prefix, _data, _variant)) => {
            if prefix != "dora" {
                return Err(InvalidAddressPrefix { ... });
            }
            Ok(())
        }
        Err(_) => Err(InvalidAddress { ... })
    }
}
```

**确认**：地址验证严格，符合 Dora Chain 规范。

---

#### 审查点 3: Certificate 验证机制 ✅

**验证流程**：
```rust
// 1. 用户提供
SignUp {
    amount: Some(500),
    certificate: Some(backend_sig),
}

// 2. 合约重建 payload
let payload = json!({
    "amount": user_amount.to_string(),
    "contract_address": contract_id,
    "pubkey_x": pubkey.x,
    "pubkey_y": pubkey.y,
});

// 3. 验证签名
secp256k1_verify(payload_hash, certificate, oracle_pubkey)?;
```

**安全性**：
- ✅ 用户无法伪造 amount（签名验证失败）
- ✅ 后端完全控制投票权分配
- ✅ 设计合理，无需修改

---

## 快速参考

### 🚀 三种最常用配置

#### 配置 1: 简单公平投票（推荐新手）

```rust
voice_credit_mode: Unified { amount: 100 }
registration_mode: SignUpWithStaticWhitelist { whitelist }
deactivate_enabled: false
```

**适用**：小规模、固定成员、公平投票

---

#### 配置 2: 基于资产的加权投票

```rust
voice_credit_mode: Dynamic
registration_mode: SignUpWithOracle { oracle_pubkey }
deactivate_enabled: false
```

**适用**：代币持有者、股东会、动态准入

---

#### 配置 3: 大规模批量导入

```rust
voice_credit_mode: Unified { amount: 100 }
registration_mode: PrePopulated { root, coordinator }
deactivate_enabled: true/false  // 可选（根据是否需要密钥更换）
```

**适用**：需要高匿名性、大规模用户、链下优化

**说明**：
- PrePopulated 只影响用户如何加入状态树（PreAddNewKey）
- deactivate_enabled 控制用户是否可以运行时更换密钥
- 两者独立，可以任意组合

---

### ⚡ 配置决策流程

```
Q1: 投票权是否相同？
    ├─ 是 → Unified VC
    └─ 否 → Dynamic VC

Q2: 如何验证用户？
    ├─ 固定名单 → SignUpWithStaticWhitelist
    ├─ 动态验证 → SignUpWithOracle
    └─ 批量导入 → PrePopulated（必须 Unified VC）

Q3: 是否需要密钥更换？
    ├─ 需要 → deactivate_enabled: true
    └─ 不需要 → deactivate_enabled: false
    
    注意：deactivate_enabled 与 RegistrationMode 独立，
          任何 RegistrationMode 都可以搭配任意 deactivate_enabled 值
```

---

## 常见错误和解决方案

### ❌ 错误 1: `InvalidRegistrationConfig`

```
Error: PrePopulated mode only supports Unified VoiceCreditMode
```

**原因**：尝试使用 `PrePopulated + Dynamic VC`

**解决**：
```rust
// ❌ 错误
voice_credit_mode: Dynamic,
registration_mode: PrePopulated { ... }

// ✅ 正确
voice_credit_mode: Unified { amount: 100 },
registration_mode: PrePopulated { ... }
```

---

### ❌ 错误 2: `ConfigModificationAfterSignup`

```
Error: Cannot modify registration mode after signups: current=5
```

**原因**：已有用户注册后尝试修改配置

**解决**：只在 `num_signups == 0` 时更新配置

---

### ❌ 错误 3: `InvalidWhitelistConfig`

```
Error: Dynamic VC mode requires voice_credit_amount for user dora1...
```

**原因**：Dynamic + StaticWhitelist 模式下，用户 amount 为 None

**解决**：
```rust
// Dynamic 模式必须为每个用户提供非零 amount
WhitelistBaseConfig {
    addr: Addr::unchecked("dora1..."),
    voice_credit_amount: Some(Uint256::from(100)), // 必须
}
```

---

### ❌ 错误 4: `SignUpNotAllowed`

**原因**：在 PrePopulated 模式下调用 SignUp

**解决**：使用 `PreAddNewKey` 而不是 `SignUp`

---

### ❌ 错误 5: `PreAddNewKeyNotAllowed`

**原因**：在 SignUp 模式下调用 PreAddNewKey

**解决**：确认 round 的 `registration_mode` 是 `PrePopulated`

---

## 附录

### 完整的 InstantiateMsg 结构

```rust
pub struct InstantiateMsg {
    // MACI circuit parameters
    pub parameters: MaciParameters,
    pub coordinator: PubKey,
    
    // Admin and operator
    pub admin: Addr,
    pub fee_recipient: Addr,
    pub operator: Addr,
    
    // Round configuration
    pub vote_option_map: Vec<String>,
    pub round_info: RoundInfo,
    pub voting_time: VotingTime,
    
    // Circuit configuration
    pub circuit_type: Uint256,
    pub certification_system: Uint256,
    pub poll_id: u64,
    
    // ============ 核心配置 ============
    
    // 投票权分配方式
    pub voice_credit_mode: VoiceCreditMode,
    
    // 统一的注册准入方式（新设计）
    pub registration_mode: RegistrationModeConfig,
    
    // 密钥更换功能开关
    pub deactivate_enabled: bool,
}
```

---

### 迁移指南：从旧 API 到新 API

| 旧配置 (v1.x) | 新配置 (v2.0) |
|--------------|--------------|
| `access_control: { StaticWhitelist, whitelist }`<br>`state_init_mode: SignUp` | `registration_mode: SignUpWithStaticWhitelist { whitelist }` |
| `access_control: { OracleVerified, oracle_pubkey }`<br>`state_init_mode: SignUp` | `registration_mode: SignUpWithOracle { oracle_pubkey }` |
| `access_control: { *, ... }`<br>`state_init_mode: PrePopulated { root, coord }` | `registration_mode: PrePopulated { root, coordinator }`<br>**注意**：coordinator 现在是必需的 |

---

## 总结

### ✅ v2.0 设计优势

1. **类型安全**：无效配置在编译期被拒绝
2. **约束强化**：PrePopulated + Unified VC 在多层验证
3. **API 统一**：三层合约使用相同结构
4. **逻辑清晰**：RegistrationMode 语义明确
5. **易于扩展**：添加新模式只需新增枚举变体

### ⚠️ 需要注意

1. **PrePopulated 复杂度**：使用门槛高，需要工具支持
2. **配置更新原子性**：切换模式时需同时考虑 VC 模式兼容性
3. **最佳实践文档**：需要明确推荐/不推荐的配置组合

### 📋 后续工作

- [ ] 提供 PrePopulated 链下计算工具
- [ ] 添加配置验证 CLI 工具
- [ ] 完善配置组合的警告机制
- [ ] 更新所有测试用例

---

**文档版本**：v2.0  
**最后更新**：2026-02-12  
**重构基准**：RegistrationMode Unified Design  
**维护者**：MACI Team
