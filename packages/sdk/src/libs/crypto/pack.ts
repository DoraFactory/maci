import { UINT32, UINT96 } from './constants';

export function packElement({
  nonce,
  stateIdx,
  voIdx,
  newVotes,
  pollId
}: {
  nonce: number | bigint;
  stateIdx: number | bigint;
  voIdx: number | bigint;
  newVotes: number | bigint;
  pollId: number | bigint;
}): bigint {
  const packaged =
    BigInt(nonce) +
    (BigInt(stateIdx) << 32n) +
    (BigInt(voIdx) << 64n) +
    (BigInt(newVotes) << 96n) +
    (BigInt(pollId) << 192n);

  return packaged;
}

export function unpackElement(packaged: bigint): {
  nonce: bigint;
  stateIdx: bigint;
  voIdx: bigint;
  newVotes: bigint;
  pollId: bigint;
} {
  const nonce = packaged % UINT32;
  const stateIdx = (packaged >> 32n) % UINT32;
  const voIdx = (packaged >> 64n) % UINT32;
  const newVotes = (packaged >> 96n) % UINT96;
  const pollId = (packaged >> 192n) % UINT32;

  return {
    nonce,
    stateIdx,
    voIdx,
    newVotes,
    pollId
  };
}
