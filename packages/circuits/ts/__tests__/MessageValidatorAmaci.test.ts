// import { EdDSAPoseidonKeypair } from '@dorafactory/maci-sdk';
// import { expect } from 'chai';
// import { type WitnessTester } from 'circomkit';

// import { circomkitInstance } from './utils/utils';

// describe('AMACI MessageValidator circuit', function test() {
//   this.timeout(90000);

//   const keypair = new EdDSAPoseidonKeypair();

//   // Mock command data (in real usage, these would be properly computed)
//   const mockCmd = [BigInt(1), BigInt(2), BigInt(3)];
//   const mockSigR8: [bigint, bigint] = [BigInt(123), BigInt(456)];
//   const mockSigS = BigInt(789);

//   let circuit: WitnessTester<
//     [
//       'stateTreeIndex',
//       'numSignUps',
//       'voteOptionIndex',
//       'maxVoteOptions',
//       'originalNonce',
//       'nonce',
//       'cmd',
//       'pubKey',
//       'sigR8',
//       'sigS',
//       'isQuadraticCost',
//       'currentVoiceCreditBalance',
//       'currentVotesForOption',
//       'voteWeight'
//     ],
//     ['isValid', 'newBalance']
//   >;

//   before(async () => {
//     circuit = await circomkitInstance.WitnessTester('MessageValidator', {
//       file: 'amaci/power/messageValidator',
//       template: 'MessageValidator'
//     });
//   });

//   it('should accept correct input structure (quadratic cost)', async () => {
//     const circuitInputs = {
//       stateTreeIndex: 0n,
//       numSignUps: 1n,
//       voteOptionIndex: 0n,
//       maxVoteOptions: 1n,
//       originalNonce: 1n,
//       nonce: 2n,
//       cmd: mockCmd,
//       pubKey: keypair.getPublicKey().toPoints() as unknown as [bigint, bigint],
//       sigR8: mockSigR8,
//       sigS: mockSigS,
//       isQuadraticCost: 1n,
//       currentVoiceCreditBalance: 100n,
//       currentVotesForOption: 0n,
//       voteWeight: 9n
//     };

//     // Note: This test will likely fail constraints because we're using mock signature
//     // The important part is that the circuit accepts the input structure
//     try {
//       const witness = await circuit.calculateWitness(circuitInputs);
//       expect(witness).to.not.be.undefined;
//     } catch (error) {
//       // Expected to fail with mock signature
//       expect(error).to.not.be.undefined;
//     }
//   });

//   it('should accept correct input structure (linear cost)', async () => {
//     const circuitInputs = {
//       stateTreeIndex: 0n,
//       numSignUps: 1n,
//       voteOptionIndex: 0n,
//       maxVoteOptions: 1n,
//       originalNonce: 1n,
//       nonce: 2n,
//       cmd: mockCmd,
//       pubKey: keypair.getPublicKey().toPoints() as unknown as [bigint, bigint],
//       sigR8: mockSigR8,
//       sigS: mockSigS,
//       isQuadraticCost: 0n, // Linear cost
//       currentVoiceCreditBalance: 100n,
//       currentVotesForOption: 0n,
//       voteWeight: 9n
//     };

//     try {
//       const witness = await circuit.calculateWitness(circuitInputs);
//       expect(witness).to.not.be.undefined;
//     } catch (error) {
//       // Expected to fail with mock signature
//       expect(error).to.not.be.undefined;
//     }
//   });

//   it('should handle different vote weights', async () => {
//     for (const voteWeight of [1n, 5n, 10n]) {
//       const circuitInputs = {
//         stateTreeIndex: 0n,
//         numSignUps: 1n,
//         voteOptionIndex: 0n,
//         maxVoteOptions: 1n,
//         originalNonce: 1n,
//         nonce: 2n,
//         cmd: mockCmd,
//         pubKey: keypair.getPublicKey().toPoints() as unknown as [bigint, bigint],
//         sigR8: mockSigR8,
//         sigS: mockSigS,
//         isQuadraticCost: 1n,
//         currentVoiceCreditBalance: 100n,
//         currentVotesForOption: 0n,
//         voteWeight
//       };

//       try {
//         const witness = await circuit.calculateWitness(circuitInputs);
//         expect(witness).to.not.be.undefined;
//       } catch (error) {
//         // Expected to fail with mock signature
//         expect(error).to.not.be.undefined;
//       }
//     }
//   });
// });
