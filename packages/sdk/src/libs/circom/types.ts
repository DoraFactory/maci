export type CircomParams = {
  network: 'mainnet' | 'testnet';
};

export type SignResult = {
  signature: string;
  pubkey: Uint8Array;
};
