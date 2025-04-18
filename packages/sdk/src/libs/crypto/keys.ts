import CryptoJS from 'crypto-js';
import { bigInt2Buffer, stringizing } from './bigintUtils';
import { poseidonEncrypt } from '@zk-kit/poseidon-cipher';
import * as BabyJub from '@zk-kit/baby-jubjub';
import { Point } from '@zk-kit/baby-jubjub';
import {
  derivePublicKey,
  signMessage,
  deriveSecretScalar,
} from '@zk-kit/eddsa-poseidon';

import { solidityPackedSha256 } from 'ethers';

import { mulPointEscalar } from '@zk-kit/baby-jubjub';
import { packPublicKey, unpackPublicKey } from '@zk-kit/eddsa-poseidon';

import { genRandomBabyJubValue } from './babyjub';
import { EcdhSharedKey, Keypair, PrivKey, PubKey } from './types';
import { poseidon } from './hashing';
import Tree from './tree';

const SNARK_FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * Generate a private key
 * @returns A random seed for a private key.
 */
export const genPrivKey = (): bigint =>
  BigInt(`0x${CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex)}`);

/**
 * Generate a random value
 * @returns A BabyJub-compatible salt.
 */
export const genRandomSalt = (): bigint => genRandomBabyJubValue();

/**
 * An internal function which formats a random private key to be compatible
 * with the BabyJub curve. This is the format which should be passed into the
 * PubKey and other circuits.
 * @param privKey A private key generated using genPrivKey()
 * @returns A BabyJub-compatible private key.
 */
export const formatPrivKeyForBabyJub = (privKey: PrivKey): bigint =>
  BigInt(deriveSecretScalar(bigInt2Buffer(privKey)));

/**
 * Losslessly reduces the size of the representation of a public key
 * @param pubKey The public key to pack
 * @returns A packed public key
 */
export const packPubKey = (pubKey: PubKey): bigint =>
  BigInt(packPublicKey(pubKey));

/**
 * Restores the original PubKey from its packed representation
 * @param packed The value to unpack
 * @returns The unpacked public key
 */
export const unpackPubKey = (packed: bigint): PubKey => {
  const pubKey = unpackPublicKey(packed);
  return pubKey.map((x) => BigInt(x)) as PubKey;
};

/**
 * @param privKey A private key generated using genPrivKey()
 * @returns A public key associated with the private key
 */
export const genPubKey = (privKey: PrivKey): PubKey => {
  const key = derivePublicKey(bigInt2Buffer(privKey));
  return [BigInt(key[0]), BigInt(key[1])];
};

/**
 * Generates a keypair.
 * @returns a keypair
 */
export const genKeypair = (pkey?: PrivKey): Keypair => {
  const privKey = pkey ? pkey % SNARK_FIELD_SIZE : genPrivKey();
  const pubKey = genPubKey(privKey);
  const formatedPrivKey = formatPrivKeyForBabyJub(privKey);

  const keypair: Keypair = { privKey, pubKey, formatedPrivKey };

  return keypair;
};

/**
 * Generates an Elliptic-Curve Diffie–Hellman (ECDH) shared key given a private
 * key and a public key.
 * @param privKey A private key generated using genPrivKey()
 * @param pubKey A public key generated using genPubKey()
 * @returns The ECDH shared key.
 */
export const genEcdhSharedKey = (
  privKey: PrivKey,
  pubKey: PubKey
): EcdhSharedKey =>
  mulPointEscalar(pubKey as Point<bigint>, formatPrivKeyForBabyJub(privKey));

export const genMessageFactory =
  (
    stateIdx: number,
    signPriKey: PrivKey,
    signPubKey: PubKey,
    coordPubKey: PubKey
  ) =>
  (
    encPriKey: PrivKey,
    nonce: number,
    voIdx: number,
    newVotes: number,
    isLastCmd: boolean,
    salt?: bigint
  ): bigint[] => {
    if (!salt) {
      // uint56
      salt = BigInt(
        `0x${CryptoJS.lib.WordArray.random(7).toString(CryptoJS.enc.Hex)}`
      );
    }

    const packaged =
      BigInt(nonce) +
      (BigInt(stateIdx) << 32n) +
      (BigInt(voIdx) << 64n) +
      (BigInt(newVotes) << 96n) +
      (BigInt(salt) << 192n);

    let newPubKey = [...signPubKey];
    if (isLastCmd) {
      newPubKey = [0n, 0n];
    }

    const hash = poseidon([packaged, ...newPubKey]);
    const signature = signMessage(bigInt2Buffer(signPriKey), hash);

    const command = [packaged, ...newPubKey, ...signature.R8, signature.S];

    const message = poseidonEncrypt(
      command,
      genEcdhSharedKey(encPriKey, coordPubKey),
      0n
    );

    return message;
  };

// Batch generate encrypted commands.
// output format just like (with commands 1 ~ N):
// [
//   [msg_N, msg_N-1, ... msg_3, msg_2, msg_1],
//   [pubkey_N, pubkey_N-1, ... pubkey_3, pubkey_2, pubkey_1]
// ]
// and change the public key at command_N
export const batchGenMessage = (
  stateIdx: number,
  keypair: Keypair,
  coordPubKey: PubKey,
  plan: [number, number][]
) => {
  const genMessage = genMessageFactory(
    stateIdx,
    BigInt(keypair.privKey),
    keypair.pubKey,
    coordPubKey
  );

  const payload = [];
  for (let i = plan.length - 1; i >= 0; i--) {
    const p = plan[i];
    const encAccount = genKeypair();
    const msg = genMessage(
      BigInt(encAccount.privKey),
      i + 1,
      p[0],
      p[1],
      i === plan.length - 1
    );

    payload.push({
      msg,
      encPubkeys: encAccount.pubKey,
    });
  }

  return payload;
};

export const privateKeyFromTxt = (txt: string) => {
  if (typeof txt !== 'string') {
    return;
  }
  const key = txt.split('\n')[1] || '';
  if (key.length !== 512) {
    return;
  }
  const keys = key.match(/[0-9a-f]{128}/g);
  if (!keys || keys.length !== 4) {
    return;
  }
  const priKey = poseidon(keys.map((k) => BigInt('0x' + k)));
  return genKeypair(priKey % SNARK_FIELD_SIZE);
};

const rerandomize = (
  pubKey: bigint[],
  ciphertext: { c1: bigint[]; c2: bigint[] },
  randomVal = genRandomSalt()
) => {
  const d1 = BabyJub.addPoint(
    BabyJub.mulPointEscalar(BabyJub.Base8, randomVal),
    ciphertext.c1 as Point<bigint>
  );

  const d2 = BabyJub.addPoint(
    BabyJub.mulPointEscalar(pubKey as Point<bigint>, randomVal),
    ciphertext.c2 as Point<bigint>
  );

  return {
    d1,
    d2,
  } as { d1: bigint[]; d2: bigint[] };
};

export const genAddKeyInput = (
  depth: number,
  {
    coordPubKey,
    oldKey,
    deactivates,
  }: {
    coordPubKey: PubKey;
    oldKey: Keypair;
    deactivates: bigint[][];
  }
) => {
  const sharedKeyHash = poseidon(genEcdhSharedKey(oldKey.privKey, coordPubKey));

  const randomVal = genRandomSalt();
  const deactivateIdx = deactivates.findIndex((d) => d[4] === sharedKeyHash);
  if (deactivateIdx < 0) {
    return null;
  }

  const deactivateLeaf = deactivates[deactivateIdx];

  const c1 = [deactivateLeaf[0], deactivateLeaf[1]];
  const c2 = [deactivateLeaf[2], deactivateLeaf[3]];

  const { d1, d2 } = rerandomize(coordPubKey, { c1, c2 }, randomVal);

  const nullifier = poseidon([
    BigInt(oldKey.formatedPrivKey),
    1444992409218394441042n,
  ]);

  const tree = new Tree(5, depth, 0n);
  const leaves = deactivates.map((d) => poseidon(d));
  tree.initLeaves(leaves);

  const deactivateRoot = tree.root;
  const deactivateLeafPathElements = tree.pathElementOf(deactivateIdx);

  const inputHash =
    BigInt(
      solidityPackedSha256(
        new Array(7).fill('uint256'),
        stringizing([
          deactivateRoot,
          poseidon(coordPubKey),
          nullifier,
          d1[0],
          d1[1],
          d2[0],
          d2[1],
        ]) as string[]
      )
    ) % SNARK_FIELD_SIZE;

  const input = {
    inputHash,
    coordPubKey,
    deactivateRoot,
    deactivateIndex: deactivateIdx,
    deactivateLeaf: poseidon(deactivateLeaf),
    c1,
    c2,
    randomVal,
    d1,
    d2,
    deactivateLeafPathElements,
    nullifier,
    oldPrivateKey: oldKey.formatedPrivKey,
  };

  return input;
};

// LIB
function randomUint256() {
  const buffer = [];
  for (let i = 0; i < 64; i++) {
    buffer.push(
      Math.floor(Math.random() * 256)
        .toString(16)
        .padStart(2, '0')
    );
  }
  return buffer.join('');
}

export const genRandomKey = () => {
  const key = [
    randomUint256(),
    randomUint256(),
    randomUint256(),
    randomUint256(),
  ].join('');
  return ['-----BEGIN MACI KEY-----', key, '-----END MACI KEY-----'].join('\n');
};
