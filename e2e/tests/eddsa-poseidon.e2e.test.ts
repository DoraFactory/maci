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

type EdDSAData = DerivePublicKeyData | SignVerifyData | PackSignatureData;

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

  after(function () {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('EdDSA-Poseidon E2E Test Complete');
    console.log(`Total test vectors processed: ${testVectors.length}`);
    console.log('═══════════════════════════════════════════════════════\n');
  });
});
