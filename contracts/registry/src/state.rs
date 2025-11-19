use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Decimal, Uint128};
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
    // pub fn is_whitelist(&self, addr: impl AsRef<str>) -> bool {
    //     let addr = addr.as_ref();
    //     self.users.iter().any(|a| a.addr == addr)
    // }

    pub fn remove_validator(&mut self, addr: &Addr) {
        self.addresses.retain(|a| a != addr);
    }
}

pub const ADMIN: Item<Admin> = Item::new("admin");
pub const OPERATOR: Item<Addr> = Item::new("operator");
// pub const CONFIG: Item<Config> = Item::new("config");
pub const AMACI_CODE_ID: Item<u64> = Item::new("amaci_code_id");
// pub const TOTAL: Item<u128> = Item::new(TOTAL_KEY);
pub const MACI_VALIDATOR_LIST: Item<ValidatorSet> = Item::new("maci_validator_list"); // ['val1', 'val2', 'val3']
pub const MACI_VALIDATOR_OPERATOR_SET: Map<&Addr, Addr> = Map::new("maci_validator_operator_set"); // { val1: op1, val2: op2, val3: op3 }
pub const MACI_OPERATOR_SET: Map<&Addr, Uint128> = Map::new("maci_operator_set"); // { op1: pub1, op2: pub2, op3: pub3 }

pub const MACI_OPERATOR_PUBKEY: Map<&Addr, PubKey> = Map::new("maci_operator_pubkey"); // operator_address - coordinator_pubkey
pub const COORDINATOR_PUBKEY_MAP: Map<&(Vec<u8>, Vec<u8>), u64> =
    Map::new("coordinator_pubkey_map"); //
pub const MACI_OPERATOR_IDENTITY: Map<&Addr, String> = Map::new("maci_operator_identity"); // operator_address - identity

#[cw_serde]
pub struct CircuitChargeConfig {
    // // small circuit fee (max_voter <= 25, max_option <= 5)
    // pub small_circuit_fee: Uint128,
    // // medium circuit fee (max_voter <= 625, max_option <= 25)
    // pub medium_circuit_fee: Uint128,
    // fee rate for admin (e.g., 0.001 means 0.1% of the fee goes to admin)
    pub fee_rate: Decimal,
}

pub const CIRCUIT_CHARGE_CONFIG: Item<CircuitChargeConfig> = Item::new("circuit_charge_config");
