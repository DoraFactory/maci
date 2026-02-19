import { OfflineSigner } from '@cosmjs/proto-signing';
import { StdFee } from '@cosmjs/amino';

import {
  WhitelistBase as RegistryWhitelist,
  type RegistrationModeConfig as RegistryRegistrationModeConfig,
  type VoiceCreditMode as RegistryVoiceCreditMode
} from './ts/Registry.types';
import type { RegistrationModeConfig, VoiceCreditMode } from './ts/ApiSaas.types';
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
  operator: string;
  maxVoter: number;
  voteOptionMap: string[];
  certificationSystem?: string;
  deactivateEnabled: boolean;
  registrationMode: RegistryRegistrationModeConfig;
  voiceCreditMode: RegistryVoiceCreditMode;
  fee?: number | StdFee | 'auto';
} & CreateRoundParams;

export type CreateApiSaasAmaciRoundParams = {
  operator: string;
  maxVoter: number;
  voteOptionMap: string[];
  certificationSystem?: string;
  deactivateEnabled: boolean;
  registrationMode: RegistrationModeConfig;
  voiceCreditMode: VoiceCreditMode;
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
