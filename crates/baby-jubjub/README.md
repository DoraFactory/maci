# Baby Jubjub Elliptic Curve

A Rust implementation of the Baby Jubjub elliptic curve, compatible with EIP-2494.

## Overview

Baby Jubjub is a twisted Edwards elliptic curve defined over the BN254 scalar field. It's widely used in zero-knowledge proof systems and provides efficient cryptographic operations.

## Features

- **Edwards Curve Operations**: Point addition and scalar multiplication
- **Point Packing/Unpacking**: Efficient serialization format
- **Curve Validation**: Check if points lie on the curve
- **Random Value Generation**: Secure random value generation without modulo bias
- **Production-grade**: Built on the Arkworks ecosystem

## Curve Parameters

- **Curve Equation**: ax² + y² = 1 + dx²y²
- **Coefficient a**: 168700
- **Coefficient d**: 168696
- **Cofactor**: 8
- **Subgroup Order**: 2736030358979909402780800718157159386076813972158567259200215660948447373041

## Usage

```rust
use baby_jubjub::{base8, mul_point_escalar, EdFr, pack_point, unpack_point};

// Get the base point
let base = base8();

// Scalar multiplication
let scalar = EdFr::from(42u64);
let result = mul_point_escalar(&base, scalar);

// Pack point to BigUint
let packed = pack_point(&result);

// Unpack point from BigUint
let unpacked = unpack_point(&packed).unwrap();
assert_eq!(result, unpacked);
```

## Examples

Run the basic operations example:

```bash
cargo run --example basic_operations
```

This example demonstrates:
- Scalar multiplication (public key generation)
- Point packing/unpacking
- Curve membership verification

## API Reference

### Core Functions

- `base8()` - Returns the base point (generator * 8)
- `add_point(p1, p2)` - Point addition
- `mul_point_escalar(base, scalar)` - Scalar multiplication
- `in_curve(point)` - Check if point is on curve
- `pack_point(point)` - Pack point to BigUint
- `unpack_point(packed)` - Unpack point from BigUint

### Random Generation

- `gen_random_babyjub_value()` - Generate random BigUint without modulo bias
- `gen_random_fr()` - Generate random field element

### Type Aliases

- `EdwardsAffine` - Affine point representation
- `EdwardsProjective` - Projective point representation
- `Fq` - Base field element (from ark-ed-on-bn254)
- `EdFr` - Scalar field element (from ark-ed-on-bn254)

## Dependencies

This crate uses the Arkworks ecosystem:
- `ark-ec` - Elliptic curve traits
- `ark-ff` - Finite field arithmetic
- `ark-bn254` - BN254 curve
- `ark-ed-on-bn254` - Baby Jubjub curve implementation

## License

MIT

