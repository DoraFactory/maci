import { derivePublicKey } from '@zk-kit/eddsa-poseidon';

const privateKey = 'my-secret-key';
const publicKey = derivePublicKey(privateKey);

console.log(publicKey);
