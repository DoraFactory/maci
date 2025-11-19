#[cfg(test)]
mod test {
    use crate::error::ContractError;
    use crate::msg::Groth16ProofType;
    use crate::multitest::{
        create_app, match_user_certificate, owner, uint256_from_decimal_string, user2,
        whitelist_slope, MaciCodeId,
    };
    use crate::state::{MessageData, Period, PeriodStatus, PubKey};
    use cosmwasm_std::{Addr, Uint256};
    use cw_multi_test::next_block;
    use serde::{Deserialize, Serialize};
    use serde_json;
    use std::fs;
    use std::io::Read;

    #[derive(Debug, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct MsgData {
        input_hash: String,
        packed_vals: String,
        batch_start_hash: String,
        batch_end_hash: String,
        msgs: Vec<Vec<String>>,
        coord_priv_key: String,
        coord_pub_key: Vec<String>,
        enc_pub_keys: Vec<Vec<String>>,
        current_state_root: String,
        current_state_leaves: Vec<Vec<String>>,
        current_state_leaves_path_elements: Vec<Vec<Vec<String>>>,
        current_state_commitment: String,
        current_state_salt: String,
        new_state_commitment: String,
        new_state_salt: String,
        current_vote_weights: Vec<String>,
        current_vote_weights_path_elements: Vec<Vec<Vec<String>>>,
    }

    #[derive(Debug, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct TallyData {
        state_root: String,
        state_salt: String,
        packed_vals: String,
        state_commitment: String,
        current_tally_commitment: String,
        new_tally_commitment: String,
        input_hash: String,
        state_leaf: Vec<Vec<String>>,
        state_path_elements: Vec<Vec<String>>,
        votes: Vec<Vec<String>>,
        current_results: Vec<String>,
        current_results_root_salt: String,
        new_results_root_salt: String,
    }

    #[derive(Debug, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ResultData {
        results: Vec<String>,
    }

    #[derive(Debug, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct UserPubkeyData {
        pubkeys: Vec<Vec<String>>,
    }

    #[derive(Debug, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct OracleMaciLogEntry {
        #[serde(rename = "type")]
        log_type: String,
        data: serde_json::Value,
    }

    #[derive(Debug, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct SetStateLeafData {
        leaf_idx: String,
        pub_key: Vec<String>,
        balance: String,
    }

    #[derive(Debug, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct PublishMessageData {
        message: Vec<String>,
        enc_pub_key: Vec<String>,
    }

    #[derive(Debug, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ProcessMessageData {
        proof: Groth16Proof,
        new_state_commitment: String,
        inputs: Option<Vec<String>>,
    }

    #[derive(Debug, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ProcessTallyData {
        proof: Groth16Proof,
        new_tally_commitment: String,
        inputs: Option<Vec<String>>,
    }

    #[derive(Debug, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct StopTallyingPeriodData {
        results: Vec<String>,
        salt: String,
    }

    #[derive(Debug, Serialize, Deserialize)]
    struct Groth16Proof {
        pi_a: String,
        pi_b: String,
        pi_c: String,
    }

    fn deserialize_data<T: serde::de::DeserializeOwned>(data: &serde_json::Value) -> T {
        serde_json::from_value(data.clone()).expect("Unable to deserialize data")
    }

    #[test]
    fn instantiate_with_voting_time_isqv_should_works() {
        // Load logs from oracle-maci test data
        let logs_file_path = "./src/test/maci_test/logs.json";
        let mut logs_file = fs::File::open(logs_file_path).expect("Failed to open logs file");
        let mut logs_content = String::new();
        logs_file
            .read_to_string(&mut logs_content)
            .expect("Failed to read logs file");

        let logs_data: Vec<OracleMaciLogEntry> =
            serde_json::from_str(&logs_content).expect("Failed to parse logs JSON");

        let pubkey_file_path = "./src/test/user_pubkey.json";

        let mut pubkey_file = fs::File::open(pubkey_file_path).expect("Failed to open file");
        let mut pubkey_content = String::new();

        pubkey_file
            .read_to_string(&mut pubkey_content)
            .expect("Failed to read file");
        let pubkey_data: UserPubkeyData =
            serde_json::from_str(&pubkey_content).expect("Failed to parse JSON");

        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let label = "Group";
        let contract = code_id
            .instantiate_with_voting_time_isqv(&mut app, owner(), label)
            .unwrap();

        let num_sign_up = contract.num_sign_up(&app).unwrap();
        assert_eq!(num_sign_up, Uint256::from_u128(0u128));

        let vote_option_map = contract.vote_option_map(&app).unwrap();
        let max_vote_options = contract.max_vote_options(&app).unwrap();
        assert_eq!(vote_option_map, vec!["1", "2", "3", "4", "5"]);
        assert_eq!(max_vote_options, Uint256::from_u128(5u128));

        _ = contract.set_vote_option_map(&mut app, owner());
        let new_vote_option_map = contract.vote_option_map(&app).unwrap();
        assert_eq!(
            new_vote_option_map,
            vec![
                String::from("did_not_vote"),
                String::from("yes"),
                String::from("no"),
                String::from("no_with_veto"),
                String::from("abstain"),
            ]
        );

        // Test signup before voting phase
        let first_state_leaf_entry = logs_data
            .iter()
            .find(|entry| entry.log_type == "setStateLeaf")
            .unwrap();
        let first_state_leaf_data: SetStateLeafData =
            deserialize_data(&first_state_leaf_entry.data);
        let test_pubkey = PubKey {
            x: uint256_from_decimal_string(&first_state_leaf_data.pub_key[0]),
            y: uint256_from_decimal_string(&first_state_leaf_data.pub_key[1]),
        };

        let sign_up_error = contract
            .sign_up(
                &mut app,
                Addr::unchecked(0.to_string()),
                test_pubkey.clone(),
                match_user_certificate(0).amount,
                match_user_certificate(0).certificate,
            )
            .unwrap_err();
        assert_eq!(
            ContractError::PeriodError {},
            sign_up_error.downcast().unwrap()
        ); // Cannot signup before voting phase

        _ = contract.set_vote_option_map(&mut app, owner());

        app.update_block(next_block); // Start Voting

        let set_vote_option_map_error =
            contract.set_vote_option_map(&mut app, owner()).unwrap_err();
        assert_eq!(
            ContractError::PeriodError {},
            set_vote_option_map_error.downcast().unwrap()
        );

        let error_start_process_in_voting = contract.start_process(&mut app, owner()).unwrap_err();
        assert_eq!(
            ContractError::PeriodError {},
            error_start_process_in_voting.downcast().unwrap()
        );
        assert_eq!(
            Period {
                status: PeriodStatus::Pending
            },
            contract.get_period(&app).unwrap()
        );

        let pubkey0 = PubKey {
            x: uint256_from_decimal_string(&pubkey_data.pubkeys[0][0]),
            y: uint256_from_decimal_string(&pubkey_data.pubkeys[0][1]),
        };

        let pubkey1 = PubKey {
            x: uint256_from_decimal_string(&pubkey_data.pubkeys[1][0]),
            y: uint256_from_decimal_string(&pubkey_data.pubkeys[1][1]),
        };

        let _ = contract.sign_up(
            &mut app,
            Addr::unchecked("0"),
            pubkey0.clone(),
            match_user_certificate(0).amount,
            match_user_certificate(0).certificate,
        );

        let _ = contract.sign_up(
            &mut app,
            Addr::unchecked("1"),
            pubkey1.clone(),
            match_user_certificate(1).amount,
            match_user_certificate(1).certificate,
        );

        assert_eq!(
            contract.num_sign_up(&app).unwrap(),
            Uint256::from_u128(2u128)
        );

        // assert_eq!(
        //     contract.signuped(&app, pubkey0.x).unwrap(),
        //     Uint256::from_u128(1u128)
        // );
        // assert_eq!(
        //     contract.signuped(&app, pubkey1.x).unwrap(),
        //     Uint256::from_u128(2u128)
        // );

        // Process logs data
        for entry in &logs_data {
            match entry.log_type.as_str() {
                // "setStateLeaf" => {
                //     let data: SetStateLeafData = deserialize_data(&entry.data);

                //     let pubkey = PubKey {
                //         x: uint256_from_decimal_string(&data.pub_key[0]),
                //         y: uint256_from_decimal_string(&data.pub_key[1]),
                //     };

                //     println!("pubkey: {:?}", pubkey);

                //     let leaf_idx: usize = data.leaf_idx.parse().unwrap();

                //     // Sign up user
                //     let is_whitelist = contract
                //         .query_is_whitelist(
                //             &app,
                //             leaf_idx.to_string(),
                //             match_user_certificate(leaf_idx).amount,
                //             match_user_certificate(leaf_idx).certificate,
                //         )
                //         .unwrap();
                //     println!("---------- is_whitelist: {:?}", is_whitelist);
                //     assert_eq!(true, is_whitelist);

                //     println!("---------- signup for user {} ----------", leaf_idx);
                //     let _ = contract.sign_up(
                //         &mut app,
                //         Addr::unchecked(leaf_idx.to_string()),
                //         pubkey,
                //         match_user_certificate(leaf_idx).amount,
                //         match_user_certificate(leaf_idx).certificate,
                //     );
                // }
                "publishMessage" => {
                    let data: PublishMessageData = deserialize_data(&entry.data);

                    let message = MessageData {
                        data: [
                            uint256_from_decimal_string(&data.message[0]),
                            uint256_from_decimal_string(&data.message[1]),
                            uint256_from_decimal_string(&data.message[2]),
                            uint256_from_decimal_string(&data.message[3]),
                            uint256_from_decimal_string(&data.message[4]),
                            uint256_from_decimal_string(&data.message[5]),
                            uint256_from_decimal_string(&data.message[6]),
                        ],
                    };

                    let enc_pub = PubKey {
                        x: uint256_from_decimal_string(&data.enc_pub_key[0]),
                        y: uint256_from_decimal_string(&data.enc_pub_key[1]),
                    };

                    println!("------- publishMessage ------");
                    _ = contract.publish_message(&mut app, user2(), message, enc_pub);
                }
                "processMessage" => {
                    let data: ProcessMessageData = deserialize_data(&entry.data);

                    // Move to processing phase
                    app.update_block(next_block); // Stop Voting

                    let sign_up_after_voting_end_error = contract
                        .sign_up(
                            &mut app,
                            Addr::unchecked(3.to_string()),
                            test_pubkey.clone(),
                            match_user_certificate(0).amount,
                            match_user_certificate(0).certificate,
                        )
                        .unwrap_err();
                    assert_eq!(
                        // Cannot signup after voting phase ends
                        ContractError::PeriodError {},
                        sign_up_after_voting_end_error.downcast().unwrap()
                    );

                    app.update_block(next_block);

                    _ = contract.start_process(&mut app, owner());
                    assert_eq!(
                        Period {
                            status: PeriodStatus::Processing
                        },
                        contract.get_period(&app).unwrap()
                    );

                    println!(
                        "after start process: {:?}",
                        contract.get_period(&app).unwrap()
                    );

                    let new_state_commitment =
                        uint256_from_decimal_string(&data.new_state_commitment);
                    let proof = Groth16ProofType {
                        a: data.proof.pi_a.clone(),
                        b: data.proof.pi_b.clone(),
                        c: data.proof.pi_c.clone(),
                    };
                    println!("process_message proof {:?}", proof);
                    println!(
                        "process_message new state commitment {:?}",
                        new_state_commitment
                    );
                    println!("------ processMessage ------");
                    _ = contract
                        .process_message(&mut app, owner(), new_state_commitment, proof)
                        .unwrap();
                }
                "processTally" => {
                    let data: ProcessTallyData = deserialize_data(&entry.data);

                    _ = contract.stop_processing(&mut app, owner());
                    println!(
                        "after stop process: {:?}",
                        contract.get_period(&app).unwrap()
                    );

                    let error_start_process_in_talling =
                        contract.start_process(&mut app, owner()).unwrap_err();
                    assert_eq!(
                        ContractError::PeriodError {},
                        error_start_process_in_talling.downcast().unwrap()
                    );
                    assert_eq!(
                        Period {
                            status: PeriodStatus::Tallying
                        },
                        contract.get_period(&app).unwrap()
                    );

                    let new_tally_commitment =
                        uint256_from_decimal_string(&data.new_tally_commitment);

                    let tally_proof = Groth16ProofType {
                        a: data.proof.pi_a.clone(),
                        b: data.proof.pi_b.clone(),
                        c: data.proof.pi_c.clone(),
                    };

                    _ = contract
                        .process_tally(&mut app, owner(), new_tally_commitment, tally_proof)
                        .unwrap();
                }
                "stopTallyingPeriod" => {
                    let data: StopTallyingPeriodData = deserialize_data(&entry.data);

                    let results: Vec<Uint256> = data
                        .results
                        .iter()
                        .map(|input| uint256_from_decimal_string(input))
                        .collect();

                    let salt = uint256_from_decimal_string(&data.salt);
                    _ = contract.stop_tallying(&mut app, owner(), results, salt);

                    let all_result = contract.get_all_result(&app);
                    println!("all_result: {:?}", all_result);
                    let error_start_process =
                        contract.start_process(&mut app, owner()).unwrap_err();
                    assert_eq!(
                        ContractError::PeriodError {},
                        error_start_process.downcast().unwrap()
                    );

                    assert_eq!(
                        Period {
                            status: PeriodStatus::Ended
                        },
                        contract.get_period(&app).unwrap()
                    );
                }
                _ => println!("Unknown log type: {}", entry.log_type),
            }
        }

        // Verify final state
        assert_eq!(
            contract.num_sign_up(&app).unwrap(),
            Uint256::from_u128(2u128)
        );

        assert_eq!(
            contract.msg_length(&app).unwrap(),
            Uint256::from_u128(2u128)
        );
    }

    // #[test]
    fn test_voting_power_calculation() {
        let slope = whitelist_slope();

        assert_eq!(slope, Uint256::from_u128(1000000u128));
        // 1 ATOM = 1 VC
        assert_eq!(
            Uint256::from_u128(1000000u128) / slope,
            Uint256::from_u128(1u128)
        );
        // 1.2 ATOM = 1 VC
        assert_eq!(
            Uint256::from_u128(1200000u128) / slope,
            Uint256::from_u128(1u128)
        );
        // 3 ATOM = 3 VC
        assert_eq!(
            Uint256::from_u128(3000000u128) / slope,
            Uint256::from_u128(3u128)
        );
        // 0.3 ATOM = 0 VC
        assert_eq!(
            Uint256::from_u128(300000u128) / slope,
            Uint256::from_u128(0u128)
        );
        // 0.9 ATOM = 0 VC
        assert_eq!(
            Uint256::from_u128(900000u128) / slope,
            Uint256::from_u128(0u128)
        );
        // 1.9 ATOM = 1 VC
        assert_eq!(
            Uint256::from_u128(1900000u128) / slope,
            Uint256::from_u128(1u128)
        );
        // 19000000000000000.099000 ATOM = 19000000000000000 VC
        assert_eq!(
            Uint256::from_u128(19000000000000000099000u128) / slope,
            Uint256::from_u128(19000000000000000u128)
        );
        assert_eq!(Uint256::from_u128(0u128) / slope, Uint256::from_u128(0u128));
    }

    #[test]
    fn instantiate_with_voting_time_isqv_with_no_signup_vote_should_works() {
        let msg_file_path = "./src/test/qv_test/msg.json";

        let mut msg_file = fs::File::open(msg_file_path).expect("Failed to open file");
        let mut msg_content = String::new();

        msg_file
            .read_to_string(&mut msg_content)
            .expect("Failed to read file");

        let data: MsgData = serde_json::from_str(&msg_content).expect("Failed to parse JSON");

        let result_file_path = "./src/test/qv_test/result.json";
        let mut result_file = fs::File::open(result_file_path).expect("Failed to open file");
        let mut result_content = String::new();
        result_file
            .read_to_string(&mut result_content)
            .expect("Failed to read file");

        let tally_path = "./src/test/qv_test/tally.json";
        let mut tally_file = fs::File::open(tally_path).expect("Failed to open file");
        let mut tally_content = String::new();
        tally_file
            .read_to_string(&mut tally_content)
            .expect("Failed to read file");

        let tally_data: TallyData =
            serde_json::from_str(&tally_content).expect("Failed to parse JSON");

        let pubkey_file_path = "./src/test/user_pubkey.json";

        let mut pubkey_file = fs::File::open(pubkey_file_path).expect("Failed to open file");
        let mut pubkey_content = String::new();

        pubkey_file
            .read_to_string(&mut pubkey_content)
            .expect("Failed to read file");

        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let label = "Group";

        let create_contract_with_wrong_circuit_type = code_id
            .instantiate_with_wrong_circuit_type(&mut app, owner(), label)
            .unwrap_err();
        assert_eq!(
            ContractError::UnsupportedCircuitType {},
            create_contract_with_wrong_circuit_type.downcast().unwrap()
        );

        let contract = code_id
            .instantiate_with_voting_time_isqv(&mut app, owner(), label)
            .unwrap();

        // assert_eq!(
        //     ContractError::AlreadySetVotingTime {
        //         time_name: String::from("start_time")
        //     },
        //     start_voting_error.downcast().unwrap()
        // );

        let num_sign_up = contract.num_sign_up(&app).unwrap();
        assert_eq!(num_sign_up, Uint256::from_u128(0u128));

        let vote_option_map = contract.vote_option_map(&app).unwrap();
        let max_vote_options = contract.max_vote_options(&app).unwrap();
        assert_eq!(vote_option_map, vec!["1", "2", "3", "4", "5"]);
        assert_eq!(max_vote_options, Uint256::from_u128(5u128));
        _ = contract.set_vote_option_map(&mut app, owner());
        let new_vote_option_map = contract.vote_option_map(&app).unwrap();
        assert_eq!(
            new_vote_option_map,
            vec![
                String::from("did_not_vote"),
                String::from("yes"),
                String::from("no"),
                String::from("no_with_veto"),
                String::from("abstain"),
            ]
        );
        // assert_eq!(num_sign_up, Uint256::from_u128(0u128));

        let test_pubkey = PubKey {
            x: uint256_from_decimal_string(&data.current_state_leaves[0][0]),
            y: uint256_from_decimal_string(&data.current_state_leaves[0][1]),
        };
        let sign_up_error = contract
            .sign_up(
                &mut app,
                Addr::unchecked(0.to_string()),
                test_pubkey.clone(),
                match_user_certificate(0).amount,
                match_user_certificate(0).certificate,
            )
            .unwrap_err();
        assert_eq!(
            ContractError::PeriodError {},
            sign_up_error.downcast().unwrap()
        ); // Cannot signup before voting phase

        _ = contract.set_vote_option_map(&mut app, owner());

        app.update_block(next_block); // Start Voting
        let set_vote_option_map_error =
            contract.set_vote_option_map(&mut app, owner()).unwrap_err();
        assert_eq!(
            ContractError::PeriodError {},
            set_vote_option_map_error.downcast().unwrap()
        );

        let error_start_process_in_voting = contract.start_process(&mut app, owner()).unwrap_err();
        assert_eq!(
            ContractError::PeriodError {},
            error_start_process_in_voting.downcast().unwrap()
        );
        assert_eq!(
            Period {
                status: PeriodStatus::Pending
            },
            contract.get_period(&app).unwrap()
        );

        // Stop Voting Period
        app.update_block(next_block);
        let results = vec![
            Uint256::from_u128(0u128),
            Uint256::from_u128(0u128),
            Uint256::from_u128(0u128),
            Uint256::from_u128(0u128),
            Uint256::from_u128(0u128),
        ];
        let salt = uint256_from_decimal_string(&tally_data.new_results_root_salt);
        _ = contract.start_process(&mut app, owner());
        _ = contract.stop_processing(&mut app, owner());
        _ = contract.stop_tallying(&mut app, owner(), results, salt);
        let all_result = contract.get_all_result(&app);
        println!("all_result: {:?}", all_result);
        let end_period = contract.get_period(&app).unwrap();
        println!("end_period: {:?}", end_period);
        // let error_start_process = contract.start_process(&mut app, owner()).unwrap_err();
        // assert_eq!(
        //     ContractError::PeriodError {},
        //     error_start_process.downcast().unwrap()
        // );

        assert_eq!(
            Period {
                status: PeriodStatus::Ended
            },
            contract.get_period(&app).unwrap()
        );
    }
}
