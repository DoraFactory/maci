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
        // Convert point to uncompressed format
        const bytes = new Uint8Array(64);
        const x = BigInt(point[0]);
        const y = BigInt(point[1]);
        // Convert to big-endian bytes
        for (let i = 0; i < 32; i++) {
          bytes[31 - i] = Number((x >> BigInt(i * 8)) & 0xffn);
          bytes[63 - i] = Number((y >> BigInt(i * 8)) & 0xffn);
        }
        return bytes;
      }
    },
    G2: {
      fromObject: (obj: any) => obj,
      toUncompressed: (point: any) => {
        // G2 points are larger (128 bytes for BN254)
        const bytes = new Uint8Array(128);
        // Convert each coordinate (2 field elements)
        // Note: Order is [x1, x0, y1, y0] to match ffjavascript behavior
        const x0 = BigInt(point[0][0]);
        const x1 = BigInt(point[0][1]);
        const y0 = BigInt(point[1][0]);
        const y1 = BigInt(point[1][1]);

        for (let i = 0; i < 32; i++) {
          bytes[31 - i] = Number((x1 >> BigInt(i * 8)) & 0xffn); // x1 first
          bytes[63 - i] = Number((x0 >> BigInt(i * 8)) & 0xffn); // then x0
          bytes[95 - i] = Number((y1 >> BigInt(i * 8)) & 0xffn); // y1 third
          bytes[127 - i] = Number((y0 >> BigInt(i * 8)) & 0xffn); // y0 last
        }
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
        const bytes = new Uint8Array(96); // BLS12-381 G1 is 96 bytes
        const x = BigInt(point[0]);
        const y = BigInt(point[1]);
        for (let i = 0; i < 48; i++) {
          bytes[47 - i] = Number((x >> BigInt(i * 8)) & 0xffn);
          bytes[95 - i] = Number((y >> BigInt(i * 8)) & 0xffn);
        }
        return bytes;
      }
    },
    G2: {
      fromObject: (obj: any) => obj,
      toUncompressed: (point: any) => {
        const bytes = new Uint8Array(192); // BLS12-381 G2 is 192 bytes
        // Note: Order is [x1, x0, y1, y0] to match ffjavascript behavior
        const x0 = BigInt(point[0][0]);
        const x1 = BigInt(point[0][1]);
        const y0 = BigInt(point[1][0]);
        const y1 = BigInt(point[1][1]);

        for (let i = 0; i < 48; i++) {
          bytes[47 - i] = Number((x1 >> BigInt(i * 8)) & 0xffn); // x1 first
          bytes[95 - i] = Number((x0 >> BigInt(i * 8)) & 0xffn); // then x0
          bytes[143 - i] = Number((y1 >> BigInt(i * 8)) & 0xffn); // y1 third
          bytes[191 - i] = Number((y0 >> BigInt(i * 8)) & 0xffn); // y0 last
        }
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
