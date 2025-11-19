#[cfg(test)]
mod tests;

use anyhow::Result as AnyResult;
use cosmwasm_std::testing::{MockApi, MockStorage};
use cosmwasm_std::{Addr, Coin, Empty, StdResult, Timestamp, Uint128, Uint256};
use cw_amaci::state::RoundInfo;
use cw_multi_test::{
    no_init, AppBuilder, AppResponse, BankKeeper, ContractWrapper, DistributionKeeper, Executor,
    FailingModule, GovFailingModule, IbcFailingModule, StakeKeeper, StargateAccepting, WasmKeeper,
};

use crate::{
    contract::{execute, instantiate, migrate, query, reply},
    msg::*,
    state::{Config, OperatorInfo},
};

pub const DORA_DEMON: &str = "peaka";

// Note: Mock feegrant functionality removed as it's handled by Oracle MACI contract

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
pub struct SaasCodeId(u64);

impl SaasCodeId {
    pub fn store_code(app: &mut App) -> Self {
        let contract = ContractWrapper::new(execute, instantiate, query)
            .with_migrate(migrate)
            .with_reply(reply);
        let code_id = app.store_code(Box::new(contract));
        Self(code_id)
    }

    pub fn instantiate(
        self,
        app: &mut App,
        sender: Addr,
        admin: Addr,
        treasury_manager: Addr,
        registry_contract: Addr,
        denom: String,
        oracle_maci_code_id: u64,
        label: &str,
    ) -> AnyResult<SaasContract> {
        SaasContract::instantiate(
            app,
            self,
            sender,
            admin,
            treasury_manager,
            registry_contract,
            denom,
            oracle_maci_code_id,
            label,
        )
    }
}

impl From<SaasCodeId> for u64 {
    fn from(code_id: SaasCodeId) -> Self {
        code_id.0
    }
}

#[derive(Clone, Debug)]
pub struct SaasContract(Addr);

impl SaasContract {
    fn addr(&self) -> Addr {
        self.0.clone()
    }

    #[track_caller]
    pub fn instantiate(
        app: &mut App,
        code_id: SaasCodeId,
        sender: Addr,
        admin: Addr,
        treasury_manager: Addr,
        registry_contract: Addr,
        denom: String,
        maci_code_id: u64,
        label: &str,
    ) -> AnyResult<Self> {
        let init_msg = InstantiateMsg {
            admin,
            treasury_manager,
            registry_contract,
            denom,
            maci_code_id,
        };

        app.instantiate_contract(code_id.0, sender, &init_msg, &[], label, None)
            .map(Self)
    }

    #[track_caller]
    pub fn update_config(
        &self,
        app: &mut App,
        sender: Addr,
        admin: Option<Addr>,
        denom: Option<String>,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::UpdateConfig { admin, denom },
            &[],
        )
    }

    #[track_caller]
    pub fn add_operator(
        &self,
        app: &mut App,
        sender: Addr,
        operator: Addr,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::AddOperator { operator },
            &[],
        )
    }

    #[track_caller]
    pub fn remove_operator(
        &self,
        app: &mut App,
        sender: Addr,
        operator: Addr,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::RemoveOperator { operator },
            &[],
        )
    }

    #[track_caller]
    pub fn deposit(&self, app: &mut App, sender: Addr, funds: &[Coin]) -> AnyResult<AppResponse> {
        app.execute_contract(sender, self.addr(), &ExecuteMsg::Deposit {}, funds)
    }

    #[track_caller]
    pub fn withdraw(
        &self,
        app: &mut App,
        sender: Addr,
        amount: Uint128,
        recipient: Option<Addr>,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::Withdraw { amount, recipient },
            &[],
        )
    }

    #[track_caller]
    pub fn update_maci_code_id(
        &self,
        app: &mut App,
        sender: Addr,
        code_id: u64,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::UpdateMaciCodeId { code_id },
            &[],
        )
    }

    #[track_caller]
    pub fn create_api_maci_round(
        &self,
        app: &mut App,
        sender: Addr,
        coordinator: PubKey,
        max_voters: u128,
        vote_option_map: Vec<String>,
        round_info: RoundInfo,
        start_time: Timestamp,
        end_time: Timestamp,
        circuit_type: cosmwasm_std::Uint256,
        certification_system: cosmwasm_std::Uint256,
        whitelist_backend_pubkey: String,
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::CreateMaciRound {
                coordinator,
                max_voters,
                vote_option_map,
                round_info,
                start_time,
                end_time,
                circuit_type,
                certification_system,
                whitelist_backend_pubkey,
            },
            &[],
        )
    }

    #[track_caller]
    pub fn create_amaci_round(
        &self,
        app: &mut App,
        sender: Addr,
        operator: Addr,
        max_voter: Uint256,
        voice_credit_amount: Uint256,
        vote_option_map: Vec<String>,
        round_info: RoundInfo,
        voting_time: cw_amaci::state::VotingTime,
        whitelist: Option<cw_amaci::msg::WhitelistBase>,
        pre_deactivate_root: Uint256,
        circuit_type: Uint256,
        certification_system: Uint256,
        oracle_whitelist_pubkey: Option<String>,
        funds: &[Coin],
    ) -> AnyResult<AppResponse> {
        app.execute_contract(
            sender,
            self.addr(),
            &ExecuteMsg::CreateAmaciRound {
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
                pre_deactivate_coordinator: None,
            },
            funds,
        )
    }

    // Query methods
    pub fn query_config(&self, app: &App) -> StdResult<Config> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::Config {})
    }

    pub fn query_operators(&self, app: &App) -> StdResult<Vec<OperatorInfo>> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::Operators {})
    }

    pub fn query_is_operator(&self, app: &App, address: Addr) -> StdResult<bool> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::IsOperator { address })
    }

    pub fn query_balance(&self, app: &App) -> StdResult<Uint128> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::Balance {})
    }

    pub fn query_maci_code_id(&self, app: &App) -> StdResult<u64> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::MaciCodeId {})
    }

    pub fn query_treasury_manager(&self, app: &App) -> StdResult<Addr> {
        app.wrap()
            .query_wasm_smart(self.addr(), &QueryMsg::TreasuryManager {})
    }

    pub fn balance_of(&self, app: &App, address: String, denom: String) -> StdResult<Coin> {
        app.wrap().query_balance(address, denom)
    }

    // Note: Feegrant query functions removed as they're handled by Oracle MACI contract
}

impl From<Addr> for SaasContract {
    fn from(value: Addr) -> Self {
        Self(value)
    }
}

// Helper functions for creating test addresses
pub fn admin() -> Addr {
    Addr::unchecked("admin")
}

pub fn creator() -> Addr {
    Addr::unchecked("creator")
}

pub fn operator1() -> Addr {
    Addr::unchecked("operator1")
}

pub fn operator2() -> Addr {
    Addr::unchecked("operator2")
}

pub fn operator3() -> Addr {
    Addr::unchecked("operator3")
}

pub fn user1() -> Addr {
    Addr::unchecked("user1")
}

pub fn user2() -> Addr {
    Addr::unchecked("user2")
}

pub fn user3() -> Addr {
    Addr::unchecked("user3")
}

pub fn mock_registry_contract() -> Addr {
    Addr::unchecked("registry_contract")
}

pub fn treasury_manager() -> Addr {
    Addr::unchecked("treasury_manager")
}

// Helper function to create test round info
pub fn test_round_info() -> RoundInfo {
    RoundInfo {
        title: "Test Round".to_string(),
        description: "A test voting round".to_string(),
        link: "https://example.com".to_string(),
    }
}

// Helper function to create test voting time (for legacy AMACI tests)
pub fn test_voting_time() -> cw_amaci::state::VotingTime {
    cw_amaci::state::VotingTime {
        start_time: Timestamp::from_seconds(1640995200), // 2022-01-01
        end_time: Timestamp::from_seconds(1641081600),   // 2022-01-02
    }
}
