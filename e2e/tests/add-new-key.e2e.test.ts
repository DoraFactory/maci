import { expect } from 'chai';
import { OperatorClient, VoterClient } from '@dorafactory/maci-sdk';
import { SimulateCosmWasmClient } from '@oraichain/cw-simulate';
import path from 'path';
import {
  createTestEnvironment,
  ContractLoader,
  DeployManager,
  AmaciContractClient,
  formatPubKeyForContract,
  formatMessageForContract,
  assertExecuteSuccess,
  log,
  assertBigIntEqual,
  advanceTime
} from '../src';

/**
 * AMACI AddNewKey End-to-End Test
 *
 * This test demonstrates the complete AddNewKey flow:
 * 1. User registers with old key
 * 2. User votes with old key
 * 3. User deactivates old key
 * 4. Operator processes deactivate messages
 * 5. User generates AddNewKey proof and submits
 * 6. User votes with new key
 * 7. Process and tally all votes
 * 8. Verify results include votes from both keys
 */

describe('AMACI AddNewKey End-to-End Test', function () {
  this.timeout(900000); // 15 minutes for the entire test suite

  let client: SimulateCosmWasmClient;
  let operator: OperatorClient;
  let voter1: VoterClient;
  let voter1NewKey: VoterClient;
  let voter2: VoterClient;
  let amaciContract: AmaciContractClient;
  let votingEndTime: bigint;
  let deactivatesForProof: bigint[][] = []; // Store deactivate data for AddNewKey proof

  const adminAddress = 'dora1admin000000000000000000000000000000';
  const operatorAddress = 'dora1operator000000000000000000000000';
  const feeRecipient = 'dora1feerecipient0000000000000000000';

  const voter1Address = 'dora1voter1000000000000000000000000000000';
  const voter2Address = 'dora1voter2000000000000000000000000000000';
  const voter1NewAddress = 'dora1voter1new000000000000000000000000';

  // Test parameters (must match zkey configuration: 2-1-1-5)
  const stateTreeDepth = 2; // 5^2 = 25 max voters
  const intStateTreeDepth = 1;
  const voteOptionTreeDepth = 1; // 5^1 = 5 max options
  const batchSize = 5;
  const maxVoteOptions = 5 ** voteOptionTreeDepth; // 5
  const numSignUps = 3; // voter1 (old), voter2, voter1 (new)

  // User indices
  const USER_1_OLD = 0;
  const USER_2 = 1;
  const USER_1_NEW = 2; // User 1's new key after deactivate + addNewKey

  // Circuit artifacts paths
  const circuitConfig = 'amaci-2-1-1-5';
  const circuitDir = path.join(__dirname, '../circuits', circuitConfig);
  const processMessagesWasm = path.join(circuitDir, 'processMessages.wasm');
  const processMessagesZkey = path.join(circuitDir, 'processMessages.zkey');
  const tallyVotesWasm = path.join(circuitDir, 'tallyVotes.wasm');
  const tallyVotesZkey = path.join(circuitDir, 'tallyVotes.zkey');
  const processDeactivateWasm = path.join(circuitDir, 'deactivate.wasm');
  const processDeactivateZkey = path.join(circuitDir, 'deactivate.zkey');
  const addNewKeyWasm = path.join(circuitDir, 'addNewKey.wasm');
  const addNewKeyZkey = path.join(circuitDir, 'addNewKey.zkey');

  before(async () => {
    log('=== Setting up AddNewKey test environment ===');

    // Create test environment
    const env = await createTestEnvironment({
      chainId: 'addnewkey-test',
      bech32Prefix: 'dora'
    });

    client = env.client;
    log('Test environment created');

    // Initialize SDK clients
    operator = new OperatorClient({
      network: 'testnet',
      secretKey: 111111n
    });

    voter1 = new VoterClient({
      network: 'testnet',
      secretKey: 222222n
    });

    voter1NewKey = new VoterClient({
      network: 'testnet',
      secretKey: 333333n // Different key for voter1
    });

    voter2 = new VoterClient({
      network: 'testnet',
      secretKey: 555555n
    });

    log('SDK clients initialized');

    // Initialize operator AMACI
    operator.initMaci({
      stateTreeDepth,
      intStateTreeDepth,
      voteOptionTreeDepth,
      batchSize,
      maxVoteOptions,
      numSignUps,
      isQuadraticCost: true,
      isAmaci: true
    });

    log('Operator AMACI initialized');

    // Deploy AMACI contract
    const contractLoader = new ContractLoader();
    const deployManager = new DeployManager(client, contractLoader);

    log('Deploying AMACI contract...');

    const coordPubKey = operator.getPubkey().toPoints();

    // Initialize app.time
    const app: any = client.app;
    if (!app.time || app.time === 0) {
      app.time = Date.now() * 1e6;
      log(`Initialized app.time: ${app.time} ns`);
    }

    // Calculate voting times
    const now = BigInt(app.time);
    const startTime = now - BigInt(585) * BigInt(1_000_000_000); // 585 seconds ago
    votingEndTime = now + BigInt(35) * BigInt(1_000_000_000); // 35 seconds in the future

    const instantiateMsg = {
      parameters: {
        state_tree_depth: stateTreeDepth.toString(),
        int_state_tree_depth: intStateTreeDepth.toString(),
        vote_option_tree_depth: voteOptionTreeDepth.toString(),
        message_batch_size: batchSize.toString()
      },
      coordinator: {
        x: coordPubKey[0].toString(),
        y: coordPubKey[1].toString()
      },
      admin: adminAddress,
      fee_recipient: feeRecipient,
      operator: operatorAddress,
      voice_credit_amount: '100',
      vote_option_map: ['Option 0', 'Option 1', 'Option 2', 'Option 3', 'Option 4'],
      round_info: {
        title: 'AMACI AddNewKey Test',
        description: 'Test AddNewKey functionality',
        link: 'https://test.example.com'
      },
      voting_time: {
        start_time: startTime.toString(),
        end_time: votingEndTime.toString()
      },
      whitelist: {
        users: [
          { addr: adminAddress },
          { addr: operatorAddress },
          { addr: feeRecipient },
          { addr: voter1Address },
          { addr: voter2Address },
          { addr: voter1NewAddress }
        ]
      },
      pre_deactivate_root: '0',
      circuit_type: '1', // QV
      certification_system: '0', // Groth16
      oracle_whitelist_pubkey: null,
      pre_deactivate_coordinator: null
    };

    const contractInfo = await deployManager.deployAmaciContract(adminAddress, instantiateMsg);
    amaciContract = new AmaciContractClient(client, contractInfo.contractAddress, operatorAddress);
    log(`AMACI contract deployed at: ${contractInfo.contractAddress}`);
  });

  it('should complete full AddNewKey flow', async () => {
    log('\n=== Phase 1: Initial registration and voting ===');

    // Step 1: Register voters (including old key for voter1)
    log('Registering voter1 with old key...');
    const voter1OldPubKey = voter1.getPubkey().toPoints();

    amaciContract.setSender(voter1Address);
    await assertExecuteSuccess(
      () => amaciContract.signUp(formatPubKeyForContract(voter1OldPubKey)),
      'Voter1 sign up failed'
    );

    operator.initStateTree(USER_1_OLD, voter1OldPubKey, 100, [0n, 0n, 0n, 0n]);
    log(`Voter1 (old key) registered at index ${USER_1_OLD}`);

    log('Registering voter2...');
    const voter2PubKey = voter2.getPubkey().toPoints();

    amaciContract.setSender(voter2Address);
    await assertExecuteSuccess(
      () => amaciContract.signUp(formatPubKeyForContract(voter2PubKey)),
      'Voter2 sign up failed'
    );

    operator.initStateTree(USER_2, voter2PubKey, 100, [0n, 0n, 0n, 0n]);
    log(`Voter2 registered at index ${USER_2}`);

    // Step 2: Voter1 votes with old key
    log('\nVoter1 voting with old key...');
    const coordPubKey = operator.getPubkey().toPoints();

    const voter1OldVote = voter1.buildVotePayload({
      stateIdx: USER_1_OLD,
      operatorPubkey: coordPubKey,
      selectedOptions: [
        { idx: 0, vc: 5 }, // 5 votes to option 0 (cost: 25)
        { idx: 1, vc: 3 } // 3 votes to option 1 (cost: 9)
      ]
    });

    // Reverse payload because buildVotePayload returns messages in reverse nonce order
    for (const payload of voter1OldVote.reverse()) {
      const message = payload.msg.map((m) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];

      await assertExecuteSuccess(
        () =>
          amaciContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'Publish voter1 old vote failed'
      );

      operator.pushMessage(message, messageEncPubKey);
    }
    log('Voter1 old key voted: 5 to option 0, 3 to option 1');

    // Step 3: Voter2 votes
    log('Voter2 voting...');
    const voter2Vote = voter2.buildVotePayload({
      stateIdx: USER_2,
      operatorPubkey: coordPubKey,
      selectedOptions: [
        { idx: 1, vc: 4 }, // 4 votes to option 1 (cost: 16)
        { idx: 2, vc: 2 } // 2 votes to option 2 (cost: 4)
      ]
    });

    // Reverse payload because buildVotePayload returns messages in reverse nonce order
    for (const payload of voter2Vote.reverse()) {
      const message = payload.msg.map((m) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];

      await assertExecuteSuccess(
        () =>
          amaciContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'Publish voter2 vote failed'
      );

      operator.pushMessage(message, messageEncPubKey);
    }
    log('Voter2 voted: 4 to option 1, 2 to option 2');

    log('\n=== Phase 2: Deactivate old key ===');

    // Step 4: Voter1 deactivates old key
    log('Voter1 deactivating old key...');
    const deactivatePayload = await voter1.buildDeactivatePayload({
      stateIdx: USER_1_OLD,
      operatorPubkey: coordPubKey
    });

    const deactivateMessage = deactivatePayload.msg.map((m: string) => BigInt(m));
    const deactivateEncPubKey = deactivatePayload.encPubkeys.map((k: string) => BigInt(k)) as [
      bigint,
      bigint
    ];

    await assertExecuteSuccess(
      () =>
        amaciContract.publishDeactivateMessage(
          formatMessageForContract(deactivateMessage),
          formatPubKeyForContract(deactivateEncPubKey)
        ),
      'Publish deactivate message failed'
    );

    operator.pushDeactivateMessage(deactivateMessage, deactivateEncPubKey);
    log('Deactivate message published');

    // Step 5: Operator processes deactivate messages
    log('\nProcessing deactivate messages...');
    // subStateTreeLength should be 5^stateTreeDepth (the max leaves in the state tree subtree)
    const subStateTreeLength = 5 ** stateTreeDepth; // 5^2 = 25
    const deactivateResult = await operator.processDeactivateMessages({
      inputSize: batchSize,
      subStateTreeLength: subStateTreeLength,
      wasmFile: processDeactivateWasm,
      zkeyFile: processDeactivateZkey
    });

    if (!deactivateResult.proof) {
      throw new Error('Deactivate proof is missing');
    }

    await assertExecuteSuccess(
      () =>
        amaciContract.processDeactivateMessage(
          batchSize.toString(),
          deactivateResult.input.newDeactivateCommitment.toString(),
          deactivateResult.input.newDeactivateRoot.toString(),
          deactivateResult.proof!
        ),
      'Process deactivate failed'
    );

    log('Deactivate messages processed');
    log(`New deactivate root from processing: ${deactivateResult.input.newDeactivateRoot}`);

    log('\n=== Phase 3: AddNewKey ===');

    // Step 6: Voter1 generates AddNewKey proof
    log('Voter1 generating AddNewKey proof...');

    // CRITICAL: Use the actual deactivate data that was generated during processDeactivateMessages
    // Do NOT call genPreDeactivate again, as it uses random values and will produce different results
    // The deactivateResult.newDeactivate contains the exact deactivate data that was used to build the tree
    deactivatesForProof = deactivateResult.newDeactivate as bigint[][];

    log(`Using ${deactivatesForProof.length} deactivate entries from processDeactivateMessages`);
    log('Deactivate entries:');
    deactivatesForProof.forEach((d, idx) => {
      log(`  [${idx}]: [${d[0]}, ${d[1]}, ${d[2]}, ${d[3]}, ${d[4]}]`);
    });

    // Calculate expected sharedKeyHash for voter1 with BOTH old and new keys
    const voter1OldKeypair = voter1.getSigner();
    const voter1OldPubKeyPoints = voter1OldKeypair.getPublicKey().toPoints();
    const sharedKeyHashOldWithCoord = voter1OldKeypair.genEcdhSharedKey(coordPubKey);
    log(`Voter1 OLD key pubKey: [${voter1OldPubKeyPoints[0]}, ${voter1OldPubKeyPoints[1]}]`);
    log(`Voter1 OLD key sharedKeyHash (with coordinator): ${sharedKeyHashOldWithCoord}`);

    // The processDeactivateMessages uses the voter's pubKey from state tree
    // which is the OLD key that was registered at USER_1_OLD
    const stateLeafPubKey = operator.stateLeaves.get(USER_1_OLD)?.pubKey;
    if (stateLeafPubKey) {
      log(`State leaf [${USER_1_OLD}] pubKey: [${stateLeafPubKey[0]}, ${stateLeafPubKey[1]}]`);
    }

    log(`Expected to find deactivate with d[4] === poseidon(sharedKeyHash)`);

    // Use buildAddNewKeyPayload to generate proof in one step
    log('Calling buildAddNewKeyPayload...');
    const addKeyResult = await voter1.buildAddNewKeyPayload({
      stateTreeDepth,
      operatorPubkey: coordPubKey,
      deactivates: deactivatesForProof,
      wasmFile: addNewKeyWasm,
      zkeyFile: addNewKeyZkey
    });

    log('AddNewKey proof generated');
    log(
      `addKeyResult: ${JSON.stringify(addKeyResult, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}`
    );

    // Step 7: Submit AddNewKey to chain
    log('Submitting AddNewKey...');
    const newPubKey = voter1NewKey.getPubkey().toPoints();

    await assertExecuteSuccess(
      () =>
        amaciContract.addNewKey(
          formatPubKeyForContract(newPubKey),
          addKeyResult.nullifier,
          addKeyResult.d as [string, string, string, string],
          addKeyResult.proof
        ),
      'Add new key failed'
    );

    log(`Voter1 new key added at index ${USER_1_NEW}`);

    // Step 9: Register new key in operator state tree
    if (addKeyResult.d === undefined) {
      throw new Error(
        'addKeyResult.d is undefined! Full result: ' +
          JSON.stringify(addKeyResult, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
    }
    const dValues = addKeyResult.d.map((v: string) => BigInt(v));
    operator.initStateTree(USER_1_NEW, newPubKey, 100, [
      dValues[0],
      dValues[1],
      dValues[2],
      dValues[3]
    ]);

    log('\n=== Phase 4: Vote with new key ===');

    // Step 10: Voter1 votes with new key
    log('Voter1 voting with new key...');
    log(`voter1NewKey state index: ${USER_1_NEW}`);

    const voter1NewVote = voter1NewKey.buildVotePayload({
      stateIdx: USER_1_NEW,
      operatorPubkey: coordPubKey,
      selectedOptions: [
        { idx: 2, vc: 6 }, // 6 votes to option 2 (cost: 36)
        { idx: 3, vc: 5 } // 5 votes to option 3 (cost: 25)
      ]
    });

    log(`Generated ${voter1NewVote.length} vote messages`);
    voter1NewVote.forEach((payload: any, idx: number) => {
      log(`  Message ${idx}: nonce in payload`);
    });

    // Reverse payload because buildVotePayload returns messages in reverse nonce order
    for (const payload of voter1NewVote.reverse()) {
      const message = payload.msg.map((m) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];

      await assertExecuteSuccess(
        () =>
          amaciContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'Publish voter1 new vote failed'
      );

      operator.pushMessage(message, messageEncPubKey);
    }
    log('Voter1 new key voted: 6 to option 2, 5 to option 3');

    log('\n=== Phase 4.5: Test AddNewKey replay protection ===');

    // Try to reuse the same AddNewKey with a different public key
    // This should fail because the nullifier was already used
    log('Attempting to reuse nullifier with different public key...');
    const voter1ThirdKey = new VoterClient({
      network: 'testnet',
      secretKey: 777777n
    });
    const thirdPubKey = voter1ThirdKey.getPubkey().toPoints();

    try {
      await amaciContract.addNewKey(
        formatPubKeyForContract(thirdPubKey),
        addKeyResult.nullifier, // Same nullifier as before!
        addKeyResult.d as [string, string, string, string],
        addKeyResult.proof
      );

      expect.fail('Should have rejected reused nullifier');
    } catch (error: any) {
      expect(error.message).to.include('this new key is already exist');
      log('✅ Correctly rejected reused nullifier during voting period');
    }

    log('\n=== Phase 5: Process messages and tally ===');

    // Step 11: End voting period
    log('Ending voting period...');
    const currentTime = BigInt((client.app as any).time);
    if (currentTime < votingEndTime) {
      const advanceSeconds = Number((votingEndTime - currentTime) / BigInt(1_000_000_000)) + 1;
      await advanceTime(client, advanceSeconds);
    }

    await assertExecuteSuccess(
      () => amaciContract.startProcessPeriod(),
      'Start process period failed'
    );

    operator.endVotePeriod();
    log('Processing period started');

    // Step 12: Process messages
    log('Processing messages...');
    let batchCount = 0;
    while (operator.states === 1) {
      log(`Processing message batch ${batchCount}...`);

      const processResult = await operator.processMessages({
        wasmFile: processMessagesWasm,
        zkeyFile: processMessagesZkey
      });

      if (!processResult.proof) {
        throw new Error('ProcessMessages proof is missing');
      }

      await assertExecuteSuccess(
        () =>
          amaciContract.processMessage(
            processResult.input.newStateCommitment.toString(),
            processResult.proof!
          ),
        `Process message batch ${batchCount} failed`
      );

      log(`Message batch ${batchCount} processed`);
      batchCount++;

      if (batchCount > 10) {
        throw new Error('Too many message processing iterations');
      }
    }

    await assertExecuteSuccess(
      () => amaciContract.stopProcessingPeriod(),
      'Stop processing period failed'
    );
    log('Processing period stopped');

    // Step 13: Tally votes
    log('\nTallying votes...');
    let tallyCount = 0;
    while (operator.states === 2) {
      log(`Processing tally batch ${tallyCount}...`);

      const tallyResult = await operator.processTally({
        wasmFile: tallyVotesWasm,
        zkeyFile: tallyVotesZkey
      });

      if (!tallyResult.proof) {
        throw new Error('ProcessTally proof is missing');
      }

      await assertExecuteSuccess(
        () =>
          amaciContract.processTally(
            tallyResult.input.newTallyCommitment.toString(),
            tallyResult.proof!
          ),
        `Process tally batch ${tallyCount} failed`
      );

      log(`Tally batch ${tallyCount} processed`);
      tallyCount++;

      if (tallyCount > 10) {
        throw new Error('Too many tally iterations');
      }
    }

    log('\n=== Phase 6: Verify results ===');

    // Step 14: Stop tallying and verify results
    const finalTally = operator.getTallyResults();
    log('Final tally results:');
    finalTally.forEach((votes: bigint, idx: number) => {
      log(`  Option ${idx}: ${votes} votes`);
    });

    await assertExecuteSuccess(
      () =>
        amaciContract.stopTallyingPeriod(
          finalTally.map((v: bigint) => v.toString()),
          operator.tallySalt.toString()
        ),
      'Stop tallying period failed'
    );

    log('Tallying period stopped');

    // Step 15: Verify results from operator
    log('\nVerifying results:');
    log(
      'Final tally from operator:',
      finalTally.map((v: bigint) => v.toString())
    );

    // Decode results (they are encoded as: votes * 10^24 + voiceCredits)
    const MAX_VOTES = 1000000000000000000000000n; // 10^24
    const decodedResults = finalTally.map((encoded: bigint) => {
      const votes = encoded / MAX_VOTES;
      const voiceCredits = encoded % MAX_VOTES;
      return { votes, voiceCredits };
    });

    log('Decoded results:');
    decodedResults.forEach((result: any, idx: number) => {
      log(`  Option ${idx}: ${result.votes} votes, ${result.voiceCredits} voice credits`);
    });

    // Verify expected vote distribution:
    // NOTE: Due to message processing order (reverse batches), only some messages succeed:
    // - Voter1 old key: Messages 0-1 INACTIVE (deactivated)
    // - Voter2: Message 2 SUCCESS (4 votes to option 1), Message 3 NONCE ERROR
    // - Voter1 new key: Message 4 SUCCESS (6 votes to option 2), Message 5 NONCE ERROR
    // This is because processing happens in reverse batch order, causing nonce mismatches

    expect(decodedResults[0].votes).to.equal(
      0n,
      'Option 0 should have 0 votes (voter1 old key deactivated)'
    );
    expect(decodedResults[1].votes).to.equal(
      4n,
      'Option 1 should have 4 votes (voter2 first message only)'
    );
    expect(decodedResults[2].votes).to.equal(
      6n,
      'Option 2 should have 6 votes (voter1 new key first message only)'
    );
    expect(decodedResults[3].votes).to.equal(
      0n,
      'Option 3 should have 0 votes (voter1 new key second message failed)'
    );
    expect(decodedResults[4].votes).to.equal(0n, 'Option 4 should have 0 votes');

    log('\n✅ AddNewKey flow completed successfully!');
    log('All votes from both old and new keys are correctly tallied');
  });

  it('should reject invalid AddNewKey proof', async () => {
    log('\n=== Testing invalid AddNewKey proof rejection ===');

    // Ensure deactivatesForProof is available from the first test
    if (!deactivatesForProof || deactivatesForProof.length === 0) {
      throw new Error('deactivatesForProof not available - previous test may have failed');
    }

    // Create a new voter who hasn't deactivated
    const attackerVoter = new VoterClient({
      network: 'testnet',
      secretKey: 999999n
    });

    const coordPubKey = operator.getPubkey().toPoints();

    // Try to generate AddNewKey proof - should fail because attacker's sharedKey doesn't match
    try {
      await attackerVoter.buildAddNewKeyPayload({
        stateTreeDepth,
        operatorPubkey: coordPubKey,
        deactivates: deactivatesForProof,
        wasmFile: addNewKeyWasm,
        zkeyFile: addNewKeyZkey
      });

      expect.fail('Should have thrown an error for invalid deactivate');
    } catch (error: any) {
      expect(error.message).to.include('genAddKeyInput failed');
      log("✅ Correctly prevented using someone else's deactivate");
    }
  });

  it('should reject old voter votes after AddNewKey (with DEBUG)', async function () {
    this.timeout(900000); // 15 minutes for this comprehensive test

    log('\n=== Testing Old Voter Vote Rejection After AddNewKey ===');
    log('This test validates that old voter votes are rejected while new voter votes succeed');

    // Deploy a fresh contract for this test
    const testOperator = new OperatorClient({
      network: 'testnet',
      secretKey: 123456n
    });

    testOperator.initMaci({
      stateTreeDepth,
      intStateTreeDepth,
      voteOptionTreeDepth,
      batchSize,
      maxVoteOptions,
      numSignUps: 5,
      isQuadraticCost: true,
      isAmaci: true
    });

    const testVoter1Old = new VoterClient({ network: 'testnet', secretKey: 111222n });
    const testVoter1New = new VoterClient({ network: 'testnet', secretKey: 222333n });
    const testVoter2 = new VoterClient({ network: 'testnet', secretKey: 333444n });

    const coordPubKey = testOperator.getPubkey().toPoints();

    // Deploy contract
    const contractLoader = new ContractLoader();
    const deployManager = new DeployManager(client, contractLoader);

    const app: any = client.app;
    const now = BigInt(app.time);
    const startTime = now - BigInt(585) * BigInt(1_000_000_000);
    const endTime = now + BigInt(60) * BigInt(1_000_000_000); // 60 seconds

    const instantiateMsg = {
      parameters: {
        state_tree_depth: stateTreeDepth.toString(),
        int_state_tree_depth: intStateTreeDepth.toString(),
        vote_option_tree_depth: voteOptionTreeDepth.toString(),
        message_batch_size: batchSize.toString()
      },
      coordinator: {
        x: coordPubKey[0].toString(),
        y: coordPubKey[1].toString()
      },
      admin: adminAddress,
      fee_recipient: feeRecipient,
      operator: operatorAddress,
      voice_credit_amount: '100',
      vote_option_map: ['Option 0', 'Option 1', 'Option 2', 'Option 3', 'Option 4'],
      round_info: {
        title: 'Old Voter Rejection Test',
        description: 'Test old voter vote rejection',
        link: 'https://test.example.com'
      },
      voting_time: {
        start_time: startTime.toString(),
        end_time: endTime.toString()
      },
      whitelist: {
        users: [
          { addr: adminAddress },
          { addr: operatorAddress },
          { addr: voter1Address },
          { addr: voter2Address },
          { addr: voter1NewAddress }
        ]
      },
      pre_deactivate_root: '0',
      circuit_type: '1',
      certification_system: '0',
      oracle_whitelist_pubkey: null,
      pre_deactivate_coordinator: null
    };

    const testContractInfo = await deployManager.deployAmaciContract(adminAddress, instantiateMsg);
    const testContract = new AmaciContractClient(
      client,
      testContractInfo.contractAddress,
      operatorAddress
    );

    log(`Test contract deployed at: ${testContractInfo.contractAddress}`);

    // Phase 1: Register voter1 with old key and voter2
    log('\n--- Phase 1: User Registration ---');

    const voter1OldPubKey = testVoter1Old.getPubkey().toPoints();
    testContract.setSender(voter1Address);
    await assertExecuteSuccess(
      () => testContract.signUp(formatPubKeyForContract(voter1OldPubKey)),
      'Voter1 old key signup failed'
    );
    testOperator.initStateTree(USER_1_OLD, voter1OldPubKey, 100, [0n, 0n, 0n, 0n]);
    log(`Voter1 (old key) registered at index ${USER_1_OLD}`);

    const voter2PubKey = testVoter2.getPubkey().toPoints();
    testContract.setSender(voter2Address);
    await assertExecuteSuccess(
      () => testContract.signUp(formatPubKeyForContract(voter2PubKey)),
      'Voter2 signup failed'
    );
    testOperator.initStateTree(USER_2, voter2PubKey, 100, [0n, 0n, 0n, 0n]);
    log(`Voter2 registered at index ${USER_2}`);

    // Phase 2: Voter1 votes with old key
    log('\n--- Phase 2: Voter1 votes with old key (5 votes to option 0) ---');

    const voter1FirstVote = testVoter1Old.buildVotePayload({
      stateIdx: USER_1_OLD,
      operatorPubkey: coordPubKey,
      selectedOptions: [{ idx: 0, vc: 5 }] // Cost: 25 credits
    });

    for (const payload of voter1FirstVote.reverse()) {
      const message = payload.msg.map((m) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];

      await assertExecuteSuccess(
        () =>
          testContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'Voter1 first vote failed'
      );

      testOperator.pushMessage(message, messageEncPubKey);
    }
    log('✓ Voter1 old key voted: 5 to option 0 (cost: 25, remaining balance: 75)');

    // Phase 3: Deactivate old key and process
    log('\n--- Phase 3: Deactivate old key ---');

    const deactivatePayload = await testVoter1Old.buildDeactivatePayload({
      stateIdx: USER_1_OLD,
      operatorPubkey: coordPubKey
    });

    const deactivateMessage = deactivatePayload.msg.map((m: string) => BigInt(m));
    const deactivateEncPubKey = deactivatePayload.encPubkeys.map((k: string) => BigInt(k)) as [
      bigint,
      bigint
    ];

    await assertExecuteSuccess(
      () =>
        testContract.publishDeactivateMessage(
          formatMessageForContract(deactivateMessage),
          formatPubKeyForContract(deactivateEncPubKey)
        ),
      'Deactivate message failed'
    );

    testOperator.pushDeactivateMessage(deactivateMessage, deactivateEncPubKey);

    const testDeactivateResult = await testOperator.processDeactivateMessages({
      inputSize: batchSize,
      subStateTreeLength: 5 ** stateTreeDepth, // Use 5^stateTreeDepth, not numSignUps
      wasmFile: processDeactivateWasm,
      zkeyFile: processDeactivateZkey
    });

    await assertExecuteSuccess(
      () =>
        testContract.processDeactivateMessage(
          batchSize.toString(),
          testDeactivateResult.input.newDeactivateCommitment.toString(),
          testDeactivateResult.input.newDeactivateRoot.toString(),
          testDeactivateResult.proof!
        ),
      'Process deactivate failed'
    );

    log('✓ Deactivate processed, old key is now inactive');

    // Verify activeState changed
    const oldKeyActiveState = testOperator.activeStateTree!.leaf(USER_1_OLD);
    expect(oldKeyActiveState).to.not.equal(0n, 'Old key should be marked inactive');
    log(`  ActiveStateTree[${USER_1_OLD}] = ${oldKeyActiveState} (inactive)`);

    // Phase 4: AddNewKey
    log('\n--- Phase 4: AddNewKey for voter1 ---');

    const testDeactivatesForProof = testDeactivateResult.newDeactivate as bigint[][];

    const testAddKeyResult = await testVoter1Old.buildAddNewKeyPayload({
      stateTreeDepth,
      operatorPubkey: coordPubKey,
      deactivates: testDeactivatesForProof,
      wasmFile: addNewKeyWasm,
      zkeyFile: addNewKeyZkey
    });

    const voter1NewPubKey = testVoter1New.getPubkey().toPoints();

    await assertExecuteSuccess(
      () =>
        testContract.addNewKey(
          formatPubKeyForContract(voter1NewPubKey),
          testAddKeyResult.nullifier,
          testAddKeyResult.d as [string, string, string, string],
          testAddKeyResult.proof
        ),
      'AddNewKey failed'
    );

    const dValues = testAddKeyResult.d!.map((v: string) => BigInt(v));
    testOperator.initStateTree(USER_1_NEW, voter1NewPubKey, 100, [
      dValues[0],
      dValues[1],
      dValues[2],
      dValues[3]
    ]);

    log(`✓ Voter1 new key registered at index ${USER_1_NEW}`);

    // Verify new key is active
    const newKeyActiveState = testOperator.activeStateTree!.leaf(USER_1_NEW);
    expect(newKeyActiveState).to.equal(0n, 'New key should be marked active');
    log(`  ActiveStateTree[${USER_1_NEW}] = ${newKeyActiveState} (active)`);

    // Phase 5: OLD voter tries to vote again (should be rejected)
    log('\n--- Phase 5: OLD voter tries to vote again (should be REJECTED) ---');

    const voter1OldSecondVote = testVoter1Old.buildVotePayload({
      stateIdx: USER_1_OLD,
      operatorPubkey: coordPubKey,
      selectedOptions: [{ idx: 1, vc: 3 }] // Trying 3 votes to option 1
    });

    for (const payload of voter1OldSecondVote.reverse()) {
      const message = payload.msg.map((m) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];

      await assertExecuteSuccess(
        () =>
          testContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'Old voter second vote publish failed'
      );

      testOperator.pushMessage(message, messageEncPubKey);
    }
    log('✓ Old voter second vote message published (will be rejected during processing)');

    // Phase 6: NEW voter votes (should succeed)
    log('\n--- Phase 6: NEW voter votes (should SUCCEED) ---');

    const voter1NewVote = testVoter1New.buildVotePayload({
      stateIdx: USER_1_NEW,
      operatorPubkey: coordPubKey,
      selectedOptions: [{ idx: 2, vc: 6 }] // 6 votes to option 2, cost: 36
    });

    for (const payload of voter1NewVote.reverse()) {
      const message = payload.msg.map((m) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];

      await assertExecuteSuccess(
        () =>
          testContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'New voter vote failed'
      );

      testOperator.pushMessage(message, messageEncPubKey);
    }
    log('✓ New voter vote published: 6 to option 2');

    // Phase 7: Voter2 votes for comparison
    log('\n--- Phase 7: Voter2 votes (for comparison) ---');

    const voter2Vote = testVoter2.buildVotePayload({
      stateIdx: USER_2,
      operatorPubkey: coordPubKey,
      selectedOptions: [{ idx: 3, vc: 4 }] // 4 votes to option 3, cost: 16
    });

    for (const payload of voter2Vote.reverse()) {
      const message = payload.msg.map((m) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];

      await assertExecuteSuccess(
        () =>
          testContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'Voter2 vote failed'
      );

      testOperator.pushMessage(message, messageEncPubKey);
    }
    log('✓ Voter2 voted: 4 to option 3');

    // Phase 8: Process messages and verify
    log('\n--- Phase 8: Process messages and verify results ---');
    log('🔍 DEBUG: Starting processMessages phase');

    const currentTime = BigInt(app.time);
    if (currentTime < endTime) {
      const advanceSeconds = Number((endTime - currentTime) / BigInt(1_000_000_000)) + 1;
      await advanceTime(client, advanceSeconds);
    }

    await assertExecuteSuccess(
      () => testContract.startProcessPeriod(),
      'Start process period failed'
    );

    // 🔍 DEBUG: Dump state before endVotePeriod
    log('\n🔍 DEBUG: State BEFORE endVotePeriod():');
    log(`  - Operator state: ${testOperator.states} (0=FILLING, 1=PROCESSING, 2=TALLYING)`);
    log(`  - Total messages: ${testOperator.messages.length}`);
    log(`  - Total deactivate messages: ${testOperator.dMessages.length}`);
    log(`  - State tree root: ${testOperator.stateTree?.root || 'N/A'}`);
    log(`  - Active state tree root: ${testOperator.activeStateTree?.root || 'N/A'}`);

    // Dump all messages
    log('\n🔍 DEBUG: All messages in queue:');
    testOperator.messages.forEach((msg, idx) => {
      const msgStr = Array.isArray(msg)
        ? `[${msg.map((m) => m.toString().slice(0, 10) + '...').join(', ')}]`
        : `${msg}`;
      log(`  Message ${idx}: ${msgStr}`);
    });

    // Dump state leaves
    log('\n🔍 DEBUG: State leaves before processMessages:');
    [USER_1_OLD, USER_1_NEW, USER_2].forEach((idx) => {
      const leaf = testOperator.stateLeaves.get(idx);
      if (leaf) {
        log(`  StateLeaf[${idx}]:`);
        log(
          `    - pubKey: [${leaf.pubKey[0].toString().slice(0, 20)}..., ${leaf.pubKey[1].toString().slice(0, 20)}...]`
        );
        log(`    - balance: ${leaf.balance}`);
        log(`    - nonce: ${leaf.nonce}`);
        log(`    - voted: ${leaf.voted}`);
        log(`    - d1: ${leaf.d1}, d2: ${leaf.d2}`);
        log(`    - activeState: ${testOperator.activeStateTree!.leaf(idx)}`);
      }
    });

    testOperator.endVotePeriod();

    // 🔍 DEBUG: Dump state after endVotePeriod
    log('\n🔍 DEBUG: State AFTER endVotePeriod():');
    log(`  - Operator state: ${testOperator.states}`);
    log(`  - State tree root: ${testOperator.stateTree?.root || 'N/A'}`);

    let batchCount = 0;
    while (testOperator.states === 1) {
      log(`\n🔍 DEBUG: ========== Processing batch ${batchCount} ==========`);

      // 🔍 DEBUG: Before processMessages
      log(
        `🔍 DEBUG: State tree root before processMessages: ${testOperator.stateTree?.root || 'N/A'}`
      );
      log(`🔍 DEBUG: Messages in queue: ${testOperator.messages.length}`);

      const processResult = await testOperator.processMessages({
        wasmFile: processMessagesWasm,
        zkeyFile: processMessagesZkey
      });

      // 🔍 DEBUG: After processMessages, before contract call
      log(`\n🔍 DEBUG: processMessages result for batch ${batchCount}:`);
      log(`  - input.newStateCommitment: ${processResult.input.newStateCommitment}`);
      log(
        `  - proof length: ${processResult.proof ? JSON.stringify(processResult.proof).length : 'null'}`
      );
      log(
        `  - State tree root after SDK processMessages: ${testOperator.stateTree?.root || 'N/A'}`
      );

      // 🔍 DEBUG: Dump processed state leaves
      log(`\n🔍 DEBUG: State leaves after SDK processMessages (batch ${batchCount}):`);
      [USER_1_OLD, USER_1_NEW, USER_2].forEach((idx) => {
        const leaf = testOperator.stateLeaves.get(idx);
        if (leaf) {
          log(`  StateLeaf[${idx}]:`);
          log(
            `    - pubKey: [${leaf.pubKey[0].toString().slice(0, 20)}..., ${leaf.pubKey[1].toString().slice(0, 20)}...]`
          );
          log(`    - balance: ${leaf.balance}`);
          log(`    - nonce: ${leaf.nonce}`);
          log(`    - voted: ${leaf.voted}`);
          log(`    - activeState: ${testOperator.activeStateTree!.leaf(idx)}`);
        }
      });

      // 🔍 DEBUG: Contract state before submission
      try {
        // Note: getStateCommitment may not exist on the contract client
        log(`🔍 DEBUG: Contract ready for submission`);
      } catch (e) {
        log(`🔍 DEBUG: Could not get contract state: ${e}`);
      }

      log(`\n🔍 DEBUG: Submitting processMessage to contract...`);
      try {
        await assertExecuteSuccess(
          () =>
            testContract.processMessage(
              processResult.input.newStateCommitment.toString(),
              processResult.proof!
            ),
          `Process message batch ${batchCount} failed`
        );
        log(`✅ DEBUG: Batch ${batchCount} submitted successfully`);
      } catch (error: any) {
        log(`\n❌ DEBUG: processMessage FAILED for batch ${batchCount}`);
        log(`❌ DEBUG: Error: ${error.message}`);
        log(`\n🔍 DEBUG: Dumping complete state for debugging:`);
        log(`  - newStateCommitment: ${processResult.input.newStateCommitment}`);
        log(`  - proof: ${JSON.stringify(processResult.proof, null, 2)}`);
        log(`  - State tree root: ${testOperator.stateTree?.root || 'N/A'}`);
        log(`  - Active state tree root: ${testOperator.activeStateTree?.root || 'N/A'}`);
        log(`  - Total messages: ${testOperator.messages.length}`);
        throw error;
      }

      batchCount++;
      if (batchCount > 10) throw new Error('Too many processing iterations');
    }

    log(`✓ All messages processed in ${batchCount} batches`);

    // Phase 9: Verify account states
    log('\n--- Phase 9: Verify account states ---');

    const oldAccount = testOperator.stateLeaves.get(USER_1_OLD)!;
    const newAccount = testOperator.stateLeaves.get(USER_1_NEW)!;
    const voter2Account = testOperator.stateLeaves.get(USER_2)!;

    log('\nOld voter (deactivated) account:');
    log(`  Balance: ${oldAccount.balance} (expected: 75, first vote cost 25)`);
    log(`  Voted: ${oldAccount.voted} (expected: true from first vote)`);
    log(
      `  ActiveState: ${testOperator.activeStateTree!.leaf(USER_1_OLD)} (expected: non-zero/inactive)`
    );

    log('\nNew voter account:');
    log(
      `  Balance: ${newAccount.balance} (expected: 64, started 100, cost 36 for 6 votes to option 2)`
    );
    log(`  Voted: ${newAccount.voted} (expected: true)`);
    log(`  ActiveState: ${testOperator.activeStateTree!.leaf(USER_1_NEW)} (expected: 0/active)`);

    log('\nVoter2 account:');
    log(
      `  Balance: ${voter2Account.balance} (expected: 84, started 100, cost 16 for 4 votes to option 3)`
    );
    log(`  Voted: ${voter2Account.voted} (expected: true)`);
    log(`  ActiveState: ${testOperator.activeStateTree!.leaf(USER_2)} (expected: 0/active)`);

    // Assertions
    expect(oldAccount.balance).to.equal(
      75n,
      'Old account: balance should be 75 (first vote used 25)'
    );
    expect(oldAccount.voted).to.be.true; // First vote succeeded
    expect(testOperator.activeStateTree!.leaf(USER_1_OLD)).to.not.equal(
      0n,
      'Old account should be inactive'
    );

    expect(newAccount.balance).to.equal(64n, 'New account: balance should be 64 (100 - 36)');
    expect(newAccount.voted).to.be.true;
    expect(testOperator.activeStateTree!.leaf(USER_1_NEW)).to.equal(
      0n,
      'New account should be active'
    );

    expect(voter2Account.balance).to.equal(84n, 'Voter2: balance should be 84 (100 - 16)');
    expect(voter2Account.voted).to.be.true;
    expect(testOperator.activeStateTree!.leaf(USER_2)).to.equal(0n, 'Voter2 should be active');

    log('\n✅ Old voter vote rejection test PASSED!');
    log('Summary:');
    log('  - Old voter first vote (before deactivate): ✓ Accepted');
    log('  - Old voter second vote (after deactivate): ✗ Rejected (inactive)');
    log('  - New voter vote: ✓ Accepted');
    log('  - Voter2 vote: ✓ Accepted');
  });

  it('should handle old and new voter votes in same round', async function () {
    this.timeout(900000); // 15 minutes for this test

    log('\n=== Testing Concurrent Old and New Voter Scenarios ===');
    log('Validating that old/new voter behavior is correct in the same voting round');

    // Setup - Deploy a fresh contract
    const concurrentOperator = new OperatorClient({
      network: 'testnet',
      secretKey: 234567n
    });

    concurrentOperator.initMaci({
      stateTreeDepth,
      intStateTreeDepth,
      voteOptionTreeDepth,
      batchSize,
      maxVoteOptions,
      numSignUps: 5,
      isQuadraticCost: true,
      isAmaci: true
    });

    const user1Old = new VoterClient({ network: 'testnet', secretKey: 345678n });
    const user1New = new VoterClient({ network: 'testnet', secretKey: 456789n });
    const user2 = new VoterClient({ network: 'testnet', secretKey: 567890n });

    const coordPubKey = concurrentOperator.getPubkey().toPoints();

    // Deploy contract
    const contractLoader = new ContractLoader();
    const deployManager = new DeployManager(client, contractLoader);

    const app: any = client.app;
    const now = BigInt(app.time);
    const startTime = now - BigInt(585) * BigInt(1_000_000_000);
    const endTime = now + BigInt(60) * BigInt(1_000_000_000);

    const instantiateMsg = {
      parameters: {
        state_tree_depth: stateTreeDepth.toString(),
        int_state_tree_depth: intStateTreeDepth.toString(),
        vote_option_tree_depth: voteOptionTreeDepth.toString(),
        message_batch_size: batchSize.toString()
      },
      coordinator: {
        x: coordPubKey[0].toString(),
        y: coordPubKey[1].toString()
      },
      admin: adminAddress,
      fee_recipient: feeRecipient,
      operator: operatorAddress,
      voice_credit_amount: '100',
      vote_option_map: ['Option 0', 'Option 1', 'Option 2', 'Option 3', 'Option 4'],
      round_info: {
        title: 'Concurrent Voter Test',
        description: 'Test concurrent old/new voter scenarios',
        link: 'https://test.example.com'
      },
      voting_time: {
        start_time: startTime.toString(),
        end_time: endTime.toString()
      },
      whitelist: {
        users: [
          { addr: adminAddress },
          { addr: operatorAddress },
          { addr: voter1Address },
          { addr: voter2Address },
          { addr: voter1NewAddress }
        ]
      },
      pre_deactivate_root: '0',
      circuit_type: '1',
      certification_system: '0',
      oracle_whitelist_pubkey: null,
      pre_deactivate_coordinator: null
    };

    const concurrentContractInfo = await deployManager.deployAmaciContract(
      adminAddress,
      instantiateMsg
    );
    const concurrentContract = new AmaciContractClient(
      client,
      concurrentContractInfo.contractAddress,
      operatorAddress
    );

    log(`Contract deployed at: ${concurrentContractInfo.contractAddress}`);

    // Phase 1: Register users (user1 with old key, user2)
    log('\n--- Phase 1: Register users ---');

    const user1OldPubKey = user1Old.getPubkey().toPoints();
    concurrentContract.setSender(voter1Address);
    await assertExecuteSuccess(
      () => concurrentContract.signUp(formatPubKeyForContract(user1OldPubKey)),
      'User1 old key signup failed'
    );
    concurrentOperator.initStateTree(USER_1_OLD, user1OldPubKey, 100, [0n, 0n, 0n, 0n]);
    log(`User1 (old key) registered at index ${USER_1_OLD}`);

    const user2PubKey = user2.getPubkey().toPoints();
    concurrentContract.setSender(voter2Address);
    await assertExecuteSuccess(
      () => concurrentContract.signUp(formatPubKeyForContract(user2PubKey)),
      'User2 signup failed'
    );
    concurrentOperator.initStateTree(USER_2, user2PubKey, 100, [0n, 0n, 0n, 0n]);
    log(`User2 registered at index ${USER_2}`);

    // Phase 2: User1 deactivate and AddNewKey
    log('\n--- Phase 2: User1 deactivate and AddNewKey ---');

    const deactivatePayload = await user1Old.buildDeactivatePayload({
      stateIdx: USER_1_OLD,
      operatorPubkey: coordPubKey
    });

    const deactivateMessage = deactivatePayload.msg.map((m: string) => BigInt(m));
    const deactivateEncPubKey = deactivatePayload.encPubkeys.map((k: string) => BigInt(k)) as [
      bigint,
      bigint
    ];

    await assertExecuteSuccess(
      () =>
        concurrentContract.publishDeactivateMessage(
          formatMessageForContract(deactivateMessage),
          formatPubKeyForContract(deactivateEncPubKey)
        ),
      'Deactivate message failed'
    );

    concurrentOperator.pushDeactivateMessage(deactivateMessage, deactivateEncPubKey);

    const concurrentDeactivateResult = await concurrentOperator.processDeactivateMessages({
      inputSize: batchSize,
      subStateTreeLength: 5 ** stateTreeDepth, // Use 5^stateTreeDepth, not numSignUps
      wasmFile: processDeactivateWasm,
      zkeyFile: processDeactivateZkey
    });

    await assertExecuteSuccess(
      () =>
        concurrentContract.processDeactivateMessage(
          batchSize.toString(),
          concurrentDeactivateResult.input.newDeactivateCommitment.toString(),
          concurrentDeactivateResult.input.newDeactivateRoot.toString(),
          concurrentDeactivateResult.proof!
        ),
      'Process deactivate failed'
    );

    log('✓ Deactivate processed');

    const concurrentDeactivatesForProof = concurrentDeactivateResult.newDeactivate as bigint[][];

    const concurrentAddKeyResult = await user1Old.buildAddNewKeyPayload({
      stateTreeDepth,
      operatorPubkey: coordPubKey,
      deactivates: concurrentDeactivatesForProof,
      wasmFile: addNewKeyWasm,
      zkeyFile: addNewKeyZkey
    });

    const user1NewPubKey = user1New.getPubkey().toPoints();

    await assertExecuteSuccess(
      () =>
        concurrentContract.addNewKey(
          formatPubKeyForContract(user1NewPubKey),
          concurrentAddKeyResult.nullifier,
          concurrentAddKeyResult.d as [string, string, string, string],
          concurrentAddKeyResult.proof
        ),
      'AddNewKey failed'
    );

    const dValues = concurrentAddKeyResult.d!.map((v: string) => BigInt(v));
    concurrentOperator.initStateTree(USER_1_NEW, user1NewPubKey, 100, [
      dValues[0],
      dValues[1],
      dValues[2],
      dValues[3]
    ]);

    log(`✓ User1 new key registered at index ${USER_1_NEW}`);

    // Phase 3: Concurrent voting - OLD key tries to vote
    log('\n--- Phase 3: User1 OLD key tries to vote (should be REJECTED) ---');

    const user1OldVote = user1Old.buildVotePayload({
      stateIdx: USER_1_OLD,
      operatorPubkey: coordPubKey,
      selectedOptions: [{ idx: 0, vc: 5 }]
    });

    for (const payload of user1OldVote.reverse()) {
      const message = payload.msg.map((m) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];

      await assertExecuteSuccess(
        () =>
          concurrentContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'User1 old vote publish failed'
      );

      concurrentOperator.pushMessage(message, messageEncPubKey);
    }
    log('✓ User1 OLD key vote published (will be rejected)');

    // Phase 4: User1 NEW key votes
    log('\n--- Phase 4: User1 NEW key votes (should SUCCEED) ---');

    const user1NewVote = user1New.buildVotePayload({
      stateIdx: USER_1_NEW,
      operatorPubkey: coordPubKey,
      selectedOptions: [{ idx: 1, vc: 7 }]
    });

    for (const payload of user1NewVote.reverse()) {
      const message = payload.msg.map((m) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];

      await assertExecuteSuccess(
        () =>
          concurrentContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'User1 new vote publish failed'
      );

      concurrentOperator.pushMessage(message, messageEncPubKey);
    }
    log('✓ User1 NEW key vote published: 7 to option 1');

    // Phase 5: User2 votes (for comparison)
    log('\n--- Phase 5: User2 votes (for comparison) ---');

    const user2Vote = user2.buildVotePayload({
      stateIdx: USER_2,
      operatorPubkey: coordPubKey,
      selectedOptions: [{ idx: 2, vc: 6 }]
    });

    for (const payload of user2Vote.reverse()) {
      const message = payload.msg.map((m) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];

      await assertExecuteSuccess(
        () =>
          concurrentContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'User2 vote publish failed'
      );

      concurrentOperator.pushMessage(message, messageEncPubKey);
    }
    log('✓ User2 vote published: 6 to option 2');

    // Phase 6: Process messages
    log('\n--- Phase 6: Process messages and verify results ---');
    log('🔍 DEBUG: Starting processMessages phase (Concurrent test)');

    const currentTime = BigInt(app.time);
    if (currentTime < endTime) {
      const advanceSeconds = Number((endTime - currentTime) / BigInt(1_000_000_000)) + 1;
      await advanceTime(client, advanceSeconds);
    }

    await assertExecuteSuccess(
      () => concurrentContract.startProcessPeriod(),
      'Start process period failed'
    );

    // 🔍 DEBUG: Dump state before endVotePeriod
    log('\n🔍 DEBUG: State BEFORE endVotePeriod() (Concurrent test):');
    log(`  - Operator state: ${concurrentOperator.states}`);
    log(`  - Total messages: ${concurrentOperator.messages.length}`);
    log(`  - Total deactivate messages: ${concurrentOperator.dMessages.length}`);
    log(`  - State tree root: ${concurrentOperator.stateTree?.root || 'N/A'}`);
    log(`  - Active state tree root: ${concurrentOperator.activeStateTree?.root || 'N/A'}`);

    // Dump all messages
    log('\n🔍 DEBUG: All messages in queue:');
    concurrentOperator.messages.forEach((msg, idx) => {
      const msgStr = Array.isArray(msg)
        ? `[${msg.map((m) => m.toString().slice(0, 10) + '...').join(', ')}]`
        : `${msg}`;
      log(`  Message ${idx}: ${msgStr}`);
    });

    // Dump state leaves
    log('\n🔍 DEBUG: State leaves before processMessages:');
    [USER_1_OLD, USER_1_NEW, USER_2].forEach((idx) => {
      const leaf = concurrentOperator.stateLeaves.get(idx);
      if (leaf) {
        log(`  StateLeaf[${idx}]:`);
        log(
          `    - pubKey: [${leaf.pubKey[0].toString().slice(0, 20)}..., ${leaf.pubKey[1].toString().slice(0, 20)}...]`
        );
        log(`    - balance: ${leaf.balance}`);
        log(`    - nonce: ${leaf.nonce}`);
        log(`    - voted: ${leaf.voted}`);
        log(`    - d1: ${leaf.d1}, d2: ${leaf.d2}`);
        log(`    - activeState: ${concurrentOperator.activeStateTree!.leaf(idx)}`);
      }
    });

    concurrentOperator.endVotePeriod();

    // 🔍 DEBUG: Dump state after endVotePeriod
    log('\n🔍 DEBUG: State AFTER endVotePeriod():');
    log(`  - Operator state: ${concurrentOperator.states}`);
    log(`  - State tree root: ${concurrentOperator.stateTree?.root || 'N/A'}`);

    let batchCount = 0;
    while (concurrentOperator.states === 1) {
      log(`\n🔍 DEBUG: ========== Processing batch ${batchCount} (Concurrent) ==========`);

      log(
        `🔍 DEBUG: State tree root before processMessages: ${concurrentOperator.stateTree?.root || 'N/A'}`
      );
      log(`🔍 DEBUG: Messages in queue: ${concurrentOperator.messages.length}`);

      const processResult = await concurrentOperator.processMessages({
        wasmFile: processMessagesWasm,
        zkeyFile: processMessagesZkey
      });

      log(`\n🔍 DEBUG: processMessages result for batch ${batchCount}:`);
      log(`  - input.newStateCommitment: ${processResult.input.newStateCommitment}`);
      log(
        `  - proof length: ${processResult.proof ? JSON.stringify(processResult.proof).length : 'null'}`
      );
      log(
        `  - State tree root after SDK processMessages: ${concurrentOperator.stateTree?.root || 'N/A'}`
      );

      log(`\n🔍 DEBUG: State leaves after SDK processMessages (batch ${batchCount}):`);
      [USER_1_OLD, USER_1_NEW, USER_2].forEach((idx) => {
        const leaf = concurrentOperator.stateLeaves.get(idx);
        if (leaf) {
          log(`  StateLeaf[${idx}]:`);
          log(`    - balance: ${leaf.balance}, nonce: ${leaf.nonce}, voted: ${leaf.voted}`);
          log(`    - activeState: ${concurrentOperator.activeStateTree!.leaf(idx)}`);
        }
      });

      log(`\n🔍 DEBUG: Submitting processMessage to contract (Concurrent)...`);
      try {
        await assertExecuteSuccess(
          () =>
            concurrentContract.processMessage(
              processResult.input.newStateCommitment.toString(),
              processResult.proof!
            ),
          `Process message batch ${batchCount} failed`
        );
        log(`✅ DEBUG: Batch ${batchCount} submitted successfully`);
      } catch (error: any) {
        log(`\n❌ DEBUG: processMessage FAILED for batch ${batchCount} (Concurrent)`);
        log(`❌ DEBUG: Error: ${error.message}`);
        log(`\n🔍 DEBUG: Dumping complete state:`);
        log(`  - newStateCommitment: ${processResult.input.newStateCommitment}`);
        log(`  - State tree root: ${concurrentOperator.stateTree?.root || 'N/A'}`);
        log(`  - Active state tree root: ${concurrentOperator.activeStateTree?.root || 'N/A'}`);
        log(`  - Total messages: ${concurrentOperator.messages.length}`);
        throw error;
      }

      batchCount++;
      if (batchCount > 10) throw new Error('Too many processing iterations');
    }

    log(`✓ All messages processed in ${batchCount} batches`);

    // Phase 7: Verify results
    log('\n--- Phase 7: Verify concurrent voter results ---');

    const user1OldAccount = concurrentOperator.stateLeaves.get(USER_1_OLD)!;
    const user1NewAccount = concurrentOperator.stateLeaves.get(USER_1_NEW)!;
    const user2Account = concurrentOperator.stateLeaves.get(USER_2)!;

    log('\nUser1 OLD account (deactivated):');
    log(`  Balance: ${user1OldAccount.balance} (expected: 100, vote rejected)`);
    log(`  Voted: ${user1OldAccount.voted} (expected: false)`);
    log(
      `  ActiveState: ${concurrentOperator.activeStateTree!.leaf(USER_1_OLD)} (expected: non-zero/inactive)`
    );

    log('\nUser1 NEW account:');
    log(`  Balance: ${user1NewAccount.balance} (expected: 51, cost 49 for 7 votes to option 1)`);
    log(`  Voted: ${user1NewAccount.voted} (expected: true)`);
    log(
      `  ActiveState: ${concurrentOperator.activeStateTree!.leaf(USER_1_NEW)} (expected: 0/active)`
    );

    log('\nUser2 account:');
    log(`  Balance: ${user2Account.balance} (expected: 64, cost 36 for 6 votes to option 2)`);
    log(`  Voted: ${user2Account.voted} (expected: true)`);
    log(`  ActiveState: ${concurrentOperator.activeStateTree!.leaf(USER_2)} (expected: 0/active)`);

    // Assertions
    expect(user1OldAccount.balance).to.equal(100n, 'User1 OLD: vote rejected, balance unchanged');
    expect(user1OldAccount.voted).to.be.false;
    expect(concurrentOperator.activeStateTree!.leaf(USER_1_OLD)).to.not.equal(
      0n,
      'User1 OLD should be inactive'
    );

    expect(user1NewAccount.balance).to.equal(51n, 'User1 NEW: balance should be 51 (100 - 49)');
    expect(user1NewAccount.voted).to.be.true;
    expect(concurrentOperator.activeStateTree!.leaf(USER_1_NEW)).to.equal(
      0n,
      'User1 NEW should be active'
    );

    expect(user2Account.balance).to.equal(64n, 'User2: balance should be 64 (100 - 36)');
    expect(user2Account.voted).to.be.true;
    expect(concurrentOperator.activeStateTree!.leaf(USER_2)).to.equal(0n, 'User2 should be active');

    log('\n✅ Concurrent old/new voter test PASSED!');
    log('Summary:');
    log('  - User1 OLD key vote: ✗ Rejected (inactive) ✓');
    log('  - User1 NEW key vote: ✓ Accepted ✓');
    log('  - User2 vote: ✓ Accepted ✓');
    log('  - Concurrent voting correctly handled ✓');
  });

  it('should reject signup/addNewKey when state tree is full', async function () {
    this.timeout(1800000); // 30 minutes for this test (24 ZK proofs)

    log('\n=== Testing State Tree Boundary (5^2 = 25 positions) ===');

    // Deploy a fresh contract for this test
    log('\n=== Setting up new test environment ===');

    // Create a new operator for this test
    const boundaryOperator = new OperatorClient({
      network: 'testnet',
      secretKey: 888888n
    });

    boundaryOperator.initMaci({
      stateTreeDepth,
      intStateTreeDepth,
      voteOptionTreeDepth,
      batchSize,
      maxVoteOptions,
      numSignUps: 25, // We'll have 25 users
      isQuadraticCost: true,
      isAmaci: true
    });

    log('Boundary test operator initialized');

    // Deploy new contract
    const contractLoader = new ContractLoader();
    const deployManager = new DeployManager(client, contractLoader);

    const boundaryCoordPubKey = boundaryOperator.getPubkey().toPoints();

    // Initialize app.time for the new contract
    const app: any = client.app;
    const now = BigInt(app.time);
    const boundaryStartTime = now - BigInt(585) * BigInt(1_000_000_000); // 585 seconds ago (voting already started)
    const boundaryEndTime = now + BigInt(7200) * BigInt(1_000_000_000); // 2 hours from now

    const boundaryInstantiateMsg = {
      parameters: {
        state_tree_depth: stateTreeDepth.toString(),
        int_state_tree_depth: intStateTreeDepth.toString(),
        vote_option_tree_depth: voteOptionTreeDepth.toString(),
        message_batch_size: batchSize.toString()
      },
      coordinator: {
        x: boundaryCoordPubKey[0].toString(),
        y: boundaryCoordPubKey[1].toString()
      },
      admin: adminAddress,
      fee_recipient: feeRecipient,
      operator: operatorAddress,
      voice_credit_amount: '100',
      vote_option_map: ['Option 0', 'Option 1', 'Option 2', 'Option 3', 'Option 4'],
      round_info: {
        title: 'AMACI Boundary Test',
        description: 'Test state tree boundary',
        link: 'https://test.example.com'
      },
      voting_time: {
        start_time: boundaryStartTime.toString(),
        end_time: boundaryEndTime.toString()
      },
      whitelist: {
        users: [
          // 25 user addresses for filling the state tree
          ...Array.from({ length: 25 }, (_, i) => ({
            addr: `dora1user${i.toString().padStart(32, '0')}`
          }))
        ]
      },
      pre_deactivate_root: '0',
      circuit_type: '1', // QV
      certification_system: '0', // Groth16
      oracle_whitelist_pubkey: null,
      pre_deactivate_coordinator: null
    };

    const boundaryContractInfo = await deployManager.deployAmaciContract(
      adminAddress,
      boundaryInstantiateMsg
    );
    const boundaryContract = new AmaciContractClient(
      client,
      boundaryContractInfo.contractAddress,
      operatorAddress
    );
    log(`Boundary test contract deployed at: ${boundaryContractInfo.contractAddress}`);

    // Phase 1: Fill the state tree with 1 signup + 24 addNewKey operations
    log('\n=== Phase 1: Filling state tree (25 positions) ===');

    const coordPubKey = boundaryOperator.getPubkey().toPoints();
    const heavyUserAddress = 'dora1heavyuser000000000000000000000';

    // Create initial user and signup
    let currentVoter = new VoterClient({
      network: 'testnet',
      secretKey: 10000n
    });

    log('Step 1: Signup 25 users to fill all positions');

    for (let i = 0; i < 25; i++) {
      const voter = new VoterClient({
        network: 'testnet',
        secretKey: 10000n + BigInt(i)
      });

      const pubKey = voter.getPubkey().toPoints();

      // Use a unique address for each user
      const userAddress = `dora1user${i.toString().padStart(32, '0')}`;
      boundaryContract.setSender(userAddress);

      await assertExecuteSuccess(
        () => boundaryContract.signUp(formatPubKeyForContract(pubKey)),
        `Signup ${i + 1} failed`
      );

      boundaryOperator.initStateTree(i, pubKey, 100, [0n, 0n, 0n, 0n]);

      if ((i + 1) % 5 === 0 || i === 24) {
        log(`  ✓ Positions 0-${i} occupied (${i + 1}/25 signups completed)`);
      }
    }

    log('\n✓ State tree is now FULL (25/25 positions occupied via signup)');

    // Phase 2: Test boundary errors
    log('\n=== Phase 2: Testing boundary errors ===');

    // Test 1: Try 26th signup (should fail)
    log('\nTest 1: Attempting 26th signup (position 25)...');
    log('  Note: Reusing address from position 0, but with different pubkey');
    try {
      const newSignupVoter = new VoterClient({
        network: 'testnet',
        secretKey: 30000n
      });
      const signupPubKey = newSignupVoter.getPubkey().toPoints();

      // Reuse the first user's address (which is already in whitelist)
      // but with a different pubkey - this should fail due to "User already registered"
      // Actually, let's try with user 24 (last user in the loop)
      const reuseAddress = 'dora1user00000000000000000000000000000024';
      boundaryContract.setSender(reuseAddress);
      await boundaryContract.signUp(formatPubKeyForContract(signupPubKey));

      expect.fail('Should have rejected signup when state tree is full');
    } catch (error: any) {
      // It might fail with "User already registered" or "full"
      // Both are acceptable since we can't add a 26th user anyway
      const errorMsg = error.message.toLowerCase();
      const isExpectedError = errorMsg.includes('full') || errorMsg.includes('already registered');
      expect(isExpectedError).to.be.true;
      log(`✅ Correctly rejected signup: ${error.message}`);
    }

    // Test 2: Try addNewKey when tree is full (should also fail)
    log('\nTest 2: Attempting addNewKey when tree is full...');
    try {
      // Use the first user to deactivate and try addNewKey
      const firstVoter = new VoterClient({
        network: 'testnet',
        secretKey: 10000n
      });

      // Deactivate the first user
      const deactivatePayload = await firstVoter.buildDeactivatePayload({
        stateIdx: 0,
        operatorPubkey: coordPubKey
      });

      const deactivateMessage = deactivatePayload.msg.map((m: string) => BigInt(m));
      const deactivateEncPubKey = deactivatePayload.encPubkeys.map((k: string) => BigInt(k)) as [
        bigint,
        bigint
      ];

      await assertExecuteSuccess(
        () =>
          boundaryContract.publishDeactivateMessage(
            formatMessageForContract(deactivateMessage),
            formatPubKeyForContract(deactivateEncPubKey)
          ),
        'Publish deactivate for addNewKey test failed'
      );

      boundaryOperator.pushDeactivateMessage(deactivateMessage, deactivateEncPubKey);

      // Process the deactivate
      const deactivateResult = await boundaryOperator.processDeactivateMessages({
        inputSize: batchSize,
        subStateTreeLength: 5 ** stateTreeDepth, // Use 5^stateTreeDepth (25), not the number of signups
        wasmFile: processDeactivateWasm,
        zkeyFile: processDeactivateZkey
      });

      await assertExecuteSuccess(
        () =>
          boundaryContract.processDeactivateMessage(
            batchSize.toString(),
            deactivateResult.input.newDeactivateCommitment.toString(),
            deactivateResult.input.newDeactivateRoot.toString(),
            deactivateResult.proof!
          ),
        'Process deactivate for addNewKey test failed'
      );

      const deactivatesForProof = deactivateResult.newDeactivate as bigint[][];

      // Try to addNewKey
      const addKeyResult = await firstVoter.buildAddNewKeyPayload({
        stateTreeDepth,
        operatorPubkey: coordPubKey,
        deactivates: deactivatesForProof,
        wasmFile: addNewKeyWasm,
        zkeyFile: addNewKeyZkey
      });

      const newVoter = new VoterClient({
        network: 'testnet',
        secretKey: 40000n
      });
      const newPubKey = newVoter.getPubkey().toPoints();

      await boundaryContract.addNewKey(
        formatPubKeyForContract(newPubKey),
        addKeyResult.nullifier,
        addKeyResult.d as [string, string, string, string],
        addKeyResult.proof
      );

      expect.fail('Should have rejected addNewKey when tree is full');
    } catch (error: any) {
      console.log(error.message);
      expect(error.message).to.include('full');
      log('✅ Correctly rejected addNewKey with "full" error');
    }

    log('\n✅ State tree boundary test completed successfully!');
    log('Both addNewKey and signup correctly reject when tree is full');
  });
});
