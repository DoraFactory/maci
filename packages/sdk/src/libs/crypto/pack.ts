import CryptoJS from 'crypto-js';
import { UINT32, UINT96 } from './constants';

export function packElement({
  nonce,
  stateIdx,
  voIdx,
  newVotes,
  salt
}: {
  nonce: number | bigint;
  stateIdx: number | bigint;
  voIdx: number | bigint;
  newVotes: number | bigint;
  salt?: bigint;
}): bigint {
  if (salt === undefined) {
    // uint56
    salt = BigInt(`0x${CryptoJS.lib.WordArray.random(7).toString(CryptoJS.enc.Hex)}`);
  }
  const packaged =
    BigInt(nonce) +
    (BigInt(stateIdx) << 32n) +
    (BigInt(voIdx) << 64n) +
    (BigInt(newVotes) << 96n) +
    (BigInt(salt) << 192n);

  return packaged;
}

export function unpackElement(packaged: bigint): {
  nonce: bigint;
  stateIdx: bigint;
  voIdx: bigint;
  newVotes: bigint;
} {
  const nonce = packaged % UINT32;
  const stateIdx = (packaged >> 32n) % UINT32;
  const voIdx = (packaged >> 64n) % UINT32;
  const newVotes = (packaged >> 96n) % UINT96;

  return {
    nonce,
    stateIdx,
    voIdx,
    newVotes
  };
}
