/**
 * This script simulates how to generate a pre-deactivate state tree
 * for anonymously registering all users in an aMACI
 */

import { poseidon } from './hashing';
import { genKeypair, genEcdhSharedKey } from './keys';
import { genRandomBabyJubValue } from './babyjub';

import { encryptOdevity } from './rerandomize';
import { Tree } from './tree';
import { Keypair, PubKey } from './types';

/**
 * Generate the account deactivate state tree
 * @param coordinator The coordinator's keypair
 * @param accounts The list of accounts
 * @param treeConfig The tree configuration parameters
 * @returns An object containing deactivates, root, and leaves
 */
export const genAccountDeactivateRoot = (
	coordinator: Keypair,
	accounts: Keypair[],
	treeConfig = { degree: 5, depth: 3, zero: 0n }
) => {
	// STEP 1: Generate each deactivate state tree leaf
	const deactivates = accounts.map(account => {
		const sharedKey = genEcdhSharedKey(coordinator.privKey, account.pubKey);

		const deactivate = encryptOdevity(
			false, // isOdd: According to the circuit rules, odd numbers indicate active accounts, even numbers indicate inactive accounts. Always set to false here to ensure valid signup
			coordinator.pubKey,
			genRandomBabyJubValue()
		);

		return [
			deactivate.c1.x,
			deactivate.c1.y,
			deactivate.c2.x,
			deactivate.c2.y,
			poseidon(sharedKey),
		];
	});

	// STEP 2: Generate tree root
	const tree = new Tree(treeConfig.degree, treeConfig.depth, treeConfig.zero);
	const leaves = deactivates.map(deactivate => poseidon(deactivate));
	tree.initLeaves(leaves);

	return {
		deactivates,
		root: tree.root,
		leaves,
		tree, // Return tree instance for later retrieval of path elements
	};
};

// Verification phase
// - deactivates is bigint[][] information that needs to be publicly available to users. During the Pre-AddNewKey process, this information is used directly without fetching deactivates from the chain
// - preDeactivateRoot needs to be registered in the contract, making it easy to verify consistency between preDeactivateRoot and deactivates

// Simulate how a user prepares to start Pre-AddNewKey

/**
 * Create a simplified version of the gen proof function
 * Doesn't generate all inputs required for gen proof, just enough for basic data confirmation work
 * @param coordPubKey The coordinator's public key
 * @param userKey The user's keypair
 * @param deactivates The deactivate list
 * @returns An object containing c1 and c2, or null if not found
 */
export const simpleGenAddKeyProof = (
	coordPubKey: PubKey,
	userKey: Keypair,
	deactivates: bigint[][]
) => {
	const sharedKeyHash = poseidon(
		genEcdhSharedKey(userKey.privKey, coordPubKey)
	);

	const deactivateIdx = deactivates.findIndex(d => d[4] === sharedKeyHash);
	if (deactivateIdx < 0) {
		return null;
	}

	const deactivateLeaf = deactivates[deactivateIdx];

	const c1: [bigint, bigint] = [deactivateLeaf[0], deactivateLeaf[1]];
	const c2: [bigint, bigint] = [deactivateLeaf[2], deactivateLeaf[3]];

	// const randomVal = genRandomBabyJubValue();
	// const { d1, d2 } = rerandomize(coordPubKey, { c1, c2 }, randomVal)
	// const nullifier = poseidon([userKey.formatedPrivKey, 1444992409218394441042n])

	// const tree = new Tree(5, depth, 0n)
	// const leaves = deactivates.map((d) => poseidon(d))
	// tree.initLeaves(leaves)

	// const deactivateRoot = tree.root
	// const deactivateLeafPathElements = tree.pathElementOf(deactivateIdx)

	// const inputHash =
	//   BigInt(
	//     solidityPackedSha256(
	//       new Array(7).fill('uint256'),
	//       stringizing([
	//         deactivateRoot,
	//         poseidon(coordPubKey),
	//         nullifier,
	//         d1[0],
	//         d1[1],
	//         d2[0],
	//         d2[1],
	//       ])
	//     )
	//   ) % SNARK_FIELD_SIZE

	// const input = {
	//   inputHash,
	//   coordPubKey,
	//   deactivateRoot,
	//   deactivateIndex: deactivateIdx,
	//   deactivateLeaf: poseidon(deactivateLeaf),
	//   c1,
	//   c2,
	//   randomVal,
	//   d1,
	//   d2,
	//   deactivateLeafPathElements,
	//   nullifier,
	//   oldPrivateKey: userKey.formatedPrivKey,
	// }

	// return input

	return { c1, c2, deactivateIdx };
};

// Usage example: Generate a pre-deactivate state tree
const coordinator = genKeypair();
const accounts: Keypair[] = Array.from({ length: 10 }, () => genKeypair());

const {
	deactivates,
	root: preDeactivateRoot,
	leaves,
} = genAccountDeactivateRoot(coordinator, accounts);

console.log('preDeactivateRoot', preDeactivateRoot);
// console.log('deactivates', deactivates); // Too long, skip printing

// Test example
const randomUserIdx = Math.floor(Math.random() * accounts.length);
const user = accounts[randomUserIdx];

const input = simpleGenAddKeyProof(coordinator.pubKey, user, deactivates);

console.log('user index', randomUserIdx);
console.log('input', input); // Output should not be null

const noneUserIdx = 100;
const noneUser = genKeypair();
const noneInput = simpleGenAddKeyProof(
	coordinator.pubKey,
	noneUser,
	deactivates
);

console.log('noneUser index', noneUserIdx);
console.log('noneInput', noneInput);
