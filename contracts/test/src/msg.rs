use crate::state::{
    DelayRecords, MaciParameters, MessageData, PeriodStatus, PubKey, RoundInfo, VotingTime,
    Whitelist,
};
use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Uint128, Uint256};

#[cw_serde]
pub struct InstantiateMsg {
    pub parameters: MaciParameters,
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
    SignUp {
        pubkey: PubKey,
    },
    PublishMessage {
        message: MessageData,
        enc_pub_key: PubKey,
    },
    // Gas test messages
    TestSignupNoHash {
        pubkey: PubKey,
    },
    TestSignupWithHash {
        pubkey: PubKey,
    },
    TestPublishMessage {
        message: MessageData,
        enc_pub_key: PubKey,
    },
    // Hash function tests
    TestHash2 {
        data: [Uint256; 2],
    },
    TestHash5 {
        data: [Uint256; 5],
    },
    TestHashUint256 {
        data: Uint256,
    },
    // Multiple hash tests
    TestHashOnce {
        data: [Uint256; 5],
    },
    TestHashMultiple {
        data: [Uint256; 5],
        count: u32,
    },
    TestHashBatch {
        data: Vec<[Uint256; 5]>,
    },
    TestHashComposed {
        data: [Uint256; 5],
        repeat_count: u32,
    },
    /// Batch execute multiple hash operations in a single transaction
    TestBatchHash {
        operations: Vec<HashOperation>,
    },
}

#[cw_serde]
pub enum HashOperation {
    Hash2 {
        data: [Uint256; 2],
    },
    Hash5 {
        data: [Uint256; 5],
    },
    HashUint256 {
        data: Uint256,
    },
    HashComposed {
        data: [Uint256; 5],
        repeat_count: u32,
    },
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

    #[returns(Uint128)]
    QueryTotalFeeGrant {},

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

    // No-hash testing queries
    #[returns(Uint256)]
    GetNumSignUpNoHash {},

    #[returns(Uint256)]
    GetNodeNoHash { index: Uint256 },

    #[returns(Uint256)]
    GetStateTreeRootNoHash {},

    #[returns(Option<Uint256>)]
    SignupedNoHash { pubkey: PubKey },
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
}
