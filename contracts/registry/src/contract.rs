use bech32::{self};
#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{
    attr, coins, from_json, to_json_binary, Addr, Binary, Deps, DepsMut, Env, MessageInfo, Reply,
    Response, StdError, StdResult, SubMsg, SubMsgResponse, Uint128, Uint256, WasmMsg,
};

use crate::error::ContractError;
use crate::migrates::migrate_v0_1_4::migrate_v0_1_4;
use crate::msg::{ExecuteMsg, InstantiateMsg, InstantiationData, MigrateMsg, QueryMsg};
use crate::state::{
    Admin, CircuitChargeConfig, ValidatorSet, ADMIN, AMACI_CODE_ID, CIRCUIT_CHARGE_CONFIG,
    COORDINATOR_PUBKEY_MAP, MACI_OPERATOR_IDENTITY, MACI_OPERATOR_PUBKEY, MACI_OPERATOR_SET,
    MACI_VALIDATOR_LIST, MACI_VALIDATOR_OPERATOR_SET, OPERATOR,
};
use cosmwasm_std::Decimal;
use cw2::set_contract_version;
use cw_amaci::msg::{
    InstantiateMsg as AMaciInstantiateMsg, InstantiationData as AMaciInstantiationData,
    WhitelistBase,
};
use cw_amaci::state::{PubKey, RoundInfo, VotingTime};
use cw_utils::parse_instantiate_response_data;

// version info for migration info
const CONTRACT_NAME: &str = "crates.io:cw-amaci-registry";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const CREATED_GROTH16_ROUND_REPLY_ID: u64 = 1;

// Note, you can use StdResult in some functions where you do not
// make use of the custom errors
#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    let admin = Admin { admin: msg.admin };

    ADMIN.save(deps.storage, &admin)?;
    OPERATOR.save(deps.storage, &msg.operator)?;

    AMACI_CODE_ID.save(deps.storage, &msg.amaci_code_id)?;

    let circuit_charge_config = CircuitChargeConfig {
        fee_rate: Decimal::from_ratio(1u128, 10u128), // 10%
    };

    CIRCUIT_CHARGE_CONFIG.save(deps.storage, &circuit_charge_config)?;

    Ok(Response::default())
}

// And declare a custom Error variant for the ones where you will want to make use of it
#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::SetMaciOperator { operator } => {
            execute_set_maci_operator(deps, env, info, operator)
        }
        ExecuteMsg::SetMaciOperatorPubkey { pubkey } => {
            execute_set_maci_operator_pubkey(deps, env, info, pubkey)
        }
        ExecuteMsg::SetMaciOperatorIdentity { identity } => {
            execute_set_maci_operator_identity(deps, env, info, identity)
        }
        ExecuteMsg::CreateRound {
            operator,
            max_voter,
            voice_credit_amount,
            vote_option_map,
            round_info,
            voting_time,
            whitelist,
            pre_deactivate_root,
            circuit_type,
            certification_system,
            oracle_whitelist_pubkey,
            pre_deactivate_coordinator,
        } => execute_create_round(
            deps,
            env,
            info,
            operator,
            max_voter,
            voice_credit_amount,
            vote_option_map,
            round_info,
            voting_time,
            whitelist,
            pre_deactivate_root,
            circuit_type,
            certification_system,
            oracle_whitelist_pubkey,
            pre_deactivate_coordinator,
        ),
        ExecuteMsg::SetValidators { addresses } => {
            execute_set_validators(deps, env, info, addresses)
        }
        ExecuteMsg::RemoveValidator { address } => {
            execute_remove_validator(deps, env, info, address)
        }
        ExecuteMsg::UpdateAmaciCodeId { amaci_code_id } => {
            execute_update_amaci_code_id(deps, env, info, amaci_code_id)
        }
        ExecuteMsg::ChangeOperator { address } => execute_change_operator(deps, env, info, address),
        ExecuteMsg::ChangeChargeConfig { config } => {
            execute_change_charge_config(deps, env, info, config)
        }
    }
}

// validate address is valid dora prefix cosmos address
pub fn validate_dora_address(address: &str) -> Result<(), ContractError> {
    match bech32::decode(address) {
        Ok((prefix, _data, _variant)) => {
            if prefix != "dora" {
                return Err(ContractError::InvalidAddressPrefix {
                    expected: "dora".to_string(),
                    actual: prefix,
                });
            }
            Ok(())
        }
        Err(_) => Err(ContractError::InvalidAddress {
            address: address.to_string(),
        }),
    }
}

pub fn execute_create_round(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    operator: Addr,
    max_voter: Uint256,
    voice_credit_amount: Uint256,
    vote_option_map: Vec<String>,
    round_info: RoundInfo,
    voting_time: VotingTime,
    whitelist: Option<WhitelistBase>,
    pre_deactivate_root: Uint256,
    circuit_type: Uint256,
    certification_system: Uint256,
    oracle_whitelist_pubkey: Option<String>,
    pre_deactivate_coordinator: Option<PubKey>,
) -> Result<Response, ContractError> {
    validate_dora_address(operator.as_str())?;

    let max_option = Uint256::from_u128(vote_option_map.len() as u128);
    let (required_fee, maci_parameters) =
        crate::utils::calculate_round_fee_and_params(max_voter, max_option)?;

    let denom = "peaka".to_string();
    let mut amount: Uint128 = Uint128::new(0);
    info.funds.iter().for_each(|fund| {
        if fund.denom == denom {
            amount = fund.amount;
        }
    });

    // check user's payment - require exact fee amount
    if amount != required_fee {
        if amount < required_fee {
            return Err(ContractError::InsufficientFee {
                required: required_fee,
                provided: amount,
            });
        } else {
            return Err(ContractError::ExactFeeRequired {
                required: required_fee,
                provided: amount,
            });
        }
    }

    if !MACI_OPERATOR_PUBKEY.has(deps.storage, &operator) {
        return Err(ContractError::NotSetOperatorPubkey {});
    }
    let operator_pubkey = MACI_OPERATOR_PUBKEY.load(deps.storage, &operator)?;

    let total_fee = required_fee;
    let admin = ADMIN.load(deps.storage)?.admin;

    // No longer send admin_fee directly to admin, instead send all fees to amaci contract
    // Add admin_fee information in the instantiate message for potential refunds in the future

    let init_msg = AMaciInstantiateMsg {
        parameters: maci_parameters,
        coordinator: operator_pubkey,
        operator,
        admin: info.sender.clone(),
        fee_recipient: admin.clone(),
        voice_credit_amount,
        vote_option_map,
        round_info,
        voting_time,
        whitelist,
        pre_deactivate_root,
        circuit_type,
        certification_system,
        oracle_whitelist_pubkey,
        pre_deactivate_coordinator,
    };
    let amaci_code_id = AMACI_CODE_ID.load(deps.storage)?;
    let instantiate_msg = SubMsg::reply_on_success(
        WasmMsg::Instantiate {
            admin: Some(env.contract.address.to_string()),
            code_id: amaci_code_id,
            msg: to_json_binary(&init_msg)?,
            funds: coins(total_fee.u128(), "peaka"), // Send all fees, including admin_fee
            label: "AMACI".to_string(),
        },
        CREATED_GROTH16_ROUND_REPLY_ID,
    );

    let resp = Response::new()
        .add_submessage(instantiate_msg)
        .add_attribute("action", "create_round")
        .add_attribute("amaci_code_id", &amaci_code_id.to_string())
        .add_attribute("total_fee", total_fee.to_string())
        .add_attribute("fee_recipient", admin.to_string());

    Ok(resp)
}

// validator
pub fn execute_set_maci_operator(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    operator: Addr,
) -> Result<Response, ContractError> {
    validate_dora_address(operator.as_str())?;

    if !is_validator(deps.as_ref(), &info.sender)? {
        return Err(ContractError::Unauthorized {});
    }
    if is_operator_set(deps.as_ref(), &operator)? {
        return Err(ContractError::ExistedMaciOperator {});
    }

    if is_validator_operator_set(deps.as_ref(), &info.sender)? {
        let old_operator = MACI_VALIDATOR_OPERATOR_SET.load(deps.storage, &info.sender)?;

        if MACI_OPERATOR_PUBKEY.has(deps.storage, &old_operator) {
            let old_operator_pubkey = MACI_OPERATOR_PUBKEY.load(deps.storage, &old_operator)?;
            COORDINATOR_PUBKEY_MAP.remove(
                deps.storage,
                &(
                    old_operator_pubkey.x.to_be_bytes().to_vec(),
                    old_operator_pubkey.y.to_be_bytes().to_vec(),
                ),
            );
            MACI_OPERATOR_PUBKEY.remove(deps.storage, &old_operator);
        }

        MACI_OPERATOR_SET.remove(deps.storage, &old_operator);

        MACI_VALIDATOR_OPERATOR_SET.save(deps.storage, &info.sender, &operator)?;
        MACI_OPERATOR_SET.save(deps.storage, &operator, &Uint128::from(0u128))?;
    }

    MACI_VALIDATOR_OPERATOR_SET.save(deps.storage, &info.sender, &operator)?;
    MACI_OPERATOR_SET.save(deps.storage, &operator, &Uint128::from(0u128))?;
    Ok(Response::new()
        .add_attribute("action", "set_maci_operator")
        .add_attribute("validator", &info.sender.to_string())
        .add_attribute("maci_operator", operator.to_string()))
}

// validator operator
pub fn execute_set_maci_operator_pubkey(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    pubkey: PubKey,
) -> Result<Response, ContractError> {
    if !is_operator_set(deps.as_ref(), &info.sender)? {
        Err(ContractError::Unauthorized {})
    } else {
        if COORDINATOR_PUBKEY_MAP.has(
            deps.storage,
            &(
                pubkey.x.to_be_bytes().to_vec(),
                pubkey.y.to_be_bytes().to_vec(),
            ),
        ) {
            return Err(ContractError::PubkeyExisted {});
        }

        MACI_OPERATOR_PUBKEY.save(deps.storage, &info.sender, &pubkey)?;
        COORDINATOR_PUBKEY_MAP.save(
            deps.storage,
            &(
                pubkey.x.to_be_bytes().to_vec(),
                pubkey.y.to_be_bytes().to_vec(),
            ),
            &0u64,
        )?;
        Ok(Response::new()
            .add_attribute("action", "set_maci_operator_pubkey")
            .add_attribute("maci_operator", &info.sender.to_string())
            .add_attribute("coordinator_pubkey_x", pubkey.x.to_string())
            .add_attribute("coordinator_pubkey_y", pubkey.y.to_string()))
    }
}

// validator operator
pub fn execute_set_maci_operator_identity(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    identity: String,
) -> Result<Response, ContractError> {
    if !is_operator_set(deps.as_ref(), &info.sender)? {
        Err(ContractError::Unauthorized {})
    } else {
        MACI_OPERATOR_IDENTITY.save(deps.storage, &info.sender, &identity)?;
        Ok(Response::new()
            .add_attribute("action", "set_maci_operator_identity")
            .add_attribute("maci_operator", &info.sender.to_string())
            .add_attribute("identity", identity.to_string()))
    }
}

pub fn execute_set_validators(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    addresses: ValidatorSet,
) -> Result<Response, ContractError> {
    if !is_operator(deps.as_ref(), info.sender.as_ref())? {
        Err(ContractError::Unauthorized {})
    } else {
        MACI_VALIDATOR_LIST.save(deps.storage, &addresses)?;

        Ok(Response::new()
            .add_attribute("action", "set_validators")
            .add_attribute(
                "addresses",
                serde_json::to_string(&addresses.addresses).unwrap_or_else(|_| "[]".to_string()),
            ))
    }
}

pub fn execute_remove_validator(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    address: Addr,
) -> Result<Response, ContractError> {
    if !is_operator(deps.as_ref(), info.sender.as_ref())? {
        Err(ContractError::Unauthorized {})
    } else {
        let mut maci_validator_set = MACI_VALIDATOR_LIST.load(deps.storage)?;
        maci_validator_set.remove_validator(&address);
        MACI_VALIDATOR_LIST.save(deps.storage, &maci_validator_set)?;

        if MACI_VALIDATOR_OPERATOR_SET.has(deps.storage, &address) {
            let old_operator = MACI_VALIDATOR_OPERATOR_SET.load(deps.storage, &address)?;

            MACI_VALIDATOR_OPERATOR_SET.remove(deps.storage, &address);
            MACI_OPERATOR_SET.remove(deps.storage, &old_operator);

            if MACI_OPERATOR_PUBKEY.has(deps.storage, &old_operator) {
                let old_operator_pubkey = MACI_OPERATOR_PUBKEY.load(deps.storage, &old_operator)?;
                COORDINATOR_PUBKEY_MAP.remove(
                    deps.storage,
                    &(
                        old_operator_pubkey.x.to_be_bytes().to_vec(),
                        old_operator_pubkey.y.to_be_bytes().to_vec(),
                    ),
                );
                MACI_OPERATOR_PUBKEY.remove(deps.storage, &old_operator);
            }
        }

        // pub const MACI_VALIDATOR_LIST: Item<ValidatorSet> = Item::new("maci_validator_list"); // ['val1', 'val2', 'val3']
        // pub const MACI_VALIDATOR_OPERATOR_SET: Map<&Addr, Addr> = Map::new("maci_validator_operator_set"); // { val1: op1, val2: op2, val3: op3 }
        // pub const MACI_OPERATOR_SET: Map<&Addr, Uint128> = Map::new("maci_operator_set"); // { op1: pub1, op2: pub2, op3: pub3 }

        // pub const MACI_OPERATOR_PUBKEY: Map<&Addr, PubKey> = Map::new("maci_operator_pubkey"); // operator_address - coordinator_pubkey
        // pub const COORDINATOR_PUBKEY_MAP: Map<&(Vec<u8>, Vec<u8>), u64> =
        //     Map::new("coordinator_pubkey_map"); //

        Ok(Response::new()
            .add_attribute("action", "remove_validator")
            .add_attribute("validator", address.to_string()))
    }
}

pub fn execute_update_amaci_code_id(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    amaci_code_id: u64,
) -> Result<Response, ContractError> {
    if !is_operator(deps.as_ref(), info.sender.as_ref())? {
        Err(ContractError::Unauthorized {})
    } else {
        AMACI_CODE_ID.save(deps.storage, &amaci_code_id)?;
        Ok(Response::new()
            .add_attribute("action", "update_amaci_code_id")
            .add_attribute("amaci_code_id", &amaci_code_id.to_string()))
    }
}

pub fn execute_change_operator(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    address: Addr,
) -> Result<Response, ContractError> {
    validate_dora_address(address.as_str())?;

    if !is_admin(deps.as_ref(), info.sender.as_ref())? {
        Err(ContractError::Unauthorized {})
    } else {
        OPERATOR.save(deps.storage, &address)?;

        Ok(Response::new()
            .add_attribute("action", "change_operator")
            .add_attribute("address", address.to_string()))
    }
}

pub fn execute_change_charge_config(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    config: CircuitChargeConfig,
) -> Result<Response, ContractError> {
    if !is_operator(deps.as_ref(), info.sender.as_ref())? {
        return Err(ContractError::Unauthorized {});
    }

    CIRCUIT_CHARGE_CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("action", "change_charge_config")
        .add_attribute("fee_rate", config.fee_rate.to_string()))
}

// Only admin can execute
fn is_admin(deps: Deps, sender: &str) -> StdResult<bool> {
    let cfg = ADMIN.load(deps.storage)?;
    let can = cfg.is_admin(&sender);
    Ok(can)
}

// Only operator/admin can execute
fn is_operator(deps: Deps, sender: &str) -> StdResult<bool> {
    let admin = ADMIN.load(deps.storage)?;
    let can_admin = admin.is_admin(&sender);

    let operator = OPERATOR.load(deps.storage)?;
    let can_operator = sender.to_string() == operator.to_string();

    let can = can_admin || can_operator;
    Ok(can)
}

fn is_validator(deps: Deps, sender: &Addr) -> StdResult<bool> {
    let cfg = MACI_VALIDATOR_LIST.load(deps.storage)?;
    let can = cfg.is_validator(sender);
    Ok(can)
}

fn is_operator_set(deps: Deps, sender: &Addr) -> StdResult<bool> {
    let res = MACI_OPERATOR_SET.has(deps.storage, sender);
    Ok(res)
}

fn is_validator_operator_set(deps: Deps, sender: &Addr) -> StdResult<bool> {
    let res = MACI_VALIDATOR_OPERATOR_SET.has(deps.storage, sender);
    Ok(res)
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Admin {} => to_json_binary(&ADMIN.load(deps.storage)?),
        QueryMsg::Operator {} => to_json_binary(&OPERATOR.load(deps.storage)?),
        QueryMsg::IsMaciOperator { address } => {
            to_json_binary(&MACI_OPERATOR_SET.has(deps.storage, &address))
        }
        QueryMsg::IsValidator { address } => to_json_binary(&is_validator(deps, &address)?),
        QueryMsg::GetValidators {} => to_json_binary(&MACI_VALIDATOR_LIST.load(deps.storage)?),
        QueryMsg::GetValidatorOperator { address } => to_json_binary(
            &MACI_VALIDATOR_OPERATOR_SET
                .may_load(deps.storage, &address)
                .unwrap_or_default(),
        ),
        QueryMsg::GetMaciOperatorPubkey { address } => {
            to_json_binary(&MACI_OPERATOR_PUBKEY.load(deps.storage, &address)?)
        }
        QueryMsg::GetMaciOperatorIdentity { address } => {
            to_json_binary(&MACI_OPERATOR_IDENTITY.load(deps.storage, &address)?)
        }
        QueryMsg::GetCircuitChargeConfig {} => {
            to_json_binary(&CIRCUIT_CHARGE_CONFIG.load(deps.storage)?)
        }
    }
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn reply(deps: DepsMut, env: Env, reply: Reply) -> Result<Response, ContractError> {
    match reply.id {
        CREATED_GROTH16_ROUND_REPLY_ID => {
            reply_created_round(deps, env, reply.result.into_result())
        }
        id => Err(ContractError::UnRecognizedReplyIdErr { id }),
    }
}

pub fn reply_created_round(
    deps: DepsMut,
    _env: Env,
    reply: Result<SubMsgResponse, String>,
) -> Result<Response, ContractError> {
    let response = reply.map_err(StdError::generic_err)?;
    let data = response.data.ok_or(ContractError::DataMissingErr {})?;
    // let response = parse_instantiate_response_data(&data)?;
    let response = match parse_instantiate_response_data(&data) {
        Ok(data) => data,
        Err(err) => {
            return Err(ContractError::Std(cosmwasm_std::StdError::generic_err(
                err.to_string(),
            )))
        }
    };
    let amaci_code_id = AMACI_CODE_ID.load(deps.storage)?;

    let addr = Addr::unchecked(response.clone().contract_address);
    let data = InstantiationData { addr: addr.clone() };
    let amaci_return_data: AMaciInstantiationData = from_json(
        &response
            .data
            .ok_or_else(|| ContractError::DataMissingErr {})?,
    )?;

    let mut attributes = vec![
        attr("action", "created_round"),
        attr("code_id", amaci_code_id.to_string()),
        attr("round_addr", addr.to_string()),
        attr("caller", &amaci_return_data.caller.to_string()),
        attr("admin", &amaci_return_data.admin.to_string()),
        attr("operator", &amaci_return_data.operator.to_string()),
        attr(
            "voting_start",
            &amaci_return_data.voting_time.start_time.nanos().to_string(),
        ),
        attr(
            "voting_end",
            &amaci_return_data.voting_time.end_time.nanos().to_string(),
        ),
        attr(
            "round_title",
            &amaci_return_data.round_info.title.to_string(),
        ),
        attr(
            "coordinator_pubkey_x",
            &amaci_return_data.coordinator.x.to_string(),
        ),
        attr(
            "coordinator_pubkey_y",
            &amaci_return_data.coordinator.y.to_string(),
        ),
        attr(
            "vote_option_map",
            serde_json::to_string(&amaci_return_data.vote_option_map)
                .unwrap_or_else(|_| "[]".to_string()),
        ),
        attr(
            "voice_credit_amount",
            &amaci_return_data.voice_credit_amount.to_string(),
        ),
        attr(
            "pre_deactivate_root",
            &amaci_return_data.pre_deactivate_root.to_string(),
        ),
        attr(
            "state_tree_depth",
            &amaci_return_data.parameters.state_tree_depth.to_string(),
        ),
        attr(
            "int_state_tree_depth",
            &amaci_return_data
                .parameters
                .int_state_tree_depth
                .to_string(),
        ),
        attr(
            "vote_option_tree_depth",
            &amaci_return_data
                .parameters
                .vote_option_tree_depth
                .to_string(),
        ),
        attr(
            "message_batch_size",
            &amaci_return_data.parameters.message_batch_size.to_string(),
        ),
        attr("circuit_type", &amaci_return_data.circuit_type.to_string()),
        attr(
            "certification_system",
            &amaci_return_data.certification_system.to_string(),
        ),
        attr("penalty_rate", &amaci_return_data.penalty_rate.to_string()),
        attr(
            "deactivate_timeout",
            &amaci_return_data.deactivate_timeout.seconds().to_string(),
        ),
        attr(
            "tally_timeout",
            &amaci_return_data.tally_timeout.seconds().to_string(),
        ),
    ];

    if amaci_return_data.round_info.description != "" {
        attributes.push(attr(
            "round_description",
            &amaci_return_data.round_info.description,
        ));
    }

    if amaci_return_data.round_info.link != "" {
        attributes.push(attr("round_link", &amaci_return_data.round_info.link));
    }

    Ok(Response::new()
        .add_attributes(attributes)
        .set_data(to_json_binary(&data)?))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn migrate(deps: DepsMut, _env: Env, _msg: MigrateMsg) -> Result<Response, ContractError> {
    cw2::ensure_from_older_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    migrate_v0_1_4(deps)
}
