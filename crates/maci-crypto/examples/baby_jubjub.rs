//! Baby Jubjub Curve Operations Example
//!
//! This example demonstrates the basic operations on the Baby Jubjub curve,
//! matching the TypeScript implementation from @zk-kit/baby-jubjub.
//!
//! Operations demonstrated:
//! - Scalar multiplication (public key generation)
//! - Point packing/unpacking
//! - Curve membership verification
//!
//! Run with: cargo run --example baby_jubjub

use ark_ed_on_bn254::Fr as EdFr;
use maci_crypto::{base8, in_curve, mul_point_escalar, pack_point, unpack_point};

fn main() {
    // Create secret scalar (324 in decimal) - matching TypeScript example
    let secret_scalar = EdFr::from(111111u64);

    // Get Base8 point
    let base8_point = base8();

    // Multiply Base8 by secret scalar to get public key
    let public_key = mul_point_escalar(&base8_point, secret_scalar);

    // Print public key (matching TypeScript format)
    println!("publicKey: ({}, {})", public_key.x, public_key.y);

    // Pack the point
    let packed_point = pack_point(&public_key);
    println!("packedPoint: {}", packed_point);

    // Unpack the point
    match unpack_point(&packed_point) {
        Ok(unpacked_point) => {
            println!(
                "unpackedPoint: ({}, {})",
                unpacked_point.x, unpacked_point.y
            );

            // Verify unpacked point matches original
            if unpacked_point == public_key {
                println!("✓ Unpacked point matches original point");
            } else {
                println!("✗ Unpacked point does not match original point");
            }
        }
        Err(e) => {
            println!("Error unpacking point: {}", e);
        }
    }

    // Check if point is on curve
    println!("inCurve: {}", in_curve(&public_key));
}
