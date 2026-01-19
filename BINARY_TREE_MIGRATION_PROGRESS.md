# Binary Tree Migration Progress

## Phase 1: Test Framework Fix ✅ COMPLETED

- [x] Convert LeanTree.test.ts from Vitest to Mocha+Chai (321 lines)
- [x] Convert LeanTree.integration.test.ts from Vitest to Mocha+Chai (380+ lines)
- [x] Create LeanTree.circuit-consistency.test.ts (470+ lines) - **NEW**
- [x] Create LEANTREE_TESTS_GUIDE.md documentation - **NEW**

All test assertions converted:
- `toBe()` → `to.equal()`
- `toEqual()` → `to.deep.equal()`
- `toBe(true/false)` → `to.be.true/false`
- `toBeGreaterThan()` → `to.be.greaterThan()`
- `not.toThrow()` → `to.not.throw()`

**New test coverage added:**
- ✅ Hash function consistency tests (Poseidon hash2)
- ✅ Binary tree property verification (arity=2)
- ✅ Circuit input format preparation (path_elements, path_index)
- ✅ **SDK ↔ Circuit computation consistency validation** (core requirement)
- ✅ Root consistency across tree operations
- ✅ Merkle proof verification between SDK and circuits
- ✅ Dynamic growth consistency
- ✅ Serialization consistency

## Phase 2: Binary Tree Circuit Library ✅ COMPLETED

Created `packages/circuits/circom/utils/trees/binaryLeanTree.circom` with:
- `BinaryLeafExists(levels)` - Verifies leaf existence in binary tree
- `BinaryTreeInclusionProof(levels)` - Computes Merkle root from leaf and path
- `BinaryCheckRoot(levels)` - Computes root from complete leaf set
- `BinaryGeneratePathIndices(levels)` - Generates binary path indices (base 2)
- `BinaryBatchLeavesExists(levels, batchLevels)` - Batch verification

## Phase 3: Core Circuit Rewrite 🔄 IN PROGRESS

### Key Changes Required

**From Quinary (arity=5) to Binary (arity=2):**

```circom
// OLD:
var TREE_ARITY = 5;
include "../../utils/trees/incrementalQuinTree.circom";
signal input pathElements[depth][TREE_ARITY - 1];  // [depth][4]
component qle = QuinLeafExists(depth);

// NEW:
var TREE_ARITY = 2;
include "../../utils/trees/binaryLeanTree.circom";
signal input pathElements[depth][TREE_ARITY - 1];  // [depth][1]
component ble = BinaryLeafExists(depth);
```

**Depth Adjustments:**

| Tree | Quinary Depth | Quinary Capacity | Binary Depth | Binary Capacity |
|------|--------------|------------------|--------------|-----------------|
| State | 4 | 625 | 10 | 1024 |
| State | 6 | 15,625 | 14 | 16,384 |
| Deactivate | 6 (depth+2) | 15,625 | 12 | 4,096 |
| Vote Options | 2 | 25 | 5 | 32 |

### Files to Modify (8 total)

#### AMACI Circuits (4 files):
1. ✅ `packages/circuits/circom/amaci/power/processMessages.circom` - COMPLETED
2. ❌ `packages/circuits/circom/amaci/power/processDeactivate.circom`
3. ❌ `packages/circuits/circom/amaci/power/addNewKey.circom`
4. ❌ `packages/circuits/circom/amaci/power/tallyVotes.circom`

#### MACI Circuits (2 files):
5. ❌ `packages/circuits/circom/maci/power/processMessages.circom`
6. ❌ `packages/circuits/circom/maci/power/tallyVotes.circom`

### Specific Modifications Per File

#### processMessages.circom (AMACI) ✅ COMPLETED

Changes applied:
- Line 8: Changed include to binaryLeanTree.circom
- Line 28: Changed TREE_ARITY from 5 to 2
- Lines 94, 109, 112: Path elements now [depth][1] (binary) instead of [depth][4] (quinary)
- Line 400: Changed QuinGeneratePathIndices → BinaryGeneratePathIndices
- Line 405: Changed QuinTreeInclusionProof → BinaryTreeInclusionProof  
- Line 421: Changed QuinTreeInclusionProof → BinaryTreeInclusionProof (activeState)
- Line 440: Changed QuinGeneratePathIndices → BinaryGeneratePathIndices (voteWeight)
- Line 443: Changed QuinTreeInclusionProof → BinaryTreeInclusionProof (voteWeight)
- Line 467: Changed QuinTreeInclusionProof → BinaryTreeInclusionProof (newVoteOption)
- Line 512: Changed QuinTreeInclusionProof → BinaryTreeInclusionProof (newStateLeaf)
- Line 305: Changed TREE_ARITY from 5 to 2 in ProcessOne template

#### processMessages.circom (MACI)

Line 8: Change include
```circom
// OLD: include "../../utils/trees/incrementalQuinTree.circom";
// NEW: include "../../utils/trees/binaryLeanTree.circom";
```

Line 28: Change arity
```circom
// OLD: var TREE_ARITY = 5;
// NEW: var TREE_ARITY = 2;
```

Lines 94, 109, 112: Update path elements dimensions
```circom
// OLD: [batchSize][stateTreeDepth][TREE_ARITY - 1]  // [batchSize][depth][4]
// NEW: [batchSize][stateTreeDepth][TREE_ARITY - 1]  // [batchSize][depth][1]
```

Lines 155, 160: Update capacity calculations
```circom
// OLD: maxVoValid.in[1] <== TREE_ARITY ** voteOptionTreeDepth;  // 5^depth
// NEW: maxVoValid.in[1] <== TREE_ARITY ** voteOptionTreeDepth;  // 2^depth
```

Lines 229, 238, 267: Update QuinLeafExists → BinaryLeafExists
```circom
// OLD: component qle = QuinLeafExists(stateTreeDepth);
// NEW: component ble = BinaryLeafExists(stateTreeDepth);
```

#### addNewKey.circom (AMACI)

Line 7: Change include
Line 23: Change arity to 2
Line 21: Update deactivateTreeDepth formula (may need adjustment)
```circom
// Currently: var deactivateTreeDepth = stateTreeDepth + 2;
// Binary: May need different formula to maintain similar capacity
```

Lines 45, 86: Update path dimensions

#### processDeactivate.circom (AMACI)

Similar changes as processMessages

#### tallyVotes.circom (AMACI & MACI)

Lines 24-28: Update arity and batch size calculations
```circom
// OLD: var batchSize = TREE_ARITY ** intStateTreeDepth;  // 5^depth
// NEW: var batchSize = TREE_ARITY ** intStateTreeDepth;  // 2^depth
```

## Phase 4-7: Remaining Tasks

### Phase 4: SDK Updates
- ❌ Update TypeScript Tree class to use binary/LeanTree by default
- ❌ Update Rust Tree implementation

### Phase 5: Contract Updates  
- ❌ Update CosmWasm contracts for binary tree proofs
- ❌ Update proof verification functions
- ❌ Update storage layouts

### Phase 6: Compilation & Testing
- ❌ Compile all circuits
- ❌ Generate new zkeys
- ❌ Update all test cases

### Phase 7: Performance Analysis
- ❌ Measure constraint counts
- ❌ Compare gas costs
- ❌ Document performance gains

## Next Steps

1. **Complete Circuit Rewrites** (Phase 3)
   - Start with processMessages.circom (AMACI version)
   - Then MACI version
   - Continue with other circuits

2. **Verify Compilation**
   - Test each circuit after modification
   - Ensure no syntax errors

3. **Update Tests**
   - Modify test depth parameters
   - Update proof generation tests

## Notes

- This is a **breaking change** - requires new trusted setup
- All existing zkeys will be invalid
- Contract interfaces will change
- Significant testing required before deployment
