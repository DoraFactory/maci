# E2E 测试框架快速开始

## 前置要求

1. 确保已编译合约 WASM 文件
```bash
cd ..
pnpm build
```

2. 确保已编译电路
```bash
cd packages/circuits
pnpm run circom:build
```

## 安装依赖

```bash
cd e2e
pnpm install
```

## 运行测试

### 快速测试

运行 Registry 测试（最快，不涉及电路）：
```bash
pnpm test:registry
```

### 完整流程测试

运行 AMACI 完整流程测试：
```bash
pnpm test:amaci
```

运行 MACI 标准流程测试：
```bash
pnpm test:maci
```

### 高级场景测试

```bash
pnpm test:advanced
```

### 运行所有测试

```bash
pnpm test
```

## 目录结构

```
e2e/
├── src/                    # 框架源代码
│   ├── setup/             # 环境设置
│   ├── contracts/         # 合约管理
│   ├── utils/             # 工具函数
│   └── types/             # 类型定义
├── tests/                 # 测试文件
│   ├── amaci.e2e.test.ts
│   ├── maci.e2e.test.ts
│   ├── registry.e2e.test.ts
│   └── advanced.e2e.test.ts
├── package.json
├── tsconfig.json
├── .mocharc.json
└── README.md
```

## 编写自己的测试

### 1. 创建测试文件

在 `tests/` 目录下创建新文件 `my-test.e2e.test.ts`：

```typescript
import { expect } from 'chai';
import { createTestEnvironment, DeployManager, ContractLoader } from '../src';

describe('My Custom Test', function() {
  this.timeout(300000);
  
  it('should do something', async () => {
    // 创建测试环境
    const env = await createTestEnvironment({
      chainId: 'my-test',
      bech32Prefix: 'orai'
    });
    
    // 使用环境进行测试
    expect(env.client).to.not.be.undefined;
  });
});
```

### 2. 添加测试脚本

在 `package.json` 中添加：

```json
{
  "scripts": {
    "test:my": "pnpm run mocha-test tests/my-test.e2e.test.ts"
  }
}
```

### 3. 运行测试

```bash
pnpm test:my
```

## 常见问题

### Q: 测试运行很慢怎么办？

A: 电路计算需要时间，特别是第一次编译。后续运行会快一些。可以先运行不涉及电路的测试（如 Registry）。

### Q: 找不到 WASM 文件

A: 确保在项目根目录运行了 `pnpm build`，WASM 文件应该在 `../artifacts/` 目录下。

### Q: 内存不足

A: 增加 Node.js 内存限制：
```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm test
```

### Q: 如何调试特定测试？

A: 使用 `.only` 只运行特定测试：
```typescript
it.only('should test something specific', async () => {
  // your test
});
```

## 下一步

- 阅读 [README.md](./README.md) 了解详细架构
- 查看 [tests/](./tests/) 目录下的示例测试
- 探索 [src/](./src/) 目录了解框架实现

## 支持

如有问题，请提交 issue 到项目仓库。

