use crate::error::ContractError;
use crate::msg::{ExecuteMsg, HashOperation, InstantiateMsg, InstantiationData, QueryMsg};
use crate::state::{
    MessageData, PubKey, QuinaryTreeRoot, StateLeaf, ACTIVE_BATCH_ID, BATCH_HASH_COUNT,
    BATCH_HASH_RESULTS, LEAF_IDX_0, MACIPARAMETERS, MAX_LEAVES_COUNT, MSG_CHAIN_LENGTH, MSG_HASHES,
    NODES, NODES_NO_HASH, NUMSIGNUPS, NUMSIGNUPS_NO_HASH, QTR_LIB, SIGNUPED, SIGNUPED_NO_HASH,
    VOICE_CREDIT_AMOUNT, ZEROS, ZEROS_H10, ZEROS_H10_NO_HASH,
};
use cosmwasm_std::entry_point;
use cw2::set_contract_version;

use cosmwasm_std::{
    to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Reply, Response, StdResult, SubMsg,
    Uint256, WasmMsg,
};
use maci_utils::{hash2, hash5, uint256_from_hex_string};

// version info for migration info
const CONTRACT_NAME: &str = "crates.io:cw-amaci";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

// Reply IDs for batch hash operations
const BATCH_HASH_REPLY_ID_BASE: u64 = 1000;

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    // Save the MACI parameters to storage
    MACIPARAMETERS.save(deps.storage, &msg.parameters)?;
    // Initialize QTR_LIB for merkle tree operations
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
    QTR_LIB.save(deps.storage, &qtr_lab)?;

    // Calculate max leaves and leaf_idx0 for merkle tree
    let max_leaves_count =
        Uint256::from_u128(5u128.pow(msg.parameters.state_tree_depth.to_string().parse().unwrap()));
    MAX_LEAVES_COUNT.save(deps.storage, &max_leaves_count)?;

    let leaf_idx0 = (max_leaves_count - Uint256::from_u128(1u128)) / Uint256::from_u128(4u128);
    LEAF_IDX_0.save(deps.storage, &leaf_idx0)?;

    // Initialize ZEROS_H10 array for merkle tree
    let zeros_h10: [Uint256; 7] = [
        uint256_from_hex_string("26318ec8cdeef483522c15e9b226314ae39b86cde2a430dabf6ed19791917c47"),
        uint256_from_hex_string("28413250bf1cc56fabffd2fa32b52624941da885248fd1e015319e02c02abaf2"),
        uint256_from_hex_string("16738da97527034e095ac32bfab88497ca73a7b310a2744ab43971e82215cb6d"),
        uint256_from_hex_string("28140849348769fde6e971eec1424a5a162873a3d8adcbfdfc188e9c9d25faa3"),
        uint256_from_hex_string("1a07af159d19f68ed2aed0df224dabcc2e2321595968769f7c9e26591377ed9a"),
        uint256_from_hex_string("205cd249acba8f95f2e32ed51fa9c3d8e6f0d021892225d3efa9cd84c8fc1cad"),
        uint256_from_hex_string("b21c625cd270e71c2ee266c939361515e690be27e26cfc852a30b24e83504b0"),
    ];
    ZEROS_H10.save(deps.storage, &zeros_h10)?;

    // Initialize NODES root
    NODES.save(
        deps.storage,
        Uint256::from_u128(0u128).to_be_bytes().to_vec(),
        &zeros_h10[msg
            .parameters
            .state_tree_depth
            .to_string()
            .parse::<usize>()
            .unwrap()],
    )?;

    // Initialize ZEROS array
    let zeros: [Uint256; 8] = [
        Uint256::from_u128(0u128),
        uint256_from_hex_string("2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc"),
        uint256_from_hex_string("2a956d37d8e73692877b104630a08cc6840036f235f2134b0606769a369d85c1"),
        uint256_from_hex_string("2f9791ba036a4148ff026c074e713a4824415530dec0f0b16c5115aa00e4b825"),
        uint256_from_hex_string("2c41a7294c7ef5c9c5950dc627c55a00adb6712548bcbd6cd8569b1f2e5acc2a"),
        uint256_from_hex_string("2594ba68eb0f314eabbeea1d847374cc2be7965944dec513746606a1f2fadf2e"),
        uint256_from_hex_string("5c697158c9032bfd7041223a7dba696396388129118ae8f867266eb64fe7636"),
        uint256_from_hex_string("272b3425fcc3b2c45015559b9941fde27527aab5226045bf9b0a6c1fe902d601"),
    ];
    ZEROS.save(deps.storage, &zeros)?;

    // Initialize basic counters and state
    MSG_HASHES.save(
        deps.storage,
        Uint256::from_u128(0u128).to_be_bytes().to_vec(),
        &Uint256::from_u128(0u128),
    )?;

    NUMSIGNUPS.save(deps.storage, &Uint256::from_u128(0u128))?;
    MSG_CHAIN_LENGTH.save(deps.storage, &Uint256::from_u128(0u128))?;

    // Set default voice credit amount
    VOICE_CREDIT_AMOUNT.save(deps.storage, &Uint256::from_u128(100u128))?;

    // Initialize independent storage for no-hash testing
    NUMSIGNUPS_NO_HASH.save(deps.storage, &Uint256::from_u128(0u128))?;

    // Initialize ZEROS_H10_NO_HASH (all zeros for no-hash scenario)
    let zeros_h10_no_hash: [Uint256; 7] = [
        Uint256::zero(),
        Uint256::zero(),
        Uint256::zero(),
        Uint256::zero(),
        Uint256::zero(),
        Uint256::zero(),
        Uint256::zero(),
    ];
    ZEROS_H10_NO_HASH.save(deps.storage, &zeros_h10_no_hash)?;

    // Create simplified instantiation data
    let data: InstantiationData = InstantiationData {
        caller: info.sender.clone(),
        parameters: msg.parameters.clone(),
    };

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("caller", &info.sender.to_string())
        .add_attribute(
            "state_tree_depth",
            &msg.parameters.state_tree_depth.to_string(),
        )
        .add_attribute(
            "int_state_tree_depth",
            &msg.parameters.int_state_tree_depth.to_string(),
        )
        .add_attribute(
            "vote_option_tree_depth",
            &msg.parameters.vote_option_tree_depth.to_string(),
        )
        .add_attribute(
            "message_batch_size",
            &msg.parameters.message_batch_size.to_string(),
        )
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
        ExecuteMsg::SignUp { pubkey } => execute_sign_up(deps, env, info, pubkey),
        ExecuteMsg::PublishMessage {
            message,
            enc_pub_key,
        } => execute_publish_message(deps, env, info, message, enc_pub_key),
        // Gas test messages
        ExecuteMsg::TestSignupNoHash { pubkey } => {
            execute_test_signup_no_hash(deps, env, info, pubkey)
        }
        ExecuteMsg::TestSignupWithHash { pubkey } => {
            execute_test_signup_with_hash(deps, env, info, pubkey)
        }
        ExecuteMsg::TestPublishMessage {
            message,
            enc_pub_key,
        } => execute_test_publish_message(deps, env, info, message, enc_pub_key),
        ExecuteMsg::TestHash2 { data } => execute_test_hash2(deps, env, info, data),
        ExecuteMsg::TestHash5 { data } => execute_test_hash5(deps, env, info, data),
        ExecuteMsg::TestHashUint256 { data } => execute_test_hash_uint256(deps, env, info, data),
        ExecuteMsg::TestHashOnce { data } => execute_test_hash_once(deps, env, info, data),
        ExecuteMsg::TestHashMultiple { data, count } => {
            execute_test_hash_multiple(deps, env, info, data, count)
        }
        ExecuteMsg::TestHashBatch { data } => execute_test_hash_batch(deps, env, info, data),
        ExecuteMsg::TestHashComposed { data, repeat_count } => {
            execute_test_hash_composed(deps, env, info, data, repeat_count)
        }
        ExecuteMsg::TestBatchHash { operations } => {
            execute_test_batch_hash(deps, env, info, operations)
        }
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

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

// Enqueues the state leaf without hash calculation
// Uses independent storage (NODES_NO_HASH, NUMSIGNUPS_NO_HASH)
fn state_enqueue_no_hash(deps: &mut DepsMut, leaf: Uint256) -> Result<bool, ContractError> {
    let leaf_idx0 = LEAF_IDX_0.load(deps.storage).unwrap();
    let num_sign_ups = NUMSIGNUPS_NO_HASH.load(deps.storage).unwrap();

    let leaf_idx = leaf_idx0 + num_sign_ups;
    NODES_NO_HASH.save(deps.storage, leaf_idx.to_be_bytes().to_vec(), &leaf)?;
    state_update_at_no_hash(deps, leaf_idx)
}

// Updates the state tree without hash calculation
// Parent node = sum of 5 children nodes
// Uses independent storage (NODES_NO_HASH, ZEROS_H10_NO_HASH)
fn state_update_at_no_hash(deps: &mut DepsMut, index: Uint256) -> Result<bool, ContractError> {
    let leaf_idx0 = LEAF_IDX_0.load(deps.storage).unwrap();
    if index < leaf_idx0 {
        return Err(ContractError::MustUpdate {});
    }

    let mut idx = index.clone();
    let mut height = 0;
    let zeros = ZEROS_H10_NO_HASH.load(deps.storage).unwrap();

    while idx > Uint256::from_u128(0u128) {
        let parent_idx = (idx - Uint256::one()) / Uint256::from(5u8);
        let children_idx0 = parent_idx * Uint256::from(5u8) + Uint256::one();
        let zero = zeros[height]; // Will be Uint256::zero() for no-hash scenario
        let mut inputs: [Uint256; 5] = [Uint256::zero(); 5];

        // Collect 5 children values from independent storage
        for i in 0..5 {
            let node_value = NODES_NO_HASH
                .may_load(
                    deps.storage,
                    (children_idx0 + Uint256::from_u128(i as u128))
                        .to_be_bytes()
                        .to_vec(),
                )
                .unwrap();

            let child = match node_value {
                Some(value) => value,
                None => zero, // Always Uint256::zero()
            };

            inputs[i] = child;
        }

        // Simple sum instead of hash
        let parent_value = inputs[0] + inputs[1] + inputs[2] + inputs[3] + inputs[4];

        // Save parent node to independent storage
        if NODES_NO_HASH.has(deps.storage, parent_idx.to_be_bytes().to_vec()) {
            NODES_NO_HASH
                .update(
                    deps.storage,
                    parent_idx.to_be_bytes().to_vec(),
                    |_c: Option<Uint256>| -> StdResult<_> { Ok(parent_value) },
                )
                .unwrap();
        } else {
            NODES_NO_HASH
                .save(
                    deps.storage,
                    parent_idx.to_be_bytes().to_vec(),
                    &parent_value,
                )
                .unwrap();
        }

        height += 1;
        idx = parent_idx;
    }

    Ok(true)
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

// ============================================================================
// Execute Functions
// ============================================================================

// Simplified signup - no validation logic
pub fn execute_sign_up(
    mut deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    pubkey: PubKey,
) -> Result<Response, ContractError> {
    // Load voice credit amount
    let voice_credit_amount = VOICE_CREDIT_AMOUNT.load(deps.storage)?;
    let mut num_sign_ups = NUMSIGNUPS.load(deps.storage)?;

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

    Ok(Response::new()
        .add_attribute("action", "sign_up")
        .add_attribute("state_idx", state_index.to_string())
        .add_attribute("pubkey_x", pubkey.x.to_string())
        .add_attribute("pubkey_y", pubkey.y.to_string())
        .add_attribute("balance", voice_credit_amount.to_string()))
}

// Simplified publish message - no validation logic
pub fn execute_publish_message(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    message: MessageData,
    enc_pub_key: PubKey,
) -> Result<Response, ContractError> {
    let msg_chain_length = MSG_CHAIN_LENGTH.load(deps.storage)?;

    // Load previous hash (0 if this is the first message)
    let old_msg_hashes = if msg_chain_length == Uint256::from_u128(0u128) {
        Uint256::from_u128(0u128)
    } else {
        MSG_HASHES
            .load(deps.storage, msg_chain_length.to_be_bytes().to_vec())
            .unwrap_or(Uint256::from_u128(0u128))
    };

    // Compute the new message hash using the provided message, encrypted public key, and previous hash
    let new_chain_length = msg_chain_length + Uint256::from_u128(1u128);
    MSG_HASHES.save(
        deps.storage,
        new_chain_length.to_be_bytes().to_vec(),
        &hash_message_and_enc_pub_key(message.clone(), enc_pub_key.clone(), old_msg_hashes),
    )?;

    // Update the message chain length
    MSG_CHAIN_LENGTH.save(deps.storage, &new_chain_length)?;

    Ok(Response::new()
        .add_attribute("action", "publish_message")
        .add_attribute("msg_chain_length", msg_chain_length.to_string())
        .add_attribute("enc_pub_key_x", enc_pub_key.x.to_string())
        .add_attribute("enc_pub_key_y", enc_pub_key.y.to_string()))
}

// in voting - batch version
// ============================================================================
// Gas Testing Functions
// ============================================================================

/// Test function for signup without hash calculation
/// Measures gas cost of merkle tree storage operations only
/// Uses simple sum for parent nodes instead of Poseidon hash
/// Uses independent storage: NUMSIGNUPS_NO_HASH, SIGNUPED_NO_HASH, NODES_NO_HASH
pub fn execute_test_signup_no_hash(
    mut deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    pubkey: PubKey,
) -> Result<Response, ContractError> {
    // Load basic parameters from independent storage
    let mut num_sign_ups = NUMSIGNUPS_NO_HASH.load(deps.storage)?;
    let voice_credit_amount = VOICE_CREDIT_AMOUNT.load(deps.storage)?;

    // Create state leaf value (no hash, just raw value for testing)
    let raw_leaf_value = voice_credit_amount;

    let state_index = num_sign_ups;

    // Update tree using simple sum (no hash calculation) with independent storage
    state_enqueue_no_hash(&mut deps, raw_leaf_value)?;

    // Update counters in independent storage
    num_sign_ups += Uint256::from_u128(1u128);
    NUMSIGNUPS_NO_HASH.save(deps.storage, &num_sign_ups)?;

    // Save signup record to independent storage
    SIGNUPED_NO_HASH.save(
        deps.storage,
        &(
            pubkey.x.to_be_bytes().to_vec(),
            pubkey.y.to_be_bytes().to_vec(),
        ),
        &state_index,
    )?;

    Ok(Response::new()
        .add_attribute("action", "test_signup_no_hash")
        .add_attribute("state_idx", state_index.to_string())
        .add_attribute("pubkey_x", pubkey.x.to_string())
        .add_attribute("pubkey_y", pubkey.y.to_string()))
}

/// Test function for signup with full hash calculation
/// Measures gas cost of complete merkle tree update with Poseidon hash
pub fn execute_test_signup_with_hash(
    mut deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    pubkey: PubKey,
) -> Result<Response, ContractError> {
    // Load basic parameters
    let mut num_sign_ups = NUMSIGNUPS.load(deps.storage)?;
    let voice_credit_amount = VOICE_CREDIT_AMOUNT.load(deps.storage)?;

    // Create a state leaf with hash
    let state_leaf = StateLeaf {
        pub_key: pubkey.clone(),
        voice_credit_balance: voice_credit_amount,
        vote_option_tree_root: Uint256::from_u128(0),
        nonce: Uint256::from_u128(0),
    }
    .hash_decativate_state_leaf();

    let state_index = num_sign_ups;

    // Enqueue the state leaf (this triggers full hash calculation)
    state_enqueue(&mut deps, state_leaf)?;

    // Update counters
    num_sign_ups += Uint256::from_u128(1u128);
    NUMSIGNUPS.save(deps.storage, &num_sign_ups)?;

    // Save signup record
    SIGNUPED.save(
        deps.storage,
        &(
            pubkey.x.to_be_bytes().to_vec(),
            pubkey.y.to_be_bytes().to_vec(),
        ),
        &state_index,
    )?;

    Ok(Response::new()
        .add_attribute("action", "test_signup_with_hash")
        .add_attribute("state_idx", state_index.to_string())
        .add_attribute("pubkey_x", pubkey.x.to_string())
        .add_attribute("pubkey_y", pubkey.y.to_string()))
}

/// Test function for publish message without validation checks
/// Measures gas cost of message hash and storage operations only
pub fn execute_test_publish_message(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    message: MessageData,
    enc_pub_key: PubKey,
) -> Result<Response, ContractError> {
    // Load message chain length
    let msg_chain_length = MSG_CHAIN_LENGTH.load(deps.storage)?;

    // Load previous hash
    let prev_hash = if msg_chain_length == Uint256::from_u128(0u128) {
        Uint256::from_u128(0u128)
    } else {
        MSG_HASHES
            .load(
                deps.storage,
                (msg_chain_length - Uint256::one()).to_be_bytes().to_vec(),
            )
            .unwrap_or(Uint256::from_u128(0u128))
    };

    // Calculate message hash
    let message_hash = hash_message_and_enc_pub_key(message, enc_pub_key.clone(), prev_hash);

    // Save message hash
    MSG_HASHES.save(
        deps.storage,
        msg_chain_length.to_be_bytes().to_vec(),
        &message_hash,
    )?;

    // Update message chain length
    MSG_CHAIN_LENGTH.save(deps.storage, &(msg_chain_length + Uint256::one()))?;

    Ok(Response::new()
        .add_attribute("action", "test_publish_message")
        .add_attribute("msg_chain_length", msg_chain_length.to_string())
        .add_attribute("message_hash", message_hash.to_string())
        .add_attribute("enc_pub_key_x", enc_pub_key.x.to_string())
        .add_attribute("enc_pub_key_y", enc_pub_key.y.to_string()))
}

/// Test function for hash2
/// Measures gas cost of hash2 function from maci-utils
pub fn execute_test_hash2(
    _deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    data: [Uint256; 2],
) -> Result<Response, ContractError> {
    let result = hash2(data);

    Ok(Response::new()
        .add_attribute("action", "test_hash2")
        .add_attribute("result", result.to_string()))
}

/// Test function for hash5
/// Measures gas cost of hash5 function from maci-utils
pub fn execute_test_hash5(
    _deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    data: [Uint256; 5],
) -> Result<Response, ContractError> {
    let result = hash5(data);

    Ok(Response::new()
        .add_attribute("action", "test_hash5")
        .add_attribute("result", result.to_string()))
}

/// Test function for hash_uint256
/// Measures gas cost of hash_uint256 function from maci-utils
pub fn execute_test_hash_uint256(
    _deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    data: Uint256,
) -> Result<Response, ContractError> {
    let result = maci_utils::hash_uint256(data);

    Ok(Response::new()
        .add_attribute("action", "test_hash_uint256")
        .add_attribute("result", result.to_string()))
}

/// Test function for single hash5 call
/// Measures gas cost of one hash5 call
pub fn execute_test_hash_once(
    _deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    data: [Uint256; 5],
) -> Result<Response, ContractError> {
    let result = hash5(data);

    Ok(Response::new()
        .add_attribute("action", "test_hash_once")
        .add_attribute("result", result.to_string()))
}

/// Test function for multiple hash5 calls in a single transaction
/// Measures gas cost of multiple hash5 calls with the same data
pub fn execute_test_hash_multiple(
    _deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    data: [Uint256; 5],
    count: u32,
) -> Result<Response, ContractError> {
    let mut last_result = Uint256::zero();

    // Call hash5 multiple times in a single transaction
    for _i in 0..count {
        last_result = hash5(data);
    }

    Ok(Response::new()
        .add_attribute("action", "test_hash_multiple")
        .add_attribute("count", count.to_string())
        .add_attribute("last_result", last_result.to_string()))
}

/// Test function for batch hashing
/// Measures gas cost of hashing multiple different data arrays
pub fn execute_test_hash_batch(
    _deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    data: Vec<[Uint256; 5]>,
) -> Result<Response, ContractError> {
    let mut last_result = Uint256::zero();

    // Hash each data item in the batch
    for item in data.iter() {
        last_result = hash5(*item);
    }

    Ok(Response::new()
        .add_attribute("action", "test_hash_batch")
        .add_attribute("hash_count", data.len().to_string())
        .add_attribute("last_result", last_result.to_string()))
}

/// Test function for composed hash operations
/// Tests various hash compositions (hash2, hash5, and combinations)
pub fn execute_test_hash_composed(
    _deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    data: [Uint256; 5],
    repeat_count: u32,
) -> Result<Response, ContractError> {
    let mut last_result = Uint256::zero();

    for _i in 0..repeat_count {
        // Test hash2
        let hash2_result = hash2([data[0], data[1]]);

        // Test hash5
        let hash5_result1 = hash5(data);
        let hash5_result2 = hash5(data);

        // Test hash2(hash5, hash5) composition
        let composed_hash2 = hash2([hash5_result1, hash5_result2]);

        // Test hash5(hash2, composed_hash2, 0, 0, 0) composition
        last_result = hash5([
            hash2_result,
            composed_hash2,
            Uint256::zero(),
            Uint256::zero(),
            Uint256::zero(),
        ]);
    }

    Ok(Response::new()
        .add_attribute("action", "test_hash_composed")
        .add_attribute("repeat_count", repeat_count.to_string())
        .add_attribute("last_result", last_result.to_string()))
}

/// Test function for batch hash operations
/// Executes multiple hash operations in a single transaction using submessages
pub fn execute_test_batch_hash(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    operations: Vec<HashOperation>,
) -> Result<Response, ContractError> {
    if operations.is_empty() {
        return Err(ContractError::Std(cosmwasm_std::StdError::generic_err(
            "Operations list cannot be empty",
        )));
    }

    // Generate a unique batch ID using block time and height
    let batch_id = env.block.time.nanos() % 1_000_000_000_000; // Use last 12 digits of nanos
    let contract_addr = env.contract.address.clone();

    // Store batch information
    BATCH_HASH_COUNT.save(deps.storage, batch_id, &(operations.len() as u32))?;
    BATCH_HASH_RESULTS.save(deps.storage, batch_id, &Vec::new())?;
    ACTIVE_BATCH_ID.save(deps.storage, &batch_id)?;

    let mut response = Response::new()
        .add_attribute("action", "test_batch_hash")
        .add_attribute("operation_count", operations.len().to_string())
        .add_attribute("batch_id", batch_id.to_string());

    // Convert each HashOperation to ExecuteMsg and create SubMsg
    for (index, op) in operations.iter().enumerate() {
        let execute_msg = match op {
            HashOperation::Hash2 { data } => ExecuteMsg::TestHash2 { data: *data },
            HashOperation::Hash5 { data } => ExecuteMsg::TestHash5 { data: *data },
            HashOperation::HashUint256 { data } => ExecuteMsg::TestHashUint256 { data: *data },
            HashOperation::HashComposed { data, repeat_count } => ExecuteMsg::TestHashComposed {
                data: *data,
                repeat_count: *repeat_count,
            },
        };

        let wasm_msg = WasmMsg::Execute {
            contract_addr: contract_addr.to_string(),
            msg: to_json_binary(&execute_msg)?,
            funds: vec![],
        };

        let reply_id = BATCH_HASH_REPLY_ID_BASE + index as u64;
        let submsg = SubMsg::reply_on_success(wasm_msg, reply_id);

        response = response.add_submessage(submsg);
    }

    Ok(response)
}

// ============================================================================
// Reply Handler
// ============================================================================

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn reply(deps: DepsMut, _env: Env, msg: Reply) -> Result<Response, ContractError> {
    // Check if this is a batch hash operation reply
    if msg.id >= BATCH_HASH_REPLY_ID_BASE && msg.id < BATCH_HASH_REPLY_ID_BASE + 1000 {
        handle_batch_hash_reply(deps, msg)
    } else {
        Err(ContractError::Std(cosmwasm_std::StdError::generic_err(
            format!("Unknown reply id: {}", msg.id),
        )))
    }
}

fn handle_batch_hash_reply(deps: DepsMut, msg: Reply) -> Result<Response, ContractError> {
    // Extract operation index from reply ID
    let operation_index = (msg.id - BATCH_HASH_REPLY_ID_BASE) as usize;

    // Parse the submessage response
    let response = msg.result.into_result().map_err(|e| {
        ContractError::Std(cosmwasm_std::StdError::generic_err(format!(
            "Submessage failed: {}",
            e
        )))
    })?;

    // Extract result from submessage response attributes
    // Look for "result" attribute in the response
    let mut hash_result = Uint256::zero();
    for event in response.events.iter() {
        for attr in event.attributes.iter() {
            if attr.key == "result" {
                // Parse Uint256 from string
                // Try parsing as u128 first (for smaller values)
                hash_result = attr
                    .value
                    .parse::<u128>()
                    .map(Uint256::from_u128)
                    .unwrap_or_else(|_| {
                        // For larger values, parse using BigUint
                        use num_bigint::BigUint;
                        BigUint::parse_bytes(attr.value.as_bytes(), 10)
                            .map(|n| {
                                let bytes = n.to_bytes_be();
                                let mut array = [0u8; 32];
                                let len = bytes.len().min(32);
                                if len > 0 {
                                    let start = 32 - len;
                                    array[start..].copy_from_slice(&bytes[..len]);
                                }
                                Uint256::from_be_bytes(array)
                            })
                            .unwrap_or(Uint256::zero())
                    });
                break;
            }
        }
        if hash_result != Uint256::zero() {
            break;
        }
    }

    // Load active batch_id
    let batch_id = ACTIVE_BATCH_ID.load(deps.storage).map_err(|_| {
        ContractError::Std(cosmwasm_std::StdError::generic_err("No active batch found"))
    })?;

    // Load current results
    let mut results = BATCH_HASH_RESULTS
        .load(deps.storage, batch_id)
        .unwrap_or_default();

    // Add this operation's result
    results.push((operation_index, hash_result));

    // Load expected count
    let expected_count = BATCH_HASH_COUNT.load(deps.storage, batch_id)? as usize;

    // Save updated results
    BATCH_HASH_RESULTS.save(deps.storage, batch_id, &results)?;

    // Check if all operations are complete
    if results.len() >= expected_count {
        // All operations complete, return final response
        // Sort results by index to ensure correct order
        results.sort_by_key(|(idx, _)| *idx);

        let last_result = results.last().map(|(_, r)| *r).unwrap_or(Uint256::zero());

        let mut response = Response::new()
            .add_attribute("action", "test_batch_hash_complete")
            .add_attribute("batch_id", batch_id.to_string())
            .add_attribute("operation_count", expected_count.to_string())
            .add_attribute("last_result", last_result.to_string());

        // Add individual results
        for (index, result) in results.iter() {
            response = response.add_attribute(format!("result_{}", index), result.to_string());
        }

        // Clean up temporary storage
        BATCH_HASH_RESULTS.remove(deps.storage, batch_id);
        BATCH_HASH_COUNT.remove(deps.storage, batch_id);
        ACTIVE_BATCH_ID.remove(deps.storage);

        Ok(response)
    } else {
        // More operations pending, return empty response
        Ok(Response::new().add_attribute("action", "test_batch_hash_partial"))
    }
}

// ============================================================================
// Query Functions
// ============================================================================

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        // No-hash testing queries
        QueryMsg::GetNumSignUpNoHash {} => to_json_binary(&NUMSIGNUPS_NO_HASH.load(deps.storage)?),
        QueryMsg::GetNodeNoHash { index } => {
            let node = NODES_NO_HASH.may_load(deps.storage, index.to_be_bytes().to_vec())?;
            to_json_binary(&node.unwrap_or(Uint256::zero()))
        }
        QueryMsg::GetStateTreeRootNoHash {} => {
            let root =
                NODES_NO_HASH.may_load(deps.storage, Uint256::zero().to_be_bytes().to_vec())?;
            to_json_binary(&root.unwrap_or(Uint256::zero()))
        }
        QueryMsg::SignupedNoHash { pubkey } => {
            let state_idx = SIGNUPED_NO_HASH.may_load(
                deps.storage,
                &(
                    pubkey.x.to_be_bytes().to_vec(),
                    pubkey.y.to_be_bytes().to_vec(),
                ),
            )?;
            to_json_binary(&state_idx)
        }
        // Original queries (if needed, add them here)
        QueryMsg::GetNumSignUp {} => to_json_binary(&NUMSIGNUPS.load(deps.storage)?),
        QueryMsg::GetNode { index } => {
            let node = NODES.may_load(deps.storage, index.to_be_bytes().to_vec())?;
            to_json_binary(&node.unwrap_or(Uint256::zero()))
        }
        QueryMsg::GetStateTreeRoot {} => {
            let root = NODES.may_load(deps.storage, Uint256::zero().to_be_bytes().to_vec())?;
            to_json_binary(&root.unwrap_or(Uint256::zero()))
        }
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
        QueryMsg::GetVoiceCreditAmount {} => {
            to_json_binary(&VOICE_CREDIT_AMOUNT.load(deps.storage)?)
        }
        QueryMsg::GetMsgChainLength {} => to_json_binary(&MSG_CHAIN_LENGTH.load(deps.storage)?),
        _ => Err(cosmwasm_std::StdError::generic_err(
            "Query not implemented for this simplified test contract",
        )),
    }
}
