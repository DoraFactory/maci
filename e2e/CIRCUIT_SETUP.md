# MACI/AMACI Circuit Setup Guide

## 概述

本指南介绍如何设置和管理 MACI 和 AMACI 的零知识电路文件（zkey）。

## 电路配置

我们支持两种电路配置，分别对应 MACI 和 AMACI：

### MACI 1P1V (maci-2-1-1-5)
- **State Tree Depth**: 2 (最多 5² = 25 个选民)
- **Int State Tree Depth**: 1
- **Vote Option Tree Depth**: 1 (最多 5¹ = 5 个选项)
- **Message Batch Size**: 5
- **URL**: `https://vota-zkey.s3.ap-southeast-1.amazonaws.com/qv1p1v_2-1-1-5_zkeys.tar.gz`
- **文件大小**: ~212 MB

### AMACI (amaci-2-1-1-5)
- **State Tree Depth**: 2 (最多 5² = 25 个选民)
- **Int State Tree Depth**: 1
- **Vote Option Tree Depth**: 1 (最多 5¹ = 5 个选项)
- **Message Batch Size**: 5
- **URL**: `https://vota-zkey.s3.ap-southeast-1.amazonaws.com/amaci_2-1-1-5_v3_zkeys.tar.gz`
- **文件大小**: ~173 MB

## 安装步骤

### 1. 下载所有电路文件

```bash
cd e2e
pnpm download-zkeys
```

这将自动：
- 从 S3 下载 MACI 和 AMACI 的 zkey tarballs
- 解压到正确的目录结构
- 清理临时文件和 macOS 元数据文件

### 2. 提取验证密钥

```bash
pnpm extract-vkeys
```

这将：
- 从每个 zkey 文件中提取 Groth16 验证密钥
- 转换为合约兼容的格式
- 生成 JSON 文件：
  - `circuits/vkeys-maci-2-1-1-5.json`
  - `circuits/vkeys-amaci-2-1-1-5.json`

### 3. 一键设置（推荐）

```bash
pnpm setup-circuits
```

这将依次执行下载和提取步骤。

## 目录结构

设置完成后，`circuits/` 目录结构如下：

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
│   └── tallyVotes.zkey
├── vkeys-maci-2-1-1-5.json
└── vkeys-amaci-2-1-1-5.json
```

## 运行测试

### MACI 测试
```bash
pnpm test:maci
```

### AMACI 测试
```bash
pnpm test:amaci
```

### 所有测试
```bash
pnpm test
```

## 重要说明

1. **MACI 与 AMACI 的 zkey 不同**：
   - MACI 使用标准的消息处理电路
   - AMACI 增加了匿名密钥更换的支持（deactivate/addNewKey）
   - 两者的 vkey (verification key) 完全不同

2. **时间格式**：
   - CosmWasm 的 `Timestamp` 使用**纳秒**为单位
   - 测试中必须使用 `BigInt(Date.now()) * BigInt(1_000_000)` 来转换

3. **电路参数必须匹配**：
   - 测试中的参数必须与 zkey 文件的配置完全一致
   - 否则合约会拒绝实例化（`No matching circuit size`）

4. **Whitelist 配置**（AMACI）：
   - AMACI 支持两种模式：传统 whitelist 和 oracle 签名
   - 传统模式下必须在 `instantiateMsg` 中提供 `whitelist`
   - 每个地址只能注册一次

## 故障排除

### 缺少电路文件
```
❌ Missing required circuit files
```
**解决方案**: 运行 `pnpm setup-circuits`

### 电路参数不匹配
```
Error: No matching circuit size
```
**解决方案**: 检查测试中的 `stateTreeDepth`, `voteOptionTreeDepth` 等参数是否与 zkey 配置（2-1-1-5）匹配

### 时间验证失败
```
Error: The end_time must be greater than the start_time and more than 10 minutes apart
```
**解决方案**: 
- 确保使用纳秒（乘以 1_000_000）
- `end_time - start_time > 600秒`

### Whitelist 未配置
```
Error: Whitelist not configured
```
**解决方案**: 在 AMACI 的 `instantiateMsg` 中添加 `whitelist.users` 列表

## 维护

- 所有 zkey 文件都在 `.gitignore` 中，不会提交到 Git
- 生成的 vkey JSON 文件会提交到仓库
- 如需更新 zkey 文件，删除 `circuits/` 目录后重新运行 `pnpm setup-circuits`

