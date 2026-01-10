import {
  EdDSAPoseidonKeypair,
  genRandomSalt,
  genEcdhSharedKey,
  rerandomize,
  encryptOdevity,
  Tree,
  poseidon,
  computeInputHash,
  VoterClient,
  OperatorClient
} from '@dorafactory/maci-sdk';
import { expect } from 'chai';
import { type WitnessTester } from 'circomkit';
import * as BabyJub from '@zk-kit/baby-jubjub';

import { getSignal, circomkitInstance } from './utils/utils';

describe('AMACI AddNewKey circuit', function test() {
  this.timeout(180000);

  const stateTreeDepth = 2;
  const deactivateTreeDepth = stateTreeDepth + 2; // 4

  let circuit: WitnessTester<
    [
      'inputHash',
      'coordPubKey',
      'deactivateRoot',
      'deactivateIndex',
      'deactivateLeaf',
      'c1',
      'c2',
      'randomVal',
      'd1',
      'd2',
      'deactivateLeafPathElements',
      'nullifier',
      'oldPrivateKey'
    ],
    []
  >;

  const oldVoterClient = new VoterClient({
    network: 'testnet'
  });
  const operatorClient = new OperatorClient({
    network: 'testnet'
  });
  const coordPubKey = operatorClient.getSigner().getPublicKey().toPoints() as [bigint, bigint];
  const coordPrivKey = operatorClient.getSigner().getFormatedPrivKey();

  const oldKeypair = oldVoterClient.getSigner();
  const oldPrivKey = oldKeypair.getFormatedPrivKey();

  before(async () => {
    circuit = await circomkitInstance.WitnessTester('AddNewKey', {
      file: 'amaci/power/addNewKey',
      template: 'AddNewKey',
      params: [stateTreeDepth]
    });
  });

  describe('Valid AddNewKey proof', () => {
    it('should verify AddNewKey proof with correctly computed inputs (using SDK)', async () => {
      // Step 1: Operator generates pre-deactivate entry for the voter

      const voterPubkey = oldKeypair.getPublicKey().toPoints() as [bigint, bigint];

      // Operator generates deactivate entry (false = active voter)
      const { deactivates, root, tree } = operatorClient.genPreDeactivate({
        voterPubkeys: [voterPubkey],
        stateTreeDepth
      });

      // Step 2: Voter uses this deactivate entry to generate AddKey input
      const randomVal = genRandomSalt();

      // Find matching deactivate (simulating SDK's logic)
      const mySharedKeyHash = poseidon(oldKeypair.genEcdhSharedKey(coordPubKey));
      const deactivateIdx = deactivates.findIndex((d) => d[4] === mySharedKeyHash);

      if (deactivateIdx < 0) {
        throw new Error('Could not find matching deactivate');
      }

      const deactivateLeaf = deactivates[deactivateIdx];
      const c1_from_deactivate = [deactivateLeaf[0], deactivateLeaf[1]];
      const c2_from_deactivate = [deactivateLeaf[2], deactivateLeaf[3]];

      // Rerandomize (SDK's logic)
      const { d1, d2 } = rerandomize(
        coordPubKey,
        {
          c1: c1_from_deactivate,
          c2: c2_from_deactivate
        },
        randomVal
      );

      // Compute nullifier (SDK's logic)
      const nullifier = poseidon([oldKeypair.getFormatedPrivKey(), 1444992409218394441042n]);

      // Build tree (SDK's logic)
      const deactivateRoot = root;
      const deactivateLeafPathElements = tree.pathElementOf(deactivateIdx);

      // Compute input hash (SDK's logic using our new unified function)
      const inputHash = computeInputHash([
        deactivateRoot,
        poseidon(coordPubKey),
        nullifier,
        d1[0],
        d1[1],
        d2[0],
        d2[1]
      ]);

      // Prepare circuit inputs
      const circuitInputs = {
        inputHash,
        coordPubKey: coordPubKey as [bigint, bigint],
        deactivateRoot,
        deactivateIndex: BigInt(deactivateIdx),
        deactivateLeaf: poseidon(deactivateLeaf),
        c1: c1_from_deactivate as [bigint, bigint],
        c2: c2_from_deactivate as [bigint, bigint],
        randomVal,
        d1: d1 as [bigint, bigint],
        d2: d2 as [bigint, bigint],
        deactivateLeafPathElements,
        nullifier,
        oldPrivateKey: oldKeypair.getFormatedPrivKey()
      };

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      // Verify the circuit doesn't produce any output signals (it's a verification circuit)
      expect(witness).to.not.be.undefined;
    });

    it('should verify with multiple deactivates in tree (using SDK)', async () => {
      // Operator generates multiple pre-deactivate entries

      const numDeactivates = 5;
      const myIndex = 2; // Our deactivate is at index 2

      // Generate all other keypairs first
      const otherKeypairs: EdDSAPoseidonKeypair[] = [];
      for (let i = 0; i < numDeactivates - 1; i++) {
        otherKeypairs.push(new EdDSAPoseidonKeypair());
      }

      // Collect all public keys in the correct order
      const allPubkeys: [bigint, bigint][] = [];
      for (let i = 0; i < numDeactivates; i++) {
        if (i === myIndex) {
          allPubkeys.push(oldKeypair.getPublicKey().toPoints() as [bigint, bigint]);
        } else {
          const otherIdx = i < myIndex ? i : i - 1;
          allPubkeys.push(otherKeypairs[otherIdx].getPublicKey().toPoints() as [bigint, bigint]);
        }
      }

      // Generate all deactivate messages at once
      const { deactivates, root, tree } = operatorClient.genPreDeactivate({
        voterPubkeys: allPubkeys,
        stateTreeDepth
      });

      // Use SDK genAddKeyInput logic
      const randomVal = genRandomSalt();

      // Find matching deactivate (simulating SDK's logic)
      const mySharedKeyHash = poseidon(oldKeypair.genEcdhSharedKey(coordPubKey));
      const deactivateIdx = deactivates.findIndex((d) => d[4] === mySharedKeyHash);

      if (deactivateIdx < 0) {
        throw new Error('Could not find matching deactivate');
      }

      const deactivateLeaf = deactivates[deactivateIdx];
      const c1_from_deactivate = [deactivateLeaf[0], deactivateLeaf[1]];
      const c2_from_deactivate = [deactivateLeaf[2], deactivateLeaf[3]];

      // Rerandomize (SDK's logic)
      const { d1, d2 } = rerandomize(
        coordPubKey,
        {
          c1: c1_from_deactivate,
          c2: c2_from_deactivate
        },
        randomVal
      );

      // Compute nullifier (SDK's logic)
      const nullifier = poseidon([oldKeypair.getFormatedPrivKey(), 1444992409218394441042n]);

      // Build tree (SDK's logic)
      const deactivateRoot = root;
      const deactivateLeafPathElements = tree.pathElementOf(deactivateIdx);

      // Compute input hash (SDK's logic using our new unified function)
      const inputHash = computeInputHash([
        deactivateRoot,
        poseidon(coordPubKey),
        nullifier,
        d1[0],
        d1[1],
        d2[0],
        d2[1]
      ]);

      // Prepare circuit inputs
      const circuitInputs = {
        inputHash,
        coordPubKey: coordPubKey as [bigint, bigint],
        deactivateRoot,
        deactivateIndex: BigInt(deactivateIdx),
        deactivateLeaf: poseidon(deactivateLeaf),
        c1: c1_from_deactivate as [bigint, bigint],
        c2: c2_from_deactivate as [bigint, bigint],
        randomVal,
        d1: d1 as [bigint, bigint],
        d2: d2 as [bigint, bigint],
        deactivateLeafPathElements,
        nullifier,
        oldPrivateKey: oldKeypair.getFormatedPrivKey()
      };

      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);
    });

    it('should verify using voterClient.genAddKeyInput (complete SDK integration)', async () => {
      // Step 1: Operator generates multiple pre-deactivate entries
      const numDeactivates = 5;
      const myIndex = 2; // Our voter's deactivate is at index 2

      // Generate all other keypairs first
      const otherKeypairs: EdDSAPoseidonKeypair[] = [];
      for (let i = 0; i < numDeactivates - 1; i++) {
        otherKeypairs.push(new EdDSAPoseidonKeypair());
      }

      // Collect all public keys in the correct order
      const allPubkeys: [bigint, bigint][] = [];
      for (let i = 0; i < numDeactivates; i++) {
        if (i === myIndex) {
          allPubkeys.push(oldKeypair.getPublicKey().toPoints() as [bigint, bigint]);
        } else {
          const otherIdx = i < myIndex ? i : i - 1;
          allPubkeys.push(otherKeypairs[otherIdx].getPublicKey().toPoints() as [bigint, bigint]);
        }
      }

      // Generate all deactivate messages at once
      const { deactivates } = operatorClient.genPreDeactivate({
        voterPubkeys: allPubkeys,
        stateTreeDepth
      });

      // Step 2: Voter uses genAddKeyInput to generate circuit inputs
      const circuitInputs = await oldVoterClient.genAddKeyInput(deactivateTreeDepth, {
        coordPubKey,
        deactivates
      });

      // Verify that genAddKeyInput found the matching deactivate
      expect(circuitInputs).to.not.be.null;
      if (!circuitInputs) {
        throw new Error('genAddKeyInput returned null');
      }

      // Step 3: Verify the circuit with SDK-generated inputs
      const witness = await circuit.calculateWitness(circuitInputs);
      await circuit.expectConstraintPass(witness);

      // Step 4: Verify key components are correct
      expect(circuitInputs.deactivateIndex).to.equal(myIndex);
      expect(circuitInputs.oldPrivateKey).to.equal(oldPrivKey);

      // Verify nullifier is correctly computed
      const expectedNullifier = poseidon([oldPrivKey, 1444992409218394441042n]);
      expect(circuitInputs.nullifier).to.equal(expectedNullifier);
    });
  });

  describe('Invalid inputs should fail', () => {
    it('should fail with wrong nullifier', async () => {
      const r = genRandomSalt();
      const encrypted = encryptOdevity(false, coordPubKey, r);
      const c1 = [encrypted.c1.x, encrypted.c1.y];
      const c2 = [encrypted.c2.x, encrypted.c2.y];

      const sharedKey = genEcdhSharedKey(oldPrivKey, coordPubKey);
      const sharedKeyHash = poseidon(sharedKey);
      const deactivateLeaf = poseidon([c1[0], c1[1], c2[0], c2[1], sharedKeyHash]);

      const tree = new Tree(5, deactivateTreeDepth, 0n);
      tree.initLeaves([deactivateLeaf]);
      const deactivateRoot = tree.root;
      const deactivateLeafPathElements = tree.pathElementOf(0);

      const randomVal = genRandomSalt();
      const { d1, d2 } = rerandomize(coordPubKey, { c1, c2 }, randomVal);

      // Wrong nullifier!
      const wrongNullifier = poseidon([123456789n, 1444992409218394441042n]);

      const coordPubKeyHash = poseidon(coordPubKey);
      const inputHash = computeInputHash([
        deactivateRoot,
        coordPubKeyHash,
        wrongNullifier,
        d1[0],
        d1[1],
        d2[0],
        d2[1]
      ]);

      const circuitInputs = {
        inputHash,
        coordPubKey: coordPubKey as [bigint, bigint],
        deactivateRoot,
        deactivateIndex: 0n,
        deactivateLeaf,
        c1: c1 as [bigint, bigint],
        c2: c2 as [bigint, bigint],
        randomVal,
        d1: d1 as [bigint, bigint],
        d2: d2 as [bigint, bigint],
        deactivateLeafPathElements,
        nullifier: wrongNullifier,
        oldPrivateKey: oldPrivKey
      };

      try {
        await circuit.calculateWitness(circuitInputs);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.include('Assert Failed');
      }
    });

    it('should fail with wrong shared key (different private key)', async () => {
      const r = genRandomSalt();
      const encrypted = encryptOdevity(false, coordPubKey, r);
      const c1 = [encrypted.c1.x, encrypted.c1.y];
      const c2 = [encrypted.c2.x, encrypted.c2.y];

      // Use a DIFFERENT private key's shared key
      const wrongKeypair = new EdDSAPoseidonKeypair();
      const wrongPrivKey = wrongKeypair.getFormatedPrivKey();
      const wrongSharedKey = genEcdhSharedKey(wrongPrivKey, coordPubKey);
      const wrongSharedKeyHash = poseidon(wrongSharedKey);

      // This deactivate leaf will be wrong
      const deactivateLeaf = poseidon([c1[0], c1[1], c2[0], c2[1], wrongSharedKeyHash]);

      const tree = new Tree(5, deactivateTreeDepth, 0n);
      tree.initLeaves([deactivateLeaf]);
      const deactivateRoot = tree.root;
      const deactivateLeafPathElements = tree.pathElementOf(0);

      const randomVal = genRandomSalt();
      const { d1, d2 } = rerandomize(coordPubKey, { c1, c2 }, randomVal);

      const nullifier = poseidon([oldPrivKey, 1444992409218394441042n]);

      const coordPubKeyHash = poseidon(coordPubKey);
      const inputHash = computeInputHash([
        deactivateRoot,
        coordPubKeyHash,
        nullifier,
        d1[0],
        d1[1],
        d2[0],
        d2[1]
      ]);

      const circuitInputs = {
        inputHash,
        coordPubKey: coordPubKey as [bigint, bigint],
        deactivateRoot,
        deactivateIndex: 0n,
        deactivateLeaf,
        c1: c1 as [bigint, bigint],
        c2: c2 as [bigint, bigint],
        randomVal,
        d1: d1 as [bigint, bigint],
        d2: d2 as [bigint, bigint],
        deactivateLeafPathElements,
        nullifier,
        oldPrivateKey: oldPrivKey // Using correct privKey but tree has wrong sharedKey
      };

      try {
        await circuit.calculateWitness(circuitInputs);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.include('Assert Failed');
      }
    });

    it('should fail with incorrect rerandomization', async () => {
      const r = genRandomSalt();
      const encrypted = encryptOdevity(false, coordPubKey, r);
      const c1 = [encrypted.c1.x, encrypted.c1.y];
      const c2 = [encrypted.c2.x, encrypted.c2.y];

      const sharedKey = genEcdhSharedKey(oldPrivKey, coordPubKey);
      const sharedKeyHash = poseidon(sharedKey);
      const deactivateLeaf = poseidon([c1[0], c1[1], c2[0], c2[1], sharedKeyHash]);

      const tree = new Tree(5, deactivateTreeDepth, 0n);
      tree.initLeaves([deactivateLeaf]);
      const deactivateRoot = tree.root;
      const deactivateLeafPathElements = tree.pathElementOf(0);

      const randomVal = genRandomSalt();
      const { d1, d2 } = rerandomize(coordPubKey, { c1, c2 }, randomVal);

      // Tamper with d1
      const wrongD1 = [d1[0] + 1n, d1[1]];

      const nullifier = poseidon([oldPrivKey, 1444992409218394441042n]);

      const coordPubKeyHash = poseidon(coordPubKey);
      const inputHash = computeInputHash([
        deactivateRoot,
        coordPubKeyHash,
        nullifier,
        wrongD1[0],
        wrongD1[1],
        d2[0],
        d2[1]
      ]);

      const circuitInputs = {
        inputHash,
        coordPubKey: coordPubKey as [bigint, bigint],
        deactivateRoot,
        deactivateIndex: 0n,
        deactivateLeaf,
        c1: c1 as [bigint, bigint],
        c2: c2 as [bigint, bigint],
        randomVal,
        d1: wrongD1 as [bigint, bigint],
        d2: d2 as [bigint, bigint],
        deactivateLeafPathElements,
        nullifier,
        oldPrivateKey: oldPrivKey
      };

      try {
        await circuit.calculateWitness(circuitInputs);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.include('Assert Failed');
      }
    });

    it('should fail with deactivate leaf not in tree', async () => {
      const r = genRandomSalt();
      const encrypted = encryptOdevity(false, coordPubKey, r);
      const c1 = [encrypted.c1.x, encrypted.c1.y];
      const c2 = [encrypted.c2.x, encrypted.c2.y];

      const sharedKey = genEcdhSharedKey(oldPrivKey, coordPubKey);
      const sharedKeyHash = poseidon(sharedKey);
      const correctLeaf = poseidon([c1[0], c1[1], c2[0], c2[1], sharedKeyHash]);

      // Create tree with DIFFERENT leaf
      const tree = new Tree(5, deactivateTreeDepth, 0n);
      const wrongLeaf = poseidon([1n, 2n, 3n, 4n, 5n]);
      tree.initLeaves([wrongLeaf]);
      const deactivateRoot = tree.root;
      const deactivateLeafPathElements = tree.pathElementOf(0);

      const randomVal = genRandomSalt();
      const { d1, d2 } = rerandomize(coordPubKey, { c1, c2 }, randomVal);

      const nullifier = poseidon([oldPrivKey, 1444992409218394441042n]);

      const coordPubKeyHash = poseidon(coordPubKey);
      const inputHash = computeInputHash([
        deactivateRoot,
        coordPubKeyHash,
        nullifier,
        d1[0],
        d1[1],
        d2[0],
        d2[1]
      ]);

      const circuitInputs = {
        inputHash,
        coordPubKey: coordPubKey as [bigint, bigint],
        deactivateRoot,
        deactivateIndex: 0n,
        deactivateLeaf: correctLeaf, // Claim this is the leaf
        c1: c1 as [bigint, bigint],
        c2: c2 as [bigint, bigint],
        randomVal,
        d1: d1 as [bigint, bigint],
        d2: d2 as [bigint, bigint],
        deactivateLeafPathElements, // But path is for wrongLeaf
        nullifier,
        oldPrivateKey: oldPrivKey
      };

      try {
        await circuit.calculateWitness(circuitInputs);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.include('Assert Failed');
      }
    });
  });

  describe('ElGamal rerandomization properties', () => {
    it('should maintain plaintext after rerandomization', async () => {
      // Generate original ciphertext
      const r = genRandomSalt();
      const encrypted = encryptOdevity(false, coordPubKey, r);
      const c1 = [encrypted.c1.x, encrypted.c1.y];
      const c2 = [encrypted.c2.x, encrypted.c2.y];

      // Decrypt original
      const c1x = BabyJub.mulPointEscalar(c1 as any, coordPrivKey);
      const c1xInverse = [
        BabyJub.Fr.e(c1x[0] * BigInt(-1)),
        BigInt(c1x[1])
      ] as BabyJub.Point<bigint>;
      const decryptedOriginal = BabyJub.addPoint(c1xInverse, c2 as any);
      const originalIsOdd = decryptedOriginal[0] % 2n === 1n;

      // Rerandomize
      const randomVal = genRandomSalt();
      const { d1, d2 } = rerandomize(coordPubKey, { c1, c2 }, randomVal);

      // Decrypt rerandomized
      const d1x = BabyJub.mulPointEscalar(d1 as any, coordPrivKey);
      const d1xInverse = [
        BabyJub.Fr.e(d1x[0] * BigInt(-1)),
        BigInt(d1x[1])
      ] as BabyJub.Point<bigint>;
      const decryptedRerand = BabyJub.addPoint(d1xInverse, d2 as any);
      const rerandIsOdd = decryptedRerand[0] % 2n === 1n;

      // Both should have same parity (both deactivated = even)
      expect(originalIsOdd).to.equal(rerandIsOdd);
      expect(originalIsOdd).to.be.false; // deactivated
    });
  });
});

describe('AMACI AddNewKeyInputHasher circuit', function test() {
  this.timeout(90000);

  let circuit: WitnessTester<['deactivateRoot', 'coordPubKey', 'nullifier', 'd1', 'd2'], ['hash']>;

  const coordKeypair = new EdDSAPoseidonKeypair();
  const coordPubKey = coordKeypair.getPublicKey().toPoints() as [bigint, bigint];

  before(async () => {
    circuit = await circomkitInstance.WitnessTester('AddNewKeyInputHasher', {
      file: 'amaci/power/addNewKey',
      template: 'AddNewKeyInputHasher'
    });
  });

  it('should compute input hash correctly', async () => {
    const deactivateRoot = BigInt(888);
    const nullifier = BigInt(123456);
    const d1 = [BigInt(100), BigInt(200)];
    const d2 = [BigInt(300), BigInt(400)];

    const circuitInputs = {
      deactivateRoot,
      coordPubKey: coordPubKey as [bigint, bigint],
      nullifier,
      d1: d1 as [bigint, bigint],
      d2: d2 as [bigint, bigint]
    };

    const witness = await circuit.calculateWitness(circuitInputs);
    await circuit.expectConstraintPass(witness);

    const hash = await getSignal(circuit, witness, 'hash');

    // Hash should be a valid field element
    expect(hash).to.be.a('bigint');
    expect(hash > 0n).to.be.true;

    // Verify hash matches SDK computation
    const coordPubKeyHash = poseidon(coordPubKey);
    const expectedHash = computeInputHash([
      deactivateRoot,
      coordPubKeyHash,
      nullifier,
      d1[0],
      d1[1],
      d2[0],
      d2[1]
    ]);

    expect(hash.toString()).to.equal(expectedHash.toString());
  });

  it('should produce different hashes for different inputs', async () => {
    const deactivateRoot1 = BigInt(888);
    const deactivateRoot2 = BigInt(999);
    const nullifier = BigInt(123456);
    const d1 = [BigInt(100), BigInt(200)];
    const d2 = [BigInt(300), BigInt(400)];

    const circuitInputs1 = {
      deactivateRoot: deactivateRoot1,
      coordPubKey: coordPubKey as [bigint, bigint],
      nullifier,
      d1: d1 as [bigint, bigint],
      d2: d2 as [bigint, bigint]
    };

    const circuitInputs2 = {
      deactivateRoot: deactivateRoot2,
      coordPubKey: coordPubKey as [bigint, bigint],
      nullifier,
      d1: d1 as [bigint, bigint],
      d2: d2 as [bigint, bigint]
    };

    const witness1 = await circuit.calculateWitness(circuitInputs1);
    const witness2 = await circuit.calculateWitness(circuitInputs2);

    const hash1 = await getSignal(circuit, witness1, 'hash');
    const hash2 = await getSignal(circuit, witness2, 'hash');

    // Different inputs should produce different hashes
    expect(hash1.toString()).to.not.equal(hash2.toString());
  });

  it('should be deterministic', async () => {
    const deactivateRoot = BigInt(12345);
    const nullifier = BigInt(67890);
    const d1 = [BigInt(111), BigInt(222)];
    const d2 = [BigInt(333), BigInt(444)];

    const circuitInputs = {
      deactivateRoot,
      coordPubKey: coordPubKey as [bigint, bigint],
      nullifier,
      d1: d1 as [bigint, bigint],
      d2: d2 as [bigint, bigint]
    };

    // Calculate witness twice
    const witness1 = await circuit.calculateWitness(circuitInputs);
    const witness2 = await circuit.calculateWitness(circuitInputs);

    const hash1 = await getSignal(circuit, witness1, 'hash');
    const hash2 = await getSignal(circuit, witness2, 'hash');

    // Same inputs should always produce same hash
    expect(hash1.toString()).to.equal(hash2.toString());
  });
});
