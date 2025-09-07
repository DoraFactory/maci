import { Signature } from '@zk-kit/eddsa-poseidon';
import { toBase64, toHex } from '../utils';

import type { PublicKey } from './publickey';
import type { SignatureScheme } from './signature-scheme';
import { BigNumberish } from '@zk-kit/utils';

export interface SignatureWithBytes {
	message: BigNumberish;
	signature: Signature<bigint>;
}

export abstract class Signer {
	abstract sign(message: BigNumberish): Signature<bigint>;
	/**
	 * Sign messages with a specific payload. By combining the message bytes with the payload before hashing and signing,
	 * it ensures that a signed message is tied to a specific purpose and domain separator is provided
	 */
	async signWithPayload(message: BigNumberish): Promise<SignatureWithBytes> {
		const signature = await this.sign(message);

		return {
			message: message,
			signature: signature,
		};
	}

	/**
	 * Get the key scheme of the keypair: Secp256k1 or ED25519
	 */
	abstract getKeyScheme(): SignatureScheme;

	/**
	 * The public key for this keypair
	 */
	abstract getPublicKey(): PublicKey;
}

export abstract class Keypair extends Signer {
	/**
	 * This returns the Bech32 secret key string for this keypair.
	 */
	abstract getSecretKey(): string;
}
