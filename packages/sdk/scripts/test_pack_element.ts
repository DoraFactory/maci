import { VoterClient } from '../src';

async function main() {
  const voter = new VoterClient({
    network: 'mainnet',
    mnemonic: process.env.VOTER_MNEMONIC!
  });

  const payload = voter.buildVotePayload({
    stateIdx: 0,
    operatorPubkey: voter.getPubkey().toPoints(),
    pollId: 1,
    selectedOptions: [
      { idx: 0, vc: 1 },
    ]
  });

  console.log(payload);
}

main();