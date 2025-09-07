import { MaciClient, MaciCircuitType, genKeypair, PubKey } from '../src';
import { Secp256k1HdWallet } from '@cosmjs/amino';
import {
  DirectSecp256k1HdWallet,
  DirectSecp256k1Wallet,
} from '@cosmjs/proto-signing';
import dotenv from 'dotenv';

dotenv.config();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('======= start test contract logic =======');
  let key = process.env.ADMIN_PRIVATE_KEY;
  if (!key) {
    throw new Error('Admin private key not found in environment variables');
  }
  if (key.startsWith('0x')) {
    key = key.slice(2);
  }
  const wallet = await DirectSecp256k1Wallet.fromKey(
    Buffer.from(key, 'hex'),
    'dora'
  );

  const client = new MaciClient({
    network: 'testnet',
    signer: wallet,
  });

  const address = await client.getAddress();

  const newRound = await client.createAMaciRound({
    maxVoter: 2,
    maxOption: 5,
    operator: 'dora18mph6ekhf70pxqxpq0lfj3z7j3k4mqn8m2cna5',
    whitelist: {
      users: [
        {
          addr: address,
        },
      ],
    },
    voiceCreditAmount: '10000000000000000000',
    startVoting: new Date(new Date().getTime()),
    endVoting: new Date(new Date().getTime() + 11 * 60 * 1000),
    title: 'new amaci round',
    circuitType: MaciCircuitType.IP1V,
  });
  console.log('newRound:', newRound);

  const RoundAddress = newRound.contractAddress;
  // const RoundAddress =
  // 'dora12ltq6khdurdju9nach5dt34xzmv9cmnayzyp296pf7w4l3xsspcqczrvrs';

  await delay(10000);
  const roundInfo = await client.getRoundInfo({
    contractAddress: RoundAddress,
  });
  console.log('roundInfo', roundInfo);

  const status = client.parseRoundStatus(
    Number(roundInfo.votingStart),
    Number(roundInfo.votingEnd),
    roundInfo.status,
    new Date()
  );
  console.log('status', status);
  const roundBalance = await client.queryRoundBalance({
    contractAddress: RoundAddress,
  });
  console.log(`roundBalance: ${Number(roundBalance) / 10 ** 18} DORA`);

  const totalBond = roundInfo.totalBond;
  console.log(`totalBond: ${Number(totalBond) / 10 ** 18} DORA`);

  // generate maci account
  // const maciKeypair = await client.genKeypairFromSign();
  // console.log('maciKeypair', maciKeypair);
  const pubKey: PubKey = [
    5863731289590225008386799445332825332650022926879250618460419250139482260266n,
    13135943474599383186329499231577492262315383521227828385358525250312561036975n,
  ];

  await delay(6000);

  // oracle maci sign up
  const signupResponse = await client.rawSignup({
    address,
    contractAddress: RoundAddress,
    pubKey,
  });

  console.log('signup tx:', signupResponse.transactionHash);

  await delay(6000);

  // get user state idx
  const stateIdx = await client.getStateIdxByPubKey({
    contractAddress: RoundAddress,
    pubKey,
  });
  console.log('stateIdx', stateIdx);
  const balance = await client.queryWhitelistBalanceOf({
    address,
    contractAddress: RoundAddress,
  });
  console.log('balance', balance);

  console.log({
    address,
    stateIdx,
    contractAddress: RoundAddress,
    selectedOptions: [
      { idx: 0, vc: 1 },
      { idx: 1, vc: 1 },
    ],
    operatorCoordPubKey: [
      BigInt(roundInfo.coordinatorPubkeyX),
      BigInt(roundInfo.coordinatorPubkeyY),
    ],
    pubKey,
  });

  // vote
  const voteResponse = await client.rawVote({
    address,
    contractAddress: RoundAddress,
    pubKey,
    payload: [
      {
        msg: [
          14408570545115128591300058014712700480938066701032863772263518666429040523117n,
          2715080196006354381205786130581671294309184831098264405102554487725503276451n,
          4387291146527346319036144118228272152805043522641450146491730289400617101246n,
          5383233461828404059657667798432854432594543587270897578346769972404860704496n,
          10173963496413773065807647565971953796397979108442127972959920858843128234481n,
          5733760719560019650700376826880747284161434869009239775001402868294783661465n,
          17596032058491310268326930196676558592814727047627428810102968225968026269782n,
        ],
        encPubkeys: [
          12418669058990177153979786010520607563390785128539285188760572071649324116218n,
          5133879086249290479758995045310866617925128736256494107974424810003975873116n,
        ],
      },
      {
        msg: [
          15591774355534667497493712424243105646453527281595414960700291183126710629406n,
          14904308263491539330094699162680413812532346563348711837818260389512666309746n,
          5081685954154097485397967993940473571381324468045957769964304020789178964988n,
          11211492019478358026375582426687607958348570875245339926114835829978153838215n,
          144272965147634915625819509631484129667749769208342009082983383385711585259n,
          18110672086282937093077976137559588989990534023528028535735897439400844697838n,
          5027708479355932968490854148558624990375508335622843464943338810276042241659n,
        ],
        encPubkeys: [
          18995000747855521534746937827717723803513622190443871925509350428068636527433n,
          15164086222064742793637707688162468617553103244789990420202420030152500823678n,
        ],
      },
    ],
  });

  console.log('vote tx:', voteResponse.transactionHash);
}

main();
