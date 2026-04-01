pragma circom 2.0.0;

include "./hasherPoseidon.circom";

/**
 * Hash a message with its encryption public key and previous hash
 * Used for building message hash chains to ensure message ordering and completeness
 * 
 * Message length changed from 7 to 10 elements due to command length increase (6->7)
 * Command: [packed_data, salt, new_pubkey_x, new_pubkey_y, sig_R8_x, sig_R8_y, sig_S] (7 elements)
 * Encrypted message: roundUp(7, 3) + 1 = 10 elements
 */
template MessageHasher() {
    signal input in[10];  // Changed from 7 to 10
    signal input encPubKey[2];
    signal input prevHash;
    signal output hash;

    component hasher = Hasher13();  // Changed from Hasher10 to Hasher13 (10 + 2 + 1 = 13)

    for (var i = 0; i < 10; i ++) {  // Changed from 7 to 10
        hasher.in[i] <== in[i];
    }
    hasher.in[10] <== encPubKey[0];   // Shifted from in[7]
    hasher.in[11] <== encPubKey[1];   // Shifted from in[8]
    hasher.in[12] <== prevHash;       // Shifted from in[9]

    hash <== hasher.hash;
}
