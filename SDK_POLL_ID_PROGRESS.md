# SDK Poll ID Implementation Progress

## ✅ Completed Tasks

### 1. Core Crypto Functions
- ✅ **pack.ts**: Updated `packElement` to use `pollId` instead of `salt`
  - Added `pollId` parameter (32 bits at position 192-223)
  - Removed `salt` from packElement (now handled separately in command array)
  - Updated `unpackElement` to return `pollId`

### 2. Voter Class (`voter.ts`)
- ✅ Added `getPollId(contractAddress)` method
  - Queries contract for poll_id
  - Returns number type
  - Proper error handling
- ✅ Updated `genMessageFactory`
  - Added `contractAddress` parameter
  - Made function async (await getPollId)
  - Passes `pollId` to `packElement`
  - Updated command array to include salt separately

### 3. Operator Class (`operator.ts`)
- ✅ Added `getPollId(contractAddress)` method
- ✅ Updated `genMessageFactory`
  - Added `contractAddress` parameter
  - Made function async
  - Passes `pollId` to `packElement`
- ✅ Updated `batchGenMessage`
  - Added `contractAddress` parameter
  - Made function async
  - Handles async genMessage calls
- ✅ Updated `buildVotePayload`
  - Added `contractAddress` parameter
  - Made function async
  - Passes contractAddress to batchGenMessage
- ✅ Updated `buildDeactivatePayload`
  - Added `contractAddress` parameter
  - Made function async
  - Passes contractAddress to batchGenMessage

### 4. Contract Client Types
- ✅ **AMaci.types.ts**: Automatically generated with `poll_id: number` in InstantiateMsg
- ✅ **Registry.types.ts**: Automatically generated with new query types
- ✅ **AMaci.client.ts**: Has `getPollId()` method
- ✅ **Registry.client.ts**: Has `getPollId({ address })`, `getPollAddress({ poll_id })`, `getNextPollId()` methods

## 🔲 Pending Tasks

### 1. Update Callers of Modified Methods

需要更新所有调用这些方法的地方，添加 `contractAddress` 参数并处理 async：

#### In `voter.ts`:
```typescript
// Example of methods that might call buildVotePayload or genMessageFactory
// Search for usage and update
```

#### In `operator.ts`:
```typescript
// Find all methods that call:
// - buildVotePayload
// - buildDeactivatePayload
// - batchGenMessage
// Add contractAddress parameter and await calls
```

### 2. Update Tests

#### Unit Tests:
- `packages/sdk/tests/pack.test.ts` - Test pollId packing/unpacking
- `packages/sdk/tests/voter.test.ts` - Test getPollId and async message generation
- `packages/sdk/tests/operator.test.ts` - Test async vote/deactivate payload building

#### Integration Tests:
- Test full voting flow with pollId
- Test cross-round replay attack prevention

### 3. Update Examples and Scripts

#### Example Scripts:
- `packages/sdk/examples/poll_id_usage.ts` ✅ (already created)
- Update existing example scripts to use new async APIs

#### Test Scripts:
- `packages/sdk/scripts/test_amaci_mainnet.ts` - Update to use async methods
- `packages/sdk/scripts/test_pack_element.ts` - Update to test pollId

### 4. Documentation

- ✅ Update implementation doc
- Update API documentation
- Update migration guide
- Add changelog entry

## 📝 Breaking Changes Summary

### Function Signature Changes:

```typescript
// Before
buildVotePayload({ stateIdx, operatorPubkey, selectedOptions, derivePathParams })

// After
async buildVotePayload({ stateIdx, operatorPubkey, selectedOptions, contractAddress, derivePathParams })
```

```typescript
// Before
buildDeactivatePayload({ stateIdx, operatorPubkey, derivePathParams })

// After
async buildDeactivatePayload({ stateIdx, operatorPubkey, contractAddress, derivePathParams })
```

```typescript
// Before
genMessageFactory(stateIdx, operatorPubkey, derivePathParams)

// After
genMessageFactory(stateIdx, operatorPubkey, contractAddress, derivePathParams)
// Returns async function
```

```typescript
// Before
packElement({ nonce, stateIdx, voIdx, newVotes, salt })

// After
packElement({ nonce, stateIdx, voIdx, newVotes, pollId })
```

### Command Array Structure Change:

```typescript
// Before (6 elements)
[packaged, ...newPubKey, ...signature.R8, signature.S]

// After (7 elements)
[packaged, salt, ...newPubKey, ...signature.R8, signature.S]
```

## 🧪 Testing Checklist

- [ ] Unit test: packElement with pollId
- [ ] Unit test: unpackElement returns pollId
- [ ] Unit test: getPollId from contract
- [ ] Integration test: Vote with pollId
- [ ] Integration test: Cross-round replay prevention
- [ ] Integration test: Async message generation
- [ ] E2E test: Full voting flow with new SDK

## 🔍 Files to Review

### Modified Files:
1. ✅ `packages/sdk/src/libs/crypto/pack.ts`
2. ✅ `packages/sdk/src/voter.ts`
3. ✅ `packages/sdk/src/operator.ts`
4. 🔲 `packages/sdk/src/maci.ts` - May need updates if it uses voter/operator
5. 🔲 `packages/sdk/src/libs/crypto/keys.ts` - Low-level functions (may not need changes)

### Contract Client Files (Auto-generated):
1. ✅ `packages/sdk/src/libs/contract/ts/AMaci.types.ts`
2. ✅ `packages/sdk/src/libs/contract/ts/AMaci.client.ts`
3. ✅ `packages/sdk/src/libs/contract/ts/Registry.types.ts`
4. ✅ `packages/sdk/src/libs/contract/ts/Registry.client.ts`

## 📋 Next Steps

1. **Find and update all callers** of modified methods
2. **Run TypeScript compiler** to find type errors
3. **Update test files** to use new async APIs
4. **Test locally** with a test round
5. **Update all example scripts**
6. **Review and update documentation**

## 🚀 Deployment Checklist

- [ ] All TypeScript compilation errors resolved
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Example scripts updated and tested
- [ ] Migration guide written
- [ ] Changelog updated
- [ ] Version bump (breaking change)
- [ ] Deploy to npm
