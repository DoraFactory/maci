#[allow(unused_imports)] // DelayRecords is used by the #[returns] proc-macro attribute
use crate::state::{
    DelayRecords, Groth16VkeyStr, HybridCiphertext, HybridCommitteeConfig, HybridPublishedMessage,
    HybridTally, MaciParameters, MessageData, PeriodStatus, PubKey, RegistrationMode, RoundInfo,
    VoiceCreditMode, VotingTime,
};
use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Timestamp, Uint128, Uint256};

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

    // ── Fee configuration injected by Registry at round creation time ──────────
    pub message_fee: Uint128,
    pub deactivate_fee: Uint128,
    pub signup_fee: Uint128,

    // ── Delay configuration (seconds) injected by Registry ───────────────────
    // tally base delay: covers first 5^int_state_tree_depth-slot batch
    pub base_delay: u64,
    // per-message increment to tally window
    pub message_delay: u64,
    // per-registered-user increment to tally window
    pub signup_delay: u64,
    // operator window to process deactivate messages (from first msg received)
    pub deactivate_delay: u64,

    // ── Hybrid MACI + AHE on-chain flow (optional) ────────────────────────────
    // If set, `SetHybridKc` (admin-only) is disabled and Kc can only be
    // finalized via `ConfirmHybridKc` once `threshold` listed members agree on
    // the same value. If omitted, the legacy admin-only `SetHybridKc` path is
    // used (single-coordinator demos/tests are unaffected).
    #[serde(default)]
    pub hybrid_committee: Option<HybridCommitteeConfig>,
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

    // ── Hybrid MACI + AHE on-chain flow ──────────────────────────────────────
    // Admin-only, one-time setup: bind the threshold committee's AHE public key
    // (Kc) into contract storage. Must be set before any PublishHybridMessage
    // call, since every ballotValidity proof is bound to Kc — without a
    // contract-tracked Kc, the contract has no fixed value to check submitted
    // proofs against.
    SetHybridKc {
        kc: [Uint256; 2],
    },
    // Committee-confirmed alternative to `SetHybridKc`, used when
    // `hybrid_committee` was configured at Instantiate. Each listed committee
    // member calls this (from their own on-chain address — the tx signature
    // itself is the "signature confirming this value") with the SAME `kc`;
    // once `threshold` members have confirmed the same value, it is finalized
    // into `HYBRID_KC` exactly like `SetHybridKc` would. Rejected if no
    // committee is configured, if the sender isn't a listed member, or if Kc
    // has already been finalized.
    ConfirmHybridKc {
        kc: [Uint256; 2],
    },
    // Publish one Hybrid message: a routing envelope (Poseidon-encrypted to the
    // coordinator, format-identical to classic MessageData) plus the separately
    // published AHE ballot ciphertext (per-option, committee-encrypted — the
    // coordinator can never decrypt vote content). Reuses `message_fee` and the
    // classic hash-chain algorithm, but stores into its own hybrid chain so it
    // never interferes with classic PublishMessage/ProcessMessage.
    //
    // Anonymity: the signed-up voter this ballot belongs to is NOT revealed in
    // plaintext any more. `BallotValidityOnchain`'s `stateIdx`/`pubKey` are now
    // private witnesses; the proof instead outputs `nullifier` (an unlinkable-
    // per-round identifier, see `ballotValidity.circom`), which is all the
    // contract ever sees. `coord_pub_key` is the coordinator key the proof used
    // to decrypt-check `routing` in-circuit (see `BallotValidity`'s routing
    // binding); the contract cross-checks it against `COORDINATORHASH` so a
    // prover cannot bind to a fake coordinator. Together with `ballot_proof`,
    // this lets the contract independently verify — via the on-chain
    // `BallotValidityOnchain` circuit — that the ballot is one-hot, within the
    // voter's real Merkle-authenticated voice-credit budget, AND consistent
    // with the SAME `routing` envelope being published here, all WITHOUT ever
    // decrypting the vote content or learning which voter it came from.
    PublishHybridMessage {
        routing: MessageData,
        enc_pub_key: PubKey,
        ciphertext: HybridCiphertext,
        coord_pub_key: [Uint256; 2],
        nullifier: Uint256,
        ballot_proof: Groth16ProofType,
    },
    // Coordinator submits ONE Groth16 proof (from ProcessHybridMessagesOnchain)
    // covering one batch (up to HYBRID_BATCH_SIZE messages) of the hybrid
    // round: it proves the coordinator faithfully decrypted routing + Merkle-
    // authenticated each message's voterPubKey against the live state root
    // (preventing selective censorship) + ran last-write-wins + homomorphically
    // aggregated the (still-sealed) ballots into `new_agg_c1`/`new_agg_c2`,
    // without ever seeing any vote's content.
    //
    // Partial batch + multi-batch chaining: a round's real message count need
    // not be an exact multiple of HYBRID_BATCH_SIZE, and may exceed it — this
    // message can be submitted repeatedly, each call picking up exactly where
    // the previous one left off (tracked by HYBRID_PROCESSED_COUNT), until all
    // published messages are processed. `actual_count` is the number of REAL
    // messages in THIS call's batch (<= HYBRID_BATCH_SIZE, <= remaining
    // unprocessed messages); the circuit pads the rest of its fixed-size
    // batch with unconstrained witnesses gated off by `actual_count` (see
    // `processHybridMessages.circom`'s partial-batch note).
    ProcessHybridBatch {
        coord_pub_key: [Uint256; 2],
        actual_count: Uint256,
        new_agg_c1: Vec<[Uint256; 2]>,
        new_agg_c2: Vec<[Uint256; 2]>,
        /// New nonce tree root after this batch (circuit output). The contract
        /// stores it and passes it as `currentNonceRoot` to the NEXT batch's
        /// proof, enforcing cross-batch LWW nonce consistency.
        new_nonce_state_root: Uint256,
        groth16_proof: Groth16ProofType,
    },
    // Threshold committee reveal: T participants each contributed a partial
    // decryption share of the final aggregate, and the submitted
    // `reveal_proof` (RevealVerifyOnchain) proves those T shares Lagrange-
    // combine into a decryption factor consistent with `results`/`salt` —
    // i.e. that `results` really is what the on-chain aggregate ciphertext
    // decrypts to, not just whatever a coordinator/committee member claims.
    // `participant_pub_keys`/`participant_indices` identify WHICH T
    // registered `HybridCommitteeConfig` members' shares were used (checked
    // against the committee roster below; the proof only attests the
    // decryption ARITHMETIC for whichever pairs are supplied here).
    RevealHybridTally {
        results: Vec<Uint256>,
        salt: Uint256,
        participant_pub_keys: Vec<PubKey>,
        participant_indices: Vec<Uint256>,
        reveal_proof: Groth16ProofType,
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

    #[returns(Vec<Uint256>)]
    GetAllResults {},

    #[returns(Uint256)]
    GetVoiceCreditBalance { index: Uint256 },

    #[returns(Uint256)]
    GetVoiceCreditAmount {},

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

    /// Unified registration status by mode: can_sign_up and balance (Static whitelist or Oracle).
    #[returns(RegistrationStatus)]
    QueryRegistrationStatus {
        /// For SignUpWithStaticWhitelist: provide sender.
        sender: Option<Addr>,
        /// For SignUpWithOracle: provide pubkey and certificate.
        pubkey: Option<PubKey>,
        certificate: Option<String>,
        /// For SignUpWithOracle + Dynamic VoiceCreditMode: the amount included in the signed certificate.
        amount: Option<Uint256>,
    },

    // ── Aggregated fee/delay config getters ──────────────────────────────────
    #[returns(FeeConfigResponse)]
    GetFeeConfig {},

    #[returns(DelayConfigResponse)]
    GetDelayConfig {},

    /// Returns the stored Groth16 verifying keys for all circuits.
    #[returns(VkeysResponse)]
    GetVkeys {},

    /// Hybrid MACI + AHE: verify a voter's on-chain ballotValidity proof.
    /// Reconstructs the single SHA256 input hash from the committed public values
    /// (Kc, stateRoot, coordPubKey, pollId, routingCommitment, aheCommitment,
    /// nullifier) and runs the Groth16 verifier with the hybrid ballot verifying
    /// key. Returns true iff the proof is valid — i.e. the voter's voice-credit
    /// budget is Merkle-authenticated against stateRoot AND the ballot is bound
    /// to the given routing envelope, without revealing the vote OR which voter
    /// it belongs to.
    #[returns(bool)]
    VerifyHybridBallot {
        kc: [Uint256; 2],
        state_root: Uint256,
        coord_pub_key: [Uint256; 2],
        poll_id: Uint256,
        routing_commitment: Uint256,
        ahe_commitment: Uint256,
        nullifier: Uint256,
        proof: Groth16ProofType,
    },

    // ── Hybrid MACI + AHE on-chain flow ──────────────────────────────────────
    /// The threshold committee's AHE public key (Kc), if `SetHybridKc` has been
    /// called yet. Every ballotValidity proof is bound to this value.
    #[returns(Option<[Uint256; 2]>)]
    GetHybridKc {},

    /// Number of Hybrid messages published so far (routing-envelope hash chain).
    #[returns(Uint256)]
    GetHybridMsgChainLength {},

    /// A published Hybrid message at `index` (1-based, like classic GetMsgHash),
    /// i.e. the routing envelope + enc pub key + AHE ciphertext anyone can use to
    /// independently rebuild the ProcessHybridBatch witness.
    #[returns(Option<HybridPublishedMessage>)]
    GetHybridMessage { index: Uint256 },

    /// Whether ALL published hybrid messages have been processed yet (i.e.
    /// `GetHybridProcessedCount == GetHybridMsgChainLength`). A round may take
    /// several `ProcessHybridBatch` calls to reach this.
    #[returns(bool)]
    GetHybridProcessed {},

    /// Number of published hybrid messages processed so far, chained across
    /// (possibly multiple) `ProcessHybridBatch` calls.
    #[returns(Uint256)]
    GetHybridProcessedCount {},

    /// The current running homomorphic aggregate ciphertext (still sealed; only
    /// the threshold committee holding Kc's shares can decrypt it), one point per
    /// vote option. Before ProcessHybridBatch this is the identity aggregate.
    #[returns(HybridAggResponse)]
    GetHybridAggCiphertext {},

    /// The revealed hybrid tally (plaintext results + salt), if any.
    #[returns(Option<HybridTally>)]
    GetHybridTally {},

    /// The committee roster + threshold configured at Instantiate, if any.
    /// `None` means this round uses the legacy admin-only `SetHybridKc` path.
    #[returns(Option<HybridCommitteeConfig>)]
    GetHybridCommittee {},

    /// Per-member Kc confirmations submitted so far via `ConfirmHybridKc`
    /// (only meaningful once a committee is configured and before Kc is
    /// finalized; confirmations aren't cleared after finalization).
    #[returns(Vec<HybridKcConfirmationEntry>)]
    GetHybridKcConfirmations {},

    /// Current nonce tree root for cross-batch LWW tracking.
    /// Returns the all-zero tree root before the first ProcessHybridBatch call,
    /// and evolves with each successful call thereafter.
    #[returns(Uint256)]
    GetHybridNonceStateRoot {},
}

#[cw_serde]
pub struct HybridKcConfirmationEntry {
    pub addr: Addr,
    pub kc: [Uint256; 2],
}

#[cw_serde]
pub struct HybridAggResponse {
    pub agg_c1: Vec<[Uint256; 2]>,
    pub agg_c2: Vec<[Uint256; 2]>,
}

// Response type for GetRegistrationConfig query
#[cw_serde]
pub struct RegistrationConfigInfo {
    pub deactivate_enabled: bool,
    pub voice_credit_mode: VoiceCreditMode,
    pub registration_mode: RegistrationMode,
}

#[cw_serde]
pub struct RegistrationStatus {
    pub can_sign_up: bool,
    /// Whether the user has already completed sign-up.
    /// - StaticWhitelist: checked by sender address via WHITELIST
    /// - Oracle:          checked by pubkey via ORACLE_WHITELIST
    /// - PrePopulated:    checked by pubkey via SIGNUPED
    pub is_register: bool,
    pub balance: Uint256,
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
pub struct FeeConfigResponse {
    pub message_fee: Uint128,
    pub deactivate_fee: Uint128,
    pub signup_fee: Uint128,
}

#[cw_serde]
pub struct VkeysResponse {
    pub process_vkey: Groth16VkeyStr,
    pub tally_vkey: Groth16VkeyStr,
    pub deactivate_vkey: Groth16VkeyStr,
    pub add_key_vkey: Groth16VkeyStr,
}

#[cw_serde]
pub struct DelayConfigResponse {
    pub base_delay: u64,
    pub message_delay: u64,
    pub signup_delay: u64,
    pub deactivate_delay: u64,
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
    pub voice_credit_mode: VoiceCreditMode,
    pub registration_mode: RegistrationMode,
}
