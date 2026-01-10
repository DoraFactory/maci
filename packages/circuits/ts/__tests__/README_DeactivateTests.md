# AMACI Deactivate Status Detection Tests

## 测试文件

### `DeactivateStatusDetection.test.ts`

这个测试文件专门测试 AMACI 中的 deactivate 状态检测机制。

## 运行测试

```bash
cd packages/circuits
pnpm test DeactivateStatusDetection
```

## 测试结构

### 1. ElGamalDecrypt Circuit Tests
测试 ElGamal 解密电路是否正确处理初始状态和加密状态。

### 2. Hash5 Precomputation Tests
验证 `hash5([0,0,0,0,0])` 的预计算值是否正确。

### 3. StateLeafTransformer Integration Tests
测试状态叶转换器是否正确检测 deactivate 状态。

### 4. Integration Tests
测试完整的状态转换流程。

### 5. Security Tests
测试边界情况和隐私保护机制。

### 6. Operator Detection Logic Tests
模拟 operator 的检测逻辑。

## 关键测试点

1. **初始状态**: c1 = [0, 0], c2 = [0, 0] → decrypt = 0 (偶数) → Active
2. **Deactivate 后**: c1, c2 是加密值 → decrypt = 奇数 → Deactivated
3. **预计算哈希**: `0x2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc`
4. **双层哈希**: AMACI 状态叶使用 hash2(layer1, layer2) 结构
5. **隐私保护**: 只有 coordinator 可以正确解密状态

## 注意事项

- 测试依赖已编译的 circom 电路
- 首次运行可能需要编译电路，会比较慢
- 可以增加 timeout 时间如果测试超时

## 相关文档

- [Deactivate-Status-Detection-Tests.md](../../docs/Deactivate-Status-Detection-Tests.md) - 完整的测试说明
- [AMACI-Deactivate-Detection-Flow.md](../../docs/AMACI-Deactivate-Detection-Flow.md) - 检测流程详解

