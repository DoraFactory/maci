import { VoterClient } from '../src';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
	console.log('======= start test keypair logic =======');

	const mnemonic =
		'camp diet rescue speak rigid hotel wire stomach image rain thumb recycle spot aisle october shiver napkin simple fortune measure congress fiber season butter';

	const voterClient = new VoterClient({
		mnemonic,
		// secretKey:
		// 17034747375213412803826888399478627091796082799060419877423611523942833339716n,
	});

	console.log('voterClient', voterClient);
	const signer1 = voterClient.getSigner();
	const signer2 = voterClient.getSigner({
		accountIndex: 0,
		addressIndex: 1,
	});
	console.log('signer1', signer1);
	console.log('signer2', signer2);

	// const signer1Pubkey = voterClient.getPubkey();
	// console.log('signer1Pubkey', signer1Pubkey);
	// const signer2Pubkey = voterClient.getPubkey({
	// 	accountIndex: 0,
	// 	addressIndex: 1,
	// });
	// console.log('signer2Pubkey', signer2Pubkey);
}

main();
