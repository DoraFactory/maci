import { deriveSecretScalar } from '@zk-kit/eddsa-poseidon';

const bigInt2Buffer = (i: bigint): Buffer => {
  let hex = i.toString(16);
  if (hex.length % 2 === 1) {
    hex = '0' + hex;
  }
  return Buffer.from(hex, 'hex');
};

const privKey = 111111n;
const buffer = bigInt2Buffer(privKey);

console.log('Private Key:', privKey.toString());
console.log('Buffer (hex):', buffer.toString('hex'));
console.log('Buffer (array):', Array.from(buffer));

const secretScalar = deriveSecretScalar(buffer);
console.log('\nSecret Scalar:', secretScalar.toString());
console.log('Expected: 2295754007515522394258511581246354452955624238787687789994300932264762345941');
console.log('Match:', secretScalar.toString() === '2295754007515522394258511581246354452955624238787687789994300932264762345941');
