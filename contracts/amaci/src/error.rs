use cosmwasm_std::{StdError, Uint256};
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Unauthorized")]
    Unauthorized {},

    #[error("Insufficient funds sent")]
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

    #[error("Fee Grant already exists")]
    FeeGrantAlreadyExists,

    #[error("Fee Grant is not exists")]
    FeeGrantIsNotExists,

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
}
