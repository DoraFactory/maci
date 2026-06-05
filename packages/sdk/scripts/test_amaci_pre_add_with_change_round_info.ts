/**
 * Round Info Change Permission Test
 *
 * This script demonstrates the round info modification restriction:
 * - Round info CAN be updated before voting starts
 * - Round info CANNOT be updated once voting has started (contract returns PeriodError)
 *
 * Steps:
 * 1. Create Tenant and API Key
 * 2. Create AMACI Round (voting starts ~1 minute from now)
 * 3. Update round info BEFORE voting starts → should succeed
 * 4. Wait until voting starts
 * 5. Update round info AFTER voting starts → should fail with PeriodError
 */

import { MaciClient } from '../src/maci';
import { MaciCircuitType } from '../src/types';
import dotenv from 'dotenv';
dotenv.config();

function generateRandomString(length: number) {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // const network = 'mainnet';
  // const operator = 'dora16nkezrnvw9fzqqqmmqtrdkw3pqes6qthhse2k4';

  const network = 'testnet';
  const operator = 'dora149n5yhzgk5gex0eqmnnpnsxh6ys4exg5xyqjzm';

  console.log('='.repeat(80));
  console.log('Round Info Change Permission Test');
  console.log('Verify: round info is locked once voting starts');
  console.log('='.repeat(80));

  const API_BASE_URL = undefined;

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    throw new Error('ADMIN_SECRET environment variable is not set');
  }

  // ==================== 1. Create Tenant and API Key ====================
  const tenantName = `RoundInfo Test ${generateRandomString(8)}`;
  console.log(`\n[1/5] Creating Tenant: ${tenantName}`);

  const adminMaciClient = new MaciClient({
    network,
    saasApiEndpoint: API_BASE_URL
  });

  const tenantData = await adminMaciClient
    .getSaasApiClient()
    .createTenant({ name: tenantName }, adminSecret);
  console.log('✓ Tenant created:', tenantData.id);

  const apiKeyData = await adminMaciClient
    .getSaasApiClient()
    .createApiKey(
      { tenantId: tenantData.id, label: 'RoundInfo Test Key', plan: 'pro' },
      adminSecret
    );
  const apiKey = apiKeyData.apiKey;
  console.log('✓ API Key created:', apiKey);

  const maciClient = new MaciClient({
    network,
    saasApiEndpoint: API_BASE_URL,
    saasApiKey: apiKey
  });

  // ==================== 2. Create AMACI Round ====================
  // Voting starts in 2 minutes to give enough time to test the pre-start update,
  // then wait for start and confirm the post-start update fails.
  const VOTING_START_DELAY_MS = 2 * 60 * 1000; // 2 minutes
  const startVoting = new Date(Date.now() + VOTING_START_DELAY_MS);
  const endVoting = new Date(startVoting.getTime() + 11 * 60 * 1000); // 11 minutes

  console.log(`\n[2/5] Creating AMACI Round`);
  console.log(`  Voting start : ${startVoting.toISOString()}`);
  console.log(`  Voting end   : ${endVoting.toISOString()}`);

  const createRoundData = await maciClient.saasCreateAmaciRound({
    title: 'Round Info Test Round',
    description: 'Testing round info modification restrictions',
    link: 'https://test.com',
    startVoting: startVoting.toISOString(),
    endVoting: endVoting.toISOString(),
    operator,
    maxVoter: 25,
    voteOptionMap: ['Option A', 'Option B', 'Option C'],
    circuitType: MaciCircuitType.IP1V,
    voiceCreditAmount: 100
  });

  if (createRoundData.status === 'failed') {
    throw new Error(`Round creation failed: ${createRoundData.error ?? 'unknown error'}`);
  }

  const contractAddress = createRoundData.contractAddress;
  if (!contractAddress) {
    throw new Error('Contract address not returned');
  }

  console.log('✓ Round created successfully!');
  console.log('  Contract Address:', contractAddress);
  console.log('  TX Hash        :', createRoundData.txHash);

  // ==================== 3. Update Round Info BEFORE Voting Starts ====================
  console.log('\n[3/5] Updating round info BEFORE voting starts (should succeed)');

  const beforeResult = await maciClient.saasSetRoundInfo({
    contractAddress,
    title: 'Updated Title (Before Voting)',
    description: 'Successfully updated before voting started',
    link: 'https://updated-before.test.com'
  });

  if (beforeResult.status === 'failed') {
    throw new Error(
      `Round info update failed before voting started — unexpected! Error: ${beforeResult.error ?? 'unknown'}`
    );
  }

  console.log('✓ Round info updated successfully before voting starts');
  console.log('  TX Hash:', beforeResult.txHash);
  console.log('  Status :', beforeResult.status);

  // ==================== 4. Wait for Voting to Start ====================
  const msUntilStart = startVoting.getTime() - Date.now();
  // Add a small buffer (5 s) to make sure on-chain block time has passed start_time
  const waitMs = msUntilStart + 5_000;

  console.log(`\n[4/5] Waiting ${Math.ceil(waitMs / 1000)}s for voting to start...`);

  const TICK_MS = 10_000;
  let remaining = waitMs;
  while (remaining > 0) {
    const tick = Math.min(TICK_MS, remaining);
    await sleep(tick);
    remaining -= tick;
    if (remaining > 0) {
      console.log(`  ... ${Math.ceil(remaining / 1000)}s remaining`);
    }
  }

  console.log('✓ Voting has started');

  // ==================== 5. Update Round Info AFTER Voting Starts ====================
  console.log('\n[5/5] Updating round info AFTER voting starts (should fail with PeriodError)');

  const afterResult = await maciClient.saasSetRoundInfo({
    contractAddress,
    title: 'Updated Title (After Voting — should be rejected)',
    description: 'This update should be rejected by the contract',
    link: 'https://should-fail.test.com'
  });

  if (afterResult.status === 'failed') {
    console.log('✓ Round info update correctly rejected after voting started');
    console.log('  Status:', afterResult.status);
    console.log('  Error :', afterResult.error ?? '(PeriodError from contract)');
  } else {
    // If it succeeded, that means the contract restriction is not working
    console.error('✗ ERROR: Round info update succeeded after voting started!');
    console.error('  The contract restriction is NOT working as expected.');
    console.error('  TX Hash:', afterResult.txHash);
    process.exit(1);
  }

  // ==================== Summary ====================
  console.log('\n' + '='.repeat(80));
  console.log('Test completed!');
  console.log('='.repeat(80));
  console.log('\nSummary:');
  console.log('  Contract Address :', contractAddress);
  console.log('  Voting Start     :', startVoting.toISOString());
  console.log('\nResults:');
  console.log('  [3/5] set_round_info BEFORE voting start → ✓ Succeeded (expected)');
  console.log('  [5/5] set_round_info AFTER  voting start → ✓ Rejected  (expected)');
  console.log('\nConclusion: round info is correctly locked once voting starts.');
}

main().catch((error) => {
  console.error('\n❌ Test failed:', error);
  if (error instanceof Error) {
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
  }
  process.exit(1);
});
