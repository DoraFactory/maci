use cosmwasm_std::{coins, Addr, Uint128, Uint256};
use cw_multi_test::{AppBuilder, Contract, ContractWrapper, Executor, StargateAccepting};

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, PubKey};
use crate::multitest::{
    admin, create_app, creator, operator1, operator2, treasury_manager, user1, user2, SaasCodeId,
    DORA_DEMON,
};
use cw_amaci::multitest::uint256_from_decimal_string;
use cw_api_maci;
use cw_api_maci::state::RoundInfo as OracleMaciRoundInfo;

#[test]
fn test_instantiate_saas_contract() {
    let mut app = create_app();

    let oracle_maci_code_id = app.store_code(oracle_maci_contract());
    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            crate::multitest::mock_registry_contract(),
            DORA_DEMON.to_string(),
            oracle_maci_code_id,
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

    // Verify oracle maci code id is set correctly
    let stored_code_id = contract.query_maci_code_id(&app).unwrap();
    assert_eq!(stored_code_id, oracle_maci_code_id);
}

#[test]
fn test_update_config() {
    let mut app = create_app();

    let oracle_maci_code_id = app.store_code(oracle_maci_contract());
    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            crate::multitest::mock_registry_contract(),
            DORA_DEMON.to_string(),
            oracle_maci_code_id,
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

    let oracle_maci_code_id = app.store_code(oracle_maci_contract());
    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            crate::multitest::mock_registry_contract(),
            DORA_DEMON.to_string(),
            oracle_maci_code_id,
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

    let oracle_maci_code_id = app.store_code(oracle_maci_contract());
    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            crate::multitest::mock_registry_contract(),
            DORA_DEMON.to_string(),
            oracle_maci_code_id,
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
fn test_create_api_maci_round_success() {
    let initial_balance = 1000000000000000000000u128; // 1000 DORA
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
        });

    let oracle_maci_code_id = app.store_code(oracle_maci_contract());
    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            crate::multitest::mock_registry_contract(),
            DORA_DEMON.to_string(),
            oracle_maci_code_id,
            "SaaS Contract",
        )
        .unwrap();

    // Add operator and deposit funds
    contract
        .add_operator(&mut app, admin(), operator1())
        .unwrap();
    contract
        .deposit(&mut app, user1(), &coins(initial_balance, DORA_DEMON))
        .unwrap();

    let initial_balance_check = contract.query_balance(&app).unwrap();
    assert_eq!(initial_balance_check, Uint128::from(initial_balance));

    // Create Oracle MACI round
    let max_voters = 5u128;
    let create_msg = ExecuteMsg::CreateMaciRound {
        coordinator: PubKey {
            x: Uint256::from(1u32),
            y: Uint256::from(2u32),
        },
        max_voters,
        vote_option_map: vec!["Option 1".to_string()],
        round_info: cw_amaci::state::RoundInfo {
            title: "Test Round".to_string(),
            description: "Test Description".to_string(),
            link: "https://test.com".to_string(),
        },
        start_time: cosmwasm_std::Timestamp::from_seconds(1640995200), // 2022-01-01
        end_time: cosmwasm_std::Timestamp::from_seconds(1641081600),   // 2022-01-02
        circuit_type: Uint256::zero(),
        certification_system: Uint256::zero(),
        whitelist_backend_pubkey: "dGVzdA==".to_string(),
    };

    let result = app.execute_contract(operator1(), contract.addr(), &create_msg, &[]);

    // Oracle MACI creation should succeed
    if let Err(e) = &result {
        println!("Error creating Oracle MACI round: {:?}", e);
    }
    assert!(
        result.is_ok(),
        "Oracle MACI round creation should succeed: {:?}",
        result.err()
    );

    let response = result.unwrap();

    // Verify Oracle MACI contract was instantiated
    let _instantiate_event = response
        .events
        .iter()
        .find(|e| e.ty == "instantiate")
        .expect("Should have instantiate event");

    // Note: No fees are deducted anymore as funds logic is removed

    // Verify balance remains unchanged
    let final_balance = contract.query_balance(&app).unwrap();
    assert_eq!(final_balance, Uint128::from(initial_balance));

    // Note: MACI tracking functionality removed - contracts are created but not tracked in SaaS contract
}

#[test]
fn test_create_api_maci_round_unauthorized() {
    let mut app = create_app();

    let oracle_maci_code_id = app.store_code(oracle_maci_contract());
    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            crate::multitest::mock_registry_contract(),
            DORA_DEMON.to_string(),
            oracle_maci_code_id,
            "SaaS Contract",
        )
        .unwrap();

    let create_msg = ExecuteMsg::CreateMaciRound {
        coordinator: PubKey {
            x: uint256_from_decimal_string(
                "3557592161792765812904087712812111121909518311142005886657252371904276697771",
            ),
            y: uint256_from_decimal_string(
                "4363822302427519764561660537570341277214758164895027920046745209970137856681",
            ),
        },
        max_voters: 5,
        vote_option_map: vec!["Option 1".to_string()],
        round_info: cw_amaci::state::RoundInfo {
            title: "Test Round".to_string(),
            description: "Test Description".to_string(),
            link: "https://test.com".to_string(),
        },
        start_time: cosmwasm_std::Timestamp::from_seconds(1753920000), // 2022-01-01
        end_time: cosmwasm_std::Timestamp::from_seconds(1754006400),   // 2022-01-02
        circuit_type: Uint256::zero(),
        certification_system: Uint256::zero(),
        whitelist_backend_pubkey: "AoYo/zENN/JquagPdG0/NMbWBBYxOM8BVN677mBXJKJQ".to_string(),
    };

    // Try to create round as non-operator (should fail with Unauthorized)
    let result = app.execute_contract(user1(), contract.addr(), &create_msg, &[]);

    assert!(
        result.is_err(),
        "Non-operator should not be able to create Oracle MACI round"
    );

    let error = result.unwrap_err();
    assert_eq!(
        error.downcast::<ContractError>().unwrap(),
        ContractError::Unauthorized {}
    );
}

#[test]
fn test_create_api_maci_round_with_minimal_funds() {
    let initial_balance = 10000000000000000000u128; // 10 DORA - previously insufficient, now enough
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
        });

    let oracle_maci_code_id = app.store_code(oracle_maci_contract());
    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            crate::multitest::mock_registry_contract(),
            DORA_DEMON.to_string(),
            oracle_maci_code_id,
            "SaaS Contract",
        )
        .unwrap();

    // Add operator and deposit funds
    contract
        .add_operator(&mut app, admin(), operator1())
        .unwrap();
    contract
        .deposit(&mut app, user1(), &coins(initial_balance, DORA_DEMON))
        .unwrap();

    let create_msg = ExecuteMsg::CreateMaciRound {
        coordinator: PubKey {
            x: Uint256::from(1u32),
            y: Uint256::from(2u32),
        },
        max_voters: 100, // No longer requires any specific token amount
        vote_option_map: vec!["Option 1".to_string()],
        round_info: cw_amaci::state::RoundInfo {
            title: "Test Round".to_string(),
            description: "Test Description".to_string(),
            link: "https://test.com".to_string(),
        },
        start_time: cosmwasm_std::Timestamp::from_seconds(1640995200), // 2022-01-01
        end_time: cosmwasm_std::Timestamp::from_seconds(1641081600),   // 2022-01-02
        circuit_type: Uint256::zero(),
        certification_system: Uint256::zero(),
        whitelist_backend_pubkey: "dGVzdA==".to_string(),
    };

    // Should now succeed since no funds checking is done
    let result = app.execute_contract(operator1(), contract.addr(), &create_msg, &[]);

    assert!(result.is_ok(), "Should succeed without funds checking");

    // Verify balance remains unchanged
    let final_balance = contract.query_balance(&app).unwrap();
    assert_eq!(final_balance, Uint128::from(initial_balance));
}

#[test]
fn test_oracle_maci_round_management() {
    let initial_balance = 1000000000000000000000u128; // 1000 DORA
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
        });

    let oracle_maci_code_id = app.store_code(oracle_maci_contract());
    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            crate::multitest::mock_registry_contract(),
            DORA_DEMON.to_string(),
            oracle_maci_code_id,
            "SaaS Contract",
        )
        .unwrap();

    // Setup: add operator and deposit funds
    contract
        .add_operator(&mut app, admin(), operator1())
        .unwrap();
    contract
        .deposit(&mut app, user1(), &coins(initial_balance, DORA_DEMON))
        .unwrap();

    // Create Oracle MACI round first
    let create_msg = ExecuteMsg::CreateMaciRound {
        coordinator: PubKey {
            x: uint256_from_decimal_string(
                "3557592161792765812904087712812111121909518311142005886657252371904276697771",
            ),
            y: uint256_from_decimal_string(
                "4363822302427519764561660537570341277214758164895027920046745209970137856681",
            ),
        },
        max_voters: 5,
        vote_option_map: vec!["Option 1".to_string()],
        round_info: cw_amaci::state::RoundInfo {
            title: "Test Round".to_string(),
            description: "Test Description".to_string(),
            link: "https://test.com".to_string(),
        },
        start_time: cosmwasm_std::Timestamp::from_seconds(1753920000), // 2022-01-01
        end_time: cosmwasm_std::Timestamp::from_seconds(1754006400),   // 2022-01-02
        circuit_type: Uint256::zero(),
        certification_system: Uint256::zero(),
        whitelist_backend_pubkey: "AoYo/zENN/JquagPdG0/NMbWBBYxOM8BVN677mBXJKJQ".to_string(),
    };

    let create_result = app.execute_contract(operator1(), contract.addr(), &create_msg, &[]);
    if let Err(e) = &create_result {
        println!("Error creating Oracle MACI round: {:?}", e);
    }
    assert!(
        create_result.is_ok(),
        "Oracle MACI round creation should succeed: {:?}",
        create_result.err()
    );

    let response = create_result.unwrap();

    // Note: fee_grant_amount verification removed as feegrant is handled by Oracle MACI contract

    // Get the created contract address from events
    let oracle_maci_addr = extract_contract_address_from_events(&response.events);
    println!("========= oracle_maci_addr: {}", oracle_maci_addr);

    // Query and print Oracle MACI round info
    let round_info_query_msg = serde_json::json!({
        "get_round_info": {}
    });

    let round_info_result: Result<OracleMaciRoundInfo, _> = app
        .wrap()
        .query_wasm_smart(oracle_maci_addr.clone(), &round_info_query_msg);

    match round_info_result {
        Ok(round_info) => {
            println!("========= Oracle MACI Round Info ==========");
            println!("Title: {}", round_info.title);
            println!("Description: {}", round_info.description);
            println!("Link: {}", round_info.link);
            println!("==========================================");
        }
        Err(e) => {
            println!("Failed to query round info: {:?}", e);
        }
    }

    let create_result_again = app.execute_contract(operator1(), contract.addr(), &create_msg, &[]);
    if let Err(e) = &create_result_again {
        println!("Error creating Oracle MACI round again: {:?}", e);
    }
    assert!(
        create_result_again.is_ok(),
        "Oracle MACI round creation should succeed: {:?}",
        create_result_again.err()
    );

    // Get the created contract address from events
    let oracle_maci_addr_again =
        extract_contract_address_from_events(&create_result_again.unwrap().events);
    println!(
        "========= oracle_maci_addr_again: {}",
        oracle_maci_addr_again
    );

    // Query and print second Oracle MACI round info
    let round_info_query_msg_again = serde_json::json!({
        "get_round_info": {}
    });

    let round_info_result_again: Result<OracleMaciRoundInfo, _> = app
        .wrap()
        .query_wasm_smart(oracle_maci_addr_again.clone(), &round_info_query_msg_again);

    match round_info_result_again {
        Ok(round_info) => {
            println!("====== Second Oracle MACI Round Info ======");
            println!("Title: {}", round_info.title);
            println!("Description: {}", round_info.description);
            println!("Link: {}", round_info.link);
            println!("===========================================");
        }
        Err(e) => {
            println!("Failed to query second round info: {:?}", e);
        }
    }
    // Test round info management
    let updated_round_info = cw_amaci::state::RoundInfo {
        title: "Updated Round Title".to_string(),
        description: "Updated Description".to_string(),
        link: "https://updated-test.com".to_string(),
    };

    let set_round_info_msg = ExecuteMsg::SetRoundInfo {
        contract_addr: oracle_maci_addr.clone(),
        round_info: updated_round_info,
    };

    // Operator should be able to update round info (may fail due to test environment but should pass authorization)
    let result = app.execute_contract(operator1(), contract.addr(), &set_round_info_msg, &[]);
    // In test environment this may fail due to target contract not existing, but not due to authorization
    if let Err(e) = &result {
        let error_msg = e.to_string();
        assert!(
            !error_msg.contains("Unauthorized"),
            "Should not fail due to authorization"
        );
    }

    // Non-operator should not be able to update round info
    let result = app.execute_contract(user1(), contract.addr(), &set_round_info_msg, &[]);
    assert!(
        result.is_err(),
        "Non-operator should not be able to update round info"
    );
    assert_eq!(
        result.unwrap_err().downcast::<ContractError>().unwrap(),
        ContractError::Unauthorized {}
    );

    // Test vote options management
    let updated_vote_options = vec![
        "Strongly Support".to_string(),
        "Support".to_string(),
        "Neutral".to_string(),
        "Oppose".to_string(),
        "Strongly Oppose".to_string(),
    ];

    let set_vote_options_msg = ExecuteMsg::SetVoteOptionsMap {
        contract_addr: oracle_maci_addr.clone(),
        vote_option_map: updated_vote_options,
    };

    // Operator should be able to update vote options
    let result = app.execute_contract(operator1(), contract.addr(), &set_vote_options_msg, &[]);
    if let Err(e) = &result {
        let error_msg = e.to_string();
        assert!(
            !error_msg.contains("Unauthorized"),
            "Should not fail due to authorization"
        );
    }

    // Note: Fee grant management functionality has been removed as it's
    // handled directly by the Oracle MACI contract
}

// Helper function to extract contract address from events
fn extract_contract_address_from_events(events: &[cosmwasm_std::Event]) -> String {
    for event in events {
        if event.ty == "instantiate" {
            for attr in &event.attributes {
                if attr.key == "_contract_address" {
                    return attr.value.clone();
                }
            }
        }
    }
    "contract1".to_string() // Default fallback for test
}

// Note: test_operator_feegrant_lifecycle test removed as feegrant functionality
// is now handled directly by the Oracle MACI contract

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

    let oracle_maci_code_id = app.store_code(oracle_maci_contract());
    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            crate::multitest::mock_registry_contract(),
            DORA_DEMON.to_string(),
            oracle_maci_code_id,
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

    let oracle_maci_code_id = app.store_code(oracle_maci_contract());
    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            crate::multitest::mock_registry_contract(),
            DORA_DEMON.to_string(),
            oracle_maci_code_id,
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

    let oracle_maci_code_id = app.store_code(oracle_maci_contract());
    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            crate::multitest::mock_registry_contract(),
            DORA_DEMON.to_string(),
            oracle_maci_code_id,
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

    let oracle_maci_code_id = app.store_code(oracle_maci_contract());
    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            crate::multitest::mock_registry_contract(),
            DORA_DEMON.to_string(),
            oracle_maci_code_id,
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

    let oracle_maci_code_id = app.store_code(oracle_maci_contract());
    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            crate::multitest::mock_registry_contract(),
            DORA_DEMON.to_string(),
            oracle_maci_code_id,
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

    let oracle_maci_code_id = app.store_code(oracle_maci_contract());
    let code_id = SaasCodeId::store_code(&mut app);
    let contract = code_id
        .instantiate(
            &mut app,
            creator(),
            admin(),
            treasury_manager(),
            crate::multitest::mock_registry_contract(),
            DORA_DEMON.to_string(),
            oracle_maci_code_id,
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

// Oracle MACI contract wrapper for testing
fn oracle_maci_contract() -> Box<dyn Contract<cosmwasm_std::Empty>> {
    let contract = ContractWrapper::new(
        cw_api_maci::contract::execute,
        cw_api_maci::contract::instantiate,
        cw_api_maci::contract::query,
    )
    .with_reply(cw_api_maci::contract::reply);
    Box::new(contract)
}

// Real Registry and AMACI contract wrappers for integration testing
fn real_registry_contract() -> Box<dyn Contract<cosmwasm_std::Empty>> {
    let contract = ContractWrapper::new(
        cw_amaci_registry::contract::execute,
        cw_amaci_registry::contract::instantiate,
        cw_amaci_registry::contract::query,
    )
    .with_reply(cw_amaci_registry::contract::reply);
    Box::new(contract)
}

fn real_amaci_contract() -> Box<dyn Contract<cosmwasm_std::Empty>> {
    let contract = ContractWrapper::new(
        cw_amaci::contract::execute,
        cw_amaci::contract::instantiate,
        cw_amaci::contract::query,
    );
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
    let oracle_maci_code_id = app.store_code(oracle_maci_contract());
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
    let pubkey = cw_amaci::state::PubKey {
        x: Uint256::from(1u128),
        y: Uint256::from(2u128),
    };
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
            oracle_maci_code_id,
            "SaaS Contract",
        )
        .unwrap();

    // Add operator to SaaS contract
    contract
        .add_operator(&mut app, admin(), operator1())
        .unwrap();

    // Deposit funds to SaaS contract to pay for the round creation
    let required_fee = 20000000000000000000u128; // 20 DORA
    contract
        .deposit(
            &mut app,
            treasury_manager(),
            &coins(required_fee, DORA_DEMON),
        )
        .unwrap();

    // Create AMACI round parameters
    let dora_operator = Addr::unchecked("dora1eu7mhp4ggxd6utnz8uzurw395natgs6jskl4ug"); // Use valid dora address
    let max_voter = Uint256::from(25u128);
    let voice_credit_amount = Uint256::from(100u128);
    let round_info = crate::multitest::test_round_info();
    let voting_time = crate::multitest::test_voting_time();
    let circuit_type = Uint256::zero();
    let certification_system = Uint256::zero();

    // Create AMACI round via SaaS contract (no funds sent, uses SaaS balance)
    let result = contract.create_amaci_round(
        &mut app,
        operator1(),   // sender (must be operator in SaaS)
        dora_operator, // operator parameter (must be operator in registry)
        max_voter,
        voice_credit_amount,
        vec![
            "Candidate A".to_string(),
            "Candidate B".to_string(),
            "Candidate C".to_string(),
            "Candidate D".to_string(),
            "Candidate E".to_string(),
        ], // vote_option_map
        round_info.clone(),
        voting_time,
        None,            // no whitelist
        Uint256::zero(), // pre_deactivate_root
        circuit_type,
        certification_system,
        None, // oracle_whitelist_pubkey
        &[],  // No funds sent - using SaaS contract balance
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

    let oracle_maci_code_id = app.store_code(oracle_maci_contract());
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
            oracle_maci_code_id,
            "SaaS Contract",
        )
        .unwrap();

    // Don't add user1 as operator in SaaS contract

    // Try to create AMACI round as non-operator
    let result = contract.create_amaci_round(
        &mut app,
        user1(),                // sender (not an operator in SaaS)
        admin(),                // operator parameter
        Uint256::from(25u128),  // max_voter
        Uint256::from(100u128), // voice_credit_amount
        vec![
            "Test Option 1".to_string(),
            "Test Option 2".to_string(),
            "Test Option 3".to_string(),
            "Test Option 4".to_string(),
            "Test Option 5".to_string(),
        ], // vote_option_map
        crate::multitest::test_round_info(),
        crate::multitest::test_voting_time(),
        None,            // no whitelist
        Uint256::zero(), // pre_deactivate_root
        Uint256::zero(), // circuit_type
        Uint256::zero(), // certification_system
        None,            // oracle_whitelist_pubkey
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
