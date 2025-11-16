# Poseidon Hash E2E 集成测试方案

## 🎯 测试目标

验证 Poseidon hash 在以下三个组件中的实现完全一致：
1. **SDK** (TypeScript/JavaScript)
2. **电路** (Circom/snarkjs)
3. **智能合约** (CosmWasm/Rust)

## 📋 测试架构

```
┌─────────────────────────────────────────────────────────┐
│                   E2E Test Runner                       │
│              (TypeScript/Jest/Mocha)                    │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌───────────────┐  ┌──────────────┐  ┌──────────────┐
│     SDK       │  │   Circuit    │  │   Contract   │
│  (TypeScript) │  │   (Circom)   │  │    (Rust)    │
├───────────────┤  ├──────────────┤  ├──────────────┤
│ hash2([a,b])  │  │ PoseidonT3   │  │ hash2([a,b]) │
│ hash5([...])  │  │ PoseidonT6   │  │ hash5([...]) │
└───────────────┘  └──────────────┘  └──────────────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          ▼
                  ┌───────────────┐
                  │ Result Compare │
                  │  & Validate    │
                  └───────────────┘
```

## 🧪 测试用例设计

### 1. 基础功能测试

#### Hash2 测试
```rust
// Contract (Rust)
let result = hash2([Uint256::from(1), Uint256::from(2)]);
```

```typescript
// SDK (TypeScript)
const result = hash2([BigInt(1), BigInt(2)]);
```

```circom
// Circuit (Circom)
component hasher = PoseidonHashT3();
hasher.inputs[0] <== 1;
hasher.inputs[1] <== 2;
```

#### Hash5 测试
```rust
// Contract (Rust)
let result = hash5([
    Uint256::from(1),
    Uint256::from(2),
    Uint256::from(3),
    Uint256::from(4),
    Uint256::from(5),
]);
```

```typescript
// SDK (TypeScript)
const result = hash5([
    BigInt(1), BigInt(2), BigInt(3), BigInt(4), BigInt(5)
]);
```

### 2. 边界条件测试

| 测试用例 | 输入 | 预期行为 |
|---------|------|---------|
| **全零输入** | `[0, 0]` | 产生有效的非零哈希 |
| **最大值** | `[FIELD_MAX-1, FIELD_MAX-1]` | 不溢出，产生有效哈希 |
| **混合零值** | `[0, 123]` | 与 `[123, 0]` 不同 |
| **相同值** | `[42, 42]` | 产生有效且可重复的哈希 |

### 3. 密码学属性测试

#### 确定性 (Determinism)
```typescript
test('hash should be deterministic', () => {
  const input = [BigInt(1), BigInt(2)];
  const hash1 = hash2(input);
  const hash2Result = hash2(input);
  expect(hash1).toEqual(hash2Result);
});
```

#### 顺序敏感性 (Order Sensitivity)
```typescript
test('hash should be order-sensitive', () => {
  const hash1 = hash2([BigInt(1), BigInt(2)]);
  const hash2Result = hash2([BigInt(2), BigInt(1)]);
  expect(hash1).not.toEqual(hash2Result);
});
```

#### 雪崩效应 (Avalanche Effect)
```typescript
test('small input change should cause large output change', () => {
  const hash1 = hash2([BigInt(1), BigInt(2)]);
  const hash2Changed = hash2([BigInt(1), BigInt(3)]);
  
  // 统计不同的比特数
  const differingBits = countDifferingBits(hash1, hash2Changed);
  expect(differingBits).toBeGreaterThan(50); // 至少 50 位不同
});
```

#### 抗碰撞性 (Collision Resistance)
```typescript
test('should not produce collisions', () => {
  const hashes = new Set();
  for (let i = 0; i < 1000; i++) {
    const hash = hash2([BigInt(i), BigInt(i + 1)]);
    expect(hashes.has(hash.toString())).toBe(false);
    hashes.add(hash.toString());
  }
});
```

### 4. 真实场景测试

#### MACI Message Hash
```typescript
test('publish_message hash simulation', () => {
  // 模拟 publish_message 中的哈希计算
  const messageData = {
    stateIndex: BigInt(1),
    voteOptionIndex: BigInt(2),
    voteWeight: BigInt(100),
    nonce: BigInt(3),
    pollId: BigInt(42)
  };
  
  const messageHash = hash5([
    messageData.stateIndex,
    messageData.voteOptionIndex,
    messageData.voteWeight,
    messageData.nonce,
    messageData.pollId
  ]);
  
  // 与合约计算结果对比
  const contractResult = await queryContractMessageHash(messageData);
  expect(messageHash.toString()).toEqual(contractResult);
});
```

#### Merkle Tree Hash
```typescript
test('merkle tree leaf hash', () => {
  const leftChild = hash5([/* state leaf data */]);
  const rightChild = hash5([/* state leaf data */]);
  const parent = hash2([leftChild, rightChild]);
  
  // 验证与电路计算一致
  const circuitResult = await calculateCircuitMerkleHash(leftChild, rightChild);
  expect(parent).toEqual(circuitResult);
});
```

## 🔧 测试工具实现

### 1. Rust 测试辅助 (`maci-utils/src/test_helpers.rs`)

```rust
/// 标准测试向量
pub struct PoseidonTestVector {
    pub name: String,
    pub inputs: Vec<String>, // 十六进制字符串
    pub expected_hash_type: HashType,
}

/// 执行测试向量
pub fn execute_test_vector(vector: &PoseidonTestVector) -> Result<Uint256>;

/// 生成标准测试向量
pub fn generate_standard_test_vectors() -> Vec<PoseidonTestVector>;
```

### 2. TypeScript 测试框架 (`e2e/tests/poseidon-consistency.e2e.test.ts`)

```typescript
describe('Poseidon Consistency Tests', () => {
  // SDK 测试
  describe('SDK Tests', () => {
    TEST_VECTORS.forEach(vector => {
      it(`should handle ${vector.name}`, () => {
        const result = executeSDKHash(vector);
        expect(result).toBeDefined();
      });
    });
  });
  
  // 合约测试
  describe('Contract Tests', () => {
    TEST_VECTORS.forEach(vector => {
      it(`should match SDK result for ${vector.name}`, async () => {
        const sdkResult = executeSDKHash(vector);
        const contractResult = await queryContractHash(vector);
        expect(sdkResult).toEqual(contractResult);
      });
    });
  });
  
  // 电路测试
  describe('Circuit Tests', () => {
    TEST_VECTORS.forEach(vector => {
      it(`should match SDK result for ${vector.name}`, async () => {
        const sdkResult = executeSDKHash(vector);
        const circuitResult = await calculateCircuitHash(vector);
        expect(sdkResult).toEqual(circuitResult);
      });
    });
  });
});
```

### 3. 合约测试查询接口（可选）

为了便于测试，可以在合约中添加测试查询接口：

```rust
// contracts/amaci/src/msg.rs
#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    // 现有查询...
    
    #[cfg(test)]
    #[returns(TestHashResponse)]
    TestHash2 { inputs: [String; 2] },
    
    #[cfg(test)]
    #[returns(TestHashResponse)]
    TestHash5 { inputs: [String; 5] },
}

#[cfg(test)]
#[cw_serde]
pub struct TestHashResponse {
    pub result: String, // 十六进制字符串
}
```

```rust
// contracts/amaci/src/contract.rs
#[cfg(test)]
fn query_test_hash2(deps: Deps, inputs: [String; 2]) -> StdResult<TestHashResponse> {
    let uint_inputs: Vec<Uint256> = inputs
        .iter()
        .map(|s| uint256_from_hex_string(s))
        .collect();
    
    let result = hash2([uint_inputs[0], uint_inputs[1]]);
    
    Ok(TestHashResponse {
        result: uint256_to_hex(&result),
    })
}
```

## 📊 测试向量数据

### 标准测试向量 (JSON 格式)

```json
{
  "vectors": [
    {
      "name": "basic_hash2",
      "description": "Basic hash2 with small values",
      "type": "hash2",
      "inputs": ["0x01", "0x02"],
      "sdk_expected": "0x...",
      "contract_expected": "0x...",
      "circuit_expected": "0x..."
    },
    {
      "name": "basic_hash5",
      "description": "Basic hash5 with sequential values",
      "type": "hash5",
      "inputs": ["0x01", "0x02", "0x03", "0x04", "0x05"],
      "sdk_expected": "0x...",
      "contract_expected": "0x...",
      "circuit_expected": "0x..."
    }
  ]
}
```

## 🚀 运行测试

### 1. 准备测试环境

```bash
# 安装依赖
cd e2e
pnpm install

# 编译合约
cd ../contracts/amaci
cargo build

# 编译电路（如果需要）
cd ../../packages/circuits
pnpm build
```

### 2. 运行完整测试套件

```bash
cd e2e
pnpm test:poseidon
```

### 3. 运行特定测试

```bash
# 只测试 SDK
pnpm test:poseidon:sdk

# 只测试合约
pnpm test:poseidon:contract

# 只测试一致性
pnpm test:poseidon:consistency
```

## 📈 测试报告

测试完成后，生成详细报告：

```
Poseidon Hash Consistency Test Report
=====================================

Test Vectors: 50
  ✅ SDK Tests: 50/50 passed
  ✅ Contract Tests: 50/50 passed
  ✅ Circuit Tests: 48/50 passed (2 skipped - circuits not compiled)
  ✅ Consistency Tests: 50/50 passed

Edge Cases: 15
  ✅ Zero values: 5/5 passed
  ✅ Max values: 3/3 passed
  ✅ Order sensitivity: 4/4 passed
  ✅ Identical values: 3/3 passed

Cryptographic Properties: 10
  ✅ Determinism: 10/10 passed
  ✅ Order sensitivity: 10/10 passed
  ✅ Avalanche effect: 10/10 passed (avg 51.2% bits differ)
  ✅ Collision resistance: 10/10 passed (0 collisions in 10,000 hashes)

Real-World Scenarios: 8
  ✅ Message hashing: 4/4 passed
  ✅ Merkle tree: 4/4 passed

Total: 83/83 tests passed (100%)
Execution time: 45.2 seconds
```

## 🔍 故障排查

### SDK vs Contract 不匹配
```typescript
if (sdkResult !== contractResult) {
  console.log('Mismatch detected!');
  console.log('Input:', vector.inputs);
  console.log('SDK Result:', sdkResult.toString(16));
  console.log('Contract Result:', contractResult);
  
  // 检查字节序
  console.log('SDK bytes (BE):', toBytes(sdkResult, 'big'));
  console.log('Contract bytes:', contractResult);
}
```

### 电路计算失败
```typescript
try {
  const circuitResult = await calculateWitness(input);
} catch (error) {
  console.log('Circuit calculation failed');
  console.log('Input:', input);
  console.log('Error:', error);
  
  // 检查输入是否在域内
  console.log('Input in field?', isInField(input));
}
```

## 📝 最佳实践

1. **版本一致性**
   - 确保 SDK、电路和合约使用相同版本的 Poseidon 实现
   - 对于 Rust: `poseidon-rs = "0.0.10"`
   - 对于 JS: `@zk-kit/poseidon-cipher`
   - 对于 Circom: `circomlib/circuits/poseidon.circom`

2. **数据格式**
   - 统一使用大端序 (Big-Endian)
   - 十六进制字符串统一加 `0x` 前缀
   - Uint256 和 BigInt 互转时注意精度

3. **测试覆盖**
   - 每个哈希函数至少 10 个测试用例
   - 覆盖所有边界条件
   - 包含真实场景模拟

4. **持续集成**
   - 在 CI/CD 中自动运行一致性测试
   - 任何不匹配立即报警
   - 记录所有测试结果供审计

## 🎯 成功标准

- ✅ 所有标准测试向量通过
- ✅ SDK、电路、合约结果 100% 一致
- ✅ 边界条件正确处理
- ✅ 密码学属性验证通过
- ✅ 真实场景模拟成功
- ✅ 零碰撞
- ✅ 性能满足要求

## 📚 相关资源

- [Poseidon Hash 论文](https://eprint.iacr.org/2019/458.pdf)
- [poseidon-rs 文档](https://github.com/arnaucube/poseidon-rs)
- [circomlib Poseidon](https://github.com/iden3/circomlib/blob/master/circuits/poseidon.circom)
- [MACI 规范](https://github.com/privacy-scaling-explorations/maci)

---

**创建时间**: 2025-11-15  
**状态**: ✅ 测试框架就绪  
**下一步**: 运行完整测试套件并验证一致性

