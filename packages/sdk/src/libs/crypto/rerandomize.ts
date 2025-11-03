import { genKeypair } from './keys';
import * as BabyJub from '@zk-kit/baby-jubjub';
import { PubKey } from './types';
import { genRandomBabyJubValue } from './babyjub';

const F = BabyJub.Fr;

/*
 * Converts an arbitrary BigInt, which must be less than the BabyJub field
 * size, into a Message. Each Message has a BabyJub curve point, and an
 * x-increment.
 *
 * @param original The value to encode. It must be less than the BabyJub field
 *                 size.
 */
const encodeToMessage = (original: bigint, randomKey = genKeypair()) => {
  const xIncrement = F.e(F.sub(randomKey.pubKey[0], original));

  return {
    point: {
      x: randomKey.pubKey[0],
      y: randomKey.pubKey[1]
    },
    xIncrement
  };
};

/*
 * Converts a Message into the original value.
 * The original value is the x-value of the BabyJub point minus the
 * x-increment.
 * @param message The message to convert.
 */
const decodeMessage = (message: { point: { x: bigint; y: bigint }; xIncrement: bigint }) => {
  const decoded = BigInt(F.e(F.sub(message.point.x, message.xIncrement)));

  return decoded;
};

const encrypt = (plaintext: bigint, pubKey: PubKey, randomVal = genRandomBabyJubValue()) => {
  const message = encodeToMessage(plaintext);

  const c1Point = BabyJub.mulPointEscalar(BabyJub.Base8, randomVal);

  const pky = BabyJub.mulPointEscalar(pubKey, randomVal);
  const c2Point = BabyJub.addPoint([message.point.x, message.point.y], pky);

  return {
    c1: { x: c1Point[0], y: c1Point[1] },
    c2: { x: c2Point[0], y: c2Point[1] },
    xIncrement: message.xIncrement
  };
};

export const encryptOdevity = (
  isOdd: boolean,
  pubKey: PubKey,
  randomVal = genRandomBabyJubValue()
) => {
  let i = 0n;
  let message = encodeToMessage(123n, genKeypair(randomVal + i));
  while ((message.point.x % 2n === 1n) !== isOdd) {
    i++;
    message = encodeToMessage(123n, genKeypair(randomVal + i));
  }

  const c1Point = BabyJub.mulPointEscalar(BabyJub.Base8, randomVal);

  const pky = BabyJub.mulPointEscalar(pubKey, randomVal);
  const c2Point = BabyJub.addPoint([message.point.x, message.point.y], pky);

  return {
    c1: { x: c1Point[0], y: c1Point[1] },
    c2: { x: c2Point[0], y: c2Point[1] },
    xIncrement: message.xIncrement
  };
};

/*
 * Decrypts a ciphertext using a private key.
 * @param privKey The private key
 * @param ciphertext The ciphertext to decrypt
 */
export const decrypt = (
  formatedPrivKey: bigint,
  ciphertext: { c1: { x: bigint; y: bigint }; c2: { x: bigint; y: bigint }; xIncrement: bigint }
) => {
  const c1x = BabyJub.mulPointEscalar([ciphertext.c1.x, ciphertext.c1.y], formatedPrivKey);

  const c1xInverse = [F.e(c1x[0] * BigInt(-1)), BigInt(c1x[1])] as BabyJub.Point<bigint>;

  const decrypted = BabyJub.addPoint(c1xInverse, [ciphertext.c2.x, ciphertext.c2.y]);

  return decodeMessage({
    point: {
      x: decrypted[0],
      y: decrypted[1]
    },
    xIncrement: ciphertext.xIncrement
  });
};
