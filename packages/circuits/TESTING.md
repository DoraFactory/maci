# AMACI Deactivate Status Detection - 测试指南

## 🚀 快速开始

### 推荐方式：SDK 集成测试

```bash
cd packages/sdk
npx tsx scripts/test_deactivate_decrypt.ts
```

这个测试最全面，包含：
- ✅ 初始状态解密测试
- ✅ Deactivate 后的解密测试
- ✅ Active 状态重新加密测试
- ✅ 错误私钥测试
- ✅ 完整的 Operator 检测流程模拟
- ✅ 预计算哈希值验证

### 电路单元测试（需要编译电路）

```bash
cd packages/circuits
pnpm test DeactivateStatusDetection
```

## 📂 测试文件位置

### 1. SDK 测试（最实用）
- **路径**: `packages/sdk/scripts/test_deactivate_decrypt.ts`
- **语言**: TypeScript
- **依赖**: SDK 加密库
- **运行**: `npx tsx scripts/test_deactivate_decrypt.ts`

### 2. Circuit 单元测试
- **路径**: `packages/circuits/ts/__tests__/DeactivateStatusDetection.test.ts`
- **语言**: TypeScript + Circomkit
- **依赖**: 编译好的电路
- **运行**: `pnpm test DeactivateStatusDetection`

## 📖 测试文档

### 核心文档
1. **[Deactivate-Status-Detection-Tests.md](docs/Deactivate-Status-Detection-Tests.md)**
   - 完整的测试说明
   - 测试用例详解
   - 预期结果
   - 故障排查

2. **[AMACI-Deactivate-Detection-Flow.md](docs/AMACI-Deactivate-Detection-Flow.md)**
   - 检测流程详解
   - 电路逻辑分析
   - Operator 处理流程

3. **[AMACI-ProcessMessages-Analysis.md](docs/AMACI-ProcessMessages-Analysis.md)**
   - ProcessMessages 电路完整分析
   - AMACI vs MACI 对比

## 🧪 测试覆盖的关键概念

### 1. 预计算哈希值
```
hash5([0, 0, 0, 0, 0]) = 0x2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc
```
- **位置**: `contracts/amaci/src/state.rs:114-116`
- **用途**: 初始化用户的 deactivate 状态为 Active

### 2. ElGamal 加密/解密
```typescript
// 加密（isOdd 表示是否 deactivated）
encryptOdevity(isOdd: boolean, pubKey, randomKey)

// 解密
decrypt(privKey, {c1, c2, xIncrement})

// 判断
result % 2 === 0 → Active
result % 2 === 1 → Deactivated
```

### 3. 双层哈希结构（AMACI State Leaf）
```typescript
layer1 = hash5([pubKey_x, pubKey_y, balance, voRoot, nonce])
layer2 = hash5([c1_x, c1_y, c2_x, c2_y, xIncrement])
stateLeafHash = hash2([layer1, layer2])
```

## ✅ 测试清单

- [x] 预计算哈希值验证
- [x] 初始状态 [0,0,0,0] 解密为 0（偶数）
- [x] Deactivate 状态解密为奇数
- [x] Active 重新加密解密为偶数
- [x] 错误私钥无法正确解密（隐私保护）
- [x] Operator 检测逻辑模拟
- [x] 双层哈希计算
- [x] 哈希唯一性验证

## 📊 测试输出示例

```
==========================================
  AMACI Deactivate Status Detection Test
==========================================

2. Test Case 1: Initial State (SignUp)
   State: c1 = [0, 0], c2 = [0, 0]
   Decrypt Result: 0
   Is Odd (deactivated)? false
   Is Even (active)? true
   Status: ✅ ACTIVE

3. Test Case 2: After Deactivate
   Decrypt Result: 1606436447971456257612272868105217304941153427183444971791775520819678890219
   Result % 2: 1
   Is Odd (deactivated)? true
   Status: ❌ DEACTIVATED

6. Test Case 5: Simulate Operator Detection Flow
   User State Leaf (Initial):
   Decrypt value: 0
   Decrypt value % 2: 0
   Status: active
   Can vote: ✅ YES

   User State Leaf (After Deactivate):
   Decrypt value: 7895505991276301902021201923673698770223317079180693137712436085262403163551
   Decrypt value % 2: 1
   Status: deactivated
   Can vote: ❌ NO

==========================================
```

## 🔧 故障排查

### 问题：`Cannot find module 'tsx'`
**解决**: 使用 `npx tsx` 而不是 `tsx`

### 问题：电路测试超时
**解决**: 
1. 增加测试 timeout
2. 使用已编译的电路
3. 跳过电路测试，只运行 SDK 测试

### 问题：哈希值不匹配
**解决**: 确保使用相同的 poseidon 实现（推荐使用 SDK 的实现）

## 📚 相关源代码

### 电路代码
- `packages/circuits/circom/amaci/power/lib/rerandomize.circom` - ElGamalDecrypt
- `packages/circuits/circom/amaci/power/stateLeafTransformer.circom` - 状态转换
- `packages/circuits/circom/amaci/power/processMessages.circom` - 消息处理

### SDK 代码
- `packages/sdk/src/libs/crypto/rerandomize.ts` - 加密/解密函数
- `packages/sdk/src/operator.ts` - Operator 逻辑

### 合约代码
- `contracts/amaci/src/state.rs` - State Leaf 定义和哈希

## 🎓 学习路径

1. **阅读文档**: 
   - 从 `AMACI-Deactivate-Detection-Flow.md` 开始
   - 理解 ElGamal 加密原理

2. **运行测试**:
   - 先运行 SDK 测试看效果
   - 观察输出理解流程

3. **阅读源代码**:
   - 查看 `rerandomize.ts` 中的实现
   - 对比电路实现

4. **修改测试**:
   - 尝试添加新的测试用例
   - 验证边界情况

## 💡 提示

- SDK 测试是最快最直接的方式
- 电路测试更底层但需要编译时间
- 两种测试可以互补使用
- 所有测试都已通过验证

---

*最后更新: 2024-12*

