const fs = require("fs");
const path = require("path");
const { poseidon } = require("circom");

// Read input file
const inputPath = path.join(__dirname, "../inputs/deactivate-input.json");
const input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

console.log("=== Verifying ALL messages in deactivate input ===\n");
console.log(`currentStateRoot: ${input.currentStateRoot}\n`);

let allPass = true;

// Verify state leaf for each message
for (let i = 0; i < 5; i++) {
  console.log(`Message ${i}:`);
  
  const stateLeaf = input.currentStateLeaves[i].map(x => BigInt(x));
  const pathElements = input.currentStateLeavesPathElements[i].map(level => 
    level.map(x => BigInt(x))
  );
  
  const msg = input.msgs[i].map(x => BigInt(x));
  const encPubKey = input.encPubKeys[i].map(x => BigInt(x));
  
  console.log(`  msgs[0]: ${msg[0]}`);
  console.log(`  encPubKey: [${encPubKey[0]}, ${encPubKey[1]}]`);
  console.log(`  isEmpty: ${msg[0] === 0n ? 'YES' : 'NO'}`);
  
  // Calculate state leaf hash
  const leafHash = poseidon([
    poseidon(stateLeaf.slice(0, 5)),
    poseidon(stateLeaf.slice(5, 10))
  ]);
  
  console.log(`  State leaf hash: ${leafHash}`);
  
  // Manually verify Merkle proof
  // Need to calculate path indices (inferred from stateLeaf content)
  // For the first two messages, use their respective indices
  // For empty messages, should use index 24
  
  // Infer index from state leaf content
  let expectedIndex;
  if (i < 2) {
    expectedIndex = i;
  } else {
    expectedIndex = 24; // Empty messages should use MAX_INDEX - 1
  }
  
  // Calculate path indices
  const pathIndices = [];
  let idx = expectedIndex;
  for (let d = 0; d < 2; d++) {
    const parentIdx = Math.floor(idx / 5);
    const childIdx = idx % 5;
    pathIndices.push(childIdx);
    idx = parentIdx;
  }
  
  console.log(`  Expected index: ${expectedIndex}, path indices: [${pathIndices.join(", ")}]`);
  
  let currentHash = leafHash;
  
  for (let d = 0; d < 2; d++) {
    const siblings = pathElements[d];
    const pathIdx = pathIndices[d];
    
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
  }
  
  const passed = currentHash.toString() === input.currentStateRoot;
  console.log(`  Computed root: ${currentHash}`);
  console.log(`  Verification: ${passed ? '✓ PASS' : '✗ FAIL'}`);
  console.log("");
  
  if (!passed) {
    allPass = false;
  }
}

console.log(`\n========================================`);
console.log(`Overall result: ${allPass ? '✓ ALL PASS' : '✗ SOME FAILED'}`);
console.log(`========================================\n`);

