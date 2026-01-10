# MACI

MACI (Minimal Anti-Collusion Infrastructure) is a set of smart contracts, cryptographic libraries, and zero-knowledge circuits that provides collusion-resistant voting with on-chain verification.

## Features

- **Privacy-Preserving Voting**: Ensures voter privacy through encryption and zero-knowledge proofs
- **Collusion Resistance**: Prevents bribery and coercion through innovative cryptographic mechanisms
- **Flexible Voting Mechanisms**:
  - 1P1V (One Person One Vote)
  - QV (Quadratic Voting)
  - Configurable voting power calculation
- **Cross-Chain Support**:
  - Cosmos Hub ecosystem integration
  - Dora Vota ecosystem integration
  - Token-based whitelist management
- **Gas Optimization**: Built-in gas station support for efficient transaction handling

## SDK & Libraries

### TypeScript

| Package | Version | Description |
|---------|---------|-------------|
| [@dorafactory/maci-sdk](https://www.npmjs.com/package/@dorafactory/maci-sdk) | ![npm](https://img.shields.io/npm/v/@dorafactory/maci-sdk) | Complete MACI client SDK for voting, round management, operator management, circuit configuration, transaction monitoring, and proof verification |
| [@dorafactory/maci-operator](https://www.npmjs.com/package/@dorafactory/maci-operator) | ![npm](https://img.shields.io/npm/v/@dorafactory/maci-operator) | Dedicated MACI/AMACI operator system for processing encrypted messages, generating ZK proofs, and tallying rounds |

### Rust

| Crate | Description |
|-------|-------------|
| `baby-jubjub` | Baby Jubjub elliptic curve implementation (EIP-2494 compatible) with point operations, packing/unpacking, and curve validation |
| `eddsa-poseidon` | EdDSA signature scheme using Poseidon hash on Baby Jubjub curve, compatible with zk-kit |
| `maci-crypto` | Core MACI cryptographic primitives: Poseidon hashing, key management, ECDH, message packing, and N-ary Merkle trees |
| `maci-utils` | Shared utility functions for MACI contracts: Poseidon hash, type conversions, and SHA256 utilities |

## Contracts

CosmWasm smart contracts for MACI system deployed on Cosmos-based chains.

| Contract | Description |
|----------|-------------|
| `amaci` | Anonymous MACI implementation with deactivation detection and privacy enhancements |
| `api-maci` | Standard MACI contract with Groth16/PLONK proof verification for vote processing |
| `api-saas` | SaaS API contract for managing MACI services and deployments |
| `registry` | Registry contract for managing MACI rounds, operators, and circuit configurations |

Location: [`contracts/`](contracts/)

## Circuits

Zero-knowledge circuits for MACI written in Circom, enabling privacy-preserving vote processing and tallying.

- **Location**: [`packages/circuits/`](packages/circuits/)
- **Circuits**: ProcessMessages, Tally, StateTransition, and more
- **Proof Systems**: Groth16 and PLONK support
- **Optimizations**: Efficient constraint systems for on-chain verification

## Learn More

If you're interested in learning more about MACI's mechanisms and technical details:

- [Minimal anti-collusion infrastructure](https://ethresear.ch/t/minimal-anti-collusion-infrastructure/5413)
- [MACI anonymization - using rerandomizable encryption](https://ethresear.ch/t/maci-anonymization-using-rerandomizable-encryption/7054)
- [MACI anonymization based on 2-of-2 MPC](https://research.dorahacks.io/2023/03/30/mpc-maci-anonymization/)
