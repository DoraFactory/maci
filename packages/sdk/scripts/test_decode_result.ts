import { decodeResult, processTallyResults } from '../src/utils/result';

/**
 * Test script for decoding tally results
 *
 * This script tests the decoding logic used in round.ts to extract:
 * - Vote count (high bits)
 * - Voice credits (low bits)
 *
 * Encoding formula: encoded = v * (v + MAX_VOTES)
 * where MAX_VOTES = 10^24
 */

function testDecodeResult() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║          Testing Tally Result Decode Logic                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Test Case 1: Single user with 25 votes
  console.log('📋 Test Case 1: Single user voting 25 times');
  console.log('─────────────────────────────────────────────────────────');
  const encoded1 = '25000000000000000000000625'; // 25 * (25 + 10^24)
  const result1 = decodeResult(encoded1);
  console.log(`Input (encoded):  ${encoded1}`);
  console.log(`Vote count:       ${result1.vote} votes`);
  console.log(`Voice credits:    ${result1.voiceCredit} credits (should be 25²=625)`);
  console.log(
    `✓ Verification:   ${result1.vote} * ${result1.vote} = ${Number(result1.vote) * Number(result1.vote)} ${Number(result1.vote) * Number(result1.vote) === Number(result1.voiceCredit) ? '✓' : '✗'}\n`
  );

  // Test Case 5: Test percentage calculation (simulate round.ts logic)
  console.log('📋 Test Case 5: Test processTallyResults function (like round.ts)');
  console.log('─────────────────────────────────────────────────────────');

  const results = [
    '125000000000000000000000625', // Option A
    '125000000000000000000000625', // Option B
    '125000000000000000000000625', // Option C
    '125000000000000000000000625', // Option D
    '125000000000000000000000625' // Option E
  ];

  console.log('Simulating 5 options with same encoded values...\n');

  // Use the new processTallyResults function
  const { votes, totals, percentages } = processTallyResults(results);

  console.log(`Total votes:      ${totals.v}`);
  console.log(`Total credits:    ${totals.v2}\n`);

  console.log('Percentage distribution:');
  percentages.forEach((p, idx) => {
    console.log(`  Option ${String.fromCharCode(65 + idx)}: ${p.v}% (votes), ${p.v2}% (credits)`);
  });

  console.log('\nDetailed results:');
  votes.forEach((v, idx) => {
    console.log(`  Option ${String.fromCharCode(65 + idx)}: ${v.v} votes, ${v.v2} credits`);
  });

  // Test Case 6: Edge case - zero votes
  console.log('\n📋 Test Case 6: Edge case - zero votes');
  console.log('─────────────────────────────────────────────────────────');
  const encoded6 = '0';
  const result6 = decodeResult(encoded6);
  console.log(`Input (encoded):  ${encoded6}`);
  console.log(`Vote count:       ${result6.vote} votes`);
  console.log(`Voice credits:    ${result6.voiceCredit} credits`);
  console.log(
    `✓ Both should be 0: ${result6.vote === 0n && result6.voiceCredit === 0n ? '✓' : '✗'}\n`
  );

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    All Tests Completed!                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

// Run tests
try {
  testDecodeResult();
} catch (error) {
  console.error('❌ Test failed with error:', error);
  process.exit(1);
}
