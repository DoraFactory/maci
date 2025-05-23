/**
 * This file was automatically generated by @cosmwasm/ts-codegen@1.11.1.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run the @cosmwasm/ts-codegen generate command to regenerate this file.
 */

export type Uint256 = string;
export type Addr = string;
export type Timestamp = Uint64;
export type Uint64 = string;
export type VotingPowerMode = 'slope' | 'threshold';
export interface InstantiateMsg {
  certification_system: Uint256;
  circuit_type: Uint256;
  coordinator: PubKey;
  feegrant_operator: Addr;
  groth16_process_vkey?: Groth16VKeyType | null;
  groth16_tally_vkey?: Groth16VKeyType | null;
  max_vote_options: Uint256;
  parameters: MaciParameters;
  plonk_process_vkey?: PlonkVKeyType | null;
  plonk_tally_vkey?: PlonkVKeyType | null;
  qtr_lib: QuinaryTreeRoot;
  round_info: RoundInfo;
  voting_time?: VotingTime | null;
  whitelist_backend_pubkey: string;
  whitelist_ecosystem: string;
  whitelist_snapshot_height: Uint256;
  whitelist_voting_power_args: VotingPowerArgs;
}
export interface PubKey {
  x: Uint256;
  y: Uint256;
}
export interface Groth16VKeyType {
  vk_alpha1: string;
  vk_beta_2: string;
  vk_delta_2: string;
  vk_gamma_2: string;
  vk_ic0: string;
  vk_ic1: string;
}
export interface MaciParameters {
  int_state_tree_depth: Uint256;
  message_batch_size: Uint256;
  state_tree_depth: Uint256;
  vote_option_tree_depth: Uint256;
}
export interface PlonkVKeyType {
  g2_elements: string[];
  n: number;
  next_step_selector_commitments: string[];
  non_residues: string[];
  num_inputs: number;
  permutation_commitments: string[];
  selector_commitments: string[];
}
export interface QuinaryTreeRoot {
  zeros: [
    Uint256,
    Uint256,
    Uint256,
    Uint256,
    Uint256,
    Uint256,
    Uint256,
    Uint256,
    Uint256,
  ];
}
export interface RoundInfo {
  description: string;
  link: string;
  title: string;
}
export interface VotingTime {
  end_time?: Timestamp | null;
  start_time?: Timestamp | null;
}
export interface VotingPowerArgs {
  mode: VotingPowerMode;
  slope: Uint256;
  threshold: Uint256;
}
export type ExecuteMsg =
  | {
      set_params: {
        int_state_tree_depth: Uint256;
        message_batch_size: Uint256;
        state_tree_depth: Uint256;
        vote_option_tree_depth: Uint256;
      };
    }
  | {
      set_round_info: {
        round_info: RoundInfo;
      };
    }
  | {
      set_vote_options_map: {
        vote_option_map: string[];
      };
    }
  | {
      start_voting_period: {};
    }
  | {
      sign_up: {
        amount: Uint256;
        certificate: string;
        pubkey: PubKey;
      };
    }
  | {
      start_process_period: {};
    }
  | {
      stop_voting_period: {};
    }
  | {
      publish_message: {
        enc_pub_key: PubKey;
        message: MessageData;
      };
    }
  | {
      process_message: {
        groth16_proof?: Groth16ProofType | null;
        new_state_commitment: Uint256;
        plonk_proof?: PlonkProofType | null;
      };
    }
  | {
      stop_processing_period: {};
    }
  | {
      process_tally: {
        groth16_proof?: Groth16ProofType | null;
        new_tally_commitment: Uint256;
        plonk_proof?: PlonkProofType | null;
      };
    }
  | {
      stop_tallying_period: {
        results: Uint256[];
        salt: Uint256;
      };
    }
  | {
      grant: {
        base_amount: Uint128;
        grantee: Addr;
      };
    }
  | {
      revoke: {
        grantee: Addr;
      };
    }
  | {
      bond: {};
    }
  | {
      withdraw: {
        amount?: Uint128 | null;
      };
    };
export type Uint128 = string;
export interface MessageData {
  data: [Uint256, Uint256, Uint256, Uint256, Uint256, Uint256, Uint256];
}
export interface Groth16ProofType {
  a: string;
  b: string;
  c: string;
}
export interface PlonkProofType {
  grand_product_at_z_omega: string;
  grand_product_commitment: string;
  input_values: string[];
  linearization_polynomial_at_z: string;
  n: number;
  num_inputs: number;
  opening_at_z_omega_proof: string;
  opening_at_z_proof: string;
  permutation_polynomials_at_z: string[];
  quotient_poly_commitments: string[];
  quotient_polynomial_at_z: string;
  wire_commitments: string[];
  wire_values_at_z: string[];
  wire_values_at_z_omega: string[];
}
export type QueryMsg =
  | {
      get_round_info: {};
    }
  | {
      get_voting_time: {};
    }
  | {
      get_period: {};
    }
  | {
      get_num_sign_up: {};
    }
  | {
      get_msg_chain_length: {};
    }
  | {
      get_processed_msg_count: {};
    }
  | {
      get_processed_user_count: {};
    }
  | {
      get_result: {
        index: Uint256;
      };
    }
  | {
      get_all_result: {};
    }
  | {
      get_state_idx_inc: {
        address: Addr;
      };
    }
  | {
      get_voice_credit_balance: {
        index: Uint256;
      };
    }
  | {
      is_white_list: {
        amount: Uint256;
        certificate: string;
        sender: string;
      };
    }
  | {
      white_balance_of: {
        amount: Uint256;
        certificate: string;
        sender: string;
      };
    }
  | {
      white_info: {
        sender: string;
      };
    }
  | {
      grant_info: {
        grantee: string;
      };
    }
  | {
      max_whitelist_num: {};
    }
  | {
      vote_option_map: {};
    }
  | {
      max_vote_options: {};
    }
  | {
      query_total_fee_grant: {};
    }
  | {
      query_circuit_type: {};
    }
  | {
      query_cert_system: {};
    }
  | {
      query_oracle_whitelist_config: {};
    };
export type PeriodStatus =
  | 'pending'
  | 'voting'
  | 'processing'
  | 'tallying'
  | 'ended';
export interface Period {
  status: PeriodStatus;
}
export interface GrantConfig {
  fee_amount: Uint128;
  fee_grant: boolean;
}
export type Boolean = boolean;
export type Binary = string;
export interface OracleWhitelistConfig {
  backend_pubkey: Binary;
  ecosystem: string;
  slope: Uint256;
  snapshot_height: Uint256;
  threshold: Uint256;
  voting_power_mode: VotingPowerMode;
}
export type ArrayOfString = string[];
export interface WhitelistConfig {
  balance: Uint256;
  fee_amount: Uint128;
  fee_grant: boolean;
  is_register: boolean;
}
