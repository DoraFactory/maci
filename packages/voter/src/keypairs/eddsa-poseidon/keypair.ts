import { blake2b } from '@noble/hashes/blake2b';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { HDKey } from '@scure/bip32';
import { sha256 } from '@noble/hashes/sha256';

import {
	derivePublicKey,
	signMessage,
	deriveSecretScalar,
	verifySignature,
	packSignature,

	//   packPublicKey,
} from '@zk-kit/eddsa-poseidon';
import { Keypair } from '../../cryptography/keypair';
import { isValidBIP32Path, mnemonicToSeed } from '../../cryptography/mnemonics';
import type { SignatureScheme } from '../../cryptography/signature-scheme';
import { EdDSAPoseidonPublicKey } from './publickey';
import {
	bigInt2Buffer,
	buffer2Bigint,
	formatPrivKeyForBabyJub,
	genKeypair,
	genPubKey,
	hash5,
	packPubKey,
	SNARK_FIELD_SIZE,
} from '../../crypto';
import { BigNumberish } from '@zk-kit/utils';
import { addressToUint256, toBase64 } from 'src/utils';

export const DEFAULT_EDDSA_POSEIDON_DERIVATION_PATH = "m/44'/118'/0'/0/0";

/**
 * EdDSAPoseidon Keypair data
 */
export interface EdDSAPoseidonKeypairData {
	publicKey: bigint;
	secretKey: bigint;
}

/**
 * An EdDSAPoseidon Keypair used for signing transactions.
 */
export class EdDSAPoseidonKeypair extends Keypair {
	private keypair: EdDSAPoseidonKeypairData;

	/**
	 * Create a new keypair instance.
	 * Generate random keypair if no {@link EdDSAPoseidonKeypair} is provided.
	 *
	 * @param keypair eddsa poseidon keypair
	 */
	constructor(keypair?: EdDSAPoseidonKeypairData) {
		super();
		if (keypair) {
			this.keypair = keypair;
		} else {
			//   const secretKey: Uint8Array = genRandomBabyJubValue();
			const keypair = genKeypair();
			const secretKey = keypair.privKey;
			const unPackedPublicKey = keypair.pubKey;
			const publicKey = packPubKey(unPackedPublicKey);

			this.keypair = { publicKey, secretKey };
		}
	}

	/**
	 * Get the key scheme of the keypair EdDSAPoseidon
	 */
	getKeyScheme(): SignatureScheme {
		return 'EDDSA_POSEIDON';
	}

	/**
	 * Generate a new random keypair
	 */
	static generate(): EdDSAPoseidonKeypair {
		return new EdDSAPoseidonKeypair();
	}

	/**
	 * Create a keypair from a raw secret key byte array.
	 *
	 * This method should only be used to recreate a keypair from a previously
	 * generated secret key. Generating keypairs from a random seed should be done
	 * with the {@link Keypair.fromSeed} method.
	 *
	 * @throws error if the provided secret key is invalid and validation is not skipped.
	 *
	 * @param secretKey secret key byte array  or Bech32 secret key string
	 * @param options: skip secret key validation
	 */

	static fromSecretKey(
		secretKey: string | bigint,
		options?: { skipValidation?: boolean }
	): EdDSAPoseidonKeypair {
		if (typeof secretKey === 'string') {
			// Remove '0x' prefix if it exists
			const cleanSecretKey = secretKey.startsWith('0x')
				? secretKey.slice(2)
				: secretKey;
			const decoded = buffer2Bigint(hexToBytes(cleanSecretKey));

			return this.fromSecretKey(decoded, options);
		}

		const unPackedPublicKey = genPubKey(secretKey);
		const publicKey = packPubKey(unPackedPublicKey);
		if (!options || !options.skipValidation) {
			const encoder = new TextEncoder();
			const signData = encoder.encode('dora validation');
			const msgHash = bytesToHex(blake2b(signData, { dkLen: 16 }));

			const signature = signMessage(bigInt2Buffer(secretKey), msgHash);
			if (!verifySignature(msgHash, signature, unPackedPublicKey)) {
				throw new Error('Provided secretKey is invalid');
			}
		}
		return new EdDSAPoseidonKeypair({ publicKey, secretKey });
	}

	/**
	 * The public key for this keypair
	 */
	getPublicKey(): EdDSAPoseidonPublicKey {
		return new EdDSAPoseidonPublicKey(this.keypair.publicKey);
	}

	/**
	 * The Bech32 secret key string for this EdDSAPoseidon keypair
	 */
	getSecretKey(): string {
		return bytesToHex(bigInt2Buffer(this.keypair.secretKey));
	}

	/**
	 * Return the signature for the provided data.
	 */
	sign(message: BigNumberish) {
		const sig = signMessage(bigInt2Buffer(this.keypair.secretKey), message);
		return sig;
	}

	/**
	 * Derive EdDSAPoseidon keypair from mnemonics and path. The mnemonics must be normalized
	 * and validated against the english wordlist.
	 *
	 * If path is none, it will default to m/54'/784'/0'/0/0, otherwise the path must
	 * be compliant to BIP-32 in form m/54'/784'/{account_index}'/{change_index}/{address_index}.
	 */
	static deriveKeypair(
		mnemonics: string,
		path?: string
	): EdDSAPoseidonKeypair {
		if (path == null) {
			path = DEFAULT_EDDSA_POSEIDON_DERIVATION_PATH;
		}

		if (!isValidBIP32Path(path)) {
			throw new Error('Invalid derivation path');
		}

		// 将助记词转换为种子
		const seed = mnemonicToSeed(mnemonics);

		// 使用种子创建HD密钥
		const hdKey = HDKey.fromMasterSeed(seed);

		// 根据派生路径派生密钥
		const derivedKey = hdKey.derive(path);

		// 获取32字节的私钥
		if (!derivedKey.privateKey) {
			throw new Error('Invalid key');
		}

		// 将私钥转换为bigint
		const privateKeyHex = Buffer.from(derivedKey.privateKey).toString(
			'hex'
		);

		const secretKey = BigInt('0x' + privateKeyHex) % SNARK_FIELD_SIZE;
		const unPackedPubKey = genPubKey(secretKey);
		const pubKey = packPubKey(unPackedPubKey);

		return new EdDSAPoseidonKeypair({
			publicKey: pubKey,
			secretKey: secretKey,
		});
	}

	/**
	 * Signs a payload containing an address and amount to generate a signature certificate.
	 * The signature can be used as proof/credential for the specified address and amount.
	 * @param address The address to sign for
	 * @param amount The amount to sign for
	 * @returns A signature and the original signed bytes
	 */
	signPayload({
		amount,
		contractAddress,
	}: {
		amount: string;
		contractAddress: string;
	}) {
		const payload = {
			amount,
			pubkey_x: this.getPublicKey().toPoints()[0],
			pubkey_y: this.getPublicKey().toPoints()[1],
			contract_address: contractAddress,
		};
		const bytes = new TextEncoder().encode(JSON.stringify(payload));
		const msgHash = sha256(bytes);
		const signature = this.sign(msgHash);

		return toBase64(new Uint8Array(packSignature(signature)));
	}

	/**
	 * Signs a payload containing an address and amount to generate a signature certificate.
	 * The signature can be used as proof/credential for the specified address and amount.
	 * @param address The address to sign for
	 * @param amount The amount to sign for
	 * @returns A signature and the original signed bytes
	 */
	signCredential({
		amount,
		contractAddress,
	}: {
		amount: string;
		contractAddress: string;
	}) {
		const messageHash = hash5([
			this.getPublicKey().toPoints()[0],
			this.getPublicKey().toPoints()[1],
			BigInt(amount),
			BigInt(addressToUint256(contractAddress)),
			BigInt(0),
		]);
		console.log([
			this.getPublicKey().toPoints()[0],
			this.getPublicKey().toPoints()[1],
			BigInt(amount),
			BigInt(addressToUint256(contractAddress)),
			BigInt(0),
		]);
		console.log('messageHash', messageHash);
		const signature = this.sign(messageHash);
		return toBase64(new Uint8Array(packSignature(signature)));
	}
}
