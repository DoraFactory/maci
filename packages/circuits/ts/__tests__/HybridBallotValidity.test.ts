import {
  VoterClient,
  OperatorClient,
  deriveCommitteeKey,
  buildBallotVector,
  encryptBallot
} from '@dorafactory/maci-sdk';
import { expect } from 'chai';
import { type WitnessTester } from 'circomkit';

import { getSignal, circomkitInstance, buildHybridVoterTree } from './utils/utils';

/**
 * BallotValidity circuit tests.
 *
 * Circuit: packages/circuits/circom/hybrid/power/ballotValidity.circom
 *
 * The voter proves, without revealing the vote, that the published AHE
 * ciphertext vector correctly encrypts a one-hot weighted ballot within a
 * budget authenticated from the voter's REAL state leaf (via Merkle
 * inclusion against `stateRoot`), and hashes to the committed value that the
 * routing signature binds. See `HybridBallotRoutingBinding.test.ts` for the
 * dedicated routing-binding (`routingEncPubKey === ephemeralPrivKey * G`)
 * regression tests.
 */
describe('BallotValidity circuit (Hybrid MACI + AHE)', function test() {
  this.timeout(300000);

  const STATE_TREE_DEPTH = 2;
  const M = 5; // voteOptionTreeDepth = 1 -> 5 options
  const UNIFIED_BALANCE = 100n;
  const pollId = 1;
  const stateIdx = 0;

  // A demo committee key Kc = kc * G (single-party stand-in for the threshold key).
  const kc = 987654321n;
  const Kc = deriveCommitteeKey(kc);

  const coordinator = new OperatorClient({ network: 'testnet', secretKey: 424242n });
  const coordPubKey = coordinator.getSigner().getPublicKey().toPoints() as [bigint, bigint];
  const voter = new VoterClient({ network: 'testnet', secretKey: 100001n });
  const pubKey = voter.getSigner().getPublicKey().toPoints() as [bigint, bigint];

  const { tree, stateRoot } = buildHybridVoterTree([{ pubKey, balance: UNIFIED_BALANCE }], STATE_TREE_DEPTH);
  const pathElements = tree.pathElementOf(stateIdx) as bigint[][];

  let circuit: WitnessTester;

  before(async () => {
    circuit = await circomkitInstance.WitnessTester('BallotValidity_hybrid_2-1', {
      file: 'hybrid/power/ballotValidity',
      template: 'BallotValidity',
      params: [STATE_TREE_DEPTH, 1]
    });
  });

  it('accepts a valid one-hot ballot and matches SDK ciphertext/commitment', async () => {
    const voIdx = 1;
    const weight = 5; // 5^2 = 25 <= 100

    const message = voter.genHybridMessageFactory(coordPubKey, Kc, pollId, M)(stateIdx, 1, voIdx, weight);

    const inputs = {
      voteWeights: message.weights,
      r: message.randomness,
      voiceCreditBalance: UNIFIED_BALANCE,
      voteOptionTreeRoot: 0n,
      slNonce: 0n,
      pathElements,
      stateIdx: BigInt(stateIdx),
      pubKey,
      ephemeralPrivKey: message.ephemeralPrivKey,
      routing: message.routing,
      routingEncPubKey: message.encPubKey,
      Kc,
      stateRoot,
      coordPubKey,
      pollId: BigInt(pollId)
    };

    const witness = await circuit.calculateWitness(inputs);
    await circuit.expectConstraintPass(witness);

    // Circuit-produced ciphertext must equal the SDK's.
    for (let opt = 0; opt < M; opt++) {
      expect(await getSignal(circuit, witness, `c1[${opt}][0]`)).to.equal(message.ciphertexts[opt].c1[0]);
      expect(await getSignal(circuit, witness, `c1[${opt}][1]`)).to.equal(message.ciphertexts[opt].c1[1]);
      expect(await getSignal(circuit, witness, `c2[${opt}][0]`)).to.equal(message.ciphertexts[opt].c2[0]);
      expect(await getSignal(circuit, witness, `c2[${opt}][1]`)).to.equal(message.ciphertexts[opt].c2[1]);
    }
    expect(await getSignal(circuit, witness, 'aheCommitment')).to.equal(message.aheCommitment);
  });

  it('rejects a non one-hot ballot (weight on two options)', async () => {
    const voIdx = 1;
    const weight = 5;
    const message = voter.genHybridMessageFactory(coordPubKey, Kc, pollId, M)(stateIdx, 1, voIdx, weight);

    // Tamper: swap in a non-one-hot weight vector (two non-zero entries). This
    // also desyncs the recomputed aheCommitment from the one the routing
    // envelope was signed for, but that's fine -- either way the witness must
    // fail to satisfy the circuit.
    const weights = [3n, 4n, 0n, 0n, 0n];
    const { randomness } = encryptBallot(weights, Kc);

    let threw = false;
    try {
      const witness = await circuit.calculateWitness({
        voteWeights: weights,
        r: randomness,
        voiceCreditBalance: UNIFIED_BALANCE,
        voteOptionTreeRoot: 0n,
        slNonce: 0n,
        pathElements,
        stateIdx: BigInt(stateIdx),
        pubKey,
        ephemeralPrivKey: message.ephemeralPrivKey,
        routing: message.routing,
        routingEncPubKey: message.encPubKey,
        Kc,
        stateRoot,
        coordPubKey,
        pollId: BigInt(pollId)
      });
      await circuit.expectConstraintPass(witness);
    } catch {
      threw = true;
    }
    expect(threw).to.equal(true);
  });

  it('rejects a ballot that exceeds the voice-credit budget', async () => {
    const voIdx = 0;
    const weight = 11; // 11^2 = 121 > 100
    const message = voter.genHybridMessageFactory(coordPubKey, Kc, pollId, M)(stateIdx, 1, voIdx, weight);

    const weights = buildBallotVector(voIdx, weight, M);
    const { randomness } = encryptBallot(weights, Kc);

    let threw = false;
    try {
      const witness = await circuit.calculateWitness({
        voteWeights: weights,
        r: randomness,
        voiceCreditBalance: UNIFIED_BALANCE,
        voteOptionTreeRoot: 0n,
        slNonce: 0n,
        pathElements,
        stateIdx: BigInt(stateIdx),
        pubKey,
        ephemeralPrivKey: message.ephemeralPrivKey,
        routing: message.routing,
        routingEncPubKey: message.encPubKey,
        Kc,
        stateRoot,
        coordPubKey,
        pollId: BigInt(pollId)
      });
      await circuit.expectConstraintPass(witness);
    } catch {
      threw = true;
    }
    expect(threw).to.equal(true);
  });

  it('rejects a ballot authenticated against the WRONG state root (forged voice-credit balance)', async () => {
    const voIdx = 2;
    const weight = 5;
    const message = voter.genHybridMessageFactory(coordPubKey, Kc, pollId, M)(stateIdx, 1, voIdx, weight);

    // Tamper: claim a much larger balance than the leaf actually committed to
    // (a forged budget). The Merkle inclusion check must reject this since
    // the leaf hash would no longer match any leaf under `stateRoot`.
    let threw = false;
    try {
      const witness = await circuit.calculateWitness({
        voteWeights: message.weights,
        r: message.randomness,
        voiceCreditBalance: 999999n,
        voteOptionTreeRoot: 0n,
        slNonce: 0n,
        pathElements,
        stateIdx: BigInt(stateIdx),
        pubKey,
        ephemeralPrivKey: message.ephemeralPrivKey,
        routing: message.routing,
        routingEncPubKey: message.encPubKey,
        Kc,
        stateRoot,
        coordPubKey,
        pollId: BigInt(pollId)
      });
      await circuit.expectConstraintPass(witness);
    } catch {
      threw = true;
    }
    expect(threw).to.equal(true);
  });
});
