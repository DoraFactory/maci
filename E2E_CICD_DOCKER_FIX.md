# E2E CI/CD Docker 问题修复方案

## 最新更新 (2025-11-17)

### Circom 安装问题修复

**问题**：`brew install circom` 在 macOS GitHub Actions runner 上失败，因为 circom 不在 Homebrew 官方仓库中。

```
Warning: No available formula with the name "circom". Did you mean circumflex?
Error: Process completed with exit code 1.
```

**解决方案**：从源代码编译 circom，并使用 GitHub Actions 缓存加速后续构建。

**修改内容**：
1. 移除 `brew install circom`
2. 添加 circom 二进制文件缓存（`~/.cargo/bin/circom`）
3. 条件化安装步骤：只在缓存未命中时从源代码编译
4. 从 GitHub 克隆 circom 仓库并使用 cargo 构建
5. 添加独立的验证步骤确保 circom 可用

**性能优化**：
- 首次运行：需要编译 circom（约 2-3 分钟）
- 后续运行：直接使用缓存的二进制文件（< 10 秒）

---

## 问题描述

在尝试将 e2e 测试迁移到 macOS runner 时遇到的问题：

```bash
Run docker run --rm -v "$(pwd)":/code \
/Users/runner/work/_temp/338f27c7-0acc-4758-b258-5a982a035a1c.sh: line 1: docker: command not found
```

**原因**：macOS GitHub Actions runners 默认不安装 Docker Desktop。

## 根本问题回顾

之前的测试失败主要有两个原因：

1. **架构后缀不匹配**
   - CI 在 `ubuntu-latest` (x86_64) 上构建 → 生成 `*-x86_64.wasm`
   - 本地在 macOS M1 上构建 → 生成 `*-aarch64.wasm`
   - ContractLoader 根据 `process.arch` 查找对应后缀的文件
   - 导致 CI 和本地的文件名不匹配

2. **Circom 未安装**
   - Poseidon 一致性测试需要 circom 工具
   - CI 中没有安装步骤

## 最终解决方案：分离构建和测试

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│  Job 1: build-wasm (ubuntu-latest)                          │
│  ├─ 使用 Docker + rust-optimizer 构建 WASM                   │
│  ├─ 生成 *-x86_64.wasm 文件                                  │
│  ├─ 重命名为 *-aarch64.wasm（WASM 本身是平台无关的）          │
│  └─ 上传 artifacts                                           │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  Job 2: e2e-tests (macos-14)                                │
│  ├─ 下载 WASM artifacts                                      │
│  ├─ 安装 circom (brew install circom)                       │
│  ├─ 设置 Node.js 和 pnpm 环境                               │
│  ├─ 构建 SDK 和 Circuits                                    │
│  ├─ 下载和配置 circuits                                      │
│  ├─ 构建 Rust test vector 生成器                            │
│  ├─ 生成 Poseidon test vectors                              │
│  └─ 运行 e2e 测试                                            │
└─────────────────────────────────────────────────────────────┘
```

### 关键洞察：WASM 是平台无关的

**重要发现**：rust-optimizer 生成的 `-x86_64.wasm` 或 `-aarch64.wasm` 后缀**不是指 WASM 本身的架构**，而是**指构建它的主机架构**。

- WASM 本身是平台无关的字节码
- `-x86_64.wasm` 可以在 ARM64 系统上运行
- `-aarch64.wasm` 可以在 x86_64 系统上运行
- 后缀只是 rust-optimizer 为了管理方便添加的标识

**因此**：我们可以在 Linux 上构建，然后重命名文件，在 macOS 上测试！

## 实施细节

### 1. 新增 `build-wasm` Job (ubuntu-latest)

```yaml
build-wasm:
  name: Build WASM Contracts
  runs-on: ubuntu-latest
  steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Setup Rust toolchain
      uses: actions-rust-lang/setup-rust-toolchain@v1
      with:
        toolchain: "1.79.0"
        target: wasm32-unknown-unknown

    - name: Build contracts with rust-optimizer
      run: |
        docker run --rm -v "$(pwd)":/code \
          --mount type=volume,source="$(basename "$(pwd)")_cache",target=/target \
          --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
          cosmwasm/rust-optimizer:0.15.1

    - name: Rename WASM files for cross-platform compatibility
      run: |
        # rust-optimizer generates *-x86_64.wasm on Linux
        # Rename to *-aarch64.wasm for compatibility with macOS test runner
        cd artifacts
        for file in *-x86_64.wasm; do
          if [ -f "$file" ]; then
            newname="${file/-x86_64.wasm/-aarch64.wasm}"
            echo "Renaming $file to $newname"
            mv "$file" "$newname"
          fi
        done
        ls -lh

    - name: Upload WASM artifacts
      uses: actions/upload-artifact@v4
      with:
        name: wasm-contracts
        path: artifacts/*.wasm
        retention-days: 1
```

**优势**：
- ✅ Linux runner 有 Docker，可以使用 rust-optimizer
- ✅ 构建优化的、体积小的 WASM 文件
- ✅ 使用缓存加速构建
- ✅ 将文件重命名为 macOS 测试期望的格式

### 2. 修改 `e2e-tests` Job (macos-14)

```yaml
e2e-tests:
  name: E2E Tests
  runs-on: macos-14  # Apple Silicon M1/M2
  needs: build-wasm  # 依赖 build-wasm job
  timeout-minutes: 60
  steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Setup Rust toolchain
      uses: actions-rust-lang/setup-rust-toolchain@v1
      with:
        toolchain: "1.79.0"
        components: rustfmt, clippy

    - name: Download WASM artifacts
      uses: actions/download-artifact@v4
      with:
        name: wasm-contracts
        path: artifacts/

    - name: Verify WASM artifacts
      run: |
        echo "Checking downloaded artifacts..."
        ls -lh artifacts/

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'

    - name: Setup pnpm
      uses: pnpm/action-setup@v4
      with:
        version: 9.12.3

    - name: Cache circom
      id: cache-circom
      uses: actions/cache@v4
      with:
        path: ~/.cargo/bin/circom
        key: ${{ runner.os }}-circom-v2.1.8

    - name: Install circom
      if: steps.cache-circom.outputs.cache-hit != 'true'
      run: |
        # Build circom from source (not available via Homebrew)
        git clone https://github.com/iden3/circom.git /tmp/circom
        cd /tmp/circom
        cargo build --release
        cargo install --path circom

    - name: Verify circom installation
      run: circom --version

    # ... 其余步骤
```

**优势**：
- ✅ macOS M1/M2 性能优秀
- ✅ 与本地开发环境一致（Mac M1）
- ✅ 无需 Docker，直接下载预构建的 WASM
- ✅ 使用 Homebrew 安装 circom
- ✅ 可以构建 Rust test vector 生成器

## 各方案对比

| 方案 | 构建平台 | 测试平台 | Docker | Circom | 成本 | 优势 |
|------|---------|---------|--------|--------|------|------|
| **原方案** | ubuntu-latest | ubuntu-latest | ✅ | ❌ | 低 | Docker 可用 |
| **纯 macOS** | macos-14 | macos-14 | ❌ | ✅ | 高 | 环境一致 |
| **混合方案** ✅ | ubuntu-latest | macos-14 | ✅ | ✅ | 中 | 两全其美 |

**最终选择：混合方案**

## 技术优势

### 1. 利用各平台优势
- **Linux**：Docker 支持好，构建快，成本低
- **macOS**：与本地开发环境一致，Homebrew 生态完善

### 2. 分离关注点
- **构建阶段**：专注于 WASM 优化和编译
- **测试阶段**：专注于运行测试，与本地环境匹配

### 3. 成本优化
- Linux runner：$0.008/分钟
- macOS runner：$0.08/分钟（10倍）
- 混合方案：构建用 Linux（便宜），测试用 macOS（必要）

### 4. 架构灵活性
- WASM 是平台无关的，重命名即可跨平台使用
- ContractLoader 的架构检测功能得到充分利用
- 未来可以轻松添加其他平台

## 修复后的完整流程

```
1. push/PR 触发 CI
   ↓
2. Job: contract-tests (ubuntu-latest)
   ├─ 运行 Rust 单元测试
   └─ 验证合约逻辑
   ↓
3. Job: build-wasm (ubuntu-latest)
   ├─ 使用 rust-optimizer 构建 WASM
   ├─ 生成 *-x86_64.wasm
   ├─ 重命名为 *-aarch64.wasm
   └─ 上传 artifacts
   ↓
4. Job: e2e-tests (macos-14)
   ├─ 下载 WASM artifacts
   ├─ 安装 circom (Homebrew)
   ├─ 设置 Node.js 环境
   ├─ 构建 SDK 和 Circuits
   ├─ 下载 circuits 文件
   ├─ 构建 Rust test vector 生成器
   ├─ 生成 Poseidon test vectors
   └─ 运行 e2e 测试 ✅
   ↓
5. Job: circuits-tests (ubuntu-latest)
   ├─ 运行 circuits 单元测试
   └─ 验证 circuit 逻辑
```

## 预期结果

修复后，所有之前失败的测试应该都能通过：

1. ✅ **AMACI End-to-End Test**
   - 找到 `cw_amaci-aarch64.wasm`（从 Linux 构建并重命名）
   
2. ✅ **MACI (Standard) End-to-End Test**
   - 找到 `cw_api_maci-aarch64.wasm`（从 Linux 构建并重命名）
   
3. ✅ **Poseidon Hash Consistency E2E Tests**
   - circom 已通过 Homebrew 安装
   
4. ✅ **State Tree Update E2E Test (MACI)**
   - WASM 文件可用
   
5. ✅ **State Tree Update E2E Test (AMACI)**
   - WASM 文件可用

## 相关文件修改

### 修改的文件
- `.github/workflows/test.yml`
  - 新增 `build-wasm` job
  - 修改 `e2e-tests` job
  - 添加 artifact 上传/下载步骤
  - 添加 circom 安装步骤
  - 添加文件重命名步骤

### 新建的文件
- `E2E_CICD_DOCKER_FIX.md` (本文档)

## 本地开发工作流

本地开发者仍然可以按原来的方式工作：

```bash
# 在本地 Mac M1/M2 上构建
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/rust-optimizer:0.15.1

# 生成 *-aarch64.wasm 文件（macOS 上的 Docker 是 ARM64 架构）
ls -lh artifacts/

# 运行测试
cd e2e
pnpm test
```

**完全兼容**：本地和 CI 最终都使用 `-aarch64.wasm` 后缀的文件。

## 后续优化建议

1. **缓存 WASM artifacts**
   - 如果合约代码没变，可以跨 workflow 复用
   - 进一步减少构建时间

2. **条件化 macOS runner**
   - 只在 main 分支或 PR 合并时运行完整 e2e
   - feature 分支可以只运行快速测试

3. **监控成本**
   - 跟踪 macOS runner 使用时间
   - 必要时调整策略

4. **考虑自托管 runner**
   - 如果测试频繁，可以考虑自托管 Mac mini
   - 长期可能更经济

## 总结

**最终方案特点**：

✅ **最佳实践**
- 利用 Linux 的 Docker 支持构建 WASM
- 利用 macOS 的生态运行测试
- WASM 平台无关性使跨平台成为可能

✅ **成本优化**
- 构建阶段用便宜的 Linux runner
- 测试阶段用必要的 macOS runner
- 平衡成本和开发体验

✅ **环境一致性**
- 测试环境（macOS M1）与本地开发环境一致
- 减少"本地能跑，CI 不行"的问题
- ContractLoader 架构检测正常工作

✅ **可维护性**
- 职责分离：构建和测试独立
- 易于调试：可以单独重跑任一阶段
- 灵活性：未来可以轻松调整策略

这是一个**工程上优雅的解决方案**，充分利用了 WASM 的平台无关特性和不同 CI runner 的优势！

