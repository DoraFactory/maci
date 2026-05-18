# @dorafactory/maci-cli

A public CLI tool for verifying aMACI (Anonymous Minimal Anti-Collusion Infrastructure) rounds and circuit registries on Dora Vota.

Anyone can run this tool to independently verify that a MACI round's proofs were accepted on-chain and that commitments are consistent — without requiring any private key or special permissions.

## Installation

```bash
npm install -g @dorafactory/maci-cli
# or
pnpm add -g @dorafactory/maci-cli
```

## Commands

### `maci registry list`

Lists all aMACI circuits known to this CLI.

```bash
maci registry list
```

### `maci registry show <power>`

Shows detailed parameters, vkey fingerprints, and zkey download info for a circuit.

```bash
maci registry show 9-4-3-125
maci registry show 2-1-1-5
```

### `maci registry check <contract>`

Compares the on-chain vkeys of a round contract against the bundled circuit registry.
Reports `MATCH` or `MISMATCH` for each vkey type (process, tally, deactivate, addNewKey).

```bash
# Mainnet (default)
maci registry check dora1abc...xyz

# Testnet
maci registry check dora1abc...xyz --network testnet
```

### `maci round <contract>`

Verify all proofs and commitments for an aMACI round.

**Layer 1** (default): commitment audit via indexer + RPC — fast, no local computation.
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

**Layer 2** (`--recheck`): local ZK re-verification using snarkjs — thorough, slower.
- Downloads all indexed messages and rebuilds the MSG_HASHES chain locally
- Fetches on-chain vkeys and reconstructs public signals (`input_hash`)
- Runs `snarkjs.groth16.verify()` for every processMessage and tally proof

```bash
maci round dora1abc...xyz --recheck
maci round dora1abc...xyz --network testnet --recheck
```

## Verification Levels

| Level | Flag | What it checks |
|-------|------|----------------|
| Layer 1 | (default) | Commitment chain audit via indexer + RPC |
| Layer 2 | `--recheck` | Full local ZK proof re-verification using snarkjs |

## Network Defaults

| Network | RPC | Indexer |
|---------|-----|---------|
| `mainnet` (default) | `https://vota-rpc.dorafactory.org` | `https://maci-graphql.dorafactory.org` |
| `testnet` | `https://vota-testnet-rpc.dorafactory.org` | `https://maci-testnet-graphql.dorafactory.org` |

## Trust Model

- **Circuit registry**: The bundled vkeys are version-controlled in this package's git history and sourced directly from `maci/contracts/amaci/src/circuit_params.rs`. If you trust the CLI's npm provenance, you trust these vkeys.
- **Round verification**: Data is read directly from the CosmWasm RPC (chain) and the indexer. The chain is the ultimate source of truth — the smart contract itself verifies proofs on submission.
- **Layer 2**: The `--recheck` flag skips relying on the contract's on-chain Groth16 verification and re-runs it locally using the same snarkjs library that the operator used to generate the proofs.

## Development

```bash
# From maci/packages/cli
pnpm build          # compile with tsup
pnpm dev            # watch mode
pnpm lint           # TypeScript type check
pnpm clean          # remove dist/
```

## Supported Circuits

| Power | Status | Description |
|-------|--------|-------------|
| `9-4-3-125` | Production | The only circuit accepted by the live aMACI contract |
| `2-1-1-5` | Test-only | Accepted only when the contract is compiled with `feature="test-vkeys"` |
