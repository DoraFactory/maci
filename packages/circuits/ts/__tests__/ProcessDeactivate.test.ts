// import { EdDSAPoseidonKeypair } from '@dorafactory/maci-sdk';
// import { expect } from 'chai';
// import { type WitnessTester } from 'circomkit';

// import { getSignal, circomkitInstance } from './utils/utils';

// describe('AMACI ProcessDeactivateMessages circuit', function test() {
//   this.timeout(180000);

//   const stateTreeDepth = 2;
//   const batchSize = 5;
//   const deactivateTreeDepth = stateTreeDepth + 2;
//   const TREE_ARITY = 5;
//   const MSG_LENGTH = 7;
//   const STATE_LEAF_LENGTH = 10;

//   let circuit: WitnessTester<any, any>;

//   const coordKeypair = new EdDSAPoseidonKeypair();
//   const coordPrivKey = coordKeypair.getPrivateKey();
//   const coordPubKey = coordKeypair.getPublicKey().toPoints();

//   before(async () => {
//     circuit = await circomkitInstance.WitnessTester('ProcessDeactivateMessages', {
//       file: 'amaci/power/processDeactivate',
//       template: 'ProcessDeactivateMessages',
//       params: [stateTreeDepth, batchSize]
//     });
//   });

//   it('should verify ProcessDeactivateMessages with valid structure', async () => {
//     // Create mock messages
//     const msgs = Array(batchSize)
//       .fill(null)
//       .map(() => Array(MSG_LENGTH).fill(BigInt(1)));

//     const encPubKeys = Array(batchSize)
//       .fill(null)
//       .map(() => {
//         const kp = new EdDSAPoseidonKeypair();
//         return kp.getPublicKey().toPoints() as unknown as [bigint, bigint];
//       });

//     // Mock ElGamal ciphertexts
//     const c1 = Array(batchSize)
//       .fill(null)
//       .map(() => [BigInt(1), BigInt(2)]);
//     const c2 = Array(batchSize)
//       .fill(null)
//       .map(() => [BigInt(3), BigInt(4)]);

//     // Mock state leaves
//     const currentStateLeaves = Array(batchSize)
//       .fill(null)
//       .map(() => Array(STATE_LEAF_LENGTH).fill(BigInt(1)));

//     // Set public keys in state leaves
//     for (let i = 0; i < batchSize; i++) {
//       const kp = new EdDSAPoseidonKeypair();
//       const pubKeyArray = kp.getPublicKey().toPoints() as unknown as [bigint, bigint];
//       currentStateLeaves[i][0] = pubKeyArray[0];
//       currentStateLeaves[i][1] = pubKeyArray[1];
//     }

//     // Mock path elements
//     const currentStateLeavesPathElements = Array(batchSize)
//       .fill(null)
//       .map(() =>
//         Array(stateTreeDepth)
//           .fill(null)
//           .map(() => Array(TREE_ARITY - 1).fill(BigInt(0)))
//       );

//     const activeStateLeavesPathElements = Array(batchSize)
//       .fill(null)
//       .map(() =>
//         Array(stateTreeDepth)
//           .fill(null)
//           .map(() => Array(TREE_ARITY - 1).fill(BigInt(0)))
//       );

//     const deactivateLeavesPathElements = Array(batchSize)
//       .fill(null)
//       .map(() =>
//         Array(deactivateTreeDepth)
//           .fill(null)
//           .map(() => Array(TREE_ARITY - 1).fill(BigInt(0)))
//       );

//     const currentActiveState = Array(batchSize).fill(BigInt(1));
//     const newActiveState = Array(batchSize).fill(BigInt(0));

//     const circuitInputs = {
//       inputHash: BigInt(123),
//       currentActiveStateRoot: BigInt(100),
//       currentDeactivateRoot: BigInt(200),
//       batchStartHash: BigInt(300),
//       batchEndHash: BigInt(400),
//       coordPrivKey: coordPrivKey as bigint,
//       coordPubKey: coordPubKey as unknown as [bigint, bigint],
//       msgs,
//       encPubKeys,
//       c1,
//       c2,
//       currentActiveState,
//       newActiveState,
//       deactivateIndex0: BigInt(0),
//       currentStateRoot: BigInt(500),
//       currentStateLeaves,
//       currentStateLeavesPathElements,
//       activeStateLeavesPathElements,
//       deactivateLeavesPathElements,
//       currentDeactivateCommitment: BigInt(600),
//       newDeactivateRoot: BigInt(700),
//       newDeactivateCommitment: BigInt(800)
//     };

//     // Verify input structure is correct
//     expect(circuitInputs.msgs).to.have.lengthOf(batchSize);
//     expect(circuitInputs.encPubKeys).to.have.lengthOf(batchSize);
//     expect(circuitInputs.c1).to.have.lengthOf(batchSize);
//     expect(circuitInputs.c2).to.have.lengthOf(batchSize);
//     expect(circuitInputs.currentStateLeaves).to.have.lengthOf(batchSize);
//     expect(circuitInputs.currentStateLeavesPathElements).to.have.lengthOf(batchSize);

//     // Run the circuit to verify it passes with valid inputs
//     const witness = await circuit.calculateWitness(circuitInputs);
//     await circuit.expectConstraintPass(witness);
//   });
// });

// describe('AMACI ProcessDeactivateMessagesInputHasher circuit', function test() {
//   this.timeout(90000);

//   let circuit: WitnessTester<
//     [
//       'newDeactivateRoot',
//       'coordPubKey',
//       'batchStartHash',
//       'batchEndHash',
//       'currentDeactivateCommitment',
//       'newDeactivateCommitment',
//       'currentStateRoot'
//     ],
//     ['hash']
//   >;

//   const coordKeypair = new EdDSAPoseidonKeypair();
//   const coordPubKey = coordKeypair.getPublicKey().toPoints();

//   before(async () => {
//     circuit = await circomkitInstance.WitnessTester('ProcessDeactivateMessagesInputHasher', {
//       file: 'amaci/power/processDeactivate',
//       template: 'ProcessDeactivateMessagesInputHasher'
//     });
//   });

//   it('should compute input hash correctly', async () => {
//     const circuitInputs = {
//       newDeactivateRoot: BigInt(700),
//       coordPubKey: coordPubKey as unknown as [bigint, bigint],
//       batchStartHash: BigInt(300),
//       batchEndHash: BigInt(400),
//       currentDeactivateCommitment: BigInt(600),
//       newDeactivateCommitment: BigInt(800),
//       currentStateRoot: BigInt(500)
//     };

//     const witness = await circuit.calculateWitness(circuitInputs);
//     await circuit.expectConstraintPass(witness);

//     const hash = await getSignal(circuit, witness, 'hash');

//     // Hash should be a valid field element
//     expect(hash).to.be.a('bigint');
//     expect(hash > 0n).to.be.true;
//   });

//   it('should produce different hashes for different inputs', async () => {
//     const circuitInputs1 = {
//       newDeactivateRoot: BigInt(700),
//       coordPubKey: coordPubKey as unknown as [bigint, bigint],
//       batchStartHash: BigInt(300),
//       batchEndHash: BigInt(400),
//       currentDeactivateCommitment: BigInt(600),
//       newDeactivateCommitment: BigInt(800),
//       currentStateRoot: BigInt(500)
//     };

//     const circuitInputs2 = {
//       newDeactivateRoot: BigInt(701), // Different value
//       coordPubKey: coordPubKey as unknown as [bigint, bigint],
//       batchStartHash: BigInt(300),
//       batchEndHash: BigInt(400),
//       currentDeactivateCommitment: BigInt(600),
//       newDeactivateCommitment: BigInt(800),
//       currentStateRoot: BigInt(500)
//     };

//     const witness1 = await circuit.calculateWitness(circuitInputs1);
//     const witness2 = await circuit.calculateWitness(circuitInputs2);

//     const hash1 = await getSignal(circuit, witness1, 'hash');
//     const hash2 = await getSignal(circuit, witness2, 'hash');

//     // Different inputs should produce different hashes
//     expect(hash1.toString()).to.not.equal(hash2.toString());
//   });

//   it('should be deterministic', async () => {
//     const circuitInputs = {
//       newDeactivateRoot: BigInt(700),
//       coordPubKey: coordPubKey as unknown as [bigint, bigint],
//       batchStartHash: BigInt(300),
//       batchEndHash: BigInt(400),
//       currentDeactivateCommitment: BigInt(600),
//       newDeactivateCommitment: BigInt(800),
//       currentStateRoot: BigInt(500)
//     };

//     const witness1 = await circuit.calculateWitness(circuitInputs);
//     const witness2 = await circuit.calculateWitness(circuitInputs);

//     const hash1 = await getSignal(circuit, witness1, 'hash');
//     const hash2 = await getSignal(circuit, witness2, 'hash');

//     // Same inputs should produce same hash
//     expect(hash1.toString()).to.equal(hash2.toString());
//   });
// });
