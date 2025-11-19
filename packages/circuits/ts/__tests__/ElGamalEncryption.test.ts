// import { EdDSAPoseidonKeypair } from '@dorafactory/maci-sdk';
// import { expect } from 'chai';
// import { type WitnessTester } from 'circomkit';

// import { getSignal, circomkitInstance } from './utils/utils';

// describe('ElGamal Encryption/Decryption circuits', function test() {
//   this.timeout(90000);

//   describe('ElGamalReRandomize', () => {
//     let circuit: WitnessTester<['c1', 'c2', 'randomVal', 'pubKey'], ['d1', 'd2']>;

//     const keypair = new EdDSAPoseidonKeypair();
//     const pubKey = keypair.getPublicKey();

//     before(async () => {
//       circuit = await circomkitInstance.WitnessTester('ElGamalReRandomize', {
//         file: 'amaci/power/lib/rerandomize',
//         template: 'ElGamalReRandomize'
//       });
//     });

//     it('should rerandomize an ElGamal ciphertext correctly', async () => {
//       // Original ciphertext
//       const c1 = [BigInt(1), BigInt(2)];
//       const c2 = [BigInt(3), BigInt(4)];
//       const randomVal = BigInt(12345);

//       const circuitInputs = {
//         c1,
//         c2,
//         randomVal,
//         pubKey: pubKey.toPoints() as unknown as [bigint, bigint]
//       };

//       const witness = await circuit.calculateWitness(circuitInputs);
//       await circuit.expectConstraintPass(witness);

//       const d1_0 = await getSignal(circuit, witness, 'd1[0]');
//       const d2_0 = await getSignal(circuit, witness, 'd2[0]');

//       // Check that rerandomized ciphertext is different from original
//       expect(d1_0).to.not.equal(c1[0]);
//       expect(d2_0).to.not.equal(c2[0]);
//     });
//   });

//   describe('ElGamalDecrypt', () => {
//     let circuit: WitnessTester<['c1', 'c2', 'privKey'], ['out', 'isOdd']>;

//     const keypair = new EdDSAPoseidonKeypair();
//     const privKey = keypair.getPrivateKey();

//     before(async () => {
//       circuit = await circomkitInstance.WitnessTester('ElGamalDecrypt', {
//         file: 'amaci/power/lib/rerandomize',
//         template: 'ElGamalDecrypt'
//       });
//     });

//     it('should decrypt an ElGamal ciphertext', async () => {
//       // For testing, we use a simple ciphertext
//       // In real usage, c1 and c2 would be properly encrypted values
//       const c1 = [BigInt(1), BigInt(2)];
//       const c2 = [BigInt(3), BigInt(4)];

//       const circuitInputs = {
//         c1,
//         c2,
//         privKey: privKey as bigint
//       };

//       const witness = await circuit.calculateWitness(circuitInputs);
//       await circuit.expectConstraintPass(witness);

//       const out = await getSignal(circuit, witness, 'out');
//       const isOdd = await getSignal(circuit, witness, 'isOdd');

//       // The output should be a valid field element
//       expect(out).to.be.a('bigint');
//       expect(isOdd).to.be.oneOf([0n, 1n]);
//     });
//   });
// });
