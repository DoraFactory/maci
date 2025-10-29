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
      file: './amaci/power/privToPubKey',
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
});
