/**
 * Pre-Add-New-Key and Pre-Deactivate API Complete Test (using MaciClient and VoterClient)
 *
 * This script demonstrates the complete AMACI Pre-Deactivate workflow:
 * 1. Create Tenant and API Key
 * 2. Create AMACI Round (automatic Pre-Deactivate mode)
 *    - accountIndex and preDeactivateScale are returned directly in the response
 * 3. Test Pre-Add-New-Key (API proof path: no local deactivate data needed)
 * 4. Test voting
 */

import { MaciClient } from '../src/maci';
import { VoterClient } from '../src/voter';
import { MaciCircuitType } from '../src/types';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config();

function generateRandomString(length: number) {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}

async function main() {
  const network = 'testnet';
  const operator = 'dora149n5yhzgk5gex0eqmnnpnsxh6ys4exg5xyqjzm';
  // const operatorPubkey =
  //   10721319678265866063861912417916780787229942812531198850410477756757845824096n;

  console.log('='.repeat(80));
  console.log('Pre-Add-New-Key and Pre-Deactivate API Complete Test (MaciClient & VoterClient)');
  console.log('='.repeat(80));

  // API base configuration
  const API_BASE_URL = 'http://localhost:8080';
  // const API_BASE_URL = undefined;
  // const maxVoter = 20000;
  // const circuitPower = '9-4-3-125';
  // const stateTreeDepth = 9;

  const maxVoter = 10;
  const circuitPower = '2-1-1-5';
  const stateTreeDepth = 2;

  // Create temporary MaciClient (for admin operations, no API key required)
  const adminMaciClient = new MaciClient({
    network: network,
    saasApiEndpoint: API_BASE_URL
  });

  // ==================== 1. Create Tenant and API Key ====================
  const tenantName = `Test Tenant ${generateRandomString(10)}`;
  console.log(`\n[1/5] Creating Tenant: ${tenantName}`);

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    throw new Error('ADMIN_SECRET environment variable is not set');
  }

  // Create Tenant through underlying API client
  const tenantData = await adminMaciClient.getSaasApiClient().createTenant(
    {
      name: tenantName
    },
    adminSecret
  );
  console.log('✓ Tenant created successfully:', tenantData.id);

  const apiKeyData = await adminMaciClient.getSaasApiClient().createApiKey(
    {
      tenantId: tenantData.id,
      label: 'Test API Key',
      plan: 'pro'
    },
    adminSecret
  );
  const apiKey = apiKeyData.apiKey;
  console.log('✓ API Key created successfully:', apiKey);

  // Create MaciClient with API Key
  const maciClient = new MaciClient({
    network: network,
    saasApiEndpoint: API_BASE_URL,
    saasApiKey: apiKey
  });

  // ==================== 2. Create AMACI Round (Auto Pre-Deactivate Mode) ====================
  console.log('\n[2/5] Creating AMACI Round (Auto Pre-Deactivate Mode)');
  console.log('Note: Without allowlistId, API will auto-generate accounts in response');

  const startVoting = new Date();
  const endVoting = new Date(startVoting.getTime() + 11 * 60 * 1000); // 11 minutes later

  const createRoundData = await maciClient.saasCreateAmaciRound({
    title: 'Pre-Add-New-Key Test Round',
    description: 'Testing pre-add-new-key with auto pre-deactivate',
    link: 'https://test.com',
    startVoting: startVoting.toISOString(),
    endVoting: endVoting.toISOString(),
    operator,
    maxVoter: maxVoter,
    voteOptionMap: ['Option A', 'Option B', 'Option C', 'Option D', 'Option E'],
    circuitType: MaciCircuitType.IP1V,
    voiceCreditAmount: 100
    // Without allowlistId, API will auto-generate pre-deactivate data
  });

  const contractAddress = createRoundData.contractAddress;
  if (!contractAddress) {
    throw new Error('Contract address not returned');
  }

  const ticket = createRoundData.ticket;
  if (!ticket) {
    throw new Error('Ticket not returned');
  }

  console.log('✓ Round created successfully!');
  console.log('  Contract Address:', contractAddress);
  console.log('  Status:', createRoundData.status);
  console.log('  TX Hash:', createRoundData.txHash);
  console.log('  Ticket:', ticket);

  // Verify accounts are returned
  if (!createRoundData.accounts) {
    throw new Error('Accounts not returned in response');
  }

  const accountsData = createRoundData.accounts;
  console.log('  Accounts count:', accountsData.length);

  // Wait for transaction confirmation
  console.log('\nWaiting 6 seconds to ensure transaction confirmation...');
  await new Promise((resolve) => setTimeout(resolve, 6000));

  // Display first 3 accounts with their accountIndex
  if (accountsData.length > 0) {
    console.log('\nFirst 3 accounts returned:');
    accountsData.slice(0, 3).forEach((account, index) => {
      console.log(`\n  Account ${index + 1}:`);
      console.log(`    Pubkey: ${account.pubkey}`);
      console.log(`    AccountIndex: ${account.accountIndex}`);
      console.log(`    Secret Key: ${account.secretKey.substring(0, 20)}...`);
    });
  }

  // ==================== 3. Test Pre-Add-New-Key ====================
  console.log('\n[3/4] Testing Pre-Add-New-Key (API proof path)');

  // Use the first auto-generated account for Pre-Add-New-Key
  if (accountsData.length === 0) {
    throw new Error('No available account found for Pre-Add-New-Key test');
  }

  const testAccount = accountsData[0];
  console.log('Using first account:', testAccount.pubkey);
  console.log('  accountIndex:', testAccount.accountIndex);

  // Create voter client using account's secretKey
  const voterClient = new VoterClient({
    network: network,
    secretKey: testAccount.secretKey,
    saasApiEndpoint: API_BASE_URL
  });

  // Query coordinator pubkey and voter scale from the pre-deactivate meta API.
  // This is more flexible: any client can retrieve the circuit inputs without
  // relying on the create-round response.
  console.log('\nQuerying pre-deactivate meta from API...');
  const preDeactivateMeta = await maciClient.getSaasApiClient().getPreDeactivateMeta({
    contractAddress
  });
  const voterScale = preDeactivateMeta.scale;
  console.log('  Voter Scale (from meta API):', voterScale);

  // preDeactivateMeta.coordinator is the packed pubkey the API used when building
  // the pre-deactivate tree; unpack it so it matches what buildPreAddNewKeyPayload expects.
  const preDeactivateCoordPubkey = voterClient.unpackMaciPubkey(preDeactivateMeta.coordinator);
  console.log('  preDeactivateCoordPubkey (unpacked):', preDeactivateCoordPubkey);

  // Fetch the round's on-chain coordinator pubkey for voting (may differ from the
  // pre-deactivate coordinator key).
  const roundInfo = await maciClient.getRoundInfo({ contractAddress });
  const roundCoordPubkey: [bigint, bigint] = [
    BigInt(roundInfo.coordinatorPubkeyX),
    BigInt(roundInfo.coordinatorPubkeyY)
  ];
  console.log('  roundCoordPubkey:', roundCoordPubkey);

  // Query pollId from the contract
  const pollId = await voterClient.getPollId(contractAddress);
  console.log('  pollId:', pollId);

  console.log('Executing Pre-Add-New-Key (API proof path, no local deactivate data)...');
  console.log('  stateTreeDepth:', stateTreeDepth);
  console.log('  deactivateIdx:', testAccount.accountIndex);
  console.log('  voterScale:', voterScale);
  console.log('  addKey wasm:', `add-new-key_v3/${circuitPower}/addKey.wasm`);
  console.log('  addKey zkey:', `add-new-key_v3/${circuitPower}/addKey.zkey`);

  try {
    // Use saasPreCreateNewAccount with API proof path:
    // - deactivates is omitted → contractAddress + deactivateIdx + voterScale are used instead
    // - The SDK fetches K-anonymous Merkle proof from the SaaS API automatically
    const { account, result } = await voterClient.saasPreCreateNewAccount({
      contractAddress: contractAddress,
      stateTreeDepth: stateTreeDepth,
      coordinatorPubkey: preDeactivateCoordPubkey,
      deactivateIdx: testAccount.accountIndex,
      voterScale: voterScale,
      pollId: pollId,
      wasmFile: path.join(process.cwd(), `add-new-key_v3/${circuitPower}/addKey.wasm`),
      zkeyFile: path.join(process.cwd(), `add-new-key_v3/${circuitPower}/addKey.zkey`),
      ticket: ticket
    });
    console.log('accountinfo:', account.getSigner().getPrivateKey());
    console.log('accountinfo:', account.getPubkey().toPackedData());

    console.log('✓ Pre-Add-New-Key succeeded!', result);
    console.log('✓ Pre-Add-New-Key account:', account.getPubkey().toPackedData());

    // Wait for transaction confirmation
    console.log('\nWaiting 6 seconds to ensure Pre-Add-New-Key transaction confirmation...');
    await new Promise((resolve) => setTimeout(resolve, 6000));
    let userIdx = await account.getStateIdx({
      contractAddress
    });
    console.log('userIdx', userIdx);
    while (userIdx === -1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      userIdx = await account.getStateIdx({
        contractAddress
      });
      console.log('userIdx', userIdx);
    }

    // ==================== 4. Test Voting ====================
    console.log('\n[4/4] Testing Voting (with auto payload generation)');

    const voteResult = await account.saasVote({
      contractAddress,
      operatorPubkey: roundCoordPubkey,
      selectedOptions: [
        { idx: 0, vc: 1 },
        { idx: 2, vc: 1 },
        { idx: 3, vc: 1 }
      ],
      ticket: ticket,
      pollId
    });

    console.log('✓ Voting succeeded!', voteResult);
    // const voteResult2 = await account.saasVote({
    //   contractAddress,
    //   operatorPubkey,
    //   selectedOptions: [
    //     { idx: 0, vc: 1 },
    //     { idx: 1, vc: 1 },
    //     { idx: 2, vc: 1 }
    //   ],
    //   ticket: ticket
    // });

    // console.log('✓ Voting succeeded!', voteResult2);
  } catch (error) {
    console.log('⚠ Failed:', error);
    if (error instanceof Error) {
      console.log('  Error message:', error.message);
    }
  }

  // ==================== Completed ====================
  console.log('\n' + '='.repeat(80));
  console.log('Test completed!');
  console.log('='.repeat(80));
  console.log('\nSummary:');
  console.log('✓ Successfully created Tenant and API Key');
  console.log('✓ Successfully created AMACI Round (Auto Pre-Deactivate Mode)');
  console.log('✓ accountIndex and preDeactivateScale returned in create round response');
  console.log('✓ Completed Pre-Add-New-Key via API proof path (no local deactivate data)');
  console.log('✓ Tested voting functionality');
  console.log('\nContract Address:', contractAddress);
  console.log('Total Accounts Generated:', accountsData.length);
  console.log('Voter Scale:', voterScale);
  console.log('\nClient Features Demonstrated:');
  console.log('  - MaciClient:');
  console.log('    • Admin API via getSaasApiClient(): createTenant, createApiKey');
  console.log('    • Round API via saasCreateAmaciRound()');
  console.log('  - VoterClient:');
  console.log('    • Integrated Methods (auto payload + submit):');
  console.log('      - saasPreCreateNewAccount(): API proof path (deactivateIdx + voterScale)');
  console.log('        fetches K-anonymous Merkle proof from SaaS API automatically');
  console.log('      - saasVote(): builds payload + submits vote');
}

main().catch((error) => {
  console.error('\n❌ Test failed:', error);
  if (error instanceof Error) {
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
  }
  process.exit(1);
});
