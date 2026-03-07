import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { groth16 } from 'snarkjs';
import { OperatorClient, VoterClient, stringizing, adaptToUncompressed } from '@dorafactory/maci-sdk';

// Build paths configuration
const BUILD_DIR = path.join(__dirname, '../build');

// v4 zkey/wasm artifacts (amaci_2-1-1-5)
const ZKEYS_V4_BASE = path.join(BUILD_DIR, 'amaci_2-1-1-5_v4');
const ZKEYS_V4_URLS = {
  addNewKeyWasm: 'https://vota-zkey.s3.ap-southeast-1.amazonaws.com/add-new-key_2-1-1-5_v4.wasm',
  addNewKeyZkey: 'https://vota-zkey.s3.ap-southeast-1.amazonaws.com/add-new-key_2-1-1-5_v4.zkey',
  amaciZkeysTar: 'https://vota-zkey.s3.ap-southeast-1.amazonaws.com/amaci_2-1-1-5_v4_zkeys.tar.gz'
};

// Deactivate circuit paths (from extracted amaci_2-1-1-5_v4_zkeys.tar.gz: flat deactivate.wasm/zkey)
const DEACTIVATE_WASM = path.join(ZKEYS_V4_BASE, 'deactivate.wasm');
const DEACTIVATE_ZKEY = path.join(ZKEYS_V4_BASE, 'deactivate.zkey');

// AddKey circuit paths (v4: add-new-key_2-1-1-5_v4)
const ADDKEY_WASM = path.join(ZKEYS_V4_BASE, 'add-new-key_2-1-1-5_v4.wasm');
const ADDKEY_ZKEY = path.join(ZKEYS_V4_BASE, 'add-new-key_2-1-1-5_v4.zkey');

// ProcessMessages circuit paths (from extracted tar: processMessages.wasm/zkey)
const MSG_WASM = path.join(ZKEYS_V4_BASE, 'processMessages.wasm');
const MSG_ZKEY = path.join(ZKEYS_V4_BASE, 'processMessages.zkey');

// TallyVotes circuit paths (from extracted tar: tallyVotes.wasm/zkey)
const TALLY_WASM = path.join(ZKEYS_V4_BASE, 'tallyVotes.wasm');
const TALLY_ZKEY = path.join(ZKEYS_V4_BASE, 'tallyVotes.zkey');

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, Buffer.from(buf));
}

const REQUIRED_ARTIFACTS = [
  { name: 'AddNewKey wasm', p: ADDKEY_WASM },
  { name: 'AddNewKey zkey', p: ADDKEY_ZKEY },
  { name: 'ProcessDeactivateMessages wasm', p: DEACTIVATE_WASM },
  { name: 'ProcessDeactivateMessages zkey', p: DEACTIVATE_ZKEY },
  { name: 'ProcessMessages wasm', p: MSG_WASM },
  { name: 'ProcessMessages zkey', p: MSG_ZKEY },
  { name: 'TallyVotes wasm', p: TALLY_WASM },
  { name: 'TallyVotes zkey', p: TALLY_ZKEY }
];

function ensureZkeysV4(): void {
  const missing = REQUIRED_ARTIFACTS.filter((a) => !fs.existsSync(a.p));
  if (missing.length === 0) {
    console.log('v4 zkey/wasm present at', ZKEYS_V4_BASE);
    return;
  }
  throw new Error(
    `Missing v4 artifacts at ${ZKEYS_V4_BASE}: ${missing.map((a) => a.name).join(', ')}.\n` +
      `Download and extract:\n` +
      `  1. ${ZKEYS_V4_URLS.addNewKeyWasm}\n` +
      `  2. ${ZKEYS_V4_URLS.addNewKeyZkey}\n` +
      `  3. ${ZKEYS_V4_URLS.amaciZkeysTar}\n` +
      `Place (1)(2) in ${ZKEYS_V4_BASE} and extract (3) into ${ZKEYS_V4_BASE}.`
  );
}

async function ensureZkeysV4WithDownload(): Promise<void> {
  const hasAddKey = fs.existsSync(ADDKEY_WASM) && fs.existsSync(ADDKEY_ZKEY);
  const hasMsg = fs.existsSync(MSG_WASM) && fs.existsSync(MSG_ZKEY);

  if (hasAddKey && hasMsg && fs.existsSync(DEACTIVATE_WASM) && fs.existsSync(TALLY_WASM)) {
    console.log('v4 zkey/wasm already present at', ZKEYS_V4_BASE);
    ensureZkeysV4();
    return;
  }

  console.log('Downloading v4 zkey/wasm to', ZKEYS_V4_BASE);
  fs.mkdirSync(ZKEYS_V4_BASE, { recursive: true });

  if (!hasAddKey) {
    await downloadFile(ZKEYS_V4_URLS.addNewKeyWasm, ADDKEY_WASM);
    console.log('Downloaded add-new-key wasm');
    await downloadFile(ZKEYS_V4_URLS.addNewKeyZkey, ADDKEY_ZKEY);
    console.log('Downloaded add-new-key zkey');
  }

  if (!hasMsg || !fs.existsSync(DEACTIVATE_WASM) || !fs.existsSync(TALLY_WASM)) {
    const tarPath = path.join(BUILD_DIR, 'amaci_2-1-1-5_v4_zkeys.tar.gz');
    await downloadFile(ZKEYS_V4_URLS.amaciZkeysTar, tarPath);
    console.log('Downloaded amaci zkeys tar, extracting...');
    execSync(`tar -xzf "${tarPath}" -C "${BUILD_DIR}"`, { stdio: 'inherit' });
    // Tar extracts to amaci_2-1-1-5_v4_zkeys/ with flat files: deactivate.wasm/zkey, processMessages.wasm/zkey, tallyVotes.wasm/zkey
    const extractedDir = path.join(BUILD_DIR, 'amaci_2-1-1-5_v4_zkeys');
    if (fs.existsSync(extractedDir)) {
      const entries = fs.readdirSync(extractedDir);
      for (const e of entries) {
        const src = path.join(extractedDir, e);
        const dest = path.join(ZKEYS_V4_BASE, e);
        if (fs.existsSync(src) && !fs.existsSync(dest)) {
          fs.renameSync(src, dest);
        }
      }
      try {
        fs.rmSync(extractedDir, { recursive: true });
      } catch {
        // ignore
      }
    }
    try {
      fs.unlinkSync(tarPath);
    } catch {
      // ignore
    }
  }

  ensureZkeysV4();
  console.log('v4 zkey/wasm ready.');
}

// Output directory configuration
const outputPath = path.join(__dirname, '../build/inputs');
// Create output directory if it doesn't exist
if (!fs.existsSync(outputPath)) {
  fs.mkdirSync(outputPath, { recursive: true });
}

const maxVoteOptions = 5;

const main = async () => {
  await ensureZkeysV4WithDownload();

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
