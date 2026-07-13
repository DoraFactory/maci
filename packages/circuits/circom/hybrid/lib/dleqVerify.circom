pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/babyjub.circom";
include "../../../node_modules/circomlib/circuits/bitify.circom";
include "../../../node_modules/circomlib/circuits/escalarmulany.circom";
include "../../utils/hasherPoseidon.circom";

/**
 * Chaum-Pedersen DLEQ verifier: checks that a committee member's partial
 * decryption share Y = x*H was produced with the SAME secret x as their
 * registered public key X = x*G, without learning x. This is the exact
 * proof structure `mpc-coordinator-demo/src/crypto/dleq.ts` already generates
 * for every partial decryption (see `proveDleq`/`verifyDleq`); this template
 * moves that (previously off-chain-only) verification into a circuit so
 * `RevealHybridTally` can be checked on-chain instead of trusted blindly.
 *
 * G is the fixed BabyJubjub Base8 generator (same constant `BabyPbk` uses).
 * The Fiat-Shamir challenge folds the full public transcript with this
 * project's canonical 12-ary Poseidon hasher (`Hasher12`, mirrored by the SDK's
 * `hash12` — see `maci/packages/sdk/src/libs/crypto/hashing.ts`):
 *
 *   e = hash12([G, H, X, Y, a, b])
 *   check1: z*G == a + e*X
 *   check2: z*H == b + e*Y
 *
 * `z` is produced off-circuit as `w + e*x mod L` (L = BabyJubjub subgroup
 * order), so it always fits in 253 bits like every other raw scalar in this
 * circuit family. `e` is a raw Poseidon output and is NOT reduced mod L
 * before use — group exponentiation by any integer scalar s already equals
 * exponentiation by (s mod ord(point)), so no explicit mod-L reduction is
 * needed; e only needs enough bits (254) to cover the full SNARK field so
 * Num2Bits never fails on a hash output larger than 2^253.
 */
template DleqVerify() {
    signal input H[2];
    signal input X[2];
    signal input Y[2];
    signal input a[2];
    signal input b[2];
    signal input z;

    var G[2] = [
        5299619240641551281634865583518297030282874472190772894086521144482721001553,
        16950150798460657717958625567821834550301663161624707787222815936182638968203
    ];

    component challenge = Hasher12();
    challenge.in[0] <== G[0];
    challenge.in[1] <== G[1];
    challenge.in[2] <== H[0];
    challenge.in[3] <== H[1];
    challenge.in[4] <== X[0];
    challenge.in[5] <== X[1];
    challenge.in[6] <== Y[0];
    challenge.in[7] <== Y[1];
    challenge.in[8] <== a[0];
    challenge.in[9] <== a[1];
    challenge.in[10] <== b[0];
    challenge.in[11] <== b[1];

    component zBits = Num2Bits(253);
    zBits.in <== z;
    component eBits = Num2Bits(254);
    eBits.in <== challenge.hash;

    // check1: z*G == a + e*X
    component zG = BabyPbk();
    zG.in <== z;

    component eX = EscalarMulAny(254);
    eX.p[0] <== X[0];
    eX.p[1] <== X[1];
    for (var i = 0; i < 254; i++) { eX.e[i] <== eBits.out[i]; }

    component rhs1 = BabyAdd();
    rhs1.x1 <== a[0];
    rhs1.y1 <== a[1];
    rhs1.x2 <== eX.out[0];
    rhs1.y2 <== eX.out[1];

    zG.Ax === rhs1.xout;
    zG.Ay === rhs1.yout;

    // check2: z*H == b + e*Y
    component zH = EscalarMulAny(253);
    zH.p[0] <== H[0];
    zH.p[1] <== H[1];
    for (var i = 0; i < 253; i++) { zH.e[i] <== zBits.out[i]; }

    component eY = EscalarMulAny(254);
    eY.p[0] <== Y[0];
    eY.p[1] <== Y[1];
    for (var i = 0; i < 254; i++) { eY.e[i] <== eBits.out[i]; }

    component rhs2 = BabyAdd();
    rhs2.x1 <== b[0];
    rhs2.y1 <== b[1];
    rhs2.x2 <== eY.out[0];
    rhs2.y2 <== eY.out[1];

    zH.out[0] === rhs2.xout;
    zH.out[1] === rhs2.yout;
}
