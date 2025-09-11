import { VoterClient } from '../src';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
	console.log('======= start test keypair logic =======');

	// const mnemonic = process.env.MNEMONIC;
	// if (!mnemonic) {
	// 	throw new Error('MNEMONIC not found in environment variables');
	// }
	const secretKey = process.env.NEW_PRIVATE_KEY;
	if (!secretKey) {
		throw new Error('NEW_PRIVATE_KEY not found in environment variables');
	}

	const voterClient = new VoterClient({
		// mnemonic,
		secretKey,
		// 17034747375213412803826888399478627091796082799060419877423611523942833339716n,
	});

	const payload = {
		amount: '100000000',
		contractAddress: 'contract0',
	};

	console.log('pubkey', voterClient.getSigner().getPublicKey());
	const credential = voterClient.getSigner().signCredential({
		amount: payload.amount,
		contractAddress: payload.contractAddress,
	});
	console.log('credential', credential);

	const publicKey = voterClient.getSigner().getPublicKey();
	const verified = publicKey.verifyCredential({
		amount: payload.amount,
		contractAddress: payload.contractAddress,
		signature: credential,
	});
	console.log('verified', verified);
}

main();
