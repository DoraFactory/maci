const fs = require("fs");
const path = require("path");
const { groth16 } = require("snarkjs");
const { poseidon } = require("circom");
const { stringizing, genKeypair, genStaticRandomKey } = require("./keypair");
const MACI = require("./maci");
const { genMessage } = require("./client");
const { adaptToUncompressed } = require("./format_proof");

const wasmPath = path.join(__dirname, "../build/maci/2-1-1-5/r1cs");
const zkeyPath = path.join(__dirname, "../build/maci/2-1-1-5/zkey");

const outputPath = process.argv[2];
if (!fs.existsSync(outputPath)) {
  fs.mkdirSync(outputPath, { recursive: true });
  console.log(`Created output directory: ${outputPath}`);
}

const maxVoteOptions = 5;

const main = async () => {
  const USER_1 = 0; // state leaf idx
  const USER_2 = 1; // state leaf idx

  const privateKeys = [
    111111n, // coordinator
    222222n, // user 1
    333333n, // share key for message 1
    444444n, // share key for message 2
    555555n, // user 2
    666666n, // add new key
  ];
  const coordinator = genKeypair(privateKeys[0]);
  const user1 = genKeypair(privateKeys[1]);
  const user2 = genKeypair(privateKeys[4]);

  const main = new MACI(
    2,
    1,
    1,
    5, // tree config
    privateKeys[0], // coordinator
    maxVoteOptions,
    2,
    true
  );

  main.initStateTreeMACI(USER_1, user1.pubKey, 100);
  main.initStateTreeMACI(USER_2, user2.pubKey, 80);

  const enc1 = genKeypair(privateKeys[2]);
  const enc2 = genKeypair(privateKeys[3]);

  const logs = main.logs;

  const message1 = genMessage(enc1.privKey, coordinator.pubKey)(
    USER_1,
    1,
    1,
    8,
    user1.pubKey,
    user1.privKey,
    1234567890n
  );
  main.pushMessage(message1, enc1.pubKey);

  const message2 = genMessage(enc2.privKey, coordinator.pubKey)(
    USER_2,
    1,
    2,
    6,
    user2.pubKey,
    user2.privKey,
    9876543210n
  );
  main.pushMessage(message2, enc2.pubKey);

  main.endVotePeriod();

  // PROCESSING
  let i = 0;
  while (main.states === 1) {
    const inputs = [];
    const input = main.processMACIMessage(
      genStaticRandomKey(coordinator.privKey, 20041n, BigInt(i)),
      inputs
    );

    console.log("input", input);

    const res = await groth16.fullProve(
      input,
     `${wasmPath}/msg_js/msg.wasm`,
     `${zkeyPath}/msg.zkey`
    );

    const uncompressedProcessMessageProof = await adaptToUncompressed(res.proof);
    console.log(uncompressedProcessMessageProof);
    fs.writeFileSync(
      path.join(path.join(__dirname, '../inputs/processMessage-proof.json')),
      JSON.stringify(uncompressedProcessMessageProof, undefined, 2)
    );

    logs.push({
      type: "processMessage",
      data: stringizing({
        proof: uncompressedProcessMessageProof,
        newStateCommitment: input.newStateCommitment,
      }),
      inputs,
    });

    fs.writeFileSync(
      path.join(path.join(__dirname, `../inputs/msg-input_${i.toString().padStart(4, "0")}.json`)),
      JSON.stringify(stringizing(input), undefined, 2)
    );
    i++;
  }

  // TALLYING
  i = 0;
  let salt = 0n;
  while (main.states === 2) {
    const inputs = [];
    const input = main.processTally(
      genStaticRandomKey(coordinator.privKey, 20042n, BigInt(i)),
      inputs
    );

    const res = await groth16.fullProve(
      input,
      `${wasmPath}/tally_js/tally.wasm`,
      `${zkeyPath}/tally.zkey`
    );

    salt = input.newResultsRootSalt;

    const uncompressedTallyProof = await adaptToUncompressed(res.proof);
    console.log(uncompressedTallyProof);
    fs.writeFileSync(
      path.join(path.join(__dirname, '../inputs/processTally-proof.json')),
      JSON.stringify(uncompressedTallyProof, undefined, 2)
    );

    logs.push({
      type: "processTally",
      data: stringizing({
        proof: uncompressedTallyProof,
        newTallyCommitment: input.newTallyCommitment,
      }),
      inputs,
    });

    fs.writeFileSync(
      path.join(
        path.join(__dirname, `../inputs/tally-input_${i.toString().padStart(4, "0")}.json`),
      ),
      JSON.stringify(stringizing(input), undefined, 2)
    );
    i++;
  }

  const results = main.tallyResults.leaves().slice(0, maxVoteOptions);

  logs.push({
    type: "stopTallyingPeriod",
    data: stringizing({
      results,
      salt,
    }),
  });

  fs.writeFileSync(
    path.join(path.join(__dirname, '../inputs/logs.json')),
    JSON.stringify(stringizing(logs), undefined, 2)
  );

  console.log("DONE");

  process.exit(0);
};

main();
