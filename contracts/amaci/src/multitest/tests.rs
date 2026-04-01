#[cfg(test)]
mod test {
    use crate::error::ContractError;
    use crate::msg::{
        ExecuteMsg, Groth16ProofType, InstantiateMsg, QueryMsg, RegistrationConfigInfo,
        RegistrationConfigUpdate, RegistrationModeConfig, RegistrationStatus, WhitelistBase,
        WhitelistBaseConfig,
    };
    use crate::multitest::certificate_generator::generate_certificate_for_pubkey;
    use crate::multitest::{
        create_app, owner, test_oracle_pubkey, test_pubkey1, test_pubkey2, test_pubkey3,
        uint256_from_decimal_string, user1, user2, user3, MaciCodeId, MaciContract,
    };
    use crate::state::{
        DelayRecord, DelayRecords, DelayType, MaciParameters, MessageData, Period, PeriodStatus,
        PubKey, RegistrationMode, RoundInfo, VoiceCreditMode, VotingTime,
    };
    use cosmwasm_std::{Addr, BlockInfo, Timestamp, Uint256};
    use cw_multi_test::{next_block, Executor};
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

    /// A slimmed-down variant that skips the nested `proof` field entirely.
    /// Used when we only need the circuit state values (size / commitments / root)
    /// and supply the proof bytes separately (e.g. in negative-path tests).
    #[derive(Debug, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct DeactivateStateData {
        size: String,
        new_deactivate_commitment: String,
        new_deactivate_root: String,
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
                    uint256_from_decimal_string(&data.msgs[i][7]),
                    uint256_from_decimal_string(&data.msgs[i][8]),
                    uint256_from_decimal_string(&data.msgs[i][9]),
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
                    uint256_from_decimal_string(&data.msgs[i][7]),
                    uint256_from_decimal_string(&data.msgs[i][8]),
                    uint256_from_decimal_string(&data.msgs[i][9]),
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
                            uint256_from_decimal_string(&data.message[7]),
                            uint256_from_decimal_string(&data.message[8]),
                            uint256_from_decimal_string(&data.message[9]),
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
                            uint256_from_decimal_string(&data.message[7]),
                            uint256_from_decimal_string(&data.message[8]),
                            uint256_from_decimal_string(&data.message[9]),
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
                            uint256_from_decimal_string(&data.message[7]),
                            uint256_from_decimal_string(&data.message[8]),
                            uint256_from_decimal_string(&data.message[9]),
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
                            uint256_from_decimal_string(&data.message[7]),
                            uint256_from_decimal_string(&data.message[8]),
                            uint256_from_decimal_string(&data.message[9]),
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
                            uint256_from_decimal_string(&data.message[7]),
                            uint256_from_decimal_string(&data.message[8]),
                            uint256_from_decimal_string(&data.message[9]),
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
        let voting_time = VotingTime {
            start_time: Timestamp::from_seconds(1577836800), // 2020-01-01
            end_time: Timestamp::from_seconds(1577836800 + 11 * 60), // 2020-01-01 + 11 minutes
        };

        let round_info = RoundInfo {
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
            e.attributes.iter().any(|attr| {
                attr.key == "registration_mode" && attr.value.contains("SignUpWithOracle")
            })
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
        let voting_time = VotingTime {
            start_time: Timestamp::from_seconds(1577836800),
            end_time: Timestamp::from_seconds(1577836800 + 11 * 60), // +11 minutes
        };

        let round_info = RoundInfo {
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

        let voting_time = VotingTime {
            start_time: Timestamp::from_seconds(1577836800),
            end_time: Timestamp::from_seconds(1577836800 + 11 * 60), // +11 minutes
        };

        let round_info = RoundInfo {
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
            ContractError::Unauthorized {},
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
                &QueryMsg::Signuped {
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
                &QueryMsg::Signuped {
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
                &QueryMsg::Signuped {
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
                &QueryMsg::Signuped {
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

        // Two different pubkeys with same x coordinate.
        // On Twisted Edwards: if (x, y) is on the curve, so is (x, p-y).
        // p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
        let pubkey1 = test_pubkey1();
        // pubkey2 shares the same x but uses the "negated y" (p - y1), which is also a valid curve point
        let pubkey2 = PubKey {
            x: pubkey1.x,
            y: uint256_from_decimal_string(
                "17524420569411755457684745207686933811333606235521006423651458976605670638936",
            ),
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
                &QueryMsg::Signuped {
                    pubkey: pubkey1.clone(),
                },
            )
            .unwrap();

        let idx2: Option<Uint256> = app
            .wrap()
            .query_wasm_smart(
                maci_contract.addr().clone(),
                &QueryMsg::Signuped {
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

    // ========== Deactivate Feature Tests ==========

    #[test]
    fn test_deactivate_enabled_query() {
        let mut app = create_app();
        let maci_contract = MaciContract::instantiate_default(&mut app, true).unwrap();

        // Query deactivate_enabled - should be false by default
        let enabled: bool = app
            .wrap()
            .query_wasm_smart(
                maci_contract.addr().clone(),
                &QueryMsg::GetDeactivateEnabled {},
            )
            .unwrap();

        assert_eq!(enabled, false, "Deactivate should be disabled by default");
    }

    #[test]
    fn test_publish_deactivate_message_disabled() {
        let mut app = create_app();
        let maci_contract = MaciContract::instantiate_default(&mut app, true).unwrap();

        // Try to publish deactivate message when feature is disabled
        let result = app.execute_contract(
            user1(),
            maci_contract.addr().clone(),
            &ExecuteMsg::PublishDeactivateMessage {
                message: MessageData {
                    data: [Uint256::zero(); 10],
                },
                enc_pub_key: PubKey {
                    x: Uint256::from_u128(1),
                    y: Uint256::from_u128(2),
                },
            },
            &[],
        );

        // Should fail with DeactivateDisabled error
        assert!(result.is_err());
        let err = result.unwrap_err();
        let err_string = format!("{:?}", err);
        assert!(
            err_string.contains("Deactivate feature is disabled")
                || err_string.contains("DeactivateDisabled"),
            "Expected DeactivateDisabled error, got: {}",
            err_string
        );
    }

    #[test]
    fn test_upload_deactivate_message_disabled() {
        let mut app = create_app();
        let maci_contract = MaciContract::instantiate_default(&mut app, true).unwrap();

        // Try to upload deactivate message when feature is disabled
        let result = app.execute_contract(
            owner(),
            maci_contract.addr().clone(),
            &ExecuteMsg::UploadDeactivateMessage {
                deactivate_message: vec![vec![Uint256::zero(); 10]],
            },
            &[],
        );

        // Should fail with DeactivateDisabled error
        assert!(result.is_err());
        let err = result.unwrap_err();
        let err_string = format!("{:?}", err);
        assert!(
            err_string.contains("Deactivate feature is disabled")
                || err_string.contains("DeactivateDisabled"),
            "Expected DeactivateDisabled error, got: {}",
            err_string
        );
    }

    #[test]
    fn test_process_deactivate_message_disabled() {
        let mut app = create_app();
        let maci_contract = MaciContract::instantiate_default(&mut app, true).unwrap();

        // Try to process deactivate message when feature is disabled
        let result = app.execute_contract(
            owner(),
            maci_contract.addr().clone(),
            &ExecuteMsg::ProcessDeactivateMessage {
                size: Uint256::from_u128(1),
                new_deactivate_commitment: Uint256::zero(),
                new_deactivate_root: Uint256::zero(),
                groth16_proof: Groth16ProofType {
                    a: String::new(),
                    b: String::new(),
                    c: String::new(),
                },
            },
            &[],
        );

        // Should fail with DeactivateDisabled error
        assert!(result.is_err());
        let err = result.unwrap_err();
        let err_string = format!("{:?}", err);
        assert!(
            err_string.contains("Deactivate feature is disabled")
                || err_string.contains("DeactivateDisabled"),
            "Expected DeactivateDisabled error, got: {}",
            err_string
        );
    }

    #[test]
    fn test_publish_deactivate_message_insufficient_fee() {
        use cosmwasm_std::{coin, coins};
        use cw_multi_test::next_block;
        let mut app = create_app();

        // Mint tokens for user1
        app.sudo(cw_multi_test::SudoMsg::Bank(
            cw_multi_test::BankSudo::Mint {
                to_address: user1().to_string(),
                amount: coins(100_000_000_000_000_000_000, "peaka"),
            },
        ))
        .unwrap();

        // Create a contract with deactivate enabled
        let maci_contract =
            MaciContract::instantiate_with_deactivate_enabled(&mut app, true).unwrap();

        // Advance time to voting period
        app.update_block(next_block);

        // Signup first
        let pubkey = test_pubkey1();
        let _ = app.execute_contract(
            user1(),
            maci_contract.addr().clone(),
            &ExecuteMsg::SignUp {
                pubkey: pubkey.clone(),
                certificate: None,
                amount: None,
            },
            &[],
        );

        // Try to publish deactivate message with insufficient fee
        let result = app.execute_contract(
            user1(),
            maci_contract.addr().clone(),
            &ExecuteMsg::PublishDeactivateMessage {
                message: MessageData {
                    data: [Uint256::from_u128(1); 10],
                },
                enc_pub_key: test_pubkey1(),
            },
            &[coin(5_000_000_000_000_000_000, "peaka")], // Only 5 DORA, need 10 DORA
        );

        // Should fail with InsufficientFundsSend error
        assert!(result.is_err());
        let err = result.unwrap_err();
        let err_string = format!("{:?}", err);
        assert!(
            err_string.contains("Incorrect funds sent"),
            "Expected InsufficientFundsSend error, got: {}",
            err_string
        );
    }

    #[test]
    fn test_publish_deactivate_message_with_fee() {
        use cosmwasm_std::{coin, coins};
        use cw_multi_test::next_block;
        let mut app = create_app();

        // Mint tokens for user1
        app.sudo(cw_multi_test::SudoMsg::Bank(
            cw_multi_test::BankSudo::Mint {
                to_address: user1().to_string(),
                amount: coins(100_000_000_000_000_000_000, "peaka"),
            },
        ))
        .unwrap();

        // Create a contract with deactivate enabled
        let maci_contract =
            MaciContract::instantiate_with_deactivate_enabled(&mut app, true).unwrap();

        // Advance time to voting period
        app.update_block(next_block);

        // Signup first
        let pubkey = test_pubkey1();
        let _ = app.execute_contract(
            user1(),
            maci_contract.addr().clone(),
            &ExecuteMsg::SignUp {
                pubkey: pubkey.clone(),
                certificate: None,
                amount: None,
            },
            &[],
        );

        // Get balance before (both contract and user)
        let contract_balance_before = app
            .wrap()
            .query_balance(maci_contract.addr().clone(), "peaka")
            .unwrap();
        let user_balance_before = app.wrap().query_balance(user1(), "peaka").unwrap();

        // Publish deactivate message with correct fee (10 DORA)
        let result = app.execute_contract(
            user1(),
            maci_contract.addr().clone(),
            &ExecuteMsg::PublishDeactivateMessage {
                message: MessageData {
                    data: [Uint256::from_u128(1); 10],
                },
                enc_pub_key: test_pubkey1(),
            },
            &[coin(10_000_000_000_000_000_000, "peaka")], // Exactly 10 DORA
        );

        // Should succeed
        assert!(
            result.is_ok(),
            "Failed to publish deactivate message: {:?}",
            result.err()
        );

        // Verify fee was added to contract balance (accumulated to pool)
        let contract_balance_after = app
            .wrap()
            .query_balance(maci_contract.addr().clone(), "peaka")
            .unwrap();
        assert_eq!(
            contract_balance_after.amount.u128(),
            contract_balance_before.amount.u128() + 10_000_000_000_000_000_000,
            "Contract balance should increase by 10 DORA"
        );

        // Verify user balance decreased by 10 DORA
        let user_balance_after = app.wrap().query_balance(user1(), "peaka").unwrap();
        assert_eq!(
            user_balance_after.amount.u128(),
            user_balance_before.amount.u128() - 10_000_000_000_000_000_000,
            "User balance should decrease by 10 DORA"
        );

        // Verify dmsg_chain_length increased
        let dmsg_length: Uint256 = app
            .wrap()
            .query_wasm_smart(
                maci_contract.addr().clone(),
                &QueryMsg::GetDMsgChainLength {},
            )
            .unwrap();
        assert_eq!(
            dmsg_length,
            Uint256::from_u128(1),
            "Dmsg chain length should be 1"
        );
    }

    #[test]
    fn test_multiple_deactivate_messages_fee_accumulation() {
        use cosmwasm_std::{coin, coins};
        use cw_multi_test::next_block;
        let mut app = create_app();

        // Mint tokens for multiple users
        for i in 1..=3 {
            let user_addr = format!("user{}", i);
            app.sudo(cw_multi_test::SudoMsg::Bank(
                cw_multi_test::BankSudo::Mint {
                    to_address: user_addr,
                    amount: coins(100_000_000_000_000_000_000, "peaka"),
                },
            ))
            .unwrap();
        }

        // Create a contract with deactivate enabled
        let maci_contract =
            MaciContract::instantiate_with_deactivate_enabled(&mut app, true).unwrap();

        // Advance time to voting period
        app.update_block(next_block);

        // Signup users
        let pubkey1 = test_pubkey1();
        let pubkey2 = test_pubkey2();
        let pubkey3 = test_pubkey3();

        for (i, pubkey) in vec![&pubkey1, &pubkey2, &pubkey3].iter().enumerate() {
            let user_addr = Addr::unchecked(format!("user{}", i + 1));
            let _ = app.execute_contract(
                user_addr,
                maci_contract.addr().clone(),
                &ExecuteMsg::SignUp {
                    pubkey: (**pubkey).clone(),
                    certificate: None,
                    amount: None,
                },
                &[],
            );
        }

        // Get initial contract balance
        let initial_balance = app
            .wrap()
            .query_balance(maci_contract.addr().clone(), "peaka")
            .unwrap();

        // Publish 3 deactivate messages — enc_pub_key must be a valid BabyJubJub point
        let enc_pub_keys = vec![test_pubkey1(), test_pubkey2(), test_pubkey3()];
        for (i, enc_pub_key) in enc_pub_keys.into_iter().enumerate() {
            let user_addr = Addr::unchecked(format!("user{}", i + 1));
            let _ = app.execute_contract(
                user_addr,
                maci_contract.addr().clone(),
                &ExecuteMsg::PublishDeactivateMessage {
                    message: MessageData {
                        data: [Uint256::from_u128((i + 1) as u128); 10],
                    },
                    enc_pub_key,
                },
                &[coin(10_000_000_000_000_000_000, "peaka")], // 10 DORA each
            );
        }

        // Verify total fee accumulated (30 DORA = 3 * 10 DORA)
        let final_balance = app
            .wrap()
            .query_balance(maci_contract.addr().clone(), "peaka")
            .unwrap();
        assert_eq!(
            final_balance.amount.u128(),
            initial_balance.amount.u128() + 30_000_000_000_000_000_000,
            "Contract balance should increase by 30 DORA (3 messages * 10 DORA)"
        );

        // Verify dmsg_chain_length is 3
        let dmsg_length: Uint256 = app
            .wrap()
            .query_wasm_smart(
                maci_contract.addr().clone(),
                &QueryMsg::GetDMsgChainLength {},
            )
            .unwrap();
        assert_eq!(
            dmsg_length,
            Uint256::from_u128(3),
            "Dmsg chain length should be 3"
        );
    }

    // ========================================
    // Registration Config Update Tests
    // ========================================

    #[test]
    fn test_update_registration_config_deactivate_enabled() {
        let mut app = create_app();
        let maci_contract = MaciContract::instantiate_default(&mut app, false).unwrap();

        // Initially deactivate should be disabled
        let deactivate_enabled: bool = app
            .wrap()
            .query_wasm_smart(maci_contract.addr(), &QueryMsg::GetDeactivateEnabled {})
            .unwrap();
        assert!(
            !deactivate_enabled,
            "Initially deactivate should be disabled"
        );

        // Update: enable deactivate
        let config = RegistrationConfigUpdate {
            deactivate_enabled: Some(true),
            voice_credit_mode: None,
            registration_mode: None,
        };

        let _ = maci_contract
            .update_registration_config(&mut app, owner(), config)
            .expect("Should successfully update deactivate_enabled");

        // Verify deactivate is now enabled
        let deactivate_enabled: bool = app
            .wrap()
            .query_wasm_smart(maci_contract.addr(), &QueryMsg::GetDeactivateEnabled {})
            .unwrap();
        assert!(deactivate_enabled, "Deactivate should now be enabled");
    }

    #[test]
    fn test_update_registration_config_deactivate_before_voting() {
        // 测试：在投票开始前，可以随时更新 deactivate_enabled（即使是多次更新）
        let mut app = create_app();
        let maci_contract = MaciContract::instantiate_default(&mut app, false).unwrap();

        // Set block time to be before voting period starts
        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000 - 5 * 60_000_000_000);
            // 5 minutes before start
        });

        // Initially deactivate should be disabled
        let deactivate_enabled: bool = app
            .wrap()
            .query_wasm_smart(maci_contract.addr(), &QueryMsg::GetDeactivateEnabled {})
            .unwrap();
        assert!(
            !deactivate_enabled,
            "Initially deactivate should be disabled"
        );

        // Update 1: enable deactivate
        let config = RegistrationConfigUpdate {
            deactivate_enabled: Some(true),
            voice_credit_mode: None,
            registration_mode: None,
        };

        let _ = maci_contract
            .update_registration_config(&mut app, owner(), config)
            .expect("Should allow updating deactivate_enabled before voting starts");

        // Verify deactivate is now enabled
        let deactivate_enabled: bool = app
            .wrap()
            .query_wasm_smart(maci_contract.addr(), &QueryMsg::GetDeactivateEnabled {})
            .unwrap();
        assert!(deactivate_enabled, "Deactivate should be enabled");

        // Update 2: disable deactivate again
        let config2 = RegistrationConfigUpdate {
            deactivate_enabled: Some(false),
            voice_credit_mode: None,
            registration_mode: None,
        };

        let _ = maci_contract
            .update_registration_config(&mut app, owner(), config2)
            .expect("Should allow updating deactivate_enabled multiple times before voting");

        // Verify deactivate is now disabled
        let deactivate_enabled: bool = app
            .wrap()
            .query_wasm_smart(maci_contract.addr(), &QueryMsg::GetDeactivateEnabled {})
            .unwrap();
        assert!(!deactivate_enabled, "Deactivate should be disabled again");
    }

    #[test]
    fn test_update_registration_config_vc_mode_before_signup() {
        let mut app = create_app();
        let maci_contract = MaciContract::instantiate_default(&mut app, false).unwrap();

        // Update: change from Unified to Dynamic VC mode
        let config = RegistrationConfigUpdate {
            deactivate_enabled: None,
            voice_credit_mode: Some(VoiceCreditMode::Dynamic),
            registration_mode: None,
        };

        let _ = maci_contract
            .update_registration_config(&mut app, owner(), config)
            .expect("Should successfully update VC mode before any signup");
    }

    #[test]
    fn test_update_vc_mode_multiple_times_before_voting() {
        // 测试：在投票开始前且无用户注册时，可以多次修改 voice_credit_mode
        let mut app = create_app();
        let maci_contract = MaciContract::instantiate_default(&mut app, false).unwrap();

        // Set block time to be before voting period starts
        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000 - 5 * 60_000_000_000);
        });

        // Update 1: Change from Unified to Dynamic
        let config1 = RegistrationConfigUpdate {
            deactivate_enabled: None,
            voice_credit_mode: Some(VoiceCreditMode::Dynamic),
            registration_mode: None,
        };

        let _ = maci_contract
            .update_registration_config(&mut app, owner(), config1)
            .expect("Should allow changing VC mode before voting");

        // Verify VC mode is Dynamic
        let reg_config: RegistrationConfigInfo = app
            .wrap()
            .query_wasm_smart(maci_contract.addr(), &QueryMsg::GetRegistrationConfig {})
            .unwrap();

        assert!(
            matches!(reg_config.voice_credit_mode, VoiceCreditMode::Dynamic),
            "Should be Dynamic mode"
        );

        // Update 2: Change back to Unified
        let config2 = RegistrationConfigUpdate {
            deactivate_enabled: None,
            voice_credit_mode: Some(VoiceCreditMode::Unified {
                amount: Uint256::from_u128(200u128),
            }),
            registration_mode: None,
        };

        let _ = maci_contract
            .update_registration_config(&mut app, owner(), config2)
            .expect("Should allow changing VC mode again before voting");

        // Verify VC mode is Unified
        let reg_config: RegistrationConfigInfo = app
            .wrap()
            .query_wasm_smart(maci_contract.addr(), &QueryMsg::GetRegistrationConfig {})
            .unwrap();

        assert!(
            matches!(reg_config.voice_credit_mode, VoiceCreditMode::Unified { amount } if amount == Uint256::from_u128(200u128)),
            "Should be Unified mode with 200 credits"
        );
    }

    #[test]
    fn test_update_registration_config_fails_during_voting() {
        // 测试：在投票期间（即使没有用户注册），也无法更新任何配置
        let mut app = create_app();
        let maci_contract = MaciContract::instantiate_default(&mut app, true).unwrap();

        // Set block time to be DURING voting period (1 minute after start)
        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000 + 60_000_000_000);
        });

        // Try to update registration_mode during voting (should fail with PeriodError)
        let config = RegistrationConfigUpdate {
            deactivate_enabled: None,
            voice_credit_mode: None,
            registration_mode: Some(RegistrationModeConfig::SignUpWithOracle {
                oracle_pubkey: "test_oracle_pubkey".to_string(),
            }),
        };

        let result = maci_contract.update_registration_config(&mut app, owner(), config);

        assert!(
            result.is_err(),
            "Should fail to update config during voting period"
        );

        let contract_err: ContractError = result.unwrap_err().downcast().unwrap();
        assert_eq!(
            contract_err,
            ContractError::PeriodError {},
            "Expected PeriodError during voting"
        );
    }

    #[test]
    fn test_update_registration_config_unauthorized() {
        let mut app = create_app();

        // Set block time to be before voting period starts
        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000 - 60_000_000_000);
            // 1 minute before start
        });

        let maci_contract = MaciContract::instantiate_default(&mut app, false).unwrap();

        // Non-admin tries to update config
        let config = RegistrationConfigUpdate {
            deactivate_enabled: Some(true),
            voice_credit_mode: None,
            registration_mode: None,
        };

        let err = maci_contract
            .update_registration_config(&mut app, user1(), config)
            .unwrap_err();

        let contract_err: ContractError = err.downcast().unwrap();
        assert_eq!(
            contract_err,
            ContractError::Unauthorized {},
            "Non-admin should not be able to update config"
        );
    }

    #[test]
    fn test_update_registration_config_after_voting_starts_fails() {
        let mut app = create_app();

        // Set block time to be before voting period starts
        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000 - 60_000_000_000);
            // 1 minute before start
        });

        let maci_contract = MaciContract::instantiate_default(&mut app, false).unwrap();

        // Advance time to after voting start
        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000 + 60_000_000_000);
            // 1 minute after start
        });

        // Try to update config after voting starts (should fail)
        let config = RegistrationConfigUpdate {
            deactivate_enabled: Some(true),
            voice_credit_mode: None,
            registration_mode: None,
        };

        let err = maci_contract
            .update_registration_config(&mut app, owner(), config)
            .unwrap_err();

        let contract_err: ContractError = err.downcast().unwrap();
        assert_eq!(
            contract_err,
            ContractError::PeriodError {},
            "Should fail to update config after voting starts"
        );
    }

    #[test]
    fn test_update_registration_config_switch_to_oracle_verified() {
        let mut app = create_app();
        let maci_contract = MaciContract::instantiate_default(&mut app, false).unwrap();

        // Update: switch from StaticWhitelist to OracleVerified
        let config = RegistrationConfigUpdate {
            deactivate_enabled: None,
            voice_credit_mode: None,
            registration_mode: Some(RegistrationModeConfig::SignUpWithOracle {
                oracle_pubkey: "test_oracle_backend_pubkey".to_string(),
            }),
        };

        let _ = maci_contract
            .update_registration_config(&mut app, owner(), config)
            .expect("Should successfully switch to OracleVerified mode");

        // Verify oracle config is set
        let oracle_pubkey: Option<String> = app
            .wrap()
            .query_wasm_smart(
                maci_contract.addr(),
                &QueryMsg::QueryOracleWhitelistConfig {},
            )
            .unwrap();
        assert!(oracle_pubkey.is_some(), "Oracle pubkey should be set");
    }

    #[test]
    fn test_update_registration_config_switch_to_static_whitelist() {
        let mut app = create_app();

        // Instantiate with OracleVerified mode
        let code_id = MaciCodeId::store_code(&mut app);
        let round_info = RoundInfo {
            title: String::from("TestRound"),
            description: String::from("Test Description"),
            link: String::from("https://github.com"),
        };
        let voting_time = VotingTime {
            start_time: Timestamp::from_nanos(1571797424879000000),
            end_time: Timestamp::from_nanos(1571797424879000000).plus_minutes(11),
        };
        let contract = MaciContract::instantiate_with_oracle(
            &mut app,
            code_id,
            owner(),
            round_info,
            None,
            voting_time,
            Uint256::from_u128(0),
            Uint256::from_u128(0),
            "test_oracle_pubkey".to_string(),
            "MACI with Oracle",
        )
        .unwrap();

        // Update: switch from OracleVerified to StaticWhitelist
        let whitelist_users = vec![
            WhitelistBaseConfig {
                addr: user1(),
                voice_credit_amount: None, // Unified mode, no need for individual amounts
            },
            WhitelistBaseConfig {
                addr: user2(),
                voice_credit_amount: None,
            },
        ];

        let config = RegistrationConfigUpdate {
            deactivate_enabled: None,
            voice_credit_mode: None,
            registration_mode: Some(RegistrationModeConfig::SignUpWithStaticWhitelist {
                whitelist: WhitelistBase {
                    users: whitelist_users,
                },
            }),
        };

        let _ = contract
            .update_registration_config(&mut app, owner(), config)
            .expect("Should successfully switch to StaticWhitelist mode");

        // Verify whitelist is set: both users should be able to sign up
        let status1: RegistrationStatus = app
            .wrap()
            .query_wasm_smart(
                contract.addr(),
                &QueryMsg::QueryRegistrationStatus {
                    sender: Some(user1()),
                    pubkey: None,
                    certificate: None,
                    amount: None,
                },
            )
            .unwrap();
        assert!(status1.can_sign_up, "user1 should be in whitelist");

        let status2: RegistrationStatus = app
            .wrap()
            .query_wasm_smart(
                contract.addr(),
                &QueryMsg::QueryRegistrationStatus {
                    sender: Some(user2()),
                    pubkey: None,
                    certificate: None,
                    amount: None,
                },
            )
            .unwrap();
        assert!(status2.can_sign_up, "user2 should be in whitelist");
    }

    // NOTE: This test is no longer applicable in the new RegistrationMode design
    // The type system guarantees that whitelist data must be provided when using
    // SignUpWithStaticWhitelist variant
    #[test]
    #[ignore]
    fn test_update_registration_config_invalid_static_whitelist_no_data() {
        // This test is kept for reference but ignored as it's no longer possible
        // to create a SignUpWithStaticWhitelist without whitelist data
    }

    // NOTE: This test is no longer applicable in the new RegistrationMode design
    // The type system guarantees that oracle_pubkey must be provided when using
    // SignUpWithOracle variant
    #[test]
    #[ignore]
    fn test_update_registration_config_invalid_oracle_no_pubkey() {
        // This test is kept for reference but ignored as it's no longer possible
        // to create a SignUpWithOracle without oracle_pubkey
    }

    #[test]
    fn test_update_registration_config_combined_updates() {
        let mut app = create_app();
        let maci_contract = MaciContract::instantiate_default(&mut app, false).unwrap();

        // Combined update: enable deactivate + change VC mode + change registration mode
        let whitelist_users = vec![
            WhitelistBaseConfig {
                addr: user1(),
                voice_credit_amount: Some(Uint256::from_u128(100)),
            },
            WhitelistBaseConfig {
                addr: user2(),
                voice_credit_amount: Some(Uint256::from_u128(200)),
            },
        ];

        let config = RegistrationConfigUpdate {
            deactivate_enabled: Some(true),
            voice_credit_mode: Some(VoiceCreditMode::Dynamic),
            registration_mode: Some(RegistrationModeConfig::SignUpWithStaticWhitelist {
                whitelist: WhitelistBase {
                    users: whitelist_users,
                },
            }),
        };

        let _ = maci_contract
            .update_registration_config(&mut app, owner(), config)
            .expect("Should successfully update all configs at once");

        // Verify all changes
        let deactivate_enabled: bool = app
            .wrap()
            .query_wasm_smart(maci_contract.addr(), &QueryMsg::GetDeactivateEnabled {})
            .unwrap();
        assert!(deactivate_enabled, "Deactivate should be enabled");

        // Verify whitelist users and their VC balances via QueryRegistrationStatus
        let status1: RegistrationStatus = app
            .wrap()
            .query_wasm_smart(
                maci_contract.addr(),
                &QueryMsg::QueryRegistrationStatus {
                    sender: Some(user1()),
                    pubkey: None,
                    certificate: None,
                    amount: None,
                },
            )
            .unwrap();
        assert!(status1.can_sign_up, "user1 should be in whitelist");
        assert_eq!(
            status1.balance,
            Uint256::from_u128(100),
            "User1 should have 100 VC"
        );

        let status2: RegistrationStatus = app
            .wrap()
            .query_wasm_smart(
                maci_contract.addr(),
                &QueryMsg::QueryRegistrationStatus {
                    sender: Some(user2()),
                    pubkey: None,
                    certificate: None,
                    amount: None,
                },
            )
            .unwrap();
        assert!(status2.can_sign_up, "user2 should be in whitelist");
        assert_eq!(
            status2.balance,
            Uint256::from_u128(200),
            "User2 should have 200 VC"
        );
    }

    #[test]
    fn test_update_registration_config_switch_to_signup_mode() {
        let mut app = create_app();

        // Start with PrePopulated mode
        let code_id = MaciCodeId::store_code(&mut app);
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
            vote_option_map: vec!["Option 1".to_string()],
            round_info: RoundInfo {
                title: "Test".to_string(),
                description: "Test".to_string(),
                link: "".to_string(),
            },
            voting_time: VotingTime {
                start_time: Timestamp::from_nanos(1571797424879000000),
                end_time: Timestamp::from_nanos(1571797424879000000).plus_minutes(11),
            },
            circuit_type: Uint256::from_u128(0),
            certification_system: Uint256::from_u128(0),
            operator: owner(),
            admin: owner(),
            fee_recipient: owner(),
            poll_id: 1,
            voice_credit_mode: VoiceCreditMode::Unified {
                amount: Uint256::from_u128(100),
            },
            registration_mode: RegistrationModeConfig::PrePopulated {
                pre_deactivate_root: Uint256::from_u128(12345),
                pre_deactivate_coordinator: test_pubkey2(),
            },
            deactivate_enabled: false,
        };

        let contract_addr = app
            .instantiate_contract(
                code_id.0,
                owner(),
                &init_msg,
                &[],
                "MACI PrePopulated",
                None,
            )
            .unwrap();

        let contract = MaciContract::new(contract_addr.clone());

        // Query initial pre_deactivate_root (should be 12345)
        let initial_root: Uint256 = app
            .wrap()
            .query_wasm_smart(contract.addr(), &QueryMsg::QueryPreDeactivateRoot {})
            .unwrap();
        assert_eq!(initial_root, Uint256::from_u128(12345));

        // Switch to SignUp mode with StaticWhitelist
        let config = RegistrationConfigUpdate {
            deactivate_enabled: None,
            voice_credit_mode: None,
            registration_mode: Some(RegistrationModeConfig::SignUpWithStaticWhitelist {
                whitelist: WhitelistBase { users: vec![] },
            }),
        };

        let _ = contract
            .update_registration_config(&mut app, owner(), config)
            .expect("Should successfully switch to SignUp mode");

        // Verify pre_deactivate_root is cleared (should be 0)
        let new_root: Uint256 = app
            .wrap()
            .query_wasm_smart(contract.addr(), &QueryMsg::QueryPreDeactivateRoot {})
            .unwrap();
        assert_eq!(
            new_root,
            Uint256::zero(),
            "Pre-deactivate root should be cleared"
        );
    }

    #[test]
    fn test_update_registration_config_switch_to_prepopulated_mode() {
        let mut app = create_app();
        let maci_contract = MaciContract::instantiate_default(&mut app, false).unwrap();

        // Switch from SignUp to PrePopulated mode
        let config = RegistrationConfigUpdate {
            deactivate_enabled: None,
            voice_credit_mode: None,
            registration_mode: Some(RegistrationModeConfig::PrePopulated {
                pre_deactivate_root: Uint256::from_u128(99999),
                pre_deactivate_coordinator: test_pubkey2(),
            }),
        };

        let _ = maci_contract
            .update_registration_config(&mut app, owner(), config)
            .expect("Should successfully switch to PrePopulated mode");

        // Verify pre_deactivate_root is set
        let new_root: Uint256 = app
            .wrap()
            .query_wasm_smart(maci_contract.addr(), &QueryMsg::QueryPreDeactivateRoot {})
            .unwrap();
        assert_eq!(
            new_root,
            Uint256::from_u128(99999),
            "Pre-deactivate root should be set"
        );

        // Verify coordinator hash is set
        let coordinator_hash: Option<Uint256> = app
            .wrap()
            .query_wasm_smart(
                maci_contract.addr(),
                &QueryMsg::QueryPreDeactivateCoordinatorHash {},
            )
            .unwrap();
        assert!(coordinator_hash.is_some(), "Coordinator hash should be set");
    }

    #[test]
    fn test_update_registration_mode_multiple_times_before_voting() {
        // 测试：在投票开始前且无用户注册时，可以多次修改 registration_mode
        let mut app = create_app();
        let maci_contract = MaciContract::instantiate_default(&mut app, true).unwrap();

        // Set block time to be before voting period starts
        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000 - 5 * 60_000_000_000);
        });

        // Update 1: Switch to Oracle mode
        let config1 = RegistrationConfigUpdate {
            deactivate_enabled: None,
            voice_credit_mode: None,
            registration_mode: Some(RegistrationModeConfig::SignUpWithOracle {
                oracle_pubkey: "test_oracle_key_123".to_string(),
            }),
        };

        let _ = maci_contract
            .update_registration_config(&mut app, owner(), config1)
            .expect("Should allow switching to Oracle mode before voting");

        // Verify registration mode is Oracle
        let reg_config: RegistrationConfigInfo = app
            .wrap()
            .query_wasm_smart(maci_contract.addr(), &QueryMsg::GetRegistrationConfig {})
            .unwrap();

        assert!(
            matches!(
                reg_config.registration_mode,
                RegistrationMode::SignUpWithOracle { .. }
            ),
            "Should be Oracle mode"
        );

        // Update 2: Switch back to Whitelist mode
        let config2 = RegistrationConfigUpdate {
            deactivate_enabled: None,
            voice_credit_mode: None,
            registration_mode: Some(RegistrationModeConfig::SignUpWithStaticWhitelist {
                whitelist: WhitelistBase {
                    users: vec![WhitelistBaseConfig {
                        addr: user1(),
                        voice_credit_amount: None,
                    }],
                },
            }),
        };

        let _ = maci_contract
            .update_registration_config(&mut app, owner(), config2)
            .expect("Should allow switching back to Whitelist mode before voting");

        // Verify registration mode is Whitelist
        let reg_config: RegistrationConfigInfo = app
            .wrap()
            .query_wasm_smart(maci_contract.addr(), &QueryMsg::GetRegistrationConfig {})
            .unwrap();

        assert!(
            matches!(
                reg_config.registration_mode,
                RegistrationMode::SignUpWithStaticWhitelist
            ),
            "Should be Whitelist mode"
        );
    }

    #[test]
    fn test_update_registration_config_prepopulated_requires_coordinator() {
        let mut app = create_app();

        // Set block time to be before voting period starts
        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000 - 60_000_000_000);
            // 1 minute before start
        });

        let maci_contract = MaciContract::instantiate_default(&mut app, false).unwrap();

        // Try to switch to PrePopulated without valid coordinator (should fail)
        let config = RegistrationConfigUpdate {
            deactivate_enabled: None,
            voice_credit_mode: None,
            registration_mode: Some(RegistrationModeConfig::PrePopulated {
                pre_deactivate_root: Uint256::from_u128(12345),
                pre_deactivate_coordinator: PubKey {
                    x: Uint256::zero(),
                    y: Uint256::zero(),
                },
            }),
        };

        let result = maci_contract.update_registration_config(&mut app, owner(), config);

        assert!(result.is_err(), "Should fail without valid coordinator");

        let err_string = result.unwrap_err().to_string();
        assert!(
            err_string.contains("pre_deactivate_coordinator")
                || err_string.contains("PreDeactivateCoordinatorRequired"),
            "Expected error about coordinator required, but got: {}",
            err_string
        );
    }

    #[test]
    fn test_query_registration_config() {
        let mut app = create_app();
        let maci_contract = MaciContract::instantiate_default(&mut app, false).unwrap();

        // Query initial configuration
        let config: RegistrationConfigInfo = app
            .wrap()
            .query_wasm_smart(maci_contract.addr(), &QueryMsg::GetRegistrationConfig {})
            .unwrap();

        // Verify initial state
        assert!(
            !config.deactivate_enabled,
            "Initially deactivate should be disabled"
        );

        match config.voice_credit_mode {
            VoiceCreditMode::Unified { amount } => {
                assert_eq!(
                    amount,
                    Uint256::from_u128(100),
                    "Default VC amount should be 100"
                );
            }
            _ => panic!("Expected Unified mode"),
        }

        assert!(
            matches!(
                config.registration_mode,
                RegistrationMode::SignUpWithStaticWhitelist
            ),
            "Should be SignUpWithStaticWhitelist mode"
        );

        // Update configuration
        let update_config = RegistrationConfigUpdate {
            deactivate_enabled: Some(true),
            voice_credit_mode: Some(VoiceCreditMode::Dynamic),
            registration_mode: None,
        };

        let _ = maci_contract
            .update_registration_config(&mut app, owner(), update_config)
            .expect("Should update config");

        // Query updated configuration
        let updated_config: RegistrationConfigInfo = app
            .wrap()
            .query_wasm_smart(maci_contract.addr(), &QueryMsg::GetRegistrationConfig {})
            .unwrap();

        // Verify updated state
        assert!(
            updated_config.deactivate_enabled,
            "Deactivate should be enabled"
        );

        assert!(
            matches!(updated_config.voice_credit_mode, VoiceCreditMode::Dynamic),
            "Should be Dynamic mode now"
        );

        assert!(
            matches!(
                updated_config.registration_mode,
                RegistrationMode::SignUpWithStaticWhitelist
            ),
            "Should still be SignUpWithStaticWhitelist mode"
        );
    }

    #[test]
    fn test_whitelist_queries_in_oracle_mode() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let round_info = RoundInfo {
            title: String::from("TestRound"),
            description: String::from("Test Description"),
            link: String::from("https://github.com"),
        };
        let voting_time = VotingTime {
            start_time: Timestamp::from_nanos(1571797424879000000),
            end_time: Timestamp::from_nanos(1571797424879000000).plus_minutes(11),
        };

        // Create contract with OracleVerified mode
        let contract = MaciContract::instantiate_with_oracle(
            &mut app,
            code_id,
            owner(),
            round_info,
            None,
            voting_time,
            Uint256::from_u128(0),
            Uint256::from_u128(0),
            "test_oracle_pubkey".to_string(),
            "MACI with Oracle",
        )
        .unwrap();

        // In OracleVerified mode without a certificate, all fields should be false/zero
        let status: RegistrationStatus = app
            .wrap()
            .query_wasm_smart(
                contract.addr(),
                &QueryMsg::QueryRegistrationStatus {
                    sender: None,
                    pubkey: None,
                    certificate: None,
                    amount: None,
                },
            )
            .expect("QueryRegistrationStatus should work in OracleVerified mode");

        assert!(
            !status.can_sign_up,
            "can_sign_up should be false without certificate"
        );
        assert!(
            !status.is_register,
            "is_register should be false for unregistered user"
        );
        // is_whitelist is derivable: can_sign_up || is_register
        assert!(
            !status.can_sign_up && !status.is_register,
            "user should not be in whitelist in OracleVerified mode without certificate"
        );
    }

    // ========== enc_pub_key Uniqueness Tests ==========

    /// Sending two separate publish_message calls with the same enc_pub_key must fail
    /// on the second call with EncPubKeyAlreadyUsed.
    #[test]
    fn test_enc_pub_key_duplicate_across_calls() {
        use crate::state::{FEE_DENOM, MESSAGE_FEE};
        use cosmwasm_std::coins;

        let mut app = create_app();
        let maci_contract = MaciContract::instantiate_default(&mut app, true).unwrap();

        app.update_block(next_block);

        maci_contract
            .sign_up(&mut app, user1(), test_pubkey1())
            .unwrap();

        let enc_key = test_pubkey2();
        let msg = MessageData {
            data: [Uint256::from_u128(1); 10],
        };
        let fee = coins(MESSAGE_FEE.u128(), FEE_DENOM);

        // First call with enc_key — must succeed.
        app.execute_contract(
            user1(),
            maci_contract.addr().clone(),
            &ExecuteMsg::PublishMessage {
                messages: vec![msg.clone()],
                enc_pub_keys: vec![enc_key.clone()],
            },
            &fee,
        )
        .unwrap();

        // Second call with the same enc_key — must fail with EncPubKeyAlreadyUsed.
        let err = app
            .execute_contract(
                user1(),
                maci_contract.addr().clone(),
                &ExecuteMsg::PublishMessage {
                    messages: vec![msg],
                    enc_pub_keys: vec![enc_key],
                },
                &fee,
            )
            .unwrap_err();

        assert_eq!(
            ContractError::EncPubKeyAlreadyUsed {},
            err.downcast().unwrap(),
            "duplicate enc_pub_key across calls should return EncPubKeyAlreadyUsed"
        );
    }

    /// Sending a single publish_message batch that contains the same enc_pub_key twice
    /// must fail with EncPubKeyAlreadyUsed on the second occurrence.
    #[test]
    fn test_enc_pub_key_duplicate_within_batch() {
        use crate::state::{FEE_DENOM, MESSAGE_FEE};
        use cosmwasm_std::coins;

        let mut app = create_app();
        let maci_contract = MaciContract::instantiate_default(&mut app, true).unwrap();

        app.update_block(next_block);

        maci_contract
            .sign_up(&mut app, user1(), test_pubkey1())
            .unwrap();

        let enc_key = test_pubkey2();
        let msg1 = MessageData {
            data: [Uint256::from_u128(1); 10],
        };
        let msg2 = MessageData {
            data: [Uint256::from_u128(2); 10],
        };

        // A batch where both messages share the same enc_pub_key — must fail.
        let err = app
            .execute_contract(
                user1(),
                maci_contract.addr().clone(),
                &ExecuteMsg::PublishMessage {
                    messages: vec![msg1, msg2],
                    enc_pub_keys: vec![enc_key.clone(), enc_key],
                },
                &coins(MESSAGE_FEE.u128() * 2, FEE_DENOM),
            )
            .unwrap_err();

        assert_eq!(
            ContractError::EncPubKeyAlreadyUsed {},
            err.downcast().unwrap(),
            "duplicate enc_pub_key within a single batch should return EncPubKeyAlreadyUsed"
        );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Groth16 verify error-propagation tests
    //
    // These tests verify two critical properties:
    //   1. run_groth16_verify() correctly propagates InvalidProof when the proof
    //      bytes do not match the vkey / input_hash (i.e. the `?` operator works
    //      as expected and execution does NOT continue past a failed verify).
    //   2. State mutations that happen *before* run_groth16_verify() (e.g.
    //      NULLIFIERS.save, DNODES.save) are atomically reverted by CosmWasm
    //      when the transaction returns an error.
    // ──────────────────────────────────────────────────────────────────────────

    /// Helper: build the test app + contract used by the verify tests below.
    ///
    /// Returns (app, contract, deactivate_state) where deactivate_state contains
    /// the size/commitment/root values loaded from logs.json (needed by the caller
    /// to submit a ProcessDeactivate call).
    ///
    /// State after this helper:
    ///   - deactivate_enabled = true
    ///   - two users signed-up
    ///   - one deactivate message published (from amaci_test/logs.json)
    ///   - ProcessDeactivate NOT yet called (DNODES[0] is NOT set yet)
    fn setup_contract_with_deactivate_message() -> (
        cw_multi_test::App<
            cw_multi_test::BankKeeper,
            cosmwasm_std::testing::MockApi,
            cosmwasm_std::testing::MockStorage,
            cw_multi_test::FailingModule<
                cosmwasm_std::Empty,
                cosmwasm_std::Empty,
                cosmwasm_std::Empty,
            >,
            cw_multi_test::WasmKeeper<cosmwasm_std::Empty, cosmwasm_std::Empty>,
            cw_multi_test::StakeKeeper,
            cw_multi_test::DistributionKeeper,
            cw_multi_test::IbcFailingModule,
            cw_multi_test::GovFailingModule,
            cw_multi_test::StargateAccepting,
        >,
        MaciContract,
        // (size, new_deactivate_commitment, new_deactivate_root)
        (Uint256, Uint256, Uint256),
    ) {
        let pubkey_file_path = "./src/test/user_pubkey.json";
        let mut pubkey_file = fs::File::open(pubkey_file_path).expect("Failed to open user_pubkey.json");
        let mut pubkey_content = String::new();
        pubkey_file.read_to_string(&mut pubkey_content).unwrap();
        let pubkey_data: UserPubkeyData = serde_json::from_str(&pubkey_content).unwrap();

        let logs_file_path = "./src/test/amaci_test/logs.json";
        let mut logs_file = fs::File::open(logs_file_path).expect("Failed to open logs.json");
        let mut logs_content = String::new();
        logs_file.read_to_string(&mut logs_content).unwrap();
        let logs_data: Vec<AMaciLogEntry> = serde_json::from_str(&logs_content).unwrap();

        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let contract = code_id
            .instantiate_with_voting_time_isqv_amaci(
                &mut app,
                owner(),
                user1(),
                user2(),
                user3(),
                "verify-test-group",
            )
            .unwrap();

        _ = contract.set_vote_option_map(&mut app, owner());
        app.update_block(next_block);

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

        // Publish a deactivate message using the data from logs.json.
        // The message in the JSON has 7 elements; pad the remaining slots with zeros
        // to satisfy MessageData's fixed [Uint256; 10] field.
        // Note: PublishDeactivateMessage requires a 10-DORA fee (10^19 apeaka).
        let deactivate_fee = cosmwasm_std::coin(10_000_000_000_000_000_000u128, "peaka");
        let mut size = Uint256::from_u128(1u128);
        let mut new_deactivate_commitment = Uint256::from_u128(0u128);
        let mut new_deactivate_root = Uint256::from_u128(0u128);

        for entry in &logs_data {
            match entry.log_type.as_str() {
                "publishDeactivateMessage" => {
                    let d: PublishDeactivateMessageData = deserialize_data(&entry.data);
                    let mut msg_data = [Uint256::from_u128(0u128); 10];
                    for (i, v) in d.message.iter().enumerate().take(10) {
                        msg_data[i] = uint256_from_decimal_string(v);
                    }
                    let message = MessageData { data: msg_data };
                    let enc_pub = PubKey {
                        x: uint256_from_decimal_string(&d.enc_pub_key[0]),
                        y: uint256_from_decimal_string(&d.enc_pub_key[1]),
                    };
                    app.execute_contract(
                        user2(),
                        contract.addr(),
                        &ExecuteMsg::PublishDeactivateMessage {
                            message,
                            enc_pub_key: enc_pub,
                        },
                        &[deactivate_fee.clone()],
                    )
                    .expect("PublishDeactivateMessage must succeed in test setup");
                }
                "proofDeactivate" => {
                    let d: DeactivateStateData = deserialize_data(&entry.data);
                    size = uint256_from_decimal_string(&d.size);
                    new_deactivate_commitment =
                        uint256_from_decimal_string(&d.new_deactivate_commitment);
                    new_deactivate_root = uint256_from_decimal_string(&d.new_deactivate_root);
                }
                _ => {}
            }
        }

        (app, contract, (size, new_deactivate_commitment, new_deactivate_root))
    }

    /// Helper: build an app + contract configured so that `PreAddNewKey` can reach
    /// `run_groth16_verify`.
    ///
    /// Strategy:
    ///   1. Instantiate with `SignUpWithStaticWhitelist` + deactivate_enabled (so the
    ///      newkey vkey is stored in GROTH16_NEWKEY_VKEYS).
    ///   2. Before voting starts, switch to `PrePopulated` registration mode via
    ///      `UpdateRegistrationConfig`.  This sets both `PRE_DEACTIVATE_ROOT` and
    ///      `PRE_DEACTIVATE_COORDINATOR_HASH` in storage.
    ///   3. Advance the block into the voting period.
    ///
    /// After this helper, calling `PreAddNewKey` will reach `run_groth16_verify`
    /// without needing a prior successful `ProcessDeactivateMessage`.
    fn setup_contract_for_pre_add_key() -> (
        cw_multi_test::App<
            cw_multi_test::BankKeeper,
            cosmwasm_std::testing::MockApi,
            cosmwasm_std::testing::MockStorage,
            cw_multi_test::FailingModule<
                cosmwasm_std::Empty,
                cosmwasm_std::Empty,
                cosmwasm_std::Empty,
            >,
            cw_multi_test::WasmKeeper<cosmwasm_std::Empty, cosmwasm_std::Empty>,
            cw_multi_test::StakeKeeper,
            cw_multi_test::DistributionKeeper,
            cw_multi_test::IbcFailingModule,
            cw_multi_test::GovFailingModule,
            cw_multi_test::StargateAccepting,
        >,
        MaciContract,
    ) {
        let mut app = create_app();
        let contract = MaciContract::instantiate_with_deactivate_enabled(&mut app, false).unwrap();

        // Switch to PrePopulated mode BEFORE voting starts.
        // This stores PRE_DEACTIVATE_ROOT (zero) and PRE_DEACTIVATE_COORDINATOR_HASH.
        let config = RegistrationConfigUpdate {
            deactivate_enabled: None,
            voice_credit_mode: None,
            registration_mode: Some(RegistrationModeConfig::PrePopulated {
                pre_deactivate_root: Uint256::zero(),
                pre_deactivate_coordinator: test_pubkey1(),
            }),
        };
        contract
            .update_registration_config(&mut app, owner(), config)
            .expect("UpdateRegistrationConfig to PrePopulated must succeed");

        // Advance block into the voting period.
        app.update_block(next_block);

        (app, contract)
    }

    /// Verify that ProcessDeactivate with a mismatched proof (proof bytes from the
    /// addKey circuit submitted for the deactivate circuit) returns
    /// `ContractError::InvalidProof` and does NOT update on-chain state.
    ///
    /// This specifically addresses the concern "会不会这里出现验证失败，却还是会继续运行":
    /// the `?` in `run_groth16_verify(...)?` must propagate the error and halt execution.
    #[test]
    fn test_process_deactivate_mismatched_proof_returns_error() {
        let (mut app, contract, (size, commitment, root)) =
            setup_contract_with_deactivate_message();

        // Use the addKey proof bytes as a deliberately wrong proof for ProcessDeactivate.
        // The IC values for the deactivate circuit differ from those for the addKey
        // circuit, so this proof cannot satisfy the deactivate vkey equation.
        let wrong_proof = Groth16ProofType {
            a: "053eb9bf62de01898e5d7049bfeaee4611b78b54f516ff4b0fd93ffcdc491d8b170e2c3de370f8eeec93ebb57e49279adc68fb137f4aafe1b4206d7186592673".to_string(),
            b: "2746ba15cb4478a1a90bd512844cd0e57070357ff17ad90964b699f962f4f24817ce4dcc89d350df5d63ae7f05f0069272c3d352cb92237e682222e68d52da0f00551f58de3a3cac33d6af2fb052e4ff4d42008b5f33b310756a5e7017919087284dc00b9753a3891872ee599467348976ec2d72703d46949a9b8093a97718eb".to_string(),
            c: "1832b7d8607c041bd1437f43fe1d207ad64bea58f346cc91d0c72d9c02bbc4031decf433ecafc3874f4bcedbfae591caaf87834ad6867c7d342b96b6299ddd0a".to_string(),
        };

        // ── First call: wrong proof must fail ──────────────────────────────────
        let err = contract
            .process_deactivate_message(
                &mut app,
                owner(),
                size,
                commitment,
                root,
                wrong_proof,
            )
            .unwrap_err();

        assert_eq!(
            ContractError::InvalidProof {
                step: "ProcessDeactivate".to_string()
            },
            err.downcast().unwrap(),
            "ProcessDeactivate with wrong proof must return InvalidProof"
        );

        // ── Verify execution halted: processed_dmsg_count was NOT incremented ────
        // Because CosmWasm reverts the entire transaction on error, DNODES.save()
        // and the processed_dmsg_count update (which happen *before* and *after*
        // run_groth16_verify respectively) must both be rolled back.
        //
        // Observable signal: a second call with the SAME wrong proof still returns
        // `InvalidProof`, NOT `AllDeactivateMessagesProcessed`.  If the count had
        // been incremented to 1 (matching dmsg_chain_length=1), the contract would
        // have returned `AllDeactivateMessagesProcessed` instead.
        let wrong_proof_2 = Groth16ProofType {
            a: "053eb9bf62de01898e5d7049bfeaee4611b78b54f516ff4b0fd93ffcdc491d8b170e2c3de370f8eeec93ebb57e49279adc68fb137f4aafe1b4206d7186592673".to_string(),
            b: "2746ba15cb4478a1a90bd512844cd0e57070357ff17ad90964b699f962f4f24817ce4dcc89d350df5d63ae7f05f0069272c3d352cb92237e682222e68d52da0f00551f58de3a3cac33d6af2fb052e4ff4d42008b5f33b310756a5e7017919087284dc00b9753a3891872ee599467348976ec2d72703d46949a9b8093a97718eb".to_string(),
            c: "1832b7d8607c041bd1437f43fe1d207ad64bea58f346cc91d0c72d9c02bbc4031decf433ecafc3874f4bcedbfae591caaf87834ad6867c7d342b96b6299ddd0a".to_string(),
        };
        let err2 = contract
            .process_deactivate_message(
                &mut app,
                owner(),
                size,
                commitment,
                root,
                wrong_proof_2,
            )
            .unwrap_err();

        // Must still be InvalidProof, not AllDeactivateMessagesProcessed.
        // This proves that processed_dmsg_count was properly rolled back after the
        // first failed call.
        assert_eq!(
            ContractError::InvalidProof {
                step: "ProcessDeactivate".to_string()
            },
            err2.downcast().unwrap(),
            "Second call must also return InvalidProof (not AllDeactivateMessagesProcessed), \
             confirming that processed_dmsg_count was rolled back by the first failure"
        );
    }

    /// Verify that PreAddNewKey with a mismatched proof returns
    /// `ContractError::InvalidProof { step: "PreAddNewKey" }` and that
    /// `num_sign_ups` is NOT incremented.
    ///
    /// `state_enqueue` / `NUMSIGNUPS.save` happen *after* `run_groth16_verify`, so
    /// a proof failure must leave the sign-up count unchanged.
    ///
    /// Setup uses `PrePopulated` registration mode so that `PRE_DEACTIVATE_ROOT` and
    /// `PRE_DEACTIVATE_COORDINATOR_HASH` are both in storage, allowing `add_key_internal`
    /// to reach `run_groth16_verify` without requiring a prior ProcessDeactivate.
    #[test]
    fn test_add_new_key_mismatched_proof_returns_error_and_does_not_increment_signups() {
        let (mut app, contract) = setup_contract_for_pre_add_key();

        let num_before = contract.num_sign_up(&app).unwrap();

        // Use the deactivate proof bytes as a wrong proof for PreAddNewKey.
        // This proof was computed for the deactivate circuit; its (A, B, C) points
        // cannot satisfy the newkey vkey verification equation.
        let wrong_proof = Groth16ProofType {
            a: "132a36c4e9653de9ebe2f131e3452319fc4b0f19339083ce52c6dbd5d1d583190f79d3cf25dbf173a959631330f358a334f3977ae2fcfe2e93fb5c5e86dc6ef4".to_string(),
            b: "17c61aea44885cf09a35b41fed13916e8a712cfdc2da041a0c29578d102c559f1bd5a1ae12404f47f8fe3f9cba289f9f9fcdf6e60fb64fe17335a65f00f82eda2a5f55a8181bc191a242a60cb27d7c303059895065219d7e436d95e1dbedec182ffa368e7e99494c75e230452fee2a6b2136444b91bf7cfe7581fea055805dbd".to_string(),
            c: "138d241e6ca289a65ac398af0c1b68b455184a3735e68dd0d5966d8c5ed9629415cab9376a35f9e33a1be5957e8b696e4a3b43363c8df9a460ff70831b63f69b".to_string(),
        };

        let new_key = test_pubkey2();
        let nullifier = Uint256::from_u128(999_888_777u128);
        let d = [
            Uint256::from_u128(1u128),
            Uint256::from_u128(2u128),
            Uint256::from_u128(3u128),
            Uint256::from_u128(4u128),
        ];

        let err = contract
            .pre_add_key(&mut app, owner(), new_key, nullifier, d, wrong_proof)
            .unwrap_err();

        assert_eq!(
            ContractError::InvalidProof {
                step: "PreAddNewKey".to_string()
            },
            err.downcast().unwrap(),
            "PreAddNewKey with wrong proof must return InvalidProof"
        );

        // num_sign_ups must be unchanged: NUMSIGNUPS.save is after run_groth16_verify
        // so it is never reached on proof failure.
        let num_after = contract.num_sign_up(&app).unwrap();
        assert_eq!(
            num_before, num_after,
            "num_sign_ups must not change when PreAddNewKey proof verification fails"
        );
    }

    /// Verify that a failed PreAddNewKey call does NOT permanently consume the nullifier.
    ///
    /// Inside `add_key_internal`, `NULLIFIERS.save()` is called *before*
    /// `run_groth16_verify()`.  If CosmWasm's transactional rollback works correctly,
    /// a proof failure reverts NULLIFIERS.save and the same nullifier can be submitted
    /// again in a subsequent call.
    ///
    /// Test strategy:
    ///   1. Call PreAddNewKey with nullifier N and a wrong proof → `InvalidProof`
    ///   2. Call PreAddNewKey with the SAME nullifier N and a wrong proof again → STILL `InvalidProof`
    ///      (NOT `NewKeyExist`, which would indicate the nullifier was not reverted)
    #[test]
    fn test_add_new_key_wrong_proof_does_not_permanently_consume_nullifier() {
        let (mut app, contract) = setup_contract_for_pre_add_key();

        let wrong_proof = Groth16ProofType {
            a: "132a36c4e9653de9ebe2f131e3452319fc4b0f19339083ce52c6dbd5d1d583190f79d3cf25dbf173a959631330f358a334f3977ae2fcfe2e93fb5c5e86dc6ef4".to_string(),
            b: "17c61aea44885cf09a35b41fed13916e8a712cfdc2da041a0c29578d102c559f1bd5a1ae12404f47f8fe3f9cba289f9f9fcdf6e60fb64fe17335a65f00f82eda2a5f55a8181bc191a242a60cb27d7c303059895065219d7e436d95e1dbedec182ffa368e7e99494c75e230452fee2a6b2136444b91bf7cfe7581fea055805dbd".to_string(),
            c: "138d241e6ca289a65ac398af0c1b68b455184a3735e68dd0d5966d8c5ed9629415cab9376a35f9e33a1be5957e8b696e4a3b43363c8df9a460ff70831b63f69b".to_string(),
        };

        let new_key = test_pubkey2();
        let nullifier = Uint256::from_u128(42_000_000u128);
        let d = [
            Uint256::from_u128(10u128),
            Uint256::from_u128(20u128),
            Uint256::from_u128(30u128),
            Uint256::from_u128(40u128),
        ];

        // First attempt — must fail with InvalidProof.
        let err1 = contract
            .pre_add_key(
                &mut app,
                owner(),
                new_key.clone(),
                nullifier,
                d,
                wrong_proof.clone(),
            )
            .unwrap_err();

        assert_eq!(
            ContractError::InvalidProof {
                step: "PreAddNewKey".to_string()
            },
            err1.downcast().unwrap(),
            "First PreAddNewKey with wrong proof must return InvalidProof"
        );

        // Second attempt with the SAME nullifier and the SAME wrong proof.
        // If the nullifier had NOT been reverted after the first failure, this call
        // would fail with `ContractError::NewKeyExist` instead of `InvalidProof`.
        let err2 = contract
            .pre_add_key(&mut app, owner(), new_key, nullifier, d, wrong_proof)
            .unwrap_err();

        assert_eq!(
            ContractError::InvalidProof {
                step: "PreAddNewKey".to_string()
            },
            err2.downcast().unwrap(),
            "Second PreAddNewKey with same nullifier and wrong proof must still return \
             InvalidProof, not NewKeyExist — confirms the nullifier was rolled back"
        );
    }
}
