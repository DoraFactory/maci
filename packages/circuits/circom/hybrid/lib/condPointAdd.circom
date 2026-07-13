pragma circom 2.0.0;

include "../../../node_modules/circomlib/circuits/babyjub.circom";
include "../../../node_modules/circomlib/circuits/mux1.circom";

/**
 * Conditionally add a BabyJubjub point into an accumulator.
 *
 *   out = acc + (sel ? p : IDENTITY)
 *
 * IDENTITY is the twisted-Edwards neutral element (0, 1); adding it is a no-op,
 * so a non-surviving ballot contributes nothing to the homomorphic tally while
 * keeping the circuit's control flow data-independent (sel stays private).
 */
template CondPointAdd() {
    signal input acc[2];
    signal input p[2];
    signal input sel;

    signal output out[2];

    component mx = Mux1();
    mx.c[0] <== 0;    // IDENTITY.x
    mx.c[1] <== p[0];
    mx.s <== sel;

    component my = Mux1();
    my.c[0] <== 1;    // IDENTITY.y
    my.c[1] <== p[1];
    my.s <== sel;

    component add = BabyAdd();
    add.x1 <== acc[0];
    add.y1 <== acc[1];
    add.x2 <== mx.out;
    add.y2 <== my.out;

    out[0] <== add.xout;
    out[1] <== add.yout;
}
