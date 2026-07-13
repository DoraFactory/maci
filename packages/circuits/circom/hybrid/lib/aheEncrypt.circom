pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/babyjub.circom";
include "../../../node_modules/circomlib/circuits/bitify.circom";
include "../../../node_modules/circomlib/circuits/escalarmulany.circom";

/**
 * Additively-homomorphic (exponential) ElGamal encryption on BabyJubjub.
 *
 * A weight `v` is encoded as the point `v*G`, which makes the scheme additively
 * homomorphic: Enc(a) + Enc(b) = Enc(a+b). The committee public key `Kc` is the
 * joint threshold key; only the committee (t-of-n) can decrypt the aggregate.
 *
 *   c1 = r*G
 *   c2 = v*G + r*Kc
 *
 * G is the BabyJubjub Base8 generator (same as circomlib BabyPbk uses).
 */
template AheEncrypt() {
    signal input v;        // plaintext weight
    signal input r;        // encryption randomness (scalar)
    signal input Kc[2];    // committee joint public key

    signal output c1[2];
    signal output c2[2];

    // c1 = r*G
    component rG = BabyPbk();
    rG.in <== r;
    c1[0] <== rG.Ax;
    c1[1] <== rG.Ay;

    // vG = v*G
    component vG = BabyPbk();
    vG.in <== v;

    // rKc = r*Kc
    component rBits = Num2Bits(253);
    rBits.in <== r;
    component rKc = EscalarMulAny(253);
    rKc.p[0] <== Kc[0];
    rKc.p[1] <== Kc[1];
    for (var i = 0; i < 253; i++) {
        rKc.e[i] <== rBits.out[i];
    }

    // c2 = vG + rKc
    component add = BabyAdd();
    add.x1 <== vG.Ax;
    add.y1 <== vG.Ay;
    add.x2 <== rKc.out[0];
    add.y2 <== rKc.out[1];
    c2[0] <== add.xout;
    c2[1] <== add.yout;
}
