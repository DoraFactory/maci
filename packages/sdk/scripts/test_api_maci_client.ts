/**
 * Test script for MaciClient SaaS API integration
 *
 * This script demonstrates how to use the SaaS API methods in MaciClient
 */

import { MaciClient } from '../src';

async function main() {
  const saasApiKey = process.env.SAAS_API_KEY;
  if (!saasApiKey) {
    console.error('Please set SAAS_API_KEY environment variable');
    process.exit(1);
  }

  // Initialize MaciClient with SaaS API endpoint and API key
  const client = new MaciClient({
    network: 'testnet',
    saasApiEndpoint: process.env.SAAS_API_ENDPOINT || 'https://api.testnet.doravota.com',
    saasApiKey
  });

  console.log('✅ MaciClient initialized with SaaS API support');

  try {
    // Example 1: Create AMaci Round
    console.log('\n--- Test 1: Create AMaci Round ---');
    const createRoundResult = await client.saasCreateAmaciRound({
      title: 'Test Round via SaaS API',
      description: 'This is a test round created via SaaS API',
      link: 'https://example.com',
      startVoting: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      endVoting: new Date(Date.now() + 86400000).toISOString(), // 24 hours from now
      operator: 'dora1...',
      maxVoter: 100,
      voteOptionMap: ['Option A', 'Option B', 'Option C'],
      voiceCreditAmount: 100,
      circuitType: 'qv'
    });

    console.log('Create Round Result:', {
      id: createRoundResult.id,
      txHash: createRoundResult.txHash,
      status: createRoundResult.status,
      contractAddress: createRoundResult.contractAddress
    });

    // Example 2: Set Round Info
    if (createRoundResult.contractAddress) {
      console.log('\n--- Test 2: Set Round Info ---');
      const setInfoResult = await client.saasSetRoundInfo({
        contractAddress: createRoundResult.contractAddress,
        title: 'Updated Round Title',
        description: 'Updated description',
        link: 'https://updated-link.com'
      });

      console.log('Set Round Info Result:', {
        id: setInfoResult.id,
        txHash: setInfoResult.txHash,
        status: setInfoResult.status
      });

      // Example 3: Set Vote Options
      console.log('\n--- Test 3: Set Vote Options ---');
      const setOptionsResult = await client.saasSetVoteOptions({
        contractAddress: createRoundResult.contractAddress,
        voteOptionMap: ['New Option 1', 'New Option 2', 'New Option 3', 'New Option 4']
      });

      console.log('Set Vote Options Result:', {
        id: setOptionsResult.id,
        txHash: setOptionsResult.txHash,
        status: setOptionsResult.status
      });
    }

    console.log('\n✅ All SaaS API tests passed!');
  } catch (error: any) {
    console.error('\n❌ Error occurred:', error.message);
    if (error.status) {
      console.error('HTTP Status:', error.status);
    }
    process.exit(1);
  }
}

main().catch(console.error);
