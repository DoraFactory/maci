const fs = require("fs");
const path = require("path");
const { stringizing, genRandomKey } = require("./keypair");
const MACI = require("./maci");

function toBigInt(list) {
  return list.map((n) => BigInt(n));
}

const coordinatorKey = BigInt(process.argv[2]);

const logsPath = path.join(__dirname, "../build/contract-logs.json");
const outputPath = path.join(__dirname, "../build/dinputs");
const output2Path = path.join(__dirname, "../build/inputs");

const allDeactivates = fs.existsSync(path.join(outputPath, `deactivates.json`))
  ? JSON.parse(
      fs.readFileSync(path.join(outputPath, `deactivates.json`)).toString()
    )
  : [];
const activeStates = fs.existsSync(path.join(outputPath, `active.json`))
  ? JSON.parse(
      fs.readFileSync(path.join(outputPath, `active.json`)).toString()
    ).map((t) => BigInt(t))
  : [];

const rawdata = fs.readFileSync(logsPath);
const logs = JSON.parse(rawdata);

const maxVoteOptions = 3;
const main = new MACI(
  6,
  2,
  3,
  25, // tree config
  coordinatorKey,
  maxVoteOptions,
  logs.states.length
);

for (const state of logs.states) {
  main.initStateTree(
    Number(state.idx),
    toBigInt(state.pubkey),
    state.balance,
    state.c
  );
}

for (const msg of logs.dmessages) {
  main.pushDeactivateMessage(toBigInt(msg.msg), toBigInt(msg.pubkey));
}

// const deactivates = []

const processBatchSize = [];

main.initProcessedDeactivateLog(allDeactivates, activeStates);

let jsonIdx = 9;
let i = main.processedDMsgCount;
// PROCESSING
while (main.processedDMsgCount < logs.dmessages.length) {
  let size = main.batchSize;
  if (size + i > logs.dmessages.length) {
    size = logs.dmessages.length - i;
  }
  i = i + size;

  const { input, newDeactivate } = main.processDeactivateMessage(
    size,
    Number(logs.dmessages[i - 1].numSignUps)
  );

  fs.writeFileSync(
    path.join(
      outputPath,
      `d-input_${jsonIdx.toString().padStart(4, "0")}.json`
    ),
    JSON.stringify(stringizing(input), undefined, 2)
  );
  fs.writeFileSync(
    path.join(
      output2Path,
      `deactivate-input_${jsonIdx.toString().padStart(4, "0")}.json`
    ),
    JSON.stringify(stringizing(input), undefined, 2)
  );
  fs.writeFileSync(
    path.join(
      outputPath,
      `deactivates_${jsonIdx.toString().padStart(4, "0")}.json`
    ),
    JSON.stringify(
      stringizing({
        newDeactivateCommitment: input.newDeactivateCommitment,
        newDeactivateRoot: input.newDeactivateRoot,
        size,
      }),
      undefined,
      2
    )
  );
  jsonIdx++;

  allDeactivates.push(...newDeactivate);
}

fs.writeFileSync(
  path.join(outputPath, `deactivates.json`),
  JSON.stringify(stringizing(allDeactivates), undefined, 2)
);

fs.writeFileSync(
  path.join(outputPath, `active.json`),
  JSON.stringify(stringizing(main.activeStateTree.leaves()), undefined, 2)
);
