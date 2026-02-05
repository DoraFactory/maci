import { VoterClient, OperatorClient, poseidon, encryptOdevity, genRandomSalt } from '@dorafactory/maci-sdk';
import { expect } from 'chai';
import { type WitnessTester } from 'circomkit';

import { getSignal, circomkitInstance } from './utils/utils';

describe('AMACI ProcessDeactivateMessages circuit', function test() {
  this.timeout(180000);

  const stateTreeDepth = 2;
  const batchSize = 5;
  const voteOptionTreeDepth = 2;
  const maxVoteOptions = 5;
  const TREE_ARITY = 5;

  let circuit: WitnessTester<any, any>;

  before(async () => {
    circuit = await circomkitInstance.WitnessTester('ProcessDeactivateMessages', {
      file: 'amaci/power/processDeactivate',
      template: 'ProcessDeactivateMessages',
      params: [stateTreeDepth, batchSize]
    });
  });

  it('should verify ProcessDeactivateMessages with valid poll ID', async () => {
    // Create operator and voters
    const operator = new OperatorClient({ network: 'testnet', secretKey: 123456n });
    
    operator.initRound({
      stateTreeDepth,
      intStateTreeDepth: 1,
      voteOptionTreeDepth,
      batchSize,
      maxVoteOptions,
      pollId: 1, // Set poll ID
      isQuadraticCost: true,
      isAmaci: true
    });

    // Create a voter and register
    const voter = new VoterClient({ network: 'testnet', secretKey: 222222n });
    const voterPubKey = voter.getPubkey().toPoints();
    
    operator.updateStateTree(0, voterPubKey, 100);

    // Build and publish a deactivate message
    const coordPubKey = operator.getPubkey().toPoints();
    const deactivatePayload = await voter.buildDeactivatePayload({
      stateIdx: 0,
      operatorPubkey: coordPubKey,
      pollId: 1
    });

    const dMsg = deactivatePayload.msg.map((m) => BigInt(m));
    const dEncPubKey = deactivatePayload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];

    operator.pushDeactivateMessage(dMsg, dEncPubKey);

    // Generate circuit input using SDK
    const result = await operator.processDeactivateMessages({
      inputSize: 1,
      subStateTreeLength: TREE_ARITY ** stateTreeDepth
    });

    // Verify the circuit with the generated input
    const witness = await circuit.calculateWitness(result.input as any);
    await circuit.expectConstraintPass(witness);
  });
});

describe('AMACI ProcessDeactivateMessagesInputHasher circuit', function test() {
  this.timeout(90000);

  let circuit: WitnessTester<
    [
      'newDeactivateRoot',
      'coordPubKey',
      'batchStartHash',
      'batchEndHash',
      'currentDeactivateCommitment',
      'newDeactivateCommitment',
      'currentStateRoot',
      'expectedPollId'
    ],
    ['hash']
  >;

  const operator = new OperatorClient({ network: 'testnet', secretKey: 123456n });
  const coordPubKey = operator.getSigner().getPublicKey().toPoints();

  before(async () => {
    circuit = await circomkitInstance.WitnessTester('ProcessDeactivateMessagesInputHasher', {
      file: 'amaci/power/processDeactivate',
      template: 'ProcessDeactivateMessagesInputHasher'
    });
  });

  it('should compute input hash correctly with poll ID', async () => {
    const circuitInputs = {
      newDeactivateRoot: BigInt(700),
      coordPubKey: coordPubKey as unknown as [bigint, bigint],
      batchStartHash: BigInt(300),
      batchEndHash: BigInt(400),
      currentDeactivateCommitment: BigInt(600),
      newDeactivateCommitment: BigInt(800),
      currentStateRoot: BigInt(500),
      expectedPollId: BigInt(1) // Added poll ID
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    const hash = await getSignal(circuit, witness, 'hash');

    // Hash should be a valid field element
    expect(hash).to.be.a('bigint');
    expect(hash > 0n).to.be.true;
  });

  it('should produce different hashes for different poll IDs', async () => {
    const circuitInputs1 = {
      newDeactivateRoot: BigInt(700),
      coordPubKey: coordPubKey as unknown as [bigint, bigint],
      batchStartHash: BigInt(300),
      batchEndHash: BigInt(400),
      currentDeactivateCommitment: BigInt(600),
      newDeactivateCommitment: BigInt(800),
      currentStateRoot: BigInt(500),
      expectedPollId: BigInt(1) // Poll ID 1
    };

    const circuitInputs2 = {
      newDeactivateRoot: BigInt(700),
      coordPubKey: coordPubKey as unknown as [bigint, bigint],
      batchStartHash: BigInt(300),
      batchEndHash: BigInt(400),
      currentDeactivateCommitment: BigInt(600),
      newDeactivateCommitment: BigInt(800),
      currentStateRoot: BigInt(500),
      expectedPollId: BigInt(2) // Poll ID 2
    };

    const witness1 = await circuit.calculateWitness(circuitInputs1);
    const witness2 = await circuit.calculateWitness(circuitInputs2);

    const hash1 = await getSignal(circuit, witness1, 'hash');
    const hash2 = await getSignal(circuit, witness2, 'hash');

    // Different poll IDs should produce different hashes
    expect(hash1.toString()).to.not.equal(hash2.toString());
  });

  it('should produce different hashes for different inputs', async () => {
    const circuitInputs1 = {
      newDeactivateRoot: BigInt(700),
      coordPubKey: coordPubKey as unknown as [bigint, bigint],
      batchStartHash: BigInt(300),
      batchEndHash: BigInt(400),
      currentDeactivateCommitment: BigInt(600),
      newDeactivateCommitment: BigInt(800),
      currentStateRoot: BigInt(500),
      expectedPollId: BigInt(1)
    };

    const circuitInputs2 = {
      newDeactivateRoot: BigInt(701), // Different value
      coordPubKey: coordPubKey as unknown as [bigint, bigint],
      batchStartHash: BigInt(300),
      batchEndHash: BigInt(400),
      currentDeactivateCommitment: BigInt(600),
      newDeactivateCommitment: BigInt(800),
      currentStateRoot: BigInt(500),
      expectedPollId: BigInt(1)
    };

    const witness1 = await circuit.calculateWitness(circuitInputs1);
    const witness2 = await circuit.calculateWitness(circuitInputs2);

    const hash1 = await getSignal(circuit, witness1, 'hash');
    const hash2 = await getSignal(circuit, witness2, 'hash');

    // Different inputs should produce different hashes
    expect(hash1.toString()).to.not.equal(hash2.toString());
  });

  it('should be deterministic', async () => {
    const circuitInputs = {
      newDeactivateRoot: BigInt(700),
      coordPubKey: coordPubKey as unknown as [bigint, bigint],
      batchStartHash: BigInt(300),
      batchEndHash: BigInt(400),
      currentDeactivateCommitment: BigInt(600),
      newDeactivateCommitment: BigInt(800),
      currentStateRoot: BigInt(500),
      expectedPollId: BigInt(1)
    };

    const witness1 = await circuit.calculateWitness(circuitInputs);
    const witness2 = await circuit.calculateWitness(circuitInputs);

    const hash1 = await getSignal(circuit, witness1, 'hash');
    const hash2 = await getSignal(circuit, witness2, 'hash');

    // Same inputs should produce same hash
    expect(hash1.toString()).to.equal(hash2.toString());
  });
});
