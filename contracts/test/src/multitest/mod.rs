#[cfg(test)]
mod tests;

use anyhow::Result as AnyResult;

use crate::state::{MaciParameters, MessageData, PubKey};
use crate::{
    contract::{execute, instantiate, query},
    msg::*,
};
use maci_utils::uint256_from_hex_string;

use cosmwasm_std::testing::{MockApi, MockStorage};
use cosmwasm_std::{Addr, Empty, StdResult, Uint256};
use cw_multi_test::{
    no_init, AppBuilder, AppResponse, BankKeeper, ContractWrapper, DistributionKeeper, Executor,
    FailingModule, GovFailingModule, IbcFailingModule, StakeKeeper, StargateAccepting, WasmKeeper,
};
use num_bigint::BigUint;

pub fn uint256_from_decimal_string(decimal_string: &str) -> Uint256 {
    assert!(
        decimal_string.len() <= 77,
        "the decimal length can't above 77"
    );

    let decimal_number = BigUint::parse_bytes(decimal_string.as_bytes(), 10)
        .expect("Failed to parse decimal string");

    let byte_array = decimal_number.to_bytes_be();

    let hex_string = hex::encode(byte_array);
    uint256_from_hex_string(&hex_string)
}

pub const MOCK_CONTRACT_ADDR: &str = "cosmos2contract";

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

pub fn create_app() -> App {
    AppBuilder::new()
        .with_stargate(StargateAccepting)
        .build(no_init)
}

#[derive(Clone, Debug, Copy)]
pub struct MaciCodeId(u64);

impl MaciCodeId {
    pub fn id(&self) -> u64 {
        self.0
    }

    pub fn store_code(app: &mut App) -> Self {
        let contract = ContractWrapper::new(execute, instantiate, query);
        let code_id = app.store_code(Box::new(contract));
        Self(code_id)
    }

    pub fn instantiate_default(
        self,
        app: &mut App,
        sender: Addr,
        label: &str,
    ) -> AnyResult<TestContract> {
        TestContract::instantiate(app, self, sender, label)
    }
}

impl From<MaciCodeId> for u64 {
    fn from(code_id: MaciCodeId) -> Self {
        code_id.0
    }
}

#[derive(Debug, Clone)]
pub struct TestContract(Addr);

// implement the contract real function, e.g. instantiate, functions in exec, query modules
impl TestContract {
    pub fn addr(&self) -> Addr {
        self.0.clone()
    }

    pub fn new(addr: Addr) -> Self {
        TestContract(addr)
    }

    /// Print detailed response information for debugging and analysis
    pub fn print_response_details(response: &AppResponse, operation_name: &str) {
        println!("\n{}", "=".repeat(60));
        println!("Response Details: {}", operation_name);
        println!("{}", "=".repeat(60));
        println!("Total events: {}", response.events.len());

        for (i, event) in response.events.iter().enumerate() {
            println!("\n[Event {}] Type: '{}'", i, event.ty);
            println!("{}", "-".repeat(60));

            if event.attributes.is_empty() {
                println!("  (no attributes)");
                continue;
            }

            // Find max key length for formatting
            let max_key_len = event
                .attributes
                .iter()
                .map(|attr| attr.key.len())
                .max()
                .unwrap_or(0);

            for attr in &event.attributes {
                println!(
                    "  {:width$} : {}",
                    attr.key,
                    attr.value,
                    width = max_key_len
                );
            }
        }

        if let Some(data) = &response.data {
            println!("\n{}", "-".repeat(60));
            println!("Response Data: {} bytes", data.len());
        }

        println!("{}\n", "=".repeat(60));
    }

    /// Compare responses from two operations
    pub fn compare_responses(
        response_a: &AppResponse,
        name_a: &str,
        response_b: &AppResponse,
        name_b: &str,
    ) {
        println!("\n{}", "=".repeat(60));
        println!("Response Comparison");
        println!("{}", "=".repeat(60));

        println!("\n{:<30} | {:<25}", name_a, name_b);
        println!("{}", "-".repeat(60));
        println!(
            "{:<30} | {:<25}",
            format!("Events: {}", response_a.events.len()),
            format!("Events: {}", response_b.events.len())
        );

        let attrs_a: usize = response_a.events.iter().map(|e| e.attributes.len()).sum();
        let attrs_b: usize = response_b.events.iter().map(|e| e.attributes.len()).sum();

        println!(
            "{:<30} | {:<25}",
            format!("Attributes: {}", attrs_a),
            format!("Attributes: {}", attrs_b)
        );

        let data_len_a = response_a.data.as_ref().map(|d| d.len()).unwrap_or(0);
        let data_len_b = response_b.data.as_ref().map(|d| d.len()).unwrap_or(0);

        println!(
            "{:<30} | {:<25}",
            format!("Data bytes: {}", data_len_a),
            format!("Data bytes: {}", data_len_b)
        );

        println!("{}\n", "=".repeat(60));
    }

    #[track_caller]
    pub fn instantiate(
        app: &mut App,
        code_id: MaciCodeId,
        sender: Addr,
        label: &str,
    ) -> AnyResult<Self> {
        let parameters = MaciParameters {
            state_tree_depth: Uint256::from_u128(2u128),
            int_state_tree_depth: Uint256::from_u128(1u128),
            message_batch_size: Uint256::from_u128(5u128),
            vote_option_tree_depth: Uint256::from_u128(1u128),
        };
        let init_msg = InstantiateMsg { parameters };

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
    pub fn instantiate_with_params(
        app: &mut App,
        code_id: MaciCodeId,
        sender: Addr,
        label: &str,
        parameters: MaciParameters,
    ) -> AnyResult<Self> {
        let init_msg = InstantiateMsg { parameters };

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

    // Execute methods
    #[track_caller]
    pub fn sign_up(&self, app: &mut App, sender: Addr, pubkey: PubKey) -> AnyResult<AppResponse> {
        app.execute_contract(sender, self.addr(), &ExecuteMsg::SignUp { pubkey }, &[])
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
                message,
                enc_pub_key,
            },
            &[],
        )
    }

    #[track_caller]
    pub fn test_signup_no_hash(
        &self,
        app: &mut App,
        sender: Addr,
        pubkey: PubKey,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::TestSignupNoHash { pubkey },
            &[],
        )
    }

    #[track_caller]
    pub fn test_signup_with_hash(
        &self,
        app: &mut App,
        sender: Addr,
        pubkey: PubKey,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::TestSignupWithHash { pubkey },
            &[],
        )
    }

    #[track_caller]
    pub fn test_publish_message(
        &self,
        app: &mut App,
        sender: Addr,
        message: MessageData,
        enc_pub_key: PubKey,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::TestPublishMessage {
                message,
                enc_pub_key,
            },
            &[],
        )
    }

    #[track_caller]
    pub fn test_poseidon_hash_once(
        &self,
        app: &mut App,
        sender: Addr,
        data: [Uint256; 5],
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::TestPoseidonHashOnce { data },
            &[],
        )
    }

    #[track_caller]
    pub fn test_poseidon_hash_multiple(
        &self,
        app: &mut App,
        sender: Addr,
        data: [Uint256; 5],
        instance_count: u32,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::TestPoseidonHashMultiple {
                data,
                instance_count,
            },
            &[],
        )
    }

    #[track_caller]
    pub fn test_poseidon_hash_batch(
        &self,
        app: &mut App,
        sender: Addr,
        data: Vec<[Uint256; 5]>,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::TestPoseidonHashBatch { data },
            &[],
        )
    }

    #[track_caller]
    pub fn test_poseidon_hash_mode(
        &self,
        app: &mut App,
        sender: Addr,
        implementation: HashImplementation,
        mode: HashMode,
        data: [Uint256; 5],
        repeat_count: u32,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::TestPoseidonHashMode {
                implementation,
                mode,
                data,
                repeat_count,
            },
            &[],
        )
    }

    // Query methods
    pub fn get_num_sign_up(&self, app: &App) -> StdResult<Uint256> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetNumSignUp {})
    }

    pub fn get_node(&self, app: &App, index: Uint256) -> StdResult<Uint256> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetNode { index })
    }

    pub fn get_state_tree_root(&self, app: &App) -> StdResult<Uint256> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetStateTreeRoot {})
    }

    pub fn signuped(&self, app: &App, pubkey: PubKey) -> StdResult<Option<Uint256>> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::Signuped { pubkey })
    }

    pub fn get_voice_credit_amount(&self, app: &App) -> StdResult<Uint256> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetVoiceCreditAmount {})
    }

    pub fn get_msg_chain_length(&self, app: &App) -> StdResult<Uint256> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetMsgChainLength {})
    }

    // No-hash query methods
    pub fn get_num_sign_up_no_hash(&self, app: &App) -> StdResult<Uint256> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetNumSignUpNoHash {})
    }

    pub fn get_node_no_hash(&self, app: &App, index: Uint256) -> StdResult<Uint256> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetNodeNoHash { index })
    }

    pub fn get_state_tree_root_no_hash(&self, app: &App) -> StdResult<Uint256> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::GetStateTreeRootNoHash {})
    }

    pub fn signuped_no_hash(&self, app: &App, pubkey: PubKey) -> StdResult<Option<Uint256>> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::SignupedNoHash { pubkey })
    }
}

impl From<Addr> for TestContract {
    fn from(value: Addr) -> Self {
        Self(value)
    }
}

// Test helper functions
pub fn owner() -> Addr {
    Addr::unchecked("owner")
}

pub fn user1() -> Addr {
    Addr::unchecked("user1")
}

pub fn user2() -> Addr {
    Addr::unchecked("user2")
}

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
            "1234567890123456789012345678901234567890123456789012345678901234567890123456",
        ),
        y: uint256_from_decimal_string(
            "9876543210987654321098765432109876543210987654321098765432109876543210987654",
        ),
    }
}
