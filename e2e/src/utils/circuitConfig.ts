import path from 'path';

export type AmaciCircuitSize = '2-1-1-5' | '4-2-2-25';

export interface AmaciCircuitConfig {
  id: AmaciCircuitSize;
  circuitDirName: string;
  stateTreeDepth: number;
  intStateTreeDepth: number;
  voteOptionTreeDepth: number;
  batchSize: number;
  maxVoteOptions: number;
  circuitDir: string;
}

const DEFAULT_AMACI_CIRCUIT_SIZE: AmaciCircuitSize = '2-1-1-5';

const AMACI_CIRCUIT_CONFIGS: Record<AmaciCircuitSize, Omit<AmaciCircuitConfig, 'id' | 'circuitDir'>> = {
  '2-1-1-5': {
    circuitDirName: 'amaci-2-1-1-5',
    stateTreeDepth: 2,
    intStateTreeDepth: 1,
    voteOptionTreeDepth: 1,
    batchSize: 5,
    maxVoteOptions: 5
  },
  '4-2-2-25': {
    circuitDirName: 'amaci-4-2-2-25',
    stateTreeDepth: 4,
    intStateTreeDepth: 2,
    voteOptionTreeDepth: 2,
    batchSize: 25,
    maxVoteOptions: 25
  }
};

export function getAmaciCircuitConfig(size = process.env.AMACI_CIRCUIT_SIZE): AmaciCircuitConfig {
  const resolvedSize = (size || DEFAULT_AMACI_CIRCUIT_SIZE) as AmaciCircuitSize;
  const config = AMACI_CIRCUIT_CONFIGS[resolvedSize];

  if (!config) {
    throw new Error(
      `Unsupported AMACI circuit size: ${size}. Supported values: ${Object.keys(AMACI_CIRCUIT_CONFIGS).join(', ')}`
    );
  }

  return {
    id: resolvedSize,
    ...config,
    circuitDir: path.join(__dirname, '..', '..', 'circuits', config.circuitDirName)
  };
}

