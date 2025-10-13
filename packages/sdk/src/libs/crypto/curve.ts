import { bn254 } from '@noble/curves/bn254';
import { bls12_381 } from '@noble/curves/bls12-381';
import { numberToBytesBE } from '@noble/curves/abstract/utils';

// BN254 (bn128) curve order and field prime
const bls12381r = BigInt('0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001');
const bn128r = BigInt(
  '21888242871839275222246405745257275088548364400416034343698204186575808495617'
);

const bls12381q = BigInt(
  '0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab'
);
const bn128q = BigInt(
  '21888242871839275222246405745257275088696311157297823662689037894645226208583'
);

// Helper function to create a curve-like object compatible with the existing API
function createBn254Curve() {
  return {
    name: 'bn254',
    r: bn128r,
    q: bn128q,
    G1: {
      fromObject: (obj: any) => obj,
      toUncompressed: (point: any) => {
        // Convert point to uncompressed format using @noble/curves
        const x = BigInt(point[0]);
        const y = BigInt(point[1]);

        // Create a point to validate coordinates are on the curve
        const p = new bn254.G1.ProjectivePoint(x, y, 1n);
        p.assertValidity(); // Validates the point is on the curve

        const affine = p.toAffine();

        // Serialize using @noble/curves utilities (big-endian)
        const xBytes = numberToBytesBE(affine.x, 32);
        const yBytes = numberToBytesBE(affine.y, 32);

        const bytes = new Uint8Array(64);
        bytes.set(xBytes, 0);
        bytes.set(yBytes, 32);

        return bytes;
      }
    },
    G2: {
      fromObject: (obj: any) => obj,
      toUncompressed: (point: any) => {
        // G2 points use Fp2 coordinates
        const Fp2 = bn254.fields.Fp2;

        const x = Fp2.create({ c0: BigInt(point[0][0]), c1: BigInt(point[0][1]) });
        const y = Fp2.create({ c0: BigInt(point[1][0]), c1: BigInt(point[1][1]) });

        // Create and validate the point
        const p = new bn254.G2.ProjectivePoint(x, y, Fp2.ONE);
        p.assertValidity(); // Validates the point is on the curve

        const affine = p.toAffine();

        // Serialize in order [x1, x0, y1, y0] to match ffjavascript behavior
        const x0Bytes = numberToBytesBE((affine.x as any).c0, 32);
        const x1Bytes = numberToBytesBE((affine.x as any).c1, 32);
        const y0Bytes = numberToBytesBE((affine.y as any).c0, 32);
        const y1Bytes = numberToBytesBE((affine.y as any).c1, 32);

        const bytes = new Uint8Array(128);
        bytes.set(x1Bytes, 0); // x1 first
        bytes.set(x0Bytes, 32); // then x0
        bytes.set(y1Bytes, 64); // y1 third
        bytes.set(y0Bytes, 96); // y0 last

        return bytes;
      }
    }
  };
}

function createBls12381Curve() {
  return {
    name: 'bls12_381',
    r: bls12381r,
    q: bls12381q,
    G1: {
      fromObject: (obj: any) => obj,
      toUncompressed: (point: any) => {
        // Convert point to uncompressed format using @noble/curves
        const x = BigInt(point[0]);
        const y = BigInt(point[1]);

        // Create a point to validate coordinates are on the curve
        const p = new bls12_381.G1.ProjectivePoint(x, y, 1n);
        p.assertValidity(); // Validates the point is on the curve

        const affine = p.toAffine();

        // Serialize using @noble/curves utilities (big-endian)
        const xBytes = numberToBytesBE(affine.x, 48);
        const yBytes = numberToBytesBE(affine.y, 48);

        const bytes = new Uint8Array(96); // BLS12-381 G1 is 96 bytes
        bytes.set(xBytes, 0);
        bytes.set(yBytes, 48);

        return bytes;
      }
    },
    G2: {
      fromObject: (obj: any) => obj,
      toUncompressed: (point: any) => {
        // G2 points use Fp2 coordinates
        const Fp2 = bls12_381.fields.Fp2;

        const x = Fp2.create({ c0: BigInt(point[0][0]), c1: BigInt(point[0][1]) });
        const y = Fp2.create({ c0: BigInt(point[1][0]), c1: BigInt(point[1][1]) });

        // Create and validate the point
        const p = new bls12_381.G2.ProjectivePoint(x, y, Fp2.ONE);
        p.assertValidity(); // Validates the point is on the curve

        const affine = p.toAffine();

        // Serialize in order [x1, x0, y1, y0] to match ffjavascript behavior
        const x0Bytes = numberToBytesBE((affine.x as any).c0, 48);
        const x1Bytes = numberToBytesBE((affine.x as any).c1, 48);
        const y0Bytes = numberToBytesBE((affine.y as any).c0, 48);
        const y1Bytes = numberToBytesBE((affine.y as any).c1, 48);

        const bytes = new Uint8Array(192); // BLS12-381 G2 is 192 bytes
        bytes.set(x1Bytes, 0); // x1 first
        bytes.set(x0Bytes, 48); // then x0
        bytes.set(y1Bytes, 96); // y1 third
        bytes.set(y0Bytes, 144); // y0 last

        return bytes;
      }
    }
  };
}

export async function getCurveFromR(r: bigint) {
  if (r === bn128r) {
    return createBn254Curve();
  } else if (r === bls12381r) {
    return createBls12381Curve();
  } else {
    throw new Error(`Curve not supported: ${r.toString()}`);
  }
}

export async function getCurveFromQ(q: bigint) {
  if (q === bn128q) {
    return createBn254Curve();
  } else if (q === bls12381q) {
    return createBls12381Curve();
  } else {
    throw new Error(`Curve not supported: ${q.toString()}`);
  }
}

export async function getCurveFromName(name: string) {
  const normName = normalizeName(name);
  if (['BN128', 'BN254', 'ALTBN128'].indexOf(normName) >= 0) {
    return createBn254Curve();
  } else if (['BLS12381'].indexOf(normName) >= 0) {
    return createBls12381Curve();
  } else {
    throw new Error(`Curve not supported: ${name}`);
  }

  function normalizeName(n: string) {
    return (n.toUpperCase().match(/[A-Za-z0-9]+/g) || []).join('');
  }
}
