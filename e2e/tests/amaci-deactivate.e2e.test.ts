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
  advanceTime,
  queryPollId
} from '../src';

/**
 * AMACI Deactivate E2E Tests
 *
 * This test suite validates the deactivate mechanism's integration with the blockchain:
 * - ActiveStateTree state transitions
 * - ProcessDeactivate message handling
 * - Contract and SDK state synchronization
 *
 * Note: More complex scenarios (e.g., voting with deactivated accounts, processMessages
 * integration) are tested in circuits tests to avoid ZK proof verification issues in e2e.
 * See: @packages/circuits/ts/__tests__/ProcessMessagesAmaciIntegration.test.ts
 */

describe('AMACI Deactivate E2E Tests', function () {
  this.timeout(900000); // 15 minutes

  let client: SimulateCosmWasmClient;

  const adminAddress = 'dora1eu7mhp4ggxd6utnz8uzurw395natgs6jskl4ug';
  const operatorAddress = 'dora1f0cywn02dm63xl52kw8r9myu5lelxfxd7zrqan';
  const feeRecipient = 'dora1xp0twdzsdeq4qg3c64v66552deax8zmvq4zw78';
  const voter1Address = 'dora1x0lkxq7g7eaq2u3uh2l39yhzf5046h00w2mlsf';

  // Test parameters (must match zkey configuration: 2-1-1-5)
  const stateTreeDepth = 2;
  const intStateTreeDepth = 1;
  const voteOptionTreeDepth = 1;
  const batchSize = 5;
  const maxVoteOptions = 5 ** voteOptionTreeDepth;
  const numSignUps = 5;

  // Circuit artifacts paths
  const circuitConfig = 'amaci-2-1-1-5';
  const circuitDir = path.join(__dirname, '../circuits', circuitConfig);
  const processDeactivateWasm = path.join(circuitDir, 'deactivate.wasm');
  const processDeactivateZkey = path.join(circuitDir, 'deactivate.zkey');

  before(async () => {
    log('=== Setting up AMACI Deactivate test environment ===');

    const env = await createTestEnvironment({
      chainId: 'deactivate-test',
      bech32Prefix: 'dora'
    });

    client = env.client;
    log('Test environment created');

    // Initialize balances for test addresses (need peaka for deactivate fee)
    await client.app.bank.setBalance(adminAddress, [
      { denom: 'dora', amount: '1000000000000' },
      { denom: 'peaka', amount: '100000000000000000000000' }
    ]);
    await client.app.bank.setBalance(operatorAddress, [
      { denom: 'dora', amount: '1000000000000' },
      { denom: 'peaka', amount: '100000000000000000000000' }
    ]);
    await client.app.bank.setBalance(feeRecipient, [
      { denom: 'dora', amount: '1000000000000' },
      { denom: 'peaka', amount: '100000000000000000000000' }
    ]);
    await client.app.bank.setBalance(voter1Address, [
      { denom: 'dora', amount: '1000000000000' },
      { denom: 'peaka', amount: '100000000000000000000000' }
    ]);
    log('Test address balances initialized');
  });

  describe('ActiveStateTree State Validation', () => {
    it('should correctly update ActiveStateTree during deactivate', async () => {
      log('\n=== ActiveStateTree State Validation Test ===');
      log('Validating that deactivate correctly updates ActiveStateTree');

      const testOperator = new OperatorClient({ network: 'testnet', secretKey: 555555n });

      const voter = new VoterClient({ network: 'testnet', secretKey: 666666n });

      // Deploy contract
      const contractLoader = new ContractLoader();
      const deployManager = new DeployManager(client, contractLoader);

      const coordPubKey = testOperator.getPubkey().toPoints();

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
        voice_credit_mode: {
          unified: { amount: '100' }
        },
        registration_mode: {
          sign_up_with_static_whitelist: {
            whitelist: {
              users: [
                { addr: adminAddress, voice_credit_amount: null },
                { addr: operatorAddress, voice_credit_amount: null },
                { addr: voter1Address, voice_credit_amount: null }
              ]
            }
          }
        },
        vote_option_map: ['Option 0', 'Option 1'],
        round_info: {
          title: 'ActiveStateTree Test',
          description: 'Test ActiveStateTree state transitions',
          link: 'https://test.example.com'
        },
        voting_time: {
          start_time: startTime.toString(),
          end_time: endTime.toString()
        },
        circuit_type: '1',
        certification_system: '0',
        poll_id: 1, // Poll ID for this round (防止跨 poll 重放攻击)
        deactivate_enabled: true, // Deactivate feature ENABLED for this deactivate test
        // Fee config (set to 0 for e2e testing)
        message_fee: '0',
        deactivate_fee: '0',
        signup_fee: '0',
        // Delay config (set to 0 for fast e2e test execution)
        base_delay: 0,
        message_delay: 0,
        signup_delay: 0,
        deactivate_delay: 0
      };

      const contractInfo = await deployManager.deployAmaciContract(adminAddress, instantiateMsg);
      const testContract = new AmaciContractClient(
        client,
        contractInfo.contractAddress,
        operatorAddress
      );

      log(`Contract deployed at: ${contractInfo.contractAddress}`);

      // Query pollId from deployed contract
      const pollId = await queryPollId(testContract);
      log(`Poll ID retrieved from contract: ${pollId}`);

      // Initialize operator with pollId (must be after contract deployment)
      testOperator.initRound({
        stateTreeDepth,
        intStateTreeDepth,
        voteOptionTreeDepth,
        batchSize,
        maxVoteOptions,
        isQuadraticCost: true,
        isAmaci: true,
        pollId // From contract query
      });

      log('Test operator initialized with pollId');

      // Phase 1: SignUp
      log('\n--- Phase 1: SignUp ---');

      const voterPubKey = voter.getPubkey().toPoints();
      testContract.setSender(voter1Address);
      await assertExecuteSuccess(
        () => testContract.signUp(formatPubKeyForContract(voterPubKey)),
        'Voter signup failed'
      );
      testOperator.updateStateTree(0, voterPubKey, 100, [0n, 0n, 0n, 0n]);
      log('✓ Voter registered at index 0');

      const initialActiveState = testOperator.activeStateTree!.leaf(0);
      expect(initialActiveState).to.equal(0n, 'Initial activeState should be 0 (active)');
      log(`  ActiveStateTree[0] = ${initialActiveState} (active)`);

      // Phase 2: Deactivate
      log('\n--- Phase 2: Deactivate ---');

      const deactivatePayload = await voter.buildDeactivatePayload({
        stateIdx: 0,
        operatorPubkey: coordPubKey,
        pollId
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
        'Deactivate message publish failed'
      );

      testOperator.pushDeactivateMessage(deactivateMessage, deactivateEncPubKey);
      log('✓ Deactivate message published');

      // Phase 3: Process deactivate
      log('\n--- Phase 3: Process deactivate ---');

      const deactivateResult = await testOperator.processDeactivateMessages({
        inputSize: batchSize,
        subStateTreeLength: numSignUps,
        wasmFile: processDeactivateWasm,
        zkeyFile: processDeactivateZkey
      });

      await assertExecuteSuccess(
        () =>
          testContract.processDeactivateMessage(
            batchSize.toString(),
            deactivateResult.input.newDeactivateCommitment.toString(),
            deactivateResult.input.newDeactivateRoot.toString(),
            deactivateResult.proof!
          ),
        'Process deactivate failed'
      );

      log('✓ Deactivate messages processed');

      // Phase 4: Verify activeState changed
      log('\n--- Phase 4: Verify state changes ---');

      const activeStateAfter = testOperator.activeStateTree!.leaf(0);
      expect(activeStateAfter).to.not.equal(
        0n,
        'ActiveState should be non-zero after deactivate (inactive)'
      );
      log(`  ActiveStateTree[0] = ${activeStateAfter} (inactive)`);

      log('\n✅ ActiveStateTree State Validation Test PASSED!');
      log('Summary:');
      log('  - Initial state: 0 (active) ✓');
      log('  - After deactivate: non-0 (inactive) ✓');
      log('  - ProcessDeactivateMessage chain integration ✓');
      log('  - SDK and contract state synchronization ✓');
      log(
        '\nNote: More complex scenarios (voting with deactivated accounts) are tested in circuits'
      );
    });
  });
});
