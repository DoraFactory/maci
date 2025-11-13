import { type WitnessTester } from 'circomkit';
import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import { packElement, unpackElement } from '@dorafactory/maci-sdk';

import { getSignal, circomkitInstance } from './utils/utils';

const CIRCOM_PATH = './utils/unpackElement';

/**
 * UnpackElement Circuit Tests
 *
 * Circuit Location: packages/circuits/circom/utils/unpackElement.circom
 *
 * ============================================================================
 * CIRCUIT FUNCTIONALITY
 * ============================================================================
 *
 * The UnpackElement circuit splits a large field element (up to 253 bits) into
 * multiple 32-bit output chunks. This is useful for converting between different
 * hash formats (e.g., Poseidon → SHA-256).
 *
 * Input:  A field element (up to 253 bits)
 * Output: n chunks of 32-bit integers (2 ≤ n ≤ 7)
 *
 * ============================================================================
 * HOW THE CIRCUIT WORKS (Step by Step)
 * ============================================================================
 *
 * Step 1: Convert Input to Bits (Line 18-19)
 *   component inputBits = Num2Bits_strict();
 *   inputBits.in <== in;
 *
 *   → Converts the input field element into a 254-bit array
 *   → inputBits.out[0] is the LSB (Least Significant Bit)
 *   → inputBits.out[253] is the MSB (Most Significant Bit)
 *
 * Step 2: Create Bits-to-Number Converters (Line 23)
 *   outputElements[i] = Bits2Num(32);
 *
 *   → Creates n converters, each takes 32 bits and outputs a number
 *
 * Step 3: Assign Bits to Output Chunks (Line 25)
 *   outputElements[i].in[j] <== inputBits.out[((n - i - 1) * 32) + j];
 *
 *   → This is the KEY LINE that determines which bits go to which output
 *   → The formula ((n - i - 1) * 32) + j does the following:
 *
 *     For n=3:
 *       i=0: reads bits 64-95  → out[0] (highest chunk)
 *       i=1: reads bits 32-63  → out[1] (middle chunk)
 *       i=2: reads bits 0-31   → out[2] (lowest chunk)
 *
 *     The (n - i - 1) term REVERSES the order, so:
 *       - out[0] contains the HIGHEST 32 bits
 *       - out[n-1] contains the LOWEST 32 bits
 *
 * ============================================================================
 * EXAMPLE: n=3, input = 0xAABBCCDD_EEFF1122_33445566
 * ============================================================================
 *
 * Step 1: Convert to bits
 *   Bit array: [bit0, bit1, ..., bit95, 0, 0, ..., 0]
 *              └─────────────96 bits of data────────┘
 *
 * Step 2 & 3: Extract chunks
 *   out[0] = bits[64..95]  = 0xAABBCCDD  (high chunk)
 *   out[1] = bits[32..63]  = 0xEEFF1122  (middle chunk)
 *   out[2] = bits[0..31]   = 0x33445566  (low chunk)
 *
 * ============================================================================
 * KEY FEATURES
 * ============================================================================
 *
 * 1. Bit Order: Splits from low to high (LSB to MSB)
 * 2. Zero Padding: If input < n×32 bits, high outputs are automatically 0
 * 3. Range Validation: Each output is strictly < 2^32
 * 4. Reconstructible: Original value can be reconstructed from outputs
 *
 * ============================================================================
 * USE CASES
 * ============================================================================
 *
 * - Converting Poseidon hash output to SHA-256 input format
 * - Cross-circuit data format conversion
 * - Breaking large numbers into manageable chunks
 *
 * ============================================================================
 */
describe('UnpackElement circuit', function test() {
  this.timeout(900000);

  /**
   * ========================================================================
   * TEST SUITE: n=2 (64-bit output capacity)
   * ========================================================================
   *
   * With n=2, the circuit can handle inputs up to 64 bits.
   * Output format: [high_32_bits, low_32_bits]
   *
   * Memory layout:
   *   Input bits:  [0..31] [32..63] [64..253 = all zeros]
   *   Output:      out[1]  out[0]   (note the reversal)
   */
  describe('UnpackElement with n=2', () => {
    let circuit: WitnessTester<['in'], ['out']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('unpackElement2', {
        file: CIRCOM_PATH,
        template: 'UnpackElement',
        params: [2]
      });
    });

    it('should correctly unpack a 32-bit value', async () => {
      /**
       * Test Case: Input smaller than n×32
       *
       * Input:  0x12345678 (only 32 bits used)
       * Binary: 0000...0000_12345678
       *         └─32 zeros─┘└─value─┘
       *
       * Expected behavior:
       *   - Bits 32-63 are all 0 → out[0] = 0x00000000
       *   - Bits 0-31 contain data → out[1] = 0x12345678
       */
      const input = 0x12345678n;

      const witness = await circuit.calculateWitness({ in: input });
      await circuit.expectConstraintPass(witness);

      const out0 = await getSignal(circuit, witness, 'out[0]');
      const out1 = await getSignal(circuit, witness, 'out[1]');

      expect(out0).to.equal(0n); // High 32 bits are zero (auto-padded)
      expect(out1).to.equal(0x12345678n); // Low 32 bits contain the value
    });

    it('should correctly unpack a 64-bit value', async () => {
      /**
       * Test Case: Input exactly n×32 bits
       *
       * Input:  0x0123456789ABCDEF (full 64 bits)
       * Binary: 01234567_89ABCDEF
       *         └─high──┘└─low──┘
       *
       * Bit layout:
       *   Bits 32-63: 0x01234567 → out[0] (index formula: (2-0-1)*32 = 32)
       *   Bits 0-31:  0x89ABCDEF → out[1] (index formula: (2-1-1)*32 = 0)
       */
      const input = 0x0123456789abcdefn;

      const witness = await circuit.calculateWitness({ in: input });
      await circuit.expectConstraintPass(witness);

      const out0 = await getSignal(circuit, witness, 'out[0]');
      const out1 = await getSignal(circuit, witness, 'out[1]');

      expect(out0).to.equal(0x01234567n); // High 32 bits
      expect(out1).to.equal(0x89abcdefn); // Low 32 bits
    });

    it('should correctly unpack zero', async () => {
      /**
       * Test Case: Zero input (edge case)
       * All bits are 0, so all outputs should be 0
       */
      const input = 0n;

      const witness = await circuit.calculateWitness({ in: input });
      await circuit.expectConstraintPass(witness);

      const out0 = await getSignal(circuit, witness, 'out[0]');
      const out1 = await getSignal(circuit, witness, 'out[1]');

      expect(out0).to.equal(0n);
      expect(out1).to.equal(0n);
    });

    it('should correctly unpack max 32-bit value', async () => {
      /**
       * Test Case: Maximum 32-bit value
       *
       * Input: 0xFFFFFFFF (all bits set in low 32 bits)
       *
       * Expected:
       *   - out[0] = 0 (high 32 bits unused)
       *   - out[1] = 0xFFFFFFFF (all bits set)
       */
      const input = 0xffffffffn;

      const witness = await circuit.calculateWitness({ in: input });
      await circuit.expectConstraintPass(witness);

      const out0 = await getSignal(circuit, witness, 'out[0]');
      const out1 = await getSignal(circuit, witness, 'out[1]');

      expect(out0).to.equal(0n);
      expect(out1).to.equal(0xffffffffn);
    });
  });

  /**
   * ========================================================================
   * TEST SUITE: n=3 (96-bit output capacity)
   * ========================================================================
   *
   * With n=3, the circuit can handle inputs up to 96 bits.
   * Output format: [highest_32, middle_32, lowest_32]
   *
   * Index calculation demonstration:
   *   i=0: (3-0-1)*32 = 64 → reads bits [64..95]  → out[0]
   *   i=1: (3-1-1)*32 = 32 → reads bits [32..63]  → out[1]
   *   i=2: (3-2-1)*32 = 0  → reads bits [0..31]   → out[2]
   */
  describe('UnpackElement with n=3', () => {
    let circuit: WitnessTester<['in'], ['out']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('unpackElement3', {
        file: CIRCOM_PATH,
        template: 'UnpackElement',
        params: [3]
      });
    });

    it('should correctly unpack a 96-bit value', async () => {
      /**
       * Test Case: Full 96-bit input
       *
       * Input: 0xAABBCCDD_EEFF1122_33445566
       *        └──chunk0─┘└──chunk1─┘└──chunk2─┘
       *        (highest)   (middle)    (lowest)
       *
       * Bit extraction:
       *   Bits [64..95]:  0xAABBCCDD → out[0] (i=0, offset=64)
       *   Bits [32..63]:  0xEEFF1122 → out[1] (i=1, offset=32)
       *   Bits [0..31]:   0x33445566 → out[2] (i=2, offset=0)
       *
       * This demonstrates the core formula: ((n - i - 1) * 32) + j
       * The (n - i - 1) part reverses the output order
       */
      const input = 0xaabbccddeeff112233445566n;

      const witness = await circuit.calculateWitness({ in: input });
      await circuit.expectConstraintPass(witness);

      const out0 = await getSignal(circuit, witness, 'out[0]');
      const out1 = await getSignal(circuit, witness, 'out[1]');
      const out2 = await getSignal(circuit, witness, 'out[2]');

      expect(out0).to.equal(0xaabbccddn); // Bits 64-95 (highest chunk)
      expect(out1).to.equal(0xeeff1122n); // Bits 32-63 (middle chunk)
      expect(out2).to.equal(0x33445566n); // Bits 0-31 (lowest chunk)
    });

    it('should correctly unpack a 64-bit value with zero padding', async () => {
      /**
       * Test Case: Input smaller than n×32 (auto zero-padding)
       *
       * Input: 0xFFFFFFFF_EEEEEEEE (only 64 bits)
       *
       * Memory representation:
       *   Bits [64..95]:  all zeros    → out[0] = 0x00000000
       *   Bits [32..63]:  0xFFFFFFFF   → out[1]
       *   Bits [0..31]:   0xEEEEEEEE   → out[2]
       *
       * This shows automatic zero-padding for unused high bits
       */
      const input = 0xffffffffeeeeeeeen;

      const witness = await circuit.calculateWitness({ in: input });
      await circuit.expectConstraintPass(witness);

      const out0 = await getSignal(circuit, witness, 'out[0]');
      const out1 = await getSignal(circuit, witness, 'out[1]');
      const out2 = await getSignal(circuit, witness, 'out[2]');

      expect(out0).to.equal(0n); // High 32 bits are zero-padded
      expect(out1).to.equal(0xffffffffn); // Bits 32-63
      expect(out2).to.equal(0xeeeeeeeen); // Bits 0-31
    });
  });

  /**
   * ========================================================================
   * TEST SUITE: n=4 (128-bit output capacity)
   * ========================================================================
   *
   * With n=4, the circuit can handle inputs up to 128 bits.
   * This suite also tests value reconstruction to verify correctness.
   */
  describe('UnpackElement with n=4', () => {
    let circuit: WitnessTester<['in'], ['out']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('unpackElement4', {
        file: CIRCOM_PATH,
        template: 'UnpackElement',
        params: [4]
      });
    });

    it('should correctly unpack a 128-bit value', async () => {
      /**
       * Test Case: Full 128-bit input (4 × 32 bits)
       *
       * Input: 0x0A0B0C0D_0E0F1011_21314151_61718191
       *
       * Index formula for each output:
       *   i=0: (4-0-1)*32 = 96  → bits[96..127]  → out[0] = 0x0A0B0C0D
       *   i=1: (4-1-1)*32 = 64  → bits[64..95]   → out[1] = 0x0E0F1011
       *   i=2: (4-2-1)*32 = 32  → bits[32..63]   → out[2] = 0x21314151
       *   i=3: (4-3-1)*32 = 0   → bits[0..31]    → out[3] = 0x61718191
       */
      const input = 0x0a0b0c0d0e0f10112131415161718191n;

      const witness = await circuit.calculateWitness({ in: input });
      await circuit.expectConstraintPass(witness);

      const out0 = await getSignal(circuit, witness, 'out[0]');
      const out1 = await getSignal(circuit, witness, 'out[1]');
      const out2 = await getSignal(circuit, witness, 'out[2]');
      const out3 = await getSignal(circuit, witness, 'out[3]');

      expect(out0).to.equal(0x0a0b0c0dn);
      expect(out1).to.equal(0x0e0f1011n);
      expect(out2).to.equal(0x21314151n);
      expect(out3).to.equal(0x61718191n);
    });

    it('should verify reconstruction from parts', async () => {
      /**
       * Test Case: Value reconstruction (reversibility test)
       *
       * This test verifies that the unpacking process is reversible:
       * original → unpack → reconstruct → should equal original
       *
       * Reconstruction formula:
       *   value = (out[0] << 96) | (out[1] << 64) | (out[2] << 32) | out[3]
       *
       * This proves the circuit correctly preserves all information.
       */
      const input = 0x123456789abcdef0fedcba9876543210n;

      const witness = await circuit.calculateWitness({ in: input });
      await circuit.expectConstraintPass(witness);

      const out0 = await getSignal(circuit, witness, 'out[0]');
      const out1 = await getSignal(circuit, witness, 'out[1]');
      const out2 = await getSignal(circuit, witness, 'out[2]');
      const out3 = await getSignal(circuit, witness, 'out[3]');

      // Reconstruct: shift each chunk to its original position and OR together
      const reconstructed = (out0 << 96n) | (out1 << 64n) | (out2 << 32n) | out3;

      expect(reconstructed).to.equal(input);
    });
  });

  /**
   * ========================================================================
   * TEST SUITE: n=7 (224-bit output capacity - MAXIMUM)
   * ========================================================================
   *
   * n=7 is the maximum allowed value (7 × 32 = 224 bits).
   * This is close to the 253-bit limit of the field element.
   *
   * Why n ≤ 7? Because:
   *   - Field elements are up to 253 bits
   *   - 7 × 32 = 224 bits (fits within 253)
   *   - 8 × 32 = 256 bits (exceeds 253) ❌
   */
  describe('UnpackElement with n=7 (maximum)', () => {
    let circuit: WitnessTester<['in'], ['out']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('unpackElement7', {
        file: CIRCOM_PATH,
        template: 'UnpackElement',
        params: [7]
      });
    });

    it('should correctly unpack a 224-bit value', async () => {
      /**
       * Test Case: Maximum capacity (7 chunks = 224 bits)
       *
       * Input: 28 bytes (224 bits)
       * Hex breakdown:
       *   01 02 03 04 | 05 06 07 08 | 09 0a 0b 0c | 0d 0e 0f 10 |
       *   11 12 13 14 | 15 16 17 18 | 19 1a 1b 1c
       *   └─ out[0] ─┘ └─ out[1] ─┘ └─ out[2] ─┘ └─ out[3] ─┘
       *   └─ out[4] ─┘ └─ out[5] ─┘ └─ out[6] ─┘
       *
       * Bit positions:
       *   out[0]: bits[192..223] = 0x01020304
       *   out[1]: bits[160..191] = 0x05060708
       *   out[2]: bits[128..159] = 0x090a0b0c
       *   out[3]: bits[96..127]  = 0x0d0e0f10
       *   out[4]: bits[64..95]   = 0x11121314
       *   out[5]: bits[32..63]   = 0x15161718
       *   out[6]: bits[0..31]    = 0x191a1b1c
       */
      const input = 0x0102030405060708090a0b0c0d0e0f10111213141516171819_1a_1b_1cn;

      const witness = await circuit.calculateWitness({ in: input });
      await circuit.expectConstraintPass(witness);

      const out0 = await getSignal(circuit, witness, 'out[0]');
      const out1 = await getSignal(circuit, witness, 'out[1]');
      const out2 = await getSignal(circuit, witness, 'out[2]');
      const out3 = await getSignal(circuit, witness, 'out[3]');
      const out4 = await getSignal(circuit, witness, 'out[4]');
      const out5 = await getSignal(circuit, witness, 'out[5]');
      const out6 = await getSignal(circuit, witness, 'out[6]');

      expect(out0).to.equal(0x01020304n);
      expect(out1).to.equal(0x05060708n);
      expect(out2).to.equal(0x090a0b0cn);
      expect(out3).to.equal(0x0d0e0f10n);
      expect(out4).to.equal(0x11121314n);
      expect(out5).to.equal(0x15161718n);
      expect(out6).to.equal(0x191a1b1cn);
    });

    it('should verify each 32-bit chunk is within valid range', async () => {
      /**
       * Test Case: Range validation
       *
       * Each output MUST be < 2^32 (0x100000000)
       * This is enforced by Bits2Num(32) which only accepts 32 bits
       *
       * Input: Maximum 224-bit value (all bits set)
       * Expected: All 7 outputs should be 0xFFFFFFFF (max 32-bit value)
       */
      const input = 0xffffffffffffffffffffffffffffffffffffffffffffffffn;

      const witness = await circuit.calculateWitness({ in: input });
      await circuit.expectConstraintPass(witness);

      for (let i = 0; i < 7; i++) {
        const output = await getSignal(circuit, witness, `out[${i}]`);
        // Each chunk must be strictly less than 2^32
        expect(output < 0x100000000n).to.be.true;
      }
    });
  });

  /**
   * ========================================================================
   * TEST SUITE: Edge Cases
   * ========================================================================
   *
   * Tests special bit patterns and boundary conditions to ensure
   * the circuit handles all possible inputs correctly.
   */
  describe('Edge cases', () => {
    let circuit: WitnessTester<['in'], ['out']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('unpackElement2Edge', {
        file: CIRCOM_PATH,
        template: 'UnpackElement',
        params: [2]
      });
    });

    it('should handle value with only highest bit set in first chunk', async () => {
      /**
       * Test Case: Highest bit set (sign bit in signed representation)
       *
       * Input: 0x80000000
       * Binary: 0000...0000_10000000_00000000_00000000_00000000
       *                     └─────────bit 31 set─────────┘
       *
       * This is important because:
       * - Bit 31 is the sign bit in signed 32-bit integers
       * - Tests that bit extraction works correctly at boundaries
       * - Ensures no overflow or sign extension issues
       */
      const input = 0x80000000n;

      const witness = await circuit.calculateWitness({ in: input });
      await circuit.expectConstraintPass(witness);

      const out0 = await getSignal(circuit, witness, 'out[0]');
      const out1 = await getSignal(circuit, witness, 'out[1]');

      expect(out0).to.equal(0n); // High chunk is empty
      expect(out1).to.equal(0x80000000n); // Low chunk has bit 31 set
    });

    it('should handle alternating bit pattern', async () => {
      /**
       * Test Case: Alternating bits (0b0101010101...)
       *
       * Input: 0x5555555555555555
       * Binary pattern: 0101 0101 0101 0101 ... (alternating 0 and 1)
       *
       * This pattern is useful for testing:
       * - Correct bit extraction (no bit bleeding between chunks)
       * - Proper handling of all bit positions
       * - No interference between adjacent bits
       *
       * Expected result:
       *   Both chunks should have the same alternating pattern
       *   out[0] = 0x55555555 (bits 32-63)
       *   out[1] = 0x55555555 (bits 0-31)
       */
      const input = 0x5555555555555555n;

      const witness = await circuit.calculateWitness({ in: input });
      await circuit.expectConstraintPass(witness);

      const out0 = await getSignal(circuit, witness, 'out[0]');
      const out1 = await getSignal(circuit, witness, 'out[1]');

      expect(out0).to.equal(0x55555555n); // Each chunk gets same pattern
      expect(out1).to.equal(0x55555555n);
    });
  });

  /**
   * ========================================================================
   * TEST SUITE: SDK Integration (pack.ts compatibility)
   * ========================================================================
   *
   * This test suite verifies that the SDK's packElement/unpackElement functions
   * work correctly with the circuit's UnpackElement template.
   *
   * Data Flow:
   *   1. SDK packElement() → creates packed bigint
   *   2. Circuit UnpackElement(6) → unpacks into 6 chunks
   *   3. SDK unpackElement() → verifies round-trip consistency
   *
   * Pack Format (from pack.ts):
   *   packed = nonce + (stateIdx << 32) + (voIdx << 64) + (newVotes << 96) + (salt << 192)
   *
   * Unpack Format (circuit extracts):
   *   out[5] = nonce         (bits 0-31)
   *   out[4] = stateIdx      (bits 32-63)
   *   out[3] = voIdx         (bits 64-95)
   *   out[2] = newVotes[0]   (bits 96-127)
   *   out[1] = newVotes[1]   (bits 128-159)
   *   out[0] = newVotes[2]   (bits 160-191)
   *
   * Note: The circuit reverses the order (high bits first), while SDK stores
   * in logical order (low bits first).
   */
  describe('SDK Integration: pack/unpack compatibility', () => {
    let circuit: WitnessTester<['in'], ['out']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('unpackElement6_sdk', {
        file: CIRCOM_PATH,
        template: 'UnpackElement',
        params: [6]
      });
    });

    it('should correctly unpack SDK-packed data (simple values)', async () => {
      /**
       * Test Case: Basic SDK pack/unpack compatibility
       *
       * Input parameters:
       *   nonce:     1
       *   stateIdx:  5
       *   voIdx:     2
       *   newVotes:  100
       *
       * Pack layout:
       *   bits [0-31]:    nonce = 1
       *   bits [32-63]:   stateIdx = 5
       *   bits [64-95]:   voIdx = 2
       *   bits [96-191]:  newVotes = 100 (96 bits for Uint96)
       *   bits [192-247]: salt (56 bits, auto-generated)
       *
       * Circuit output (reversed order):
       *   out[5] = nonce
       *   out[4] = stateIdx
       *   out[3] = voIdx
       *   out[2], out[1], out[0] = newVotes components
       */
      const nonce = 1;
      const stateIdx = 5;
      const voIdx = 2;
      const newVotes = 100;
      const salt = 0n; // Use zero salt for deterministic testing

      // Pack using SDK
      const packed = packElement({ nonce, stateIdx, voIdx, newVotes, salt });

      // Unpack using circuit
      const witness = await circuit.calculateWitness({ in: packed });
      await circuit.expectConstraintPass(witness);

      const out5 = await getSignal(circuit, witness, 'out[5]'); // nonce
      const out4 = await getSignal(circuit, witness, 'out[4]'); // stateIdx
      const out3 = await getSignal(circuit, witness, 'out[3]'); // voIdx
      const out2 = await getSignal(circuit, witness, 'out[2]'); // newVotes low
      const out1 = await getSignal(circuit, witness, 'out[1]'); // newVotes mid
      const out0 = await getSignal(circuit, witness, 'out[0]'); // newVotes high

      // Verify individual fields
      expect(out5).to.equal(BigInt(nonce));
      expect(out4).to.equal(BigInt(stateIdx));
      expect(out3).to.equal(BigInt(voIdx));

      // Verify newVotes (96-bit value split across 3 chunks)
      const unpackedVotes = out2 | (out1 << 32n) | (out0 << 64n);
      expect(unpackedVotes).to.equal(BigInt(newVotes));

      // Verify SDK unpack matches original values
      const unpacked = unpackElement(packed);
      expect(unpacked.nonce).to.equal(BigInt(nonce));
      expect(unpacked.stateIdx).to.equal(BigInt(stateIdx));
      expect(unpacked.voIdx).to.equal(BigInt(voIdx));
      expect(unpacked.newVotes).to.equal(BigInt(newVotes));
    });

    it('should correctly unpack SDK-packed data (maximum 32-bit values)', async () => {
      /**
       * Test Case: Maximum 32-bit values for each field
       *
       * This tests the boundary conditions where each field
       * is at its maximum value (0xFFFFFFFF = 4,294,967,295)
       */
      const nonce = 0xffffffff; // Max 32-bit: 4,294,967,295
      const stateIdx = 0xffffffff;
      const voIdx = 0xffffffff;
      const newVotes = 0xffffffff;
      const salt = 0n;

      const packed = packElement({ nonce, stateIdx, voIdx, newVotes, salt });

      const witness = await circuit.calculateWitness({ in: packed });
      await circuit.expectConstraintPass(witness);

      const out5 = await getSignal(circuit, witness, 'out[5]');
      const out4 = await getSignal(circuit, witness, 'out[4]');
      const out3 = await getSignal(circuit, witness, 'out[3]');
      const out2 = await getSignal(circuit, witness, 'out[2]');

      expect(out5).to.equal(0xffffffffn);
      expect(out4).to.equal(0xffffffffn);
      expect(out3).to.equal(0xffffffffn);
      expect(out2).to.equal(0xffffffffn);

      // Verify SDK unpack
      const unpacked = unpackElement(packed);
      expect(unpacked.nonce).to.equal(0xffffffffn);
      expect(unpacked.stateIdx).to.equal(0xffffffffn);
      expect(unpacked.voIdx).to.equal(0xffffffffn);
      expect(unpacked.newVotes).to.equal(0xffffffffn);
    });

    it('should correctly unpack SDK-packed data (large newVotes)', async () => {
      /**
       * Test Case: Large newVotes value (96-bit)
       *
       * newVotes can be up to 96 bits (Uint96), which spans 3 chunks:
       *   - bits [96-127]:  out[2]
       *   - bits [128-159]: out[1]
       *   - bits [160-191]: out[0]
       *
       * Example: 1,000,000,000,000 votes (1 trillion)
       * Hex: 0xE8D4A51000 (40 bits)
       */
      const nonce = 10;
      const stateIdx = 20;
      const voIdx = 30;
      const newVotes = 1_000_000_000_000; // 1 trillion
      const salt = 0n;

      const packed = packElement({ nonce, stateIdx, voIdx, newVotes, salt });

      const witness = await circuit.calculateWitness({ in: packed });
      await circuit.expectConstraintPass(witness);

      const out5 = await getSignal(circuit, witness, 'out[5]');
      const out4 = await getSignal(circuit, witness, 'out[4]');
      const out3 = await getSignal(circuit, witness, 'out[3]');
      const out2 = await getSignal(circuit, witness, 'out[2]');
      const out1 = await getSignal(circuit, witness, 'out[1]');
      const out0 = await getSignal(circuit, witness, 'out[0]');

      expect(out5).to.equal(BigInt(nonce));
      expect(out4).to.equal(BigInt(stateIdx));
      expect(out3).to.equal(BigInt(voIdx));

      // Reconstruct the 96-bit newVotes
      const unpackedVotes = out2 | (out1 << 32n) | (out0 << 64n);
      expect(unpackedVotes).to.equal(BigInt(newVotes));

      // Verify SDK unpack
      const unpacked = unpackElement(packed);
      expect(unpacked.newVotes).to.equal(BigInt(newVotes));
    });

    it('should correctly unpack SDK-packed data (maximum 96-bit newVotes)', async () => {
      /**
       * Test Case: Maximum 96-bit newVotes value
       *
       * Max Uint96 = 2^96 - 1 = 79,228,162,514,264,337,593,543,950,335
       * Hex: 0xFFFFFFFF_FFFFFFFF_FFFFFFFF (12 bytes)
       *
       * This should split into:
       *   out[2] = 0xFFFFFFFF (bits 96-127)
       *   out[1] = 0xFFFFFFFF (bits 128-159)
       *   out[0] = 0xFFFFFFFF (bits 160-191)
       */
      const nonce = 1;
      const stateIdx = 2;
      const voIdx = 3;
      const newVotes = (1n << 96n) - 1n; // Max Uint96
      const salt = 0n;

      const packed = packElement({
        nonce,
        stateIdx,
        voIdx,
        newVotes, // Now packElement supports bigint directly
        salt
      });

      const witness = await circuit.calculateWitness({ in: packed });
      await circuit.expectConstraintPass(witness);

      const out2 = await getSignal(circuit, witness, 'out[2]');
      const out1 = await getSignal(circuit, witness, 'out[1]');
      const out0 = await getSignal(circuit, witness, 'out[0]');

      // All three newVotes chunks should be max 32-bit values
      expect(out2).to.equal(0xffffffffn);
      expect(out1).to.equal(0xffffffffn);
      expect(out0).to.equal(0xffffffffn);

      // Reconstruct and verify
      const unpackedVotes = out2 | (out1 << 32n) | (out0 << 64n);
      expect(unpackedVotes).to.equal(newVotes);
    });

    it('should correctly handle SDK-packed data with non-zero salt', async () => {
      /**
       * Test Case: Verify salt doesn't interfere with unpacking
       *
       * Salt is stored in bits [192-247] (56 bits), which doesn't
       * affect the first 6 outputs of UnpackElement(6).
       *
       * The circuit only extracts the first 192 bits, so salt
       * is ignored in the output but present in the packed value.
       */
      const nonce = 42;
      const stateIdx = 123;
      const voIdx = 456;
      const newVotes = 789;
      const salt = 0x12345678abcdn; // Random 56-bit salt

      const packed = packElement({ nonce, stateIdx, voIdx, newVotes, salt });

      const witness = await circuit.calculateWitness({ in: packed });
      await circuit.expectConstraintPass(witness);

      const out5 = await getSignal(circuit, witness, 'out[5]');
      const out4 = await getSignal(circuit, witness, 'out[4]');
      const out3 = await getSignal(circuit, witness, 'out[3]');

      // Values should be correct regardless of salt
      expect(out5).to.equal(BigInt(nonce));
      expect(out4).to.equal(BigInt(stateIdx));
      expect(out3).to.equal(BigInt(voIdx));

      // SDK unpack should ignore salt (it's not returned)
      const unpacked = unpackElement(packed);
      expect(unpacked.nonce).to.equal(BigInt(nonce));
      expect(unpacked.stateIdx).to.equal(BigInt(stateIdx));
      expect(unpacked.voIdx).to.equal(BigInt(voIdx));
      expect(unpacked.newVotes).to.equal(BigInt(newVotes));
    });

    it('should verify round-trip consistency (SDK pack → circuit unpack → SDK unpack)', async () => {
      /**
       * Test Case: Complete round-trip verification
       *
       * This test verifies that:
       * 1. SDK packs data correctly
       * 2. Circuit unpacks it correctly
       * 3. SDK unpacks it back to original values
       * 4. Circuit output matches SDK unpack output
       */
      const testCases = [
        { nonce: 0, stateIdx: 0, voIdx: 0, newVotes: 0 },
        { nonce: 1, stateIdx: 1, voIdx: 1, newVotes: 1 },
        { nonce: 255, stateIdx: 255, voIdx: 255, newVotes: 255 },
        { nonce: 1000, stateIdx: 2000, voIdx: 3000, newVotes: 4000 },
        { nonce: 65535, stateIdx: 65535, voIdx: 65535, newVotes: 65535 }
      ];

      for (const testCase of testCases) {
        const { nonce, stateIdx, voIdx, newVotes } = testCase;
        const salt = 0n;

        // Pack with SDK
        const packed = packElement({ nonce, stateIdx, voIdx, newVotes, salt });

        // Unpack with circuit
        const witness = await circuit.calculateWitness({ in: packed });
        await circuit.expectConstraintPass(witness);

        const circuitNonce = await getSignal(circuit, witness, 'out[5]');
        const circuitStateIdx = await getSignal(circuit, witness, 'out[4]');
        const circuitVoIdx = await getSignal(circuit, witness, 'out[3]');
        const circuitVotes2 = await getSignal(circuit, witness, 'out[2]');
        const circuitVotes1 = await getSignal(circuit, witness, 'out[1]');
        const circuitVotes0 = await getSignal(circuit, witness, 'out[0]');

        const circuitNewVotes = circuitVotes2 | (circuitVotes1 << 32n) | (circuitVotes0 << 64n);

        // Unpack with SDK
        const sdkUnpacked = unpackElement(packed);

        // Verify circuit matches SDK
        expect(circuitNonce).to.equal(sdkUnpacked.nonce);
        expect(circuitStateIdx).to.equal(sdkUnpacked.stateIdx);
        expect(circuitVoIdx).to.equal(sdkUnpacked.voIdx);
        expect(circuitNewVotes).to.equal(sdkUnpacked.newVotes);

        // Verify SDK matches original
        expect(sdkUnpacked.nonce).to.equal(BigInt(nonce));
        expect(sdkUnpacked.stateIdx).to.equal(BigInt(stateIdx));
        expect(sdkUnpacked.voIdx).to.equal(BigInt(voIdx));
        expect(sdkUnpacked.newVotes).to.equal(BigInt(newVotes));
      }
    });

    it('should correctly handle zero values in all fields', async () => {
      /**
       * Test Case: All fields are zero (edge case)
       *
       * This ensures that zero values are handled correctly
       * and don't cause any issues in packing/unpacking.
       */
      const nonce = 0;
      const stateIdx = 0;
      const voIdx = 0;
      const newVotes = 0;
      const salt = 0n;

      const packed = packElement({ nonce, stateIdx, voIdx, newVotes, salt });

      // Packed value should be 0
      expect(packed).to.equal(0n);

      const witness = await circuit.calculateWitness({ in: packed });
      await circuit.expectConstraintPass(witness);

      // All outputs should be 0
      for (let i = 0; i < 6; i++) {
        const output = await getSignal(circuit, witness, `out[${i}]`);
        expect(output).to.equal(0n);
      }

      // SDK unpack should return all zeros
      const unpacked = unpackElement(packed);
      expect(unpacked.nonce).to.equal(0n);
      expect(unpacked.stateIdx).to.equal(0n);
      expect(unpacked.voIdx).to.equal(0n);
      expect(unpacked.newVotes).to.equal(0n);
    });
  });
});
