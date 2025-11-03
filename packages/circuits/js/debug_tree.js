const { poseidon } = require("circom");
const Tree = require("./tree");

// Simulate state tree configuration
const stateTreeDepth = 2;

// Zero hash values
const zeroHash5 = poseidon([0, 0, 0, 0, 0]);
const zeroHash10 = poseidon([zeroHash5, zeroHash5]);

console.log("zeroHash5:", zeroHash5.toString());
console.log("zeroHash10:", zeroHash10.toString());

// Create complete state tree
const fullStateTree = new Tree(5, stateTreeDepth, zeroHash10);

// USER_1 state leaf
const user1StateLeaf = [
  8446677751716569713622015905729882243875224951572887602730835165068040887285n,
  12484654491029393893324568717198080229359788322121893494118068510674758553628n,
  100n,
  0n,
  0n,
  0n,
  0n,
  0n,
  0n,
  0n
];

// USER_2 state leaf
const user2StateLeaf = [
  4934845797881523927654842245387640257368309434525961062601274110069416343731n,
  7218132018004361008636029786293016526331813670637191622129869640055131468762n,
  100n,
  0n,
  0n,
  0n,
  0n,
  0n,
  0n,
  0n
];

// Calculate state leaf hash
const user1Hash = poseidon([
  poseidon(user1StateLeaf.slice(0, 5)),
  poseidon(user1StateLeaf.slice(5, 10))
]);
console.log("\\nUSER_1 leaf hash:", user1Hash.toString());

const user2Hash = poseidon([
  poseidon(user2StateLeaf.slice(0, 5)),
  poseidon(user2StateLeaf.slice(5, 10))
]);
console.log("USER_2 leaf hash:", user2Hash.toString());

// Update tree
fullStateTree.updateLeaf(0, user1Hash);
console.log("After updating leaf 0, root:", fullStateTree.root.toString());

fullStateTree.updateLeaf(1, user2Hash);
console.log("After updating leaf 1, root:", fullStateTree.root.toString());

// Create subTree (length = 2)
const subStateTree = fullStateTree.subTree(2);
console.log("\\nSubTree root:", subStateTree.root.toString());
console.log("Full tree root:", fullStateTree.root.toString());
console.log("Roots match:", subStateTree.root === fullStateTree.root);

// Get path elements for index 0
const path0 = subStateTree.pathElementOf(0);
console.log("\\nPath elements for index 0:");
for (let d = 0; d < path0.length; d++) {
  console.log(`  Depth ${d}:`, path0[d].map(x => x.toString()));
}

// Get path elements for index 1
const path1 = subStateTree.pathElementOf(1);
console.log("\\nPath elements for index 1:");
for (let d = 0; d < path1.length; d++) {
  console.log(`  Depth ${d}:`, path1[d].map(x => x.toString()));
}

// Manually verify inclusion proof for index 0
console.log("\\n=== Manual verification for index 0 ===");
const pathIndices0 = subStateTree.pathIdxOf(0);
console.log("Path indices:", pathIndices0);

let currentHash = user1Hash;
console.log("Starting with leaf hash:", currentHash.toString());

for (let d = 0; d < stateTreeDepth; d++) {
  const siblings = path0[d];
  const pathIdx = pathIndices0[d];
  
  // Construct children array for parent node
  const children = [];
  for (let i = 0; i < 5; i++) {
    if (i === pathIdx) {
      children.push(currentHash);
    } else if (i < pathIdx) {
      children.push(siblings[i]);
    } else {
      children.push(siblings[i - 1]);
    }
  }
  
  currentHash = poseidon(children);
  console.log(`Depth ${d}: pathIdx=${pathIdx}, parent hash=${currentHash.toString()}`);
}

console.log("Final computed root:", currentHash.toString());
console.log("Expected root:", subStateTree.root.toString());
console.log("Verification:", currentHash === subStateTree.root ? "PASSED" : "FAILED");

