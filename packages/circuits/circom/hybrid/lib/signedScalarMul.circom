pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/bitify.circom";
include "../../../node_modules/circomlib/circuits/escalarmulany.circom";

/**
 * Scalar-multiply an arbitrary BabyJubjub point by a SIGNED integer given as
 * (magnitude, sign), magnitude bounded to `bits` bits.
 *
 * Needed for Lagrange-combining threshold decryption shares: the "clear
 * denominators" trick used by `RevealVerify` (see that file's comments)
 * produces small integer coefficients that can be negative (e.g.
 * `participantIndex[m] - participantIndex[i]`). Circom's native field
 * arithmetic represents a negative small integer as `p - |v|` — a value
 * close to the full field size — which `Num2Bits(bits)` (bits << 254) cannot
 * decompose. So negative coefficients are passed in as explicit
 * (sign, magnitude) witnesses instead, and this template does
 * `mag * p`, then conditionally negates the resulting point (cheap on a
 * twisted Edwards curve: negating (x, y) is just (-x, y), no extra scalar
 * mult) if `sign == 1`.
 */
template SignedScalarMul(bits) {
    signal input p[2];
    signal input mag;
    signal input sign; // must be boolean: 0 = non-negative, 1 = negative
    signal output out[2];

    sign * (1 - sign) === 0;

    component magBits = Num2Bits(bits);
    magBits.in <== mag;

    component mul = EscalarMulAny(bits);
    mul.p[0] <== p[0];
    mul.p[1] <== p[1];
    for (var i = 0; i < bits; i++) { mul.e[i] <== magBits.out[i]; }

    signal negX;
    negX <== 0 - mul.out[0];

    out[0] <== mul.out[0] + sign * (negX - mul.out[0]);
    out[1] <== mul.out[1];
}
