use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Uint128, Uint256};
use cw_amaci::msg::RegistrationModeConfig;
use cw_amaci::state::{RoundInfo, VoiceCreditMode, VotingTime};

use crate::state::{Config, OperatorInfo};

#[cw_serde]
pub struct InstantiateMsg {
    pub admin: Addr,
    pub treasury_manager: Addr,
    pub registry_contract: Addr,
    pub denom: String,
}

#[cw_serde]
pub enum ExecuteMsg {
    // Admin management
    UpdateConfig {
        admin: Option<Addr>,
        denom: Option<String>,
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

    // Create AMACI round via registry (Unified MACI API)
    // Note: AMACI now supports complete MACI functionality
    CreateAmaciRound {
        // Operator configuration
        operator: Addr,

        // Round parameters
        max_voter: Uint256,
        vote_option_map: Vec<String>,
        round_info: RoundInfo,
        voting_time: VotingTime,

        // Circuit configuration
        circuit_type: Uint256,
        certification_system: Uint256,

        // Deactivate feature configuration
        deactivate_enabled: bool,

        // ============================================
        // Unified MACI Configuration (aligned with Registry API)
        // ============================================

        // Voice Credit Mode: how voting power is allocated
        voice_credit_mode: VoiceCreditMode,

        // Registration Mode: combined access control and state initialization
        registration_mode: RegistrationModeConfig,
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

    #[returns(Addr)]
    TreasuryManager {},
}

#[cw_serde]
pub struct MigrateMsg {}

#[cw_serde]
pub struct InstantiationData {
    pub addr: Addr,
}
