# CI/CD 工作流程说明

本目录包含 GitHub Actions 的 CI/CD 配置文件。

## test.yml - 自动化测试工作流

### 触发条件
- 所有分支的 `push` 事件
- 所有分支的 `pull_request` 事件

### 测试任务

工作流包含三个并行运行的测试任务：

#### 1. Contract Tests（合约测试）
- **运行环境**: Ubuntu Latest
- **时长**: 约 10-20 分钟
- **步骤**:
  1. 设置 Rust 1.79.0 工具链
  2. 配置 Cargo 缓存（加速后续构建）
  3. 运行命令: `cargo test --lib -- --nocapture`

#### 2. E2E Tests（端到端测试）
- **运行环境**: Ubuntu Latest
- **时长**: 约 40-60 分钟
- **步骤**:
  1. 设置 Rust 工具链
  2. 使用 Docker + rust-optimizer 编译合约 WASM 文件
  3. 设置 Node.js 18 和 pnpm 9.12.3
  4. 下载并缓存 circuit zkey 文件（约 100MB）
  5. 安装依赖并运行 e2e 测试

**注意事项**:
- 首次运行需要编译合约（约 15-20 分钟）
- 首次运行需要下载 zkey 文件（约 5-10 分钟）
- 后续运行会使用缓存，速度更快
- Circuit 文件会被缓存，避免重复下载

#### 3. Circuits Tests（电路测试）
- **运行环境**: Ubuntu Latest
- **时长**: 约 10-15 分钟
- **步骤**:
  1. 设置 Node.js 18 和 pnpm 9.12.3
  2. 安装依赖
  3. 运行 circuits 测试

### 缓存策略

为了加速 CI 运行，配置了以下缓存：

1. **Cargo 缓存**:
   - `~/.cargo/registry` - Cargo registry
   - `~/.cargo/git` - Cargo git 依赖
   - `target/` - 编译产物

2. **pnpm 缓存**:
   - pnpm store - Node.js 依赖

3. **Circuit 文件缓存**:
   - `e2e/circuits/` - zkey 和 wasm 文件

### 预计总时长

- **首次运行**: 约 60 分钟（并行执行）
- **后续运行**: 约 20-30 分钟（得益于缓存）

### 查看测试结果

1. 进入 GitHub 仓库
2. 点击 "Actions" 标签
3. 选择对应的 workflow run
4. 查看各个任务的执行状态和日志

### 本地测试

在提交前，可以在本地运行相同的测试：

```bash
# 合约测试
cargo test --lib -- --nocapture

# E2E 测试
cd e2e
pnpm install
pnpm setup-circuits  # 首次运行需要
pnpm test

# Circuits 测试
cd packages/circuits
pnpm install
pnpm test
```

### 故障排查

#### E2E 测试失败
- 检查合约是否成功编译
- 检查 circuit 文件是否下载成功
- 查看具体的测试日志

#### Circuits 测试失败
- 检查 Node.js 内存是否足够
- 查看具体的测试用例失败原因

#### 缓存问题
如果缓存导致问题，可以在 GitHub Actions 页面清除缓存：
1. Settings -> Actions -> Caches
2. 删除相关缓存
3. 重新运行 workflow

### 维护

- 定期检查依赖更新
- 更新 Rust 工具链版本（`rust-toolchain.toml`）
- 更新 Node.js 版本
- 更新 pnpm 版本

