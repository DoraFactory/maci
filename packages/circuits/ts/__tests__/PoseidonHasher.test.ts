import {
  SNARK_FIELD_SIZE,
  hash5,
  hash4,
  hash3,
  hash2,
  hash12,
  hashLeftRight
} from '@dorafactory/maci-sdk';
import { type WitnessTester } from 'circomkit';
import fc from 'fast-check';

import { getSignal, circomkitInstance } from './utils/utils';

const CIRCOM_PATH = './utils/hasherPoseidon';

// Helper function for hash10: hash(hash5(first 5), hash5(last 5))
const hash10 = (elements: bigint[]): bigint => {
  if (elements.length !== 10) {
    throw new Error('hash10 requires exactly 10 elements');
  }
  const hash1 = hash5(elements.slice(0, 5));
  const hash2Result = hash5(elements.slice(5, 10));
  return hash2([hash1, hash2Result]);
};

describe('Poseidon hash circuits', function test() {
  this.timeout(900000);

  describe('HashLeftRight', () => {
    let circuit: WitnessTester<['left', 'right'], ['hash']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('hashLeftRight', {
        file: CIRCOM_PATH,
        template: 'HashLeftRight'
      });
    });

    it('correctly hashes left and right values', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }),
          fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }),
          async (left: bigint, right: bigint) => {
            const witness = await circuit.calculateWitness({
              left,
              right
            });
            await circuit.expectConstraintPass(witness);
            const output = await getSignal(circuit, witness, 'hash');
            const outputJS = hashLeftRight(left, right);

            return output === outputJS;
          }
        )
      );
    });
  });

  describe('Hasher3', () => {
    let circuit: WitnessTester<['in'], ['hash']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('hasher3', {
        file: CIRCOM_PATH,
        template: 'Hasher3'
      });
    });

    it('correctly hashes 3 random values', async () => {
      const n = 3;

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }), {
            minLength: n,
            maxLength: n
          }),
          async (preImages: bigint[]) => {
            const witness = await circuit.calculateWitness({
              in: preImages
            });
            await circuit.expectConstraintPass(witness);
            const output = await getSignal(circuit, witness, 'hash');
            const outputJS = hash3(preImages);

            return output === outputJS;
          }
        )
      );
    });
  });

  describe('Hasher4', () => {
    let circuit: WitnessTester<['in'], ['hash']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('hasher4', {
        file: CIRCOM_PATH,
        template: 'Hasher4'
      });
    });

    it('correctly hashes 4 random values', async () => {
      const n = 4;

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }), {
            minLength: n,
            maxLength: n
          }),
          async (preImages: bigint[]) => {
            const witness = await circuit.calculateWitness({
              in: preImages
            });
            await circuit.expectConstraintPass(witness);
            const output = await getSignal(circuit, witness, 'hash');
            const outputJS = hash4(preImages);

            return output === outputJS;
          }
        )
      );
    });
  });

  describe('Hasher5', () => {
    let circuit: WitnessTester<['in'], ['hash']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('hasher5', {
        file: CIRCOM_PATH,
        template: 'Hasher5'
      });
    });

    it('correctly hashes 5 random values', async () => {
      const n = 5;

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }), {
            minLength: n,
            maxLength: n
          }),
          async (preImages: bigint[]) => {
            const witness = await circuit.calculateWitness({
              in: preImages
            });
            await circuit.expectConstraintPass(witness);
            const output = await getSignal(circuit, witness, 'hash');
            const outputJS = hash5(preImages);

            return output === outputJS;
          }
        )
      );
    });
  });

  describe('Hasher10', () => {
    let circuit: WitnessTester<['in'], ['hash']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('hasher10', {
        file: CIRCOM_PATH,
        template: 'Hasher10'
      });
    });

    it('correctly hashes 10 random values', async () => {
      const n = 10;

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }), {
            minLength: n,
            maxLength: n
          }),
          async (preImages: bigint[]) => {
            const witness = await circuit.calculateWitness({
              in: preImages
            });
            await circuit.expectConstraintPass(witness);
            const output = await getSignal(circuit, witness, 'hash');
            const outputJS = hash10(preImages);

            return output === outputJS;
          }
        )
      );
    });
  });

  describe('Hasher12', () => {
    let circuit: WitnessTester<['in'], ['hash']>;

    before(async () => {
      circuit = await circomkitInstance.WitnessTester('hasher12', {
        file: CIRCOM_PATH,
        template: 'Hasher12'
      });
    });

    it('correctly hashes 12 random values', async () => {
      const n = 12;

      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.bigInt({ min: 0n, max: SNARK_FIELD_SIZE - 1n }), {
            minLength: n,
            maxLength: n
          }),
          async (preImages: bigint[]) => {
            const witness = await circuit.calculateWitness({
              in: preImages
            });
            await circuit.expectConstraintPass(witness);
            const output = await getSignal(circuit, witness, 'hash');
            const outputJS = hash12(preImages);

            return output === outputJS;
          }
        )
      );
    });
  });
});
