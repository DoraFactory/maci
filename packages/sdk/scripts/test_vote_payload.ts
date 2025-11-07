import { VoterClient } from '../src/voter';

async function main() {
  const voter = new VoterClient({
    network: 'mainnet',
    mnemonic: process.env.VOTER_MNEMONIC!
  });

  const votePayload = voter.buildVotePayload({
    stateIdx: 0,
    operatorPubkey: voter.getPubkey().toPoints(),
    selectedOptions: [
      { idx: 0, vc: 1 },
      { idx: 1, vc: 1 },
      { idx: 2, vc: 1 }
    ]
  });

  console.log(votePayload);
}

main();
