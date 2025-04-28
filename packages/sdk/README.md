# Maci Client

MACI (Minimal Anti-Collusion Infrastructure) client SDK for interacting with MACI contracts.

## Installation

```bash
npm install @dorafactory/maci-sdk
```

## Usage

### Initialize Client

```typescript
import { MaciClient } from '@dorafactory/maci-sdk';

const client = new MaciClient({
  network: 'testnet', // or 'mainnet'
});
```

### Query Functions

#### Query Account Balance

```typescript
const balance = await client.balanceOf('dora1...');
```

#### Query Round Information

```typescript
// Query round by ID
const round = await client.getRoundById('dora1...');

// Get list of rounds
const rounds = await client.getRounds('first', 10);

// Query rounds by status
const roundsByStatus = await client.getRoundsByStatus('Created', 'first', 10);

// Query rounds by circuit name
const roundsByCircuit = await client.getRoundsByCircuitName(
  'amaci-qv',
  'first',
  10
);

// Query rounds by operator address
const roundsByOperator = await client.getRoundsByOperator(
  'dora1...',
  'first',
  10
);
```

#### Query Operator Information

```typescript
// Query operator by address
const operator = await client.getOperatorByAddress('dora1...');

// Get list of operators
const operators = await client.getOperators('first', 10);
```

#### Query Circuit Information

```typescript
// Query circuit by name
const circuit = await client.getCircuitByName('amaci-qv');

// Get all circuits
const circuits = await client.getCircuits();
```

#### Query Transaction Information

```typescript
// Query transaction by hash
const transaction = await client.getTransactionByHash('HASH...');

// Get list of transactions
const transactions = await client.getTransactions('first', 10);

// Query transactions by contract address
const txByContract = await client.getTransactionsByContractAddress(
  'dora1...',
  'first',
  10
);
```

#### Query Proof Information

```typescript
const proof = await client.getProofByContractAddress('dora1...');
```

### Contract Interactions

#### Create New Oracle Maci Round

```typescript
const wallet = await DirectSecp256k1Wallet.fromKey(
  Buffer.from(privateKey, 'hex'),
  'dora'
);

const newRound = await client.createOracleMaciRound({
  signer: wallet,
  operatorPubkey: '0e752c...',
  startVoting: new Date(),
  endVoting: new Date(new Date().getTime() + 10 * 60 * 1000),
  title: 'Just for fun',
  description: 'some description',
  link: 'https://www.dorafactory.org',
  voteOptionMap: ['option1: A', 'option2: B', 'option3: C'],
  circuitType: MaciCircuitType.IP1V,
  whitelistEcosystem: 'cosmoshub',
  whitelistSnapshotHeight: '0',
  whitelistVotingPowerArgs: {
    mode: 'slope',
    slope: '1000000',
    threshold: '1000000',
  },
});
```

**Note:**

- The `operatorPubkey` is the public key of the operator. It is the compressed public key of the operator's private key.
- The `whitelistEcosystem` is the ecosystem of the whitelist (e.g. 'cosmoshub'). Only wallet addresses that have staked tokens in the specified ecosystem before the snapshot block height will be eligible to become voters.
- The `whitelistSnapshotHeight` is the snapshot block height for checking voter eligibility. The minimum valid height is 23,342,001. If set to "0", the round will evaluate the voter's stake at the time of signup.
- The `whitelistVotingPowerArgs` configures how voting power is calculated:
  - `mode`: Can be either 'slope' or 'threshold'
    - 'slope' mode: Calculates voice credits based on each voter's stake amount using the formula: voice credits = staked tokens / slope value
    - 'threshold' mode: Equally assigns 1 voice credit to voters whose stake exceeds the specified threshold
  - `slope`: The slope value for calculating voice credits in slope mode (e.g. 1000000)
  - `threshold`: The minimum stake threshold in threshold mode (e.g. 1000000)

For example, if a voter stakes 100000000 tokens and the slope value is 2500000, the voter will be assigned 40 voice credits.

> The 1,000,000 reference value here is the precision of cosmoshub, which is 6 bits, and doravota, which is 18 bits, so when you want to pick doravota's staker as a whitelist and ask them to pledge 1DORA to convert 1vote, you need to set the scope to 1000000000000000000 (10\*\*18). Note that currently only cosmoshub and doravota are supported as ecosystem options.
>
> One detail, here the slope is calculated by rounding down.

#### Sign Up and Vote in a Oracle MACI Round

```typescript
// 1. Generate MACI account
const maciAccount = await client.circom.genKeypairFromSign(wallet, address);

// 2. Get Oracle certificate (only for Oracle MACI)
const certificate = await client.maci.requestOracleCertificate({
  signer: wallet,
  ecosystem: 'doravota', // or 'cosmoshub'
  address,
  contractAddress: 'dora1...',
});

// 3. Check Gas Station status
let hasFeegrant = await client.maci.hasFeegrant({
  address,
  contractAddress: 'dora1...',
});

// Wait for Gas Station to be enabled
while (!hasFeegrant) {
  await delay(1000); // Delay 1 second
  hasFeegrant = await client.maci.hasFeegrant({
    address,
    contractAddress: 'dora1...',
  });
}

// 4. Sign up for voting
const signupResponse = await client.maci.signup({
  signer: wallet,
  address,
  contractAddress: 'dora1...',
  maciAccount,
  oracleCertificate: {
    amount: certificate.amount,
    signature: certificate.signature,
  },
  gasStation: true, // Whether to use gas station
});

// 5. Cast vote
const voteResponse = await client.maci.vote({
  signer: wallet,
  address,
  contractAddress: 'dora1...',
  selectedOptions: [
    { idx: 0, vc: 2 }, // Option index and voting weight
    { idx: 1, vc: 1 },
    { idx: 4, vc: 1 },
  ],
  operatorCoordPubKey: [
    BigInt(roundInfo.coordinatorPubkeyX),
    BigInt(roundInfo.coordinatorPubkeyY),
  ],
  maciAccount,
  gasStation: true,
});
```

**Voting Rules:**

MACI supports two voting rules:

1. 1P1V (One Person One Vote): Each voting weight (vc) directly counts as votes
2. QV (Quadratic Voting): The sum of squares of voting weights (vc) is consumed as total voting power

Vote options format:

```typescript
selectedOptions: [
  { idx: number, vc: number }, // idx: option index, vc: voting weight
  ...
]
```

Examples:

```typescript
// 1P1V mode example (total voting power: 4)
const options1p1v = [
  { idx: 0, vc: 2 }, // 2 votes for option 0
  { idx: 1, vc: 1 }, // 1 vote for option 1
  { idx: 4, vc: 1 }, // 1 vote for option 4
];
// Total voting power consumed = 2 + 1 + 1 = 4

// QV mode example (total voting power: 6)
const optionsQv = [
  { idx: 0, vc: 2 }, // Consumes 4 voting power (2²)
  { idx: 1, vc: 1 }, // Consumes 1 voting power (1²)
  { idx: 2, vc: 1 }, // Consumes 1 voting power (1²)
];
// Total voting power consumed = 2² + 1² + 1² = 6
```

**Important Notes:**

- Option indices (idx) must be unique
- Voting weights (vc) must be positive integers
- In QV mode, total voting power consumed is the sum of squares of voting weights
- Total voting power consumed cannot exceed user's available voting credits
- System automatically filters out options with zero voting weight
- Voting options are automatically sorted by idx
