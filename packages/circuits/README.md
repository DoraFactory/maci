# MACI Circuits

### Overview

This package contains zero-knowledge SNARK circuits for **MACI (Minimal Anti-Collusion Infrastructure)** and **aMACI (Anonymous MACI)** systems. These circuits are written in Circom and provide cryptographic guarantees for private, verifiable voting systems with anti-collusion properties.

### Features

- 🔒 **Privacy-Preserving**: Encrypted messages protect voter choices
- ✅ **Verifiable**: Zero-knowledge proofs ensure computational integrity
- 🛡️ **Anti-Collusion**: Prevents vote buying and coercion
- 🔐 **Anonymous Voting** (aMACI): Support for anonymous voter participation
- 📊 **Batch Processing**: Efficient processing of multiple messages
- 🌲 **Merkle Tree Integration**: State management using incremental Merkle trees

### Circuit Components

#### MACI Circuits

Located in `circom/maci/power/`:

- **ProcessMessages**: Batch processes encrypted voting messages, verifies message chains, decrypts and validates commands, and updates state trees
- **TallyVotes**: Computes final vote tallies with zero-knowledge proofs
- **MessageValidator**: Validates message signatures, nonces, and voting logic
- **StateLeafTransformer**: Transforms state leaves based on valid commands

#### aMACI Circuits

Located in `circom/amaci/power/`:

- **AddNewKey**: Allows voters to add new voting keys with zero-knowledge proofs
- **ProcessDeactivate**: Handles voter deactivation with privacy preservation
- **ProcessMessages**: Anonymous version of message processing
- **TallyVotes**: Anonymous vote tallying
- **MessageValidator**: Validates messages in anonymous context
- **StateLeafTransformer**: State transitions for anonymous voting

#### Utility Circuits

Located in `circom/utils/`:

- **Cryptography**: ECDH, ElGamal encryption, Poseidon hashing, signature verification
- **Trees**: Incremental Merkle trees, quinary trees, root checking
- **Helpers**: Message hashing, command parsing, element unpacking

### Installation

```bash
pnpm install
```

### Usage

#### Build Circuits

```bash
# Compile all circuits
pnpm run circom:build

# Setup trusted setup (generate proving/verification keys)
pnpm run circom:setup

# Get circuit information
pnpm run circuit-info
```

#### Generate Proofs

```bash
# Build circuits with C witness generation (faster)
pnpm run build-test-circuits-c

# Build circuits with WASM witness generation
pnpm run build-test-circuits-wasm

# Generate zero-knowledge proving keys
pnpm run generate-zkeys
```

#### Testing

```bash
# Run all tests
pnpm run test

# Run specific test suites
pnpm run test:processMessagesAmaci
pnpm run test:tallyVotes
pnpm run test:addNewKey
pnpm run test:processDeactivate

# Run fuzz tests
pnpm run test:fuzz
```

### Circuit Parameters

Circuits are parameterized for different system sizes. See `circom/circuits.json` for available configurations:

- **State Tree Depth**: 2, 4, or 6 (supports 5, 625, or 15,625 voters)
- **Message Tree Depth**: 1, 2, or 3 (supports 5, 25, or 125 messages)
- **Vote Options**: 1, 2, or 3 options per state tree depth

Example configurations:
- `ProcessMessages_maci_4-2-25`: Depth 4, 2 levels, 25 messages
- `TallyVotes_amaci_6-3-3`: Depth 6, 3 vote option levels, 3 vote options
- `AddNewKey_amaci_4`: Depth 4 state tree for key addition

### Project Structure

```
packages/circuits/
├── circom/                 # Circuit source files
│   ├── amaci/             # aMACI-specific circuits
│   │   └── power/         # Main aMACI circuits
│   ├── maci/              # MACI-specific circuits
│   │   └── power/         # Main MACI circuits
│   ├── utils/             # Shared utility circuits
│   └── circuits.json      # Circuit configurations
├── docs/                   # Detailed documentation
├── js/                     # JavaScript utilities
├── ts/                     # TypeScript source code
│   ├── __tests__/         # Test suites
│   ├── compile.ts         # Circuit compilation script
│   └── generateZkeys.ts   # zkey generation script
├── scripts/               # Build and utility scripts
└── README.md              # This file
```

### Documentation

Comprehensive documentation is available in the `docs/` directory:

- Circuit architecture and design
- Security analysis
- State transition rules
- Message validation logic
- Integration guides
- Test documentation

### Security Considerations

These circuits implement critical security properties:

1. **Message Integrity**: Hash chains prevent message tampering
2. **Authorization**: Only valid signatures can modify state
3. **Nonce Protection**: Prevents replay attacks
4. **Balance Validation**: Ensures sufficient vote credits
5. **State Consistency**: Merkle proofs guarantee state validity

For detailed security analysis, see the documentation in `docs/`.

### Dependencies

- **circomkit**: Circuit compilation and testing framework
- **circomlib**: Standard Circom library
- **snarkjs**: Zero-knowledge proof generation and verification
- **@dorafactory/maci-sdk**: MACI SDK for JavaScript/TypeScript

### Contributing

When contributing new circuits:

1. Follow the existing code structure
2. Add comprehensive tests in `ts/__tests__/`
3. Document constraints and security properties
4. Optimize for minimal constraint count
5. Update `circuits.json` with new configurations

### License

See the LICENSE file in the project root.
