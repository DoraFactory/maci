import { deriveCommitteeKey, ahePointMul, encryptAhe, hash12, AHE_G, type AhePoint } from '@dorafactory/maci-sdk';
import { expect } from 'chai';
import { type WitnessTester } from 'circomkit';

import { circomkitInstance } from './utils/utils';

/**
 * RevealVerify circuit tests.
 *
 * Circuit: packages/circuits/circom/hybrid/power/revealVerify.circom
 *
 * Phase 1 of hybrid_maci+ahe_审查问题修复计划: `participantIndex` (the Shamir
 * x-coordinates used to Lagrange-combine the T partial decryptions) is a
 * PUBLIC, entirely prover-controlled input. Before this fix, a prover could
 * submit a repeated index so the denominator-cleared `common`/`lambdaInt[i]`
 * degenerate to 0, letting the final check collapse to the vacuous `0 == 0`
 * -- passing for ANY `results`, regardless of the real aggregate ciphertext.
 * This suite exercises exactly that: a valid 2-of-2 reveal must pass, and a
 * proof reusing the SAME index twice must fail at witness-generation time.
 */
describe('RevealVerify circuit (Hybrid MACI + AHE)', function test() {
  this.timeout(300000);

  const M = 5; // vote options (voteOptionTreeDepth = 1)
  const T = 2; // threshold
  const pollId = 1n;

  // BabyJubjub prime-subgroup order -- Shamir shares/DLEQ nonces live in Z_L,
  // a DIFFERENT (smaller) prime than the SNARK scalar field (see the circuit
  // file's doc comment for why this matters).
  const L = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;
  const mod = (a: bigint, m: bigint = L): bigint => ((a % m) + m) % m;
  let nonceCounter = 1n;
  const randScalarL = (): bigint => mod((nonceCounter += 1n) * 999999999999999n + 424242n);

  const proveDleq = (x: bigint, H: AhePoint, X: AhePoint) => {
    const Y = ahePointMul(H, x);
    const w = randScalarL();
    const a = ahePointMul(AHE_G, w);
    const b = ahePointMul(H, w);
    const e = hash12([AHE_G[0], AHE_G[1], H[0], H[1], X[0], X[1], Y[0], Y[1], a[0], a[1], b[0], b[1]]);
    const z = mod(w + e * x);
    return { Y, a, b, z };
  };

  const lagrangeInts = (idx: bigint[]) => {
    const t = idx.length;
    const num: bigint[] = [];
    const den: bigint[] = [];
    for (let i = 0; i < t; i += 1) {
      let n = 1n;
      let d = 1n;
      for (let m = 0; m < t; m += 1) {
        if (m === i) continue;
        n *= -idx[m];
        d *= idx[i] - idx[m];
      }
      num.push(n);
      den.push(d);
    }
    let common = 1n;
    for (let i = 0; i < t; i += 1) common *= den[i];
    const lambdaInt = num.map((n, i) => {
      let prod = n;
      for (let k = 0; k < t; k += 1) if (k !== i) prod *= den[k];
      return prod;
    });
    return { lambdaInt, common };
  };
  const signMag = (v: bigint) => (v < 0n ? { sign: 1n, mag: -v } : { sign: 0n, mag: v });

  // Committee: secret k (Kc = k*G), 2-of-N Shamir shares.
  const k = 1234567n;
  const Kc = deriveCommitteeKey(k);
  const c1Coeff = 987654321n;
  const shareAt = (x: bigint) => mod(k + c1Coeff * x);

  const buildInputs = (participantIndex: bigint[]) => {
    const shares = participantIndex.map(shareAt);
    const participantPubKey = shares.map((s) => ahePointMul(AHE_G, s) as AhePoint);

    const results = [4n, 1n, 2n, 0n, 3n];
    const salt = 777n;
    const randomness = results.map(() => randScalarL());
    const aggCiphertexts = results.map((r, j) => encryptAhe(r, Kc, randomness[j]));
    const aggC1 = aggCiphertexts.map((c) => c.c1) as AhePoint[];
    const aggC2 = aggCiphertexts.map((c) => c.c2) as AhePoint[];

    const partial: bigint[][][] = [];
    const dleqA: bigint[][][] = [];
    const dleqB: bigint[][][] = [];
    const dleqZ: bigint[][] = [];
    for (let i = 0; i < T; i += 1) {
      partial.push([]);
      dleqA.push([]);
      dleqB.push([]);
      dleqZ.push([]);
      for (let j = 0; j < M; j += 1) {
        const { Y, a, b, z } = proveDleq(shares[i], aggC1[j], participantPubKey[i]);
        partial[i].push(Y);
        dleqA[i].push(a);
        dleqB[i].push(b);
        dleqZ[i].push(z);
      }
    }

    const { lambdaInt, common } = lagrangeInts(participantIndex);
    const lambdaSignMag = lambdaInt.map(signMag);
    const commonSignMag = signMag(common);

    return {
      inputs: {
        Kc,
        aggC1,
        aggC2,
        results,
        salt,
        participantPubKey,
        participantIndex,
        partial,
        dleqA,
        dleqB,
        dleqZ,
        lambdaSign: lambdaSignMag.map((x) => x.sign),
        lambdaMag: lambdaSignMag.map((x) => x.mag),
        commonSign: commonSignMag.sign,
        commonMag: commonSignMag.mag
      },
      results
    };
  };

  let circuit: WitnessTester<
    [
      'Kc',
      'aggC1',
      'aggC2',
      'results',
      'salt',
      'participantPubKey',
      'participantIndex',
      'partial',
      'dleqA',
      'dleqB',
      'dleqZ',
      'lambdaSign',
      'lambdaMag',
      'commonSign',
      'commonMag'
    ]
  >;

  before(async () => {
    circuit = await circomkitInstance.WitnessTester('RevealVerify_hybrid_1-2', {
      file: 'hybrid/power/revealVerify',
      template: 'RevealVerify',
      params: [1, T]
    });
  });

  it('accepts a valid 2-of-2 reveal with distinct participant indices', async () => {
    const { inputs } = buildInputs([1n, 2n]);
    const witness = await circuit.calculateWitness(inputs);
    await circuit.expectConstraintPass(witness);
  });

  it('rejects a proof that reuses the SAME participant index twice', async () => {
    // Before the phase-1 fix, this degenerates `common`/`lambdaInt[i]` to 0
    // (den[i] = participantIndex[i] - participantIndex[m] = 0 for the
    // repeated pair), collapsing the final check to a vacuous 0 == 0 that
    // passes regardless of `results`/`aggC2` -- i.e. ANY claimed tally would
    // verify. The pairwise-distinctness constraint must make witness
    // calculation itself fail instead.
    const { inputs } = buildInputs([1n, 1n]);
    let threw = false;
    try {
      const witness = await circuit.calculateWitness(inputs);
      await circuit.expectConstraintPass(witness);
    } catch {
      threw = true;
    }
    expect(threw).to.equal(true);
  });
});
