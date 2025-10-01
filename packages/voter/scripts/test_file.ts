import { VoterClient } from '../src';
import dotenv from 'dotenv';
import { genEcdhSharedKey, SNARK_FIELD_SIZE } from '../src/crypto';

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
		secretKey:
			17034747375213412803826888399478627091796082799060419877423611523942833339716n,
		// 17034747375213412803826888399478627091796082799060419877423611523942833339716n,
	});

	const signer = voterClient.getSigner();
	console.log('signer', signer);

	const genSharedKey = signer.genEcdhSharedKey([
		21363872029505195142837037068013222420869492678994625795133046854769353332225n,
		5742976035933210035612411750172940870068402411226707989463577074055747846075n,
	]);
	console.log('genSharedKey', genSharedKey);

	const rawGenSharedKey = genEcdhSharedKey(
		17034747375213412803826888399478627091796082799060419877423611523942833339716n,
		[
			21363872029505195142837037068013222420869492678994625795133046854769353332225n,
			5742976035933210035612411750172940870068402411226707989463577074055747846075n,
		]
	);
	console.log('rawGenSharedKey', rawGenSharedKey);
}

main();
