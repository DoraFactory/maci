/**
 * Convert on-chain BN128 vkeys to snarkjs VerificationKey format.
 *
 * On-chain format (Groth16VkeyOnChain from chain.ts):
 *   { vk_alpha1, vk_beta_2, vk_gamma_2, vk_delta_2, vk_ic0, vk_ic1 }
 *   Values are BN128 curve points in uncompressed hex, produced by the SDK's
 *   adaptToUncompressed() which calls ffjavascript's G1/G2.toUncompressed().
 *
 * Byte encoding (following EIP-197 / ffjavascript convention):
 *   G1 point → 64 bytes:  x(32, big-endian) ‖ y(32, big-endian)
 *   G2 point → 128 bytes: x.c1(32) ‖ x.c0(32) ‖ y.c1(32) ‖ y.c0(32)
 *              where c0 = real part, c1 = imaginary part of the Fp2 element
 *
 * snarkjs VerificationKey format:
 *   { protocol:'groth16', curve:'bn128', nPublic:1,
 *     vk_alpha_1: [x,y,'1'],
 *     vk_beta_2:  [[x.c0,x.c1],[y.c0,y.c1],['1','0']],
 *     vk_gamma_2: [[x.c0,x.c1],[y.c0,y.c1],['1','0']],
 *     vk_delta_2: [[x.c0,x.c1],[y.c0,y.c1],['1','0']],
 *     IC: [[x,y,'1'], [x,y,'1']]  (nPublic+1 = 2 elements)
 *   }
 *
 * Note: ffjavascript's toRprBE writes field elements in standard (non-Montgomery)
 * big-endian form, so direct BigInt parsing of the hex bytes is correct.
 */

import type { Groth16VkeyOnChain } from './chain.js';

export type SnarkjsVkey = {
  protocol: string;
  curve: string;
  nPublic: number;
  vk_alpha_1: string[];
  vk_beta_2: string[][];
  vk_gamma_2: string[][];
  vk_delta_2: string[][];
  IC: string[][];
};

/** Parse a G1 uncompressed hex string → snarkjs affine [x, y, '1'] */
function hexToG1(hex: string): string[] {
  // Pad to 128 chars (64 bytes) in case of leading-zero truncation
  const padded = hex.padStart(128, '0');
  if (padded.length !== 128) {
    throw new Error(`G1 hex too long: expected ≤128 chars, got ${hex.length}`);
  }
  const x = BigInt('0x' + padded.slice(0, 64));
  const y = BigInt('0x' + padded.slice(64, 128));
  return [x.toString(), y.toString(), '1'];
}

/**
 * Parse a G2 uncompressed hex string → snarkjs affine [[x.c0,x.c1],[y.c0,y.c1],['1','0']].
 *
 * Byte layout (EIP-197 / ffjavascript): x.c1 ‖ x.c0 ‖ y.c1 ‖ y.c0
 * snarkjs representation: [[c0, c1], [c0, c1], …]  (real first, imaginary second)
 */
function hexToG2(hex: string): string[][] {
  // Pad to 256 chars (128 bytes) in case of leading-zero truncation
  const padded = hex.padStart(256, '0');
  if (padded.length !== 256) {
    throw new Error(`G2 hex too long: expected ≤256 chars, got ${hex.length}`);
  }
  // bytes: x.c1(32) | x.c0(32) | y.c1(32) | y.c0(32)
  const x_c1 = BigInt('0x' + padded.slice(0, 64));
  const x_c0 = BigInt('0x' + padded.slice(64, 128));
  const y_c1 = BigInt('0x' + padded.slice(128, 192));
  const y_c0 = BigInt('0x' + padded.slice(192, 256));
  // snarkjs: [[c0, c1], [c0, c1], ['1', '0']]
  return [
    [x_c0.toString(), x_c1.toString()],
    [y_c0.toString(), y_c1.toString()],
    ['1', '0'],
  ];
}

/**
 * Convert on-chain Groth16VkeyOnChain → snarkjs VerificationKey.
 * The converted key can be passed directly to snarkjs.groth16.verify().
 */
export function chainVkeyToSnarkjs(vkey: Groth16VkeyOnChain): SnarkjsVkey {
  return {
    protocol: 'groth16',
    curve: 'bn128',
    nPublic: 1,
    vk_alpha_1: hexToG1(vkey.vk_alpha1),
    vk_beta_2: hexToG2(vkey.vk_beta_2),
    vk_gamma_2: hexToG2(vkey.vk_gamma_2),
    vk_delta_2: hexToG2(vkey.vk_delta_2),
    IC: [hexToG1(vkey.vk_ic0), hexToG1(vkey.vk_ic1)],
  };
}
