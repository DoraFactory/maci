use anyhow::Result;
use ark_ff::{BigInteger, PrimeField};
use eddsa_poseidon::{
    derive_public_key, derive_secret_scalar, pack_public_key, pack_signature, sign_message,
    unpack_public_key, unpack_signature, verify_signature, HashingAlgorithm,
};
use crypto_test_gen::{EdDSAData, EdDSAPoseidonTestVector, PointJson, SignatureJson};
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

fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn generate_vectors() -> Result<Vec<EdDSAPoseidonTestVector>> {
    let mut vectors = Vec::new();

    // Use Blake512 as default (matching zk-kit default)
    let algorithm = HashingAlgorithm::Blake512;

    // Test 1: Derive public key from string "secret"
    let priv_key_str = "secret";
    let priv_key_bytes = priv_key_str.as_bytes();
    let secret_scalar = derive_secret_scalar(priv_key_bytes, algorithm)
        .map_err(|e| anyhow::anyhow!(e))?;
    let pub_key = derive_public_key(priv_key_bytes, algorithm)
        .map_err(|e| anyhow::anyhow!(e))?;

    vectors.push(EdDSAPoseidonTestVector {
        name: "derivePublicKey_string_secret".to_string(),
        description: "Derive public key from private key string 'secret'".to_string(),
        vector_type: "derivePublicKey".to_string(),
        data: EdDSAData::DerivePublicKey {
            private_key: priv_key_str.to_string(),
            private_key_bytes: bytes_to_hex(priv_key_bytes),
            secret_scalar: secret_scalar.to_string(),
            public_key: point_to_json(&pub_key),
        },
    });

    // Test 2: Sign and verify message (BigInt 2)
    let message = BigUint::from(2u64);
    let signature = sign_message(priv_key_bytes, &message, algorithm)
        .map_err(|e| anyhow::anyhow!(e))?;
    let valid = verify_signature(&message, &signature, &pub_key)
        .map_err(|e| anyhow::anyhow!(e))?;

    vectors.push(EdDSAPoseidonTestVector {
        name: "signVerify_message_2".to_string(),
        description: "Sign and verify message value 2 with private key 'secret'".to_string(),
        vector_type: "signVerify".to_string(),
        data: EdDSAData::SignVerify {
            private_key: priv_key_str.to_string(),
            private_key_bytes: bytes_to_hex(priv_key_bytes),
            message: message.to_string(),
            public_key: point_to_json(&pub_key),
            signature: SignatureJson {
                r8: point_to_json(&signature.r8),
                s: signature.s.to_string(),
            },
            valid,
        },
    });

    // Test 3: Pack and unpack signature
    let packed_sig = pack_signature(&signature).map_err(|e| anyhow::anyhow!(e))?;
    let _unpacked_sig = unpack_signature(&packed_sig).map_err(|e| anyhow::anyhow!(e))?;

    vectors.push(EdDSAPoseidonTestVector {
        name: "packSignature_message_2".to_string(),
        description: "Pack signature for message 2".to_string(),
        vector_type: "packSignature".to_string(),
        data: EdDSAData::PackSignature {
            signature: SignatureJson {
                r8: point_to_json(&signature.r8),
                s: signature.s.to_string(),
            },
            packed: bytes_to_hex(&packed_sig),
        },
    });

    // Test 4: Sign and verify with different messages (numeric)
    let message_numeric = BigUint::from(22u64);
    let sig_numeric = sign_message(priv_key_bytes, &message_numeric, algorithm)
        .map_err(|e| anyhow::anyhow!(e))?;

    vectors.push(EdDSAPoseidonTestVector {
        name: "signVerify_message_22".to_string(),
        description: "Sign and verify message value 22".to_string(),
        vector_type: "signVerify".to_string(),
        data: EdDSAData::SignVerify {
            private_key: priv_key_str.to_string(),
            private_key_bytes: bytes_to_hex(priv_key_bytes),
            message: message_numeric.to_string(),
            public_key: point_to_json(&pub_key),
            signature: SignatureJson {
                r8: point_to_json(&sig_numeric.r8),
                s: sig_numeric.s.to_string(),
            },
            valid: verify_signature(&message_numeric, &sig_numeric, &pub_key)
                .map_err(|e| anyhow::anyhow!(e))?,
        },
    });

    // Test 5: Sign message from hex string (0x12)
    let message_hex = BigUint::from(0x12u64);
    let sig_hex = sign_message(priv_key_bytes, &message_hex, algorithm)
        .map_err(|e| anyhow::anyhow!(e))?;

    vectors.push(EdDSAPoseidonTestVector {
        name: "signVerify_message_hex_0x12".to_string(),
        description: "Sign and verify message 0x12 (18 in decimal)".to_string(),
        vector_type: "signVerify".to_string(),
        data: EdDSAData::SignVerify {
            private_key: priv_key_str.to_string(),
            private_key_bytes: bytes_to_hex(priv_key_bytes),
            message: message_hex.to_string(),
            public_key: point_to_json(&pub_key),
            signature: SignatureJson {
                r8: point_to_json(&sig_hex.r8),
                s: sig_hex.s.to_string(),
            },
            valid: verify_signature(&message_hex, &sig_hex, &pub_key)
                .map_err(|e| anyhow::anyhow!(e))?,
        },
    });

    // Test 6: Sign message from buffer/string "message"
    let msg_str = "message";
    let msg_bytes = msg_str.as_bytes();
    let msg_as_bigint = BigUint::from_bytes_be(msg_bytes);
    let sig_str = sign_message(priv_key_bytes, &msg_as_bigint, algorithm)
        .map_err(|e| anyhow::anyhow!(e))?;

    vectors.push(EdDSAPoseidonTestVector {
        name: "signVerify_message_string".to_string(),
        description: "Sign and verify message string 'message' converted to BigInt".to_string(),
        vector_type: "signVerify".to_string(),
        data: EdDSAData::SignVerify {
            private_key: priv_key_str.to_string(),
            private_key_bytes: bytes_to_hex(priv_key_bytes),
            message: msg_as_bigint.to_string(),
            public_key: point_to_json(&pub_key),
            signature: SignatureJson {
                r8: point_to_json(&sig_str.r8),
                s: sig_str.s.to_string(),
            },
            valid: verify_signature(&msg_as_bigint, &sig_str, &pub_key)
                .map_err(|e| anyhow::anyhow!(e))?,
        },
    });

    // Test 7: Derive public key from Buffer input
    let priv_key_buffer: Vec<u8> = vec![115, 101, 99, 114, 101, 116]; // "secret" as bytes
    let pub_key_buffer = derive_public_key(&priv_key_buffer, algorithm)
        .map_err(|e| anyhow::anyhow!(e))?;
    let secret_scalar_buffer = derive_secret_scalar(&priv_key_buffer, algorithm)
        .map_err(|e| anyhow::anyhow!(e))?;

    vectors.push(EdDSAPoseidonTestVector {
        name: "derivePublicKey_buffer_input".to_string(),
        description: "Derive public key from Buffer input [115,101,99,114,101,116]".to_string(),
        vector_type: "derivePublicKey".to_string(),
        data: EdDSAData::DerivePublicKey {
            private_key: String::from_utf8(priv_key_buffer.clone()).unwrap(),
            private_key_bytes: bytes_to_hex(&priv_key_buffer),
            secret_scalar: secret_scalar_buffer.to_string(),
            public_key: point_to_json(&pub_key_buffer),
        },
    });

    // Test 8: Derive public key from Uint8Array input
    let priv_key_u8arr: Vec<u8> = vec![3, 2];
    let pub_key_u8arr = derive_public_key(&priv_key_u8arr, algorithm)
        .map_err(|e| anyhow::anyhow!(e))?;
    let secret_scalar_u8arr = derive_secret_scalar(&priv_key_u8arr, algorithm)
        .map_err(|e| anyhow::anyhow!(e))?;

    vectors.push(EdDSAPoseidonTestVector {
        name: "derivePublicKey_uint8array_input".to_string(),
        description: "Derive public key from Uint8Array input [3, 2]".to_string(),
        vector_type: "derivePublicKey".to_string(),
        data: EdDSAData::DerivePublicKey {
            private_key: format!("[{}, {}]", priv_key_u8arr[0], priv_key_u8arr[1]),
            private_key_bytes: bytes_to_hex(&priv_key_u8arr),
            secret_scalar: secret_scalar_u8arr.to_string(),
            public_key: point_to_json(&pub_key_u8arr),
        },
    });

    // Test 9: Pack/unpack public key
    let packed_pub = pack_public_key(&pub_key).map_err(|e| anyhow::anyhow!(e))?;
    let _unpacked_pub = unpack_public_key(&packed_pub).map_err(|e| anyhow::anyhow!(e))?;

    vectors.push(EdDSAPoseidonTestVector {
        name: "packPublicKey_secret".to_string(),
        description: "Pack public key derived from 'secret'".to_string(),
        vector_type: "derivePublicKey".to_string(),
        data: EdDSAData::DerivePublicKey {
            private_key: priv_key_str.to_string(),
            private_key_bytes: bytes_to_hex(priv_key_bytes),
            secret_scalar: secret_scalar.to_string(),
            public_key: point_to_json(&pub_key),
        },
    });

    Ok(vectors)
}

fn main() -> Result<()> {
    println!("Generating EdDSA-Poseidon test vectors...");

    let vectors = generate_vectors()?;

    println!("Generated {} test vectors", vectors.len());

    // Output directory: e2e/crypto-test (relative to workspace root)
    let output_dir = Path::new("e2e/crypto-test");
    fs::create_dir_all(output_dir)?;

    let output_path = output_dir.join("eddsa-poseidon-test-vectors.json");
    let json = serde_json::to_string_pretty(&vectors)?;
    fs::write(&output_path, json)?;

    println!("✓ Saved to: {}", output_path.display());
    println!("✓ EdDSA-Poseidon test vectors generated successfully!");

    Ok(())
}
