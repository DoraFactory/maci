import fs from 'fs';
import path from 'path';
import { groth16 } from 'snarkjs';
import { OperatorClient, VoterClient, stringizing, adaptToUncompressed } from '@dorafactory/maci-sdk';

// Build paths configuration
const BUILD_DIR = path.join(__dirname, '../build');

// Deactivate circuit paths
const DEACTIVATE_WASM = path.join(
  BUILD_DIR,
  'ProcessDeactivateMessages_amaci_2-5/ProcessDeactivateMessages_amaci_2-5_js/ProcessDeactivateMessages_amaci_2-5.wasm'
);
const DEACTIVATE_ZKEY = path.join(
  BUILD_DIR,
  'ProcessDeactivateMessages_amaci_2-5/ProcessDeactivateMessages_amaci_2-5.0.zkey'
);

// AddKey circuit paths
const ADDKEY_WASM = path.join(
  BUILD_DIR,
  'AddNewKey_amaci_2/AddNewKey_amaci_2_js/AddNewKey_amaci_2.wasm'
);
const ADDKEY_ZKEY = path.join(BUILD_DIR, 'AddNewKey_amaci_2/AddNewKey_amaci_2.0.zkey');

// ProcessMessages circuit paths
const MSG_WASM = path.join(
  BUILD_DIR,
  'ProcessMessages_amaci_2-1-5/ProcessMessages_amaci_2-1-5_js/ProcessMessages_amaci_2-1-5.wasm'
);
const MSG_ZKEY = path.join(BUILD_DIR, 'ProcessMessages_amaci_2-1-5/ProcessMessages_amaci_2-1-5.0.zkey');

// TallyVotes circuit paths
const TALLY_WASM = path.join(
  BUILD_DIR,
  'TallyVotes_amaci_2-1-1/TallyVotes_amaci_2-1-1_js/TallyVotes_amaci_2-1-1.wasm'
);
const TALLY_ZKEY = path.join(BUILD_DIR, 'TallyVotes_amaci_2-1-1/TallyVotes_amaci_2-1-1.0.zkey');

// Output directory configuration
const outputPath = path.join(__dirname, '../build/inputs');
// Create output directory if it doesn't exist
if (!fs.existsSync(outputPath)) {
  fs.mkdirSync(outputPath, { recursive: true });
}

const maxVoteOptions = 5;

const main = async () => {
  const USER_1 = 0; // state leaf idx
  const USER_2 = 1; // state leaf idx
  const USER_1A = 2; // state leaf idx

  const privateKeys = [
    111111n, // coordinator
    222222n, // user 1
    333333n, // share key for message 1
    444444n, // share key for message 2
    555555n, // user 2
    666666n // add new key
  ];

  console.log('=== Initializing Clients ===');
  
  // Initialize OperatorClient (coordinator)
  const operator = new OperatorClient({
    network: 'testnet',
    secretKey: privateKeys[0]
  });

  // Initialize VoterClients
  const voter1 = new VoterClient({
    network: 'testnet',
    secretKey: privateKeys[1]
  });

  const voter2 = new VoterClient({
    network: 'testnet',
    secretKey: privateKeys[4]
  });

  // Initialize round with AMACI configuration
  operator.initRound({
    stateTreeDepth: 2,
    intStateTreeDepth: 1,
    voteOptionTreeDepth: 1,
    batchSize: 5,
    maxVoteOptions: maxVoteOptions,
    pollId: 1,
    isQuadraticCost: true,
    isAmaci: true
  });

  const logs: any[] = [];

  console.log('=== Setting up state tree ===');
  
  // Register user 1 and user 2
  const user1PubKey = voter1.getPubkey().toPoints();
  const user2PubKey = voter2.getPubkey().toPoints();

  operator.updateStateTree(USER_1, user1PubKey, 100);
  logs.push({
    type: 'setStateLeaf',
    data: {
      leafIdx: USER_1.toString(),
      pubKey: user1PubKey.map((x) => x.toString()),
      balance: '100'
    }
  });

  operator.updateStateTree(USER_2, user2PubKey, 100);
  logs.push({
    type: 'setStateLeaf',
    data: {
      leafIdx: USER_2.toString(),
      pubKey: user2PubKey.map((x) => x.toString()),
      balance: '100'
    }
  });

  console.log('=== Generating deactivate messages ===');
  
  // Get coordinator public key
  const coordPubKey = operator.getPubkey().toPoints();

  // Generate deactivate messages
  const dmessage1Payload = voter1.buildDeactivatePayload({
    stateIdx: USER_1,
    operatorPubkey: coordPubKey,
    pollId: 1,
    nonce: 0
  });

  const dmessage2Payload = voter2.buildDeactivatePayload({
    stateIdx: USER_2,
    operatorPubkey: coordPubKey,
    pollId: 1,
    nonce: 0
  });

  // Convert string arrays to bigint arrays
  const dmessage1 = dmessage1Payload.msg.map((m) => BigInt(m));
  const dmessage1EncPubKey = dmessage1Payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];

  const dmessage2 = dmessage2Payload.msg.map((m) => BigInt(m));
  const dmessage2EncPubKey = dmessage2Payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];

  operator.pushDeactivateMessage(dmessage1, dmessage1EncPubKey);
  logs.push({
    type: 'publishDeactivateMessage',
    data: {
      message: dmessage1.map((x) => x.toString()),
      encPubKey: dmessage1EncPubKey.map((x) => x.toString())
    }
  });

  operator.pushDeactivateMessage(dmessage2, dmessage2EncPubKey);
  logs.push({
    type: 'publishDeactivateMessage',
    data: {
      message: dmessage2.map((x) => x.toString()),
      encPubKey: dmessage2EncPubKey.map((x) => x.toString())
    }
  });

  console.log('=== Processing deactivate messages ===');
  
  // Process deactivate messages
  const { input: deactivateInput, newDeactivate } = await operator.processDeactivateMessages({
    inputSize: 2,
    subStateTreeLength: 2
  });

  // Write deactivate input for debugging
  fs.writeFileSync(
    path.join(outputPath, 'deactivate-input.json'),
    JSON.stringify(stringizing(deactivateInput as any), undefined, 2)
  );

  console.log('Generating deactivate proof...');
  const res_deactivate = await groth16.fullProve(deactivateInput as any, DEACTIVATE_WASM, DEACTIVATE_ZKEY);

  const uncompressedDeactivateProof = await adaptToUncompressed(res_deactivate.proof);
  // Convert format from {a, b, c} to {pi_a, pi_b, pi_c}
  const formattedDeactivateProof = {
    pi_a: uncompressedDeactivateProof.a,
    pi_b: uncompressedDeactivateProof.b,
    pi_c: uncompressedDeactivateProof.c
  };
  console.log('Deactivate proof generated');
  
  fs.writeFileSync(
    path.join(outputPath, 'deactivate-proof.json'),
    JSON.stringify(formattedDeactivateProof, undefined, 2)
  );

  // Generate public inputs for proofDeactivate (8 fields)
  const deactivatePublicInputs = [
    deactivateInput.newDeactivateRoot,
    operator.pubKeyHasher!,
    deactivateInput.batchStartHash,
    deactivateInput.batchEndHash,
    deactivateInput.currentDeactivateCommitment,
    deactivateInput.newDeactivateCommitment,
    deactivateInput.currentStateRoot,
    BigInt(operator.pollId!)
  ];

  logs.push({
    type: 'proofDeactivate',
    data: stringizing({
      proof: formattedDeactivateProof,
      size: 2,
      newDeactivateCommitment: deactivateInput.newDeactivateCommitment,
      newDeactivateRoot: deactivateInput.newDeactivateRoot
    } as any),
    inputs: deactivatePublicInputs.map((x) => x.toString())
  });

  console.log('proofDeactivate DONE');

  console.log('=== Adding new key for user 1 ===');
  
  // User 1 adds a new key
  const user1NewVoter = new VoterClient({
    network: 'testnet',
    secretKey: privateKeys[5]
  });

  const user1aPubKey = user1NewVoter.getPubkey().toPoints();

  // Generate addKeyInput using voter1's client
  const addKeyInputResult = await voter1.genAddKeyInput(
    operator.stateTreeDepth! + 2,
    {
      coordPubKey,
      deactivates: newDeactivate
    }
  );

  if (!addKeyInputResult) {
    throw new Error('Failed to generate addKeyInput');
  }

  const akInput = addKeyInputResult;
  const d1 = akInput.d1;
  const d2 = akInput.d2;
  const nullifier = akInput.nullifier;

  console.log('Generating addNewKey proof...');
  const res_addkey = await groth16.fullProve(akInput, ADDKEY_WASM, ADDKEY_ZKEY);

  // Register new state with d values
  operator.updateStateTree(USER_1A, user1aPubKey, 100, [...d1, ...d2] as [bigint, bigint, bigint, bigint]);
  logs.push({
    type: 'setStateLeaf',
    data: {
      leafIdx: USER_1A.toString(),
      pubKey: user1aPubKey.map((x) => x.toString()),
      balance: '100'
    }
  });

  const uncompressedAddNewKeyProof = await adaptToUncompressed(res_addkey.proof);
  // Convert format from {a, b, c} to {pi_a, pi_b, pi_c}
  const formattedAddNewKeyProof = {
    pi_a: uncompressedAddNewKeyProof.a,
    pi_b: uncompressedAddNewKeyProof.b,
    pi_c: uncompressedAddNewKeyProof.c
  };
  console.log('AddNewKey proof generated');
  
  fs.writeFileSync(
    path.join(outputPath, 'addnewkey-proof.json'),
    JSON.stringify(formattedAddNewKeyProof, undefined, 2)
  );

  // Generate public inputs for proofAddNewKey (7 fields)
  const addNewKeyPublicInputs = [
    operator.deactivateTree!.root, // deactivate_root (DNODES[0])
    operator.pubKeyHasher!,
    nullifier,
    d1[0],
    d1[1],
    d2[0],
    d2[1]
  ];

  logs.push({
    type: 'proofAddNewKey',
    data: stringizing({
      pubKey: user1aPubKey,
      proof: formattedAddNewKeyProof,
      d: [...d1, ...d2],
      nullifier
    } as any),
    inputs: addNewKeyPublicInputs.map((x) => x.toString())
  });

  console.log('proofAddNewKey DONE');

  console.log('=== Publishing vote messages ===');
  
  // Vote 1: User 1 votes option 1 with weight 8
  const vote1Payload = voter1.buildVotePayload({
    stateIdx: USER_1,
    operatorPubkey: coordPubKey,
    selectedOptions: [{ idx: 1, vc: 8 }],
    pollId: 1
  });

  // Publish all messages in vote1Payload
  for (const payload of vote1Payload) {
    const message = payload.msg.map((m) => BigInt(m));
    const encPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
    
    operator.pushMessage(message, encPubKey);
    logs.push({
      type: 'publishMessage',
      data: {
        message: message.map((x) => x.toString()),
        encPubKey: encPubKey.map((x) => x.toString())
      }
    });
  }

  // Vote 2: User 2 votes option 2 with weight 12
  const vote2Payload = voter2.buildVotePayload({
    stateIdx: USER_2,
    operatorPubkey: coordPubKey,
    selectedOptions: [{ idx: 2, vc: 12 }],
    pollId: 1
  });

  for (const payload of vote2Payload) {
    const message = payload.msg.map((m) => BigInt(m));
    const encPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
    
    operator.pushMessage(message, encPubKey);
    logs.push({
      type: 'publishMessage',
      data: {
        message: message.map((x) => x.toString()),
        encPubKey: encPubKey.map((x) => x.toString())
      }
    });
  }

  // Vote 3: User 1A (new key) votes option 2 with weight 6
  const vote3Payload = user1NewVoter.buildVotePayload({
    stateIdx: USER_1A,
    operatorPubkey: coordPubKey,
    selectedOptions: [{ idx: 2, vc: 6 }],
    pollId: 1
  });

  for (const payload of vote3Payload) {
    const message = payload.msg.map((m) => BigInt(m));
    const encPubKey = payload.encPubkeys.map((k) => BigInt(k)) as [bigint, bigint];
    
    operator.pushMessage(message, encPubKey);
    logs.push({
      type: 'publishMessage',
      data: {
        message: message.map((x) => x.toString()),
        encPubKey: encPubKey.map((x) => x.toString())
      }
    });
  }

  operator.endVotePeriod();

  console.log('=== Processing messages ===');
  
  // Process messages
  let i = 0;
  while (operator.states === 1) {
    const processResult = await operator.processMessages({
      newStateSalt: BigInt(20041 + i)
    });

    const processInput = processResult.input;

    // Generate public inputs for processMessage (AMACI: 8 fields including pollId)
    const publicInputs = [
      processInput.packedVals,
      operator.pubKeyHasher!,
      processInput.batchStartHash,
      processInput.batchEndHash,
      processInput.currentStateCommitment,
      processInput.newStateCommitment,
      processInput.deactivateCommitment!,
      BigInt(operator.pollId!)
    ];

    console.log(`Generating processMessage proof ${i}...`);
    const res_process = await groth16.fullProve(processInput as any, MSG_WASM, MSG_ZKEY);

    const uncompressedProcessMessageProof = await adaptToUncompressed(res_process.proof);
    // Convert format from {a, b, c} to {pi_a, pi_b, pi_c}
    const formattedProcessMessageProof = {
      pi_a: uncompressedProcessMessageProof.a,
      pi_b: uncompressedProcessMessageProof.b,
      pi_c: uncompressedProcessMessageProof.c
    };
    console.log(`ProcessMessage proof ${i} generated`);
    
    fs.writeFileSync(
      path.join(outputPath, 'processMessage-proof.json'),
      JSON.stringify(formattedProcessMessageProof, undefined, 2)
    );

    logs.push({
      type: 'processMessage',
      data: stringizing({
        proof: formattedProcessMessageProof,
        newStateCommitment: processInput.newStateCommitment
      } as any),
      inputs: publicInputs.map((x) => x.toString())
    });

    fs.writeFileSync(
      path.join(outputPath, `msg-input_${i.toString().padStart(4, '0')}.json`),
      JSON.stringify(stringizing(processInput as any), undefined, 2)
    );
    
    i++;
  }

  console.log('=== Tallying votes ===');
  
  // Tally votes
  i = 0;
  let salt = 0n;
  while (operator.states === 2) {
    const tallyResult = await operator.processTally({
      tallySalt: BigInt(20042 + i)
    });

    const tallyInput = tallyResult.input;
    salt = tallyInput.newResultsRootSalt;

    // Generate public inputs for processTally (4 fields)
    const publicInputs = [
      tallyInput.packedVals,
      tallyInput.stateCommitment,
      tallyInput.currentTallyCommitment,
      tallyInput.newTallyCommitment
    ];

    console.log(`Generating tally proof ${i}...`);
    const res_tally = await groth16.fullProve(tallyInput as any, TALLY_WASM, TALLY_ZKEY);

    const uncompressedTallyProof = await adaptToUncompressed(res_tally.proof);
    // Convert format from {a, b, c} to {pi_a, pi_b, pi_c}
    const formattedTallyProof = {
      pi_a: uncompressedTallyProof.a,
      pi_b: uncompressedTallyProof.b,
      pi_c: uncompressedTallyProof.c
    };
    console.log(`Tally proof ${i} generated`);
    
    fs.writeFileSync(
      path.join(outputPath, 'processTally-proof.json'),
      JSON.stringify(formattedTallyProof, undefined, 2)
    );

    logs.push({
      type: 'processTally',
      data: stringizing({
        proof: formattedTallyProof,
        newTallyCommitment: tallyInput.newTallyCommitment
      } as any),
      inputs: publicInputs.map((x) => x.toString())
    });

    fs.writeFileSync(
      path.join(outputPath, `tally-input_${i.toString().padStart(4, '0')}.json`),
      JSON.stringify(stringizing(tallyInput as any), undefined, 2)
    );
    
    i++;
  }

  // Get final results
  const results = operator.tallyResults!.leaves().slice(0, maxVoteOptions);

  logs.push({
    type: 'stopTallyingPeriod',
    data: stringizing({
      results,
      salt
    } as any)
  });

  console.log('=== Saving logs ===');
  console.log('Total logs:', logs.length);
  
  fs.writeFileSync(path.join(outputPath, 'logs.json'), JSON.stringify(stringizing(logs as any), undefined, 2));

  console.log('✅ DONE! Logs saved to:', path.join(outputPath, 'logs.json'));

  process.exit(0);
};

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
