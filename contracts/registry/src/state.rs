use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Decimal, Timestamp, Uint128};
use cw_amaci::state::PubKey;
use cw_storage_plus::{Item, Map};

#[cw_serde]
pub struct Config {
    /// denom of the token to stake
    pub denom: String,
    pub min_deposit_amount: Uint128,
    pub slash_amount: Uint128,
}

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
pub struct ValidatorSet {
    pub addresses: Vec<Addr>,
}

impl ValidatorSet {
    pub fn is_validator(&self, addr: &Addr) -> bool {
        self.addresses.iter().any(|a| a == addr)
    }

    pub fn remove_validator(&mut self, addr: &Addr) {
        self.addresses.retain(|a| a != addr);
    }
}

pub const ADMIN: Item<Admin> = Item::new("admin");
pub const OPERATOR: Item<Addr> = Item::new("operator");
// pub const CONFIG: Item<Config> = Item::new("config");

// AMACI code ID (unified MACI contract)
pub const AMACI_CODE_ID: Item<u64> = Item::new("amaci_code_id");

pub const MACI_VALIDATOR_LIST: Item<ValidatorSet> = Item::new("maci_validator_list");
pub const MACI_VALIDATOR_OPERATOR_SET: Map<&Addr, Addr> = Map::new("maci_validator_operator_set");
pub const MACI_OPERATOR_SET: Map<&Addr, Uint128> = Map::new("maci_operator_set");

pub const MACI_OPERATOR_PUBKEY: Map<&Addr, PubKey> = Map::new("maci_operator_pubkey");
pub const COORDINATOR_PUBKEY_MAP: Map<&(Vec<u8>, Vec<u8>), u64> =
    Map::new("coordinator_pubkey_map");
pub const MACI_OPERATOR_IDENTITY: Map<&Addr, String> = Map::new("maci_operator_identity");

/// ORIGINAL deployed state — DO NOT rename the storage key.
/// Managed by ChangeChargeConfig (operator permission).
#[cw_serde]
pub struct CircuitChargeConfig {
    // fee rate for fee_recipient at Claim time (e.g., 0.1 means 10%)
    pub fee_rate: Decimal,
}

pub const CIRCUIT_CHARGE_CONFIG: Item<CircuitChargeConfig> =
    Item::new("circuit_charge_config");

/// Fee amounts configuration — new storage, does not conflict with CIRCUIT_CHARGE_CONFIG.
/// Managed by UpdateFeeConfig (operator permission).
#[cw_serde]
pub struct FeeConfig {
    // CreateRound creation fee (paid by round creator)
    pub base_fee: Uint128,
    // per-message fee for PublishMessage
    pub message_fee: Uint128,
    // per-message fee for PublishDeactivateMessage
    pub deactivate_fee: Uint128,
    // registration fee for signup / addNewKey / preAddNewKey
    pub signup_fee: Uint128,
}

pub const FEE_CONFIG: Item<FeeConfig> = Item::new("fee_config");

/// Delay configuration — new storage, does not conflict with existing state.
/// Managed by UpdateDelayConfig (operator permission).
#[cw_serde]
pub struct DelayConfig {
    // tally base delay: covers the first 5^int_state_tree_depth-slot tally batch
    pub base_delay: u64,
    // per-message delay added to tally window per PublishMessage
    pub message_delay: u64,
    // per-user delay added to tally window per registered user
    pub signup_delay: u64,
    // operator processing window for deactivate messages (from first msg received)
    pub deactivate_delay: u64,
}

pub const DELAY_CONFIG: Item<DelayConfig> = Item::new("delay_config");

// Poll ID management
pub const NEXT_POLL_ID: Item<u64> = Item::new("next_poll_id");
pub const POLL_ID_TO_ADDRESS: Map<u64, Addr> = Map::new("poll_id_to_address");
pub const ADDRESS_TO_POLL_ID: Map<&Addr, u64> = Map::new("address_to_poll_id");

#[cw_serde]
pub struct PollInfo {
    pub poll_id: u64,
    pub poll_address: Addr,
    pub poll_type: String, // "MACI" or "AMACI"
    pub operator: Addr,
    pub created_at: Timestamp,
}
