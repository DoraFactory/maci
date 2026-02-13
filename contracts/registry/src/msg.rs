use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Uint128, Uint256};

use cw_amaci::{
    msg::RegistrationModeConfig,
    state::{PubKey, RoundInfo, VoiceCreditMode, VotingTime},
};

use crate::state::{CircuitChargeConfig, ValidatorSet};

#[cw_serde]
pub struct InstantiateMsg {
    // admin can only bond/withdraw token
    pub admin: Addr,

    // operator can add whitelist address
    pub operator: Addr,

    // AMACI code ID (unified MACI contract)
    pub amaci_code_id: u64,
}

#[cw_serde]
pub enum ExecuteMsg {
    SetMaciOperator {
        operator: Addr,
    },
    SetMaciOperatorPubkey {
        pubkey: PubKey,
    },
    SetMaciOperatorIdentity {
        identity: String,
    },
    CreateRound {
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
        // Unified MACI Configuration (NEW)
        // ============================================
        
        // Voice Credit Mode: how voting power is allocated
        voice_credit_mode: VoiceCreditMode,
        
        // Registration Mode: combined access control and state initialization
        // This prevents invalid configuration combinations
        registration_mode: RegistrationModeConfig,
    },
    SetValidators {
        addresses: ValidatorSet,
    },
    RemoveValidator {
        address: Addr,
    },
    UpdateAmaciCodeId {
        code_id: u64,
    },
    ChangeOperator {
        address: Addr,
    },
    ChangeChargeConfig {
        config: CircuitChargeConfig,
    },
}

#[cw_serde]
pub struct MigrateMsg {}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(AdminResponse)]
    Admin {},

    #[returns(Addr)]
    Operator {},

    #[returns(bool)]
    IsMaciOperator { address: Addr },

    #[returns(bool)]
    IsValidator { address: Addr },

    #[returns(ValidatorSet)]
    GetValidators {},

    #[returns(Addr)]
    GetValidatorOperator { address: Addr },

    #[returns(PubKey)]
    GetMaciOperatorPubkey { address: Addr },

    #[returns(String)]
    GetMaciOperatorIdentity { address: Addr },

    #[returns(CircuitChargeConfig)]
    GetCircuitChargeConfig {},

    #[returns(u64)]
    GetPollId { address: Addr },

    #[returns(Option<Addr>)]
    GetPollAddress { poll_id: u64 },

    #[returns(u64)]
    GetNextPollId {},

    #[returns(u64)]
    GetAmaciCodeId {},
}

#[cw_serde]
pub struct AdminResponse {
    pub admin: Addr,
}

#[cw_serde]
pub struct ConfigResponse {
    pub denom: String,
    pub min_deposit_amount: Uint128,
    pub slash_amount: Uint128,
}

#[cw_serde]
pub struct InstantiationData {
    pub addr: Addr,
}
