import { EdDSAPoseidonKeypair } from '../src/keypairs/eddsa-poseidon/keypair';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('======= start test keypair logic =======');

  const mnemonic =
    'camp diet rescue speak rigid hotel wire stomach image rain thumb recycle spot aisle october shiver napkin simple fortune measure congress fiber season butter';

  const keypair = EdDSAPoseidonKeypair.deriveKeypair(mnemonic);
  console.log('secretKey:', keypair.getSecretKey());
  console.log('publicKey:', keypair.getPublicKey());

  const keypair2 = EdDSAPoseidonKeypair.fromSecretKey(keypair.getSecretKey());
  console.log('secretKey2:', keypair2.getSecretKey());
  console.log('publicKey2:', keypair2.getPublicKey());

  const keypair3 =
    EdDSAPoseidonKeypair.fromSecretKey(
      17999548728784542162503055798850808847714094170407294851464839916490560066339n
    );
  console.log('secretKey3:', keypair3.getSecretKey());
  console.log('publicKey3:', keypair3.getPublicKey());
}

main();
