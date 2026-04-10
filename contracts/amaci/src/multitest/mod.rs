#[cfg(test)]
mod certificate_generator;
#[cfg(test)]
mod tests;

use anyhow::Result as AnyResult;

use crate::state::{
    DelayRecords, MaciParameters, MessageData, Period, PubKey, RoundInfo, VoiceCreditMode,
    VotingTime, FEE_DENOM,
};
use crate::{
    contract::{execute, instantiate, query},
    msg::*,
};
use maci_utils::uint256_from_hex_string;

use cosmwasm_std::testing::{MockApi, MockStorage};
use cosmwasm_std::{coins, Addr, Empty, StdResult, Timestamp, Uint128, Uint256};
use cw_multi_test::App as DefaultApp;
use cw_multi_test::{
    AppBuilder, AppResponse, BankKeeper, ContractWrapper, DistributionKeeper, Executor,
    FailingModule, GovFailingModule, IbcFailingModule, StakeKeeper, StargateAccepting, WasmKeeper,
};
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
pub const MOCK_CONTRACT_ADDR: &str = "cosmos2contract";
// pub const ARCH_DEMON: &str = "aconst";
// pub const ARCH_DECIMALS: u8 = 18;

pub type App<ExecC = Empty, QueryC = Empty> = cw_multi_test::App<
    BankKeeper,
    MockApi,
    MockStorage,
    FailingModule<ExecC, QueryC, Empty>,
    WasmKeeper<ExecC, QueryC>,
    StakeKeeper,
    DistributionKeeper,
    IbcFailingModule,
    GovFailingModule,
    StargateAccepting,
>;

// 1000 DORA per test user, enough to cover all publish_message fees in any test
const TEST_USER_BALANCE: u128 = 1_000_000_000_000_000_000_000u128;
pub const MESSAGE_FEE: Uint128 = Uint128::new(60_000_000_000_000_000);
pub const DEACTIVATE_FEE: Uint128 = Uint128::new(10_000_000_000_000_000_000);
pub const SIGNUP_FEE: Uint128 = Uint128::new(30_000_000_000_000_000);
pub const BASE_DELAY: u64 = 200;
pub const PER_MESSAGE_DELAY: u64 = 2;
pub const PER_SIGNUP_DELAY: u64 = 1;
pub const DEACTIVATE_DELAY: u64 = 600;

pub fn dora_mock_api() -> MockApi {
    MockApi::default().with_prefix("dora")
}

pub fn create_app() -> App {
    AppBuilder::new()
        .with_api(dora_mock_api())
        .with_stargate(StargateAccepting)
        .build(|router, _, storage| {
            for addr in [user1(), user2(), user3(), owner(), operator(), fee_recipient()] {
                router
                    .bank
                    .init_balance(storage, &addr, coins(TEST_USER_BALANCE, "peaka"))
                    .unwrap();
            }
        })
}

#[derive(Clone, Debug, Copy)]
pub struct MaciCodeId(u64);

impl MaciCodeId {
    pub fn id(&self) -> u64 {
        self.0
    }

    pub fn store_default_code(app: &mut DefaultApp) -> Self {
        let contract =
            // ContractWrapper::new(execute, instantiate, query).with_reply(reply);
        ContractWrapper::new(execute, instantiate, query);

        let code_id = app.store_code(Box::new(contract));
        Self(code_id)
    }

    pub fn store_code(app: &mut App) -> Self {
        let contract = ContractWrapper::new(execute, instantiate, query);
        let code_id = app.store_code(Box::new(contract));
        Self(code_id)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn instantiate_with_voting_time(
        self,
        app: &mut App,
        sender: Addr,
        user1: Addr,
        user2: Addr,
        label: &str,
    ) -> AnyResult<MaciContract> {
        let round_info = RoundInfo {
            title: String::from("HackWasm Berlin"),
            description: String::from("Hack In Brelin"),
            link: String::from("https://baidu.com"),
        };
        let whitelist = Some(WhitelistBase {
            users: vec![
                WhitelistBaseConfig {
                    addr: user1,
                    voice_credit_amount: None,
                },
                WhitelistBaseConfig {
                    addr: user2,
                    voice_credit_amount: None,
                },
            ],
        });

        let start_time = Timestamp::from_nanos(1571797424879000000);
        let end_time = start_time.plus_minutes(11);
        let voting_time = VotingTime {
            start_time,
            end_time,
        };
        let circuit_type = Uint256::from_u128(0u128);
        let certification_system = Uint256::from_u128(0u128);
        MaciContract::instantiate(
            app,
            self,
            sender,
            round_info,
            whitelist,
            voting_time,
            circuit_type,
            certification_system,
            label,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn instantiate_with_wrong_voting_time(
        self,
        app: &mut App,
        sender: Addr,
        user1: Addr,
        user2: Addr,
        label: &str,
    ) -> AnyResult<MaciContract> {
        let round_info = RoundInfo {
            title: String::from("HackWasm Berlin"),
            description: String::from("Hack In Brelin"),
            link: String::from("https://baidu.com"),
        };
        let whitelist = Some(WhitelistBase {
            users: vec![
                WhitelistBaseConfig {
                    addr: user1,
                    voice_credit_amount: None,
                },
                WhitelistBaseConfig {
                    addr: user2,
                    voice_credit_amount: None,
                },
            ],
        });
        let voting_time = VotingTime {
            start_time: Timestamp::from_nanos(1571797429879300000),
            end_time: Timestamp::from_nanos(1571797424879000000),
        };
        let circuit_type = Uint256::from_u128(0u128);
        let certification_system = Uint256::from_u128(0u128);
        MaciContract::instantiate(
            app,
            self,
            sender,
            round_info,
            whitelist,
            voting_time,
            circuit_type,
            certification_system,
            label,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn instantiate_with_voting_time_and_no_whitelist(
        self,
        app: &mut App,
        sender: Addr,
        label: &str,
    ) -> AnyResult<MaciContract> {
        let round_info = RoundInfo {
            title: String::from("HackWasm Berlin"),
            description: String::from("Hack In Brelin"),
            link: String::from("https://baidu.com"),
        };
        let voting_time = VotingTime {
            start_time: Timestamp::from_nanos(1571797424879000000),
            end_time: Timestamp::from_nanos(1571797429879300000),
        };

        let circuit_type = Uint256::from_u128(0u128);
        let certification_system = Uint256::from_u128(0u128);
        MaciContract::instantiate(
            app,
            self,
            sender,
            round_info,
            None,
            voting_time,
            circuit_type,
            certification_system,
            label,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn instantiate_with_voting_time_isqv(
        self,
        app: &mut App,
        sender: Addr,
        user1: Addr,
        user2: Addr,
        label: &str,
    ) -> AnyResult<MaciContract> {
        let round_info = RoundInfo {
            title: String::from("HackWasm Berlin"),
            description: String::from("Hack In Brelin"),
            link: String::from("https://baidu.com"),
        };
        let whitelist = Some(WhitelistBase {
            users: vec![
                WhitelistBaseConfig {
                    addr: user1,
                    voice_credit_amount: None,
                },
                WhitelistBaseConfig {
                    addr: user2,
                    voice_credit_amount: None,
                },
            ],
        });
        let voting_time = VotingTime {
            start_time: Timestamp::from_nanos(1571797424879000000),
            end_time: Timestamp::from_nanos(1571797429879300000),
        };
        let circuit_type = Uint256::from_u128(1u128);
        let certification_system = Uint256::from_u128(0u128);
        MaciContract::instantiate(
            app,
            self,
            sender,
            round_info,
            whitelist,
            voting_time,
            circuit_type,
            certification_system,
            label,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn instantiate_with_voting_time_isqv_amaci(
        self,
        app: &mut App,
        sender: Addr,
        user1: Addr,
        user2: Addr,
        user3: Addr,
        label: &str,
    ) -> AnyResult<MaciContract> {
        let round_info = RoundInfo {
            title: String::from("HackWasm Berlin"),
            description: String::from("Hack In Brelin"),
            link: String::from("https://baidu.com"),
        };
        let whitelist = Some(WhitelistBase {
            users: vec![
                WhitelistBaseConfig {
                    addr: user1,
                    voice_credit_amount: None,
                },
                WhitelistBaseConfig {
                    addr: user2,
                    voice_credit_amount: None,
                },
                WhitelistBaseConfig {
                    addr: user3,
                    voice_credit_amount: None,
                },
            ],
        });
        let start_time = Timestamp::from_nanos(1571797424879000000);
        let end_time = start_time.plus_minutes(11);
        let voting_time = VotingTime {
            start_time,
            end_time,
        };
        let circuit_type = Uint256::from_u128(1u128);
        let certification_system = Uint256::from_u128(0u128);
        MaciContract::instantiate_decative_and_add_new_key_zkey(
            app,
            self,
            sender,
            round_info,
            whitelist,
            voting_time,
            circuit_type,
            certification_system,
            label,
        )
    }
}

impl From<MaciCodeId> for u64 {
    fn from(code_id: MaciCodeId) -> Self {
        code_id.0
    }
}

#[derive(Debug, Clone)]
pub struct MaciContract(Addr);

// implement the contract real function, e.g. instantiate, functions in exec, query modules
impl MaciContract {
    pub fn addr(&self) -> Addr {
        self.0.clone()
    }

    pub fn new(addr: Addr) -> Self {
        MaciContract(addr)
    }

    #[allow(clippy::too_many_arguments)]
    #[track_caller]
    pub fn instantiate(
        app: &mut App,
        code_id: MaciCodeId,
        sender: Addr,
        round_info: RoundInfo,
        whitelist: Option<WhitelistBase>,
        voting_time: VotingTime,
        circuit_type: Uint256,
        certification_system: Uint256,
        label: &str,
    ) -> AnyResult<Self> {
        let parameters = MaciParameters {
            state_tree_depth: Uint256::from_u128(2u128),
            int_state_tree_depth: Uint256::from_u128(1u128),
            message_batch_size: Uint256::from_u128(5u128),
            vote_option_tree_depth: Uint256::from_u128(1u128),
        };
        let init_msg = InstantiateMsg {
            parameters,
            coordinator: PubKey {
                x: uint256_from_decimal_string(
                    "3557592161792765812904087712812111121909518311142005886657252371904276697771",
                ),
                y: uint256_from_decimal_string(
                    "4363822302427519764561660537570341277214758164895027920046745209970137856681",
                ),
            },
            vote_option_map: vec![
                "Option 1".to_string(),
                "Option 2".to_string(),
                "Option 3".to_string(),
                "Option 4".to_string(),
                "Option 5".to_string(),
            ],
            round_info,
            voting_time,
            circuit_type,
            certification_system,
            operator: operator(),
            admin: owner(),
            fee_recipient: fee_recipient(),
            poll_id: 1u64,
            // Unified MACI Configuration
            voice_credit_mode: VoiceCreditMode::Unified {
                amount: Uint256::from_u128(100u128),
            },
            registration_mode: RegistrationModeConfig::SignUpWithStaticWhitelist {
                whitelist: whitelist.unwrap_or_else(|| WhitelistBase { users: vec![] }),
            },
            message_fee: MESSAGE_FEE,
            deactivate_fee: DEACTIVATE_FEE,
            signup_fee: SIGNUP_FEE,
            base_delay: BASE_DELAY,
            message_delay: PER_MESSAGE_DELAY,
            signup_delay: PER_SIGNUP_DELAY,
            deactivate_delay: DEACTIVATE_DELAY,
            deactivate_enabled: false, // Default: disabled
        };

        app.instantiate_contract(
            code_id.0,
            Addr::unchecked(sender),
            &init_msg,
            &[],
            label,
            None,
        )
        .map(Self::from)
    }

    #[allow(clippy::too_many_arguments)]
    #[track_caller]
    pub fn instantiate_decative_and_add_new_key_zkey(
        app: &mut App,
        code_id: MaciCodeId,
        sender: Addr,
        round_info: RoundInfo,
        whitelist: Option<WhitelistBase>,
        voting_time: VotingTime,
        circuit_type: Uint256,
        certification_system: Uint256,
        label: &str,
    ) -> AnyResult<Self> {
        let parameters = MaciParameters {
            state_tree_depth: Uint256::from_u128(2u128),
            int_state_tree_depth: Uint256::from_u128(1u128),
            message_batch_size: Uint256::from_u128(5u128),
            vote_option_tree_depth: Uint256::from_u128(1u128),
        };
        let init_msg = InstantiateMsg {
            parameters,
            coordinator: PubKey {
                x: uint256_from_decimal_string(
                    "3557592161792765812904087712812111121909518311142005886657252371904276697771",
                ),
                y: uint256_from_decimal_string(
                    "4363822302427519764561660537570341277214758164895027920046745209970137856681",
                ),
            },
            vote_option_map: vec![
                "Option 1".to_string(),
                "Option 2".to_string(),
                "Option 3".to_string(),
                "Option 4".to_string(),
                "Option 5".to_string(),
            ],
            round_info,
            voting_time,
            circuit_type,
            certification_system,
            operator: operator(),
            admin: owner(),
            fee_recipient: fee_recipient(),
            poll_id: 1u64,
            // Unified MACI Configuration
            voice_credit_mode: VoiceCreditMode::Unified {
                amount: Uint256::from_u128(100u128),
            },
            registration_mode: RegistrationModeConfig::SignUpWithStaticWhitelist {
                whitelist: whitelist.unwrap_or_else(|| WhitelistBase { users: vec![] }),
            },
            message_fee: MESSAGE_FEE,
            deactivate_fee: DEACTIVATE_FEE,
            signup_fee: SIGNUP_FEE,
            base_delay: BASE_DELAY,
            message_delay: PER_MESSAGE_DELAY,
            signup_delay: PER_SIGNUP_DELAY,
            deactivate_delay: DEACTIVATE_DELAY,
            deactivate_enabled: true, // ENABLED for deactivate and add_new_key tests
        };

        app.instantiate_contract(
            code_id.0,
            Addr::unchecked(sender),
            &init_msg,
            &[],
            label,
            None,
        )
        .map(Self::from)
    }

    #[track_caller]
    pub fn update_registration_config(
        &self,
        app: &mut App,
        sender: Addr,
        config: RegistrationConfigUpdate,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::UpdateRegistrationConfig { config },
            &[],
        )
    }

    #[track_caller]
    pub fn sign_up(&self, app: &mut App, sender: Addr, pubkey: PubKey) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::SignUp {
                pubkey,
                certificate: None,
                amount: None,
            },
            &coins(SIGNUP_FEE.u128(), FEE_DENOM),
        )
    }

    #[track_caller]
    pub fn sign_up_oracle(
        &self,
        app: &mut App,
        sender: Addr,
        pubkey: PubKey,
        certificate: String,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::SignUp {
                pubkey,
                certificate: Some(certificate),
                amount: None,
            },
            &coins(SIGNUP_FEE.u128(), FEE_DENOM),
        )
    }

    #[track_caller]
    pub fn publish_message(
        &self,
        app: &mut App,
        sender: Addr,
        message: MessageData,
        enc_pub_key: PubKey,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::PublishMessage {
                messages: vec![message],
                enc_pub_keys: vec![enc_pub_key],
            },
            &coins(MESSAGE_FEE.u128(), FEE_DENOM),
        )
    }

    #[track_caller]
    pub fn publish_message_batch(
        &self,
        app: &mut App,
        sender: Addr,
        messages: Vec<MessageData>,
        enc_pub_keys: Vec<PubKey>,
    ) -> AnyResult<AppResponse> {
        let total_fee = MESSAGE_FEE.u128() * messages.len() as u128;
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::PublishMessage {
                messages,
                enc_pub_keys,
            },
            &coins(total_fee, FEE_DENOM),
        )
    }

    #[track_caller]
    pub fn set_round_info(&self, app: &mut App, sender: Addr) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::SetRoundInfo {
                round_info: RoundInfo {
                    title: String::from("TestRound2"),
                    description: String::from(""),
                    link: String::from("https://github.com"),
                },
            },
            &[],
        )
    }

    #[track_caller]
    pub fn set_empty_round_info(&self, app: &mut App, sender: Addr) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::SetRoundInfo {
                round_info: RoundInfo {
                    title: String::from(""),
                    description: String::from("Hello"),
                    link: String::from("https://github.com"),
                },
            },
            &[],
        )
    }

    #[track_caller]
    pub fn set_whitelist(&self, app: &mut App, sender: Addr) -> AnyResult<AppResponse> {
        // Use UpdateRegistrationConfig instead of deprecated SetWhitelists
        let config = RegistrationConfigUpdate {
            deactivate_enabled: None,
            voice_credit_mode: None,
            registration_mode: Some(RegistrationModeConfig::SignUpWithStaticWhitelist {
                whitelist: WhitelistBase {
                    users: vec![
                        WhitelistBaseConfig {
                            addr: user1(),
                            voice_credit_amount: None,
                        },
                        WhitelistBaseConfig {
                            addr: user2(),
                            voice_credit_amount: None,
                        },
                    ],
                },
            }),
        };
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::UpdateRegistrationConfig { config },
            &[],
        )
    }

    #[track_caller]
    pub fn set_vote_option_map(&self, app: &mut App, sender: Addr) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::SetVoteOptionsMap {
                vote_option_map: vec![
                    String::from("did_not_vote"),
                    String::from("yes"),
                    String::from("no"),
                    String::from("no_with_veto"),
                    String::from("abstain"),
                ],
            },
            &[],
        )
    }

    #[track_caller]
    pub fn publish_deactivate_message(
        &self,
        app: &mut App,
        sender: Addr,
        message: MessageData,
        enc_pub_key: PubKey,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::PublishDeactivateMessage {
                message,
                enc_pub_key,
            },
            &[],
        )
    }

    #[track_caller]
    pub fn process_deactivate_message(
        &self,
        app: &mut App,
        sender: Addr,
        size: Uint256,
        new_deactivate_commitment: Uint256,
        new_deactivate_root: Uint256,
        proof: Groth16ProofType,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::ProcessDeactivateMessage {
                size,
                new_deactivate_commitment,
                new_deactivate_root,
                groth16_proof: proof,
            },
            &[],
        )
    }

    #[track_caller]
    pub fn add_key(
        &self,
        app: &mut App,
        sender: Addr,
        pubkey: PubKey,
        nullifier: Uint256,
        d: [Uint256; 4],
        proof: Groth16ProofType,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::AddNewKey {
                pubkey,
                nullifier,
                d,
                groth16_proof: proof,
            },
            &coins(SIGNUP_FEE.u128(), FEE_DENOM),
        )
    }

    #[track_caller]
    pub fn pre_add_key(
        &self,
        app: &mut App,
        sender: Addr,
        pubkey: PubKey,
        nullifier: Uint256,
        d: [Uint256; 4],
        proof: Groth16ProofType,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::PreAddNewKey {
                pubkey,
                nullifier,
                d,
                groth16_proof: proof,
            },
            &coins(SIGNUP_FEE.u128(), FEE_DENOM),
        )
    }

    #[track_caller]
    pub fn start_process(&self, app: &mut App, sender: Addr) -> AnyResult<AppResponse> {
        app.execute_contract(sender, self.addr(), &ExecuteMsg::StartProcessPeriod {}, &[])
    }

    #[track_caller]
    pub fn process_message(
        &self,
        app: &mut App,
        sender: Addr,
        new_state_commitment: Uint256,
        proof: Groth16ProofType,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::ProcessMessage {
                new_state_commitment,
                groth16_proof: proof,
            },
            &[],
        )
    }

    #[track_caller]
    pub fn stop_processing(&self, app: &mut App, sender: Addr) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::StopProcessingPeriod {},
            &[],
        )
    }

    #[track_caller]
    pub fn process_tally(
        &self,
        app: &mut App,
        sender: Addr,
        new_tally_commitment: Uint256,
        proof: Groth16ProofType,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::ProcessTally {
                new_tally_commitment,
                groth16_proof: proof,
            },
            &[],
        )
    }

    #[track_caller]
    pub fn stop_tallying(
        &self,
        app: &mut App,
        sender: Addr,
        results: Vec<Uint256>,
        salt: Uint256,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::StopTallyingPeriod { results, salt },
            &[],
        )
    }

    #[track_caller]
    pub fn claim(&self, app: &mut App, sender: Addr) -> AnyResult<AppResponse> {
        app.execute_contract(sender, self.addr(), &ExecuteMsg::Claim {}, &[])
    }

    pub fn msg_length(&self, app: &App) -> StdResult<Uint256> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetMsgChainLength {})
    }

    pub fn dmsg_length(&self, app: &App) -> StdResult<Uint256> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetDMsgChainLength {})
    }

    pub fn num_sign_up(&self, app: &App) -> StdResult<Uint256> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetNumSignUp {})
    }

    pub fn signuped(&self, app: &App, pubkey: PubKey) -> StdResult<Option<Uint256>> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::Signuped { pubkey })
    }

    pub fn vote_option_map(&self, app: &App) -> StdResult<Vec<String>> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::VoteOptionMap {})
    }

    pub fn max_vote_options(&self, app: &App) -> StdResult<Uint256> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::MaxVoteOptions {})
    }

    pub fn get_all_result(&self, app: &App) -> StdResult<Uint256> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetAllResult {})
    }

    pub fn get_voting_time(&self, app: &App) -> StdResult<VotingTime> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetVotingTime {})
    }

    pub fn get_period(&self, app: &App) -> StdResult<Period> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetPeriod {})
    }

    pub fn get_round_info(&self, app: &App) -> StdResult<RoundInfo> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetRoundInfo {})
    }

    pub fn query_delay_records(&self, app: &App) -> StdResult<DelayRecords> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetDelayRecords {})
    }

    pub fn query_admin(&self, app: &App) -> StdResult<Addr> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::Admin {})
    }

    pub fn query_operator(&self, app: &App) -> StdResult<Addr> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::Operator {})
    }

    pub fn query_round_info(&self, app: &App) -> StdResult<RoundInfo> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetRoundInfo {})
    }

    #[track_caller]
    pub fn amaci_sign_up(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
        pubkey: PubKey,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::SignUp {
                pubkey,
                certificate: None,
                amount: None,
            },
            &coins(SIGNUP_FEE.u128(), FEE_DENOM),
        )
    }

    #[track_caller]
    pub fn amaci_sign_up_oracle(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
        pubkey: PubKey,
        certificate: String,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::SignUp {
                pubkey,
                certificate: Some(certificate),
                amount: None,
            },
            &coins(SIGNUP_FEE.u128(), FEE_DENOM),
        )
    }

    #[track_caller]
    pub fn amaci_publish_message(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
        message: MessageData,
        enc_pub_key: PubKey,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::PublishMessage {
                messages: vec![message],
                enc_pub_keys: vec![enc_pub_key],
            },
            &coins(MESSAGE_FEE.u128(), FEE_DENOM),
        )
    }

    #[track_caller]
    pub fn amaci_publish_message_batch(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
        messages: Vec<MessageData>,
        enc_pub_keys: Vec<PubKey>,
    ) -> AnyResult<AppResponse> {
        let total_fee = MESSAGE_FEE.u128() * messages.len() as u128;
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::PublishMessage {
                messages,
                enc_pub_keys,
            },
            &coins(total_fee, FEE_DENOM),
        )
    }

    #[track_caller]
    pub fn amaci_publish_message_no_fee(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
        message: MessageData,
        enc_pub_key: PubKey,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::PublishMessage {
                messages: vec![message],
                enc_pub_keys: vec![enc_pub_key],
            },
            &[],
        )
    }

    #[track_caller]
    pub fn amaci_publish_message_with_funds(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
        message: MessageData,
        enc_pub_key: PubKey,
        funds: &[cosmwasm_std::Coin],
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::PublishMessage {
                messages: vec![message],
                enc_pub_keys: vec![enc_pub_key],
            },
            funds,
        )
    }

    #[track_caller]
    pub fn amaci_publish_message_batch_no_fee(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
        messages: Vec<MessageData>,
        enc_pub_keys: Vec<PubKey>,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::PublishMessage {
                messages,
                enc_pub_keys,
            },
            &[],
        )
    }

    #[track_caller]
    pub fn amaci_publish_message_batch_with_funds(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
        messages: Vec<MessageData>,
        enc_pub_keys: Vec<PubKey>,
        funds: &[cosmwasm_std::Coin],
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::PublishMessage {
                messages,
                enc_pub_keys,
            },
            funds,
        )
    }

    #[track_caller]
    pub fn amaci_set_round_info(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::SetRoundInfo {
                round_info: RoundInfo {
                    title: String::from("TestRound2"),
                    description: String::from(""),
                    link: String::from("https://github.com"),
                },
            },
            &[],
        )
    }

    #[track_caller]
    pub fn amaci_set_empty_round_info(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::SetRoundInfo {
                round_info: RoundInfo {
                    title: String::from(""),
                    description: String::from("Hello"),
                    link: String::from("https://github.com"),
                },
            },
            &[],
        )
    }

    #[track_caller]
    pub fn amaci_set_whitelist(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
    ) -> AnyResult<AppResponse> {
        // Use UpdateRegistrationConfig instead of deprecated SetWhitelists
        let config = RegistrationConfigUpdate {
            deactivate_enabled: None,
            voice_credit_mode: None,
            registration_mode: Some(RegistrationModeConfig::SignUpWithStaticWhitelist {
                whitelist: WhitelistBase {
                    users: vec![
                        WhitelistBaseConfig {
                            addr: user1(),
                            voice_credit_amount: None,
                        },
                        WhitelistBaseConfig {
                            addr: user2(),
                            voice_credit_amount: None,
                        },
                    ],
                },
            }),
        };
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::UpdateRegistrationConfig { config },
            &[],
        )
    }

    #[track_caller]
    pub fn amaci_set_vote_option_map(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::SetVoteOptionsMap {
                vote_option_map: vec![
                    String::from("did_not_vote"),
                    String::from("yes"),
                    String::from("no"),
                    String::from("no_with_veto"),
                    String::from("abstain"),
                ],
            },
            &[],
        )
    }

    #[track_caller]
    pub fn amaci_set_custom_vote_option_map(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
        vote_option_map: Vec<String>,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::SetVoteOptionsMap { vote_option_map },
            &[],
        )
    }

    #[track_caller]
    pub fn amaci_publish_deactivate_message(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
        message: MessageData,
        enc_pub_key: PubKey,
    ) -> AnyResult<AppResponse> {
        use cosmwasm_std::coin;
        // Always send 10 DORA fee for deactivate message
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::PublishDeactivateMessage {
                message,
                enc_pub_key,
            },
            &[coin(10_000_000_000_000_000_000, "peaka")], // 10 DORA fee
        )
    }

    #[track_caller]
    pub fn amaci_process_deactivate_message(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
        size: Uint256,
        new_deactivate_commitment: Uint256,
        new_deactivate_root: Uint256,
        proof: Groth16ProofType,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::ProcessDeactivateMessage {
                size,
                new_deactivate_commitment,
                new_deactivate_root,
                groth16_proof: proof,
            },
            &[],
        )
    }

    #[track_caller]
    pub fn amaci_add_key(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
        pubkey: PubKey,
        nullifier: Uint256,
        d: [Uint256; 4],
        proof: Groth16ProofType,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::AddNewKey {
                pubkey,
                nullifier,
                d,
                groth16_proof: proof,
            },
            &coins(SIGNUP_FEE.u128(), FEE_DENOM),
        )
    }

    #[track_caller]
    pub fn amaci_pre_add_key(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
        pubkey: PubKey,
        nullifier: Uint256,
        d: [Uint256; 4],
        proof: Groth16ProofType,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::PreAddNewKey {
                pubkey,
                nullifier,
                d,
                groth16_proof: proof,
            },
            &coins(SIGNUP_FEE.u128(), FEE_DENOM),
        )
    }

    #[track_caller]
    pub fn amaci_start_process(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(sender, self.addr(), &ExecuteMsg::StartProcessPeriod {}, &[])
    }

    #[track_caller]
    pub fn amaci_process_message(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
        new_state_commitment: Uint256,
        proof: Groth16ProofType,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::ProcessMessage {
                new_state_commitment,
                groth16_proof: proof,
            },
            &[],
        )
    }

    #[track_caller]
    pub fn amaci_stop_processing(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::StopProcessingPeriod {},
            &[],
        )
    }

    #[track_caller]
    pub fn amaci_process_tally(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
        new_tally_commitment: Uint256,
        proof: Groth16ProofType,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::ProcessTally {
                new_tally_commitment,
                groth16_proof: proof,
            },
            &[],
        )
    }

    #[track_caller]
    pub fn amaci_stop_tallying(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
        results: Vec<Uint256>,
        salt: Uint256,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::StopTallyingPeriod { results, salt },
            &[],
        )
    }

    #[track_caller]
    pub fn amaci_claim(&self, app: &mut DefaultApp, sender: Addr) -> AnyResult<AppResponse> {
        app.execute_contract(sender, self.addr(), &ExecuteMsg::Claim {}, &[])
    }

    pub fn amaci_msg_length(&self, app: &DefaultApp) -> StdResult<Uint256> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetMsgChainLength {})
    }

    pub fn amaci_dmsg_length(&self, app: &DefaultApp) -> StdResult<Uint256> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetDMsgChainLength {})
    }

    pub fn amaci_num_sign_up(&self, app: &DefaultApp) -> StdResult<Uint256> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetNumSignUp {})
    }

    pub fn amaci_processed_msg_count(&self, app: &DefaultApp) -> StdResult<Uint256> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetProcessedMsgCount {})
    }

    pub fn amaci_signuped(&self, app: &DefaultApp, pubkey: PubKey) -> StdResult<Option<Uint256>> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::Signuped { pubkey })
    }

    pub fn amaci_vote_option_map(&self, app: &DefaultApp) -> StdResult<Vec<String>> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::VoteOptionMap {})
    }

    pub fn amaci_max_vote_options(&self, app: &DefaultApp) -> StdResult<Uint256> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::MaxVoteOptions {})
    }

    pub fn amaci_get_all_result(&self, app: &DefaultApp) -> StdResult<Uint256> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetAllResult {})
    }

    pub fn amaci_get_voting_time(&self, app: &DefaultApp) -> StdResult<VotingTime> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetVotingTime {})
    }

    pub fn amaci_get_period(&self, app: &DefaultApp) -> StdResult<Period> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetPeriod {})
    }

    pub fn amaci_get_round_info(&self, app: &DefaultApp) -> StdResult<RoundInfo> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetRoundInfo {})
    }

    pub fn amaci_query_delay_records(&self, app: &DefaultApp) -> StdResult<DelayRecords> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetDelayRecords {})
    }

    pub fn amaci_query_admin(&self, app: &DefaultApp) -> StdResult<Addr> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::Admin {})
    }

    pub fn amaci_query_operator(&self, app: &DefaultApp) -> StdResult<Addr> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::Operator {})
    }

    pub fn amaci_query_round_info(&self, app: &DefaultApp) -> StdResult<RoundInfo> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetRoundInfo {})
    }

    pub fn amaci_query_tally_delay(&self, app: &DefaultApp) -> StdResult<TallyDelayInfo> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetTallyDelay {})
    }

    pub fn amaci_get_registration_config(
        &self,
        app: &DefaultApp,
    ) -> StdResult<RegistrationConfigInfo> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetRegistrationConfig {})
    }

    #[track_caller]
    pub fn amaci_update_registration_config(
        &self,
        app: &mut DefaultApp,
        sender: Addr,
        config: RegistrationConfigUpdate,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::UpdateRegistrationConfig { config },
            &[],
        )
    }

    #[allow(clippy::too_many_arguments)]
    #[track_caller]
    pub fn instantiate_with_oracle(
        app: &mut App,
        code_id: MaciCodeId,
        sender: Addr,
        round_info: RoundInfo,
        whitelist: Option<WhitelistBase>,
        voting_time: VotingTime,
        circuit_type: Uint256,
        certification_system: Uint256,
        oracle_whitelist_pubkey: String,
        label: &str,
    ) -> AnyResult<Self> {
        let parameters = MaciParameters {
            state_tree_depth: Uint256::from_u128(2u128),
            int_state_tree_depth: Uint256::from_u128(1u128),
            message_batch_size: Uint256::from_u128(5u128),
            vote_option_tree_depth: Uint256::from_u128(1u128),
        };
        let init_msg = InstantiateMsg {
            parameters,
            coordinator: PubKey {
                x: uint256_from_decimal_string(
                    "3557592161792765812904087712812111121909518311142005886657252371904276697771",
                ),
                y: uint256_from_decimal_string(
                    "4363822302427519764561660537570341277214758164895027920046745209970137856681",
                ),
            },
            vote_option_map: vec![
                "Option 1".to_string(),
                "Option 2".to_string(),
                "Option 3".to_string(),
                "Option 4".to_string(),
                "Option 5".to_string(),
            ],
            round_info,
            voting_time,
            circuit_type,
            certification_system,
            operator: operator(),
            admin: owner(),
            fee_recipient: fee_recipient(),
            poll_id: 1u64,
            // Unified MACI Configuration
            voice_credit_mode: VoiceCreditMode::Unified {
                amount: Uint256::from_u128(100u128),
            },
            registration_mode: RegistrationModeConfig::SignUpWithOracle {
                oracle_pubkey: oracle_whitelist_pubkey,
            },
            message_fee: MESSAGE_FEE,
            deactivate_fee: DEACTIVATE_FEE,
            signup_fee: SIGNUP_FEE,
            base_delay: BASE_DELAY,
            message_delay: PER_MESSAGE_DELAY,
            signup_delay: PER_SIGNUP_DELAY,
            deactivate_delay: DEACTIVATE_DELAY,
            deactivate_enabled: false, // Default: disabled
        };

        app.instantiate_contract(
            code_id.0,
            Addr::unchecked(sender),
            &init_msg,
            &[],
            label,
            None,
        )
        .map(Self::from)
    }

    // Helper function to instantiate with default parameters (deactivate disabled)
    #[track_caller]
    pub fn instantiate_default(app: &mut App, whitelist: bool) -> AnyResult<Self> {
        let code_id = MaciCodeId::store_code(app);
        let round_info = RoundInfo {
            title: String::from("TestRound"),
            description: String::from("Test Description"),
            link: String::from("https://github.com"),
        };

        let whitelist_cfg = Some(WhitelistBase {
            users: if whitelist {
                vec![
                    WhitelistBaseConfig {
                        addr: user1(),
                        voice_credit_amount: None, // Will use Unified mode default
                    },
                    WhitelistBaseConfig {
                        addr: user2(),
                        voice_credit_amount: None, // Will use Unified mode default
                    },
                ]
            } else {
                vec![]
            },
        });

        let voting_time = VotingTime {
            start_time: Timestamp::from_nanos(1571797424879000000),
            end_time: Timestamp::from_nanos(1571797424879000000).plus_minutes(11), // 11 minutes later
        };

        Self::instantiate(
            app,
            code_id,
            owner(),
            round_info,
            whitelist_cfg,
            voting_time,
            Uint256::from_u128(0), // 1p1v
            Uint256::from_u128(0), // groth16
            "MACI Contract",
        )
    }

    // Helper function to instantiate with deactivate enabled
    #[track_caller]
    pub fn instantiate_with_deactivate_enabled(app: &mut App, whitelist: bool) -> AnyResult<Self> {
        let code_id = MaciCodeId::store_code(app);
        let parameters = MaciParameters {
            state_tree_depth: Uint256::from_u128(2u128),
            int_state_tree_depth: Uint256::from_u128(1u128),
            message_batch_size: Uint256::from_u128(5u128),
            vote_option_tree_depth: Uint256::from_u128(1u128),
        };

        let round_info = RoundInfo {
            title: String::from("TestRound"),
            description: String::from("Test Description"),
            link: String::from("https://github.com"),
        };

        let whitelist_cfg = Some(WhitelistBase {
            users: if whitelist {
                vec![
                    WhitelistBaseConfig {
                        addr: user1(),
                        voice_credit_amount: None, // Will use Unified mode default
                    },
                    WhitelistBaseConfig {
                        addr: user2(),
                        voice_credit_amount: None, // Will use Unified mode default
                    },
                ]
            } else {
                vec![]
            },
        });

        let voting_time = VotingTime {
            start_time: Timestamp::from_nanos(1571797424879000000),
            end_time: Timestamp::from_nanos(1571797424879000000).plus_minutes(11), // 11 minutes later
        };

        let init_msg = InstantiateMsg {
            parameters,
            coordinator: PubKey {
                x: uint256_from_decimal_string(
                    "3557592161792765812904087712812111121909518311142005886657252371904276697771",
                ),
                y: uint256_from_decimal_string(
                    "4363822302427519764561660537570341277214758164895027920046745209970137856681",
                ),
            },
            vote_option_map: vec![
                "Option 1".to_string(),
                "Option 2".to_string(),
                "Option 3".to_string(),
                "Option 4".to_string(),
                "Option 5".to_string(),
            ],
            round_info,
            voting_time,
            circuit_type: Uint256::from_u128(0),         // 1p1v
            certification_system: Uint256::from_u128(0), // groth16
            operator: operator(),
            admin: owner(),
            fee_recipient: fee_recipient(),
            poll_id: 1u64,
            // Unified MACI Configuration
            voice_credit_mode: VoiceCreditMode::Unified {
                amount: Uint256::from_u128(100u128),
            },
            registration_mode: RegistrationModeConfig::SignUpWithStaticWhitelist {
                whitelist: whitelist_cfg.unwrap_or_else(|| WhitelistBase { users: vec![] }),
            },
            message_fee: MESSAGE_FEE,
            deactivate_fee: DEACTIVATE_FEE,
            signup_fee: SIGNUP_FEE,
            base_delay: BASE_DELAY,
            message_delay: PER_MESSAGE_DELAY,
            signup_delay: PER_SIGNUP_DELAY,
            deactivate_delay: DEACTIVATE_DELAY,
            deactivate_enabled: true, // ENABLED!
        };

        app.instantiate_contract(
            code_id.0,
            owner(),
            &init_msg,
            &[],
            "MACI Contract with Deactivate Enabled",
            None,
        )
        .map(Self::from)
    }
}

impl From<Addr> for MaciContract {
    fn from(value: Addr) -> Self {
        Self(value)
    }
}

pub fn user1() -> Addr {
    dora_mock_api().addr_make("user1")
}

pub fn user2() -> Addr {
    dora_mock_api().addr_make("user2")
}

pub fn user3() -> Addr {
    dora_mock_api().addr_make("user3")
}

pub fn owner() -> Addr {
    Addr::unchecked("owner")
}

pub fn fee_recipient() -> Addr {
    Addr::unchecked("fee_recipient")
}

pub fn operator() -> Addr {
    Addr::unchecked("operator")
}

// Test data for oracle mode
pub fn test_pubkey1() -> PubKey {
    PubKey {
        x: uint256_from_decimal_string(
            "3557592161792765812904087712812111121909518311142005886657252371904276697771",
        ),
        y: uint256_from_decimal_string(
            "4363822302427519764561660537570341277214758164895027920046745209970137856681",
        ),
    }
}

pub fn test_pubkey2() -> PubKey {
    PubKey {
        x: uint256_from_decimal_string(
            "4934845797881523927654842245387640257368309434525961062601274110069416343731",
        ),
        y: uint256_from_decimal_string(
            "7218132018004361008636029786293016526331813670637191622129869640055131468762",
        ),
    }
}

// BabyJubJub BASE8 generator point — a canonical valid curve point for test data
pub fn test_pubkey3() -> PubKey {
    PubKey {
        x: uint256_from_decimal_string(
            "5299619240641551281634865583518297030282874472190772894086521144482721001553",
        ),
        y: uint256_from_decimal_string(
            "16950150798460657717958625567821834550301663161624707787222815936182638968203",
        ),
    }
}

// Generate test oracle pubkey
pub fn test_oracle_pubkey() -> String {
    "A9ekxvWjYNpnHTasS008PG+EuF2ssIkUPaDdnn8ZdzTb".to_string()
}
