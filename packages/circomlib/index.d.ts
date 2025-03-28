declare module '@dorafactory/circomlib' {
	export interface SMT {
		insert(
			key: Uint8Array | string,
			value: Uint8Array | string
		): Promise<void>;
		delete(key: Uint8Array | string): Promise<void>;
		find(key: Uint8Array | string): Promise<any>;
	}

	const smt: any;
	const eddsa: any;
	const mimc7: {
		hash(x: string | number, k?: string): string;
		multiHash(arr: (string | number)[], k?: string): string;
	};
	const mimcsponge: {
		hash(
			xL: string | number,
			xR: string | number,
			k?: string
		): [string, string];
		multiHash(arr: (string | number)[], key?: string): [string, string];
	};
	const babyJub: any;
	const pedersenHash: any;
	const SMT: any;
	const SMTMemDB: any;
	const poseidon: any;
	const poseidonPerm: any;
	const poseidonEncrypt: any;
	const poseidonDecrypt: any;
	const Tree: any;

	export {
		smt,
		eddsa,
		mimc7,
		mimcsponge,
		babyJub,
		pedersenHash,
		SMT,
		SMTMemDB,
		poseidon,
		poseidonPerm,
		poseidonEncrypt,
		poseidonDecrypt,
		Tree,
	};
}

declare module 'ffjavascript' {
	export const Scalar: any;
	export const utils: any;
}

declare module 'blake-hash' {
	interface BlakeHash {
		update(data: Buffer): BlakeHash;
		digest(): Buffer;
	}

	function createBlakeHash(algorithm: string): BlakeHash;
	export default createBlakeHash;
}
