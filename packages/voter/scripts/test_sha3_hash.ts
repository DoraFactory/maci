import { sha256 } from '@noble/hashes/sha256';

/**
 * Convert a contract address to Uint256 format.
 * This replicates the exact logic from the Rust code:
 * Use SHA256 hash + reverse bytes order.
 */
function addressToUint256(address: string): bigint {
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
function bigintToHex(value: bigint): string {
	return '0x' + value.toString(16).padStart(64, '0');
}

// Test example
console.log('=== Address to Uint256 Test (Same as Rust) ===');

const testAddress = 'contract0';
console.log(`Input address: ${testAddress}`);

// Show address bytes
const addressBytes = new TextEncoder().encode(testAddress);
console.log(`Address bytes: [${Array.from(addressBytes).join(', ')}]`);

// Convert using the same method as Rust
const uint256Result = addressToUint256(testAddress);
console.log(`Result (bigint): ${uint256Result}`);
console.log(`Result (hex): ${bigintToHex(uint256Result)}`);

// Verify result matches Rust
const expectedRustResult =
	51788793381365401356776017899576520467898468617578197738183646369208722835043n;
console.log(`\n=== Verification ===`);
console.log(`Rust expected result: ${bigintToHex(expectedRustResult)}`);
console.log(
	`Match: ${uint256Result === expectedRustResult ? '✅ Match' : '❌ Not match'}`
);

const newAddr =
	'dora1ql3m56y42u227h90s4a9pg3ess2m4574y9fmwd5vwgwtw9gtseeqw098al';
const uint256Result2 = addressToUint256(newAddr);
console.log(`Result (bigint): ${uint256Result2}`);
console.log(`Result (hex): ${bigintToHex(uint256Result2)}`);

// Export functions for use in other modules
export { addressToUint256, bigintToHex };
