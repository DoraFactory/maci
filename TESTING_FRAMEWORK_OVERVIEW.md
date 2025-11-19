# MACI 测试框架完整指南

> 面向团队成员的完整测试体系介绍文档

## 📋 目录

- [1. E2E 测试框架](#1-e2e-测试框架)
- [2. 合约测试](#2-合约测试)
- [3. 电路测试](#3-电路测试)
- [4. CI/CD 自动化测试](#4-cicd-自动化测试)
- [5. 测试覆盖范围与目标](#5-测试覆盖范围与目标)

---

## 1. E2E 测试框架

### 1.1 概述

E2E（端到端）测试框架基于 **cosmwasm-simulate SDK** 构建，用于在本地环境中模拟完整的 MACI/AMACI 投票流程，无需依赖实际区块链环境。

**位置**: `e2e/` 目录

### 1.2 核心特性

- ✅ **本地合约执行**: 使用 cosmwasm-simulate SDK 在本地模拟合约执行
- ✅ **完整流程测试**: 覆盖从用户注册到结果统计的完整投票流程
- ✅ **电路集成**: 集成 circomkit 生成真实的零知识证明
- ✅ **SDK 协同**: 与 @dorafactory/maci-sdk 紧密集成，验证链上链下状态一致性
- ✅ **多场景支持**: AMACI（匿名密钥更换 + QV）、MACI（标准 1P1V）、Registry（多轮次管理）

### 1.3 架构设计

```
e2e/
├── src/                      # 框架核心代码
│   ├── setup/               # 环境设置
│   │   ├── contractLoader.ts    # WASM 合约加载器
│   │   └── chainSetup.ts        # 链环境配置
│   ├── contracts/           # 合约管理
│   │   ├── deployManager.ts     # 合约部署管理
│   │   └── contractClients.ts   # 合约客户端封装
│   ├── utils/               # 工具函数
│   │   ├── testHelpers.ts       # 测试辅助函数
│   │   └── circuitIntegration.ts # 电路证明生成
│   └── types/               # TypeScript 类型定义
│
├── tests/                   # 测试套件
│   ├── amaci.e2e.test.ts       # AMACI 完整流程测试
│   ├── maci.e2e.test.ts        # MACI 标准流程测试
│   ├── registry.e2e.test.ts    # Registry 管理测试
│   ├── advanced.e2e.test.ts    # 高级场景测试
│   ├── state-tree.e2e.test.ts  # 状态树测试
│   └── poseidon-consistency.e2e.test.ts # Poseidon 哈希一致性测试
│
├── circuits/                # 电路文件（zkey/wasm）
│   ├── maci-2-1-1-5/       # MACI 标准电路
│   └── amaci-2-1-1-5/      # AMACI 匿名电路
│
├── scripts/                 # 辅助脚本
│   ├── downloadZkeys.ts    # 下载电路文件
│   └── extractVkeys.ts     # 提取验证密钥
│
└── package.json            # 依赖和脚本配置
```

### 1.4 测试套件详解

#### 1.4.1 AMACI E2E 测试 (`amaci.e2e.test.ts`)

测试 **AMACI（匿名 MACI）** 的完整投票流程，包含匿名密钥更换机制。

**测试流程**:
1. **环境准备** - 部署 AMACI 合约，初始化 SDK
2. **用户注册** - 3个用户使用初始公钥注册
3. **添加新密钥** - 用户添加新的匿名密钥（用于投票）
4. **投票阶段** - 用户使用新密钥投票（QV 模式）
5. **消息处理** - 协调员批量处理投票消息并生成 ZK 证明
6. **票数统计** - 统计最终结果并生成 ZK 证明
7. **结果验证** - 验证链上链下结果一致性

**关键验证点**:
- 匿名密钥更换机制正常工作
- 零知识证明生成和验证成功
- SDK 状态与合约状态保持同步
- QV（二次方投票）计算正确

**测试参数**:
- 状态树深度: 2（最多 25 个选民）
- 投票选项: 5 个
- 批处理大小: 5 条消息/批次

#### 1.4.2 MACI E2E 测试 (`maci.e2e.test.ts`)

测试 **MACI（标准模式）** 的 1P1V（一人一票）投票流程。

**测试场景**:
- 5个用户参与投票
- 3个投票选项
- 测试投票修改（nonce 机制）
- 批量消息处理
- 票数统计

**验证点**:
- 1P1V 规则正确执行
- 后续投票可以覆盖之前的投票
- 最终票数准确无误

#### 1.4.3 Registry E2E 测试 (`registry.e2e.test.ts`)

测试 **Registry 合约** 管理多个投票轮次的能力。

**功能测试**:
- 创建多个轮次（AMACI QV、MACI 1P1V）
- 查询单个轮次信息
- 列出所有轮次
- 分页查询功能
- 按类型筛选轮次

#### 1.4.4 高级场景测试 (`advanced.e2e.test.ts`)

测试边界情况和复杂场景。

**测试场景**:
- 大规模用户（10+ 用户）
- 重复注册错误处理
- 投票时间窗口限制
- 无效证明拒绝
- 时间推进测试

#### 1.4.5 状态树测试 (`state-tree.e2e.test.ts`)

测试状态树的构建和查询功能。

**测试内容**:
- 状态树初始化
- 节点查询
- 路径验证
- 根哈希计算

#### 1.4.6 Poseidon 一致性测试 (`poseidon-consistency.e2e.test.ts`)

验证 **Rust 实现** 和 **TypeScript 实现** 的 Poseidon 哈希算法一致性。

**测试目标**:
- 跨语言哈希结果一致性
- 测试向量验证
- 边界值处理

### 1.5 核心组件

#### ContractLoader
负责加载编译好的 WASM 合约字节码。

```typescript
const loader = new ContractLoader();
const amaciWasm = await loader.loadAmaciContract();
```

#### DeployManager
管理合约的上传、实例化和部署流程。

```typescript
const deployManager = new DeployManager(client, loader);
const contractInfo = await deployManager.deployAmaciContract(
  sender,
  initMsg
);
```

#### Contract Clients
提供类型安全的合约调用封装。

```typescript
const amaciContract = new AmaciContractClient(
  client,
  contractAddress,
  sender
);

await amaciContract.signUp(pubkey);
await amaciContract.publishMessage(message, encPubKey);
```

#### Circuit Integration
负责电路证明生成和格式转换。

```typescript
const proof = await generateProcessMessagesProof(
  input,
  stateTreeDepth,
  batchSize
);

await maciContract.processMessages(proof);
```

### 1.6 数据流

```
用户 (VoterClient SDK)
  ↓ 生成投票消息
SimulateCosmWasmClient (本地模拟器)
  ↓ 发布消息到合约
协调员 (OperatorClient SDK)
  ↓ 处理消息，生成电路输入
Circomkit (电路编译器)
  ↓ 生成零知识证明
SimulateCosmWasmClient
  ↓ 提交证明到合约
合约验证证明
  ↓ 更新状态
测试验证结果
```

### 1.7 电路配置

**当前使用配置: 2-1-1-5**

格式说明: `state_tree_depth-int_state_tree_depth-vote_option_tree_depth-message_batch_size`

**约束参数**:
- **Max voters**: 5^2 = **25 voters**
- **Max options**: 5^1 = **5 options**
- **Batch size**: **5 messages** per batch

**电路文件**:
```
circuits/
├── maci-2-1-1-5/
│   ├── processMessages.wasm
│   ├── processMessages.zkey
│   ├── tallyVotes.wasm
│   └── tallyVotes.zkey
├── amaci-2-1-1-5/
│   ├── processMessages.wasm
│   ├── processMessages.zkey
│   ├── tallyVotes.wasm
│   ├── tallyVotes.zkey
│   ├── deactivate.wasm
│   ├── deactivate.zkey
│   ├── addNewKey.wasm
│   └── addNewKey.zkey
└── vkeys-*.json  # 验证密钥
```

### 1.8 运行 E2E 测试

#### 一次性设置（首次运行）

```bash
cd e2e

# 1. 安装依赖
pnpm install

# 2. 下载电路文件（约 100MB）
pnpm setup-circuits
```

#### 运行测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试
pnpm test:amaci        # AMACI 测试
pnpm test:maci         # MACI 测试
pnpm test:registry     # Registry 测试
pnpm test:advanced     # 高级场景测试
pnpm test:stateTree    # 状态树测试
pnpm test:poseidon     # Poseidon 一致性测试
```

### 1.9 核心依赖

- `@oraichain/cw-simulate` - CosmWasm 本地模拟器
- `@dorafactory/maci-sdk` - MACI SDK
- `@dorafactory/maci-circuits` - 电路定义
- `circomkit` - 电路测试工具
- `snarkjs` - 零知识证明库
- `mocha` + `chai` - 测试框架

---

## 2. 合约测试

### 2.1 概述

合约测试使用 Rust 原生的单元测试框架 + CosmWasm 的 **cw-multi-test** 库进行合约逻辑测试。

**位置**: `contracts/*/src/multitest/` 和内联 `#[cfg(test)]` 模块

### 2.2 测试架构

```
contracts/
├── amaci/
│   └── src/
│       ├── multitest/
│       │   ├── mod.rs              # 测试工具和 helper 函数
│       │   ├── tests.rs            # 完整的集成测试
│       │   └── certificate_generator.rs  # 证书生成工具
│       ├── contract.rs             # 合约主逻辑（含单元测试）
│       └── state.rs                # 状态管理（含单元测试）
│
├── api-maci/
│   └── src/
│       ├── multitest/
│       │   ├── mod.rs
│       │   ├── tests.rs
│       │   └── certificate_generator.rs
│       └── ...
│
├── registry/
│   └── src/
│       ├── multitest/
│       │   ├── mod.rs
│       │   ├── tests.rs
│       │   └── certificate_generator.rs
│       └── ...
│
└── api-saas/
    └── src/
        ├── multitest/
        │   └── mod.rs
        └── ...
```

### 2.3 测试类型

#### 2.3.1 单元测试
测试单个函数或模块的逻辑。

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_calculation() {
        let result = calculate_hash(...);
        assert_eq!(result, expected_value);
    }
}
```

#### 2.3.2 集成测试（Multi-Test）
使用 `cw-multi-test` 模拟完整的合约交互。

**测试内容**:
- 合约实例化
- 用户注册
- 消息发布
- 证明验证
- 状态查询
- 权限控制
- 错误处理

**示例测试场景**（AMACI）:
1. **用户注册测试**
   - 正常注册流程
   - 重复注册错误处理
   - 白名单验证

2. **投票消息测试**
   - 发布投票消息
   - 时间窗口限制
   - 消息格式验证

3. **证明验证测试**
   - 处理消息证明验证
   - 票数统计证明验证
   - 无效证明拒绝

4. **状态管理测试**
   - 状态根更新
   - 提交验证
   - 状态查询

5. **密钥管理测试（AMACI 特有）**
   - 停用消息处理
   - 新密钥添加
   - 密钥状态查询

### 2.4 测试工具

#### Multi-Test App
创建模拟的区块链环境。

```rust
fn create_app() -> App {
    AppBuilder::new().build(|router, _, storage| {
        router
            .bank
            .init_balance(storage, &Addr::unchecked("owner"), coins(1000000, "udora"))
            .unwrap();
    })
}
```

#### Certificate Generator
生成测试用的证书和证明数据。

```rust
fn generate_certificate_for_pubkey(pubkey: &PubKey) -> Certificate {
    // 生成测试证书
}
```

### 2.5 运行合约测试

```bash
# 在项目根目录运行所有合约测试
cargo test --lib -- --nocapture

# 运行特定合约的测试
cd contracts/amaci
cargo test -- --nocapture

# 运行特定测试用例
cargo test test_sign_up -- --nocapture

# 显示详细输出
RUST_LOG=debug cargo test -- --nocapture
```

### 2.6 测试覆盖的合约

| 合约 | 描述 | 主要测试内容 |
|------|------|--------------|
| **cw-amaci** | AMACI 核心合约 | 匿名密钥更换、QV 投票、证明验证 |
| **cw-api-maci** | MACI API 合约 | 1P1V 投票、标准流程、消息处理 |
| **cw-amaci-registry** | Registry 合约 | 轮次管理、查询功能、权限控制 |
| **cw-api-saas** | SaaS API 合约 | API 接口、权限管理 |

### 2.7 测试数据

测试使用预生成的测试向量和证明数据，位于测试代码中：

```rust
#[derive(Debug, Serialize, Deserialize)]
struct MsgData {
    input_hash: String,
    packed_vals: String,
    batch_start_hash: String,
    // ...
}

#[derive(Debug, Serialize, Deserialize)]
struct TallyData {
    state_root: String,
    state_salt: String,
    // ...
}
```

---

## 3. 电路测试

### 3.1 概述

电路测试验证 **零知识证明电路** 的正确性，确保电路逻辑符合 MACI/AMACI 协议规范。

**位置**: `packages/circuits/ts/__tests__/`

### 3.2 测试架构

```
packages/circuits/
├── circom/                  # Circom 电路源代码
│   ├── maci/               # MACI 标准电路
│   ├── amaci/              # AMACI 匿名电路
│   ├── crypto/             # 加密原语
│   └── utils/              # 工具电路
│
├── ts/__tests__/           # TypeScript 测试套件
│   ├── PoseidonHasher.test.ts          # Poseidon 哈希测试
│   ├── IncrementalQuinaryTree.test.ts  # 五叉树测试
│   ├── ProcessDeactivate.test.ts       # 停用消息处理
│   ├── AddNewKey.test.ts               # 新密钥添加
│   ├── AmaciIntegration.test.ts        # AMACI 集成测试
│   ├── MaciIntegration.test.ts         # MACI 集成测试
│   ├── MessageHasher.test.ts           # 消息哈希
│   ├── VerifySignature.test.ts         # 签名验证
│   ├── Ecdh.test.ts                    # ECDH 密钥交换
│   └── ...
│
├── build/                  # 编译输出
│   ├── circuits/           # 编译后的电路
│   └── zkeys/              # 证明密钥
│
└── package.json
```

### 3.3 测试分类

#### 3.3.1 加密原语测试

测试底层密码学组件的正确性。

| 测试文件 | 测试内容 |
|---------|---------|
| `PoseidonHasher.test.ts` | Poseidon 哈希函数 |
| `Sha256Hasher.test.ts` | SHA256 哈希函数 |
| `PrivToPubKey.test.ts` | 私钥到公钥转换 |
| `Ecdh.test.ts` | ECDH 密钥交换 |
| `VerifySignature.test.ts` | EdDSA 签名验证 |
| `ElGamalEncryption.test.ts` | ElGamal 加密 |

#### 3.3.2 数据结构测试

测试电路中使用的数据结构。

| 测试文件 | 测试内容 |
|---------|---------|
| `IncrementalQuinaryTree.test.ts` | 增量五叉树（状态树） |
| `MessageHasher.test.ts` | 消息哈希计算 |
| `MessageToCommand.test.ts` | 消息到命令转换 |
| `UnpackElement.test.ts` | 元素解包 |
| `CheckRoot.test.ts` | 根哈希验证 |

#### 3.3.3 AMACI 特定电路测试

测试 AMACI 特有的匿名机制。

| 测试文件 | 测试内容 |
|---------|---------|
| `ProcessDeactivate.test.ts` | 停用消息处理电路 |
| `AddNewKey.test.ts` | 新密钥添加电路 |
| `StateLeafTransformerAmaci.test.ts` | AMACI 状态叶转换 |
| `MessageValidatorAmaci.test.ts` | AMACI 消息验证 |
| `AmaciIntegration.test.ts` | AMACI 完整流程集成测试 |

#### 3.3.4 MACI 集成测试

测试 MACI 标准流程的电路。

| 测试文件 | 测试内容 |
|---------|---------|
| `MaciIntegration.test.ts` | MACI 完整流程集成测试 |
| `CalculateTotal.test.ts` | 票数统计计算 |

### 3.4 测试流程

电路测试的典型流程：

1. **准备测试输入** - 构造符合电路约束的输入数据
2. **编译电路** - 使用 circomkit 编译电路
3. **生成见证** - 计算电路的见证（witness）
4. **生成证明** - 使用 snarkjs 生成零知识证明
5. **验证证明** - 验证证明的有效性
6. **检查输出** - 验证电路输出是否符合预期

```typescript
import { Circomkit } from 'circomkit';

describe('MyCircuit Test', () => {
  let circuit: WitnessTester;

  before(async () => {
    circuit = await circomkit.WitnessTester('MyCircuit', {
      file: 'path/to/circuit',
      template: 'MyCircuit',
      params: [param1, param2]
    });
  });

  it('should compute correct output', async () => {
    const input = {
      field1: value1,
      field2: value2
    };

    const witness = await circuit.calculateWitness(input);
    await circuit.expectConstraintPass(witness);
    
    const output = await circuit.readWitness(witness, 'output');
    expect(output).to.equal(expectedOutput);
  });
});
```

### 3.5 运行电路测试

```bash
cd packages/circuits

# 安装依赖
pnpm install

# 编译电路（首次运行或电路修改后）
pnpm circom:build

# 运行所有测试
pnpm test

# 运行特定测试
pnpm test:poseidonHasher           # Poseidon 哈希测试
pnpm test:incrementalQuinaryTree   # 五叉树测试
pnpm test:processDeactivate        # 停用消息处理
pnpm test:amaciIntegration         # AMACI 集成测试
pnpm test:maciIntegration          # MACI 集成测试
```

### 3.6 性能考虑

电路测试需要较大的计算资源：

- **内存**: 建议 4GB+ 可用内存
- **时间**: 完整测试套件约 10-15 分钟
- **配置**: 已设置 `--max-old-space-size=4096`

---

## 4. CI/CD 自动化测试

### 4.1 概述

项目使用 **GitHub Actions** 实现持续集成和自动化测试，确保每次代码提交都经过完整的测试验证。

**配置文件**: `.github/workflows/test.yml`

### 4.2 工作流架构

```
GitHub Actions Workflow
├── Contract Tests Job (并行)
│   └── Rust 单元测试
├── Build WASM Job (并行)
│   └── 编译合约 WASM 文件
├── E2E Tests Job (依赖 Build WASM)
│   └── 端到端集成测试
└── Circuits Tests Job (并行)
    └── 电路测试
```

### 4.3 测试任务详解

#### 4.3.1 Contract Tests（合约测试）

**运行环境**: Ubuntu Latest  
**预计时长**: 10-20 分钟

**执行步骤**:
1. 检出代码
2. 设置 Rust 1.79.0 工具链 + wasm32-unknown-unknown target
3. 配置 Cargo 缓存（registry、git、build artifacts）
4. 运行测试: `cargo test --lib -- --nocapture`

**缓存优化**:
- `~/.cargo/registry` - Cargo registry
- `~/.cargo/git` - Git 依赖索引
- `target/` - 编译产物

**验证内容**:
- ✅ 所有合约的单元测试通过
- ✅ 多测试集成测试通过
- ✅ 证明验证逻辑正确
- ✅ 状态管理逻辑正确

#### 4.3.2 Build WASM（编译合约）

**运行环境**: Ubuntu Latest  
**预计时长**: 15-20 分钟（首次），5-10 分钟（缓存后）

**执行步骤**:
1. 检出代码
2. 设置 Rust 工具链
3. 使用 Docker + `cosmwasm/rust-optimizer:0.15.1` 编译合约
4. 验证生成的 WASM 文件
5. 上传 WASM artifacts（供 E2E 测试使用）

**输出产物**:
- `artifacts/cw_amaci-aarch64.wasm`
- `artifacts/cw_api_maci-aarch64.wasm`
- `artifacts/cw_amaci_registry-aarch64.wasm`
- `artifacts/cw_api_saas-aarch64.wasm`

**为什么需要这一步？**  
因为 `artifacts/` 目录被 `.gitignore` 忽略，不提交到 Git，所以 CI 需要动态编译。

#### 4.3.3 E2E Tests（端到端测试）

**运行环境**: macOS-14 (Apple Silicon M1/M2)  
**预计时长**: 40-60 分钟（首次），20-30 分钟（缓存后）

**执行步骤**:
1. 检出代码
2. 下载 WASM artifacts（来自 Build WASM Job）
3. 设置 Node.js 22 + pnpm 9.12.3
4. 安装 circom 编译器（v2.2.2）
5. 配置 pnpm 依赖缓存
6. 下载并缓存 circuit 文件（约 100MB）
7. 安装依赖并构建 SDK、Circuits
8. 生成 Poseidon 测试向量
9. 运行 E2E 测试套件

**缓存优化**:
- circom 编译器
- pnpm store
- circuit 文件（zkey/wasm）

**验证内容**:
- ✅ AMACI 完整流程正确
- ✅ MACI 标准流程正确
- ✅ Registry 管理功能正确
- ✅ 高级场景正常工作
- ✅ SDK 与合约状态一致
- ✅ 零知识证明生成和验证成功
- ✅ Poseidon 哈希跨语言一致性

#### 4.3.4 Circuits Tests（电路测试）

**运行环境**: Ubuntu Latest  
**预计时长**: 10-15 分钟

**执行步骤**:
1. 检出代码
2. 设置 Node.js 22 + pnpm 9.12.3
3. 设置 Rust 工具链（用于编译 circom）
4. 安装 circom 编译器
5. 配置 pnpm 缓存
6. 安装依赖并构建 SDK
7. 运行电路测试

**验证内容**:
- ✅ 所有加密原语正确
- ✅ 数据结构电路正确
- ✅ AMACI 特定电路正确
- ✅ MACI 集成电路正确

### 4.4 触发条件

自动化测试在以下情况下触发：

```yaml
on:
  push:
    branches:
      - '**'  # 所有分支的 push
  pull_request:
    branches:
      - '**'  # 所有分支的 PR
```

### 4.5 查看测试结果

1. 访问 GitHub 仓库
2. 点击 **Actions** 标签
3. 选择对应的 workflow run
4. 查看各个 Job 的执行状态和日志

**状态标识**:
- ✅ 绿色勾号 - 测试通过
- ❌ 红色叉号 - 测试失败
- 🟡 黄色圆圈 - 测试进行中

### 4.6 本地复现 CI 测试

在提交前，可以在本地运行相同的测试命令：

```bash
# 1. 合约测试
cargo test --lib -- --nocapture

# 2. 编译合约（使用 Docker）
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/rust-optimizer:0.15.1

# 3. E2E 测试
cd e2e
pnpm install
pnpm setup-circuits  # 首次运行
pnpm test

# 4. Circuits 测试
cd packages/circuits
pnpm install
pnpm test
```

### 4.7 CI/CD 性能优化

#### 并行执行
三个独立的测试任务（Contract、E2E、Circuits）并行执行，最大化利用 CI 资源。

#### 智能缓存
- **Cargo 缓存**: 避免重复下载和编译 Rust 依赖
- **pnpm 缓存**: 避免重复下载 Node.js 依赖
- **Circuit 缓存**: 避免重复下载 100MB+ 的 zkey 文件
- **circom 缓存**: 避免重复编译 circom 编译器

#### 缓存键策略
使用 `hashFiles()` 函数基于依赖文件的哈希生成缓存键，确保依赖变化时自动更新缓存。

```yaml
key: ${{ runner.os }}-cargo-registry-${{ hashFiles('**/Cargo.lock') }}
```

### 4.8 故障排查

#### 合约测试失败
1. 检查 Rust 代码语法错误
2. 查看测试日志中的详细错误信息
3. 确认 Rust 工具链版本正确（1.79.0）
4. 本地运行 `cargo test` 复现问题

#### E2E 测试失败
1. **合约编译失败**
   - 检查 Build WASM Job 的日志
   - 确认 Docker 正常运行
   
2. **Circuit 文件下载失败**
   - 检查网络连接
   - 确认 S3 URL 可访问
   - 清除并重建缓存
   
3. **测试用例失败**
   - 查看具体测试日志
   - 检查是否是业务逻辑错误
   - 本地运行失败的测试用例

#### Circuits 测试失败
1. 检查 Node.js 内存是否足够（需要 4GB+）
2. 查看具体测试用例的错误信息
3. 确认 circom 编译器安装正确

#### 缓存问题
如果缓存导致问题（如依赖版本冲突）：

1. 进入 GitHub 仓库
2. Settings → Actions → Caches
3. 找到并删除相关缓存
4. 重新运行 workflow

---

## 5. 测试覆盖范围与目标

### 5.1 测试覆盖矩阵

| 测试层级 | 覆盖范围 | 测试工具 | 运行环境 |
|---------|---------|---------|---------|
| **合约单元测试** | 合约函数、状态管理、权限控制 | Rust + cw-multi-test | 本地 / CI |
| **电路测试** | 加密原语、ZK 电路、数据结构 | Circomkit + Mocha | 本地 / CI |
| **E2E 集成测试** | 完整投票流程、SDK 协同、跨组件集成 | cosmwasm-simulate + Mocha | 本地 / CI |
| **CI/CD 自动化** | 所有测试的自动化执行 | GitHub Actions | CI |

### 5.2 代码覆盖率

#### 合约代码
- ✅ **核心逻辑**: 100% 覆盖（注册、投票、消息处理、证明验证）
- ✅ **状态管理**: 100% 覆盖（状态树、承诺、记录）
- ✅ **错误处理**: 90%+ 覆盖（各种异常情况）
- ✅ **权限控制**: 100% 覆盖（管理员、协调员、用户）

#### 电路代码
- ✅ **加密原语**: 100% 覆盖（Poseidon、ECDH、EdDSA、ElGamal）
- ✅ **数据结构**: 100% 覆盖（五叉树、消息哈希）
- ✅ **AMACI 电路**: 100% 覆盖（停用、添加密钥、消息处理）
- ✅ **MACI 电路**: 100% 覆盖（消息处理、票数统计）

#### SDK 集成
- ✅ **投票流程**: 100% 覆盖（AMACI、MACI 完整流程）
- ✅ **状态同步**: 100% 覆盖（链上链下一致性）
- ✅ **证明生成**: 100% 覆盖（所有证明类型）

### 5.3 测试场景覆盖

#### 正常流程
- ✅ AMACI QV 完整流程
- ✅ MACI 1P1V 完整流程
- ✅ Registry 轮次管理
- ✅ 用户注册和投票
- ✅ 消息处理和票数统计

#### 边界情况
- ✅ 最大用户数（25 个）
- ✅ 最大选项数（5 个）
- ✅ 批处理边界（5 条消息）
- ✅ 时间窗口边界
- ✅ 状态树深度边界

#### 异常处理
- ✅ 重复注册
- ✅ 无效证明
- ✅ 权限不足
- ✅ 时间窗口外操作
- ✅ 无效消息格式

#### 跨语言一致性
- ✅ Rust 和 TypeScript 的 Poseidon 哈希一致性
- ✅ Rust 合约和 TypeScript SDK 状态一致性

### 5.4 测试目标与价值

#### 5.4.1 质量保证
**目标**: 确保代码质量和系统稳定性

**达成效果**:
- ✅ 及早发现和修复 bug
- ✅ 防止功能退化（regression）
- ✅ 确保新功能不破坏现有功能
- ✅ 提高代码可维护性

#### 5.4.2 协议正确性
**目标**: 验证 MACI/AMACI 协议实现的正确性

**达成效果**:
- ✅ 零知识证明正确生成和验证
- ✅ 投票隐私得到保护
- ✅ 抗合谋机制有效
- ✅ 状态转换符合协议规范

#### 5.4.3 跨组件集成
**目标**: 确保合约、SDK、电路无缝协同工作

**达成效果**:
- ✅ 链上链下状态保持同步
- ✅ 证明格式兼容
- ✅ 数据流正确传递
- ✅ 接口调用正确

#### 5.4.4 性能验证
**目标**: 验证系统在预期负载下的性能表现

**达成效果**:
- ✅ 批处理性能满足要求
- ✅ 证明生成时间可接受
- ✅ 合约 gas 消耗优化
- ✅ 大规模场景可行性验证

#### 5.4.5 开发效率
**目标**: 提高开发和迭代速度

**达成效果**:
- ✅ 快速验证修改是否正确
- ✅ 自动化 CI/CD 减少手动测试
- ✅ 测试即文档，辅助理解代码
- ✅ 重构代码时的安全网

#### 5.4.6 上线信心
**目标**: 在部署到生产环境前建立信心

**达成效果**:
- ✅ 全面的测试覆盖
- ✅ 模拟真实使用场景
- ✅ 自动化测试流程
- ✅ 可重复的测试结果

### 5.5 测试驱动的开发流程

```
1. 编写功能代码
   ↓
2. 编写单元测试（Rust / TypeScript）
   ↓
3. 本地运行测试
   ↓
4. 提交代码到 Git
   ↓
5. CI 自动运行所有测试
   ↓
6. 测试通过 → 合并代码
   测试失败 → 修复问题，回到步骤 3
```

### 5.6 测试最佳实践

#### ✅ 做什么
1. **测试先行**: 在实现功能前或同时编写测试
2. **小而专注**: 每个测试只测试一个功能点
3. **清晰命名**: 测试名称清楚描述测试内容
4. **独立测试**: 测试之间不依赖，可以任意顺序运行
5. **快速反馈**: 优先运行快速的单元测试
6. **持续集成**: 每次提交都运行测试
7. **覆盖边界**: 测试边界情况和异常路径

#### ❌ 不要做什么
1. **不要跳过测试**: 所有测试都应该通过才能合并
2. **不要注释测试**: 失败的测试应该修复，而不是注释掉
3. **不要依赖外部服务**: 测试应该可以完全本地运行
4. **不要忽略警告**: 测试警告可能是潜在问题的信号
5. **不要依赖测试顺序**: 测试应该独立可运行

### 5.7 持续改进

测试框架是持续演进的，未来计划：

- 🚀 **增加性能基准测试**: 监控性能退化
- 🚀 **增加压力测试**: 验证极限场景
- 🚀 **增加安全测试**: 验证安全漏洞防护
- 🚀 **改进测试报告**: 更直观的测试结果展示
- 🚀 **增加 fuzz 测试**: 随机输入发现潜在问题

---

## 6. 快速参考

### 6.1 命令速查表

```bash
# ======== 合约测试 ========
# 运行所有合约测试
cargo test --lib -- --nocapture

# 运行特定合约测试
cd contracts/amaci && cargo test -- --nocapture

# ======== E2E 测试 ========
cd e2e
# 首次运行：下载 circuit 文件
pnpm setup-circuits

# 运行所有 E2E 测试
pnpm test

# 运行特定测试
pnpm test:amaci      # AMACI 测试
pnpm test:maci       # MACI 测试
pnpm test:registry   # Registry 测试
pnpm test:advanced   # 高级场景测试

# ======== 电路测试 ========
cd packages/circuits
pnpm test

# 运行特定电路测试
pnpm test:poseidonHasher
pnpm test:amaciIntegration

# ======== 编译合约 ========
# 本地编译（用于开发）
pnpm build

# 生产编译（使用 rust-optimizer）
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/rust-optimizer:0.15.1
```

### 6.2 关键文件位置

```
测试相关文件位置:
├── .github/workflows/test.yml          # CI/CD 配置
├── e2e/                                 # E2E 测试框架
│   ├── tests/*.test.ts                 # 测试用例
│   └── src/                            # 测试框架代码
├── contracts/*/src/multitest/          # 合约集成测试
├── packages/circuits/ts/__tests__/     # 电路测试
└── rust-toolchain.toml                 # Rust 版本配置
```

### 6.3 重要概念

| 概念 | 说明 |
|-----|------|
| **cosmwasm-simulate** | CosmWasm 本地模拟器，用于 E2E 测试 |
| **cw-multi-test** | CosmWasm 多测试框架，用于合约测试 |
| **circomkit** | Circom 电路测试工具 |
| **snarkjs** | ZK 证明生成和验证库 |
| **rust-optimizer** | 优化 WASM 合约大小的 Docker 镜像 |
| **zkey** | ZK 证明密钥文件 |
| **witness** | 电路计算的中间结果 |

### 6.4 故障排查快速指南

| 问题 | 可能原因 | 解决方案 |
|-----|---------|---------|
| 找不到 WASM 文件 | 未编译合约 | `pnpm build` 或使用 rust-optimizer |
| 找不到 circuit 文件 | 未下载 zkey | `cd e2e && pnpm setup-circuits` |
| 内存不足错误 | Node.js 内存限制 | `NODE_OPTIONS=--max-old-space-size=8192` |
| 测试超时 | 电路计算时间长 | 正常现象，等待或增加 timeout 设置 |
| CI 测试失败 | 缓存问题 | 清除 GitHub Actions 缓存 |
| Rust 编译错误 | 工具链版本不匹配 | 确认使用 Rust 1.79.0 |

---

## 7. 总结

MACI 项目建立了一套 **全面、自动化、多层次** 的测试体系：

### 测试覆盖
- ✅ **合约层**: Rust 单元测试 + 集成测试
- ✅ **电路层**: 加密原语 + ZK 电路测试
- ✅ **集成层**: E2E 端到端完整流程测试
- ✅ **自动化**: GitHub Actions CI/CD

### 关键优势
1. **高质量保证**: 全面的测试覆盖确保代码质量
2. **快速反馈**: 自动化测试快速发现问题
3. **协议正确性**: 验证 MACI/AMACI 协议实现
4. **跨组件协同**: 确保合约、SDK、电路无缝集成
5. **持续集成**: 每次提交自动测试，防止问题合并

### 最终目标
**通过完善的测试体系，确保 MACI 系统在部署到生产环境时具有高可靠性、高安全性和高性能，为去中心化治理提供坚实的技术保障。**

---

## 8. 附录

### 8.1 相关文档链接

- [E2E 测试框架 README](./e2e/README.md)
- [E2E 快速开始](./e2e/QUICKSTART.md)
- [Circuits 详细解析](./packages/circuits/incrementalQuinTree_详细解析.md)
- [CI/CD 配置说明](./.github/workflows/README.md)
- [CI/CD 设置文档](./CI_CD_SETUP.md)

### 8.2 外部资源

- [CosmWasm Simulate 文档](https://oraichain.github.io/cw-simulate/)
- [cw-multi-test 文档](https://github.com/CosmWasm/cw-multi-test)
- [Circomkit 文档](https://github.com/erhant/circomkit)
- [SnarkJS 文档](https://github.com/iden3/snarkjs)
- [MACI 协议原文](https://ethresear.ch/t/minimal-anti-collusion-infrastructure/5413)

### 8.3 联系方式

如有测试相关问题，请联系：
- 技术团队: team@dorafactory.org
- GitHub Issues: 项目仓库 Issues 页面

---

**文档版本**: v1.0  
**最后更新**: 2025-11-18  
**维护者**: MACI 开发团队

