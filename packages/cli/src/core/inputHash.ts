/**
 * Compute the input_hash fed to snarkjs groth16.verify, matching the contract's:
 *
 *   fn compute_input_hash(input: &[Uint256]) -> Uint256 {
 *     uint256_from_hex_string(&hash_256_uint256_list(input))
 *       % SNARK_SCALAR_FIELD
 *   }
 *
 * Each Uint256 is serialized as a 32-byte big-endian value; all inputs are
 * concatenated and SHA-256'd; the resulting 32-byte value is interpreted as a
 * big-endian unsigned integer and taken modulo the BN128 scalar field order.
 *
 * The contract passes a SINGLE public signal to groth16_verify:
 *   [uint256_to_field(&input_hash)]
 * So snarkjs receives publicSignals = [inputHash.toString()].
 */

import { createHash } from 'crypto';

const SNARK_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * Convert a BigInt to a 32-byte big-endian Buffer.
 * Matching Rust's `Uint256::to_be_bytes()`.
 */
function uint256ToBeBytes(n: bigint): Buffer {
  const hex = n.toString(16).padStart(64, '0');
  return Buffer.from(hex, 'hex');
}

/**
 * Compute SHA-256(inputs[0] || inputs[1] || … || inputs[N-1]) % SNARK_SCALAR_FIELD.
 * Each input is serialised as 32 big-endian bytes.
 */
export function computeInputHash(inputs: bigint[]): bigint {
  const buf = Buffer.concat(inputs.map(uint256ToBeBytes));
  const digest = createHash('sha256').update(buf).digest();
  const hashBigInt = BigInt('0x' + digest.toString('hex'));
  return hashBigInt % SNARK_SCALAR_FIELD;
}
