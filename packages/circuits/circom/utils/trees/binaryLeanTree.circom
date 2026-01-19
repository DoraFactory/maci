pragma circom 2.0.0;

// Binary Lean Tree Components
// Provides API-compatible wrappers for binary trees to replace quinary trees

include "./incrementalMerkleTree.circom";
include "../../../node_modules/circomlib/circuits/comparators.circom";
include "../hasherPoseidon.circom";

/*
 * Binary tree version of QuinLeafExists
 * Verifies that a leaf exists in a binary Merkle tree
 */
template BinaryLeafExists(levels) {
    // Binary tree: only need 1 sibling per level (not 4 like quinary)
    signal input leaf;
    signal input path_elements[levels][1];
    signal input path_index[levels];
    signal input root;

    // Use existing binary tree circuit
    component merkletree = MerkleTreeInclusionProof(levels);
    merkletree.leaf <== leaf;
    
    for (var i = 0; i < levels; i++) {
        merkletree.path_index[i] <== path_index[i];
        merkletree.path_elements[i][0] <== path_elements[i][0];
    }

    // Verify computed root matches provided root
    root === merkletree.root;
}

/*
 * Binary tree version of QuinTreeInclusionProof
 * Computes the Merkle root from a leaf and its path
 */
template BinaryTreeInclusionProof(levels) {
    signal input leaf;
    signal input path_index[levels];
    signal input path_elements[levels][1];
    signal output root;

    component hashers[levels];
    component mux[levels];

    signal levelHashes[levels + 1];
    levelHashes[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        // Ensure path_index is binary (0 or 1)
        path_index[i] * (1 - path_index[i]) === 0;

        hashers[i] = HashLeftRight();
        mux[i] = MultiMux1(2);

        // Left child scenario
        mux[i].c[0][0] <== levelHashes[i];
        mux[i].c[0][1] <== path_elements[i][0];

        // Right child scenario
        mux[i].c[1][0] <== path_elements[i][0];
        mux[i].c[1][1] <== levelHashes[i];

        mux[i].s <== path_index[i];
        hashers[i].left <== mux[i].out[0];
        hashers[i].right <== mux[i].out[1];

        levelHashes[i + 1] <== hashers[i].hash;
    }

    root <== levelHashes[levels];
}

/*
 * Binary tree version of QuinCheckRoot
 * Computes the root of a complete binary tree from its leaves
 */
template BinaryCheckRoot(levels) {
    var totalLeaves = 2 ** levels;
    var numLeafHashers = totalLeaves / 2;
    var numIntermediateHashers = numLeafHashers - 1;

    signal input leaves[totalLeaves];
    signal output root;

    var numHashers = totalLeaves - 1;
    component hashers[numHashers];

    // Instantiate all hashers
    var i;
    for (i = 0; i < numHashers; i++) {
        hashers[i] = HashLeftRight();
    }

    // Hash leaf pairs
    for (i = 0; i < numLeafHashers; i++) {
        hashers[i].left <== leaves[i * 2];
        hashers[i].right <== leaves[i * 2 + 1];
    }

    // Hash intermediate levels
    var k = 0;
    for (i = numLeafHashers; i < numLeafHashers + numIntermediateHashers; i++) {
        hashers[i].left <== hashers[k * 2].hash;
        hashers[i].right <== hashers[k * 2 + 1].hash;
        k++;
    }

    root <== hashers[numHashers - 1].hash;
}

/*
 * Binary tree version of QuinGeneratePathIndices
 * Generates path indices for a binary tree (base 2)
 */
template BinaryGeneratePathIndices(levels) {
    var BASE = 2;
    signal input in;
    signal output out[levels];

    var m = in;
    signal n[levels + 1];
    
    for (var i = 0; i < levels; i++) {
        n[i] <-- m;
        out[i] <-- m % BASE;
        m = m \ BASE;
    }

    n[levels] <-- m;

    // Range check on each output
    for (var i = 1; i < levels + 1; i++) {
        n[i - 1] === n[i] * BASE + out[i - 1];
    }

    // Verify each output is 0 or 1
    component leq[levels];
    for (var i = 0; i < levels; i++) {
        leq[i] = LessThan(2);
        leq[i].in[0] <== out[i];
        leq[i].in[1] <== BASE;
        leq[i].out === 1;
    }

    // Verify reconstruction
    signal sum;
    signal terms[levels];
    for (var i = 0; i < levels; i++) {
        terms[i] <== out[i] * (BASE ** i);
    }
    
    // Sum all terms
    if (levels == 1) {
        sum <== terms[0];
    } else if (levels == 2) {
        sum <== terms[0] + terms[1];
    } else if (levels == 3) {
        sum <== terms[0] + terms[1] + terms[2];
    } else if (levels == 4) {
        sum <== terms[0] + terms[1] + terms[2] + terms[3];
    } else if (levels == 5) {
        sum <== terms[0] + terms[1] + terms[2] + terms[3] + terms[4];
    } else {
        // For higher levels, use iterative summing
        signal sums[levels];
        sums[0] <== terms[0];
        for (var i = 1; i < levels; i++) {
            sums[i] <== sums[i-1] + terms[i];
        }
        sum <== sums[levels - 1];
    }
    sum === in;
}

/*
 * Binary tree batch leaf verification
 * Verifies a batch of leaves exists in the tree
 */
template BinaryBatchLeavesExists(levels, batchLevels) {
    var LEAVES_PER_BATCH = 2 ** batchLevels;

    signal input root;
    signal input leaves[LEAVES_PER_BATCH];
    signal input path_index[levels - batchLevels];
    signal input path_elements[levels - batchLevels][1];

    // Compute subroot
    component bcr = BinaryCheckRoot(batchLevels);
    for (var i = 0; i < LEAVES_PER_BATCH; i++) {
        bcr.leaves[i] <== leaves[i];
    }

    // Verify subroot exists in main tree
    component ble = BinaryLeafExists(levels - batchLevels);
    ble.leaf <== bcr.root;
    ble.root <== root;
    
    for (var i = 0; i < levels - batchLevels; i++) {
        ble.path_index[i] <== path_index[i];
        ble.path_elements[i][0] <== path_elements[i][0];
    }
}
