pragma circom 2.0.0;

include "./ecdh.circom";
include "./unpackElement.circom";
include "./lib/poseidonDecrypt.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";
include "../../node_modules/circomlib/circuits/poseidon.circom";

/**
 * Convert three 32-bit chunks into a single 96-bit value
 * Used to reconstruct vote weight from packed representation
 */
template Uint32to96() {
    signal input in[3];
    signal output out;

    out <== in[2] + in[1] * 4294967296 + in[0] * 18446744073709552000;
}

/**
 * Decrypt and unpack a message into a command
 * 
 * Message structure (10 elements encrypted):
 * [encrypted_command[0..9]]
 * 
 * Decrypted command structure (7 elements):
 * [packed_data, new_pubkey_x, new_pubkey_y, salt, sig_R8_x, sig_R8_y, sig_S]
 * 
 * Command indices:
 * - COMMAND_STATE_INDEX = 0 (packed_data)
 * - COMMAND_PUBLIC_KEY_X = 1
 * - COMMAND_PUBLIC_KEY_Y = 2
 * - COMMAND_SALT = 3
 * 
 * Signature indices:
 * - SIGNATURE_POINT_X = 4
 * - SIGNATURE_POINT_Y = 5
 * - SIGNATURE_SCALAR = 6
 * 
 * Packed data structure (224 bits in decrypted[0]):
 * - newVotes[0] (bits 0-31)     - vote weight chunk 0
 * - newVotes[1] (bits 32-63)    - vote weight chunk 1  
 * - newVotes[2] (bits 64-95)    - vote weight chunk 2
 * - voteOptionIndex (bits 96-127)  - which option to vote for
 * - stateIndex (bits 128-159)      - voter's state tree index
 * - nonce (bits 160-191)           - command nonce
 * - pollId (bits 192-223)          - poll identifier (prevents replay attacks)
 */
template MessageToCommand() {
    var MSG_LENGTH = 10;  // Ciphertext length: ceil(CMD_LENGTH/3)*3 + 1 = ceil(7/3)*3 + 1 = 9 + 1 = 10
    var CMD_LENGTH = 7;   // Command length after decryption
    var PACKED_CMD_LENGTH = 3;  // For signature verification: [packed_data, newPubKey_x, newPubKey_y]

    signal input message[MSG_LENGTH];
    signal input encPrivKey;
    signal input encPubKey[2];

    signal output stateIndex;
    signal output voteOptionIndex;
    signal output newVoteWeight;
    signal output nonce;
    signal output pollId;  // NEW: Poll ID output
    signal output newPubKey[2];
    signal output sigR8[2];
    signal output sigS;
    signal output packedCommandOut[PACKED_CMD_LENGTH];

    // 1. Compute ECDH shared key
    component ecdh = Ecdh();
    ecdh.privKey <== encPrivKey;
    ecdh.pubKey[0] <== encPubKey[0];
    ecdh.pubKey[1] <== encPubKey[1];

    // 2. Decrypt message to command
    component decryptor = PoseidonDecryptWithoutCheck(CMD_LENGTH);
    decryptor.key[0] <== ecdh.sharedKey[0];
    decryptor.key[1] <== ecdh.sharedKey[1];
    decryptor.nonce <== 0;
    for (var i = 0; i < MSG_LENGTH; i++) {
        decryptor.ciphertext[i] <== message[i];
    }

    // 3. Unpack the first element (packed data) into 7 x 32-bit values
    component unpack = UnpackElement(7);  // Changed from 6 to 7
    unpack.in <== decryptor.decrypted[0];

    // Extract fields from packed data
    // UnpackElement outputs from HIGH to LOW bits:
    // out[0] = bits 192-223 (highest 32 bits) = pollId
    // out[1] = bits 160-191 = newVotes[high 32 bits]
    // out[2] = bits 128-159 = newVotes[mid 32 bits]
    // out[3] = bits 96-127  = newVotes[low 32 bits]
    // out[4] = bits 64-95   = voIdx
    // out[5] = bits 32-63   = stateIdx
    // out[6] = bits 0-31    = nonce
    
    pollId <== unpack.out[0];
    nonce <== unpack.out[6];
    stateIndex <== unpack.out[5];
    voteOptionIndex <== unpack.out[4];

    // Reconstruct 96-bit vote weight from three 32-bit chunks
    // newVotes = low + (mid << 32) + (high << 64)
    component computeVoteWeight = Uint32to96();
    computeVoteWeight.in[0] <== unpack.out[1];  // High 32 bits (bits 160-191)
    computeVoteWeight.in[1] <== unpack.out[2];  // Mid 32 bits (bits 128-159)
    computeVoteWeight.in[2] <== unpack.out[3];  // Low 32 bits (bits 96-127)
    newVoteWeight <== computeVoteWeight.out;

    // 4. Extract other command fields
    // decrypted[0] = packed_data (already unpacked above) - COMMAND_STATE_INDEX
    // decrypted[1] = new_pubkey_x - COMMAND_PUBLIC_KEY_X
    // decrypted[2] = new_pubkey_y - COMMAND_PUBLIC_KEY_Y
    // decrypted[3] = salt - COMMAND_SALT
    // decrypted[4] = sig_R8_x - SIGNATURE_POINT_X
    // decrypted[5] = sig_R8_y - SIGNATURE_POINT_Y
    // decrypted[6] = sig_S - SIGNATURE_SCALAR
    newPubKey[0] <== decryptor.decrypted[1];
    newPubKey[1] <== decryptor.decrypted[2];

    sigR8[0] <== decryptor.decrypted[4];
    sigR8[1] <== decryptor.decrypted[5];
    sigS <== decryptor.decrypted[6];

    // 5. Output packed command for signature verification
    // Signature is over: [packed_data, newPubKey_x, newPubKey_y]
    // Salt is NOT included in signature
    packedCommandOut[0] <== decryptor.decrypted[0];  // packed_data
    packedCommandOut[1] <== decryptor.decrypted[1];  // newPubKey_x
    packedCommandOut[2] <== decryptor.decrypted[2];  // newPubKey_y

    // 6. Output shared key for debugging/verification
    signal output sharedKey[2];
    sharedKey[0] <== ecdh.sharedKey[0];
    sharedKey[1] <== ecdh.sharedKey[1];
}
