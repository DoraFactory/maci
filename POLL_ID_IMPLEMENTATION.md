# Poll ID Implementation Summary

## Overview
Implementation of **方案一**: Registry-managed Poll ID system to prevent cross-round replay attacks.

## Architecture

```
Registry Contract
  ├── NEXT_POLL_ID: u64 (incrementing counter, starts at 1)
  ├── POLL_ID_TO_ADDRESS: Map<u64, Addr>
  └── ADDRESS_TO_POLL_ID: Map<&Addr, u64>

AMACI Contract
  └── POLL_ID: u64 (assigned by Registry)
```

## Data Flow

### 1. Creating a Round
```
User → Registry.CreateRound()
  1. Registry allocates poll_id = NEXT_POLL_ID
  2. NEXT_POLL_ID += 1
  3. Registry instantiates AMACI with poll_id
  4. AMACI saves poll_id to storage
  5. Registry.reply_created_round() receives contract address
  6. Registry stores bidirectional mapping:
     - POLL_ID_TO_ADDRESS[poll_id] = amaci_address
     - ADDRESS_TO_POLL_ID[amaci_address] = poll_id
```

### 2. Voting Flow (SDK Implementation Needed)
```
User wants to vote
  1. SDK calls amaci.GetPollId() → poll_id
  2. SDK packs message with poll_id:
     packElement({ nonce, stateIdx, voIdx, newVotes, pollId })
  3. Circuit verifies poll_id matches expected value
```

## Modified Files

### Registry Contract

#### `contracts/registry/src/state.rs`
- ✅ Added `NEXT_POLL_ID: Item<u64>`
- ✅ Added `POLL_ID_TO_ADDRESS: Map<u64, Addr>`
- ✅ Added `ADDRESS_TO_POLL_ID: Map<&Addr, u64>`
- ✅ Added `PollInfo` struct (for future use)

#### `contracts/registry/src/contract.rs`
- ✅ Updated imports to include poll ID storage items
- ✅ Modified `instantiate()`: Initialize `NEXT_POLL_ID = 1`
- ✅ Modified `execute_create_round()`:
  - Allocate poll_id before creating AMACI
  - Pass poll_id in `InstantiateMsg`
  - Add poll_id to attributes
- ✅ Modified `reply_created_round()`:
  - Extract poll_id from `AMaciInstantiationData`
  - Store bidirectional mapping
  - Add poll_id to reply attributes

#### `contracts/registry/src/msg.rs`
- ✅ Added query methods:
  - `GetPollId { address: Addr }` → `u64`
  - `GetPollAddress { poll_id: u64 }` → `Option<Addr>`
  - `GetNextPollId {}` → `u64`

### AMACI Contract

#### `contracts/amaci/src/state.rs`
- ✅ Added `POLL_ID: Item<u64>`

#### `contracts/amaci/src/msg.rs`
- ✅ Modified `InstantiateMsg`: Added `poll_id: u64` (required field)
- ✅ Modified `InstantiationData`: Added `poll_id: u64` (required field)
- ✅ Added query method: `GetPollId {}` → `u64`

#### `contracts/amaci/src/contract.rs`
- ✅ Updated imports to include `POLL_ID`
- ✅ Modified `instantiate()`: Save poll_id (required field)
- ✅ Modified instantiation response: Include poll_id (required)
- ✅ Added query handler for `GetPollId` (returns u64, not Option)

## Space Analysis

### Current packElement Layout (with salt removed)
```
[0-31]     : nonce          (32 bits)
[32-63]    : stateIdx       (32 bits)
[64-95]    : voIdx          (32 bits)
[96-191]   : newVotes       (96 bits)
-----------------------------------------
Total: 192 bits used
Remaining: 61 bits available (253 - 192)
```

### Recommended Layout (with pollId)
```
[0-31]     : nonce          (32 bits)
[32-63]    : stateIdx       (32 bits)
[64-95]    : voIdx          (32 bits)
[96-191]   : newVotes       (96 bits)
[192-223]  : pollId         (32 bits) ← NEW
[224-252]  : reserved       (29 bits) ← for future use
-----------------------------------------
Total: 253 bits (fully utilized)
```

**pollId (32 bits)**: Supports 4,294,967,296 rounds

## Next Steps (SDK Implementation Required)

### 1. Update TypeScript `pack.ts`
```typescript
export function packElement({
  nonce,
  stateIdx,
  voIdx,
  newVotes,
  pollId  // NEW: 32 bits
}: {
  nonce: number | bigint;
  stateIdx: number | bigint;
  voIdx: number | bigint;
  newVotes: number | bigint;
  pollId: number | bigint;  // NEW
}): bigint {
  const packaged =
    BigInt(nonce) +
    (BigInt(stateIdx) << 32n) +
    (BigInt(voIdx) << 64n) +
    (BigInt(newVotes) << 96n) +
    (BigInt(pollId) << 192n);  // NEW
  
  return packaged;
}

export function unpackElement(packaged: bigint): {
  nonce: bigint;
  stateIdx: bigint;
  voIdx: bigint;
  newVotes: bigint;
  pollId: bigint;  // NEW
} {
  const nonce = packaged % UINT32;
  const stateIdx = (packaged >> 32n) % UINT32;
  const voIdx = (packaged >> 64n) % UINT32;
  const newVotes = (packaged >> 96n) % UINT96;
  const pollId = (packaged >> 192n) % UINT32;  // NEW

  return { nonce, stateIdx, voIdx, newVotes, pollId };
}
```

### 2. Update SDK Voter/Operator
```typescript
// In voter.ts, operator.ts, keys.ts
const pollId = await getPollId(contractAddress);
const packaged = packElement({ 
  nonce, 
  stateIdx, 
  voIdx, 
  newVotes, 
  pollId  // NEW
});
```

### 3. Add SDK Query Method
```typescript
async getPollId(contractAddress: string): Promise<number> {
  const result = await this.wasmQueryClient.queryContractSmart(
    contractAddress,
    { get_poll_id: {} }
  );
  // poll_id is now required, will always return a number (never null)
  return result;
}
```

### 4. Update Circuits

#### `packages/circuits/circom/utils/messageToCommand.circom`
```circom
template MessageToCommand() {
    var MSG_LENGTH = 7;
    var CMD_LENGTH = 6;
    var PACKED_CMD_LENGTH = 3;

    // ... existing signals ...
    signal output pollId;  // NEW

    // Change from UnpackElement(6) to UnpackElement(7)
    component unpack = UnpackElement(7);
    unpack.in <== decryptor.decrypted[0];

    nonce <== unpack.out[6];
    stateIndex <== unpack.out[5];
    voteOptionIndex <== unpack.out[4];
    pollId <== unpack.out[3];  // NEW
    
    // newVotes from out[0], out[1], out[2]
    component computeVoteWeight = Uint32to96();
    for (var i = 0; i < 3; i ++) {
        computeVoteWeight.in[i] <== unpack.out[i];
    }
    newVoteWeight <== computeVoteWeight.out;
    
    // ... rest of template ...
}
```

#### `packages/circuits/circom/amaci/power/processMessages.circom`
```circom
template ProcessMessages(...) {
    signal input expectedPollId;  // NEW: public input
    
    // In message processing loop
    for (var i = 0; i < batchSize; i++) {
        commands[i].pollId === expectedPollId;  // NEW: verify pollId
        // ... rest of processing ...
    }
}
```

### 5. Update Tests
- ✅ Registry instantiate test: verify NEXT_POLL_ID = 1
- ✅ Create round test: verify poll_id allocation
- ✅ Query tests: test GetPollId, GetPollAddress, GetNextPollId
- ✅ AMACI tests: verify poll_id storage and query
- 🔲 Circuit tests: test UnpackElement(7) with pollId
- 🔲 Integration tests: end-to-end voting with pollId

## Benefits

1. ✅ **Prevents Cross-Round Replay Attacks**: Each round has unique poll_id
2. ✅ **Centralized Management**: Registry controls ID allocation
3. ✅ **No Collision Risk**: Sequential IDs (not hash-based)
4. ✅ **Easy Querying**: Bidirectional mapping (ID ↔ Address)
5. ✅ **Scalable**: 32-bit ID supports 4B+ rounds
6. ✅ **Future-Proof**: 29 bits reserved for additional fields
7. ✅ **Type Safety**: poll_id is required (not optional), enforced at compile time

## Backwards Compatibility

⚠️ **This is a breaking change**:
- All circuits must be recompiled
- All proof keys must be regenerated
- Old messages cannot be verified
- SDK must be updated to include pollId

## Testing Checklist

- [ ] Registry: poll_id allocation and increment
- [ ] Registry: bidirectional mapping storage
- [ ] Registry: query methods work correctly
- [ ] AMACI: poll_id storage and retrieval
- [ ] SDK: packElement includes pollId
- [ ] SDK: getPollId query method
- [ ] Circuits: UnpackElement(7) extracts pollId
- [ ] Circuits: pollId verification constraint
- [ ] Integration: end-to-end voting flow with pollId
- [ ] Security: cannot reuse messages across rounds

## Deployment Steps

1. Deploy updated Registry contract
2. Deploy updated AMACI contract code
3. Update SDK package
4. Recompile all circuits
5. Regenerate all proof keys (zkeys)
6. Update frontend to use new SDK
7. Create test round and verify pollId
8. Monitor for any issues

## Notes

- Poll IDs start from 1 (not 0) to avoid confusion with uninitialized values
- The system supports up to 4,294,967,296 rounds (32-bit unsigned)
- Poll ID is automatically assigned; users cannot specify custom IDs
- Querying poll_id from AMACI contract is gas-efficient (single storage read)
- Salt has been completely removed from packElement to make room for pollId
