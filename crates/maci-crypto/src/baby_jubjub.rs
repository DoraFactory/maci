//! Baby Jubjub Curve Configuration
//!
//! This module provides Baby Jubjub curve configuration compatible with EIP-2494

use crate::constants::{biguint_to_fr, fr_to_biguint, SNARK_FIELD_SIZE};
use ark_bn254::Fr;
use ark_ec::{
    models::CurveConfig,
    twisted_edwards::{Affine, MontCurveConfig, Projective, TECurveConfig},
};
use ark_ed_on_bn254::{Fq, Fr as EdFr};
use ark_ff::{Field, MontFp};
use num_bigint::BigUint;
use rand::Rng;
use serde::{Deserialize, Serialize};

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

/// A point on the Baby Jubjub curve in the first group (G1)
/// Uses Arkworks types for production-grade curve operations
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct G1Point {
    pub x: BigUint,
    pub y: BigUint,
}

impl G1Point {
    /// Create a new G1Point with validation
    pub fn new(x: BigUint, y: BigUint) -> Result<Self, String> {
        if x >= *SNARK_FIELD_SIZE {
            return Err(format!("G1Point x out of range: {}", x));
        }
        if y >= *SNARK_FIELD_SIZE {
            return Err(format!("G1Point y out of range: {}", y));
        }
        Ok(Self { x, y })
    }

    /// Check if two points are equal
    pub fn equals(&self, other: &G1Point) -> bool {
        self.x == other.x && self.y == other.y
    }

    /// Convert to contract parameters (string representation)
    pub fn as_contract_param(&self) -> (String, String) {
        (self.x.to_string(), self.y.to_string())
    }

    /// Convert to Arkworks Fr coordinates
    pub fn to_fr_coords(&self) -> (Fr, Fr) {
        (biguint_to_fr(&self.x), biguint_to_fr(&self.y))
    }

    /// Create from Arkworks Fr coordinates
    pub fn from_fr_coords(x: Fr, y: Fr) -> Self {
        Self {
            x: fr_to_biguint(&x),
            y: fr_to_biguint(&y),
        }
    }
}

/// A point on the Baby Jubjub curve in the second group (G2)
/// This is typically used for extension field operations
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct G2Point {
    pub x: [BigUint; 2],
    pub y: [BigUint; 2],
}

impl G2Point {
    /// Create a new G2Point with validation
    pub fn new(x: [BigUint; 2], y: [BigUint; 2]) -> Result<Self, String> {
        for (i, val) in x.iter().enumerate() {
            if val >= &*SNARK_FIELD_SIZE {
                return Err(format!("G2Point x[{}] out of range", i));
            }
        }
        for (i, val) in y.iter().enumerate() {
            if val >= &*SNARK_FIELD_SIZE {
                return Err(format!("G2Point y[{}] out of range", i));
            }
        }
        Ok(Self { x, y })
    }

    /// Check if two points are equal
    pub fn equals(&self, other: &G2Point) -> bool {
        self.x[0] == other.x[0]
            && self.x[1] == other.x[1]
            && self.y[0] == other.y[0]
            && self.y[1] == other.y[1]
    }

    /// Convert to contract parameters (string representation)
    pub fn as_contract_param(&self) -> ([String; 2], [String; 2]) {
        (
            [self.x[0].to_string(), self.x[1].to_string()],
            [self.y[0].to_string(), self.y[1].to_string()],
        )
    }
}

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
    let modulo = BigUint::from(2u32).pow(253);
    &rand_val % &modulo
}

/// Generate a random field element using Arkworks
pub fn gen_random_fr() -> Fr {
    let value = gen_random_babyjub_value();
    biguint_to_fr(&value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_g1_point_creation() {
        let x = BigUint::from(100u64);
        let y = BigUint::from(200u64);
        let point = G1Point::new(x.clone(), y.clone()).unwrap();
        assert_eq!(point.x, x);
        assert_eq!(point.y, y);
    }

    #[test]
    fn test_g1_point_validation() {
        let x = SNARK_FIELD_SIZE.clone();
        let y = BigUint::from(200u64);
        let result = G1Point::new(x, y);
        assert!(result.is_err());
    }

    #[test]
    fn test_g1_point_equals() {
        let point1 = G1Point::new(BigUint::from(100u64), BigUint::from(200u64)).unwrap();
        let point2 = G1Point::new(BigUint::from(100u64), BigUint::from(200u64)).unwrap();
        let point3 = G1Point::new(BigUint::from(100u64), BigUint::from(300u64)).unwrap();

        assert!(point1.equals(&point2));
        assert!(!point1.equals(&point3));
    }

    #[test]
    fn test_g1_point_fr_conversion() {
        let x = BigUint::from(123u64);
        let y = BigUint::from(456u64);
        let point = G1Point::new(x.clone(), y.clone()).unwrap();

        let (fr_x, fr_y) = point.to_fr_coords();
        let recovered = G1Point::from_fr_coords(fr_x, fr_y);

        assert_eq!(recovered.x, x);
        assert_eq!(recovered.y, y);
    }

    #[test]
    fn test_g2_point_creation() {
        let x = [BigUint::from(100u64), BigUint::from(200u64)];
        let y = [BigUint::from(300u64), BigUint::from(400u64)];
        let point = G2Point::new(x.clone(), y.clone()).unwrap();
        assert_eq!(point.x[0], BigUint::from(100u64));
        assert_eq!(point.y[1], BigUint::from(400u64));
    }

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
    fn test_g1_point_as_contract_param() {
        let point = G1Point::new(BigUint::from(100u64), BigUint::from(200u64)).unwrap();
        let (x_str, y_str) = point.as_contract_param();
        assert_eq!(x_str, "100");
        assert_eq!(y_str, "200");
    }

    // Tests for BabyJubjubConfig
    use ark_ec::CurveGroup;
    use ark_ff::{PrimeField, Zero};

    #[test]
    fn test_base_point_choice() {
        let g = EdwardsAffine::new_unchecked(GENERATOR_X, GENERATOR_Y);

        let expected_base_point = EdwardsAffine::new_unchecked(BASE_X, BASE_Y);
        let cofactor = EdFr::from_be_bytes_mod_order(&[BabyJubjubConfig::COFACTOR[0] as u8]);
        let calculated_base_point = (g * cofactor).into_affine();

        assert_eq!(calculated_base_point, expected_base_point);
    }

    #[test]
    fn test_base_point_order() {
        let base_point = EdwardsAffine::new_unchecked(GENERATOR_X, GENERATOR_Y);

        let result = (base_point * SUBGROUP_ORDER).into_affine();
        let identity = EdwardsAffine::new_unchecked(Fq::zero(), Fq::ONE);

        assert_eq!(result, identity);
    }
}
