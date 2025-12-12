# Test Scripts

Automated testing scripts for the MACI test contract.

## Available Scripts

### auto-test.sh

Comprehensive automated on-chain testing script.

**Features**:
- ✅ Automatic contract compilation and deployment
- ✅ Full basic functionality testing
- ✅ Gas performance benchmarking
- ✅ Query function verification
- ✅ Detailed Markdown test reports
- ✅ Transaction hash and gas tracking

**Quick Start**:

```bash
# Grant execution permission
chmod +x scripts/auto-test.sh

# Run with default configuration
./scripts/auto-test.sh
```

**Custom Configuration**:

```bash
# Use custom parameters
CHAIN_ID="vota-testnet" \
RPC_NODE="https://vota-testnet-rpc.dorafactory.org:443" \
TEST_ACCOUNT="my-account" \
WASM_FILE="../../artifacts/cw_test-aarch64.wasm" \
./scripts/auto-test.sh
```

**Configuration Variables**:
- `CHAIN_ID` - Chain ID (default: "vota-testnet")
- `RPC_NODE` - RPC node URL (default: "https://vota-testnet-rpc.dorafactory.org:443")
- `TEST_ACCOUNT` - Test account name (default: "validator")
- `WASM_FILE` - Path to compiled WASM file (default: "../../artifacts/cw_test-aarch64.wasm")

**Output**:
- Console: Real-time test execution output
- `test-report-[timestamp].md`: Detailed test report with gas measurements

---

### quick-test.sh

Fast testing script for rapid development iteration.

**Features**:
- ✅ Quick deployment and basic testing
- ✅ Essential functionality verification
- ✅ Minimal test set for fast feedback

**Quick Start**:

```bash
# Grant execution permission
chmod +x scripts/quick-test.sh

# Run quick test
./scripts/quick-test.sh
```

**Use Cases**:
- Development iteration
- Quick smoke testing
- Pre-deployment verification

---

## Test Coverage

### Basic Functionality Tests
1. Store code - Deploy contract
2. Instantiate - Initialize contract
3. SignUp - User registration (2 users)
4. PublishMessage - Message publishing

### Gas Performance Tests
1. TestSignupNoHash - Baseline storage operations
2. TestSignupWithHash - Complete Merkle tree update
3. TestPublishMessage - Message hash and storage
4. TestPoseidonHashOnce - Single hash benchmark
5. TestPoseidonHashMultiple - Batch instantiation overhead (1x, 5x, 10x, 20x)
6. TestPoseidonHashBatch - Batch processing efficiency
7. TestPoseidonHashMode - Implementation comparison (LocalUtils vs MaciUtils)

### Query Function Tests
1. GetNumSignUp - Query user count
2. GetMsgChainLength - Query message count
3. GetStateTreeRoot - Query state root
4. GetVoiceCreditAmount - Query vote credits
5. GetNode - Query tree nodes (root, leaves)
6. No-hash queries - Baseline query tests

---

## Prerequisites

### Requirements
- `dorad` CLI tool installed
- Compiled contract (`artifacts/cw_test-aarch64.wasm`)
- Test account with sufficient balance

### Account Setup

```bash
# Create test account (if needed)
dorad keys add validator

# Fund test account
# (Get test tokens from faucet)

# Verify balance
dorad query bank balances $(dorad keys show validator -a)
```

---

## Test Reports

### Report Format

Auto-generated Markdown reports include:

1. **Test Summary**
   - Total tests executed
   - Success/failure count
   - Total gas consumed
   - Estimated fees

2. **Basic Functionality Results**
   - Transaction hashes
   - Contract addresses
   - Execution status

3. **Gas Performance Metrics**
   - Individual test gas usage
   - Comparison tables
   - Performance analysis

4. **Query Results**
   - Query responses
   - Verification status

### Example Report Location

```
contracts/test/test-report-20251212-120000.md
```

---

## Troubleshooting

### Common Issues

**Issue**: `dorad: command not found`
- **Solution**: Install dorad CLI or add to PATH

**Issue**: `WASM file not found`
- **Solution**: Compile contract first with `docker run ...` (see main README)

**Issue**: `insufficient funds`
- **Solution**: Fund test account from faucet

**Issue**: `transaction timeout`
- **Solution**: Check RPC node connectivity or use different node

---

## Best Practices

### Development Workflow

1. **Initial Development**
   - Use `quick-test.sh` for fast iteration
   - Focus on functionality correctness

2. **Performance Testing**
   - Use `auto-test.sh` for comprehensive gas analysis
   - Compare gas costs across implementations

3. **Pre-Production**
   - Run full `auto-test.sh` suite
   - Review generated reports
   - Verify all tests pass

### Gas Optimization

1. Run baseline tests to establish metrics
2. Make optimizations
3. Re-run tests to measure improvements
4. Document changes and results

---

## Contributing

When adding new test cases:

1. Update test functions in the script
2. Add to appropriate test section (basic/gas/query)
3. Update report generation logic
4. Test the changes
5. Update this documentation

---

## Related Documentation

- [Main Test Contract README](../README.md) - Complete test contract documentation
- [Test Coverage Details](https://github.com/DoraFactory/cosmwasm-maci) - Full test specifications

---

**Last Updated**: 2025-12-12  
**Maintainer**: Dora Factory Team

