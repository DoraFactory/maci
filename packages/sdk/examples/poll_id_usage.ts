/**
 * Example: How to use Poll ID in SDK
 * 
 * This demonstrates the new poll ID workflow after implementation
 */

import { MaciClient } from '@dorafactory/maci-sdk';

async function exampleUsage() {
  const maciClient = new MaciClient({
    rpcEndpoint: 'https://rpc.dorafactory.org',
    mnemonic: 'your mnemonic here',
    registryAddress: 'dora1...',
  });

  // ============================================================================
  // Step 1: Create AMACI Round (Registry automatically assigns poll_id)
  // ============================================================================
  
  console.log('Creating AMACI Round...');
  const createRoundData = await maciClient.saasCreateAmaciRound({
    title: 'Test Round with Poll ID',
    // ... other parameters
  });

  const contractAddress = createRoundData.contractAddress;
  console.log('✓ Round created:', contractAddress);
  
  // Poll ID is automatically assigned and stored
  // You can find it in the transaction events/attributes

  // ============================================================================
  // Step 2: Query Poll ID from AMACI Contract
  // ============================================================================
  
  async function getPollId(contractAddress: string): Promise<number> {
    const result = await maciClient.wasmQueryClient.queryContractSmart(
      contractAddress,
      { get_poll_id: {} }
    );
    // poll_id is required field, always returns a number
    return result;
  }

  const pollId = await getPollId(contractAddress);
  console.log('✓ Poll ID:', pollId);

  // ============================================================================
  // Step 3: Query Poll Address from Registry
  // ============================================================================
  
  async function getPollAddress(registryAddress: string, pollId: number): Promise<string | null> {
    const result = await maciClient.wasmQueryClient.queryContractSmart(
      registryAddress,
      { get_poll_address: { poll_id: pollId } }
    );
    return result;
  }

  const queriedAddress = await getPollAddress(maciClient.registryAddress, pollId);
  console.log('✓ Queried Address:', queriedAddress);
  console.log('✓ Matches:', queriedAddress === contractAddress);

  // ============================================================================
  // Step 4: Voting with Poll ID
  // ============================================================================
  
  // After SDK is updated to include pollId in packElement:
  
  /*
  const message = maciClient.genMessage({
    stateIdx: 1,
    nonce: 1,
    voteOptionIndex: 0,
    newVoteWeight: 9,
    pollId: pollId,  // NEW: Include poll ID in message
    salt: BigInt('0x123...'),
  });

  await maciClient.publishMessage({
    contractAddress,
    message,
  });
  */

  // ============================================================================
  // Step 5: Verification in Circuit
  // ============================================================================
  
  /*
  In the circuit (processMessages.circom):
  
  signal input expectedPollId;  // Public input from contract
  
  for (var i = 0; i < batchSize; i++) {
    // Extract pollId from message
    component commands[i] = MessageToCommand();
    commands[i].pollId === expectedPollId;  // Verify match
    
    // If pollId doesn't match, proof generation will fail
    // This prevents cross-round replay attacks
  }
  */

  // ============================================================================
  // Security Benefits
  // ============================================================================
  
  /*
  Before (without poll ID):
  - Message from Round A could be replayed in Round B
  - If same user has same stateIdx in both rounds
  - Attacker could reuse old vote payloads
  
  After (with poll ID):
  - Message contains pollId = A
  - Round B expects pollId = B
  - pollId mismatch → proof generation fails
  - Replay attack prevented at ZK proof level
  */
}

// Run example
exampleUsage().catch(console.error);
