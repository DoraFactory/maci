use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Timestamp, Uint128, Uint256};
use cw_storage_plus::{Item, Map};
use maci_utils::{hash2, hash5, uint256_from_hex_string};

#[cw_serde]
pub struct RoundInfo {
    pub title: String,
    pub description: String,
    pub link: String,
}

pub const ROUNDINFO: Item<RoundInfo> = Item::new("round_info");

#[cw_serde]
pub struct VotingTime {
    pub start_time: Timestamp,
    pub end_time: Timestamp,
}

pub const VOTINGTIME: Item<VotingTime> = Item::new("voting_time");

pub const VOTEOPTIONMAP: Item<Vec<String>> = Item::new("vote_option_map");

#[cw_serde]
pub struct Admin {
    pub admin: Addr,
}

impl Admin {
    pub fn is_admin(&self, addr: impl AsRef<str>) -> bool {
        let addr = addr.as_ref();
        self.admin.as_ref() == addr
    }
}

#[cw_serde]
pub enum PeriodStatus {
    Pending,
    Voting,
    Processing,
    Tallying,
    Ended,
}

#[cw_serde]
pub struct Period {
    pub status: PeriodStatus,
}

#[cw_serde]
pub struct MaciParameters {
    pub state_tree_depth: Uint256,
    pub int_state_tree_depth: Uint256,
    pub message_batch_size: Uint256,
    pub vote_option_tree_depth: Uint256,
}

pub const VOICE_CREDIT_AMOUNT: Item<Uint256> = Item::new("voice_credit_amount");
pub const STATEIDXINC: Map<&Addr, Uint256> = Map::new("state_idx_inc");
pub const ADMIN: Item<Admin> = Item::new("admin");
pub const PERIOD: Item<Period> = Item::new("period");
pub const MACIPARAMETERS: Item<MaciParameters> = Item::new("maci_param");

// Poll ID assigned by Registry
pub const POLL_ID: Item<u64> = Item::new("poll_id");

// the num of signup, the state_key is signupnums.
pub const NUMSIGNUPS: Item<Uint256> = Item::new("num_sign_ups");

// key is state_key, value is sender balance
pub const VOICECREDITBALANCE: Map<Vec<u8>, Uint256> = Map::new("voice_credit_balance");

pub const NODES: Map<Vec<u8>, Uint256> = Map::new("nodes");

pub const MAX_VOTE_OPTIONS: Item<Uint256> = Item::new("max_vote_options");
pub const CURRENT_STATE_COMMITMENT: Item<Uint256> = Item::new("current_state_commitment");
pub const CURRENT_TALLY_COMMITMENT: Item<Uint256> = Item::new("current_tally_commitment");

pub const RESULT: Map<Vec<u8>, Uint256> = Map::new("voice_credit_balance");
pub const TOTAL_RESULT: Item<Uint256> = Item::new("total_result");

// ============================================
// Unified MACI Configuration Types
// ============================================

// Voice Credit Mode: defines how voting power is allocated
#[cw_serde]
pub enum VoiceCreditMode {
    // Unified mode: all users get the same voice credit amount (original AMACI)
    Unified { 
        amount: Uint256 
    },
    // Dynamic mode: each user's voice credit equals their provided amount (original MACI)
    // No calculation needed - amount is voice credit directly
    Dynamic,
}

// Registration Mode: combines access control and state initialization
// This unified enum prevents invalid configuration combinations
#[cw_serde]
pub enum RegistrationMode {
    // SignUp with Static Whitelist: users register individually, access controlled by whitelist
    // - Pre-defined list of addresses (original AMACI traditional mode)
    // - Whitelist data stored in WHITELIST storage item
    SignUpWithStaticWhitelist,
    
    // SignUp with Oracle: users register individually, access controlled by Oracle signature
    // - Backend signature verification (both AMACI and MACI support)
    // - Oracle pubkey stored in ORACLE_WHITELIST_PUBKEY storage item
    SignUpWithOracle,
    
    // PrePopulated: bulk import users via PreAddNewKey with ZK proof
    // - Users cannot signup directly, must use PreAddNewKey
    // - Access control is enforced by ZK proof verification
    // - Technical: all users are "pre-deactivated" (deactivated state initialized upfront)
    PrePopulated {
        // Pre-deactivate root: Merkle root of the state tree after pre-deactivation
        // This is the initial state where all users are already in deactivated status
        pre_deactivate_root: Uint256,
        
        // Pre-deactivate coordinator: coordinator pubkey for the pre-deactivated state
        // This coordinator performed the pre-deactivation operation
        // REQUIRED: Must be provided for PreAddNewKey proof verification
        pre_deactivate_coordinator: PubKey,
    },
}

// Storage items for unified configuration
pub const VOICE_CREDIT_MODE: Item<VoiceCreditMode> = Item::new("voice_credit_mode");
pub const REGISTRATION_MODE: Item<RegistrationMode> = Item::new("registration_mode");

// ============================================
// End of Unified MACI Configuration Types
// ============================================

#[cw_serde]
pub struct PubKey {
    pub x: Uint256,
    pub y: Uint256,
}

#[cw_serde]
pub struct StateLeaf {
    pub pub_key: PubKey,
    pub voice_credit_balance: Uint256,
    pub vote_option_tree_root: Uint256,
    pub nonce: Uint256,
}

impl StateLeaf {
    pub fn hash_state_leaf(&self) -> Uint256 {
        let mut plaintext: [Uint256; 5] = [Uint256::from_u128(0); 5];

        plaintext[0] = self.pub_key.x;
        plaintext[1] = self.pub_key.y;
        plaintext[2] = self.voice_credit_balance;
        plaintext[3] = self.vote_option_tree_root;
        plaintext[4] = self.nonce;
        return hash5(plaintext);
    }

    pub fn hash_decativate_state_leaf(&self) -> Uint256 {
        let mut plaintext: [Uint256; 5] = [Uint256::from_u128(0); 5];

        plaintext[0] = self.pub_key.x;
        plaintext[1] = self.pub_key.y;
        plaintext[2] = self.voice_credit_balance;
        return hash2([
            hash5(plaintext),
            uint256_from_hex_string(
                "2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc",
            ),
        ]);
    }

    pub fn hash_new_key_state_leaf(&self, d: [Uint256; 4]) -> Uint256 {
        let mut plaintext: [Uint256; 5] = [Uint256::from_u128(0); 5];

        plaintext[0] = self.pub_key.x;
        plaintext[1] = self.pub_key.y;
        plaintext[2] = self.voice_credit_balance;
        return hash2([
            hash5(plaintext),
            hash5([d[0], d[1], d[2], d[3], Uint256::from_u128(0u128)]),
        ]);
    }
}

// Init Data
pub const MAX_LEAVES_COUNT: Item<Uint256> = Item::new("max_leaves_count");
pub const LEAF_IDX_0: Item<Uint256> = Item::new("leaf_idx_0");
pub const COORDINATORHASH: Item<Uint256> = Item::new("coordinator_hash");
pub const ZEROS: Item<[Uint256; 9]> = Item::new("zeros");
pub const ZEROS_H10: Item<[Uint256; 7]> = Item::new("zeros_h10");

#[cw_serde]
/// Message data structure for encrypted vote messages
/// Length changed from 7 to 10 to accommodate new command structure:
/// - Command: 7 elements [packed_data, newPubKey_x, newPubKey_y, salt, sig_R8_x, sig_R8_y, sig_S]
/// - Encrypted: roundUp(7, 3) + 1 = 10 elements (Poseidon encryption padding)
pub struct MessageData {
    pub data: [Uint256; 10],
}

pub const MSG_HASHES: Map<Vec<u8>, Uint256> = Map::new("msg_hashes");
pub const MSG_CHAIN_LENGTH: Item<Uint256> = Item::new("msg_chain_length");
pub const PROCESSED_MSG_COUNT: Item<Uint256> = Item::new("processed_msg_count");
pub const PROCESSED_USER_COUNT: Item<Uint256> = Item::new("processed_user_count");

// Storage for tracking used enc_pub_keys to ensure uniqueness
pub const USED_ENC_PUB_KEYS: Map<Vec<u8>, bool> = Map::new("used_enc_pub_keys");

pub const DMSG_CHAIN_LENGTH: Item<Uint256> = Item::new("dmsg_chain_length");
pub const DMSG_HASHES: Map<Vec<u8>, Uint256> = Map::new("dmsg_hashes");
pub const STATE_ROOT_BY_DMSG: Map<Vec<u8>, Uint256> = Map::new("state_root_by_dmsg");
pub const PROCESSED_DMSG_COUNT: Item<Uint256> = Item::new("processed_dmsg_count");
pub const DNODES: Map<Vec<u8>, Uint256> = Map::new("dnodes");
pub const DEACTIVATED_COUNT: Item<Uint256> = Item::new("deactivated_count");
pub const NULLIFIERS: Map<Vec<u8>, bool> = Map::new("nullifiers");
pub const CURRENT_DEACTIVATE_COMMITMENT: Item<Uint256> = Item::new("current_deactivate_commitment");
// Map (pubkey.x, pubkey.y) to stateIdx for signup tracking
// Using both x and y to handle potential x-coordinate collisions on the curve
pub const SIGNUPED: Map<&(Vec<u8>, Vec<u8>), Uint256> = Map::new("signuped");
pub const PRE_DEACTIVATE_ROOT: Item<Uint256> = Item::new("pre_deactivate_root");
pub const PRE_DEACTIVATE_COORDINATOR_HASH: Item<Uint256> =
    Item::new("pre_deactivate_coordinator_hash");

pub const DEACTIVATE_COUNT: Item<u128> = Item::new("deactivate_count");

#[cw_serde]
pub struct Groth16ProofStr {
    pub pi_a: Vec<u8>,
    pub pi_b: Vec<u8>,
    pub pi_c: Vec<u8>,
}

#[cw_serde]
pub struct QuinaryTreeRoot {
    pub zeros: [Uint256; 9],
}

impl QuinaryTreeRoot {
    const DEGREE: u32 = 5;

    pub fn root_of(&self, depth: Uint256, nodes: Vec<Uint256>) -> Uint256 {
        let _depth = depth
            .to_string()
            .parse()
            .expect("depth should be a valid u32 within the allowed tree depth range");
        let capacity = Self::DEGREE.pow(_depth);
        let length = nodes.len() as u32;

        assert!(capacity >= length, "overflow");

        let mut c = capacity / Self::DEGREE;
        let mut pl = (length - 1) / Self::DEGREE + 1;
        let mut _nodes = nodes;

        for i in 0.._depth {
            let zero = self.get_zero(i);
            // number of non-zero parent nodes
            for j in 0..c {
                if j >= length {
                    continue;
                }
                let mut h = Uint256::zero();
                if j < pl {
                    let mut inputs = [Uint256::zero(); 5];
                    let mut s = Uint256::zero();
                    for k in 0..5 {
                        let node = if j * 5 + k < length {
                            _nodes[(j * 5 + k) as usize]
                        } else {
                            Uint256::zero()
                        };
                        s += node;
                        let mut input = node;
                        if node == Uint256::zero() {
                            input = zero;
                        }
                        inputs[k as usize] = input;
                    }
                    if s > Uint256::zero() {
                        h = hash5(inputs);
                    }
                }
                _nodes[j as usize] = h;
            }

            pl = (pl - 1) / Self::DEGREE + 1;
            c = c / Self::DEGREE;
        }

        let mut result = _nodes[0];
        if result == Uint256::zero() {
            result = self.get_zero(_depth);
        }
        result
    }

    fn get_zero(&self, height: u32) -> Uint256 {
        self.zeros[height as usize]
    }
}

pub const QTR_LIB: Item<QuinaryTreeRoot> = Item::new("qtr_lib");

#[cw_serde]
pub struct WhitelistConfig {
    pub addr: Addr,
    pub is_register: bool,
    // Voice credit amount for this user
    // Set during instantiate: Unified mode uses Unified.amount, Dynamic mode uses preset value
    pub voice_credit_amount: Uint256,
}

#[cw_serde]
pub struct Whitelist {
    pub users: Vec<WhitelistConfig>,
}

impl Whitelist {
    pub fn is_whitelist(&self, addr: &Addr) -> bool {
        self.users.iter().any(|a| a.addr == addr)
    }

    pub fn is_register(&self, addr: &Addr) -> bool {
        self.users.iter().any(|a| a.addr == addr && a.is_register)
    }

    pub fn register(&mut self, addr: &Addr) {
        self.users
            .iter_mut()
            .find(|a| a.addr == addr)
            .expect("address should exist in whitelist as verified by is_whitelist()")
            .is_register = true;
    }
}

pub const WHITELIST: Item<Whitelist> = Item::new("whitelist");

pub const CIRCUITTYPE: Item<Uint256> = Item::new("circuit_type"); // <0: 1p1v | 1: pv>

pub const CERTSYSTEM: Item<Uint256> = Item::new("certification_system"); // <0: groth16 | 1: plonk>

#[cw_serde]
pub struct PlonkProofStr {
    pub num_inputs: usize,
    pub n: usize,
    pub input_values: Vec<String>,
    pub wire_commitments: Vec<Vec<u8>>,
    pub grand_product_commitment: Vec<u8>,
    pub quotient_poly_commitments: Vec<Vec<u8>>,
    pub wire_values_at_z: Vec<String>,
    pub wire_values_at_z_omega: Vec<String>,
    pub grand_product_at_z_omega: String,
    pub quotient_polynomial_at_z: String,
    pub linearization_polynomial_at_z: String,
    pub permutation_polynomials_at_z: Vec<String>,
    pub opening_at_z_proof: Vec<u8>,
    pub opening_at_z_omega_proof: Vec<u8>,
}

#[cw_serde]
pub struct Groth16VkeyStr {
    pub alpha_1: Vec<u8>,
    pub beta_2: Vec<u8>,
    pub gamma_2: Vec<u8>,
    pub delta_2: Vec<u8>,
    pub ic0: Vec<u8>,
    pub ic1: Vec<u8>,
}

pub const GROTH16_PROCESS_VKEYS: Item<Groth16VkeyStr> = Item::new("groth16_process_vkeys");
pub const GROTH16_TALLY_VKEYS: Item<Groth16VkeyStr> = Item::new("groth16_tally_vkeys");
pub const GROTH16_DEACTIVATE_VKEYS: Item<Groth16VkeyStr> = Item::new("groth16_deactivate_vkeys");
pub const GROTH16_NEWKEY_VKEYS: Item<Groth16VkeyStr> = Item::new("groth16_newkey_vkeys");

// registry operator data
pub const MACI_DEACTIVATE_MESSAGE: Map<&Addr, Vec<Vec<String>>> =
    // contract_address - [["", "", "", "", ""]]
    Map::new("maci_deactivate_message");

// registry operator data
pub const MACI_OPERATOR: Item<Addr> = Item::new("maci_operator");
pub const PENALTY_RATE: Item<Uint256> = Item::new("penalty_rate");
pub const CREATE_ROUND_WINDOW: Item<Timestamp> = Item::new("create_round_window");

pub const DEACTIVATE_DELAY: Item<Timestamp> = Item::new("deactivate_delay"); // deactivate delay in seconds
pub const TALLY_DELAY_MAX_HOURS: Item<u64> = Item::new("tally_delay_max_hours"); // tally delay max hours

pub const TALLY_TIMEOUT: Item<Timestamp> = Item::new("tally_timeout"); // tally timeout in seconds

pub const FIRST_DMSG_TIMESTAMP: Item<Timestamp> = Item::new("first_dmsg_timestamp");

pub const FEE_RECIPIENT: Item<Addr> = Item::new("fee_recipient");

// Deactivate feature enabled/disabled flag
pub const DEACTIVATE_ENABLED: Item<bool> = Item::new("deactivate_enabled");

// Deactivate fee constants (hard-coded)
pub const DEACTIVATE_FEE: Uint128 = Uint128::new(10_000_000_000_000_000_000); // 10 DORA = 10 * 10^18 peaka
pub const DEACTIVATE_DENOM: &str = "peaka";

#[cw_serde]
pub enum DelayType {
    DeactivateDelay = 0,
    TallyDelay = 1,
}

#[cw_serde]
pub struct DelayRecord {
    pub delay_timestamp: Timestamp,
    pub delay_duration: u64,
    pub delay_reason: String,
    pub delay_process_dmsg_count: Uint256,
    pub delay_type: DelayType,
}

#[cw_serde]
pub struct DelayRecords {
    pub records: Vec<DelayRecord>,
}

pub const DELAY_RECORDS: Item<DelayRecords> = Item::new("delay_records");

// Oracle whitelist backend pubkey
pub const ORACLE_WHITELIST_PUBKEY: Item<String> = Item::new("oracle_whitelist_pubkey");

// Oracle whitelist storage per user
#[cw_serde]
pub struct OracleWhitelistUser {
    pub balance: Uint256,
    pub is_register: bool,
}

impl OracleWhitelistUser {
    pub fn register(&mut self) {
        self.is_register = true;
    }

    pub fn balance_of(&self) -> Uint256 {
        return self.balance;
    }
}

pub const ORACLE_WHITELIST: Map<&(Vec<u8>, Vec<u8>), OracleWhitelistUser> =
    Map::new("oracle_whitelist");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_admin() {
        let alice: Addr = Addr::unchecked("alice");

        let config: Admin = Admin {
            admin: alice.clone(),
        };

        assert!(config.is_admin(alice.as_ref()));
        assert!(!config.is_admin("other"));
    }
}
