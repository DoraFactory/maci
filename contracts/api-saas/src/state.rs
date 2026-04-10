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

/// Global fee configuration for api-saas.
/// Only base_fee is stored here; per-operation fees (signup/message/deactivate)
/// are captured per-round in ROUND_FEE_CONFIG at round creation time.
#[cw_serde]
pub struct SaasFeeConfig {
    /// CreateRound fee forwarded to registry (mirroring registry base_fee)
    pub base_fee: Uint128,
}

pub const SAAS_FEE_CONFIG: Item<SaasFeeConfig> = Item::new("saas_fee_config");

/// Per-round fee configuration captured at round creation time.
/// Allows correct fee accounting for rounds created under different fee regimes.
/// Falls back to legacy defaults for rounds created before this feature was added:
///   signup_fee = 0, message_fee = 0.06 DORA, deactivate_fee = 10 DORA.
#[cw_serde]
pub struct RoundFeeConfig {
    pub signup_fee: Uint128,
    pub message_fee: Uint128,
    pub deactivate_fee: Uint128,
}

/// Legacy fallback values for rounds created before per-round fee tracking was introduced.
pub const LEGACY_SIGNUP_FEE: Uint128 = Uint128::zero();
pub const LEGACY_MESSAGE_FEE: Uint128 = Uint128::new(60_000_000_000_000_000); // 0.06 DORA
pub const LEGACY_DEACTIVATE_FEE: Uint128 = Uint128::new(10_000_000_000_000_000_000); // 10 DORA

pub const ROUND_FEE_CONFIG: Map<&Addr, RoundFeeConfig> = Map::new("round_fee_config");
