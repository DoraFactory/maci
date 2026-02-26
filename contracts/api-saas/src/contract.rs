#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{
    attr, to_json_binary, Addr, BankMsg, Binary, Coin, CosmosMsg, Deps, DepsMut, Env, MessageInfo,
    Order, Reply, Response, StdError, StdResult, SubMsg, SubMsgResponse, Uint128, Uint256, WasmMsg,
};
use cw2::set_contract_version;
use cw_utils::{may_pay, parse_instantiate_response_data};

use cosmos_sdk_proto::cosmos::base::v1beta1::Coin as SdkCoin;
use cosmos_sdk_proto::cosmos::feegrant::v1beta1::{
    AllowedMsgAllowance, BasicAllowance, MsgGrantAllowance, MsgRevokeAllowance,
};
use cosmos_sdk_proto::Any;
use prost::Message;

// External contract types with aliases to avoid path conflicts
use cw_amaci::msg::RegistrationModeConfig;
use cw_amaci::state::{RoundInfo, VoiceCreditMode, VotingTime};

// use cw_maci::state::VotingPowerMode; // Unused after Unified MACI refactoring

use cosmos_sdk_proto::traits::TypeUrl;
// Local contract types
use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, InstantiationData, MigrateMsg, QueryMsg};
use crate::state::{
    Config, OperatorInfo, CONFIG, OPERATORS, REGISTRY_CONTRACT_ADDR, TOTAL_BALANCE,
    TREASURY_MANAGER,
};

// Version info for migration
const CONTRACT_NAME: &str = "crates.io:cw-saas";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

// Reply IDs
pub const CREATED_AMACI_ROUND_REPLY_ID: u64 = 2;

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    let config = Config {
        admin: msg.admin,
        denom: msg.denom,
    };

    CONFIG.save(deps.storage, &config)?;
    // Store treasury manager separately for easier access
    TREASURY_MANAGER.save(deps.storage, &msg.treasury_manager)?;
    TOTAL_BALANCE.save(deps.storage, &Uint128::zero())?;
    REGISTRY_CONTRACT_ADDR.save(deps.storage, &msg.registry_contract)?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("admin", config.admin.to_string())
        .add_attribute("treasury_manager", msg.treasury_manager.to_string())
        .add_attribute("denom", config.denom))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::UpdateConfig { admin, denom } => {
            execute_update_config(deps, info, admin, denom)
        }
        ExecuteMsg::UpdateAmaciRegistryContract { registry_contract } => {
            execute_update_amaci_registry_contract(deps, info, registry_contract)
        }
        ExecuteMsg::AddOperator { operator } => execute_add_operator(deps, env, info, operator),
        ExecuteMsg::RemoveOperator { operator } => {
            execute_remove_operator(deps, env, info, operator)
        }
        ExecuteMsg::Deposit {} => execute_deposit(deps, env, info),
        ExecuteMsg::Withdraw { amount, recipient } => {
            execute_withdraw(deps, env, info, amount, recipient)
        }

        ExecuteMsg::SetRoundInfo {
            contract_addr,
            round_info,
        } => execute_set_round_info(deps, env, info, contract_addr, round_info),
        ExecuteMsg::SetVoteOptionsMap {
            contract_addr,
            vote_option_map,
        } => execute_set_vote_options_map(deps, env, info, contract_addr, vote_option_map),
        ExecuteMsg::CreateAmaciRound {
            operator,
            max_voter,
            vote_option_map,
            round_info,
            voting_time,
            circuit_type,
            certification_system,
            deactivate_enabled,
            voice_credit_mode,
            registration_mode,
        } => execute_create_amaci_round(
            deps,
            env,
            info,
            operator,
            max_voter,
            vote_option_map,
            round_info,
            voting_time,
            circuit_type,
            certification_system,
            deactivate_enabled,
            voice_credit_mode,
            registration_mode,
        ),
    }
}

pub fn execute_update_config(
    deps: DepsMut,
    info: MessageInfo,
    admin: Option<Addr>,
    denom: Option<String>,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;

    // Only admin can update config
    if !config.is_admin(&info.sender) {
        return Err(ContractError::Unauthorized {});
    }

    if let Some(admin) = admin {
        config.admin = admin;
    }
    if let Some(denom) = denom {
        config.denom = denom;
    }

    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new().add_attribute("action", "update_config"))
}

pub fn execute_update_amaci_registry_contract(
    deps: DepsMut,
    info: MessageInfo,
    registry_contract: Addr,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Only admin can update config
    if !config.is_admin(&info.sender) {
        return Err(ContractError::Unauthorized {});
    }

    REGISTRY_CONTRACT_ADDR.save(deps.storage, &registry_contract)?;

    Ok(Response::new()
        .add_attribute("action", "update_amaci_registry_contract")
        .add_attribute("registry_contract", registry_contract.to_string()))
}

pub fn execute_add_operator(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    operator: Addr,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Only admin can add operators
    if !config.is_admin(&info.sender) {
        return Err(ContractError::Unauthorized {});
    }

    // Check if operator already exists
    if OPERATORS.has(deps.storage, &operator) {
        return Err(ContractError::OperatorAlreadyExists {});
    }

    // Create new operator
    let operator_info = OperatorInfo::new(operator.clone(), env.block.time);

    // Large feegrant amount for operators - 10 billion tokens in smallest unit
    let feegrant_amount = Uint128::from(10_000_000_000_000_000_000_000_000u128);

    // Create basic allowance
    let allowance = BasicAllowance {
        spend_limit: vec![SdkCoin {
            denom: config.denom.clone(),
            amount: feegrant_amount.to_string(),
        }],
        expiration: None,
    };

    // Create allowed message allowance (for execute contract calls)
    let allowed_allowance = AllowedMsgAllowance {
        allowance: Some(Any {
            type_url: BasicAllowance::TYPE_URL.to_string(),
            value: allowance.encode_to_vec(),
        }),
        allowed_messages: vec!["/cosmwasm.wasm.v1.MsgExecuteContract".to_string()],
    };

    // Create grant message
    let grant_msg = MsgGrantAllowance {
        granter: env.contract.address.to_string(),
        grantee: operator.to_string(),
        allowance: Some(Any {
            type_url: AllowedMsgAllowance::TYPE_URL.to_string(),
            value: allowed_allowance.encode_to_vec(),
        }),
    };

    let grant_message = CosmosMsg::Stargate {
        type_url: MsgGrantAllowance::TYPE_URL.to_string(),
        value: grant_msg.encode_to_vec().into(),
    };

    // Save operator info
    OPERATORS.save(deps.storage, &operator, &operator_info)?;

    Ok(Response::new()
        .add_message(grant_message)
        .add_attribute("action", "add_operator")
        .add_attribute("operator", operator.to_string())
        .add_attribute("feegrant_action", "auto_grant")
        .add_attribute("feegrant_amount", feegrant_amount.to_string())
        .add_attribute("feegrant_denom", config.denom))
}

pub fn execute_remove_operator(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    operator: Addr,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Only admin can remove operators
    if !config.is_admin(&info.sender) {
        return Err(ContractError::Unauthorized {});
    }

    // Check if operator exists
    if !OPERATORS.has(deps.storage, &operator) {
        return Err(ContractError::OperatorNotFound {});
    }

    // Create revoke message (operators always have feegrant)
    let revoke_msg = MsgRevokeAllowance {
        granter: env.contract.address.to_string(),
        grantee: operator.to_string(),
    };

    let revoke_message = CosmosMsg::Stargate {
        type_url: MsgRevokeAllowance::TYPE_URL.to_string(),
        value: revoke_msg.encode_to_vec().into(),
    };

    // Remove operator from storage
    OPERATORS.remove(deps.storage, &operator);

    Ok(Response::new()
        .add_message(revoke_message)
        .add_attribute("action", "remove_operator")
        .add_attribute("operator", operator.to_string())
        .add_attribute("feegrant_action", "auto_revoke"))
}

pub fn execute_deposit(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Check if funds were sent
    let amount = may_pay(&info, &config.denom)?;
    if amount.is_zero() {
        return Err(ContractError::NoFunds {});
    }

    // Update total balance
    let mut total_balance = TOTAL_BALANCE.load(deps.storage)?;
    total_balance += amount;
    TOTAL_BALANCE.save(deps.storage, &total_balance)?;

    Ok(Response::new()
        .add_attribute("action", "deposit")
        .add_attribute("sender", info.sender.to_string())
        .add_attribute("amount", amount.to_string())
        .add_attribute("total_balance", total_balance.to_string()))
}

pub fn execute_withdraw(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    amount: Uint128,
    recipient: Option<Addr>,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Only treasury manager can withdraw
    if !is_treasury_manager(deps.as_ref(), info.sender.as_ref())? {
        return Err(ContractError::TreasuryManagerUnauthorized {});
    }

    if amount.is_zero() {
        return Err(ContractError::InvalidWithdrawAmount {});
    }

    // Check if sufficient balance
    let total_balance = TOTAL_BALANCE.load(deps.storage)?;
    if total_balance < amount {
        return Err(ContractError::InsufficientBalance {
            required: amount,
            available: total_balance,
        });
    }

    // Update total balance
    let new_balance = total_balance - amount;
    TOTAL_BALANCE.save(deps.storage, &new_balance)?;

    // Send funds to recipient
    let recipient_addr = recipient.unwrap_or_else(|| info.sender.clone());
    let msg = BankMsg::Send {
        to_address: recipient_addr.to_string(),
        amount: vec![Coin {
            denom: config.denom,
            amount,
        }],
    };

    Ok(Response::new()
        .add_message(msg)
        .add_attribute("action", "withdraw")
        .add_attribute("amount", amount.to_string())
        .add_attribute("recipient", recipient_addr.to_string())
        .add_attribute("new_balance", new_balance.to_string()))
}

pub fn execute_set_round_info(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    contract_addr: String,
    round_info: RoundInfo,
) -> Result<Response, ContractError> {
    // Only operators can manage Oracle MACI contracts
    if !OPERATORS.has(deps.storage, &info.sender) {
        return Err(ContractError::Unauthorized {});
    }

    // Validate the contract address format
    let target_addr = deps.api.addr_validate(&contract_addr)?;

    // Create Oracle MACI SetRoundInfo message
    let oracle_maci_msg = serde_json::json!({
        "set_round_info": {
            "round_info": {
                "title": round_info.title,
                "description": round_info.description,
                "link": round_info.link
            }
        }
    });

    // Execute the contract call
    let execute_msg = WasmMsg::Execute {
        contract_addr: target_addr.to_string(),
        msg: to_json_binary(&oracle_maci_msg)?,
        funds: vec![],
    };

    Ok(Response::new()
        .add_message(execute_msg)
        .add_attribute("action", "saas_set_round_info")
        .add_attribute("operator", info.sender.to_string())
        .add_attribute("target_contract", contract_addr)
        .add_attribute("round_title", round_info.title))
}

pub fn execute_set_vote_options_map(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    contract_addr: String,
    vote_option_map: Vec<String>,
) -> Result<Response, ContractError> {
    // Only operators can manage Oracle MACI contracts
    if !OPERATORS.has(deps.storage, &info.sender) {
        return Err(ContractError::Unauthorized {});
    }

    // Validate the contract address format
    let target_addr = deps.api.addr_validate(&contract_addr)?;

    // Create Oracle MACI SetVoteOptionsMap message
    let oracle_maci_msg = serde_json::json!({
        "set_vote_options_map": {
            "vote_option_map": vote_option_map
        }
    });

    // Execute the contract call
    let execute_msg = WasmMsg::Execute {
        contract_addr: target_addr.to_string(),
        msg: to_json_binary(&oracle_maci_msg)?,
        funds: vec![],
    };

    Ok(Response::new()
        .add_message(execute_msg)
        .add_attribute("action", "saas_set_vote_option")
        .add_attribute("operator", info.sender.to_string())
        .add_attribute("target_contract", contract_addr)
        .add_attribute(
            "vote_option_map",
            serde_json::to_string(&vote_option_map).unwrap_or_else(|_| "[]".to_string()),
        ))
}

/// Create AMACI round via registry using Unified MACI API
pub fn execute_create_amaci_round(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    operator: Addr,
    max_voter: Uint256,
    vote_option_map: Vec<String>,
    round_info: RoundInfo,
    voting_time: VotingTime,
    circuit_type: Uint256,
    certification_system: Uint256,
    deactivate_enabled: bool,
    voice_credit_mode: VoiceCreditMode,
    registration_mode: RegistrationModeConfig,
) -> Result<Response, ContractError> {
    // Only operators can create AMACI rounds via registry
    if !OPERATORS.has(deps.storage, &info.sender) {
        return Err(ContractError::Unauthorized {});
    }

    // Load registry contract address and config
    let registry_contract = REGISTRY_CONTRACT_ADDR.load(deps.storage)?;
    let config = CONFIG.load(deps.storage)?;

    // Calculate required fee using registry's centralized calculation logic
    let max_option = Uint256::from_u128(vote_option_map.len() as u128);
    let required_fee = cw_amaci_registry::utils::calculate_round_fee(max_voter, max_option)
        .map_err(|_| ContractError::InvalidOracleMaciParameters {
            reason: "No matched size circuit".to_string(),
        })?;

    // Check if SaaS contract has sufficient balance
    let total_balance = TOTAL_BALANCE.load(deps.storage)?;
    if total_balance < required_fee {
        return Err(ContractError::InsufficientBalance {
            required: required_fee,
            available: total_balance,
        });
    }

    // Deduct fee from SaaS contract balance
    let new_balance = total_balance - required_fee;
    TOTAL_BALANCE.save(deps.storage, &new_balance)?;

    // Create registry CreateRound message using Unified MACI API
    // This now matches the registry's API exactly
    let registry_msg = cw_amaci_registry::msg::ExecuteMsg::CreateRound {
        operator,
        max_voter,
        vote_option_map: vote_option_map.clone(),
        round_info: round_info.clone(),
        voting_time,
        circuit_type,
        certification_system,
        deactivate_enabled,
        voice_credit_mode: voice_credit_mode.clone(),
        registration_mode,
    };

    // Execute the contract call to registry with the required fee from SaaS balance
    let execute_msg = WasmMsg::Execute {
        contract_addr: registry_contract.to_string(),
        msg: to_json_binary(&registry_msg)?,
        funds: vec![Coin {
            denom: config.denom,
            amount: required_fee,
        }],
    };

    // Use SubMsg with reply to get the created contract address
    let submsg = SubMsg::reply_on_success(execute_msg, CREATED_AMACI_ROUND_REPLY_ID);

    Ok(Response::new()
        .add_submessage(submsg)
        .add_attribute("action", "create_amaci_round")
        .add_attribute("operator", info.sender.to_string())
        .add_attribute("registry_contract", registry_contract.to_string())
        .add_attribute("round_title", round_info.title)
        .add_attribute("max_voter", max_voter.to_string())
        .add_attribute("max_option", vote_option_map.len().to_string())
        .add_attribute("fee_paid", required_fee.to_string())
        .add_attribute("saas_balance_after", new_balance.to_string())
        .add_attribute("deactivate_enabled", deactivate_enabled.to_string())
        .add_attribute("voice_credit_mode", format!("{:?}", voice_credit_mode)))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&CONFIG.load(deps.storage)?),
        QueryMsg::Operators {} => to_json_binary(&query_operators(deps)?),
        QueryMsg::IsOperator { address } => to_json_binary(&query_is_operator(deps, address)?),
        QueryMsg::Balance {} => to_json_binary(&TOTAL_BALANCE.load(deps.storage)?),
        QueryMsg::TreasuryManager {} => to_json_binary(&TREASURY_MANAGER.load(deps.storage)?),
    }
}

fn query_operators(deps: Deps) -> StdResult<Vec<OperatorInfo>> {
    OPERATORS
        .range(deps.storage, None, None, Order::Ascending)
        .map(|item| item.map(|(_, operator_info)| operator_info))
        .collect()
}

fn query_is_operator(deps: Deps, address: Addr) -> StdResult<bool> {
    Ok(OPERATORS.has(deps.storage, &address))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn reply(deps: DepsMut, env: Env, msg: Reply) -> Result<Response, ContractError> {
    match msg.id {
        CREATED_AMACI_ROUND_REPLY_ID => {
            reply_created_amaci_round(deps, env, msg.result.into_result())
        }
        id => Err(ContractError::Std(StdError::generic_err(format!(
            "Unknown reply id: {}",
            id
        )))),
    }
}

fn reply_created_amaci_round(
    _deps: DepsMut,
    _env: Env,
    result: Result<SubMsgResponse, String>,
) -> Result<Response, ContractError> {
    // Parse SubMsg response from registry
    let response = result.map_err(StdError::generic_err)?;

    // Parse response data using the same method as in api-maci
    let data = response
        .data
        .ok_or(ContractError::Std(StdError::generic_err(
            "Data missing from response",
        )))?;

    // Try to parse the instantiation data from Registry response
    let parsed_response = match parse_instantiate_response_data(&data) {
        Ok(data) => data,
        Err(err) => {
            return Err(ContractError::Std(StdError::generic_err(format!(
                "Failed to parse instantiate response: {}",
                err
            ))))
        }
    };

    let amaci_contract_addr = Addr::unchecked(parsed_response.contract_address.clone());

    // Extract information from response events for indexer
    let mut event_attrs = std::collections::HashMap::new();

    for event in response.events {
        for attr in event.attributes {
            match attr.key.as_str() {
                // Store all AMACI-related attributes for indexer
                "code_id"
                | "round_addr"
                | "operator"
                | "vote_option_map"
                | "voice_credit_amount"
                | "pre_deactivate_root"
                | "state_tree_depth"
                | "int_state_tree_depth"
                | "vote_option_tree_depth"
                | "message_batch_size"
                | "circuit_type"
                | "certification_system"
                | "penalty_rate"
                | "deactivate_timeout"
                | "tally_timeout"
                | "voting_start"
                | "voting_end"
                | "round_title"
                | "round_description"
                | "round_link"
                | "coordinator_pubkey_x"
                | "coordinator_pubkey_y"
                | "caller"
                | "admin" => {
                    event_attrs.insert(attr.key.clone(), attr.value.clone());
                }
                _ => {}
            }
        }
    }

    // Prepare return data with the AMACI contract address
    let saas_instantiation_data = InstantiationData {
        addr: amaci_contract_addr.clone(),
    };

    // Create a minimal AMACI instantiation data structure
    // We don't have all the data that the original AMACI contract returned,
    // but we have enough to continue with the response

    let mut attributes = vec![attr("action", "created_amaci_round")];

    // Add all extracted event attributes for indexer
    for (key, value) in event_attrs {
        attributes.push(attr(&key, &value));
    }

    Ok(Response::new()
        .add_attributes(attributes)
        .set_data(to_json_binary(&saas_instantiation_data)?))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn migrate(deps: DepsMut, _env: Env, _msg: MigrateMsg) -> Result<Response, ContractError> {
    cw2::ensure_from_older_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    Ok(Response::new().add_attributes(vec![
        attr("action", "migrate"),
        attr("version", CONTRACT_VERSION),
    ]))
}

// Utility functions
fn is_treasury_manager(deps: Deps, sender: &str) -> StdResult<bool> {
    let treasury_manager = TREASURY_MANAGER.load(deps.storage)?;
    let sender_addr = Addr::unchecked(sender);
    Ok(treasury_manager == sender_addr)
}

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
