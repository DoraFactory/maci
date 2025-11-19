import { sha256 } from '@noble/hashes/sha256';

import { PublicKey } from '../../cryptography/publickey';
import type { PublicKeyInitData } from '../../cryptography/publickey';
import {
  derivePublicKey,
  signMessage,
  deriveSecretScalar,
  verifySignature,
  Signature,
  unpackSignature
} from '@zk-kit/eddsa-poseidon';
import { packPubKey, unpackPubKey, PubKey, bigInt2Buffer, hash5 } from '../../crypto';
import { addressToUint256, fromBase64, toHex } from 'src/utils';

/**
 * An EdDSAPoseidon public key
 */
export class EdDSAPoseidonPublicKey extends PublicKey {
  private packedData: bigint;
  private rawPoint: PubKey;

  /**
   * Create a new EdDSAPoseidonPublicKey object
   * @param value public key as packed bigint, Point array, Uint8Array or string
   */
  constructor(value: PublicKeyInitData | bigint | PubKey) {
    super();

    if (typeof value === 'bigint') {
      // Input is a packed public key
      this.packedData = value;
      this.rawPoint = unpackPubKey(value);
    } else if (Array.isArray(value) && value.length === 2) {
      // Input is a Point [x, y]
      this.rawPoint = value as PubKey;
      this.packedData = packPubKey(this.rawPoint);
    } else if (typeof value === 'string') {
      // Input is a string format packed public key
      this.packedData = BigInt(value);
      this.rawPoint = unpackPubKey(this.packedData);
    } else if (value instanceof Uint8Array) {
      // Input is a byte array, needs to be converted to bigint
      const hex = Array.from(value)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      this.packedData = BigInt('0x' + hex);
      this.rawPoint = unpackPubKey(this.packedData);
    } else {
      // Other iterable types
      const bytes = new Uint8Array(value as Iterable<number>);
      const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      this.packedData = BigInt('0x' + hex);
      this.rawPoint = unpackPubKey(this.packedData);
    }
  }

  /**
   * Checks if two EdDSAPoseidon public keys are equal
   */
  override equals(publicKey: EdDSAPoseidonPublicKey): boolean {
    return super.equals(publicKey);
  }

  /**
   * Return the Point representation of the EdDSAPoseidon public key
   */
  toPoints(): PubKey {
    return this.rawPoint;
  }

  /**
   * Return this public key as circuit inputs
   * @returns an array of strings
   */
  asCircuitInputs = (): string[] => [this.rawPoint[0].toString(), this.rawPoint[1].toString()];

  /**
   * Return the packed bigint representation of the EdDSAPoseidon public key
   */
  toPackedData(): bigint {
    return this.packedData;
  }

  /**
   * Verifies that the signature is valid for for the provided message
   */
  verify(message: Uint8Array | string, signature: Signature): boolean {
    try {
      return verifySignature(message, signature, this.rawPoint);
    } catch (error) {
      return false;
    }
  }

  /**
   * Verifies that the signature is valid for the provided address and amount
   */
  verifyPayload({
    amount,
    contractAddress,
    signature
  }: {
    amount: string;
    contractAddress: string;
    signature: string;
  }): boolean {
    const payload = {
      amount,
      contract_address: addressToUint256(contractAddress).toString(),
      pubkey_x: this.toPoints()[0].toString(),
      pubkey_y: this.toPoints()[1].toString()
    };
    const signatureBytes = fromBase64(signature);
    const rawSignature = unpackSignature(new Buffer(signatureBytes));

    const payloadHash = sha256(new TextEncoder().encode(JSON.stringify(payload)));
    return this.verify(payloadHash, rawSignature);
  }

  /**
   * Verifies that the signature is valid for the provided address and amount
   */
  verifyCredential({
    amount,
    contractAddress,
    signature
  }: {
    amount: string;
    contractAddress: string;
    signature: string;
  }): boolean {
    const messageHash = hash5([
      BigInt(amount),
      BigInt(addressToUint256(contractAddress)),
      this.toPoints()[0],
      this.toPoints()[1],
      BigInt(0)
    ]);
    const signatureBytes = fromBase64(signature);
    const rawSignature = unpackSignature(new Buffer(signatureBytes));

    return this.verify(bigInt2Buffer(messageHash), rawSignature);
  }
}
