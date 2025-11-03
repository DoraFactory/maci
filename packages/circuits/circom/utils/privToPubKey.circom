pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/bitify.circom";
include "../../node_modules/circomlib/circuits/escalarmulfix.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";

/**
 * Converts a private key to a public key on the BabyJubJub curve.
 * The input private key needs to be hashed and then pruned before supplying it to the circuit.
 * 
 * Security: This circuit validates that the private key is within the valid range [0, SUBGROUP_ORDER)
 * to prevent public key collisions.
 */
template PrivToPubKey() {
    // The base point of the BabyJubJub curve
    var BASE8[2] = [
        5299619240641551281634865583518297030282874472190772894086521144482721001553,
        16950150798460657717958625567821834550301663161624707787222815936182638968203
    ];

    // The prime subgroup order of BabyJubJub
    var SUBGROUP_ORDER = 2736030358979909402780800718157159386076813972158567259200215660948447373041;

    signal input privKey;
    signal output pubKey[2];

    // Verify that private key is within valid range: privKey < SUBGROUP_ORDER
    // This prevents multiple private keys from mapping to the same public key
    component isLessThan = LessThan(251);
    isLessThan.in[0] <== privKey;
    isLessThan.in[1] <== SUBGROUP_ORDER;
    isLessThan.out === 1;

    // Convert private key to bits
    component privBits = Num2Bits(253);
    privBits.in <== privKey;

    // Perform scalar multiplication with base point
    component mulFix = EscalarMulFix(253, BASE8);
    for (var i = 0; i < 253; i++) {
        mulFix.e[i] <== privBits.out[i];
    }

    pubKey[0] <== mulFix.out[0];
    pubKey[1] <== mulFix.out[1];
}
