# @dorafactory/maci-cli

A public CLI tool for verifying aMACI (Anonymous Minimal Anti-Collusion Infrastructure) rounds and circuit registries on Dora Vota.

Anyone can run this tool to independently verify that a MACI round's proofs were accepted on-chain and that commitments are consistent — without requiring any private key or special permissions.

## Installation

```bash
npm install -g @dorafactory/maci-cli
# or
pnpm add -g @dorafactory/maci-cli
```

**Requirements**: Node.js >= 18.0.0

## Quick Start

```bash
# Check if a round's proofs all passed on-chain (fast, no local computation)
maci round dora1abc...xyz

# Fully re-verify proofs locally with snarkjs (thorough, slower)
maci round dora1abc...xyz --recheck

# Inspect what circuits the CLI knows about
maci registry list

# Compare on-chain vkeys against the bundled registry
maci registry check dora1abc...xyz
```

## Commands

### `maci registry list`

Lists all aMACI circuits bundled in this CLI, including their power string, status, and a brief description.

```bash
maci registry list
```

Example output:

```
┌─────────────┬────────────┬──────────────────────────────────────────────────────────────────┐
│ Power       │ Status     │ Description                                                      │
├─────────────┼────────────┼──────────────────────────────────────────────────────────────────┤
│ 9-4-3-125   │ Production │ The only circuit accepted by the live aMACI contract              │
│ 2-1-1-5     │ Test-only  │ Accepted only when compiled with feature="test-vkeys"             │
└─────────────┴────────────┴──────────────────────────────────────────────────────────────────┘
```

---

### `maci registry show <power>`

Shows detailed parameters, verification key fingerprints, and zkey download information for a specific circuit.

```bash
maci registry show 9-4-3-125
maci registry show 2-1-1-5
```

The output includes:

- Circuit parameters (state tree depth, message batch size, vote option tree depth, etc.)
- SHA-256 fingerprints of each vkey (processMessages, tally, deactivate, addNewKey)
- Links to download the corresponding `.zkey` files

---

### `maci registry check <contract>`

Fetches the verification keys stored on-chain for a round contract and compares them against the bundled circuit registry. Reports `MATCH` or `MISMATCH` for each vkey type.

```bash
# Mainnet (default)
maci registry check dora1abc...xyz

# Testnet
maci registry check dora1abc...xyz --network testnet
```

Example output:

```
Checking vkeys for dora1abc...xyz on mainnet...

  processMessages  ✔ MATCH    (9-4-3-125)
  tally            ✔ MATCH    (9-4-3-125)
  deactivate       ✔ MATCH    (9-4-3-125)
  addNewKey        ✔ MATCH    (9-4-3-125)

All vkeys match the bundled registry.
```

If any vkey does not match, the command exits with code `1`.

---

### `maci round <contract>`

Verifies all proofs and commitments for an aMACI round. Supports two verification levels.

#### Layer 1 (default) — Commitment Audit

Fast commitment audit via the indexer and RPC. No local ZK computation required.

Checks performed:

- All submitted proofs were accepted by the smart contract (`verifyResult = true`)
- On-chain `MSG_CHAIN_LENGTH` matches the count of indexed messages
- Batch coverage: total processed messages ≥ chain length
- Last message proof's state commitment matches on-chain `QueryCurrentStateCommitment`
- Last tally proof's commitment matches on-chain `current_tally_commitment`

```bash
# Mainnet
maci round dora1abc...xyz

# Testnet
maci round dora1abc...xyz --network testnet

# Override specific endpoints
maci round dora1abc...xyz \
  --rpc https://vota-rpc.dorafactory.org \
  --indexer https://maci-graphql.dorafactory.org
```

#### Layer 2 (`--recheck`) — Local ZK Re-verification

Thorough re-verification using snarkjs. Skips trusting the contract's on-chain Groth16 verifier and re-runs it locally.

Additional checks performed:

- Downloads all indexed messages and rebuilds the `MSG_HASHES` chain locally
- Fetches on-chain vkeys and reconstructs public signals (`input_hash`)
- Runs `snarkjs.groth16.verify()` for every processMessage and tally proof

```bash
maci round dora1abc...xyz --recheck
maci round dora1abc...xyz --network testnet --recheck
```

> **Note**: Layer 2 verification downloads proof data and runs local ZK verification, which may take several minutes depending on the number of messages in the round.

---

## Options Reference

| Option | Commands | Default | Description |
|--------|----------|---------|-------------|
| `--network` | `registry check`, `round` | `mainnet` | Network to connect to (`mainnet` or `testnet`) |
| `--rpc` | `round` | *(see Network Defaults)* | Override the CosmWasm RPC endpoint |
| `--indexer` | `round` | *(see Network Defaults)* | Override the MACI GraphQL indexer endpoint |
| `--recheck` | `round` | `false` | Enable Layer 2 local ZK re-verification |

## Verification Levels

| Level | Flag | Speed | What it checks |
|-------|------|-------|----------------|
| Layer 1 | (default) | Fast | Commitment chain audit via indexer + RPC |
| Layer 2 | `--recheck` | Slower | Full local ZK proof re-verification using snarkjs |

## Network Defaults

| Network | RPC | Indexer |
|---------|-----|---------|
| `mainnet` (default) | `https://vota-rpc.dorafactory.org` | `https://maci-graphql.dorafactory.org` |
| `testnet` | `https://vota-testnet-rpc.dorafactory.org` | `https://maci-testnet-graphql.dorafactory.org` |

## Supported Circuits

| Power | Status | Description |
|-------|--------|-------------|
| `9-4-3-125` | Production | The only circuit accepted by the live aMACI contract |
| `2-1-1-5` | Test-only | Accepted only when the contract is compiled with `feature="test-vkeys"` |

## Trust Model

- **Circuit registry**: The bundled vkeys are version-controlled in this package's git history and sourced directly from `maci/contracts/amaci/src/circuit_params.rs`. If you trust the CLI's npm provenance, you trust these vkeys.
- **Round verification**: Data is read directly from the CosmWasm RPC (chain) and the indexer. The chain is the ultimate source of truth — the smart contract itself verifies proofs on submission.
- **Layer 2**: The `--recheck` flag skips relying on the contract's on-chain Groth16 verification and re-runs it locally using the same snarkjs library that the operator used to generate the proofs.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All checks passed |
| `1` | One or more checks failed (mismatch, rejected proof, etc.) |
| `2` | Invalid arguments or usage error |

## Development

```bash
# From maci/packages/cli
pnpm build          # compile with tsup
pnpm dev            # watch mode
pnpm lint           # TypeScript type check
pnpm clean          # remove dist/
```
