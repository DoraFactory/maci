import { VoterClient } from '../src';
import dotenv from 'dotenv';
import { genEcdhSharedKey, SNARK_FIELD_SIZE } from '../src/crypto';

dotenv.config();

async function main() {
	console.log('======= start test keypair logic =======');

	// pre add new key set new pubkey
	const voterClient = new VoterClient();

	console.log('voter pubkey', voterClient.getSigner().getSecretKey());
	console.log('voter pubkey', voterClient.getPubkey().toPackedData());
	// submit voterClient.getPubkey().toPackedData() to smart contract

	// vote
	voterClient.buildVotePayload({
		stateIdx: 0,
		operatorPubkey: voterClient.getPubkey().toPackedData(),
		selectedOptions: [{ idx: 0, vc: 1 }],
	});
}

main();
