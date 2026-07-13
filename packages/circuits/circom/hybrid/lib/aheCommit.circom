pragma circom 2.0.0;

include "../../utils/hasherPoseidon.circom";

/**
 * Commit to a vote's AHE ciphertext vector so the voter's signature can bind to
 * it and the coordinator can check the published ciphertext matches the signed
 * command WITHOUT ever decrypting the vote content.
 *
 * Flatten order (must match the SDK's TS implementation exactly):
 *   for opt in 0..M: c1[opt].x, c1[opt].y, c2[opt].x, c2[opt].y
 *
 * Folded 2-to-1 with Poseidon (HashLeftRight):
 *   acc_0 = 0 ; acc_{k+1} = Poseidon(acc_k, elem_k) ; commitment = acc_N
 */
template AheCommit(M) {
    signal input c1[M][2];
    signal input c2[M][2];
    signal output commitment;

    var N = 4 * M;

    // Flatten in the canonical order.
    signal flat[N];
    for (var opt = 0; opt < M; opt++) {
        flat[opt * 4 + 0] <== c1[opt][0];
        flat[opt * 4 + 1] <== c1[opt][1];
        flat[opt * 4 + 2] <== c2[opt][0];
        flat[opt * 4 + 3] <== c2[opt][1];
    }

    component h[N];
    signal acc[N + 1];
    acc[0] <== 0;
    for (var i = 0; i < N; i++) {
        h[i] = HashLeftRight();
        h[i].left <== acc[i];
        h[i].right <== flat[i];
        acc[i + 1] <== h[i].hash;
    }

    commitment <== acc[N];
}
