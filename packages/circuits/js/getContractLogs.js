const fs = require("fs");
const path = require("path");
const Web3 = require("web3");
const { stringizing } = require("./keypair");

// * DEV *
// ETHDencer test
const contract = "0x0B51C51e9aF970B50E4B2BB1C2eFF6059f6cD549";
const fromBlock = 5481480;
const endBlock = 5511845;
// const provider = 'https://bscrpc.com'
// const provider = "https://goerli.infura.io/v3/1d0842dba8df4b07a2a02ab24c44e6be";
const provider =
  "https://sepolia.infura.io/v3/1d0842dba8df4b07a2a02ab24c44e6be";

const sleep = async (ms) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
};

const PublishMessageSign =
  "0x8bb5a8cf78a5b2f53c73e2feacb1fb3e91c3f03cb15e33f53174db20e37e3928";
const PublishDeactivateMessageSign =
  "0xbc95c7d3fe7fef05bb4206d406cce3f05e000db24e6ca7d01aee1cfa63fa58e4";
const SignUpSign =
  "0xc7563c66f89e2fb0839e2b64ed54fe4803ff9428777814772ccfe4c385072c4b";
const SignUpActiveSign =
  "0x6385353c27ff5a24160beb230f2b460f782c96306af71eae339d9c486cda48da";

(async () => {
  const web3 = new Web3(provider);

  const messages = [];
  const dmessages = [];
  const states = [];
  const statesActive = [];

  function handleMessage(log) {
    const idx = Number(log.topics[1]);
    const d = web3.eth.abi.decodeParameters(["uint256[9]"], log.data)[0];
    const msg = d.slice(0, 7).map((n) => BigInt(n));
    const pubkey = d.slice(7, 9).map((n) => BigInt(n));
    messages.push({ idx, msg, pubkey });
  }

  function handleDeactivateMessage(log) {
    const idx = Number(log.topics[1]);
    const d = web3.eth.abi.decodeParameters(["uint256[10]"], log.data)[0];
    const numSignUps = Number(d[0]);
    const msg = d.slice(1, 8).map((n) => BigInt(n));
    const pubkey = d.slice(8, 10).map((n) => BigInt(n));
    dmessages.push({ idx, numSignUps, msg, pubkey });
  }

  function handleSignUpActive(log) {
    const idx = Number(log.topics[1]);
    const c = web3.eth.abi.decodeParameters(["uint256[4]"], log.data)[0];
    statesActive.push({ idx, c });
  }

  function handleSignup(log) {
    const idx = Number(log.topics[1]);
    const d = web3.eth.abi.decodeParameters(["uint256[3]"], log.data)[0];
    const pubkey = d.slice(0, 2).map((n) => BigInt(n));
    const balance = BigInt(d[2]);
    states.push({ idx, balance, pubkey });
  }

  const number = await web3.eth.getBlockNumber();
  console.log(number);

  for (let i = fromBlock; i < endBlock; i += 2000) {
    const from = i;
    const to = i + 1999;
    await web3.eth
      .getPastLogs({
        fromBlock: from,
        toBlock: to,
        topics: [
          [
            PublishMessageSign,
            PublishDeactivateMessageSign,
            SignUpSign,
            SignUpActiveSign,
          ],
        ],
        address: contract,
      })
      .then((logs) => {
        for (const log of logs) {
          if (log.topics[0] === PublishMessageSign) {
            handleMessage(log);
          } else if (log.topics[0] === PublishDeactivateMessageSign) {
            handleDeactivateMessage(log);
          } else if (log.topics[0] === SignUpActiveSign) {
            handleSignUpActive(log);
          } else {
            handleSignup(log);
          }
        }
        console.log(logs.length);
      })
      .catch((err) => {
        console.error(err.message || err);
      });
    console.log(`Processed: from height ${from}, to height ${to}.`);
    await sleep(1000);
  }

  for (const sa of statesActive) {
    const s = states.find((d) => d.idx === sa.idx);
    if (s) {
      s.c = sa.c;
    }
  }

  fs.writeFileSync(
    path.join(__dirname, "../build/contract-logs.json"),
    JSON.stringify(stringizing({ messages, dmessages, states }), undefined, 2)
  );
})();
