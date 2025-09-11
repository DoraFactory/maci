import { sha256 } from '@noble/hashes/sha256';

/**
 * Convert a contract address to Uint256 format.
 * This replicates the exact logic from the Rust code:
 * Use SHA256 hash + reverse bytes order.
 */
export function addressToUint256(address: string): bigint {
	// Convert address string to bytes
	const addressBytes = new TextEncoder().encode(address);

	// Use SHA256 hash to convert the address to a fixed-length 32-byte format
	const hashResult = sha256(addressBytes);

	// Convert bytes to Uint256 (big-endian) with reversal like Rust code
	const uint256Bytes = new Uint8Array(32);
	for (let i = 0; i < hashResult.length && i < 32; i++) {
		uint256Bytes[31 - i] = hashResult[i]; // Reverse for little-endian to big-endian conversion
	}

	// Convert bytes to Uint256 (big-endian)
	let result = 0n;
	for (let i = 0; i < uint256Bytes.length; i++) {
		result = (result << 8n) + BigInt(uint256Bytes[i]);
	}

	return result;
}

/**
 * Convert bigint to hex string.
 */
export function bigintToHex(value: bigint): string {
	return '0x' + value.toString(16).padStart(64, '0');
}
