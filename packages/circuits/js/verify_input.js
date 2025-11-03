const fs = require("fs");
const path = require("path");
const { poseidon } = require("circom");

// Read input file
const inputPath = path.join(__dirname, "../inputs/deactivate-input.json");
const input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

console.log("=== Verifying deactivate input ===\n");

// Verify state leaf for each message
for (let i = 0; i < 5; i++) {
  console.log(`\nMessage ${i}:`);
  
  const stateLeaf = input.currentStateLeaves[i].map(x => BigInt(x));
  const pathElements = input.currentStateLeavesPathElements[i].map(level => 
    level.map(x => BigInt(x))
  );
  
  // Calculate state leaf hash
  const leafHash = poseidon([
    poseidon(stateLeaf.slice(0, 5)),
    poseidon(stateLeaf.slice(5, 10))
  ]);
  
  console.log(`  State leaf hash: ${leafHash}`);
  
  // For the first two messages, show their expected indices
  if (i === 0 || i === 1) {
    console.log(`  Expected to use state index: ${i}`);
  } else {
    console.log(`  Empty message, using state index: 0`);
  }
  
  // Verify path (assuming index i for i < 2, otherwise index 0)
  let expectedIndex = i < 2 ? i : 0;
  
  // Manually verify Merkle proof
  let currentHash = leafHash;
  
  // Calculate path indices
  const pathIndices = [];
  let idx = expectedIndex;
  for (let d = 0; d < 2; d++) {
    const parentIdx = Math.floor(idx / 5);
    const childIdx = idx % 5;
    pathIndices.push(childIdx);
    idx = parentIdx;
  }
  
  console.log(`  Path indices: [${pathIndices.join(", ")}]`);
  
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
    console.log(`  Depth ${d}: computed parent = ${currentHash}`);
  }
  
  console.log(`  Computed root: ${currentHash}`);
}

console.log(`\n\nExpected currentStateRoot: ${input.currentStateRoot}`);
console.log("\nNote: If computed roots don't match currentStateRoot, there's a problem!");

