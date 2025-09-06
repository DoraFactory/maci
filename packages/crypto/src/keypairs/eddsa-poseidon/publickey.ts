import { PublicKey } from '../../cryptography/publickey';
import type { PublicKeyInitData } from '../../cryptography/publickey';

import {
  derivePublicKey,
  signMessage,
  deriveSecretScalar,
  verifySignature,
} from '@zk-kit/eddsa-poseidon';
import { packPubKey, unpackPubKey, PubKey, bigInt2Buffer } from '../../crypto';

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
      // 输入是 packed 的公钥
      this.packedData = value;
      this.rawPoint = unpackPubKey(value);
    } else if (Array.isArray(value) && value.length === 2) {
      // 输入是 Point [x, y]
      this.rawPoint = value as PubKey;
      this.packedData = packPubKey(this.rawPoint);
    } else if (typeof value === 'string') {
      // 输入是字符串格式的 packed 公钥
      this.packedData = BigInt(value);
      this.rawPoint = unpackPubKey(this.packedData);
    } else if (value instanceof Uint8Array) {
      // 输入是字节数组，需要转换为 bigint
      const hex = Array.from(value)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      this.packedData = BigInt('0x' + hex);
      this.rawPoint = unpackPubKey(this.packedData);
    } else {
      // 其他可迭代类型
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
   * Return the packed bigint representation of the EdDSAPoseidon public key
   */
  toPackedData(): bigint {
    return this.packedData;
  }

  /**
   * Verifies that the signature is valid for for the provided message
   */
  async verify(message: Uint8Array | string, signature: any): Promise<boolean> {
    try {
      return verifySignature(message, signature, this.rawPoint);
    } catch (error) {
      return false;
    }
  }
}
