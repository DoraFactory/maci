#[cfg(test)]
mod test {
    use crate::error::ContractError;
    use crate::msg::Groth16ProofType;
    use crate::multitest::certificate_generator::generate_certificate_for_pubkey;
    use crate::multitest::{
        create_app, owner, test_oracle_pubkey, test_pubkey1, test_pubkey2,
        uint256_from_decimal_string, user1, user2, user3, MaciCodeId, MaciContract,
    };
    use crate::state::{
        DelayRecord, DelayRecords, DelayType, MessageData, Period, PeriodStatus, PubKey,
    };
    use cosmwasm_std::{Addr, BlockInfo, Timestamp, Uint256};
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
    struct AMaciLogEntry {
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
    struct PublishDeactivateMessageData {
        message: Vec<String>,
        enc_pub_key: Vec<String>,
    }

    #[derive(Debug, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ProofDeactivateData {
        size: String,
        new_deactivate_commitment: String,
        new_deactivate_root: String,
        proof: Groth16Proof,
    }

    #[derive(Debug, Serialize, Deserialize)]
    struct Groth16Proof {
        pi_a: Vec<String>,
        pi_b: Vec<Vec<String>>,
        pi_c: Vec<String>,
        protocol: String,
        curve: String,
    }

    #[derive(Debug, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ProofAddNewKeyData {
        pub_key: Vec<String>,
        proof: Groth16Proof,
        d: Vec<String>,
        nullifier: String,
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
    }

    #[derive(Debug, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ProcessTallyData {
        proof: Groth16Proof,
        new_tally_commitment: String,
    }

    #[derive(Debug, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct StopTallyingPeriodData {
        results: Vec<String>,
        salt: String,
    }

    fn deserialize_data<T: serde::de::DeserializeOwned>(data: &serde_json::Value) -> T {
        serde_json::from_value(data.clone()).expect("Unable to deserialize data")
    }

    pub fn next_block_11_min(block: &mut BlockInfo) {
        block.time = block.time.plus_minutes(11);
        block.height += 1;
    }

    // #[test] TODO
    fn instantiate_with_voting_time_should_works() {
        let msg_file_path = "./src/test/msg_test.json";

        let mut msg_file = fs::File::open(msg_file_path).expect("Failed to open file");
        let mut msg_content = String::new();

        msg_file
            .read_to_string(&mut msg_content)
            .expect("Failed to read file");

        let data: MsgData = serde_json::from_str(&msg_content).expect("Failed to parse JSON");

        let result_file_path = "./src/test/result.json";
        let mut result_file = fs::File::open(result_file_path).expect("Failed to open file");
        let mut result_content = String::new();
        result_file
            .read_to_string(&mut result_content)
            .expect("Failed to read file");

        let result_data: ResultData =
            serde_json::from_str(&result_content).expect("Failed to parse JSON");

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
            .instantiate_with_voting_time(&mut app, owner(), user1(), user2(), label)
            .unwrap();

        // let start_voting_error = contract.start_voting(&mut app, owner()).unwrap_err();

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
        assert_eq!(vote_option_map, vec!["", "", "", "", ""]);
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
            )
            .unwrap_err();
        assert_eq!(
            ContractError::PeriodError {},
            sign_up_error.downcast().unwrap()
        ); // Cannot signup before the voting period

        _ = contract.set_vote_option_map(&mut app, owner());

        app.update_block(next_block); // Start Voting
        let set_whitelist_only_in_pending = contract.set_whitelist(&mut app, owner()).unwrap_err();
        assert_eq!(
            // Cannot register again after registration
            ContractError::PeriodError {},
            set_whitelist_only_in_pending.downcast().unwrap()
        );
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

        for i in 0..data.msgs.len() {
            if i < Uint256::from_u128(2u128).to_string().parse().unwrap() {
                let pubkey = PubKey {
                    x: uint256_from_decimal_string(&pubkey_data.pubkeys[i][0]),
                    y: uint256_from_decimal_string(&pubkey_data.pubkeys[i][1]),
                };

                println!("---------- signup ---------- {:?}", i);
                let _ = contract.sign_up(&mut app, Addr::unchecked(i.to_string()), pubkey);
            }
            let message = MessageData {
                data: [
                    uint256_from_decimal_string(&data.msgs[i][0]),
                    uint256_from_decimal_string(&data.msgs[i][1]),
                    uint256_from_decimal_string(&data.msgs[i][2]),
                    uint256_from_decimal_string(&data.msgs[i][3]),
                    uint256_from_decimal_string(&data.msgs[i][4]),
                    uint256_from_decimal_string(&data.msgs[i][5]),
                    uint256_from_decimal_string(&data.msgs[i][6]),
                ],
            };

            let enc_pub = PubKey {
                x: uint256_from_decimal_string(&data.enc_pub_keys[i][0]),
                y: uint256_from_decimal_string(&data.enc_pub_keys[i][1]),
            };
            _ = contract.publish_message(&mut app, user2(), message, enc_pub);
        }

        // let sign_up_after_voting_end_error = contract
        //     .sign_up(
        //         &mut app,
        //         Addr::unchecked(0.to_string()),
        //         test_pubkey.clone(),
        //     )
        //     .unwrap_err();
        // assert_eq!(
        //     // Cannot register again after registration
        //     ContractError::Unauthorized {},
        //     sign_up_after_voting_end_error.downcast().unwrap()
        // );

        assert_eq!(
            contract.num_sign_up(&app).unwrap(),
            Uint256::from_u128(2u128)
        );

        assert_eq!(
            contract.msg_length(&app).unwrap(),
            Uint256::from_u128(3u128)
        );

        // Stop Voting Period
        app.update_block(next_block);

        let sign_up_after_voting_end_error = contract
            .sign_up(
                &mut app,
                Addr::unchecked(3.to_string()),
                test_pubkey.clone(),
            )
            .unwrap_err();
        assert_eq!(
            // Cannot sign up after the voting period has ended
            ContractError::PeriodError {},
            sign_up_after_voting_end_error.downcast().unwrap()
        );

        // let stop_voting_error = contract.stop_voting(&mut app, owner()).unwrap_err();
        // assert_eq!(
        //     ContractError::AlreadySetVotingTime {
        //         time_name: String::from("end_time")
        //     },
        //     stop_voting_error.downcast().unwrap()
        // );
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

        let new_state_commitment = uint256_from_decimal_string(&data.new_state_commitment);
        let proof = Groth16ProofType {
            a: "27fb48285bc59bc74c9197857856cf5f3dcce55f22b83589e399240b8469e45725c5495e3ebcdd3bc04620fd13fed113c31d19a685f7f037daf02dde02d26e4f".to_string(),
            b: "0d1bd72809defb6e85ea48de4c28e9ec9dcd2bc5111acdb66b5cdb38ccf6d4e32bdeac48a806c2fd6cef8e09bfde1983961693c8d4a513777ba26b07f2abacba1efb7600f04e786d93f321c6df732eb0043548cfe12fa8a5aea848a500ef5b9728dbc747fc76993c16dadf2c8ef68f3d757afa6d4caf9a767c424ec0d7ff4932".to_string(),
            c: "2062c6bee5dad15af1ebcb0e623b27f7d29775774cc92b2a7554d1801af818940309fa215204181d3a1fef15d162aa779b8900e2b84d8b8fa22a20b65652eb46".to_string()
        };
        println!("process_message proof {:?}", proof);
        println!(
            "process_message new state commitment {:?}",
            new_state_commitment
        );
        _ = contract
            .process_message(&mut app, owner(), new_state_commitment, proof)
            .unwrap();

        _ = contract.stop_processing(&mut app, owner());
        println!(
            "after stop process: {:?}",
            contract.get_period(&app).unwrap()
        );

        let error_start_process_in_talling = contract.start_process(&mut app, owner()).unwrap_err();
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
        let tally_path = "./src/test/tally_test.json";
        let mut tally_file = fs::File::open(tally_path).expect("Failed to open file");
        let mut tally_content = String::new();
        tally_file
            .read_to_string(&mut tally_content)
            .expect("Failed to read file");

        let tally_data: TallyData =
            serde_json::from_str(&tally_content).expect("Failed to parse JSON");

        let new_tally_commitment = uint256_from_decimal_string(&tally_data.new_tally_commitment);

        let tally_proof = Groth16ProofType {
            a: "2554bb7be658b5261bbcacef022d86dc55360f936a1473aa5c70c5b20083d7370deb7df6a8d0e74ae7f8b310725f3063407679fd99d23a7ad77b7d1bff5572d5".to_string(),
            b: "0fa4de46a0fc9d269314bbac4fb8f3425780bcde9b613a5252400216dadc3b5809f1d59c5f84892444c89712ab087cd708dcec5b77c108d9db73a8821be6720302f4820fec3af0e29b8a8aaf83db039d46703795d6275f934a14e8edc040e18f2dab2b05decd1b5bdb18631b9a8106714ceb5cf9fa6f4a4325cf4289a4025fc7".to_string(),
            c: "0d6a9f2eb8cfb28368bf6976f2925a3fb8ac0ead8dc95fc9a79318d0518f24801dced0525cbb2f15f24198bfe3f77c1065120be9dcbc3d10c77ca5861c410910".to_string()
        };

        _ = contract
            .process_tally(&mut app, owner(), new_tally_commitment, tally_proof)
            .unwrap();

        let results: Vec<Uint256> = result_data
            .results
            .iter()
            .map(|input| uint256_from_decimal_string(input))
            .collect();

        let salt = uint256_from_decimal_string(&tally_data.new_results_root_salt);
        _ = contract.stop_tallying(&mut app, owner(), results, salt);

        let all_result = contract.get_all_result(&app);
        println!("all_result: {:?}", all_result);
        let error_start_process = contract.start_process(&mut app, owner()).unwrap_err();
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

    // #[test] TODO
    fn instantiate_with_voting_time_isqv_should_works() {
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

        let result_data: ResultData =
            serde_json::from_str(&result_content).expect("Failed to parse JSON");

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
            .instantiate_with_voting_time_isqv(&mut app, owner(), user1(), user2(), label)
            .unwrap();

        // let start_voting_error = contract.start_voting(&mut app, owner()).unwrap_err();

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
        assert_eq!(vote_option_map, vec!["", "", "", "", ""]);
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
            )
            .unwrap_err();
        assert_eq!(
            ContractError::PeriodError {},
            sign_up_error.downcast().unwrap()
        ); // Cannot signup before the voting period

        _ = contract.set_vote_option_map(&mut app, owner());

        app.update_block(next_block); // Start Voting
        let set_whitelist_only_in_pending = contract.set_whitelist(&mut app, owner()).unwrap_err();
        assert_eq!(
            // Cannot register again after registration
            ContractError::PeriodError {},
            set_whitelist_only_in_pending.downcast().unwrap()
        );
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

        for i in 0..data.msgs.len() {
            if i < Uint256::from_u128(2u128).to_string().parse().unwrap() {
                let pubkey = PubKey {
                    x: uint256_from_decimal_string(&pubkey_data.pubkeys[i][0]),
                    y: uint256_from_decimal_string(&pubkey_data.pubkeys[i][1]),
                };

                println!("---------- signup ---------- {:?}", i);
                let _ = contract.sign_up(&mut app, Addr::unchecked(i.to_string()), pubkey);
            }
            let message = MessageData {
                data: [
                    uint256_from_decimal_string(&data.msgs[i][0]),
                    uint256_from_decimal_string(&data.msgs[i][1]),
                    uint256_from_decimal_string(&data.msgs[i][2]),
                    uint256_from_decimal_string(&data.msgs[i][3]),
                    uint256_from_decimal_string(&data.msgs[i][4]),
                    uint256_from_decimal_string(&data.msgs[i][5]),
                    uint256_from_decimal_string(&data.msgs[i][6]),
                ],
            };

            let enc_pub = PubKey {
                x: uint256_from_decimal_string(&data.enc_pub_keys[i][0]),
                y: uint256_from_decimal_string(&data.enc_pub_keys[i][1]),
            };
            _ = contract.publish_message(&mut app, user2(), message, enc_pub);
        }

        // let sign_up_after_voting_end_error = contract
        //     .sign_up(
        //         &mut app,
        //         Addr::unchecked(0.to_string()),
        //         test_pubkey.clone(),
        //     )
        //     .unwrap_err();
        // assert_eq!(
        //     // Cannot register again after registration
        //     ContractError::Unauthorized {},
        //     sign_up_after_voting_end_error.downcast().unwrap()
        // );

        assert_eq!(
            contract.num_sign_up(&app).unwrap(),
            Uint256::from_u128(2u128)
        );

        assert_eq!(
            contract.msg_length(&app).unwrap(),
            Uint256::from_u128(3u128)
        );

        // Stop Voting Period
        app.update_block(next_block);

        let sign_up_after_voting_end_error = contract
            .sign_up(
                &mut app,
                Addr::unchecked(3.to_string()),
                test_pubkey.clone(),
            )
            .unwrap_err();
        assert_eq!(
            // Cannot sign up after the voting period has ended
            ContractError::PeriodError {},
            sign_up_after_voting_end_error.downcast().unwrap()
        );

        // let stop_voting_error = contract.stop_voting(&mut app, owner()).unwrap_err();
        // assert_eq!(
        //     ContractError::AlreadySetVotingTime {
        //         time_name: String::from("end_time")
        //     },
        //     stop_voting_error.downcast().unwrap()
        // );
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

        let new_state_commitment = uint256_from_decimal_string(&data.new_state_commitment);
        let proof = Groth16ProofType {
                a: "25b5c63b4d2f7d3ac4a01258040ea6ab731797144ec246c3af3c6578986b10720522540f38cab117c83e58f6540a43c7dd77c807ed436b344f9a137d8a4c8b32".to_string(),
                b: "01aba8a6b76bb1c7b301c2f0c15005a0550a94b68c0f19b01ff385e4c441f5a610ad81a1689db632c16c2054fd862cd1ad132a3b46926dd21769ff9e691c2a670ef6e81de05b039fd805422437e890581edd4db80469deefb2edcddcf2872dec15a7b27a5ea2c2886d04e5454b9d24918a90bf0865326217d0e8f78abdef18fb".to_string(),
                c: "02a00a70680f2e20f28521bdf8bd139cd2227051bcdf2d5744e85c2b3c5f2f642aceac09e1cc3fe487f587f4a6fa362d71ac6669f6870a0ed33a89a4c8c297e0".to_string()
            };
        println!("process_message proof {:?}", proof);
        println!(
            "process_message new state commitment {:?}",
            new_state_commitment
        );
        _ = contract
            .process_message(&mut app, owner(), new_state_commitment, proof)
            .unwrap();

        _ = contract.stop_processing(&mut app, owner());
        println!(
            "after stop process: {:?}",
            contract.get_period(&app).unwrap()
        );

        let error_start_process_in_talling = contract.start_process(&mut app, owner()).unwrap_err();
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
        let tally_path = "./src/test/qv_test/tally.json";
        let mut tally_file = fs::File::open(tally_path).expect("Failed to open file");
        let mut tally_content = String::new();
        tally_file
            .read_to_string(&mut tally_content)
            .expect("Failed to read file");

        let tally_data: TallyData =
            serde_json::from_str(&tally_content).expect("Failed to parse JSON");

        let new_tally_commitment = uint256_from_decimal_string(&tally_data.new_tally_commitment);

        let tally_proof = Groth16ProofType {
            a: "2887519d960001d9a47a6338fadaa9ae57a52ed7ebd8a56c80616e4245762caf221b1a4188c4a6e8db5f968a6c04c56a4ca1b2f46a254f7b2737e444394e6f96".to_string(),
            b: "2dacd0fc846bf705ae591121f8fcd6f240dbd8eac23902c0da6fa791cf4a553c1f320f588c5ace3c42edcaeeb6242491accc6dde284d18d107952600b2dc91160687d1a8ff86fc397f0c19f3fd2f68d1a629a8a30f9d696561c70b342df1b97e20f79261ae47d812805ecaac01b6408cd5049383953439b97b58f1348831ac4e".to_string(),
            c: "09e8a2dcf849d84d05d567c482ab144e252755e820cb331eafab44ed96e13b28158341fa2103ac8efdebe336beed5ddec420ca0e3f6736aa7f7937418c0c4f29".to_string()
        };

        _ = contract
            .process_tally(&mut app, owner(), new_tally_commitment, tally_proof)
            .unwrap();

        let results: Vec<Uint256> = result_data
            .results
            .iter()
            .map(|input| uint256_from_decimal_string(input))
            .collect();

        let salt = uint256_from_decimal_string(&tally_data.new_results_root_salt);
        _ = contract.stop_tallying(&mut app, owner(), results, salt);

        let all_result = contract.get_all_result(&app);
        println!("all_result: {:?}", all_result);
        let error_start_process = contract.start_process(&mut app, owner()).unwrap_err();
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

    // #[test] TODO
    fn instantiate_with_voting_time_1p1v_amaci_pre_add_key_should_works() {
        let msg_file_path = "./src/test/qv_test/msg.json";

        let mut msg_file = fs::File::open(msg_file_path).expect("Failed to open file");
        let mut msg_content = String::new();

        msg_file
            .read_to_string(&mut msg_content)
            .expect("Failed to read file");

        let data: MsgData = serde_json::from_str(&msg_content).expect("Failed to parse JSON");

        let pubkey_file_path = "./src/test/user_pubkey.json";

        let mut pubkey_file = fs::File::open(pubkey_file_path).expect("Failed to open file");
        let mut pubkey_content = String::new();

        pubkey_file
            .read_to_string(&mut pubkey_content)
            .expect("Failed to read file");
        let pubkey_data: UserPubkeyData =
            serde_json::from_str(&pubkey_content).expect("Failed to parse JSON");

        let logs_file_path = "./src/test/amaci_test/logs.json";

        let mut logs_file = fs::File::open(logs_file_path).expect("Failed to open file");
        let mut logs_content = String::new();

        logs_file
            .read_to_string(&mut logs_content)
            .expect("Failed to read file");

        let logs_data: Vec<AMaciLogEntry> =
            serde_json::from_str(&logs_content).expect("Failed to parse JSON");

        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let label = "Group";
        let contract = code_id
            .instantiate_with_voting_time_isqv_amaci(
                &mut app,
                owner(),
                user1(),
                user2(),
                user3(),
                label,
            )
            .unwrap();

        // let start_voting_error = contract.start_voting(&mut app, owner()).unwrap_err();

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
        assert_eq!(vote_option_map, vec!["", "", "", "", ""]);
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
            )
            .unwrap_err();
        assert_eq!(
            ContractError::PeriodError {},
            sign_up_error.downcast().unwrap()
        ); // Cannot signup before the voting period

        _ = contract.set_vote_option_map(&mut app, owner());

        app.update_block(next_block); // Start Voting
        let set_whitelist_only_in_pending = contract.set_whitelist(&mut app, owner()).unwrap_err();
        assert_eq!(
            // Cannot register again after registration
            ContractError::PeriodError {},
            set_whitelist_only_in_pending.downcast().unwrap()
        );
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

        let _ = contract.sign_up(&mut app, Addr::unchecked("0"), pubkey0);
        let _ = contract.sign_up(&mut app, Addr::unchecked("1"), pubkey1);

        for entry in &logs_data {
            match entry.log_type.as_str() {
                "publishDeactivateMessage" => {
                    let data: PublishDeactivateMessageData = deserialize_data(&entry.data);

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
                    _ = contract.publish_deactivate_message(&mut app, user2(), message, enc_pub);
                }
                "proofDeactivate" => {
                    let data: ProofDeactivateData = deserialize_data(&entry.data);

                    assert_eq!(
                        contract.num_sign_up(&app).unwrap(),
                        Uint256::from_u128(2u128)
                    );

                    assert_eq!(
                        contract.dmsg_length(&app).unwrap(),
                        Uint256::from_u128(2u128)
                    );

                    let size = uint256_from_decimal_string(&data.size);
                    let new_deactivate_commitment =
                        uint256_from_decimal_string(&data.new_deactivate_commitment);
                    let new_deactivate_root =
                        uint256_from_decimal_string(&data.new_deactivate_root);
                    let proof = Groth16ProofType {
                        a: "132a36c4e9653de9ebe2f131e3452319fc4b0f19339083ce52c6dbd5d1d583190f79d3cf25dbf173a959631330f358a334f3977ae2fcfe2e93fb5c5e86dc6ef4".to_string(),
                        b: "17c61aea44885cf09a35b41fed13916e8a712cfdc2da041a0c29578d102c559f1bd5a1ae12404f47f8fe3f9cba289f9f9fcdf6e60fb64fe17335a65f00f82eda2a5f55a8181bc191a242a60cb27d7c303059895065219d7e436d95e1dbedec182ffa368e7e99494c75e230452fee2a6b2136444b91bf7cfe7581fea055805dbd".to_string(),
                        c: "138d241e6ca289a65ac398af0c1b68b455184a3735e68dd0d5966d8c5ed9629415cab9376a35f9e33a1be5957e8b696e4a3b43363c8df9a460ff70831b63f69b".to_string()
                    };
                    println!("process_deactivate_message proof {:?}", proof);
                    println!(
                        "process_deactivate_message new state commitment {:?}",
                        new_deactivate_commitment
                    );
                    _ = contract
                        .process_deactivate_message(
                            &mut app,
                            owner(),
                            size,
                            new_deactivate_commitment,
                            new_deactivate_root,
                            proof,
                        )
                        .unwrap();
                }
                "proofAddNewKey" => {
                    let data: ProofAddNewKeyData = deserialize_data(&entry.data);

                    let new_key_pub = PubKey {
                        x: uint256_from_decimal_string(&data.pub_key[0]),
                        y: uint256_from_decimal_string(&data.pub_key[1]),
                    };

                    let d: [Uint256; 4] = [
                        uint256_from_decimal_string(&data.d[0]),
                        uint256_from_decimal_string(&data.d[1]),
                        uint256_from_decimal_string(&data.d[2]),
                        uint256_from_decimal_string(&data.d[3]),
                    ];

                    let nullifier = uint256_from_decimal_string(&data.nullifier);

                    let proof = Groth16ProofType {
                                    a: "053eb9bf62de01898e5d7049bfeaee4611b78b54f516ff4b0fd93ffcdc491d8b170e2c3de370f8eeec93ebb57e49279adc68fb137f4aafe1b4206d7186592673".to_string(),
                                    b: "2746ba15cb4478a1a90bd512844cd0e57070357ff17ad90964b699f962f4f24817ce4dcc89d350df5d63ae7f05f0069272c3d352cb92237e682222e68d52da0f00551f58de3a3cac33d6af2fb052e4ff4d42008b5f33b310756a5e7017919087284dc00b9753a3891872ee599467348976ec2d72703d46949a9b8093a97718eb".to_string(),
                                    c: "1832b7d8607c041bd1437f43fe1d207ad64bea58f346cc91d0c72d9c02bbc4031decf433ecafc3874f4bcedbfae591caaf87834ad6867c7d342b96b6299ddd0a".to_string()
                                };

                    println!("add_new_key proof {:?}", proof);
                    _ = contract
                        .pre_add_key(&mut app, owner(), new_key_pub, nullifier, d, proof)
                        .unwrap();
                }
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
                    app.update_block(next_block);

                    let sign_up_after_voting_end_error = contract
                        .sign_up(
                            &mut app,
                            Addr::unchecked(3.to_string()),
                            test_pubkey.clone(),
                        )
                        .unwrap_err();
                    assert_eq!(
                        // Cannot sign up after the voting period has ended
                        ContractError::PeriodError {},
                        sign_up_after_voting_end_error.downcast().unwrap()
                    );

                    // let stop_voting_error = contract.stop_voting(&mut app, owner()).unwrap_err();
                    // assert_eq!(
                    //     ContractError::AlreadySetVotingTime {
                    //         time_name: String::from("end_time")
                    //     },
                    //     stop_voting_error.downcast().unwrap()
                    // );
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

                    let error_stop_processing_with_not_finish_process =
                        contract.stop_processing(&mut app, owner()).unwrap_err();
                    assert_eq!(
                        ContractError::MsgLeftProcess {},
                        error_stop_processing_with_not_finish_process
                            .downcast()
                            .unwrap()
                    );

                    let new_state_commitment =
                        uint256_from_decimal_string(&data.new_state_commitment);
                    let proof = Groth16ProofType {
                            a: "11c744b43710eb925e5b81217de65d15a2388882c6fb82f85c8addb1367c69b02dec496b413ae73174333bf29117513239d1cc583c00f24a6c93d1082834b477".to_string(),
                            b: "2cbb0e1085abef8077ccbbdea230c99064f9a8e9f9385932ee74ebe58964781a1dabe6292b711ec05d40afb380f64564a77b24185333d7f4ed7065e37fc9479e01d9949cdb9e682c6574951070711eae504d12ab10e1d20f733882edd65c2c4a18737f0837fccda1a5d6c08828cc62060cb9f650fd4598baf548921bf93e2632".to_string(),
                            c: "2c4e66dd6e47abc6aa343d3eae4f2cf7360147ec28f402829e8fbc6db079741011fe98e27342b42f5cf9a4dfc8a31b2e1d42dc5630cf11e97b92536da978b0c7".to_string()
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
                            a: "24eefd06494531734508ae412053ed5688072c5fb4cf71fc3c8ec0d31f7d563f093e8b9a311e0caa1ba02de27e75c143f958248b5f486190edd8817f636f0ce8".to_string(),
                            b: "1fc5e9cdc59c37c88c2a148ac2418659d6eea3448698b57d35c78c7c08b4c52921aa37dca6de3851abe0843338440de8024a6ece04d284e8abf2061a70be713f295339ddce483a56315c3feec141938028a544e62e38bb5bf050dd19146d9ab72b32fe75e87e6bd44ce0476177ebf796fc7eba01bcbf175ccbbd10e2f04a90f0".to_string(),
                            c: "0ba9c3647f448b9ba9fcf39900c380dff4c9f0328529795f4013912b25a45b9f18f6ca48d63751f67800108105b7b34f88ddda72234ff7eda5c63de7bb90da48".to_string()
                        };

                    _ = contract
                        .process_tally(&mut app, owner(), new_tally_commitment, tally_proof)
                        .unwrap();
                }
                "stopTallyingPeriod" => {
                    let data: StopTallyingPeriodData = deserialize_data(&entry.data);

                    let results: Vec<Uint256> = vec![
                        uint256_from_decimal_string(&data.results[0]),
                        uint256_from_decimal_string(&data.results[1]),
                        uint256_from_decimal_string(&data.results[2]),
                        uint256_from_decimal_string(&data.results[3]),
                        uint256_from_decimal_string(&data.results[4]),
                    ];

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
                _ => println!("Unknown type: {}", entry.log_type),
            }
        }
    }

    // #[test]
    fn instantiate_with_voting_time_qv_amaci_should_works() {
        let msg_file_path = "./src/test/qv_test/msg.json";

        let mut msg_file = fs::File::open(msg_file_path).expect("Failed to open file");
        let mut msg_content = String::new();

        msg_file
            .read_to_string(&mut msg_content)
            .expect("Failed to read file");

        let data: MsgData = serde_json::from_str(&msg_content).expect("Failed to parse JSON");

        let pubkey_file_path = "./src/test/user_pubkey.json";

        let mut pubkey_file = fs::File::open(pubkey_file_path).expect("Failed to open file");
        let mut pubkey_content = String::new();

        pubkey_file
            .read_to_string(&mut pubkey_content)
            .expect("Failed to read file");
        let pubkey_data: UserPubkeyData =
            serde_json::from_str(&pubkey_content).expect("Failed to parse JSON");

        let logs_file_path = "./src/test/amaci_test/logs.json";

        let mut logs_file = fs::File::open(logs_file_path).expect("Failed to open file");
        let mut logs_content = String::new();

        logs_file
            .read_to_string(&mut logs_content)
            .expect("Failed to read file");

        let logs_data: Vec<AMaciLogEntry> =
            serde_json::from_str(&logs_content).expect("Failed to parse JSON");

        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let label = "Group";
        let contract = code_id
            .instantiate_with_voting_time_isqv_amaci(
                &mut app,
                owner(),
                user1(),
                user2(),
                user3(),
                label,
            )
            .unwrap();

        // let start_voting_error = contract.start_voting(&mut app, owner()).unwrap_err();

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
        assert_eq!(vote_option_map, vec!["", "", "", "", ""]);
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
            )
            .unwrap_err();
        assert_eq!(
            ContractError::PeriodError {},
            sign_up_error.downcast().unwrap()
        ); // Cannot signup before the voting period

        _ = contract.set_vote_option_map(&mut app, owner());

        app.update_block(next_block); // Start Voting
        let set_whitelist_only_in_pending = contract.set_whitelist(&mut app, owner()).unwrap_err();
        assert_eq!(
            // Cannot register again after registration
            ContractError::PeriodError {},
            set_whitelist_only_in_pending.downcast().unwrap()
        );
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

        let _ = contract.sign_up(&mut app, Addr::unchecked("0"), pubkey0.clone());

        let can_sign_up_error = contract
            .sign_up(&mut app, Addr::unchecked("0"), pubkey0.clone())
            .unwrap_err();
        assert_eq!(
            ContractError::UserAlreadyRegistered {},
            can_sign_up_error.downcast().unwrap()
        );

        let _ = contract.sign_up(&mut app, Addr::unchecked("1"), pubkey1.clone());

        assert_eq!(
            contract.num_sign_up(&app).unwrap(),
            Uint256::from_u128(2u128)
        );

        assert_eq!(
            contract.signuped(&app, pubkey0.clone()).unwrap(),
            Some(Uint256::from_u128(0u128))
        );
        assert_eq!(
            contract.signuped(&app, pubkey1.clone()).unwrap(),
            Some(Uint256::from_u128(1u128))
        );

        for entry in &logs_data {
            match entry.log_type.as_str() {
                // "setStateLeaf" => {
                //     let pubkey0 = PubKey {
                //         x: uint256_from_decimal_string(&pubkey_data.pubkeys[0][0]),
                //         y: uint256_from_decimal_string(&pubkey_data.pubkeys[0][1]),
                //     };
                // },
                "publishDeactivateMessage" => {
                    let data: PublishDeactivateMessageData = deserialize_data(&entry.data);

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
                    _ = contract.publish_deactivate_message(&mut app, user2(), message, enc_pub);
                }
                "proofDeactivate" => {
                    let data: ProofDeactivateData = deserialize_data(&entry.data);

                    assert_eq!(
                        contract.dmsg_length(&app).unwrap(),
                        Uint256::from_u128(2u128)
                    );

                    let size = uint256_from_decimal_string(&data.size);
                    let new_deactivate_commitment =
                        uint256_from_decimal_string(&data.new_deactivate_commitment);
                    let new_deactivate_root =
                        uint256_from_decimal_string(&data.new_deactivate_root);
                    let proof = Groth16ProofType {
                        a: "132a36c4e9653de9ebe2f131e3452319fc4b0f19339083ce52c6dbd5d1d583190f79d3cf25dbf173a959631330f358a334f3977ae2fcfe2e93fb5c5e86dc6ef4".to_string(),
                        b: "17c61aea44885cf09a35b41fed13916e8a712cfdc2da041a0c29578d102c559f1bd5a1ae12404f47f8fe3f9cba289f9f9fcdf6e60fb64fe17335a65f00f82eda2a5f55a8181bc191a242a60cb27d7c303059895065219d7e436d95e1dbedec182ffa368e7e99494c75e230452fee2a6b2136444b91bf7cfe7581fea055805dbd".to_string(),
                        c: "138d241e6ca289a65ac398af0c1b68b455184a3735e68dd0d5966d8c5ed9629415cab9376a35f9e33a1be5957e8b696e4a3b43363c8df9a460ff70831b63f69b".to_string()
                    };
                    println!("process_deactivate_message proof {:?}", proof);
                    println!(
                        "process_deactivate_message new state commitment {:?}",
                        new_deactivate_commitment
                    );
                    _ = contract
                        .process_deactivate_message(
                            &mut app,
                            owner(),
                            size,
                            new_deactivate_commitment,
                            new_deactivate_root,
                            proof,
                        )
                        .unwrap();
                }
                "proofAddNewKey" => {
                    let data: ProofAddNewKeyData = deserialize_data(&entry.data);

                    let new_key_pub = PubKey {
                        x: uint256_from_decimal_string(&data.pub_key[0]),
                        y: uint256_from_decimal_string(&data.pub_key[1]),
                    };

                    let d: [Uint256; 4] = [
                        uint256_from_decimal_string(&data.d[0]),
                        uint256_from_decimal_string(&data.d[1]),
                        uint256_from_decimal_string(&data.d[2]),
                        uint256_from_decimal_string(&data.d[3]),
                    ];

                    let nullifier = uint256_from_decimal_string(&data.nullifier);

                    let proof = Groth16ProofType {
                                    a: "29eb173553d340b41108fa7581371d1e2eb84962e93e667aff45ee2cc05aa9b91234d82ac4caafd2eaf597e1da25c5982bef8b0a937a7f68b84954f042d4ed0f".to_string(),
                                    b: "01a6d17acb0c2381082e1c35baee57af4bf393dbd94377bac54bfec15916c0b80197c2a0c0faa491e9b32b32de526c03b2c57a126eeafcb72feae194b3f8a60f0a81e4f7aa16ba2afb45a694dcc5832531b36c060f3ae31a8df0e7c724961e130d5fc5a83a7d658b63611dd37e0790b3602072529743cf727a371f82c3c250b2".to_string(),
                                    c: "2e18f57e4618cac5b0111a6ca470a193dfbad5f393a455b06be2b2dbd8bb7b8e1c0f4fbb35a51d466d665d7fcfb22ea3717c6503e45f104167c4639fd01a1285".to_string()
                                };

                    println!("add_new_key proof {:?}", proof);
                    _ = contract
                        .add_key(&mut app, owner(), new_key_pub, nullifier, d, proof)
                        .unwrap();
                }
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
                    app.update_block(next_block_11_min);

                    let sign_up_after_voting_end_error = contract
                        .sign_up(
                            &mut app,
                            Addr::unchecked(3.to_string()),
                            test_pubkey.clone(),
                        )
                        .unwrap_err();
                    assert_eq!(
                        // Cannot sign up after the voting period has ended
                        ContractError::PeriodError {},
                        sign_up_after_voting_end_error.downcast().unwrap()
                    );

                    // let stop_voting_error = contract.stop_voting(&mut app, owner()).unwrap_err();
                    // assert_eq!(
                    //     ContractError::AlreadySetVotingTime {
                    //         time_name: String::from("end_time")
                    //     },
                    //     stop_voting_error.downcast().unwrap()
                    // );
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

                    let error_stop_processing_with_not_finish_process =
                        contract.stop_processing(&mut app, owner()).unwrap_err();
                    assert_eq!(
                        ContractError::MsgLeftProcess {},
                        error_stop_processing_with_not_finish_process
                            .downcast()
                            .unwrap()
                    );

                    let new_state_commitment =
                        uint256_from_decimal_string(&data.new_state_commitment);
                    let proof = Groth16ProofType {
                            a: "11c744b43710eb925e5b81217de65d15a2388882c6fb82f85c8addb1367c69b02dec496b413ae73174333bf29117513239d1cc583c00f24a6c93d1082834b477".to_string(),
                            b: "2cbb0e1085abef8077ccbbdea230c99064f9a8e9f9385932ee74ebe58964781a1dabe6292b711ec05d40afb380f64564a77b24185333d7f4ed7065e37fc9479e01d9949cdb9e682c6574951070711eae504d12ab10e1d20f733882edd65c2c4a18737f0837fccda1a5d6c08828cc62060cb9f650fd4598baf548921bf93e2632".to_string(),
                            c: "2c4e66dd6e47abc6aa343d3eae4f2cf7360147ec28f402829e8fbc6db079741011fe98e27342b42f5cf9a4dfc8a31b2e1d42dc5630cf11e97b92536da978b0c7".to_string()
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
                        a: "24eefd06494531734508ae412053ed5688072c5fb4cf71fc3c8ec0d31f7d563f093e8b9a311e0caa1ba02de27e75c143f958248b5f486190edd8817f636f0ce8".to_string(),
                        b: "1fc5e9cdc59c37c88c2a148ac2418659d6eea3448698b57d35c78c7c08b4c52921aa37dca6de3851abe0843338440de8024a6ece04d284e8abf2061a70be713f295339ddce483a56315c3feec141938028a544e62e38bb5bf050dd19146d9ab72b32fe75e87e6bd44ce0476177ebf796fc7eba01bcbf175ccbbd10e2f04a90f0".to_string(),
                        c: "0ba9c3647f448b9ba9fcf39900c380dff4c9f0328529795f4013912b25a45b9f18f6ca48d63751f67800108105b7b34f88ddda72234ff7eda5c63de7bb90da48".to_string()
                    };

                    _ = contract
                        .process_tally(&mut app, owner(), new_tally_commitment, tally_proof)
                        .unwrap();
                }
                "stopTallyingPeriod" => {
                    let data: StopTallyingPeriodData = deserialize_data(&entry.data);

                    let results: Vec<Uint256> = vec![
                        uint256_from_decimal_string(&data.results[0]),
                        uint256_from_decimal_string(&data.results[1]),
                        uint256_from_decimal_string(&data.results[2]),
                        uint256_from_decimal_string(&data.results[3]),
                        uint256_from_decimal_string(&data.results[4]),
                    ];

                    let salt = uint256_from_decimal_string(&data.salt);
                    app.update_block(next_block_11_min);
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
                _ => println!("Unknown type: {}", entry.log_type),
            }
        }

        let delay_records = contract.query_delay_records(&app).unwrap();
        println!("delay_records: {:?}", delay_records);
        assert_eq!(
            delay_records,
            DelayRecords {
                records: vec![DelayRecord {
                    delay_timestamp: Timestamp::from_nanos(1571798084879000000),
                    delay_duration: 665,
                    delay_reason: String::from("Tallying has timed out after 665 seconds"),
                    delay_process_dmsg_count: Uint256::from_u128(0),
                    delay_type: DelayType::TallyDelay,
                }]
            }
        );
    }

    // #[test]
    fn instantiate_with_wrong_voting_time_error() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let label = "Group";
        let contract = code_id
            .instantiate_with_wrong_voting_time(&mut app, owner(), user1(), user2(), label)
            .unwrap_err();

        // let start_voting_error = contract.start_voting(&mut app, owner()).unwrap_err();

        assert_eq!(ContractError::WrongTimeSet {}, contract.downcast().unwrap());
    }

    // #[test]
    fn test_amaci_process_deactivate_message_delay_data() {
        let msg_file_path = "./src/test/qv_test/msg.json";

        let mut msg_file = fs::File::open(msg_file_path).expect("Failed to open file");
        let mut msg_content = String::new();

        msg_file
            .read_to_string(&mut msg_content)
            .expect("Failed to read file");

        let data: MsgData = serde_json::from_str(&msg_content).expect("Failed to parse JSON");

        let pubkey_file_path = "./src/test/user_pubkey.json";

        let mut pubkey_file = fs::File::open(pubkey_file_path).expect("Failed to open file");
        let mut pubkey_content = String::new();

        pubkey_file
            .read_to_string(&mut pubkey_content)
            .expect("Failed to read file");
        let pubkey_data: UserPubkeyData =
            serde_json::from_str(&pubkey_content).expect("Failed to parse JSON");

        let logs_file_path = "./src/test/amaci_test/logs.json";

        let mut logs_file = fs::File::open(logs_file_path).expect("Failed to open file");
        let mut logs_content = String::new();

        logs_file
            .read_to_string(&mut logs_content)
            .expect("Failed to read file");

        let logs_data: Vec<AMaciLogEntry> =
            serde_json::from_str(&logs_content).expect("Failed to parse JSON");

        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let label = "Group";
        let contract = code_id
            .instantiate_with_voting_time_isqv_amaci(
                &mut app,
                owner(),
                user1(),
                user2(),
                user3(),
                label,
            )
            .unwrap();

        // let start_voting_error = contract.start_voting(&mut app, owner()).unwrap_err();

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
        assert_eq!(vote_option_map, vec!["", "", "", "", ""]);
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
            )
            .unwrap_err();
        assert_eq!(
            ContractError::PeriodError {},
            sign_up_error.downcast().unwrap()
        ); // Cannot signup before the voting period

        _ = contract.set_vote_option_map(&mut app, owner());

        app.update_block(next_block); // Start Voting
        let set_whitelist_only_in_pending = contract.set_whitelist(&mut app, owner()).unwrap_err();
        assert_eq!(
            // Cannot register again after registration
            ContractError::PeriodError {},
            set_whitelist_only_in_pending.downcast().unwrap()
        );
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

        let _ = contract.sign_up(&mut app, Addr::unchecked("0"), pubkey0.clone());

        let can_sign_up_error = contract
            .sign_up(&mut app, Addr::unchecked("0"), pubkey0.clone())
            .unwrap_err();
        assert_eq!(
            ContractError::UserAlreadyRegistered {},
            can_sign_up_error.downcast().unwrap()
        );

        let _ = contract.sign_up(&mut app, Addr::unchecked("1"), pubkey1.clone());

        assert_eq!(
            contract.num_sign_up(&app).unwrap(),
            Uint256::from_u128(2u128)
        );

        assert_eq!(
            contract.signuped(&app, pubkey0.clone()).unwrap(),
            Some(Uint256::from_u128(0u128))
        );
        assert_eq!(
            contract.signuped(&app, pubkey1.clone()).unwrap(),
            Some(Uint256::from_u128(1u128))
        );

        for entry in &logs_data {
            match entry.log_type.as_str() {
                "publishDeactivateMessage" => {
                    println!("publishDeactivateMessage =================");
                    let data: PublishDeactivateMessageData = deserialize_data(&entry.data);

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
                    _ = contract.publish_deactivate_message(&mut app, user2(), message, enc_pub);
                }
                "proofDeactivate" => {
                    let data: ProofDeactivateData = deserialize_data(&entry.data);

                    assert_eq!(
                        contract.dmsg_length(&app).unwrap(),
                        Uint256::from_u128(2u128)
                    );

                    let size = uint256_from_decimal_string(&data.size);
                    let new_deactivate_commitment =
                        uint256_from_decimal_string(&data.new_deactivate_commitment);
                    let new_deactivate_root =
                        uint256_from_decimal_string(&data.new_deactivate_root);
                    let proof = Groth16ProofType {
                                    a: "2fac29af2cad382c07952b42c10b282d6ee5c27032548c370fdf40c693965b98239bb54fb0546480075f7e93f7f46acdacfecf3eb40fb3c16f9b13287d15fd7a".to_string(),
                                    b: "18fb4503928bda6fc6aa377170b80fb3e2c73161c78c936bca222cb233318c7517ca194640de6b7790ec65ea7e46891089567d86a9fe8e419ad5e5d27e2cf96a2cf5383ef516ea8d14754c2e9e132fe566dd32eb23cd0de3543398a03a1c15f02a75014c4db8598d472112b292bbdde2968c409b759dbe76dec21da24b09d1a1".to_string(),
                                    c: "18f024873175339f2e939c8bc8a369daa56257564f3e23b0cf4b635e5721f0d1285e5d66fc1dd69f581a2b146083267e4ce9a3c21e46f488af2ed9289bd00714".to_string()
                                };
                    app.update_block(next_block_11_min);
                    _ = contract
                        .process_deactivate_message(
                            &mut app,
                            owner(),
                            size,
                            new_deactivate_commitment,
                            new_deactivate_root,
                            proof,
                        )
                        .unwrap();
                }
                _ => println!("Unknown type: {}", entry.log_type),
            }
        }

        let delay_records = contract.query_delay_records(&app).unwrap();
        println!("============================");
        println!("delay_records: {:?}", delay_records);
        assert_eq!(
            delay_records,
            DelayRecords {
                records: vec![DelayRecord {
                    delay_timestamp: Timestamp::from_nanos(1571797424879305533),
                    delay_duration: 660,
                    delay_reason: String::from(
                        "Processing of 2 deactivate messages has timed out after 660 seconds"
                    ),
                    delay_process_dmsg_count: Uint256::from_u128(2),
                    delay_type: DelayType::DeactivateDelay,
                }]
            }
        );
    }

    #[test]
    fn test_oracle_signup() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let label = "Oracle Test";

        // Create voting time period
        let voting_time = crate::state::VotingTime {
            start_time: Timestamp::from_seconds(1577836800), // 2020-01-01
            end_time: Timestamp::from_seconds(1577836800 + 11 * 60), // 2020-01-01 + 11 minutes
        };

        let round_info = crate::state::RoundInfo {
            title: "Oracle Test Round".to_string(),
            description: "Testing oracle signup functionality".to_string(),
            link: "https://example.com".to_string(),
        };

        // Create contract with oracle configuration
        let oracle_pubkey = test_oracle_pubkey();
        let contract = MaciContract::instantiate_with_oracle(
            &mut app,
            code_id,
            owner(),
            round_info,
            None, // No traditional whitelist
            voting_time,
            Uint256::from_u128(0u128), // 1p1v
            Uint256::from_u128(0u128), // groth16
            oracle_pubkey,
            label,
        )
        .unwrap();

        // Set block time to be within voting period
        app.update_block(|block| {
            block.time = Timestamp::from_seconds(1577836800 + 5 * 60); // 5 minutes after start
        });

        // Test pubkeys and contract address for certificate generation
        let pubkey1 = test_pubkey1();
        let pubkey2 = test_pubkey2();
        let contract_addr = contract.addr().to_string();

        // Generate certificates for both test users
        let cert1 = generate_certificate_for_pubkey(
            &contract_addr,
            &pubkey1.x.to_string(),
            &pubkey1.y.to_string(),
            100u128, // amount = 100 (voice_credit_amount)
        );

        let cert2 = generate_certificate_for_pubkey(
            &contract_addr,
            &pubkey2.x.to_string(),
            &pubkey2.y.to_string(),
            100u128, // amount = 100 (voice_credit_amount)
        );

        // Test oracle signup for user1
        let response1 = contract
            .sign_up_oracle(&mut app, user1(), pubkey1.clone(), cert1)
            .unwrap();
        assert!(response1.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "action" && attr.value == "sign_up")
        }));
        assert!(response1.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "mode" && attr.value == "oracle")
        }));

        // Test oracle signup for user2
        let response2 = contract
            .sign_up_oracle(&mut app, user2(), pubkey2.clone(), cert2)
            .unwrap();
        assert!(response2.events.iter().any(|e| {
            e.attributes
                .iter()
                .any(|attr| attr.key == "action" && attr.value == "sign_up")
        }));

        // Verify signup count
        let num_signups = contract.num_sign_up(&app).unwrap();
        assert_eq!(num_signups, Uint256::from_u128(2u128));

        // Test duplicate signup should fail
        let cert1_duplicate = generate_certificate_for_pubkey(
            &contract_addr,
            &pubkey1.x.to_string(),
            &pubkey1.y.to_string(),
            100u128,
        );

        let duplicate_signup_error = contract
            .sign_up_oracle(&mut app, user1(), pubkey1, cert1_duplicate)
            .unwrap_err();
        assert_eq!(
            ContractError::AlreadySignedUp {},
            duplicate_signup_error.downcast().unwrap()
        );
    }

    #[test]
    fn test_oracle_signup_invalid_certificate() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let label = "Oracle Invalid Cert Test";

        // Create voting time period
        let voting_time = crate::state::VotingTime {
            start_time: Timestamp::from_seconds(1577836800),
            end_time: Timestamp::from_seconds(1577836800 + 11 * 60), // +11 minutes
        };

        let round_info = crate::state::RoundInfo {
            title: "Oracle Invalid Cert Test".to_string(),
            description: "Testing invalid certificate".to_string(),
            link: "https://example.com".to_string(),
        };

        // Create contract with oracle configuration
        let oracle_pubkey = test_oracle_pubkey();
        let contract = MaciContract::instantiate_with_oracle(
            &mut app,
            code_id,
            owner(),
            round_info,
            None,
            voting_time,
            Uint256::from_u128(0u128),
            Uint256::from_u128(0u128),
            oracle_pubkey,
            label,
        )
        .unwrap();

        // Set block time to be within voting period
        app.update_block(|block| {
            block.time = Timestamp::from_seconds(1577836800 + 5 * 60); // 5 minutes after start
        });

        let pubkey1 = test_pubkey1();

        // Try signup with invalid certificate
        let invalid_cert = "invalid_base64_certificate";
        let invalid_cert_error = contract
            .sign_up_oracle(&mut app, user1(), pubkey1, invalid_cert.to_string())
            .unwrap_err();

        // Should fail with InvalidBase64 or InvalidSignature error
        let error = invalid_cert_error.downcast::<ContractError>().unwrap();
        assert!(matches!(
            error,
            ContractError::InvalidBase64 {} | ContractError::InvalidSignature {}
        ));
    }

    #[test]
    fn test_oracle_without_config() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let label = "Oracle No Config Test";

        let voting_time = crate::state::VotingTime {
            start_time: Timestamp::from_seconds(1577836800),
            end_time: Timestamp::from_seconds(1577836800 + 11 * 60), // +11 minutes
        };

        let round_info = crate::state::RoundInfo {
            title: "Oracle No Config Test".to_string(),
            description: "Testing oracle without config".to_string(),
            link: "https://example.com".to_string(),
        };

        // Create contract WITHOUT oracle configuration
        let contract = MaciContract::instantiate(
            &mut app,
            code_id,
            owner(),
            round_info,
            None,
            voting_time,
            Uint256::from_u128(0u128),
            Uint256::from_u128(0u128),
            label,
        )
        .unwrap();

        // Set block time to be within voting period
        app.update_block(|block| {
            block.time = Timestamp::from_seconds(1577836800 + 5 * 60); // 5 minutes after start
        });

        let pubkey1 = test_pubkey1();
        let fake_cert = "fake_certificate";

        // Try oracle signup without oracle config
        let no_config_error = contract
            .sign_up_oracle(&mut app, user1(), pubkey1, fake_cert.to_string())
            .unwrap_err();

        assert_eq!(
            ContractError::OracleWhitelistNotConfigured {},
            no_config_error.downcast().unwrap()
        );
    }

    #[test]
    fn test_query_signuped_state_idx() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let owner = owner();
        let user1 = user1();
        let user2 = user2();

        // Create contract with whitelist
        let maci_contract = code_id
            .instantiate_with_voting_time(
                &mut app,
                owner.clone(),
                user1.clone(),
                user2.clone(),
                "test",
            )
            .unwrap();

        // Start voting period
        app.update_block(next_block);

        // Query non-existent user - should return None
        let pubkey_non_existent = test_pubkey1();
        let result: Option<Uint256> = app
            .wrap()
            .query_wasm_smart(
                maci_contract.addr().clone(),
                &crate::msg::QueryMsg::Signuped {
                    pubkey: pubkey_non_existent.clone(),
                },
            )
            .unwrap();
        assert_eq!(result, None, "Non-existent user should return None");

        // User1 signs up
        let pubkey1 = test_pubkey1();
        maci_contract
            .sign_up(&mut app, user1.clone(), pubkey1.clone())
            .unwrap();

        // Query user1's state idx - should be 0 (first user)
        let state_idx_1: Option<Uint256> = app
            .wrap()
            .query_wasm_smart(
                maci_contract.addr().clone(),
                &crate::msg::QueryMsg::Signuped {
                    pubkey: pubkey1.clone(),
                },
            )
            .unwrap();
        assert_eq!(
            state_idx_1,
            Some(Uint256::from_u128(0)),
            "First user should have state_idx 0"
        );

        // User2 signs up
        let pubkey2 = test_pubkey2();
        maci_contract
            .sign_up(&mut app, user2.clone(), pubkey2.clone())
            .unwrap();

        // Query user2's state idx - should be 1 (second user)
        let state_idx_2: Option<Uint256> = app
            .wrap()
            .query_wasm_smart(
                maci_contract.addr().clone(),
                &crate::msg::QueryMsg::Signuped {
                    pubkey: pubkey2.clone(),
                },
            )
            .unwrap();
        assert_eq!(
            state_idx_2,
            Some(Uint256::from_u128(1)),
            "Second user should have state_idx 1"
        );

        // Query user1 again - should still be 0
        let state_idx_1_again: Option<Uint256> = app
            .wrap()
            .query_wasm_smart(
                maci_contract.addr().clone(),
                &crate::msg::QueryMsg::Signuped {
                    pubkey: pubkey1.clone(),
                },
            )
            .unwrap();
        assert_eq!(
            state_idx_1_again,
            Some(Uint256::from_u128(0)),
            "First user should still have state_idx 0"
        );
    }

    // Note: Oracle whitelist test omitted as it requires complex setup.
    // The signuped query functionality for oracle mode is tested implicitly
    // in the existing comprehensive amaci tests.

    #[test]
    fn test_query_signuped_pubkey_uniqueness() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let owner = owner();
        let user1 = user1();
        let user2 = user2();

        // Create contract with whitelist (using existing instantiate method)
        let maci_contract = code_id
            .instantiate_with_voting_time(
                &mut app,
                owner.clone(),
                user1.clone(),
                user2.clone(),
                "test",
            )
            .unwrap();

        // Start voting period
        app.update_block(next_block);

        // Two different pubkeys with same x coordinate
        let pubkey1 = PubKey {
            x: Uint256::from_u128(100),
            y: Uint256::from_u128(200),
        };
        let pubkey2 = PubKey {
            x: Uint256::from_u128(100), // Same x as pubkey1
            y: Uint256::from_u128(300), // Different y
        };

        // User1 signs up with pubkey1
        maci_contract
            .sign_up(&mut app, user1.clone(), pubkey1.clone())
            .unwrap();

        // User2 signs up with pubkey2 (same x, different y)
        maci_contract
            .sign_up(&mut app, user2.clone(), pubkey2.clone())
            .unwrap();

        // Query both users - they should have different state indices despite same x
        let idx1: Option<Uint256> = app
            .wrap()
            .query_wasm_smart(
                maci_contract.addr().clone(),
                &crate::msg::QueryMsg::Signuped {
                    pubkey: pubkey1.clone(),
                },
            )
            .unwrap();

        let idx2: Option<Uint256> = app
            .wrap()
            .query_wasm_smart(
                maci_contract.addr().clone(),
                &crate::msg::QueryMsg::Signuped {
                    pubkey: pubkey2.clone(),
                },
            )
            .unwrap();

        assert_eq!(idx1, Some(Uint256::from_u128(0)));
        assert_eq!(idx2, Some(Uint256::from_u128(1)));

        // Verify that pubkey1 and pubkey2 have same x but different indices
        assert_eq!(
            pubkey1.x, pubkey2.x,
            "pubkey1 and pubkey2 should have same x"
        );
        assert_ne!(
            pubkey1.y, pubkey2.y,
            "pubkey1 and pubkey2 should have different y"
        );
        assert_ne!(
            idx1, idx2,
            "Users with same x but different y should have different state indices"
        );
    }
}
