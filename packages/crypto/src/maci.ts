import { MaciAccount } from './account';
import { batchGenMessage, packPubKey, unpackPubKey } from './crypto';
import {
	ClientParams,
	CertificateEcosystem,
	DerivePathParams,
	PubKey,
} from './types';

/**
 * @class MaciClient
 * @description This class is used to interact with Maci Client.
 */
export class MaciClient {
	public accountManager: MaciAccount;

	/**
	 * @constructor
	 * @param {ClientParams} params - The parameters for the Maci Client instance.
	 */
	constructor({ mnemonics, secretKey }: ClientParams) {
		this.accountManager = new MaciAccount({ mnemonics, secretKey });
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

	private async processVoteOptions({
		selectedOptions,
		// contractAddress,
		voiceCreditBalance,
	}: {
		selectedOptions: {
			idx: number;
			vc: number;
		}[];
		// contractAddress: string;
		voiceCreditBalance: string;
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

		// Calculate used voice credits
		// const isQv = await this.queryRoundIsQv({ contractAddress });
		const isQv = false;
		const usedVc = options.reduce(
			(s, o) => s + (isQv ? o.vc * o.vc : o.vc),
			0
		);

		if (Number(voiceCreditBalance) < usedVc) {
			throw new Error('Insufficient voice credit balance');
		}

		return options;
	}

	async buildVotePayload({
		selectedOptions,
	}: {
		selectedOptions: {
			idx: number;
			vc: number;
		}[];
	}) {
		const options = await this.processVoteOptions({
			selectedOptions,
			voiceCreditBalance: '1',
		});

		const plan = options.map(o => {
			return [o.idx, o.vc] as [number, number];
		});

		// const payload = batchGenMessage(
		// 	stateIdx,
		// 	this.getSigner(),
		// 	operatorCoordPubKey,
		// 	plan
		// );
	}

	// async buildAddNewKeyPayload() {}
}
