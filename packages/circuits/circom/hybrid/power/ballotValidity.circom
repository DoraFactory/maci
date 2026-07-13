pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/comparators.circom";
include "../../../node_modules/circomlib/circuits/bitify.circom";
include "../../utils/hasherPoseidon.circom";
include "../../utils/hasherSha256.circom";
include "../../utils/trees/incrementalQuinTree.circom";
include "../../utils/ecdh.circom";
include "../../utils/privToPubKey.circom";
include "../../utils/unpackElement.circom";
include "../../utils/lib/poseidonDecrypt.circom";
include "../../utils/messageHasher.circom";
include "../lib/aheEncrypt.circom";
include "../lib/aheCommit.circom";

/**
 * Client-side ballot validity proof.
 *
 * The voter proves, WITHOUT revealing the vote, that the published AHE
 * ciphertext vector:
 *   0. the voice-credit budget comes from the voter's REAL state leaf, proven
 *      via a quinary state-tree Merkle inclusion against the public stateRoot
 *      (so the voter cannot forge their voiceCreditBalance),
 *   1. correctly encrypts the private weight vector to the committee key Kc,
 *   2. is one-hot (weight placed on exactly one option),
 *   3. stays within that authenticated budget (quadratic cost: sum of squares),
 *   4. hashes to the aheCommitment that the voter signs in the routing envelope,
 *   5. is bound to the SAME routing envelope that will be published alongside
 *      it: `stateIdx`/`aheCommitment` are re-derived by decrypting `routing`
 *      in-circuit and asserted equal to this proof's own values, AND
 *      `routingEncPubKey` (the ephemeral pubkey actually published on-chain)
 *      is proven to be `ephemeralPrivKey * G` -- otherwise a prover could
 *      satisfy the in-circuit ECDH decryption with one ephemeral key while
 *      publishing a DIFFERENT `routingEncPubKey` on-chain, so the
 *      coordinator's real ECDH (using its own `coordPrivKey` and the
 *      published `routingEncPubKey`) would derive a different shared key
 *      than the one this proof reasoned about, decrypting to garbage.
 *
 * The state leaf mirrors MACI's classic layout:
 *   [pubKey.x, pubKey.y, voiceCreditBalance, voteOptionTreeRoot, nonce]
 * hashed with Hasher5 (Poseidon T6), then wrapped as
 * hash2([hash5(leaf), DEACTIVATE_CONSTANT]) exactly like cw-amaci's
 * `StateLeaf::hash_decativate_state_leaf` (used unconditionally by the contract's
 * SignUp handler), and included in a quinary (arity-5) tree exactly like
 * ProcessMessages. This lets the Merkle inclusion proof authenticate against a REAL
 * on-chain state root built from real SignUp transactions, not just a locally
 * simulated one.
 *
 * Anonymity: `stateIdx`/`pubKey` are PRIVATE witnesses (not public signals) —
 * the contract never learns which registered voter this ballot belongs to.
 * Instead the circuit outputs a `nullifier = Hasher4(stateIdx, pubKey, pollId)`,
 * an unlinkable-per-round identifier that carries no information about the
 * real state index. Binding to the actual routing envelope (rather than trusting
 * the SDK to keep stateIdx consistent between the two messages) is done
 * in-circuit: the voter re-derives the ECDH shared key from the SAME ephemeral
 * private key used to Poseidon-encrypt `routing` to the coordinator, decrypts
 * it, and asserts the embedded stateIdx/aheCommitment match this proof's own
 * stateIdx/aheCommitment. Without this, a malicious prover could authenticate
 * one (stateIdx, pubKey) leaf here while the published routing envelope
 * actually points at a different voter's state index.
 *
 * Public signals: Kc, stateRoot, coordPubKey, pollId. Public outputs: the
 * ciphertext (c1/c2), aheCommitment, nullifier, routingCommitment. Private
 * signals: voteWeights, r, the state-leaf fields, the Merkle path, stateIdx,
 * pubKey, ephemeralPrivKey, routing and its ephemeral pubkey.
 *
 * WEIGHT_BITS bounds each weight so squares stay small enough for the tally's
 * baby-step-giant-step discrete-log recovery.
 *
 * Options follow MACI's vote-option-tree convention: the number of options is
 * derived from a quinary (arity-5) tree depth, M = 5^voteOptionTreeDepth, so
 * this matches ProcessMessages/TallyVotes parameterisation (e.g. depth 1 -> 5).
 */
template BallotValidity(stateTreeDepth, voteOptionTreeDepth) {
    var TREE_ARITY = 5;
    var M = 1;
    for (var d = 0; d < voteOptionTreeDepth; d++) { M *= TREE_ARITY; }

    var WEIGHT_BITS = 16; // max weight 65535
    var ROUTING_LENGTH = 10;

    var LEAVES_PER_PATH_LEVEL = TREE_ARITY - 1;
    var STATE_LEAF_PUB_X_IDX = 0;
    var STATE_LEAF_PUB_Y_IDX = 1;
    var STATE_LEAF_VOICE_CREDIT_BALANCE_IDX = 2;
    var STATE_LEAF_VO_ROOT_IDX = 3;
    var STATE_LEAF_NONCE_IDX = 4;

    // Private
    signal input voteWeights[M];
    signal input r[M];
    // State-leaf witness (authenticated below via Merkle inclusion).
    signal input voiceCreditBalance;
    signal input voteOptionTreeRoot;
    signal input slNonce;
    signal input pathElements[stateTreeDepth][LEAVES_PER_PATH_LEVEL];
    // Voter identity — private (see anonymity note above); still used for leaf
    // reconstruction/Merkle inclusion and folded into `nullifier` below.
    signal input stateIdx;
    signal input pubKey[2];
    // Routing-binding witnesses: the ephemeral private key the voter used to
    // Poseidon-encrypt `routing` to the coordinator, the routing ciphertext
    // itself, and its (public) ephemeral key — all needed to re-derive the
    // ECDH shared key and decrypt `routing` in-circuit.
    signal input ephemeralPrivKey;
    signal input routing[ROUTING_LENGTH];
    signal input routingEncPubKey[2];

    // Public
    signal input Kc[2];
    signal input stateRoot;
    signal input coordPubKey[2];
    signal input pollId;

    // Public outputs (the published ballot)
    signal output c1[M][2];
    signal output c2[M][2];
    signal output aheCommitment;
    signal output nullifier;
    signal output routingCommitment;

    // 0. Authenticate voiceCreditBalance: rebuild the state leaf from the
    //    private pubKey/stateIdx and private balance/voRoot/nonce, then prove
    //    it is the leaf at stateIdx under stateRoot. A forged balance (or
    //    wrong pubKey) breaks Merkle inclusion.
    component leafHasher = Hasher5();
    leafHasher.in[STATE_LEAF_PUB_X_IDX] <== pubKey[0];
    leafHasher.in[STATE_LEAF_PUB_Y_IDX] <== pubKey[1];
    leafHasher.in[STATE_LEAF_VOICE_CREDIT_BALANCE_IDX] <== voiceCreditBalance;
    leafHasher.in[STATE_LEAF_VO_ROOT_IDX] <== voteOptionTreeRoot;
    leafHasher.in[STATE_LEAF_NONCE_IDX] <== slNonce;

    // cw-amaci's `StateLeaf::hash_decativate_state_leaf` (called unconditionally by
    // `execute_sign_up`, regardless of whether the deactivate feature is enabled) does
    // NOT commit the raw Hasher5 leaf hash directly — it wraps it as
    // hash2([hash5(leaf), DEACTIVATE_CONSTANT]), where DEACTIVATE_CONSTANT =
    // hash5([0,0,0,0,0]) (a nothing-up-my-sleeve constant, see
    // packages/circuits/docs/StateLeaf-Update-Rules.md). To authenticate a Merkle
    // inclusion proof against a REAL on-chain state root, we must reproduce that exact
    // wrap; otherwise every real signed-up leaf would fail inclusion here.
    var DEACTIVATE_CONSTANT = 14655542659562014735865511769057053982292279840403315552050801315682099828156;
    component wrappedLeaf = HashLeftRight();
    wrappedLeaf.left <== leafHasher.hash;
    wrappedLeaf.right <== DEACTIVATE_CONSTANT;

    component pathIndices = QuinGeneratePathIndices(stateTreeDepth);
    pathIndices.in <== stateIdx;

    component inclusion = QuinTreeInclusionProof(stateTreeDepth);
    inclusion.leaf <== wrappedLeaf.hash;
    for (var lvl = 0; lvl < stateTreeDepth; lvl++) {
        inclusion.path_index[lvl] <== pathIndices.out[lvl];
        for (var k = 0; k < LEAVES_PER_PATH_LEVEL; k++) {
            inclusion.path_elements[lvl][k] <== pathElements[lvl][k];
        }
    }
    inclusion.root === stateRoot;

    // The budget now derives from the authenticated leaf, not a free input.
    signal voiceCredits;
    voiceCredits <== voiceCreditBalance;

    // 1. Encrypt each option's weight.
    component enc[M];
    for (var opt = 0; opt < M; opt++) {
        enc[opt] = AheEncrypt();
        enc[opt].v <== voteWeights[opt];
        enc[opt].r <== r[opt];
        enc[opt].Kc[0] <== Kc[0];
        enc[opt].Kc[1] <== Kc[1];
        c1[opt][0] <== enc[opt].c1[0];
        c1[opt][1] <== enc[opt].c1[1];
        c2[opt][0] <== enc[opt].c2[0];
        c2[opt][1] <== enc[opt].c2[1];
    }

    // 2. Range-check every weight (< 2^WEIGHT_BITS) and one-hot constraint.
    component rangeCheck[M];
    component isZero[M];
    signal nz[M];
    signal nzAcc[M + 1];
    nzAcc[0] <== 0;
    for (var opt = 0; opt < M; opt++) {
        rangeCheck[opt] = Num2Bits(WEIGHT_BITS);
        rangeCheck[opt].in <== voteWeights[opt];

        isZero[opt] = IsZero();
        isZero[opt].in <== voteWeights[opt];
        nz[opt] <== 1 - isZero[opt].out;
        nzAcc[opt + 1] <== nzAcc[opt] + nz[opt];
    }
    // Exactly one option carries a non-zero weight.
    nzAcc[M] === 1;

    // 3. Budget: sum of squares <= voiceCredits (quadratic voting cost).
    signal sq[M];
    signal sqAcc[M + 1];
    sqAcc[0] <== 0;
    for (var opt = 0; opt < M; opt++) {
        sq[opt] <== voteWeights[opt] * voteWeights[opt];
        sqAcc[opt + 1] <== sqAcc[opt] + sq[opt];
    }
    component budget = LessEqThan(64);
    budget.in[0] <== sqAcc[M];
    budget.in[1] <== voiceCredits;
    budget.out === 1;

    // 4. Commitment binding.
    component commit = AheCommit(M);
    for (var opt = 0; opt < M; opt++) {
        commit.c1[opt][0] <== c1[opt][0];
        commit.c1[opt][1] <== c1[opt][1];
        commit.c2[opt][0] <== c2[opt][0];
        commit.c2[opt][1] <== c2[opt][1];
    }
    aheCommitment <== commit.commitment;

    // 5. Routing binding: decrypt `routing` with the ECDH shared key derived
    //    from `ephemeralPrivKey`/`coordPubKey` (the SAME shared key the voter
    //    used to encrypt it — ECDH is symmetric: privKey_A * pubKey_B ==
    //    privKey_B * pubKey_A), then assert its embedded stateIdx/pollId/
    //    aheCommitment match this proof's own values. This is what makes the
    //    nullifier below actually correspond to whoever published `routing`,
    //    instead of relying on SDK convention alone.
    // 5a. Prove `routingEncPubKey` (the ephemeral pubkey the contract will
    //     see on-chain) is ACTUALLY `ephemeralPrivKey * G`, not just some
    //     unrelated point the prover chose. Without this, the ECDH
    //     decryption below only proves self-consistency against whatever
    //     ephemeralPrivKey the prover picked -- it says nothing about the
    //     ephemeral key that ends up published, which is what the
    //     coordinator's own ECDH (coordPrivKey * routingEncPubKey) actually
    //     uses to decrypt `routing` on-chain.
    component ephPub = PrivToPubKey();
    ephPub.privKey <== ephemeralPrivKey;
    ephPub.pubKey[0] === routingEncPubKey[0];
    ephPub.pubKey[1] === routingEncPubKey[1];

    component routingEcdh = Ecdh();
    routingEcdh.privKey <== ephemeralPrivKey;
    routingEcdh.pubKey[0] <== coordPubKey[0];
    routingEcdh.pubKey[1] <== coordPubKey[1];

    component routingDecryptor = PoseidonDecryptWithoutCheck(7);
    routingDecryptor.key[0] <== routingEcdh.sharedKey[0];
    routingDecryptor.key[1] <== routingEcdh.sharedKey[1];
    routingDecryptor.nonce <== 0;
    for (var i = 0; i < ROUTING_LENGTH; i++) {
        routingDecryptor.ciphertext[i] <== routing[i];
    }

    // UnpackElement(3) on decrypted[0] mirrors hybridMessageToCommand.circom:
    // out[0] = pollId, out[1] = stateIdx, out[2] = nonce.
    component routingUnpack = UnpackElement(3);
    routingUnpack.in <== routingDecryptor.decrypted[0];
    routingUnpack.out[0] === pollId;
    routingUnpack.out[1] === stateIdx;
    // decrypted[3] is the aheCommitment the voter signed into the routing
    // envelope; it must be the SAME commitment as the ciphertext published
    // alongside it (computed above from c1/c2).
    routingDecryptor.decrypted[3] === aheCommitment;

    // 6. Nullifier: replaces the plaintext stateIdx/pubKey public signals with
    //    an unlinkable-per-round identifier, so the contract (and any on-chain
    //    observer) can no longer tell WHICH signed-up voter this ballot
    //    belongs to. Salted with pollId so nullifiers don't correlate across
    //    rounds.
    component nullifierHasher = Hasher4();
    nullifierHasher.in[0] <== stateIdx;
    nullifierHasher.in[1] <== pubKey[0];
    nullifierHasher.in[2] <== pubKey[1];
    nullifierHasher.in[3] <== pollId;
    nullifier <== nullifierHasher.hash;

    // 7. Fold the routing ciphertext + its ephemeral pubkey into ONE
    //    commitment, reusing the SAME Hasher13 algorithm (with prevHash = 0)
    //    as cw-amaci's `hash_message_and_enc_pub_key`. The contract already
    //    receives `routing`/`enc_pub_key` directly in `PublishHybridMessage`,
    //    so it can recompute this cheaply instead of re-hashing 10 raw field
    //    elements through SHA256 again in BallotValidityOnchain.
    component routingHasher = MessageHasher();
    for (var i = 0; i < ROUTING_LENGTH; i++) {
        routingHasher.in[i] <== routing[i];
    }
    routingHasher.encPubKey[0] <== routingEncPubKey[0];
    routingHasher.encPubKey[1] <== routingEncPubKey[1];
    routingHasher.prevHash <== 0;
    routingCommitment <== routingHasher.hash;
}

/**
 * On-chain ballotValidity: identical constraints to BallotValidity, but wrapped
 * so the ENTIRE public interface is a single SHA256 `inputHash` — matching the
 * cw-amaci Groth16 verifier, whose stored verifying key only supports one public
 * input (ic0/ic1) and whose `compute_input_hash` packs all public values with
 * SHA256 (mod the BN254 scalar field).
 *
 * The bound public values, in the SAME order the contract must repack, are:
 *   [ Kc.x, Kc.y, stateRoot, coordPubKey.x, coordPubKey.y, pollId,
 *     routingCommitment, aheCommitment, nullifier ]
 *
 * `stateIdx`/`pubKey` are NOT part of this list any more (see the anonymity
 * note on `BallotValidity` above) — the contract only ever learns `nullifier`.
 * The AHE ciphertext vector (c1/c2) is likewise not exposed: it travels in the
 * routing message and is bound here by `aheCommitment` (AheCommit over c1/c2),
 * so a contract that reconstructs inputHash from the message's committed
 * values can verify the proof with a single public input.
 */
template BallotValidityOnchain(stateTreeDepth, voteOptionTreeDepth) {
    var TREE_ARITY = 5;
    var M = 1;
    for (var d = 0; d < voteOptionTreeDepth; d++) { M *= TREE_ARITY; }
    var LEAVES_PER_PATH_LEVEL = TREE_ARITY - 1;
    var ROUTING_LENGTH = 10;

    // Private witness (everything the client circuit needs).
    signal input voteWeights[M];
    signal input r[M];
    signal input voiceCreditBalance;
    signal input voteOptionTreeRoot;
    signal input slNonce;
    signal input pathElements[stateTreeDepth][LEAVES_PER_PATH_LEVEL];
    signal input stateIdx;
    signal input pubKey[2];
    signal input ephemeralPrivKey;
    signal input routing[ROUTING_LENGTH];
    signal input routingEncPubKey[2];
    signal input Kc[2];
    signal input stateRoot;
    signal input coordPubKey[2];
    signal input pollId;

    // Single public signal.
    signal output inputHash;

    // Reuse the full client-side validity circuit (Merkle-authenticated budget,
    // one-hot, encryption, commitment, routing binding, nullifier). Its
    // aheCommitment/nullifier/routingCommitment are outputs.
    component bv = BallotValidity(stateTreeDepth, voteOptionTreeDepth);
    for (var opt = 0; opt < M; opt++) {
        bv.voteWeights[opt] <== voteWeights[opt];
        bv.r[opt] <== r[opt];
    }
    bv.voiceCreditBalance <== voiceCreditBalance;
    bv.voteOptionTreeRoot <== voteOptionTreeRoot;
    bv.slNonce <== slNonce;
    for (var lvl = 0; lvl < stateTreeDepth; lvl++) {
        for (var k = 0; k < LEAVES_PER_PATH_LEVEL; k++) {
            bv.pathElements[lvl][k] <== pathElements[lvl][k];
        }
    }
    bv.stateIdx <== stateIdx;
    bv.pubKey[0] <== pubKey[0];
    bv.pubKey[1] <== pubKey[1];
    bv.ephemeralPrivKey <== ephemeralPrivKey;
    for (var i = 0; i < ROUTING_LENGTH; i++) {
        bv.routing[i] <== routing[i];
    }
    bv.routingEncPubKey[0] <== routingEncPubKey[0];
    bv.routingEncPubKey[1] <== routingEncPubKey[1];
    bv.Kc[0] <== Kc[0];
    bv.Kc[1] <== Kc[1];
    bv.stateRoot <== stateRoot;
    bv.coordPubKey[0] <== coordPubKey[0];
    bv.coordPubKey[1] <== coordPubKey[1];
    bv.pollId <== pollId;

    // Fold all public values into one SHA256 input hash.
    component ih = Sha256Hasher(9);
    ih.in[0] <== Kc[0];
    ih.in[1] <== Kc[1];
    ih.in[2] <== stateRoot;
    ih.in[3] <== coordPubKey[0];
    ih.in[4] <== coordPubKey[1];
    ih.in[5] <== pollId;
    ih.in[6] <== bv.routingCommitment;
    ih.in[7] <== bv.aheCommitment;
    ih.in[8] <== bv.nullifier;
    inputHash <== ih.hash;
}
