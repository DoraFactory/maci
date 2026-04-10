use cosmwasm_std::{coins, Addr, DepsMut, Env, Reply, Response, StdResult, Timestamp, Uint128, Uint256};
use cw_multi_test::{AppBuilder, Contract, ContractWrapper, Executor, StargateAccepting};

use crate::error::ContractError;
use crate::msg::{EncPubKeyParam, ExecuteMsg, MessageDataParam};
use crate::multitest::{
    admin, create_app, creator, mock_registry_contract, operator1, operator2, treasury_manager,
    test_round_info, test_voting_time, user1, user2, SaasCodeId, DORA_DEMON,
};
use cw_amaci::multitest::{
    test_pubkey1, test_pubkey2, test_pubkey3, uint256_from_decimal_string, DEACTIVATE_FEE,
    MESSAGE_FEE,
};

#[test]
fn test_instantiate_saas_contract() {
    let mut app = create_app();

    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            mock_registry_contract(),
            DORA_DEMON.to_string(),
            "SaaS Contract",
        )
        .unwrap();

    // Verify config
    let config = contract.query_config(&app).unwrap();
    assert_eq!(config.admin, admin());
    assert_eq!(config.denom, DORA_DEMON);

    // Verify treasury manager query
    let queried_treasury_manager = contract.query_treasury_manager(&app).unwrap();
    assert_eq!(queried_treasury_manager, treasury_manager());

    // Verify initial balance is zero
    let balance = contract.query_balance(&app).unwrap();
    assert_eq!(balance, Uint128::zero());

    // Verify no operators initially
    let operators = contract.query_operators(&app).unwrap();
    assert!(operators.is_empty());
}

#[test]
fn test_update_config() {
    let mut app = create_app();

    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            mock_registry_contract(),
            DORA_DEMON.to_string(),
            "SaaS Contract",
        )
        .unwrap();

    let new_admin = user1();

    // Update config as admin
    contract
        .update_config(&mut app, admin(), Some(new_admin.clone()), None)
        .unwrap();

    // Verify config updated
    let config = contract.query_config(&app).unwrap();
    assert_eq!(config.admin, new_admin);

    // Try to update as non-admin (should fail)
    let err = contract
        .update_config(&mut app, user2(), Some(admin()), None)
        .unwrap_err();
    assert!(err.to_string().contains("Error executing WasmMsg"));
}

#[test]
fn test_operator_management() {
    let mut app = create_app();

    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            mock_registry_contract(),
            DORA_DEMON.to_string(),
            "SaaS Contract",
        )
        .unwrap();

    // Add operator as admin
    contract
        .add_operator(&mut app, admin(), operator1())
        .unwrap();

    // Verify operator was added
    let is_operator = contract.query_is_operator(&app, operator1()).unwrap();
    assert!(is_operator);

    let operators = contract.query_operators(&app).unwrap();
    assert_eq!(operators.len(), 1);
    assert_eq!(operators[0].address, operator1());

    // Try to add same operator again (should fail)
    let err = contract
        .add_operator(&mut app, admin(), operator1())
        .unwrap_err();
    assert!(err.to_string().contains("Error executing WasmMsg"));

    // Add second operator
    contract
        .add_operator(&mut app, admin(), operator2())
        .unwrap();

    let operators = contract.query_operators(&app).unwrap();
    assert_eq!(operators.len(), 2);

    // Remove operator
    contract
        .remove_operator(&mut app, admin(), operator1())
        .unwrap();

    let is_operator = contract.query_is_operator(&app, operator1()).unwrap();
    assert!(!is_operator);

    let operators = contract.query_operators(&app).unwrap();
    assert_eq!(operators.len(), 1);
    assert_eq!(operators[0].address, operator2());

    // Try to remove non-existent operator (should fail)
    let err = contract
        .remove_operator(&mut app, admin(), operator1())
        .unwrap_err();
    assert!(err.to_string().contains("Error executing WasmMsg"));

    // Try to add operator as non-admin (should fail)
    let err = contract
        .add_operator(&mut app, user1(), operator1())
        .unwrap_err();
    assert!(err.to_string().contains("Error executing WasmMsg"));
}

#[test]
fn test_deposit_and_withdraw() {
    let deposit_amount = 1000000u128;
    let mut app = AppBuilder::default()
        .with_stargate(StargateAccepting)
        .build(|router, _api, storage| {
            router
                .bank
                .init_balance(storage, &user1(), coins(deposit_amount, DORA_DEMON))
                .unwrap();
        });

    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            mock_registry_contract(),
            DORA_DEMON.to_string(),
            "SaaS Contract",
        )
        .unwrap();

    // Deposit funds
    contract
        .deposit(&mut app, user1(), &coins(deposit_amount, DORA_DEMON))
        .unwrap();

    // Check balance
    let balance = contract.query_balance(&app).unwrap();
    assert_eq!(balance, Uint128::from(deposit_amount));

    // Try to deposit without funds (should fail)
    let err = contract.deposit(&mut app, user1(), &[]).unwrap_err();
    assert!(err.to_string().contains("Error executing WasmMsg"));

    // Withdraw funds as treasury manager
    let withdraw_amount = Uint128::from(500000u128);
    contract
        .withdraw(&mut app, treasury_manager(), withdraw_amount, None)
        .unwrap();

    // Check balance updated
    let balance = contract.query_balance(&app).unwrap();
    assert_eq!(balance, Uint128::from(deposit_amount) - withdraw_amount);

    // Try to withdraw as non-admin (should fail)
    let err = contract
        .withdraw(&mut app, user1(), withdraw_amount, None)
        .unwrap_err();
    assert!(err.to_string().contains("Error executing WasmMsg"));

    // Try to withdraw zero amount (should fail)
    let err = contract
        .withdraw(&mut app, admin(), Uint128::zero(), None)
        .unwrap_err();
    assert!(err.to_string().contains("Error executing WasmMsg"));

    // Try to withdraw more than balance (should fail)
    let err = contract
        .withdraw(&mut app, admin(), Uint128::from(1000000u128), None)
        .unwrap_err();
    assert!(err.to_string().contains("Error executing WasmMsg"));
}

#[test]
fn test_treasury_manager_withdraw_success() {
    let deposit_amount = Uint128::from(1000u128);
    let mut app = AppBuilder::default()
        .with_stargate(StargateAccepting)
        .build(|router, _api, storage| {
            router
                .bank
                .init_balance(storage, &user1(), coins(deposit_amount.u128(), DORA_DEMON))
                .unwrap();
        });

    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            mock_registry_contract(),
            DORA_DEMON.to_string(),
            "SaaS Contract",
        )
        .unwrap();

    // Deposit funds first
    let deposit_amount = Uint128::from(1000u128);
    contract
        .deposit(&mut app, user1(), &coins(deposit_amount.u128(), DORA_DEMON))
        .unwrap();

    // Verify balance
    let balance = contract.query_balance(&app).unwrap();
    assert_eq!(balance, deposit_amount);

    // Treasury manager withdraws funds
    let withdraw_amount = Uint128::from(500u128);
    let response = contract
        .withdraw(&mut app, treasury_manager(), withdraw_amount, Some(user2()))
        .unwrap();

    // Verify response attributes
    let attrs: Vec<_> = response.events.iter().flat_map(|e| &e.attributes).collect();
    let action_attr = attrs.iter().find(|attr| attr.key == "action").unwrap();
    assert_eq!(action_attr.value, "withdraw");

    // Verify new balance
    let new_balance = contract.query_balance(&app).unwrap();
    assert_eq!(new_balance, deposit_amount - withdraw_amount);
}

#[test]
fn test_admin_withdraw_fails() {
    let deposit_amount = Uint128::from(1000u128);
    let mut app = AppBuilder::default()
        .with_stargate(StargateAccepting)
        .build(|router, _api, storage| {
            router
                .bank
                .init_balance(storage, &user1(), coins(deposit_amount.u128(), DORA_DEMON))
                .unwrap();
        });

    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            mock_registry_contract(),
            DORA_DEMON.to_string(),
            "SaaS Contract",
        )
        .unwrap();

    // Deposit funds first
    contract
        .deposit(&mut app, user1(), &coins(deposit_amount.u128(), DORA_DEMON))
        .unwrap();

    // Admin tries to withdraw (should fail)
    let withdraw_amount = Uint128::from(500u128);
    let err = contract
        .withdraw(&mut app, admin(), withdraw_amount, None)
        .unwrap_err();

    // Should get TreasuryManagerUnauthorized error
    assert!(err.to_string().contains("Error executing WasmMsg"));
}

#[test]
fn test_treasury_manager_cannot_manage_operators() {
    let mut app = create_app();

    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            mock_registry_contract(),
            DORA_DEMON.to_string(),
            "SaaS Contract",
        )
        .unwrap();

    // Treasury manager tries to add operator (should fail)
    let err = contract
        .add_operator(&mut app, treasury_manager(), operator1())
        .unwrap_err();

    assert!(err.to_string().contains("Error executing WasmMsg"));

    // Admin adds operator (should succeed)
    contract
        .add_operator(&mut app, admin(), operator1())
        .unwrap();

    // Treasury manager tries to remove operator (should fail)
    let err = contract
        .remove_operator(&mut app, treasury_manager(), operator1())
        .unwrap_err();

    assert!(err.to_string().contains("Error executing WasmMsg"));
}

#[test]
fn test_deposit_still_public() {
    let deposit_amount = Uint128::from(1000u128);
    let mut app = AppBuilder::default()
        .with_stargate(StargateAccepting)
        .build(|router, _api, storage| {
            router
                .bank
                .init_balance(storage, &user1(), coins(deposit_amount.u128(), DORA_DEMON))
                .unwrap();
            router
                .bank
                .init_balance(storage, &user2(), coins(deposit_amount.u128(), DORA_DEMON))
                .unwrap();
            router
                .bank
                .init_balance(storage, &admin(), coins(deposit_amount.u128(), DORA_DEMON))
                .unwrap();
            router
                .bank
                .init_balance(
                    storage,
                    &treasury_manager(),
                    coins(deposit_amount.u128(), DORA_DEMON),
                )
                .unwrap();
        });

    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            mock_registry_contract(),
            DORA_DEMON.to_string(),
            "SaaS Contract",
        )
        .unwrap();

    // Various users can deposit
    contract
        .deposit(&mut app, user1(), &coins(deposit_amount.u128(), DORA_DEMON))
        .unwrap();

    contract
        .deposit(&mut app, user2(), &coins(deposit_amount.u128(), DORA_DEMON))
        .unwrap();

    contract
        .deposit(&mut app, admin(), &coins(deposit_amount.u128(), DORA_DEMON))
        .unwrap();

    contract
        .deposit(
            &mut app,
            treasury_manager(),
            &coins(deposit_amount.u128(), DORA_DEMON),
        )
        .unwrap();

    // Verify total balance
    let total_balance = contract.query_balance(&app).unwrap();
    assert_eq!(total_balance, deposit_amount * Uint128::from(4u128));
}

#[test]
fn test_role_separation_complete_workflow() {
    let deposit_amount = Uint128::from(2000u128);
    let mut app = AppBuilder::default()
        .with_stargate(StargateAccepting)
        .build(|router, _api, storage| {
            router
                .bank
                .init_balance(storage, &user1(), coins(deposit_amount.u128(), DORA_DEMON))
                .unwrap();
        });

    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            mock_registry_contract(),
            DORA_DEMON.to_string(),
            "SaaS Contract",
        )
        .unwrap();

    // Step 1: Public deposits funds
    contract
        .deposit(&mut app, user1(), &coins(deposit_amount.u128(), DORA_DEMON))
        .unwrap();

    // Step 2: Admin manages operators
    contract
        .add_operator(&mut app, admin(), operator1())
        .unwrap();

    let is_operator = contract.query_is_operator(&app, operator1()).unwrap();
    assert!(is_operator);

    // Step 3: Treasury manager withdraws funds
    let withdraw_amount = Uint128::from(1000u128);
    contract
        .withdraw(&mut app, treasury_manager(), withdraw_amount, Some(user2()))
        .unwrap();

    // Step 4: Verify balances
    let remaining_balance = contract.query_balance(&app).unwrap();
    assert_eq!(remaining_balance, deposit_amount - withdraw_amount);

    // Step 5: Treasury manager is immutable - only the original treasury manager can withdraw
    let second_withdraw = Uint128::from(500u128);
    contract
        .withdraw(&mut app, treasury_manager(), second_withdraw, Some(user1()))
        .unwrap();

    // Step 6: Verify non-treasury manager (user2) cannot withdraw
    let err = contract
        .withdraw(&mut app, user2(), Uint128::from(100u128), None)
        .unwrap_err();

    assert!(err.to_string().contains("Error executing WasmMsg"));

    // Verify final balance
    let final_balance = contract.query_balance(&app).unwrap();
    assert_eq!(
        final_balance,
        deposit_amount - withdraw_amount - second_withdraw
    );
}

#[test]
fn test_migration_sets_treasury_manager() {
    let mut app = create_app();

    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            mock_registry_contract(),
            DORA_DEMON.to_string(),
            "SaaS Contract",
        )
        .unwrap();

    // Verify treasury manager is set correctly after instantiation
    let queried_treasury_manager = contract.query_treasury_manager(&app).unwrap();
    assert_eq!(queried_treasury_manager, treasury_manager());

    // Verify treasury manager is still accessible via query
    let queried_treasury_manager = contract.query_treasury_manager(&app).unwrap();
    assert_eq!(queried_treasury_manager, treasury_manager());

    // Migration scenario would be tested in integration tests
    // where we deploy an old version without treasury_manager
    // and then migrate to new version
}

// Real Registry and AMACI contract wrappers for integration testing
fn real_registry_contract() -> Box<dyn Contract<cosmwasm_std::Empty, cosmwasm_std::Empty>> {
    let contract = ContractWrapper::new(
        cw_amaci_registry::contract::execute,
        cw_amaci_registry::contract::instantiate,
        cw_amaci_registry::contract::query,
    )
    .with_reply(cw_amaci_registry::contract::reply);
    Box::new(contract)
}

// Empty reply handler for AMACI contract (used for multitest only)
fn amaci_reply_handler(_deps: DepsMut, _env: Env, _msg: Reply) -> StdResult<Response> {
    // AMACI contract does not need to handle any reply, but needs this function to support multitest
    Ok(Response::default())
}

fn real_amaci_contract() -> Box<dyn Contract<cosmwasm_std::Empty, cosmwasm_std::Empty>> {
    let contract = ContractWrapper::new(
        cw_amaci::contract::execute,
        cw_amaci::contract::instantiate,
        cw_amaci::contract::query,
    )
    .with_reply(amaci_reply_handler);
    Box::new(contract)
}

// ========= CreateAmaciRound Tests =========

#[test]
fn test_create_amaci_round_success_real() {
    let initial_balance = 50000000000000000000u128; // 50 DORA - enough for any fee
    let mut app = AppBuilder::default()
        .with_stargate(StargateAccepting)
        .build(|router, _api, storage| {
            router
                .bank
                .init_balance(storage, &user1(), coins(initial_balance, DORA_DEMON))
                .unwrap();
            router
                .bank
                .init_balance(storage, &operator1(), coins(initial_balance, DORA_DEMON))
                .unwrap();
            router
                .bank
                .init_balance(storage, &admin(), coins(initial_balance, DORA_DEMON))
                .unwrap();
            router
                .bank
                .init_balance(
                    storage,
                    &treasury_manager(),
                    coins(initial_balance, DORA_DEMON),
                )
                .unwrap();
            // Give dora operator some funds for gas
            router
                .bank
                .init_balance(
                    storage,
                    &Addr::unchecked("dora1eu7mhp4ggxd6utnz8uzurw395natgs6jskl4ug"),
                    coins(1000000000000000000u128, DORA_DEMON),
                )
                .unwrap();
        });

    // Store contracts
    let amaci_code_id = app.store_code(real_amaci_contract());
    let registry_code_id = app.store_code(real_registry_contract());
    let saas_code_id = SaasCodeId::store_code(&mut app);

    // Instantiate real registry with AMACI code ID
    let registry_addr = app
        .instantiate_contract(
            registry_code_id,
            admin(),
            &cw_amaci_registry::msg::InstantiateMsg {
                admin: admin(),
                operator: admin(), // admin is also operator for simplicity
                amaci_code_id,
            },
            &[],
            "Real Registry",
            None,
        )
        .unwrap();

    // Set validators (only admin can do this)
    app.execute_contract(
        admin(),
        registry_addr.clone(),
        &cw_amaci_registry::msg::ExecuteMsg::SetValidators {
            addresses: cw_amaci_registry::state::ValidatorSet {
                addresses: vec![admin()], // admin is also validator
            },
        },
        &[],
    )
    .unwrap();

    // Set maci operator (validator can do this)
    let dora_operator = Addr::unchecked("dora1eu7mhp4ggxd6utnz8uzurw395natgs6jskl4ug");
    app.execute_contract(
        admin(), // admin as validator
        registry_addr.clone(),
        &cw_amaci_registry::msg::ExecuteMsg::SetMaciOperator {
            operator: dora_operator.clone(), // set dora operator
        },
        &[],
    )
    .unwrap();

    // Set operator pubkey in registry (operator can do this)
    let pubkey = test_pubkey1();
    app.execute_contract(
        dora_operator.clone(), // dora operator sets own pubkey
        registry_addr.clone(),
        &cw_amaci_registry::msg::ExecuteMsg::SetMaciOperatorPubkey { pubkey },
        &[],
    )
    .unwrap();

    // Instantiate SaaS contract with real registry address
    let contract = saas_code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            registry_addr.clone(),
            DORA_DEMON.to_string(),
            "SaaS Contract",
        )
        .unwrap();

    // Add operator to SaaS contract
    contract
        .add_operator(&mut app, admin(), operator1())
        .unwrap();

    // Deposit funds to SaaS contract to pay for the round creation
    let required_fee = 30_000_000_000_000_000_000u128; // 30 DORA (base_fee)
    contract
        .deposit(
            &mut app,
            treasury_manager(),
            &coins(required_fee, DORA_DEMON),
        )
        .unwrap();

    // Create AMACI round parameters
    let dora_operator = Addr::unchecked("dora1eu7mhp4ggxd6utnz8uzurw395natgs6jskl4ug"); // Use valid dora address
    let voice_credit_amount = Uint256::from(100u128);
    let round_info = test_round_info();
    let voting_time = test_voting_time();
    let circuit_type = Uint256::zero();
    let certification_system = Uint256::zero();

    // Create AMACI round via SaaS contract (no funds sent, uses SaaS balance)
    let result = contract.create_amaci_round(
        &mut app,
        operator1(),   // sender (must be operator in SaaS)
        dora_operator, // operator parameter (must be operator in registry)
        cw_amaci::state::VoiceCreditMode::Unified {
            amount: voice_credit_amount,
        },
        vec![
            "Candidate A".to_string(),
            "Candidate B".to_string(),
            "Candidate C".to_string(),
            "Candidate D".to_string(),
            "Candidate E".to_string(),
        ], // vote_option_map
        round_info.clone(),
        voting_time,
        cw_amaci::msg::RegistrationModeConfig::SignUpWithStaticWhitelist {
            whitelist: cw_amaci::msg::WhitelistBase {
                users: vec![],
            },
        },
        circuit_type,
        certification_system,
        false, // deactivate_enabled (default: disabled)
        &[],   // No funds sent - using SaaS contract balance
    );

    // Should succeed
    assert!(
        result.is_ok(),
        "AMACI round creation should succeed: {:?}",
        result.err()
    );

    let response = result.unwrap();

    // Print all events and attributes for verification
    println!("=== AMACI Round Creation Events ===");
    for (event_idx, event) in response.events.iter().enumerate() {
        println!("Event {}: {}", event_idx, event.ty);
        for attr in &event.attributes {
            println!("  {}: {}", attr.key, attr.value);
        }
        println!();
    }
    println!("=== End Events ===");

    // Verify response attributes
    let attrs: Vec<_> = response.events.iter().flat_map(|e| &e.attributes).collect();

    // Check SaaS contract attributes
    let action_attr = attrs.iter().find(|attr| attr.key == "action").unwrap();
    assert_eq!(action_attr.value, "create_amaci_round");

    let registry_attr = attrs
        .iter()
        .find(|attr| attr.key == "registry_contract")
        .unwrap();
    assert_eq!(registry_attr.value, registry_addr.to_string());

    let round_title_attr = attrs.iter().find(|attr| attr.key == "round_title").unwrap();
    assert_eq!(round_title_attr.value, round_info.title);

    // Check that a real AMACI contract was created (we should get a real contract address)
    let round_addr_attr = attrs.iter().find(|attr| attr.key == "round_addr");
    assert!(
        round_addr_attr.is_some(),
        "Should have round_addr attribute"
    );
    let amaci_contract_addr = round_addr_attr.unwrap().value.clone();

    // The AMACI contract address should be a valid contract address, not our mock value
    assert_ne!(amaci_contract_addr, "contract42");
    println!("Got AMACI contract address: {}", amaci_contract_addr);
    assert!(
        !amaci_contract_addr.is_empty(),
        "AMACI contract address should not be empty"
    );

    // Verify the AMACI contract exists by querying its round info
    let round_info_query: cw_amaci::state::RoundInfo = app
        .wrap()
        .query_wasm_smart(
            amaci_contract_addr,
            &cw_amaci::msg::QueryMsg::GetRoundInfo {},
        )
        .unwrap();

    assert_eq!(round_info_query.title, round_info.title);
    assert_eq!(round_info_query.description, round_info.description);
    assert_eq!(round_info_query.link, round_info.link);
}

#[test]
fn test_create_amaci_round_unauthorized_real() {
    let mut app = create_app();

    let amaci_code_id = app.store_code(real_amaci_contract());
    let registry_code_id = app.store_code(real_registry_contract());
    let saas_code_id = SaasCodeId::store_code(&mut app);

    // Instantiate real registry
    let registry_addr = app
        .instantiate_contract(
            registry_code_id,
            admin(),
            &cw_amaci_registry::msg::InstantiateMsg {
                admin: admin(),
                operator: admin(),
                amaci_code_id,
            },
            &[],
            "Real Registry",
            None,
        )
        .unwrap();

    // Instantiate SaaS contract
    let contract = saas_code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            registry_addr,
            DORA_DEMON.to_string(),
            "SaaS Contract",
        )
        .unwrap();

    // Don't add user1 as operator in SaaS contract

    // Try to create AMACI round as non-operator
    let result = contract.create_amaci_round(
        &mut app,
        user1(),  // sender (not an operator in SaaS)
        admin(),  // operator parameter
        cw_amaci::state::VoiceCreditMode::Unified {
            amount: Uint256::from(100u128),
        },
        vec![
            "Test Option 1".to_string(),
            "Test Option 2".to_string(),
            "Test Option 3".to_string(),
            "Test Option 4".to_string(),
            "Test Option 5".to_string(),
        ], // vote_option_map
        test_round_info(),
        test_voting_time(),
        cw_amaci::msg::RegistrationModeConfig::SignUpWithStaticWhitelist {
            whitelist: cw_amaci::msg::WhitelistBase {
                users: vec![],
            },
        },
        Uint256::zero(), // circuit_type
        Uint256::zero(), // certification_system
        false,           // deactivate_enabled (default: disabled)
        &[],             // no fee (will fail before fee checking)
    );

    // Should fail with Unauthorized
    assert!(
        result.is_err(),
        "Non-operator should not be able to create AMACI round"
    );

    let error = result.unwrap_err();
    assert_eq!(
        error.downcast::<ContractError>().unwrap(),
        ContractError::Unauthorized {}
    );
}

// ========= PublishMessage / PublishDeactivateMessage via SAAS Tests =========

/// dora operator address used across publish-message integration tests
fn dora_operator() -> Addr {
    Addr::unchecked("dora1eu7mhp4ggxd6utnz8uzurw395natgs6jskl4ug")
}

/// Shared test environment for publish-message tests.
struct PublishTestEnv {
    app: crate::multitest::App,
    saas: crate::multitest::SaasContract,
    /// Address of the created AMACI round contract
    amaci_addr: String,
}

/// Build a complete SAAS + Registry + AMACI environment.
///
/// - `initial_deposit`: how many peaka to deposit into the SAAS contract upfront.
/// - `deactivate_enabled`: whether the created AMACI round has deactivation enabled.
///
/// After the setup the block time is set to within `test_voting_time`.
fn setup_publish_env(initial_deposit: u128, deactivate_enabled: bool) -> PublishTestEnv {
    // 200 DORA gives every participant more than enough balance.
    let initial_balance = 200_000_000_000_000_000_000u128;

    let mut app = AppBuilder::default()
        .with_stargate(StargateAccepting)
        .build(|router, _api, storage| {
            for addr in [user1(), operator1(), admin(), treasury_manager(), dora_operator()] {
                router
                    .bank
                    .init_balance(storage, &addr, coins(initial_balance, DORA_DEMON))
                    .unwrap();
            }
        });

    let amaci_code_id = app.store_code(real_amaci_contract());
    let registry_code_id = app.store_code(real_registry_contract());
    let saas_code_id = SaasCodeId::store_code(&mut app);

    // Instantiate registry
    let registry_addr = app
        .instantiate_contract(
            registry_code_id,
            admin(),
            &cw_amaci_registry::msg::InstantiateMsg {
                admin: admin(),
                operator: admin(),
                amaci_code_id,
            },
            &[],
            "Real Registry",
            None,
        )
        .unwrap();

    // Set validators & MACI operator
    app.execute_contract(
        admin(),
        registry_addr.clone(),
        &cw_amaci_registry::msg::ExecuteMsg::SetValidators {
            addresses: cw_amaci_registry::state::ValidatorSet {
                addresses: vec![admin()],
            },
        },
        &[],
    )
    .unwrap();
    app.execute_contract(
        admin(),
        registry_addr.clone(),
        &cw_amaci_registry::msg::ExecuteMsg::SetMaciOperator {
            operator: dora_operator(),
        },
        &[],
    )
    .unwrap();
    app.execute_contract(
        dora_operator(),
        registry_addr.clone(),
        &cw_amaci_registry::msg::ExecuteMsg::SetMaciOperatorPubkey {
            pubkey: test_pubkey1(),
        },
        &[],
    )
    .unwrap();

    // Instantiate SAAS
    let saas = saas_code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            registry_addr,
            DORA_DEMON.to_string(),
            "SaaS Contract",
        )
        .unwrap();

    // Register operator1 in SAAS
    saas.add_operator(&mut app, admin(), operator1()).unwrap();

    // Deposit initial funds into SAAS
    if initial_deposit > 0 {
        saas.deposit(&mut app, user1(), &coins(initial_deposit, DORA_DEMON))
            .unwrap();
    }

    // Create AMACI round via SAAS (requires ~5 DORA from SAAS balance)
    let result = saas
        .create_amaci_round(
            &mut app,
            operator1(),
            dora_operator(),
            cw_amaci::state::VoiceCreditMode::Unified {
                amount: Uint256::from(100u128),
            },
            vec![
                "A".to_string(),
                "B".to_string(),
                "C".to_string(),
                "D".to_string(),
                "E".to_string(),
            ],
            test_round_info(),
            test_voting_time(),
            cw_amaci::msg::RegistrationModeConfig::SignUpWithStaticWhitelist {
                whitelist: cw_amaci::msg::WhitelistBase { users: vec![] },
            },
            Uint256::zero(),
            Uint256::zero(),
            deactivate_enabled,
            &[],
        )
        .unwrap();

    // Extract the AMACI contract address from events
    let amaci_addr = result
        .events
        .iter()
        .flat_map(|e| &e.attributes)
        .find(|a| a.key == "round_addr")
        .expect("round_addr not found in events")
        .value
        .clone();

    // Advance block time into the voting period (2022-01-01 00:00:00 < t < 2022-01-02 00:00:00)
    app.update_block(|block| {
        block.time = Timestamp::from_seconds(1641000000);
    });

    PublishTestEnv { app, saas, amaci_addr }
}

/// Query `GetMsgChainLength` from the AMACI contract.
fn query_msg_chain_length(app: &crate::multitest::App, amaci_addr: &str) -> Uint256 {
    app.wrap()
        .query_wasm_smart(amaci_addr, &cw_amaci::msg::QueryMsg::GetMsgChainLength {})
        .unwrap()
}

/// Query `GetDMsgChainLength` from the AMACI contract.
fn query_dmsg_chain_length(app: &crate::multitest::App, amaci_addr: &str) -> Uint256 {
    app.wrap()
        .query_wasm_smart(amaci_addr, &cw_amaci::msg::QueryMsg::GetDMsgChainLength {})
        .unwrap()
}

// ─── publish_message tests ────────────────────────────────────────────────────

/// Operator calls SAAS `publish_message`; SAAS pays the fee from its balance and
/// forwards the call to the AMACI contract.
/// Verify msg_chain_length increments and SAAS balance decreases by exactly MESSAGE_FEE.
#[test]
fn test_saas_publish_message_success() {
    // 100 DORA deposited; round creation costs ~5 DORA, leaving ~95 DORA.
    let PublishTestEnv { mut app, saas, amaci_addr } =
        setup_publish_env(100_000_000_000_000_000_000, false);

    let balance_before = saas.query_balance(&app).unwrap();
    assert_eq!(query_msg_chain_length(&app, &amaci_addr), Uint256::zero());

    let pubkey = test_pubkey1();
    let result = saas.publish_message(
        &mut app,
        operator1(),
        amaci_addr.clone(),
        vec![EncPubKeyParam {
            x: pubkey.x.to_string(),
            y: pubkey.y.to_string(),
        }],
        vec![MessageDataParam {
            data: vec!["1".to_string(); 10],
        }],
    );
    assert!(result.is_ok(), "publish_message via SAAS should succeed: {:?}", result.err());

    // msg_chain_length must have increased to 1
    assert_eq!(query_msg_chain_length(&app, &amaci_addr), Uint256::from_u128(1));

    // SAAS balance must have decreased by exactly MESSAGE_FEE
    let balance_after = saas.query_balance(&app).unwrap();
    assert_eq!(balance_after, balance_before - MESSAGE_FEE);
}

/// Operator sends a batch of 3 messages in a single call.
/// Verify chain length becomes 3 and SAAS balance decreases by MESSAGE_FEE * 3.
#[test]
fn test_saas_publish_message_batch_success() {
    let PublishTestEnv { mut app, saas, amaci_addr } =
        setup_publish_env(100_000_000_000_000_000_000, false);

    let balance_before = saas.query_balance(&app).unwrap();

    // Three distinct enc_pub_keys are required (each key may only be used once per round)
    let pubkeys = [test_pubkey1(), test_pubkey2(), test_pubkey3()];
    let enc_pub_keys: Vec<_> = pubkeys
        .iter()
        .map(|p| EncPubKeyParam {
            x: p.x.to_string(),
            y: p.y.to_string(),
        })
        .collect();
    let messages: Vec<_> = (0..3)
        .map(|_| MessageDataParam {
            data: vec!["1".to_string(); 10],
        })
        .collect();

    let result =
        saas.publish_message(&mut app, operator1(), amaci_addr.clone(), enc_pub_keys, messages);
    assert!(result.is_ok(), "batch publish via SAAS should succeed: {:?}", result.err());

    // Chain length must be 3
    assert_eq!(query_msg_chain_length(&app, &amaci_addr), Uint256::from_u128(3));

    // Balance decreased by MESSAGE_FEE * 3
    let balance_after = saas.query_balance(&app).unwrap();
    let expected_fee = MESSAGE_FEE.checked_mul(Uint128::from(3u128)).unwrap();
    assert_eq!(balance_after, balance_before - expected_fee);
}

/// A non-operator address must not be allowed to call `publish_message`.
#[test]
fn test_saas_publish_message_unauthorized() {
    let PublishTestEnv { mut app, saas, amaci_addr } =
        setup_publish_env(100_000_000_000_000_000_000, false);

    let pubkey = test_pubkey1();
    let err = saas
        .publish_message(
            &mut app,
            user1(), // user1 is NOT an operator in SAAS
            amaci_addr.clone(),
            vec![EncPubKeyParam {
                x: pubkey.x.to_string(),
                y: pubkey.y.to_string(),
            }],
            vec![MessageDataParam {
                data: vec!["1".to_string(); 10],
            }],
        )
        .unwrap_err();

    assert_eq!(
        err.downcast::<ContractError>().unwrap(),
        ContractError::Unauthorized {}
    );
}

/// When the SAAS contract balance is lower than MESSAGE_FEE, the call must be
/// rejected with InsufficientBalance before any interaction with the AMACI contract.
#[test]
fn test_saas_publish_message_insufficient_balance() {
    // Deposit 30.03 DORA. Round creation costs 30 DORA, leaving 0.03 DORA which is
    // less than MESSAGE_FEE (0.06 DORA).
    let PublishTestEnv { mut app, saas, amaci_addr } =
        setup_publish_env(30_030_000_000_000_000_000, false);

    let available = saas.query_balance(&app).unwrap();
    assert!(available < MESSAGE_FEE, "pre-condition: SAAS balance must be < MESSAGE_FEE");

    let pubkey = test_pubkey1();
    let err = saas
        .publish_message(
            &mut app,
            operator1(),
            amaci_addr.clone(),
            vec![EncPubKeyParam {
                x: pubkey.x.to_string(),
                y: pubkey.y.to_string(),
            }],
            vec![MessageDataParam {
                data: vec!["1".to_string(); 10],
            }],
        )
        .unwrap_err();

    assert_eq!(
        err.downcast::<ContractError>().unwrap(),
        ContractError::InsufficientBalance {
            required: MESSAGE_FEE,
            available,
        }
    );
}

// ─── publish_deactivate_message tests ────────────────────────────────────────

/// Operator calls SAAS `publish_deactivate_message`; SAAS pays DEACTIVATE_FEE
/// from its balance and forwards to the AMACI contract.
/// Verify dmsg_chain_length increments and SAAS balance decreases by DEACTIVATE_FEE.
#[test]
fn test_saas_publish_deactivate_message_success() {
    // deactivate_enabled = true is mandatory for the AMACI contract to accept the call.
    let PublishTestEnv { mut app, saas, amaci_addr } =
        setup_publish_env(100_000_000_000_000_000_000, true);

    let balance_before = saas.query_balance(&app).unwrap();
    assert_eq!(query_dmsg_chain_length(&app, &amaci_addr), Uint256::zero());

    let pubkey = test_pubkey1();
    let result = saas.publish_deactivate_message(
        &mut app,
        operator1(),
        amaci_addr.clone(),
        EncPubKeyParam {
            x: pubkey.x.to_string(),
            y: pubkey.y.to_string(),
        },
        MessageDataParam {
            data: vec!["1".to_string(); 10],
        },
    );
    assert!(
        result.is_ok(),
        "publish_deactivate_message via SAAS should succeed: {:?}",
        result.err()
    );

    // dmsg_chain_length must have increased to 1
    assert_eq!(query_dmsg_chain_length(&app, &amaci_addr), Uint256::from_u128(1));

    // SAAS balance must have decreased by exactly DEACTIVATE_FEE
    let balance_after = saas.query_balance(&app).unwrap();
    assert_eq!(balance_after, balance_before - DEACTIVATE_FEE);
}

/// A non-operator address must not be allowed to call `publish_deactivate_message`.
#[test]
fn test_saas_publish_deactivate_message_unauthorized() {
    let PublishTestEnv { mut app, saas, amaci_addr } =
        setup_publish_env(100_000_000_000_000_000_000, true);

    let pubkey = test_pubkey1();
    let err = saas
        .publish_deactivate_message(
            &mut app,
            user1(), // user1 is NOT an operator in SAAS
            amaci_addr.clone(),
            EncPubKeyParam {
                x: pubkey.x.to_string(),
                y: pubkey.y.to_string(),
            },
            MessageDataParam {
                data: vec!["1".to_string(); 10],
            },
        )
        .unwrap_err();

    assert_eq!(
        err.downcast::<ContractError>().unwrap(),
        ContractError::Unauthorized {}
    );
}
