# Utils - Shared Circuit Components

This directory contains all shared circuit components used by both AMACI and MACI circuits.

## Directory Structure

```
utils/
├── ecdh.circom                    # ECDH key exchange
├── hasherPoseidon.circom          # Poseidon hash functions (Hasher3, Hasher4, Hasher5, Hasher10, Hasher12, HashLeftRight)
├── hasherSha256.circom            # SHA256 hash functions
├── messageHasher.circom           # Message hashing
├── messageToCommand.circom        # Message to command conversion
├── privToPubKey.circom           # Private key to public key conversion
├── unpackElement.circom          # Element unpacking
├── verifySignature.circom        # Signature verification
├── lib/
│   └── poseidonDecrypt.circom    # Poseidon decryption
├── poseidon/
│   ├── poseidonHashT3.circom     # Poseidon hash with 3 inputs
│   ├── poseidonHashT4.circom     # Poseidon hash with 4 inputs
│   ├── poseidonHashT5.circom     # Poseidon hash with 5 inputs
│   └── poseidonHashT6.circom     # Poseidon hash with 6 inputs
└── trees/
    ├── calculateTotal.circom      # Tree total calculation
    ├── checkRoot.circom          # Root verification
    ├── incrementalMerkleTree.circom # Merkle tree operations
    ├── incrementalQuinTree.circom   # Quintary tree operations
    └── zeroRoot.circom           # Zero root generation
```

## Usage

To use these shared components in AMACI or MACI circuits, import them with:

```circom
include "../../utils/<component>.circom";
```

For example:
```circom
include "../../utils/hasherPoseidon.circom";
include "../../utils/privToPubKey.circom";
include "../../utils/trees/incrementalQuinTree.circom";
```

## Note

- All components in this directory are **completely identical** between AMACI and MACI implementations
- Implementation-specific components remain in their respective directories:
  - `messageValidator.circom` - Different implementations in amaci/power and maci/power
  - `stateLeafTransformer.circom` - Different implementations in amaci/power and maci/power
  - `rerandomize.circom` - AMACI-specific, remains in `amaci/power/lib/`
- Circuit-specific main files remain in their respective `amaci/power/` or `maci/power/` directories

