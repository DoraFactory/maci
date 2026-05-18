/**
 * Convert indexed proof hex strings to snarkjs proof format.
 *
 * The SDK's adaptToUncompressed() converts snarkjs proof {pi_a, pi_b, pi_c}
 * to uncompressed BN128 hex {a, b, c} which is sent to the contract.
 * The contract serialises this as JSON and the indexer stores it verbatim.
 *
 * On-chain / indexer format:
 *   { a: "G1_hex", b: "G2_hex", c: "G1_hex" }
 *   (some older proofs may use { ar, bs, krs } or { piA, piB, piC } naming)
 *
 * snarkjs proof format:
 *   { pi_a: [x,y,'1'], pi_b: [[x.c0,x.c1],[y.c0,y.c1],['1','0']], pi_c: [x,y,'1'],
 *     curve: 'bn128', protocol: 'groth16' }
 *
 * See vkey.ts for G1/G2 byte encoding details.
 */

export type SnarkjsProof = {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  curve: string;
  protocol: string;
};

export type IndexerProofHex = {
  a: string; // G1 — 128 hex chars
  b: string; // G2 — 256 hex chars
  c: string; // G1 — 128 hex chars
};

/** Parse a G1 uncompressed hex → snarkjs affine [x, y, '1'] */
function hexToG1(hex: string): string[] {
  const padded = hex.padStart(128, '0');
  const x = BigInt('0x' + padded.slice(0, 64));
  const y = BigInt('0x' + padded.slice(64, 128));
  return [x.toString(), y.toString(), '1'];
}

/** Parse a G2 uncompressed hex → snarkjs [[x.c0,x.c1],[y.c0,y.c1],['1','0']] */
function hexToG2(hex: string): string[][] {
  const padded = hex.padStart(256, '0');
  const x_c1 = BigInt('0x' + padded.slice(0, 64));
  const x_c0 = BigInt('0x' + padded.slice(64, 128));
  const y_c1 = BigInt('0x' + padded.slice(128, 192));
  const y_c0 = BigInt('0x' + padded.slice(192, 256));
  return [
    [x_c0.toString(), x_c1.toString()],
    [y_c0.toString(), y_c1.toString()],
    ['1', '0'],
  ];
}

/**
 * Parse the raw proof JSON string from the indexer into a normalised {a, b, c} object.
 * Handles all known naming conventions used across contract versions.
 */
export function parseIndexerProof(proofJson: string): IndexerProofHex | null {
  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(proofJson) as Record<string, string>;
  } catch {
    return null;
  }

  // Current format: { a, b, c }
  if (parsed.a && parsed.b && parsed.c) {
    return { a: parsed.a, b: parsed.b, c: parsed.c };
  }
  // Contract's Groth16ProofType if serialised with field names { ar, bs, krs }
  if (parsed.ar && parsed.bs && parsed.krs) {
    return { a: parsed.ar, b: parsed.bs, c: parsed.krs };
  }
  // Legacy camelCase format: { piA, piB, piC }
  if (parsed.piA && parsed.piB && parsed.piC) {
    return { a: parsed.piA, b: parsed.piB, c: parsed.piC };
  }
  return null;
}

/**
 * Convert an IndexerProofHex to a snarkjs Proof object suitable for
 * snarkjs.groth16.verify(vkey, publicSignals, proof).
 */
export function hexProofToSnarkjs(proofHex: IndexerProofHex): SnarkjsProof {
  return {
    pi_a: hexToG1(proofHex.a),
    pi_b: hexToG2(proofHex.b),
    pi_c: hexToG1(proofHex.c),
    curve: 'bn128',
    protocol: 'groth16',
  };
}
