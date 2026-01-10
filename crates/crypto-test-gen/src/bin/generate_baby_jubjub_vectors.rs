use anyhow::Result;
use ark_ff::{BigInteger, PrimeField};
use baby_jubjub::{add_point, base8, in_curve, mul_point_escalar, pack_point, unpack_point, EdFr};
use crypto_test_gen::{BabyJubjubData, BabyJubjubTestVector, PointJson};
use num_bigint::BigUint;
use serde_json;
use std::fs;
use std::path::Path;

fn point_to_json(point: &baby_jubjub::EdwardsAffine) -> PointJson {
    let x_bytes = point.x.into_bigint().to_bytes_le();
    let y_bytes = point.y.into_bigint().to_bytes_le();
    let x = BigUint::from_bytes_le(&x_bytes);
    let y = BigUint::from_bytes_le(&y_bytes);

    PointJson {
        x: x.to_string(),
        y: y.to_string(),
    }
}

fn generate_vectors() -> Result<Vec<BabyJubjubTestVector>> {
    let mut vectors = Vec::new();

    // Test 1: Add point - identity + Base8
    let identity = baby_jubjub::EdwardsAffine::new_unchecked(
        baby_jubjub::Fq::from(0),
        baby_jubjub::Fq::from(1),
    );
    let base = base8();
    let result = add_point(&identity, &base);

    vectors.push(BabyJubjubTestVector {
        name: "addPoint_identity_plus_base8".to_string(),
        description: "Add identity point [0,1] to Base8".to_string(),
        vector_type: "addPoint".to_string(),
        data: BabyJubjubData::AddPoint {
            p1: point_to_json(&identity),
            p2: point_to_json(&base),
            result: point_to_json(&result),
        },
    });

    // Test 2: Scalar multiplication with 324 (from zk-kit tests)
    let scalar = EdFr::from(324u64);
    let pub_key = mul_point_escalar(&base, scalar);

    vectors.push(BabyJubjubTestVector {
        name: "mulPointEscalar_base8_times_324".to_string(),
        description: "Multiply Base8 by scalar 324".to_string(),
        vector_type: "mulPointEscalar".to_string(),
        data: BabyJubjubData::MulPointEscalar {
            base: point_to_json(&base),
            scalar: "324".to_string(),
            result: point_to_json(&pub_key),
        },
    });

    // Test 3: Pack and unpack point (scalar 324)
    let packed = pack_point(&pub_key);
    let _unpacked = unpack_point(&packed)?;

    vectors.push(BabyJubjubTestVector {
        name: "packUnpack_point_scalar_324".to_string(),
        description: "Pack and unpack point from scalar multiplication by 324".to_string(),
        vector_type: "packUnpack".to_string(),
        data: BabyJubjubData::PackUnpack {
            point: point_to_json(&pub_key),
            packed: packed.to_string(),
        },
    });

    // Test 4: InCurve - valid point (Base8)
    vectors.push(BabyJubjubTestVector {
        name: "inCurve_base8_valid".to_string(),
        description: "Check if Base8 is on curve (should be true)".to_string(),
        vector_type: "inCurve".to_string(),
        data: BabyJubjubData::InCurve {
            point: point_to_json(&base),
            on_curve: in_curve(&base),
        },
    });

    // Test 5: InCurve - invalid point [1, 0]
    let invalid = baby_jubjub::EdwardsAffine::new_unchecked(
        baby_jubjub::Fq::from(1),
        baby_jubjub::Fq::from(0),
    );
    vectors.push(BabyJubjubTestVector {
        name: "inCurve_invalid_point".to_string(),
        description: "Check if invalid point [1, 0] is on curve (should be false)".to_string(),
        vector_type: "inCurve".to_string(),
        data: BabyJubjubData::InCurve {
            point: point_to_json(&invalid),
            on_curve: in_curve(&invalid),
        },
    });

    // Test 6: Multiple scalar multiplications (matching test suite patterns)
    let scalars = vec![1u64, 2u64, 100u64, 1000u64];
    for scalar_val in scalars {
        let scalar = EdFr::from(scalar_val);
        let result = mul_point_escalar(&base, scalar);
        let packed = pack_point(&result);

        vectors.push(BabyJubjubTestVector {
            name: format!("mulPointEscalar_base8_times_{}", scalar_val),
            description: format!("Multiply Base8 by scalar {}", scalar_val),
            vector_type: "mulPointEscalar".to_string(),
            data: BabyJubjubData::MulPointEscalar {
                base: point_to_json(&base),
                scalar: scalar_val.to_string(),
                result: point_to_json(&result),
            },
        });

        vectors.push(BabyJubjubTestVector {
            name: format!("packUnpack_point_scalar_{}", scalar_val),
            description: format!("Pack point from scalar {}", scalar_val),
            vector_type: "packUnpack".to_string(),
            data: BabyJubjubData::PackUnpack {
                point: point_to_json(&result),
                packed: packed.to_string(),
            },
        });
    }

    // Test 7: Pack/unpack with small y-coordinate value
    // (from zk-kit test: "Should unpack a packed public key with less bytes than 32")
    use num_bigint::BigUint as NumBigUint;
    use num_traits::Num;
    
    let point_small_x = baby_jubjub::Fq::from_le_bytes_mod_order(
        &NumBigUint::from_str_radix(
            "10207164244839265210731148792003399330071235260758262804307337735329782473514",
            10,
        )
        .unwrap()
        .to_bytes_le(),
    );
    let point_small_y = baby_jubjub::Fq::from_le_bytes_mod_order(
        &NumBigUint::from_str_radix(
            "4504034976288485670718230979254896078098063043333320048161019268102694534400",
            10,
        )
        .unwrap()
        .to_bytes_le(),
    );
    
    let point_small = baby_jubjub::EdwardsAffine::new_unchecked(point_small_x, point_small_y);

    let packed_small = pack_point(&point_small);
    vectors.push(BabyJubjubTestVector {
        name: "packUnpack_point_small_y_coord".to_string(),
        description: "Pack/unpack point with y-coordinate less than 32 bytes".to_string(),
        vector_type: "packUnpack".to_string(),
        data: BabyJubjubData::PackUnpack {
            point: point_to_json(&point_small),
            packed: packed_small.to_string(),
        },
    });

    Ok(vectors)
}

fn main() -> Result<()> {
    println!("Generating Baby Jubjub test vectors...");

    let vectors = generate_vectors()?;

    println!("Generated {} test vectors", vectors.len());

    // Output directory: e2e/crypto-test (relative to workspace root)
    let output_dir = Path::new("e2e/crypto-test");
    fs::create_dir_all(output_dir)?;

    let output_path = output_dir.join("baby-jubjub-test-vectors.json");
    let json = serde_json::to_string_pretty(&vectors)?;
    fs::write(&output_path, json)?;

    println!("✓ Saved to: {}", output_path.display());
    println!("✓ Baby Jubjub test vectors generated successfully!");

    Ok(())
}

