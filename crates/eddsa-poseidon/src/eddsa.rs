use crate::types::{HashingAlgorithm, Signature};
use crate::utils::{hash_input, prune_buffer};
use ark_bn254::Fr as Bn254Fr;
use ark_ff::{BigInteger, PrimeField};
use baby_jubjub::{
    add_point, base8, in_curve, mul_point_escalar, pack_point, unpack_point, EdFr, EdwardsAffine,
};
use light_poseidon::{Poseidon, PoseidonHasher};
use num_bigint::BigUint;
use rand::Rng;

/// Convert BigUint to Bn254Fr (for Poseidon hashing)
fn biguint_to_bn254fr(value: &BigUint) -> Bn254Fr {
    let bytes = value.to_bytes_le();
    Bn254Fr::from_le_bytes_mod_order(&bytes)
}

/// Convert Bn254Fr to BigUint
fn bn254fr_to_biguint(value: &Bn254Fr) -> BigUint {
    let bytes = value.into_bigint().to_bytes_le();
    BigUint::from_bytes_le(&bytes)
}

/// Convert BigUint to EdFr (for curve operations)
fn biguint_to_edfr(value: &BigUint) -> EdFr {
    let bytes = value.to_bytes_le();
    EdFr::from_le_bytes_mod_order(&bytes)
}

/// Convert EdFr to BigUint
fn edfr_to_biguint(value: &EdFr) -> BigUint {
    let bytes = value.into_bigint().to_bytes_le();
    BigUint::from_bytes_le(&bytes)
}

/// Convert bytes to BigUint (little-endian)
fn bytes_to_biguint_le(bytes: &[u8]) -> BigUint {
    BigUint::from_bytes_le(bytes)
}

/// Convert BigUint to bytes (little-endian, padded to specified length)
fn biguint_to_bytes_le(value: &BigUint, len: usize) -> Vec<u8> {
    let mut bytes = value.to_bytes_le();
    bytes.resize(len, 0);
    bytes
}

/// Poseidon hash with 5 inputs
/// Matches TypeScript: poseidon5([R8.x, R8.y, A.x, A.y, message])
fn poseidon5(inputs: &[BigUint; 5]) -> Result<BigUint, String> {
    // Convert BigUint inputs to Bn254Fr for Poseidon
    let fr_inputs: Vec<Bn254Fr> = inputs.iter().map(biguint_to_bn254fr).collect();

    // Create Poseidon hasher with width 5 (for 5 inputs)
    let mut poseidon = Poseidon::<Bn254Fr>::new_circom(5)
        .map_err(|e| format!("Failed to create Poseidon hasher: {:?}", e))?;

    // Hash and convert back to BigUint
    let result_fr = poseidon
        .hash(&fr_inputs[..])
        .map_err(|e| format!("Poseidon hash failed: {:?}", e))?;

    Ok(bn254fr_to_biguint(&result_fr))
}

/// Get Baby Jubjub subgroup order as BigUint
fn subgroup_order_biguint() -> BigUint {
    // SUBGROUP_ORDER constant value
    BigUint::parse_bytes(
        b"2736030358979909402780800718157159386076813972158567259200215660948447373041",
        10,
    )
    .expect("Failed to parse subgroup order")
}

/// Derives a secret scalar from a given private key.
/// Direct translation of TypeScript deriveSecretScalar().
///
/// Process:
/// 1. hash(privateKey) -> 64 bytes
/// 2. Take first 32 bytes
/// 3. prune_buffer()
/// 4. Convert to BigUint (little-endian)
/// 5. Shift right by 3
/// 6. Modulo subgroup order
pub fn derive_secret_scalar(
    private_key: &[u8],
    algorithm: HashingAlgorithm,
) -> Result<BigUint, String> {
    // Hash the private key
    let hash = hash_input(private_key, algorithm);

    // Take first 32 bytes and prune
    let mut hash_slice = hash[..32].to_vec();
    prune_buffer(&mut hash_slice);

    // Convert to BigUint (little-endian)
    let s = bytes_to_biguint_le(&hash_slice);

    // Shift right by 3 and mod subOrder
    // TypeScript: scalar.shiftRight(leBufferToBigInt(hash), BigInt(3)) % subOrder
    let s_shifted = s >> 3;
    let sub_order = subgroup_order_biguint();

    Ok(s_shifted % sub_order)
}

/// Derives a public key from a given private key.
/// Direct translation of TypeScript derivePublicKey().
///
/// Process:
/// 1. Derive secret scalar from private key
/// 2. Multiply Base8 point by secret scalar
pub fn derive_public_key(
    private_key: &[u8],
    algorithm: HashingAlgorithm,
) -> Result<EdwardsAffine, String> {
    let s = derive_secret_scalar(private_key, algorithm)?;
    let s_fr = biguint_to_edfr(&s);

    let base8_point = base8();
    let public_key = mul_point_escalar(&base8_point, s_fr);

    Ok(public_key)
}

/// Signs a message using the provided private key.
/// Direct translation of TypeScript signMessage().
///
/// Process:
/// 1. hash = hash_input(privateKey)
/// 2. s = prune(hash[..32]) >> 3
/// 3. A = Base8 * s (public key)
/// 4. r = hash_input(hash[32..64] || message)
/// 5. R8 = Base8 * r
/// 6. h = poseidon5([R8.x, R8.y, A.x, A.y, message])
/// 7. S = r + h * s
pub fn sign_message(
    private_key: &[u8],
    message: &BigUint,
    algorithm: HashingAlgorithm,
) -> Result<Signature, String> {
    // Hash the private key
    let hash = hash_input(private_key, algorithm);

    // Derive secret scalar (pruned but NOT shifted yet)
    let mut s_buff = hash[..32].to_vec();
    prune_buffer(&mut s_buff);
    let s_original = bytes_to_biguint_le(&s_buff);

    // For public key computation: use shifted s
    let s_shifted = s_original.clone() >> 3;
    let s_shifted_fr = biguint_to_edfr(&s_shifted);

    // Compute public key A = Base8 * (s >> 3)
    let base8_point = base8();
    let a_point = mul_point_escalar(&base8_point, s_shifted_fr);

    // Prepare message buffer (32 bytes, little-endian)
    let msg_buff = biguint_to_bytes_le(message, 32);

    // Compute r = hash(hash[32..64] || message)
    let mut r_input = hash[32..64].to_vec();
    r_input.extend_from_slice(&msg_buff);
    let r_buff = hash_input(&r_input, algorithm);

    // Convert r to field element (with mod subOrder)
    let r_bigint = bytes_to_biguint_le(&r_buff);
    let sub_order = subgroup_order_biguint();
    let r_mod = r_bigint % &sub_order;
    let r_fr = biguint_to_edfr(&r_mod);

    // Compute R8 = Base8 * r
    let r8_point = mul_point_escalar(&base8_point, r_fr);

    // Extract coordinates as BigUint
    let r8_x = BigUint::from_bytes_le(&r8_point.x.into_bigint().to_bytes_le());
    let r8_y = BigUint::from_bytes_le(&r8_point.y.into_bigint().to_bytes_le());
    let a_x = BigUint::from_bytes_le(&a_point.x.into_bigint().to_bytes_le());
    let a_y = BigUint::from_bytes_le(&a_point.y.into_bigint().to_bytes_le());

    // Compute h = poseidon5([R8.x, R8.y, A.x, A.y, message])
    let hm = poseidon5(&[r8_x.clone(), r8_y.clone(), a_x, a_y, message.clone()])?;

    // For signature computation: use ORIGINAL (non-shifted) s
    // TypeScript: S = Fr.add(r, Fr.mul(hm, s))  where s is the original pruned value
    let s_original_fr = biguint_to_edfr(&s_original);

    // Compute S = r + h * s_original (in the scalar field)
    let hm_fr = biguint_to_edfr(&hm);
    let s_result = r_fr + (hm_fr * s_original_fr);
    let s_result_biguint = edfr_to_biguint(&s_result);

    Ok(Signature {
        r8: r8_point,
        s: s_result_biguint,
    })
}

/// Verifies an EdDSA signature.
/// Direct translation of TypeScript verifySignature().
///
/// Verification:
/// 1. Check R8 and pubKey are on curve
/// 2. Check S < subOrder
/// 3. h = poseidon5([R8.x, R8.y, pubKey.x, pubKey.y, message])
/// 4. Verify: Base8 * S == R8 + pubKey * (h * 8)
pub fn verify_signature(
    message: &BigUint,
    signature: &Signature,
    public_key: &EdwardsAffine,
) -> Result<bool, String> {
    // Check if points are on curve
    if !in_curve(&signature.r8) || !in_curve(public_key) {
        return Ok(false);
    }

    // Check if S < subOrder
    let sub_order = subgroup_order_biguint();
    if signature.s >= sub_order {
        return Ok(false);
    }

    // Extract coordinates as BigUint
    let r8_x = BigUint::from_bytes_le(&signature.r8.x.into_bigint().to_bytes_le());
    let r8_y = BigUint::from_bytes_le(&signature.r8.y.into_bigint().to_bytes_le());
    let pk_x = BigUint::from_bytes_le(&public_key.x.into_bigint().to_bytes_le());
    let pk_y = BigUint::from_bytes_le(&public_key.y.into_bigint().to_bytes_le());

    // Compute h = poseidon5([R8.x, R8.y, pubKey.x, pubKey.y, message])
    let hm = poseidon5(&[r8_x, r8_y, pk_x, pk_y, message.clone()])?;

    // Compute left side: Base8 * S
    let s_fr = biguint_to_edfr(&signature.s);
    let base8_point = base8();
    let p_left = mul_point_escalar(&base8_point, s_fr);

    // Compute right side: R8 + pubKey * (h * 8)
    let hm_fr = biguint_to_edfr(&hm);
    let eight_fr = EdFr::from(8u64);
    let h_times_8 = hm_fr * eight_fr;
    let p_right_1 = mul_point_escalar(public_key, h_times_8);
    let p_right = add_point(&signature.r8, &p_right_1);

    // Compare points
    Ok(p_left.x == p_right.x && p_left.y == p_right.y)
}

/// Packs a public key into a BigUint.
/// Uses maci-crypto's pack_point implementation.
pub fn pack_public_key(public_key: &EdwardsAffine) -> Result<BigUint, String> {
    if !in_curve(public_key) {
        return Err("Invalid public key: not on curve".to_string());
    }
    Ok(pack_point(public_key))
}

/// Unpacks a public key from a BigUint.
/// Uses maci-crypto's unpack_point implementation.
pub fn unpack_public_key(packed: &BigUint) -> Result<EdwardsAffine, String> {
    unpack_point(packed).map_err(|e| format!("Failed to unpack public key: {:?}", e))
}

/// Packs a signature into a 64-byte buffer.
/// Format: pack_point(R8) (32 bytes) || S (32 bytes, little-endian)
pub fn pack_signature(signature: &Signature) -> Result<Vec<u8>, String> {
    if !in_curve(&signature.r8) {
        return Err("Invalid signature: R8 not on curve".to_string());
    }

    let sub_order = subgroup_order_biguint();
    if signature.s >= sub_order {
        return Err("Invalid signature: S >= subOrder".to_string());
    }

    let packed_r8 = pack_point(&signature.r8);
    let packed_r8_bytes = biguint_to_bytes_le(&packed_r8, 32);
    let s_bytes = biguint_to_bytes_le(&signature.s, 32);

    let mut packed = Vec::with_capacity(64);
    packed.extend_from_slice(&packed_r8_bytes);
    packed.extend_from_slice(&s_bytes);

    Ok(packed)
}

/// Unpacks a signature from a 64-byte buffer.
/// Format: packed R8 (32 bytes) || S (32 bytes, little-endian)
pub fn unpack_signature(packed: &[u8]) -> Result<Signature, String> {
    if packed.len() != 64 {
        return Err("Packed signature must be 64 bytes".to_string());
    }

    let slice_r8 = &packed[..32];
    let slice_s = &packed[32..64];

    let packed_r8 = bytes_to_biguint_le(slice_r8);
    let r8 = unpack_point(&packed_r8).map_err(|e| format!("Failed to unpack R8 point: {:?}", e))?;

    let s = bytes_to_biguint_le(slice_s);

    Ok(Signature { r8, s })
}

/// EdDSAPoseidon struct - encapsulates key management and signing/verification.
/// Direct translation of TypeScript EdDSAPoseidon class.
pub struct EdDSAPoseidon {
    pub private_key: Vec<u8>,
    pub secret_scalar: BigUint,
    pub public_key: EdwardsAffine,
    pub packed_public_key: BigUint,
    algorithm: HashingAlgorithm,
}

impl EdDSAPoseidon {
    /// Creates a new EdDSAPoseidon instance.
    /// If private_key is None, generates a random 32-byte key.
    pub fn new(private_key: Option<Vec<u8>>, algorithm: HashingAlgorithm) -> Result<Self, String> {
        let priv_key = match private_key {
            Some(key) => key,
            None => {
                let mut rng = rand::thread_rng();
                let mut key = vec![0u8; 32];
                rng.fill(&mut key[..]);
                key
            }
        };

        let secret_scalar = derive_secret_scalar(&priv_key, algorithm)?;
        let public_key = derive_public_key(&priv_key, algorithm)?;
        let packed_public_key = pack_public_key(&public_key)?;

        Ok(EdDSAPoseidon {
            private_key: priv_key,
            secret_scalar,
            public_key,
            packed_public_key,
            algorithm,
        })
    }

    /// Signs a message using the private key.
    pub fn sign_message(&self, message: &BigUint) -> Result<Signature, String> {
        sign_message(&self.private_key, message, self.algorithm)
    }

    /// Verifies a signature against a message using the public key.
    pub fn verify_signature(
        &self,
        message: &BigUint,
        signature: &Signature,
    ) -> Result<bool, String> {
        verify_signature(message, signature, &self.public_key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_secret_scalar() {
        let private_key = b"test_private_key";
        let scalar = derive_secret_scalar(private_key, HashingAlgorithm::Blake512);
        assert!(scalar.is_ok());
    }

    #[test]
    fn test_derive_public_key() {
        let private_key = b"test_private_key";
        let pubkey = derive_public_key(private_key, HashingAlgorithm::Blake512);
        assert!(pubkey.is_ok());
        assert!(in_curve(&pubkey.unwrap()));
    }

    #[test]
    fn test_sign_and_verify() {
        let private_key = b"test_private_key";
        let message = BigUint::from(12345u64);

        let signature = sign_message(private_key, &message, HashingAlgorithm::Blake512).unwrap();
        let public_key = derive_public_key(private_key, HashingAlgorithm::Blake512).unwrap();

        let valid = verify_signature(&message, &signature, &public_key).unwrap();
        assert!(valid);
    }

    #[test]
    fn test_sign_and_verify_different_message() {
        let private_key = b"test_private_key";
        let message1 = BigUint::from(12345u64);
        let message2 = BigUint::from(54321u64);

        let signature = sign_message(private_key, &message1, HashingAlgorithm::Blake512).unwrap();
        let public_key = derive_public_key(private_key, HashingAlgorithm::Blake512).unwrap();

        let valid = verify_signature(&message2, &signature, &public_key).unwrap();
        assert!(!valid);
    }

    #[test]
    fn test_pack_unpack_signature() {
        let private_key = b"test_private_key";
        let message = BigUint::from(12345u64);

        let signature = sign_message(private_key, &message, HashingAlgorithm::Blake512).unwrap();
        let packed = pack_signature(&signature).unwrap();
        assert_eq!(packed.len(), 64);

        let unpacked = unpack_signature(&packed).unwrap();
        assert_eq!(
            baby_jubjub::EdwardsProjective::from(unpacked.r8),
            baby_jubjub::EdwardsProjective::from(signature.r8)
        );
        assert_eq!(unpacked.s, signature.s);
    }

    #[test]
    fn test_eddsa_poseidon_struct() {
        let eddsa =
            EdDSAPoseidon::new(Some(b"test_key".to_vec()), HashingAlgorithm::Blake512).unwrap();
        let message = BigUint::from(99999u64);

        let signature = eddsa.sign_message(&message).unwrap();
        let valid = eddsa.verify_signature(&message, &signature).unwrap();
        assert!(valid);
    }

    #[test]
    fn test_blake2b_algorithm() {
        let private_key = b"test_private_key";
        let message = BigUint::from(12345u64);

        let signature = sign_message(private_key, &message, HashingAlgorithm::Blake2b).unwrap();
        let public_key = derive_public_key(private_key, HashingAlgorithm::Blake2b).unwrap();

        let valid = verify_signature(&message, &signature, &public_key).unwrap();
        assert!(valid);
    }
}
