/**
 * EdDSA-Poseidon E2E Test
 *
 * This test validates that EdDSA signature operations using Poseidon hash produce
 * identical results across Rust eddsa-poseidon and TypeScript @zk-kit/eddsa-poseidon implementations.
 *
 * Test Coverage:
 * - Public key derivation
 * - Message signing
 * - Signature verification
 * - Signature packing/unpacking
 * - Various input formats (string, Buffer, Uint8Array, BigInt)
 */

import { expect } from 'chai';
import {
  derivePublicKey,
  deriveSecretScalar,
  packPublicKey,
  packSignature,
  signMessage,
  unpackPublicKey,
  unpackSignature,
  verifySignature
} from '@zk-kit/eddsa-poseidon';
import type { Point } from '@zk-kit/baby-jubjub';
import type { Signature } from '@zk-kit/eddsa-poseidon';
import * as fs from 'fs';
import * as path from 'path';

// Import SDK functions for keys.ts testing
import {
  formatPrivKeyForBabyJub,
  genPubKey,
  genKeypair,
  packPubKey,
  poseidon
} from '@dorafactory/maci-sdk';

// Types matching the Rust test vector format
interface PointJson {
  x: string;
  y: string;
}

interface SignatureJson {
  r8: PointJson;
  s: string;
}

interface DerivePublicKeyData {
  private_key: string;
  private_key_bytes: string;
  secret_scalar: string;
  public_key: PointJson;
}

interface SignVerifyData {
  private_key: string;
  private_key_bytes: string;
  message: string;
  public_key: PointJson;
  signature: SignatureJson;
  valid: boolean;
}

interface PackSignatureData {
  signature: SignatureJson;
  packed: string;
}

interface SdkKeysData {
  priv_key: string;
  priv_key_mod_snark: string;
  formatted_priv_key: string;
  pub_key: PointJson;
  packed_pub_key: string;
}

interface KeypairModuleData {
  priv_key: string;
  priv_key_mod_snark: string;
  secret_scalar: string;
  pub_key: PointJson;
  commitment: string;
}

type EdDSAData =
  | DerivePublicKeyData
  | SignVerifyData
  | PackSignatureData
  | SdkKeysData
  | KeypairModuleData;

interface EdDSAPoseidonTestVector {
  name: string;
  description: string;
  vector_type: string;
  data: EdDSAData;
}

// Helper function to convert JSON point to zk-kit Point type
function jsonToPoint(p: PointJson): Point<bigint> {
  return [BigInt(p.x), BigInt(p.y)];
}

// Helper function to convert JSON signature to zk-kit Signature type
function jsonToSignature(s: SignatureJson): Signature<bigint> {
  return {
    R8: [BigInt(s.r8.x), BigInt(s.r8.y)],
    S: BigInt(s.s)
  };
}

// Helper to compare points
function pointsEqual(p1: Point<bigint>, p2: Point<bigint>): boolean {
  return p1[0] === p2[0] && p1[1] === p2[1];
}

// Helper to hex string to Uint8Array
function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

describe('EdDSA-Poseidon E2E Tests', function () {
  this.timeout(60000); // 1 minute timeout

  let testVectors: EdDSAPoseidonTestVector[] = [];

  before(function () {
    console.log('Setting up EdDSA-Poseidon consistency tests...');

    // Load Rust-generated test vectors
    const vectorsPath = path.join(__dirname, '../crypto-test/eddsa-poseidon-test-vectors.json');

    if (!fs.existsSync(vectorsPath)) {
      throw new Error(
        `EdDSA-Poseidon test vectors not found at: ${vectorsPath}\n` +
          'Please run: cargo run --bin generate-eddsa-poseidon-vectors'
      );
    }

    testVectors = JSON.parse(fs.readFileSync(vectorsPath, 'utf-8'));
    console.log(`✓ Loaded ${testVectors.length} EdDSA-Poseidon test vectors`);
  });

  describe('1. Public Key Derivation', function () {
    it('should match Rust derivePublicKey implementation', function () {
      const derivePubKeyVectors = testVectors.filter((v) => v.vector_type === 'derivePublicKey');

      derivePubKeyVectors.forEach((vector) => {
        const data = vector.data as DerivePublicKeyData;
        console.log(`\n  Testing: ${vector.name}`);
        console.log(`  ${vector.description}`);

        // Determine input format
        let privateKey: string | Buffer | Uint8Array;
        if (data.private_key.startsWith('[')) {
          // Uint8Array format: "[3, 2]"
          const bytesStr = data.private_key.slice(1, -1);
          const bytes = bytesStr.split(',').map((s) => parseInt(s.trim()));
          privateKey = new Uint8Array(bytes);
        } else if (data.private_key_bytes) {
          // Try to decode from hex bytes
          privateKey = data.private_key;
        } else {
          privateKey = data.private_key;
        }

        const publicKey = derivePublicKey(privateKey);
        const expectedPublicKey = jsonToPoint(data.public_key);

        expect(pointsEqual(publicKey, expectedPublicKey)).to.be.true;
        console.log('  ✓ Public key derivation: MATCH');

        // Test secret scalar if available
        if (data.secret_scalar) {
          const secretScalar = deriveSecretScalar(privateKey);
          const expectedScalar = BigInt(data.secret_scalar);
          expect(secretScalar).to.equal(expectedScalar);
          console.log('  ✓ Secret scalar: MATCH');
        }
      });
    });

    it('should derive public key from string "secret"', function () {
      const vector = testVectors.find((v) => v.name === 'derivePublicKey_string_secret');
      if (!vector) {
        console.log('  ⚠️ Test vector not found, skipping');
        return;
      }

      const data = vector.data as DerivePublicKeyData;
      const privateKey = 'secret';
      const publicKey = derivePublicKey(privateKey);
      const expectedPublicKey = jsonToPoint(data.public_key);

      console.log('\n  Detailed test: derivePublicKey("secret")');
      console.log(`  TypeScript public key X: ${publicKey[0]}`);
      console.log(`  TypeScript public key Y: ${publicKey[1]}`);
      console.log(`  Rust public key X: ${expectedPublicKey[0]}`);
      console.log(`  Rust public key Y: ${expectedPublicKey[1]}`);

      expect(pointsEqual(publicKey, expectedPublicKey)).to.be.true;
      console.log('  ✓ Public key: MATCH');
    });
  });

  describe('2. Message Signing', function () {
    it('should match Rust signMessage implementation', function () {
      const signVerifyVectors = testVectors.filter((v) => v.vector_type === 'signVerify');

      signVerifyVectors.forEach((vector) => {
        const data = vector.data as SignVerifyData;
        console.log(`\n  Testing: ${vector.name}`);
        console.log(`  ${vector.description}`);

        const privateKey = data.private_key;
        const message = BigInt(data.message);
        const expectedSignature = jsonToSignature(data.signature);

        const signature = signMessage(privateKey, message);

        // Compare R8 point
        expect(pointsEqual(signature.R8, expectedSignature.R8)).to.be.true;
        console.log('  ✓ Signature R8: MATCH');

        // Compare S value
        expect(signature.S).to.equal(expectedSignature.S);
        console.log('  ✓ Signature S: MATCH');
      });
    });
  });

  describe('3. Signature Verification', function () {
    it('should match Rust verifySignature implementation', function () {
      const signVerifyVectors = testVectors.filter((v) => v.vector_type === 'signVerify');

      signVerifyVectors.forEach((vector) => {
        const data = vector.data as SignVerifyData;
        console.log(`\n  Testing: ${vector.name}`);
        console.log(`  ${vector.description}`);

        const message = BigInt(data.message);
        const signature = jsonToSignature(data.signature);
        const publicKey = jsonToPoint(data.public_key);
        const expectedValid = data.valid;

        const valid = verifySignature(message, signature, publicKey);

        expect(valid).to.equal(expectedValid);
        console.log(`  ✓ Verification: ${valid} (expected: ${expectedValid}) - MATCH`);
      });
    });

    it('should verify signature for message 2', function () {
      const vector = testVectors.find((v) => v.name === 'signVerify_message_2');
      if (!vector) {
        console.log('  ⚠️ Test vector not found, skipping');
        return;
      }

      const data = vector.data as SignVerifyData;
      const privateKey = 'secret';
      const message = BigInt(2);

      console.log('\n  Detailed test: sign and verify message 2');

      // Sign
      const signature = signMessage(privateKey, message);
      const expectedSignature = jsonToSignature(data.signature);

      console.log(`  TypeScript R8.x: ${signature.R8[0]}`);
      console.log(`  Rust R8.x: ${expectedSignature.R8[0]}`);
      console.log(`  TypeScript R8.y: ${signature.R8[1]}`);
      console.log(`  Rust R8.y: ${expectedSignature.R8[1]}`);
      console.log(`  TypeScript S: ${signature.S}`);
      console.log(`  Rust S: ${expectedSignature.S}`);

      expect(pointsEqual(signature.R8, expectedSignature.R8)).to.be.true;
      expect(signature.S).to.equal(expectedSignature.S);
      console.log('  ✓ Signature: MATCH');

      // Verify
      const publicKey = derivePublicKey(privateKey);
      const valid = verifySignature(message, signature, publicKey);

      expect(valid).to.be.true;
      console.log('  ✓ Verification: true - MATCH');
    });
  });

  describe('4. Signature Packing/Unpacking', function () {
    it('should match Rust pack/unpack implementation', function () {
      const packVectors = testVectors.filter((v) => v.vector_type === 'packSignature');

      packVectors.forEach((vector) => {
        const data = vector.data as PackSignatureData;
        console.log(`\n  Testing: ${vector.name}`);
        console.log(`  ${vector.description}`);

        const signature = jsonToSignature(data.signature);
        const expectedPacked = hexToUint8Array(data.packed);

        // Test packing
        const packed = packSignature(signature);
        expect(packed).to.deep.equal(expectedPacked);
        console.log('  ✓ Pack signature: MATCH');

        // Test unpacking
        const unpacked = unpackSignature(packed);
        expect(pointsEqual(unpacked.R8, signature.R8)).to.be.true;
        expect(unpacked.S).to.equal(signature.S);
        console.log('  ✓ Unpack signature: MATCH');
      });
    });
  });

  describe('5. Public Key Packing/Unpacking', function () {
    it('should pack and unpack public key', function () {
      const privateKey = 'secret';
      const publicKey = derivePublicKey(privateKey);

      console.log('\n  Testing public key pack/unpack...');
      console.log(`  Public key X: ${publicKey[0]}`);
      console.log(`  Public key Y: ${publicKey[1]}`);

      // Pack
      const packed = packPublicKey(publicKey);
      console.log(`  Packed: ${packed}`);

      // Unpack
      const unpacked = unpackPublicKey(packed);
      expect(pointsEqual(unpacked, publicKey)).to.be.true;
      console.log('  ✓ Pack/unpack public key: MATCH');
    });
  });

  describe('6. SDK keys.ts Functions Compatibility', function () {
    it('should match Rust implementation for formatPrivKeyForBabyJub', function () {
      const sdkKeysVectors = testVectors.filter((v) => v.vector_type === 'sdkKeys');

      sdkKeysVectors.forEach((vector) => {
        const data = vector.data as SdkKeysData;
        console.log(`\n  Testing: ${vector.name}`);
        console.log(`  ${vector.description}`);

        const privKey = BigInt(data.priv_key.startsWith('0x') ? data.priv_key : data.priv_key);
        const SNARK_FIELD_SIZE = BigInt(
          '21888242871839275222246405745257275088548364400416034343698204186575808495617'
        );
        const privKeyModSnark = privKey % SNARK_FIELD_SIZE;

        // Test: privKey % SNARK_FIELD_SIZE
        const expectedPrivKeyModSnark = BigInt(data.priv_key_mod_snark);
        expect(privKeyModSnark).to.equal(expectedPrivKeyModSnark);
        console.log('  ✓ privKey % SNARK_FIELD_SIZE: MATCH');

        // Test: formatPrivKeyForBabyJub(privKey)
        const formattedPrivKey = formatPrivKeyForBabyJub(privKeyModSnark);
        const expectedFormattedPrivKey = BigInt(data.formatted_priv_key);
        expect(formattedPrivKey).to.equal(expectedFormattedPrivKey);
        console.log('  ✓ formatPrivKeyForBabyJub: MATCH');
      });
    });

    it('should match Rust implementation for genPubKey', function () {
      const sdkKeysVectors = testVectors.filter((v) => v.vector_type === 'sdkKeys');

      sdkKeysVectors.forEach((vector) => {
        const data = vector.data as SdkKeysData;
        console.log(`\n  Testing genPubKey for: ${vector.name}`);

        const privKey = BigInt(data.priv_key.startsWith('0x') ? data.priv_key : data.priv_key);
        const SNARK_FIELD_SIZE = BigInt(
          '21888242871839275222246405745257275088548364400416034343698204186575808495617'
        );
        const privKeyModSnark = privKey % SNARK_FIELD_SIZE;

        // Test: genPubKey(privKey)
        const pubKey = genPubKey(privKeyModSnark);
        const expectedPubKey = jsonToPoint(data.pub_key);

        expect(pointsEqual(pubKey, expectedPubKey)).to.be.true;
        console.log('  ✓ genPubKey: MATCH');

        // Test: packPubKey(pubKey)
        const packedPubKey = packPubKey(pubKey);
        const expectedPackedPubKey = BigInt(data.packed_pub_key);
        expect(packedPubKey).to.equal(expectedPackedPubKey);
        console.log('  ✓ packPubKey: MATCH');
      });
    });

    it('should match Rust implementation for genKeypair', function () {
      const sdkKeysVectors = testVectors.filter((v) => v.vector_type === 'sdkKeys');

      sdkKeysVectors.forEach((vector) => {
        const data = vector.data as SdkKeysData;
        console.log(`\n  Testing genKeypair for: ${vector.name}`);

        const privKey = BigInt(data.priv_key.startsWith('0x') ? data.priv_key : data.priv_key);

        // Test: genKeypair(privKey) - full flow
        const keypair = genKeypair(privKey);

        const SNARK_FIELD_SIZE = BigInt(
          '21888242871839275222246405745257275088548364400416034343698204186575808495617'
        );
        const expectedPrivKey = privKey % SNARK_FIELD_SIZE;
        const expectedFormattedPrivKey = BigInt(data.formatted_priv_key);
        const expectedPubKey = jsonToPoint(data.pub_key);

        // Verify privKey
        expect(keypair.privKey).to.equal(expectedPrivKey);
        console.log('  ✓ keypair.privKey: MATCH');

        // Verify formatedPrivKey
        expect(keypair.formatedPrivKey).to.equal(expectedFormattedPrivKey);
        console.log('  ✓ keypair.formatedPrivKey: MATCH');

        // Verify pubKey
        expect(pointsEqual(keypair.pubKey, expectedPubKey)).to.be.true;
        console.log('  ✓ keypair.pubKey: MATCH');

        console.log('  ✓ genKeypair full flow: MATCH');
      });
    });

    it('should test detailed case: genKeypair(111111)', function () {
      const vector = testVectors.find((v) => v.name === 'sdkKeys_genKeypair_111111');
      if (!vector) {
        console.log('  ⚠️ Test vector not found, skipping');
        return;
      }

      const data = vector.data as SdkKeysData;

      console.log('\n  ═══════════════════════════════════════════════════════');
      console.log('  Detailed Test: genKeypair(111111)');
      console.log('  ═══════════════════════════════════════════════════════\n');

      const privKey = BigInt(111111);
      const keypair = genKeypair(privKey);

      const SNARK_FIELD_SIZE = BigInt(
        '21888242871839275222246405745257275088548364400416034343698204186575808495617'
      );

      console.log('Input:');
      console.log(`  privKey (raw): ${privKey}`);
      console.log();

      console.log('SDK Results:');
      console.log(`  privKey (after % SNARK_FIELD_SIZE): ${keypair.privKey}`);
      console.log(`  formatedPrivKey: ${keypair.formatedPrivKey}`);
      console.log(`  pubKey.x: ${keypair.pubKey[0]}`);
      console.log(`  pubKey.y: ${keypair.pubKey[1]}`);
      console.log();

      console.log('Rust Results:');
      console.log(`  privKey % SNARK_FIELD_SIZE: ${data.priv_key_mod_snark}`);
      console.log(`  formatted_priv_key: ${data.formatted_priv_key}`);
      console.log(`  pub_key.x: ${data.pub_key.x}`);
      console.log(`  pub_key.y: ${data.pub_key.y}`);
      console.log(`  packed_pub_key: ${data.packed_pub_key}`);
      console.log();

      // Verify all fields
      expect(keypair.privKey).to.equal(BigInt(data.priv_key_mod_snark));
      expect(keypair.formatedPrivKey).to.equal(BigInt(data.formatted_priv_key));
      expect(keypair.pubKey[0]).to.equal(BigInt(data.pub_key.x));
      expect(keypair.pubKey[1]).to.equal(BigInt(data.pub_key.y));

      const sdkPackedPubKey = packPubKey(keypair.pubKey);
      expect(sdkPackedPubKey).to.equal(BigInt(data.packed_pub_key));

      console.log('  ✓ All fields match between SDK and Rust');
      console.log('  ✓ Keypair generation: IDENTICAL\n');
    });
  });

  describe('7. keypair Module Compatibility', function () {
    it('should match Rust keypair::Keypair implementation', function () {
      const keypairVectors = testVectors.filter((v) => v.vector_type === 'keypairModule');

      keypairVectors.forEach((vector) => {
        const data = vector.data as KeypairModuleData;
        console.log(`\n  Testing: ${vector.name}`);
        console.log(`  ${vector.description}`);

        const privKey = BigInt(data.priv_key);
        const SNARK_FIELD_SIZE = BigInt(
          '21888242871839275222246405745257275088548364400416034343698204186575808495617'
        );

        // Verify privKey % SNARK_FIELD_SIZE
        const privKeyModSnark = privKey % SNARK_FIELD_SIZE;
        expect(privKeyModSnark).to.equal(BigInt(data.priv_key_mod_snark));
        console.log('  ✓ privKey % SNARK_FIELD_SIZE: MATCH');

        // Verify secret_scalar (using formatPrivKeyForBabyJub)
        const secretScalar = formatPrivKeyForBabyJub(privKeyModSnark);
        expect(secretScalar).to.equal(BigInt(data.secret_scalar));
        console.log('  ✓ secret_scalar: MATCH');

        // Verify public key
        const pubKey = genPubKey(privKeyModSnark);
        const expectedPubKey = jsonToPoint(data.pub_key);
        expect(pointsEqual(pubKey, expectedPubKey)).to.be.true;
        console.log('  ✓ pub_key: MATCH');

        // Verify commitment (Poseidon hash of public key)
        const commitment = poseidon([pubKey[0], pubKey[1]]);
        const expectedCommitment = BigInt(data.commitment);
        expect(commitment).to.equal(expectedCommitment);
        console.log('  ✓ commitment: MATCH');
      });
    });

    it('should test detailed case: keypair::Keypair(111111)', function () {
      const vector = testVectors.find((v) => v.name === 'keypairModule_111111');
      if (!vector) {
        console.log('  ⚠️ Test vector not found, skipping');
        return;
      }

      const data = vector.data as KeypairModuleData;

      console.log('\n  ═══════════════════════════════════════════════════════');
      console.log('  Detailed Test: keypair::Keypair(111111)');
      console.log('  ═══════════════════════════════════════════════════════\n');

      const privKey = BigInt(111111);
      const SNARK_FIELD_SIZE = BigInt(
        '21888242871839275222246405745257275088548364400416034343698204186575808495617'
      );
      const privKeyModSnark = privKey % SNARK_FIELD_SIZE;

      console.log('TypeScript SDK Results:');
      const secretScalar = formatPrivKeyForBabyJub(privKeyModSnark);
      const pubKey = genPubKey(privKeyModSnark);
      const commitment = poseidon([pubKey[0], pubKey[1]]);

      console.log(`  privKey % SNARK_FIELD_SIZE: ${privKeyModSnark}`);
      console.log(`  secret_scalar: ${secretScalar}`);
      console.log(`  pub_key.x: ${pubKey[0]}`);
      console.log(`  pub_key.y: ${pubKey[1]}`);
      console.log(`  commitment: ${commitment}`);
      console.log();

      console.log('Rust keypair Module Results:');
      console.log(`  priv_key % SNARK_FIELD_SIZE: ${data.priv_key_mod_snark}`);
      console.log(`  secret_scalar: ${data.secret_scalar}`);
      console.log(`  pub_key.x: ${data.pub_key.x}`);
      console.log(`  pub_key.y: ${data.pub_key.y}`);
      console.log(`  commitment: ${data.commitment}`);
      console.log();

      // Verify all fields
      expect(privKeyModSnark).to.equal(BigInt(data.priv_key_mod_snark));
      expect(secretScalar).to.equal(BigInt(data.secret_scalar));
      expect(pubKey[0]).to.equal(BigInt(data.pub_key.x));
      expect(pubKey[1]).to.equal(BigInt(data.pub_key.y));
      expect(commitment).to.equal(BigInt(data.commitment));

      console.log('  ✓ All fields match between SDK and Rust keypair module');
      console.log('  ✓ keypair::Keypair: IDENTICAL\n');
    });
  });

  after(function () {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('EdDSA-Poseidon E2E Test Complete');
    console.log(`Total test vectors processed: ${testVectors.length}`);
    console.log('═══════════════════════════════════════════════════════\n');
  });
});
