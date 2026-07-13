use cosmwasm_std::{StdError, Uint256};
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Unauthorized")]
    Unauthorized {},

    #[error("Incorrect funds sent: payment must exactly equal the required fee")]
    InsufficientFundsSend {},

    #[error("PeriodError")]
    PeriodError {},

    #[error("Must update from height 0")]
    MustUpdate {},

    #[error("Data error")]
    DataError {},

    #[error("Error verification")]
    ErrorVerificationKey {},

    #[error("Error proof")]
    ErrorProof {},

    #[error("Error public signal")]
    ErrorPublicSignal {},

    #[error("No verification key")]
    NoVerificationKey {},

    #[error("No public signal")]
    NoPublicSignal {},

    #[error("Parse public signal error")]
    ParsePulbicSignalError {},

    #[error("invalid hex format")]
    HexDecodingError {},

    #[error("Invalid vkey")]
    InvalidVKeyError {},

    #[error("Invalid proof, step {step} verify failed")]
    InvalidProof { step: String },

    #[error("whitelist already exist")]
    AlreadySetWhitelist {},

    #[error("already set {time_name} time")]
    AlreadySetVotingTime { time_name: String },

    #[error("The end_time must be greater than the start_time and more than 10 minutes apart.")]
    WrongTimeSet {},

    #[error("round title can not be empty")]
    TitleIsEmpty,

    #[error("this account({difficuty_issuer}) didn't issue difficulty problem")]
    NonPublishDifficulty { difficuty_issuer: String },

    #[error("could not convert into prime field")]
    InvalidPrimeField {},

    #[error("SynthesisError of zk verify")]
    SynthesisError {},

    #[error("still have messages left to process.")]
    MsgLeftProcess {},

    #[error("still have deactivate messages left to process.")]
    DmsgLeftProcess {},

    #[error("still have usertally left to process.")]
    UserTallyLeftProcess {},

    #[error("this new key is already exist.")]
    NewKeyExist,

    #[error("max_vote_options cannot exceed {max_allowed}, current value is {current}.")]
    MaxVoteOptionsExceeded {
        current: Uint256,
        max_allowed: Uint256,
    },

    #[error("max_voter_num cannot exceed {max_allowed}, current value is {current}.")]
    MaxVoterExceeded {
        current: Uint256,
        max_allowed: Uint256,
    },

    #[error("Unsupported circuit type.")]
    UnsupportedCircuitType {},

    #[error("Unsupported certification system.")]
    UnsupportedCertificationSystem {},

    #[error("No matching circuit size.")]
    NotMatchCircuitSize {},

    #[error("User already registered.")]
    UserAlreadyRegistered {},

    #[error("Divisor is zero")]
    DivisorIsZero {},

    #[error("Division by zero")]
    DivisionByZero {},

    #[error("Claim must be after the third day of voting end time")]
    ClaimMustAfterThirdDay {},

    #[error("Value too large")]
    ValueTooLarge {},

    #[error("All funds claimed")]
    AllFundsClaimed {},

    #[error("Maximum number of deactivate messages ({max_deactivate_messages}) has been reached")]
    MaxDeactivateMessagesReached { max_deactivate_messages: Uint256 },

    #[error("Encrypted public key already used")]
    EncPubKeyAlreadyUsed {},

    #[error("Messages and enc_pub_keys length mismatch: messages length is {messages_len}, enc_pub_keys length is {enc_pub_keys_len}")]
    BatchLengthMismatch {
        messages_len: usize,
        enc_pub_keys_len: usize,
    },

    // Oracle whitelist related errors
    #[error("Amount is zero")]
    AmountIsZero {},

    #[error("Oracle whitelist not configured")]
    OracleWhitelistNotConfigured {},

    #[error("Whitelist not configured")]
    WhitelistNotConfigured {},

    #[error("Invalid base64 encoding")]
    InvalidBase64 {},

    #[error("Verification failed")]
    VerificationFailed {},

    #[error("Invalid signature")]
    InvalidSignature {},

    #[error("Already signed up")]
    AlreadySignedUp {},

    #[error("Voting power is zero")]
    VotingPowerIsZero {},

    // Conversion and parsing errors
    #[error("Failed to convert Uint256 to field element: {value}")]
    FieldConversionError { value: String },

    #[error("Failed to parse numeric value: {value}, reason: {reason}")]
    ParseError { value: String, reason: String },

    #[error("Poseidon hash operation failed: {0}")]
    PoseidonError(String),

    #[error("Deactivate feature is disabled")]
    DeactivateDisabled {},

    // Unified MACI configuration errors
    #[error("Certificate is required for Oracle verification mode")]
    CertificateRequired {},

    #[error("Amount is required for Dynamic VC mode")]
    AmountRequired {},

    #[error("Whitelist is required for StaticWhitelist mode")]
    WhitelistRequired {},

    #[error("Oracle pubkey is required for OracleVerified mode")]
    OraclePubkeyRequired {},

    #[error("Invalid whitelist configuration: {reason}")]
    InvalidWhitelistConfig { reason: String },

    #[error("Pre-deactivate coordinator is required for PrePopulated mode")]
    PreDeactivateCoordinatorRequired {},

    #[error("PreAddNewKey can only be called in PrePopulated mode")]
    PreAddNewKeyNotAllowed {},

    // Registration configuration update errors
    #[error("Cannot modify voice credit mode or registration mode after users have registered. Current signups: {current}")]
    ConfigModificationAfterSignup { current: Uint256 },

    #[error("Invalid registration config: {reason}")]
    InvalidRegistrationConfig { reason: String },

    #[error("SignUpWithStaticWhitelist mode only supports a whitelist of up to {max_allowed} voters. For larger scales, use SignUpWithOracle or PrePopulated mode instead.")]
    StaticWhitelistScaleExceeded { max_allowed: Uint256 },

    #[error("State tree is full, cannot register more users")]
    StateTreeFull {},

    #[error("Invalid pubkey: values must be less than the snark scalar field")]
    InvalidPubKey {},

    #[error("Invalid encrypted public key")]
    InvalidEncPubKey {},

    #[error("All deactivate messages have already been processed")]
    AllDeactivateMessagesProcessed {},

    #[error("Batch size exceeds the maximum allowed batch size")]
    BatchSizeOverflow {},

    #[error("All messages have already been processed")]
    AllMessagesProcessed {},

    #[error("All users have already been tallied")]
    AllUsersProcessed {},

    #[error("Not all users have been tallied yet")]
    NotAllUsersProcessed {},

    #[error(
        "Tally commitment mismatch: submitted results do not match the verified tally commitment"
    )]
    TallyCommitmentMismatch {},

    #[error("A round with no signups must finalize with all-zero results")]
    InvalidEmptyRoundResult {},

    // Hybrid MACI + AHE on-chain flow errors
    // `ProcessHybridBatch`'s `actual_count` must exactly equal
    // min(remaining unprocessed messages, HYBRID_BATCH_SIZE) — the contract
    // computes this deterministically so there's exactly one valid batch
    // shape at any point in a (possibly multi-call) processing run.
    #[error("Hybrid batch actual_count mismatch: expected {expected} (min(remaining, batch_size)), got {actual}")]
    HybridBatchNotReady { expected: Uint256, actual: Uint256 },

    #[error("Hybrid batch has already been processed")]
    HybridBatchAlreadyProcessed {},

    #[error(
        "Hybrid aggregate ciphertext must have exactly {expected} option entries, got {actual}"
    )]
    HybridAggLengthMismatch { expected: usize, actual: usize },

    #[error(
        "The submitted coordinator public key does not match the round's registered coordinator"
    )]
    HybridCoordinatorMismatch {},

    #[error("Hybrid batch has not been processed yet, nothing to reveal")]
    HybridNotProcessedYet {},

    #[error("Hybrid tally has already been revealed")]
    HybridTallyAlreadyRevealed {},

    #[error("Hybrid committee AHE public key (Kc) has already been set for this round")]
    HybridKcAlreadySet {},

    #[error("Hybrid committee AHE public key (Kc) has not been set yet; call SetHybridKc first")]
    HybridKcNotSet {},

    #[error("Hybrid AHE ciphertext contains a point that is not on the BabyJubjub curve")]
    HybridInvalidCiphertextPoint {},

    #[error("Hybrid aggregate ciphertext contains a point that is not on the BabyJubjub curve")]
    HybridInvalidAggregatePoint {},

    #[error("Hybrid committee config is invalid: {reason}")]
    HybridCommitteeConfigInvalid { reason: String },

    #[error("vote_option_map length {got} does not match the compiled hybrid circuit's fixed option count {expected}; redeploy with exactly {expected} vote options")]
    HybridVoteOptionMapMismatch { got: usize, expected: usize },

    #[error("This round requires committee confirmation (ConfirmHybridKc); the admin-only SetHybridKc path is disabled")]
    HybridCommitteeConfirmationRequired {},

    #[error("This round has no committee configured; use SetHybridKc instead of ConfirmHybridKc")]
    HybridCommitteeNotConfigured {},

    #[error("Sender is not a member of this round's hybrid committee")]
    HybridNotCommitteeMember {},

    #[error(
        "RevealHybridTally results length mismatch: expected {expected} options, got {actual}"
    )]
    HybridResultsLengthMismatch { expected: usize, actual: usize },

    #[error("RevealHybridTally requires at least one participant share")]
    HybridRevealNoParticipants {},

    #[error(
        "RevealHybridTally participant_pub_keys and participant_indices must have the same length"
    )]
    HybridRevealParticipantLengthMismatch {},

    #[error("RevealHybridTally requires exactly {expected} participant shares (this round's committee threshold), got {actual}")]
    HybridRevealParticipantCountMismatch { expected: usize, actual: usize },

    #[error("RevealHybridTally participant indices must be pairwise distinct")]
    HybridRevealDuplicateParticipant {},

    #[error("RevealHybridTally participant (index, pub_key) pair is not a registered hybrid committee member")]
    HybridRevealUnknownParticipant {},

    #[error("Cannot stop the classic processing period: this round has {remaining} hybrid message(s) left to process via ProcessHybridBatch")]
    HybridMsgLeftProcess { remaining: Uint256 },

    #[error("Cannot stop the classic tallying period: this round's hybrid tally has not been revealed via RevealHybridTally yet")]
    HybridTallyNotYetRevealed {},

    #[error("Hybrid committee threshold ({committee_threshold}) must equal the compiled RevealVerify circuit's threshold ({circuit_threshold})")]
    HybridCommitteeThresholdMismatch {
        committee_threshold: u32,
        circuit_threshold: usize,
    },

    #[error("Hybrid participant public key is not a valid BabyJubjub curve point")]
    HybridInvalidParticipantPubKey {},

    #[error("Arithmetic overflow while updating hybrid round counters")]
    HybridCounterOverflow {},
}
