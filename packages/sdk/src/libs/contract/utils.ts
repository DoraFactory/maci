import { MaciCertSystemType, MaciCircuitType, MaciRoundType } from '../../types';
import { CIRCUIT_INFO } from './vars';

export function getCircuitType(circuitType: MaciCircuitType) {
  let maciVoteType = null;
  switch (circuitType) {
    case MaciCircuitType.IP1V:
      maciVoteType = '0';
      break;
    case MaciCircuitType.QV:
      maciVoteType = '1';
      break;
    default:
      throw new Error(`Invalid circuit type ${circuitType}, only support 1P1V and QV`);
  }
  return maciVoteType;
}

export function getContractParams(
  type: MaciRoundType,
  circuitType: MaciCircuitType,
  proofSystem: MaciCertSystemType,
  maxVoter: number,
  maxOption: number
) {
  let parameters: {
    state_tree_depth: string;
    int_state_tree_depth: string;
    vote_option_tree_depth: string;
    message_batch_size: string;
  };
  let groth16ProcessVkey = null;
  let groth16TallyVkey = null;
  let plonkProcessVkey = null;
  let plonkTallyVkey = null;
  let maciVoteType = null;
  let maciCertSystem = null;

  switch (circuitType) {
    case MaciCircuitType.IP1V:
      maciVoteType = '0';
      break;
    case MaciCircuitType.QV:
      maciVoteType = '1';
      break;
    default:
      throw new Error(`Invalid circuit type ${circuitType}, only support 1P1V and QV`);
  }

  switch (proofSystem) {
    case MaciCertSystemType.GROTH16:
      maciCertSystem = '0';
      break;
    case MaciCertSystemType.PLONK:
      maciCertSystem = '1';
      break;
    default:
      throw new Error(`Invalid proof system ${proofSystem}, only support GROTH16 and PLONK`);
  }

  if (maxVoter <= 25 && maxOption <= 5) {
    // state_tree_depth: 2
    // vote_option_tree_depth: 1
    parameters = CIRCUIT_INFO['2-1-1-5'].parameter;
    if (proofSystem === MaciCertSystemType.GROTH16) {
      groth16ProcessVkey = CIRCUIT_INFO['2-1-1-5']['groth16'].process_vkey;
      groth16TallyVkey = CIRCUIT_INFO['2-1-1-5']['groth16'].tally_vkey;
    } else if (proofSystem === MaciCertSystemType.PLONK) {
      plonkProcessVkey = CIRCUIT_INFO['2-1-1-5']['plonk']?.process_vkey;
      plonkTallyVkey = CIRCUIT_INFO['2-1-1-5']['plonk']?.tally_vkey;
    }
  } else if (maxVoter <= 625 && maxOption <= 25) {
    // state_tree_depth: 4
    // vote_option_tree_depth: 2
    parameters = CIRCUIT_INFO['4-2-2-25'].parameter;
    if (proofSystem === MaciCertSystemType.GROTH16) {
      groth16ProcessVkey = CIRCUIT_INFO['4-2-2-25']['groth16'].process_vkey;
      groth16TallyVkey = CIRCUIT_INFO['4-2-2-25']['groth16'].tally_vkey;
    } else if (proofSystem === MaciCertSystemType.PLONK) {
      plonkProcessVkey = CIRCUIT_INFO['4-2-2-25']['plonk']?.process_vkey;
      plonkTallyVkey = CIRCUIT_INFO['4-2-2-25']['plonk']?.tally_vkey;
    }
  } else if (maxVoter <= 15625 && maxOption <= 125) {
    // state_tree_depth: 6
    // vote_option_tree_depth: 3
    parameters = CIRCUIT_INFO['6-3-3-125'].parameter;
    if (proofSystem === MaciCertSystemType.GROTH16) {
      groth16ProcessVkey = CIRCUIT_INFO['6-3-3-125']['groth16'].process_vkey;
      groth16TallyVkey = CIRCUIT_INFO['6-3-3-125']['groth16'].tally_vkey;
    } else if (proofSystem === MaciCertSystemType.PLONK) {
      plonkProcessVkey = CIRCUIT_INFO['6-3-3-125']['plonk']?.process_vkey;
      plonkTallyVkey = CIRCUIT_INFO['6-3-3-125']['plonk']?.tally_vkey;
    }
  } else if (maxVoter <= 1953125 && maxOption <= 125) {
    // state_tree_depth: 9
    // vote_option_tree_depth: 3
    parameters = CIRCUIT_INFO['9-4-3-625'].parameter;
    if (proofSystem === MaciCertSystemType.GROTH16) {
      if (circuitType === MaciCircuitType.IP1V) {
        groth16ProcessVkey = CIRCUIT_INFO['9-4-3-625']['groth16'].process_1p1v_vkey;
        groth16TallyVkey = CIRCUIT_INFO['9-4-3-625']['groth16'].tally_1p1v_vkey;
      } else if (circuitType === MaciCircuitType.QV) {
        groth16ProcessVkey = CIRCUIT_INFO['9-4-3-625']['groth16'].process_qv_vkey;
        groth16TallyVkey = CIRCUIT_INFO['9-4-3-625']['groth16'].tally_qv_vkey;
      }
    } else if (proofSystem === MaciCertSystemType.PLONK) {
      throw new Error('PLONK is not supported for MACI-9');
    }
  } else {
    throw new Error('Number of voters or options is too large.');
  }
  switch (type) {
    case MaciRoundType.MACI:
      return {
        parameters,
        groth16ProcessVkey,
        groth16TallyVkey,
        plonkProcessVkey,
        plonkTallyVkey,
        maciVoteType,
        maciCertSystem
      };
    case MaciRoundType.AMACI:
      return {
        // parameters,
        // groth16ProcessVkey,
        // groth16TallyVkey,
        // plonkProcessVkey,
        // plonkTallyVkey,
      };
    case MaciRoundType.ORACLE_MACI:
      if (circuitType === MaciCircuitType.IP1V) {
        groth16ProcessVkey = CIRCUIT_INFO['9-4-3-625']['groth16'].process_1p1v_vkey;
        groth16TallyVkey = CIRCUIT_INFO['9-4-3-625']['groth16'].tally_1p1v_vkey;
      } else if (circuitType === MaciCircuitType.QV) {
        groth16ProcessVkey = CIRCUIT_INFO['9-4-3-625']['groth16'].process_qv_vkey;
        groth16TallyVkey = CIRCUIT_INFO['9-4-3-625']['groth16'].tally_qv_vkey;
      }
      return {
        parameters: CIRCUIT_INFO['9-4-3-625'].parameter,
        groth16ProcessVkey,
        groth16TallyVkey,
        plonkProcessVkey: null,
        plonkTallyVkey: null,
        maciVoteType,
        maciCertSystem: '0'
      };
  }
}

export function getAMaciRoundCircuitFee(
  network: 'mainnet' | 'testnet',
  maxVoter: number,
  maxOption: number
) {
  let requiredFee = {
    denom: 'peaka',
    amount: '0'
  };
  if (maxVoter <= 25 && maxOption <= 5) {
    // state_tree_depth: 2
    // vote_option_tree_depth: 1
    requiredFee.amount = '20000000000000000000';
  } else if (maxVoter <= 625 && maxOption <= 25) {
    // state_tree_depth: 4
    // vote_option_tree_depth: 2
    requiredFee.amount = '540000000000000000000';
  } else if (maxVoter <= 15625 && maxOption <= 125) {
    // state_tree_depth: 6
    // vote_option_tree_depth: 3
    requiredFee.amount = '1080000000000000000000';
  } else {
    throw new Error('Number of voters or options is too large.');
  }

  return requiredFee;
}
