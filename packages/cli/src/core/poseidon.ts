/**
 * Poseidon hash functions — aligned with the SDK (packages/sdk/src/libs/crypto/hashing.ts).
 *
 * Uses @zk-kit/poseidon-cipher (same dependency as the SDK) instead of circomlibjs.
 *
 * Core primitive (mirroring SDK):
 *   poseidon(inputs) = poseidonPerm([0n, ...inputs])[0]
 *
 * Named variants:
 *   hash2([a, b])           — poseidonT3:  matches contract's hash2([a, b])
 *   hash5([a,b,c,d,e])      — poseidonT6:  matches contract's hash5([a,b,c,d,e])
 *   hash13([m[0..10], x, y, prev]) — matches contract's hash_message_and_enc_pub_key
 *
 * All functions are synchronous (no async builder needed).
 */

import { poseidonPerm } from '@zk-kit/poseidon-cipher';

// ─── Core primitive ───────────────────────────────────────────────────────────

/** Poseidon hash for N inputs — matches SDK's `poseidon()` */
function poseidon(inputs: bigint[]): bigint {
  return poseidonPerm([BigInt(0), ...inputs.map((x) => BigInt(x))])[0];
}

// ─── Named arity variants (match SDK naming) ──────────────────────────────────

/** 2-input Poseidon (width T3) — matches SDK's hash2 / contract's hash2 */
export function hash2(a: bigint, b: bigint): bigint {
  return poseidon([a, b]);
}

/** 5-input Poseidon (width T6) — matches SDK's hash5 / contract's hash5 */
export function hash5(
  a: bigint,
  b: bigint,
  c: bigint,
  d: bigint,
  e: bigint
): bigint {
  return poseidon([a, b, c, d, e]);
}

/**
 * Hash 13 elements — matches SDK's hash13 / contract's hash_message_and_enc_pub_key.
 *
 * Contract logic:
 *   m_hash  = hash5(data[0..5])
 *   n_hash  = hash5(data[5..10])
 *   result  = hash5([m_hash, n_hash, encPub.x, encPub.y, prevHash])
 *
 * Equivalent to:
 *   hash13([data[0..10], encPub.x, encPub.y, prevHash])
 *   = poseidonT6([poseidonT6(data[0..5]), poseidonT6(data[5..10]), encPub.x, encPub.y, prevHash])
 */
export function hash13(elements: bigint[]): bigint {
  // Pad to exactly 13 elements
  const padded = [...elements];
  while (padded.length < 13) padded.push(0n);

  return hash5(
    hash5(padded[0], padded[1], padded[2], padded[3], padded[4]),
    hash5(padded[5], padded[6], padded[7], padded[8], padded[9]),
    padded[10],
    padded[11],
    padded[12]
  );
}

// ─── Convenience aliases used by poseidon2/poseidon5 callers ─────────────────

/** Alias for hash2 — for code that uses the poseidon2(a, b) call pattern */
export function poseidon2(a: bigint, b: bigint): bigint {
  return hash2(a, b);
}

/** Alias for hash5 — for code that uses the poseidon5(...) call pattern */
export function poseidon5(
  a: bigint,
  b: bigint,
  c: bigint,
  d: bigint,
  e: bigint
): bigint {
  return hash5(a, b, c, d, e);
}
