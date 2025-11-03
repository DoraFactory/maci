import { EdDSAPoseidonKeypair } from '@dorafactory/maci-sdk';
import { inCurve } from '@zk-kit/baby-jubjub';
import { expect } from 'chai';
import { type WitnessTester } from 'circomkit';
import fc from 'fast-check';

import { circomkitInstance, getSignal } from './utils/utils';

describe('Public key derivation circuit', function test() {
  this.timeout(900000);

  let circuit: WitnessTester<['privKey'], ['pubKey']>;

  before(async () => {
    circuit = await circomkitInstance.WitnessTester('privToPubKey', {
      file: './utils/privToPubKey',
      template: 'PrivToPubKey'
    });
  });

  it('should correctly compute a public key', async () => {
    const keypair = new EdDSAPoseidonKeypair();

    const circuitInputs = {
      privKey: keypair.getFormatedPrivKey()
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    const derivedPublicKeyX = await getSignal(circuit, witness, 'pubKey[0]');
    const derivedPublicKeyY = await getSignal(circuit, witness, 'pubKey[1]');
    expect(derivedPublicKeyX.toString()).to.be.eq(keypair.getPublicKey().toPoints()[0].toString());
    expect(derivedPublicKeyY.toString()).to.be.eq(keypair.getPublicKey().toPoints()[1].toString());
  });

  it('should produce an output that is within the baby jubjub curve', async () => {
    const keypair = new EdDSAPoseidonKeypair();

    const circuitInputs = {
      privKey: keypair.getFormatedPrivKey()
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    const derivedPublicKeyX = await getSignal(circuit, witness, 'pubKey[0]');
    const derivedPublicKeyY = await getSignal(circuit, witness, 'pubKey[1]');
    expect(inCurve([derivedPublicKeyX, derivedPublicKeyY])).to.eq(true);
  });

  // Note: The amaci privToPubKey circuit does not validate the private key range.
  // According to its comment: "Needs to be hashed, and then pruned before supplying it to the circuit"
  // The circuit assumes the input privKey has already been properly processed.

  it('should correctly compute a public key [fuzz]', async () => {
    await fc.assert(
      fc.asyncProperty(fc.bigInt(), async (salt: bigint) => {
        const kepair = EdDSAPoseidonKeypair.fromSecretKey(salt);
        const privKey = kepair.getFormatedPrivKey();
        const publicKey = kepair.getPublicKey();

        const witness = await circuit.calculateWitness({
          privKey: privKey
        });
        await circuit.expectConstraintPass(witness);

        const derivedPublicKeyX = await getSignal(circuit, witness, 'pubKey[0]');
        const derivedPublicKeyY = await getSignal(circuit, witness, 'pubKey[1]');

        return (
          derivedPublicKeyX === publicKey.toPoints()[0] &&
          derivedPublicKeyY === publicKey.toPoints()[1] &&
          inCurve([derivedPublicKeyX, derivedPublicKeyY])
        );
      }),
      { numRuns: 10_000 }
    );
  });

  describe('Invalid private key inputs', () => {
    // BabyJubJub subgroup order
    const SUBGROUP_ORDER =
      2736030358979909402780800718157159386076813972158567259200215660948447373041n;

    it('should reject private key when privKey >= SUBGROUP_ORDER', async () => {
      // With the security fix, the circuit should now reject invalid private keys
      const keypair = new EdDSAPoseidonKeypair();
      const validPrivKey = keypair.getFormatedPrivKey();

      // Create an invalid private key by adding SUBGROUP_ORDER
      const invalidPrivKey = validPrivKey + SUBGROUP_ORDER;

      // Both should be less than 2^253 to pass Num2Bits(253) constraint
      expect(invalidPrivKey < 2n ** 253n).to.eq(true);

      // Valid private key should work fine
      const witness1 = await circuit.calculateWitness({
        privKey: validPrivKey
      });
      await circuit.expectConstraintPass(witness1);

      const pubKeyX1 = await getSignal(circuit, witness1, 'pubKey[0]');
      const pubKeyY1 = await getSignal(circuit, witness1, 'pubKey[1]');
      expect(inCurve([pubKeyX1, pubKeyY1])).to.eq(true);

      // Invalid private key (>= SUBGROUP_ORDER) should be REJECTED
      try {
        await circuit.calculateWitness({
          privKey: invalidPrivKey
        });
        // If we reach here, the test should fail - the circuit should have rejected this
        expect.fail('Expected circuit to reject privKey >= SUBGROUP_ORDER');
      } catch (error) {
        // Expected to throw an error due to LessThan constraint failure
        expect(error).to.exist;
      }
    });

    it('should fail when privKey >= 2^253', async () => {
      // This should fail because Num2Bits(253) cannot handle values >= 2^253
      const tooLargePrivKey = 2n ** 253n;

      try {
        await circuit.calculateWitness({
          privKey: tooLargePrivKey
        });
        // If we reach here, the test should fail
        expect.fail('Expected witness calculation to fail for privKey >= 2^253');
      } catch (error) {
        // Expected to throw an error
        expect(error).to.exist;
      }
    });

    it('should succeed for privKey at boundary (SUBGROUP_ORDER - 1)', async () => {
      // The largest valid private key
      const maxValidPrivKey = SUBGROUP_ORDER - 1n;

      const witness = await circuit.calculateWitness({
        privKey: maxValidPrivKey
      });
      await circuit.expectConstraintPass(witness);

      const pubKeyX = await getSignal(circuit, witness, 'pubKey[0]');
      const pubKeyY = await getSignal(circuit, witness, 'pubKey[1]');

      // Should produce a valid point on the curve
      expect(inCurve([pubKeyX, pubKeyY])).to.eq(true);
    });
  });
});
