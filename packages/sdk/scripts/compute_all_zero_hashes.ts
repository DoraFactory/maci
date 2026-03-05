/**
 * Compute All Zero Hash Arrays for amaci Contract
 *
 * Usage:
 *   npx ts-node --transpile-only \
 *     --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' \
 *     scripts/compute_all_zero_hashes.ts [maxDepth]
 *
 *   maxDepth defaults to 9 (matches the maximum supported circuit depth).
 *
 * The amaci contract uses three precomputed zero hash arrays:
 *
 * 1. QTR_LIB / ZEROS  — 5-ary quinary tree, zero leaf = 0
 *    zeros[0] = 0
 *    zeros[i] = poseidon5(zeros[i-1] × 5)
 *    Required size for maxDepth d: indices 0 … (d + 2)
 *    → QTR_LIB: root_of(vote_option_tree_depth, results[])
 *    → ZEROS:   initial deactivate commitment = hash2([zeros[d], zeros[d+2]])
 *
 * 2. ZEROS_H10 — 5-ary quinary tree, zero leaf = hash10([0 × 10])
 *    zeros_h10[0] = hash10([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
 *    zeros_h10[i] = poseidon5(zeros_h10[i-1] × 5)
 *    Required size for maxDepth d: indices 0 … d
 *    → state_update_at() fallback, initial NODES[0] = zeros_h10[state_tree_depth]
 */

import { hash10 } from '../src/libs/crypto/hashing';
import { Tree } from '../src/libs/crypto/tree';

// ---------------------------------------------------------------------------
// Configuration — parse maxDepth from CLI arg (default 9)
// ---------------------------------------------------------------------------

const MAX_DEPTH: number = (() => {
  const arg = process.argv[2];
  if (arg !== undefined) {
    const n = parseInt(arg, 10);
    if (isNaN(n) || n < 1 || n > 20) {
      console.error(`Invalid maxDepth "${arg}". Must be an integer between 1 and 20.`);
      process.exit(1);
    }
    return n;
  }
  return 9;
})();

// QTR_LIB / ZEROS need indices 0 … (MAX_DEPTH + 2)
const QTR_MAX_IDX = MAX_DEPTH + 2;
// ZEROS_H10 needs indices 0 … MAX_DEPTH
const H10_MAX_IDX = MAX_DEPTH;

// ---------------------------------------------------------------------------
// Existing contract hardcoded values (for diff / verification)
// ---------------------------------------------------------------------------

function hexToBigInt(hex: string): bigint {
  return BigInt('0x' + hex);
}

const CURRENT_QTR_AND_ZEROS: bigint[] = [
  0n,
  hexToBigInt('2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc'),
  hexToBigInt('2a956d37d8e73692877b104630a08cc6840036f235f2134b0606769a369d85c1'),
  hexToBigInt('2f9791ba036a4148ff026c074e713a4824415530dec0f0b16c5115aa00e4b825'),
  hexToBigInt('2c41a7294c7ef5c9c5950dc627c55a00adb6712548bcbd6cd8569b1f2e5acc2a'),
  hexToBigInt('2594ba68eb0f314eabbeea1d847374cc2be7965944dec513746606a1f2fadf2e'),
  hexToBigInt('5c697158c9032bfd7041223a7dba696396388129118ae8f867266eb64fe7636'),
  hexToBigInt('272b3425fcc3b2c45015559b9941fde27527aab5226045bf9b0a6c1fe902d601'),
  hexToBigInt('268d82cc07023a1d5e7c987cbd0328b34762c9ea21369bea418f08b71b16846a')
];

const CURRENT_ZEROS_H10: bigint[] = [
  hexToBigInt('26318ec8cdeef483522c15e9b226314ae39b86cde2a430dabf6ed19791917c47'),
  hexToBigInt('28413250bf1cc56fabffd2fa32b52624941da885248fd1e015319e02c02abaf2'),
  hexToBigInt('16738da97527034e095ac32bfab88497ca73a7b310a2744ab43971e82215cb6d'),
  hexToBigInt('28140849348769fde6e971eec1424a5a162873a3d8adcbfdfc188e9c9d25faa3'),
  hexToBigInt('1a07af159d19f68ed2aed0df224dabcc2e2321595968769f7c9e26591377ed9a'),
  hexToBigInt('205cd249acba8f95f2e32ed51fa9c3d8e6f0d021892225d3efa9cd84c8fc1cad'),
  hexToBigInt('b21c625cd270e71c2ee266c939361515e690be27e26cfc852a30b24e83504b0')
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toHex(value: bigint): string {
  return value.toString(16);
}

function toDec(value: bigint): string {
  return value.toString(10);
}

function sep(title?: string) {
  if (title) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(title);
    console.log('─'.repeat(60));
  } else {
    console.log('─'.repeat(60));
  }
}

/**
 * Print all computed values, marking existing vs new entries.
 */
function printValues(values: bigint[], existing: bigint[]) {
  for (let i = 0; i < values.length; i++) {
    const isNew = i >= existing.length;
    const existMatch = !isNew && existing[i] === values[i];
    const tag = isNew ? ' [NEW]' : existMatch ? '      ' : ' [!!!]';
    console.log(`  [${String(i).padStart(2, ' ')}]${tag}  0x${toHex(values[i])}`);
    console.log(`         ${' '.repeat(tag.length - 1)}  = ${toDec(values[i])}`);
  }
}

/**
 * Verify computed values against the existing (already-deployed) contract values.
 * Only checks indices that exist in `existing`.
 */
function verifyExisting(label: string, computed: bigint[], existing: bigint[]): boolean {
  let ok = true;
  const overlap = Math.min(computed.length, existing.length);
  for (let i = 0; i < overlap; i++) {
    if (computed[i] !== existing[i]) {
      ok = false;
      console.log(`  [${i}] ❌ MISMATCH`);
      console.log(`       computed : 0x${toHex(computed[i])}`);
      console.log(`       existing : 0x${toHex(existing[i])}`);
    }
  }
  if (ok) {
    console.log(`  ✅ Existing ${overlap} values verified correctly (${label})`);
  }
  return ok;
}

/**
 * Format the full array as a Rust literal.
 */
function rustArray(varName: string, values: bigint[], existingLen: number): string {
  const lines: string[] = [];
  lines.push(`let ${varName}: [Uint256; ${values.length}] = [`);
  for (let i = 0; i < values.length; i++) {
    const isNew = i >= existingLen;
    const prefix = isNew ? '    // NEW: ' : '    ';
    if (values[i] === 0n) {
      lines.push(`${prefix}Uint256::from_u128(0u128),`);
    } else {
      lines.push(`${prefix}uint256_from_hex_string("${toHex(values[i])}"),`);
      lines.push(`${prefix}//     "${toDec(values[i])}",`);
    }
  }
  lines.push('];');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  amaci Contract — Zero Hash Generator  (maxDepth = ${String(MAX_DEPTH).padEnd(2)})   ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Circuit max state_tree_depth : ${MAX_DEPTH}`);
  console.log(`  QTR_LIB / ZEROS need indices : 0 … ${QTR_MAX_IDX}  → ${QTR_MAX_IDX + 1} elements`);
  console.log(`  ZEROS_H10        need indices : 0 … ${H10_MAX_IDX}  → ${H10_MAX_IDX + 1} elements`);
  console.log('');
  console.log(`  Current contract has:`);
  console.log(`    QTR_LIB / ZEROS : ${CURRENT_QTR_AND_ZEROS.length} elements (indices 0 … ${CURRENT_QTR_AND_ZEROS.length - 1})`);
  console.log(`    ZEROS_H10       : ${CURRENT_ZEROS_H10.length} elements (indices 0 … ${CURRENT_ZEROS_H10.length - 1})`);

  const qtrNeedMore = QTR_MAX_IDX + 1 > CURRENT_QTR_AND_ZEROS.length;
  const h10NeedMore = H10_MAX_IDX + 1 > CURRENT_ZEROS_H10.length;
  if (qtrNeedMore || h10NeedMore) {
    console.log('');
    console.log('  ⚠️  Contract arrays need to be expanded:');
    if (qtrNeedMore) {
      const needed = QTR_MAX_IDX + 1 - CURRENT_QTR_AND_ZEROS.length;
      console.log(`    QTR_LIB / ZEROS  +${needed} new element(s) required`);
    }
    if (h10NeedMore) {
      const needed = H10_MAX_IDX + 1 - CURRENT_ZEROS_H10.length;
      console.log(`    ZEROS_H10        +${needed} new element(s) required`);
    }
  } else {
    console.log('');
    console.log('  ✅ Current contract arrays are sufficient for this maxDepth.');
  }

  // =========================================================================
  // Array 1: QTR_LIB / ZEROS
  // =========================================================================

  sep('Array 1: QTR_LIB  (QuinaryTreeRoot.zeros)  /  ZEROS');
  console.log(`  Tree  : 5-ary quinary Merkle tree, degree = 5`);
  console.log(`  Leaf  : 0  (plain zero)`);
  console.log(`  zeros[0] = 0`);
  console.log(`  zeros[i] = poseidon5(zeros[i-1] × 5)`);
  console.log('');
  console.log('  QTR_LIB → root_of(vote_option_tree_depth, results[])');
  console.log('  ZEROS   → initial deactivate commitment:');
  console.log('            hash2([ zeros[state_tree_depth], zeros[state_tree_depth + 2] ])');
  console.log('');

  const qtrZeros = Tree.computeZeroHashes(5, QTR_MAX_IDX, 0n);

  console.log('  Computed values  (* = existing contract value, NEW = needs to be added):');
  printValues(qtrZeros, CURRENT_QTR_AND_ZEROS);
  console.log('');
  console.log('  Consistency check against existing contract values:');
  verifyExisting('QTR_LIB / ZEROS', qtrZeros, CURRENT_QTR_AND_ZEROS);

  // =========================================================================
  // Array 2: ZEROS_H10
  // =========================================================================

  sep('Array 2: ZEROS_H10');
  console.log(`  Tree  : 5-ary quinary Merkle tree, degree = 5`);
  console.log(`  Leaf  : hash10([0 × 10])`);
  console.log(`        = poseidon2(poseidon5(0,0,0,0,0), poseidon5(0,0,0,0,0))`);
  console.log(`        = hash of an all-zero StateLeaf`);
  console.log(`  zeros_h10[0] = hash10([0 × 10])`);
  console.log(`  zeros_h10[i] = poseidon5(zeros_h10[i-1] × 5)`);
  console.log('');
  console.log('  Usage → state_update_at() fallback for uninitialised NODES children');
  console.log('          NODES[0] (initial state tree root) = zeros_h10[state_tree_depth]');
  console.log('');

  const stateLeafZero = hash10(new Array(10).fill(0n));
  console.log(`  Zero leaf:  hash10([0 × 10])`);
  console.log(`            = 0x${toHex(stateLeafZero)}`);
  console.log(`            = ${toDec(stateLeafZero)}`);
  console.log('');

  const zerosH10 = Tree.computeZeroHashes(5, H10_MAX_IDX, stateLeafZero);

  console.log('  Computed values  (* = existing contract value, NEW = needs to be added):');
  printValues(zerosH10, CURRENT_ZEROS_H10);
  console.log('');
  console.log('  Consistency check against existing contract values:');
  verifyExisting('ZEROS_H10', zerosH10, CURRENT_ZEROS_H10);

  // =========================================================================
  // Required values per depth — quick reference table
  // =========================================================================

  sep('Quick reference: required indices per state_tree_depth');
  console.log('');
  console.log('  depth │ ZEROS[depth] │ ZEROS[depth+2] │ ZEROS_H10[depth]');
  console.log('  ──────┼─────────────────────────────────────────────────');
  for (let d = 1; d <= MAX_DEPTH; d++) {
    const z_d  = `0x${toHex(qtrZeros[d]).slice(0, 10)}…`;
    const z_d2 = `0x${toHex(qtrZeros[d + 2]).slice(0, 10)}…`;
    const h_d  = `0x${toHex(zerosH10[d]).slice(0, 10)}…`;
    const mark = d >= CURRENT_QTR_AND_ZEROS.length || d + 2 >= CURRENT_QTR_AND_ZEROS.length || d >= CURRENT_ZEROS_H10.length
      ? ' ← NEW'
      : '';
    console.log(`    ${String(d).padEnd(3)} │ ${z_d}  │ ${z_d2}    │ ${h_d}${mark}`);
  }

  // =========================================================================
  // Rust format output
  // =========================================================================

  sep('Rust format — full arrays for contract.rs');
  console.log('');
  console.log('  // QTR_LIB');
  console.log('  // (also paste the same values for the ZEROS array)');
  console.log(rustArray('zeros', qtrZeros, CURRENT_QTR_AND_ZEROS.length));
  console.log('');
  console.log('  // ZEROS_H10');
  console.log(rustArray('zeros_h10', zerosH10, CURRENT_ZEROS_H10.length));

  // =========================================================================
  // Contract type annotations (Rust sizes)
  // =========================================================================

  sep('Contract type annotation changes needed');
  console.log('');
  if (qtrNeedMore) {
    console.log(`  pub zeros: [Uint256; ${qtrZeros.length}]   // was ${CURRENT_QTR_AND_ZEROS.length}, expanded for depth ${MAX_DEPTH}`);
    console.log(`  pub const ZEROS: Item<[Uint256; ${qtrZeros.length}]>  // same`);
  } else {
    console.log(`  QTR_LIB / ZEROS: no type change needed  ([Uint256; ${CURRENT_QTR_AND_ZEROS.length}] is sufficient)`);
  }
  if (h10NeedMore) {
    console.log(`  pub const ZEROS_H10: Item<[Uint256; ${zerosH10.length}]>  // was ${CURRENT_ZEROS_H10.length}, expanded for depth ${MAX_DEPTH}`);
  } else {
    console.log(`  ZEROS_H10: no type change needed  ([Uint256; ${CURRENT_ZEROS_H10.length}] is sufficient)`);
  }
  console.log('');
}

main();
