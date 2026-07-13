import { Tree, poseidon, hashLeftRight } from '@dorafactory/maci-sdk';
import { Circomkit, type WitnessTester, type CircomkitConfig } from 'circomkit';

import fs from 'fs';
import path from 'path';

const configFilePath = path.resolve(__dirname, '..', '..', '..', 'circomkit.json');
const config = JSON.parse(fs.readFileSync(configFilePath, 'utf-8')) as CircomkitConfig;

export const circomkitInstance = new Circomkit({
  ...config,
  verbose: false
});

/**
 * Convert a string to a bigint
 * @param s - the string to convert
 * @returns the bigint representation of the string
 */
export const str2BigInt = (s: string): bigint =>
  BigInt(parseInt(Buffer.from(s).toString('hex'), 16));

/**
 * Generate a random number within a certain threshold
 * @param upper - the upper bound
 * @returns the random index
 */
export const generateRandomIndex = (upper: number): number =>
  Math.floor(Math.random() * (upper - 1));

// @note thanks https://github.com/Rate-Limiting-Nullifier/circom-rln/blob/main/test/utils.ts
// for the code below (modified version)
/**
 * Get a signal from the circuit
 * @param circuit - the circuit object
 * @param witness - the witness
 * @param name - the name of the signal
 * @returns the signal value
 */
export const getSignal = async (
  tester: WitnessTester,
  witness: bigint[],
  name: string
): Promise<bigint> => {
  const prefix = 'main';
  // E.g. the full name of the signal "root" is "main.root"
  // You can look up the signal names using `circuit.getDecoratedOutput(witness))`
  const signalFullName = `${prefix}.${name}`;

  const out = await tester.readWitness(witness, [signalFullName]);
  return BigInt(out[signalFullName]);
};

// ============================================================================
// AMACI Deactivation Test Utilities
// ============================================================================

/**
 * Create an account with odd d1/d2 (for edge case testing)
 * @param operator - the operator client
 * @param stateIdx - the state index
 * @param pubKey - the public key
 * @param coordPubKey - the coordinator's public key
 * @param randomKey - random key for encryption
 */
export function createAccountWithOddD1D2(
  operator: any,
  stateIdx: number,
  pubKey: [bigint, bigint],
  coordPubKey: [bigint, bigint],
  randomKey: bigint
): void {
  // Import encryptOdevity dynamically to avoid circular dependencies
  const { encryptOdevity } = require('@dorafactory/maci-sdk');

  // Generate odd encrypted data
  const oddData = encryptOdevity(true, coordPubKey, randomKey);

  operator.initStateTree(stateIdx, pubKey, 100, [
    oddData.c1.x,
    oddData.c1.y,
    oddData.c2.x,
    oddData.c2.y
  ]);
}

/**
 * Verify dual check mechanism (activeStateTree + d1/d2)
 * @param activeStateTree - the active state tree
 * @param stateIdx - the state index
 * @param stateLeaf - the state leaf
 * @param coordPrivKey - coordinator's private key
 * @returns verification result
 */
export function verifyDualCheck(
  activeStateTree: any,
  stateIdx: number,
  stateLeaf: any,
  coordPrivKey: bigint
): { check1: boolean; check2: boolean; result: boolean } {
  // Import decrypt dynamically
  const { decrypt } = require('@dorafactory/maci-sdk');

  // Check 1: ActiveStateTree
  const activeStateLeaf = activeStateTree.leaf(stateIdx);
  const check1 = activeStateLeaf === 0n;

  // Check 2: d1/d2 decrypt
  const decrypted = decrypt(coordPrivKey, {
    c1: { x: stateLeaf.d1[0], y: stateLeaf.d1[1] },
    c2: { x: stateLeaf.d2[0], y: stateLeaf.d2[1] },
    xIncrement: 0n
  });
  const check2 = decrypted % 2n === 0n;

  // Both must pass for vote to be valid
  const result = check1 && check2;

  return { check1, check2, result };
}

/**
 * Verify Merkle proof in circuit
 * @param circuit - the circuit tester
 * @param leaf - the leaf value
 * @param root - the expected root
 * @param pathElements - the Merkle path elements
 * @param shouldPass - whether the proof should pass
 */
export async function verifyMerkleProof(
  circuit: WitnessTester,
  leaf: bigint,
  root: bigint,
  pathElements: bigint[][],
  shouldPass: boolean
): Promise<void> {
  const inputs = {
    leaf,
    root,
    path_elements: pathElements
  };

  try {
    const witness = await circuit.calculateWitness(inputs);
    if (shouldPass) {
      await circuit.expectConstraintPass(witness);
    } else {
      // If it shouldn't pass, we expect this to throw
      await circuit.expectConstraintPass(witness);
      throw new Error('Circuit should have failed but passed');
    }
  } catch (error) {
    if (!shouldPass) {
      // Expected to fail
      return;
    }
    throw error;
  }
}

/**
 * Generate test accounts with different keypairs
 * @param numAccounts - number of accounts to generate
 * @returns array of test accounts with keypairs
 */
export function generateTestAccounts(numAccounts: number): Array<{
  secretKey: bigint;
  pubKey: [bigint, bigint];
}> {
  const { genKeypair } = require('@dorafactory/maci-sdk');

  const accounts = [];
  for (let i = 0; i < numAccounts; i++) {
    const secretKey = BigInt(100000 + i * 111111);
    const keypair = genKeypair();
    accounts.push({
      secretKey,
      pubKey: keypair.pubKey.toPoints() as [bigint, bigint]
    });
  }

  return accounts;
}

/**
 * Calculate state leaf hash (AMACI double-layer Poseidon)
 * @param pubKey - public key [x, y]
 * @param balance - voice credit balance
 * @param voTreeRoot - vote option tree root
 * @param nonce - nonce
 * @param d1 - d1 [x, y]
 * @param d2 - d2 [x, y]
 * @param xIncrement - x increment
 * @returns the state leaf hash
 */
export function calculateStateLeafHash(
  pubKey: [bigint, bigint],
  balance: bigint,
  voTreeRoot: bigint,
  nonce: bigint,
  d1: [bigint, bigint],
  d2: [bigint, bigint],
  xIncrement: bigint
): bigint {
  const { hash2, hash5 } = require('@dorafactory/maci-sdk');

  // Layer 1: pubKey, balance, voTreeRoot, nonce
  const layer1 = hash5([pubKey[0], pubKey[1], balance, voTreeRoot, nonce]);

  // Layer 2: d1, d2, xIncrement
  const layer2 = hash5([d1[0], d1[1], d2[0], d2[1], xIncrement]);

  // Final hash: hash2([layer1, layer2])
  return hash2([layer1, layer2]);
}

/**
 * Check if decrypted value is odd (deactivated)
 * @param coordPrivKey - coordinator's private key
 * @param d1 - d1 [x, y]
 * @param d2 - d2 [x, y]
 * @param xIncrement - x increment (default 0)
 * @returns true if odd (deactivated), false if even (active)
 */
export function isDeactivated(
  coordPrivKey: bigint,
  d1: [bigint, bigint],
  d2: [bigint, bigint],
  xIncrement: bigint = 0n
): boolean {
  const { decrypt } = require('@dorafactory/maci-sdk');

  const decrypted = decrypt(coordPrivKey, {
    c1: { x: d1[0], y: d1[1] },
    c2: { x: d2[0], y: d2[1] },
    xIncrement
  });

  return decrypted % 2n === 1n;
}

/**
 * Generate a static random key (as used in operator)
 * @param privKey - private key
 * @param salt - salt value
 * @param index - index value
 * @returns the static random key
 */
export function genStaticRandomKey(privKey: bigint, salt: bigint, index: bigint): bigint {
  const { poseidon } = require('@dorafactory/maci-sdk');
  return poseidon([privKey, salt, index]);
}

// ============================================================================
// Hybrid MACI + AHE test utilities
// ============================================================================

/**
 * cw-amaci's `StateLeaf::hash_decativate_state_leaf` (called unconditionally by
 * `execute_sign_up`) wraps every signed-up leaf as
 * hash2([hash5(leaf), DEACTIVATE_CONSTANT]), DEACTIVATE_CONSTANT =
 * hash5([0,0,0,0,0]). BallotValidity/ProcessHybridMessages both reproduce this
 * exact wrap to Merkle-authenticate against a REAL on-chain-shaped state root,
 * so any test building a state tree for those circuits must use it too.
 */
export const HYBRID_DEACTIVATE_CONSTANT =
  14655542659562014735865511769057053982292279840403315552050801315682099828156n;

/**
 * Build a quinary state tree of Hybrid MACI + AHE voters (mirrors
 * `MaciContract::instantiate_hybrid_default` / `execute_sign_up`'s leaf
 * layout: `[pubKey.x, pubKey.y, balance, voteOptionTreeRoot=0, nonce=0]`,
 * wrapped with `HYBRID_DEACTIVATE_CONSTANT`), for feeding BallotValidity's /
 * ProcessHybridMessages' `stateRoot`/`pathElements` witnesses in tests.
 */
export function buildHybridVoterTree(
  voters: { pubKey: [bigint, bigint]; balance: bigint }[],
  stateTreeDepth: number
): { tree: Tree; stateRoot: bigint } {
  const leaves = voters.map(({ pubKey, balance }) =>
    hashLeftRight(poseidon([pubKey[0], pubKey[1], balance, 0n, 0n]), HYBRID_DEACTIVATE_CONSTANT)
  );
  const tree = new Tree(5, stateTreeDepth, 0n);
  tree.initLeaves(leaves);
  return { tree, stateRoot: tree.root as bigint };
}

/** State-leaf witness for one real message slot (see `buildHybridVoterTree`). */
export interface HybridStateLeafWitness {
  voiceCreditBalance: bigint;
  voteOptionTreeRoot: bigint;
  slNonce: bigint;
  pathElements: bigint[][];
}

/**
 * All-zero quinary tree root at depth 2 (matches HYBRID_NONCE_ZERO_ROOT in
 * contract.rs / server.ts): the starting value of the nonce tree before any
 * batch is processed.
 */
export const NONCE_ZERO_ROOT = 19261153649140605024552417994922546473530072875902678653210025980873274131905n;

/**
 * Build nonce tree witnesses for a batch of real messages.
 *
 * Simulates the circuit's reverse nonce-tree walk (i = B-1 downto 0) to
 * produce per-slot `currentNonce[i]` and `noncePathElements[i]` witnesses.
 * The nonce tree has depth = stateTreeDepth (same tree shape as the
 * registration state tree, but leaves are raw nonce values, not voter leaves).
 *
 * @param messageNonces - per real slot: { stateIdx, nonce } (length = real count)
 * @param B            - total circuit batch size (including padding)
 * @param depth        - nonce tree depth (= stateTreeDepth)
 * @param initTree     - optional pre-seeded nonce tree from a prior batch
 */
export function buildNonceTreeWitnesses(
  messageNonces: { stateIdx: number; nonce: number }[],
  B: number,
  depth: number,
  initTree?: Tree
): {
  currentNonceRoot: bigint;
  currentNonce: bigint[];
  noncePathElements: bigint[][][];
  newNonceRoot: bigint;
  nonceTree: Tree;
} {
  const nonceTree: Tree = initTree ?? new Tree(5, depth, 0n);
  const currentNonceRoot = nonceTree.root as bigint;
  const currentNonce: bigint[] = new Array(B).fill(0n);
  const noncePathElements: bigint[][][] = Array.from({ length: B }, () =>
    Array.from({ length: depth }, () => new Array(4).fill(0n))
  );
  const actualCount = messageNonces.length;
  for (let i = B - 1; i >= 0; i--) {
    if (i >= actualCount) continue;
    const { stateIdx, nonce } = messageNonces[i];
    currentNonce[i] = nonceTree.leaf(stateIdx) as bigint;
    noncePathElements[i] = nonceTree.pathElementOf(stateIdx) as bigint[][];
    const cmd = BigInt(nonce);
    if (cmd === currentNonce[i] + 1n) nonceTree.updateLeaf(stateIdx, cmd);
  }
  return {
    currentNonceRoot,
    currentNonce,
    noncePathElements,
    newNonceRoot: nonceTree.root as bigint,
    nonceTree,
  };
}

/**
 * Build the `ProcessHybridMessages`/`ProcessHybridMessagesOnchain` witness
 * input for a batch of REAL messages, zero-padding up to `batchSize` slots
 * exactly like `OperatorClient.proveHybridBatch` does for the real proving
 * path (see `packages/sdk/src/operator.ts`) -- kept in sync manually since
 * that method bakes the padding logic into its own Groth16 `fullProve` call
 * instead of exposing it standalone.
 *
 * Includes nonce-tree witnesses required by the cross-batch LWW circuit
 * (added in the hybrid_lww_跨批次修复 plan). Pass `messageNonces` as an
 * array of `{ stateIdx, nonce }` matching the REAL message slots (in the
 * SAME order as `messages`); it must have length == real message count, not
 * `batchSize`. Padding slots are filled with zero nonce witnesses automatically.
 */
export function buildProcessHybridMessagesInput({
  coordPrivKey,
  messages,
  voterPubKeys,
  leaves,
  stateRoot,
  actualCount,
  batchSize,
  messageNonces,
  currentNonceRoot: externalCurrentNonceRoot,
  nonceTree: externalNonceTree,
}: {
  coordPrivKey: bigint;
  messages: { routing: bigint[]; encPubKey: [bigint, bigint]; ciphertexts: { c1: [bigint, bigint]; c2: [bigint, bigint] }[] }[];
  voterPubKeys: [bigint, bigint][];
  leaves: HybridStateLeafWitness[];
  stateRoot: bigint;
  actualCount?: number;
  batchSize: number;
  messageNonces?: { stateIdx: number; nonce: number }[];
  currentNonceRoot?: bigint;
  nonceTree?: Tree;
}) {
  const B = batchSize;
  const numOptions = messages[0]?.ciphertexts.length ?? 0;
  const stateTreeDepth = leaves[0]?.pathElements.length ?? 0;
  const leavesPerLevel = stateTreeDepth > 0 ? leaves[0].pathElements[0].length : 0;

  const pad = <T>(arr: T[], fill: T): T[] => arr.concat(Array(B - arr.length).fill(fill));
  const zeroPath = () => Array.from({ length: stateTreeDepth }, () => Array(leavesPerLevel).fill(0n));

  // Build nonce tree witnesses.
  const nonces = messageNonces ?? messages.map((_, i) => ({ stateIdx: i, nonce: 1 }));
  const { currentNonceRoot, currentNonce, noncePathElements } = buildNonceTreeWitnesses(
    nonces,
    B,
    stateTreeDepth,
    externalNonceTree,
  );

  return {
    coordPrivKey,
    message: pad(messages.map((m) => m.routing), Array(10).fill(0n)),
    encPubKey: pad(messages.map((m) => m.encPubKey), [0n, 1n] as [bigint, bigint]),
    voterPubKey: pad(voterPubKeys, [0n, 1n] as [bigint, bigint]),
    voiceCreditBalance: pad(leaves.map((l) => l.voiceCreditBalance), 0n),
    voteOptionTreeRoot: pad(leaves.map((l) => l.voteOptionTreeRoot), 0n),
    slNonce: pad(leaves.map((l) => l.slNonce), 0n),
    pathElements: pad(leaves.map((l) => l.pathElements), zeroPath()),
    stateRoot,
    currentNonceRoot: externalCurrentNonceRoot ?? currentNonceRoot,
    noncePathElements,
    currentNonce,
    actualCount: BigInt(actualCount ?? messages.length),
    encC1: pad(
      messages.map((m) => m.ciphertexts.map((ct) => ct.c1)),
      Array(numOptions).fill([0n, 1n])
    ),
    encC2: pad(
      messages.map((m) => m.ciphertexts.map((ct) => ct.c2)),
      Array(numOptions).fill([0n, 1n])
    )
  };
}

/**
 * Test scenario configuration for complex tests
 */
export interface TestScenario {
  name: string;
  numVoters: number;
  numVotes?: number;
  deactivateIndices?: number[];
  addNewKeyIndices?: number[];
  expectedActiveStates?: boolean[];
}

/**
 * Create standard test scenarios
 */
export const testScenarios = {
  standard: {
    name: 'Standard Voting',
    numVoters: 3,
    numVotes: 5
  },
  deactivate: {
    name: 'With Deactivation',
    numVoters: 3,
    deactivateIndices: [0, 1]
  },
  complex: {
    name: 'Complex Multi-cycle',
    numVoters: 5,
    deactivateIndices: [0, 2],
    addNewKeyIndices: [3, 4]
  }
};

/**
 * Standard test accounts for consistent testing
 */
export const standardTestAccounts = {
  coordinator: { secretKey: 111111n },
  voterA: { secretKey: 222222n },
  voterB: { secretKey: 333333n },
  voterC: { secretKey: 444444n },
  voterD: { secretKey: 555555n },
  voterE: { secretKey: 666666n }
};
