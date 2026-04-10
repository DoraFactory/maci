use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Timestamp, Uint128};
use cw_storage_plus::{Item, Map};

#[cw_serde]
pub struct Config {
    pub admin: Addr,
    pub denom: String,
}

impl Config {
    pub fn is_admin(&self, addr: &Addr) -> bool {
        self.admin == *addr
    }
}

#[cw_serde]
pub struct OperatorInfo {
    pub address: Addr,
    pub added_at: Timestamp,
}

impl OperatorInfo {
    pub fn new(address: Addr, added_at: Timestamp) -> Self {
        Self { address, added_at }
    }
}

// Storage items
pub const CONFIG: Item<Config> = Item::new("config");
pub const OPERATORS: Map<&Addr, OperatorInfo> = Map::new("operators");
pub const TOTAL_BALANCE: Item<Uint128> = Item::new("total_balance");

pub const MACI_CODE_ID: Item<u64> = Item::new("maci_code_id");
pub const REGISTRY_CONTRACT_ADDR: Item<Addr> = Item::new("registry_contract_addr");

// Treasury manager storage for easier access and migration support
pub const TREASURY_MANAGER: Item<Addr> = Item::new("treasury_manager");

/// Local mirror of fee configuration.
/// ApiSaas admin keeps this in sync with the Registry's FeeConfig manually.
/// This avoids cross-contract queries when proxying user operations.
#[cw_serde]
pub struct SaasFeeConfig {
    /// Per-message fee for PublishMessage (mirroring registry message_fee)
    pub message_fee: Uint128,
    /// Per-message fee for PublishDeactivateMessage (mirroring registry deactivate_fee)
    pub deactivate_fee: Uint128,
    /// CreateRound fee forwarded to registry (mirroring registry base_fee)
    pub base_fee: Uint128,
    /// Registration fee for SignUp / AddNewKey / PreAddNewKey (mirroring registry signup_fee)
    pub signup_fee: Uint128,
}

pub const SAAS_FEE_CONFIG: Item<SaasFeeConfig> = Item::new("saas_fee_config");
