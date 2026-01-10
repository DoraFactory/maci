# EdDSA-Poseidon

A Rust implementation of the EdDSA signature scheme using Poseidon hash and Baby Jubjub elliptic curve, compatible with [zk-kit's TypeScript implementation](https://github.com/privacy-scaling-explorations/zk-kit/tree/main/packages/eddsa-poseidon).

## Features

- ✅ **Blake-512** hash implementation (manually translated from TypeScript)
- ✅ **Blake2b** hash support using Rust's `blake2` crate
- ✅ **EdDSA signatures** on Baby Jubjub curve
- ✅ **Poseidon hash** for signing (using `light-poseidon`)
- ✅ **Key derivation** from private keys
- ✅ **Signature packing/unpacking** (64-byte format)
- ✅ **Public key compression/decompression**

## Examples

See the `examples/` directory for complete usage examples:

```bash
# Basic usage example
cargo run --example basic_usage

# Advanced usage with EdDSAPoseidon struct
cargo run --example advanced_usage

# Signature packing/unpacking
cargo run --example pack_signature
```

## API

The crate exposes the same functions as zk-kit's EdDSA-Poseidon:

### Core Functions

```rust
use eddsa_poseidon::{
    derive_secret_scalar, derive_public_key, sign_message, verify_signature,
    pack_public_key, unpack_public_key, pack_signature, unpack_signature,
    EdDSAPoseidon, HashingAlgorithm,
};
use num_bigint::BigUint;

// Derive keys
let private_key = b"my_secret_key";
let secret_scalar = derive_secret_scalar(private_key, HashingAlgorithm::Blake512)?;
let public_key = derive_public_key(private_key, HashingAlgorithm::Blake512)?;

// Sign a message
let message = BigUint::from(12345u64);
let signature = sign_message(private_key, &message, HashingAlgorithm::Blake512)?;

// Verify signature
let valid = verify_signature(&message, &signature, &public_key)?;

// Pack/unpack
let packed_sig = pack_signature(&signature)?;
let unpacked_sig = unpack_signature(&packed_sig)?;
```

### EdDSAPoseidon Struct

```rust
// Create instance with random key
let eddsa = EdDSAPoseidon::new(None, HashingAlgorithm::Blake512)?;

// Or with specific key
let eddsa = EdDSAPoseidon::new(
    Some(b"my_key".to_vec()),
    HashingAlgorithm::Blake512
)?;

// Sign and verify
let signature = eddsa.sign_message(&message)?;
let valid = eddsa.verify_signature(&message, &signature)?;
```

## Hashing Algorithms

Two hashing algorithms are supported for key derivation:

- `HashingAlgorithm::Blake512` - Original Blake-512 (manually translated from zk-kit)
- `HashingAlgorithm::Blake2b` - Blake2b-512 (using Rust's `blake2` crate)

## Implementation Details

### Blake-512

The Blake-512 implementation is a **line-by-line manual translation** from the TypeScript implementation in zk-kit to ensure exact compatibility. It does not use any existing Rust Blake library.

### Curve Operations

- Uses **Baby Jubjub** curve from `maci-crypto`
- Scalar multiplications use `ark-ed-on-bn254::Fr` (Ed25519 field)
- Poseidon hashing uses `ark-bn254::Fr` (BN254 field)

### Signature Format

Signatures are packed into 64 bytes:
- Bytes 0-31: R8 point (compressed)
- Bytes 32-63: S scalar (little-endian)

## Dependencies

- `ark-ff`, `ark-ec`, `ark-bn254`, `ark-ed-on-bn254` - Arkworks crypto primitives
- `light-poseidon` - Circom-compatible Poseidon hash
- `blake2` - Blake2b implementation
- `num-bigint` - Big number arithmetic
- `maci-crypto` - Baby Jubjub curve operations

## Testing

Run tests with:

```bash
cargo test
```

Current test status:
- ✅ Blake-512 hash tests (3/3 passing)
- ✅ Utility tests (2/2 passing)  
- ✅ Key derivation tests (2/2 passing)
- ✅ Signature pack/unpack tests (1/1 passing)
- ✅ Different message verification (1/1 passing)
- ⚠️  Signature verification tests (needs debugging - 3/3 failing)

## Known Issues

1. **Signature Verification**: The signature verification is failing in tests. This may be due to:
   - Field arithmetic differences between BN254 and Ed25519
   - Endianness issues in coordinate extraction
   - Poseidon hash parameter mismatch

   This is under investigation.

## License

MIT

## References

- [zk-kit EdDSA-Poseidon](https://github.com/privacy-scaling-explorations/zk-kit/tree/main/packages/eddsa-poseidon)
- [Baby Jubjub Curve (EIP-2494)](https://eips.ethereum.org/EIPS/eip-2494)
- [Poseidon Hash](https://www.poseidon-hash.info/)

