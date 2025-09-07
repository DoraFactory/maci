export type * from '../crypto/types';

export type AccountMangerParams = {
	mnemonic?: string;
	secretKey?: string | bigint;
};

export type DerivePathParams = {
	accountIndex?: number;
	isExternal?: boolean;
	addressIndex?: number;
};

export enum MaciCertSystemType {
	GROTH16 = 'groth16',
	PLONK = 'plonk',
}

export enum MaciRoundType {
	MACI = '0',
	AMACI = '1',
	ORACLE_MACI = '2',
}

export type ClientParams = {
	mnemonic?: string;
	secretKey?: string | bigint;
};
