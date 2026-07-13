pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/comparators.circom";
include "../utils/hybridMessageToCommand.circom";
include "../../utils/messageHasher.circom";
include "../../utils/privToPubKey.circom";
include "../../utils/hasherSha256.circom";
include "../../utils/hasherPoseidon.circom";
include "../../utils/trees/incrementalQuinTree.circom";
include "../lib/aheCommit.circom";
include "../lib/condPointAdd.circom";

/**
 * Hybrid MACI + AHE message processing — cross-batch LWW fix.
 *
 * The coordinator holds coordPrivKey and, inside the circuit:
 *   1. ECDH-decrypts each message's routing envelope (stateIdx, nonce, sig,
 *      aheCommitment) and verifies the voter's signature,
 *   2. binds the separately-published AHE ciphertext to the signed commitment,
 *   3. Merkle-authenticates each message's `voterPubKey` against the SAME
 *      public `stateRoot` used at publish time, at the decrypted `stateIdx`
 *      (anti-selective-censorship),
 *   4. selects the surviving ballot per state leaf via CLASSIC MACI-style
 *      last-write-wins: a dedicated nonce tree evolves in REVERSE processing
 *      order (newest message first, oldest last — matching classic aMACI's
 *      reverse-batch + reverse-within-batch semantics). A message survives iff
 *      its `cmdNonce == currentNonce[stateIdx] + 1` in the evolving nonce tree.
 *      This gives cross-batch LWW correctness: a voter's revote (submitted
 *      LATER, so at a HIGHER chain index) is processed FIRST, sets the nonce,
 *      and the earlier vote at a lower chain index subsequently fails the nonce
 *      check — both within and across batch boundaries.
 *   5. homomorphically aggregates surviving ballots per option (BabyAdd).
 *
 * Nonce tree: a separate quinary Merkle tree of depth `stateTreeDepth` whose
 * leaves are raw nonce values (one per stateIdx, initially all zero). It is
 * independent of the registration `stateRoot` (which is static and only used
 * for voterPubKey authentication). The nonce tree's root evolves with each
 * successfully processed message and is carried across batches via
 * `currentNonceRoot` → `newNonceRoot` — exactly the way classic MACI carries
 * `currentStateCommitment` → `newStateCommitment`. The initial root is the
 * all-zeros quinary tree root (`ZeroRoot(stateTreeDepth)`).
 *
 * Processing order (reverse, matching classic aMACI):
 *   - Contract processes batches from chain-tail to chain-head (newest first).
 *   - Within a batch the circuit processes slots i = B-1 downto 0 (highest
 *     chain-index message first), updating the nonce tree after each step.
 *     This mirrors classic ProcessMessages's inner reverse loop and ensures
 *     the latest-submitted valid message "claims" the nonce slot before any
 *     earlier message for the same voter can be seen.
 *
 * `voterPubKey[i]` is a PRIVATE witness — it must never appear in this
 * proof's public signals; see `circuits.json` for the pubs list.
 *
 * Partial-batch support (`actualCount`): slots [actualCount, batchSize) are
 * padding. isReal[i] = i < actualCount gates all real-slot-only constraints.
 */
// M = 5^voteOptionTreeDepth options; batchSize = fixed witness slot count.
template ProcessHybridMessages(stateTreeDepth, voteOptionTreeDepth, batchSize) {
    var TREE_ARITY = 5;
    var B = batchSize;
    var M = 1;
    for (var d = 0; d < voteOptionTreeDepth; d++) { M *= TREE_ARITY; }

    var LEAVES_PER_PATH_LEVEL = TREE_ARITY - 1;
    var STATE_LEAF_PUB_X_IDX = 0;
    var STATE_LEAF_PUB_Y_IDX = 1;
    var STATE_LEAF_VOICE_CREDIT_BALANCE_IDX = 2;
    var STATE_LEAF_VO_ROOT_IDX = 3;
    var STATE_LEAF_NONCE_IDX = 4;
    var DEACTIVATE_CONSTANT = 14655542659562014735865511769057053982292279840403315552050801315682099828156;

    signal input coordPrivKey;

    signal input message[B][10];
    signal input encPubKey[B][2];
    signal input voterPubKey[B][2];

    // Registration-tree witnesses: authenticate voterPubKey[i] at stateIdx[i]
    // under the STATIC `stateRoot` (same layout as BallotValidity).
    signal input voiceCreditBalance[B];
    signal input voteOptionTreeRoot[B];
    signal input slNonce[B];
    signal input pathElements[B][stateTreeDepth][LEAVES_PER_PATH_LEVEL];
    signal input stateRoot;

    // Nonce-tree witnesses: track per-voter nonce across batches (cross-batch LWW).
    // `currentNonce[i]` is the prover-supplied current nonce for message i's
    // voter in the evolving nonce tree; constrained by Merkle inclusion below.
    signal input currentNonceRoot;
    signal input noncePathElements[B][stateTreeDepth][LEAVES_PER_PATH_LEVEL];
    signal input currentNonce[B];

    // Partial-batch support.
    signal input actualCount;

    // Published ballot ciphertexts (committee-encrypted; coordinator cannot decrypt).
    signal input encC1[B][M][2];
    signal input encC2[B][M][2];

    // Aggregate ciphertext per option (committee decrypts after the round).
    signal output aggC1[M][2];
    signal output aggC2[M][2];
    // Gate the message hash-chain advance in ProcessHybridMessagesOnchain.
    signal output isReal[B];
    // New nonce tree root after processing this batch (carried to next batch).
    signal output newNonceRoot;

    // ---- 0. isReal[i] = i < actualCount ----
    component isRealCmp[B];
    for (var i = 0; i < B; i++) {
        isRealCmp[i] = LessThan(32);
        isRealCmp[i].in[0] <== i;
        isRealCmp[i].in[1] <== actualCount;
        isReal[i] <== isRealCmp[i].out;
    }

    // ---- 1. Decrypt routing + verify signature + bind ciphertext ----
    // ---- Anti-censorship: Merkle-authenticate voterPubKey[i] against stateRoot ----
    component m2c[B];
    component commit[B];
    signal stateIdx[B];
    signal nonce[B];
    signal sigValid[B];

    component leafHasher[B];
    component wrappedLeaf[B];
    component pathIndices[B];
    component inclusion[B];
    // Mask padding slots' garbage stateIdx to 0 so QuinGeneratePathIndices
    // never sees an out-of-range input.
    signal safeStateIdx[B];

    for (var i = 0; i < B; i++) {
        m2c[i] = HybridMessageToCommand();
        m2c[i].encPrivKey <== coordPrivKey;
        for (var k = 0; k < 10; k++) {
            m2c[i].message[k] <== message[i][k];
        }
        m2c[i].encPubKey[0] <== encPubKey[i][0];
        m2c[i].encPubKey[1] <== encPubKey[i][1];
        m2c[i].voterPubKey[0] <== voterPubKey[i][0];
        m2c[i].voterPubKey[1] <== voterPubKey[i][1];

        stateIdx[i] <== m2c[i].stateIndex;
        nonce[i] <== m2c[i].nonce;
        sigValid[i] <== m2c[i].sigValid;

        // Ciphertext must hash to the signed commitment (real slots only).
        commit[i] = AheCommit(M);
        for (var opt = 0; opt < M; opt++) {
            commit[i].c1[opt][0] <== encC1[i][opt][0];
            commit[i].c1[opt][1] <== encC1[i][opt][1];
            commit[i].c2[opt][0] <== encC2[i][opt][0];
            commit[i].c2[opt][1] <== encC2[i][opt][1];
        }
        (commit[i].commitment - m2c[i].aheCommitment) * isReal[i] === 0;

        // Registration-tree Merkle inclusion: voterPubKey[i] is the registered
        // key for stateIdx[i] under stateRoot (real slots only).
        leafHasher[i] = Hasher5();
        leafHasher[i].in[STATE_LEAF_PUB_X_IDX] <== voterPubKey[i][0];
        leafHasher[i].in[STATE_LEAF_PUB_Y_IDX] <== voterPubKey[i][1];
        leafHasher[i].in[STATE_LEAF_VOICE_CREDIT_BALANCE_IDX] <== voiceCreditBalance[i];
        leafHasher[i].in[STATE_LEAF_VO_ROOT_IDX] <== voteOptionTreeRoot[i];
        leafHasher[i].in[STATE_LEAF_NONCE_IDX] <== slNonce[i];

        wrappedLeaf[i] = HashLeftRight();
        wrappedLeaf[i].left <== leafHasher[i].hash;
        wrappedLeaf[i].right <== DEACTIVATE_CONSTANT;

        safeStateIdx[i] <== stateIdx[i] * isReal[i];
        pathIndices[i] = QuinGeneratePathIndices(stateTreeDepth);
        pathIndices[i].in <== safeStateIdx[i];

        inclusion[i] = QuinTreeInclusionProof(stateTreeDepth);
        inclusion[i].leaf <== wrappedLeaf[i].hash;
        for (var lvl = 0; lvl < stateTreeDepth; lvl++) {
            inclusion[i].path_index[lvl] <== pathIndices[i].out[lvl];
            for (var k = 0; k < LEAVES_PER_PATH_LEVEL; k++) {
                inclusion[i].path_elements[lvl][k] <== pathElements[i][lvl][k];
            }
        }
        (inclusion[i].root - stateRoot) * isReal[i] === 0;
    }

    // ---- 2. Nonce-tree LWW (reverse order, O(B * depth)) ----
    //
    // Process messages from HIGHEST submission index downto LOWEST (newest
    // first), exactly as classic aMACI processes its batches: messages are
    // passed to the contract in reverse submission order so that the latest
    // one occupies the HIGHEST slot and is therefore processed first.
    //
    // The nonce tree rolls forward:
    //   nonceRoots[B] = currentNonceRoot (input from previous batch / initial)
    //   for i = B-1 downto 0:
    //     verify currentNonce[i] in nonceRoots[i+1] at safeStateIdx[i]
    //     survivor[i] = isReal[i] AND sigValid[i] AND (nonce[i] == currentNonce[i]+1)
    //     if survivor[i]: update leaf → nonceRoots[i] = updated root
    //     else:           nonceRoots[i] = nonceRoots[i+1]  (no change)
    //   newNonceRoot = nonceRoots[0]
    //
    // Path indices for the nonce tree are the SAME as for the registration
    // tree (same safeStateIdx, same depth) so we reuse pathIndices[i].out.
    // Path ELEMENTS for the nonce tree are separate: noncePathElements[i]
    // reflect the nonce tree's state at the moment slot i is processed
    // (i.e., AFTER slots B-1..i+1 have already been applied). The coordinator
    // must pre-simulate this reverse order when constructing the witness.

    signal nonceRoots[B + 1];
    nonceRoots[B] <== currentNonceRoot;

    component nonceRead[B];
    component nonceWrite[B];
    component isNonceValidCmp[B];
    signal isNonceValid[B];
    signal sigAndNonce[B];
    signal survivor[B];

    for (var i = B - 1; i >= 0; i--) {
        // Read: verify currentNonce[i] is the leaf at safeStateIdx[i] in
        //       nonceRoots[i+1].  Gated by isReal (padding exempt).
        nonceRead[i] = QuinTreeInclusionProof(stateTreeDepth);
        nonceRead[i].leaf <== currentNonce[i];
        for (var lvl = 0; lvl < stateTreeDepth; lvl++) {
            nonceRead[i].path_index[lvl] <== pathIndices[i].out[lvl];
            for (var k = 0; k < LEAVES_PER_PATH_LEVEL; k++) {
                nonceRead[i].path_elements[lvl][k] <== noncePathElements[i][lvl][k];
            }
        }
        (nonceRead[i].root - nonceRoots[i + 1]) * isReal[i] === 0;

        // Nonce validity: classic MACI rule — cmdNonce must be currentNonce+1.
        isNonceValidCmp[i] = IsEqual();
        isNonceValidCmp[i].in[0] <== nonce[i];
        isNonceValidCmp[i].in[1] <== currentNonce[i] + 1;
        isNonceValid[i] <== isNonceValidCmp[i].out;

        // Survivor: real AND valid signature AND valid nonce.
        sigAndNonce[i] <== sigValid[i] * isNonceValid[i];
        survivor[i] <== isReal[i] * sigAndNonce[i];

        // Write: compute new nonce root with leaf at safeStateIdx[i] = nonce[i].
        //        Use the SAME path (same stateIdx, same depth) as the read.
        nonceWrite[i] = QuinTreeInclusionProof(stateTreeDepth);
        nonceWrite[i].leaf <== nonce[i];
        for (var lvl = 0; lvl < stateTreeDepth; lvl++) {
            nonceWrite[i].path_index[lvl] <== pathIndices[i].out[lvl];
            for (var k = 0; k < LEAVES_PER_PATH_LEVEL; k++) {
                nonceWrite[i].path_elements[lvl][k] <== noncePathElements[i][lvl][k];
            }
        }

        // Conditional update (linear-combination Mux):
        //   nonceRoots[i] = survivor ? nonceWrite.root : nonceRoots[i+1]
        nonceRoots[i] <== nonceRoots[i + 1] + survivor[i] * (nonceWrite[i].root - nonceRoots[i + 1]);
    }

    newNonceRoot <== nonceRoots[0];

    // ---- 3. Homomorphic aggregation of surviving ballots ----
    component condC1[M][B];
    component condC2[M][B];
    signal aggC1Acc[M][B + 1][2];
    signal aggC2Acc[M][B + 1][2];

    for (var opt = 0; opt < M; opt++) {
        aggC1Acc[opt][0][0] <== 0;
        aggC1Acc[opt][0][1] <== 1;
        aggC2Acc[opt][0][0] <== 0;
        aggC2Acc[opt][0][1] <== 1;

        for (var i = 0; i < B; i++) {
            condC1[opt][i] = CondPointAdd();
            condC1[opt][i].acc[0] <== aggC1Acc[opt][i][0];
            condC1[opt][i].acc[1] <== aggC1Acc[opt][i][1];
            condC1[opt][i].p[0] <== encC1[i][opt][0];
            condC1[opt][i].p[1] <== encC1[i][opt][1];
            condC1[opt][i].sel <== survivor[i];
            aggC1Acc[opt][i + 1][0] <== condC1[opt][i].out[0];
            aggC1Acc[opt][i + 1][1] <== condC1[opt][i].out[1];

            condC2[opt][i] = CondPointAdd();
            condC2[opt][i].acc[0] <== aggC2Acc[opt][i][0];
            condC2[opt][i].acc[1] <== aggC2Acc[opt][i][1];
            condC2[opt][i].p[0] <== encC2[i][opt][0];
            condC2[opt][i].p[1] <== encC2[i][opt][1];
            condC2[opt][i].sel <== survivor[i];
            aggC2Acc[opt][i + 1][0] <== condC2[opt][i].out[0];
            aggC2Acc[opt][i + 1][1] <== condC2[opt][i].out[1];
        }

        aggC1[opt][0] <== aggC1Acc[opt][B][0];
        aggC1[opt][1] <== aggC1Acc[opt][B][1];
        aggC2[opt][0] <== aggC2Acc[opt][B][0];
        aggC2[opt][1] <== aggC2Acc[opt][B][1];
    }
}

/**
 * On-chain wrapper for ProcessHybridMessages.
 *
 * Closes the gap between what the inner circuit proves and what was published
 * on-chain, using the same two binding techniques as classic cw-amaci:
 *
 *   1. Message hash-chain binding: `batchStartHash` / `batchEndHash` pin this
 *      proof to exactly the messages published between those two chain positions.
 *   2. Coordinator key binding: prove knowledge of `coordPrivKey` matching
 *      `coordPubKey`.
 *
 * In addition, the nonce-tree root is carried across batches:
 *   `currentNonceRoot` → (proven evolution) → `newNonceRoot` (= p.newNonceRoot)
 * so each batch call picks up where the previous one's nonce state left off.
 *
 * Public values bound into inputHash (SHA256, mod BN254 scalar field), in order:
 *   [ coordPubKey.x, coordPubKey.y, batchStartHash, batchEndHash,
 *     currentAggCommitment, newAggCommitment, pollId, stateRoot, actualCount,
 *     currentNonceRoot, newNonceRoot ]
 */
template ProcessHybridMessagesOnchain(stateTreeDepth, voteOptionTreeDepth, batchSize) {
    var TREE_ARITY = 5;
    var B = batchSize;
    var M = 1;
    for (var d = 0; d < voteOptionTreeDepth; d++) { M *= TREE_ARITY; }
    var LEAVES_PER_PATH_LEVEL = TREE_ARITY - 1;

    // Private witnesses (all inputs the inner circuit needs).
    signal input coordPrivKey;
    signal input message[B][10];
    signal input encPubKey[B][2];
    signal input voterPubKey[B][2];
    signal input voiceCreditBalance[B];
    signal input voteOptionTreeRoot[B];
    signal input slNonce[B];
    signal input pathElements[B][stateTreeDepth][LEAVES_PER_PATH_LEVEL];
    signal input encC1[B][M][2];
    signal input encC2[B][M][2];
    // Nonce-tree private witnesses.
    signal input noncePathElements[B][stateTreeDepth][LEAVES_PER_PATH_LEVEL];
    signal input currentNonce[B];

    // Public values (all folded into inputHash below).
    signal input coordPubKey[2];
    signal input batchStartHash;
    signal input currentAggC1[M][2];
    signal input currentAggC2[M][2];
    signal input pollId;
    signal input stateRoot;
    signal input actualCount;
    signal input currentNonceRoot;

    // Single public signal.
    signal output inputHash;

    // 1. Prove knowledge of coordPrivKey matching the publicly-bound coordPubKey.
    component derivedPubKey = PrivToPubKey();
    derivedPubKey.privKey <== coordPrivKey;
    derivedPubKey.pubKey[0] === coordPubKey[0];
    derivedPubKey.pubKey[1] === coordPubKey[1];

    // 2. Run LWW + homomorphic aggregation (also computes isReal[i] and newNonceRoot).
    component p = ProcessHybridMessages(stateTreeDepth, voteOptionTreeDepth, batchSize);
    p.coordPrivKey <== coordPrivKey;
    p.stateRoot <== stateRoot;
    p.actualCount <== actualCount;
    p.currentNonceRoot <== currentNonceRoot;
    for (var i = 0; i < B; i++) {
        for (var k = 0; k < 10; k++) {
            p.message[i][k] <== message[i][k];
        }
        p.encPubKey[i][0] <== encPubKey[i][0];
        p.encPubKey[i][1] <== encPubKey[i][1];
        p.voterPubKey[i][0] <== voterPubKey[i][0];
        p.voterPubKey[i][1] <== voterPubKey[i][1];
        p.voiceCreditBalance[i] <== voiceCreditBalance[i];
        p.voteOptionTreeRoot[i] <== voteOptionTreeRoot[i];
        p.slNonce[i] <== slNonce[i];
        p.currentNonce[i] <== currentNonce[i];
        for (var lvl = 0; lvl < stateTreeDepth; lvl++) {
            for (var k = 0; k < LEAVES_PER_PATH_LEVEL; k++) {
                p.pathElements[i][lvl][k] <== pathElements[i][lvl][k];
                p.noncePathElements[i][lvl][k] <== noncePathElements[i][lvl][k];
            }
        }
        for (var opt = 0; opt < M; opt++) {
            p.encC1[i][opt][0] <== encC1[i][opt][0];
            p.encC1[i][opt][1] <== encC1[i][opt][1];
            p.encC2[i][opt][0] <== encC2[i][opt][0];
            p.encC2[i][opt][1] <== encC2[i][opt][1];
        }
    }

    // 3. Re-derive the message hash chain (real slots only advance the chain).
    component msgHasher[B];
    signal chainHash[B + 1];
    chainHash[0] <== batchStartHash;
    for (var i = 0; i < B; i++) {
        msgHasher[i] = MessageHasher();
        for (var k = 0; k < 10; k++) {
            msgHasher[i].in[k] <== message[i][k];
        }
        msgHasher[i].encPubKey[0] <== encPubKey[i][0];
        msgHasher[i].encPubKey[1] <== encPubKey[i][1];
        msgHasher[i].prevHash <== chainHash[i];
        chainHash[i + 1] <== chainHash[i] + p.isReal[i] * (msgHasher[i].hash - chainHash[i]);
    }
    signal batchEndHash;
    batchEndHash <== chainHash[B];

    // 4. Homomorphically accumulate prior batches' aggregate with this batch's
    //    survivors (same BabyAdd-based approach as before).
    component newAggAdd1[M];
    component newAggAdd2[M];
    signal newAggC1[M][2];
    signal newAggC2[M][2];
    for (var opt = 0; opt < M; opt++) {
        newAggAdd1[opt] = BabyAdd();
        newAggAdd1[opt].x1 <== currentAggC1[opt][0];
        newAggAdd1[opt].y1 <== currentAggC1[opt][1];
        newAggAdd1[opt].x2 <== p.aggC1[opt][0];
        newAggAdd1[opt].y2 <== p.aggC1[opt][1];
        newAggC1[opt][0] <== newAggAdd1[opt].xout;
        newAggC1[opt][1] <== newAggAdd1[opt].yout;

        newAggAdd2[opt] = BabyAdd();
        newAggAdd2[opt].x1 <== currentAggC2[opt][0];
        newAggAdd2[opt].y1 <== currentAggC2[opt][1];
        newAggAdd2[opt].x2 <== p.aggC2[opt][0];
        newAggAdd2[opt].y2 <== p.aggC2[opt][1];
        newAggC2[opt][0] <== newAggAdd2[opt].xout;
        newAggC2[opt][1] <== newAggAdd2[opt].yout;
    }

    // 5. Fold running and new aggregate into single Poseidon commitments.
    component curCommit = AheCommit(M);
    component newCommit = AheCommit(M);
    for (var opt = 0; opt < M; opt++) {
        curCommit.c1[opt][0] <== currentAggC1[opt][0];
        curCommit.c1[opt][1] <== currentAggC1[opt][1];
        curCommit.c2[opt][0] <== currentAggC2[opt][0];
        curCommit.c2[opt][1] <== currentAggC2[opt][1];

        newCommit.c1[opt][0] <== newAggC1[opt][0];
        newCommit.c1[opt][1] <== newAggC1[opt][1];
        newCommit.c2[opt][0] <== newAggC2[opt][0];
        newCommit.c2[opt][1] <== newAggC2[opt][1];
    }
    signal currentAggCommitment;
    signal newAggCommitment;
    currentAggCommitment <== curCommit.commitment;
    newAggCommitment <== newCommit.commitment;

    // 6. Fold every public value into one SHA256 inputHash (11 fields).
    //    Order matches what the contract's compute_input_hash must reproduce.
    component ih = Sha256Hasher(11);
    ih.in[0] <== coordPubKey[0];
    ih.in[1] <== coordPubKey[1];
    ih.in[2] <== batchStartHash;
    ih.in[3] <== batchEndHash;
    ih.in[4] <== currentAggCommitment;
    ih.in[5] <== newAggCommitment;
    ih.in[6] <== pollId;
    ih.in[7] <== stateRoot;
    ih.in[8] <== actualCount;
    ih.in[9] <== currentNonceRoot;
    ih.in[10] <== p.newNonceRoot;
    inputHash <== ih.hash;
}
