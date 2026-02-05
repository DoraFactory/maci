import { OfflineSigner } from '@cosmjs/proto-signing';
import { StdFee } from '@cosmjs/amino';

import { WhitelistBase as RegistryWhitelist } from './ts/Registry.types';
import { MaciCircuitType, MaciCertSystemType, CertificateEcosystem } from '../../types';
import { PubKey } from '../crypto';

export type CreateRoundParams = {
  signer?: OfflineSigner;
  title: string;
  description?: string;
  link?: string;
  startVoting: Date;
  endVoting: Date;
  circuitType: MaciCircuitType;
  fee?: number | StdFee | 'auto';
};

export type CreateAMaciRoundParams = {
  maxVoter: number;
  voteOptionMap: string[];
  operator: string;
  whitelist?: RegistryWhitelist;
  voiceCreditAmount: string;
  preDeactivateRoot?: string;
  preDeactivateCoordinator?: PubKey | bigint;
  oracleWhitelistPubkey?: string;
} & CreateRoundParams;

export type CreateApiSaasAmaciRoundParams = {
  maxVoter: number;
  voteOptionMap: string[];
  operator: string;
  whitelist?: RegistryWhitelist;
  voiceCreditAmount: string;
  preDeactivateRoot?: string;
  preDeactivateCoordinator?: PubKey | bigint;
  oracleWhitelistPubkey?: string;
  gasStation?: boolean;
  fee?: StdFee | 'auto' | number;
} & CreateRoundParams;

export type CreateApiSaasMaciRoundParams = {
  maxVoter: number;
  voteOptionMap: string[];
  operatorPubkey: PubKey | bigint;
  whitelistBackendPubkey: string;
  gasStation?: boolean;
  fee?: StdFee | 'auto' | number;
} & CreateRoundParams;

export type CreateMaciRoundParams = {
  maxVoter: number;
  voteOptionMap: string[];
  coordinator: PubKey | bigint;
  whitelistBackendPubkey: string;
  whitelistVotingPowerMode: 'slope' | 'threshold';
} & CreateRoundParams;
