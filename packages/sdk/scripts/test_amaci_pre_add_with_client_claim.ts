/**
 * Claim Key + Pre-Add-New-Key + Vote Complete Test (using MaciClient and VoterClient)
 *
 * This script demonstrates the AMACI Claim Key workflow:
 * 1. Create Tenant and API Key
 * 2. Create AMACI Round
 * 3. Claim a pre-generated MACI key pair via saasClaimKey()
 *    - Returns secretKey, leafIndex, coordinatorPubkey, pollId directly — no accounts list needed
 *    - Use getClaimStats() to get the scale (voterScale) for K-anonymous proof requests
 * 4. Pre-Add-New-Key using the claimed key's leafIndex and coordinatorPubkey
 * 5. Vote with the new account
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

  console.log('='.repeat(80));
  console.log('Claim Key + Pre-Add-New-Key + Vote Complete Test (MaciClient & VoterClient)');
  console.log('='.repeat(80));

  // API base configuration
  const API_BASE_URL = 'http://localhost:8080';
  // const API_BASE_URL = undefined;
  // const maxVoter = 20000;
  // const circuitPower = '9-4-3-125';
  // const stateTreeDepth = 9;

  // const maxVoter = 10;
  // const circuitPower = '2-1-1-5';
  // const stateTreeDepth = 2;

  const maxVoter = 26;
  const circuitPower = '4-2-2-25';
  const stateTreeDepth = 4;

  // Create temporary MaciClient (for admin operations, no API key required)
  const adminMaciClient = new MaciClient({
    network: network,
    saasApiEndpoint: API_BASE_URL
  });

  // ==================== 1. Create Tenant and API Key ====================
  const tenantName = `Test Tenant ${generateRandomString(10)}`;
  console.log(`\n[1/4] Creating Tenant: ${tenantName}`);

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    throw new Error('ADMIN_SECRET environment variable is not set');
  }

  const tenantData = await adminMaciClient
    .getSaasApiClient()
    .createTenant({ name: tenantName }, adminSecret);
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

  // Create MaciClient with API Key (required for saasClaimKey)
  const maciClient = new MaciClient({
    network: network,
    saasApiEndpoint: API_BASE_URL,
    saasApiKey: apiKey
  });

  // ==================== 2. Create AMACI Round ====================
  console.log('\n[2/4] Creating AMACI Round');

  const startVoting = new Date();
  const endVoting = new Date(startVoting.getTime() + 11 * 60 * 1000); // 11 minutes later

  const createRoundData = await maciClient.saasCreateAmaciRound({
    title: 'Claim Key Test Round',
    description: 'Testing pre-add-new-key via claim key',
    link: 'https://test.com',
    startVoting: startVoting.toISOString(),
    endVoting: endVoting.toISOString(),
    operator,
    maxVoter: maxVoter,
    voteOptionMap: ['Option A', 'Option B', 'Option C', 'Option D', 'Option E'],
    circuitType: MaciCircuitType.IP1V,
    voiceCreditAmount: 100
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
  console.log('  Poll ID:', createRoundData.pollId ?? 'N/A');

  // Wait for transaction confirmation
  console.log('\nWaiting 6 seconds to ensure transaction confirmation...');
  await new Promise((resolve) => setTimeout(resolve, 6000));

  // ==================== 3. Claim Key ====================
  console.log('\n[3/4] Claiming MACI Key (saasClaimKey)');

  // Create a temporary VoterClient with the API key to call saasClaimKey (ticket required)
  const claimVoterClient = new VoterClient({
    network: network,
    saasApiEndpoint: API_BASE_URL,
    saasApiKey: apiKey
  });
  const claimedKey = await claimVoterClient.saasClaimKey({ contractAddress, ticket });

  console.log('✓ Key claimed successfully!');
  console.log('  Contract Address:', claimedKey.contractAddress);
  console.log('  Leaf Index (deactivateIdx):', claimedKey.leafIndex);
  console.log('  Poll ID:', claimedKey.pollId);
  console.log('  Coordinator Pubkey:', claimedKey.coordinatorPubkey);
  console.log('  Pubkey:', claimedKey.pubkey);
  console.log('  Secret Key:', claimedKey.secretKey.substring(0, 20) + '...');
  console.log('  Claimed At:', claimedKey.claimedAt);

  // Query claim stats — public endpoint, no auth required.
  // Useful for displaying available slots to users before they claim.
  const claimStats = await maciClient.getSaasApiClient().getClaimStats({ contractAddress });
  console.log('\n  Claim Stats (after claiming):');
  console.log('    Total slots (scale):', claimStats.scale);
  console.log('    Claimed count:', claimStats.claimedCount);
  console.log('    Available count:', claimStats.availableCount);

  // Fetch the round's on-chain coordinator pubkey for voting (may differ from the
  // pre-deactivate coordinator key used when building the deactivate tree)
  const roundInfo = await maciClient.getRoundInfo({ contractAddress });
  const roundCoordPubkey: [bigint, bigint] = [
    BigInt(roundInfo.coordinatorPubkeyX),
    BigInt(roundInfo.coordinatorPubkeyY)
  ];
  console.log('  Round Coord Pubkey:', roundCoordPubkey);

  // Build VoterClient from the claimed secretKey
  const voterClient = new VoterClient({
    network: network,
    secretKey: claimedKey.secretKey,
    saasApiEndpoint: API_BASE_URL
  });

  // Unpack the pre-deactivate coordinator pubkey from the claim response
  const preDeactivateCoordPubkey = voterClient.unpackMaciPubkey(claimedKey.coordinatorPubkey);
  console.log('  Pre-Deactivate Coord Pubkey (unpacked):', preDeactivateCoordPubkey);

  // pollId is already embedded in the claim response — no extra contract call needed
  const pollId = claimedKey.pollId !== null ? Number(claimedKey.pollId) : undefined;
  console.log('  Poll ID (from claim):', pollId);

  // ==================== 4. Pre-Add-New-Key + Vote ====================
  console.log('\n[4/4] Pre-Add-New-Key + Vote');
  console.log('  stateTreeDepth:', stateTreeDepth);
  console.log('  deactivateIdx:', claimedKey.leafIndex);
  console.log('  addKey wasm:', `add-new-key_v3/${circuitPower}/addKey.wasm`);
  console.log('  addKey zkey:', `add-new-key_v3/${circuitPower}/addKey.zkey`);

  try {
    // saasPreCreateNewAccount — pre-computed proof path:
    // The Merkle proof (root, pathElements, deactivateLeaf) comes directly from the
    // claimMaciKey response, so no local tree construction and no extra API call needed.
    const { account, result } = await voterClient.saasPreCreateNewAccount({
      contractAddress,
      stateTreeDepth,
      coordinatorPubkey: preDeactivateCoordPubkey,
      deactivateIdx: claimedKey.leafIndex,
      preComputedProof: {
        root: claimedKey.root,
        pathElements: claimedKey.pathElements,
        deactivateLeaf: claimedKey.deactivateLeaf
      },
      pollId,
      wasmFile: path.join(process.cwd(), `add-new-key_v3/${circuitPower}/addKey.wasm`),
      zkeyFile: path.join(process.cwd(), `add-new-key_v3/${circuitPower}/addKey.zkey`),
      ticket
    });

    console.log('✓ Pre-Add-New-Key succeeded!', result);
    console.log('  New account pubkey:', account.getPubkey().toPackedData());
    console.log('  New account private key:', account.getSigner().getPrivateKey());

    // Wait for Pre-Add-New-Key transaction confirmation
    console.log('\nWaiting 6 seconds to ensure Pre-Add-New-Key transaction confirmation...');
    await new Promise((resolve) => setTimeout(resolve, 6000));

    let userIdx = await account.getStateIdx({ contractAddress });
    console.log('  userIdx:', userIdx);
    while (userIdx === -1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      userIdx = await account.getStateIdx({ contractAddress });
      console.log('  userIdx:', userIdx);
    }

    // Vote with the new account
    console.log('\nVoting...');
    const voteResult = await account.saasVote({
      contractAddress,
      operatorPubkey: roundCoordPubkey,
      selectedOptions: [
        { idx: 0, vc: 1 },
        { idx: 2, vc: 1 },
        { idx: 3, vc: 1 }
      ],
      ticket,
      pollId
    });

    console.log('✓ Voting succeeded!', voteResult);
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
  console.log('✓ Successfully created AMACI Round');
  console.log('✓ Claimed MACI key pair via saasClaimKey() (first-come-first-served)');
  console.log(
    '  - secretKey, leafIndex, coordinatorPubkey, pollId, root, pathElements, deactivateLeaf'
  );
  console.log('    all returned in a single call — no additional API requests needed');
  console.log('✓ Completed Pre-Add-New-Key via pre-computed proof path (no extra API call)');
  console.log('✓ Tested voting functionality');
  console.log('\nContract Address:', contractAddress);
  console.log('\nClient Features Demonstrated:');
  console.log('  - MaciClient (requires API key):');
  console.log('    • Admin API via getSaasApiClient(): createTenant, createApiKey');
  console.log('    • Round API via saasCreateAmaciRound()');
  console.log(
    '    • getSaasApiClient().getClaimStats(): public — get scale / claimed / available counts'
  );
  console.log('  - VoterClient:');
  console.log('    • saasClaimKey({ contractAddress, ticket }): claim pre-generated key + full deactivate Merkle proof');
  console.log('    • saasPreCreateNewAccount(): pre-computed proof path (preComputedProof)');
  console.log('      uses root/pathElements/deactivateLeaf from claimMaciKey directly');
  console.log('    • saasVote(): builds payload + submits vote');
}

main().catch((error) => {
  console.error('\n❌ Test failed:', error);
  if (error instanceof Error) {
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
  }
  process.exit(1);
});
