const { genRandomKey, genKeypair } = require("./keypair");
const { babyJub } = require("circom");

const F = babyJub.F;

/*
 * Converts an arbitrary BigInt, which must be less than the BabyJub field
 * size, into a Message. Each Message has a BabyJub curve point, and an
 * x-increment.
 *
 * @param original The value to encode. It must be less than the BabyJub field
 *                 size.
 */
const encodeToMessage = (original, randomKey = genKeypair()) => {
  const xIncrement = F.e(F.sub(randomKey.pubKey[0], original));

  return {
    point: {
      x: randomKey.pubKey[0],
      y: randomKey.pubKey[1],
    },
    xIncrement,
  };
};

/*
 * Converts a Message into the original value.
 * The original value is the x-value of the BabyJub point minus the
 * x-increment.
 * @param message The message to convert.
 */
const decodeMessage = (message) => {
  const decoded = BigInt(F.e(F.sub(message.point.x, message.xIncrement)));

  return decoded;
};

const encrypt = (plaintext, pubKey, randomVal = genRandomKey()) => {
  const message = encodeToMessage(plaintext);

  const c1Point = babyJub.mulPointEscalar(babyJub.Base8, randomVal);

  const pky = babyJub.mulPointEscalar(pubKey, randomVal);
  const c2Point = babyJub.addPoint([message.point.x, message.point.y], pky);

  return {
    c1: { x: c1Point[0], y: c1Point[1] },
    c2: { x: c2Point[0], y: c2Point[1] },
    xIncrement: message.xIncrement,
  };
};

const encryptOdevity = (isOdd, pubKey, randomVal = genRandomKey()) => {
  let i = 0n;
  let message = encodeToMessage(123n, genKeypair(randomVal + i));
  while ((message.point.x % 2n === 1n) ^ isOdd) {
    i++;
    message = encodeToMessage(123n, genKeypair(randomVal + i));
  }

  const c1Point = babyJub.mulPointEscalar(babyJub.Base8, randomVal);

  const pky = babyJub.mulPointEscalar(pubKey, randomVal);
  const c2Point = babyJub.addPoint([message.point.x, message.point.y], pky);

  return {
    c1: { x: c1Point[0], y: c1Point[1] },
    c2: { x: c2Point[0], y: c2Point[1] },
    xIncrement: message.xIncrement,
  };
};

/*
 * Decrypts a ciphertext using a private key.
 * @param privKey The private key
 * @param ciphertext The ciphertext to decrypt
 */
const decrypt = (formatedPrivKey, ciphertext) => {
  const c1x = babyJub.mulPointEscalar(
    [ciphertext.c1.x, ciphertext.c1.y],
    formatedPrivKey
  );

  const c1xInverse = [F.e(c1x[0] * BigInt(-1)), BigInt(c1x[1])];

  const decrypted = babyJub.addPoint(c1xInverse, [
    ciphertext.c2.x,
    ciphertext.c2.y,
  ]);

  return decodeMessage({
    point: {
      x: decrypted[0],
      y: decrypted[1],
    },
    xIncrement: ciphertext.xIncrement,
  });
};

/*
 * Randomize a ciphertext such that it is different from the original
 * ciphertext but can be decrypted by the same private key.
 * @param pubKey The same public key used to encrypt the original plaintext
 * @param ciphertext The ciphertext to re-randomize.
 * @param randomVal A random value z such that the re-randomized ciphertext
 *                  could have been generated a random value y+z in the first
 *                  place (optional)
 */
const rerandomize = (pubKey, ciphertext, randomVal = genRandomKey()) => {
  const d1 = babyJub.addPoint(
    babyJub.mulPointEscalar(babyJub.Base8, randomVal),
    [ciphertext.c1.x, ciphertext.c1.y]
  );

  const d2 = babyJub.addPoint(babyJub.mulPointEscalar(pubKey, randomVal), [
    ciphertext.c2.x,
    ciphertext.c2.y,
  ]);

  return {
    c1: { x: d1[0], y: d1[1] },
    c2: { x: d2[0], y: d2[1] },
    xIncrement: ciphertext.xIncrement,
  };
};

module.exports = {
  encodeToMessage,
  decodeMessage,
  encrypt,
  encryptOdevity,
  decrypt,
  rerandomize,
};
