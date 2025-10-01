import {
  genKeypair,
  genPubKey,
  packPubKey,
  PubKey,
  unpackPubKey,
} from '../src/libs/crypto';

// const keypair = genKeypair();
// console.log('keypair', keypair);

// const pubKey = genPubKey(keypair.privKey);
// console.log('pubKey', pubKey);

// const packedPubKey = packPubKey(pubKey);
// console.log('packedPubKey', packedPubKey);

// const unpackedPubKey = unpackPubKey(packedPubKey);
// console.log('unpackedPubKey', unpackedPubKey);

const testPubkey = [
  3457695696360848193502608246254422070002779638488733236214423797131720399296n,
  10721319678265866063861912417916780787229942812531198850410477756757845824096n,
] as PubKey;

const packedTestPubkey = packPubKey(testPubkey);
console.log('packedTestPubkey', packedTestPubkey);

const genKey = genKeypair();
console.log('genKey Pubkey', packPubKey(genKey.pubKey));

// const unpackedTestPubkey = unpackPubKey(packedTestPubkey);
// console.log('unpackedTestPubkey', unpackedTestPubkey);

// const maciKeypair = genKeypair(
//   // 6975805202513792793165722197797990523098997808096663894316103287476995716256n
//   // 18420034081982603221425182121040841082146790723356271252537744143452040542086n
//   932077842370434428499199375101226996872701989510165013116734002621216952612n
// );
// console.log('maciKeypair', maciKeypair);

// const newKey = genKeypair(maciKeypair.formatedPrivKey);
// console.log('newKey', newKey);
