# 测试修复完成报告

## 修复时间
2026-02-01

## 问题总结

### 核心问题
所有测试都使用了**错误的 Command 结构**，导致：
1. Command 数组只有 6 个元素（缺少 salt）
2. Packed 计算错误地将 salt 放在 pollId 的位置
3. 加密后只有 7 个元素，但电路期望 10 个元素
4. 导致 "Not enough values for input signal message" 错误

### 根本原因
测试代码没有遵循正确的 Command 结构规范：
```
[0] packed_data  (COMMAND_STATE_INDEX)
[1] pubkey_x     (COMMAND_PUBLIC_KEY_X)
[2] pubkey_y     (COMMAND_PUBLIC_KEY_Y)
[3] salt         (COMMAND_SALT) ⚠️ 这个缺失了
[4] sig_R8_x     (SIGNATURE_POINT_X)
[5] sig_R8_y     (SIGNATURE_POINT_Y)
[6] sig_S        (SIGNATURE_SCALAR)
```

## 修复内容

### 1. MessageToCommand.test.ts - 全部修复

#### 修改 1: 添加导入
```typescript
import {
  VoterClient,
  OperatorClient,
  poseidonEncrypt,
  poseidon,
  poseidonDecrypt,
  packElement  // ✅ 新增
} from '@dorafactory/maci-sdk';
```

#### 修改 2: 所有测试添加 pollId
```typescript
const nonce = 1;
const pollId = 1;  // ✅ 新增
const salt = 12345678n;
```

#### 修改 3: 使用 packElement 替换手动位运算
```typescript
// ❌ 旧代码
const packaged =
  BigInt(nonce) +
  (BigInt(stateIdx) << 32n) +
  (BigInt(voIdx) << 64n) +
  (BigInt(votes) << 96n) +
  (BigInt(salt) << 192n);  // 错误！salt不应该在这里

// ✅ 新代码
const packaged = packElement({ nonce, stateIdx, voIdx, newVotes: votes, pollId });
```

#### 修改 4: Command 数组添加 salt
```typescript
// ❌ 旧代码 (6 元素)
const command = [
  packaged,
  voterPubKey[0],
  voterPubKey[1],
  signature.R8[0],  // 索引 [3]
  signature.R8[1],  // 索引 [4]
  signature.S       // 索引 [5]
];

// ✅ 新代码 (7 元素)
const command = [
  packaged,
  voterPubKey[0],
  voterPubKey[1],
  salt,             // 索引 [3] ✅ 新增
  signature.R8[0],  // 索引 [4]
  signature.R8[1],  // 索引 [5]
  signature.S       // 索引 [6]
];
```

#### 修复的测试用例（共7个）
1. ✅ Line 175-208: "should correctly decrypt and unpack a simple vote message"
2. ✅ Line 277-306: "should correctly handle large vote weights (96-bit)"
3. ✅ Line 339-367: "should handle maximum 32-bit values for indices"
4. ✅ Line 401-437: "should correctly extract packedCommandOut"
5. ✅ Line 459-506: "should produce correct shared key through ECDH"
6. ✅ Line 538-566: "should handle zero vote weight"
7. ✅ Line 597-636: "should work with different voter and coordinator keypairs"

### 2. UnpackElement.test.ts - 修复 1 个测试

#### 问题
测试 "should correctly handle zero values in all fields" 失败：
```
expected 6277101735386680763835789423207666416102355444464034512896n to equal 0n
```

#### 原因
```typescript
const pollId = 1;  // ❌ 不是 0
const packed = packElement({ nonce: 0, stateIdx: 0, voIdx: 0, newVotes: 0, pollId });
// packed = 1 << 192 = 很大的数字
```

#### 修复
```typescript
const pollId = 0;  // ✅ 所有字段都应该是 0
const packed = packElement({ nonce: 0, stateIdx: 0, voIdx: 0, newVotes: 0, pollId });
// packed = 0 ✅
```

## 数据流验证

### 正确的流程

```
1. Voter 端生成 Command (7 元素)
   ↓
2. 使用 poseidonEncrypt 加密 (7 → 10 元素)
   ceil(7/3) * 3 + 1 = 3*3 + 1 = 10
   ↓
3. 电路接收 message[10] ✅
   ↓
4. 电路使用 PoseidonDecrypt 解密 (10 → 7 元素)
   ↓
5. 提取所有字段并验证签名
```

### 关键验证点

| 步骤 | 预期 | 实际 | 状态 |
|------|------|------|------|
| Command 长度 | 7 | 7 | ✅ |
| 加密后长度 | 10 | 10 | ✅ |
| salt 位置 | command[3] | command[3] | ✅ |
| pollId 位置 | packed (bits 192-223) | packed (bits 192-223) | ✅ |
| 电路输入 | message[10] | message[10] | ✅ |

## 测试结果

### MessageToCommand.test.ts
- 预期通过: 9 个测试
- 已修复: 7 个结构性错误
- 剩余问题: SDK integration 测试（需要 voter.ts 中的 pollId 参数）

### UnpackElement.test.ts
- 预期通过: 19 个测试  
- 已修复: 1 个边界情况
- 状态: ✅ 全部通过

## 后续工作

### 可能的剩余问题
1. **SDK integration 测试**: `buildVotePayload` 需要 `pollId` 参数
2. **OperatorClient 测试**: `pushMessage` 可能需要更新

### 建议
1. 重新运行所有测试: `pnpm test`
2. 检查 `voter.ts` 中的 `buildVotePayload` 是否需要 `pollId` 参数
3. 更新所有使用 voter API 的测试

## 文档

已创建的文档：
- `/Users/feng/Desktop/dora-work/new/maci/packages/sdk/COMMAND_STRUCTURE_FINAL_FIX.md`
- `/Users/feng/Desktop/dora-work/new/maci/packages/circuits/MESSAGE_LENGTH_UPDATE_SUMMARY.md`
- `/Users/feng/Desktop/dora-work/new/maci/packages/circuits/TEST_FIXES_SUMMARY.md`

## 总结

✅ **所有结构性错误已修复**
✅ **Command 结构现在正确（7 元素）**
✅ **Packed 数据使用 packElement 正确构建**
✅ **UnpackElement 测试边界情况已修复**

⚠️ **剩余工作**: SDK integration 测试需要调整 voter API 调用方式

## 修复人员
AI Assistant

## 日期
2026-02-01
