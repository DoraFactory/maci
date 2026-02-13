use crate::state::{
    DelayRecords, MaciParameters, MessageData, PeriodStatus, PubKey, RegistrationMode, RoundInfo,
    VoiceCreditMode, VotingTime, Whitelist,
};
use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Timestamp, Uint256};

#[cw_serde]
pub struct InstantiateMsg {
    // MACI circuit parameters
    pub parameters: MaciParameters,
    pub coordinator: PubKey,

    // Admin and operator addresses
    pub admin: Addr,
    pub fee_recipient: Addr,
    pub operator: Addr,

    // Round configuration
    pub vote_option_map: Vec<String>,
    pub round_info: RoundInfo,
    pub voting_time: VotingTime,

    // Circuit configuration
    pub circuit_type: Uint256,         // <0: 1p1v | 1: pv>
    pub certification_system: Uint256, // <0: groth16 | 1: plonk>

    // Poll ID assigned by Registry (required)
    pub poll_id: u64,

    // ============================================
    // Unified MACI Configuration (NEW)
    // ============================================

    // Voice Credit Mode: defines how voting power is allocated
    pub voice_credit_mode: VoiceCreditMode,

    // Registration Mode: combined access control and state initialization
    // This prevents invalid configuration combinations
    pub registration_mode: RegistrationModeConfig,

    // Deactivate feature enabled/disabled (default: false)
    pub deactivate_enabled: bool,
}

#[cw_serde]
pub struct WhitelistBaseConfig {
    pub addr: Addr,
    // Optional: required for Dynamic VC mode, ignored for Unified VC mode
    pub voice_credit_amount: Option<Uint256>,
}

#[cw_serde]
pub struct WhitelistBase {
    pub users: Vec<WhitelistBaseConfig>,
}

// Registration Mode Configuration (used in InstantiateMsg)
// This is the configuration version that contains initialization data
#[cw_serde]
pub enum RegistrationModeConfig {
    // SignUp with Static Whitelist: users register individually, access controlled by whitelist
    SignUpWithStaticWhitelist {
        whitelist: WhitelistBase,
    },

    // SignUp with Oracle: users register individually, access controlled by Oracle signature
    SignUpWithOracle {
        oracle_pubkey: String,
    },

    // PrePopulated: bulk import users via PreAddNewKey with ZK proof
    PrePopulated {
        pre_deactivate_root: Uint256,
        pre_deactivate_coordinator: PubKey,
    },
}

// Registration Configuration Update
// Used to update registration settings before voting starts
#[cw_serde]
pub struct RegistrationConfigUpdate {
    // Deactivate feature toggle (optional, can be modified anytime before voting starts)
    pub deactivate_enabled: Option<bool>,

    // Voice Credit Mode (optional, can only be modified when num_signups == 0)
    pub voice_credit_mode: Option<VoiceCreditMode>,

    // Registration Mode (optional, can only be modified when num_signups == 0)
    // When switching modes, provide complete configuration for new mode
    pub registration_mode: Option<RegistrationModeConfig>,
}

#[cw_serde]
pub struct Groth16VKeyType {
    pub vk_alpha1: String,
    pub vk_beta_2: String,
    pub vk_gamma_2: String,
    pub vk_delta_2: String,
    pub vk_ic0: String,
    pub vk_ic1: String,
}

#[cw_serde]
pub struct Groth16ProofType {
    pub a: String,
    pub b: String,
    pub c: String,
}

#[cw_serde]
pub enum ExecuteMsg {
    SetRoundInfo {
        round_info: RoundInfo,
    },
    UpdateRegistrationConfig {
        config: RegistrationConfigUpdate,
    },
    SetVoteOptionsMap {
        vote_option_map: Vec<String>,
    },
    SignUp {
        pubkey: PubKey, // user's pubkey
        // Oracle mode parameter (optional for SignUpWithStaticWhitelist mode, required for SignUpWithOracle mode)
        certificate: Option<String>,
        // Amount parameter (optional for Unified VC mode, required for Dynamic VC mode with SignUpWithOracle)
        amount: Option<Uint256>,
    },
    StartProcessPeriod {},
    PublishDeactivateMessage {
        message: MessageData,
        enc_pub_key: PubKey,
    },
    UploadDeactivateMessage {
        deactivate_message: Vec<Vec<Uint256>>,
    },
    ProcessDeactivateMessage {
        size: Uint256,
        new_deactivate_commitment: Uint256,
        new_deactivate_root: Uint256,
        groth16_proof: Groth16ProofType,
    },
    AddNewKey {
        pubkey: PubKey,
        nullifier: Uint256,
        d: [Uint256; 4],
        groth16_proof: Groth16ProofType,
    },
    PreAddNewKey {
        pubkey: PubKey,
        nullifier: Uint256,
        d: [Uint256; 4],
        groth16_proof: Groth16ProofType,
    },
    PublishMessage {
        message: MessageData,
        enc_pub_key: PubKey,
    },
    PublishMessageBatch {
        messages: Vec<MessageData>,
        enc_pub_keys: Vec<PubKey>,
    },
    ProcessMessage {
        new_state_commitment: Uint256,
        groth16_proof: Groth16ProofType,
    },
    StopProcessingPeriod {},
    ProcessTally {
        new_tally_commitment: Uint256,
        groth16_proof: Groth16ProofType,
    },
    StopTallyingPeriod {
        results: Vec<Uint256>,
        salt: Uint256,
    },
    Claim {},
}

#[cw_serde]
pub struct Period {
    pub status: PeriodStatus,
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(Addr)]
    Admin {},

    #[returns(Addr)]
    Operator {},

    #[returns(RoundInfo)]
    GetRoundInfo {},

    #[returns(VotingTime)]
    GetVotingTime {},

    #[returns(Period)]
    GetPeriod {},

    #[returns(Uint256)]
    GetNumSignUp {},

    #[returns(Uint256)]
    GetMsgChainLength {},

    #[returns(Uint256)]
    GetDMsgChainLength {},

    #[returns(Uint256)]
    GetProcessedDMsgCount {},

    #[returns(Uint256)]
    GetProcessedMsgCount {},

    #[returns(Uint256)]
    GetProcessedUserCount {},

    #[returns(Uint256)]
    GetStateTreeRoot {},

    #[returns(Uint256)]
    GetNode { index: Uint256 },

    #[returns(Uint256)]
    GetResult { index: Uint256 },

    #[returns(Uint256)]
    GetAllResult {},

    #[returns(Uint256)]
    GetStateIdxInc { address: Addr },

    #[returns(Uint256)]
    GetVoiceCreditBalance { index: Uint256 },

    #[returns(Uint256)]
    GetVoiceCreditAmount {},

    #[returns(Whitelist)]
    WhiteList {},
    /// Checks permissions of the caller on this proxy.
    /// If CanExecute returns true then a call to `Execute` with the same message,
    /// before any further state changes, should also succeed.
    #[returns(bool)]
    CanSignUp { sender: Addr },

    #[returns(bool)]
    IsWhiteList { sender: Addr },

    #[returns(bool)]
    IsRegister { sender: Addr },

    // #[returns(Uint256)]
    // WhiteBalanceOf { sender: String },
    #[returns(Option<Uint256>)]
    Signuped { pubkey: PubKey },

    #[returns(Vec<String>)]
    VoteOptionMap {},

    #[returns(Uint256)]
    MaxVoteOptions {},

    #[returns(Uint256)]
    QueryCircuitType {},

    #[returns(Uint256)]
    QueryCertSystem {},

    #[returns(Uint256)]
    QueryPreDeactivateRoot {},

    #[returns(Option<Uint256>)]
    QueryPreDeactivateCoordinatorHash {},

    #[returns(DelayRecords)]
    GetDelayRecords {},

    #[returns(TallyDelayInfo)]
    GetTallyDelay {},

    #[returns(Option<String>)]
    QueryOracleWhitelistConfig {},

    #[returns(bool)]
    CanSignUpWithOracle { pubkey: PubKey, certificate: String },

    #[returns(Uint256)]
    WhiteBalanceOf { pubkey: PubKey, certificate: String },

    #[returns(Uint256)]
    QueryCurrentStateCommitment {},

    #[returns(Uint256)]
    GetCoordinatorHash {},

    #[returns(Uint256)]
    GetMsgHash { index: Uint256 },

    #[returns(Uint256)]
    GetCurrentDeactivateCommitment {},

    #[returns(u64)]
    GetPollId {},

    #[returns(bool)]
    GetDeactivateEnabled {},

    #[returns(RegistrationConfigInfo)]
    GetRegistrationConfig {},
}

// Response type for GetRegistrationConfig query
#[cw_serde]
pub struct RegistrationConfigInfo {
    pub deactivate_enabled: bool,
    pub voice_credit_mode: VoiceCreditMode,
    pub registration_mode: RegistrationMode,
}

#[cw_serde]
pub struct TallyDelayInfo {
    pub delay_seconds: u64,
    pub total_work: u128,
    pub num_sign_ups: Uint256,
    pub msg_chain_length: Uint256,
    pub calculated_hours: u64,
}

#[cw_serde]
pub struct InstantiationData {
    pub caller: Addr,
    pub parameters: MaciParameters,
    pub coordinator: PubKey,
    pub admin: Addr,
    pub operator: Addr,
    pub vote_option_map: Vec<String>,
    pub round_info: RoundInfo,
    pub voting_time: VotingTime,
    pub circuit_type: String,
    pub certification_system: String,
    pub penalty_rate: Uint256,
    pub deactivate_timeout: Timestamp,
    pub tally_timeout: Timestamp,
    pub poll_id: u64,             // Poll ID assigned by Registry
    pub deactivate_enabled: bool, // Deactivate feature enabled/disabled

    // Unified MACI Configuration (for Registry tracking)
    pub voice_credit_mode: String, // Serialized mode for display
    pub registration_mode: String, // Serialized registration mode for display
}
