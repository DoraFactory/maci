pragma circom 2.0.0;

include "../../utils/ecdh.circom";
include "../../utils/unpackElement.circom";
include "../../utils/hasherPoseidon.circom";
include "../../utils/verifySignature.circom";
include "../../utils/lib/poseidonDecrypt.circom";

/**
 * Decrypt a Hybrid routing envelope and verify its signature.
 *
 * Unlike MACI's messageToCommand, the decrypted command does NOT contain the
 * vote content (optionIdx / weight). Those live in a separate AHE ciphertext the
 * coordinator can never decrypt. Here the coordinator only recovers routing
 * data and the aheCommitment that binds the (separately published) ballot.
 *
 * Routing command (7 elements, Poseidon-encrypted to a 10-element ciphertext):
 *   [ packed, newPubKey_x, newPubKey_y, aheCommitment, sigR8_x, sigR8_y, sigS ]
 *
 * packed (from SDK packHybrid): nonce(bits 0-31) | stateIdx(32-63) | pollId(64-95)
 *
 * The signature preimage is [packed, newPubKey_x, newPubKey_y, aheCommitment],
 * so the voter authorizes exactly this ballot (via aheCommitment) and this key
 * rotation (via newPubKey).
 */
template HybridMessageToCommand() {
    var MSG_LENGTH = 10;
    var CMD_LENGTH = 7;

    signal input message[MSG_LENGTH];
    signal input encPrivKey;          // coordinator private key
    signal input encPubKey[2];        // message ephemeral public key
    signal input voterPubKey[2];      // voter's current registered key (state leaf)

    signal output stateIndex;
    signal output nonce;
    signal output pollId;
    signal output newPubKey[2];
    signal output aheCommitment;
    signal output sigValid;

    // 1. ECDH shared key (coordinator only).
    component ecdh = Ecdh();
    ecdh.privKey <== encPrivKey;
    ecdh.pubKey[0] <== encPubKey[0];
    ecdh.pubKey[1] <== encPubKey[1];

    // 2. Decrypt routing command.
    component decryptor = PoseidonDecryptWithoutCheck(CMD_LENGTH);
    decryptor.key[0] <== ecdh.sharedKey[0];
    decryptor.key[1] <== ecdh.sharedKey[1];
    decryptor.nonce <== 0;
    for (var i = 0; i < MSG_LENGTH; i++) {
        decryptor.ciphertext[i] <== message[i];
    }

    // 3. Unpack routing scalars from decrypted[0].
    // UnpackElement outputs HIGH -> LOW: out[0]=bits64-95=pollId,
    // out[1]=bits32-63=stateIdx, out[2]=bits0-31=nonce.
    component unpack = UnpackElement(3);
    unpack.in <== decryptor.decrypted[0];
    pollId <== unpack.out[0];
    stateIndex <== unpack.out[1];
    nonce <== unpack.out[2];

    newPubKey[0] <== decryptor.decrypted[1];
    newPubKey[1] <== decryptor.decrypted[2];
    aheCommitment <== decryptor.decrypted[3];

    // 4. Verify signature over [packed, newPubKey_x, newPubKey_y, aheCommitment].
    component msgHash = Hasher4();
    msgHash.in[0] <== decryptor.decrypted[0];
    msgHash.in[1] <== decryptor.decrypted[1];
    msgHash.in[2] <== decryptor.decrypted[2];
    msgHash.in[3] <== decryptor.decrypted[3];

    component verifier = EdDSAPoseidonVerifier_patched();
    verifier.Ax <== voterPubKey[0];
    verifier.Ay <== voterPubKey[1];
    verifier.R8x <== decryptor.decrypted[4];
    verifier.R8y <== decryptor.decrypted[5];
    verifier.S <== decryptor.decrypted[6];
    verifier.M <== msgHash.hash;

    sigValid <== verifier.valid;
}
