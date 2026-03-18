import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { groth16 } from 'snarkjs';
import { OperatorClient, VoterClient, stringizing, adaptToUncompressed } from '@dorafactory/maci-sdk';

// ============================================================
// CLI options
//   --local-addkey   Use locally compiled AddNewKey_amaci_2
//                    artifacts instead of downloading from S3
// ============================================================
const USE_LOCAL_ADDKEY = process.argv.includes('--local-addkey');

// Build paths configuration
const BUILD_DIR = path.join(__dirname, '../build');

// ---------- Local compiled AddNewKey_amaci_2 artifacts ----------
const LOCAL_ADDKEY_DIR = path.join(BUILD_DIR, 'AddNewKey_amaci_2');
const LOCAL_ADDKEY_WASM = path.join(LOCAL_ADDKEY_DIR, 'AddNewKey_amaci_2_js', 'AddNewKey_amaci_2.wasm');
const LOCAL_ADDKEY_ZKEY = path.join(LOCAL_ADDKEY_DIR, 'AddNewKey_amaci_2.0.zkey');

// ---------- v4 remote zkey/wasm artifacts (amaci_2-1-1-5) ----------
// The tar https://...amaci_2-1-1-5_v4_zkeys.tar.gz extracts to build/2-1-1-5_v4/
// with file names: deactivate.wasm/zkey, msg.wasm/zkey, tally.wasm/zkey
const ZKEYS_V4_BASE = path.join(BUILD_DIR, '2-1-1-5_v4');
const ZKEYS_V4_URLS = {
  addNewKeyWasm: 'https://vota-zkey.s3.ap-southeast-1.amazonaws.com/add-new-key_2-1-1-5_v4.wasm',
  addNewKeyZkey: 'https://vota-zkey.s3.ap-southeast-1.amazonaws.com/add-new-key_2-1-1-5_v4.zkey',
  amaciZkeysTar: 'https://vota-zkey.s3.ap-southeast-1.amazonaws.com/amaci_2-1-1-5_v4_zkeys.tar.gz'
};

// Deactivate circuit paths
const DEACTIVATE_WASM = path.join(ZKEYS_V4_BASE, 'deactivate.wasm');
const DEACTIVATE_ZKEY = path.join(ZKEYS_V4_BASE, 'deactivate.zkey');

// AddKey circuit paths – resolved at runtime based on --local-addkey flag
let ADDKEY_WASM: string;
let ADDKEY_ZKEY: string;

// ProcessMessages circuit paths (file name in tar: msg.wasm / msg.zkey)
const MSG_WASM = path.join(ZKEYS_V4_BASE, 'msg.wasm');
const MSG_ZKEY = path.join(ZKEYS_V4_BASE, 'msg.zkey');

// TallyVotes circuit paths (file name in tar: tally.wasm / tally.zkey)
const TALLY_WASM = path.join(ZKEYS_V4_BASE, 'tally.wasm');
const TALLY_ZKEY = path.join(ZKEYS_V4_BASE, 'tally.zkey');

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, Buffer.from(buf));
}

function checkLocalAddkeyArtifacts(): void {
  const missing: string[] = [];
  if (!fs.existsSync(LOCAL_ADDKEY_WASM)) missing.push(LOCAL_ADDKEY_WASM);
  if (!fs.existsSync(LOCAL_ADDKEY_ZKEY)) missing.push(LOCAL_ADDKEY_ZKEY);
  if (missing.length > 0) {
    throw new Error(
      `--local-addkey specified but local AddNewKey_amaci_2 artifacts are missing:\n` +
        missing.map((p) => `  ${p}`).join('\n') +
        `\nRun "pnpm run circom:build && pnpm run generate-zkeys" in packages/circuits first.`
    );
  }
  console.log('Using local AddNewKey_amaci_2 artifacts:');
  console.log(' wasm:', LOCAL_ADDKEY_WASM);
  console.log(' zkey:', LOCAL_ADDKEY_ZKEY);
}

const REQUIRED_REMOTE_ARTIFACTS = [
  { name: 'deactivate.wasm', p: DEACTIVATE_WASM },
  { name: 'deactivate.zkey', p: DEACTIVATE_ZKEY },
  { name: 'msg.wasm', p: MSG_WASM },
  { name: 'msg.zkey', p: MSG_ZKEY },
  { name: 'tally.wasm', p: TALLY_WASM },
  { name: 'tally.zkey', p: TALLY_ZKEY }
];

function ensureRemoteArtifacts(): void {
  const missing = REQUIRED_REMOTE_ARTIFACTS.filter((a) => !fs.existsSync(a.p));
  if (missing.length === 0) {
    console.log('Remote v4 zkey/wasm present at', ZKEYS_V4_BASE);
    return;
  }
  throw new Error(
    `Missing remote v4 artifacts at ${ZKEYS_V4_BASE}: ${missing.map((a) => a.name).join(', ')}.\n` +
      `Download and extract into ${path.dirname(ZKEYS_V4_BASE)}:\n` +
      `  ${ZKEYS_V4_URLS.amaciZkeysTar}\n` +
      `(The tar should create a 2-1-1-5_v4/ sub-directory automatically.)`
  );
}

async function ensureArtifacts(): Promise<void> {
  fs.mkdirSync(ZKEYS_V4_BASE, { recursive: true });

  // Resolve addkey artifacts
  if (USE_LOCAL_ADDKEY) {
    checkLocalAddkeyArtifacts();
    ADDKEY_WASM = LOCAL_ADDKEY_WASM;
    ADDKEY_ZKEY = LOCAL_ADDKEY_ZKEY;
  } else {
    const remoteAddkeyWasm = path.join(ZKEYS_V4_BASE, 'add-new-key_2-1-1-5_v4.wasm');
    const remoteAddkeyZkey = path.join(ZKEYS_V4_BASE, 'add-new-key_2-1-1-5_v4.zkey');
    if (!fs.existsSync(remoteAddkeyWasm) || !fs.existsSync(remoteAddkeyZkey)) {
      console.log('Downloading remote AddNewKey wasm/zkey...');
      await downloadFile(ZKEYS_V4_URLS.addNewKeyWasm, remoteAddkeyWasm);
      console.log('Downloaded add-new-key wasm');
      await downloadFile(ZKEYS_V4_URLS.addNewKeyZkey, remoteAddkeyZkey);
      console.log('Downloaded add-new-key zkey');
    }
    ADDKEY_WASM = remoteAddkeyWasm;
    ADDKEY_ZKEY = remoteAddkeyZkey;
  }

  // Download and extract remote amaci tar if deactivate/msg/tally are missing.
  // The tar extracts directly into BUILD_DIR creating the sub-directory 2-1-1-5_v4/.
  const missingRemote = REQUIRED_REMOTE_ARTIFACTS.filter((a) => !fs.existsSync(a.p));
  if (missingRemote.length > 0) {
    console.log('Downloading amaci v4 zkeys tar (deactivate/msg/tally)...');
    const tarPath = path.join(BUILD_DIR, 'amaci_2-1-1-5_v4_zkeys.tar.gz');
    await downloadFile(ZKEYS_V4_URLS.amaciZkeysTar, tarPath);
    console.log('Extracting amaci zkeys tar...');
    execSync(`tar -xzf "${tarPath}" -C "${BUILD_DIR}"`, { stdio: 'inherit' });
    try { fs.unlinkSync(tarPath); } catch { /* ignore */ }
  }

  ensureRemoteArtifacts();
  console.log('All artifacts ready.');
}

// Output directory configuration
const outputPath = path.join(__dirname, '../build/inputs');
if (!fs.existsSync(outputPath)) {
  fs.mkdirSync(outputPath, { recursive: true });
}

const maxVoteOptions = 5;
const POLL_ID = 1;

const main = async () => {
  console.log(`=== generate-logs (--local-addkey: ${USE_LOCAL_ADDKEY}) ===`);
  await ensureArtifacts();

  const USER_1 = 0; // state leaf idx
  const USER_2 = 1; // state leaf idx
  const USER_1A = 2; // state leaf idx (user 1 after addNewKey)

  const privateKeys = [
    111111n, // coordinator
    222222n, // user 1
    333333n, // share key for message 1
    444444n, // share key for message 2
    555555n, // user 2
    666666n  // new key for user 1
  ];

  console.log('=== Initializing Clients ===');

  const operator = new OperatorClient({
    network: 'testnet',
    secretKey: privateKeys[0]
  });

  const voter1 = new VoterClient({
    network: 'testnet',
    secretKey: privateKeys[1]
  });

  const voter2 = new VoterClient({
    network: 'testnet',
    secretKey: privateKeys[4]
  });

  operator.initRound({
    stateTreeDepth: 2,
    intStateTreeDepth: 1,
    voteOptionTreeDepth: 1,
    batchSize: 5,
    maxVoteOptions,
    pollId: POLL_ID,
    isQuadraticCost: true,
    isAmaci: true
  });

  const logs: any[] = [];

  console.log('=== Setting up state tree ===');

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

  const coordPubKey = operator.getPubkey().toPoints();

  const dmessage1Payload = voter1.buildDeactivatePayload({
    stateIdx: USER_1,
    operatorPubkey: coordPubKey,
    pollId: POLL_ID,
    nonce: 0
  });

  const dmessage2Payload = voter2.buildDeactivatePayload({
    stateIdx: USER_2,
    operatorPubkey: coordPubKey,
    pollId: POLL_ID,
    nonce: 0
  });

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

  const { input: deactivateInput, newDeactivate } = await operator.processDeactivateMessages({
    inputSize: 2,
    subStateTreeLength: 2
  });

  fs.writeFileSync(
    path.join(outputPath, 'deactivate-input.json'),
    JSON.stringify(stringizing(deactivateInput as any), undefined, 2)
  );

  console.log('Generating deactivate proof...');
  const res_deactivate = await groth16.fullProve(deactivateInput as any, DEACTIVATE_WASM, DEACTIVATE_ZKEY);

  const uncompressedDeactivateProof = await adaptToUncompressed(res_deactivate.proof);
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

  // New voter client for user 1's new key
  const user1NewVoter = new VoterClient({
    network: 'testnet',
    secretKey: privateKeys[5]
  });

  const user1aPubKey = user1NewVoter.getPubkey().toPoints();

  // genAddKeyInput now requires newPubKey (the new key to register) and pollId
  const addKeyInputResult = await voter1.genAddKeyInput(
    operator.stateTreeDepth! + 2,
    {
      coordPubKey,
      deactivates: newDeactivate,
      newPubKey: user1aPubKey,
      pollId: BigInt(POLL_ID)
    }
  );

  if (!addKeyInputResult) {
    throw new Error('Failed to generate addKeyInput: voter1 deactivate record not found');
  }

  const akInput = addKeyInputResult;
  const d1 = akInput.d1;
  const d2 = akInput.d2;
  const nullifier = akInput.nullifier;

  console.log(`Generating addNewKey proof (using ${USE_LOCAL_ADDKEY ? 'local' : 'remote'} artifacts)...`);
  const res_addkey = await groth16.fullProve(akInput, ADDKEY_WASM, ADDKEY_ZKEY);

  // Register user 1A with the rerandomized d values
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

  const addNewKeyPublicInputs = [
    operator.deactivateTree!.root,
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
    pollId: POLL_ID
  });

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
    pollId: POLL_ID
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
    pollId: POLL_ID
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

  let i = 0;
  while (operator.states === 1) {
    const processResult = await operator.processMessages({
      newStateSalt: BigInt(20041 + i)
    });

    const processInput = processResult.input;

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

  i = 0;
  let salt = 0n;
  while (operator.states === 2) {
    const tallyResult = await operator.processTally({
      tallySalt: BigInt(20042 + i)
    });

    const tallyInput = tallyResult.input;
    salt = tallyInput.newResultsRootSalt;

    const publicInputs = [
      tallyInput.packedVals,
      tallyInput.stateCommitment,
      tallyInput.currentTallyCommitment,
      tallyInput.newTallyCommitment
    ];

    console.log(`Generating tally proof ${i}...`);
    const res_tally = await groth16.fullProve(tallyInput as any, TALLY_WASM, TALLY_ZKEY);

    const uncompressedTallyProof = await adaptToUncompressed(res_tally.proof);
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

  const results = operator.tallyResults!.leaves().slice(0, maxVoteOptions);

  logs.push({
    type: 'stopTallyingPeriod',
    data: stringizing({ results, salt } as any)
  });

  console.log('=== Saving logs ===');
  console.log('Total logs:', logs.length);

  fs.writeFileSync(
    path.join(outputPath, 'logs.json'),
    JSON.stringify(stringizing(logs as any), undefined, 2)
  );

  console.log('✅ DONE! Logs saved to:', path.join(outputPath, 'logs.json'));

  process.exit(0);
};

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
