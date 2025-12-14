import { poseidon } from '../src/libs/crypto/hashing';

const hash = poseidon([BigInt(1), BigInt(2)]);
console.log('hash', hash);
