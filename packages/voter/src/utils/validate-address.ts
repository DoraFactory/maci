import { bech32 } from 'bech32';
import { packPubKey, PubKey } from 'src/crypto';

function verifyIsBech32(address: string): Error | undefined {
  try {
    bech32.decode(address);
  } catch (error) {
    return error instanceof Error ? error : new Error('Unknown error');
  }

  return undefined;
}

export function isValidAddress(address: string): boolean {
  // An address is valid if it starts with `dora` and is Bech32 format.
  return address.startsWith('dora') && verifyIsBech32(address) === undefined;
}

/**
 * Converts a hexadecimal string to a decimal string.
 * @param hexString - The hexadecimal string to convert.
 * @returns The decimal string representation of the input.
 */
export function hexToDecimalString(hexString: string) {
  const decimalString = BigInt('0x' + hexString).toString(10);
  return decimalString;
}

/**
 * Converts a hexadecimal string to a BigInt.
 * @param hexString - The hexadecimal string to convert.
 * @returns The BigInt representation of the input.
 */
export function hexToBigInt(hexString: string) {
  return BigInt('0x' + hexString);
}

function padWithZerosIfNeeded(inputString: string) {
  if (inputString.length === 64) {
    return inputString;
  } else if (inputString.length < 64) {
    const zerosToAdd = 64 - inputString.length;
    const zeroPadding = '0'.repeat(zerosToAdd);
    return zeroPadding + inputString;
  }
  throw new Error('Invalid input string length');
}

/**
 * Parses a public key string into its x and y coordinates.
 * @param publickKey - The public key string to parse (128 characters long).
 * @returns An object containing the x and y coordinates as decimal strings.
 */
export function decompressPublicKey(compressedPubkey: string) {
  const x = compressedPubkey.slice(0, 64);
  const y = compressedPubkey.slice(64);

  return {
    x: hexToDecimalString(x),
    y: hexToDecimalString(y),
  };
}

export function compressPublicKey(decompressedPubkey: any[]) {
  const x = decompressedPubkey[0];
  const y = decompressedPubkey[1];
  const compressedPubkey =
    padWithZerosIfNeeded(x.toString(16)) + padWithZerosIfNeeded(y.toString(16));
  return compressedPubkey;
}

export function transformPubkey(oldPubkey: string) {
  const x = oldPubkey.slice(0, 64);
  const y = oldPubkey.slice(64);

  const pubkey: PubKey = [hexToBigInt(x), hexToBigInt(y)];
  console.log(pubkey);
  console.log([hexToDecimalString(x), hexToDecimalString(y)]);
  const packedPubkey = packPubKey(pubkey);
  return packedPubkey;
}
