# CI/CD 配置问题解决记录

## 问题描述

在 GitHub Actions 中运行 circuits 测试时遇到错误：

```
Error: Cannot find module '/home/runner/work/maci/maci/packages/circuits/node_modules/@dorafactory/maci-sdk/dist/index.js'
```

## 根本原因

这是一个 **monorepo 依赖构建顺序问题**：

### 依赖关系

```
packages/
├── sdk/                  # 基础包
├── circuits/             # 依赖 sdk (workspace:*)
└── ...

e2e/                      # 依赖 sdk 和 circuits (workspace:*)
```

### 问题分析

1. **pnpm workspace 依赖**
   - `packages/circuits/package.json` 中声明 `"@dorafactory/maci-sdk": "workspace:*"`
   - `e2e/package.json` 中声明依赖 `"@dorafactory/maci-sdk": "workspace:*"` 和 `"@dorafactory/maci-circuits": "workspace:*"`

2. **构建产物缺失**
   - SDK 的 `main` 字段指向 `./dist/index.js`
   - 但是 `dist/` 目录只有在执行 `pnpm build` 后才会生成
   - 如果不先构建 SDK，circuits 和 e2e 测试都会找不到模块

3. **CI 环境特性**
   - CI 从 git clone 开始，只有源代码
   - `dist/` 目录通常在 `.gitignore` 中
   - 必须在 CI 中重新构建依赖包

## 解决方案

### 1. Circuits 测试修复

在运行 circuits 测试前，添加构建 SDK 的步骤：

```yaml
- name: Build SDK (circuits dependency)
  working-directory: ./packages/sdk
  run: pnpm build

- name: Run circuits tests
  working-directory: ./packages/circuits
  run: pnpm test
```

### 2. E2E 测试修复

E2E 测试依赖 SDK 和 circuits 两个包，需要先构建它们：

```yaml
- name: Build SDK (e2e dependency)
  working-directory: ./packages/sdk
  run: pnpm build

- name: Build Circuits (e2e dependency)
  working-directory: ./packages/circuits
  run: pnpm build

- name: Run e2e tests
  working-directory: ./e2e
  run: pnpm test
```

## 完整修复流程

### E2E 测试步骤顺序

1. ✅ Checkout 代码
2. ✅ 设置 Rust 工具链
3. ✅ 使用 rust-optimizer 编译合约 WASM
4. ✅ 设置 Node.js 和 pnpm
5. ✅ 安装依赖
6. **✅ 构建 SDK** ← 新增
7. **✅ 构建 Circuits** ← 新增
8. ✅ 下载 circuit zkey 文件
9. ✅ 运行 e2e 测试

### Circuits 测试步骤顺序

1. ✅ Checkout 代码
2. ✅ 设置 Node.js 和 pnpm
3. ✅ 安装依赖
4. **✅ 构建 SDK** ← 新增
5. ✅ 运行 circuits 测试

## 构建命令说明

### SDK 构建

```bash
cd packages/sdk
pnpm build
```

执行内容（来自 `packages/sdk/package.json`）：
```json
"build": "npm run build:types && npm run build:tsup"
```

- `build:types`: 使用 TypeScript 编译类型定义
- `build:tsup`: 使用 tsup 打包为 ESM 和 CJS 格式

输出：
- `dist/index.js` (CJS)
- `dist/index.mjs` (ESM)
- `dist/index.d.ts` (类型定义)

### Circuits 构建

```bash
cd packages/circuits
pnpm build
```

执行内容（来自 `packages/circuits/package.json`）：
```json
"build": "tsc -p tsconfig.build.json"
```

输出：
- `build/ts/*.js` (编译后的 TypeScript)

## 本地测试建议

在本地开发时，也需要注意依赖构建顺序：

```bash
# 方法 1: 使用 pnpm 的递归构建（推荐）
pnpm -r build

# 方法 2: 手动按顺序构建
cd packages/sdk && pnpm build
cd ../circuits && pnpm build
cd ../../e2e && pnpm test
```

## 其他 Monorepo 依赖注意事项

### 常见依赖链

```
SDK (基础)
  ↓
Circuits (依赖 SDK)
  ↓
E2E (依赖 SDK 和 Circuits)
```

### 最佳实践

1. **明确构建顺序**
   - 在 CI 配置中明确列出依赖构建步骤
   - 按照依赖关系从底层到上层构建

2. **使用 workspace 协议**
   - `"@dorafactory/maci-sdk": "workspace:*"` 表示使用本地 workspace 版本
   - pnpm 会自动链接到 workspace 包

3. **CI 缓存优化**（可选）
   - 可以缓存 `packages/*/dist` 目录
   - 但要注意缓存失效策略（基于源码 hash）

4. **脚本简化**（可选）
   - 可以在根目录 `package.json` 添加：
     ```json
     "scripts": {
       "build": "pnpm -r --filter='@dorafactory/maci-sdk' build && pnpm -r --filter='@dorafactory/maci-circuits' build"
     }
     ```

## 验证修复

修复后的测试流程：

```bash
# 1. SDK 构建成功
✓ packages/sdk/dist/index.js 生成
✓ packages/sdk/dist/index.d.ts 生成

# 2. Circuits 可以找到 SDK
✓ import { ... } from '@dorafactory/maci-sdk' 成功

# 3. Circuits 构建成功
✓ packages/circuits/build/ts/*.js 生成

# 4. E2E 可以找到 SDK 和 Circuits
✓ import { ... } from '@dorafactory/maci-sdk' 成功
✓ import { ... } from '@dorafactory/maci-circuits' 成功

# 5. 测试运行成功
✓ Circuits 测试通过
✓ E2E 测试通过
```

## 总结

这个问题的本质是 **monorepo 中的构建依赖顺序管理**。在 CI 环境中，必须显式地按照依赖关系构建各个包，才能确保后续的包能正确导入前置依赖。

**关键点**：
- ✅ 识别 workspace 依赖关系
- ✅ 在 CI 中按顺序构建依赖
- ✅ 确保构建产物（dist/）存在再运行测试

---

**修复日期**: 2025-11-16
**影响范围**: Circuits 测试、E2E 测试
**解决状态**: ✅ 已修复

