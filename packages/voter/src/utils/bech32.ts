import { bech32 } from 'bech32';

function verifyIsBech32(address: string): Error | undefined {
  try {
    bech32.decode(address);
  } catch (error) {
    return error instanceof Error ? error : new Error('Unknown error');
  }

  return undefined;
}

export function isValidBech32Address(address: string, prefix: string): boolean {
  // An address is valid if it starts with `dora` and is Bech32 format.
  return address.startsWith(prefix) && verifyIsBech32(address) === undefined;
}

export function convertBech32Prefix(
  address: string,
  newPrefix: string
): string {
  // Decode the original address
  const decoded = bech32.decode(address);

  // Encode the address with the new prefix
  const newAddress = bech32.encode(newPrefix, decoded.words);

  return newAddress;
}
