import { stringizing, destringizing, VoterClient } from '../src';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
	console.log('======= start test keypair logic =======');

	const mnemonic = process.env.MNEMONIC;
	if (!mnemonic) {
		throw new Error('MNEMONIC not found in environment variables');
	}

	const voterClient = new VoterClient({
		mnemonic,
		// secretKey:
		// 17034747375213412803826888399478627091796082799060419877423611523942833339716n,
	});

	const pubkey = voterClient.getPubkey();
	console.log('pubkey', pubkey);

	const operatorPubkey =
		77964846864736355310214326346683229768412842787742876545093604823578119032153n;
	const votePayload = voterClient.buildVotePayload({
		stateIdx: 0,
		operatorPubkey,
		selectedOptions: [
			{ idx: 0, vc: 1 },
			{ idx: 1, vc: 1 },
		],
	});
	console.log('votePayload', votePayload);

	const stringData = stringizing(votePayload);
	console.log('stringData', stringData);

	const restoredData = destringizing(stringData);
	console.log('restoredData', restoredData);

	const originalStringified = stringizing(votePayload);
	const restoredStringified = stringizing(restoredData);
	console.log(
		'IS EQUAL:',
		JSON.stringify(originalStringified) ===
			JSON.stringify(restoredStringified)
	);
}

main();
