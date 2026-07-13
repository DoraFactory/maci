pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/babyjub.circom";
include "../../../node_modules/circomlib/circuits/bitify.circom";
include "../../../node_modules/circomlib/circuits/comparators.circom";
include "../../utils/hasherPoseidon.circom";
include "../../utils/hasherSha256.circom";
include "../lib/dleqVerify.circom";
include "../lib/signedScalarMul.circom";
include "../lib/aheCommit.circom";

/**
 * Hybrid MACI + AHE: verify a threshold committee's revealed tally against the
 * on-chain aggregate ciphertext, closing the trust gap in
 * `execute_reveal_hybrid_tally` (see hybrid_maci_ahe_fix_plan.md, phase 3) —
 * before this circuit, the contract just recorded whatever `results`/`salt`
 * anyone submitted, with no way to tell a faithful decryption from a lie.
 *
 * For each of the `threshold` participants i (their registered
 * `participantPubKey[i] = x_i*G`) and each vote option j:
 *   - `partial[i][j] = x_i * aggC1[j]` is participant i's share of option j's
 *     decryption factor,
 *   - a Chaum-Pedersen DLEQ proof (`DleqVerify`) shows `partial[i][j]` was
 *     computed with the SAME secret `x_i` as `participantPubKey[i]`, without
 *     revealing `x_i` — this is exactly the check
 *     `mpc-coordinator-demo/src/crypto/dleq.ts`'s `verifyDleq` already does
 *     off-chain for the live demo UI; here it becomes a circuit constraint.
 *
 * The T verified partials are then Lagrange-combined (at x=0, using the
 * PUBLIC `participantIndex[T]` as the Shamir x-coordinates) into the full
 * decryption factor for each option, and the circuit checks
 *   results[j]*G == aggC2[j] - D[j]
 * i.e. `results[j]` is exactly the plaintext AHE decrypts to.
 *
 * Lagrange coefficients WITHOUT modular inverse: this circuit's native field
 * is the SNARK scalar field (~2^254), but Shamir shares/Lagrange coefficients
 * are conceptually elements of Z_L (L = BabyJubjub subgroup order, ~2^251.4,
 * a DIFFERENT, smaller prime). Computing "mod L" reduction/inverse using
 * native (mod SNARK-field) circuit arithmetic would silently produce the
 * WRONG value (inverses differ across different moduli). Instead, this
 * circuit clears denominators: for T participant indices x_0..x_{T-1},
 *   num_i   = prod_{m != i} (-x_m)
 *   den_i   = prod_{m != i} (x_i - x_m)
 *   lambda_i_int = num_i * prod_{k != i} den_k     (an exact, tiny INTEGER)
 *   common       = prod_k den_k                    (also a tiny INTEGER)
 * satisfy `lambda_i_int == lambda_i * common` for the TRUE (rational)
 * Lagrange coefficient lambda_i, for any index values — no inverse needed,
 * only small-magnitude multiplication/subtraction, safe from field overflow
 * for realistic committee sizes. The equation actually checked is therefore
 * `common . aggC2[j] == common . (results[j]*G) + sum_i lambda_i_int . partial[i][j]`,
 * which holds iff `aggC2[j] == results[j]*G + D[j]` (scaling both sides of a
 * true equation by the same nonzero integer preserves it, and `common` is
 * nonzero whenever the T indices are pairwise distinct).
 * `lambda_i_int`/`common` can be negative; `SignedScalarMul` handles that via
 * explicit (sign, magnitude) witnesses checked against the in-circuit value.
 *
 * `Kc` and `salt` are not used in the arithmetic above (Kc identifies which
 * committee key this decryption used, salt is carried through with the
 * revealed results); both are still PUBLIC so the on-chain wrapper's
 * inputHash binds a submitted proof to specific Kc/salt/results values and
 * the contract can cross-check Kc against its own stored `HYBRID_KC`.
 * `participantPubKey`/`participantIndex` are public so the contract can
 * independently check they are registered `HybridCommitteeConfig` members —
 * membership/threshold POLICY lives on-chain; this circuit only proves the
 * decryption ARITHMETIC for whichever T (pubkey, index) pairs are supplied.
 */
template RevealVerify(voteOptionTreeDepth, threshold) {
    var TREE_ARITY = 5;
    var M = 1;
    for (var d = 0; d < voteOptionTreeDepth; d++) { M *= TREE_ARITY; }
    var T = threshold;
    // Generous bound for Lagrange coefficient magnitudes: safe for committees
    // with up to ~6 members and index values up to a few hundred, far beyond
    // this demo's scope (T=2, N=3), while staying much cheaper than the
    // 253/254-bit mults used for the actual curve scalars above.
    var LAMBDA_BITS = 64;

    // ---- Public ----
    signal input Kc[2];
    signal input aggC1[M][2];
    signal input aggC2[M][2];
    signal input results[M];
    signal input salt;
    signal input participantPubKey[T][2];
    signal input participantIndex[T];

    // ---- Private ----
    signal input partial[T][M][2];
    signal input dleqA[T][M][2];
    signal input dleqB[T][M][2];
    signal input dleqZ[T][M];
    signal input lambdaSign[T];
    signal input lambdaMag[T];
    signal input commonSign;
    signal input commonMag;

    // 0. Participant indices must be pairwise distinct. Without this, a
    //    prover could submit a repeated index so that `den[i]` (the product
    //    of `participantIndex[i] - participantIndex[m]` over m != i) is
    //    forced to 0 for some i, making `common` (the product of all
    //    `den[i]`) 0 too. `commonSign`/`commonMag`/`lambdaSign`/`lambdaMag`
    //    are prover-supplied private witnesses, and `common === (1 -
    //    2*commonSign) * commonMag` / `lambdaInt[i] === (1-2*lambdaSign[i])
    //    * lambdaMag[i]` are satisfiable with 0 == 0 regardless of what
    //    `commonMag`/`lambdaMag` are otherwise unconstrained to — collapsing
    //    step 5's check to `0 == 0`, which holds for ANY `results`/`aggC2`,
    //    letting a prover claim arbitrary tally results. `participantIndex`
    //    is PUBLIC (entirely attacker-controlled input), so this must be
    //    enforced in-circuit, not just trusted from the caller.
    component idxDup[T][T];
    for (var i = 0; i < T; i++) {
        for (var m = i + 1; m < T; m++) {
            idxDup[i][m] = IsZero();
            idxDup[i][m].in <== participantIndex[i] - participantIndex[m];
            idxDup[i][m].out === 0;
        }
    }

    // 1. Every participant's partial decryption share must be consistent with
    //    their registered public key, for every option.
    component dleq[T][M];
    for (var i = 0; i < T; i++) {
        for (var j = 0; j < M; j++) {
            dleq[i][j] = DleqVerify();
            dleq[i][j].H[0] <== aggC1[j][0];
            dleq[i][j].H[1] <== aggC1[j][1];
            dleq[i][j].X[0] <== participantPubKey[i][0];
            dleq[i][j].X[1] <== participantPubKey[i][1];
            dleq[i][j].Y[0] <== partial[i][j][0];
            dleq[i][j].Y[1] <== partial[i][j][1];
            dleq[i][j].a[0] <== dleqA[i][j][0];
            dleq[i][j].a[1] <== dleqA[i][j][1];
            dleq[i][j].b[0] <== dleqB[i][j][0];
            dleq[i][j].b[1] <== dleqB[i][j][1];
            dleq[i][j].z <== dleqZ[i][j];
        }
    }

    // 2. Denominator-cleared Lagrange-at-zero coefficients from the PUBLIC
    //    participant indices (see file doc comment above).
    signal numAcc[T][T + 1];
    signal denAcc[T][T + 1];
    signal den[T];
    for (var i = 0; i < T; i++) {
        numAcc[i][0] <== 1;
        denAcc[i][0] <== 1;
        for (var m = 0; m < T; m++) {
            if (m == i) {
                numAcc[i][m + 1] <== numAcc[i][m];
                denAcc[i][m + 1] <== denAcc[i][m];
            } else {
                numAcc[i][m + 1] <== numAcc[i][m] * (0 - participantIndex[m]);
                denAcc[i][m + 1] <== denAcc[i][m] * (participantIndex[i] - participantIndex[m]);
            }
        }
        den[i] <== denAcc[i][T];
    }

    signal commonAcc[T + 1];
    commonAcc[0] <== 1;
    for (var i = 0; i < T; i++) {
        commonAcc[i + 1] <== commonAcc[i] * den[i];
    }
    signal common;
    common <== commonAcc[T];

    signal lambdaIntAcc[T][T + 1];
    signal lambdaInt[T];
    for (var i = 0; i < T; i++) {
        lambdaIntAcc[i][0] <== numAcc[i][T];
        for (var k = 0; k < T; k++) {
            if (k == i) {
                lambdaIntAcc[i][k + 1] <== lambdaIntAcc[i][k];
            } else {
                lambdaIntAcc[i][k + 1] <== lambdaIntAcc[i][k] * den[k];
            }
        }
        lambdaInt[i] <== lambdaIntAcc[i][T];
    }

    // 3. Bind the (sign, magnitude) witnesses to the in-circuit integer
    //    values computed above.
    for (var i = 0; i < T; i++) {
        lambdaSign[i] * (1 - lambdaSign[i]) === 0;
        lambdaInt[i] === (1 - 2 * lambdaSign[i]) * lambdaMag[i];
    }
    commonSign * (1 - commonSign) === 0;
    common === (1 - 2 * commonSign) * commonMag;

    // 4. D'[j] = sum_i lambda_i_int . partial_i[j] == common . D[j].
    component lambdaMul[T][M];
    component dAdd[T][M];
    signal dAcc[M][T + 1][2];
    for (var j = 0; j < M; j++) {
        dAcc[j][0][0] <== 0;
        dAcc[j][0][1] <== 1;
        for (var i = 0; i < T; i++) {
            lambdaMul[i][j] = SignedScalarMul(LAMBDA_BITS);
            lambdaMul[i][j].p[0] <== partial[i][j][0];
            lambdaMul[i][j].p[1] <== partial[i][j][1];
            lambdaMul[i][j].mag <== lambdaMag[i];
            lambdaMul[i][j].sign <== lambdaSign[i];

            dAdd[i][j] = BabyAdd();
            dAdd[i][j].x1 <== dAcc[j][i][0];
            dAdd[i][j].y1 <== dAcc[j][i][1];
            dAdd[i][j].x2 <== lambdaMul[i][j].out[0];
            dAdd[i][j].y2 <== lambdaMul[i][j].out[1];
            dAcc[j][i + 1][0] <== dAdd[i][j].xout;
            dAcc[j][i + 1][1] <== dAdd[i][j].yout;
        }
    }

    // 5. Check common . aggC2[j] == common . (results[j]*G) + D'[j].
    component resG[M];
    component commonAggC2[M];
    component commonResG[M];
    component rhs[M];
    for (var j = 0; j < M; j++) {
        resG[j] = BabyPbk();
        resG[j].in <== results[j];

        commonAggC2[j] = SignedScalarMul(LAMBDA_BITS);
        commonAggC2[j].p[0] <== aggC2[j][0];
        commonAggC2[j].p[1] <== aggC2[j][1];
        commonAggC2[j].mag <== commonMag;
        commonAggC2[j].sign <== commonSign;

        commonResG[j] = SignedScalarMul(LAMBDA_BITS);
        commonResG[j].p[0] <== resG[j].Ax;
        commonResG[j].p[1] <== resG[j].Ay;
        commonResG[j].mag <== commonMag;
        commonResG[j].sign <== commonSign;

        rhs[j] = BabyAdd();
        rhs[j].x1 <== commonResG[j].out[0];
        rhs[j].y1 <== commonResG[j].out[1];
        rhs[j].x2 <== dAcc[j][T][0];
        rhs[j].y2 <== dAcc[j][T][1];

        rhs[j].xout === commonAggC2[j].out[0];
        rhs[j].yout === commonAggC2[j].out[1];
    }
}

/**
 * On-chain wrapper for RevealVerify: identical constraints, but the ENTIRE
 * public interface is folded into a single SHA256 `inputHash`, matching the
 * cw-amaci Groth16 verifier's single-public-input support (same pattern as
 * `BallotValidityOnchain`/`ProcessHybridMessagesOnchain`).
 *
 * The bound public values, in the SAME order the contract must repack:
 *   [ Kc.x, Kc.y,
 *     aggCommitment,          // Poseidon AheCommit(aggC1, aggC2)
 *     resultsCommitment,      // Poseidon fold of results[0..M-1], salt
 *     participantCommitment,  // Poseidon fold of (pubKey.x, pubKey.y, index) per participant
 *     pollId ]
 *
 * None of `aggC1`/`aggC2`/`results`/`salt`/`participantPubKey`/`participantIndex`
 * are exposed directly (that would need M*4 + M + 1 + 3*T field elements —
 * expensive to SHA256 and to repack on-chain). They are folded into three
 * Poseidon commitments first, using the SAME HashLeftRight-chain construction
 * `AheCommit` already uses for ciphertexts (acc_0 = 0, acc_{k+1} =
 * hash2([acc_k, elem_k])), so the contract can recompute each commitment from
 * values it already has (its own `HYBRID_AGG_C1`/`HYBRID_AGG_C2`, and the
 * `results`/`salt`/`participant*` arguments of the `RevealHybridTally` call)
 * without needing them as separate SHA256 inputs.
 */
template RevealVerifyOnchain(voteOptionTreeDepth, threshold) {
    var TREE_ARITY = 5;
    var M = 1;
    for (var d = 0; d < voteOptionTreeDepth; d++) { M *= TREE_ARITY; }
    var T = threshold;

    // Private witness (everything the inner circuit needs).
    signal input partial[T][M][2];
    signal input dleqA[T][M][2];
    signal input dleqB[T][M][2];
    signal input dleqZ[T][M];
    signal input lambdaSign[T];
    signal input lambdaMag[T];
    signal input commonSign;
    signal input commonMag;
    signal input aggC1[M][2];
    signal input aggC2[M][2];

    // Public (folded into inputHash below).
    signal input Kc[2];
    signal input results[M];
    signal input salt;
    signal input participantPubKey[T][2];
    signal input participantIndex[T];
    signal input pollId;

    // Single public signal.
    signal output inputHash;

    component rv = RevealVerify(voteOptionTreeDepth, threshold);
    rv.Kc[0] <== Kc[0];
    rv.Kc[1] <== Kc[1];
    rv.salt <== salt;
    for (var j = 0; j < M; j++) {
        rv.aggC1[j][0] <== aggC1[j][0];
        rv.aggC1[j][1] <== aggC1[j][1];
        rv.aggC2[j][0] <== aggC2[j][0];
        rv.aggC2[j][1] <== aggC2[j][1];
        rv.results[j] <== results[j];
        for (var i = 0; i < T; i++) {
            rv.partial[i][j][0] <== partial[i][j][0];
            rv.partial[i][j][1] <== partial[i][j][1];
            rv.dleqA[i][j][0] <== dleqA[i][j][0];
            rv.dleqA[i][j][1] <== dleqA[i][j][1];
            rv.dleqB[i][j][0] <== dleqB[i][j][0];
            rv.dleqB[i][j][1] <== dleqB[i][j][1];
            rv.dleqZ[i][j] <== dleqZ[i][j];
        }
    }
    for (var i = 0; i < T; i++) {
        rv.participantPubKey[i][0] <== participantPubKey[i][0];
        rv.participantPubKey[i][1] <== participantPubKey[i][1];
        rv.participantIndex[i] <== participantIndex[i];
        rv.lambdaSign[i] <== lambdaSign[i];
        rv.lambdaMag[i] <== lambdaMag[i];
    }
    rv.commonSign <== commonSign;
    rv.commonMag <== commonMag;

    // Fold the (still-encrypted) aggregate ciphertext into ONE commitment,
    // exactly like ProcessHybridMessagesOnchain's current/new aggregates.
    component aggCommit = AheCommit(M);
    for (var j = 0; j < M; j++) {
        aggCommit.c1[j][0] <== aggC1[j][0];
        aggCommit.c1[j][1] <== aggC1[j][1];
        aggCommit.c2[j][0] <== aggC2[j][0];
        aggCommit.c2[j][1] <== aggC2[j][1];
    }

    // Fold results[0..M-1] + salt: acc_0 = 0; acc_{k+1} = hash2([acc_k, elem_k]).
    component resultsHash[M + 1];
    signal resultsAcc[M + 2];
    resultsAcc[0] <== 0;
    for (var j = 0; j < M; j++) {
        resultsHash[j] = HashLeftRight();
        resultsHash[j].left <== resultsAcc[j];
        resultsHash[j].right <== results[j];
        resultsAcc[j + 1] <== resultsHash[j].hash;
    }
    resultsHash[M] = HashLeftRight();
    resultsHash[M].left <== resultsAcc[M];
    resultsHash[M].right <== salt;
    resultsAcc[M + 1] <== resultsHash[M].hash;
    signal resultsCommitment;
    resultsCommitment <== resultsAcc[M + 1];

    // Fold (pubKey.x, pubKey.y, index) per participant, same construction.
    component partHash[3 * T];
    signal partAcc[3 * T + 1];
    partAcc[0] <== 0;
    for (var i = 0; i < T; i++) {
        partHash[3 * i] = HashLeftRight();
        partHash[3 * i].left <== partAcc[3 * i];
        partHash[3 * i].right <== participantPubKey[i][0];
        partAcc[3 * i + 1] <== partHash[3 * i].hash;

        partHash[3 * i + 1] = HashLeftRight();
        partHash[3 * i + 1].left <== partAcc[3 * i + 1];
        partHash[3 * i + 1].right <== participantPubKey[i][1];
        partAcc[3 * i + 2] <== partHash[3 * i + 1].hash;

        partHash[3 * i + 2] = HashLeftRight();
        partHash[3 * i + 2].left <== partAcc[3 * i + 2];
        partHash[3 * i + 2].right <== participantIndex[i];
        partAcc[3 * i + 3] <== partHash[3 * i + 2].hash;
    }
    signal participantCommitment;
    participantCommitment <== partAcc[3 * T];

    component ih = Sha256Hasher(6);
    ih.in[0] <== Kc[0];
    ih.in[1] <== Kc[1];
    ih.in[2] <== aggCommit.commitment;
    ih.in[3] <== resultsCommitment;
    ih.in[4] <== participantCommitment;
    ih.in[5] <== pollId;

    inputHash <== ih.hash;
}
