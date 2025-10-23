import { mnemonicToSeed } from '@scure/bip39';
import { PubKey, VoterClient } from '../src';
import { generateMnemonic } from '../src/libs/account';

function genMnemonic(num: number) {
  const mnemonics: string[] = [];
  for (let i = 0; i < num; i++) {
    const mnemonic = generateMnemonic(24);
    const seed = mnemonicToSeed(mnemonic);
    console.log('seed', i, 'generated');
    mnemonics.push(mnemonic);
  }
  return mnemonics;
}

async function main() {
  const maxVoter = 625;

  // console.log(accounts);
  // // const accounts = genMnemonic(maxVoter);
  // const accounts = await genAccount(maxVoter);
  // const creator = new VoterClient({
  //   network: 'testnet'
  // });

  // const { deactivates, root, leaves, tree } = creator.getSigner().genDeactivateRoot(accounts, 4);
  // console.log(root);
  // const mnemonics = genMnemonic(maxVoter);
  // console.log(mnemonics);
}

main();
