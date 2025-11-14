# MACI E2E Testing Framework

基于 [cosmwasm-simulate SDK](https://oraichain.github.io/cw-simulate/) 的端到端测试框架，用于测试 MACI/AMACI 合约的完整投票流程。

## 特性

- ✅ **本地合约执行**: 使用 cosmwasm-simulate SDK 在本地模拟合约执行，无需实际链环境
- ✅ **完整流程测试**: 覆盖从用户注册到结果统计的完整投票流程
- ✅ **电路集成**: 集成 circomkit 生成零知识证明
- ✅ **SDK 协同**: 与 @dorafactory/maci-sdk 紧密集成，验证链上链下状态一致性
- ✅ **多场景支持**: 
  - AMACI (匿名密钥更换 + QV)
  - MACI (标准 1P1V)
  - Registry (多轮次管理)
  - 高级场景 (大规模用户、错误处理等)

## 架构

```
e2e/
├── src/
│   ├── setup/              # 环境设置
│   │   ├── contractLoader.ts    # WASM 合约加载器
│   │   └── chainSetup.ts        # 链环境配置
│   ├── contracts/          # 合约管理
│   │   ├── deployManager.ts     # 合约部署管理
│   │   └── contractClients.ts   # 合约客户端封装
│   ├── utils/              # 工具函数
│   │   ├── testHelpers.ts       # 测试辅助函数
│   │   └── circuitIntegration.ts # 电路证明生成
│   └── types/              # 类型定义
│       └── index.ts
└── tests/                  # 测试套件
    ├── amaci.e2e.test.ts        # AMACI 完整流程
    ├── maci.e2e.test.ts         # MACI 标准流程
    ├── registry.e2e.test.ts     # Registry 管理
    └── advanced.e2e.test.ts     # 高级场景
```

## 安装

```bash
cd e2e
pnpm install
```

## 使用

### 运行所有测试

```bash
pnpm test
```

### 运行特定测试

```bash
# AMACI 端到端测试
pnpm test:amaci

# MACI 标准流程测试
pnpm test:maci

# Registry 测试
pnpm test:registry

# 高级场景测试
pnpm test:advanced
```

## 测试说明

### 1. AMACI 端到端测试 (`amaci.e2e.test.ts`)

测试完整的 AMACI 投票流程，包括匿名密钥更换：

**流程步骤:**
1. 环境准备 - 部署 AMACI 合约，初始化 SDK
2. 用户注册 - 3个用户注册
3. 密钥停用 - 用户发送停用消息
4. 处理停用 - 协调员处理停用消息并生成证明
5. 添加新密钥 - 用户添加新的匿名密钥
6. 投票 - 用户使用新旧密钥投票
7. 消息处理 - 批量处理投票消息
8. 票数统计 - 统计最终结果
9. 结果验证 - 验证链上链下结果一致

**关键点:**
- 测试匿名密钥更换机制
- 验证零知识证明生成和验证
- 确保 SDK 状态与合约状态同步

### 2. MACI 标准流程测试 (`maci.e2e.test.ts`)

测试标准 MACI 1P1V 模式：

**场景:**
- 5个用户参与投票
- 3个投票选项
- 测试投票修改（nonce 机制）
- 批量处理和统计

**验证点:**
- 1P1V 规则正确执行
- 投票修改正确处理
- 最终票数准确

### 3. Registry 端到端测试 (`registry.e2e.test.ts`)

测试 Registry 合约管理多个投票轮次：

**功能测试:**
- 创建多个轮次（AMACI QV、MACI 1P1V）
- 查询单个轮次
- 列出所有轮次
- 分页查询
- 按类型筛选

### 4. 高级场景测试 (`advanced.e2e.test.ts`)

测试边界情况和复杂场景：

**场景包括:**
- 大规模用户 (10+ 用户)
- 重复注册错误处理
- 投票时间窗口限制
- 无效证明拒绝
- 时间推进测试

## 核心组件

### ContractLoader

加载编译好的 WASM 合约字节码：

```typescript
const loader = new ContractLoader();
const amaciWasm = await loader.loadAmaciContract();
```

### DeployManager

管理合约部署和实例化：

```typescript
const deployManager = new DeployManager(client, loader);
const contractInfo = await deployManager.deployAmaciContract(
  sender,
  initMsg
);
```

### Contract Clients

类型安全的合约调用封装：

```typescript
const amaciContract = new AmaciContractClient(
  client,
  contractAddress,
  sender
);

await amaciContract.signUp(pubkey);
await amaciContract.publishMessage(message, encPubKey);
```

### Circuit Integration

电路证明生成和格式转换：

```typescript
const proof = await generateDeactivateProof(
  input,
  stateTreeDepth,
  batchSize
);

await amaciContract.processDeactivateMessage(
  size,
  commitment,
  root,
  proof
);
```

## 数据流

```
VoterClient (SDK)
  ↓ 生成投票消息
SimulateCosmWasmClient
  ↓ 发布到合约
OperatorClient (SDK)
  ↓ 处理消息，生成电路输入
Circomkit
  ↓ 生成零知识证明
SimulateCosmWasmClient
  ↓ 提交证明到合约
Contract
  ↓ 验证证明，更新状态
Test
  ↓ 验证结果
```

## 关键技术点

### 1. 证明格式转换

从 snarkjs 格式转换为合约期望格式：

```typescript
function convertProofToContractFormat(proof: Groth16Proof): ContractProofType {
  return {
    a: JSON.stringify(proof.pi_a),
    b: JSON.stringify(proof.pi_b),
    c: JSON.stringify(proof.pi_c)
  };
}
```

### 2. 状态同步

SDK 维护链下状态树，合约存储链上承诺：

```typescript
// SDK 更新
operator.initStateTree(index, pubKey, balance);

// 合约更新
await amaciContract.signUp(pubKey);

// 验证一致性
const sdkRoot = operator.stateTree.root;
const contractRoot = await amaciContract.getStateRoot();
expect(sdkRoot).to.equal(contractRoot);
```

### 3. 时间控制

使用 cosmwasm-simulate 的时间推进功能：

```typescript
import { advanceTime } from '../src/utils/testHelpers';

// 推进 1 小时
await advanceTime(client, 3600);
```

## 配置

### TypeScript 配置

`tsconfig.json` 配置了路径别名：

```json
{
  "paths": {
    "@/*": ["src/*"],
    "@setup/*": ["src/setup/*"],
    "@contracts/*": ["src/contracts/*"],
    "@utils/*": ["src/utils/*"]
  }
}
```

### Mocha 配置

`.mocharc.json` 设置了长超时时间以适应电路计算：

```json
{
  "timeout": 600000,  // 10 分钟
  "exit": true
}
```

## 依赖

### 核心依赖

- `@oraichain/cw-simulate` - CosmWasm 本地模拟器
- `@dorafactory/maci-sdk` - MACI SDK
- `@dorafactory/maci-circuits` - 电路定义
- `circomkit` - 电路测试工具
- `snarkjs` - 零知识证明库

### 测试依赖

- `mocha` - 测试运行器
- `chai` - 断言库
- `ts-mocha` - TypeScript 支持

## 注意事项

1. **合约文件**: 确保 `../artifacts/` 目录下有编译好的 WASM 文件
2. **电路文件**: 确保 `../packages/circuits/` 有编译好的电路
3. **内存**: 电路计算需要较大内存，已配置 `--max-old-space-size=4096`
4. **超时**: 完整测试可能需要 10+ 分钟，已设置适当的超时时间

## 故障排除

### WASM 文件未找到

```bash
# 确保合约已编译
cd ../
pnpm build
```

### 电路文件未找到

```bash
# 编译电路
cd ../packages/circuits
pnpm run circom:build
```

### 内存不足

增加 Node.js 内存限制：

```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm test
```

## 扩展

### 添加新的合约客户端

在 `src/contracts/contractClients.ts` 中添加：

```typescript
export class MyContractClient extends BaseContractClient {
  async myMethod(param: string): Promise<any> {
    return await this.execute({ my_method: { param } });
  }
}
```

### 添加新的测试场景

在 `tests/` 目录下创建新文件：

```typescript
import { expect } from 'chai';
import { createTestEnvironment, DeployManager } from '../src';

describe('My Test', function() {
  it('should work', async () => {
    const env = await createTestEnvironment();
    // Your test code
  });
});
```

## 参考资料

- [cosmwasm-simulate 文档](https://oraichain.github.io/cw-simulate/)
- [MACI SDK 文档](https://github.com/dorafactory/maci)
- [Circomkit 文档](https://github.com/erhant/circomkit)

## 许可证

Apache-2.0

