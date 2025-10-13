import { Groth16Proof } from 'snarkjs';

import * as curves from './curve';

// Helper function to convert string/hex values to BigInt recursively
const unstringifyBigInts = (obj: any): any => {
  if (typeof obj === 'string') {
    // Handle hex strings
    if (obj.startsWith('0x')) {
      try {
        return BigInt(obj);
      } catch {
        return obj;
      }
    }
    // Handle decimal strings - check if it's a valid number string
    if (/^-?\d+$/.test(obj)) {
      return BigInt(obj);
    }
    // Not a number string, return as-is
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(unstringifyBigInts);
  }

  if (typeof obj === 'object' && obj !== null) {
    const result: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = unstringifyBigInts(obj[key]);
      }
    }
    return result;
  }

  return obj;
};

const Bytes2Str = (arr: number[]) => {
  let str = '';
  for (let i = 0; i < arr.length; i++) {
    let tmp = arr[i].toString(16);
    if (tmp.length == 1) {
      tmp = '0' + tmp;
    }
    str += tmp;
  }
  return str;
};

let BN128Curve: any = null;

export const adaptToUncompressed = async (proof: Groth16Proof) => {
  const p = unstringifyBigInts(proof);

  let curve = BN128Curve;
  if (!curve) {
    BN128Curve = await curves.getCurveFromName('BN128');
    curve = BN128Curve;
  }

  // convert u8 array(little-endian order)to uncompressed type(big-endian order and on bls12_381 curve)
  // which can be convert into Affine type in bellman
  const pi_a = curve.G1.toUncompressed(curve.G1.fromObject(p.pi_a));
  const pi_b = curve.G2.toUncompressed(curve.G2.fromObject(p.pi_b));
  const pi_c = curve.G1.toUncompressed(curve.G1.fromObject(p.pi_c));

  return {
    a: Bytes2Str(Array.from(pi_a)),
    b: Bytes2Str(Array.from(pi_b)),
    c: Bytes2Str(Array.from(pi_c))
  };
};
