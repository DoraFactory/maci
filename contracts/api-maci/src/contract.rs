use crate::circuit_params::{calculate_circuit_params, match_oracle_vkeys};
use crate::error::ContractError;
use crate::groth16_parser::{parse_groth16_proof, parse_groth16_vkey};
use crate::msg::{
    ExecuteMsg, Groth16ProofType, InstantiateMsg, InstantiationData, PlonkProofType, QueryMsg,
};
use crate::plonk_parser::{parse_plonk_proof, parse_plonk_vkey};
use crate::state::{
    Admin, Groth16ProofStr, MessageData, OracleWhitelistConfig, Period, PeriodStatus,
    PlonkProofStr, PubKey, QuinaryTreeRoot, RoundInfo, StateLeaf, VotingPowerConfig,
    VotingPowerMode, VotingTime, WhitelistConfig, ADMIN, CERTSYSTEM, CIRCUITTYPE, COORDINATORHASH,
    CURRENT_STATE_COMMITMENT, CURRENT_TALLY_COMMITMENT, FEEGRANTS, GROTH16_PROCESS_VKEYS,
    GROTH16_TALLY_VKEYS, LEAF_IDX_0, MACIPARAMETERS, MAX_LEAVES_COUNT, MAX_VOTE_OPTIONS,
    MAX_WHITELIST_NUM, MSG_CHAIN_LENGTH, MSG_HASHES, NODES, NUMSIGNUPS, ORACLE_WHITELIST_CONFIG,
    PERIOD, PLONK_PROCESS_VKEYS, PLONK_TALLY_VKEYS, PROCESSED_MSG_COUNT, PROCESSED_USER_COUNT,
    QTR_LIB, RESULT, ROUNDINFO, STATEIDXINC, TOTAL_RESULT, USED_ENC_PUB_KEYS, VOICECREDITBALANCE,
    VOTEOPTIONMAP, VOTINGTIME, WHITELIST, ZEROS,
};
use sha2::{Digest as ShaDigest, Sha256};

use pairing_ce::bn256::Bn256;
use pairing_ce::bn256::Bn256 as MBn256;

use bellman_ce::plonk::better_cs::cs::PlonkCsWidth4WithNextStepParams;

#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;

use cosmwasm_std::{
    attr, coins, to_json_binary, Addr, BankMsg, Binary, Deps, DepsMut, Env, MessageInfo, Reply,
    Response, StdResult, Uint128, Uint256,
};

use maci_utils::{hash2, hash5, hash_256_uint256_list, uint256_from_hex_string};

use bellman_ce::plonk::better_cs::verifier::verify as plonk_verify;
use bellman_ce::plonk::commitments::transcript::keccak_transcript::RollingKeccakTranscript;
use bellman_ce_verifier::{prepare_verifying_key, verify_proof as groth16_verify};

use ff_ce::PrimeField as Fr;

use hex;

use serde_json;

// Pre-computed constants to avoid repeated calculations
const SNARK_SCALAR_FIELD_HEX: &str =
    "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001";

// Pre-computed maximum values corresponding to circuit scales, avoiding repeated exponentiation
const CIRCUIT_2_1_1_5_MAX_VOTERS: u128 = 25; // 5^2
const CIRCUIT_4_2_2_25_MAX_VOTERS: u128 = 625; // 5^4
const CIRCUIT_6_3_3_125_MAX_VOTERS: u128 = 15625; // 5^6

const CIRCUIT_2_1_1_5_MAX_OPTIONS: u128 = 5; // 5^1
const CIRCUIT_4_2_2_25_MAX_OPTIONS: u128 = 25; // 5^2
const CIRCUIT_6_3_3_125_MAX_OPTIONS: u128 = 125; // 5^3

// Fast function to calculate circuit maximum values, avoiding string conversions and exponentiation
fn get_circuit_max_voters(state_tree_depth: &Uint256) -> u128 {
    if *state_tree_depth == Uint256::from_u128(2) {
        CIRCUIT_2_1_1_5_MAX_VOTERS
    } else if *state_tree_depth == Uint256::from_u128(4) {
        CIRCUIT_4_2_2_25_MAX_VOTERS
    } else if *state_tree_depth == Uint256::from_u128(6) {
        CIRCUIT_6_3_3_125_MAX_VOTERS
    } else {
        0 // Unsupported scale
    }
}

/// Convert a contract address to Uint256 format
/// This function takes the address bytes and converts them to a Uint256
fn address_to_uint256(address: &Addr) -> Uint256 {
    let address_bytes = address.as_bytes();

    // Use SHA256 hash to convert the address to a fixed-length 32-byte format
    let mut hasher = Sha256::new();
    hasher.update(address_bytes);
    let hash_result = hasher.finalize();

    // Convert the hash bytes to Uint256
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(&hash_result[..]);

    // Convert bytes to Uint256 (big-endian)
    let mut uint256_bytes = [0u8; 32];
    for (i, &byte) in bytes.iter().enumerate() {
        uint256_bytes[31 - i] = byte; // Reverse for little-endian to big-endian conversion
    }

    Uint256::from_be_bytes(uint256_bytes)
}

fn get_circuit_max_vote_options(vote_option_tree_depth: &Uint256) -> u128 {
    if *vote_option_tree_depth == Uint256::from_u128(1) {
        CIRCUIT_2_1_1_5_MAX_OPTIONS
    } else if *vote_option_tree_depth == Uint256::from_u128(2) {
        CIRCUIT_4_2_2_25_MAX_OPTIONS
    } else if *vote_option_tree_depth == Uint256::from_u128(3) {
        CIRCUIT_6_3_3_125_MAX_OPTIONS
    } else {
        0 // Unsupported scale
    }
}

// Cache snark_scalar_field to avoid repeated calculations
fn get_snark_scalar_field() -> Uint256 {
    uint256_from_hex_string(SNARK_SCALAR_FIELD_HEX)
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    // Clone necessary data for InstantiationData at the beginning
    let caller = info.sender.clone();
    let coordinator = msg.coordinator.clone();
    let max_voters = msg.max_voters;
    let vote_option_map = msg.vote_option_map.clone();
    let round_info = msg.round_info.clone();
    let voting_time = msg.voting_time.clone();
    let circuit_type = msg.circuit_type;
    let certification_system = msg.certification_system;
    let whitelist_backend_pubkey = msg.whitelist_backend_pubkey.clone();
    let whitelist_voting_power_args = msg.whitelist_voting_power_args.clone();

    // Calculate fee_grant_amount from the sent funds
    let fee_grant_amount = info
        .funds
        .iter()
        .find(|coin| coin.denom == "peaka") // Or use appropriate token name
        .map(|coin| coin.amount)
        .unwrap_or_else(|| Uint128::zero());

    // Create an admin with the sender address
    let admin = Admin {
        admin: info.sender.clone(),
    };
    ADMIN.save(deps.storage, &admin)?;

    // Calculate appropriate circuit parameters based on max_voters and max_vote_options
    let max_vote_options = msg.vote_option_map.len() as u128;
    let parameters = calculate_circuit_params(msg.max_voters, max_vote_options)?;
    // Save the MACI parameters to storage
    MACIPARAMETERS.save(deps.storage, &parameters)?;

    // Save the qtr_lib value to storage
    let qtr_lab = QuinaryTreeRoot {
        zeros: [
            Uint256::from_u128(0u128),
            uint256_from_hex_string(
                "2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc",
            ),
            uint256_from_hex_string(
                "2a956d37d8e73692877b104630a08cc6840036f235f2134b0606769a369d85c1",
            ),
            uint256_from_hex_string(
                "2f9791ba036a4148ff026c074e713a4824415530dec0f0b16c5115aa00e4b825",
            ),
            uint256_from_hex_string(
                "2c41a7294c7ef5c9c5950dc627c55a00adb6712548bcbd6cd8569b1f2e5acc2a",
            ),
            uint256_from_hex_string(
                "2594ba68eb0f314eabbeea1d847374cc2be7965944dec513746606a1f2fadf2e",
            ),
            uint256_from_hex_string(
                "5c697158c9032bfd7041223a7dba696396388129118ae8f867266eb64fe7636",
            ),
            uint256_from_hex_string(
                "272b3425fcc3b2c45015559b9941fde27527aab5226045bf9b0a6c1fe902d601",
            ),
            uint256_from_hex_string(
                "268d82cc07023a1d5e7c987cbd0328b34762c9ea21369bea418f08b71b16846a",
            ),
        ],
    };
    // Save the qtr_lib value to storage
    QTR_LIB.save(deps.storage, &qtr_lab)?;

    const CIRCUIT_TYPE_1P1V: u128 = 0; // one person one vote
    const CIRCUIT_TYPE_QV: u128 = 1; // quadratic voting

    if msg.circuit_type == Uint256::from_u128(CIRCUIT_TYPE_1P1V)
        || msg.circuit_type == Uint256::from_u128(CIRCUIT_TYPE_QV)
    {
        CIRCUITTYPE.save(deps.storage, &msg.circuit_type)?;
    } else {
        return Err(ContractError::UnsupportedCircuitType {});
    }

    // Oracle MACI only supports groth16
    if msg.certification_system == Uint256::from_u128(0u128) {
        // groth16 - match the corresponding vkey based on calculated parameters
        let vkey = match_oracle_vkeys(&parameters)?;
        GROTH16_PROCESS_VKEYS.save(deps.storage, &vkey.process_vkey)?;
        GROTH16_TALLY_VKEYS.save(deps.storage, &vkey.tally_vkey)?;
    } else {
        return Err(ContractError::UnsupportedCertificationSystem {});
    };

    CERTSYSTEM.save(deps.storage, &msg.certification_system)?;

    // Compute the coordinator hash from the coordinator values in the message
    let coordinator_hash = hash2([msg.coordinator.x, msg.coordinator.y]);
    COORDINATORHASH.save(deps.storage, &coordinator_hash)?;

    // Compute the maximum number of leaves based on the state tree depth (optimization: use pre-computed values directly)
    let max_leaves_count = Uint256::from_u128(get_circuit_max_voters(&parameters.state_tree_depth));
    MAX_LEAVES_COUNT.save(deps.storage, &max_leaves_count)?;

    // Calculate the index of the first leaf in the tree
    let leaf_idx0 = (max_leaves_count - Uint256::from_u128(1u128)) / Uint256::from_u128(4u128);
    LEAF_IDX_0.save(deps.storage, &leaf_idx0)?;

    NODES.save(
        deps.storage,
        Uint256::from_u128(0u128).to_be_bytes().to_vec(),
        &Uint256::from_u128(0u128),
    )?;

    // Define an array of zero values
    let zeros: [Uint256; 10] = [
        uint256_from_hex_string("2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc"),
        //     "14655542659562014735865511769057053982292279840403315552050801315682099828156",
        uint256_from_hex_string("2a956d37d8e73692877b104630a08cc6840036f235f2134b0606769a369d85c1"),
        //     "19261153649140605024552417994922546473530072875902678653210025980873274131905",
        uint256_from_hex_string("2f9791ba036a4148ff026c074e713a4824415530dec0f0b16c5115aa00e4b825"),
        //     "21526503558325068664033192388586640128492121680588893182274749683522508994597",
        uint256_from_hex_string("2c41a7294c7ef5c9c5950dc627c55a00adb6712548bcbd6cd8569b1f2e5acc2a"),
        //     "20017764101928005973906869479218555869286328459998999367935018992260318153770",
        uint256_from_hex_string("2594ba68eb0f314eabbeea1d847374cc2be7965944dec513746606a1f2fadf2e"),
        //     "16998355316577652097112514691750893516081130026395813155204269482715045879598",
        uint256_from_hex_string("5c697158c9032bfd7041223a7dba696396388129118ae8f867266eb64fe7636"),
        //     "2612442706402737973181840577010736087708621987282725873936541279764292204086",
        uint256_from_hex_string("272b3425fcc3b2c45015559b9941fde27527aab5226045bf9b0a6c1fe902d601"),
        //     "17716535433480122581515618850811568065658392066947958324371350481921422579201",
        uint256_from_hex_string("268d82cc07023a1d5e7c987cbd0328b34762c9ea21369bea418f08b71b16846a"),
        //     "17437916409890180001398333108882255895598851862997171508841759030332444017770",
        uint256_from_hex_string("2e002d67c30ee0a2bd5fdecc4fb81646ecd6eb0746f5ff2d9b1d1b522a4a3f68"),
        //      "20806704410832383274034364623685369279680495689837539882650535326035351322472"
        uint256_from_hex_string("f14c3fb900b66f523694106f7fc3cbec1f5eee571f047a9eb05bef717d3e064"),
        //      "6821382292698461711184253213986441870942786410912797736722948342942530789476"
    ];
    ZEROS.save(deps.storage, &zeros)?;

    // Save initial values for message hash, message chain length, processed message count, current tally commitment,
    // processed user count, and number of signups to storage
    MSG_HASHES.save(
        deps.storage,
        Uint256::from_u128(0u128).to_be_bytes().to_vec(),
        &Uint256::from_u128(0u128),
    )?;
    MSG_CHAIN_LENGTH.save(deps.storage, &Uint256::from_u128(0u128))?;
    PROCESSED_MSG_COUNT.save(deps.storage, &Uint256::from_u128(0u128))?;
    CURRENT_TALLY_COMMITMENT.save(deps.storage, &Uint256::from_u128(0u128))?;
    PROCESSED_USER_COUNT.save(deps.storage, &Uint256::from_u128(0u128))?;
    NUMSIGNUPS.save(deps.storage, &Uint256::from_u128(0u128))?;
    // MAX_VOTE_OPTIONS.save(deps.storage, &msg.max_vote_options)?;

    // let mut vote_option_map: Vec<String> = Vec::new();
    // for _ in 0..msg.max_vote_options.to_string().parse().unwrap() {
    //     vote_option_map.push(String::new());
    // }
    // Calculate maximum vote options based on circuit parameters (optimization: use pre-computed values)
    let circuit_max_vote_options = get_circuit_max_vote_options(&parameters.vote_option_tree_depth);
    if max_vote_options > circuit_max_vote_options {
        return Err(ContractError::VoteOptionsExceedLimit {
            max_options: circuit_max_vote_options as u8,
        });
    }
    VOTEOPTIONMAP.save(deps.storage, &msg.vote_option_map)?;
    // Save the maximum vote options
    MAX_VOTE_OPTIONS.save(deps.storage, &Uint256::from_u128(max_vote_options))?;
    // let res = Response::new()
    //     .add_attribute("action", "set_vote_option")
    //     .add_attribute("vote_option_map", format!("{:?}", vote_option_map))
    //     .add_attribute("max_vote_options", max_vote_options.to_string());

    // VOTEOPTIONMAP.save(deps.storage, &vote_option_map)?;
    ROUNDINFO.save(deps.storage, &msg.round_info)?;
    MAX_WHITELIST_NUM.save(deps.storage, &0u128)?;

    FEEGRANTS.save(deps.storage, &fee_grant_amount)?;

    // Validate voting time
    if msg.voting_time.start_time >= msg.voting_time.end_time {
        return Err(ContractError::WrongTimeSet {});
    }

    VOTINGTIME.save(deps.storage, &msg.voting_time)?;
    let whitelist_backend_pubkey_binary = Binary::from_base64(&msg.whitelist_backend_pubkey)
        .map_err(|_| ContractError::InvalidBase64 {})?;

    let oracle_whitelist_config = OracleWhitelistConfig {
        backend_pubkey: whitelist_backend_pubkey_binary,
        voting_power_mode: msg.whitelist_voting_power_args.mode.clone(),
        slope: msg.whitelist_voting_power_args.slope,
        threshold: msg.whitelist_voting_power_args.threshold,
    };
    ORACLE_WHITELIST_CONFIG.save(deps.storage, &oracle_whitelist_config)?;

    // Create a period struct with the initial status set to Voting
    let period = Period {
        status: PeriodStatus::Pending,
    };

    // Save the initial period to storage
    PERIOD.save(deps.storage, &period)?;

    // Create InstantiationData for SaaS contract to use in reply
    let instantiation_data = InstantiationData {
        caller,
        parameters: parameters.clone(),
        coordinator,
        max_voters,
        vote_option_map,
        round_info,
        voting_time,
        circuit_type: if circuit_type == Uint256::from_u128(0u128) {
            "0".to_string() // 1p1v
        } else {
            "1".to_string() // qv
        },
        certification_system: if certification_system == Uint256::from_u128(0u128) {
            "groth16".to_string()
        } else {
            "plonk".to_string()
        },
        whitelist_backend_pubkey,
        whitelist_voting_power_args,
    };

    Ok(Response::default()
        .add_attribute("action", "instantiate")
        .add_attribute("state_tree_depth", parameters.state_tree_depth.to_string())
        .add_attribute(
            "int_state_tree_depth",
            parameters.int_state_tree_depth.to_string(),
        )
        .add_attribute(
            "vote_option_tree_depth",
            parameters.vote_option_tree_depth.to_string(),
        )
        .add_attribute(
            "message_batch_size",
            parameters.message_batch_size.to_string(),
        )
        .set_data(to_json_binary(&instantiation_data)?))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::SetRoundInfo { round_info } => {
            execute_set_round_info(deps, env, info, round_info)
        }
        ExecuteMsg::SetVoteOptionsMap { vote_option_map } => {
            execute_set_vote_options_map(deps, env, info, vote_option_map)
        }
        ExecuteMsg::SignUp {
            pubkey,
            amount,
            certificate,
        } => execute_sign_up(deps, env, info, pubkey, amount, certificate),
        ExecuteMsg::PublishMessage {
            message,
            enc_pub_key,
        } => execute_publish_message(deps, env, info, message, enc_pub_key),
        ExecuteMsg::PublishMessageBatch {
            messages,
            enc_pub_keys,
        } => execute_publish_message_batch(deps, env, info, messages, enc_pub_keys),
        ExecuteMsg::StartProcessPeriod {} => execute_start_process_period(deps, env, info),
        ExecuteMsg::ProcessMessage {
            new_state_commitment,
            groth16_proof,
            plonk_proof,
        } => execute_process_message(
            deps,
            env,
            info,
            new_state_commitment,
            groth16_proof,
            plonk_proof,
        ),
        ExecuteMsg::StopProcessingPeriod {} => execute_stop_processing_period(deps, env, info),
        ExecuteMsg::ProcessTally {
            new_tally_commitment,
            groth16_proof,
            plonk_proof,
        } => execute_process_tally(
            deps,
            env,
            info,
            new_tally_commitment,
            groth16_proof,
            plonk_proof,
        ),
        ExecuteMsg::StopTallyingPeriod { results, salt } => {
            execute_stop_tallying_period(deps, env, info, results, salt)
        }
        ExecuteMsg::Bond {} => execute_bond(deps, env, info),
        ExecuteMsg::Withdraw { amount } => execute_withdraw(deps, env, info, amount),
    }
}

pub fn execute_set_round_info(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    round_info: RoundInfo,
) -> Result<Response, ContractError> {
    if !can_execute(deps.as_ref(), info.sender.as_ref())? {
        Err(ContractError::Unauthorized {})
    } else {
        if round_info.title == "" {
            return Err(ContractError::TitleIsEmpty {});
        }

        ROUNDINFO.save(deps.storage, &round_info)?;

        let mut attributes = vec![attr("action", "set_round_info")];
        attributes.push(attr("title", round_info.title));

        if round_info.description != "" {
            attributes.push(attr("description", round_info.description))
        }

        if round_info.link != "" {
            attributes.push(attr("link", round_info.link))
        }

        Ok(Response::new().add_attributes(attributes))
    }
}

// in pending
pub fn execute_set_vote_options_map(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    vote_option_map: Vec<String>,
) -> Result<Response, ContractError> {
    let period = PERIOD.load(deps.storage)?;

    if period.status != PeriodStatus::Pending {
        return Err(ContractError::PeriodError {});
    }

    let voting_time: VotingTime = VOTINGTIME.load(deps.storage)?;

    if env.block.time >= voting_time.start_time {
        return Err(ContractError::PeriodError {});
    }
    // } else {
    //     // Check if the period status is Pending
    //     if period.status != PeriodStatus::Pending {
    //         return Err(ContractError::PeriodError {});
    //     }
    // }

    if !can_execute(deps.as_ref(), info.sender.as_ref())? {
        Err(ContractError::Unauthorized {})
    } else {
        let max_vote_options = vote_option_map.len() as u128;
        // Calculate maximum vote options based on current circuit parameters (optimization: use pre-computed values)
        let parameters = MACIPARAMETERS.load(deps.storage)?;
        let circuit_max_vote_options =
            get_circuit_max_vote_options(&parameters.vote_option_tree_depth);
        if max_vote_options > circuit_max_vote_options {
            return Err(ContractError::VoteOptionsExceedLimit {
                max_options: circuit_max_vote_options as u8,
            });
        }
        VOTEOPTIONMAP.save(deps.storage, &vote_option_map)?;
        // Save the maximum vote options
        MAX_VOTE_OPTIONS.save(deps.storage, &Uint256::from_u128(max_vote_options))?;
        let res = Response::new()
            .add_attribute("action", "set_vote_option")
            .add_attribute("vote_option_map", format!("{:?}", vote_option_map))
            .add_attribute("max_vote_options", max_vote_options.to_string());
        Ok(res)
    }
}

// in voting
pub fn execute_sign_up(
    mut deps: DepsMut,
    env: Env,
    info: MessageInfo,
    pubkey: PubKey,
    amount: Uint256,
    certificate: String,
) -> Result<Response, ContractError> {
    let voting_time = VOTINGTIME.load(deps.storage)?;
    check_voting_time(env.clone(), voting_time)?;

    if amount == Uint256::from_u128(0u128) {
        return Err(ContractError::AmountIsZero {});
    }

    // Convert contract address to uint256 format
    let contract_address_uint256 = address_to_uint256(&env.contract.address);

    let oracle_whitelist_config = ORACLE_WHITELIST_CONFIG.load(deps.storage)?;
    let whitelist_backend_pubkey = oracle_whitelist_config.backend_pubkey;

    let payload = serde_json::json!({
        "amount": amount.to_string(),
        "contract_address": contract_address_uint256.to_string(),
        "pubkey_x": pubkey.x.to_string(),
        "pubkey_y": pubkey.y.to_string(),
    });

    let msg = payload.to_string().into_bytes();

    let hash = Sha256::digest(&msg);

    let certificate_binary =
        Binary::from_base64(&certificate).map_err(|_| ContractError::InvalidBase64 {})?;
    let verify_result = deps
        .api
        .secp256k1_verify(
            hash.as_ref(),
            certificate_binary.as_slice(),
            whitelist_backend_pubkey.as_slice(),
        )
        .map_err(|_| ContractError::VerificationFailed {})?;
    if !verify_result {
        return Err(ContractError::InvalidSignature {});
    }

    if WHITELIST.has(
        deps.storage,
        &(
            pubkey.x.to_be_bytes().to_vec(),
            pubkey.y.to_be_bytes().to_vec(),
        ),
    ) {
        return Err(ContractError::AlreadySignedUp {});
    }

    let voting_power = calculate_voting_power(
        amount,
        &VotingPowerConfig {
            mode: oracle_whitelist_config.voting_power_mode,
            slope: oracle_whitelist_config.slope,
            threshold: oracle_whitelist_config.threshold,
        },
    );

    if voting_power == Uint256::from_u128(0u128) {
        return Err(ContractError::VotingPowerIsZero {});
    }

    let mut num_sign_ups = NUMSIGNUPS.load(deps.storage)?;
    // Calculate maximum voters based on circuit parameters (optimization: use pre-computed values and reduce storage reads)
    let parameters = MACIPARAMETERS.load(deps.storage)?;
    let circuit_max_voters = get_circuit_max_voters(&parameters.state_tree_depth);
    if num_sign_ups + Uint256::from_u128(1) > Uint256::from_u128(circuit_max_voters) {
        return Err(ContractError::MaxVotersReached {
            max_voters: circuit_max_voters,
        });
    }

    let max_leaves_count = MAX_LEAVES_COUNT.load(deps.storage)?;

    // Load the scalar field value (optimization: use cached values)
    let snark_scalar_field = get_snark_scalar_field();

    // Check if the number of sign-ups is less than the maximum number of leaves
    assert!(num_sign_ups < max_leaves_count, "full");
    // Check if the pubkey values are within the allowed range
    assert!(
        pubkey.x < snark_scalar_field && pubkey.y < snark_scalar_field,
        "MACI: pubkey values should be less than the snark scalar field"
    );

    // Create a state leaf with the provided pubkey and amount (optimization: avoid unnecessary cloning)
    let state_leaf = StateLeaf {
        pub_key: pubkey.clone(),
        voice_credit_balance: voting_power,
        vote_option_tree_root: Uint256::from_u128(0),
        nonce: Uint256::from_u128(0),
    }
    .hash_state_leaf();

    let state_index = num_sign_ups;
    state_enqueue(&mut deps, state_leaf)?;
    num_sign_ups += Uint256::from_u128(1u128);

    STATEIDXINC.save(deps.storage, &info.sender, &num_sign_ups)?;
    VOICECREDITBALANCE.save(
        deps.storage,
        state_index.to_be_bytes().to_vec(),
        &voting_power,
    )?;
    NUMSIGNUPS.save(deps.storage, &num_sign_ups)?;

    let white_curr = WhitelistConfig {
        balance: voting_power,
        is_register: true,
    };
    WHITELIST.save(
        deps.storage,
        &(
            pubkey.x.to_be_bytes().to_vec(),
            pubkey.y.to_be_bytes().to_vec(),
        ),
        &white_curr,
    )?;

    Ok(Response::new()
        .add_attribute("action", "sign_up")
        .add_attribute("state_idx", state_index.to_string())
        .add_attribute(
            "pubkey",
            format!("{:?},{:?}", pubkey.x.to_string(), pubkey.y.to_string()),
        )
        .add_attribute("balance", voting_power.to_string()))
}

// in voting
pub fn execute_publish_message(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    message: MessageData,
    enc_pub_key: PubKey,
) -> Result<Response, ContractError> {
    let voting_time = VOTINGTIME.load(deps.storage)?;
    check_voting_time(env, voting_time)?;

    // Load the scalar field value (optimization: use cached values)
    let snark_scalar_field = get_snark_scalar_field();

    // Check if the encrypted public key is valid
    if enc_pub_key.x != Uint256::from_u128(0u128)
        && enc_pub_key.y != Uint256::from_u128(1u128)
        && enc_pub_key.x < snark_scalar_field
        && enc_pub_key.y < snark_scalar_field
    {
        // Check if enc_pub_key has already been used
        let pubkey_storage_key = generate_pubkey_storage_key(&enc_pub_key);
        if USED_ENC_PUB_KEYS.has(deps.storage, pubkey_storage_key.clone()) {
            return Err(ContractError::EncPubKeyAlreadyUsed {});
        }

        // Mark this enc_pub_key as used
        USED_ENC_PUB_KEYS.save(deps.storage, pubkey_storage_key, &true)?;
        let mut msg_chain_length = MSG_CHAIN_LENGTH.load(deps.storage)?;
        let old_msg_hashes =
            MSG_HASHES.load(deps.storage, msg_chain_length.to_be_bytes().to_vec())?;

        // Compute the new message hash using the provided message, encrypted public key, and previous hash
        let new_hash =
            hash_message_and_enc_pub_key(message.clone(), enc_pub_key.clone(), old_msg_hashes);
        MSG_HASHES.save(
            deps.storage,
            (msg_chain_length + Uint256::from_u128(1u128))
                .to_be_bytes()
                .to_vec(),
            &new_hash,
        )?;

        let old_chain_length = msg_chain_length;
        // Update the message chain length
        msg_chain_length += Uint256::from_u128(1u128);
        MSG_CHAIN_LENGTH.save(deps.storage, &msg_chain_length)?;
        // Return a success response
        Ok(Response::new()
            .add_attribute("action", "publish_message")
            .add_attribute("msg_chain_length", old_chain_length.to_string())
            .add_attribute("message", format!("{:?}", message.data))
            .add_attribute(
                "enc_pub_key",
                format!(
                    "{:?},{:?}",
                    enc_pub_key.x.to_string(),
                    enc_pub_key.y.to_string()
                ),
            ))
    } else {
        // Return an error response for invalid user or encrypted public key
        Ok(Response::new()
            .add_attribute("action", "publish_message")
            .add_attribute("event", "error user."))
    }
}

// in voting - batch version
pub fn execute_publish_message_batch(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    messages: Vec<MessageData>,
    enc_pub_keys: Vec<PubKey>,
) -> Result<Response, ContractError> {
    // Check if the period status is Voting (once for the entire batch)
    let voting_time = VOTINGTIME.load(deps.storage)?;
    check_voting_time(env, voting_time)?;

    // Validate that messages and enc_pub_keys have the same length
    if messages.len() != enc_pub_keys.len() {
        return Err(ContractError::BatchLengthMismatch {
            messages_len: messages.len(),
            enc_pub_keys_len: enc_pub_keys.len(),
        });
    }

    // Load the scalar field value (once for the entire batch)
    let snark_scalar_field = get_snark_scalar_field();

    // Record the starting chain length
    let start_chain_length = MSG_CHAIN_LENGTH.load(deps.storage)?;
    let batch_size = messages.len();

    // Build attributes for the batch
    let mut attributes = vec![
        attr("action", "publish_message_batch"),
        attr("batch_size", batch_size.to_string()),
        attr("start_chain_length", start_chain_length.to_string()),
    ];

    // Process each message in the batch
    let mut msg_chain_length = start_chain_length;

    for (i, (message, enc_pub_key)) in messages.iter().zip(enc_pub_keys.iter()).enumerate() {
        // Check if the encrypted public key is valid
        if enc_pub_key.x != Uint256::from_u128(0u128)
            && enc_pub_key.y != Uint256::from_u128(1u128)
            && enc_pub_key.x < snark_scalar_field
            && enc_pub_key.y < snark_scalar_field
        {
            // Check if enc_pub_key has already been used
            let pubkey_storage_key = generate_pubkey_storage_key(&enc_pub_key);
            if USED_ENC_PUB_KEYS.has(deps.storage, pubkey_storage_key.clone()) {
                return Err(ContractError::EncPubKeyAlreadyUsed {});
            }

            // Mark this enc_pub_key as used
            USED_ENC_PUB_KEYS.save(deps.storage, pubkey_storage_key, &true)?;

            let old_msg_hashes =
                MSG_HASHES.load(deps.storage, msg_chain_length.to_be_bytes().to_vec())?;

            // Compute the new message hash using the provided message, encrypted public key, and previous hash
            let new_hash =
                hash_message_and_enc_pub_key(message.clone(), enc_pub_key.clone(), old_msg_hashes);
            MSG_HASHES.save(
                deps.storage,
                (msg_chain_length + Uint256::from_u128(1u128))
                    .to_be_bytes()
                    .to_vec(),
                &new_hash,
            )?;

            // Add individual message attributes
            attributes.push(attr(
                format!("msg_{}_chain_length", i),
                msg_chain_length.to_string(),
            ));
            attributes.push(attr(
                format!("msg_{}_data", i),
                format!("{:?}", message.data),
            ));
            attributes.push(attr(
                format!("msg_{}_enc_pub_key", i),
                format!(
                    "{:?},{:?}",
                    enc_pub_key.x.to_string(),
                    enc_pub_key.y.to_string()
                ),
            ));

            // Update the message chain length
            msg_chain_length += Uint256::from_u128(1u128);
        }
    }

    // Save the final chain length (once for the entire batch)
    MSG_CHAIN_LENGTH.save(deps.storage, &msg_chain_length)?;

    // Add the ending chain length to attributes
    attributes.push(attr("end_chain_length", msg_chain_length.to_string()));

    // Return a success response with all attributes
    Ok(Response::new().add_attributes(attributes))
}

pub fn execute_start_process_period(
    mut deps: DepsMut,
    env: Env,
    _info: MessageInfo,
) -> Result<Response, ContractError> {
    let period = PERIOD.load(deps.storage)?;

    if period.status == PeriodStatus::Ended
        || period.status == PeriodStatus::Processing
        || period.status == PeriodStatus::Tallying
    {
        return Err(ContractError::PeriodError {});
    }

    let voting_time: VotingTime = VOTINGTIME.load(deps.storage)?;

    // if let Some(voting_time) = voting_time {
    if env.block.time <= voting_time.end_time {
        return Err(ContractError::PeriodError {});
    }
    // } else {
    //     return Err(ContractError::PeriodError {});
    // }

    let leaf_idx_0 = LEAF_IDX_0.load(deps.storage)?;
    let num_sign_ups = NUMSIGNUPS.load(deps.storage)?;
    let _ = state_update_at(
        &mut deps,
        leaf_idx_0 + num_sign_ups - Uint256::from_u128(1u128),
        true,
    );

    // Update the period status to Processing
    let period = Period {
        status: PeriodStatus::Processing,
    };
    PERIOD.save(deps.storage, &period)?;
    // Compute the state root
    let state_root = state_root(deps.as_ref());

    // Compute the current state commitment as the hash of the state root and 0
    CURRENT_STATE_COMMITMENT.save(
        deps.storage,
        &hash2([state_root, Uint256::from_u128(0u128)]),
    )?;

    // Return a success response
    Ok(Response::new().add_attribute("action", "start_process_period"))
}

pub fn execute_process_message(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    new_state_commitment: Uint256,
    groth16_proof: Option<Groth16ProofType>,
    plonk_proof: Option<PlonkProofType>,
) -> Result<Response, ContractError> {
    let period = PERIOD.load(deps.storage)?;
    // Check if the period status is Processing
    if period.status != PeriodStatus::Processing {
        return Err(ContractError::PeriodError {});
    }
    let mut processed_msg_count = PROCESSED_MSG_COUNT.load(deps.storage)?;
    let msg_chain_length = MSG_CHAIN_LENGTH.load(deps.storage)?;

    // Check that all messages have not been processed yet
    assert!(
        processed_msg_count < msg_chain_length,
        "all messages have been processed"
    );

    // Create an array to store the input values for the SNARK proof
    let mut input: [Uint256; 6] = [Uint256::zero(); 6];

    let num_sign_ups = NUMSIGNUPS.load(deps.storage)?;
    let max_vote_options = MAX_VOTE_OPTIONS.load(deps.storage)?;
    let circuit_type = CIRCUITTYPE.load(deps.storage)?;
    if circuit_type == Uint256::from_u128(0u128) {
        // 1p1v
        input[0] = (num_sign_ups << 32) + max_vote_options; // packedVals
    } else if circuit_type == Uint256::from_u128(1u128) {
        // qv
        input[0] = (num_sign_ups << 32) + (circuit_type << 64) + max_vote_options;
        // packedVals
    }
    // Load the coordinator's public key hash
    let coordinator_hash = COORDINATORHASH.load(deps.storage)?;
    input[1] = coordinator_hash; // coordPubKeyHash

    // Load the MACI parameters
    let parameters = MACIPARAMETERS.load(deps.storage)?;
    let batch_size = parameters.message_batch_size;

    // Compute the start and end indices of the current batch
    let batch_start_index = (msg_chain_length - processed_msg_count - Uint256::from_u128(1u128))
        / batch_size
        * batch_size;
    let mut batch_end_index = batch_start_index + batch_size;
    if batch_end_index > msg_chain_length {
        batch_end_index = msg_chain_length;
    }

    // Load the hash of the message at the batch start index
    input[2] = MSG_HASHES.load(deps.storage, batch_start_index.to_be_bytes().to_vec())?; // batchStartHash

    // Load the hash of the message at the batch end index
    input[3] = MSG_HASHES.load(deps.storage, batch_end_index.to_be_bytes().to_vec())?; // batchEndHash

    // Load the current state commitment
    let current_state_commitment = CURRENT_STATE_COMMITMENT.load(deps.storage)?;
    input[4] = current_state_commitment;

    // Set the new state commitment
    input[5] = new_state_commitment;

    // Load the scalar field value (optimization: use cached values)
    let snark_scalar_field = get_snark_scalar_field();

    // Compute the hash of the input values
    let input_hash = uint256_from_hex_string(&hash_256_uint256_list(&input)) % snark_scalar_field; // input hash

    let mut attributes = vec![];

    if let Some(groth16_proof_data) = groth16_proof {
        // Load the process verification keys
        let process_vkeys_str = GROTH16_PROCESS_VKEYS.load(deps.storage)?;

        // Parse the SNARK proof (optimization: avoid unnecessary cloning)
        let proof_str = Groth16ProofStr {
            pi_a: hex::decode(&groth16_proof_data.a)
                .map_err(|_| ContractError::HexDecodingError {})?,
            pi_b: hex::decode(&groth16_proof_data.b)
                .map_err(|_| ContractError::HexDecodingError {})?,
            pi_c: hex::decode(&groth16_proof_data.c)
                .map_err(|_| ContractError::HexDecodingError {})?,
        };

        // Parse the verification key and prepare for verification
        let vkey = parse_groth16_vkey::<Bn256>(process_vkeys_str)?;
        let pvk = prepare_verifying_key(&vkey);

        // Parse the proof and prepare for verification
        let pof = parse_groth16_proof::<Bn256>(proof_str.clone())?;

        // Verify the SNARK proof using the input hash
        let is_passed = groth16_verify(
            &pvk,
            &pof,
            &[Fr::from_str(&input_hash.to_string()).unwrap()],
        )
        .unwrap();

        // If the proof verification fails, return an error
        if !is_passed {
            return Err(ContractError::InvalidProof {
                step: String::from("Process"),
            });
        }

        attributes = vec![
            attr("zk_verify", is_passed.to_string()),
            attr("commitment", new_state_commitment.to_string()),
            attr("proof", format!("{:?}", groth16_proof_data)),
            attr("certification_system", "groth16"),
        ];
    }

    if let Some(plonk_proof_data) = plonk_proof {
        // Load the process verification keys
        let process_vkeys_str = PLONK_PROCESS_VKEYS.load(deps.storage)?;

        // Parse the SNARK proof
        let proof_str = PlonkProofStr {
            num_inputs: plonk_proof_data.num_inputs.clone(),
            n: plonk_proof_data.n.clone(),
            input_values: plonk_proof_data.input_values.clone(),
            wire_commitments: plonk_proof_data
                .wire_commitments
                .clone()
                .into_iter()
                .map(|x| hex::decode(x).unwrap())
                .collect(),
            grand_product_commitment: hex::decode(
                plonk_proof_data.grand_product_commitment.clone(),
            )
            .map_err(|_| ContractError::HexDecodingError {})?,
            quotient_poly_commitments: plonk_proof_data
                .quotient_poly_commitments
                .clone()
                .into_iter()
                .map(|x| hex::decode(x).unwrap())
                .collect(),
            wire_values_at_z: plonk_proof_data.wire_values_at_z.clone(),
            wire_values_at_z_omega: plonk_proof_data.wire_values_at_z_omega.clone(),
            grand_product_at_z_omega: plonk_proof_data.grand_product_at_z_omega.clone(),
            quotient_polynomial_at_z: plonk_proof_data.quotient_polynomial_at_z.clone(),
            linearization_polynomial_at_z: plonk_proof_data.linearization_polynomial_at_z.clone(),
            permutation_polynomials_at_z: plonk_proof_data.permutation_polynomials_at_z.clone(),
            opening_at_z_proof: hex::decode(&plonk_proof_data.opening_at_z_proof)
                .map_err(|_| ContractError::HexDecodingError {})?,
            opening_at_z_omega_proof: hex::decode(&plonk_proof_data.opening_at_z_omega_proof)
                .map_err(|_| ContractError::HexDecodingError {})?,
        };

        // Parse the verification key and prepare for verification
        let vkey = parse_plonk_vkey::<MBn256, PlonkCsWidth4WithNextStepParams>(process_vkeys_str)?;

        let pof = parse_plonk_proof::<MBn256, PlonkCsWidth4WithNextStepParams>(proof_str.clone())?;

        // Verify the SNARK proof using the input hash
        let is_passed =
            plonk_verify::<_, _, RollingKeccakTranscript<pairing_ce::bn256::Fr>>(&pof, &vkey, None)
                .map_err(|_| ContractError::SynthesisError {})?;

        // If the proof verification fails, return an error
        if !is_passed {
            return Err(ContractError::InvalidProof {
                step: String::from("Process"),
            });
        }

        attributes = vec![
            attr("zk_verify", is_passed.to_string()),
            attr("commitment", new_state_commitment.to_string()),
            attr("proof", format!("{:?}", plonk_proof_data)),
            attr("certification_system", "plonk"),
        ];
    }

    // Proof verify success
    // Update the current state commitment
    CURRENT_STATE_COMMITMENT.save(deps.storage, &new_state_commitment)?;

    // Update the count of processed messages
    processed_msg_count += batch_end_index - batch_start_index;
    PROCESSED_MSG_COUNT.save(deps.storage, &processed_msg_count)?;
    Ok(Response::new()
        .add_attribute("action", "process_message")
        .add_attributes(attributes))
}

pub fn execute_stop_processing_period(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
) -> Result<Response, ContractError> {
    let period = PERIOD.load(deps.storage)?;
    // Check if the period status is Processing
    if period.status != PeriodStatus::Processing {
        return Err(ContractError::PeriodError {});
    }

    let num_sign_ups = NUMSIGNUPS.load(deps.storage)?;

    // If there are registered users, check if all messages have been processed
    // If num_sign_ups is 0, skip the message processing check as all votes are invalid
    if num_sign_ups != Uint256::zero() {
        let processed_msg_count = PROCESSED_MSG_COUNT.load(deps.storage)?;
        let msg_chain_length = MSG_CHAIN_LENGTH.load(deps.storage)?;

        if processed_msg_count != msg_chain_length {
            return Err(ContractError::MsgLeftProcess {});
        }
    }

    // Update the period status to Tallying
    let period = Period {
        status: PeriodStatus::Tallying,
    };
    PERIOD.save(deps.storage, &period)?;

    Ok(Response::new()
        .add_attribute("action", "stop_processing_period")
        .add_attribute("period", "Tallying"))
}

pub fn execute_process_tally(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    new_tally_commitment: Uint256,
    groth16_proof: Option<Groth16ProofType>,
    plonk_proof: Option<PlonkProofType>,
) -> Result<Response, ContractError> {
    let period = PERIOD.load(deps.storage)?;
    // Check if the period status is Tallying
    if period.status != PeriodStatus::Tallying {
        return Err(ContractError::PeriodError {});
    }

    let mut processed_user_count = PROCESSED_USER_COUNT.load(deps.storage)?;
    let num_sign_ups = NUMSIGNUPS.load(deps.storage)?;
    // Check that all users have not been processed yet
    assert!(
        processed_user_count.clone() < num_sign_ups.clone(),
        "all users have been processed"
    );

    let parameters = MACIPARAMETERS.load(deps.storage)?;
    // Calculate the batch size (optimization: avoid string conversions and exponentiation)
    let batch_size = if parameters.int_state_tree_depth == Uint256::from_u128(1) {
        Uint256::from_u128(5u128) // 5^1
    } else if parameters.int_state_tree_depth == Uint256::from_u128(2) {
        Uint256::from_u128(25u128) // 5^2
    } else if parameters.int_state_tree_depth == Uint256::from_u128(3) {
        Uint256::from_u128(125u128) // 5^3
    } else {
        Uint256::from_u128(1u128) // Default value
    };
    // Calculate the batch number
    let batch_num = processed_user_count / batch_size;

    // Create an array to store the input values for the SNARK proof
    let mut input: [Uint256; 4] = [Uint256::zero(); 4];

    input[0] = (num_sign_ups << 32) + batch_num; // packedVals

    // Load the current state commitment and current tally commitment
    let current_state_commitment = CURRENT_STATE_COMMITMENT.load(deps.storage)?;
    let current_tally_commitment = CURRENT_TALLY_COMMITMENT.load(deps.storage)?;

    input[1] = current_state_commitment; // stateCommitment
    input[2] = current_tally_commitment; // tallyCommitment
    input[3] = new_tally_commitment; // newTallyCommitment

    // Load the scalar field value (optimization: use cached values)
    let snark_scalar_field = get_snark_scalar_field();

    // Compute the hash of the input values
    let input_hash = uint256_from_hex_string(&hash_256_uint256_list(&input)) % snark_scalar_field;

    let mut attributes = vec![];
    let is_passed;
    if let Some(groth16_proof_data) = groth16_proof {
        // Load the tally verification keys
        let tally_vkeys_str = GROTH16_TALLY_VKEYS.load(deps.storage)?;

        // Parse the SNARK proof (optimization: avoid unnecessary cloning)
        let proof_str = Groth16ProofStr {
            pi_a: hex::decode(&groth16_proof_data.a)
                .map_err(|_| ContractError::HexDecodingError {})?,
            pi_b: hex::decode(&groth16_proof_data.b)
                .map_err(|_| ContractError::HexDecodingError {})?,
            pi_c: hex::decode(&groth16_proof_data.c)
                .map_err(|_| ContractError::HexDecodingError {})?,
        };

        // Parse the verification key and prepare for verification
        let vkey = parse_groth16_vkey::<Bn256>(tally_vkeys_str)?;
        let pvk = prepare_verifying_key(&vkey);

        // Parse the proof and prepare for verification
        let pof = parse_groth16_proof::<Bn256>(proof_str.clone())?;

        // Verify the SNARK proof using the input hash
        let is_passed = groth16_verify(
            &pvk,
            &pof,
            &[Fr::from_str(&input_hash.to_string()).unwrap()],
        )
        .unwrap();

        // If the proof verification fails, return an error
        if !is_passed {
            return Err(ContractError::InvalidProof {
                step: String::from("Tally"),
            });
        }

        attributes = vec![
            attr("zk_verify", is_passed.to_string()),
            attr("commitment", new_tally_commitment.to_string()),
            attr("proof", format!("{:?}", groth16_proof_data)),
            attr("certification_system", "groth16"),
        ];
    }

    if let Some(plonk_proof_data) = plonk_proof {
        // Load the tally verification keys
        let tally_vkeys_str = PLONK_TALLY_VKEYS.load(deps.storage)?;

        // Parse the SNARK proof
        let proof_str = PlonkProofStr {
            num_inputs: plonk_proof_data.num_inputs.clone(),
            n: plonk_proof_data.n.clone(),
            input_values: plonk_proof_data.input_values.clone(),
            wire_commitments: plonk_proof_data
                .wire_commitments
                .clone()
                .into_iter()
                .map(|x| hex::decode(x).unwrap())
                .collect(),
            grand_product_commitment: hex::decode(
                plonk_proof_data.grand_product_commitment.clone(),
            )
            .map_err(|_| ContractError::HexDecodingError {})?,
            quotient_poly_commitments: plonk_proof_data
                .quotient_poly_commitments
                .clone()
                .into_iter()
                .map(|x| hex::decode(x).unwrap())
                .collect(),
            wire_values_at_z: plonk_proof_data.wire_values_at_z.clone(),
            wire_values_at_z_omega: plonk_proof_data.wire_values_at_z_omega.clone(),
            grand_product_at_z_omega: plonk_proof_data.grand_product_at_z_omega.clone(),
            quotient_polynomial_at_z: plonk_proof_data.quotient_polynomial_at_z.clone(),
            linearization_polynomial_at_z: plonk_proof_data.linearization_polynomial_at_z.clone(),
            permutation_polynomials_at_z: plonk_proof_data.permutation_polynomials_at_z.clone(),
            opening_at_z_proof: hex::decode(&plonk_proof_data.opening_at_z_proof)
                .map_err(|_| ContractError::HexDecodingError {})?,
            opening_at_z_omega_proof: hex::decode(&plonk_proof_data.opening_at_z_omega_proof)
                .map_err(|_| ContractError::HexDecodingError {})?,
        };

        // Parse the verification key and prepare for verification
        let vkey = parse_plonk_vkey::<MBn256, PlonkCsWidth4WithNextStepParams>(tally_vkeys_str)?;

        let pof = parse_plonk_proof::<MBn256, PlonkCsWidth4WithNextStepParams>(proof_str.clone())?;

        // Verify the SNARK proof using the input hash
        is_passed =
            plonk_verify::<_, _, RollingKeccakTranscript<pairing_ce::bn256::Fr>>(&pof, &vkey, None)
                .map_err(|_| ContractError::SynthesisError {})?;

        // If the proof verification fails, return an error
        if !is_passed {
            return Err(ContractError::InvalidProof {
                step: String::from("Process"),
            });
        }

        attributes = vec![
            attr("zk_verify", is_passed.to_string()),
            attr("commitment", new_tally_commitment.to_string()),
            attr("proof", format!("{:?}", plonk_proof_data)),
            attr("certification_system", "plonk"),
        ];
    }

    // Proof verify success
    // Update the current tally commitment
    CURRENT_TALLY_COMMITMENT
        .save(deps.storage, &new_tally_commitment)
        .unwrap();

    // Update the count of processed users
    processed_user_count += batch_size;

    PROCESSED_USER_COUNT
        .save(deps.storage, &processed_user_count)
        .unwrap();

    Ok(Response::new()
        .add_attribute("action", "process_tally")
        .add_attributes(attributes))
}

fn execute_stop_tallying_period(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    results: Vec<Uint256>,
    salt: Uint256,
) -> Result<Response, ContractError> {
    let period = PERIOD.load(deps.storage)?;
    // Check if the period status is Tallying
    if period.status != PeriodStatus::Tallying {
        return Err(ContractError::PeriodError {});
    }

    let processed_user_count = PROCESSED_USER_COUNT.load(deps.storage)?;
    let num_sign_ups = NUMSIGNUPS.load(deps.storage)?;
    let max_vote_options = MAX_VOTE_OPTIONS.load(deps.storage)?;

    // Check that all users have been processed
    assert!(processed_user_count >= num_sign_ups);

    // Check that the number of results is not greater than the maximum vote options
    assert!(Uint256::from_u128(results.len() as u128) <= max_vote_options);

    // Load the QTR library and MACI parameters
    let qtr_lib = QTR_LIB.load(deps.storage)?;
    let parameters = MACIPARAMETERS.load(deps.storage)?;

    // Calculate the results root
    let results_root = qtr_lib.root_of(parameters.vote_option_tree_depth, results.clone());

    // Calculate the tally commitment
    let tally_commitment = hash2([results_root, salt]);

    // Load the current tally commitment
    let current_tally_commitment = CURRENT_TALLY_COMMITMENT.load(deps.storage)?;
    if current_tally_commitment == Uint256::from_u128(0u128) {
        let mut sum = Uint256::zero();

        // Save the results and calculate the sum
        for i in 0..results.len() {
            RESULT.save(
                deps.storage,
                Uint256::from_u128(i as u128).to_be_bytes().to_vec(),
                &results[i],
            )?;
            sum += results[i];
        }

        // Save the total result
        TOTAL_RESULT.save(deps.storage, &sum)?;

        // Update the period status to Ended
        let period = Period {
            status: PeriodStatus::Ended,
        };
        PERIOD.save(deps.storage, &period)?;

        return Ok(Response::new()
            .add_attribute("action", "stop_tallying_period")
            .add_attribute(
                "results",
                format!(
                    "{:?}",
                    results
                        .iter()
                        .map(|x| x.to_string())
                        .collect::<Vec<String>>()
                ),
            )
            .add_attribute("all_result", sum.to_string()));
    }
    // Check that the tally commitment matches the current tally commitment
    assert_eq!(tally_commitment, current_tally_commitment);

    let mut sum = Uint256::zero();

    // Save the results and calculate the sum
    for i in 0..results.len() {
        RESULT.save(
            deps.storage,
            Uint256::from_u128(i as u128).to_be_bytes().to_vec(),
            &results[i],
        )?;
        sum += results[i];
    }

    // Save the total result
    TOTAL_RESULT.save(deps.storage, &sum)?;

    // Update the period status to Ended
    let period = Period {
        status: PeriodStatus::Ended,
    };
    PERIOD.save(deps.storage, &period)?;

    Ok(Response::new()
        .add_attribute("action", "stop_tallying_period")
        .add_attribute(
            "results",
            format!(
                "{:?}",
                results
                    .iter()
                    .map(|x| x.to_string())
                    .collect::<Vec<String>>()
            ),
        )
        .add_attribute("all_result", sum.to_string()))
}

fn execute_bond(_deps: DepsMut, _env: Env, info: MessageInfo) -> Result<Response, ContractError> {
    // if !can_execute(deps.as_ref(), info.sender.as_ref())? {
    //     return Err(ContractError::Unauthorized {});
    // }

    let denom = "peaka".to_string();
    let mut amount: Uint128 = Uint128::new(0);
    // Iterate through the funds and find the amount with the MACI denomination
    info.funds.iter().for_each(|fund| {
        if fund.denom == denom {
            amount = fund.amount;
        }
    });

    Ok(Response::new()
        .add_attribute("action", "bond")
        .add_attribute("amount", amount.to_string()))
}

fn execute_withdraw(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    amount: Option<Uint128>,
) -> Result<Response, ContractError> {
    // Check if the round has ended - anyone can call withdraw but only when round is ended
    let period = PERIOD.load(deps.storage)?;
    if period.status != PeriodStatus::Ended {
        return Err(ContractError::PeriodError {});
    }

    // Use DORA as the denomination (changed from "peaka")
    let denom = "peaka".to_string(); // Note: This should match the denom used in SaaS contract
    let contract_balance = deps.querier.query_balance(env.contract.address, &denom)?;
    let mut withdraw_amount = amount.map_or_else(|| contract_balance.amount.u128(), |am| am.u128());

    if withdraw_amount > contract_balance.amount.u128() {
        withdraw_amount = contract_balance.amount.u128();
    }

    // Get admin address (SaaS contract address) to send funds back
    let admin_info = ADMIN.load(deps.storage)?;
    let admin_address = admin_info.admin;

    let amount_res = coins(withdraw_amount, denom);
    let message = BankMsg::Send {
        to_address: admin_address.to_string(), // Send to admin (SaaS contract) instead of caller
        amount: amount_res,
    };

    Ok(Response::new()
        .add_message(message)
        .add_attribute("action", "withdraw")
        .add_attribute("amount", withdraw_amount.to_string()))
}

fn can_sign_up(
    deps: Deps,
    env: Env,
    pubkey: PubKey,
    amount: Uint256,
    certificate: String,
) -> StdResult<bool> {
    let oracle_whitelist_config = ORACLE_WHITELIST_CONFIG.load(deps.storage)?;
    let whitelist_backend_pubkey = oracle_whitelist_config.backend_pubkey;
    // let payload = serde_json::json!({
    //     "address": sender.to_string(),
    //     "amount": amount.to_string(),
    //     // "height": whitelist_snapshot_height.to_string(),
    //     "contract_address": env.contract.address.to_string(),
    //     "ecosystem": whitelist_ecosystem.to_string(),
    // });
    let contract_address_uint256 = address_to_uint256(&env.contract.address);

    let payload = serde_json::json!({
        "amount": amount.to_string(),
        "contract_address": contract_address_uint256.to_string(),
        "pubkey_x": pubkey.x.to_string(),
        "pubkey_y": pubkey.y.to_string(),
    });

    let msg = payload.to_string().into_bytes();

    let hash = Sha256::digest(&msg);

    let certificate_binary = Binary::from_base64(&certificate)?;
    let verify_result = deps.api.secp256k1_verify(
        hash.as_ref(),
        certificate_binary.as_slice(), // Use decoded binary data
        whitelist_backend_pubkey.as_slice(),
    )?;

    Ok(verify_result)
}

fn user_balance_of(
    deps: Deps,
    env: Env,
    // sender: &str,
    pubkey: PubKey,
    amount: Uint256,
    certificate: String,
) -> StdResult<Uint256> {
    if WHITELIST.has(
        deps.storage,
        &(
            pubkey.x.to_be_bytes().to_vec(),
            pubkey.y.to_be_bytes().to_vec(),
        ),
    ) {
        let cfg = WHITELIST.load(
            deps.storage,
            &(
                pubkey.x.to_be_bytes().to_vec(),
                pubkey.y.to_be_bytes().to_vec(),
            ),
        )?;
        return Ok(cfg.balance_of());
    }

    let oracle_whitelist_config = ORACLE_WHITELIST_CONFIG.load(deps.storage)?;
    let whitelist_backend_pubkey = oracle_whitelist_config.backend_pubkey;
    // let payload = serde_json::json!({
    //     "address": sender.to_string(),
    //     "amount": amount.to_string(),
    //     "contract_address": env.contract.address.to_string(),
    //     "ecosystem": whitelist_ecosystem.to_string(),
    // });

    let contract_address_uint256 = address_to_uint256(&env.contract.address);
    let payload = serde_json::json!({
        "amount": amount.to_string(),
        "contract_address": contract_address_uint256.to_string(),
        "pubkey_x": pubkey.x.to_string(),
        "pubkey_y": pubkey.y.to_string(),
    });

    let msg = payload.to_string().into_bytes();

    let hash = Sha256::digest(&msg);

    let certificate_binary = Binary::from_base64(&certificate)?;
    let verify_result = deps.api.secp256k1_verify(
        hash.as_ref(),
        certificate_binary.as_slice(),
        whitelist_backend_pubkey.as_slice(),
    )?;
    if verify_result {
        let voting_power = calculate_voting_power(
            amount,
            &VotingPowerConfig {
                mode: oracle_whitelist_config.voting_power_mode,
                slope: oracle_whitelist_config.slope,
                threshold: oracle_whitelist_config.threshold,
            },
        );
        return Ok(voting_power);
    }
    Ok(Uint256::zero())
}

// Load the root node of the state tree
fn state_root(deps: Deps) -> Uint256 {
    let root = NODES
        .load(
            deps.storage,
            Uint256::from_u128(0u128).to_be_bytes().to_vec(),
        )
        .unwrap();
    root
}

// Enqueues the state leaf into the tree
fn state_enqueue(deps: &mut DepsMut, leaf: Uint256) -> Result<bool, ContractError> {
    let leaf_idx0 = LEAF_IDX_0.load(deps.storage).unwrap();
    let num_sign_ups = NUMSIGNUPS.load(deps.storage).unwrap();

    let leaf_idx = leaf_idx0 + num_sign_ups;
    NODES.save(deps.storage, leaf_idx.to_be_bytes().to_vec(), &leaf)?;
    state_update_at(deps, leaf_idx, false)
}

// Updates the state at the given index in the tree
fn state_update_at(deps: &mut DepsMut, index: Uint256, full: bool) -> Result<bool, ContractError> {
    let leaf_idx0 = LEAF_IDX_0.load(deps.storage).unwrap();
    if index < leaf_idx0 {
        return Err(ContractError::MustUpdate {});
    }

    let mut idx = index.clone();

    let mut height = 0;

    let zeros = ZEROS.load(deps.storage).unwrap();

    while idx > Uint256::from_u128(0u128)
        && (full || idx % Uint256::from_u128(5u128) == Uint256::from_u128(0u128))
    {
        let parent_idx = (idx - Uint256::one()) / Uint256::from(5u8);
        let children_idx0 = parent_idx * Uint256::from(5u8) + Uint256::one();

        let zero = zeros[height];

        let mut inputs: [Uint256; 5] = [Uint256::zero(); 5];

        for i in 0..5 {
            let node_value = NODES
                .may_load(
                    deps.storage,
                    (children_idx0 + Uint256::from_u128(i as u128))
                        .to_be_bytes()
                        .to_vec(),
                )
                .unwrap();

            let child = match node_value {
                Some(value) => value,
                None => zero,
            };

            inputs[i] = child;
        }

        if NODES.has(deps.storage, parent_idx.to_be_bytes().to_vec()) {
            NODES
                .update(
                    deps.storage,
                    parent_idx.to_be_bytes().to_vec(),
                    |_c: Option<Uint256>| -> StdResult<_> { Ok(hash5(inputs)) },
                )
                .unwrap();
        } else {
            NODES
                .save(
                    deps.storage,
                    parent_idx.to_be_bytes().to_vec(),
                    &hash5(inputs),
                )
                .unwrap();
        }

        height += 1;
        idx = parent_idx;
    }

    Ok(true)
}

fn calculate_voting_power(amount: Uint256, config: &VotingPowerConfig) -> Uint256 {
    match config.mode {
        VotingPowerMode::Slope => amount / config.slope,
        VotingPowerMode::Threshold => {
            if amount >= config.threshold {
                Uint256::from(1u128)
            } else {
                Uint256::zero()
            }
        }
    }
}

fn check_voting_time(env: Env, voting_time: VotingTime) -> Result<(), ContractError> {
    if env.block.time < voting_time.start_time {
        return Err(ContractError::PeriodError {});
    }
    if env.block.time >= voting_time.end_time {
        return Err(ContractError::PeriodError {});
    }

    Ok(())
}

pub fn hash_message_and_enc_pub_key(
    message: MessageData,
    enc_pub_key: PubKey,
    prev_hash: Uint256,
) -> Uint256 {
    let mut m: [Uint256; 5] = [Uint256::zero(); 5];
    m[0] = message.data[0];
    m[1] = message.data[1];
    m[2] = message.data[2];
    m[3] = message.data[3];
    m[4] = message.data[4];

    let mut n: [Uint256; 5] = [Uint256::zero(); 5];
    n[0] = message.data[5];
    n[1] = message.data[6];
    n[2] = enc_pub_key.x;
    n[3] = enc_pub_key.y;
    n[4] = prev_hash;

    let m_hash = hash5(m);

    let n_hash = hash5(n);
    let m_n_hash = hash2([m_hash, n_hash]);
    return m_n_hash;
}

// Generate storage key for PubKey
fn generate_pubkey_storage_key(pubkey: &PubKey) -> Vec<u8> {
    let mut key = Vec::new();
    key.extend_from_slice(&pubkey.x.to_be_bytes());
    key.extend_from_slice(&pubkey.y.to_be_bytes());
    key
}

// Only admin can execute
fn can_execute(deps: Deps, sender: &str) -> StdResult<bool> {
    let cfg = ADMIN.load(deps.storage)?;
    let can = cfg.is_admin(&sender);
    Ok(can)
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetRoundInfo {} => {
            to_json_binary::<RoundInfo>(&ROUNDINFO.load(deps.storage).unwrap())
        }
        QueryMsg::GetVotingTime {} => {
            to_json_binary::<VotingTime>(&VOTINGTIME.load(deps.storage).unwrap())
        }
        QueryMsg::GetPeriod {} => to_json_binary::<Period>(&PERIOD.load(deps.storage).unwrap()),
        QueryMsg::GetNumSignUp {} => {
            to_json_binary::<Uint256>(&NUMSIGNUPS.may_load(deps.storage)?.unwrap_or_default())
        }
        QueryMsg::GetMsgChainLength {} => {
            to_json_binary::<Uint256>(&MSG_CHAIN_LENGTH.may_load(deps.storage)?.unwrap_or_default())
        }
        QueryMsg::GetProcessedMsgCount {} => to_json_binary::<Uint256>(
            &PROCESSED_MSG_COUNT
                .may_load(deps.storage)?
                .unwrap_or_default(),
        ),
        QueryMsg::GetProcessedUserCount {} => to_json_binary::<Uint256>(
            &PROCESSED_USER_COUNT
                .may_load(deps.storage)?
                .unwrap_or_default(),
        ),
        QueryMsg::GetResult { index } => to_json_binary::<Uint256>(
            &RESULT
                .may_load(deps.storage, index.to_be_bytes().to_vec())?
                .unwrap_or_default(),
        ),
        QueryMsg::GetAllResult {} => {
            to_json_binary::<Uint256>(&TOTAL_RESULT.may_load(deps.storage)?.unwrap_or_default())
        }
        QueryMsg::GetStateIdxInc { address } => to_json_binary::<Uint256>(
            &STATEIDXINC
                .may_load(deps.storage, &address)?
                .unwrap_or_default(),
        ),
        QueryMsg::GetVoiceCreditBalance { index } => to_json_binary::<Uint256>(
            &VOICECREDITBALANCE
                .load(deps.storage, index.to_be_bytes().to_vec())
                .unwrap(),
        ),
        QueryMsg::IsWhiteList {
            pubkey,
            amount,
            certificate,
        } => to_json_binary::<bool>(&query_can_sign_up(deps, env, pubkey, amount, certificate)?),
        QueryMsg::WhiteBalanceOf {
            pubkey,
            amount,
            certificate,
        } => to_json_binary::<Uint256>(&query_user_balance_of(
            deps,
            env,
            pubkey,
            amount,
            certificate,
        )?),
        QueryMsg::WhiteInfo { pubkey } => to_json_binary::<WhitelistConfig>(
            &WHITELIST
                .load(
                    deps.storage,
                    &(
                        pubkey.x.to_be_bytes().to_vec(),
                        pubkey.y.to_be_bytes().to_vec(),
                    ),
                )
                .unwrap(),
        ),
        QueryMsg::MaxWhitelistNum {} => to_json_binary::<u128>(
            &MAX_WHITELIST_NUM
                .may_load(deps.storage)?
                .unwrap_or_default(),
        ),
        QueryMsg::VoteOptionMap {} => {
            to_json_binary::<Vec<String>>(&VOTEOPTIONMAP.load(deps.storage).unwrap())
        }
        QueryMsg::MaxVoteOptions {} => {
            to_json_binary::<Uint256>(&MAX_VOTE_OPTIONS.may_load(deps.storage)?.unwrap_or_default())
        }
        QueryMsg::QueryTotalFeeGrant {} => {
            to_json_binary::<Uint128>(&FEEGRANTS.may_load(deps.storage)?.unwrap_or_default())
        }
        QueryMsg::QueryCircuitType {} => {
            to_json_binary::<Uint256>(&CIRCUITTYPE.may_load(deps.storage)?.unwrap_or_default())
        }
        QueryMsg::QueryCertSystem {} => {
            to_json_binary::<Uint256>(&CERTSYSTEM.may_load(deps.storage)?.unwrap_or_default())
        }
        QueryMsg::QueryOracleWhitelistConfig {} => {
            to_json_binary::<OracleWhitelistConfig>(&ORACLE_WHITELIST_CONFIG.load(deps.storage)?)
        }
        QueryMsg::QueryCurrentStateCommitment {} => {
            let current_state_commitment = CURRENT_STATE_COMMITMENT.may_load(deps.storage)?;
            to_json_binary(&current_state_commitment)
        }
        QueryMsg::GetStateTreeRoot {} => to_json_binary::<Uint256>(&state_root(deps)),
        QueryMsg::GetNode { index } => {
            let node = NODES
                .may_load(deps.storage, index.to_be_bytes().to_vec())?
                .unwrap_or_default();
            to_json_binary::<Uint256>(&node)
        }
    }
}

pub fn query_can_sign_up(
    deps: Deps,
    env: Env,
    pubkey: PubKey,
    amount: Uint256,
    certificate: String,
) -> StdResult<bool> {
    Ok(can_sign_up(deps, env, pubkey, amount, certificate)?)
}

pub fn query_user_balance_of(
    deps: Deps,
    env: Env,
    pubkey: PubKey,
    amount: Uint256,
    certificate: String,
) -> StdResult<Uint256> {
    Ok(user_balance_of(deps, env, pubkey, amount, certificate)?)
}

#[cfg(test)]
mod tests {}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn reply(_deps: DepsMut, _env: Env, _msg: Reply) -> Result<Response, ContractError> {
    // Oracle MACI contract itself does not need to handle any reply, but needs this function to support multitest
    Ok(Response::default())
}
