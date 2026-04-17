use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Uint128, Uint256};
use cw_amaci::msg::RegistrationModeConfig;
use cw_amaci::state::{RoundInfo, VoiceCreditMode, VotingTime};

use crate::state::{Config, OperatorInfo, SaasFeeConfig};

#[cw_serde]
pub struct EncPubKeyParam {
    pub x: String,
    pub y: String,
}

#[cw_serde]
pub struct MessageDataParam {
    pub data: Vec<String>,
}

/// Groth16 proof parameters (mirrors cw_amaci::msg::Groth16ProofType).
#[cw_serde]
pub struct Groth16ProofParam {
    pub a: String,
    pub b: String,
    pub c: String,
}

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

    // Update local fee config mirror (admin only)
    UpdateFeeConfig {
        config: SaasFeeConfig,
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

    // Proxy vote/deactivate on behalf of users (SAAS contract covers message fees from its balance)
    PublishMessage {
        contract_addr: String,
        enc_pub_keys: Vec<EncPubKeyParam>,
        messages: Vec<MessageDataParam>,
    },
    PublishDeactivateMessage {
        contract_addr: String,
        enc_pub_key: EncPubKeyParam,
        message: MessageDataParam,
    },

    // Proxy registration operations on behalf of users (SAAS covers signup_fee from its balance)
    SignUp {
        contract_addr: String,
        pubkey: EncPubKeyParam,
        /// Oracle mode certificate (None for StaticWhitelist mode)
        certificate: Option<String>,
        /// Voice credit amount (None for Unified VC mode)
        amount: Option<String>,
    },
    AddNewKey {
        contract_addr: String,
        pubkey: EncPubKeyParam,
        nullifier: String,
        d: [String; 4],
        groth16_proof: Groth16ProofParam,
    },
    PreAddNewKey {
        contract_addr: String,
        pubkey: EncPubKeyParam,
        nullifier: String,
        d: [String; 4],
        groth16_proof: Groth16ProofParam,
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
