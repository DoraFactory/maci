import { Base8, addPoint, mulPointEscalar, Point } from '@zk-kit/baby-jubjub';
import { signMessage } from '@zk-kit/eddsa-poseidon';
import { poseidonEncrypt } from '@zk-kit/poseidon-cipher';

import { bigInt2Buffer } from './bigintUtils';
import { poseidon, hashLeftRight, hash13 } from './hashing';
import { genEcdhSharedKey, genKeypair, formatPrivKeyForBabyJub } from './keys';
import { genRandomBabyJubValue } from './babyjub';
import { PrivKey, PubKey } from './types';

/**
 * Additively-homomorphic (exponential) ElGamal on BabyJubjub — the vote-content
 * layer of the Hybrid MACI + AHE scheme.
 *
 * A weight `v` is encoded as `v*G`, so ciphertexts add homomorphically:
 *   Enc(a) + Enc(b) = Enc(a+b)
 * The coordinator can therefore aggregate every voter's encrypted per-option
 * weight WITHOUT decrypting any single ballot; only the threshold committee that
 * holds shares of Kc decrypts the final per-option aggregate.
 *
 * All scalar/point math here must match the circuits in
 * `packages/circuits/circom/hybrid/` exactly (G = Base8, raw 253-bit scalars).
 */

export type AhePoint = [bigint, bigint];

export interface AheCiphertext {
  c1: AhePoint; // r*G
  c2: AhePoint; // v*G + r*Kc
}

// Generator (same Base8 the circuit's BabyPbk uses).
export const AHE_G: AhePoint = [BigInt(Base8[0]), BigInt(Base8[1])];

// Twisted-Edwards identity / neutral element.
export const AHE_IDENTITY: AhePoint = [0n, 1n];

const toPoint = (p: AhePoint): Point<bigint> => [p[0], p[1]] as Point<bigint>;
const fromPoint = (p: Point<bigint>): AhePoint => [BigInt(p[0]), BigInt(p[1])];

/** Scalar multiply a point: scalar * P (raw scalar, matches the circuit). */
export const ahePointMul = (p: AhePoint, scalar: bigint): AhePoint =>
  fromPoint(mulPointEscalar(toPoint(p), scalar));

/**
 * Derive a committee joint public key from a raw secret scalar: Kc = kc * G.
 * In production kc is never reconstructed; each committee member holds a share
 * and only partial products kc_i * c1 are combined. This helper is for the demo
 * / tests where a single-party stand-in key is convenient.
 */
export const deriveCommitteeKey = (kc: bigint): AhePoint => ahePointMul(AHE_G, kc);

/** Committee partial decryption factor for an aggregate: kc * c1. */
export const committeePartial = (c1: AhePoint, kc: bigint): AhePoint => ahePointMul(c1, kc);

/**
 * Encrypt a single weight to the committee key Kc.
 * @param v plaintext weight
 * @param Kc committee joint public key
 * @param r optional randomness (raw scalar < 2^253); random if omitted
 */
export const encryptAhe = (v: bigint, Kc: AhePoint, r: bigint = genRandomBabyJubValue()): AheCiphertext => {
  const c1 = fromPoint(mulPointEscalar(toPoint(AHE_G), r));
  const vG = mulPointEscalar(toPoint(AHE_G), v);
  const rKc = mulPointEscalar(toPoint(Kc), r);
  const c2 = fromPoint(addPoint(vG, rKc));
  return { c1, c2 };
};

/** Homomorphic addition of two ciphertexts. */
export const addAhe = (a: AheCiphertext, b: AheCiphertext): AheCiphertext => ({
  c1: fromPoint(addPoint(toPoint(a.c1), toPoint(b.c1))),
  c2: fromPoint(addPoint(toPoint(a.c2), toPoint(b.c2)))
});

/** Aggregate a list of ciphertexts (identity for empty list). */
export const aggregateAhe = (cts: AheCiphertext[]): AheCiphertext =>
  cts.reduce<AheCiphertext>((acc, ct) => addAhe(acc, ct), {
    c1: [...AHE_IDENTITY],
    c2: [...AHE_IDENTITY]
  });

/**
 * Commit to a ballot's ciphertext vector. MUST match `AheCommit` in
 * `circom/hybrid/lib/aheCommit.circom`: fold hashLeftRight over the flattened
 * coordinates in order [c1.x, c1.y, c2.x, c2.y] per option.
 */
export const aheCommit = (cts: AheCiphertext[]): bigint => {
  let acc = 0n;
  for (const ct of cts) {
    acc = hashLeftRight(acc, ct.c1[0]);
    acc = hashLeftRight(acc, ct.c1[1]);
    acc = hashLeftRight(acc, ct.c2[0]);
    acc = hashLeftRight(acc, ct.c2[1]);
  }
  return acc;
};

/**
 * Build a one-hot weighted vote vector: `weight` on `voIdx`, 0 elsewhere.
 */
export const buildBallotVector = (voIdx: number, weight: number, numOptions: number): bigint[] => {
  const vec = new Array<bigint>(numOptions).fill(0n);
  vec[voIdx] = BigInt(weight);
  return vec;
};

/**
 * Encrypt a full ballot vector, returning per-option ciphertexts and the
 * randomness used (needed to build the ballotValidity ZK witness).
 */
export const encryptBallot = (
  weights: bigint[],
  Kc: AhePoint
): { ciphertexts: AheCiphertext[]; randomness: bigint[] } => {
  const randomness = weights.map(() => genRandomBabyJubValue());
  const ciphertexts = weights.map((v, i) => encryptAhe(v, Kc, randomness[i]));
  return { ciphertexts, randomness };
};

// BabyJubjub coordinate field modulus (= BN254 scalar field / SNARK field size).
// Point negation of (x, y) on this twisted-Edwards curve is (-x mod P, y).
const AHE_FIELD_P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * Recover `v*G` from an aggregate ciphertext given the committee-combined point
 * `sharedC1 = k_c * c1`.  v*G = c2 - k_c*c1.
 */
export const recoverAhe = (ct: AheCiphertext, sharedC1: AhePoint): AhePoint => {
  const negShared: Point<bigint> = [
    (-sharedC1[0] + AHE_FIELD_P) % AHE_FIELD_P,
    sharedC1[1]
  ] as Point<bigint>;
  return fromPoint(addPoint(toPoint(ct.c2), negShared));
};

/**
 * Baby-step-giant-step discrete log: find v in [0, maxBound] with v*G == P.
 * Vote totals are bounded, so this is cheap.
 */
export const solveDLog = (P: AhePoint, maxBound: number): bigint | null => {
  if (P[0] === AHE_IDENTITY[0] && P[1] === AHE_IDENTITY[1]) return 0n;

  const m = BigInt(Math.floor(Math.sqrt(maxBound)) + 1);
  const key = (p: AhePoint) => `${p[0]},${p[1]}`;

  const table = new Map<string, bigint>();
  let cur: AhePoint = [...AHE_IDENTITY];
  for (let j = 0n; j < m; j++) {
    table.set(key(cur), j);
    cur = fromPoint(addPoint(toPoint(cur), toPoint(AHE_G)));
  }

  const mG = fromPoint(mulPointEscalar(toPoint(AHE_G), m));
  const negMG: AhePoint = [(-mG[0] + AHE_FIELD_P) % AHE_FIELD_P, mG[1]];
  let gamma: AhePoint = [...P];
  for (let i = 0n; i <= m; i++) {
    const hit = table.get(key(gamma));
    if (hit !== undefined) return i * m + hit;
    gamma = fromPoint(addPoint(toPoint(gamma), toPoint(negMG)));
  }
  return null;
};

/**
 * Pack the Hybrid routing scalars into one field element.
 * MUST match UnpackElement(3) in hybridMessageToCommand.circom:
 *   nonce (bits 0-31) | stateIdx (bits 32-63) | pollId (bits 64-95)
 */
export const packHybrid = ({
  nonce,
  stateIdx,
  pollId
}: {
  nonce: number | bigint;
  stateIdx: number | bigint;
  pollId: number | bigint;
}): bigint => BigInt(nonce) + (BigInt(stateIdx) << 32n) + (BigInt(pollId) << 64n);

export interface HybridMessage {
  // Routing envelope (Poseidon-encrypted to the coordinator).
  routing: bigint[]; // 10-element ciphertext
  encPubKey: PubKey; // ephemeral key for ECDH with coordinator
  // The ephemeral PRIVATE key matching `encPubKey` above, ALREADY formatted/
  // pruned for BabyJubjub (i.e. `genKeypair().formatedPrivKey`, matching what
  // `genEcdhSharedKey` uses internally) — the exact scalar `Ecdh()` expects as
  // `privKey` in circom (see that template's own note: "the private key needs
  // to be hashed and pruned first"). Kept around (never published) so the
  // voter's own `BallotValidityOnchain` proof can re-derive the same ECDH
  // shared key and decrypt-check `routing` in-circuit (see
  // `ballotValidity.circom`'s routing-binding step) — this is what lets the
  // ballot proof assert "this stateIdx/aheCommitment is the SAME one signed
  // into the routing envelope" without trusting SDK convention alone.
  ephemeralPrivKey: bigint;
  // Published AHE ballot (committee-encrypted; coordinator cannot decrypt).
  ciphertexts: AheCiphertext[];
  aheCommitment: bigint;
  // Cleartext binding info (for the demo / witness building; not secret).
  stateIdx: number;
  nonce: number;
  randomness: bigint[];
  weights: bigint[];
}

/**
 * Hybrid ballot nullifier: replaces plaintext `stateIdx`/`pubKey` as the
 * PublishHybridMessage public identifier. MUST match `Hasher4` over
 * [stateIdx, pubKey.x, pubKey.y, pollId] in `ballotValidity.circom` — salted
 * with pollId so nullifiers don't correlate across rounds.
 */
export const hybridNullifier = ({
  stateIdx,
  pubKey,
  pollId
}: {
  stateIdx: number | bigint;
  pubKey: PubKey;
  pollId: number | bigint;
}): bigint => poseidon([BigInt(stateIdx), pubKey[0], pubKey[1], BigInt(pollId)]);

/**
 * Fold a routing envelope + its ephemeral pubkey into ONE commitment, using
 * the SAME Hasher13 algorithm (prevHash = 0) as cw-amaci's
 * `hash_message_and_enc_pub_key` / `MessageHasher` in
 * `ballotValidity.circom`. This is what `BallotValidityOnchain` exposes as
 * `routingCommitment`, letting the contract recompute it cheaply from the
 * `routing`/`enc_pub_key` it already received in `PublishHybridMessage`,
 * instead of re-hashing 10 raw field elements through SHA256 again.
 */
export const hybridRoutingCommitment = ({
  routing,
  encPubKey
}: {
  routing: bigint[];
  encPubKey: PubKey;
}): bigint => hash13([...routing, encPubKey[0], encPubKey[1], 0n]);

/** An EdDSA signature over a single field element. */
export type SignFn = (msgHash: bigint) => { R8: [bigint, bigint] | bigint[]; S: bigint };

export interface BuildHybridMessageArgs {
  voterPubKey: PubKey;
  newPubKey?: PubKey;
  coordPubKey: PubKey;
  Kc: AhePoint;
  stateIdx: number;
  nonce: number;
  pollId: number;
  voIdx: number;
  weight: number;
  numOptions: number;
}

/**
 * Core Hybrid message builder that delegates signing to a caller-provided
 * function (so callers can sign with a raw key or with an EdDSA keypair object).
 */
export const buildHybridMessageWithSigner = (
  args: BuildHybridMessageArgs,
  sign: SignFn
): HybridMessage => {
  const { voterPubKey, newPubKey, coordPubKey, Kc, stateIdx, nonce, pollId, voIdx, weight, numOptions } =
    args;

  const weights = buildBallotVector(voIdx, weight, numOptions);
  const { ciphertexts, randomness } = encryptBallot(weights, Kc);
  const aheCommitment = aheCommit(ciphertexts);

  const npk: PubKey = newPubKey ?? [...voterPubKey];
  const packed = packHybrid({ nonce, stateIdx, pollId });

  // Signature preimage: [packed, npk_x, npk_y, aheCommitment] (matches Hasher4).
  const msgHash = poseidon([packed, npk[0], npk[1], aheCommitment]);
  const signature = sign(msgHash);

  // Routing command: [packed, npk_x, npk_y, aheCommitment, R8_x, R8_y, S].
  const command = [
    packed,
    npk[0],
    npk[1],
    aheCommitment,
    BigInt(signature.R8[0]),
    BigInt(signature.R8[1]),
    BigInt(signature.S)
  ];

  const ephemeral = genKeypair();
  const sharedKey = genEcdhSharedKey(ephemeral.privKey, coordPubKey);
  const routing = poseidonEncrypt(command, sharedKey, 0n).map((x) => BigInt(x));

  return {
    routing,
    encPubKey: ephemeral.pubKey,
    ephemeralPrivKey: ephemeral.formatedPrivKey,
    ciphertexts,
    aheCommitment,
    stateIdx,
    nonce,
    randomness,
    weights
  };
};

/**
 * Build a full Hybrid message from a raw MACI private key: encrypts the ballot
 * to Kc, signs the routing command (binding the aheCommitment), and encrypts the
 * routing envelope to the coordinator.
 */
export const buildHybridMessage = (
  args: BuildHybridMessageArgs & { voterPrivKey: PrivKey }
): HybridMessage =>
  buildHybridMessageWithSigner(args, (msgHash) => signMessage(bigInt2Buffer(args.voterPrivKey), msgHash));

/** Format a MACI private key into the raw scalar the ECDH circuit consumes. */
export const coordScalarForCircuit = (coordPrivKey: PrivKey): bigint =>
  formatPrivKeyForBabyJub(coordPrivKey);
