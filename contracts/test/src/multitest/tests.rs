#[cfg(test)]
mod test {
    use crate::msg::HashOperation;
    use crate::multitest::{
        create_app, owner, test_pubkey1, test_pubkey2, user1, user2, MaciCodeId,
    };
    use crate::state::MessageData;
    use cosmwasm_std::Uint256;

    #[test]
    fn test_instantiate() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        // Verify basic queries work
        let num_sign_ups = contract.get_num_sign_up(&app).unwrap();
        assert_eq!(num_sign_ups, Uint256::zero());

        let voice_credit_amount = contract.get_voice_credit_amount(&app).unwrap();
        assert_eq!(voice_credit_amount, Uint256::from_u128(100u128));

        let msg_chain_length = contract.get_msg_chain_length(&app).unwrap();
        assert_eq!(msg_chain_length, Uint256::zero());
    }

    #[test]
    fn test_sign_up() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        let pubkey = test_pubkey1();

        // Sign up first user
        let response = contract.sign_up(&mut app, user1(), pubkey.clone()).unwrap();
        assert!(response.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "action" && attr.value == "sign_up")
        }));

        // Verify signup
        let num_sign_ups = contract.get_num_sign_up(&app).unwrap();
        assert_eq!(num_sign_ups, Uint256::from_u128(1u128));

        let state_idx = contract.signuped(&app, pubkey).unwrap();
        assert_eq!(state_idx, Some(Uint256::zero()));

        // Verify state tree was updated
        let state_root = contract.get_state_tree_root(&app).unwrap();
        assert_ne!(state_root, Uint256::zero());
    }

    #[test]
    fn test_multiple_signups() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        let pubkey1 = test_pubkey1();
        let pubkey2 = test_pubkey2();

        // Sign up two users
        contract
            .sign_up(&mut app, user1(), pubkey1.clone())
            .unwrap();
        contract
            .sign_up(&mut app, user2(), pubkey2.clone())
            .unwrap();

        // Verify both signups
        let num_sign_ups = contract.get_num_sign_up(&app).unwrap();
        assert_eq!(num_sign_ups, Uint256::from_u128(2u128));

        let state_idx1 = contract.signuped(&app, pubkey1).unwrap();
        assert_eq!(state_idx1, Some(Uint256::zero()));

        let state_idx2 = contract.signuped(&app, pubkey2).unwrap();
        assert_eq!(state_idx2, Some(Uint256::from_u128(1u128)));
    }

    #[test]
    fn test_publish_message() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        // Sign up first to have valid state
        let pubkey = test_pubkey1();
        contract.sign_up(&mut app, user1(), pubkey.clone()).unwrap();

        // Publish a message
        let message = MessageData {
            data: [
                Uint256::from_u128(1u128),
                Uint256::from_u128(2u128),
                Uint256::from_u128(3u128),
                Uint256::from_u128(4u128),
                Uint256::from_u128(5u128),
                Uint256::from_u128(6u128),
                Uint256::from_u128(7u128),
            ],
        };
        let enc_pub_key = test_pubkey2();

        let response = contract
            .publish_message(&mut app, user1(), message, enc_pub_key)
            .unwrap();
        assert!(response.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "action" && attr.value == "publish_message")
        }));

        // Verify message chain was updated
        let msg_chain_length = contract.get_msg_chain_length(&app).unwrap();
        assert_eq!(msg_chain_length, Uint256::from_u128(1u128));
    }

    #[test]
    fn test_signup_no_hash() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        let pubkey = test_pubkey1();

        // Test signup without hash
        let response = contract
            .test_signup_no_hash(&mut app, user1(), pubkey.clone())
            .unwrap();
        assert!(response.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "action" && attr.value == "test_signup_no_hash")
        }));

        // Verify independent no-hash storage
        let num_sign_ups_no_hash = contract.get_num_sign_up_no_hash(&app).unwrap();
        assert_eq!(num_sign_ups_no_hash, Uint256::from_u128(1u128));

        let state_idx = contract.signuped_no_hash(&app, pubkey).unwrap();
        assert_eq!(state_idx, Some(Uint256::zero()));

        // Verify regular signup counter is still zero (independent storage)
        let num_sign_ups = contract.get_num_sign_up(&app).unwrap();
        assert_eq!(num_sign_ups, Uint256::zero());
    }

    #[test]
    fn test_signup_with_hash() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        let pubkey = test_pubkey1();

        // Test signup with hash
        let response = contract
            .test_signup_with_hash(&mut app, user1(), pubkey.clone())
            .unwrap();
        assert!(response.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "action" && attr.value == "test_signup_with_hash")
        }));

        // Verify signup
        let num_sign_ups = contract.get_num_sign_up(&app).unwrap();
        assert_eq!(num_sign_ups, Uint256::from_u128(1u128));

        let state_idx = contract.signuped(&app, pubkey).unwrap();
        assert_eq!(state_idx, Some(Uint256::zero()));
    }

    #[test]
    fn test_publish_message_test() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        let message = MessageData {
            data: [
                Uint256::from_u128(1u128),
                Uint256::from_u128(2u128),
                Uint256::from_u128(3u128),
                Uint256::from_u128(4u128),
                Uint256::from_u128(5u128),
                Uint256::from_u128(6u128),
                Uint256::from_u128(7u128),
            ],
        };
        let enc_pub_key = test_pubkey2();

        // Test publish message (no validation checks)
        let response = contract
            .test_publish_message(&mut app, user1(), message, enc_pub_key)
            .unwrap();
        assert!(response.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "action" && attr.value == "test_publish_message")
        }));

        // Verify message was added
        let msg_chain_length = contract.get_msg_chain_length(&app).unwrap();
        assert_eq!(msg_chain_length, Uint256::from_u128(1u128));
    }

    #[test]
    fn test_hash2() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        let data = [Uint256::from_u128(1u128), Uint256::from_u128(2u128)];

        let response = contract.test_hash2(&mut app, user1(), data).unwrap();

        assert!(response.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "action" && attr.value == "test_hash2")
        }));

        assert!(response
            .events
            .iter()
            .any(|e| { e.attributes.iter().any(|attr| attr.key == "result") }));
    }

    #[test]
    fn test_hash5() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        let data = [
            Uint256::from_u128(1u128),
            Uint256::from_u128(2u128),
            Uint256::from_u128(3u128),
            Uint256::from_u128(4u128),
            Uint256::from_u128(5u128),
        ];

        let response = contract.test_hash5(&mut app, user1(), data).unwrap();

        assert!(response.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "action" && attr.value == "test_hash5")
        }));

        assert!(response
            .events
            .iter()
            .any(|e| { e.attributes.iter().any(|attr| attr.key == "result") }));
    }

    #[test]
    fn test_hash_uint256() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        let data = Uint256::from_u128(100u128);

        let response = contract.test_hash_uint256(&mut app, user1(), data).unwrap();

        assert!(response.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "action" && attr.value == "test_hash_uint256")
        }));

        assert!(response
            .events
            .iter()
            .any(|e| { e.attributes.iter().any(|attr| attr.key == "result") }));
    }

    #[test]
    fn test_hash_once() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        let data = [
            Uint256::from_u128(1u128),
            Uint256::from_u128(2u128),
            Uint256::from_u128(3u128),
            Uint256::from_u128(4u128),
            Uint256::from_u128(5u128),
        ];

        let response = contract.test_hash_once(&mut app, user1(), data).unwrap();

        assert!(response.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "action" && attr.value == "test_hash_once")
        }));
    }

    #[test]
    fn test_hash_multiple() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        let data = [
            Uint256::from_u128(1u128),
            Uint256::from_u128(2u128),
            Uint256::from_u128(3u128),
            Uint256::from_u128(4u128),
            Uint256::from_u128(5u128),
        ];

        let response = contract
            .test_hash_multiple(&mut app, user1(), data, 5)
            .unwrap();

        assert!(response.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "action" && attr.value == "test_hash_multiple")
        }));

        assert!(response.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "count" && attr.value == "5")
        }));
    }

    #[test]
    fn test_hash_batch() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        let data = vec![
            [
                Uint256::from_u128(1u128),
                Uint256::from_u128(2u128),
                Uint256::from_u128(3u128),
                Uint256::from_u128(4u128),
                Uint256::from_u128(5u128),
            ],
            [
                Uint256::from_u128(6u128),
                Uint256::from_u128(7u128),
                Uint256::from_u128(8u128),
                Uint256::from_u128(9u128),
                Uint256::from_u128(10u128),
            ],
        ];

        let response = contract.test_hash_batch(&mut app, user1(), data).unwrap();

        assert!(response.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "action" && attr.value == "test_hash_batch")
        }));
    }

    #[test]
    fn test_hash_composed() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        let data = [
            Uint256::from_u128(1u128),
            Uint256::from_u128(2u128),
            Uint256::from_u128(3u128),
            Uint256::from_u128(4u128),
            Uint256::from_u128(5u128),
        ];

        let response = contract
            .test_hash_composed(&mut app, user1(), data, 2)
            .unwrap();

        assert!(response.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "action" && attr.value == "test_hash_composed")
        }));
    }

    #[test]
    fn test_batch_hash() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        let operations = vec![
            HashOperation::Hash2 {
                data: [Uint256::from_u128(1u128), Uint256::from_u128(2u128)],
            },
            HashOperation::Hash5 {
                data: [
                    Uint256::from_u128(1u128),
                    Uint256::from_u128(2u128),
                    Uint256::from_u128(3u128),
                    Uint256::from_u128(4u128),
                    Uint256::from_u128(5u128),
                ],
            },
            HashOperation::HashUint256 {
                data: Uint256::from_u128(100u128),
            },
            HashOperation::HashComposed {
                data: [
                    Uint256::from_u128(1u128),
                    Uint256::from_u128(2u128),
                    Uint256::from_u128(3u128),
                    Uint256::from_u128(4u128),
                    Uint256::from_u128(5u128),
                ],
                repeat_count: 1,
            },
        ];

        let response = contract
            .test_batch_hash(&mut app, user1(), operations)
            .unwrap();

        assert!(response.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "action" && attr.value == "test_batch_hash")
        }));

        assert!(response.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "operation_count" && attr.value == "4")
        }));
    }

    #[test]
    fn test_batch_hash_multiple_composed() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        // Test batch with multiple composed operations
        let operations = vec![
            HashOperation::HashComposed {
                data: [
                    Uint256::from_u128(1u128),
                    Uint256::from_u128(2u128),
                    Uint256::from_u128(3u128),
                    Uint256::from_u128(4u128),
                    Uint256::from_u128(5u128),
                ],
                repeat_count: 1,
            },
            HashOperation::HashComposed {
                data: [
                    Uint256::from_u128(6u128),
                    Uint256::from_u128(7u128),
                    Uint256::from_u128(8u128),
                    Uint256::from_u128(9u128),
                    Uint256::from_u128(10u128),
                ],
                repeat_count: 2,
            },
            HashOperation::HashComposed {
                data: [
                    Uint256::from_u128(11u128),
                    Uint256::from_u128(12u128),
                    Uint256::from_u128(13u128),
                    Uint256::from_u128(14u128),
                    Uint256::from_u128(15u128),
                ],
                repeat_count: 3,
            },
        ];

        let response = contract
            .test_batch_hash(&mut app, user1(), operations)
            .unwrap();

        assert!(response.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "action" && attr.value == "test_batch_hash")
        }));

        assert!(response.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "operation_count" && attr.value == "3")
        }));
    }

    #[test]
    fn test_gas_tracking_sign_up() {
        let mut app = create_app();

        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        let pubkey = test_pubkey1();

        // Execute sign up and analyze response
        let response = contract.sign_up(&mut app, user1(), pubkey.clone()).unwrap();

        // Print response information
        println!("\n=== Response Analysis for SignUp ===");
        println!("Number of events: {}", response.events.len());
        for (i, event) in response.events.iter().enumerate() {
            println!("\nEvent {}: {}", i, event.ty);
            for attr in &event.attributes {
                println!("  {}: {}", attr.key, attr.value);
            }
        }

        // In cw-multi-test, gas tracking is limited
        // For accurate gas measurements, you need wasmd integration tests
        println!("\nNote: cw-multi-test doesn't provide detailed gas metrics.");
        println!("For accurate gas measurements, use integration tests with a real chain.");

        // Verify operation succeeded
        let num_sign_ups = contract.get_num_sign_up(&app).unwrap();
        assert_eq!(num_sign_ups, Uint256::from_u128(1u128));
    }

    #[test]
    fn test_detailed_response_analysis() {
        use crate::multitest::TestContract;

        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        let pubkey = test_pubkey1();

        // Test sign up with detailed analysis
        let response = contract.sign_up(&mut app, user1(), pubkey.clone()).unwrap();
        TestContract::print_response_details(&response, "SignUp Operation");

        // Test publish message with detailed analysis
        let message = MessageData {
            data: [
                Uint256::from_u128(1u128),
                Uint256::from_u128(2u128),
                Uint256::from_u128(3u128),
                Uint256::from_u128(4u128),
                Uint256::from_u128(5u128),
                Uint256::from_u128(6u128),
                Uint256::from_u128(7u128),
            ],
        };
        let enc_pub_key = test_pubkey2();

        let response = contract
            .publish_message(&mut app, user1(), message, enc_pub_key)
            .unwrap();
        TestContract::print_response_details(&response, "PublishMessage Operation");

        // Verify operations succeeded
        let num_sign_ups = contract.get_num_sign_up(&app).unwrap();
        assert_eq!(num_sign_ups, Uint256::from_u128(1u128));

        let msg_chain_length = contract.get_msg_chain_length(&app).unwrap();
        assert_eq!(msg_chain_length, Uint256::from_u128(1u128));
    }

    #[test]
    fn test_query_get_node() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        // Sign up to populate the tree
        let pubkey = test_pubkey1();
        contract.sign_up(&mut app, user1(), pubkey).unwrap();

        // Query root node
        let node = contract.get_node(&app, Uint256::zero()).unwrap();
        assert_ne!(node, Uint256::zero());

        // Query leaf node
        let leaf_idx0 = (Uint256::from_u128(
            5u128.pow(2), // state_tree_depth = 2
        ) - Uint256::one())
            / Uint256::from_u128(4u128);
        let leaf_node = contract.get_node(&app, leaf_idx0).unwrap();
        assert_ne!(leaf_node, Uint256::zero());
    }

    #[test]
    fn test_independent_storage_isolation() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        let pubkey1 = test_pubkey1();
        let pubkey2 = test_pubkey2();

        // Do regular signup
        contract
            .sign_up(&mut app, user1(), pubkey1.clone())
            .unwrap();

        // Do no-hash signup
        contract
            .test_signup_no_hash(&mut app, user2(), pubkey2.clone())
            .unwrap();

        // Verify both storages are independent
        let num_sign_ups = contract.get_num_sign_up(&app).unwrap();
        let num_sign_ups_no_hash = contract.get_num_sign_up_no_hash(&app).unwrap();

        assert_eq!(num_sign_ups, Uint256::from_u128(1u128));
        assert_eq!(num_sign_ups_no_hash, Uint256::from_u128(1u128));

        // Verify trees are different
        let state_root = contract.get_state_tree_root(&app).unwrap();
        let state_root_no_hash = contract.get_state_tree_root_no_hash(&app).unwrap();

        assert_ne!(state_root, state_root_no_hash);

        // Verify signup tracking is separate
        let state_idx1 = contract.signuped(&app, pubkey1).unwrap();
        let state_idx2_no_hash = contract.signuped_no_hash(&app, pubkey2).unwrap();

        assert_eq!(state_idx1, Some(Uint256::zero()));
        assert_eq!(state_idx2_no_hash, Some(Uint256::zero()));
    }

    #[test]
    fn test_message_chain_progression() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_default(&mut app, owner(), "test_contract")
            .unwrap();

        // Sign up first
        let pubkey = test_pubkey1();
        contract.sign_up(&mut app, user1(), pubkey).unwrap();

        // Publish multiple messages
        for i in 1..=5 {
            let message = MessageData {
                data: [
                    Uint256::from_u128(i),
                    Uint256::from_u128(i + 1),
                    Uint256::from_u128(i + 2),
                    Uint256::from_u128(i + 3),
                    Uint256::from_u128(i + 4),
                    Uint256::from_u128(i + 5),
                    Uint256::from_u128(i + 6),
                ],
            };
            let enc_pub_key = test_pubkey2();
            contract
                .publish_message(&mut app, user1(), message, enc_pub_key)
                .unwrap();

            // Verify chain length increments
            let msg_chain_length = contract.get_msg_chain_length(&app).unwrap();
            assert_eq!(msg_chain_length, Uint256::from_u128(i));
        }
    }

    // Helper function to test a specific depth
    fn test_single_depth_performance(
        depth: u128,
        iterations: u128,
    ) -> (std::time::Duration, std::time::Duration) {
        use crate::multitest::TestContract;
        use crate::state::MaciParameters;
        use std::time::Instant;

        let mut app = create_app();
        let code_id = crate::multitest::MaciCodeId::store_code(&mut app);

        let parameters = MaciParameters {
            state_tree_depth: Uint256::from_u128(depth),
            int_state_tree_depth: Uint256::from_u128(1u128),
            message_batch_size: Uint256::from_u128(5u128),
            vote_option_tree_depth: Uint256::from_u128(1u128),
        };

        let contract = TestContract::instantiate_with_params(
            &mut app,
            code_id,
            owner(),
            &format!("contract_depth_{}", depth),
            parameters,
        )
        .unwrap();

        // Generate test pubkeys
        let pubkeys: Vec<_> = (0..iterations)
            .map(|i| crate::state::PubKey {
                x: Uint256::from_u128((1000 + i + depth * 100) as u128),
                y: Uint256::from_u128((2000 + i + depth * 100) as u128),
            })
            .collect();

        // Test signup_no_hash
        let start = Instant::now();
        for pubkey in &pubkeys {
            contract
                .test_signup_no_hash(&mut app, user1(), pubkey.clone())
                .unwrap();
        }
        let duration_no_hash = start.elapsed();

        // Test signup_with_hash (need fresh contract)
        let mut app2 = create_app();
        let code_id2 = crate::multitest::MaciCodeId::store_code(&mut app2);
        let parameters2 = MaciParameters {
            state_tree_depth: Uint256::from_u128(depth),
            int_state_tree_depth: Uint256::from_u128(1u128),
            message_batch_size: Uint256::from_u128(5u128),
            vote_option_tree_depth: Uint256::from_u128(1u128),
        };
        let contract2 = TestContract::instantiate_with_params(
            &mut app2,
            code_id2,
            owner(),
            &format!("contract2_depth_{}", depth),
            parameters2,
        )
        .unwrap();

        let start = Instant::now();
        for pubkey in &pubkeys {
            contract2
                .test_signup_with_hash(&mut app2, user1(), pubkey.clone())
                .unwrap();
        }
        let duration_with_hash = start.elapsed();

        (duration_no_hash, duration_with_hash)
    }

    #[test]
    fn test_signup_depth2_performance() {
        let iterations = 10u128;
        let (no_hash, with_hash) = test_single_depth_performance(2, iterations);

        println!("\n{}", "=".repeat(80));
        println!("Depth 2 Performance (Independent Test - Cold Start)");
        println!("{}", "=".repeat(80));
        println!("Iterations: {}", iterations);
        println!("No Hash Total:    {:?}", no_hash);
        println!("No Hash Average:  {:?}", no_hash / iterations as u32);
        println!("With Hash Total:  {:?}", with_hash);
        println!("With Hash Average: {:?}", with_hash / iterations as u32);
        println!(
            "Ratio: {:.2}x",
            with_hash.as_nanos() as f64 / no_hash.as_nanos() as f64
        );
        println!("{}", "=".repeat(80));
    }

    #[test]
    fn test_signup_depth3_performance() {
        let iterations = 10u128;
        let (no_hash, with_hash) = test_single_depth_performance(3, iterations);

        println!("\n{}", "=".repeat(80));
        println!("Depth 3 Performance (Independent Test - Cold Start)");
        println!("{}", "=".repeat(80));
        println!("Iterations: {}", iterations);
        println!("No Hash Total:    {:?}", no_hash);
        println!("No Hash Average:  {:?}", no_hash / iterations as u32);
        println!("With Hash Total:  {:?}", with_hash);
        println!("With Hash Average: {:?}", with_hash / iterations as u32);
        println!(
            "Ratio: {:.2}x",
            with_hash.as_nanos() as f64 / no_hash.as_nanos() as f64
        );
        println!("{}", "=".repeat(80));
    }

    #[test]
    fn test_signup_depth4_performance() {
        let iterations = 10u128;
        let (no_hash, with_hash) = test_single_depth_performance(4, iterations);

        println!("\n{}", "=".repeat(80));
        println!("Depth 4 Performance (Independent Test - Cold Start)");
        println!("{}", "=".repeat(80));
        println!("Iterations: {}", iterations);
        println!("No Hash Total:    {:?}", no_hash);
        println!("No Hash Average:  {:?}", no_hash / iterations as u32);
        println!("With Hash Total:  {:?}", with_hash);
        println!("With Hash Average: {:?}", with_hash / iterations as u32);
        println!(
            "Ratio: {:.2}x",
            with_hash.as_nanos() as f64 / no_hash.as_nanos() as f64
        );
        println!("{}", "=".repeat(80));
    }

    #[test]
    fn test_signup_depth5_performance() {
        let iterations = 10u128;
        let (no_hash, with_hash) = test_single_depth_performance(5, iterations);

        println!("\n{}", "=".repeat(80));
        println!("Depth 5 Performance (Independent Test - Cold Start)");
        println!("{}", "=".repeat(80));
        println!("Iterations: {}", iterations);
        println!("No Hash Total:    {:?}", no_hash);
        println!("No Hash Average:  {:?}", no_hash / iterations as u32);
        println!("With Hash Total:  {:?}", with_hash);
        println!("With Hash Average: {:?}", with_hash / iterations as u32);
        println!(
            "Ratio: {:.2}x",
            with_hash.as_nanos() as f64 / no_hash.as_nanos() as f64
        );
        println!("{}", "=".repeat(80));
    }

    #[test]
    fn test_signup_depth6_performance() {
        let iterations = 10u128;
        let (no_hash, with_hash) = test_single_depth_performance(6, iterations);

        println!("\n{}", "=".repeat(80));
        println!("Depth 6 Performance (Independent Test - Cold Start)");
        println!("{}", "=".repeat(80));
        println!("Iterations: {}", iterations);
        println!("No Hash Total:    {:?}", no_hash);
        println!("No Hash Average:  {:?}", no_hash / iterations as u32);
        println!("With Hash Total:  {:?}", with_hash);
        println!("With Hash Average: {:?}", with_hash / iterations as u32);
        println!(
            "Ratio: {:.2}x",
            with_hash.as_nanos() as f64 / no_hash.as_nanos() as f64
        );
        println!("{}", "=".repeat(80));
    }

    #[test]
    fn test_signup_detailed_tree_depth_analysis() {
        use crate::multitest::TestContract;
        use crate::state::MaciParameters;
        use std::time::Instant;

        println!("\n{}", "=".repeat(80));
        println!("Detailed Tree Depth Analysis: SignUp Performance");
        println!("{}", "=".repeat(80));

        // Note: tree depth > 6 may exceed array bounds
        let test_cases = vec![
            (2, 20, "Small (depth 2, 20 signups)"),
            (3, 20, "Small-Medium (depth 3, 20 signups)"),
            (4, 20, "Medium (depth 4, 20 signups)"),
            (5, 15, "Medium-Large (depth 5, 15 signups)"),
            (6, 10, "Large (depth 6, 10 signups)"),
        ];

        for (depth, iterations, description) in test_cases {
            println!("\n{}", "-".repeat(80));
            println!("Test Case: {}", description);
            println!("{}", "-".repeat(80));

            let mut app = create_app();
            let code_id = crate::multitest::MaciCodeId::store_code(&mut app);
            let parameters = MaciParameters {
                state_tree_depth: Uint256::from_u128(depth),
                int_state_tree_depth: Uint256::from_u128(1u128),
                message_batch_size: Uint256::from_u128(5u128),
                vote_option_tree_depth: Uint256::from_u128(1u128),
            };

            let contract = TestContract::instantiate_with_params(
                &mut app,
                code_id,
                owner(),
                &format!("contract_depth_{}", depth),
                parameters,
            )
            .unwrap();

            // Generate test data
            let pubkeys: Vec<_> = (0..iterations)
                .map(|i| crate::state::PubKey {
                    x: Uint256::from_u128((1000 + i * 100) as u128),
                    y: Uint256::from_u128((2000 + i * 100) as u128),
                })
                .collect();

            // Measure no_hash performance
            let mut no_hash_times = Vec::new();
            for pubkey in &pubkeys {
                let start = Instant::now();
                contract
                    .test_signup_no_hash(&mut app, user1(), pubkey.clone())
                    .unwrap();
                no_hash_times.push(start.elapsed());
            }

            // Measure with_hash performance (fresh contract)
            let mut app2 = create_app();
            let code_id2 = crate::multitest::MaciCodeId::store_code(&mut app2);
            let parameters2 = MaciParameters {
                state_tree_depth: Uint256::from_u128(depth),
                int_state_tree_depth: Uint256::from_u128(1u128),
                message_batch_size: Uint256::from_u128(5u128),
                vote_option_tree_depth: Uint256::from_u128(1u128),
            };
            let contract2 = TestContract::instantiate_with_params(
                &mut app2,
                code_id2,
                owner(),
                &format!("contract2_depth_{}", depth),
                parameters2,
            )
            .unwrap();

            let mut with_hash_times = Vec::new();
            for pubkey in &pubkeys {
                let start = Instant::now();
                contract2
                    .test_signup_with_hash(&mut app2, user1(), pubkey.clone())
                    .unwrap();
                with_hash_times.push(start.elapsed());
            }

            // Calculate statistics
            let total_no_hash: std::time::Duration = no_hash_times.iter().sum();
            let total_with_hash: std::time::Duration = with_hash_times.iter().sum();
            let avg_no_hash = total_no_hash / iterations as u32;
            let avg_with_hash = total_with_hash / iterations as u32;

            let min_no_hash = no_hash_times.iter().min().unwrap();
            let max_no_hash = no_hash_times.iter().max().unwrap();
            let min_with_hash = with_hash_times.iter().min().unwrap();
            let max_with_hash = with_hash_times.iter().max().unwrap();

            println!("\nNo Hash Results:");
            println!("  Total time: {:?}", total_no_hash);
            println!("  Average:    {:?}", avg_no_hash);
            println!("  Min:        {:?}", min_no_hash);
            println!("  Max:        {:?}", max_no_hash);

            println!("\nWith Hash Results:");
            println!("  Total time: {:?}", total_with_hash);
            println!("  Average:    {:?}", avg_with_hash);
            println!("  Min:        {:?}", min_with_hash);
            println!("  Max:        {:?}", max_with_hash);

            let ratio = total_with_hash.as_nanos() as f64 / total_no_hash.as_nanos() as f64;
            let overhead = total_with_hash.saturating_sub(total_no_hash);

            println!("\nComparison:");
            println!("  Ratio (with_hash/no_hash): {:.2}x", ratio);
            println!("  Total hash overhead:       {:?}", overhead);
            println!(
                "  Avg hash overhead:         {:?}",
                overhead / iterations as u32
            );

            let speedup_pct = ((ratio - 1.0) * 100.0).max(0.0);
            println!("  Hash cost increase:        {:.1}%", speedup_pct);
        }

        println!("\n{}", "=".repeat(80));
        println!("\n🔍 Key Insights:");
        println!("  1. Tree depth affects both no_hash and with_hash operations");
        println!("  2. Hash overhead is the additional cost of Poseidon hashing");
        println!("  3. Larger trees may show different performance characteristics");
        println!("  4. Min/Max values show operation variance");
        println!("\n⚠️  Remember: This is Rust execution time, not blockchain gas cost!\n");
    }

    #[test]
    fn test_depth2_first_signup_analysis() {
        use crate::multitest::TestContract;
        use crate::state::MaciParameters;
        use std::time::Instant;

        println!("\n{}", "=".repeat(80));
        println!("Depth 2 Performance Analysis: First vs Subsequent Signups");
        println!("{}", "=".repeat(80));

        let depth = 2u128;
        let iterations = 10;

        let mut app = create_app();
        let code_id = crate::multitest::MaciCodeId::store_code(&mut app);
        let parameters = MaciParameters {
            state_tree_depth: Uint256::from_u128(depth),
            int_state_tree_depth: Uint256::from_u128(1u128),
            message_batch_size: Uint256::from_u128(5u128),
            vote_option_tree_depth: Uint256::from_u128(1u128),
        };

        let contract = TestContract::instantiate_with_params(
            &mut app,
            code_id,
            owner(),
            "test_depth2",
            parameters,
        )
        .unwrap();

        println!("\nTesting with_hash signup for depth {}:", depth);
        println!("{}", "-".repeat(80));

        let pubkeys: Vec<_> = (0..iterations)
            .map(|i| crate::state::PubKey {
                x: Uint256::from_u128((1000 + i) as u128),
                y: Uint256::from_u128((2000 + i) as u128),
            })
            .collect();

        // Measure each signup individually
        let mut times = Vec::new();
        for (idx, pubkey) in pubkeys.iter().enumerate() {
            let start = Instant::now();
            contract
                .test_signup_with_hash(&mut app, user1(), pubkey.clone())
                .unwrap();
            let duration = start.elapsed();
            times.push(duration);
            println!("  Signup #{:2}: {:?}", idx + 1, duration);
        }

        println!("\n{}", "-".repeat(80));
        println!("Statistics:");
        let total: std::time::Duration = times.iter().sum();
        let avg = total / iterations as u32;
        let first = times[0];
        let rest_total: std::time::Duration = times[1..].iter().sum();
        let rest_avg = if iterations > 1 {
            rest_total / (iterations - 1) as u32
        } else {
            std::time::Duration::ZERO
        };

        println!("  First signup:      {:?}", first);
        println!("  Avg (2-{}):        {:?}", iterations, rest_avg);
        println!("  Total:             {:?}", total);
        println!("  Overall avg:       {:?}", avg);
        println!(
            "  First/Avg ratio:   {:.2}x",
            first.as_nanos() as f64 / rest_avg.as_nanos() as f64
        );

        println!("\n{}", "=".repeat(80));
        println!("\n💡 Analysis:");
        if first > rest_avg * 2 {
            println!("  ⚠️  First signup is significantly slower!");
            println!("  This suggests initialization overhead in Poseidon hash.");
            println!("  The hash function creates a new Poseidon instance each time,");
            println!("  and the first call may involve expensive setup.");
        } else {
            println!("  ✅ First signup time is similar to others.");
            println!("  The slowness might be due to other factors.");
        }
        println!("\n");
    }

    #[test]
    fn test_compare_depth2_vs_depth3_individual_signups() {
        use crate::multitest::TestContract;
        use crate::state::MaciParameters;
        use std::time::Instant;

        println!("\n{}", "=".repeat(80));
        println!("Individual Signup Comparison: Depth 2 vs Depth 3");
        println!("{}", "=".repeat(80));

        let iterations = 10;

        for &depth in &[2u128, 3u128] {
            let mut app = create_app();
            let code_id = crate::multitest::MaciCodeId::store_code(&mut app);
            let parameters = MaciParameters {
                state_tree_depth: Uint256::from_u128(depth),
                int_state_tree_depth: Uint256::from_u128(1u128),
                message_batch_size: Uint256::from_u128(5u128),
                vote_option_tree_depth: Uint256::from_u128(1u128),
            };

            let contract = TestContract::instantiate_with_params(
                &mut app,
                code_id,
                owner(),
                &format!("test_depth{}", depth),
                parameters,
            )
            .unwrap();

            println!("\n{}", "-".repeat(80));
            println!("Depth {}: Individual signup times", depth);
            println!("{}", "-".repeat(80));

            let pubkeys: Vec<_> = (0..iterations)
                .map(|i| crate::state::PubKey {
                    x: Uint256::from_u128((1000 + i + depth * 100) as u128),
                    y: Uint256::from_u128((2000 + i + depth * 100) as u128),
                })
                .collect();

            let mut times = Vec::new();
            for (idx, pubkey) in pubkeys.iter().enumerate() {
                let start = Instant::now();
                contract
                    .test_signup_with_hash(&mut app, user1(), pubkey.clone())
                    .unwrap();
                let duration = start.elapsed();
                times.push(duration);
                if idx < 3 || idx >= (iterations as usize) - 1 {
                    println!("  Signup #{:2}: {:?}", idx + 1, duration);
                } else if idx == 3 {
                    println!("  ...");
                }
            }

            let total: std::time::Duration = times.iter().sum();
            let avg = total / iterations as u32;
            let first = times[0];
            let min = times.iter().min().unwrap();
            let max = times.iter().max().unwrap();

            println!("\n  Summary:");
            println!("    First:   {:?}", first);
            println!("    Min:     {:?}", min);
            println!("    Max:     {:?}", max);
            println!("    Average: {:?}", avg);
        }

        println!("\n{}", "=".repeat(80));
        println!("\n🔍 Observation:");
        println!("  Compare the first signup time and max time between depth 2 and 3.");
        println!("  If depth 2's first or max is much larger, it indicates");
        println!("  initialization overhead or lazy loading in Poseidon hash.\n");
    }
}
