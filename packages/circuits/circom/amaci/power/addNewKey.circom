pragma circom 2.0.0;

include "../../utils/hasherSha256.circom";
include "../../utils/hasherPoseidon.circom";
include "../../utils/ecdh.circom";
include "../../utils/privToPubKey.circom";
include "../../utils/trees/incrementalQuinTree.circom";
include "./lib/rerandomize.circom";
include "../../../node_modules/circomlib/circuits/mux1.circom";

/*
 * Proves the correctness of processing a batch of messages.
 */
template AddNewKey(
    stateTreeDepth
) {
    // stateTreeDepth: the depth of the state tree

    assert(stateTreeDepth > 0);

    var deactivateTreeDepth = stateTreeDepth + 2;

    var TREE_ARITY = 5;

    signal input inputHash;

    // The cooordinator's public key from the contract.
    signal input coordPubKey[2];

    signal input deactivateRoot;

    signal input deactivateIndex;

    signal input deactivateLeaf;

    signal input c1[2];
    signal input c2[2];
    // signal input xIncrement;

    signal input randomVal;

    signal input d1[2];
    signal input d2[2];

    signal input deactivateLeafPathElements[deactivateTreeDepth][TREE_ARITY - 1];

    signal input nullifier;

    signal input oldPrivateKey;

    // 1.
    component nullifierHasher = HashLeftRight(); 
    nullifierHasher.left <== oldPrivateKey;
    nullifierHasher.right <== 1444992409218394441042; // 'NULLIFIER'
    nullifierHasher.hash === nullifier;

    // 2.
    component ecdh = Ecdh();
    ecdh.privKey <== oldPrivateKey;
    ecdh.pubKey[0] <== coordPubKey[0];
    ecdh.pubKey[1] <== coordPubKey[1];

    component sharedKeyHasher = HashLeftRight();
    sharedKeyHasher.left <== ecdh.sharedKey[0];
    sharedKeyHasher.right <== ecdh.sharedKey[1];

    component deactivateLeafHasher = Hasher5();
    deactivateLeafHasher.in[0] <== c1[0];
    deactivateLeafHasher.in[1] <== c1[1];
    deactivateLeafHasher.in[2] <== c2[0];
    deactivateLeafHasher.in[3] <== c2[1];
    deactivateLeafHasher.in[4] <== sharedKeyHasher.hash;

    deactivateLeafHasher.hash === deactivateLeaf;

    // 3.
    component deactivateLeafPathIndices = QuinGeneratePathIndices(deactivateTreeDepth);
    deactivateLeafPathIndices.in <== deactivateIndex;

    component deactivateQie = QuinLeafExists(deactivateTreeDepth);
    deactivateQie.leaf <== deactivateLeaf;
    deactivateQie.root <== deactivateRoot;
    for (var i = 0; i < deactivateTreeDepth; i ++) {
        deactivateQie.path_index[i] <== deactivateLeafPathIndices.out[i];
        for (var j = 0; j < TREE_ARITY - 1; j++) {
            deactivateQie.path_elements[i][j] <== deactivateLeafPathElements[i][j];
        }
    }

    // 4.
    component rerandomize = ElGamalReRandomize();
    rerandomize.c1[0] <== c1[0];
    rerandomize.c1[1] <== c1[1];
    rerandomize.c2[0] <== c2[0];
    rerandomize.c2[1] <== c2[1];
    rerandomize.randomVal <== randomVal;
    rerandomize.pubKey[0] <== coordPubKey[0];
    rerandomize.pubKey[1] <== coordPubKey[1];

    rerandomize.d1[0] === d1[0];
    rerandomize.d2[0] === d2[0];

    // Verify "public" inputs and assign unpacked values
    component inputHasher = AddNewKeyInputHasher();
    inputHasher.deactivateRoot <== deactivateRoot;
    inputHasher.coordPubKey[0] <== coordPubKey[0];
    inputHasher.coordPubKey[1] <== coordPubKey[1];
    inputHasher.nullifier <== nullifier;
    inputHasher.d1[0] <== d1[0];
    inputHasher.d1[1] <== d1[1];
    inputHasher.d2[0] <== d2[0];
    inputHasher.d2[1] <== d2[1];

    inputHasher.hash === inputHash;
}


template AddNewKeyInputHasher() {
    signal input deactivateRoot;
    signal input coordPubKey[2];
    signal input nullifier;
    signal input d1[2];
    signal input d2[2];

    signal output hash;

    // 1. Hash coordPubKey
    component pubKeyHasher = HashLeftRight();
    pubKeyHasher.left <== coordPubKey[0];
    pubKeyHasher.right <== coordPubKey[1];

    // 2. Hash the 7 inputs with SHA256
    component hasher = Sha256Hasher(7);
    hasher.in[0] <== deactivateRoot;
    hasher.in[1] <== pubKeyHasher.hash;
    hasher.in[2] <== nullifier;
    hasher.in[3] <== d1[0];
    hasher.in[4] <== d1[1];
    hasher.in[5] <== d2[0];
    hasher.in[6] <== d2[1];

    hash <== hasher.hash;
}
