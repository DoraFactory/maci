# AddNewKey Circuit Tests

## Overview

This test suite verifies the correctness and security of the AddNewKey circuit, which is a critical component of the aMACI (Anonymous MACI) system for enabling anonymous voting through key rotation.

## Test Structure

### 1. AddNewKey Main Circuit Tests

Tests the complete AddNewKey circuit including:
- Nullifier verification
- ECDH shared key computation
- Deactivate leaf verification
- Merkle proof validation
- ElGamal rerandomization

#### Test Cases

**Valid Inputs:**
- ✅ `should verify AddNewKey proof with correctly computed inputs` - Tests basic happy path with single deactivate
- ✅ `should verify with multiple deactivates in tree` - Tests with multiple users' deactivates in the tree

**Invalid Inputs (Should Fail):**
- ❌ `should fail with wrong nullifier` - Verifies nullifier binding to private key
- ❌ `should fail with wrong shared key` - Prevents using someone else's deactivate
- ❌ `should fail with incorrect rerandomization` - Ensures d1, d2 are correctly computed
- ❌ `should fail with deactivate leaf not in tree` - Validates Merkle proof

**Cryptographic Properties:**
- ✅ `should maintain plaintext after rerandomization` - Verifies ElGamal rerandomization correctness

### 2. AddNewKeyInputHasher Circuit Tests

Tests the input hash computation for public inputs.

#### Test Cases

- ✅ `should compute input hash correctly` - Verifies hash matches SDK implementation
- ✅ `should produce different hashes for different inputs` - Ensures collision resistance
- ✅ `should be deterministic` - Verifies same inputs produce same hash

## Prerequisites

### 1. Install Dependencies

```bash
cd packages/circuits
pnpm install
```

### 2. Compile Circuits

```bash
pnpm run compile
```

This will compile all circuits including `addNewKey.circom`.

### 3. Generate Test Circuits

The test framework (circomkit) will automatically generate test circuits when you run the tests.

## Running Tests

### Run All AddNewKey Tests

```bash
cd packages/circuits
pnpm test AddNewKey
```

### Run Specific Test Suite

```bash
# Only main circuit tests
pnpm test -- --grep "AMACI AddNewKey circuit"

# Only input hasher tests
pnpm test -- --grep "AddNewKeyInputHasher"
```

### Run with Verbose Output

```bash
pnpm test AddNewKey -- --reporter spec
```

## Test Data Flow

```
┌────────────────────────────────────────────────────┐
│ 1. Setup                                           │
│    - Create coordinator keypair                    │
│    - Create old voter keypair                      │
└────────────────────────────────────────────────────┘
                      ↓
┌────────────────────────────────────────────────────┐
│ 2. Generate Deactivate Data (Operator)            │
│    - Generate ElGamal ciphertext (c1, c2)         │
│    - Encrypt "deactivated" status (even x-coord)  │
│    - Compute ECDH shared key                       │
│    - Create deactivate leaf                        │
│    - Build Merkle tree                             │
└────────────────────────────────────────────────────┘
                      ↓
┌────────────────────────────────────────────────────┐
│ 3. Generate AddNewKey Inputs (Voter)              │
│    - Compute own ECDH shared key                   │
│    - Find matching deactivate in tree              │
│    - Rerandomize (c1, c2) → (d1, d2)              │
│    - Compute nullifier                             │
│    - Get Merkle proof                              │
│    - Compute input hash                            │
└────────────────────────────────────────────────────┘
                      ↓
┌────────────────────────────────────────────────────┐
│ 4. Execute Circuit                                 │
│    - Verify all constraints                        │
│    - Check witness generation                      │
│    - Validate outputs                              │
└────────────────────────────────────────────────────┘
```

## Key Concepts Tested

### 1. Nullifier

```typescript
nullifier = poseidon([oldPrivateKey, 1444992409218394441042n])
```

- Uniquely identifies a deactivate/addNewKey pair
- Prevents replay attacks
- Cannot be forged without the private key

### 2. ECDH Shared Key

```typescript
sharedKey = ECDH(privKey, coordPubKey)
sharedKeyHash = poseidon(sharedKey)
```

- Binds deactivate to specific user
- Only user with oldPrivKey can compute matching sharedKey
- Used to find correct deactivate in tree

### 3. Deactivate Leaf

```typescript
deactivateLeaf = poseidon([c1[0], c1[1], c2[0], c2[1], sharedKeyHash])
```

- Commits to ElGamal ciphertext and ownership
- Stored in Merkle tree
- Proves user's deactivate exists

### 4. Rerandomization

```typescript
d1 = c1 + g^randomVal
d2 = c2 + coordPubKey^randomVal
```

- Breaks mathematical link between (c1, c2) and (d1, d2)
- Preserves plaintext (deactivated status)
- Provides anonymity

## Expected Test Results

All tests should pass with output similar to:

```
  AMACI AddNewKey circuit
    Valid AddNewKey proof
      ✓ should verify AddNewKey proof with correctly computed inputs (5234ms)
      ✓ should verify with multiple deactivates in tree (4891ms)
    Invalid inputs should fail
      ✓ should fail with wrong nullifier (1234ms)
      ✓ should fail with wrong shared key (1345ms)
      ✓ should fail with incorrect rerandomization (1456ms)
      ✓ should fail with deactivate leaf not in tree (1567ms)
    ElGamal rerandomization properties
      ✓ should maintain plaintext after rerandomization (2345ms)

  AMACI AddNewKeyInputHasher circuit
    ✓ should compute input hash correctly (567ms)
    ✓ should produce different hashes for different inputs (678ms)
    ✓ should be deterministic (789ms)

  10 passing (25s)
```

## Debugging

### Enable Verbose Circuit Output

```typescript
// In test file
const circuit = await circomkitInstance.WitnessTester('AddNewKey', {
  file: 'amaci/power/addNewKey',
  template: 'AddNewKey',
  params: [stateTreeDepth],
  verbose: true  // Add this
});
```

### Print Witness Values

```typescript
const witness = await circuit.calculateWitness(circuitInputs);
const decoratedOutput = await circuit.getDecoratedOutput(witness);
console.log('Witness values:', decoratedOutput);
```

### Check Constraint Satisfaction

```typescript
try {
  const witness = await circuit.calculateWitness(circuitInputs);
  await circuit.expectConstraintPass(witness);
  console.log('All constraints satisfied ✅');
} catch (error) {
  console.error('Constraint failed:', error.message);
}
```

## Common Issues

### Issue 1: "Assert Failed" Error

**Cause:** One of the circuit constraints is not satisfied.

**Solution:** 
- Check that all inputs are computed correctly
- Verify ECDH shared key matches
- Ensure rerandomization is done properly

### Issue 2: Timeout

**Cause:** Witness generation takes too long.

**Solution:**
- Increase timeout: `this.timeout(300000)` (5 minutes)
- Use smaller tree depths for testing
- Ensure circuit is properly compiled

### Issue 3: Wrong Input Structure

**Cause:** Input array dimensions don't match circuit expectations.

**Solution:**
```typescript
// Correct structure
c1: [bigint, bigint]  // 2 elements
c2: [bigint, bigint]  // 2 elements
deactivateLeafPathElements: bigint[][] // [depth][ARITY-1]
```

## Related Files

- Circuit: `packages/circuits/circom/amaci/power/addNewKey.circom`
- SDK: `packages/sdk/src/libs/crypto/keys.ts` (genAddKeyInput)
- E2E Test: `e2e/tests/add-new-key.e2e.test.ts`
- Documentation: `packages/circuits/docs/AddNewKey-Flow.md`

## Performance Benchmarks

Expected performance on standard hardware:

| Operation | Time | Constraints |
|-----------|------|-------------|
| Witness generation | ~2-5s | ~200k |
| Constraint checking | ~100ms | ~200k |
| Full test suite | ~20-30s | N/A |

## Security Considerations

These tests verify:
- ✅ Nullifier prevents replay attacks
- ✅ ECDH prevents unauthorized key rotation
- ✅ Merkle proof prevents forging deactivates
- ✅ Rerandomization maintains anonymity
- ✅ Input hash ensures data integrity

## Contributing

When adding new test cases:
1. Follow existing naming conventions
2. Document test purpose clearly
3. Use realistic cryptographic values (not mock data)
4. Test both valid and invalid inputs
5. Verify error messages are meaningful

## References

- [MACI Documentation](https://github.com/privacy-scaling-explorations/maci)
- [ElGamal Rerandomization](https://ethresear.ch/t/maci-anonymization-using-rerandomizable-encryption/7054)
- [Circomkit Testing Framework](https://github.com/erhant/circomkit)
