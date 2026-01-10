use crate::circuit_params::match_vkeys;
use crate::error::ContractError;
use crate::groth16_parser::{parse_groth16_proof, parse_groth16_vkey};
use crate::msg::{
    ExecuteMsg, Groth16ProofType, InstantiateMsg, InstantiationData, QueryMsg, TallyDelayInfo,
    WhitelistBase,
};
use crate::state::{
    Admin, DelayRecord, DelayRecords, DelayType, Groth16ProofStr, MaciParameters, MessageData,
    OracleWhitelistUser, Period, PeriodStatus, PubKey, QuinaryTreeRoot, RoundInfo, StateLeaf,
    VotingTime, Whitelist, WhitelistConfig, ADMIN, CERTSYSTEM, CIRCUITTYPE, COORDINATORHASH,
    CREATE_ROUND_WINDOW, CURRENT_DEACTIVATE_COMMITMENT, CURRENT_STATE_COMMITMENT,
    CURRENT_TALLY_COMMITMENT, DEACTIVATE_COUNT, DEACTIVATE_DELAY, DELAY_RECORDS, DMSG_CHAIN_LENGTH,
    DMSG_HASHES, DNODES, FEEGRANTS, FEE_RECIPIENT, FIRST_DMSG_TIMESTAMP, GROTH16_DEACTIVATE_VKEYS,
    GROTH16_NEWKEY_VKEYS, GROTH16_PROCESS_VKEYS, GROTH16_TALLY_VKEYS, LEAF_IDX_0, MACIPARAMETERS,
    MACI_DEACTIVATE_MESSAGE, MACI_OPERATOR, MAX_LEAVES_COUNT, MAX_VOTE_OPTIONS, MSG_CHAIN_LENGTH,
    MSG_HASHES, NODES, NULLIFIERS, NUMSIGNUPS, ORACLE_WHITELIST, ORACLE_WHITELIST_PUBKEY,
    PENALTY_RATE, PERIOD, PRE_DEACTIVATE_COORDINATOR_HASH, PRE_DEACTIVATE_ROOT,
    PROCESSED_DMSG_COUNT, PROCESSED_MSG_COUNT, PROCESSED_USER_COUNT, QTR_LIB, RESULT, ROUNDINFO,
    SIGNUPED, STATEIDXINC, STATE_ROOT_BY_DMSG, TALLY_DELAY_MAX_HOURS, TALLY_TIMEOUT, TOTAL_RESULT,
    USED_ENC_PUB_KEYS, VOICECREDITBALANCE, VOICE_CREDIT_AMOUNT, VOTEOPTIONMAP, VOTINGTIME,
    WHITELIST, ZEROS, ZEROS_H10,
};
use cosmwasm_schema::cw_serde;
#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cw2::set_contract_version;

use pairing_ce::bn256::Bn256;

use cosmwasm_std::{
    attr, coins, to_json_binary, Addr, BankMsg, Binary, CosmosMsg, Decimal, Deps, DepsMut, Env,
    MessageInfo, Response, StdResult, Timestamp, Uint128, Uint256,
};
use maci_utils::{hash2, hash5, hash_256_uint256_list, uint256_from_hex_string};

use sha2::{Digest, Sha256};

use bellman_ce_verifier::{prepare_verifying_key, verify_proof as groth16_verify};

use ff_ce::PrimeField as Fr;

use hex;

/// Convert Uint256 to a field element for proof verification
/// This helper centralizes the conversion logic
#[inline]
fn uint256_to_field<F: Fr>(input: &Uint256) -> F {
    F::from_str(&input.to_string()).unwrap()
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

// version info for migration info
const CONTRACT_NAME: &str = "crates.io:cw-amaci";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    // Create an admin with the sender address
    let admin = Admin {
        admin: msg.admin.clone(),
    };
    ADMIN.save(deps.storage, &admin)?;

    let vote_option_max_amount = Uint256::from_u128(
        5u128.pow(
            msg.parameters
                .vote_option_tree_depth
                .to_string()
                .parse()
                .unwrap(),
        ),
    );
    let actual_vote_options = Uint256::from_u128(msg.vote_option_map.len() as u128);
    if actual_vote_options > vote_option_max_amount {
        return Err(ContractError::MaxVoteOptionsExceeded {
            current: actual_vote_options,
            max_allowed: vote_option_max_amount,
        });
    }

    if msg.voting_time.end_time < env.block.time {
        return Err(ContractError::WrongTimeSet {});
    }

    // if msg.voting_time.start_time >= msg.voting_time.end_time {
    //     return Err(ContractError::WrongTimeSet {});
    // }

    let create_round_window = Timestamp::from_seconds(10 * 60); // 10 minutes
    CREATE_ROUND_WINDOW.save(deps.storage, &create_round_window)?;

    // TODO: check apart time.
    if msg
        .voting_time
        .start_time
        .plus_seconds(create_round_window.seconds())
        >= msg.voting_time.end_time
    {
        return Err(ContractError::WrongTimeSet {});
    }

    match msg.whitelist {
        Some(content) => {
            let max_voter_amount = Uint256::from_u128(
                5u128.pow(msg.parameters.state_tree_depth.to_string().parse().unwrap()),
            );
            if Uint256::from_u128(content.users.len() as u128) > max_voter_amount {
                return Err(ContractError::MaxVoterExceeded {
                    current: Uint256::from_u128(content.users.len() as u128),
                    max_allowed: max_voter_amount,
                });
            }

            let mut users: Vec<WhitelistConfig> = Vec::new();
            for i in 0..content.users.len() {
                let data = WhitelistConfig {
                    addr: content.users[i].addr.clone(),
                    is_register: false,
                };
                users.push(data);
            }

            let whitelists = Whitelist { users };
            WHITELIST.save(deps.storage, &whitelists)?;
        }
        None => {}
    }

    // Save oracle whitelist pubkey if provided
    if let Some(oracle_pubkey) = msg.oracle_whitelist_pubkey {
        ORACLE_WHITELIST_PUBKEY.save(deps.storage, &oracle_pubkey)?;
    }

    // Save the MACI parameters to storage
    MACIPARAMETERS.save(deps.storage, &msg.parameters)?;
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

    // Save the pre_deactivate_root value to storage
    PRE_DEACTIVATE_ROOT.save(deps.storage, &msg.pre_deactivate_root)?;

    // Calculate and save the pre_deactivate_coordinator hash if provided
    if let Some(pre_deactivate_coordinator) = msg.pre_deactivate_coordinator {
        let pre_deactivate_coordinator_hash =
            hash2([pre_deactivate_coordinator.x, pre_deactivate_coordinator.y]);
        PRE_DEACTIVATE_COORDINATOR_HASH.save(deps.storage, &pre_deactivate_coordinator_hash)?;
    }

    let vkey = match_vkeys(&msg.parameters)?;

    GROTH16_PROCESS_VKEYS.save(deps.storage, &vkey.process_vkey)?;
    GROTH16_TALLY_VKEYS.save(deps.storage, &vkey.tally_vkey)?;
    GROTH16_DEACTIVATE_VKEYS.save(deps.storage, &vkey.deactivate_vkey)?;
    GROTH16_NEWKEY_VKEYS.save(deps.storage, &vkey.add_key_vkey)?;

    // Compute the coordinator hash from the coordinator values in the message
    let coordinator_hash = hash2([msg.coordinator.x, msg.coordinator.y]);
    COORDINATORHASH.save(deps.storage, &coordinator_hash)?;

    // Compute the maximum number of leaves based on the state tree depth
    let max_leaves_count =
        Uint256::from_u128(5u128.pow(msg.parameters.state_tree_depth.to_string().parse().unwrap()));
    MAX_LEAVES_COUNT.save(deps.storage, &max_leaves_count)?;

    // Calculate the index of the first leaf in the tree
    let leaf_idx0 = (max_leaves_count - Uint256::from_u128(1u128)) / Uint256::from_u128(4u128);
    LEAF_IDX_0.save(deps.storage, &leaf_idx0)?;

    // Define an array of zero values
    let zeros_h10: [Uint256; 7] = [
        uint256_from_hex_string("26318ec8cdeef483522c15e9b226314ae39b86cde2a430dabf6ed19791917c47"),
        //     "17275449213996161510934492606295966958609980169974699290756906233261208992839",
        uint256_from_hex_string("28413250bf1cc56fabffd2fa32b52624941da885248fd1e015319e02c02abaf2"),
        //     "18207706266780806924962529690397914300960241391319167935582599262189180861170",
        uint256_from_hex_string("16738da97527034e095ac32bfab88497ca73a7b310a2744ab43971e82215cb6d"),
        //     "10155047796084846065379877743510757035594500557216694906214808863463609584493",
        uint256_from_hex_string("28140849348769fde6e971eec1424a5a162873a3d8adcbfdfc188e9c9d25faa3"),
        //     "18127908072205049515869530689345374790252438412920611306083118152373728836259",
        uint256_from_hex_string("1a07af159d19f68ed2aed0df224dabcc2e2321595968769f7c9e26591377ed9a"),
        //     "11773710380932653545559747058052522704305757415195021025284143362529247620506",
        uint256_from_hex_string("205cd249acba8f95f2e32ed51fa9c3d8e6f0d021892225d3efa9cd84c8fc1cad"),
        //     "14638012437623529368951445143647110672059367053598285839401224214917416754349",
        uint256_from_hex_string("b21c625cd270e71c2ee266c939361515e690be27e26cfc852a30b24e83504b0"),
        //     "5035114852453394843899296226690566678263173670465782309520655898931824493744",
    ];
    ZEROS_H10.save(deps.storage, &zeros_h10)?;

    NODES.save(
        deps.storage,
        Uint256::from_u128(0u128).to_be_bytes().to_vec(),
        &zeros_h10[msg
            .parameters
            .state_tree_depth
            .to_string()
            .parse::<usize>()
            .unwrap()],
        // &Uint256::from_u128(0u128),
    )?;

    // Define an array of zero values for Merkle tree
    // These are precomputed hash values for empty subtrees at each depth
    // zeros[0] = 0 (zero leaf)
    // zeros[i] = poseidon([zeros[i-1], zeros[i-1], zeros[i-1], zeros[i-1], zeros[i-1]])
    // This supports state trees up to depth 6 (requires zeros[0] through zeros[8])
    let zeros: [Uint256; 9] = [
        Uint256::from_u128(0u128),
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
    MAX_VOTE_OPTIONS.save(
        deps.storage,
        &Uint256::from_u128(msg.vote_option_map.len() as u128),
    )?;
    VOICE_CREDIT_AMOUNT.save(deps.storage, &msg.voice_credit_amount)?;

    PROCESSED_DMSG_COUNT.save(deps.storage, &Uint256::from_u128(0u128))?;
    DMSG_CHAIN_LENGTH.save(deps.storage, &Uint256::from_u128(0u128))?;
    DEACTIVATE_COUNT.save(deps.storage, &0u128)?;

    let current_dcommitment = &hash2([
        zeros[msg
            .parameters
            .state_tree_depth
            .to_string()
            .parse::<usize>()
            .unwrap()],
        zeros[(msg.parameters.state_tree_depth + Uint256::from_u128(2u128))
            .to_string()
            .parse::<usize>()
            .unwrap()],
    ]);
    CURRENT_DEACTIVATE_COMMITMENT.save(deps.storage, current_dcommitment)?;
    DMSG_HASHES.save(
        deps.storage,
        Uint256::from_u128(0u128).to_be_bytes().to_vec(),
        &Uint256::from_u128(0u128),
    )?;
    STATE_ROOT_BY_DMSG.save(
        deps.storage,
        Uint256::from_u128(0u128).to_be_bytes().to_vec(),
        &Uint256::from_u128(0u128),
    )?;
    DNODES.save(
        deps.storage,
        Uint256::from_u128(0u128).to_be_bytes().to_vec(),
        &Uint256::from_u128(0u128),
    )?;

    VOTEOPTIONMAP.save(deps.storage, &msg.vote_option_map)?;
    ROUNDINFO.save(deps.storage, &msg.round_info)?;

    VOTINGTIME.save(deps.storage, &msg.voting_time)?;

    // Create a period struct with the initial status set to Voting
    let period = Period {
        status: PeriodStatus::Pending,
    };

    // Save the initial period to storage
    PERIOD.save(deps.storage, &period)?;

    MACI_OPERATOR.save(deps.storage, &msg.operator)?;

    FEE_RECIPIENT.save(deps.storage, &msg.fee_recipient)?;

    let circuit_type = if msg.circuit_type == Uint256::from_u128(0u128) {
        "0" // 1p1v
    } else if msg.circuit_type == Uint256::from_u128(1u128) {
        "1" // qv
    } else {
        return Err(ContractError::UnsupportedCircuitType {});
    };

    let certification_system = if msg.certification_system == Uint256::from_u128(0u128) {
        "groth16" // groth16
    } else {
        return Err(ContractError::UnsupportedCertificationSystem {});
    };

    CIRCUITTYPE.save(deps.storage, &msg.circuit_type)?;
    CERTSYSTEM.save(deps.storage, &msg.certification_system)?;

    // Init penalty rate and timeout
    let penalty_rate = Uint256::from_u128(50);
    PENALTY_RATE.save(deps.storage, &penalty_rate)?; // 50%

    DELAY_RECORDS.save(deps.storage, &DelayRecords { records: vec![] })?;

    let deactivate_delay = Timestamp::from_seconds(10 * 60); // 10 minutes
    DEACTIVATE_DELAY.save(deps.storage, &deactivate_delay)?;

    let tally_delay_max_hours = 48; // 48 hours
    TALLY_DELAY_MAX_HOURS.save(deps.storage, &tally_delay_max_hours)?;

    let tally_timeout = Timestamp::from_seconds(4 * 24 * 60 * 60); // 4 days
    TALLY_TIMEOUT.save(deps.storage, &tally_timeout)?;

    let old_tally_timeout_set = Timestamp::from_seconds(tally_delay_max_hours * 60 * 60);

    let data: InstantiationData = InstantiationData {
        caller: info.sender.clone(),
        parameters: msg.parameters.clone(),
        coordinator: msg.coordinator.clone(),
        admin: msg.admin.clone(),
        operator: msg.operator.clone(),
        vote_option_map: msg.vote_option_map.clone(),
        // max_vote_options: Uint256::from_u128(msg.vote_option_map.len() as u128),
        voice_credit_amount: msg.voice_credit_amount.clone(),
        round_info: msg.round_info.clone(),
        voting_time: msg.voting_time.clone(),
        pre_deactivate_root: msg.pre_deactivate_root.clone(),
        circuit_type: circuit_type.to_string(),
        certification_system: certification_system.to_string(),
        penalty_rate: penalty_rate.clone(),
        deactivate_timeout: deactivate_delay.clone(),
        tally_timeout: old_tally_timeout_set.clone(),
    };

    let mut attributes = vec![
        attr("action", "instantiate"),
        attr("caller", &info.sender.to_string()),
        attr("admin", &msg.admin.to_string()),
        attr("operator", &msg.operator.to_string()),
        attr(
            "voting_start",
            &msg.voting_time.start_time.nanos().to_string(),
        ),
        attr("voting_end", &msg.voting_time.end_time.nanos().to_string()),
        attr("round_title", &msg.round_info.title.to_string()),
        attr("coordinator_pubkey_x", &msg.coordinator.x.to_string()),
        attr("coordinator_pubkey_y", &msg.coordinator.y.to_string()),
        attr("max_vote_options", &msg.vote_option_map.len().to_string()),
        attr("voice_credit_amount", &msg.voice_credit_amount.to_string()),
        attr("pre_deactivate_root", &msg.pre_deactivate_root.to_string()),
        attr(
            "state_tree_depth",
            &msg.parameters.state_tree_depth.to_string(),
        ),
        attr(
            "int_state_tree_depth",
            &msg.parameters.int_state_tree_depth.to_string(),
        ),
        attr(
            "vote_option_tree_depth",
            &msg.parameters.vote_option_tree_depth.to_string(),
        ),
        attr(
            "message_batch_size",
            &msg.parameters.message_batch_size.to_string(),
        ),
        attr("circuit_type", &circuit_type.to_string()),
        attr("certification_system", &certification_system.to_string()),
        attr("penalty_rate", &penalty_rate.to_string()),
        attr(
            "deactivate_timeout",
            &deactivate_delay.seconds().to_string(),
        ),
        attr(
            "tally_timeout",
            &old_tally_timeout_set.seconds().to_string(),
        ),
    ];

    if msg.round_info.description != "" {
        attributes.push(attr("round_description", msg.round_info.description))
    }

    if msg.round_info.link != "" {
        attributes.push(attr("round_link", msg.round_info.link))
    }

    Ok(Response::new()
        .add_attributes(attributes)
        .set_data(to_json_binary(&data)?))
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
        ExecuteMsg::SetWhitelists { whitelists } => {
            execute_set_whitelists(deps, env, info, whitelists)
        }
        ExecuteMsg::SetVoteOptionsMap { vote_option_map } => {
            execute_set_vote_options_map(deps, env, info, vote_option_map)
        }
        // ExecuteMsg::StartVotingPeriod {} => execute_start_voting_period(deps, env, info),
        ExecuteMsg::SignUp {
            pubkey,
            certificate,
        } => execute_sign_up(deps, env, info, pubkey, certificate),
        // ExecuteMsg::StopVotingPeriod {} => execute_stop_voting_period(deps, env, info),
        ExecuteMsg::PublishDeactivateMessage {
            message,
            enc_pub_key,
        } => execute_publish_deactivate_message(deps, env, info, message, enc_pub_key),
        ExecuteMsg::UploadDeactivateMessage { deactivate_message } => {
            execute_upload_deactivate_message(deps, env, info, deactivate_message)
        }
        ExecuteMsg::ProcessDeactivateMessage {
            size,
            new_deactivate_commitment,
            new_deactivate_root,
            groth16_proof,
        } => execute_process_deactivate_message(
            deps,
            env,
            info,
            size,
            new_deactivate_commitment,
            new_deactivate_root,
            groth16_proof,
        ),
        ExecuteMsg::AddNewKey {
            pubkey,
            nullifier,
            d,
            groth16_proof,
        } => execute_add_new_key(deps, env, info, pubkey, nullifier, d, groth16_proof),
        ExecuteMsg::PreAddNewKey {
            pubkey,
            nullifier,
            d,
            groth16_proof,
        } => execute_pre_add_new_key(deps, env, info, pubkey, nullifier, d, groth16_proof),
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
        } => execute_process_message(deps, env, info, new_state_commitment, groth16_proof),
        ExecuteMsg::StopProcessingPeriod {} => execute_stop_processing_period(deps, env, info),
        ExecuteMsg::ProcessTally {
            new_tally_commitment,
            groth16_proof,
        } => execute_process_tally(deps, env, info, new_tally_commitment, groth16_proof),
        ExecuteMsg::StopTallyingPeriod { results, salt } => {
            execute_stop_tallying_period(deps, env, info, results, salt)
        }
        ExecuteMsg::Claim {} => execute_claim(deps, env, info),
    }
}

pub fn execute_set_round_info(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    round_info: RoundInfo,
) -> Result<Response, ContractError> {
    if !is_admin(deps.as_ref(), info.sender.as_ref())? {
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
pub fn execute_set_whitelists(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    whitelists: WhitelistBase,
) -> Result<Response, ContractError> {
    if FEEGRANTS.exists(deps.storage) {
        return Err(ContractError::FeeGrantAlreadyExists);
    }

    let voting_time = VOTINGTIME.load(deps.storage)?;

    if env.block.time >= voting_time.start_time {
        return Err(ContractError::PeriodError {});
    }

    if !is_admin(deps.as_ref(), info.sender.as_ref())? {
        Err(ContractError::Unauthorized {})
    } else {
        let cfg = MACIPARAMETERS.load(deps.storage)?;

        let max_voter_amount =
            Uint256::from_u128(5u128.pow(cfg.state_tree_depth.to_string().parse().unwrap()));
        if Uint256::from_u128(whitelists.users.len() as u128) > max_voter_amount {
            return Err(ContractError::MaxVoterExceeded {
                current: Uint256::from_u128(whitelists.users.len() as u128),
                max_allowed: max_voter_amount,
            });
        }

        let mut users: Vec<WhitelistConfig> = Vec::new();
        for i in 0..whitelists.users.len() {
            let data = WhitelistConfig {
                addr: whitelists.users[i].addr.clone(),
                is_register: false,
            };
            users.push(data);
        }

        let whitelists = Whitelist { users };
        WHITELIST.save(deps.storage, &whitelists)?;
        let res = Response::new().add_attribute("action", "set_whitelists");
        Ok(res)
    }
}

// in pending
pub fn execute_set_vote_options_map(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    vote_option_map: Vec<String>,
) -> Result<Response, ContractError> {
    let voting_time = VOTINGTIME.load(deps.storage)?;

    if env.block.time >= voting_time.start_time {
        return Err(ContractError::PeriodError {});
    }

    if !is_admin(deps.as_ref(), info.sender.as_ref())? {
        Err(ContractError::Unauthorized {})
    } else {
        let max_vote_options = vote_option_map.len() as u128;
        let cfg = MACIPARAMETERS.load(deps.storage)?;

        // An error will be thrown if the number of vote options exceeds the circuit's capacity.
        let vote_option_max_amount =
            Uint256::from_u128(5u128.pow(cfg.vote_option_tree_depth.to_string().parse().unwrap()));
        if Uint256::from_u128(max_vote_options) > vote_option_max_amount {
            return Err(ContractError::MaxVoteOptionsExceeded {
                current: Uint256::from_u128(max_vote_options),
                max_allowed: vote_option_max_amount,
            });
        }

        VOTEOPTIONMAP.save(deps.storage, &vote_option_map)?;
        // Save the maximum vote options
        MAX_VOTE_OPTIONS.save(deps.storage, &Uint256::from_u128(max_vote_options))?;
        let res = Response::new()
            .add_attribute("action", "set_vote_option")
            .add_attribute(
                "vote_option_map",
                serde_json::to_string(&vote_option_map).unwrap_or_else(|_| "[]".to_string()),
            )
            .add_attribute("max_vote_options", max_vote_options.to_string());
        Ok(res)
    }
}

// in voting - unified signup for both traditional and oracle modes
pub fn execute_sign_up(
    mut deps: DepsMut,
    env: Env,
    info: MessageInfo,
    pubkey: PubKey,
    certificate: Option<String>,
) -> Result<Response, ContractError> {
    let voting_time = VOTINGTIME.load(deps.storage)?;
    check_voting_time(env.clone(), voting_time)?;

    // Determine which mode to use based on certificate parameter
    let is_oracle_mode = certificate.is_some();

    // Load voice credit amount (unified for both modes)
    let voice_credit_amount = VOICE_CREDIT_AMOUNT.load(deps.storage)?;

    if is_oracle_mode {
        // Oracle mode: verify signature using voice_credit_amount
        let certificate = certificate.unwrap();

        // Check if oracle whitelist pubkey exists
        let oracle_whitelist_pubkey = ORACLE_WHITELIST_PUBKEY.may_load(deps.storage)?;
        if oracle_whitelist_pubkey.is_none() {
            return Err(ContractError::OracleWhitelistNotConfigured {});
        }
        let oracle_pubkey_str = oracle_whitelist_pubkey.unwrap();

        // Verify oracle signature using voice_credit_amount as the standard amount
        // Convert contract address to uint256 format to match api-maci
        let contract_address_uint256 = address_to_uint256(&env.contract.address);

        let payload = serde_json::json!({
            "amount": voice_credit_amount.to_string(),
            "contract_address": contract_address_uint256.to_string(),
            "pubkey_x": pubkey.x.to_string(),
            "pubkey_y": pubkey.y.to_string(),
        });

        let msg = payload.to_string().into_bytes();
        let hash = Sha256::digest(&msg);

        let certificate_binary =
            Binary::from_base64(&certificate).map_err(|_| ContractError::InvalidBase64 {})?;
        let oracle_pubkey_binary =
            Binary::from_base64(&oracle_pubkey_str).map_err(|_| ContractError::InvalidBase64 {})?;
        let verify_result = deps
            .api
            .secp256k1_verify(
                hash.as_ref(),
                certificate_binary.as_slice(),
                oracle_pubkey_binary.as_slice(),
            )
            .map_err(|_| ContractError::VerificationFailed {})?;
        if !verify_result {
            return Err(ContractError::InvalidSignature {});
        }

        // Check if user already signed up in oracle mode - use pubkey instead of sender
        if ORACLE_WHITELIST.has(
            deps.storage,
            &(
                pubkey.x.to_be_bytes().to_vec(),
                pubkey.y.to_be_bytes().to_vec(),
            ),
        ) {
            return Err(ContractError::AlreadySignedUp {});
        }

        // Oracle verification passed - user is qualified
        // In amaci, all verified users get the same voice_credit_amount
    } else {
        // Traditional mode: check if whitelist exists
        let whitelist = WHITELIST.may_load(deps.storage)?;
        if whitelist.is_none() {
            return Err(ContractError::WhitelistNotConfigured {});
        }

        // Traditional mode: check whitelist
        if !is_whitelist(deps.as_ref(), &info.sender)? {
            return Err(ContractError::Unauthorized {});
        }

        if is_register(deps.as_ref(), &info.sender)? {
            return Err(ContractError::UserAlreadyRegistered {});
        }
    }

    let mut num_sign_ups = NUMSIGNUPS.load(deps.storage)?;
    let max_leaves_count = MAX_LEAVES_COUNT.load(deps.storage)?;

    // Load the scalar field value
    let snark_scalar_field =
        uint256_from_hex_string("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");

    // Check if the number of sign-ups is less than the maximum number of leaves
    assert!(num_sign_ups < max_leaves_count, "full");
    // Check if the pubkey values are within the allowed range
    assert!(
        pubkey.x < snark_scalar_field && pubkey.y < snark_scalar_field,
        "MACI: pubkey values should be less than the snark scalar field"
    );

    // Create a state leaf with the provided pubkey and voice credit amount
    let state_leaf = StateLeaf {
        pub_key: pubkey.clone(),
        voice_credit_balance: voice_credit_amount,
        vote_option_tree_root: Uint256::from_u128(0),
        nonce: Uint256::from_u128(0),
    }
    .hash_decativate_state_leaf();

    let state_index = num_sign_ups;
    // Enqueue the state leaf
    state_enqueue(&mut deps, state_leaf)?;
    num_sign_ups += Uint256::from_u128(1u128);

    // Save the updated state index and number of sign-ups
    NUMSIGNUPS.save(deps.storage, &num_sign_ups)?;
    // Save the actual state_index (0-based), not num_sign_ups
    SIGNUPED.save(
        deps.storage,
        &(
            pubkey.x.to_be_bytes().to_vec(),
            pubkey.y.to_be_bytes().to_vec(),
        ),
        &state_index,
    )?;

    // Update storage based on mode
    if is_oracle_mode {
        // Save oracle whitelist user - use pubkey instead of sender
        let oracle_user = OracleWhitelistUser {
            balance: voice_credit_amount,
            is_register: true,
        };
        ORACLE_WHITELIST.save(
            deps.storage,
            &(
                pubkey.x.to_be_bytes().to_vec(),
                pubkey.y.to_be_bytes().to_vec(),
            ),
            &oracle_user,
        )?;
    } else {
        // Update traditional whitelist
        let mut whitelist = WHITELIST.load(deps.storage)?;
        whitelist.register(&info.sender);
        WHITELIST.save(deps.storage, &whitelist)?;
    }

    Ok(Response::new()
        .add_attribute("action", "sign_up")
        .add_attribute(
            "mode",
            if is_oracle_mode {
                "oracle"
            } else {
                "traditional"
            },
        )
        .add_attribute("state_idx", state_index.to_string())
        .add_attribute(
            "pubkey",
            format!("{:?},{:?}", pubkey.x.to_string(), pubkey.y.to_string()),
        )
        .add_attribute("balance", voice_credit_amount.to_string()))
}

// in voting
pub fn execute_publish_message(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    message: MessageData,
    enc_pub_key: PubKey,
) -> Result<Response, ContractError> {
    // Check if the period status is Voting
    let voting_time = VOTINGTIME.load(deps.storage)?;
    check_voting_time(env, voting_time)?;
    // Load the scalar field value
    let snark_scalar_field =
        uint256_from_hex_string("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");

    // let snark_scalar_field = uint256_from_decimal_string(
    //     "21888242871839275222246405745257275088548364400416034343698204186575808495617",
    // );

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
        MSG_HASHES.save(
            deps.storage,
            (msg_chain_length + Uint256::from_u128(1u128))
                .to_be_bytes()
                .to_vec(),
            &hash_message_and_enc_pub_key(&message, &enc_pub_key, old_msg_hashes),
        )?;

        let old_chain_length = msg_chain_length;
        // Update the message chain length
        msg_chain_length += Uint256::from_u128(1u128);
        MSG_CHAIN_LENGTH.save(deps.storage, &msg_chain_length)?;
        // Return a success response
        Ok(Response::new()
            .add_attribute("action", "publish_message")
            .add_attribute("msg_chain_length", old_chain_length.to_string())
            .add_attribute(
                "message",
                serde_json::to_string(&message.data).unwrap_or_else(|_| "[]".to_string()),
            )
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
    let snark_scalar_field =
        uint256_from_hex_string("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");

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
            let new_hash = hash_message_and_enc_pub_key(message, enc_pub_key, old_msg_hashes);
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
                serde_json::to_string(&message.data).unwrap_or_else(|_| "[]".to_string()),
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

// in voting
pub fn execute_publish_deactivate_message(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    message: MessageData,
    enc_pub_key: PubKey,
) -> Result<Response, ContractError> {
    // Check if the period status is Voting
    let voting_time = VOTINGTIME.load(deps.storage)?;
    check_voting_time(env.clone(), voting_time)?;

    // Load the scalar field value
    let snark_scalar_field =
        uint256_from_hex_string("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    let mut dmsg_chain_length = DMSG_CHAIN_LENGTH.load(deps.storage)?;

    let maci_parameters: MaciParameters = MACIPARAMETERS.load(deps.storage)?;
    // Calculate maximum allowed deactivate messages: 5^(state_tree_depth+2)-1
    let max_deactivate_messages = Uint256::from_u128(5u128).pow(
        (maci_parameters.state_tree_depth + Uint256::from_u128(2u128))
            .to_string()
            .parse()
            .unwrap(),
    ) - Uint256::from_u128(1u128);
    if dmsg_chain_length + Uint256::from_u128(1u128) > max_deactivate_messages {
        return Err(ContractError::MaxDeactivateMessagesReached {
            max_deactivate_messages,
        });
    }
    // let snark_scalar_field = uint256_from_decimal_string(
    //     "21888242871839275222246405745257275088548364400416034343698204186575808495617",
    // );
    // Check if the encrypted public key is valid
    if enc_pub_key.x != Uint256::from_u128(0u128)
        && enc_pub_key.y != Uint256::from_u128(1u128)
        && enc_pub_key.x < snark_scalar_field
        && enc_pub_key.y < snark_scalar_field
    {
        let processed_dmsg_count = PROCESSED_DMSG_COUNT.load(deps.storage)?;

        // When the processed_dmsg_count catches up with dmsg_chain_length, it indicates that the previous batch has been processed.
        // At this point, the new incoming message is the first one of the new batch, and we record the timestamp.
        if processed_dmsg_count == dmsg_chain_length {
            FIRST_DMSG_TIMESTAMP.save(deps.storage, &env.block.time)?;
        }

        let old_msg_hashes =
            DMSG_HASHES.load(deps.storage, dmsg_chain_length.to_be_bytes().to_vec())?;

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
        n[4] = old_msg_hashes;

        let m_hash = hash5(m);

        let n_hash = hash5(n);
        let m_n_hash = hash2([m_hash, n_hash]);

        // Compute the new message hash using the provided message, encrypted public key, and previous hash
        DMSG_HASHES.save(
            deps.storage,
            (dmsg_chain_length + Uint256::from_u128(1u128))
                .to_be_bytes()
                .to_vec(),
            &m_n_hash,
        )?;

        let state_root = state_root(deps.as_ref());

        STATE_ROOT_BY_DMSG.save(
            deps.storage,
            (dmsg_chain_length + Uint256::from_u128(1u128))
                .to_be_bytes()
                .to_vec(),
            &state_root,
        )?;

        let old_chain_length = dmsg_chain_length;
        // Update the message chain length
        dmsg_chain_length += Uint256::from_u128(1u128);
        DMSG_CHAIN_LENGTH.save(deps.storage, &dmsg_chain_length)?;

        let mut deactivate_count = DEACTIVATE_COUNT.load(deps.storage)?;
        deactivate_count += 1u128;
        DEACTIVATE_COUNT.save(deps.storage, &deactivate_count)?;

        let num_sign_ups = NUMSIGNUPS.load(deps.storage)?;

        Ok(Response::new()
            .add_attribute("action", "publish_deactivate_message")
            .add_attribute("dmsg_chain_length", old_chain_length.to_string())
            .add_attribute("num_sign_ups", num_sign_ups.to_string())
            .add_attribute(
                "message",
                serde_json::to_string(&message.data).unwrap_or_else(|_| "[]".to_string()),
            )
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
            .add_attribute("action", "publish_deactivate_message")
            .add_attribute("event", "error user."))
    }
}

pub fn execute_upload_deactivate_message(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    deactivate_message: Vec<Vec<Uint256>>,
) -> Result<Response, ContractError> {
    if !is_operator(deps.as_ref(), &info.sender.as_ref())? {
        Err(ContractError::Unauthorized {})
    } else {
        let deactivate_format_data: Vec<Vec<String>> = deactivate_message
            .iter()
            .map(|input| input.iter().map(|f| f.to_string()).collect())
            .collect();
        MACI_DEACTIVATE_MESSAGE.save(
            deps.storage,
            &env.contract.address,
            &deactivate_format_data,
        )?;
        // MACI_DEACTIVATE_OPERATOR.save(deps.storage, &contract_address, &info.sender)?;

        Ok(Response::new()
            .add_attribute("action", "upload_deactivate_message")
            .add_attribute("contract_address", &env.contract.address.to_string())
            .add_attribute("maci_operator", &info.sender.to_string())
            .add_attribute(
                "deactivate_message",
                serde_json::to_string(&deactivate_format_data).unwrap_or_else(|_| "{}".to_string()),
            ))
    }
}

// all time
pub fn execute_process_deactivate_message(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    size: Uint256,
    new_deactivate_commitment: Uint256,
    new_deactivate_root: Uint256,
    groth16_proof: Groth16ProofType,
) -> Result<Response, ContractError> {
    // // Check if the period status is Voting
    // let voting_time = VOTINGTIME.load(deps.storage)?;
    // check_voting_time(env, voting_time)?;

    let processed_dmsg_count = PROCESSED_DMSG_COUNT.load(deps.storage)?;
    let dmsg_chain_length = DMSG_CHAIN_LENGTH.load(deps.storage)?;

    assert!(
        processed_dmsg_count < dmsg_chain_length,
        "all deactivate messages have been processed"
    );

    // Load the MACI parameters
    let parameters = MACIPARAMETERS.load(deps.storage)?;
    let batch_size = parameters.message_batch_size;

    assert!(size <= batch_size, "size overflow the batchsize");

    DNODES.save(
        deps.storage,
        Uint256::from_u128(0u128).to_be_bytes().to_vec(),
        &new_deactivate_root,
    )?;
    let mut input: [Uint256; 7] = [Uint256::zero(); 7];
    input[0] = new_deactivate_root;
    input[1] = COORDINATORHASH.load(deps.storage)?;
    let batch_start_index = processed_dmsg_count;
    let mut batch_end_index = batch_start_index + size;
    let dmsg_chain_length = DMSG_CHAIN_LENGTH.load(deps.storage)?;
    if batch_end_index > dmsg_chain_length {
        batch_end_index = dmsg_chain_length;
    }

    input[2] = DMSG_HASHES.load(deps.storage, batch_start_index.to_be_bytes().to_vec())?;
    input[3] = DMSG_HASHES.load(deps.storage, batch_end_index.to_be_bytes().to_vec())?;

    input[4] = CURRENT_DEACTIVATE_COMMITMENT.load(deps.storage)?;
    input[5] = new_deactivate_commitment;
    input[6] = STATE_ROOT_BY_DMSG.load(deps.storage, batch_end_index.to_be_bytes().to_vec())?;

    // Load the scalar field value
    let snark_scalar_field =
        uint256_from_hex_string("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    // let snark_scalar_field = uint256_from_decimal_string(
    //     "21888242871839275222246405745257275088548364400416034343698204186575808495617",
    // );

    // Compute the hash of the input values
    let input_hash = uint256_from_hex_string(&hash_256_uint256_list(&input)) % snark_scalar_field;
    // Load the process verification keys
    let deactivate_vkeys_str = GROTH16_DEACTIVATE_VKEYS.load(deps.storage)?;

    // Parse the SNARK proof
    let proof_str = Groth16ProofStr {
        pi_a: hex::decode(groth16_proof.a.clone())
            .map_err(|_| ContractError::HexDecodingError {})?,
        pi_b: hex::decode(groth16_proof.b.clone())
            .map_err(|_| ContractError::HexDecodingError {})?,
        pi_c: hex::decode(groth16_proof.c.clone())
            .map_err(|_| ContractError::HexDecodingError {})?,
    };

    // Parse the verification key and prepare for verification
    let vkey = parse_groth16_vkey::<Bn256>(deactivate_vkeys_str)?;
    let pvk = prepare_verifying_key(&vkey);

    // Parse the proof and prepare for verification
    let pof = parse_groth16_proof::<Bn256>(proof_str.clone())?;

    // Verify the SNARK proof using the input hash
    let is_passed = groth16_verify(&pvk, &pof, &[uint256_to_field(&input_hash)]).unwrap();

    // If the proof verification fails, return an error
    if !is_passed {
        return Err(ContractError::InvalidProof {
            step: String::from("ProcessDeactivate"),
        });
    }

    CURRENT_DEACTIVATE_COMMITMENT.save(deps.storage, &new_deactivate_commitment)?;
    PROCESSED_DMSG_COUNT.save(
        deps.storage,
        &(processed_dmsg_count + batch_end_index - batch_start_index),
    )?;
    let mut attributes = vec![
        attr("zk_verify", is_passed.to_string()),
        attr("commitment", new_deactivate_commitment.to_string()),
        attr(
            "proof",
            serde_json::to_string(&groth16_proof).unwrap_or_else(|_| "{}".to_string()),
        ),
        attr("certification_system", "groth16"),
        attr("processed_dmsg_count", processed_dmsg_count.to_string()),
    ];

    let first_dmsg_time: Timestamp = FIRST_DMSG_TIMESTAMP.load(deps.storage)?;
    let current_time = env.block.time;

    let different_time: u64 = current_time.seconds() - first_dmsg_time.seconds();

    if different_time > DEACTIVATE_DELAY.load(deps.storage)?.seconds() {
        let mut delay_records = DELAY_RECORDS.load(deps.storage)?;
        let delay_timestamp = first_dmsg_time;
        let delay_duration = different_time;
        let delay_reason = format!(
            "Processing of {} deactivate messages has timed out after {} seconds",
            size, different_time
        );
        let delay_process_dmsg_count = batch_end_index - batch_start_index;
        let delay_type = DelayType::DeactivateDelay;
        let delay_record = DelayRecord {
            delay_timestamp: delay_timestamp.clone(),
            delay_duration: delay_duration.clone(),
            delay_reason: delay_reason.clone(),
            delay_process_dmsg_count: delay_process_dmsg_count.clone(),
            delay_type,
        };
        delay_records.records.push(delay_record);
        DELAY_RECORDS.save(deps.storage, &delay_records)?;
        attributes.push(attr(
            "delay_timestamp",
            delay_timestamp.seconds().to_string(),
        ));
        attributes.push(attr("delay_duration", delay_duration.to_string()));
        attributes.push(attr(
            "delay_process_dmsg_count",
            delay_process_dmsg_count.to_string(),
        ));
        attributes.push(attr("delay_reason", delay_reason));

        attributes.push(attr("delay_type", "deactivate_delay"));
    }

    Ok(Response::new()
        .add_attribute("action", "process_deactivate_message")
        .add_attributes(attributes))
}

// in voting
pub fn execute_add_new_key(
    mut deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    pubkey: PubKey,
    nullifier: Uint256,
    d: [Uint256; 4],
    groth16_proof: Groth16ProofType,
) -> Result<Response, ContractError> {
    // Check if the period status is Voting
    let voting_time = VOTINGTIME.load(deps.storage)?;
    check_voting_time(env, voting_time)?;

    if NULLIFIERS.has(deps.storage, nullifier.to_be_bytes().to_vec()) {
        // Return an error response for invalid user or encrypted public key
        return Err(ContractError::NewKeyExist {});
    }

    NULLIFIERS.save(deps.storage, nullifier.to_be_bytes().to_vec(), &true)?;

    let mut num_sign_ups = NUMSIGNUPS.load(deps.storage)?;

    let max_leaves_count = MAX_LEAVES_COUNT.load(deps.storage)?;

    // // Load the scalar field value
    let snark_scalar_field =
        uint256_from_hex_string("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");

    assert!(num_sign_ups < max_leaves_count, "full");
    // Check if the pubkey values are within the allowed range
    assert!(
        pubkey.x < snark_scalar_field && pubkey.y < snark_scalar_field,
        "MACI: pubkey values should be less than the snark scalar field"
    );

    let mut input: [Uint256; 7] = [Uint256::zero(); 7];
    input[0] = DNODES.load(
        deps.storage,
        Uint256::from_u128(0u128).to_be_bytes().to_vec(),
    )?;
    input[1] = COORDINATORHASH.load(deps.storage)?;
    input[2] = nullifier;
    input[3] = d[0];
    input[4] = d[1];
    input[5] = d[2];
    input[6] = d[3];

    // Load the scalar field value
    let snark_scalar_field =
        uint256_from_hex_string("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    //     "21888242871839275222246405745257275088548364400416034343698204186575808495617",

    // Compute the hash of the input values
    let input_hash = uint256_from_hex_string(&hash_256_uint256_list(&input)) % snark_scalar_field; // input hash

    // Load the process verification keys
    let process_vkeys_str = GROTH16_NEWKEY_VKEYS.load(deps.storage)?;

    // Parse the SNARK proof
    let proof_str = Groth16ProofStr {
        pi_a: hex::decode(groth16_proof.a.clone())
            .map_err(|_| ContractError::HexDecodingError {})?,
        pi_b: hex::decode(groth16_proof.b.clone())
            .map_err(|_| ContractError::HexDecodingError {})?,
        pi_c: hex::decode(groth16_proof.c.clone())
            .map_err(|_| ContractError::HexDecodingError {})?,
    };

    // Parse the verification key and prepare for verification
    let vkey = parse_groth16_vkey::<Bn256>(process_vkeys_str)?;
    let pvk = prepare_verifying_key(&vkey);

    // Parse the proof and prepare for verification
    let pof = parse_groth16_proof::<Bn256>(proof_str.clone())?;

    // Verify the SNARK proof using the input hash
    let is_passed = groth16_verify(&pvk, &pof, &[uint256_to_field(&input_hash)]).unwrap();

    // If the proof verification fails, return an error
    if !is_passed {
        return Err(ContractError::InvalidProof {
            step: String::from("AddNewKey"),
        });
    }

    // let user_balance = user_balance_of(deps.as_ref(), info.sender.as_ref())?;
    // if user_balance == Uint256::from_u128(0u128) {
    //     return Err(ContractError::Unauthorized {});
    // }

    let voice_credit_amount = VOICE_CREDIT_AMOUNT.load(deps.storage)?;

    // let voice_credit_balance = VOICECREDITBALANCE.load(deps.storage, )
    // Create a state leaf with the provided pubkey and amount
    let state_leaf = StateLeaf {
        pub_key: pubkey.clone(),
        voice_credit_balance: voice_credit_amount,
        vote_option_tree_root: Uint256::from_u128(0),
        nonce: Uint256::from_u128(0),
    }
    .hash_new_key_state_leaf(d);

    let state_index = num_sign_ups;
    // Enqueue the state leaf
    state_enqueue(&mut deps, state_leaf)?;

    num_sign_ups += Uint256::from_u128(1u128);

    NUMSIGNUPS.save(deps.storage, &num_sign_ups)?;
    // Save the actual state_index (0-based), not num_sign_ups
    SIGNUPED.save(
        deps.storage,
        &(
            pubkey.x.to_be_bytes().to_vec(),
            pubkey.y.to_be_bytes().to_vec(),
        ),
        &state_index,
    )?;

    Ok(Response::new()
        .add_attribute("action", "add_new_key")
        .add_attribute("state_idx", state_index.to_string())
        .add_attribute(
            "pubkey",
            format!("{:?},{:?}", pubkey.x.to_string(), pubkey.y.to_string()),
        )
        .add_attribute("balance", voice_credit_amount.to_string())
        .add_attribute("d0", d[0].to_string())
        .add_attribute("d1", d[1].to_string())
        .add_attribute("d2", d[2].to_string())
        .add_attribute("d3", d[3].to_string()))
}

// in voting
pub fn execute_pre_add_new_key(
    mut deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    pubkey: PubKey,
    nullifier: Uint256,
    d: [Uint256; 4],
    groth16_proof: Groth16ProofType,
) -> Result<Response, ContractError> {
    // Check if the period status is Voting
    let voting_time = VOTINGTIME.load(deps.storage)?;
    check_voting_time(env, voting_time)?;

    if NULLIFIERS.has(deps.storage, nullifier.to_be_bytes().to_vec()) {
        // Return an error response for invalid user or encrypted public key
        return Err(ContractError::NewKeyExist {});
    }

    NULLIFIERS.save(deps.storage, nullifier.to_be_bytes().to_vec(), &true)?;

    let mut num_sign_ups = NUMSIGNUPS.load(deps.storage)?;

    let max_leaves_count = MAX_LEAVES_COUNT.load(deps.storage)?;

    // // Load the scalar field value
    let snark_scalar_field =
        uint256_from_hex_string("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");

    assert!(num_sign_ups < max_leaves_count, "full");
    // Check if the pubkey values are within the allowed range
    assert!(
        pubkey.x < snark_scalar_field && pubkey.y < snark_scalar_field,
        "MACI: pubkey values should be less than the snark scalar field"
    );

    let mut input: [Uint256; 7] = [Uint256::zero(); 7];

    input[0] = PRE_DEACTIVATE_ROOT.load(deps.storage)?;

    // Use pre_deactivate_coordinator hash if available, otherwise fall back to COORDINATORHASH
    input[1] = match PRE_DEACTIVATE_COORDINATOR_HASH.may_load(deps.storage)? {
        Some(hash) => hash,
        None => COORDINATORHASH.load(deps.storage)?,
    };

    input[2] = nullifier;
    input[3] = d[0];
    input[4] = d[1];
    input[5] = d[2];
    input[6] = d[3];

    // Load the scalar field value
    let snark_scalar_field =
        uint256_from_hex_string("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    //     "21888242871839275222246405745257275088548364400416034343698204186575808495617",

    // Compute the hash of the input values
    let input_hash = uint256_from_hex_string(&hash_256_uint256_list(&input)) % snark_scalar_field; // input hash

    // Load the process verification keys
    let process_vkeys_str = GROTH16_NEWKEY_VKEYS.load(deps.storage)?;

    // Parse the SNARK proof
    let proof_str = Groth16ProofStr {
        pi_a: hex::decode(groth16_proof.a.clone())
            .map_err(|_| ContractError::HexDecodingError {})?,
        pi_b: hex::decode(groth16_proof.b.clone())
            .map_err(|_| ContractError::HexDecodingError {})?,
        pi_c: hex::decode(groth16_proof.c.clone())
            .map_err(|_| ContractError::HexDecodingError {})?,
    };

    // Parse the verification key and prepare for verification
    let vkey = parse_groth16_vkey::<Bn256>(process_vkeys_str)?;
    let pvk = prepare_verifying_key(&vkey);

    // Parse the proof and prepare for verification
    let pof = parse_groth16_proof::<Bn256>(proof_str.clone())?;

    // Verify the SNARK proof using the input hash
    let is_passed = groth16_verify(&pvk, &pof, &[uint256_to_field(&input_hash)]).unwrap();

    // If the proof verification fails, return an error
    if !is_passed {
        return Err(ContractError::InvalidProof {
            step: String::from("PreAddNewKey"),
        });
    }

    let voice_credit_amount = VOICE_CREDIT_AMOUNT.load(deps.storage)?;

    // let voice_credit_balance = VOICECREDITBALANCE.load(deps.storage, )
    // Create a state leaf with the provided pubkey and amount
    let state_leaf = StateLeaf {
        pub_key: pubkey.clone(),
        voice_credit_balance: voice_credit_amount,
        vote_option_tree_root: Uint256::from_u128(0),
        nonce: Uint256::from_u128(0),
    }
    .hash_decativate_state_leaf();

    let state_index = num_sign_ups;
    // Enqueue the state leaf
    state_enqueue(&mut deps, state_leaf)?;

    num_sign_ups += Uint256::from_u128(1u128);

    NUMSIGNUPS.save(deps.storage, &num_sign_ups)?;
    // Save the actual state_index (0-based), not num_sign_ups
    SIGNUPED.save(
        deps.storage,
        &(
            pubkey.x.to_be_bytes().to_vec(),
            pubkey.y.to_be_bytes().to_vec(),
        ),
        &state_index,
    )?;

    Ok(Response::new()
        .add_attribute("action", "pre_add_new_key")
        .add_attribute("state_idx", state_index.to_string())
        .add_attribute(
            "pubkey",
            format!("{:?},{:?}", pubkey.x.to_string(), pubkey.y.to_string()),
        )
        .add_attribute("balance", voice_credit_amount.to_string()))
}

pub fn execute_start_process_period(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
) -> Result<Response, ContractError> {
    let period = PERIOD.load(deps.storage)?;
    let voting_time = VOTINGTIME.load(deps.storage)?;

    if env.block.time <= voting_time.end_time {
        return Err(ContractError::PeriodError {});
    } else {
        if period.status == PeriodStatus::Ended
            || period.status == PeriodStatus::Processing
            || period.status == PeriodStatus::Tallying
        {
            return Err(ContractError::PeriodError {});
        }
    }

    let processed_dmsg_count = PROCESSED_DMSG_COUNT.load(deps.storage)?;
    let dmsg_chain_length = DMSG_CHAIN_LENGTH.load(deps.storage)?;

    // Check that all deactivate messages have been processed
    if processed_dmsg_count != dmsg_chain_length {
        return Err(ContractError::DmsgLeftProcess {});
    }

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
    groth16_proof: Groth16ProofType,
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
    let mut input: [Uint256; 7] = [Uint256::zero(); 7];

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

    // input[0] = (num_sign_ups << 32) + max_vote_options; // packedVals

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
    let mut batch_end_index = batch_start_index.clone() + batch_size;
    if batch_end_index > msg_chain_length {
        batch_end_index = msg_chain_length;
    }

    // Load the hash of the message at the batch start index
    input[2] = MSG_HASHES.load(
        deps.storage,
        batch_start_index.clone().to_be_bytes().to_vec(),
    )?; // batchStartHash

    // Load the hash of the message at the batch end index
    input[3] = MSG_HASHES.load(deps.storage, batch_end_index.to_be_bytes().to_vec())?; // batchEndHash

    // Load the current state commitment
    let current_state_commitment = CURRENT_STATE_COMMITMENT.load(deps.storage)?;
    input[4] = current_state_commitment;

    // Set the new state commitment
    input[5] = new_state_commitment;
    input[6] = CURRENT_DEACTIVATE_COMMITMENT.load(deps.storage)?;

    // Load the scalar field value
    let snark_scalar_field =
        uint256_from_hex_string("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    //     "21888242871839275222246405745257275088548364400416034343698204186575808495617",

    // Compute the hash of the input values
    let input_hash = uint256_from_hex_string(&hash_256_uint256_list(&input)) % snark_scalar_field; // input hash

    let groth16_proof_data = groth16_proof;
    // Load the process verification keys
    let process_vkeys_str = GROTH16_PROCESS_VKEYS.load(deps.storage)?;

    // Parse the SNARK proof
    let proof_str = Groth16ProofStr {
        pi_a: hex::decode(groth16_proof_data.a.clone())
            .map_err(|_| ContractError::HexDecodingError {})?,
        pi_b: hex::decode(groth16_proof_data.b.clone())
            .map_err(|_| ContractError::HexDecodingError {})?,
        pi_c: hex::decode(groth16_proof_data.c.clone())
            .map_err(|_| ContractError::HexDecodingError {})?,
    };

    // Parse the verification key and prepare for verification
    let vkey = parse_groth16_vkey::<Bn256>(process_vkeys_str)?;
    let pvk = prepare_verifying_key(&vkey);

    // Parse the proof and prepare for verification
    let pof = parse_groth16_proof::<Bn256>(proof_str.clone())?;

    // Verify the SNARK proof using the input hash
    let is_passed = groth16_verify(&pvk, &pof, &[uint256_to_field(&input_hash)]).unwrap();

    // If the proof verification fails, return an error
    if !is_passed {
        return Err(ContractError::InvalidProof {
            step: String::from("Process"),
        });
    }

    let attributes = vec![
        attr("zk_verify", is_passed.to_string()),
        attr("commitment", new_state_commitment.to_string()),
        attr(
            "proof",
            serde_json::to_string(&groth16_proof_data).unwrap_or_else(|_| "{}".to_string()),
        ),
        attr("certification_system", "groth16"),
        attr("processed_msg_count", processed_msg_count.to_string()),
    ];

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
    groth16_proof: Groth16ProofType,
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
    // Calculate the batch size
    let batch_size =
        Uint256::from_u128(5u128).pow(parameters.int_state_tree_depth.to_string().parse().unwrap());
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

    // Load the scalar field value
    let snark_scalar_field =
        uint256_from_hex_string("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    // let snark_scalar_field = uint256_from_decimal_string(
    //     "21888242871839275222246405745257275088548364400416034343698204186575808495617",
    // );

    // Compute the hash of the input values
    let input_hash = uint256_from_hex_string(&hash_256_uint256_list(&input)) % snark_scalar_field;

    let groth16_proof_data = groth16_proof;
    // Load the tally verification keys
    let tally_vkeys_str = GROTH16_TALLY_VKEYS.load(deps.storage)?;

    // Parse the SNARK proof
    let proof_str = Groth16ProofStr {
        pi_a: hex::decode(groth16_proof_data.a.clone())
            .map_err(|_| ContractError::HexDecodingError {})?,
        pi_b: hex::decode(groth16_proof_data.b.clone())
            .map_err(|_| ContractError::HexDecodingError {})?,
        pi_c: hex::decode(groth16_proof_data.c.clone())
            .map_err(|_| ContractError::HexDecodingError {})?,
    };

    // Parse the verification key and prepare for verification
    let vkey = parse_groth16_vkey::<Bn256>(tally_vkeys_str)?;
    let pvk = prepare_verifying_key(&vkey);

    // Parse the proof and prepare for verification
    let pof = parse_groth16_proof::<Bn256>(proof_str.clone())?;

    // Verify the SNARK proof using the input hash
    let is_passed = groth16_verify(&pvk, &pof, &[uint256_to_field(&input_hash)]).unwrap();

    // If the proof verification fails, return an error
    if !is_passed {
        return Err(ContractError::InvalidProof {
            step: String::from("Tally"),
        });
    }

    let attributes = vec![
        attr("zk_verify", is_passed.to_string()),
        attr("commitment", new_tally_commitment.to_string()),
        attr(
            "proof",
            serde_json::to_string(&groth16_proof_data).unwrap_or_else(|_| "{}".to_string()),
        ),
        attr("certification_system", "groth16"),
        attr("processed_user_count", processed_user_count.to_string()),
    ];

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
    env: Env,
    _info: MessageInfo,
    results: Vec<Uint256>,
    salt: Uint256,
) -> Result<Response, ContractError> {
    let period = PERIOD.load(deps.storage)?;
    // Check if the period status is Tallying
    if period.status != PeriodStatus::Tallying {
        return Err(ContractError::PeriodError {});
    }

    // Get the final signup count and message count
    let num_sign_ups = NUMSIGNUPS.load(deps.storage)?;
    let msg_chain_length = MSG_CHAIN_LENGTH.load(deps.storage)?;

    // Calculate total workload (signup and message have same weight)
    let total_work = num_sign_ups + msg_chain_length;

    let total_work_u128 = total_work
        .try_into() // Uint256 -> Uint128
        .map(|x: Uint128| x.u128()) // Uint128 -> u128
        .map_err(|_| ContractError::ValueTooLarge {})?;

    // Calculate actual delay timeout (linear change between min hours to max hours)
    let actual_delay: TallyDelayInfo = calculate_tally_delay(deps.as_ref())?;
    let voting_time = VOTINGTIME.load(deps.storage)?;
    let current_time = env.block.time;
    let different_time = current_time.seconds() - voting_time.end_time.seconds();

    let mut attributes = vec![
        attr("total_work", total_work_u128.to_string()),
        attr(
            "actual_delay_seconds",
            actual_delay.delay_seconds.to_string(),
        ),
    ];

    if different_time > actual_delay.delay_seconds {
        let delay_timestamp = voting_time.end_time;
        let delay_duration = different_time;
        let delay_reason = format!(
            "Tallying has timed out after {} seconds (total process: {}, allowed: {} seconds)",
            different_time, total_work_u128, actual_delay.delay_seconds
        );
        let delay_process_dmsg_count = Uint256::from_u128(0u128);
        let delay_type = DelayType::TallyDelay;

        let mut delay_records = DELAY_RECORDS.load(deps.storage)?;
        let delay_record = DelayRecord {
            delay_timestamp: delay_timestamp.clone(),
            delay_duration: delay_duration.clone(),
            delay_reason: delay_reason.clone(),
            delay_process_dmsg_count,
            delay_type,
        };
        delay_records.records.push(delay_record);
        DELAY_RECORDS.save(deps.storage, &delay_records)?;

        attributes.extend(vec![
            attr("delay_timestamp", delay_timestamp.seconds().to_string()),
            attr("delay_duration", delay_duration.to_string()),
            attr("delay_reason", delay_reason),
            attr("delay_type", "tally_delay"),
        ]);
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
                serde_json::to_string(
                    &results
                        .iter()
                        .map(|x| x.to_string())
                        .collect::<Vec<String>>(),
                )
                .unwrap_or_else(|_| "[]".to_string()),
            )
            .add_attribute("all_result", sum.to_string())
            .add_attributes(attributes));
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
            serde_json::to_string(
                &results
                    .iter()
                    .map(|x| x.to_string())
                    .collect::<Vec<String>>(),
            )
            .unwrap_or_else(|_| "[]".to_string()),
        )
        .add_attribute("all_result", sum.to_string())
        .add_attributes(attributes))
}

fn execute_claim(deps: DepsMut, env: Env, _info: MessageInfo) -> Result<Response, ContractError> {
    let period = PERIOD.load(deps.storage)?;
    let voting_time: VotingTime = VOTINGTIME.load(deps.storage)?;
    let current_time = env.block.time;
    let admin = ADMIN.load(deps.storage)?.admin;
    let operator = MACI_OPERATOR.load(deps.storage)?;
    let fee_recipient = FEE_RECIPIENT.load(deps.storage)?;

    let denom = "peaka".to_string();
    let contract_address = env.contract.address.clone();
    let contract_balance = deps.querier.query_balance(contract_address, &denom)?;
    let contract_balance_amount = contract_balance.amount.u128();

    if contract_balance_amount == 0u128 {
        return Err(ContractError::AllFundsClaimed {});
    }

    let tally_timeout: Timestamp = TALLY_TIMEOUT.load(deps.storage)?;
    // If exceeding the timeout, return all funds to admin
    if current_time > voting_time.end_time.plus_seconds(tally_timeout.seconds()) {
        let message = BankMsg::Send {
            to_address: admin.to_string(),
            amount: coins(contract_balance_amount, denom),
        };

        return Ok(Response::new()
            .add_message(message)
            .add_attribute("action", "claim")
            .add_attribute(
                "is_ended",
                (period.status == PeriodStatus::Ended).to_string(),
            )
            .add_attribute("operator_reward", "0")
            .add_attribute("penalty_amount", contract_balance_amount.to_string())
            .add_attribute("miss_rate", Uint256::from_u128(0u128).to_string())
            .add_attribute("is_tally_timeout", "true"));
    }

    // If less than timeout and status is not Ended, return an error
    if period.status != PeriodStatus::Ended {
        return Err(ContractError::PeriodError {});
    }

    // First allocate 10% to fee_recipient
    let fee_rate = Decimal::from_ratio(1u128, 10u128); // 10%
    let fee_amount = Uint128::from(contract_balance_amount) * fee_rate;
    let remaining_amount = Uint128::from(contract_balance_amount) - fee_amount;

    // Calculate distribution between operator and admin
    let performance = calculate_operator_performance(deps.as_ref())?;
    let withdraw_amount = Uint256::from_u128(remaining_amount.u128());

    // Calculate operator reward based on miss rate
    let operator_reward =
        withdraw_amount.multiply_ratio(performance.miss_rate, Uint256::from_u128(100u128));
    // Calculate penalty amount
    let penalty_amount = withdraw_amount - operator_reward;

    let mut messages: Vec<CosmosMsg> = vec![];

    // Send 10% to fee_recipient
    if !fee_amount.is_zero() {
        messages.push(CosmosMsg::Bank(BankMsg::Send {
            to_address: fee_recipient.to_string(),
            amount: coins(fee_amount.u128(), denom.clone()),
        }));
    }

    // Send penalty amount to admin
    let penalty_u128_amount = penalty_amount
        .try_into() // Uint256 -> Uint128
        .map(|x: Uint128| x.u128()) // Uint128 -> u128
        .map_err(|_| ContractError::ValueTooLarge {})?;

    if !penalty_amount.is_zero() {
        messages.push(CosmosMsg::Bank(BankMsg::Send {
            to_address: admin.to_string(),
            amount: coins(penalty_u128_amount, denom.clone()),
        }));
    }

    // Send remaining reward to operator
    let operator_reward_u128_amount = operator_reward
        .try_into()
        .map(|x: Uint128| x.u128())
        .map_err(|_| ContractError::ValueTooLarge {})?;

    if !operator_reward.is_zero() {
        messages.push(CosmosMsg::Bank(BankMsg::Send {
            to_address: operator.to_string(),
            amount: coins(operator_reward_u128_amount, denom.clone()),
        }));
    }

    Ok(Response::new()
        .add_messages(messages)
        .add_attribute("action", "claim")
        .add_attribute("is_ended", "true")
        .add_attribute("fee_to_recipient", fee_amount.to_string())
        .add_attribute("operator_reward", operator_reward_u128_amount.to_string())
        .add_attribute("penalty_amount", penalty_u128_amount.to_string())
        .add_attribute("miss_rate", performance.miss_rate.to_string())
        .add_attribute("is_tally_timeout", "false"))
}

fn can_sign_up(deps: Deps, sender: &Addr) -> StdResult<bool> {
    let cfg = WHITELIST.load(deps.storage)?;
    let is_whitelist = cfg.is_whitelist(sender);
    let is_register = cfg.is_register(sender);
    Ok(is_whitelist && !is_register)
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
    state_update_at(deps, leaf_idx)
}

// Updates the state at the given index in the tree
fn state_update_at(deps: &mut DepsMut, index: Uint256) -> Result<bool, ContractError> {
    let leaf_idx0 = LEAF_IDX_0.load(deps.storage).unwrap();
    if index < leaf_idx0 {
        return Err(ContractError::MustUpdate {});
    }

    let mut idx = index.clone();

    let mut height = 0;

    let zeros = ZEROS_H10.load(deps.storage).unwrap();

    while idx > Uint256::from_u128(0u128) {
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

fn check_voting_time(env: Env, voting_time: VotingTime) -> Result<(), ContractError> {
    let current_time = env.block.time;

    // Check if the current time is within the voting time range (inclusive of start and end time)
    if current_time < voting_time.start_time || current_time > voting_time.end_time {
        return Err(ContractError::PeriodError {});
    }

    Ok(())
}

pub fn hash_message_and_enc_pub_key(
    message: &MessageData,
    enc_pub_key: &PubKey,
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
fn is_admin(deps: Deps, sender: &str) -> StdResult<bool> {
    let cfg = ADMIN.load(deps.storage)?;
    let can = cfg.is_admin(&sender);
    Ok(can)
}

// Only operator can execute
fn is_operator(deps: Deps, sender: &str) -> StdResult<bool> {
    let operator = MACI_OPERATOR.load(deps.storage)?;
    let can_operator = sender.to_string() == operator.to_string();
    Ok(can_operator)
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Admin {} => to_json_binary(&ADMIN.load(deps.storage)?.admin),
        QueryMsg::Operator {} => to_json_binary(&MACI_OPERATOR.load(deps.storage)?),
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
        QueryMsg::GetDMsgChainLength {} => to_json_binary::<Uint256>(
            &DMSG_CHAIN_LENGTH
                .may_load(deps.storage)?
                .unwrap_or_default(),
        ),
        QueryMsg::GetProcessedDMsgCount {} => to_json_binary::<Uint256>(
            &PROCESSED_DMSG_COUNT
                .may_load(deps.storage)?
                .unwrap_or_default(),
        ),
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
        QueryMsg::GetStateTreeRoot {} => to_json_binary::<Uint256>(&state_root(deps)),
        QueryMsg::GetNode { index } => {
            let node = NODES
                .may_load(deps.storage, index.to_be_bytes().to_vec())?
                .unwrap_or_default();
            to_json_binary::<Uint256>(&node)
        }
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
        QueryMsg::GetVoiceCreditAmount {} => to_json_binary::<Uint256>(
            &VOICE_CREDIT_AMOUNT
                .may_load(deps.storage)?
                .unwrap_or_default(),
        ),
        QueryMsg::WhiteList {} => to_json_binary::<Whitelist>(&query_white_list(deps)?),
        QueryMsg::CanSignUp { sender } => {
            to_json_binary::<bool>(&query_can_sign_up(deps, &sender)?)
        }
        QueryMsg::IsWhiteList { sender } => to_json_binary::<bool>(&is_whitelist(deps, &sender)?),
        QueryMsg::IsRegister { sender } => to_json_binary::<bool>(&is_register(deps, &sender)?),
        QueryMsg::Signuped { pubkey } => {
            let state_idx = SIGNUPED.may_load(
                deps.storage,
                &(
                    pubkey.x.to_be_bytes().to_vec(),
                    pubkey.y.to_be_bytes().to_vec(),
                ),
            )?;
            to_json_binary(&state_idx)
        }
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
        QueryMsg::QueryPreDeactivateRoot {} => to_json_binary::<Uint256>(
            &PRE_DEACTIVATE_ROOT
                .may_load(deps.storage)?
                .unwrap_or_default(),
        ),
        QueryMsg::QueryPreDeactivateCoordinatorHash {} => {
            let coordinator_hash = PRE_DEACTIVATE_COORDINATOR_HASH.may_load(deps.storage)?;
            to_json_binary(&coordinator_hash)
        }
        QueryMsg::GetDelayRecords {} => {
            let records = DELAY_RECORDS
                .may_load(deps.storage)?
                .unwrap_or(DelayRecords { records: vec![] });
            to_json_binary(&records)
        }
        QueryMsg::GetTallyDelay {} => {
            let delay_info = calculate_tally_delay(deps)
                .map_err(|e| cosmwasm_std::StdError::generic_err(e.to_string()))?;
            to_json_binary(&delay_info)
        }
        QueryMsg::QueryOracleWhitelistConfig {} => {
            let pubkey = ORACLE_WHITELIST_PUBKEY.may_load(deps.storage)?;
            to_json_binary(&pubkey)
        }
        QueryMsg::CanSignUpWithOracle {
            pubkey,
            certificate,
        } => {
            let can_signup = can_sign_up_with_oracle(deps, _env, pubkey, certificate)?;
            to_json_binary(&can_signup)
        }
        QueryMsg::WhiteBalanceOf {
            pubkey,
            certificate,
        } => {
            let balance = user_balance_of_oracle(deps, _env, pubkey, certificate)?;
            to_json_binary(&balance)
        }
        QueryMsg::QueryCurrentStateCommitment {} => {
            let current_state_commitment = CURRENT_STATE_COMMITMENT.may_load(deps.storage)?;
            to_json_binary(&current_state_commitment)
        }
        QueryMsg::GetCoordinatorHash {} => {
            let coordinator_hash = COORDINATORHASH.may_load(deps.storage)?;
            to_json_binary(&coordinator_hash)
        }
        QueryMsg::GetMsgHash { index } => {
            let msg_hash = MSG_HASHES
                .may_load(deps.storage, index.to_be_bytes().to_vec())?
                .unwrap_or_default();
            to_json_binary(&msg_hash)
        }
        QueryMsg::GetCurrentDeactivateCommitment {} => {
            let current_deactivate_commitment =
                CURRENT_DEACTIVATE_COMMITMENT.may_load(deps.storage)?;
            to_json_binary(&current_deactivate_commitment)
        }
    }
}

pub fn query_white_list(deps: Deps) -> StdResult<Whitelist> {
    let cfg = WHITELIST.load(deps.storage)?;
    Ok(Whitelist {
        users: cfg.users.into_iter().map(|a| a.into()).collect(),
    })
}

pub fn query_can_sign_up(deps: Deps, sender: &Addr) -> StdResult<bool> {
    Ok(can_sign_up(deps, &sender)?)
}

pub fn is_whitelist(deps: Deps, sender: &Addr) -> StdResult<bool> {
    let cfg = WHITELIST.load(deps.storage)?;
    let is_whitelist = cfg.is_whitelist(sender);
    Ok(is_whitelist)
}

pub fn is_register(deps: Deps, sender: &Addr) -> StdResult<bool> {
    let cfg = WHITELIST.load(deps.storage)?;
    let is_register = cfg.is_register(sender);
    Ok(is_register)
}

// pub fn query_user_balance_of(deps: Deps, sender: String) -> StdResult<Uint256> {
//     Ok(user_balance_of(deps, &sender)?)
// }

#[cfg(test)]
mod tests {}

// Check if the operator has processed all deactivate messages within 15 minutes
pub fn check_operator_process_time(deps: Deps, env: Env) -> Result<bool, ContractError> {
    let current_time = env.block.time;

    let first_dmsg_time = match FIRST_DMSG_TIMESTAMP.may_load(deps.storage)? {
        Some(timestamp) => timestamp,
        None => return Ok(true), // If there is no timestamp for first message, means no deactivate messages need to be processed
    };

    let processed_dmsg_count = PROCESSED_DMSG_COUNT.load(deps.storage)?;
    let dmsg_chain_length = DMSG_CHAIN_LENGTH.load(deps.storage)?;

    // If current batch is fully processed, return true
    if processed_dmsg_count == dmsg_chain_length {
        return Ok(true);
    }

    let time_difference = current_time.seconds() - first_dmsg_time.seconds();

    let deactivate_delay = DEACTIVATE_DELAY.load(deps.storage)?;
    if time_difference > deactivate_delay.seconds() {
        return Ok(false);
    }

    Ok(true)
}

#[cw_serde]
pub struct OperatorPerformance {
    pub delay_deactivate_count: Uint256,
    pub delay_tally_count: Uint256,
    pub miss_rate: Uint256, // Miss rate, range 0-100, represents percentage of operator's deserved reward
}

pub fn calculate_operator_performance(deps: Deps) -> Result<OperatorPerformance, ContractError> {
    let delay_records = DELAY_RECORDS.load(deps.storage)?;

    // Count number of different types of delay records
    let mut delay_deactivate_count = Uint256::zero();
    let mut delay_tally_count = Uint256::zero();

    for record in &delay_records.records {
        match record.delay_type {
            DelayType::DeactivateDelay => {
                delay_deactivate_count += record.delay_process_dmsg_count;
            }
            DelayType::TallyDelay => {
                delay_tally_count += Uint256::from_u128(1u128);
            }
        }
    }

    // Set penalty rate for each type of delay
    let tally_penalty_rate = PENALTY_RATE.load(deps.storage)?;
    let deactivate_penalty_rate = Uint256::from_u128(5u128); // 5% penalty for each deactivate delay

    // Calculate total penalty rate
    let total_penalty_rate =
        delay_tally_count * tally_penalty_rate + delay_deactivate_count * deactivate_penalty_rate;

    // Ensure penalty rate does not exceed 100%
    let penalty_rate = std::cmp::min(total_penalty_rate, Uint256::from_u128(100u128));

    // Calculate miss rate (100% - penalty rate)
    let miss_rate = Uint256::from_u128(100u128) - penalty_rate;

    Ok(OperatorPerformance {
        delay_deactivate_count,
        delay_tally_count,
        miss_rate,
    })
}

pub fn calculate_tally_delay(deps: Deps) -> Result<TallyDelayInfo, ContractError> {
    let num_sign_ups = NUMSIGNUPS.load(deps.storage)?;
    let msg_chain_length = MSG_CHAIN_LENGTH.load(deps.storage)?;

    // Calculate total workload (signup and message have same weight)
    let total_work = num_sign_ups + msg_chain_length;

    let total_work_u128 = total_work
        .try_into() // Uint256 -> Uint128
        .map(|x: Uint128| x.u128()) // Uint128 -> u128
        .map_err(|_| ContractError::ValueTooLarge {})?;

    // Calculate actual delay timeout (linear change between min hours to max hours)
    let parameter: MaciParameters = MACIPARAMETERS.load(deps.storage)?;
    let state_tree_depth = parameter.state_tree_depth;
    let tally_delay_max_hours = TALLY_DELAY_MAX_HOURS.load(deps.storage)?;

    let (delay_seconds, calculated_hours) = if state_tree_depth == Uint256::from_u128(2u128) {
        // 2-1-1-5 default to 1 hours
        (1 * 60 * 60, 1) // 1 hours, no calculated hours for this case
    } else {
        // other maci circuit params use base_work to calculate
        (tally_delay_max_hours * 60 * 60, tally_delay_max_hours)
    };

    Ok(TallyDelayInfo {
        delay_seconds,
        total_work: total_work_u128,
        num_sign_ups,
        msg_chain_length,
        calculated_hours,
    })
}

// Check if user can sign up with oracle
fn can_sign_up_with_oracle(
    deps: Deps,
    env: Env,
    pubkey: PubKey,
    certificate: String,
) -> StdResult<bool> {
    // Check if oracle whitelist pubkey exists
    let oracle_whitelist_pubkey = ORACLE_WHITELIST_PUBKEY.may_load(deps.storage)?;
    if oracle_whitelist_pubkey.is_none() {
        return Ok(false);
    }
    let oracle_pubkey_str = oracle_whitelist_pubkey.unwrap();

    // Use the contract's voice_credit_amount for verification
    let voice_credit_amount = VOICE_CREDIT_AMOUNT.load(deps.storage)?;

    // Convert contract address to uint256 format to match api-maci
    let contract_address_uint256 = address_to_uint256(&env.contract.address);

    let payload = serde_json::json!({
        "amount": voice_credit_amount.to_string(),
        "contract_address": contract_address_uint256.to_string(),
        "pubkey_x": pubkey.x.to_string(),
        "pubkey_y": pubkey.y.to_string(),
    });

    let msg = payload.to_string().into_bytes();
    let hash = Sha256::digest(&msg);

    let certificate_binary = Binary::from_base64(&certificate)?;
    let oracle_pubkey_binary = Binary::from_base64(&oracle_pubkey_str)?;
    let verify_result = deps.api.secp256k1_verify(
        hash.as_ref(),
        certificate_binary.as_slice(),
        oracle_pubkey_binary.as_slice(),
    )?;

    Ok(verify_result)
}

// Get user balance with oracle verification
fn user_balance_of_oracle(
    deps: Deps,
    env: Env,
    pubkey: PubKey,
    certificate: String,
) -> StdResult<Uint256> {
    // Check if user already registered (by pubkey)
    if ORACLE_WHITELIST.has(
        deps.storage,
        &(
            pubkey.x.to_be_bytes().to_vec(),
            pubkey.y.to_be_bytes().to_vec(),
        ),
    ) {
        let cfg = ORACLE_WHITELIST.load(
            deps.storage,
            &(
                pubkey.x.to_be_bytes().to_vec(),
                pubkey.y.to_be_bytes().to_vec(),
            ),
        )?;
        return Ok(cfg.balance_of());
    }

    // Check if oracle whitelist pubkey exists
    let oracle_whitelist_pubkey = ORACLE_WHITELIST_PUBKEY.may_load(deps.storage)?;
    if oracle_whitelist_pubkey.is_none() {
        return Ok(Uint256::zero());
    }
    let oracle_pubkey_str = oracle_whitelist_pubkey.unwrap();

    // Use the contract's voice_credit_amount for verification
    let voice_credit_amount = VOICE_CREDIT_AMOUNT.load(deps.storage)?;

    // Convert contract address to uint256 format to match api-maci
    let contract_address_uint256 = address_to_uint256(&env.contract.address);

    let payload = serde_json::json!({
        "amount": voice_credit_amount.to_string(),
        "contract_address": contract_address_uint256.to_string(),
        "pubkey_x": pubkey.x.to_string(),
        "pubkey_y": pubkey.y.to_string(),
    });

    let msg = payload.to_string().into_bytes();
    let hash = Sha256::digest(&msg);

    let certificate_binary = Binary::from_base64(&certificate)?;
    let oracle_pubkey_binary = Binary::from_base64(&oracle_pubkey_str)?;
    let verify_result = deps.api.secp256k1_verify(
        hash.as_ref(),
        certificate_binary.as_slice(),
        oracle_pubkey_binary.as_slice(),
    )?;

    if verify_result {
        // Always return voice_credit_amount if verification passes
        return Ok(voice_credit_amount);
    }
    Ok(Uint256::zero())
}
