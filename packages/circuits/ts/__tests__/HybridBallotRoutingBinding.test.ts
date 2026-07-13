import {
  VoterClient,
  OperatorClient,
  Tree,
  poseidon,
  hashLeftRight
} from '@dorafactory/maci-sdk';
import { expect } from 'chai';
import { type WitnessTester } from 'circomkit';

import { circomkitInstance } from './utils/utils';

/**
 * BallotValidity circuit -- routing-binding tests (Phase 3 of
 * hybrid_maci+ahe_审查问题修复计划).
 *
 * Circuit: packages/circuits/circom/hybrid/power/ballotValidity.circom
 *
 * Before this fix, the circuit re-derived the ECDH shared key from
 * `ephemeralPrivKey`/`coordPubKey` and asserted the DECRYPTED `routing`
 * envelope was self-consistent, but never checked that `routingEncPubKey`
 * (the ephemeral pubkey actually published on-chain alongside the
 * ciphertext) equals `ephemeralPrivKey * G`. A prover could satisfy every
 * in-circuit assertion with one ephemeral key while publishing a completely
 * DIFFERENT `routingEncPubKey` on-chain -- the coordinator's real ECDH
 * (using its own `coordPrivKey` and the published `routingEncPubKey`) would
 * then derive a different shared key than the one this proof reasoned
 * about, decrypting the real on-chain envelope to garbage.
 *
 * This suite proves: a valid ballot (where `routingEncPubKey` really is
 * `ephemeralPrivKey * G`) is accepted, and swapping in an unrelated
 * `routingEncPubKey` (still able to satisfy every OTHER constraint, since
 * the routing ciphertext itself is untouched) makes witness generation
 * fail.
 */
describe('BallotValidity circuit -- routing binding (Hybrid MACI + AHE)', function test() {
  this.timeout(300000);

  const STATE_TREE_DEPTH = 2;
  const M = 5; // options (voteOptionTreeDepth = 1)
  const UNIFIED_BALANCE = 100n;
  const DEACTIVATE_CONSTANT =
    14655542659562014735865511769057053982292279840403315552050801315682099828156n;

  const Kc: [bigint, bigint] = [
    12638030528432806444680310326288043858520366543569780948011195983100888895424n,
    2874222432609678237186489396330648906556209135055008837139779509259876658697n
  ];
  const coordinator = new OperatorClient({ network: 'testnet', secretKey: 424242n });
  const coordPubKey = coordinator.getSigner().getPublicKey().toPoints() as [bigint, bigint];
  const voter = new VoterClient({ network: 'testnet', secretKey: 100001n });
  const pubKey = voter.getSigner().getPublicKey().toPoints() as [bigint, bigint];
  const pollId = 1;
  const stateIdx = 0;

  const leaves = [pubKey].map((pk) =>
    hashLeftRight(poseidon([pk[0], pk[1], UNIFIED_BALANCE, 0n, 0n]), DEACTIVATE_CONSTANT)
  );
  const tree = new Tree(5, STATE_TREE_DEPTH, 0n);
  tree.initLeaves(leaves);
  const stateRoot = tree.root as bigint;
  const pathElements = tree.pathElementOf(stateIdx) as bigint[][];

  const message = voter.genHybridMessageFactory(coordPubKey, Kc, pollId, M)(stateIdx, 1, 2, 4);

  const baseInputs = {
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

  let circuit: WitnessTester;

  before(async () => {
    circuit = await circomkitInstance.WitnessTester('BallotValidity_hybrid_2-1', {
      file: 'hybrid/power/ballotValidity',
      template: 'BallotValidity',
      params: [STATE_TREE_DEPTH, 1]
    });
  });

  it('accepts a ballot whose routingEncPubKey really is ephemeralPrivKey * G', async () => {
    const witness = await circuit.calculateWitness(baseInputs);
    await circuit.expectConstraintPass(witness);
  });

  it('rejects a ballot whose routingEncPubKey does NOT match ephemeralPrivKey * G', async () => {
    // Swap in an unrelated ephemeral pubkey (the COORDINATOR's, just to have
    // some other valid curve point handy) -- everything else about the
    // witness (the routing ciphertext, the decrypted stateIdx/aheCommitment
    // it must match) is untouched, so only the NEW PrivToPubKey constraint
    // can catch this.
    const tampered = { ...baseInputs, routingEncPubKey: coordPubKey };
    let threw = false;
    try {
      const witness = await circuit.calculateWitness(tampered);
      await circuit.expectConstraintPass(witness);
    } catch {
      threw = true;
    }
    expect(threw).to.equal(true);
  });
});
