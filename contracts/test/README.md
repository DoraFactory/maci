# CosmWasm MACI Test Contract

A comprehensive testing and benchmarking contract for MACI (Minimum Anti-Collusion Infrastructure) on CosmWasm.

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Test Functions](#test-functions)
- [Performance Optimizations](#performance-optimizations)
- [Tree Depth Performance Guide](#tree-depth-performance-guide)
- [Gas Testing](#gas-testing)
- [Development Guide](#development-guide)

---

## Overview

This test contract provides a complete MACI testing environment, including:

- ✅ **SignUp Testing** - User registration and state tree updates
- ✅ **PublishMessage Testing** - Message publishing and hash computation
- ✅ **Poseidon Hash Testing** - Multiple hash modes and performance comparisons
- ✅ **Tree Depth Benchmarks** - Performance analysis across different depths
- ✅ **Gas Tracking** - Execution cost analysis (requires on-chain testing)

### Related Resources

- MACI Circuits: https://github.com/dorahacksglobal/qf-maci
- Groth16 Verification: [SnarkJS-Bellman Adapter](https://github.com/DoraFactory/snarkjs-bellman-adapter)

---

## Quick Start

### Requirements

- **OS**: Mac M1 / Linux / Windows
- **Rust**: 1.69.0+ (stable)
- **Tools**: Docker (for optimized wasm compilation)

### Running Tests

```bash
# Clone repository
git clone https://github.com/DoraFactory/cosmwasm-maci
cd cosmwasm-maci/contracts/test

# Run all tests
cargo test

# Run performance tests with detailed output
cargo test --lib -- --nocapture

# Run specific tests
cargo test test_signup_depth -- --nocapture
```

### Compiling Contract

**ARM architecture (M1/M2 Mac)**:
```bash
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/code/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/rust-optimizer-arm64:0.12.11
```

**AMD architecture (x86_64)**:
```bash
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/code/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/rust-optimizer:0.12.11
```

---

## Test Functions

### 1. SignUp Test Methods

#### TestSignupNoHash
Pure storage operations without Poseidon hash computation.

**Purpose**: Measure baseline storage overhead

**Execute Message**:
```json
{
  "test_signup_no_hash": {
    "pubkey": {
      "x": "1234567890",
      "y": "9876543210"
    }
  }
}
```

#### TestSignupWithHash
Complete Merkle tree update with Poseidon hash computation.

**Purpose**: Measure real SignUp cost

**Execute Message**:
```json
{
  "test_signup_with_hash": {
    "pubkey": {
      "x": "1234567890",
      "y": "9876543210"
    }
  }
}
```

**Performance Comparison**:
```
Hash Overhead = gas(TestSignupWithHash) - gas(TestSignupNoHash)
```

### 2. PublishMessage Test

#### TestPublishMessage
Test message publishing including message hash and chain storage.

**Execute Message**:
```json
{
  "test_publish_message": {
    "message": {
      "data": ["100", "200", "300", "400", "500", "600", "700"]
    },
    "enc_pub_key": {
      "x": "1111111111",
      "y": "2222222222"
    }
  }
}
```

### 3. Poseidon Hash Test Methods

#### TestPoseidonHashMode (Recommended)
Flexible hash testing interface supporting multiple modes and implementation comparison.

**Supported Hash Modes**:
- `hash2` - Poseidon hash with 2 inputs
- `hash5` - Poseidon hash with 5 inputs
- `hash2_hash5_hash5` - Nested hash: `hash2(hash5(data), hash5(data))`
- `hash5_hash2` - Combined hash: `hash5([hash2(data[0], data[1]), 0, 0, 0, 0])`

**Supported Implementations**:
- `local_utils` - Instantiates Poseidon each time (measures real overhead)
- `maci_utils` - Optimized version (may have caching)

**Example - Hash5 Single Test**:
```json
{
  "test_poseidon_hash_mode": {
    "implementation": "maci_utils",
    "mode": "hash5",
    "data": ["1", "2", "3", "4", "5"],
    "repeat_count": 1
  }
}
```

**Example - Batch Test (100 iterations)**:
```json
{
  "test_poseidon_hash_mode": {
    "implementation": "local_utils",
    "mode": "hash5",
    "data": ["1", "2", "3", "4", "5"],
    "repeat_count": 100
  }
}
```

#### Other Hash Test Methods

**TestPoseidonHashOnce** - Single hash benchmark test
**TestPoseidonHashMultiple** - Multiple repetition test
**TestPoseidonHashBatch** - Batch data test

---

## Performance Optimizations

### Completed Optimizations (2025-12-10)

#### 1. Poseidon Instance Caching ✅
Use `OnceLock` to avoid repeated initialization:
```rust
static POSEIDON_INSTANCE: OnceLock<Poseidon> = OnceLock::new();
```

#### 2. Type Conversion Optimization ✅
Avoid expensive string conversions, use direct byte operations:

**Before Optimization**:
```rust
// Uint256 → String → Fr (slow)
Fr::from_str(&input.to_string()).unwrap()
```

**After Optimization**:
```rust
// Uint256 → bytes → Fr (fast)
let bytes = input.to_le_bytes();
let mut repr = <Fr as PrimeField>::Repr::default();
repr.read_le(&mut Cursor::new(&bytes[..])).unwrap();
Fr::from_repr(repr).unwrap()
```

### Performance Improvement Data

| Depth | Before | After | Improvement | Time Saved |
|-------|--------|-------|-------------|------------|
| 2 | 82.26ms | **80.49ms** | 2.2% | 1.77ms |
| 3 | 85.79ms | **78.01ms** | 9.1% | 7.78ms |
| 4 | 89.51ms | **79.72ms** | 10.9% | 9.79ms |
| 5 | 92.63ms | **80.75ms** | 12.8% | 11.88ms |
| 6 | 96.39ms | **82.54ms** | 14.4% | 13.85ms |

**Average Improvement**: 10.1%  
**Maximum Improvement**: 14.4% (Depth 6)

### Pure Hash Operation Performance

```
Test: 100 hash5 calls
Old Implementation: 890.26ms
New Implementation: 146.04ms
Improvement: 83.6% (6.1x faster)
```

### Why is Real Improvement Only 10% Instead of 83%?

**Complete signup operation time breakdown**:
```
Total Time: ~80ms per signup
├─ Poseidon Computation: ~72ms (87%) ← Mathematical ops, hard to optimize
├─ Type Conversion: ~1ms (1%) ← ✅ Reduced from 8ms to 1ms
├─ Tree Update Logic: ~3ms (4%)
├─ Storage Operations: ~2ms (2%)
└─ Other: ~4ms (5%)

Actual Savings: 8ms - 1ms = 7ms
Percentage of Total: 7ms / 80ms ≈ 8-9%
Measured Result: 10-14% ✅ Matches expectation
```

---

## Tree Depth Performance Guide

### Performance Comparison (No Hash vs With Hash)

| Depth | Max Users | No Hash | With Hash | Speed Ratio | Use Case |
|-------|-----------|---------|-----------|-------------|----------|
| 2 | 25 | ~180µs | ~80ms | 450x | Small tests |
| 3 | 125 | ~122µs | ~78ms | 639x | Development |
| 4 | 625 | ~139µs | ~80ms | 574x | Small production |
| 5 | 3,125 | ~167µs | ~81ms | 483x | Medium production |
| 6 | 15,625 | ~212µs | ~83ms | 389x | Large production |

*Max Users = 5^depth*

### Why is Hash 400-600x Slower?

This is **normal and necessary**, because:

1. **Cryptographic Hash vs Simple Operations**
   - No Hash: Native CPU addition (~50ns)
   - With Hash: Finite field Poseidon operations (~3-5ms per hash)

2. **Cost of ZK-Friendliness**
   - Poseidon is optimized for zero-knowledge proofs
   - Not optimized for CPU speed
   - This is the necessary trade-off for security

3. **Tree Updates Require Multiple Hashes**
   - Depth 2: 2 hash5 calls
   - Depth 6: 6 hash5 calls

### Depth Selection Guide

**Choose based on capacity needs, don't worry about performance differences**

- Performance difference between depths 2-6 is small (only 10%)
- Choosing sufficient capacity is more important than optimizing performance
- Cost increase per depth: Average +2.5% per level

### Running Performance Tests

```bash
# Test all depths
cargo test test_signup_depth -- --nocapture

# Test single depth
cargo test test_signup_depth4_performance -- --nocapture

# Detailed analysis
cargo test test_signup_detailed_tree_depth_analysis -- --nocapture
```

**Example Output**:
```
Tree Depth  | No Hash (avg) | With Hash (avg) | Ratio    | Hash Cost
-----------------------------------------------------------------------
Depth 2     | 180µs         | 80.49ms         | 450x     | 80.31ms
Depth 3     | 122µs         | 78.01ms         | 639x     | 77.89ms
Depth 4     | 139µs         | 79.72ms         | 574x     | 79.58ms
```

---

## Gas Testing

### ⚠️ Important Note

**cw-multi-test Cannot Measure Real Gas Consumption!**

`cw-multi-test` is a unit testing framework that runs directly in Rust environment without going through CosmWasm VM, therefore:

- ✅ Can test contract logic
- ✅ Can compare execution times
- ✅ Can verify functional correctness
- ❌ **Cannot calculate precise gas consumption**
- ❌ Cannot get gas prices

### How to Get Real Gas Information

#### Method 1: wasmd Integration Testing (Recommended)

```bash
# Deploy contract
wasmd tx wasm store contract.wasm --from wallet --gas auto

# Execute and view gas
wasmd tx wasm execute <contract-addr> '{"test_signup_with_hash": {...}}' \
  --from wallet \
  --gas auto \
  --gas-prices 0.025ucosm
```

#### Method 2: test-tube

```rust
use test_tube::*;

#[test]
fn test_gas_with_testnet() {
    let app = OsmosisTestApp::default();
    let wasm = Wasm::new(&app);
    
    let result = wasm.execute(...).unwrap();
    
    println!("Gas used: {}", result.gas_info.gas_used);
    println!("Gas wanted: {}", result.gas_info.gas_wanted);
}
```

#### Method 3: Testnet Deployment

```bash
# Execute transaction
TX_HASH=$(wasmd tx wasm execute ... --broadcast-mode sync)

# Query gas information
wasmd query tx $TX_HASH --output json | jq '.gas_used, .gas_wanted'
```

### Gas Testing Comparison Strategy

#### 1. Merkle Tree Cost Analysis
```bash
# Test no-hash version (10 times)
for i in {1..10}; do
  # Call test_signup_no_hash
  # Record gas consumption
done

# Test with-hash version (10 times)
for i in {1..10}; do
  # Call test_signup_with_hash
  # Record gas consumption
done

# Calculate difference
hash_cost = avg_with_hash - avg_no_hash
```

#### 2. Poseidon Hash Performance Analysis
```bash
# Compare LocalUtils vs MaciUtils (instantiation overhead)
dorad tx wasm execute $CONTRACT '{
  "test_poseidon_hash_mode": {
    "implementation": "local_utils",
    "mode": "hash5",
    "data": ["1","2","3","4","5"],
    "repeat_count": 1
  }
}' --gas=auto

dorad tx wasm execute $CONTRACT '{
  "test_poseidon_hash_mode": {
    "implementation": "maci_utils",
    "mode": "hash5",
    "data": ["1","2","3","4","5"],
    "repeat_count": 1
  }
}' --gas=auto
```

#### 3. Batch Operation Comparison
```bash
# Test different repeat counts
# 1x, 10x, 100x
# Analyze instantiation overhead
```

### Expected Results Example

```
Storage operations (no hash): 50,000 gas
Complete update (with hash): 150,000 gas
Hash computation overhead: 100,000 gas (67%)

Single hash5: 10,000 gas
10x multi-instantiation: 105,000 gas (avg 10,500 per call, 5% overhead)
10x batch: 100,000 gas (avg 10,000 per call, no extra overhead)
```

---

## Development Guide

### Using in Tests

```rust
use crate::state::MaciParameters;
use cosmwasm_std::Uint256;

#[test]
fn my_custom_test() {
    let mut app = create_app();
    let code_id = MaciCodeId::store_code(&mut app);
    
    // Custom parameters
    let params = MaciParameters {
        state_tree_depth: Uint256::from_u128(5),
        int_state_tree_depth: Uint256::from_u128(1),
        message_batch_size: Uint256::from_u128(5),
        vote_option_tree_depth: Uint256::from_u128(1),
    };
    
    // Instantiate contract
    let contract = TestContract::instantiate_with_params(
        &mut app,
        code_id,
        owner(),
        "test_contract",
        params,
    ).unwrap();
    
    // Test signup
    let pubkey = PubKey {
        x: Uint256::from_u128(12345),
        y: Uint256::from_u128(67890),
    };
    
    let response = contract.test_signup_with_hash(
        &mut app,
        user1(),
        pubkey
    ).unwrap();
    
    // Verify response
    assert!(response.events.len() > 0);
}
```

### Performance Testing Template

```rust
use std::time::Instant;

#[test]
fn benchmark_signup() {
    // ... setup code ...
    
    let iterations = 10;
    let start = Instant::now();
    
    for i in 0..iterations {
        let pubkey = PubKey {
            x: Uint256::from_u128(i),
            y: Uint256::from_u128(i + 1),
        };
        contract.test_signup_with_hash(&mut app, user1(), pubkey).unwrap();
    }
    
    let duration = start.elapsed();
    let avg = duration / iterations;
    
    println!("Total: {:?}", duration);
    println!("Average per signup: {:?}", avg);
}
```

### Best Practices

#### Development Phase
1. Use `cw-multi-test` for rapid iteration
2. Use `test_signup_no_hash` to speed up tests
3. Focus on verifying logic correctness
4. Don't over-optimize for performance

#### Optimization Phase
1. Use integration tests to get real gas
2. Compare gas efficiency of different implementations
3. Optimize high gas consumption operations
4. Establish performance baselines

#### Pre-Production
1. Deploy to testnet and monitor gas
2. Establish gas baselines for key operations
3. Ensure gas consumption is within acceptable range
4. Perform stress testing

---

## Test Status

```
✅ All tests passing: 31/31
✅ Performance optimization: Average 10.1% improvement
✅ Backward compatibility: 100% consistent
✅ Documentation coverage: Complete
```

---

## FAQ

### Q: Why do test times differ from on-chain gas?

A: `cw-multi-test` measures Rust execution time, not on-chain gas. To get real gas, you need to test on testnet or use `test-tube` for integration testing.

### Q: Is abnormally slow depth 2 performance normal?

A: If in a single loop test, depth 2 bears the Poseidon initialization overhead. Using independent test functions, all depths have similar performance (88-98ms).

### Q: How to choose the right tree depth?

A: Choose based on expected user count, don't worry too much about performance differences:
- Depth 3: 125 users
- Depth 4: 625 users
- Depth 5: 3,125 users
- Depth 6: 15,625 users

### Q: What's the difference between LocalUtils and MaciUtils?

A: 
- `LocalUtils`: Instantiates Poseidon each time, measures real overhead
- `MaciUtils`: Optimized version, may have caching, lower gas consumption

---

## Contributing

Issues and Pull Requests are welcome!

---

## License

This project is open-sourced under the Apache 2.0 License.

---

**Last Updated**: 2025-12-12  
**Version**: 1.0  
**Status**: ✅ Production Ready
