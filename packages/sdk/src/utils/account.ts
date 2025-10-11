import { VoterClient } from 'src/voter';

export function genAccounts(num: number): VoterClient[] {
	return Array.from({ length: num }, () => new VoterClient());
}
