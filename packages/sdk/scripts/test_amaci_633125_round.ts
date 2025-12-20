/**
 * Pre-Add-New-Key and Pre-Deactivate API Complete Test (using MaciClient and VoterClient)
 *
 * This script demonstrates the complete AMACI Pre-Deactivate workflow:
 * 1. Create Tenant and API Key
 * 2. Create AMACI Round (automatic Pre-Deactivate mode)
 * 3. Query Pre-Deactivate data
 * 4. Test Pre-Add-New-Key
 * 5. Test voting
 */

import { MaciClient } from '../src/maci';
import { VoterClient } from '../src/voter';
import { MaciCircuitType } from '../src/types';
import * as path from 'path';
import * as fs from 'fs';
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
  const operatorPubkey =
    10721319678265866063861912417916780787229942812531198850410477756757845824096n;

  console.log('='.repeat(80));
  console.log('Pre-Add-New-Key and Pre-Deactivate API Complete Test (MaciClient & VoterClient)');
  console.log('='.repeat(80));

  // API base configuration
  // const API_BASE_URL = 'http://localhost:8080';
  // const API_BASE_URL = undefined;

  // Create temporary MaciClient (for admin operations, no API key required)
  const adminMaciClient = new MaciClient({
    network: network
    // saasApiEndpoint: API_BASE_URL
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
    // saasApiEndpoint: API_BASE_URL,
    saasApiKey: apiKey
  });

  // ==================== 2. Create AMACI Round (Auto Pre-Deactivate Mode) ====================
  console.log('\n[2/5] Creating AMACI Round (Auto Pre-Deactivate Mode)');
  console.log('Note: Without allowlistId, API will auto-generate accounts in response');

  const startVoting = new Date();
  const endVoting = new Date(startVoting.getTime() + 11 * 60 * 1000); // 11 minutes later
  const maxVoter = 10000;

  const createRoundData = await maciClient.saasCreateAmaciRound({
    title: 'Pre-Add-New-Key Test Round',
    description: 'Testing pre-add-new-key with auto pre-deactivate',
    link: 'https://test.com',
    startVoting: startVoting.toISOString(),
    endVoting: endVoting.toISOString(),
    operator,
    maxVoter: maxVoter,
    voteOptionMap: [
      'Option A',
      'Option B',
      'Option C',
      'Option D',
      'Option E',
      'Option F',
      'Option G',
      'Option H',
      'Option I',
      'Option J',
      'Option K',
      'Option L',
      'Option M',
      'Option N',
      'Option O',
      'Option P',
      'Option Q',
      'Option R',
      'Option S',
      'Option T',
      'Option U',
      'Option V',
      'Option W',
      'Option X',
      'Option Y',
      'Option Z'
    ],
    circuitType: MaciCircuitType.IP1V,
    voiceCreditAmount: 100
    // Without allowlistId, API will auto-generate pre-deactivate data
  });

  // Save createRoundData to JSON file
  const outputDir = path.join(process.cwd(), 'test-output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = path.join(outputDir, `createRoundData-${timestamp}.json`);

  fs.writeFileSync(outputFile, JSON.stringify(createRoundData, null, 2));
  console.log(`\n✓ CreateRoundData saved to: ${outputFile}`);

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

  // Display first 3 accounts
  if (accountsData.length > 0) {
    console.log('\nFirst 3 accounts returned:');
    accountsData.slice(0, 3).forEach((account, index) => {
      console.log(`\n  Account ${index + 1}:`);
      console.log(`    Pubkey: ${account.pubkey}`);
      console.log(`    Secret Key: ${account.secretKey.substring(0, 20)}...`);
    });
  }

  // ==================== 3. Query Pre-Deactivate Data ====================
  console.log('\n[3/5] Querying Pre-Deactivate data from dedicated API');

  // Use public API (no API key required) - create a temporary VoterClient
  const publicVoterClient = new VoterClient({
    network: network
    // saasApiEndpoint: API_BASE_URL
  });

  const deactivateData = await publicVoterClient.saasGetPreDeactivate(contractAddress);

  console.log('✓ Deactivate data queried successfully!');
  console.log('  Root:', deactivateData.root);
  console.log('  Coordinator:', deactivateData.coordinator);
  console.log('  Leaves count:', deactivateData.leaves.length);
  console.log('  Deactivates count:', deactivateData.deactivates.length);

  // ==================== 4. Test Pre-Add-New-Key ====================
  console.log('\n[4/5] Testing Pre-Add-New-Key');

  // Use the first auto-generated account for Pre-Add-New-Key
  if (accountsData.length === 0) {
    throw new Error('No available account found for Pre-Add-New-Key test');
  }

  const testAccount = accountsData[0];
  console.log('Using first account:', testAccount.pubkey);

  // Create voter client using account's secretKey
  const voterClient = new VoterClient({
    network: network,
    secretKey: testAccount.secretKey
    // saasApiEndpoint: API_BASE_URL
  });

  const circuitPower = '4-2-2-25';
  console.log('Executing Pre-Add-New-Key (with auto payload generation)...');

  // Get coordinator pubkey from deactivateData
  const coordinatorPubkey = BigInt(deactivateData.coordinator);

  try {
    // Use saasPreCreateNewAccount: builds payload + submits pre-add-new-key
    // const derivePathParams = { accountIndex: 2 };
    console.log('stateTreeDepth', Number(circuitPower.split('-')[0]));
    console.log('deactivates.length', deactivateData.deactivates.length);
    console.log('addKey file name', `add-new-key_v3/${circuitPower}/addKey.wasm`);
    console.log('addKey file name', `add-new-key_v3/${circuitPower}/addKey.zkey`);
    const { account, result } = await voterClient.saasPreCreateNewAccount({
      contractAddress: contractAddress,
      stateTreeDepth: Number(circuitPower.split('-')[0]),
      coordinatorPubkey: coordinatorPubkey,
      deactivates: deactivateData.deactivates,
      wasmFile: path.join(process.cwd(), `add-new-key_v3/${circuitPower}/addKey.wasm`),
      zkeyFile: path.join(process.cwd(), `add-new-key_v3/${circuitPower}/addKey.zkey`),
      ticket: ticket
      //   derivePathParams
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

    // ==================== 5. Test Voting ====================
    console.log('\n[5/5] Testing Voting (with auto payload generation)');

    const voteResult = await account.saasVote({
      contractAddress,
      operatorPubkey,
      selectedOptions: [
        { idx: 0, vc: 1 },
        { idx: 2, vc: 1 },
        { idx: 3, vc: 1 }
      ],
      ticket: ticket
    });

    console.log('✓ Voting succeeded!', voteResult);
    const voteResult2 = await account.saasVote({
      contractAddress,
      operatorPubkey,
      selectedOptions: [
        { idx: 0, vc: 1 },
        { idx: 1, vc: 1 },
        { idx: 2, vc: 1 },
        { idx: 3, vc: 1 },
        { idx: 4, vc: 1 },
        { idx: 5, vc: 1 },
        { idx: 6, vc: 1 },
        { idx: 7, vc: 1 },
        { idx: 8, vc: 1 },
        { idx: 9, vc: 1 },
        { idx: 10, vc: 1 },
        { idx: 11, vc: 1 },
        { idx: 12, vc: 1 },
        { idx: 13, vc: 1 },
        { idx: 14, vc: 1 },
        { idx: 15, vc: 1 },
        { idx: 16, vc: 1 },
        { idx: 17, vc: 1 },
        { idx: 18, vc: 1 },
        { idx: 19, vc: 1 },
        { idx: 20, vc: 1 },
        { idx: 21, vc: 1 },
        { idx: 22, vc: 1 },
        { idx: 23, vc: 1 },
        { idx: 24, vc: 1 }
      ],
      ticket: ticket
    });

    console.log('✓ Voting succeeded!', voteResult2);
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
  console.log('✓ Accounts returned directly in create round response');
  console.log('✓ Pre-Deactivate data queried from dedicated API');
  console.log('✓ Completed Pre-Add-New-Key using auto-generated account');
  console.log('✓ Tested voting functionality');
  console.log('\nContract Address:', contractAddress);
  console.log('Total Accounts Generated:', accountsData.length);
  console.log('\nClient Features Demonstrated:');
  console.log('  - MaciClient:');
  console.log('    • Admin API via getSaasApiClient(): createTenant, createApiKey');
  console.log('    • Round API via saasCreateAmaciRound()');
  console.log('  - VoterClient:');
  console.log('    • Pre-Deactivate API via saasGetPreDeactivate()');
  console.log('    • Integrated Methods (auto payload + submit):');
  console.log('      - saasPreCreateNewAccount(): builds payload + submits pre-add-new-key');
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
