//! EdDSA-Poseidon Complete Example
//!
//! This example demonstrates all the main features of the eddsa-poseidon library,
//! mirroring the TypeScript example from zk-kit.
//!
//! Run with: cargo run --example complete

use ark_ff::{BigInteger, PrimeField};
use eddsa_poseidon::{
    derive_public_key, derive_secret_scalar, pack_public_key, pack_signature, sign_message,
    unpack_public_key, unpack_signature, verify_signature, EdDSAPoseidon, HashingAlgorithm,
};
use num_bigint::BigUint;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("=== EdDSA-Poseidon Example ===\n");

    // 1. Basic usage with string private key
    println!("1. Basic Usage:");
    let private_key = b"my-secret-key";
    let message = BigUint::from(12345u64);

    // Derive public key from private key
    let public_key = derive_public_key(private_key, HashingAlgorithm::Blake512)?;
    println!("Private Key: \"my-secret-key\"");
    println!("Public Key: [{}, {}]",
        BigUint::from_bytes_le(&public_key.x.into_bigint().to_bytes_le()),
        BigUint::from_bytes_le(&public_key.y.into_bigint().to_bytes_le())
    );
    println!("Message: {}", message);

    // Sign the message
    let signature = sign_message(private_key, &message, HashingAlgorithm::Blake512)?;
    println!("Signature:");
    println!("  R8: [{}, {}]",
        BigUint::from_bytes_le(&signature.r8.x.into_bigint().to_bytes_le()),
        BigUint::from_bytes_le(&signature.r8.y.into_bigint().to_bytes_le())
    );
    println!("  S: {}", signature.s);

    // Verify the signature
    let is_valid = verify_signature(&message, &signature, &public_key)?;
    println!("Signature Valid: {}\n", is_valid);

    // 2. Using EdDSAPoseidon struct
    println!("2. Using EdDSAPoseidon Struct:");
    let eddsa = EdDSAPoseidon::new(
        Some(b"another-secret-key".to_vec()),
        HashingAlgorithm::Blake512
    )?;
    println!("Public Key: [{}, {}]",
        BigUint::from_bytes_le(&eddsa.public_key.x.into_bigint().to_bytes_le()),
        BigUint::from_bytes_le(&eddsa.public_key.y.into_bigint().to_bytes_le())
    );
    println!("Packed Public Key: {}", eddsa.packed_public_key);

    let message2 = BigUint::from_bytes_be(b"Hello, World!");
    let signature2 = eddsa.sign_message(&message2)?;
    println!("Message: \"Hello, World!\"");
    println!("Signature:");
    println!("  R8: [{}, {}]",
        BigUint::from_bytes_le(&signature2.r8.x.into_bigint().to_bytes_le()),
        BigUint::from_bytes_le(&signature2.r8.y.into_bigint().to_bytes_le())
    );
    println!("  S: {}", signature2.s);

    let is_valid2 = eddsa.verify_signature(&message2, &signature2)?;
    println!("Signature Valid: {}\n", is_valid2);

    // 3. Pack/Unpack public key
    println!("3. Pack/Unpack Public Key:");
    let packed_public_key = pack_public_key(&public_key)?;
    println!("Packed Public Key: {}", packed_public_key);

    let unpacked_public_key = unpack_public_key(&packed_public_key)?;
    println!("Unpacked Public Key: [{}, {}]",
        BigUint::from_bytes_le(&unpacked_public_key.x.into_bigint().to_bytes_le()),
        BigUint::from_bytes_le(&unpacked_public_key.y.into_bigint().to_bytes_le())
    );
    println!("Keys Match: {}\n",
        public_key.x == unpacked_public_key.x && public_key.y == unpacked_public_key.y
    );

    // 4. Pack/Unpack signature
    println!("4. Pack/Unpack Signature:");
    let packed_sig = pack_signature(&signature)?;
    println!("Packed Signature (hex): {}", hex::encode(&packed_sig));
    println!("Packed Signature Length: {} bytes", packed_sig.len());

    let unpacked_sig = unpack_signature(&packed_sig)?;
    println!("Unpacked Signature:");
    println!("  R8: [{}, {}]",
        BigUint::from_bytes_le(&unpacked_sig.r8.x.into_bigint().to_bytes_le()),
        BigUint::from_bytes_le(&unpacked_sig.r8.y.into_bigint().to_bytes_le())
    );
    println!("  S: {}", unpacked_sig.s);
    println!("Signatures Match: {}\n",
        signature.r8 == unpacked_sig.r8 && signature.s == unpacked_sig.s
    );

    // 5. Different private key formats
    println!("5. Different Private Key Formats:");

    // String (byte slice)
    let pk1 = derive_public_key(b"string-key", HashingAlgorithm::Blake512)?;
    println!("String key public key: [{}, {}]",
        BigUint::from_bytes_le(&pk1.x.into_bigint().to_bytes_le()),
        BigUint::from_bytes_le(&pk1.y.into_bigint().to_bytes_le())
    );

    // Vec<u8>
    let pk2 = derive_public_key(b"buffer-key".to_vec().as_slice(), HashingAlgorithm::Blake512)?;
    println!("Buffer key public key: [{}, {}]",
        BigUint::from_bytes_le(&pk2.x.into_bigint().to_bytes_le()),
        BigUint::from_bytes_le(&pk2.y.into_bigint().to_bytes_le())
    );

    // Array
    let pk3 = derive_public_key(&[1u8, 2, 3, 4, 5], HashingAlgorithm::Blake512)?;
    println!("Array key public key: [{}, {}]\n",
        BigUint::from_bytes_le(&pk3.x.into_bigint().to_bytes_le()),
        BigUint::from_bytes_le(&pk3.y.into_bigint().to_bytes_le())
    );

    // 6. Different message formats
    println!("6. Different Message Formats:");
    let test_private_key = b"test-key";
    let test_public_key = derive_public_key(test_private_key, HashingAlgorithm::Blake512)?;

    // BigUint
    let msg1 = BigUint::from(999u64);
    let sig1 = sign_message(test_private_key, &msg1, HashingAlgorithm::Blake512)?;
    let valid1 = verify_signature(&msg1, &sig1, &test_public_key)?;
    println!("BigUint message: {} Valid: {}", msg1, valid1);

    // Number (as BigUint)
    let msg2 = BigUint::from(42u64);
    let sig2 = sign_message(test_private_key, &msg2, HashingAlgorithm::Blake512)?;
    let valid2 = verify_signature(&msg2, &sig2, &test_public_key)?;
    println!("Number message: {} Valid: {}", msg2, valid2);

    // Hexadecimal (parse as BigUint)
    let msg3 = BigUint::parse_bytes(b"1234", 16).unwrap();
    let sig3 = sign_message(test_private_key, &msg3, HashingAlgorithm::Blake512)?;
    let valid3 = verify_signature(&msg3, &sig3, &test_public_key)?;
    println!("Hex message: 0x1234 Valid: {}\n", valid3);

    // 7. Secret scalar derivation
    println!("7. Secret Scalar:");
    let secret_scalar = derive_secret_scalar(private_key, HashingAlgorithm::Blake512)?;
    println!("Secret Scalar: {}\n", secret_scalar);

    // 8. Random key generation
    println!("8. Random Key Generation:");
    let random_eddsa = EdDSAPoseidon::new(None, HashingAlgorithm::Blake512)?;
    println!("Random Public Key: [{}, {}]",
        BigUint::from_bytes_le(&random_eddsa.public_key.x.into_bigint().to_bytes_le()),
        BigUint::from_bytes_le(&random_eddsa.public_key.y.into_bigint().to_bytes_le())
    );
    let random_msg = BigUint::from(98765u64);
    let random_sig = random_eddsa.sign_message(&random_msg)?;
    let random_valid = random_eddsa.verify_signature(&random_msg, &random_sig)?;
    println!("Random Key Signature Valid: {}\n", random_valid);

    // 9. Testing Blake2b algorithm
    println!("9. Testing Blake2b Algorithm:");
    let eddsa_blake2b = EdDSAPoseidon::new(
        Some(b"blake2b-test".to_vec()),
        HashingAlgorithm::Blake2b
    )?;
    let blake2b_msg = BigUint::from(54321u64);
    let blake2b_sig = eddsa_blake2b.sign_message(&blake2b_msg)?;
    let blake2b_valid = eddsa_blake2b.verify_signature(&blake2b_msg, &blake2b_sig)?;
    println!("Blake2b Signature Valid: {}\n", blake2b_valid);

    println!("=== Example Complete ===");

    Ok(())
}

