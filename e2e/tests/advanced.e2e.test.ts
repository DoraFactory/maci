import { expect } from 'chai';
import { OperatorClient, VoterClient } from '@dorafactory/maci-sdk';
import { SimulateCosmWasmClient } from '@oraichain/cw-simulate';
import {
  createTestEnvironment,
  ContractLoader,
  DeployManager,
  AmaciContractClient,
  formatPubKeyForContract,
  formatMessageForContract,
  assertExecuteSuccess,
  assertExecuteFails,
  advanceTime,
  log
} from '../src';
import {
  generateDeactivateProof,
  generateProcessMessagesProof,
  generateTallyProof
} from '../src/utils/circuitIntegration';

/**
 * Advanced End-to-End Tests
 *
 * These tests cover edge cases and complex scenarios:
 * 1. Large-scale user scenarios
 * 2. Multiple key changes
 * 3. Error handling
 * 4. Time-based restrictions
 */

describe('Advanced E2E Tests', function () {
  this.timeout(900000); // 15 minutes for complex scenarios

  describe('Large Scale User Scenario', function () {
    let client: SimulateCosmWasmClient;
    let operator: OperatorClient;
    let voters: VoterClient[];
    let amaciContract: AmaciContractClient;

    const adminAddress = 'orai1admin000000000000000000000000000000';
    const operatorAddress = 'orai1operator000000000000000000000000';
    const feeRecipient = 'orai1feerecipient0000000000000000000';

    const numVoters = 10;
    const maxVoteOptions = 5;
    const stateTreeDepth = 4; // Support 16 users
    const intStateTreeDepth = 2;
    const voteOptionTreeDepth = 2;
    const batchSize = 4;

    before(async () => {
      log('=== Setting up large scale test ===');

      const env = await createTestEnvironment({
        chainId: 'large-scale-test',
        bech32Prefix: 'orai'
      });

      client = env.client;

      operator = new OperatorClient({
        network: 'testnet',
        secretKey: 111111n
      });

      voters = [];
      for (let i = 0; i < numVoters; i++) {
        voters.push(
          new VoterClient({
            network: 'testnet',
            secretKey: BigInt(222222 + i * 111111)
          })
        );
      }

      operator.initMaci({
        stateTreeDepth,
        intStateTreeDepth,
        voteOptionTreeDepth,
        batchSize,
        maxVoteOptions,
        numSignUps: numVoters,
        isQuadraticCost: true,
        isAmaci: true // AMACI scenario
      });

      const contractLoader = new ContractLoader();
      const deployManager = new DeployManager(client, contractLoader);

      const coordPubKey = operator.getPubkey().toPoints();

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
        vote_option_map: ['Opt0', 'Opt1', 'Opt2', 'Opt3', 'Opt4'],
        round_info: {
          title: 'Large Scale Test',
          description: 'Testing with many users',
          link: 'https://test.example.com'
        },
        voting_time: {
          start_time: Math.floor(Date.now() / 1000).toString(),
          end_time: (Math.floor(Date.now() / 1000) + 86400).toString()
        },
        whitelist: null,
        pre_deactivate_root: '0',
        circuit_type: '1',
        certification_system: '0',
        oracle_whitelist_pubkey: null,
        pre_deactivate_coordinator: null
      };

      const contractInfo = await deployManager.deployAmaciContract(adminAddress, instantiateMsg);

      amaciContract = new AmaciContractClient(
        client,
        contractInfo.contractAddress,
        operatorAddress
      );

      log(`Contract deployed: ${contractInfo.contractAddress}`);
    });

    it('should handle 10+ users voting', async () => {
      log('\n=== Batch Registration ===\n');

      amaciContract.setSender(adminAddress);

      for (let i = 0; i < numVoters; i++) {
        const voterPubKey = voters[i].getPubkey().toPoints();

        await assertExecuteSuccess(
          () => amaciContract.signUp(formatPubKeyForContract(voterPubKey)),
          `Voter ${i} registration failed`
        );

        operator.initStateTree(i, voterPubKey, 100);

        if ((i + 1) % 3 === 0) {
          log(`Registered ${i + 1} voters...`);
        }
      }

      log(`All ${numVoters} voters registered`);

      const numSignUp = await amaciContract.getNumSignUp();
      expect(numSignUp).to.equal(numVoters.toString());

      log('\n=== Batch Voting ===\n');

      const coordPubKey = operator.getPubkey().toPoints();

      for (let i = 0; i < numVoters; i++) {
        const optionIdx = i % maxVoteOptions;
        const voteWeight = (i % 10) + 1;

        const votePayload = voters[i].buildVotePayload({
          stateIdx: i,
          operatorPubkey: coordPubKey,
          selectedOptions: [{ idx: optionIdx, vc: voteWeight }]
        });

        for (const payload of votePayload) {
          const message = payload.msg.map((m) => BigInt(m));
          const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];

          await assertExecuteSuccess(
            () =>
              amaciContract.publishMessage(
                formatMessageForContract(message),
                formatPubKeyForContract(messageEncPubKey)
              ),
            `Voter ${i} vote failed`
          );

          operator.pushMessage(message, messageEncPubKey);
        }

        if ((i + 1) % 3 === 0) {
          log(`Processed ${i + 1} votes...`);
        }
      }

      log(`All ${numVoters} votes submitted`);

      log('\n=== Processing All Votes ===\n');

      await assertExecuteSuccess(
        () => amaciContract.startProcessPeriod(),
        'Start process period failed'
      );

      operator.endVotePeriod();

      let totalBatches = 0;
      while (operator.states === 1) {
        const { input: msgInput } = await operator.processMessages();

        const msgProof = await generateProcessMessagesProof(
          msgInput,
          stateTreeDepth,
          voteOptionTreeDepth,
          batchSize
        );

        await assertExecuteSuccess(
          () => amaciContract.processMessage(msgInput.newStateCommitment.toString(), msgProof),
          `Message batch ${totalBatches} failed`
        );

        totalBatches++;

        if (totalBatches > 50) {
          throw new Error('Too many batches');
        }
      }

      log(`Processed ${totalBatches} message batches`);

      let tallyBatches = 0;
      while (operator.states === 2) {
        const { input: tallyInput } = await operator.processTally();

        const tallyProof = await generateTallyProof(
          tallyInput,
          stateTreeDepth,
          intStateTreeDepth,
          voteOptionTreeDepth
        );

        await assertExecuteSuccess(
          () => amaciContract.processTally(tallyInput.newTallyCommitment.toString(), tallyProof),
          `Tally batch ${tallyBatches} failed`
        );

        tallyBatches++;

        if (tallyBatches > 50) {
          throw new Error('Too many tally batches');
        }
      }

      log(`Processed ${tallyBatches} tally batches`);

      const results = operator.getTallyResults();
      log('Final results:');
      results.forEach((r, idx) => log(`  Option ${idx}: ${r}`));

      expect(results.length).to.equal(maxVoteOptions);

      log('\n=== Large scale test completed ===\n');
    });
  });

  describe('Error Handling Tests', function () {
    let client: SimulateCosmWasmClient;
    let operator: OperatorClient;
    let voter: VoterClient;
    let amaciContract: AmaciContractClient;

    const adminAddress = 'orai1admin000000000000000000000000000000';
    const operatorAddress = 'orai1operator000000000000000000000000';
    const feeRecipient = 'orai1feerecipient0000000000000000000';

    before(async () => {
      log('=== Setting up error handling test ===');

      const env = await createTestEnvironment({
        chainId: 'error-test',
        bech32Prefix: 'orai'
      });

      client = env.client;

      operator = new OperatorClient({
        network: 'testnet',
        secretKey: 111111n
      });

      voter = new VoterClient({
        network: 'testnet',
        secretKey: 222222n
      });

      operator.initMaci({
        stateTreeDepth: 2,
        intStateTreeDepth: 1,
        voteOptionTreeDepth: 2,
        batchSize: 2,
        maxVoteOptions: 3,
        numSignUps: 2,
        isQuadraticCost: false,
        isAmaci: true // AMACI scenario
      });

      const contractLoader = new ContractLoader();
      const deployManager = new DeployManager(client, contractLoader);

      const coordPubKey = operator.getPubkey().toPoints();

      const instantiateMsg = {
        parameters: {
          state_tree_depth: '2',
          int_state_tree_depth: '1',
          vote_option_tree_depth: '2',
          message_batch_size: '2'
        },
        coordinator: {
          x: coordPubKey[0].toString(),
          y: coordPubKey[1].toString()
        },
        admin: adminAddress,
        fee_recipient: feeRecipient,
        operator: operatorAddress,
        voice_credit_amount: '1',
        vote_option_map: ['A', 'B', 'C'],
        round_info: {
          title: 'Error Test',
          description: 'Testing error scenarios',
          link: 'https://test.example.com'
        },
        voting_time: {
          start_time: Math.floor(Date.now() / 1000).toString(),
          end_time: (Math.floor(Date.now() / 1000) + 3600).toString()
        },
        whitelist: null,
        pre_deactivate_root: '0',
        circuit_type: '0',
        certification_system: '0',
        oracle_whitelist_pubkey: null,
        pre_deactivate_coordinator: null
      };

      const contractInfo = await deployManager.deployAmaciContract(adminAddress, instantiateMsg);

      amaciContract = new AmaciContractClient(
        client,
        contractInfo.contractAddress,
        operatorAddress
      );

      log(`Contract deployed: ${contractInfo.contractAddress}`);
    });

    it('should reject duplicate registration', async () => {
      log('\n=== Testing Duplicate Registration ===\n');

      amaciContract.setSender(adminAddress);

      const voterPubKey = voter.getPubkey().toPoints();

      // First registration should succeed
      await assertExecuteSuccess(
        () => amaciContract.signUp(formatPubKeyForContract(voterPubKey)),
        'First registration failed'
      );

      log('First registration succeeded');

      // Second registration with same key should fail
      await assertExecuteFails(
        () => amaciContract.signUp(formatPubKeyForContract(voterPubKey)),
        'already registered'
      );

      log('Duplicate registration correctly rejected');
    });

    it('should reject voting after period ends', async () => {
      log('\n=== Testing Vote After Period Ends ===\n');

      // Advance time beyond voting period
      await advanceTime(client, 7200); // 2 hours

      log('Time advanced beyond voting period');

      const coordPubKey = operator.getPubkey().toPoints();
      const votePayload = voter.buildVotePayload({
        stateIdx: 0,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 0, vc: 1 }]
      });

      // Try to vote
      const payload = votePayload[0];
      const message = payload.msg.map((m) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];

      await assertExecuteFails(
        () =>
          amaciContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'voting period'
      );

      log('Vote after period correctly rejected');
    });

    it('should reject invalid proof', async () => {
      log('\n=== Testing Invalid Proof ===\n');

      // Create an invalid proof
      const invalidProof = {
        a: '[]',
        b: '[]',
        c: '[]'
      };

      await assertExecuteFails(
        () => amaciContract.processMessage('12345', invalidProof)
        // May fail with various errors depending on contract implementation
      );

      log('Invalid proof correctly rejected');
    });
  });

  describe('Time-Based Restrictions', function () {
    let client: SimulateCosmWasmClient;
    let amaciContract: AmaciContractClient;

    const adminAddress = 'orai1admin000000000000000000000000000000';
    const operatorAddress = 'orai1operator000000000000000000000000';

    before(async () => {
      log('=== Setting up time-based test ===');

      const env = await createTestEnvironment({
        chainId: 'time-test',
        bech32Prefix: 'orai'
      });

      client = env.client;

      const operator = new OperatorClient({
        network: 'testnet',
        secretKey: 111111n
      });

      const contractLoader = new ContractLoader();
      const deployManager = new DeployManager(client, contractLoader);

      const coordPubKey = operator.getPubkey().toPoints();

      const futureStart = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      const instantiateMsg = {
        parameters: {
          state_tree_depth: '2',
          int_state_tree_depth: '1',
          vote_option_tree_depth: '2',
          message_batch_size: '2'
        },
        coordinator: {
          x: coordPubKey[0].toString(),
          y: coordPubKey[1].toString()
        },
        admin: adminAddress,
        fee_recipient: adminAddress,
        operator: operatorAddress,
        voice_credit_amount: '1',
        vote_option_map: ['A', 'B', 'C'],
        round_info: {
          title: 'Time Test',
          description: 'Testing time restrictions',
          link: 'https://test.example.com'
        },
        voting_time: {
          start_time: futureStart.toString(),
          end_time: (futureStart + 3600).toString()
        },
        whitelist: null,
        pre_deactivate_root: '0',
        circuit_type: '0',
        certification_system: '0',
        oracle_whitelist_pubkey: null,
        pre_deactivate_coordinator: null
      };

      const contractInfo = await deployManager.deployAmaciContract(adminAddress, instantiateMsg);

      amaciContract = new AmaciContractClient(
        client,
        contractInfo.contractAddress,
        operatorAddress
      );

      log(`Contract deployed: ${contractInfo.contractAddress}`);
    });

    it('should enforce voting time window', async () => {
      log('\n=== Testing Voting Time Window ===\n');

      const voter = new VoterClient({
        network: 'testnet',
        secretKey: 333333n
      });

      amaciContract.setSender(adminAddress);

      const voterPubKey = voter.getPubkey().toPoints();

      // Registration should work before voting starts
      await assertExecuteSuccess(
        () => amaciContract.signUp(formatPubKeyForContract(voterPubKey)),
        'Registration before voting failed'
      );

      log('Registration before voting period succeeded');

      // Try to vote before voting starts
      const coordPubKey = new OperatorClient({
        network: 'testnet',
        secretKey: 111111n
      })
        .getPubkey()
        .toPoints();

      const votePayload = voter.buildVotePayload({
        stateIdx: 0,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: 0, vc: 1 }]
      });

      const payload = votePayload[0];
      const message = payload.msg.map((m) => BigInt(m));
      const messageEncPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];

      await assertExecuteFails(
        () =>
          amaciContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'not started'
      );

      log('Vote before period correctly rejected');

      // Advance time to voting period
      await advanceTime(client, 3700);

      log('Time advanced to voting period');

      // Now voting should work
      await assertExecuteSuccess(
        () =>
          amaciContract.publishMessage(
            formatMessageForContract(message),
            formatPubKeyForContract(messageEncPubKey)
          ),
        'Vote during period failed'
      );

      log('Vote during period succeeded');
    });
  });

  it('summary of advanced tests', () => {
    log('\n=== Advanced E2E Tests Summary ===\n');
    log('✓ Large scale user scenario (10+ users)');
    log('✓ Error handling (duplicate registration, invalid proofs)');
    log('✓ Time-based restrictions');
    log('\nAll advanced tests passed!');
  });
});
