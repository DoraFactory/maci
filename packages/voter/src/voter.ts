import CryptoJS from 'crypto-js';
import { solidityPackedSha256 } from 'ethers';
import { groth16 } from 'snarkjs';

import { MaciAccount } from './account';
import {
	packPubKey,
	unpackPubKey,
	genEcdhSharedKey,
	genKeypair,
	genRandomSalt,
	rerandomize,
	Tree,
	stringizing,
	SNARK_FIELD_SIZE,
	adaptToUncompressed,
} from './crypto';
import { poseidon } from './crypto/hashing';
import { poseidonEncrypt } from '@zk-kit/poseidon-cipher';
import {
	ClientParams,
	DerivePathParams,
	PubKey,
	PrivKey,
	DeactivateMessage,
} from './types';

/**
 * @class Maci Voter Client
 * @description This class is used to interact with Maci Voter Client.
 */
export class VoterClient {
	public accountManager: MaciAccount;

	/**
	 * @constructor
	 * @param {ClientParams} params - The parameters for the Maci Voter Client instance.
	 */
	constructor({ mnemonic, secretKey }: ClientParams) {
		this.accountManager = new MaciAccount({ mnemonic, secretKey });
	}

	/**
	 * else:
	 * it will generate signer from the mnemonic with the given derivePathParams.
	 * @param derivePathParams, such as { accountIndex: 2, isExternal: false, addressIndex: 10 }, comply with the BIP44 standard
	 */
	getSigner(derivePathParams?: DerivePathParams) {
		return this.accountManager.getKeyPair(derivePathParams);
	}

	packMaciPubkey(pubkey?: PubKey) {
		return packPubKey(
			pubkey || this.accountManager.currentPubkey.toPoints()
		);
	}

	unpackMaciPubkey(pubkey: bigint | string) {
		return unpackPubKey(BigInt(pubkey));
	}

	getPubkey(derivePathParams?: DerivePathParams) {
		return this.accountManager.getKeyPair(derivePathParams).getPublicKey();
	}

	buildVotePayload({
		stateIdx,
		operatorPubkey,
		selectedOptions,
		derivePathParams,
	}: {
		stateIdx: number;
		operatorPubkey: bigint;
		selectedOptions: {
			idx: number;
			vc: number;
		}[];
		derivePathParams?: DerivePathParams;
	}) {
		// Check for duplicate options
		const idxSet = new Set();
		for (const option of selectedOptions) {
			if (idxSet.has(option.idx)) {
				throw new Error(
					`Duplicate option index (${option.idx}) is not allowed`
				);
			}
			idxSet.add(option.idx);
		}

		// Filter and sort options
		const options = selectedOptions
			.filter(o => !!o.vc)
			.sort((a, b) => a.idx - b.idx);

		const plan = options.map(o => {
			return [o.idx, o.vc] as [number, number];
		});

		const payload = this.batchGenMessage(
			stateIdx,
			operatorPubkey,
			plan,
			derivePathParams
		);

		return stringizing(payload);
	}

	batchGenMessage(
		stateIdx: number,
		operatorPubkey: bigint,
		plan: [number, number][],
		derivePathParams?: DerivePathParams
	) {
		const genMessage = this.genMessageFactory(
			stateIdx,
			operatorPubkey,
			derivePathParams
		);

		const payload = [];
		for (let i = plan.length - 1; i >= 0; i--) {
			const p = plan[i];
			const encAccount = genKeypair();
			const msg = genMessage(
				BigInt(encAccount.privKey),
				i + 1,
				p[0],
				p[1],
				i === plan.length - 1
			);

			payload.push({
				msg,
				encPubkeys: encAccount.pubKey,
			});
		}

		return payload;
	}

	genMessageFactory(
		stateIdx: number,
		operatorPubkey: bigint,
		// signPriKey: PrivKey,
		// signPubKey: PubKey,
		// coordPubKey: PubKey,
		derivePathParams?: DerivePathParams
	) {
		return (
			encPriKey: PrivKey,
			nonce: number,
			voIdx: number,
			newVotes: number,
			isLastCmd: boolean,
			salt?: bigint
		): bigint[] => {
			if (!salt) {
				// uint56
				salt = BigInt(
					`0x${CryptoJS.lib.WordArray.random(7).toString(CryptoJS.enc.Hex)}`
				);
			}

			const packaged =
				BigInt(nonce) +
				(BigInt(stateIdx) << 32n) +
				(BigInt(voIdx) << 64n) +
				(BigInt(newVotes) << 96n) +
				(BigInt(salt) << 192n);

			const signer = this.getSigner(derivePathParams);

			let newPubKey = [...signer.getPublicKey().toPoints()];
			if (isLastCmd) {
				newPubKey = [0n, 0n];
			}

			const hash = poseidon([packaged, ...newPubKey]);
			// const signature = signMessage(bigInt2Buffer(signPriKey), hash);
			const signature = signer.sign(hash);

			const command = [
				packaged,
				...newPubKey,
				...signature.R8,
				signature.S,
			];
			const coordPubkey = this.unpackMaciPubkey(operatorPubkey);

			const message = poseidonEncrypt(
				command,
				genEcdhSharedKey(encPriKey, coordPubkey),
				0n
			);

			return message;
		};
	}

	async buildAddNewKeyPayload({
		stateTreeDepth,
		operatorPubkey,
		deactivates,
		wasmFile,
		zkeyFile,
		derivePathParams,
	}: {
		stateTreeDepth: number;
		operatorPubkey: bigint;
		deactivates: DeactivateMessage[];
		wasmFile: string;
		zkeyFile: string;
		derivePathParams?: DerivePathParams;
	}): Promise<{
		proof: {
			a: string;
			b: string;
			c: string;
		};
		d: string[];
		nullifier: string;
	}> {
		const [coordPubkeyX, coordPubkeyY] =
			this.unpackMaciPubkey(operatorPubkey);
		// const stateTreeDepth = Number(circuitPower.split('-')[0]);
		const addKeyInput = await this.genAddKeyInput(stateTreeDepth + 2, {
			coordPubKey: [coordPubkeyX, coordPubkeyY],
			deactivates: deactivates.map((d: any) => d.map(BigInt)),
			derivePathParams,
		});

		if (addKeyInput === null) {
			throw Error('genAddKeyInput failed');
		}

		// 1. generate proof
		const { proof } = await groth16.fullProve(
			addKeyInput,
			wasmFile,
			zkeyFile
		);

		// 2. compress proof to vote proof
		const proofHex = await adaptToUncompressed(proof);

		// 3. send addNewKey tx
		return {
			proof: proofHex,
			d: [
				addKeyInput.d1[0].toString(),
				addKeyInput.d1[1].toString(),
				addKeyInput.d2[0].toString(),
				addKeyInput.d2[1].toString(),
			],
			nullifier: addKeyInput.nullifier.toString(),
		};
	}

	async genAddKeyInput(
		depth: number,
		{
			coordPubKey,
			deactivates,
			derivePathParams,
		}: {
			coordPubKey: PubKey;
			deactivates: bigint[][];
			derivePathParams?: DerivePathParams;
		}
	) {
		const signer = this.getSigner(derivePathParams);

		const sharedKeyHash = poseidon(signer.genEcdhSharedKey(coordPubKey));

		const randomVal = genRandomSalt();
		const deactivateIdx = deactivates.findIndex(
			d => d[4] === sharedKeyHash
		);
		if (deactivateIdx < 0) {
			return null;
		}

		const deactivateLeaf = deactivates[deactivateIdx];

		const c1 = [deactivateLeaf[0], deactivateLeaf[1]];
		const c2 = [deactivateLeaf[2], deactivateLeaf[3]];

		const { d1, d2 } = rerandomize(coordPubKey, { c1, c2 }, randomVal);

		const nullifier = poseidon([
			signer.getFormatedPrivKey(),
			1444992409218394441042n,
		]);

		const tree = new Tree(5, depth, 0n);
		const leaves = deactivates.map(d => poseidon(d));
		tree.initLeaves(leaves);

		const deactivateRoot = tree.root;
		const deactivateLeafPathElements = tree.pathElementOf(deactivateIdx);

		const inputHash =
			BigInt(
				solidityPackedSha256(
					new Array(7).fill('uint256'),
					stringizing([
						deactivateRoot,
						poseidon(coordPubKey),
						nullifier,
						d1[0],
						d1[1],
						d2[0],
						d2[1],
					]) as string[]
				)
			) % SNARK_FIELD_SIZE;

		const input = {
			inputHash,
			coordPubKey,
			deactivateRoot,
			deactivateIndex: deactivateIdx,
			deactivateLeaf: poseidon(deactivateLeaf),
			c1,
			c2,
			randomVal,
			d1,
			d2,
			deactivateLeafPathElements,
			nullifier,
			oldPrivateKey: signer.getFormatedPrivKey(),
		};

		return input;
	}

	async buildDeactivatePayload({
		stateIdx,
		operatorPubkey,
		derivePathParams,
	}: {
		stateIdx: number;
		operatorPubkey: bigint;
		derivePathParams?: DerivePathParams;
	}) {
		const payload = this.batchGenMessage(
			stateIdx,
			operatorPubkey,
			[[0, 0]],
			derivePathParams
		);
		return stringizing(payload[0]);
	}
}
