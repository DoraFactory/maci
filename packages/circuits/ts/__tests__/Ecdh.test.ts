import { EdDSAPoseidonKeypair } from '@dorafactory/maci-sdk';
import { expect } from 'chai';
import { type WitnessTester } from 'circomkit';

import { getSignal, circomkitInstance } from './utils/utils';

describe('ECDH circuit', function test() {
  this.timeout(90000);

  let circuit: WitnessTester<['privKey', 'pubKey'], ['sharedKey']>;

  before(async () => {
    circuit = await circomkitInstance.WitnessTester('Ecdh', {
      file: 'amaci/power/ecdh',
      template: 'Ecdh'
    });
  });

  it('should compute ECDH shared key correctly', async () => {
    const keypair1 = new EdDSAPoseidonKeypair();
    const keypair2 = new EdDSAPoseidonKeypair();

    const circuitInputs = {
      privKey: keypair1.getPrivateKey() as bigint,
      pubKey: keypair2.getPublicKey().toPoints() as unknown as [bigint, bigint]
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    const sharedKey0 = await getSignal(circuit, witness, 'sharedKey[0]');
    const sharedKey1 = await getSignal(circuit, witness, 'sharedKey[1]');

    // Check that shared key is computed (non-zero)
    expect(sharedKey0).to.be.a('bigint');
    expect(sharedKey1).to.be.a('bigint');
  });

  it('should produce same shared key for both parties', async () => {
    const keypair1 = new EdDSAPoseidonKeypair();
    const keypair2 = new EdDSAPoseidonKeypair();

    // Party 1: compute shared key using privKey1 and pubKey2
    const circuitInputs1 = {
      privKey: keypair1.getPrivateKey() as bigint,
      pubKey: keypair2.getPublicKey().toPoints() as unknown as [bigint, bigint]
    };

    const witness1 = await circuit.calculateWitness(circuitInputs1);
    await circuit.expectConstraintPass(witness1);

    const sharedKey1_0 = await getSignal(circuit, witness1, 'sharedKey[0]');
    const sharedKey1_1 = await getSignal(circuit, witness1, 'sharedKey[1]');

    // Party 2: compute shared key using privKey2 and pubKey1
    const circuitInputs2 = {
      privKey: keypair2.getPrivateKey() as bigint,
      pubKey: keypair1.getPublicKey().toPoints() as unknown as [bigint, bigint]
    };

    const witness2 = await circuit.calculateWitness(circuitInputs2);
    await circuit.expectConstraintPass(witness2);

    const sharedKey2_0 = await getSignal(circuit, witness2, 'sharedKey[0]');
    const sharedKey2_1 = await getSignal(circuit, witness2, 'sharedKey[1]');

    // Both parties should compute the same shared key
    expect(sharedKey1_0.toString()).to.equal(sharedKey2_0.toString());
    expect(sharedKey1_1.toString()).to.equal(sharedKey2_1.toString());
  });
});
