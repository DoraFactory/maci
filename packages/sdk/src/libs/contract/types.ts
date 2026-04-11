import { OfflineSigner } from '@cosmjs/proto-signing';
import { StdFee } from '@cosmjs/amino';

import type { RegistrationModeConfig, VoiceCreditMode } from './ts/AMaci.types';
import { MaciCircuitType } from '../../types';
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
  voteOptionMap: string[];
  certificationSystem?: string;
  deactivateEnabled: boolean;
  registrationMode: RegistrationModeConfig;
  voiceCreditMode: VoiceCreditMode;
  fee?: number | StdFee | 'auto';
} & CreateRoundParams;

export type CreateApiSaasAmaciRoundParams = {
  operator: string;
  voteOptionMap: string[];
  certificationSystem?: string;
  deactivateEnabled: boolean;
  registrationMode: RegistrationModeConfig;
  voiceCreditMode: VoiceCreditMode;
  gasStation?: boolean;
  fee?: StdFee | 'auto' | number;
} & CreateRoundParams;

export type CreateMaciRoundParams = {
  voteOptionMap: string[];
  coordinator: PubKey | bigint;
  whitelistBackendPubkey: string;
  whitelistVotingPowerMode: 'slope' | 'threshold';
} & CreateRoundParams;

export type { RegistrationModeConfig, VoiceCreditMode } from './ts/AMaci.types';
