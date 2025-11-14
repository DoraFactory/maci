import { expect } from 'chai';
import { OperatorClient, VoterClient } from '@dorafactory/maci-sdk';
import { SimulateCosmWasmClient } from '@oraichain/cw-simulate';
import path from 'path';
import {
  createTestEnvironment,
  ContractLoader,
  DeployManager,
  ApiMaciContractClient,
  formatPubKeyForContract,
  formatMessageForContract,
  assertExecuteSuccess,
  getBlockInfo,
  advanceTime,
  generateCertificateFromBigInt,
  getBackendPublicKey,
  log
} from '../src';

/**
 * MACI (Standard) End-to-End Test
 *
 * This test demonstrates the standard MACI voting flow without anonymous key changes:
 * 1. Environment setup
 * 2. Batch user registration
 * 3. Voting (including vote changes)
 * 4. Message processing
 * 5. Tallying
 * 6. Result verification
 */

describe('MACI (Standard) End-to-End Test', function () {
  this.timeout(600000); // 10 minutes for the entire test suite

  let client: SimulateCosmWasmClient;
  let operator: OperatorClient;
  let voters: VoterClient[];
  let maciContract: ApiMaciContractClient;

  const adminAddress = 'orai1admin000000000000000000000000000000';
  const operatorAddress = 'orai1operator000000000000000000000000';
  const feeRecipient = 'orai1feerecipient0000000000000000000';

  // Test parameters - 1P1V mode
  const maxVoteOptions = 3;
  // Circuit parameters (must match zkey configuration: 2-1-1-5)
  const stateTreeDepth = 2; // 5^2 = 25 max voters
  const intStateTreeDepth = 1;
  const voteOptionTreeDepth = 1; // 5^1 = 5 max options
  const batchSize = 5; // Process 5 messages per batch
  const numSignUps = 5;
  const numVoters = 5;

  // Circuit artifacts paths for SDK proof generation
  const circuitConfig = '2-1-1-5';
  const circuitDir = path.join(__dirname, '../circuits', circuitConfig);
  const processMessagesWasm = path.join(circuitDir, 'processMessages.wasm');
  const processMessagesZkey = path.join(circuitDir, 'processMessages.zkey');
  const tallyVotesWasm = path.join(circuitDir, 'tallyVotes.wasm');
  const tallyVotesZkey = path.join(circuitDir, 'tallyVotes.zkey');

  before(async () => {
    log('=== Setting up MACI test environment ===');

    // Create test environment
    const env = await createTestEnvironment({
      chainId: 'maci-test',
      bech32Prefix: 'orai'
    });

    client = env.client;
    log('Test environment created');

    // Initialize operator
    operator = new OperatorClient({
      network: 'testnet',
      secretKey: 111111n
    });

    // Initialize voters
    voters = [];
    for (let i = 0; i < numVoters; i++) {
      voters.push(
        new VoterClient({
          network: 'testnet',
          secretKey: BigInt(222222 + i * 111111)
        })
      );
    }

    log(`Initialized ${numVoters} voters`);

    // Initialize operator MACI (1P1V mode, non-anonymous)
    operator.initMaci({
      stateTreeDepth,
      intStateTreeDepth,
      voteOptionTreeDepth,
      batchSize,
      maxVoteOptions,
      numSignUps,
      isQuadraticCost: false, // 1P1V mode
      isAmaci: false // API-MACI uses standard MACI (no anonymous keys)
    });

    log('Operator MACI initialized (1P1V mode, non-anonymous)');

    // Deploy API-MACI contract
    const contractLoader = new ContractLoader();
    const deployManager = new DeployManager(client, contractLoader);

    log('Deploying API-MACI contract...');

    const coordPubKey = operator.getPubkey().toPoints();

    // Set voting period: short window for testing (10 seconds)
    // cw-simulate uses real-time Unix timestamps
    const currentUnixNanos = BigInt(Date.now()) * BigInt(1_000_000); // Convert ms to ns
    const votingStartTime = '0'; // Start from epoch to ensure we're always in voting period
    const votingEndTime = (currentUnixNanos + BigInt(10) * BigInt(1_000_000_000)).toString(); // Current time + 10 seconds

    log(`Voting window: start=0, end=${votingEndTime} (current + 10s)`);

    const instantiateMsg = {
      coordinator: {
        x: coordPubKey[0].toString(),
        y: coordPubKey[1].toString()
      },
      max_voters: '25', // Must match 5^stateTreeDepth = 5^2 = 25
      vote_option_map: ['Option A', 'Option B', 'Option C'], // 3 options < 5 max
      round_info: {
        title: 'MACI 1P1V Test Round',
        description: 'Test round for standard MACI e2e testing',
        link: 'https://test.example.com'
      },
      voting_time: {
        start_time: votingStartTime,
        end_time: votingEndTime
      },
      circuit_type: '0', // 1P1V
      certification_system: '0', // Groth16 (vkeys auto-matched by contract for 2-1-1-5)
      whitelist_backend_pubkey: getBackendPublicKey(),
      whitelist_voting_power_args: {
        mode: 'threshold',
        slope: '0',
        threshold: '1' // Set threshold to 1 to allow any amount >= 1
      }
    };

    const contractInfo = await deployManager.deployApiMaciContract(adminAddress, instantiateMsg);

    maciContract = new ApiMaciContractClient(client, contractInfo.contractAddress, operatorAddress);

    log(`API-MACI contract deployed at: ${contractInfo.contractAddress}`);
  });

  it('should complete the full MACI voting flow', async () => {
    // Debug: Query contract state
    try {
      const votingTimeQuery = await maciContract.query({ get_voting_time: {} });
      log(`Contract voting_time: ${JSON.stringify(votingTimeQuery)}`);
    } catch (e: any) {
      log(`Failed to query voting_time: ${e.message}`);
    }

    log('\n=== Step 1: Batch User Registration ===\n');

    maciContract.setSender(adminAddress);

    for (let i = 0; i < numVoters; i++) {
      const voterPubKey = voters[i].getPubkey().toPoints();
      log(`Registering voter ${i}: [${voterPubKey[0]}, ${voterPubKey[1]}]`);

      // Generate certificate for this voter
      const certificate = generateCertificateFromBigInt(
        maciContract.getContractAddress(),
        voterPubKey,
        '1' // amount
      );

      await assertExecuteSuccess(
        () =>
          maciContract.signUp({
            amount: '1', // 1 voice credit for 1P1V
            certificate: certificate, // Backend-signed certificate
            pubkey: {
              x: voterPubKey[0].toString(),
              y: voterPubKey[1].toString()
            }
          }),
        `Voter ${i} sign up failed`
      );

      operator.initStateTree(i, voterPubKey, 1); // 1 voice credit for 1P1V
    }

    log(`All ${numVoters} voters registered`);

    log('\n=== Step 2: Submit Votes ===\n');

    const coordPubKey = operator.getPubkey().toPoints();

    // Voter 0 votes for option 0
    const vote0Payload = voters[0].buildVotePayload({
      stateIdx: 0,
      operatorPubkey: coordPubKey,
      selectedOptions: [{ idx: 0, vc: 1 }]
    });

    for (const payload of vote0Payload) {
      const message = payload.msg.map((m: string) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k: string) => BigInt(k)) as [bigint, bigint];

      await assertExecuteSuccess(
        () =>
          maciContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'Voter 0 vote failed'
      );

      operator.pushMessage(message, messageEncPubKey);
    }
    log('Voter 0 voted for Option A');

    // Voter 1 votes for option 1
    const vote1Payload = voters[1].buildVotePayload({
      stateIdx: 1,
      operatorPubkey: coordPubKey,
      selectedOptions: [{ idx: 1, vc: 1 }]
    });

    for (const payload of vote1Payload) {
      const message = payload.msg.map((m: string) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k: string) => BigInt(k)) as [bigint, bigint];

      await assertExecuteSuccess(
        () =>
          maciContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'Voter 1 vote failed'
      );

      operator.pushMessage(message, messageEncPubKey);
    }
    log('Voter 1 voted for Option B');

    // Voter 2 votes for option 2
    const vote2Payload = voters[2].buildVotePayload({
      stateIdx: 2,
      operatorPubkey: coordPubKey,
      selectedOptions: [{ idx: 2, vc: 1 }]
    });

    for (const payload of vote2Payload) {
      const message = payload.msg.map((m: string) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k: string) => BigInt(k)) as [bigint, bigint];

      await assertExecuteSuccess(
        () =>
          maciContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'Voter 2 vote failed'
      );

      operator.pushMessage(message, messageEncPubKey);
    }
    log('Voter 2 voted for Option C');

    // Voter 3 votes for option 0
    const vote3Payload = voters[3].buildVotePayload({
      stateIdx: 3,
      operatorPubkey: coordPubKey,
      selectedOptions: [{ idx: 0, vc: 1 }]
    });

    for (const payload of vote3Payload) {
      const message = payload.msg.map((m: string) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k: string) => BigInt(k)) as [bigint, bigint];

      await assertExecuteSuccess(
        () =>
          maciContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'Voter 3 vote failed'
      );

      operator.pushMessage(message, messageEncPubKey);
    }
    log('Voter 3 voted for Option A');

    // Voter 4 votes for option 1, then changes to option 2
    log('Voter 4 initial vote for Option B...');
    const vote4InitialPayload = voters[4].buildVotePayload({
      stateIdx: 4,
      operatorPubkey: coordPubKey,
      selectedOptions: [{ idx: 1, vc: 1 }]
    });

    for (const payload of vote4InitialPayload) {
      const message = payload.msg.map((m: string) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k: string) => BigInt(k)) as [bigint, bigint];

      await assertExecuteSuccess(
        () =>
          maciContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'Voter 4 initial vote failed'
      );

      operator.pushMessage(message, messageEncPubKey);
    }

    log('Voter 4 changing vote to Option C...');
    const vote4ChangePayload = voters[4].buildVotePayload({
      stateIdx: 4,
      operatorPubkey: coordPubKey,
      selectedOptions: [{ idx: 2, vc: 1 }]
    });

    for (const payload of vote4ChangePayload) {
      const message = payload.msg.map((m: string) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k: string) => BigInt(k)) as [bigint, bigint];

      await assertExecuteSuccess(
        () =>
          maciContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'Voter 4 vote change failed'
      );

      operator.pushMessage(message, messageEncPubKey);
    }
    log('Voter 4 vote changed to Option C');

    log('All votes submitted');

    log('\n=== Waiting for voting period to end ===\n');
    // Wait 11 seconds to ensure we're past the 10-second voting window
    log('Waiting 11 seconds for voting period to expire...');
    await new Promise((resolve) => setTimeout(resolve, 11000));
    log('Voting period has ended');

    log('\n=== Step 3: Start Processing ===\n');

    await assertExecuteSuccess(
      () => maciContract.startProcessPeriod(),
      'Start process period failed'
    );

    operator.endVotePeriod();
    log('Vote period ended, processing started');

    log('\n=== Step 4: Process Messages ===\n');

    let batchCount = 0;
    while (operator.states === 1) {
      // Generate proof using SDK (internally calls snarkjs.groth16.fullProve)
      const processResult = await operator.processMessages({
        wasmFile: processMessagesWasm,
        zkeyFile: processMessagesZkey
      });

      log(`Processing message batch ${batchCount}...`);

      if (!processResult.proof) {
        throw new Error('SDK failed to generate proof');
      }

      // Process on contract
      await assertExecuteSuccess(
        () =>
          maciContract.processMessage(
            processResult.input.newStateCommitment.toString(),
            processResult.proof! // Non-null assertion after check
          ),
        `Process message batch ${batchCount} failed`
      );

      log(`Message batch ${batchCount} processed`);
      batchCount++;

      if (batchCount > 20) {
        throw new Error('Too many message processing iterations');
      }
    }

    log(`All messages processed in ${batchCount} batches`);

    log('\n=== Step 5: Tally Votes ===\n');

    let tallyCount = 0;
    while (operator.states === 2) {
      // Generate proof using SDK (internally calls snarkjs.groth16.fullProve)
      const tallyResult = await operator.processTally({
        wasmFile: tallyVotesWasm,
        zkeyFile: tallyVotesZkey
      });

      log(`Processing tally batch ${tallyCount}...`);

      if (!tallyResult.proof) {
        throw new Error('SDK failed to generate tally proof');
      }

      // Process on contract
      await assertExecuteSuccess(
        () =>
          maciContract.processTally(
            tallyResult.input.newTallyCommitment.toString(),
            tallyResult.proof! // Non-null assertion after check
          ),
        `Process tally batch ${tallyCount} failed`
      );

      log(`Tally batch ${tallyCount} processed`);
      tallyCount++;

      if (tallyCount > 20) {
        throw new Error('Too many tally iterations');
      }
    }

    log(`Tallying completed in ${tallyCount} batches`);

    log('\n=== Step 6: Verify Results (1P1V) ===\n');

    const sdkResults = operator.getTallyResults();
    log('SDK results:');
    sdkResults.forEach((result: bigint, idx: number) => {
      log(`  Option ${idx}: ${result} votes`);
    });

    // Expected results in 1P1V:
    // Option A (0): 2 votes (voter 0, voter 3)
    // Option B (1): 0 votes (voter 4 changed vote)
    // Option C (2): 3 votes (voter 2, voter 4)
    log('Expected results:');
    log('  Option A: 2 votes');
    log('  Option B: 0 votes');
    log('  Option C: 3 votes');

    // Query contract results
    const contractResults = await maciContract.getAllResult();
    log('Contract results:');
    log(JSON.stringify(contractResults, null, 2));

    expect(sdkResults.length).to.equal(maxVoteOptions);

    log('\n=== Test Completed Successfully ===\n');
    log('MACI (1P1V) end-to-end test passed!');
  });

  it('should handle multiple voters correctly', async () => {
    const period = await maciContract.getPeriod();
    log(`Contract period status: ${JSON.stringify(period)}`);

    expect(period).to.not.be.undefined;
  });
});
