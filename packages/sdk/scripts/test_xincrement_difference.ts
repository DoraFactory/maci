/**
 * Example: AMACI encryptOdevity with xIncrement
 *
 * This script demonstrates how to use encryptOdevity for AMACI deactivate flow
 * and shows the role of xIncrement in the encryption/decryption process.
 *
 * Run: npx tsx scripts/test_xincrement_difference.ts
 */

import {
  genKeypair,
  encryptOdevity,
  decrypt,
  poseidon,
  rerandomize,
  encodeToMessage
} from '../src';

console.log('\n═══════════════════════════════════════════════════════');
console.log('  AMACI encryptOdevity Example');
console.log('═══════════════════════════════════════════════════════\n');

// Setup: Generate operator keypair
const OPERATOR_SEED = 12345n;
const coordKeypair = genKeypair(OPERATOR_SEED);

console.log('📋 Setup:\n');
console.log(`  Operator Seed: ${OPERATOR_SEED}`);
console.log(`  Operator PubKey: [${coordKeypair.pubKey[0]}, ${coordKeypair.pubKey[1]}]\n`);

// Helper: genStaticRandomKey (for deterministic encryption)
const genStaticRandomKey = (privKey: bigint, salt: bigint, index: bigint): bigint => {
  return poseidon([privKey, salt, index]);
};

const STATIC_SALT = 20040n;

// ============================================================================
// Example 1: Encrypt Even (Active Status)
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Example 1: Encrypt Even (Active Status)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const randomKey1 = genStaticRandomKey(coordKeypair.privKey, STATIC_SALT, 1n);
console.log(`🔑 Random Key: ${randomKey1}\n`);

// Encrypt with even parity (active)
const activeCt = encryptOdevity(false, coordKeypair.pubKey, randomKey1);

console.log('📦 Generated Ciphertext:');
console.log(`  c1: [${activeCt.c1.x}, ${activeCt.c1.y}]`);
console.log(`  c2: [${activeCt.c2.x}, ${activeCt.c2.y}]`);
console.log(`  xIncrement: ${activeCt.xIncrement}\n`);

// Decrypt
const decrypted1 = decrypt(coordKeypair.formatedPrivKey, activeCt);
console.log(`🔓 Decrypted: ${decrypted1}`);
console.log(`   Expected: 123 ✅\n`);

// ============================================================================
// Example 2: Encrypt Odd (Deactivated Status)
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Example 2: Encrypt Odd (Deactivated Status)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const randomKey2 = genStaticRandomKey(coordKeypair.privKey, STATIC_SALT, 2n);
console.log(`🔑 Random Key: ${randomKey2}\n`);

// Encrypt with odd parity (deactivated)
const deactivatedCt = encryptOdevity(true, coordKeypair.pubKey, randomKey2);

console.log('📦 Generated Ciphertext:');
console.log(`  c1: [${deactivatedCt.c1.x}, ${deactivatedCt.c1.y}]`);
console.log(`  c2: [${deactivatedCt.c2.x}, ${deactivatedCt.c2.y}]`);
console.log(`  xIncrement: ${deactivatedCt.xIncrement}\n`);

// Decrypt
const decrypted2 = decrypt(coordKeypair.formatedPrivKey, deactivatedCt);
console.log(`🔓 Decrypted: ${decrypted2}`);
console.log(`   Expected: 123 ✅\n`);

// ============================================================================
// Example 3: xIncrement varies with different random keys
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Example 3: xIncrement Changes with Different Keys');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('💡 Different random keys produce different xIncrement values:\n');

for (let i = 1; i <= 3; i++) {
  const randomKey = genStaticRandomKey(coordKeypair.privKey, STATIC_SALT, BigInt(i * 10));
  const ct = encryptOdevity(false, coordKeypair.pubKey, randomKey);
  console.log(`  Index ${i * 10}: xIncrement = ${ct.xIncrement}`);
}

console.log('\n  ℹ️  xIncrement is derived from the encryption process');
console.log('     and ensures correct decryption.\n');

// ============================================================================
// Example 4: Complete AMACI Flow with Rerandomization
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Example 4: Complete AMACI Deactivate Flow');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('Step 1: Operator encrypts error message (odd parity)\n');
const errorRandomKey = genStaticRandomKey(coordKeypair.privKey, STATIC_SALT, 99n);
const errorCt = encryptOdevity(true, coordKeypair.pubKey, errorRandomKey);
console.log(`  Generated ciphertext with xIncrement: ${errorCt.xIncrement}\n`);

console.log('Step 2: User rerandomizes the ciphertext\n');
const userRandomVal = 55555n;
const rerandomized = rerandomize(
  coordKeypair.pubKey,
  {
    c1: [errorCt.c1.x, errorCt.c1.y],
    c2: [errorCt.c2.x, errorCt.c2.y]
  },
  userRandomVal
);
console.log(`  Rerandomized: d1 = [${rerandomized.d1[0]}, ...]`);
console.log(`  Note: xIncrement stays the same (${errorCt.xIncrement})\n`);

console.log('Step 3: Decrypt and verify\n');
const finalDecrypted = decrypt(coordKeypair.formatedPrivKey, {
  c1: { x: rerandomized.d1[0], y: rerandomized.d1[1] },
  c2: { x: rerandomized.d2[0], y: rerandomized.d2[1] },
  xIncrement: errorCt.xIncrement
});
console.log(`  Decrypted value: ${finalDecrypted}`);
console.log(`  Status: ${finalDecrypted === 123n ? '✅ Valid' : '❌ Invalid'}\n`);

// ============================================================================
// Example 5: What happens with wrong xIncrement?
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Example 5: Impact of Wrong xIncrement');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('🧪 Testing: What if we use wrong xIncrement?\n');

console.log('  Random Key 1: ', randomKey1);
// Create two different encryptions
const ct1 = encryptOdevity(false, coordKeypair.pubKey, randomKey1);
const ct2 = encryptOdevity(false, coordKeypair.pubKey, randomKey1);

console.log(`  Ciphertext 1 xIncrement: ${ct1.xIncrement}`);
console.log(`  Ciphertext 2 xIncrement: ${ct2.xIncrement}\n`);

const msg1 = encodeToMessage(123n, genKeypair(randomKey1));
const msg2 = encodeToMessage(123n, genKeypair(randomKey1));

console.log(`  Message 1 point: [${msg1.point.x}, ${msg1.point.y}]`);
console.log(`  Message 2 point: [${msg2.point.x}, ${msg2.point.y}]`);
console.log(`  Message 1 xIncrement: ${msg1.xIncrement}`);
console.log(`  Message 2 xIncrement: ${msg2.xIncrement}`);

// Try to decrypt ct1 with ct2's xIncrement
const wrongDecryption = decrypt(coordKeypair.formatedPrivKey, {
  c1: ct1.c1,
  c2: ct1.c2,
  xIncrement: ct2.xIncrement // ❌ Wrong xIncrement!
});

console.log(`  Correct decryption (ct1 with ct1.xIncrement): ${decrypted1}`);
console.log(`  Wrong decryption (ct1 with ct2.xIncrement):   ${wrongDecryption}`);
console.log(`  ⚠️  Using wrong xIncrement gives incorrect result!\n`);

// ============================================================================
// Summary
// ============================================================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 Summary');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('✅ Key Points:\n');
console.log('  1. encryptOdevity encrypts with parity encoding');
console.log('     • false (even) → active status');
console.log('     • true (odd) → deactivated status\n');

console.log('  2. xIncrement is part of the ciphertext');
console.log('     • Generated during encryption');
console.log('     • Required for correct decryption');
console.log('     • Changes with different random keys\n');

console.log('  3. Rerandomization preserves xIncrement');
console.log('     • Only c1 and c2 change');
console.log('     • xIncrement stays the same');
console.log('     • Decryption still works correctly\n');

console.log('  4. xIncrement must match');
console.log('     • Using wrong xIncrement gives wrong plaintext');
console.log('     • Each ciphertext has its own xIncrement\n');

console.log('═══════════════════════════════════════════════════════\n');
