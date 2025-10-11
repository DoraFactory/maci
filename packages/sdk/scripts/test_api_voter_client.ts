/**
 * Test script for VoterClient SaaS API integration
 *
 * This script demonstrates how to use the SaaS API methods in VoterClient
 */

import { VoterClient } from '../src';

async function main() {
  const saasApiKey = process.env.SAAS_API_KEY;
  if (!saasApiKey) {
    console.error('Please set SAAS_API_KEY environment variable');
    process.exit(1);
  }

  // Initialize VoterClient with SaaS API endpoint
  const voter = new VoterClient({
    network: 'testnet',
    mnemonic: process.env.MNEMONIC,
    saasApiEndpoint: process.env.SAAS_API_ENDPOINT || 'https://api.testnet.doravota.com',
    saasApiKey
  });

  console.log('✅ VoterClient initialized with SaaS API support');

  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    console.error('Please set CONTRACT_ADDRESS environment variable');
    process.exit(1);
  }

  try {
    // Example 1: Get Pre-Deactivate Data
    console.log('\n--- Test 1: Get Pre-Deactivate Data ---');
    const preDeactivateData = await voter.saasGetPreDeactivate(contractAddress);
    console.log('Pre-deactivate data:', {
      messagesCount: preDeactivateData.deactivates?.length || 0,
      root: preDeactivateData.root
    });

    // Example 2: Vote via SaaS API
    console.log('\n--- Test 2: Vote via SaaS API ---');

    const stateIdx = 1; // Your state index
    const operatorPubkey = BigInt('...'); // Get from round info

    // Build vote payload
    const payload = voter.buildVotePayload({
      stateIdx,
      operatorPubkey,
      selectedOptions: [
        { idx: 0, vc: 10 },
        { idx: 1, vc: 20 }
      ]
    });

    const voteResult = await voter.saasSubmitVote({
      contractAddress,
      payload
    });

    console.log('Vote Result:', {
      id: voteResult.id,
      txHash: voteResult.txHash,
      status: voteResult.status
    });

    // Example 3: Pre Add New Key (commented out as it requires proof generation)
    /*
    console.log('\n--- Test 3: Pre Add New Key ---');
    
    const stateTreeDepth = 4; // Get from round info
    const deactivates = preDeactivateData.messages;
    
    // Build proof (requires wasm and zkey files)
    const { proof, d, nullifier } = await voter.buildPreAddNewKeyPayload({
      stateTreeDepth,
      operatorPubkey,
      deactivates,
      wasmFile: wasmFileData,
      zkeyFile: zkeyFileData,
    });
    
    const newPubkey = voter.getPubkey();
    
    const addKeyResult = await voter.saasSubmitPreAddNewKey({
      signerAddress: 'dora1...',
      contractAddress,
      d,
      proof,
      nullifier,
      newPubkey: [newPubkey[0].toString(), newPubkey[1].toString()],
    });
    
    console.log('Add Key Result:', {
      id: addKeyResult.id,
      txHash: addKeyResult.txHash,
      status: addKeyResult.status,
    });
    */

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
