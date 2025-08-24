import {
  OfflineSigner,
  OfflineDirectSigner,
  isOfflineDirectSigner,
} from '@cosmjs/proto-signing';
import { StdSignDoc } from '@cosmjs/amino';
import { SignDoc } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { getDefaultParams } from '../const';
import { genKeypair } from './keys';
import { SignResult } from './types';

export async function signMessage(
  signer: OfflineSigner,
  address: string,
  message: string,
  network: 'mainnet' | 'testnet' | 'devnet'
): Promise<SignResult> {
  const accounts = await signer.getAccounts();
  const account = accounts.find((acc) => acc.address === address);
  const chainId = getDefaultParams(network).chainId;

  if (!account) {
    throw new Error(`Address ${address} not found in wallet`);
  }

  if (isOfflineDirectSigner(signer)) {
    // Direct
    const signDoc: SignDoc = {
      bodyBytes: new TextEncoder().encode(message),
      authInfoBytes: new Uint8Array(),
      chainId,
      accountNumber: BigInt(0),
    };

    const { signature } = await signer.signDirect(address, signDoc);

    return {
      signature: signature.signature,
      pubkey: account.pubkey,
    };
  } else {
    // Amino
    const signDoc: StdSignDoc = {
      chain_id: chainId,
      account_number: '0',
      sequence: '0',
      fee: {
        gas: '0',
        amount: [],
      },
      msgs: [],
      memo: message,
    };

    const { signature } = await signer.signAmino(address, signDoc);

    return {
      signature: signature.signature,
      pubkey: account.pubkey,
    };
  }
}

export async function genKeypairFromSignature(signature: string) {
  const sign = BigInt('0x' + Buffer.from(signature, 'base64').toString('hex'));

  return genKeypair(sign);
}

export async function genKeypairFromSign({
  signer,
  address,
  network,
}: {
  signer: OfflineSigner;
  address?: string;
  network: 'mainnet' | 'testnet' | 'devnet';
}) {
  if (!address) {
    [{ address }] = await signer.getAccounts();
  }

  const sig = await signMessage(
    signer,
    address,
    'Generate_MACI_Private_Key',
    network
  );

  return genKeypairFromSignature(sig.signature);
}
