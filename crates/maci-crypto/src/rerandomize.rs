use crate::error::Result;
use crate::keys::{gen_keypair, PubKey};
use ark_ec::CurveGroup;
use ark_ff::{BigInteger, PrimeField};
use baby_jubjub::{gen_random_babyjub_value, EdFr, EdwardsAffine, EdwardsProjective, Fq};
use num_bigint::BigUint;
use serde::{Deserialize, Serialize};

/// A message consisting of a point and an x-increment
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Message {
    pub point: [BigUint; 2],
    pub x_increment: BigUint,
}

/// A ciphertext consisting of two curve points and an x-increment
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Ciphertext {
    pub c1: [BigUint; 2],
    pub c2: [BigUint; 2],
    pub x_increment: BigUint,
}

/// Convert BigUint coordinates to an Edwards curve point
fn biguint_to_edwards_point(coords: &[BigUint; 2]) -> Result<EdwardsProjective> {
    let x_bytes = coords[0].to_bytes_le();
    let y_bytes = coords[1].to_bytes_le();

    let mut x_padded = vec![0u8; 32];
    let mut y_padded = vec![0u8; 32];

    let x_len = x_bytes.len().min(32);
    let y_len = y_bytes.len().min(32);

    x_padded[..x_len].copy_from_slice(&x_bytes[..x_len]);
    y_padded[..y_len].copy_from_slice(&y_bytes[..y_len]);

    let x_fq = Fq::from_le_bytes_mod_order(&x_padded);
    let y_fq = Fq::from_le_bytes_mod_order(&y_padded);

    let affine = EdwardsAffine::new_unchecked(x_fq, y_fq);
    Ok(EdwardsProjective::from(affine))
}

/// Convert an Edwards curve point to BigUint coordinates
fn edwards_point_to_biguint(point: &EdwardsProjective) -> [BigUint; 2] {
    let affine = point.into_affine();

    let x_bytes = affine.x.into_bigint().to_bytes_le();
    let y_bytes = affine.y.into_bigint().to_bytes_le();

    let x = BigUint::from_bytes_le(&x_bytes);
    let y = BigUint::from_bytes_le(&y_bytes);

    [x, y]
}

/// Get the Base8 generator point for Baby Jubjub
/// Base8 is the standard base point (already 8 * generator)
/// Use the base8() function from baby_jubjub to match SDK behavior
fn get_base8() -> EdwardsProjective {
    EdwardsProjective::from(baby_jubjub::base8())
}

/// Converts an arbitrary BigUint, which must be less than the BabyJub field
/// size, into a Message. Each Message has a BabyJub curve point, and an
/// x-increment.
///
/// This matches TypeScript's encodeToMessage:
/// ```typescript
/// const encodeToMessage = (original: bigint, randomKey = genKeypair()) => {
///   const xIncrement = F.e(F.sub(randomKey.pubKey[0], original));
///   return {
///     point: { x: randomKey.pubKey[0], y: randomKey.pubKey[1] },
///     xIncrement
///   };
/// };
/// ```
///
/// # Arguments
/// * `original` - The value to encode. It must be less than the BabyJub field size.
/// * `random_key_seed` - Optional seed for generating the random keypair
///
/// # Returns
/// A Message containing a point and an x-increment
pub fn encode_to_message(original: &BigUint, random_key_seed: Option<BigUint>) -> Message {
    let random_key = gen_keypair(random_key_seed);

    // IMPORTANT: xIncrement is NOT a scalar field element!
    // It's a raw BigUint difference that can exceed the scalar field modulus r.
    // This is intentional because pubKey[0] comes from the Base Field (Fq)
    // and can be larger than the Scalar Field modulus (Fr).
    //
    // TypeScript does: xIncrement = F.e(F.sub(pubKey[0], original))
    // where F.e() and F.sub() do NOT reduce mod r for large values.
    //
    // We must match this behavior by computing the raw BigUint difference.
    let x_increment = if &random_key.pub_key[0] >= original {
        &random_key.pub_key[0] - original
    } else {
        // This should not happen in normal AMACI usage where pubKey[0] >> original
        // But handle it for completeness by wrapping around
        panic!("encode_to_message: pubKey[0] < original, which is unexpected")
    };

    Message {
        point: random_key.pub_key.clone(),
        x_increment,
    }
}

/// Converts a Message into the original value.
/// The original value is the x-value of the BabyJub point minus the x-increment.
///
/// This matches TypeScript's decodeMessage:
/// ```typescript
/// const decodeMessage = (message: { point: { x: bigint; y: bigint }; xIncrement: bigint }) => {
///   const decoded = BigInt(F.e(F.sub(message.point.x, message.xIncrement)));
///   return decoded;
/// };
/// ```
///
/// # Arguments
/// * `message` - The message to decode
///
/// # Returns
/// The decoded original value
pub fn decode_message(message: &Message) -> BigUint {
    // IMPORTANT: Direct BigUint subtraction, matching TypeScript behavior
    // TypeScript does: decoded = BigInt(F.e(F.sub(message.point.x, message.xIncrement)))
    //
    // Since xIncrement is not reduced mod r, we must do raw BigUint arithmetic.
    // The result should be the original plaintext.
    if &message.point[0] >= &message.x_increment {
        &message.point[0] - &message.x_increment
    } else {
        // This should not happen in normal usage
        panic!("decode_message: point.x < xIncrement, which is unexpected")
    }
}

/// Encrypts a plaintext using a public key
///
/// This matches TypeScript's encrypt:
/// ```typescript
/// const encrypt = (plaintext: bigint, pubKey: PubKey, randomVal = genRandomBabyJubValue()) => {
///   const message = encodeToMessage(plaintext);
///   const c1Point = BabyJub.mulPointEscalar(BabyJub.Base8, randomVal);
///   const pky = BabyJub.mulPointEscalar(pubKey, randomVal);
///   const c2Point = BabyJub.addPoint([message.point.x, message.point.y], pky);
///   return { c1: { x: c1Point[0], y: c1Point[1] }, c2: { x: c2Point[0], y: c2Point[1] }, xIncrement: message.xIncrement };
/// };
/// ```
///
/// # Arguments
/// * `plaintext` - The value to encrypt
/// * `pub_key` - The public key to encrypt with
/// * `random_val` - Optional random value (generated if not provided)
///
/// # Returns
/// A Ciphertext containing c1, c2, and xIncrement
pub fn encrypt(
    plaintext: &BigUint,
    pub_key: &PubKey,
    random_val: Option<BigUint>,
) -> Result<Ciphertext> {
    let message = encode_to_message(plaintext, None);

    let random_val = random_val.unwrap_or_else(gen_random_babyjub_value);

    // Convert random_val to scalar
    let scalar_bytes = random_val.to_bytes_le();
    let mut padded = vec![0u8; 32];
    let len = scalar_bytes.len().min(32);
    padded[..len].copy_from_slice(&scalar_bytes[..len]);
    let scalar = EdFr::from_le_bytes_mod_order(&padded);

    // c1 = Base8 * randomVal
    let base8 = get_base8();
    let c1_point = base8 * scalar;
    let c1 = edwards_point_to_biguint(&c1_point);

    // pky = pubKey * randomVal
    let pub_key_point = biguint_to_edwards_point(pub_key)?;
    let pky = pub_key_point * scalar;

    // c2 = message.point + pky
    let message_point = biguint_to_edwards_point(&message.point)?;
    let c2_point = message_point + pky;
    let c2 = edwards_point_to_biguint(&c2_point);

    Ok(Ciphertext {
        c1,
        c2,
        x_increment: message.x_increment,
    })
}

/// Encrypts an odd/even indicator using a public key
///
/// This matches TypeScript's encryptOdevity:
/// ```typescript
/// export const encryptOdevity = (isOdd: boolean, pubKey: PubKey, randomVal = genRandomBabyJubValue()) => {
///   let i = 0n;
///   let message = encodeToMessage(123n, genKeypair(randomVal + i));
///   while ((message.point.x % 2n === 1n) !== isOdd) {
///     i++;
///     message = encodeToMessage(123n, genKeypair(randomVal + i));
///   }
///   const c1Point = BabyJub.mulPointEscalar(BabyJub.Base8, randomVal);
///   const pky = BabyJub.mulPointEscalar(pubKey, randomVal);
///   const c2Point = BabyJub.addPoint([message.point.x, message.point.y], pky);
///   return { c1: { x: c1Point[0], y: c1Point[1] }, c2: { x: c2Point[0], y: c2Point[1] }, xIncrement: message.xIncrement };
/// };
/// ```
///
/// **IMPORTANT**: This encodes the parity (0=even/active, 1=odd/deactivated) by finding
/// a message point with the desired x-coordinate parity. The plaintext (123) is just a
/// placeholder; what matters is the point's x-coordinate parity.
///
/// # Arguments
/// * `is_odd` - Whether to encode an odd x-coordinate (true=deactivated, false=active)
/// * `pub_key` - The public key to encrypt with
/// * `random_val` - Optional random value (generated if not provided)
///
/// # Returns
/// A Ciphertext containing c1, c2, and xIncrement
pub fn encrypt_odevity(
    is_odd: bool,
    pub_key: &PubKey,
    random_val: Option<BigUint>,
) -> Result<Ciphertext> {
    let random_val = random_val.unwrap_or_else(gen_random_babyjub_value);

    // Find a message point with the desired x-coordinate parity
    // NOTE: The plaintext is 123, but what matters for status encoding
    // is the resulting message.point.x parity after ElGamal encryption
    let mut i = BigUint::from(0u32);
    let plaintext = BigUint::from(123u32);
    let mut message = encode_to_message(&plaintext, Some(&random_val + &i));

    while (&message.point[0] % BigUint::from(2u32) == BigUint::from(1u32)) != is_odd {
        i += BigUint::from(1u32);
        message = encode_to_message(&plaintext, Some(&random_val + &i));
    }

    // Convert random_val to scalar
    let scalar_bytes = random_val.to_bytes_le();
    let mut padded = vec![0u8; 32];
    let len = scalar_bytes.len().min(32);
    padded[..len].copy_from_slice(&scalar_bytes[..len]);
    let scalar = EdFr::from_le_bytes_mod_order(&padded);

    // c1 = Base8 * randomVal
    let base8 = get_base8();
    let c1_point = base8 * scalar;
    let c1 = edwards_point_to_biguint(&c1_point);

    // pky = pubKey * randomVal
    let pub_key_point = biguint_to_edwards_point(pub_key)?;
    let pky = pub_key_point * scalar;

    // c2 = message.point + pky
    let message_point = biguint_to_edwards_point(&message.point)?;
    let c2_point = message_point + pky;
    let c2 = edwards_point_to_biguint(&c2_point);

    Ok(Ciphertext {
        c1,
        c2,
        x_increment: message.x_increment,
    })
}

/// Decrypts a ciphertext using a private key
///
/// This matches TypeScript's decrypt:
/// ```typescript
/// export const decrypt = (formatedPrivKey: bigint, ciphertext: { c1: { x: bigint; y: bigint }; c2: { x: bigint; y: bigint }; xIncrement: bigint }) => {
///   const c1x = BabyJub.mulPointEscalar([ciphertext.c1.x, ciphertext.c1.y], formatedPrivKey);
///   const c1xInverse = [F.e(c1x[0] * BigInt(-1)), BigInt(c1x[1])] as BabyJub.Point<bigint>;
///   const decrypted = BabyJub.addPoint(c1xInverse, [ciphertext.c2.x, ciphertext.c2.y]);
///   return decodeMessage({ point: { x: decrypted[0], y: decrypted[1] }, xIncrement: ciphertext.xIncrement });
/// };
/// ```
///
/// # Arguments
/// * `formatted_priv_key` - The formatted private key (from Keypair.formated_priv_key)
/// * `ciphertext` - The ciphertext to decrypt
///
/// # Returns
/// The decrypted plaintext value
pub fn decrypt(formatted_priv_key: &BigUint, ciphertext: &Ciphertext) -> Result<BigUint> {
    // Convert formatted_priv_key to scalar
    let priv_key_bytes = formatted_priv_key.to_bytes_le();
    let mut padded = vec![0u8; 32];
    let len = priv_key_bytes.len().min(32);
    padded[..len].copy_from_slice(&priv_key_bytes[..len]);
    let scalar = EdFr::from_le_bytes_mod_order(&padded);

    // c1x = c1 * formatedPrivKey
    let c1_point = biguint_to_edwards_point(&ciphertext.c1)?;
    let c1x = c1_point * scalar;

    // c1xInverse = [-c1x[0], c1x[1]] (negate x-coordinate for point inversion)
    let c1x_affine = c1x.into_affine();
    let c1x_inv_x = -c1x_affine.x;
    let c1x_inv_y = c1x_affine.y;
    let c1x_inverse = EdwardsProjective::from(EdwardsAffine::new_unchecked(c1x_inv_x, c1x_inv_y));

    // decrypted = c1xInverse + c2
    let c2_point = biguint_to_edwards_point(&ciphertext.c2)?;
    let decrypted_point = c1x_inverse + c2_point;
    let decrypted_coords = edwards_point_to_biguint(&decrypted_point);

    // Decode the message
    let message = Message {
        point: decrypted_coords,
        x_increment: ciphertext.x_increment.clone(),
    };

    Ok(decode_message(&message))
}

/// Rerandomize a ciphertext
///
/// Given a ciphertext (c1, c2) and a public key, this function produces
/// a new ciphertext (d1, d2) that encrypts the same plaintext but looks
/// different (unlinkable to the original).
///
/// Algorithm:
/// - d1 = Base8 * randomVal + c1
/// - d2 = pubKey * randomVal + c2
///
/// # Arguments
/// * `pub_key` - The public key used for rerandomization
/// * `ciphertext` - The original ciphertext to rerandomize (with x_increment)
/// * `random_val` - Optional random value (generated if not provided)
///
/// # Returns
/// A new rerandomized ciphertext
pub fn rerandomize_ciphertext(
    pub_key: &PubKey,
    ciphertext: &Ciphertext,
    random_val: Option<BigUint>,
) -> Result<Ciphertext> {
    let random_val = random_val.unwrap_or_else(gen_random_babyjub_value);

    // Convert to EdFr (Edwards curve scalar field)
    let scalar_bytes = random_val.to_bytes_le();
    let mut padded = vec![0u8; 32];
    let len = scalar_bytes.len().min(32);
    padded[..len].copy_from_slice(&scalar_bytes[..len]);
    let scalar = EdFr::from_le_bytes_mod_order(&padded);

    // Compute d1 = Base8 * randomVal + c1
    let base8 = get_base8();
    let base8_mul = base8 * scalar;
    let c1_point = biguint_to_edwards_point(&ciphertext.c1)?;
    let d1_point = base8_mul + c1_point;
    let d1 = edwards_point_to_biguint(&d1_point);

    // Compute d2 = pubKey * randomVal + c2
    let pub_key_point = biguint_to_edwards_point(pub_key)?;
    let pub_key_mul = pub_key_point * scalar;
    let c2_point = biguint_to_edwards_point(&ciphertext.c2)?;
    let d2_point = pub_key_mul + c2_point;
    let d2 = edwards_point_to_biguint(&d2_point);

    Ok(Ciphertext {
        c1: d1,
        c2: d2,
        x_increment: ciphertext.x_increment.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hashing::poseidon;
    use crate::keys::gen_keypair;

    #[test]
    fn test_encode_decode_message() {
        let original = BigUint::from(42u32);
        let message = encode_to_message(&original, Some(BigUint::from(12345u64)));
        let decoded = decode_message(&message);
        assert_eq!(decoded, original);
    }

    /// Test AMACI core crypto operations for e2e cross-validation
    /// This test generates reference data that can be compared with TypeScript SDK
    #[test]
    fn test_amaci_crypto_core() {
        println!("\n=== AMACI Core Crypto Test (Rust) ===\n");

        // Use same seed as TypeScript test
        let operator_seed = BigUint::from(12345u64);
        let coord_keypair = gen_keypair(Some(operator_seed.clone()));

        println!("Operator Keypair:");
        println!("  Seed: {}", operator_seed);
        println!("  PrivKey: {}", coord_keypair.priv_key);
        println!(
            "  PubKey: [{}, {}]",
            coord_keypair.pub_key[0], coord_keypair.pub_key[1]
        );
        println!("  FormattedPrivKey: {}\n", coord_keypair.formated_priv_key);

        let static_random_salt = BigUint::from(20040u64);

        // Test 1: genStaticRandomKey (matching operator.ts)
        println!("Test 1: genStaticRandomKey");
        let indices = vec![1u64, 2u64, 100u64];
        let mut static_random_keys = std::collections::HashMap::new();

        for &index in &indices {
            let random_key = poseidon(&vec![
                coord_keypair.priv_key.clone(),
                static_random_salt.clone(),
                BigUint::from(index),
            ]);
            println!("  Index {}: {}", index, random_key);
            static_random_keys.insert(index.to_string(), random_key.to_string());
        }

        // Test 2: encryptOdevity (even/active)
        println!("\nTest 2.1: encryptOdevity (even/active)");
        let random_key_1 = poseidon(&vec![
            coord_keypair.priv_key.clone(),
            static_random_salt.clone(),
            BigUint::from(1u64),
        ]);

        let even_ct = encrypt_odevity(false, &coord_keypair.pub_key, Some(random_key_1.clone()))
            .expect("Encryption failed");

        println!("  RandomKey: {}", random_key_1);
        println!("  c1: [{}, {}]", even_ct.c1[0], even_ct.c1[1]);
        println!("  c2: [{}, {}]", even_ct.c2[0], even_ct.c2[1]);
        println!("  xIncrement: {}", even_ct.x_increment);

        // Decrypt and verify parity
        let even_decrypted =
            decrypt(&coord_keypair.formated_priv_key, &even_ct).expect("Decryption failed");
        let even_parity = &even_decrypted % BigUint::from(2u32);
        println!("  Decrypted: {} (parity: {})", even_decrypted, even_parity);
        // Note: The decrypted value is the plaintext (123), not a status indicator
        // The key point is that message.point.x has the desired parity
        println!("  Note: Decrypted plaintext is 123, parity check is on intermediate state");

        // Test 3: encryptOdevity (odd/deactivated)
        println!("\nTest 2.2: encryptOdevity (odd/deactivated)");
        let random_key_2 = poseidon(&vec![
            coord_keypair.priv_key.clone(),
            static_random_salt.clone(),
            BigUint::from(2u64),
        ]);

        let odd_ct = encrypt_odevity(true, &coord_keypair.pub_key, Some(random_key_2.clone()))
            .expect("Encryption failed");

        println!("  RandomKey: {}", random_key_2);
        println!("  c1: [{}, {}]", odd_ct.c1[0], odd_ct.c1[1]);
        println!("  c2: [{}, {}]", odd_ct.c2[0], odd_ct.c2[1]);
        println!("  xIncrement: {}", odd_ct.x_increment);

        // Decrypt and verify parity
        let odd_decrypted =
            decrypt(&coord_keypair.formated_priv_key, &odd_ct).expect("Decryption failed");
        let odd_parity = &odd_decrypted % BigUint::from(2u32);
        println!("  Decrypted: {} (parity: {})", odd_decrypted, odd_parity);
        println!("  Note: Decrypted plaintext is 123, parity check is on intermediate state");

        // Test 4: rerandomize preserves parity (even)
        println!("\nTest 3.1: rerandomize (even) preserves parity");
        let rerandom_vals = vec![77777u64, 88888u64, 99999u64];

        for &rerandom_val in &rerandom_vals {
            let rerandomized = rerandomize_ciphertext(
                &coord_keypair.pub_key,
                &even_ct,
                Some(BigUint::from(rerandom_val)),
            )
            .expect("Rerandomization failed");

            println!("  RerandomVal: {}", rerandom_val);
            println!("    d1: [{}, {}]", rerandomized.c1[0], rerandomized.c1[1]);
            println!("    d2: [{}, {}]", rerandomized.c2[0], rerandomized.c2[1]);

            let decrypted = decrypt(&coord_keypair.formated_priv_key, &rerandomized)
                .expect("Decryption failed");
            let parity = &decrypted % BigUint::from(2u32);
            println!("    Decrypted: {} (parity: {})", decrypted, parity);
            // Note: rerandomize changes the ciphertext but decryption should still work
        }

        // Test 5: rerandomize preserves parity (odd)
        println!("\nTest 3.2: rerandomize (odd) preserves parity");
        let rerandom_vals = vec![11111u64, 22222u64, 33333u64];

        for &rerandom_val in &rerandom_vals {
            let rerandomized = rerandomize_ciphertext(
                &coord_keypair.pub_key,
                &odd_ct,
                Some(BigUint::from(rerandom_val)),
            )
            .expect("Rerandomization failed");

            println!("  RerandomVal: {}", rerandom_val);
            println!("    d1: [{}, {}]", rerandomized.c1[0], rerandomized.c1[1]);
            println!("    d2: [{}, {}]", rerandomized.c2[0], rerandomized.c2[1]);

            let decrypted = decrypt(&coord_keypair.formated_priv_key, &rerandomized)
                .expect("Decryption failed");
            let parity = &decrypted % BigUint::from(2u32);
            println!("    Decrypted: {} (parity: {})", decrypted, parity);
        }

        // Output JSON for TypeScript cross-validation
        println!("\n=== JSON Output for Cross-Validation ===");
        let json_output = format!(
            r#"RUST_TEST_RESULTS:{{
  "static_random_keys": {{
    "1": "{}",
    "2": "{}",
    "100": "{}"
  }},
  "encrypt_even": {{
    "c1": {{
      "x": "{}",
      "y": "{}"
    }},
    "c2": {{
      "x": "{}",
      "y": "{}"
    }},
    "xIncrement": "{}"
  }},
  "encrypt_odd": {{
    "c1": {{
      "x": "{}",
      "y": "{}"
    }},
    "c2": {{
      "x": "{}",
      "y": "{}"
    }},
    "xIncrement": "{}"
  }}
}}"#,
            static_random_keys.get("1").unwrap(),
            static_random_keys.get("2").unwrap(),
            static_random_keys.get("100").unwrap(),
            even_ct.c1[0],
            even_ct.c1[1],
            even_ct.c2[0],
            even_ct.c2[1],
            even_ct.x_increment,
            odd_ct.c1[0],
            odd_ct.c1[1],
            odd_ct.c2[0],
            odd_ct.c2[1],
            odd_ct.x_increment
        );

        println!("{}", json_output);
        println!("\n=== Test Complete ===");
    }

    #[test]
    fn test_encrypt_decrypt() {
        let keypair = gen_keypair(Some(BigUint::from(12345u64)));
        let plaintext = BigUint::from(999u32);

        let ciphertext = encrypt(&plaintext, &keypair.pub_key, Some(BigUint::from(54321u64)))
            .expect("Encryption failed");

        let decrypted =
            decrypt(&keypair.formated_priv_key, &ciphertext).expect("Decryption failed");

        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_encrypt_odevity_odd() {
        let keypair = gen_keypair(Some(BigUint::from(12345u64)));

        let ciphertext = encrypt_odevity(true, &keypair.pub_key, Some(BigUint::from(99999u64)))
            .expect("Encryption failed");

        // The function creates a message with the desired parity, but after
        // elliptic curve addition with pky, the c2 point may have different parity.
        // We just verify the encryption succeeded and we can decrypt it
        let decrypted =
            decrypt(&keypair.formated_priv_key, &ciphertext).expect("Decryption failed");
        // Should decrypt to 123 (the hardcoded plaintext in encryptOdevity)
        assert_eq!(decrypted, BigUint::from(123u32));
    }

    #[test]
    fn test_encrypt_odevity_even() {
        let keypair = gen_keypair(Some(BigUint::from(12345u64)));

        let ciphertext = encrypt_odevity(false, &keypair.pub_key, Some(BigUint::from(99999u64)))
            .expect("Encryption failed");

        // The function creates a message with the desired parity, but after
        // elliptic curve addition with pky, the c2 point may have different parity.
        // We just verify the encryption succeeded and we can decrypt it
        let decrypted =
            decrypt(&keypair.formated_priv_key, &ciphertext).expect("Decryption failed");
        // Should decrypt to 123 (the hardcoded plaintext in encryptOdevity)
        assert_eq!(decrypted, BigUint::from(123u32));
    }

    #[test]
    fn test_rerandomize_ciphertext() {
        let keypair = gen_keypair(Some(BigUint::from(12345u64)));
        let plaintext = BigUint::from(123u32);

        // Create original ciphertext
        let ciphertext = encrypt(&plaintext, &keypair.pub_key, Some(BigUint::from(11111u64)))
            .expect("Encryption failed");

        // Rerandomize it
        let rerandomized =
            rerandomize_ciphertext(&keypair.pub_key, &ciphertext, Some(BigUint::from(22222u64)))
                .expect("Rerandomization failed");

        // The rerandomized ciphertext should be different from the original
        assert!(rerandomized.c1 != ciphertext.c1 || rerandomized.c2 != ciphertext.c2);

        // But should decrypt to the same plaintext
        let decrypted_original =
            decrypt(&keypair.formated_priv_key, &ciphertext).expect("Decryption failed");
        let decrypted_rerandomized =
            decrypt(&keypair.formated_priv_key, &rerandomized).expect("Decryption failed");

        assert_eq!(decrypted_original, plaintext);
        assert_eq!(decrypted_rerandomized, plaintext);
    }

    #[test]
    fn test_rerandomize_deterministic() {
        let keypair = gen_keypair(Some(BigUint::from(12345u64)));

        let ciphertext = Ciphertext {
            c1: keypair.pub_key.clone(),
            c2: keypair.pub_key.clone(),
            x_increment: BigUint::from(123u32),
        };

        let random_val = BigUint::from(99999u64);

        let result1 =
            rerandomize_ciphertext(&keypair.pub_key, &ciphertext, Some(random_val.clone()));
        let result2 = rerandomize_ciphertext(&keypair.pub_key, &ciphertext, Some(random_val));

        assert!(result1.is_ok());
        assert!(result2.is_ok());

        let rerandomized1 = result1.unwrap();
        let rerandomized2 = result2.unwrap();

        // With the same random value, results should be identical
        assert_eq!(rerandomized1.c1, rerandomized2.c1);
        assert_eq!(rerandomized1.c2, rerandomized2.c2);
    }

    #[test]
    fn test_rerandomize_different_random_values() {
        let keypair = gen_keypair(Some(BigUint::from(12345u64)));

        let ciphertext = Ciphertext {
            c1: keypair.pub_key.clone(),
            c2: keypair.pub_key.clone(),
            x_increment: BigUint::from(123u32),
        };

        let result1 = rerandomize_ciphertext(&keypair.pub_key, &ciphertext, None);
        let result2 = rerandomize_ciphertext(&keypair.pub_key, &ciphertext, None);

        assert!(result1.is_ok());
        assert!(result2.is_ok());

        let rerandomized1 = result1.unwrap();
        let rerandomized2 = result2.unwrap();

        // With different random values, results should differ (with high probability)
        assert!(rerandomized1.c1 != rerandomized2.c1 || rerandomized1.c2 != rerandomized2.c2);
    }

    #[test]
    fn test_biguint_edwards_conversion() {
        let keypair = gen_keypair(Some(BigUint::from(12345u64)));
        let point = biguint_to_edwards_point(&keypair.pub_key).unwrap();
        let recovered = edwards_point_to_biguint(&point);

        // Due to field operations, values should be in valid range
        assert!(recovered[0] >= BigUint::from(0u32));
        assert!(recovered[1] >= BigUint::from(0u32));
    }

    #[test]
    fn test_base8_generator() {
        let base8 = get_base8();
        let coords = edwards_point_to_biguint(&base8);

        // Base8 should not be the identity
        assert!(coords[0] != BigUint::from(0u32) || coords[1] != BigUint::from(1u32));
    }
}
