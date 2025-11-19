use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Uint128, Uint256};
use cw_amaci::msg::WhitelistBase;
use cw_amaci::state::{RoundInfo, VotingTime};

use crate::state::{Config, OperatorInfo};

#[cw_serde]
pub struct PubKey {
    pub x: Uint256,
    pub y: Uint256,
}

#[cw_serde]
pub struct InstantiateMsg {
    pub admin: Addr,
    pub treasury_manager: Addr,
    pub registry_contract: Addr,
    pub denom: String,
    pub maci_code_id: u64,
}

#[cw_serde]
pub enum ExecuteMsg {
    // Admin management
    UpdateConfig {
        admin: Option<Addr>,
        denom: Option<String>,
    },

    UpdateMaciCodeId {
        code_id: u64,
    },
    UpdateAmaciRegistryContract {
        registry_contract: Addr,
    },

    // Operator management
    AddOperator {
        operator: Addr,
    },
    RemoveOperator {
        operator: Addr,
    },

    // Deposit/Withdraw functions
    Deposit {},
    Withdraw {
        amount: Uint128,
        recipient: Option<Addr>,
    },

    // Create API MACI round
    CreateMaciRound {
        coordinator: PubKey,
        max_voters: u128,
        vote_option_map: Vec<String>,
        round_info: RoundInfo,
        start_time: cosmwasm_std::Timestamp,
        end_time: cosmwasm_std::Timestamp,
        circuit_type: Uint256,
        certification_system: Uint256,
        whitelist_backend_pubkey: String,
        // The following parameters are hardcoded in the contract:
        // whitelist_voting_power_args: slope mode (one person one vote)
    },

    // Create AMACI round via registry
    CreateAmaciRound {
        operator: Addr,
        max_voter: Uint256,
        voice_credit_amount: Uint256,
        vote_option_map: Vec<String>,
        round_info: RoundInfo,
        voting_time: VotingTime,
        whitelist: Option<WhitelistBase>,
        pre_deactivate_root: Uint256,
        circuit_type: Uint256,
        certification_system: Uint256,
        oracle_whitelist_pubkey: Option<String>,
        pre_deactivate_coordinator: Option<PubKey>,
    },

    // API MACI management
    SetRoundInfo {
        contract_addr: String,
        round_info: RoundInfo,
    },
    SetVoteOptionsMap {
        contract_addr: String,
        vote_option_map: Vec<String>,
    },
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(Config)]
    Config {},

    #[returns(Vec<OperatorInfo>)]
    Operators {},

    #[returns(bool)]
    IsOperator { address: Addr },

    #[returns(Uint128)]
    Balance {},

    #[returns(u64)]
    MaciCodeId {},

    #[returns(Addr)]
    TreasuryManager {},
}

#[cw_serde]
pub struct MigrateMsg {}

#[cw_serde]
pub struct InstantiationData {
    pub addr: Addr,
}
