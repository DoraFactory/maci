/**
 * @file EdDSA-Poseidon Keypair Implementation
 * @description This module provides a complete implementation of EdDSA-Poseidon keypairs
 * for use in zero-knowledge proof systems and MACI (Minimal Anti-Collusion Infrastructure).
 *
 * The EdDSA-Poseidon signature scheme combines:
 * - Edwards-curve Digital Signature Algorithm (EdDSA) for efficient elliptic curve cryptography
 * - Poseidon hash function for ZK-SNARK friendly hashing
 * - BIP-32 hierarchical deterministic key derivation
 * - Support for both JSON payload signing and ZK-optimized credential signing
 *
 * Key features:
 * - Random keypair generation
 * - Keypair derivation from mnemonic phrases
 * - Keypair reconstruction from secret keys
 * - Multiple signing methods for different use cases
 * - Comprehensive input validation and error handling
 *
 * @author MACI Team
 * @version 1.0.0
 */

// Hash function imports for blake2b hashing algorithm
import { blake2b } from '@noble/hashes/blake2b';
// Utility functions for converting between bytes and hex strings
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
// HD (Hierarchical Deterministic) key derivation functionality
import { HDKey } from '@scure/bip32';
// SHA-256 hash function for secure hashing
import { sha256 } from '@noble/hashes/sha256';

// EdDSA-Poseidon cryptographic functions from zk-kit
import {
  derivePublicKey,
  signMessage,
  deriveSecretScalar,
  verifySignature,
  packSignature
  // packPublicKey, // Commented out - not currently used
} from '@zk-kit/eddsa-poseidon';

// Base keypair class and related cryptographic utilities
import { Keypair } from '../../cryptography/keypair';
import { isValidBIP32Path, mnemonicToSeed } from '../../cryptography/mnemonics';
import type { SignatureScheme } from '../../cryptography/signature-scheme';

// EdDSA-Poseidon specific public key implementation
import { EdDSAPoseidonPublicKey } from './publickey';

// Cryptographic utility functions for key generation and manipulation
import {
  bigInt2Buffer,
  buffer2Bigint,
  EcdhSharedKey,
  encryptOdevity,
  formatPrivKeyForBabyJub,
  genKeypair,
  genPubKey,
  genRandomBabyJubValue,
  hash5,
  packPubKey,
  unpackPubKey,
  Point,
  poseidon,
  PubKey,
  SNARK_FIELD_SIZE,
  Tree
} from '../../crypto';

// Type definitions and utility functions
import { BigNumberish } from '@zk-kit/utils';
import { addressToUint256, toBase64 } from 'src/utils';
import { mulPointEscalar } from '@zk-kit/baby-jubjub';

// Default BIP-32 derivation path for EdDSA-Poseidon keypairs
// Uses Cosmos SDK coin type (118) for compatibility with blockchain ecosystems
export const DEFAULT_EDDSA_POSEIDON_DERIVATION_PATH = "m/44'/118'/0'/0/0";

/**
 * Interface defining the structure of EdDSA-Poseidon keypair data
 * Contains both the public and secret key components as bigint values
 */
export interface EdDSAPoseidonKeypairData {
  /** The public key component as a bigint */
  publicKey: bigint;
  /** The secret key component as a bigint */
  secretKey: bigint;
  formatedPrivKey: bigint;
}

/**
 * EdDSA-Poseidon Keypair implementation for zero-knowledge proof systems
 *
 * This class implements the Edwards-curve Digital Signature Algorithm (EdDSA)
 * using the Poseidon hash function, which is optimized for zero-knowledge circuits.
 * It extends the base Keypair class and provides methods for key generation,
 * signing, and cryptographic operations suitable for MACI (Minimal Anti-Collusion Infrastructure).
 */
export class EdDSAPoseidonKeypair extends Keypair {
  /** Private storage for the keypair data */
  private keypair: EdDSAPoseidonKeypairData;

  /**
   * Create a new EdDSA-Poseidon keypair instance.
   *
   * If no keypair data is provided, a new random keypair will be generated
   * using cryptographically secure random number generation.
   *
   * @param keypair Optional existing EdDSA-Poseidon keypair data to initialize with
   */
  constructor(keypair?: EdDSAPoseidonKeypairData) {
    super();
    if (keypair) {
      // Use the provided keypair data
      this.keypair = keypair;
    } else {
      // Generate a new random keypair
      // Note: genRandomBabyJubValue() was the previous approach, now using genKeypair()
      const generatedKeypair = genKeypair();
      const secretKey = generatedKeypair.privKey;
      const unPackedPublicKey = generatedKeypair.pubKey;
      // Pack the public key into a more compact format for storage and transmission
      const publicKey = packPubKey(unPackedPublicKey);

      const formatedPrivKey = formatPrivKeyForBabyJub(secretKey);

      this.keypair = { publicKey, secretKey, formatedPrivKey };
    }
  }

  /**
   * Get the signature scheme identifier for this keypair.
   *
   * @returns The signature scheme type 'EDDSA_POSEIDON'
   */
  getKeyScheme(): SignatureScheme {
    return 'EDDSA_POSEIDON';
  }

  /**
   * Generate a new random EdDSA-Poseidon keypair.
   *
   * This is a convenience static method that creates a new instance
   * with randomly generated cryptographic keys.
   *
   * @returns A new EdDSAPoseidonKeypair instance with random keys
   */
  static generate(): EdDSAPoseidonKeypair {
    return new EdDSAPoseidonKeypair();
  }

  /**
   * Create a keypair from an existing secret key.
   *
   * This method reconstructs a keypair from a previously generated secret key.
   * The secret key can be provided as either a hex string (with or without '0x' prefix)
   * or as a bigint value. For generating keypairs from mnemonic seeds, use the
   * {@link EdDSAPoseidonKeypair.deriveKeypair} method instead.
   *
   * @param secretKey The secret key as a hex string or bigint
   * @param options Configuration options for key reconstruction
   * @param options.skipValidation If true, skips cryptographic validation of the secret key
   *
   * @returns A new EdDSAPoseidonKeypair instance created from the secret key
   * @throws Error if the provided secret key is invalid and validation is not skipped
   */
  static fromSecretKey(
    secretKey: string | bigint,
    options?: { skipValidation?: boolean }
  ): EdDSAPoseidonKeypair {
    // Handle string input by converting hex to bigint
    if (typeof secretKey === 'string') {
      // Remove '0x' prefix if it exists for consistent processing
      const cleanSecretKey = secretKey.startsWith('0x') ? secretKey.slice(2) : secretKey;
      // Convert hex string to bigint
      const decoded = buffer2Bigint(hexToBytes(cleanSecretKey));

      // Recursively call with the decoded bigint value
      return this.fromSecretKey(decoded, options);
    }

    // Generate the corresponding public key from the secret key
    const unPackedPublicKey = genPubKey(secretKey);
    const publicKey = packPubKey(unPackedPublicKey);

    // Perform cryptographic validation unless explicitly skipped
    if (!options || !options.skipValidation) {
      // Create a test message for validation
      const encoder = new TextEncoder();
      const signData = encoder.encode('dora validation');
      const msgHash = bytesToHex(blake2b(signData, { dkLen: 16 }));

      // Sign the test message and verify it with the derived public key
      const signature = signMessage(bigInt2Buffer(secretKey), msgHash);
      if (!verifySignature(msgHash, signature, unPackedPublicKey)) {
        throw new Error('Provided secretKey is invalid');
      }
    }

    const formatedPrivKey = formatPrivKeyForBabyJub(secretKey);
    return new EdDSAPoseidonKeypair({
      publicKey,
      secretKey,
      formatedPrivKey
    });
  }

  /**
   * Get the public key associated with this keypair.
   *
   * @returns An EdDSAPoseidonPublicKey instance containing the public key data
   */
  getPublicKey(): EdDSAPoseidonPublicKey {
    return new EdDSAPoseidonPublicKey(this.keypair.publicKey);
  }

  /**
   * Get the secret key as a hexadecimal string.
   *
   * Returns the secret key component of this keypair encoded as a hex string.
   * This can be used to serialize the secret key for storage or transmission.
   *
   * @returns The secret key encoded as a hexadecimal string
   */
  getSecretKey(): string {
    return bytesToHex(bigInt2Buffer(this.keypair.secretKey));
  }

  getFormatedPrivKey(): bigint {
    return this.keypair.formatedPrivKey;
  }

  /**
   * Sign a message using this keypair's secret key.
   *
   * Creates a cryptographic signature for the provided message using the
   * EdDSA-Poseidon signature algorithm. The signature can later be verified
   * using the corresponding public key.
   *
   * @param message The message to sign (as BigNumberish - can be bigint, string, or number)
   * @returns The cryptographic signature of the message
   */
  sign(message: BigNumberish) {
    const sig = signMessage(bigInt2Buffer(this.keypair.secretKey), message);
    return sig;
  }

  /**
   * Derive an EdDSA-Poseidon keypair from a mnemonic phrase and derivation path.
   *
   * This method implements hierarchical deterministic (HD) key derivation following
   * the BIP-32 standard. The mnemonic phrase must be normalized and validated against
   * the English wordlist before use.
   *
   * @param mnemonics The mnemonic phrase (12, 15, 18, 21, or 24 words)
   * @param path Optional BIP-32 derivation path. If not provided, uses the default path.
   *             Must be in the form m/44'/118'/{account_index}'/{change_index}/{address_index}
   *
   * @returns A new EdDSAPoseidonKeypair derived from the mnemonic and path
   * @throws Error if the derivation path is invalid or key derivation fails
   */
  static deriveKeypair(mnemonics: string, path?: string): EdDSAPoseidonKeypair {
    // Use default derivation path if none provided
    if (path == null) {
      path = DEFAULT_EDDSA_POSEIDON_DERIVATION_PATH;
    }

    // Validate the BIP-32 derivation path format
    if (!isValidBIP32Path(path)) {
      throw new Error('Invalid derivation path');
    }

    // Convert the mnemonic phrase to a cryptographic seed
    const seed = mnemonicToSeed(mnemonics);

    // Create an HD key from the master seed
    const hdKey = HDKey.fromMasterSeed(seed);

    // Derive the specific key using the provided path
    const derivedKey = hdKey.derive(path);

    // Extract the 32-byte private key from the derived key
    if (!derivedKey.privateKey) {
      throw new Error('Invalid key');
    }

    // Convert the private key bytes to hexadecimal string
    const privateKeyHex = Buffer.from(derivedKey.privateKey).toString('hex');

    // Convert hex to bigint and ensure it's within the SNARK field size
    const secretKey = BigInt('0x' + privateKeyHex) % SNARK_FIELD_SIZE;

    // Generate the corresponding public key and pack it for storage
    const unPackedPubKey = genPubKey(secretKey);
    const pubKey = packPubKey(unPackedPubKey);

    return new EdDSAPoseidonKeypair({
      publicKey: pubKey,
      secretKey: secretKey,
      formatedPrivKey: formatPrivKeyForBabyJub(secretKey)
    });
  }

  /**
   * Sign a payload containing contract address and amount information.
   *
   * This method creates a structured payload with the contract address, amount,
   * and public key coordinates, then generates a cryptographic signature over
   * the JSON-serialized payload using SHA-256 hashing.
   *
   * The resulting signature can be used as a certificate or proof of authorization
   * for the specified contract address and amount.
   *
   * @param params The payload parameters
   * @param params.amount The amount value as a string
   * @param params.contractAddress The contract address to include in the payload
   *
   * @returns Base64-encoded signature of the payload
   */
  signPayload({ amount, contractAddress }: { amount: string; contractAddress: string }) {
    // Create a structured payload with all relevant information
    const payload = {
      amount,
      contract_address: addressToUint256(contractAddress).toString(),
      pubkey_x: this.getPublicKey().toPoints()[0].toString(),
      pubkey_y: this.getPublicKey().toPoints()[1].toString()
    };

    // Serialize the payload to bytes and hash it
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const msgHash = sha256(bytes);

    // Sign the hash and return as base64-encoded packed signature
    const signature = this.sign(msgHash);
    return toBase64(new Uint8Array(packSignature(signature)));
  }

  /**
   * Sign a credential containing contract address and amount using Poseidon hashing.
   *
   * This method creates a cryptographic credential by signing a structured message
   * using the Poseidon hash function (hash5). The message includes the amount,
   * contract address (converted to uint256), public key coordinates, and a zero nonce.
   *
   * This type of credential is optimized for zero-knowledge proof systems where
   * Poseidon hashing is more efficient than traditional hash functions.
   *
   * @param params The credential parameters
   * @param params.amount The amount value as a string (will be converted to BigInt)
   * @param params.contractAddress The contract address (will be converted to uint256)
   *
   * @returns Base64-encoded signature of the credential
   */
  signCredential({ amount, contractAddress }: { amount: string; contractAddress: string }) {
    // Create a message hash using Poseidon hash function (hash5)
    // The message contains: [amount, contract_address_as_uint256, pubkey_x, pubkey_y, nonce]
    const messageHash = hash5([
      BigInt(amount),
      BigInt(addressToUint256(contractAddress)),
      this.getPublicKey().toPoints()[0],
      this.getPublicKey().toPoints()[1],
      BigInt(0) // Nonce field (currently set to 0)
    ]);

    // Sign the Poseidon hash and return as base64-encoded packed signature
    const signature = this.sign(messageHash);
    return toBase64(new Uint8Array(packSignature(signature)));
  }

  /**
   * Generates an Elliptic-Curve Diffie–Hellman (ECDH) shared key given a private
   * key and a public key.
   * @param pubKey A public key generated using genPubKey()
   * @returns The ECDH shared key.
   */
  genEcdhSharedKey(pubKey: PubKey): EcdhSharedKey {
    return mulPointEscalar(pubKey as Point<bigint>, this.keypair.formatedPrivKey);
  }

  genDeactivateRoot(
    accounts: PubKey[] | bigint[],
    stateTreeDepth: number
  ): {
    deactivates: bigint[][];
    root: bigint;
    leaves: bigint[];
    tree: Tree;
  } {
    // If accounts are passed as bigint[], unpack them to PubKey[]
    const unpackedAccounts: PubKey[] =
      accounts.length > 0 && typeof accounts[0] === 'bigint'
        ? (accounts as bigint[]).map((account) => unpackPubKey(account))
        : (accounts as PubKey[]);

    // STEP 1: Generate deactivate state tree leaf for each account
    const deactivates = unpackedAccounts.map((account) => {
      // const sharedKey = genEcdhSharedKey(coordinator.privKey, account.pubKey);
      const sharedKey = this.genEcdhSharedKey(account);

      const deactivate = encryptOdevity(
        false, // isOdd: According to circuit rules, odd values indicate active accounts and even values indicate inactive accounts. Set to false here to ensure valid signup
        this.getPublicKey().toPoints(),
        genRandomBabyJubValue()
      );

      return [
        deactivate.c1.x,
        deactivate.c1.y,
        deactivate.c2.x,
        deactivate.c2.y,
        poseidon(sharedKey)
      ];
    });

    // STEP 2: Generate tree root
    const degree = 5;
    const depth = stateTreeDepth + 2;
    const zero = 0n;
    const tree = new Tree(degree, depth, zero);
    const leaves = deactivates.map((deactivate) => poseidon(deactivate));
    tree.initLeaves(leaves);

    return {
      deactivates,
      root: tree.root,
      leaves,
      tree // Return tree instance for later retrieval of path elements
    };
  }
}
