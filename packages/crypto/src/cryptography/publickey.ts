/**
 * Value to be converted into public key.
 */
export type PublicKeyInitData = string | Uint8Array | Iterable<number>;

export function bytesEqual(a: Uint8Array, b: Uint8Array) {
  if (a === b) return true;

  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * A public key
 */
export abstract class PublicKey {
  /**
   * Checks if two public keys are equal
   */
  equals(publicKey: PublicKey) {
    return this.toPackedData() === publicKey.toPackedData();
  }

  /**
   * Converts the public key to a packed data format
   */
  abstract toPackedData(): bigint;

  /**
   * Verifies that the signature is valid for for the provided message
   */
  abstract verify(
    data: Uint8Array,
    signature: Uint8Array | string
  ): Promise<boolean>;
}
