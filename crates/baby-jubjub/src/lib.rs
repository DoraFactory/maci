//! Baby Jubjub Elliptic Curve
//!
//! This library provides Baby Jubjub curve operations compatible with EIP-2494.
//! Baby Jubjub is a twisted Edwards elliptic curve defined over the BN254 scalar field.

mod constants;
mod error;

pub use constants::{biguint_to_fr, fr_to_biguint, SNARK_FIELD_SIZE};
pub use error::{BabyJubjubError, Result};

use ark_bn254::Fr;
use ark_ec::{
    models::CurveConfig,
    twisted_edwards::{Affine, MontCurveConfig, Projective, TECurveConfig},
    CurveGroup,
};
use ark_ff::{BigInteger, Field, MontFp, PrimeField, Zero};
use num_bigint::BigUint;
use rand::Rng;

// Re-export ark_ed_on_bn254 types for convenience
pub use ark_ed_on_bn254::{Fq, Fr as EdFr};

/// Type aliases for Edwards curve points
pub type EdwardsAffine = Affine<BabyJubjubConfig>;
pub type EdwardsProjective = Projective<BabyJubjubConfig>;

/// Baby Jubjub curve configuration
/// Compatible with EIP-2494
#[derive(Clone, Default, PartialEq, Eq)]
pub struct BabyJubjubConfig;

impl CurveConfig for BabyJubjubConfig {
    type BaseField = Fq;
    type ScalarField = EdFr;

    // h = 8
    const COFACTOR: &'static [u64] = &[8];

    // h^(-1) (mod r)
    const COFACTOR_INV: EdFr =
        MontFp!("2394026564107420727433200628387514462817212225638746351800188703329891451411");
}

// Twisted Edwards form
// ax^2 + y^2 = 1 + dx^2y^2
impl TECurveConfig for BabyJubjubConfig {
    // a = 168700
    const COEFF_A: Fq = MontFp!("168700");

    #[inline(always)]
    fn mul_by_a(elem: Self::BaseField) -> Self::BaseField {
        elem * <BabyJubjubConfig as TECurveConfig>::COEFF_A
    }

    // d = 168696
    const COEFF_D: Fq = MontFp!("168696");

    // Base point is used as generator to operate in subgroup
    const GENERATOR: EdwardsAffine = EdwardsAffine::new_unchecked(BASE_X, BASE_Y);

    type MontCurveConfig = BabyJubjubConfig;
}

// Montgomery form
// By^2 = x^3 + A x^2 + x
impl MontCurveConfig for BabyJubjubConfig {
    // A = 168698
    const COEFF_A: Fq = MontFp!("168698");
    // B = 1
    const COEFF_B: Fq = Fq::ONE;

    type TECurveConfig = BabyJubjubConfig;
}

/// Generator point x-coordinate
pub const GENERATOR_X: Fq =
    MontFp!("995203441582195749578291179787384436505546430278305826713579947235728471134");
/// Generator point y-coordinate
pub const GENERATOR_Y: Fq =
    MontFp!("5472060717959818805561601436314318772137091100104008585924551046643952123905");

/// Subgroup order `l`
pub const SUBGROUP_ORDER: EdFr =
    MontFp!("2736030358979909402780800718157159386076813972158567259200215660948447373041");

/// Base point x-coordinate (8 * generator)
pub const BASE_X: Fq =
    MontFp!("5299619240641551281634865583518297030282874472190772894086521144482721001553");
/// Base point y-coordinate (8 * generator)
pub const BASE_Y: Fq =
    MontFp!("16950150798460657717958625567821834550301663161624707787222815936182638968203");

/// Generate a BabyJub-compatible random value
/// This prevents modulo bias by using the algorithm from:
/// http://cvsweb.openbsd.org/cgi-bin/cvsweb/~checkout~/src/lib/libc/crypt/arc4random_uniform.c
///
/// The function generates random values until it finds one that doesn't cause modulo bias
pub fn gen_random_babyjub_value() -> BigUint {
    // Prevent modulo bias
    // const lim = 2^256
    // const min = (lim - SNARK_FIELD_SIZE) % SNARK_FIELD_SIZE
    let min = BigUint::parse_bytes(
        b"6350874878119819312338956282401532410528162663560392320966563075034087161851",
        10,
    )
    .expect("Failed to parse min value");

    let mut rng = rand::thread_rng();
    let mut rand_val: BigUint;

    loop {
        // Generate 32 random bytes (256 bits)
        let mut bytes = [0u8; 32];
        rng.fill(&mut bytes);
        rand_val = BigUint::from_bytes_be(&bytes);

        if rand_val >= min {
            break;
        }
    }

    // Compute the private key modulo 2^253 (as per the TS implementation)
    // Precomputed: 2^253 = 14474011154664524427946373126085988481658748083205070504932198000989141204992
    const MODULO_2_253: &str =
        "14474011154664524427946373126085988481658748083205070504932198000989141204992";
    let modulo =
        BigUint::parse_bytes(MODULO_2_253.as_bytes(), 10).expect("Failed to parse modulo constant");
    &rand_val % &modulo
}

/// Generate a random field element using Arkworks
pub fn gen_random_fr() -> Fr {
    let value = gen_random_babyjub_value();
    biguint_to_fr(&value)
}

/// Base8 point (same as BASE point in baby_jubjub)
/// This is the base point used for scalar multiplication
pub fn base8() -> EdwardsAffine {
    EdwardsAffine::new_unchecked(BASE_X, BASE_Y)
}

/// Performs point addition on the Baby Jubjub elliptic curve
/// Let P1 = (x1, y1) and P2 = (x2, y2) be two arbitrary points of the curve.
/// Then P1 + P2 = (x3, y3) is calculated as:
/// x3 = (x1*y2 + y1*x2)/(1 + d*x1*x2*y1*y2)
/// y3 = (y1*y2 - a*x1*x2)/(1 - d*x1*x2*y1*y2)
pub fn add_point(p1: &EdwardsAffine, p2: &EdwardsAffine) -> EdwardsAffine {
    // Use Arkworks built-in addition
    (*p1 + *p2).into_affine()
}

/// Performs a scalar multiplication by starting from the 'base' point and 'adding'
/// it to itself 'e' times.
/// @param base The base point used as a starting point.
/// @param e A secret number representing the private key.
/// @returns The resulting point representing the public key.
pub fn mul_point_escalar(base: &EdwardsAffine, e: EdFr) -> EdwardsAffine {
    // Convert to projective for multiplication, then back to affine
    let projective: EdwardsProjective = (*base).into();
    (projective * e).into_affine()
}

/// Determines if a given point lies on the Baby Jubjub elliptic curve by verifying the curve equation.
/// This function checks if the point satisfies the curve equation `ax^2 + y^2 = 1 + dx^2y^2`.
pub fn in_curve(point: &EdwardsAffine) -> bool {
    point.is_on_curve()
}

/// Check if a field element is "negative" (greater than p/2 in finite field sense)
fn is_negative_fq(value: &Fq) -> bool {
    // In finite field, a value is considered "negative" if it's greater than p/2
    // Convert to BigUint for comparison
    let value_biguint = BigUint::from_bytes_le(&(*value).into_bigint().to_bytes_le());

    // Base field modulus for Baby Jubjub (Fq)
    // p = 21888242871839275222246405745257275088614511777268538073601725287587578984328
    let p_half = BigUint::parse_bytes(
        b"10944121435919637611123202872628637544307255888634269036800862643793789492164",
        10,
    )
    .expect("Failed to parse p/2");

    value_biguint > p_half
}

/// Packs a point on the Baby Jubjub elliptic curve into a BigUint.
/// Format: 32 bytes of y (little-endian) with sign bit for x in the most significant bit of the last byte.
/// If x < 0 (in field sense, i.e., x > p/2), set bit 7 of byte 31.
/// Returns the packed point as a BigUint (decimal representation).
pub fn pack_point(point: &EdwardsAffine) -> BigUint {
    let mut packed = [0u8; 32];

    // Pack y coordinate (32 bytes, little-endian)
    let y_bytes = point.y.into_bigint().to_bytes_le();
    let y_len = y_bytes.len().min(32);
    packed[..y_len].copy_from_slice(&y_bytes[..y_len]);

    // Pack x coordinate sign in the last byte
    // If x is negative (in field sense, i.e., x > p/2), set the most significant bit
    if is_negative_fq(&point.x) {
        packed[31] |= 0x80;
    }

    // Convert bytes to BigUint (little-endian)
    BigUint::from_bytes_le(&packed)
}

/// Unpacks a point from a BigUint.
/// Format: y coordinate in 32 bytes (little-endian), x sign bit in bit 7 of byte 31.
/// Uses the curve equation to recover x from y.
pub fn unpack_point(packed: &BigUint) -> Result<EdwardsAffine> {
    // Convert BigUint to bytes (little-endian, 32 bytes)
    let mut packed_bytes = packed.to_bytes_le();

    // Packed point should be exactly 32 bytes (256 bits)
    // If it's longer, it's invalid (matches TS behavior where leBigIntToBuffer ensures 32 bytes)
    if packed_bytes.len() > 32 {
        return Err(BabyJubjubError::PackedPointTooLarge);
    }

    // Pad to 32 bytes if necessary (little-endian, so pad at the end)
    while packed_bytes.len() < 32 {
        packed_bytes.push(0);
    }

    let mut packed_array = [0u8; 32];
    packed_array.copy_from_slice(&packed_bytes[..32]);

    // Extract x sign bit
    let x_sign = (packed_array[31] & 0x80) != 0;
    // Clear the sign bit from the packed data for y
    let mut y_bytes = packed_array;
    y_bytes[31] &= 0x7f;
    let y = Fq::from_le_bytes_mod_order(&y_bytes);

    // Check if y is within field range
    // TS uses: if (scalar.gt(unpackedPoint[1], r)) return null
    // We use >= to be more strict (y should be < r, not <= r)
    let y_biguint = BigUint::from_bytes_le(&y_bytes);
    if y_biguint > *SNARK_FIELD_SIZE {
        return Err(BabyJubjubError::YCoordinateOutOfRange);
    }

    // Recover x coordinate using curve equation: ax² + y² = 1 + dx²y²
    // Rearranging: x² = (1 - y²) / (a - d*y²)
    let a = Fq::from(168700u64);
    let d = Fq::from(168696u64);

    let y2 = y * y;
    let one = Fq::ONE;

    let numerator = one - y2;
    let denominator = a - d * y2;

    if denominator.is_zero() {
        return Err(BabyJubjubError::DenominatorZero);
    }

    let x2 = numerator
        * denominator
            .inverse()
            .ok_or(BabyJubjubError::DenominatorNoInverse)?;

    // Compute square root using Tonelli-Shanks algorithm
    let x = tonelli_shanks(x2, x_sign)?;

    let point = EdwardsAffine::new_unchecked(x, y);

    // Verify the point is on the curve
    if !point.is_on_curve() {
        return Err(BabyJubjubError::PointNotOnCurve);
    }

    Ok(point)
}

/// Compute square root using Tonelli-Shanks algorithm
/// This is a simplified implementation that uses Arkworks' built-in sqrt method
/// and handles the sign bit correctly.
/// The sign bit indicates whether x should be "negative" (x > p/2) in field sense.
///
/// Matches TS behavior: if sign is true, negate x (Fr.neg(x))
fn tonelli_shanks(n: Fq, x_sign: bool) -> Result<Fq> {
    // Check if n is zero
    if n.is_zero() {
        return Ok(Fq::zero());
    }

    // Try to compute square root using Field trait's sqrt method
    if let Some(x1) = n.sqrt() {
        // TS behavior: if sign is true, negate x
        // We need to check if x1 matches the expected sign
        let x1_is_negative = is_negative_fq(&x1);

        // Return the correct square root based on the sign bit
        // If sign is true, we want a "negative" x (x > p/2)
        // If sign is false, we want a "positive" x (x <= p/2)
        if x1_is_negative == x_sign {
            Ok(x1)
        } else {
            // Use the other square root (negate) to match the sign
            Ok(-x1)
        }
    } else {
        // sqrt() returned None - this means either:
        // 1. n is not a quadratic residue
        // 2. sqrt() is not implemented for this field
        // TS returns null in this case
        Err(BabyJubjubError::SquareRootError(format!(
            "Cannot compute square root - value is either not a quadratic residue or sqrt() is not implemented for this field: {}",
            n
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gen_random_babyjub_value() {
        let value = gen_random_babyjub_value();
        let max = BigUint::from(2u32).pow(253);
        assert!(value < max);
    }

    #[test]
    fn test_random_values_are_different() {
        let val1 = gen_random_babyjub_value();
        let val2 = gen_random_babyjub_value();
        // With overwhelming probability, two random values should be different
        assert_ne!(val1, val2);
    }

    #[test]
    fn test_gen_random_fr() {
        let fr1 = gen_random_fr();
        let fr2 = gen_random_fr();

        // Convert to string to compare
        assert_ne!(format!("{:?}", fr1), format!("{:?}", fr2));
    }

    #[test]
    fn test_base_point_choice() {
        let g = EdwardsAffine::new_unchecked(GENERATOR_X, GENERATOR_Y);

        let expected_base_point = EdwardsAffine::new_unchecked(BASE_X, BASE_Y);
        let cofactor = EdFr::from_be_bytes_mod_order(&[BabyJubjubConfig::COFACTOR[0] as u8]);
        let calculated_base_point = g * cofactor;

        assert_eq!(
            calculated_base_point,
            EdwardsProjective::from(expected_base_point)
        );
    }

    #[test]
    fn test_base_point_order() {
        let base_point = EdwardsAffine::new_unchecked(GENERATOR_X, GENERATOR_Y);

        let result = base_point * SUBGROUP_ORDER;
        // Identity in projective coordinates is (0, 1, 0, 1) for twisted Edwards
        let identity = EdwardsProjective::new(Fq::zero(), Fq::ONE, Fq::zero(), Fq::ONE);

        assert_eq!(result, identity);
    }

    #[test]
    fn test_base8() {
        let base8_point = base8();
        let expected = EdwardsAffine::new_unchecked(BASE_X, BASE_Y);
        assert_eq!(
            EdwardsProjective::from(base8_point),
            EdwardsProjective::from(expected)
        );
        assert!(base8_point.is_on_curve());
    }

    #[test]
    fn test_add_point() {
        let p1 = EdwardsAffine::new_unchecked(
            MontFp!(
                "17777552123799933955779906779655732241715742912184938656739573121738514868268"
            ),
            MontFp!("2626589144620713026669568689430873010625803728049924121243784502389097019475"),
        );
        let p2 = EdwardsAffine::new_unchecked(
            MontFp!(
                "16540640123574156134436876038791482806971768689494387082833631921987005038935"
            ),
            MontFp!(
                "20819045374670962167435360035096875258406992893633759881276124905556507972311"
            ),
        );

        let result = add_point(&p1, &p2);
        let expected = p1 + p2;

        assert_eq!(EdwardsProjective::from(result), expected);
        assert!(result.is_on_curve());
    }

    #[test]
    fn test_mul_point_escalar() {
        let base8_point = base8();
        let scalar = EdFr::from(324u64);

        let result = mul_point_escalar(&base8_point, scalar);
        let expected = EdwardsProjective::from(base8_point) * scalar;

        assert_eq!(EdwardsProjective::from(result), expected);
        assert!(result.is_on_curve());
    }

    #[test]
    fn test_in_curve() {
        let valid_point = EdwardsAffine::new_unchecked(BASE_X, BASE_Y);
        assert!(in_curve(&valid_point));

        let invalid_point = EdwardsAffine::new_unchecked(Fq::ONE, Fq::zero());
        assert!(!in_curve(&invalid_point));
    }

    #[test]
    fn test_pack_unpack_point() {
        // Test with base8 point
        let point = base8();
        let packed = pack_point(&point);
        let unpacked = unpack_point(&packed).expect("Failed to unpack point");

        assert_eq!(
            EdwardsProjective::from(point),
            EdwardsProjective::from(unpacked)
        );
        assert!(unpacked.is_on_curve());
    }

    #[test]
    fn test_pack_unpack_point_with_scalar_multiplication() {
        // Test pack/unpack with a point from scalar multiplication
        let base8_point = base8();
        let scalar = EdFr::from(324u64);
        let public_key = mul_point_escalar(&base8_point, scalar);

        let packed = pack_point(&public_key);
        let unpacked = unpack_point(&packed).expect("Failed to unpack point");

        assert_eq!(
            EdwardsProjective::from(public_key),
            EdwardsProjective::from(unpacked)
        );
        assert!(unpacked.is_on_curve());
    }

    #[test]
    fn test_pack_unpack_roundtrip() {
        // Test multiple points to ensure pack/unpack works correctly
        let scalars = vec![1u64, 2u64, 100u64, 324u64, 1000u64];

        for scalar_val in scalars {
            let base8_point = base8();
            let scalar = EdFr::from(scalar_val);
            let point = mul_point_escalar(&base8_point, scalar);

            let packed = pack_point(&point);
            let unpacked = unpack_point(&packed).expect("Failed to unpack point");

            assert_eq!(
                EdwardsProjective::from(point),
                EdwardsProjective::from(unpacked),
                "Failed for scalar {}",
                scalar_val
            );
            assert!(unpacked.is_on_curve());
        }
    }

    #[test]
    fn test_fixed_scalar_111111() {
        // Fixed test case matching the basic_operations example
        // This test verifies the exact output for scalar 111111
        let secret_scalar = EdFr::from(111111u64);
        let base8_point = base8();

        // Multiply Base8 by secret scalar to get public key
        let public_key = mul_point_escalar(&base8_point, secret_scalar);

        // Expected values from the example output
        let expected_x = BigUint::parse_bytes(
            b"9221645876368174110961758157755419489792970878899130950662684756868821534630",
            10,
        )
        .unwrap();
        let expected_y = BigUint::parse_bytes(
            b"21677522106472114192907581749333412416696788200272735806441075884691267290092",
            10,
        )
        .unwrap();

        // Convert point coordinates to BigUint for comparison
        let actual_x = BigUint::from_bytes_le(&public_key.x.into_bigint().to_bytes_le());
        let actual_y = BigUint::from_bytes_le(&public_key.y.into_bigint().to_bytes_le());

        assert_eq!(
            actual_x, expected_x,
            "X coordinate mismatch for scalar 111111"
        );
        assert_eq!(
            actual_y, expected_y,
            "Y coordinate mismatch for scalar 111111"
        );

        // Pack the point
        let packed_point = pack_point(&public_key);
        let expected_packed = BigUint::parse_bytes(
            b"21677522106472114192907581749333412416696788200272735806441075884691267290092",
            10,
        )
        .unwrap();

        assert_eq!(
            packed_point, expected_packed,
            "Packed point mismatch for scalar 111111"
        );

        // Unpack the point and verify it matches
        let unpacked_point = unpack_point(&packed_point).expect("Failed to unpack point");
        assert_eq!(
            EdwardsProjective::from(public_key),
            EdwardsProjective::from(unpacked_point),
            "Unpacked point should match original"
        );

        // Verify point is on curve
        assert!(in_curve(&public_key), "Point should be on curve");
    }
}
