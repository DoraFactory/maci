# MACI E2E Testing Framework

An end-to-end testing framework based on [cosmwasm-simulate SDK](https://oraichain.github.io/cw-simulate/) for testing the complete voting flow of MACI/AMACI contracts.

## Features

- ✅ **Local Contract Execution**: Uses cosmwasm-simulate SDK to simulate contract execution locally without requiring an actual chain environment
- ✅ **Complete Flow Testing**: Covers the complete voting flow from user registration to result tallying
- ✅ **Circuit Integration**: Integrates circomkit to generate zero-knowledge proofs
- ✅ **SDK Collaboration**: Tightly integrated with @dorafactory/maci-sdk to verify on-chain and off-chain state consistency
- ✅ **Multi-Scenario Support**: 
  - AMACI (Anonymous key replacement + QV)
  - MACI (Standard 1P1V)
  - Registry (Multi-round management)
  - Advanced scenarios (Large-scale users, error handling, etc.)

## Architecture

```
e2e/
├── src/
│   ├── setup/              # Environment setup
│   │   ├── contractLoader.ts    # WASM contract loader
│   │   └── chainSetup.ts        # Chain environment configuration
│   ├── contracts/          # Contract management
│   │   ├── deployManager.ts     # Contract deployment management
│   │   └── contractClients.ts   # Contract client wrappers
│   ├── utils/              # Utility functions
│   │   ├── testHelpers.ts       # Test helper functions
│   │   └── circuitIntegration.ts # Circuit proof generation
│   └── types/              # Type definitions
│       └── index.ts
└── tests/                  # Test suites
    ├── amaci.e2e.test.ts        # AMACI complete flow
    ├── maci.e2e.test.ts         # MACI standard flow
    ├── registry.e2e.test.ts     # Registry management
    └── advanced.e2e.test.ts     # Advanced scenarios
```

## Installation

```bash
cd e2e
pnpm install
```

## Circuit Setup

Tests require zkey files from zero-knowledge proof circuits for real proof generation and verification.

### Automatic Setup (Recommended)

```bash
# Download zkey files and extract verification keys (one-time setup)
pnpm setup-circuits
```

This will:
1. Download approximately 50-100MB of zkey files from S3 (configuration: 2-1-1-5)
2. Extract to `circuits/2-1-1-5/` directory
3. Extract verification keys from zkey and save as JSON

### Manual Setup

If automatic download fails, you can manually operate:

```bash
# 1. Download zkey files
pnpm download-zkeys

# 2. Extract verification keys
pnpm extract-vkeys
```

### Circuit Configuration

**Current configuration: 2-1-1-5**

Format: `state_tree_depth-int_state_tree_depth-vote_option_tree_depth-message_batch_size`

Constraints:
- **Max voters**: 5^state_tree_depth = 5^2 = **25 voters**
- **Max options**: 5^vote_option_tree_depth = 5^1 = **5 options**
- **Batch size**: **5 messages** per batch

File list:
- `circuits/2-1-1-5/processMessages.wasm` - Message processing circuit
- `circuits/2-1-1-5/processMessages.zkey` - Message processing proving key
- `circuits/2-1-1-5/tallyVotes.wasm` - Vote tallying circuit
- `circuits/2-1-1-5/tallyVotes.zkey` - Vote tallying proving key
- `circuits/vkeys-2-1-1-5.json` - Verification keys (for contract use)

### Verify Setup

```bash
# Automatically checked before tests, can also be checked manually
pnpm pretest
```

## Usage

### Run All Tests

```bash
pnpm test
```

### Run Specific Tests

```bash
# AMACI end-to-end test
pnpm test:amaci

# MACI standard flow test
pnpm test:maci

# Registry test
pnpm test:registry

# Advanced scenario test
pnpm test:advanced
```

## Test Descriptions

### 1. AMACI End-to-End Test (`amaci.e2e.test.ts`)

Tests the complete AMACI voting flow, including anonymous key replacement:

**Flow Steps:**
1. Environment Setup - Deploy AMACI contract, initialize SDK
2. User Registration - 3 users register
3. Key Deactivation - Users send deactivation messages
4. Process Deactivation - Coordinator processes deactivation messages and generates proofs
5. Add New Key - Users add new anonymous keys
6. Voting - Users vote with old and new keys
7. Message Processing - Batch process voting messages
8. Vote Tallying - Tally final results
9. Result Verification - Verify on-chain and off-chain results are consistent

**Key Points:**
- Tests anonymous key replacement mechanism
- Verifies zero-knowledge proof generation and verification
- Ensures SDK state synchronization with contract state

### 2. MACI Standard Flow Test (`maci.e2e.test.ts`)

Tests standard MACI 1P1V mode:

**Scenarios:**
- 5 users participate in voting
- 3 voting options
- Tests vote modification (nonce mechanism)
- Batch processing and tallying

**Verification Points:**
- 1P1V rules correctly executed
- Vote modification correctly processed
- Final vote counts accurate

### 3. Registry End-to-End Test (`registry.e2e.test.ts`)

Tests Registry contract managing multiple voting rounds:

**Function Tests:**
- Create multiple rounds (AMACI QV, MACI 1P1V)
- Query single round
- List all rounds
- Paginated queries
- Filter by type

### 4. Advanced Scenario Test (`advanced.e2e.test.ts`)

Tests edge cases and complex scenarios:

**Scenarios Include:**
- Large-scale users (10+ users)
- Duplicate registration error handling
- Voting time window restrictions
- Invalid proof rejection
- Time advancement testing

## Core Components

### ContractLoader

Loads compiled WASM contract bytecode:

```typescript
const loader = new ContractLoader();
const amaciWasm = await loader.loadAmaciContract();
```

### DeployManager

Manages contract deployment and instantiation:

```typescript
const deployManager = new DeployManager(client, loader);
const contractInfo = await deployManager.deployAmaciContract(
  sender,
  initMsg
);
```

### Contract Clients

Type-safe contract call wrappers:

```typescript
const amaciContract = new AmaciContractClient(
  client,
  contractAddress,
  sender
);

await amaciContract.signUp(pubkey);
await amaciContract.publishMessage(message, encPubKey);
```

### Circuit Integration

Circuit proof generation and format conversion:

```typescript
const proof = await generateDeactivateProof(
  input,
  stateTreeDepth,
  batchSize
);

await amaciContract.processDeactivateMessage(
  size,
  commitment,
  root,
  proof
);
```

## Data Flow

```
VoterClient (SDK)
  ↓ Generate voting messages
SimulateCosmWasmClient
  ↓ Publish to contract
OperatorClient (SDK)
  ↓ Process messages, generate circuit inputs
Circomkit
  ↓ Generate zero-knowledge proofs
SimulateCosmWasmClient
  ↓ Submit proofs to contract
Contract
  ↓ Verify proofs, update state
Test
  ↓ Verify results
```

## Key Technical Points

### 1. Proof Format Conversion

Convert from snarkjs format to contract expected format:

```typescript
function convertProofToContractFormat(proof: Groth16Proof): ContractProofType {
  return {
    a: JSON.stringify(proof.pi_a),
    b: JSON.stringify(proof.pi_b),
    c: JSON.stringify(proof.pi_c)
  };
}
```

### 2. State Synchronization

SDK maintains off-chain state tree, contract stores on-chain commitments:

```typescript
// SDK update
operator.initStateTree(index, pubKey, balance);

// Contract update
await amaciContract.signUp(pubKey);

// Verify consistency
const sdkRoot = operator.stateTree.root;
const contractRoot = await amaciContract.getStateRoot();
expect(sdkRoot).to.equal(contractRoot);
```

### 3. Time Control

Use cosmwasm-simulate's time advancement feature:

```typescript
import { advanceTime } from '../src/utils/testHelpers';

// Advance 1 hour
await advanceTime(client, 3600);
```

## Configuration

### TypeScript Configuration

`tsconfig.json` configures path aliases:

```json
{
  "paths": {
    "@/*": ["src/*"],
    "@setup/*": ["src/setup/*"],
    "@contracts/*": ["src/contracts/*"],
    "@utils/*": ["src/utils/*"]
  }
}
```

### Mocha Configuration

`.mocharc.json` sets long timeout to accommodate circuit computation:

```json
{
  "timeout": 600000,  // 10 minutes
  "exit": true
}
```

## Dependencies

### Core Dependencies

- `@oraichain/cw-simulate` - CosmWasm local simulator
- `@dorafactory/maci-sdk` - MACI SDK
- `@dorafactory/maci-circuits` - Circuit definitions
- `circomkit` - Circuit testing tool
- `snarkjs` - Zero-knowledge proof library

### Test Dependencies

- `mocha` - Test runner
- `chai` - Assertion library
- `ts-mocha` - TypeScript support

## Notes

1. **Contract Files**: Ensure compiled WASM files exist in `../artifacts/` directory
2. **Circuit Files**: Ensure compiled circuits exist in `../packages/circuits/`
3. **Memory**: Circuit computation requires large memory, configured with `--max-old-space-size=4096`
4. **Timeout**: Complete tests may take 10+ minutes, appropriate timeout has been set

## Troubleshooting

### WASM Files Not Found

```bash
# Ensure contracts are compiled
cd ../
pnpm build
```

### Circuit Files Not Found

```bash
# Compile circuits
cd ../packages/circuits
pnpm run circom:build
```

### Insufficient Memory

Increase Node.js memory limit:

```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm test
```

## Extensions

### Adding New Contract Clients

Add in `src/contracts/contractClients.ts`:

```typescript
export class MyContractClient extends BaseContractClient {
  async myMethod(param: string): Promise<any> {
    return await this.execute({ my_method: { param } });
  }
}
```

### Adding New Test Scenarios

Create a new file in `tests/` directory:

```typescript
import { expect } from 'chai';
import { createTestEnvironment, DeployManager } from '../src';

describe('My Test', function() {
  it('should work', async () => {
    const env = await createTestEnvironment();
    // Your test code
  });
});
```

## References

- [cosmwasm-simulate Documentation](https://oraichain.github.io/cw-simulate/)
- [MACI SDK Documentation](https://github.com/dorafactory/maci)
- [Circomkit Documentation](https://github.com/erhant/circomkit)

## License

Apache-2.0
