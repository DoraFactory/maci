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
 * AMACI End-to-End Test (Simplified - Without Deactivate Process)
 *
 * This test demonstrates the basic AMACI voting flow:
 * 1. Environment setup
 * 2. User registration (including new key setup)
 * 3. Voting (only new key votes)
 * 4. End voting period
 * 5. Message processing
 * 6. Tallying
 * 7. Result verification
 *
 * Note: Deactivate process is not included in this test
 */

describe('AMACI End-to-End Test', function () {
  this.timeout(600000); // 10 minutes for the entire test suite

  let client: SimulateCosmWasmClient;
  let operator: OperatorClient;
  let voter1: VoterClient;
  let voter2: VoterClient;
  let voter1New: VoterClient;
  let amaciContract: AmaciContractClient;
  let votingEndTime: bigint; // Store voting end time for dynamic calculation

  const adminAddress = 'orai1admin000000000000000000000000000000';
  const operatorAddress = 'orai1operator000000000000000000000000';
  const feeRecipient = 'orai1feerecipient0000000000000000000';

  // Unique addresses for each voter (for whitelist registration)
  const voter1Address = 'orai1voter1000000000000000000000000000000';
  const voter2Address = 'orai1voter2000000000000000000000000000000';
  const voter1NewAddress = 'orai1voter1new000000000000000000000000';

  // Test parameters (must match zkey configuration: 2-1-1-5)
  const stateTreeDepth = 2; // 5^2 = 25 max voters
  const intStateTreeDepth = 1;
  const voteOptionTreeDepth = 1; // 5^1 = 5 max options
  const batchSize = 5; // Process 5 messages per batch
  const maxVoteOptions = 5 ** voteOptionTreeDepth; // 5
  const numSignUps = 3;

  // User indices
  const USER_1 = 0;
  const USER_2 = 1;
  const USER_1A = 2; // User 1's new key

  // Circuit artifacts paths (AMACI uses different zkey files from MACI)
  const circuitConfig = 'amaci-2-1-1-5'; // AMACI-specific configuration
  const circuitDir = path.join(__dirname, '../circuits', circuitConfig);
  const processMessagesWasm = path.join(circuitDir, 'processMessages.wasm');
  const processMessagesZkey = path.join(circuitDir, 'processMessages.zkey');
  const tallyVotesWasm = path.join(circuitDir, 'tallyVotes.wasm');
  const tallyVotesZkey = path.join(circuitDir, 'tallyVotes.zkey');
  // Deactivate and AddNewKey circuits (not used in simplified test, reserved for future use)
  // const deactivateWasm = path.join(circuitDir, 'deactivate.wasm');
  // const deactivateZkey = path.join(circuitDir, 'deactivate.zkey');
  // const addNewKeyWasm = path.join(circuitDir, 'addNewKey.wasm');
  // const addNewKeyZkey = path.join(circuitDir, 'addNewKey.zkey');

  before(async () => {
    log('=== Setting up test environment ===');

    // Create test environment
    const env = await createTestEnvironment({
      chainId: 'amaci-test',
      bech32Prefix: 'orai'
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

    voter2 = new VoterClient({
      network: 'testnet',
      secretKey: 555555n
    });

    voter1New = new VoterClient({
      network: 'testnet',
      secretKey: 666666n
    });

    log('SDK clients initialized');

    // Initialize operator AMACI (Quadratic Voting with anonymous keys)
    operator.initMaci({
      stateTreeDepth,
      intStateTreeDepth,
      voteOptionTreeDepth,
      batchSize,
      maxVoteOptions,
      numSignUps,
      isQuadraticCost: true,
      isAmaci: true // AMACI uses anonymous keys (d1, d2)
    });

    log('Operator AMACI initialized');

    // Deploy AMACI contract
    const contractLoader = new ContractLoader();
    const deployManager = new DeployManager(client, contractLoader);

    log('Deploying AMACI contract...');

    const coordPubKey = operator.getPubkey().toPoints();

    // Initialize app.time for cw-simulate
    const app: any = client.app;
    if (!app.time || app.time === 0) {
      app.time = Date.now() * 1e6; // Convert milliseconds to nanoseconds
      log(`Initialized app.time: ${app.time} ns`);
    }

    // Calculate voting times
    // AMACI contract requires voting period to be at least 10 minutes (600 seconds)
    // Strategy: Set minimum valid voting period (610 seconds) with start in past and end 25 seconds in future
    // Buffer time accounts for: registration(2s) + deactivate(12s) + voting(4s) + processing(5s) + margin(2s)
    const now = BigInt(app.time); // Convert to BigInt for calculation
    const startTime = now - BigInt(585) * BigInt(1_000_000_000); // 585 seconds ago
    votingEndTime = now + BigInt(25) * BigInt(1_000_000_000); // 25 seconds in the future (enough for all operations)
    // Total duration: 585 + 25 = 610 seconds (满足 600 秒最低要求)

    log(`Current time: ${now} (${new Date(Number(now / BigInt(1_000_000))).toISOString()})`);
    log(
      `Voting period: start=${startTime} (${new Date(Number(startTime / BigInt(1_000_000))).toISOString()}), end=${votingEndTime} (${new Date(Number(votingEndTime / BigInt(1_000_000))).toISOString()})`
    );
    log(`Period duration: ${(votingEndTime - startTime) / BigInt(1_000_000_000)} seconds`);
    log(`⏰ Using simulated time control - no real waiting needed`);

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
        title: 'AMACI E2E Test Round',
        description: 'Test round for AMACI e2e testing',
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

  it('should complete the full AMACI voting flow', async () => {
    log('\n=== Step 1: User Registration ===\n');

    // Register user 1
    const user1PubKey = voter1.getPubkey().toPoints();
    log(`User 1 public key: [${user1PubKey[0]}, ${user1PubKey[1]}]`);

    amaciContract.setSender(voter1Address);
    await assertExecuteSuccess(
      () => amaciContract.signUp(formatPubKeyForContract(user1PubKey)),
      'User 1 sign up failed'
    );

    operator.initStateTree(USER_1, user1PubKey, 100);
    log('User 1 registered');

    // Register user 2
    const user2PubKey = voter2.getPubkey().toPoints();
    log(`User 2 public key: [${user2PubKey[0]}, ${user2PubKey[1]}]`);

    amaciContract.setSender(voter2Address);
    await assertExecuteSuccess(
      () => amaciContract.signUp(formatPubKeyForContract(user2PubKey)),
      'User 2 sign up failed'
    );

    operator.initStateTree(USER_2, user2PubKey, 100);
    log('User 2 registered');

    // Register user 1's new key (without deactivate process)
    const user1aPubKey = voter1New.getPubkey().toPoints();
    log(`User 1 new public key: [${user1aPubKey[0]}, ${user1aPubKey[1]}]`);

    // Register new key on chain
    amaciContract.setSender(voter1NewAddress);
    await assertExecuteSuccess(
      () => amaciContract.signUp(formatPubKeyForContract(user1aPubKey)),
      'User 1 new key sign up failed'
    );

    // Add new key to operator state tree
    operator.initStateTree(USER_1A, user1aPubKey, 100);
    log('User 1 new key registered and added to operator state tree');

    // Verify registration count
    const numSignUp = await amaciContract.getNumSignUp();
    expect(numSignUp).to.equal('3');
    log(`Total registrations: ${numSignUp}`);

    log('\n=== Step 2: Submit Votes ===\n');

    const coordPubKey = operator.getPubkey().toPoints();

    // User 1's new key votes: option 0(1), option 1(2), option 2(3)
    const vote3Payload = voter1New.buildVotePayload({
      stateIdx: USER_1A,
      operatorPubkey: coordPubKey,
      selectedOptions: [
        { idx: 0, vc: 1 },
        { idx: 1, vc: 2 },
        { idx: 2, vc: 3 }
      ]
    });

    for (const payload of vote3Payload) {
      const message = payload.msg.map((m) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];

      await assertExecuteSuccess(
        () =>
          amaciContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'Publish vote failed'
      );

      operator.pushMessage(message, messageEncPubKey);
    }
    log('User 1 (new key) vote submitted');

    const msgChainLength = await amaciContract.getMsgChainLength();
    log(`Total votes submitted: ${msgChainLength}`);

    log('\n=== Step 3: End Vote Period ===\n');

    // Calculate how much time we need to advance for voting period to end
    const app: any = client.app;
    const currentTime = BigInt(app.time);
    log(
      `Current time: ${currentTime} (${new Date(Number(currentTime / BigInt(1_000_000))).toISOString()})`
    );
    log(
      `Voting end time: ${votingEndTime} (${new Date(Number(votingEndTime / BigInt(1_000_000))).toISOString()})`
    );

    if (currentTime < votingEndTime) {
      const advanceSeconds = Number((votingEndTime - currentTime) / BigInt(1_000_000_000)) + 1; // +1 second buffer
      log(`Advancing time by ${advanceSeconds} seconds to end voting period...`);
      log('⚡ Using simulated time - instant completion, no waiting!');
      await advanceTime(client, advanceSeconds);
      log(`✅ Time advanced by ${advanceSeconds} seconds, voting period has ended (simulated)`);
    } else {
      log('✅ Voting period already expired, no time advance needed!');
    }

    await assertExecuteSuccess(
      () => amaciContract.startProcessPeriod(),
      'Start process period failed'
    );

    operator.endVotePeriod();
    log('Vote period ended, processing started');

    log('\n=== Step 4: Process Messages ===\n');

    let batchCount = 0;
    while (operator.states === 1) {
      log(`Processing message batch ${batchCount}...`);

      // Generate real ZK proof using SDK
      const processResult = await operator.processMessages({
        wasmFile: processMessagesWasm,
        zkeyFile: processMessagesZkey
      });

      log(`New state commitment: ${processResult.input.newStateCommitment}`);

      if (!processResult.proof) {
        throw new Error('ProcessMessages proof is missing');
      }

      // Process on contract
      await assertExecuteSuccess(
        () =>
          amaciContract.processMessage(
            processResult.input.newStateCommitment.toString(),
            processResult.proof! // Non-null assertion after check
          ),
        `Process message batch ${batchCount} failed`
      );

      log(`Message batch ${batchCount} processed`);
      batchCount++;

      if (batchCount > 10) {
        throw new Error('Too many message processing iterations');
      }
    }

    log(`All messages processed in ${batchCount} batches`);

    // Stop processing period to transition to tallying
    await assertExecuteSuccess(
      () => amaciContract.stopProcessingPeriod(),
      'Stop processing period failed'
    );

    log('Processing period stopped, transitioning to tallying');

    log('\n=== Step 5: Tally Votes ===\n');

    let tallyCount = 0;
    while (operator.states === 2) {
      log(`Processing tally batch ${tallyCount}...`);

      // Generate real ZK proof using SDK
      const tallyResult = await operator.processTally({
        wasmFile: tallyVotesWasm,
        zkeyFile: tallyVotesZkey
      });

      log(`New tally commitment: ${tallyResult.input.newTallyCommitment}`);

      if (!tallyResult.proof) {
        throw new Error('TallyVotes proof is missing');
      }

      // Process on contract
      await assertExecuteSuccess(
        () =>
          amaciContract.processTally(
            tallyResult.input.newTallyCommitment.toString(),
            tallyResult.proof! // Non-null assertion after check
          ),
        `Process tally batch ${tallyCount} failed`
      );

      log(`Tally batch ${tallyCount} processed`);
      tallyCount++;

      if (tallyCount > 10) {
        throw new Error('Too many tally iterations');
      }
    }

    log(`Tallying completed in ${tallyCount} batches`);

    log('\n=== Step 6: Verify Results ===\n');

    const sdkResults = operator.getTallyResults();
    log('SDK results:');
    sdkResults.forEach((result, idx) => {
      log(`  Option ${idx}: ${result}`);
    });

    // Query contract results
    const contractResults = await amaciContract.getAllResult();
    log('Contract results:');
    log(JSON.stringify(contractResults, null, 2));

    // Verify results match
    expect(sdkResults.length).to.equal(maxVoteOptions);

    log('\n=== Test Completed Successfully ===\n');
    log('AMACI end-to-end test passed!');
  });

  it('should query contract state correctly', async () => {
    const period = await amaciContract.getPeriod();
    log(`Contract period status: ${JSON.stringify(period)}`);

    const roundInfo = await amaciContract.getRoundInfo();
    log(`Round info: ${JSON.stringify(roundInfo)}`);

    expect(roundInfo).to.have.property('title');
  });
});
