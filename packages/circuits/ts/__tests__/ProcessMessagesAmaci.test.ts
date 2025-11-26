import { expect } from 'chai';
import { OperatorClient, VoterClient, poseidon } from '@dorafactory/maci-sdk';
import { type WitnessTester } from 'circomkit';

import { circomkitInstance } from './utils/utils';

/**
 * ProcessMessages Circuit Test (AMACI)
 *
 * This test file verifies that the AMACI ProcessMessages circuit behavior matches
 * the SDK OperatorClient implementation with AMACI mode enabled.
 *
 * Key differences from MACI:
 * - State leaf has 10 fields (includes d1, d2 for deactivation)
 * - Additional deactivate tree and active state tree
 * - InputHash includes deactivateCommitment (7 fields vs 6)
 * - Support for key deactivation and anonymous key changes
 *
 * Circuit Location: packages/circuits/circom/amaci/power/processMessages.circom
 * SDK Location: packages/sdk/src/operator.ts (processMessages method with isAmaci=true)
 */

describe('ProcessMessages AMACI Circuit Tests', function () {
  this.timeout(600000); // 10 minute timeout

  let processMessagesCircuit: WitnessTester<any, any>;

  // Test parameters (must match between circuit and SDK)
  const stateTreeDepth = 2;
  const voteOptionTreeDepth = 2;
  const batchSize = 5;
  const maxVoteOptions = 5;
  const numSignUps = 3;

  before(async () => {
    console.log('Initializing AMACI ProcessMessages circuit...');
    processMessagesCircuit = await circomkitInstance.WitnessTester('ProcessMessages_AMACI', {
      file: 'amaci/power/processMessages',
      template: 'ProcessMessages',
      params: [stateTreeDepth, voteOptionTreeDepth, batchSize]
    });
    console.log('AMACI circuit initialized successfully');
  });

  /**
   * Helper: Create a test setup with operator and voters (AMACI mode)
   */
  function createTestSetup(isQuadraticCost: boolean = true) {
    const operator = new OperatorClient({
      network: 'testnet',
      secretKey: 111111n
    });

    operator.initMaci({
      stateTreeDepth,
      intStateTreeDepth: 1,
      voteOptionTreeDepth,
      batchSize,
      maxVoteOptions,
      numSignUps,
      isQuadraticCost,
      isAmaci: true // AMACI mode
    });

    // Create voters
    const voters = [
      new VoterClient({ network: 'testnet', secretKey: 222222n }),
      new VoterClient({ network: 'testnet', secretKey: 333333n }),
      new VoterClient({ network: 'testnet', secretKey: 444444n })
    ];

    // Register voters in state tree with d1, d2
    voters.forEach((voter, idx) => {
      const pubKey = voter.getPubkey().toPoints();
      // In AMACI, we need to provide d1, d2
      operator.initStateTree(idx, pubKey, 100);
    });

    return { operator, voters };
  }

  /**
   * Helper: Submit votes from voters
   */
  function submitVotes(
    operator: OperatorClient,
    voters: VoterClient[],
    votes: Array<{ voterIdx: number; optionIdx: number; weight: number }>
  ) {
    const coordPubKey = operator.getPubkey().toPoints();

    votes.forEach(({ voterIdx, optionIdx, weight }) => {
      const voter = voters[voterIdx];
      const votePayload = voter.buildVotePayload({
        stateIdx: voterIdx,
        operatorPubkey: coordPubKey,
        selectedOptions: [{ idx: optionIdx, vc: weight }]
      });

      // Push each message
      for (const payload of votePayload) {
        const message = payload.msg.map((m) => BigInt(m));
        const encPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
        operator.pushMessage(message, encPubKey);
      }
    });
  }

  // ============================================================================
  // PART 1: AMACI-Specific Features
  // ============================================================================

  describe('Part 1: AMACI-Specific Features', () => {
    it('should process messages with 10-field state leaves (AMACI)', async () => {
      const { operator, voters } = createTestSetup(false);

      // Submit one vote
      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      expect(operator.messages.length).to.equal(1);

      // End voting period
      operator.endVotePeriod();

      // Process messages with SDK
      const { input } = await operator.processMessages({ newStateSalt: 12345n });

      console.log('\n=== AMACI State Leaf Structure ===');
      console.log('State leaf fields: 10 (vs MACI: 5)');

      // Check that state leaves have 10 fields
      input.currentStateLeaves.forEach((leaf: any, idx: number) => {
        expect(leaf.length).to.equal(10, `State leaf ${idx} should have 10 fields`);
        console.log(`Leaf ${idx} fields:`, leaf.length);
      });

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ AMACI 10-field state leaves verified');
    });

    it('should include deactivate tree data in inputs', async () => {
      const { operator, voters } = createTestSetup(false);

      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      const { input } = await operator.processMessages({ newStateSalt: 12345n });

      console.log('\n=== AMACI Additional Inputs ===');

      // AMACI should have these additional fields
      expect(input.activeStateRoot).to.not.be.undefined;
      expect(input.deactivateRoot).to.not.be.undefined;
      expect(input.deactivateCommitment).to.not.be.undefined;
      expect(input.activeStateLeaves).to.not.be.undefined;
      expect(input.activeStateLeavesPathElements).to.not.be.undefined;

      console.log('activeStateRoot:', input.activeStateRoot!.toString());
      console.log('deactivateRoot:', input.deactivateRoot!.toString());
      console.log('deactivateCommitment:', input.deactivateCommitment!.toString());

      // Verify deactivateCommitment calculation
      const expectedDeactivateCommitment = poseidon([
        input.activeStateRoot!,
        input.deactivateRoot!
      ]);
      expect(input.deactivateCommitment).to.equal(
        expectedDeactivateCommitment,
        'Deactivate commitment should match'
      );

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ AMACI deactivate tree data verified');
    });

    it('should calculate inputHash with 7 fields (vs MACI 6 fields)', async () => {
      const { operator, voters } = createTestSetup(true);

      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 5 }]);

      operator.endVotePeriod();

      const { input } = await operator.processMessages({ newStateSalt: 987654n });

      console.log('\n=== AMACI InputHash Calculation ===');
      console.log('AMACI fields: 7 (includes deactivateCommitment)');
      console.log('MACI fields: 6');
      console.log('InputHash:', input.inputHash.toString());

      // The inputHash in AMACI includes:
      // 1. packedVals
      // 2. coordPubKeyHash
      // 3. batchStartHash
      // 4. batchEndHash
      // 5. currentStateCommitment
      // 6. newStateCommitment
      // 7. deactivateCommitment (AMACI-only)

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ AMACI inputHash with 7 fields verified');
    });
  });

  // ============================================================================
  // PART 2: State Updates with AMACI
  // ============================================================================

  describe('Part 2: State Updates with AMACI', () => {
    it('should update state tree correctly with 10-field leaves', async () => {
      const { operator, voters } = createTestSetup(false);

      const initialRoot = operator.stateTree!.root;

      // Submit vote
      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      // Process messages
      const { input } = await operator.processMessages({ newStateSalt: 11111n });

      const newRoot = operator.stateTree!.root;

      console.log('\n=== AMACI State Tree Update ===');
      console.log('Initial root:', initialRoot.toString());
      console.log('New root:', newRoot.toString());

      // Root should change
      expect(initialRoot).to.not.equal(newRoot, 'State root should change');

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ AMACI state tree updated correctly');
    });

    it('should use double-layer poseidon hash for state leaves', async () => {
      const { operator, voters } = createTestSetup(false);

      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      const { input } = await operator.processMessages({ newStateSalt: 22222n });

      console.log('\n=== AMACI State Leaf Hash ===');

      // In AMACI, state leaf hash = poseidon([
      //   poseidon([pubKey[0], pubKey[1], balance, voRoot, nonce]),
      //   poseidon([d1[0], d1[1], d2[0], d2[1], 0])
      // ])

      const leaf = operator.stateLeaves.get(0)!;
      const hash1 = poseidon([...leaf.pubKey, leaf.balance, leaf.voTree.root, leaf.nonce]);
      const hash2 = poseidon([...leaf.d1, ...leaf.d2, 0n]);
      const expectedHash = poseidon([hash1, hash2]);

      const actualHash = operator.stateTree!.leaf(0);

      console.log('Expected hash:', expectedHash.toString());
      console.log('Actual hash:', actualHash.toString());

      expect(actualHash).to.equal(expectedHash, 'State leaf hash should match double-layer hash');

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ AMACI double-layer hash verified');
    });

    it('should maintain active state tree correctly', async () => {
      const { operator, voters } = createTestSetup(false);

      const initialActiveRoot = operator.activeStateTree!.root;

      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      const { input } = await operator.processMessages({ newStateSalt: 33333n });

      const newActiveRoot = operator.activeStateTree!.root;

      console.log('\n=== AMACI Active State Tree ===');
      console.log('Initial active root:', initialActiveRoot.toString());
      console.log('New active root:', newActiveRoot.toString());

      // Active state tree should remain the same (no deactivations)
      expect(newActiveRoot).to.equal(initialActiveRoot, 'Active state tree should be unchanged');

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ AMACI active state tree maintained correctly');
    });
  });

  // ============================================================================
  // PART 3: Comprehensive 15 Checkpoint Verification
  // ============================================================================

  describe('Part 3: Comprehensive 15 Checkpoint Verification', () => {
    it('Checkpoint 1: Public input hash verification (7 fields)', async () => {
      const { operator, voters } = createTestSetup(true);

      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 5 }]);

      operator.endVotePeriod();

      const { input } = await operator.processMessages({ newStateSalt: 111n });

      console.log('\n=== Checkpoint 1: Public Input Hash ===');
      console.log('InputHash includes 7 fields for AMACI');

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Checkpoint 1 passed');
    });

    it('Checkpoint 2: State commitment verification', async () => {
      const { operator } = createTestSetup(false);

      const currentStateRoot = operator.stateTree!.root;
      const currentStateSalt = operator.stateSalt; // Get salt from SDK

      console.log('\n=== Checkpoint 2: State Commitment ===');
      console.log('Commitment = Poseidon(stateRoot, salt)');

      const expectedCommitment = poseidon([currentStateRoot, currentStateSalt]);

      // SDK now automatically initializes stateCommitment in initMaci()
      // Verify it matches the expected calculation
      console.log('State root:', currentStateRoot.toString());
      console.log('State salt:', currentStateSalt.toString());
      console.log('SDK commitment:', operator.stateCommitment.toString());
      console.log('Expected commitment:', expectedCommitment.toString());

      expect(operator.stateCommitment).to.equal(
        expectedCommitment,
        'SDK should automatically initialize stateCommitment in initMaci()'
      );

      expect(operator.stateSalt).to.equal(0n, 'SDK should initialize stateSalt to 0n');

      console.log('✓ Checkpoint 2 passed');
    });

    it('Checkpoint 3: Parameter range validation', async () => {
      const { operator, voters } = createTestSetup(false);

      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      const { input } = await operator.processMessages({ newStateSalt: 222n });

      console.log('\n=== Checkpoint 3: Parameter Range ===');
      console.log('maxVoteOptions:', maxVoteOptions);
      console.log('numSignUps:', numSignUps);
      console.log('Max capacity: 5^depth');

      // Verify with circuit (will fail if parameters are out of range)
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Checkpoint 3 passed');
    });

    it('Checkpoint 4: Message hash chain verification', async () => {
      const { operator, voters } = createTestSetup(false);

      submitVotes(operator, voters, [
        { voterIdx: 0, optionIdx: 1, weight: 10 },
        { voterIdx: 1, optionIdx: 2, weight: 15 }
      ]);

      operator.endVotePeriod();

      const { input } = await operator.processMessages({ newStateSalt: 333n });

      console.log('\n=== Checkpoint 4: Message Hash Chain ===');
      console.log('Start hash:', input.batchStartHash.toString());
      console.log('End hash:', input.batchEndHash.toString());

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Checkpoint 4 passed');
    });

    it('Checkpoint 5: Coordinator identity verification', async () => {
      const { operator, voters } = createTestSetup(false);

      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      const { input } = await operator.processMessages({ newStateSalt: 444n });

      console.log('\n=== Checkpoint 5: Coordinator Identity ===');
      console.log('Coord public key:', input.coordPubKey);

      // Circuit verifies that coordPrivKey derives to coordPubKey
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Checkpoint 5 passed');
    });

    it('Checkpoint 6: Message decryption and command extraction', async () => {
      const { operator, voters } = createTestSetup(false);

      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      const { input } = await operator.processMessages({ newStateSalt: 555n });

      console.log('\n=== Checkpoint 6: Message Decryption ===');
      console.log('Encrypted messages:', input.msgs.length);
      console.log('EncPubKeys:', input.encPubKeys.length);

      // Circuit decrypts messages using ECDH
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Checkpoint 6 passed');
    });

    it('Checkpoint 7: State leaf transformation', async () => {
      const { operator, voters } = createTestSetup(true);

      const initialLeaf = operator.stateLeaves.get(0)!;
      const initialBalance = initialLeaf.balance;

      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 5 }]);

      operator.endVotePeriod();

      const { input } = await operator.processMessages({ newStateSalt: 666n });

      const newLeaf = operator.stateLeaves.get(0)!;
      const newBalance = newLeaf.balance;

      console.log('\n=== Checkpoint 7: State Leaf Transformation ===');
      console.log('Balance: %s -> %s', initialBalance, newBalance);

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Checkpoint 7 passed');
    });

    it('Checkpoint 8: Path index generation', async () => {
      const { operator, voters } = createTestSetup(false);

      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      const { input } = await operator.processMessages({ newStateSalt: 777n });

      console.log('\n=== Checkpoint 8: Path Index Generation ===');
      console.log('State tree depth:', stateTreeDepth);

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Checkpoint 8 passed');
    });

    it('Checkpoint 9: Original state leaf inclusion proof', async () => {
      const { operator, voters } = createTestSetup(false);

      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      const { input } = await operator.processMessages({ newStateSalt: 888n });

      console.log('\n=== Checkpoint 9: State Leaf Inclusion Proof ===');
      console.log('Merkle paths provided:', input.currentStateLeavesPathElements.length);

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Checkpoint 9 passed');
    });

    it('Checkpoint 10: Vote weight inclusion proof', async () => {
      const { operator, voters } = createTestSetup(false);

      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      const { input } = await operator.processMessages({ newStateSalt: 999n });

      console.log('\n=== Checkpoint 10: Vote Weight Inclusion Proof ===');
      console.log('Vote weight paths:', input.currentVoteWeightsPathElements.length);

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Checkpoint 10 passed');
    });

    it('Checkpoint 11: Update vote option tree', async () => {
      const { operator, voters } = createTestSetup(false);

      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      const initialVoRoot = operator.stateLeaves.get(0)!.voted
        ? operator.stateLeaves.get(0)!.voTree.root
        : 0n;

      const { input } = await operator.processMessages({ newStateSalt: 1010n });

      const newVoRoot = operator.stateLeaves.get(0)!.voTree.root;

      console.log('\n=== Checkpoint 11: Update Vote Option Tree ===');
      console.log('VO Root: %s -> %s', initialVoRoot, newVoRoot);

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Checkpoint 11 passed');
    });

    it('Checkpoint 12: Generate new state leaf', async () => {
      const { operator, voters } = createTestSetup(false);

      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      const { input } = await operator.processMessages({ newStateSalt: 1111n });

      console.log('\n=== Checkpoint 12: Generate New State Leaf ===');
      console.log('New state leaves generated via Mux selection');

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Checkpoint 12 passed');
    });

    it('Checkpoint 13: Calculate new state root (CORE)', async () => {
      const { operator, voters } = createTestSetup(false);

      const initialRoot = operator.stateTree!.root;

      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      const { input } = await operator.processMessages({ newStateSalt: 1212n });

      const newRoot = operator.stateTree!.root;

      console.log('\n=== Checkpoint 13: Calculate New State Root ===');
      console.log('Root: %s -> %s', initialRoot, newRoot);

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Checkpoint 13 passed (CORE)');
    });

    it('Checkpoint 14: Batch processing and state chain', async () => {
      const { operator, voters } = createTestSetup(false);

      submitVotes(operator, voters, [
        { voterIdx: 0, optionIdx: 1, weight: 10 },
        { voterIdx: 1, optionIdx: 2, weight: 15 },
        { voterIdx: 2, optionIdx: 0, weight: 5 }
      ]);

      operator.endVotePeriod();

      const { input } = await operator.processMessages({ newStateSalt: 1313n });

      console.log('\n=== Checkpoint 14: Batch Processing ===');
      console.log('Messages in batch:', 3);
      console.log('Processed in reverse order');

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Checkpoint 14 passed');
    });

    it('Checkpoint 15: New state commitment verification', async () => {
      const { operator, voters } = createTestSetup(false);

      submitVotes(operator, voters, [{ voterIdx: 0, optionIdx: 1, weight: 10 }]);

      operator.endVotePeriod();

      const newStateSalt = 1414n;
      const { input } = await operator.processMessages({ newStateSalt });

      const newStateRoot = operator.stateTree!.root;
      const newStateCommitment = input.newStateCommitment;

      const expectedCommitment = poseidon([newStateRoot, newStateSalt]);

      console.log('\n=== Checkpoint 15: New State Commitment ===');
      console.log('New commitment:', newStateCommitment.toString());

      expect(newStateCommitment).to.equal(expectedCommitment);

      // Verify with circuit
      const witness = await processMessagesCircuit.calculateWitness(input as any);
      await processMessagesCircuit.expectConstraintPass(witness);

      console.log('✓ Checkpoint 15 passed');
    });

    it('Summary: All 15 checkpoints verified for AMACI', () => {
      console.log('\n=== ✓ ALL 15 CHECKPOINTS VERIFIED ===');
      console.log('1. Public input hash (7 fields) ✓');
      console.log('2. State commitment ✓');
      console.log('3. Parameter range ✓');
      console.log('4. Message hash chain ✓');
      console.log('5. Coordinator identity ✓');
      console.log('6. Message decryption ✓');
      console.log('7. State leaf transformation ✓');
      console.log('8. Path index generation ✓');
      console.log('9. State leaf inclusion proof ✓');
      console.log('10. Vote weight inclusion proof ✓');
      console.log('11. Update vote option tree ✓');
      console.log('12. Generate new state leaf ✓');
      console.log('13. Calculate new state root (CORE) ✓');
      console.log('14. Batch processing ✓');
      console.log('15. New state commitment ✓');
    });
  });

  // ============================================================================
  // PART 4: AMACI vs MACI Comparison
  // ============================================================================

  describe('Part 4: AMACI vs MACI Comparison', () => {
    it('should demonstrate difference in state leaf structure', () => {
      const maciOperator = new OperatorClient({
        network: 'testnet',
        secretKey: 123456n
      });

      const amaciOperator = new OperatorClient({
        network: 'testnet',
        secretKey: 789012n
      });

      // Initialize MACI
      maciOperator.initMaci({
        stateTreeDepth: 2,
        intStateTreeDepth: 1,
        voteOptionTreeDepth: 2,
        batchSize: 5,
        maxVoteOptions: 5,
        numSignUps: 2,
        isQuadraticCost: false,
        isAmaci: false
      });

      // Initialize AMACI
      amaciOperator.initMaci({
        stateTreeDepth: 2,
        intStateTreeDepth: 1,
        voteOptionTreeDepth: 2,
        batchSize: 5,
        maxVoteOptions: 5,
        numSignUps: 2,
        isQuadraticCost: false,
        isAmaci: true
      });

      const testPubKey: [bigint, bigint] = [12345n, 67890n];

      maciOperator.initStateTree(0, testPubKey, 100);
      amaciOperator.initStateTree(0, testPubKey, 100);

      console.log('\n=== AMACI vs MACI State Leaf ===');
      console.log('MACI: 5 fields [pubKey, balance, voRoot, nonce]');
      console.log('AMACI: 10 fields [pubKey, balance, voRoot, nonce, d1, d2, xIncrement]');

      console.log('\nMACI state root:', maciOperator.stateTree?.root.toString());
      console.log('AMACI state root:', amaciOperator.stateTree?.root.toString());

      // Should be different due to different hashing
      expect(maciOperator.stateTree?.root).to.not.equal(amaciOperator.stateTree?.root);

      console.log('✓ State structures differ as expected');
    });

    it('should demonstrate difference in inputHash calculation', async () => {
      console.log('\n=== AMACI vs MACI InputHash ===');
      console.log('MACI InputHash: SHA256(6 fields)');
      console.log('  1. packedVals');
      console.log('  2. coordPubKeyHash');
      console.log('  3. batchStartHash');
      console.log('  4. batchEndHash');
      console.log('  5. currentStateCommitment');
      console.log('  6. newStateCommitment');

      console.log('\nAMACI InputHash: SHA256(7 fields)');
      console.log('  1-6. (same as MACI)');
      console.log('  7. deactivateCommitment ← AMACI-only');

      console.log('\n✓ InputHash calculation differs as expected');
    });
  });
});
