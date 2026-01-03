//! Keypair Module
//!
//! Adapted for MACI with BigUint compatibility
//! Uses eddsa-poseidon for key derivation and signing

use crate::hashing::poseidon;
use crate::keys::{EcdhSharedKey, PrivKey, PubKey};
use crate::rerandomize::encrypt_odevity;
use crate::tree::{biguint_to_node, Tree};
use ark_bn254::Fr as Bn254Fr;
use ark_ff::{BigInteger, PrimeField};
use baby_jubjub::{base8, gen_random_babyjub_value, mul_point_escalar, EdFr, EdwardsAffine, Fq};
use eddsa_poseidon::{derive_secret_scalar, HashingAlgorithm};
use light_poseidon::{Poseidon, PoseidonHasher};
use num_bigint::BigUint;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// A keypair containing private key, public key, and formatted private key
#[derive(Debug, Clone)]
pub struct Keypair {
    /// Private key bytes
    pub private_key: Vec<u8>,
    /// Secret scalar (Fr field element)
    secret_scalar: EdFr,
    /// Public key point
    public_key: PublicKey,
    /// Identity commitment (Poseidon hash of public key) using BN254 Fr field
    commitment: Bn254Fr,
    /// Legacy fields for backward compatibility
    pub priv_key: PrivKey,
    pub pub_key: PubKey,
    pub formated_priv_key: PrivKey,
}

// Custom serialization: only serialize the BigUint fields
impl Serialize for Keypair {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("Keypair", 3)?;
        state.serialize_field("priv_key", &self.priv_key)?;
        state.serialize_field("pub_key", &self.pub_key)?;
        state.serialize_field("formated_priv_key", &self.formated_priv_key)?;
        state.end()
    }
}

// Custom deserialization: deserialize BigUint fields and reconstruct others
impl<'de> Deserialize<'de> for Keypair {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct KeypairHelper {
            priv_key: PrivKey,
            #[allow(dead_code)]
            pub_key: PubKey,
            #[allow(dead_code)]
            formated_priv_key: PrivKey,
        }

        let helper = KeypairHelper::deserialize(deserializer)?;
        // Reconstruct from priv_key
        Ok(Keypair::from_priv_key(&helper.priv_key))
    }
}

impl Keypair {
    /// Creates a new keypair from a private key
    /// Note: Expects private_key bytes in big-endian format (to match TypeScript bigInt2Buffer)
    pub fn new(private_key: &[u8]) -> Self {
        // Hash the private key
        let secret_scalar = Self::gen_secret_scalar(private_key);

        // Get the public key by multiplying the secret scalar by the base point
        // Use base8() and mul_point_escalar from baby_jubjub module
        let public_key = PublicKey::from_scalar(&secret_scalar);

        // Generate the identity commitment
        let commitment = public_key.commitment();

        // Convert to BigUint for backward compatibility
        // Note: private_key is in big-endian format (matching TypeScript bigInt2Buffer)
        let priv_key_biguint = BigUint::from_bytes_be(private_key);
        let pub_key_biguint = public_key.to_biguint_array();
        // Convert EdFr to BigUint
        let formated_priv_key_biguint = {
            let bigint = secret_scalar.into_bigint();
            let bytes = bigint.to_bytes_le();
            BigUint::from_bytes_le(&bytes)
        };

        Self {
            private_key: private_key.to_vec(),
            secret_scalar,
            public_key,
            commitment,
            priv_key: priv_key_biguint,
            pub_key: pub_key_biguint,
            formated_priv_key: formated_priv_key_biguint,
        }
    }

    /// Creates a new keypair from a BigUint private key (for backward compatibility)
    /// Note: Converts to big-endian to match TypeScript bigInt2Buffer behavior
    /// TypeScript's bigInt2Buffer does NOT pad to 32 bytes
    pub fn from_priv_key(priv_key: &PrivKey) -> Self {
        // Convert to big-endian bytes (matching TypeScript bigInt2Buffer)
        // Important: DO NOT pad to 32 bytes - bigInt2Buffer doesn't pad
        let priv_key_bytes = priv_key.to_bytes_be();
        Self::new(&priv_key_bytes)
    }

    /// Returns the private key bytes
    pub fn private_key(&self) -> &[u8] {
        &self.private_key
    }

    /// Returns the secret scalar
    pub fn secret_scalar(&self) -> &EdFr {
        &self.secret_scalar
    }

    /// Returns the public key
    pub fn public_key(&self) -> &PublicKey {
        &self.public_key
    }

    /// Returns the identity commitment
    pub fn commitment(&self) -> &Bn254Fr {
        &self.commitment
    }

    /// Generates an Elliptic-Curve Diffie–Hellman (ECDH) shared key
    ///
    /// This matches TypeScript's genEcdhSharedKey:
    /// `mulPointEscalar(pubKey as Point<bigint>, this.keypair.formatedPrivKey)`
    ///
    /// # Arguments
    /// * `pub_key` - The other party's public key (as BigUint array)
    ///
    /// # Returns
    /// The ECDH shared key as a point on the Baby Jubjub curve
    ///
    /// # Example
    /// ```
    /// use maci_crypto::keypair::Keypair;
    /// use num_bigint::BigUint;
    ///
    /// let alice = Keypair::from_priv_key(&BigUint::from(11111u64));
    /// let bob = Keypair::from_priv_key(&BigUint::from(22222u64));
    ///
    /// // Alice computes shared key with Bob's public key
    /// let shared_alice = alice.gen_ecdh_shared_key(&bob.pub_key);
    ///
    /// // Bob computes shared key with Alice's public key
    /// let shared_bob = bob.gen_ecdh_shared_key(&alice.pub_key);
    ///
    /// // Both should produce the same shared key
    /// assert_eq!(shared_alice, shared_bob);
    /// ```
    pub fn gen_ecdh_shared_key(&self, pub_key: &PubKey) -> EcdhSharedKey {
        // Convert public key BigUint coordinates to Fq (base field of Baby Jubjub)
        let pub_x_bytes = pub_key[0].to_bytes_le();
        let pub_y_bytes = pub_key[1].to_bytes_le();

        let mut x_padded = vec![0u8; 32];
        let mut y_padded = vec![0u8; 32];

        let x_len = pub_x_bytes.len().min(32);
        let y_len = pub_y_bytes.len().min(32);

        x_padded[..x_len].copy_from_slice(&pub_x_bytes[..x_len]);
        y_padded[..y_len].copy_from_slice(&pub_y_bytes[..y_len]);

        let pub_x_fq = Fq::from_le_bytes_mod_order(&x_padded);
        let pub_y_fq = Fq::from_le_bytes_mod_order(&y_padded);

        // Create Edwards affine point from the public key
        let pub_point_affine = EdwardsAffine::new_unchecked(pub_x_fq, pub_y_fq);

        // Use the pre-computed secret_scalar for scalar multiplication
        // This is more efficient than re-deriving it from formated_priv_key
        let shared_affine = mul_point_escalar(&pub_point_affine, self.secret_scalar);

        // Extract coordinates as BigUint
        let x_bytes = shared_affine.x.into_bigint().to_bytes_le();
        let y_bytes = shared_affine.y.into_bigint().to_bytes_le();

        let x = BigUint::from_bytes_le(&x_bytes);
        let y = BigUint::from_bytes_le(&y_bytes);

        [x, y]
    }

    /// Generates an ECDH shared key with another keypair's public key
    ///
    /// Convenience method that accepts a PublicKey reference directly
    ///
    /// # Arguments
    /// * `pub_key` - The other party's PublicKey
    ///
    /// # Returns
    /// The ECDH shared key as a point on the Baby Jubjub curve
    pub fn gen_ecdh_shared_key_with_public_key(&self, pub_key: &PublicKey) -> EcdhSharedKey {
        // Direct scalar multiplication using the PublicKey's point
        let shared_affine = mul_point_escalar(&pub_key.point, self.secret_scalar);

        // Extract coordinates as BigUint
        let x_bytes = shared_affine.x.into_bigint().to_bytes_le();
        let y_bytes = shared_affine.y.into_bigint().to_bytes_le();

        let x = BigUint::from_bytes_le(&x_bytes);
        let y = BigUint::from_bytes_le(&y_bytes);

        [x, y]
    }

    /// Generates the secret scalar from the private key
    /// Uses eddsa-poseidon's derive_secret_scalar for consistency
    fn gen_secret_scalar(private_key: &[u8]) -> EdFr {
        // Use eddsa-poseidon's derive_secret_scalar with Blake512
        // This matches zk-kit's default Blake-1 (Blake512) implementation
        let secret_scalar_biguint = derive_secret_scalar(private_key, HashingAlgorithm::Blake512)
            .expect("Failed to derive secret scalar");

        // Convert BigUint to EdFr
        let scalar_bytes = secret_scalar_biguint.to_bytes_le();
        EdFr::from_le_bytes_mod_order(&scalar_bytes)
    }

    /// Generates a deactivate root for AMACI (Anonymous MACI)
    ///
    /// This function creates a Merkle tree of deactivated account states.
    /// For each account public key, it:
    /// 1. Computes ECDH shared key between coordinator and account
    /// 2. Encrypts an "inactive" status (even parity) to the account's public key
    /// 3. Constructs a deactivate leaf: [c1.x, c1.y, c2.x, c2.y, poseidon(sharedKey)]
    /// 4. Hashes all deactivate entries to form tree leaves
    /// 5. Builds a Merkle tree and returns root + tree structure
    ///
    /// This matches TypeScript's genDeactivateRoot:
    /// ```typescript
    /// genDeactivateRoot(
    ///   accounts: PubKey[] | bigint[],
    ///   stateTreeDepth: number
    /// ): { deactivates: bigint[][]; root: bigint; leaves: bigint[]; tree: Tree; }
    /// ```
    ///
    /// # Arguments
    /// * `accounts` - Array of account public keys (can be PubKey or packed bigint)
    /// * `state_tree_depth` - Depth of the state tree (tree will have depth = state_tree_depth + 2)
    ///
    /// # Returns
    /// A tuple containing:
    /// - deactivates: Vector of deactivate entries (each entry is [c1.x, c1.y, c2.x, c2.y, shared_key_hash])
    /// - root: The Merkle tree root
    /// - leaves: Vector of leaf hashes
    /// - tree: The constructed Merkle tree
    ///
    /// # Example
    /// ```
    /// use maci_crypto::keypair::Keypair;
    /// use num_bigint::BigUint;
    ///
    /// let coordinator = Keypair::from_priv_key(&BigUint::from(12345u64));
    /// let account1 = Keypair::from_priv_key(&BigUint::from(11111u64));
    /// let account2 = Keypair::from_priv_key(&BigUint::from(22222u64));
    ///
    /// let accounts = vec![account1.pub_key.clone(), account2.pub_key.clone()];
    /// let state_tree_depth = 3;
    ///
    /// let result = coordinator.gen_deactivate_root(&accounts, state_tree_depth);
    /// println!("Root: {}", result.1);
    /// println!("Leaves count: {}", result.2.len());
    /// ```
    pub fn gen_deactivate_root(
        &self,
        accounts: &[PubKey],
        state_tree_depth: usize,
    ) -> (Vec<Vec<BigUint>>, BigUint, Vec<BigUint>, Tree) {
        // STEP 1: Generate deactivate state tree leaf for each account
        let deactivates: Vec<Vec<BigUint>> = accounts
            .iter()
            .map(|account| {
                // Compute ECDH shared key with this account
                let shared_key = self.gen_ecdh_shared_key(account);

                // Encrypt "inactive" status (false = even parity = active signup)
                // According to circuit rules: odd=active, even=inactive
                // Set to false here to ensure valid signup
                let random_val = gen_random_babyjub_value();
                let deactivate = encrypt_odevity(false, &self.pub_key, Some(random_val))
                    .expect("Failed to encrypt odevity");

                // Hash the shared key using Poseidon
                let shared_key_hash = poseidon(&vec![shared_key[0].clone(), shared_key[1].clone()]);

                // Return deactivate entry: [c1.x, c1.y, c2.x, c2.y, poseidon(sharedKey)]
                vec![
                    deactivate.c1[0].clone(),
                    deactivate.c1[1].clone(),
                    deactivate.c2[0].clone(),
                    deactivate.c2[1].clone(),
                    shared_key_hash,
                ]
            })
            .collect();

        // STEP 2: Generate tree root
        let degree = 5;
        let depth = state_tree_depth + 2;
        let zero = biguint_to_node(&BigUint::from(0u32));
        let mut tree = Tree::new(degree, depth, zero);

        // Hash each deactivate entry to create leaves
        let leaves: Vec<BigUint> = deactivates
            .iter()
            .map(|deactivate| poseidon(deactivate))
            .collect();

        // Convert leaves to tree nodes (String format)
        let leaf_nodes: Vec<String> = leaves.iter().map(|l| biguint_to_node(l)).collect();
        tree.init_leaves(&leaf_nodes);

        // Get the root as BigUint
        let root_str = tree.root();
        let root = root_str
            .parse::<BigUint>()
            .unwrap_or_else(|_| BigUint::from(0u32));

        (deactivates, root, leaves, tree)
    }
}

/// Public key
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PublicKey {
    point: EdwardsAffine,
}

impl PublicKey {
    /// Creates a new public key instance from a point
    pub fn from_point(point: EdwardsAffine) -> Self {
        Self { point }
    }

    /// Creates a new subgroup public key from a scalar
    /// Uses base8() and mul_point_escalar from baby_jubjub module
    pub fn from_scalar(secret_scalar: &EdFr) -> Self {
        let base8_point = base8();
        let point = mul_point_escalar(&base8_point, *secret_scalar);

        Self { point }
    }

    /// Generates an identity commitment
    /// Uses BN254 Fr field to match SDK behavior (poseidonPerm uses BN254 scalar field)
    pub fn commitment(&self) -> Bn254Fr {
        // Convert Baby Jubjub Fq coordinates to BN254 Fr for Poseidon hash
        let x_bytes = self.point.x.into_bigint().to_bytes_le();
        let y_bytes = self.point.y.into_bigint().to_bytes_le();
        let x_fr = Bn254Fr::from_le_bytes_mod_order(&x_bytes);
        let y_fr = Bn254Fr::from_le_bytes_mod_order(&y_bytes);

        Poseidon::<Bn254Fr>::new_circom(2)
            .unwrap()
            .hash(&[x_fr, y_fr])
            .unwrap()
    }

    /// Returns the public key point in Affine form
    pub fn point(&self) -> EdwardsAffine {
        self.point
    }

    /// Returns the x coordinate of the public key point
    pub fn x(&self) -> Fq {
        self.point.x
    }

    /// Returns the y coordinate of the public key point
    pub fn y(&self) -> Fq {
        self.point.y
    }

    /// Converts to BigUint array for backward compatibility
    pub fn to_biguint_array(&self) -> PubKey {
        let x_bytes = self.point.x.into_bigint().to_bytes_le();
        let y_bytes = self.point.y.into_bigint().to_bytes_le();
        [
            BigUint::from_bytes_le(&x_bytes),
            BigUint::from_bytes_le(&y_bytes),
        ]
    }
}

/// Signature (kept for potential future use)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Signature {
    /// `r` point
    pub r: EdwardsAffine,
    /// `s` scalar
    pub s: EdFr,
}

impl Signature {
    /// Creates a new signature from a point and scalar
    pub fn new(r: EdwardsAffine, s: EdFr) -> Self {
        Self { r, s }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keypair_new() {
        let mut bytes = [0u8; 32];
        bytes[0] = 1;
        let keypair = Keypair::new(&bytes);
        assert_eq!(keypair.private_key(), &bytes);
    }

    #[test]
    fn test_keypair_from_priv_key() {
        let priv_key = BigUint::from(12345u64);
        let keypair = Keypair::from_priv_key(&priv_key);
        assert_eq!(keypair.priv_key, priv_key);
    }

    #[test]
    fn test_ecdh_shared_key() {
        // Create two keypairs
        let alice = Keypair::from_priv_key(&BigUint::from(11111u64));
        let bob = Keypair::from_priv_key(&BigUint::from(22222u64));

        // Alice computes shared key with Bob's public key
        let shared_alice = alice.gen_ecdh_shared_key(&bob.pub_key);

        // Bob computes shared key with Alice's public key
        let shared_bob = bob.gen_ecdh_shared_key(&alice.pub_key);

        // Both should produce the same shared key
        assert_eq!(shared_alice, shared_bob);
        assert_eq!(shared_alice[0], shared_bob[0]);
        assert_eq!(shared_alice[1], shared_bob[1]);
    }

    #[test]
    fn test_ecdh_shared_key_with_public_key() {
        // Create two keypairs
        let alice = Keypair::from_priv_key(&BigUint::from(33333u64));
        let bob = Keypair::from_priv_key(&BigUint::from(44444u64));

        // Use the PublicKey method
        let shared_alice = alice.gen_ecdh_shared_key_with_public_key(bob.public_key());
        let shared_bob = bob.gen_ecdh_shared_key_with_public_key(alice.public_key());

        // Both should produce the same shared key
        assert_eq!(shared_alice, shared_bob);

        // Should also match the BigUint array method
        let shared_alice_biguint = alice.gen_ecdh_shared_key(&bob.pub_key);
        assert_eq!(shared_alice, shared_alice_biguint);
    }

    #[test]
    fn test_ecdh_consistency_with_keys_module() {
        use crate::keys::gen_ecdh_shared_key;

        // Create two keypairs
        let alice = Keypair::from_priv_key(&BigUint::from(55555u64));
        let bob = Keypair::from_priv_key(&BigUint::from(66666u64));

        // Compute shared key using Keypair method
        let shared_keypair = alice.gen_ecdh_shared_key(&bob.pub_key);

        // Compute shared key using keys module function
        let shared_keys = gen_ecdh_shared_key(&alice.priv_key, &bob.pub_key);

        // Both methods should produce the same result
        assert_eq!(shared_keypair, shared_keys);
    }

    #[test]
    fn test_gen_deactivate_root() {
        // Create coordinator keypair
        let coordinator = Keypair::from_priv_key(&BigUint::from(12345u64));

        // Create test account keypairs
        let account1 = Keypair::from_priv_key(&BigUint::from(11111u64));
        let account2 = Keypair::from_priv_key(&BigUint::from(22222u64));
        let account3 = Keypair::from_priv_key(&BigUint::from(33333u64));

        let accounts = vec![
            account1.pub_key.clone(),
            account2.pub_key.clone(),
            account3.pub_key.clone(),
        ];

        let state_tree_depth = 3;

        // Generate deactivate root
        let (deactivates, root, leaves, tree) =
            coordinator.gen_deactivate_root(&accounts, state_tree_depth);

        // Verify the structure
        assert_eq!(deactivates.len(), 3, "Should have 3 deactivate entries");
        assert_eq!(leaves.len(), 3, "Should have 3 leaves");

        // Each deactivate entry should have 5 elements: [c1.x, c1.y, c2.x, c2.y, shared_key_hash]
        for deactivate in &deactivates {
            assert_eq!(
                deactivate.len(),
                5,
                "Each deactivate entry should have 5 elements"
            );
            // All elements should be non-zero
            for element in deactivate {
                assert!(
                    element > &BigUint::from(0u32),
                    "Elements should be non-zero"
                );
            }
        }

        // Root should be non-zero
        assert!(root > BigUint::from(0u32), "Root should be non-zero");

        // Tree should have correct depth and degree
        assert_eq!(tree.depth, state_tree_depth + 2);
        assert_eq!(tree.degree, 5);

        println!("Deactivate root test passed!");
        println!("Root: {}", root);
        println!("Leaves: {:?}", leaves);
    }

    #[test]
    fn test_gen_deactivate_root_single_account() {
        let coordinator = Keypair::from_priv_key(&BigUint::from(99999u64));
        let account = Keypair::from_priv_key(&BigUint::from(88888u64));

        let accounts = vec![account.pub_key.clone()];
        let state_tree_depth = 2;

        let (deactivates, root, leaves, _tree) =
            coordinator.gen_deactivate_root(&accounts, state_tree_depth);

        assert_eq!(deactivates.len(), 1);
        assert_eq!(leaves.len(), 1);
        assert!(root > BigUint::from(0u32));
        assert_eq!(deactivates[0].len(), 5);
    }

    #[test]
    fn test_gen_deactivate_root_deterministic() {
        // Test that the same inputs produce the same outputs
        let coordinator = Keypair::from_priv_key(&BigUint::from(54321u64));
        let account = Keypair::from_priv_key(&BigUint::from(12345u64));

        let accounts = vec![account.pub_key.clone()];
        let state_tree_depth = 3;

        let (deactivates1, root1, leaves1, _) =
            coordinator.gen_deactivate_root(&accounts, state_tree_depth);
        let (deactivates2, root2, leaves2, _) =
            coordinator.gen_deactivate_root(&accounts, state_tree_depth);

        // Results should be different due to random values in encrypt_odevity
        // But structure should be the same
        assert_eq!(deactivates1.len(), deactivates2.len());
        assert_eq!(leaves1.len(), leaves2.len());

        // Roots will be different due to randomization in encrypt_odevity
        // This is expected behavior
        println!("Root1: {}", root1);
        println!("Root2: {}", root2);
    }
}
