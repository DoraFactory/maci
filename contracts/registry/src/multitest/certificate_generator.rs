use base64::{engine::general_purpose, Engine as _};
use cosmwasm_std::{Addr, Uint256};
use secp256k1::{Message, PublicKey, Secp256k1, SecretKey};
use serde_json;
use sha2::{Digest, Sha256};

// Private key (hex format) - Keep consistent with api-maci
const PRIVATE_KEY_HEX: &str = "84d85037a14db4a7a1424084cca70211685ad65f7325c4d26aca93edfb2995df";

// Pubkey (base64) - Keep consistent with api-maci
const PUBKEY_B64: &str = "A9ekxvWjYNpnHTasS008PG+EuF2ssIkUPaDdnn8ZdzTb";

/// Convert a contract address to Uint256 format
/// This function takes the address bytes and converts them to a Uint256
fn address_to_uint256(address: &Addr) -> Uint256 {
    let address_bytes = address.as_bytes();

    // Use SHA256 hash to convert the address to a fixed-length 32-byte format
    let mut hasher = Sha256::new();
    hasher.update(address_bytes);
    let hash_result = hasher.finalize();

    // Convert the hash bytes to Uint256
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(&hash_result[..]);

    // Convert bytes to Uint256 (big-endian)
    let mut uint256_bytes = [0u8; 32];
    for (i, &byte) in bytes.iter().enumerate() {
        uint256_bytes[31 - i] = byte; // Reverse for little-endian to big-endian conversion
    }

    Uint256::from_be_bytes(uint256_bytes)
}

/// Generate certificate for given user pubkey and amount (for registry oracle mode)
pub fn generate_certificate_for_pubkey(
    contract_address: &str,
    pubkey_x: &str,
    pubkey_y: &str,
    amount: u128,
) -> String {
    // Convert contract address to Uint256 format to match amaci logic
    let addr = Addr::unchecked(contract_address);
    let contract_address_uint256 = address_to_uint256(&addr);

    // Create payload matching the amaci oracle format
    let payload = serde_json::json!({
        "amount": amount.to_string(),
        "contract_address": contract_address_uint256.to_string(),
        "pubkey_x": pubkey_x,
        "pubkey_y": pubkey_y,
    });

    let msg = payload.to_string().into_bytes();
    let hash = Sha256::digest(&msg);

    // Parse private key
    let private_key_bytes = hex::decode(PRIVATE_KEY_HEX).expect("Invalid private key hex");
    let secret_key = SecretKey::from_slice(&private_key_bytes).expect("Invalid private key");

    // Create secp256k1 context
    let secp = Secp256k1::new();

    // Create message object
    let message = Message::from_slice(&hash).expect("32 bytes");

    // Sign
    let signature = secp.sign_ecdsa(&message, &secret_key);

    // Serialize signature and convert to base64
    let signature_bytes = signature.serialize_compact();
    general_purpose::STANDARD.encode(&signature_bytes)
}

/// Get backend public key for oracle verification
pub fn get_backend_pubkey() -> String {
    PUBKEY_B64.to_string()
}

/// Verify if public key matches private key
pub fn verify_keypair() -> bool {
    let private_key_bytes = hex::decode(PRIVATE_KEY_HEX).expect("Invalid private key hex");
    let secret_key = SecretKey::from_slice(&private_key_bytes).expect("Invalid private key");

    let secp = Secp256k1::new();
    let public_key = PublicKey::from_secret_key(&secp, &secret_key);

    // Expected public key (base64)
    let expected_pubkey_b64 = PUBKEY_B64;
    let expected_pubkey_bytes = general_purpose::STANDARD
        .decode(expected_pubkey_b64)
        .expect("Invalid base64");

    // Compare public keys
    public_key.serialize().to_vec() == expected_pubkey_bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keypair_match() {
        assert!(verify_keypair(), "Public key and private key do not match");
    }

    #[test]
    fn test_certificate_generation_for_pubkey() {
        let pubkey_x =
            "3557592161792765812904087712812111121909518311142005886657252371904276697771";
        let pubkey_y =
            "4363822302427519764561660537570341277214758164895027920046745209970137856681";
        let certificate = generate_certificate_for_pubkey("contract0", pubkey_x, pubkey_y, 100u128);

        // Ensure certificate is not empty
        assert!(!certificate.is_empty());

        // Ensure certificate is valid base64
        assert!(general_purpose::STANDARD.decode(&certificate).is_ok());

        println!("Generated certificate for pubkey: {}", certificate);
    }

    #[test]
    fn test_different_pubkeys() {
        let pubkey0_x =
            "3557592161792765812904087712812111121909518311142005886657252371904276697771";
        let pubkey0_y =
            "4363822302427519764561660537570341277214758164895027920046745209970137856681";
        let pubkey1_x =
            "1234567890123456789012345678901234567890123456789012345678901234567890123456";
        let pubkey1_y =
            "9876543210987654321098765432109876543210987654321098765432109876543210987654";

        let cert0 = generate_certificate_for_pubkey("contract0", pubkey0_x, pubkey0_y, 100u128);
        let cert1 = generate_certificate_for_pubkey("contract0", pubkey1_x, pubkey1_y, 100u128);

        // Different pubkeys should have different certificates
        assert_ne!(cert0, cert1);

        println!("Pubkey 0 certificate: {}", cert0);
        println!("Pubkey 1 certificate: {}", cert1);
    }

    #[test]
    fn test_registry_specific_functionality() {
        // Test registry-specific use cases
        let registry_contract = "registry-contract-addr";
        let pubkey_x =
            "3557592161792765812904087712812111121909518311142005886657252371904276697771";
        let pubkey_y =
            "4363822302427519764561660537570341277214758164895027920046745209970137856681";

        let certificate =
            generate_certificate_for_pubkey(registry_contract, pubkey_x, pubkey_y, 50u128);

        // Ensure certificate is not empty
        assert!(!certificate.is_empty());

        // Ensure certificate is valid base64
        assert!(general_purpose::STANDARD.decode(&certificate).is_ok());

        // Test that get_backend_pubkey returns consistent value
        let backend_pubkey = get_backend_pubkey();
        assert_eq!(backend_pubkey, PUBKEY_B64);

        println!("Registry certificate: {}", certificate);
        println!("Backend pubkey: {}", backend_pubkey);
    }
}
