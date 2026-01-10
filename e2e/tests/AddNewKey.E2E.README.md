# AddNewKey End-to-End Test

## Overview

This comprehensive end-to-end test demonstrates the complete AddNewKey flow in the aMACI system, from initial registration through key rotation to final vote tallying.

## Test Scenario

The test simulates a realistic scenario where:
1. **Voter1** registers and votes with their original key
2. **Voter2** registers and votes 
3. **Voter1** deactivates their original key
4. Operator processes the deactivation
5. **Voter1** generates a proof and adds a new key
6. **Voter1** votes again with the new key
7. All votes are processed and tallied
8. Results are verified to include votes from both of Voter1's keys

## Prerequisites

### 1. Circuit Artifacts

You need compiled circuits and generated zkeys:

```bash
# Generate circuit artifacts for configuration: 2-1-1-5
cd e2e/circuits
./generate-circuits.sh amaci-2-1-1-5
```

Required circuits:
- `processMessages.wasm` / `processMessages.zkey`
- `tallyVotes.wasm` / `tallyVotes.zkey`
- `processDeactivate.wasm` / `processDeactivate.zkey`
- `addNewKey.wasm` / `addNewKey.zkey`

### 2. Install Dependencies

```bash
cd e2e
pnpm install
```

## Circuit Configuration

This test uses the **amaci-2-1-1-5** configuration:

```
stateTreeDepth = 2        → Max 5^2 = 25 voters
intStateTreeDepth = 1     → Batch processing level
voteOptionTreeDepth = 1   → Max 5^1 = 5 vote options
batchSize = 5             → Process 5 messages per batch
```

## Running the Test

### Run Complete Test Suite

```bash
cd e2e
pnpm test add-new-key
```

### Run with Verbose Output

```bash
pnpm test add-new-key -- --reporter spec
```

### Run Specific Test Case

```bash
# Main flow test
pnpm test -- --grep "should complete full AddNewKey flow"

# Replay protection test
pnpm test -- --grep "should prevent reusing the same old key"

# Invalid proof test
pnpm test -- --grep "should reject invalid AddNewKey proof"
```

## Test Flow Details

### Phase 1: Initial Registration and Voting

```
┌─────────────────────────────────────────────┐
│ Voter1 (Old Key)                            │
│ - Register at index 0                       │
│ - Vote: 50 → Option 0, 30 → Option 1       │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Voter2                                      │
│ - Register at index 1                       │
│ - Vote: 40 → Option 1, 20 → Option 2       │
└─────────────────────────────────────────────┘
```

**On-chain state:**
- 2 users registered
- 4 messages published (2 per voter)

### Phase 2: Deactivate Old Key

```
┌─────────────────────────────────────────────┐
│ Voter1 Deactivates Old Key                 │
│                                             │
│ 1. Publish deactivate message               │
│    - Command: [0, 0] (deactivate marker)   │
│    - Encrypted with coord public key        │
│                                             │
│ 2. Operator processes                       │
│    - Generates (c1, c2) ElGamal ciphertext │
│    - c2.x is EVEN (deactivated status)     │
│    - Computes sharedKeyHash                 │
│    - Updates deactivate tree                │
│    - Generates ZK proof                     │
│                                             │
│ 3. Upload deactivate data                   │
│    - [c1.x, c1.y, c2.x, c2.y, sharedKeyHash]│
│    - Stored on-chain for voters to query   │
└─────────────────────────────────────────────┘
```

**On-chain state:**
- Deactivate tree updated
- Deactivate commitment saved
- Deactivate data available for query

### Phase 3: AddNewKey

```
┌─────────────────────────────────────────────┐
│ Voter1 Adds New Key                        │
│                                             │
│ 1. Fetch deactivate data from chain        │
│    - Query all deactivates                  │
│                                             │
│ 2. Find own deactivate                      │
│    - Compute sharedKey from oldPrivKey      │
│    - Match sharedKeyHash in data            │
│                                             │
│ 3. Generate ZK proof                        │
│    - Rerandomize (c1,c2) → (d1,d2)         │
│    - Compute nullifier                      │
│    - Build Merkle proof                     │
│    - Generate Groth16 proof                 │
│                                             │
│ 4. Submit to chain                          │
│    - New public key                         │
│    - Nullifier (prevents replay)            │
│    - (d1, d2) (anonymous ciphertext)       │
│    - ZK proof                               │
│                                             │
│ 5. Contract verifies                        │
│    - Check nullifier not used               │
│    - Verify ZK proof                        │
│    - Register new key at index 2            │
└─────────────────────────────────────────────┘
```

**On-chain state:**
- 3 users now registered (indices 0, 1, 2)
- Nullifier recorded
- State tree includes new key with (d1, d2)

### Phase 4: Vote with New Key

```
┌─────────────────────────────────────────────┐
│ Voter1 (New Key)                            │
│ - Vote: 60 → Option 2, 25 → Option 3       │
└─────────────────────────────────────────────┘
```

**On-chain state:**
- 6 total messages (4 from before + 2 new)

### Phase 5: Process and Tally

```
┌─────────────────────────────────────────────┐
│ Process Messages                            │
│ - Batch 1: Process messages 0-4             │
│ - Batch 2: Process messages 5-6             │
│ - Verify d1, d2 for new key (active)       │
│ - Update state tree                         │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Tally Votes                                 │
│ - Process all 3 voters                      │
│ - Accumulate votes per option               │
│ - Generate tally proof                      │
└─────────────────────────────────────────────┘
```

### Phase 6: Verify Results

```
Expected Final Results:
┌────────┬──────────────────────────────────────┐
│ Option │ Votes                                │
├────────┼──────────────────────────────────────┤
│   0    │  50  (Voter1 old key)                │
│   1    │  70  (30 from Voter1 + 40 from V2)   │
│   2    │  80  (60 from Voter1 new + 20 from V2)│
│   3    │  25  (Voter1 new key)                │
│   4    │   0  (no votes)                      │
└────────┴──────────────────────────────────────┘
```

## Test Cases

### Test 1: Complete Flow

**Purpose:** Verify the entire AddNewKey flow works correctly

**Steps:**
1. ✅ Register 2 voters
2. ✅ Both vote with initial keys  
3. ✅ Voter1 deactivates
4. ✅ Process deactivation
5. ✅ Voter1 adds new key
6. ✅ Voter1 votes with new key
7. ✅ Process all messages
8. ✅ Tally all votes
9. ✅ Verify results include votes from both keys

**Expected:** All votes correctly tallied, including both of Voter1's key votes

### Test 2: Replay Protection

**Purpose:** Verify nullifier prevents reusing old key

**Steps:**
1. ✅ Voter1 has already added new key (from Test 1)
2. ✅ Try to add another new key with same old key
3. ✅ Use same deactivate data

**Expected:** Contract rejects with "NewKeyExist" error

### Test 3: Invalid Proof Rejection

**Purpose:** Verify cannot use someone else's deactivate

**Steps:**
1. ✅ Create attacker voter (not registered)
2. ✅ Try to use Voter1's deactivate data
3. ✅ Attempt to generate AddNewKey proof

**Expected:** SDK returns null (sharedKey doesn't match)

## Key Verification Points

### 1. Nullifier Uniqueness

```typescript
// Each oldPrivKey generates unique nullifier
nullifier = poseidon([oldPrivKey, NULLIFIER_CONSTANT])

// Contract checks:
if (NULLIFIERS.has(nullifier)) {
  throw NewKeyExist
}
NULLIFIERS.save(nullifier)
```

### 2. ECDH Binding

```typescript
// Operator generates:
operatorSharedKey = coordPrivKey × voterOldPubKey

// Voter computes:
voterSharedKey = voterOldPrivKey × coordPubKey

// They match (ECDH property):
operatorSharedKey === voterSharedKey ✅
```

### 3. Anonymity via Rerandomization

```typescript
// Original: (c1, c2)
// Rerandomized: (d1, d2)

// Relationship:
d1 = c1 + g^z
d2 = c2 + pk^z

// Properties:
// ✅ (d1, d2) looks random
// ✅ Cannot determine which (c1, c2) it came from
// ✅ Decrypts to same plaintext
```

### 4. Vote Integrity

```typescript
// All votes should be counted:
totalVotes = voter1OldVotes + voter2Votes + voter1NewVotes

// Verification:
∑ chainResults[i] === totalVotes ✅
```

## Expected Output

```
=== Setting up AddNewKey test environment ===
Test environment created
SDK clients initialized
Operator AMACI initialized
Deploying AMACI contract...
AMACI contract deployed at: dora1...

=== Phase 1: Initial registration and voting ===
Registering voter1 with old key...
Voter1 (old key) registered at index 0
Registering voter2...
Voter2 registered at index 1
Voter1 voting with old key...
Voter1 old key voted: 50 to option 0, 30 to option 1
Voter2 voting...
Voter2 voted: 40 to option 1, 20 to option 2

=== Phase 2: Deactivate old key ===
Voter1 deactivating old key...
Deactivate message published
Processing deactivate messages...
Deactivate messages processed
Uploading deactivate data...
Deactivate data uploaded

=== Phase 3: AddNewKey ===
Voter1 generating AddNewKey proof...
AddNewKey proof input generated
AddNewKey proof generated
Submitting AddNewKey...
Voter1 new key added at index 2

=== Phase 4: Vote with new key ===
Voter1 voting with new key...
Voter1 new key voted: 60 to option 2, 25 to option 3

=== Phase 5: Process messages and tally ===
Ending voting period...
Processing period started
Processing messages...
Total messages to process: 6
Processed 6/6 messages
Processing period stopped
Tallying votes...
Processed tally batch 1
Final tally results:
  Option 0: 50 votes
  Option 1: 70 votes
  Option 2: 80 votes
  Option 3: 25 votes
  Option 4: 0 votes
Tallying period stopped

=== Phase 6: Verify results ===
Verifying results:
Expected results from operator: [ 50n, 70n, 80n, 25n, 0n ]
Actual results from chain: [ 50n, 70n, 80n, 25n, 0n ]

✅ AddNewKey flow completed successfully!
All votes from both old and new keys are correctly tallied

  ✓ should complete full AddNewKey flow (123456ms)

=== Testing AddNewKey replay protection ===
✅ Correctly rejected reused nullifier
  ✓ should prevent reusing the same old key for AddNewKey (12345ms)

=== Testing invalid AddNewKey proof rejection ===
✅ Correctly prevented using someone else's deactivate
  ✓ should reject invalid AddNewKey proof (1234ms)

  3 passing (2m)
```

## Performance Benchmarks

| Operation | Expected Time |
|-----------|--------------|
| Contract deployment | ~2s |
| Register user | ~0.5s |
| Publish message | ~0.5s |
| Publish deactivate | ~0.5s |
| Process deactivate (5 msgs) | ~25s |
| Generate AddNewKey proof | ~15s |
| Submit AddNewKey | ~1s |
| Process messages (batch 5) | ~20s |
| Tally votes (batch 5) | ~15s |
| **Total test time** | ~2-3 minutes |

## Troubleshooting

### Issue 1: Circuit Files Not Found

```
Error: ENOENT: no such file or directory, open '.../addNewKey.wasm'
```

**Solution:**
```bash
cd e2e/circuits
./generate-circuits.sh amaci-2-1-1-5
```

### Issue 2: Proof Generation Timeout

```
Error: Timeout of 180000ms exceeded
```

**Solution:**
```typescript
this.timeout(300000); // Increase to 5 minutes
```

### Issue 3: Nullifier Already Exists

```
Error: NewKeyExist
```

**Cause:** Test was run multiple times without resetting

**Solution:** Test creates fresh environment each time, should not happen

### Issue 4: Invalid Proof

```
Error: InvalidProof
```

**Cause:** Circuit artifacts mismatch or wrong parameters

**Solution:**
- Verify circuit configuration matches test (2-1-1-5)
- Regenerate circuit artifacts
- Check coordinator public key is correct

## Environment Variables

Optional configuration:

```bash
# Enable verbose logging
export DEBUG=maci:*

# Use specific circuit directory
export CIRCUIT_DIR=/path/to/circuits

# Adjust gas settings
export GAS_MULTIPLIER=2.0
```

## Security Properties Verified

| Property | Test | Result |
|----------|------|--------|
| Nullifier prevents replay | Test 2 | ✅ Pass |
| ECDH prevents unauthorized use | Test 3 | ✅ Pass |
| Rerandomization anonymity | Test 1 | ✅ Pass |
| Vote integrity | Test 1 | ✅ Pass |
| Contract validation | All | ✅ Pass |

## Related Files

- Circuit test: `packages/circuits/ts/__tests__/AddNewKey.test.ts`
- SDK implementation: `packages/sdk/src/libs/crypto/keys.ts`
- Circuit: `packages/circuits/circom/amaci/power/addNewKey.circom`
- Documentation: `packages/circuits/docs/AddNewKey-Flow.md`

## Contributing

When modifying this test:
1. Keep test scenario realistic
2. Verify all security properties
3. Update expected results if vote distribution changes
4. Test both success and failure cases
5. Document any new test cases

## References

- [MACI Documentation](https://github.com/privacy-scaling-explorations/maci)
- [aMACI Specification](./docs/AddNewKey-Flow.md)
- [E2E Testing Guide](../README.md)
