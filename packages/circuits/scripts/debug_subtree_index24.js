const { poseidon } = require("circom");
const Tree = require("./tree");

// Zero hash values
const zeroHash5 = poseidon([0, 0, 0, 0, 0]);
const zeroHash10 = poseidon([zeroHash5, zeroHash5]);

console.log("zeroHash10:", zeroHash10.toString());

// Create complete state tree
const fullStateTree = new Tree(5, 2, zeroHash10);

// USER_1 and USER_2 leaf hashes
const user1Hash = 15884574147149903758614937709844651104361495245513539652215355948158635780323n;
const user2Hash = 21788291901673958555917215458457513107680086694062014748174312903396312727665n;

fullStateTree.updateLeaf(0, user1Hash);
fullStateTree.updateLeaf(1, user2Hash);

console.log("Full tree root:", fullStateTree.root.toString());

// Create subTree (length = 2)
const subStateTree = fullStateTree.subTree(2);
console.log("SubTree root:", subStateTree.root.toString());

// Check leaf value at index 24
console.log("\n=== Index 24 ===");
console.log("Leaf 24:", subStateTree.leaf(24).toString());
console.log("Expected zeroHash10:", zeroHash10.toString());
console.log("Match:", subStateTree.leaf(24) === zeroHash10);

// Get path elements for index 24
const path24 = subStateTree.pathElementOf(24);
console.log("\nPath elements for index 24:");
for (let d = 0; d < path24.length; d++) {
  console.log(`  Depth ${d}:`, path24[d].map(x => x.toString()));
}

// Get path indices for index 24
const pathIndices24 = subStateTree.pathIdxOf(24);
console.log("\nPath indices for index 24:", pathIndices24);

// Manually verify Merkle proof for index 24
console.log("\n=== Manual verification for index 24 ===");
let currentHash = zeroHash10;
console.log("Starting with leaf hash (zeroHash10):", currentHash.toString());

for (let d = 0; d < 2; d++) {
  const siblings = path24[d];
  const pathIdx = pathIndices24[d];
  
  // Construct children array for parent node
  const children = [];
  let siblingIdx = 0;
  for (let j = 0; j < 5; j++) {
    if (j === pathIdx) {
      children.push(currentHash);
    } else {
      children.push(siblings[siblingIdx]);
      siblingIdx++;
    }
  }
  
  currentHash = poseidon(children);
  console.log(`Depth ${d}: pathIdx=${pathIdx}, parent hash=${currentHash.toString()}`);
}

console.log("\nFinal computed root:", currentHash.toString());
console.log("Expected subTree root:", subStateTree.root.toString());
console.log("Verification:", currentHash === subStateTree.root ? "PASSED" : "FAILED");

