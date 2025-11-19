import { createHash } from 'crypto';
import * as secp256k1 from 'secp256k1';

/**
 * Certificate Generator for API-MACI whitelist
 *
 * This module generates secp256k1 signatures for user registration,
 * matching the format expected by the API-MACI contract.
 */

// Backend private key for signing certificates
const BACKEND_PRIVATE_KEY_HEX = '9d40735f59398e3772b17be72e99f54b9f8ad1a27b609c5f66f1f863778da583';

// Backend public key (base64 encoded)
const BACKEND_PUBLIC_KEY_BASE64 = 'Agormzjuug8KKM8LMOnB4sjU8OEBqF08izQpEUwVyUAK';

/**
 * Convert contract address to Uint256 format (matching contract logic)
 * The contract hashes the address and converts it to Uint256
 *
 * @param contractAddress The contract address string
 * @returns Uint256 representation as string
 */
function addressToUint256(contractAddress: string): string {
  // Hash the address bytes
  const addressBytes = Buffer.from(contractAddress, 'utf8');
  const hash = createHash('sha256').update(addressBytes).digest();

  // Reverse bytes for little-endian to big-endian conversion
  const reversedBytes = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    reversedBytes[31 - i] = hash[i];
  }

  // Convert to BigInt and then to string
  let uint256 = BigInt(0);
  for (let i = 0; i < 32; i++) {
    uint256 = (uint256 << BigInt(8)) | BigInt(reversedBytes[i]);
  }

  return uint256.toString();
}

/**
 * Generate certificate for a user's MACI public key
 *
 * @param contractAddress The MACI contract address
 * @param pubkeyX User's MACI public key X coordinate
 * @param pubkeyY User's MACI public key Y coordinate
 * @param amount Amount/voting power for the user
 * @returns Base64 encoded signature (certificate)
 */
export function generateCertificate(
  contractAddress: string,
  pubkeyX: string,
  pubkeyY: string,
  amount: string
): string {
  // Convert contract address to Uint256 format (matching contract logic)
  const contractAddressUint256 = addressToUint256(contractAddress);

  // Create payload matching the contract's expected format
  const payload = {
    amount: amount,
    contract_address: contractAddressUint256,
    pubkey_x: pubkeyX,
    pubkey_y: pubkeyY
  };

  // Convert payload to bytes and hash with SHA256
  const message = JSON.stringify(payload);
  const messageBytes = Buffer.from(message, 'utf8');
  const hash = createHash('sha256').update(messageBytes).digest();

  // Parse private key from hex
  const privateKeyBytes = Buffer.from(BACKEND_PRIVATE_KEY_HEX, 'hex');

  // Sign the hash
  const signatureObj = secp256k1.ecdsaSign(hash, privateKeyBytes);

  // Serialize signature to compact format (64 bytes)
  const signature = signatureObj.signature;

  // Encode to base64
  return Buffer.from(signature).toString('base64');
}

/**
 * Get the backend public key for instantiating contracts
 *
 * @returns Base64 encoded backend public key
 */
export function getBackendPublicKey(): string {
  return BACKEND_PUBLIC_KEY_BASE64;
}

/**
 * Verify that the private key matches the public key
 *
 * @returns true if keys match
 */
export function verifyKeypair(): boolean {
  try {
    const privateKeyBytes = Buffer.from(BACKEND_PRIVATE_KEY_HEX, 'hex');
    const publicKey = secp256k1.publicKeyCreate(privateKeyBytes);
    const publicKeyBase64 = Buffer.from(publicKey).toString('base64');

    return publicKeyBase64 === BACKEND_PUBLIC_KEY_BASE64;
  } catch (error) {
    console.error('Failed to verify keypair:', error);
    return false;
  }
}

/**
 * Helper function to generate certificate from bigint coordinates
 *
 * @param contractAddress The MACI contract address
 * @param pubkey Tuple of [x, y] coordinates as bigints
 * @param amount Amount/voting power for the user
 * @returns Base64 encoded signature (certificate)
 */
export function generateCertificateFromBigInt(
  contractAddress: string,
  pubkey: [bigint, bigint],
  amount: string
): string {
  return generateCertificate(contractAddress, pubkey[0].toString(), pubkey[1].toString(), amount);
}
