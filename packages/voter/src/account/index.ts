import {
	EdDSAPoseidonKeypair,
	EdDSAPoseidonPublicKey,
} from '../keypairs/eddsa-poseidon';
import { getKeyPair } from './keypair';
import { generateMnemonic } from './crypto';
import type { AccountMangerParams, DerivePathParams } from 'src/types';

export { generateMnemonic } from './crypto';
export { getKeyPair } from './keypair';

export class MaciAccount {
	private mnemonic: string;
	private secretKey: string | bigint;
	public currentKeypair: EdDSAPoseidonKeypair;
	public currentPubkey: EdDSAPoseidonPublicKey;

	/**
	 * Support the following ways to init the SuiToolkit:
	 * 1. mnemonics
	 * 2. secretKey (base64 or hex)
	 * If none of them is provided, will generate a random mnemonics with 24 words.
	 *
	 * @param mnemonics, 12 or 24 mnemonics words, separated by space
	 * @param secretKey, base64 or hex string or Bech32 string, when mnemonics is provided, secretKey will be ignored
	 */
	constructor({ mnemonic, secretKey }: AccountMangerParams = {}) {
		// If the mnemonics or secretKey is provided, use it
		// Otherwise, generate a random mnemonics with 24 words
		this.mnemonic = mnemonic || '';
		this.secretKey = secretKey || '';
		if (!this.mnemonic && !this.secretKey) {
			this.mnemonic = generateMnemonic(24);
		}

		// Init the current account
		this.currentKeypair = this.secretKey
			? this.parseSecretKey(this.secretKey)
			: getKeyPair(this.mnemonic);
		this.currentPubkey = this.currentKeypair.getPublicKey();
	}

	/**
	 * Check if the secretKey starts with bench32 format
	 */
	parseSecretKey(secretKey: string | bigint) {
		return EdDSAPoseidonKeypair.fromSecretKey(secretKey);
	}

	/**
	 * if derivePathParams is not provided or mnemonics is empty, it will return the currentKeyPair.
	 * else:
	 * it will generate keyPair from the mnemonic with the given derivePathParams.
	 */
	getKeyPair(derivePathParams?: DerivePathParams) {
		if (!derivePathParams || !this.mnemonic) return this.currentKeypair;
		return getKeyPair(this.mnemonic, derivePathParams);
	}

	/**
	 * Switch the current account with the given derivePathParams.
	 * This is only useful when the mnemonic is provided. For secretKey mode, it will always use the same account.
	 */
	switchAccount(derivePathParams: DerivePathParams) {
		if (this.mnemonic) {
			this.currentKeypair = getKeyPair(this.mnemonic, derivePathParams);
			this.currentPubkey = this.currentKeypair.getPublicKey();
		}
	}
}
