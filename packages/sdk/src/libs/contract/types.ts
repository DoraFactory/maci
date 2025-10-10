import { OfflineSigner } from '@cosmjs/proto-signing';
import { StdFee } from '@cosmjs/amino';

import { WhitelistBase as RegistryWhitelist } from './ts/Registry.types';
import { Whitelist as MaciWhitelist } from './ts/Maci.types';
import {
  MaciCircuitType,
  MaciCertSystemType,
  CertificateEcosystem,
} from '../../types';
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

export type CreateMaciRoundParams = {
  maxVoter: number;
  maxOption: number;
  operatorPubkey: bigint | string;
  whitelist: MaciWhitelist;
  certSystemType: MaciCertSystemType;
} & CreateRoundParams;

export type CreateOracleMaciRoundParams = {
  voteOptionMap: string[];
  operatorPubkey: bigint | string;
  whitelistEcosystem: CertificateEcosystem;
  whitelistSnapshotHeight: string;
  whitelistVotingPowerArgs: {
    mode: 'slope' | 'threshold';
    slope: string;
    threshold: string;
  };
} & CreateRoundParams;

export type CreateSaasOracleMaciRoundParams = {
  maxVoter: number;
  voteOptionMap: string[];
  operatorPubkey: bigint | string;
  whitelistBackendPubkey?: string;
  feegrantOperator?: string;
  gasStation?: boolean;
  fee?: StdFee | 'auto' | number;
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
