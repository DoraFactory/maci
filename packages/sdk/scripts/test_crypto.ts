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
  5424741844275630152950028819860276183538330999940395309613975245790840672621n,
  6821363586466624930174394695023126212730779300840339744873622125361194404156n,
] as PubKey;

const packedTestPubkey = packPubKey(testPubkey);
console.log('packedTestPubkey', packedTestPubkey);

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
