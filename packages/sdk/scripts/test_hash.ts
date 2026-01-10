import { poseidon } from '../src/libs/crypto/hashing';

const hash = poseidon([BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)]);
console.log('hash', hash);
