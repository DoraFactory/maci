/**
 * Compute Zero Hashes for Merkle Tree
 *
 * This script computes the zero hashes for each level of a 5-ary Merkle tree.
 * These zero hashes represent the root hash of an empty subtree at each depth.
 *
 * For a 5-ary tree:
 * - zeros[0] = 0 (the zero leaf value)
 * - zeros[1] = poseidon([0, 0, 0, 0, 0]) (hash of 5 zero leaves)
 * - zeros[2] = poseidon([zeros[1], zeros[1], zeros[1], zeros[1], zeros[1]])
 * - zeros[k] = poseidon([zeros[k-1], zeros[k-1], zeros[k-1], zeros[k-1], zeros[k-1]])
 *
 * These values are used in the smart contract to efficiently compute tree roots
 * and commitments for sparse trees where many leaves are zero.
 */

import { Tree } from '../src/libs/crypto/tree';

/**
 * Convert a bigint to a hex string with 0x prefix
 */
function toHexString(value: bigint): string {
  return '0x' + value.toString(16);
}

/**
 * Convert a bigint to a decimal string
 */
function toDecimalString(value: bigint): string {
  return value.toString(10);
}

/**
 * Format for Rust contract array initialization
 */
function formatForRust(values: bigint[]): string {
  const lines: string[] = [];
  lines.push('let zeros: [Uint256; ' + values.length + '] = [');

  for (let i = 0; i < values.length; i++) {
    const hex = toHexString(values[i]);
    const dec = toDecimalString(values[i]);

    if (i === 0) {
      lines.push('    Uint256::from_u128(0u128),');
    } else {
      lines.push(`    uint256_from_hex_string("${hex.slice(2)}"),`);
      lines.push(`    //     "${dec}",`);
    }
  }

  lines.push('];');
  return lines.join('\n');
}

/**
 * Main function to compute and display zero hashes
 */
function main() {
  // Compute zero hashes for depths 0 through 12
  // This supports state trees up to depth 10 (since we need depth + 2)
  const maxDepth = 12;
  const degree = 5; // 5-ary tree
  const zeroValue = 0n;

  console.log('Computing Zero Hashes for 5-ary Merkle Tree');
  console.log('============================================\n');

  // Use the Tree class's static method to compute zero hashes
  const zeroHashes = Tree.computeZeroHashes(degree, maxDepth, zeroValue);

  console.log('Zero Hashes (Hexadecimal):');
  console.log('--------------------------');
  for (let i = 0; i <= maxDepth; i++) {
    console.log(`zeros[${i.toString().padStart(2, ' ')}] = ${toHexString(zeroHashes[i])}`);
  }

  console.log('\n');
  console.log('Zero Hashes (Decimal):');
  console.log('----------------------');
  for (let i = 0; i <= maxDepth; i++) {
    console.log(`zeros[${i.toString().padStart(2, ' ')}] = ${toDecimalString(zeroHashes[i])}`);
  }

  console.log('\n');
  console.log('Rust Contract Format:');
  console.log('---------------------');
  console.log(formatForRust(zeroHashes));

  console.log('\n');
  console.log('Usage in Contract:');
  console.log('------------------');
  console.log('For state_tree_depth = 6:');
  console.log(`  - Need zeros[6] = ${toHexString(zeroHashes[6])}`);
  console.log(`  - Need zeros[8] = ${toHexString(zeroHashes[8])}`);
  console.log('For state_tree_depth = 8:');
  console.log(`  - Need zeros[8] = ${toHexString(zeroHashes[8])}`);
  console.log(`  - Need zeros[10] = ${toHexString(zeroHashes[10])}`);

  console.log('\n');
  console.log('Verification:');
  console.log('-------------');
  // Verify by creating a tree and checking the zeros match
  const testTree = new Tree(degree, 3, zeroValue);
  console.log('Created test tree with depth=3');
  console.log(`Tree zeros[0] matches: ${testTree['zeros'][0] === zeroHashes[0]}`);
  console.log(`Tree zeros[1] matches: ${testTree['zeros'][1] === zeroHashes[1]}`);
  console.log(`Tree zeros[2] matches: ${testTree['zeros'][2] === zeroHashes[2]}`);
  console.log(`Tree zeros[3] matches: ${testTree['zeros'][3] === zeroHashes[3]}`);
}

// Run the script
main();
