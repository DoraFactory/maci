import CryptoJS from 'crypto-js';
import { MaciAccount } from './account';
import {
	packPubKey,
	unpackPubKey,
	genEcdhSharedKey,
	genKeypair,
} from './crypto';
import { poseidon } from './crypto/hashing';
import { poseidonEncrypt } from '@zk-kit/poseidon-cipher';
import { ClientParams, DerivePathParams, PubKey, PrivKey } from './types';

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

		return payload;
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

	// async buildAddNewKeyPayload() {}
}
