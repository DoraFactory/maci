# AMACI Deactivate Status Detection Tests

## 📋 概述

本文档说明如何测试 AMACI 中的 deactivate 状态检测机制。

## 🧪 测试文件

### 1. TypeScript 测试（推荐）

**位置**: `packages/circuits/ts/__tests__/DeactivateStatusDetection.test.ts`

**说明**: 使用 Circomkit 框架测试电路和哈希计算。

**运行方式**:
```bash
cd packages/circuits
pnpm test
```

**测试内容**:
- ElGamalDecrypt 电路测试
- Hash5 预计算值验证
- StateLeafTransformer 集成测试
- 完整的 deactivate 流程验证
- 边界情况和安全性测试

### 2. JavaScript 测试

**位置**: `packages/circuits/js/deactivate_detection.test.js`

**说明**: 独立的 JavaScript 测试，不依赖电路编译。

**注意**: 此测试文件需要从 SDK 导入 poseidon 函数。建议使用 SDK 中的测试脚本。

### 3. SDK 集成测试（最实用）

**位置**: `packages/sdk/scripts/test_deactivate_decrypt.ts`

**说明**: 完整的端到端测试，包括加密、解密和状态检测。

**运行方式**:
```bash
cd packages/sdk
npx tsx scripts/test_deactivate_decrypt.ts
```

**测试内容**:
- 初始状态 [0,0,0,0] 解密测试
- Deactivate 后的加密状态测试
- Active 状态的重新加密测试
- 错误私钥解密测试
- 完整的 Operator 检测流程模拟

## 🔍 测试覆盖的关键概念

### 1. 预计算哈希值

```
hash5([0, 0, 0, 0, 0]) = 0x2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc
```

**用途**: 合约中用于初始化用户状态，表示用户处于 Active 状态。

**验证**: 所有测试都会验证这个预计算值是否正确。

### 2. ElGamal 加密解密

```typescript
// 加密
encryptOdevity(isOdd: boolean, pubKey: PubKey, randomKey: bigint)
  → { c1: PubKey, c2: PubKey, xIncrement: bigint }

// 解密
decrypt(privKey: bigint, { c1, c2, xIncrement })
  → bigint

// 状态判断
result % 2 === 0 → Active (可以投票)
result % 2 === 1 → Deactivated (不能投票)
```

### 3. 双层哈希（AMACI State Leaf）

```typescript
// Layer 1: 基础状态
layer1 = poseidon([pubKey_x, pubKey_y, balance, voRoot, nonce])

// Layer 2: Deactivate 加密状态
layer2 = poseidon([c1_x, c1_y, c2_x, c2_y, xIncrement])

// 最终 State Leaf Hash
stateLeafHash = poseidon([layer1, layer2])
```

## 📊 测试案例说明

### Test Case 1: 初始状态（SignUp）

```
输入:
  c1 = [0, 0]
  c2 = [0, 0]
  xIncrement = 0

处理:
  decrypt(coordPrivKey, {c1, c2, xIncrement}) = 0

验证:
  0 % 2 === 0 → Active ✅
```

### Test Case 2: Deactivate 后

```
输入:
  c1 = encryptOdevity(true, coordPubKey, randomKey).c1
  c2 = encryptOdevity(true, coordPubKey, randomKey).c2
  xIncrement = encryptOdevity(...).xIncrement

处理:
  decrypt(coordPrivKey, {c1, c2, xIncrement}) = 奇数

验证:
  result % 2 === 1 → Deactivated ✅
```

### Test Case 3: 重新加密 Active 状态

```
输入:
  c1 = encryptOdevity(false, coordPubKey, randomKey).c1
  c2 = encryptOdevity(false, coordPubKey, randomKey).c2

处理:
  decrypt(coordPrivKey, {c1, c2, xIncrement}) = 偶数

验证:
  result % 2 === 0 → Active ✅
```

### Test Case 4: 错误的私钥

```
输入:
  正确的 {c1, c2}
  错误的 wrongPrivKey

处理:
  decrypt(wrongPrivKey, {c1, c2, xIncrement}) = 错误结果

验证:
  无法正确判断状态 → 隐私得到保护 ✅
```

### Test Case 5: Operator 检测流程

```
模拟完整流程:
1. 用户注册 → c1=c2=[0,0]
2. 检测状态 → decrypt() % 2 = 0 → 可以投票
3. 用户 deactivate → c1,c2 被加密
4. 检测状态 → decrypt() % 2 = 1 → 不能投票
```

## 🎯 预期结果

所有测试都应该通过 (✅)：

```
✅ Test 1: 预计算哈希值匹配
✅ Test 2: 初始状态解密为偶数 (active)
✅ Test 3: Deactivate 后解密为奇数 (deactivated)
✅ Test 4: 重新加密的 Active 解密为偶数
✅ Test 5: 双层哈希计算正确
✅ Test 6: Operator 检测逻辑正确
✅ Test 7: 不同输入产生不同哈希
```

## 🔧 故障排查

### 问题：测试失败，解密结果不是预期的奇偶性

**原因**: `encryptOdevity` 函数会尝试多次编码直到找到正确奇偶性的点。

**解决**: 确保传入了正确的 `xIncrement` 参数给 decrypt 函数。

### 问题：哈希值不匹配

**原因**: Poseidon 哈希的实现可能不同（circom vs JavaScript）。

**解决**: 使用 SDK 中统一的 poseidon 实现。

### 问题：电路测试超时

**原因**: 电路编译需要时间。

**解决**: 增加测试超时时间或使用预编译的电路。

## 📚 相关文档

- [AMACI-Deactivate-Detection-Flow.md](./AMACI-Deactivate-Detection-Flow.md) - 完整的检测流程说明
- [AMACI-ProcessMessages-Analysis.md](./AMACI-ProcessMessages-Analysis.md) - ProcessMessages 电路分析
- [AMACI-Tree-Structure-Analysis.md](./AMACI-Tree-Structure-Analysis.md) - 树结构详解

## 🚀 快速开始

### 运行所有测试

```bash
# 1. SDK 集成测试（推荐）
cd packages/sdk
npx tsx scripts/test_deactivate_decrypt.ts

# 2. 电路单元测试
cd packages/circuits
pnpm test DeactivateStatusDetection

# 3. 查看测试覆盖率
cd packages/circuits
pnpm test --coverage
```

### 添加新的测试

1. 在 `packages/circuits/ts/__tests__/DeactivateStatusDetection.test.ts` 中添加新的 `it()` 块
2. 在 `packages/sdk/scripts/test_deactivate_decrypt.ts` 中添加新的测试场景
3. 运行测试验证

## 📝 测试清单

- [ ] 验证预计算哈希值 `0x2066be...95bc`
- [ ] 测试初始状态 [0,0,0,0] 解密为 0
- [ ] 测试 deactivate 后解密为奇数
- [ ] 测试重新加密 active 状态解密为偶数
- [ ] 测试错误私钥无法正确解密
- [ ] 测试完整的 Operator 检测流程
- [ ] 测试双层哈希计算
- [ ] 测试哈希唯一性
- [ ] 测试边界情况
- [ ] 测试安全性（隐私保护）

## 🎓 学习资源

### 核心文件

1. **电路**: `packages/circuits/circom/amaci/power/lib/rerandomize.circom`
   - ElGamalDecrypt 模板
   - Rerandomize 模板

2. **SDK**: `packages/sdk/src/libs/crypto/rerandomize.ts`
   - encryptOdevity 函数
   - decrypt 函数
   - rerandomize 函数

3. **合约**: `contracts/amaci/src/state.rs`
   - hash_decativate_state_leaf 函数
   - 预计算哈希值定义

### 关键概念

- **ElGamal 加密**: 用于加密 deactivate 状态的公钥加密方案
- **奇偶性编码**: 使用点的 x 坐标奇偶性来表示状态
- **Poseidon 哈希**: ZK 友好的哈希函数
- **双层哈希**: AMACI 特有的状态叶哈希结构

---

*文档版本: 1.0*  
*最后更新: 2024-12*  
*维护者: MACI Development Team*

