import { bech32 } from 'bech32';

const address =
	'dora16hqk46slfcel56jg2dywwxpjqdqewtfe5uyxrmxp28n0uvdn8d4qetl0jp';

const { prefix, words } = bech32.decode(address);
console.log('prefix', prefix);
console.log('words', words);
console.log('words hex string', words.map(word => word.toString(16)).join(''));
