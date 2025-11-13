#[cfg(test)]
mod tests;

pub mod certificate_generator;

use anyhow::Result as AnyResult;

use crate::{
    contract::{execute, instantiate, migrate, query, reply},
    msg::*,
    state::{CircuitChargeConfig, ValidatorSet},
};
use cosmwasm_std::{Addr, Coin, StdResult, Timestamp, Uint256};
use cw_amaci::msg::{WhitelistBase, WhitelistBaseConfig};

use cw_amaci::state::{PubKey, RoundInfo, VotingTime};
use cw_multi_test::{App, AppResponse, ContractWrapper, Executor};
pub const MOCK_CONTRACT_ADDR: &str = "cosmos2contract";
pub const DORA_DEMON: &str = "peaka";
pub const DORA_DECIMALS: u8 = 18;
pub const MIN_DEPOSIT_AMOUNT: u128 = 20u128;
pub const SLASH_AMOUNT: u128 = 1u128; // only 1, 2 (admin amount is not enough)
use num_bigint::BigUint;

pub fn uint256_from_decimal_string(decimal_string: &str) -> Uint256 {
    assert!(
        decimal_string.len() <= 77,
        "the decimal length can't abrove 77"
    );

    let decimal_number = BigUint::parse_bytes(decimal_string.as_bytes(), 10)
        .expect("Failed to parse decimal string");

    let byte_array = decimal_number.to_bytes_be();

    let hex_string = hex::encode(byte_array);
    uint256_from_hex_string(&hex_string)
}

pub fn uint256_from_decimal_string_no_check(decimal_string: &str) -> Uint256 {
    let decimal_number = BigUint::parse_bytes(decimal_string.as_bytes(), 10)
        .expect("Failed to parse decimal string");

    let byte_array = decimal_number.to_bytes_be();

    let hex_string = hex::encode(byte_array);
    uint256_from_hex_string(&hex_string)
}

pub fn uint256_from_hex_string(hex_string: &str) -> Uint256 {
    let padded_hex_string = if hex_string.len() < 64 {
        let padding_length = 64 - hex_string.len();
        format!("{:0>width$}{}", "", hex_string, width = padding_length)
    } else {
        hex_string.to_string()
    };

    let res = hex_to_decimal(&padded_hex_string);
    Uint256::from_be_bytes(res)
}

pub fn hex_to_decimal(hex_bytes: &str) -> [u8; 32] {
    let bytes = hex::decode(hex_bytes).unwrap_or_else(|_| vec![]);
    let decimal_values: Vec<u8> = bytes.iter().cloned().collect();

    let mut array: [u8; 32] = [0; 32];

    if decimal_values.len() >= 32 {
        array.copy_from_slice(&decimal_values[..32]);
    } else {
        array[..decimal_values.len()].copy_from_slice(&decimal_values);
    }

    array
}

#[derive(Clone, Debug, Copy)]
pub struct AmaciRegistryCodeId(u64);

impl AmaciRegistryCodeId {
    pub fn store_code(app: &mut App) -> Self {
        let contract = ContractWrapper::new(execute, instantiate, query).with_reply(reply);
        let code_id = app.store_code(Box::new(contract));
        Self(code_id)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn instantiate(
        self,
        app: &mut App,
        sender: Addr,
        amaci_code_id: u64,
        label: &str,
    ) -> AnyResult<AmaciRegistryContract> {
        AmaciRegistryContract::instantiate(app, self, sender, operator(), amaci_code_id, label)
    }
}

impl From<AmaciRegistryCodeId> for u64 {
    fn from(code_id: AmaciRegistryCodeId) -> Self {
        code_id.0
    }
}

#[derive(Debug, Clone)]
pub struct AmaciRegistryContract(Addr);

// implement the contract real function, e.g. instantiate, functions in exec, query modules
impl AmaciRegistryContract {
    pub fn addr(&self) -> Addr {
        self.0.clone()
    }

    #[allow(clippy::too_many_arguments)]
    #[track_caller]
    pub fn instantiate(
        app: &mut App,
        code_id: AmaciRegistryCodeId,
        sender: Addr,
        operator: Addr,
        amaci_code_id: u64,
        label: &str,
    ) -> AnyResult<Self> {
        let init_msg = InstantiateMsg {
            admin: admin().clone(),
            operator,
            amaci_code_id,
        };
        app.instantiate_contract(
            code_id.0,
            sender.clone(),
            &init_msg,
            &[],
            label,
            Some(sender.to_string()),
        )
        .map(Self::from)
    }

    #[track_caller]
    pub fn set_maci_operator(
        &self,
        app: &mut App,
        sender: Addr,
        operator: Addr,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::SetMaciOperator { operator },
            &[],
        )
    }

    #[track_caller]
    pub fn set_maci_operator_pubkey(
        &self,
        app: &mut App,
        sender: Addr,
        pubkey: PubKey,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::SetMaciOperatorPubkey { pubkey },
            &[],
        )
    }

    #[track_caller]
    pub fn create_round(
        &self,
        app: &mut App,
        sender: Addr,
        operator: Addr,
        circuit_type: Uint256,
        certification_system: Uint256,
        send_funds: &[Coin],
    ) -> AnyResult<AppResponse> {
        let round_info = RoundInfo {
            title: String::from("HackWasm Berlin"),
            description: String::from("Hack In Brelin"),
            link: String::from("https://baidu.com"),
        };

        let start_time = Timestamp::from_nanos(1571797424879000000);
        let end_time = start_time.plus_minutes(11);

        let msg = ExecuteMsg::CreateRound {
            operator,
            round_info,
            max_voter: Uint256::from_u128(5u128),
            voice_credit_amount: Uint256::from_u128(30u128),
            vote_option_map: vec![
                "".to_string(),
                "".to_string(),
                "".to_string(),
                "".to_string(),
                "".to_string(),
            ],
            voting_time: VotingTime {
                start_time,
                end_time,
            },
            whitelist: None,
            pre_deactivate_root: Uint256::from_u128(0u128),
            circuit_type,
            certification_system,
            oracle_whitelist_pubkey: None,
            pre_deactivate_coordinator: None,
        };

        app.execute_contract(sender, self.addr(), &msg, send_funds)
    }

    #[track_caller]
    pub fn create_round_with_whitelist(
        &self,
        app: &mut App,
        sender: Addr,
        operator: Addr,
        circuit_type: Uint256,
        certification_system: Uint256,
        send_funds: &[Coin],
    ) -> AnyResult<AppResponse> {
        let round_info = RoundInfo {
            title: String::from("HackWasm Berlin"),
            description: String::from("Hack In Brelin"),
            link: String::from("https://baidu.com"),
        };

        let start_time = Timestamp::from_nanos(1571797424879000000);
        let end_time = start_time.plus_minutes(21);

        let whitelist = Some(WhitelistBase {
            users: vec![
                WhitelistBaseConfig { addr: user1() },
                WhitelistBaseConfig { addr: user2() },
                WhitelistBaseConfig { addr: user3() },
            ],
        });

        let msg = ExecuteMsg::CreateRound {
            operator,
            round_info,
            max_voter: Uint256::from_u128(3u128),
            voice_credit_amount: Uint256::from_u128(100u128),
            vote_option_map: vec![
                "".to_string(),
                "".to_string(),
                "".to_string(),
                "".to_string(),
                "".to_string(),
            ],
            voting_time: VotingTime {
                start_time,
                end_time,
            },
            whitelist,
            pre_deactivate_root: Uint256::from_u128(0u128),
            circuit_type,
            certification_system,
            oracle_whitelist_pubkey: None,
            pre_deactivate_coordinator: None,
        };

        app.execute_contract(sender, self.addr(), &msg, send_funds)
    }

    #[track_caller]
    pub fn create_round_with_oracle(
        &self,
        app: &mut App,
        sender: Addr,
        operator: Addr,
        circuit_type: Uint256,
        certification_system: Uint256,
        oracle_whitelist_pubkey: String,
        send_funds: &[Coin],
    ) -> AnyResult<AppResponse> {
        let round_info = RoundInfo {
            title: String::from("Oracle MACI Test"),
            description: String::from("Testing Oracle MACI mode"),
            link: String::from("https://test.com"),
        };

        let start_time = Timestamp::from_nanos(1571797424879000000);
        let end_time = start_time.plus_minutes(21);

        let msg = ExecuteMsg::CreateRound {
            operator,
            round_info,
            max_voter: Uint256::from_u128(5u128),
            voice_credit_amount: Uint256::from_u128(100u128),
            vote_option_map: vec![
                "".to_string(),
                "".to_string(),
                "".to_string(),
                "".to_string(),
                "".to_string(),
            ],
            voting_time: VotingTime {
                start_time,
                end_time,
            },
            whitelist: None,
            pre_deactivate_root: Uint256::from_u128(0u128),
            circuit_type,
            certification_system,
            oracle_whitelist_pubkey: Some(oracle_whitelist_pubkey),
            pre_deactivate_coordinator: None,
        };

        app.execute_contract(sender, self.addr(), &msg, send_funds)
    }

    // #[track_caller]
    // pub fn upload_deactivate_message(
    //     &self,
    //     app: &mut App,
    //     sender: Addr,
    //     contract_address: Addr,
    //     deactivate_message: Vec<Vec<Uint256>>,
    // ) -> AnyResult<AppResponse> {
    //     app.execute_contract(
    //         sender,
    //         self.addr(),
    //         &ExecuteMsg::UploadDeactivateMessage {
    //             contract_address,
    //             deactivate_message,
    //         },
    //         &[],
    //     )
    // }

    #[track_caller]
    pub fn set_validators(&self, app: &mut App, sender: Addr) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::SetValidators {
                addresses: ValidatorSet {
                    addresses: vec![user1(), user2(), user4()],
                },
            },
            &[],
        )
    }

    #[track_caller]
    pub fn set_validators_all(&self, app: &mut App, sender: Addr) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::SetValidators {
                addresses: ValidatorSet {
                    addresses: vec![user1(), user2(), user3()],
                },
            },
            &[],
        )
    }

    #[track_caller]
    pub fn remove_validator(
        &self,
        app: &mut App,
        sender: Addr,
        address: Addr,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::RemoveValidator { address },
            &[],
        )
    }

    #[track_caller]
    pub fn change_operator(
        &self,
        app: &mut App,
        sender: Addr,
        address: Addr,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::ChangeOperator { address },
            &[],
        )
    }

    pub fn get_admin(&self, app: &App) -> StdResult<AdminResponse> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::Admin {})
    }

    pub fn is_maci_operator(&self, app: &App, address: Addr) -> StdResult<bool> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::IsMaciOperator { address })
    }

    pub fn get_circuit_charge_config(&self, app: &App) -> StdResult<CircuitChargeConfig> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetCircuitChargeConfig {})
    }

    pub fn balance_of(&self, app: &App, address: String, denom: String) -> StdResult<Coin> {
        app.wrap().query_balance(address, denom)
    }

    pub fn is_validator(&self, app: &App, address: Addr) -> StdResult<bool> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::IsValidator { address })
    }

    pub fn get_validators(&self, app: &App) -> StdResult<ValidatorSet> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetValidators {})
    }

    pub fn get_validator_operator(&self, app: &App, address: Addr) -> StdResult<Addr> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetValidatorOperator { address })
    }

    pub fn get_operator_pubkey(&self, app: &App, address: Addr) -> StdResult<PubKey> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetMaciOperatorPubkey { address })
    }
}

impl From<Addr> for AmaciRegistryContract {
    fn from(value: Addr) -> Self {
        Self(value)
    }
}

pub fn user1() -> Addr {
    Addr::unchecked("0")
}

pub fn user2() -> Addr {
    Addr::unchecked("1")
}

pub fn user3() -> Addr {
    Addr::unchecked("2")
}

pub fn user4() -> Addr {
    Addr::unchecked("3")
}

pub fn user5() -> Addr {
    Addr::unchecked("4")
}

pub fn admin() -> Addr {
    Addr::unchecked("admin")
}

pub fn validator() -> Addr {
    Addr::unchecked("validator1")
}

pub fn validator2() -> Addr {
    Addr::unchecked("validator2")
}

pub fn operator() -> Addr {
    Addr::unchecked("dora1eu7mhp4ggxd6utnz8uzurw395natgs6jskl4ug")
}

pub fn operator2() -> Addr {
    Addr::unchecked("dora1x0lkxq7g7eaq2u3uh2l39yhzf5046h00w2mlsf")
}

pub fn operator3() -> Addr {
    Addr::unchecked("dora1xp0twdzsdeq4qg3c64v66552deax8zmvq4zw78")
}

pub fn creator() -> Addr {
    Addr::unchecked("creator")
}

pub fn contract_address() -> Addr {
    Addr::unchecked("dora1smdzpfsy48kmkzmm4m9hsg4850czdvfncxyxp6d4h3j7qv3m4v0s0530a6")
}

pub fn operator_pubkey1() -> PubKey {
    return PubKey {
        x: uint256_from_decimal_string(
            "3557592161792765812904087712812111121909518311142005886657252371904276697771",
        ),
        y: uint256_from_decimal_string(
            "4363822302427519764561660537570341277214758164895027920046745209970137856681",
        ),
    };
}

pub fn operator_pubkey2() -> PubKey {
    return PubKey {
        x: uint256_from_decimal_string(
            "4363822302427519764561660537570341277214758164895027920046745209970137856681",
        ),
        y: uint256_from_decimal_string(
            "3557592161792765812904087712812111121909518311142005886657252371904276697771",
        ),
    };
}

pub fn operator_pubkey3() -> PubKey {
    return PubKey {
        x: uint256_from_decimal_string(
            "4363822302427519764561660537570341277214758164895027920046745209970137856681",
        ),
        y: uint256_from_decimal_string(
            "4363822302427519764561660537570341277214758164895027920046745209970137856681",
        ),
    };
}
