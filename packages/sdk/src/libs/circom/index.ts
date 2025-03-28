import {
  OfflineSigner,
  OfflineDirectSigner,
  isOfflineDirectSigner,
} from '@cosmjs/proto-signing';
import { StdSignDoc } from '@cosmjs/amino';
import { SignDoc } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { getDefaultParams } from '../const';
import { PublicKey, genKeypair, stringizing } from './circomlib';
import { SignResult, CircomParams } from './types';
export * from './circomlib';

export class Circom {
  private network: string;
  private chainId: string;

  constructor({ network }: CircomParams) {
    this.network = network;
    this.chainId = getDefaultParams(network).chainId;
  }

  async signMessage(
    signer: OfflineSigner,
    address: string,
    message: string
  ): Promise<SignResult> {
    if (typeof window !== 'undefined' && (window as any).keplr) {
      const sig = await (window as any).keplr.signArbitrary(
        this.chainId,
        address,
        message
      );

      return {
        signature: sig.signature,
        pubkey: sig.pub_key.value,
      };
    }

    const accounts = await signer.getAccounts();
    const account = accounts.find((acc) => acc.address === address);

    if (!account) {
      throw new Error(`Address ${address} not found in wallet`);
    }

    if (isOfflineDirectSigner(signer)) {
      // Direct
      const signDoc: SignDoc = {
        bodyBytes: new TextEncoder().encode(message),
        authInfoBytes: new Uint8Array(),
        chainId: this.chainId,
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
        chain_id: this.chainId,
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

  async genKeypairFromSign(signer: OfflineSigner, address: string) {
    const sig = await this.signMessage(
      signer,
      address,
      'Generate_MACI_Private_Key'
    );

    const sign = BigInt(
      '0x' + Buffer.from(sig.signature, 'base64').toString('hex')
    );

    return genKeypair(sign);
  }
}
