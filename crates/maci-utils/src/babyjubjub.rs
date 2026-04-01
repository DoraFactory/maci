use crate::conversions::uint256_from_hex_string;
use cosmwasm_std::{Uint256, Uint512};

/// BabyJubJub base field modulus = BN254 scalar field r
/// p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
const BABYJUB_FIELD_HEX: &str =
    "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001";

/// Twisted Edwards curve parameter a = 168700
const BABYJUB_A: u128 = 168700;
/// Twisted Edwards curve parameter d = 168696
const BABYJUB_D: u128 = 168696;

/// Compute (a * b) mod m using Uint512 as intermediate to prevent overflow.
/// Both a and b must be < m < 2^256.
#[inline]
fn mulmod(a: Uint256, b: Uint256, m: Uint256) -> Uint256 {
    let product: Uint512 = a.full_mul(b);
    let m512 = Uint512::from(m);
    // Safe unwrap: result = product % m < m < 2^256, always fits in Uint256
    Uint256::try_from(product % m512).unwrap()
}

/// Compute (a + b) mod m.
/// Both a and b must be < m < 2^256, so their sum fits in Uint512.
#[inline]
fn addmod(a: Uint256, b: Uint256, m: Uint256) -> Uint256 {
    let sum = Uint512::from(a) + Uint512::from(b);
    let m512 = Uint512::from(m);
    Uint256::try_from(sum % m512).unwrap()
}

/// Check whether (x, y) is a valid point on the BabyJubJub curve.
///
/// BabyJubJub is the Twisted Edwards curve defined over the BN254 scalar field:
///   a·x² + y² = 1 + d·x²·y²  (mod p)
/// where a = 168700, d = 168696,
///   p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
///
/// This function checks:
/// 1. Both coordinates are within the base field [0, p).
/// 2. The identity point (0, 1) is rejected.
/// 3. The point satisfies the curve equation.
///
/// Note: subgroup membership (cofactor-8 check) is not verified here because
/// it requires a scalar multiplication and is enforced by the ZK circuit instead.
pub fn is_on_babyjubjub_curve(x: Uint256, y: Uint256) -> bool {
    let p = uint256_from_hex_string(BABYJUB_FIELD_HEX);

    // Coordinates must be in [0, p)
    if x >= p || y >= p {
        return false;
    }

    // Reject the identity point (0, 1) and the order-2 point (0, p-1).
    // Both satisfy the curve equation but are low-order points unsuitable as public keys.
    if x == Uint256::zero() {
        return false;
    }

    let a = Uint256::from_u128(BABYJUB_A);
    let d = Uint256::from_u128(BABYJUB_D);

    // x2 = x^2 mod p
    let x2 = mulmod(x, x, p);
    // y2 = y^2 mod p
    let y2 = mulmod(y, y, p);

    // left = a*x2 + y2 mod p
    let ax2 = mulmod(a, x2, p);
    let left = addmod(ax2, y2, p);

    // x2y2 = x2 * y2 mod p
    let x2y2 = mulmod(x2, y2, p);
    // right = 1 + d*x2y2 mod p
    let dx2y2 = mulmod(d, x2y2, p);
    let right = addmod(Uint256::one(), dx2y2, p);

    left == right
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    // Base8 point coordinates sourced from baby-jubjub crate constants (BASE_X, BASE_Y)
    fn base8() -> (Uint256, Uint256) {
        (
            Uint256::from_str(
                "5299619240641551281634865583518297030282874472190772894086521144482721001553",
            )
            .unwrap(),
            Uint256::from_str(
                "16950150798460657717958625567821834550301663161624707787222815936182638968203",
            )
            .unwrap(),
        )
    }

    // A second known-valid point: pubkey for scalar 111111 (from baby-jubjub crate test vectors)
    fn scalar_111111_pubkey() -> (Uint256, Uint256) {
        (
            Uint256::from_str(
                "9221645876368174110961758157755419489792970878899130950662684756868821534630",
            )
            .unwrap(),
            Uint256::from_str(
                "21677522106472114192907581749333412416696788200272735806441075884691267290092",
            )
            .unwrap(),
        )
    }

    // Real keypairs derived by the SDK (@zk-kit/eddsa-poseidon derivePublicKey).
    // Sourced from contracts/amaci/src/test/user_pubkey.json, used in contract integration tests.
    // These are the authoritative cross-layer anchors: if the curve parameters or arithmetic
    // ever diverge from the SDK, these tests will catch it.
    fn sdk_user_pubkeys() -> [(Uint256, Uint256); 2] {
        [
            (
                Uint256::from_str(
                    "8446677751716569713622015905729882243875224951572887602730835165068040887285",
                )
                .unwrap(),
                Uint256::from_str(
                    "12484654491029393893324568717198080229359788322121893494118068510674758553628",
                )
                .unwrap(),
            ),
            (
                Uint256::from_str(
                    "4934845797881523927654842245387640257368309434525961062601274110069416343731",
                )
                .unwrap(),
                Uint256::from_str(
                    "7218132018004361008636029786293016526331813670637191622129869640055131468762",
                )
                .unwrap(),
            ),
        ]
    }

    #[test]
    fn test_base8_is_on_curve() {
        let (x, y) = base8();
        assert!(is_on_babyjubjub_curve(x, y));
    }

    #[test]
    fn test_known_pubkey_is_on_curve() {
        let (x, y) = scalar_111111_pubkey();
        assert!(is_on_babyjubjub_curve(x, y));
    }

    /// Cross-layer anchor test: verifies that real pubkeys generated by the SDK
    /// (@zk-kit/eddsa-poseidon) pass our contract-side curve check.
    /// These vectors are also used in the contract integration tests (user_pubkey.json).
    #[test]
    fn test_sdk_generated_pubkeys_are_on_curve() {
        for (i, (x, y)) in sdk_user_pubkeys().iter().enumerate() {
            assert!(
                is_on_babyjubjub_curve(*x, *y),
                "SDK pubkey[{}] failed curve check",
                i
            );
        }
    }

    #[test]
    fn test_identity_is_rejected() {
        // (0, 1) is the Twisted Edwards identity — satisfies the curve equation but is a
        // low-order point (order 1) and must be rejected as a public key.
        assert!(!is_on_babyjubjub_curve(Uint256::zero(), Uint256::one()));
    }

    #[test]
    fn test_order2_point_is_rejected() {
        // (0, p-1) is the unique order-2 point on BabyJubJub — satisfies the curve equation
        // ((-1)^2 = 1 mod p) but is a low-order point and must be rejected.
        let p = uint256_from_hex_string(BABYJUB_FIELD_HEX);
        let y = p - Uint256::one();
        assert!(!is_on_babyjubjub_curve(Uint256::zero(), y));
    }

    #[test]
    fn test_zero_zero_not_on_curve() {
        // left = 0 + 0 = 0, right = 1 + 0 = 1 → 0 ≠ 1
        assert!(!is_on_babyjubjub_curve(Uint256::zero(), Uint256::zero()));
    }

    #[test]
    fn test_arbitrary_invalid_point() {
        assert!(!is_on_babyjubjub_curve(
            Uint256::from_u128(100),
            Uint256::from_u128(200)
        ));
    }

    #[test]
    fn test_out_of_field_rejected() {
        let p = uint256_from_hex_string(BABYJUB_FIELD_HEX);
        assert!(!is_on_babyjubjub_curve(p, Uint256::one()));
        assert!(!is_on_babyjubjub_curve(Uint256::one(), p));
    }
}
