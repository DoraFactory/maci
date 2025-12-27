/**
 * Baby Jubjub E2E Test
 *
 * This test validates that Baby Jubjub elliptic curve operations produce identical results
 * across Rust baby-jubjub and TypeScript @zk-kit/baby-jubjub implementations.
 *
 * Test Coverage:
 * - Point addition
 * - Scalar multiplication
 * - Pack/unpack points
 * - Point validation (inCurve)
 */

import { expect } from 'chai';
import {
  addPoint,
  Base8,
  inCurve,
  mulPointEscalar,
  packPoint,
  unpackPoint,
  Point
} from '@zk-kit/baby-jubjub';
import * as fs from 'fs';
import * as path from 'path';

// Types matching the Rust test vector format
interface PointJson {
  x: string;
  y: string;
}

interface AddPointData {
  p1: PointJson;
  p2: PointJson;
  result: PointJson;
}

interface MulPointEscalarData {
  base: PointJson;
  scalar: string;
  result: PointJson;
}

interface PackUnpackData {
  point: PointJson;
  packed: string;
}

interface InCurveData {
  point: PointJson;
  on_curve: boolean;
}

type BabyJubjubData = AddPointData | MulPointEscalarData | PackUnpackData | InCurveData;

interface BabyJubjubTestVector {
  name: string;
  description: string;
  vector_type: string;
  data: BabyJubjubData;
}

// Helper function to convert JSON point to zk-kit Point type
function jsonToPoint(p: PointJson): Point<bigint> {
  return [BigInt(p.x), BigInt(p.y)];
}

// Helper to compare points
function pointsEqual(p1: Point<bigint>, p2: Point<bigint>): boolean {
  return p1[0] === p2[0] && p1[1] === p2[1];
}

describe('Baby Jubjub E2E Tests', function () {
  this.timeout(60000); // 1 minute timeout

  let testVectors: BabyJubjubTestVector[] = [];

  before(function () {
    console.log('Setting up Baby Jubjub consistency tests...');

    // Load Rust-generated test vectors
    const vectorsPath = path.join(__dirname, '../crypto-test/baby-jubjub-test-vectors.json');

    if (!fs.existsSync(vectorsPath)) {
      throw new Error(
        `Baby Jubjub test vectors not found at: ${vectorsPath}\n` +
          'Please run: cargo run --bin generate-baby-jubjub-vectors'
      );
    }

    testVectors = JSON.parse(fs.readFileSync(vectorsPath, 'utf-8'));
    console.log(`✓ Loaded ${testVectors.length} Baby Jubjub test vectors`);
  });

  describe('1. Point Addition', function () {
    it('should match Rust addPoint implementation', function () {
      const addPointVectors = testVectors.filter((v) => v.vector_type === 'addPoint');

      addPointVectors.forEach((vector) => {
        const data = vector.data as AddPointData;
        console.log(`\n  Testing: ${vector.name}`);
        console.log(`  ${vector.description}`);

        const p1 = jsonToPoint(data.p1);
        const p2 = jsonToPoint(data.p2);
        const expectedResult = jsonToPoint(data.result);

        const result = addPoint(p1, p2);

        expect(pointsEqual(result, expectedResult)).to.be.true;
        console.log('  ✓ Point addition: MATCH');
      });
    });
  });

  describe('2. Scalar Multiplication', function () {
    it('should match Rust mulPointEscalar implementation', function () {
      const mulVectors = testVectors.filter((v) => v.vector_type === 'mulPointEscalar');

      mulVectors.forEach((vector) => {
        const data = vector.data as MulPointEscalarData;
        console.log(`\n  Testing: ${vector.name}`);
        console.log(`  ${vector.description}`);

        const base = jsonToPoint(data.base);
        const scalar = BigInt(data.scalar);
        const expectedResult = jsonToPoint(data.result);

        const result = mulPointEscalar(base, scalar);

        expect(pointsEqual(result, expectedResult)).to.be.true;
        console.log(`  ✓ Scalar ${data.scalar}: MATCH`);
      });
    });
  });

  describe('3. Pack/Unpack Points', function () {
    it('should match Rust pack/unpack implementation', function () {
      const packVectors = testVectors.filter((v) => v.vector_type === 'packUnpack');

      packVectors.forEach((vector) => {
        const data = vector.data as PackUnpackData;
        console.log(`\n  Testing: ${vector.name}`);
        console.log(`  ${vector.description}`);

        const point = jsonToPoint(data.point);
        const expectedPacked = BigInt(data.packed);

        // Test packing
        const packed = packPoint(point);
        expect(packed).to.equal(expectedPacked);
        console.log('  ✓ Pack point: MATCH');

        // Test unpacking
        const unpacked = unpackPoint(packed);
        expect(unpacked).to.not.be.null;
        if (unpacked) {
          expect(pointsEqual(unpacked, point)).to.be.true;
          console.log('  ✓ Unpack point: MATCH');
        }
      });
    });
  });

  describe('4. Point Validation (inCurve)', function () {
    it('should match Rust inCurve implementation', function () {
      const inCurveVectors = testVectors.filter((v) => v.vector_type === 'inCurve');

      inCurveVectors.forEach((vector) => {
        const data = vector.data as InCurveData;
        console.log(`\n  Testing: ${vector.name}`);
        console.log(`  ${vector.description}`);

        const point = jsonToPoint(data.point);
        const expectedOnCurve = data.on_curve;

        const result = inCurve(point);

        expect(result).to.equal(expectedOnCurve);
        console.log(`  ✓ inCurve: ${result} (expected: ${expectedOnCurve}) - MATCH`);
      });
    });
  });

  describe('5. Base8 Point', function () {
    it('should verify Base8 point matches Rust implementation', function () {
      // Base8 coordinates from Rust implementation
      const expectedBase8X = BigInt(
        '5299619240641551281634865583518297030282874472190772894086521144482721001553'
      );
      const expectedBase8Y = BigInt(
        '16950150798460657717958625567821834550301663161624707787222815936182638968203'
      );

      console.log('\n  Verifying Base8 point...');
      console.log(`  Expected X: ${expectedBase8X}`);
      console.log(`  Expected Y: ${expectedBase8Y}`);
      console.log(`  Actual X: ${Base8[0]}`);
      console.log(`  Actual Y: ${Base8[1]}`);

      expect(Base8[0]).to.equal(expectedBase8X);
      expect(Base8[1]).to.equal(expectedBase8Y);

      // Verify it's on the curve
      const onCurve = inCurve(Base8);
      expect(onCurve).to.be.true;

      console.log('  ✓ Base8 point: MATCH');
      console.log('  ✓ Base8 on curve: true');
    });
  });

  after(function () {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('Baby Jubjub E2E Test Complete');
    console.log(`Total test vectors processed: ${testVectors.length}`);
    console.log('═══════════════════════════════════════════════════════\n');
  });
});

