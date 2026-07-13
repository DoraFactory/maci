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
        uint256_from_decimal_string, user1, user2, user3, BASE_DELAY, DEACTIVATE_DELAY,
        DEACTIVATE_FEE, MESSAGE_FEE, PER_MESSAGE_DELAY, PER_SIGNUP_DELAY, SIGNUP_FEE, MaciCodeId,
        MaciContract,
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

        // Deactivate is only compatible with Unified VC mode, so a combined update that
        // enables deactivate must also use Unified VC mode. Per-user amounts in the
        // whitelist are ignored in Unified mode (the unified amount applies to everyone).
        let config = RegistrationConfigUpdate {
            deactivate_enabled: Some(true),
            voice_credit_mode: Some(VoiceCreditMode::Unified {
                amount: Uint256::from_u128(100),
            }),
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

        // Verify whitelist users and their VC balances via QueryRegistrationStatus.
        // Unified mode: every whitelisted user gets the same unified amount (100).
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
            "User1 should have the unified 100 VC"
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
            Uint256::from_u128(100),
            "User2 should have the unified 100 VC"
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
            message_fee: MESSAGE_FEE,
            deactivate_fee: DEACTIVATE_FEE,
            signup_fee: SIGNUP_FEE,
            base_delay: BASE_DELAY,
            message_delay: PER_MESSAGE_DELAY,
            signup_delay: PER_SIGNUP_DELAY,
            deactivate_delay: DEACTIVATE_DELAY,
            deactivate_enabled: false,
            hybrid_committee: None,
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

        // Update configuration. Deactivate is only compatible with Unified VC mode, so
        // switching to Dynamic is done with deactivate left disabled.
        let update_config = RegistrationConfigUpdate {
            deactivate_enabled: Some(false),
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
            !updated_config.deactivate_enabled,
            "Deactivate should remain disabled (incompatible with Dynamic VC mode)"
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

    // Deactivate / AddNewKey assigns the rotated key the global voice credit amount,
    // which is only well-defined in Unified VC mode. The contract must reject any
    // effective combination of deactivate_enabled + Dynamic VC mode.
    #[test]
    fn test_deactivate_requires_unified_vc_mode() {
        let mut app = create_app();
        let maci_contract = MaciContract::instantiate_default(&mut app, false).unwrap();

        // Combined update enabling deactivate while switching to Dynamic must be rejected.
        let bad = RegistrationConfigUpdate {
            deactivate_enabled: Some(true),
            voice_credit_mode: Some(VoiceCreditMode::Dynamic),
            registration_mode: None,
        };
        let err = maci_contract
            .update_registration_config(&mut app, owner(), bad)
            .unwrap_err();
        assert!(
            matches!(
                err.downcast::<ContractError>().unwrap(),
                ContractError::InvalidRegistrationConfig { .. }
            ),
            "deactivate + Dynamic must be rejected"
        );

        // Enabling deactivate while staying in Unified mode is allowed.
        let good = RegistrationConfigUpdate {
            deactivate_enabled: Some(true),
            voice_credit_mode: None,
            registration_mode: None,
        };
        maci_contract
            .update_registration_config(&mut app, owner(), good)
            .expect("enabling deactivate in Unified mode should succeed");

        // With deactivate already enabled, switching to Dynamic alone must also be rejected
        // because the effective post-update combination would be incompatible.
        let bad2 = RegistrationConfigUpdate {
            deactivate_enabled: None,
            voice_credit_mode: Some(VoiceCreditMode::Dynamic),
            registration_mode: None,
        };
        let err2 = maci_contract
            .update_registration_config(&mut app, owner(), bad2)
            .unwrap_err();
        assert!(
            matches!(
                err2.downcast::<ContractError>().unwrap(),
                ContractError::InvalidRegistrationConfig { .. }
            ),
            "switching to Dynamic while deactivate is enabled must be rejected"
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
        use crate::multitest::MESSAGE_FEE;
        use crate::state::FEE_DENOM;
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
        use crate::multitest::MESSAGE_FEE;
        use crate::state::FEE_DENOM;
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

    // ── set_round_info permission tests ──────────────────────────────────────

    #[test]
    fn test_set_round_info_success_before_voting() {
        let mut app = create_app();

        // Block time is before voting start (default start: 1571797424879000000 ns)
        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000 - 60_000_000_000);
        });

        let maci_contract = MaciContract::instantiate_default(&mut app, false).unwrap();

        let result = maci_contract.set_round_info(&mut app, owner());
        assert!(result.is_ok(), "Admin should be able to set round info before voting starts");
    }

    #[test]
    fn test_set_round_info_fails_after_voting_starts() {
        let mut app = create_app();

        // Block time is before voting start so instantiate succeeds
        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000 - 60_000_000_000);
        });

        let maci_contract = MaciContract::instantiate_default(&mut app, false).unwrap();

        // Advance to after voting start
        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000 + 60_000_000_000);
        });

        let err = maci_contract
            .set_round_info(&mut app, owner())
            .unwrap_err();

        let contract_err: ContractError = err.downcast().unwrap();
        assert_eq!(
            contract_err,
            ContractError::PeriodError {},
            "Should not be able to set round info after voting starts"
        );
    }

    #[test]
    fn test_set_round_info_fails_exactly_at_voting_start() {
        let mut app = create_app();

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000 - 60_000_000_000);
        });

        let maci_contract = MaciContract::instantiate_default(&mut app, false).unwrap();

        // Set block time exactly to voting start_time
        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000);
        });

        let err = maci_contract
            .set_round_info(&mut app, owner())
            .unwrap_err();

        let contract_err: ContractError = err.downcast().unwrap();
        assert_eq!(
            contract_err,
            ContractError::PeriodError {},
            "Should not be able to set round info at exact voting start time"
        );
    }

    #[test]
    fn test_set_round_info_unauthorized() {
        let mut app = create_app();

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000 - 60_000_000_000);
        });

        let maci_contract = MaciContract::instantiate_default(&mut app, false).unwrap();

        let err = maci_contract
            .set_round_info(&mut app, user1())
            .unwrap_err();

        let contract_err: ContractError = err.downcast().unwrap();
        assert_eq!(
            contract_err,
            ContractError::Unauthorized {},
            "Non-admin should not be able to set round info"
        );
    }

    #[test]
    fn test_set_round_info_empty_title_fails() {
        let mut app = create_app();

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000 - 60_000_000_000);
        });

        let maci_contract = MaciContract::instantiate_default(&mut app, false).unwrap();

        let err = maci_contract
            .set_empty_round_info(&mut app, owner())
            .unwrap_err();

        let contract_err: ContractError = err.downcast().unwrap();
        assert_eq!(
            contract_err,
            ContractError::TitleIsEmpty {},
            "Empty title should be rejected even before voting starts"
        );
    }

    // ============================================================
    // Edge-case behavioral tests
    // ============================================================

    // instantiate must reject start_time >= end_time.
    #[test]
    fn instantiate_should_reject_start_after_end() {
        let mut app = create_app();
        let code_id = MaciCodeId::store_code(&mut app);
        let err = code_id
            .instantiate_with_wrong_voting_time(&mut app, owner(), user1(), user2(), "Group")
            .unwrap_err();
        assert_eq!(ContractError::WrongTimeSet {}, err.downcast().unwrap());
    }

    // StaticWhitelist must reject a second signup reusing an existing pubkey,
    // even from a different (whitelisted) address.
    #[test]
    fn signup_should_reject_duplicate_pubkey_in_static_whitelist() {
        let mut app = create_app();
        let contract = MaciContract::instantiate_default(&mut app, true).unwrap();

        // Enter the voting window.
        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000).plus_minutes(1);
        });

        let pubkey = test_pubkey1();
        contract.sign_up(&mut app, user1(), pubkey.clone()).unwrap();

        // A different whitelisted address tries to reuse the same pubkey.
        let err = contract
            .sign_up(&mut app, user2(), pubkey.clone())
            .unwrap_err();
        assert_eq!(
            ContractError::UserAlreadyRegistered {},
            err.downcast().unwrap()
        );

        // The original mapping must still point to user1's leaf (index 0).
        assert_eq!(
            contract.signuped(&app, pubkey).unwrap(),
            Some(Uint256::from_u128(0u128))
        );
        assert_eq!(contract.num_sign_up(&app).unwrap(), Uint256::from_u128(1u128));
    }

    // A round with zero signups must not be finalizable with non-zero
    // results, but an all-zero finalize is allowed.
    #[test]
    fn empty_round_should_reject_nonzero_results() {
        let mut app = create_app();
        // Empty whitelist => nobody can sign up => num_sign_ups stays 0.
        let contract = MaciContract::instantiate_default(&mut app, false).unwrap();

        // Move past the voting window (start + 12 minutes; window is 11 minutes).
        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000).plus_minutes(12);
        });

        contract.start_process(&mut app, owner()).unwrap();
        contract.stop_processing(&mut app, owner()).unwrap();

        assert_eq!(contract.num_sign_up(&app).unwrap(), Uint256::zero());

        // Non-zero results must be rejected.
        let err = contract
            .stop_tallying(
                &mut app,
                owner(),
                vec![
                    Uint256::from_u128(100u128),
                    Uint256::zero(),
                    Uint256::zero(),
                    Uint256::zero(),
                    Uint256::zero(),
                ],
                Uint256::zero(),
            )
            .unwrap_err();
        assert_eq!(
            ContractError::InvalidEmptyRoundResult {},
            err.downcast().unwrap()
        );

        // All-zero results are accepted and the round ends.
        contract
            .stop_tallying(
                &mut app,
                owner(),
                vec![Uint256::zero(); 5],
                Uint256::zero(),
            )
            .unwrap();
        assert_eq!(
            contract.get_period(&app).unwrap(),
            Period {
                status: PeriodStatus::Ended
            }
        );
    }

    // stop_tallying computes the elapsed time since end_time with saturating_sub.
    // If the block time is earlier than end_time it must still finalize cleanly
    // without panicking.
    #[test]
    fn stop_tallying_does_not_panic_when_block_time_before_end_time() {
        let mut app = create_app();
        let contract = MaciContract::instantiate_default(&mut app, false).unwrap();

        // Advance past the voting window so the round can be processed.
        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000).plus_minutes(12);
        });
        contract.start_process(&mut app, owner()).unwrap();
        contract.stop_processing(&mut app, owner()).unwrap();

        // Rewind the block time to BEFORE end_time (end_time = start + 11 min),
        // exercising the saturating path where current_time < end_time.
        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000).plus_minutes(5);
        });

        // Must not panic; empty round finalizes with all-zero results.
        contract
            .stop_tallying(&mut app, owner(), vec![Uint256::zero(); 5], Uint256::zero())
            .unwrap();
        assert_eq!(
            contract.get_period(&app).unwrap(),
            Period {
                status: PeriodStatus::Ended
            }
        );
    }
}
#[cfg(test)]
#[cfg(test)]
mod test2 {
    use super::*;
    use crate::error::ContractError;
    use crate::msg::{Groth16ProofType, HybridKcConfirmationEntry};
    use crate::multitest::{
        committee1, committee2, committee3, create_app, owner,
        uint256_from_decimal_string, user1, user2, user3, user4,
        MaciContract, MESSAGE_FEE,
    };
    use crate::state::{
        HybridCiphertext, HybridCommitteeConfig, HybridCommitteeMember,
        MessageData, Period, PeriodStatus, PubKey,
    };
    use cosmwasm_std::{Timestamp, Uint256};
    use cw_multi_test::next_block;

    // ==== GENERATED from hybridPublishFixture.json ====
    // 5-message full batch: 3 demo voters, REAL ProcessHybridMessagesOnchain proof,
    // reverse-processed (batchStartHash=0, batchEndHash=hash_of_5_messages).
    #[allow(clippy::type_complexity)]
    fn hybrid_process_fixture() -> (
        [Uint256; 2],
        Uint256,
        Vec<(MessageData, PubKey, HybridCiphertext)>,
        Vec<[Uint256; 2]>,
        Vec<[Uint256; 2]>,
        Uint256,
        Groth16ProofType,
    ) {
        let coord_pub_key = [uint256_from_decimal_string("17818764514199701705904019818885983240053494442260857190906103833655526972635"), uint256_from_decimal_string("20375192377076156497071259932898465702799792208881711741092920179651260965396")];
        let actual_count = uint256_from_decimal_string("5");
        let new_nonce_state_root = uint256_from_decimal_string("20128522001198644075866775738845734504280609575926869493402635345420650640973");
        let messages: Vec<(MessageData, PubKey, HybridCiphertext)> = vec![
            (
                MessageData {
                    data: [
                        uint256_from_decimal_string("19323753134812290448977012820645815381722037629053323873932776781640149585853"),
                        uint256_from_decimal_string("6577485388851806139587390474635641176081753120926965821775866509531712017367"),
                        uint256_from_decimal_string("6609237872544388949930210862829325091949050967447409051014233611471866036723"),
                        uint256_from_decimal_string("15543713482533218079266724173269956061558254034488328934591833537627675241949"),
                        uint256_from_decimal_string("1856004130584969164438652448343695754782494084600419367928604583579441980736"),
                        uint256_from_decimal_string("1015067735320440470907325593769441580360076156569848069956366262887109579285"),
                        uint256_from_decimal_string("1735871256619541014778753719362642929617947793635989908089305624867288569876"),
                        uint256_from_decimal_string("16391874010187818554030244007078414467059749320327613640390767632240704568463"),
                        uint256_from_decimal_string("7039511349642748765617028423217698466426932998067908790566838227334007819739"),
                        uint256_from_decimal_string("2646334706840862092498536675592663916335049035625898044841717233734123762344"),
                    ],
                },
                PubKey {
                    x: uint256_from_decimal_string("2546741955217233081554601807872742035607415578130217930704207158659885430355"),
                    y: uint256_from_decimal_string("14943641239591230339789050886791047156284292986398540424400798433610827333580"),
                },
                HybridCiphertext {
                    c1: vec![
                        [uint256_from_decimal_string("15735668071173373282177824300776162891633967736382577112447833465634956522850"), uint256_from_decimal_string("3943884891387927407867549462402326590602256097116543660660769300028884003691")],
                        [uint256_from_decimal_string("19575184157001080864902861130482342686012142229403095823280834619599771872550"), uint256_from_decimal_string("8605266468738053123426831961253141557113277908318259776790402109240772710079")],
                        [uint256_from_decimal_string("19582932849700648946846868814571757072768506822495209742420133892492865986671"), uint256_from_decimal_string("8303488532966820219297690759281040986556856790312913812129085103832636483831")],
                        [uint256_from_decimal_string("10700375025820288764209455678588425690495179439374809420490762434368198856810"), uint256_from_decimal_string("1451283563812168685437355578627080838199409075433158725103442579625721632266")],
                        [uint256_from_decimal_string("20668817776542066533727810631975214011876154790258447157253967594060334408674"), uint256_from_decimal_string("8488693502622302686373014573753809675527501409565995345040879949794458039097")],
                    ],
                    c2: vec![
                        [uint256_from_decimal_string("7138382701541243626664028208025466112057606123386645236209346638283202299362"), uint256_from_decimal_string("6420329529938090916003238628600158953122138162429889400334466836585160233346")],
                        [uint256_from_decimal_string("21603385148735717774019300090721995855733503163587814326237459319398301231771"), uint256_from_decimal_string("13421570901642367243932377823982603073565684162970149395236338609228623529167")],
                        [uint256_from_decimal_string("10464372249567611705581397290183414845332346122429624775829479795316903305515"), uint256_from_decimal_string("9580570229175059777136281127594844770529540824623273306048352139038743918915")],
                        [uint256_from_decimal_string("13270080454424902302072916668219548268910423947204836051797214537220884962413"), uint256_from_decimal_string("21377411568307512517941375718732594935132236682903873644294310792991008885072")],
                        [uint256_from_decimal_string("11708857047934950778419991161004960907829642618283348255534160472393024398798"), uint256_from_decimal_string("10795329357811414653006181475206030941787395849641128883598222762787898962323")],
                    ],
                },
            ),
            (
                MessageData {
                    data: [
                        uint256_from_decimal_string("12141472915706837803809751588472303097646024621628842645154072522333387258436"),
                        uint256_from_decimal_string("15416307809717038273945831115430773339363595062074831048516343521769998663212"),
                        uint256_from_decimal_string("6806296921683178095682322136087205438366522249999585078963806394275636185878"),
                        uint256_from_decimal_string("13557358014934618684962417908705737821811996009491687513369821067338818320466"),
                        uint256_from_decimal_string("20726262514486925746522180247158820264086911169158715808268022114772831946046"),
                        uint256_from_decimal_string("308434216610071916455877070256210542356813052182723476427455375395090369356"),
                        uint256_from_decimal_string("8640418663547263030625196981611471882248251769372679315594466904861214226531"),
                        uint256_from_decimal_string("17655979499784305946570319020183079404119546843502174285842671899402225170418"),
                        uint256_from_decimal_string("20445579002481693263709225882377235466292343919801451330024847476601970042702"),
                        uint256_from_decimal_string("3309992858675142785323966245292838329220595535112169685766798619857354696541"),
                    ],
                },
                PubKey {
                    x: uint256_from_decimal_string("15188429855583247224715394475928004584363727240469329416207902810937790450610"),
                    y: uint256_from_decimal_string("20535129993178442149412981152333114920760215749115921058724775051695280650553"),
                },
                HybridCiphertext {
                    c1: vec![
                        [uint256_from_decimal_string("18969711245398418209676382269219036747924128469766694734686522790364503865009"), uint256_from_decimal_string("2846414774713636689764340500904075649243044118358472839469405496978795557612")],
                        [uint256_from_decimal_string("5906571681868820504614017507611299355664884025392429840239667809571749596088"), uint256_from_decimal_string("8699629817467531911738918955619674286530162333576493380164468157725199496856")],
                        [uint256_from_decimal_string("1930770952408380166492880771027904836270866745032614533180123132343671915916"), uint256_from_decimal_string("4700109742967734925707604077525816303864822196239222066030492120092262270532")],
                        [uint256_from_decimal_string("3233197051233619453350673869102387083596159163627426599199366703791606557725"), uint256_from_decimal_string("17961247148919188260866166384591697424128366264618431289888204890301060131026")],
                        [uint256_from_decimal_string("6630603863119810327782676430074738757635894261966969141320806891957147400380"), uint256_from_decimal_string("17982422259016449023814861332403302632770225780553715039759899525205683126637")],
                    ],
                    c2: vec![
                        [uint256_from_decimal_string("11675974265334837415927871205733771449380344547648835650978381258274070965153"), uint256_from_decimal_string("13161836563437279149946075183351141064968130041845742132619748875664597116962")],
                        [uint256_from_decimal_string("13767013018976992156556221611240413350294199161003286155903200753618463093164"), uint256_from_decimal_string("13642210910593875215877708498315455664477446672371923464915133599550199246745")],
                        [uint256_from_decimal_string("21730695011066368757615913277555695713831581562151206521666815795535790918042"), uint256_from_decimal_string("17468972356207755155292087697830978807897924096574257362740867382446597954657")],
                        [uint256_from_decimal_string("9199684018381572899746085977903619294107821054057428672652383095812676688526"), uint256_from_decimal_string("19068131953156008923693094459114693165143594725285507408521550451990943734728")],
                        [uint256_from_decimal_string("2645165413130242349434851584895406490410754927784512165594713823866761216879"), uint256_from_decimal_string("11247706649381204846143535070125228548008203958088493220614314191552204447536")],
                    ],
                },
            ),
            (
                MessageData {
                    data: [
                        uint256_from_decimal_string("11168524138510015769017210592161775237745799837413310842989016642312746370248"),
                        uint256_from_decimal_string("9224772230411416458575322902979272349272366908410557951262839698195710322365"),
                        uint256_from_decimal_string("12643886482904903071251816223249358581703947466567640433924909115199859057015"),
                        uint256_from_decimal_string("21853037951285509213289622580110114277421375325069632417034858610908558855346"),
                        uint256_from_decimal_string("4993366690023471402553322268379203220058240396363098523740418228995516763814"),
                        uint256_from_decimal_string("12455467725288673994073328227481742539440169850202498692455181032168640726623"),
                        uint256_from_decimal_string("15120633039633814019375167454833439121151879933642845356053658681393003925637"),
                        uint256_from_decimal_string("21305492215438054927528830991901076509130407353345685093955694767292789102521"),
                        uint256_from_decimal_string("20182439372811560488993171261296186383860472629643759701027745770425365898259"),
                        uint256_from_decimal_string("20611770656965617898863151501223781764157229383736763104416573562803334660877"),
                    ],
                },
                PubKey {
                    x: uint256_from_decimal_string("8360512711486551468738994761674761600446016961544392811958997066034514309358"),
                    y: uint256_from_decimal_string("1821451542806860596997399823049799954468175885248351018367505724882272473542"),
                },
                HybridCiphertext {
                    c1: vec![
                        [uint256_from_decimal_string("14284179753836990670891448455656586485224186334541270976009305727700622340945"), uint256_from_decimal_string("20149994414243657010844135116168816329525460802249124599510852857092806496101")],
                        [uint256_from_decimal_string("14852384162189054725064271560165572377950201826403393006072101640060963195666"), uint256_from_decimal_string("8125844095485980597062890283862499145408527609455700231590007406097154097027")],
                        [uint256_from_decimal_string("20535447861320865124357049576391476188903248957614543364975630780447952692919"), uint256_from_decimal_string("17751280304666591724456273282501581385831012036827858846380613242746720166112")],
                        [uint256_from_decimal_string("19006093266648352079518645286049458494128758446441749570769084761869480107732"), uint256_from_decimal_string("15097065034184636443755149528055466431943124232174299193925481737906740449296")],
                        [uint256_from_decimal_string("6536039184682080849770831061880595110413016586571845981098258839065913090457"), uint256_from_decimal_string("17439405588341070499823405909401717209669299538107462127048904258929546689750")],
                    ],
                    c2: vec![
                        [uint256_from_decimal_string("17975492453685636788005087780055243077126889175455085685654828395730676469441"), uint256_from_decimal_string("7834665311237716937320318147947924822743787697298831673354347568915929741400")],
                        [uint256_from_decimal_string("6606989549298566751457283496462013338958535839063702069820007537901927404726"), uint256_from_decimal_string("14259462798005647535852259525546298983292728063740412688320545009960037409357")],
                        [uint256_from_decimal_string("20805231787344216735487841637622491522045709477024305434739330345534446517149"), uint256_from_decimal_string("12772858238264658364549911991159307710605588374599981791192069270886222661377")],
                        [uint256_from_decimal_string("18498708796418957952927528338693653408634766556899645963663271136855521224826"), uint256_from_decimal_string("12035083009467019453295994625777397641310095624192257919442649372013965656549")],
                        [uint256_from_decimal_string("9945728641924740301483610326005111005945617360323732331497860481312523713278"), uint256_from_decimal_string("742895569785321543685284643244951200437277651352405912537888672499167676605")],
                    ],
                },
            ),
            (
                MessageData {
                    data: [
                        uint256_from_decimal_string("15227715013250977590174574146340677286630235904740673298972411237612304985656"),
                        uint256_from_decimal_string("7956971823456212676662313027170553524698800332519872423929359286485993209895"),
                        uint256_from_decimal_string("5872809758674637105739555723735849658806167981659447076546849126069820690494"),
                        uint256_from_decimal_string("17405245880750120667892419460126286115967579098113335492622982712453172903345"),
                        uint256_from_decimal_string("1239880646671118216266508587325978705207639290420294948419340069288696449082"),
                        uint256_from_decimal_string("20076003284230683033482970600325625620111664672137607126888864269258981326484"),
                        uint256_from_decimal_string("10438943173306443008561445696889399658109793893142597475420080114748236841131"),
                        uint256_from_decimal_string("15159206728654243082514242069124903974753379272427022713616739907003300583499"),
                        uint256_from_decimal_string("15541569528334932386895970647048932185494147908421701831126223002413537582410"),
                        uint256_from_decimal_string("2323827636204541981127951635442776279120064416828695308525843195088362615171"),
                    ],
                },
                PubKey {
                    x: uint256_from_decimal_string("1208349006477542086469685606806428272677896837371535087490700229278596529776"),
                    y: uint256_from_decimal_string("8274812794570909368608284937462001620275337728715986127359626071543386231240"),
                },
                HybridCiphertext {
                    c1: vec![
                        [uint256_from_decimal_string("2435759392247599406038287338376228214005816740246812499770324742746879701200"), uint256_from_decimal_string("21069224971896892328350267992232501339125400854975699491718584433875188523505")],
                        [uint256_from_decimal_string("4955734511916393172336336527611555540548821421573530959411841196687246032495"), uint256_from_decimal_string("16662474484705735764154215734668777100837203534754981671478704848427319432468")],
                        [uint256_from_decimal_string("12110035562510350960795713030058962034576584170910014705540318721259354115173"), uint256_from_decimal_string("11741372020577319065710868029020660135644146442337373404164521650770179960317")],
                        [uint256_from_decimal_string("10778665057388549923157703608069825373365372183903207763039661141800639635406"), uint256_from_decimal_string("3101315868718061607825728391840618607667638106807220141553184308491908556885")],
                        [uint256_from_decimal_string("14509025981760961409095545733537701838565137136648164824370971172455625108066"), uint256_from_decimal_string("17018771398641926301211319464987077001885833595122529680453051513768375930345")],
                    ],
                    c2: vec![
                        [uint256_from_decimal_string("9603631378556012026753152096145127501319599454358383494893051383243455333512"), uint256_from_decimal_string("463945869538288165850318034288029983959926363834777014313661545762002941984")],
                        [uint256_from_decimal_string("19564849913201793831329632635768788135438492512178224169566159997514100437096"), uint256_from_decimal_string("4757993036002729569574665614436721061257436731317203246544642179633809522993")],
                        [uint256_from_decimal_string("7126595291286101768471015889276738867147889210697761572691550739674286802905"), uint256_from_decimal_string("9381636427643527374828382142200368535295361956118245697400788864598249749478")],
                        [uint256_from_decimal_string("19394196991557501257167273163020318870728263062872516162130786038276280367028"), uint256_from_decimal_string("4957858954200554003251751465601161036511317717481063598520894133853866612917")],
                        [uint256_from_decimal_string("6426608897822085081878324794974472127593479290030314595106961173750860566634"), uint256_from_decimal_string("10225482789653168223102210295404218715785104212038538159184579566163330155285")],
                    ],
                },
            ),
            (
                MessageData {
                    data: [
                        uint256_from_decimal_string("12390014834144469085084013539185354561468172029989069367987158267745459656978"),
                        uint256_from_decimal_string("6021130965313512368817930529994703065989232429761499996693137483730251954878"),
                        uint256_from_decimal_string("15943474441052536413667578932931004220564679695585643886402275453894173693083"),
                        uint256_from_decimal_string("11440322970940667588953698453603088545210281909918290668091022971736972736774"),
                        uint256_from_decimal_string("8886043290713814877014572394923769401697959711886515162929559009312948707547"),
                        uint256_from_decimal_string("16244312057926941298339316130574615848513547310022525707457086452445663981289"),
                        uint256_from_decimal_string("15733161453096095753541020299092620032601585574017485405946166876045965545250"),
                        uint256_from_decimal_string("19160889449787218538637630872845573875330893645593817501100869040061710437769"),
                        uint256_from_decimal_string("3506237961011693392828291026568708321674661135835626142134449662039938599241"),
                        uint256_from_decimal_string("21411647965339863661091482911552913731520561929974617368850542611268192822411"),
                    ],
                },
                PubKey {
                    x: uint256_from_decimal_string("21128881609259697929323677011636934859631283610644381420967154899990905243279"),
                    y: uint256_from_decimal_string("19024071174410862211202103977753739585761058926320775628466245155767206067315"),
                },
                HybridCiphertext {
                    c1: vec![
                        [uint256_from_decimal_string("18280207745970465030272477349976479319451399036174101819238689725208891240692"), uint256_from_decimal_string("4045721990151762478296827261683137105712036327962558181747562259054657792861")],
                        [uint256_from_decimal_string("13751732155869430804612727253188659729037424183279728673501872844674541281556"), uint256_from_decimal_string("4591876025870867025124403310320366037374033068523066817310089582742541610217")],
                        [uint256_from_decimal_string("11427221380828464252805787403914627600688284607572699745563699498150875617506"), uint256_from_decimal_string("6796306097112958796646494365377243557995268598995291908537606821674551431783")],
                        [uint256_from_decimal_string("4250766443804506233376597723368781383909171352525804548186268136498048140927"), uint256_from_decimal_string("20638212748227609117375314454645633786586792046517928921056193139926681808114")],
                        [uint256_from_decimal_string("18836940996967659072358084628330702183967916382972313483112922046769640347233"), uint256_from_decimal_string("13141037623858171176033206958447661763436559179848859228975817454043162238388")],
                    ],
                    c2: vec![
                        [uint256_from_decimal_string("4324330947519498653604719411453818054530747952469275531750567324529548656382"), uint256_from_decimal_string("12901662539344912115713356996085282861339126622572391808023079781027661435552")],
                        [uint256_from_decimal_string("19351222175942977316509947850720809194335978551155384729111574521707237013158"), uint256_from_decimal_string("11670498007436844294740227910643680390550606675171978315206055074516736126245")],
                        [uint256_from_decimal_string("17080040978910710236348854398280685976460692090109521051781865258453118973763"), uint256_from_decimal_string("16916131774282438126558444800471066415095291682435075339049982581886679911211")],
                        [uint256_from_decimal_string("3969420884544890940708756511111929768571069728803576837752094869116356953152"), uint256_from_decimal_string("11808202459667458740391250210561702547605444696757299429594157759590770709580")],
                        [uint256_from_decimal_string("15320992549420004508778248914337245012442972441311279586302305385033088335121"), uint256_from_decimal_string("15164227709382675805626825865158082083104999587564128142501987929781797179126")],
                    ],
                },
            ),
        ];
        let new_agg_c1: Vec<[Uint256; 2]> = vec![
            [uint256_from_decimal_string("21353118912712494902094989052002630177575497435268087374977782546058739756167"), uint256_from_decimal_string("12717497031218412688108725240154451891272156815428992884758936524504108198760")],
            [uint256_from_decimal_string("5837135309037545693406020272819241040021408602166992968138308355752256783417"), uint256_from_decimal_string("16900926400208356515502703826256117533205245248581657377549870108933259872590")],
            [uint256_from_decimal_string("18867473642911813644119112646516833595781018869834259917951035067645880878909"), uint256_from_decimal_string("7060985260580460257445144941461095420558808221724358317438166069027043681726")],
            [uint256_from_decimal_string("13694374942239508796802723363861444040925492047057494164740510188827764816039"), uint256_from_decimal_string("5015285135289590630695247254738192198281586340162662941325636744484761571878")],
            [uint256_from_decimal_string("21579512647931630091784877022156199526622002938276615816987427206494360819587"), uint256_from_decimal_string("12009060728429388130487016385461389534012177853511539284359643859499774723017")],
        ];
        let new_agg_c2: Vec<[Uint256; 2]> = vec![
            [uint256_from_decimal_string("15433024022039582410199288073342174780224872235342900888464731771934363681199"), uint256_from_decimal_string("20214895638631493210708555403405616435515973208881490456068200703424732545889")],
            [uint256_from_decimal_string("11390990270597461443505417573994469008665665121486870159211731212336388261045"), uint256_from_decimal_string("2987976167574867104589626460671677631508801364954443163259260328756664028777")],
            [uint256_from_decimal_string("21683423679628040782457705338666027178208375131731408057525773702240405364492"), uint256_from_decimal_string("18810953064272673056734379733869311901030616103510063650728947383612409579034")],
            [uint256_from_decimal_string("18528636745148584524410524892587541830102325654342839176635698815232735107691"), uint256_from_decimal_string("4751599032973252874865678732976292254185089607407059822114507588867608671400")],
            [uint256_from_decimal_string("1142202568136611606939028497860771866604826016185521277605698494986314998990"), uint256_from_decimal_string("20927989001416762265396946294226791383766623993033761043075630876666482749462")],
        ];
        let process_proof =         Groth16ProofType {
            a: "19c1671955c46afb146b09764e75336f6a2cef491ea6fa48355a944b646342f703c5aed4d618c1b02ed88b907af20e4abb5ac7337ca86f0304f6f0897f12918b".to_string(),
            b: "033b6b5fe7e36e8484f9a0eba771aa69f7358df0cb79e7e3582823a5244b9f022782b4827051aff65c41ecd60b65c872ad384dafaaddb114974317e13149cb9d08c231661f12903b728f52c14aab3971272394b5c01faf60592edaad7cf1d9a514b66baa5b460cef2cf66baef65fc5393805190d25b048728a87abf0197a8d2c".to_string(),
            c: "028bd84da2fa56633b371bf6bda754bbb262f08763612d584727ed49fbcbb3e915a32ceaa465a6a997212f92fc3215e4309bcea7af90e36f7d885d6f600b9b56".to_string(),
        };
        (coord_pub_key, actual_count, messages, new_agg_c1, new_agg_c2, new_nonce_state_root, process_proof)
    }

    // Companion fixture: Kc, voter pubkeys, ballot proofs (nullifier + Groth16)
    // all bound to the state root produced by 3x sign_up in instantiate_hybrid_default.
    #[allow(clippy::type_complexity)]
    fn hybrid_publish_fixture() -> (
        [Uint256; 2],
        Vec<PubKey>,
        Vec<(Uint256, Groth16ProofType)>,
    ) {
        let kc = [uint256_from_decimal_string("12638030528432806444680310326288043858520366543569780948011195983100888895424"), uint256_from_decimal_string("2874222432609678237186489396330648906556209135055008837139779509259876658697")];
        let voter_pubs: Vec<PubKey> = vec![
            PubKey { x: uint256_from_decimal_string("8265454795666596656125240298071702470195051017739827855382555757562575706874"), y: uint256_from_decimal_string("17651022999329762667923757296737370771210222197193308584995277648551857814833") },
            PubKey { x: uint256_from_decimal_string("4715974401250111127699083746268308937561418528846266811736423255542344838416"), y: uint256_from_decimal_string("13441991001099811142680021829094172471601907169188638446991109797401190293411") },
            PubKey { x: uint256_from_decimal_string("4924048713913963616383743613637955931969970144272870671762354653678414365399"), y: uint256_from_decimal_string("6826320094766762023406344969915301433742981344912570860537799597515856473618") },
        ];
        let ballots: Vec<(Uint256, Groth16ProofType)> = vec![
            (uint256_from_decimal_string("2580633464407632082114628746467550975790407483227975409759994334022189489676"),             Groth16ProofType {
                a: "2dc0b2fcf8bc3f2c2e0db689f8fe500e9f8fe33ec7939186b23f3abef071316e1d6447164f20ede29836a09577f37b989b3de409c1382ed40c6973179618a9cd".to_string(),
                b: "092819e21bcb5bcc6bce8634df5d5cacda9861103e7fd94eba4931ead2d28f7202ce3f5b3512e67cb9b23e35748f50afba3c31deab447490a6db045620ea7007303634f5ebcf1de7b53f9ab5c60a28fcd9004de13f3ea746c9898378b0b1bd812a91fe23511a468d79a4e93ccc65d143b21dcc8d885de363d9fd879c528420e2".to_string(),
                c: "0c35c610aedfe2b27f616f3f3558df508794d8ceee9d8d50e68a7b5d9f98587023efd6ca6088030628f0410c5bf7e1547bd1adfc0cea97467ab5b54c0187b0e3".to_string(),
            }),
            (uint256_from_decimal_string("1494773118021553136665987072180867352028503343412743619374115035813552507712"),             Groth16ProofType {
                a: "0db8d754d3e501a287ce2cf5cd28b8bb4ffcde20085221eaa9f67d72a198465e08dcd80742b03b27c1425e053a67e8a2b508647c450341e77d8dbe2870f63355".to_string(),
                b: "09349de9a0f8dbb457bc23ac1ef636548bf1115a7b3d56a0d8cd08b29859e84e2d45466af009af6ccef264049f8ed240f29def421afab8a0a7736c0648deba372b759ff7a6615b36f01e39279bc240fcfba6fd48b80e3892657948012858dda1066278c834e0c15ef1f1af4610fb5f333f9b0dbb40766cd23cfe5b29d3414833".to_string(),
                c: "036d953b5c07709b417701acec80b004cf66cb6358f9224f54b15fd604af8723145a1a22bcccad1c15f8d4a9965899b79f8f8cb0eca0ced0a2f017c2d816b997".to_string(),
            }),
            (uint256_from_decimal_string("15475179083673864531071507418452211031370842053881701839777175213612611804486"),             Groth16ProofType {
                a: "0209a2f8c003e6877026324f58984eb5791f616a6fd407201ef17fb7ff7d376c0fbe3da1cba75be142a51bc5da043cc49def9e0573795e091d2a65a542bbaeab".to_string(),
                b: "1116da74a533570ea98689dfbfa23e00f824e8b3392cd71c2b8131ff2437669e036c4992ee633ccf2269974bc178ffd65ba008f63ccb77422a0765931dff81db18f1ecd0c5e2ca24b78d80a677b9af5ac086054120c584982089ceef32ab749511598b92a44491db41bfb2fb2c82bd0cb7d65e549151d1decd81b3733a4efdb9".to_string(),
                c: "0303462e5c2022875f0f947e737603eea1367189bfb71e97efa2dcb61961befd1f1b608d679d581b2cee3231666b9446ba41b853826fd595b80a6911f6e709c1".to_string(),
            }),
            (uint256_from_decimal_string("2580633464407632082114628746467550975790407483227975409759994334022189489676"),             Groth16ProofType {
                a: "0af38c4f11858b4bab5de875e06ca50ae6d9cd6195b05ccb670002039d77c2cb21507022fffe58dc1438432ca1d580dff7d6e835b2e8304ee563c0ba21018a08".to_string(),
                b: "2f4eb094454449b8eea5bc04cd36516708857c8f2dacf97f6eeeb98af2b0fbd42f5f1b1f11ac27631ce18f2711d766ba68d594ac281d22b983ce9ec42ff2ea881d989fa7c4645215b40c988561721cff720f74d25a88c464dd4cca1faa483b4e06ffe419b81eeeaebc952a4419de9b4271de2c659032e28006d086840e936708".to_string(),
                c: "061fcf4161cdd408a7df346daf475210dc19ee77a179c8da4fd4bfb62e4b14d60706eb0cae49a39fd1aeb9f78aaf0ca937e4d7be9b203c2a749bb6a30871dd99".to_string(),
            }),
            (uint256_from_decimal_string("1494773118021553136665987072180867352028503343412743619374115035813552507712"),             Groth16ProofType {
                a: "14ef332532a57e0d2b8e239ccae4beae2b46b9f6b136be777a54c5d7f788fd8e1bda1223f45e5c51eeb09ca79edb5fe9dda98dd8fb6c4935d650244db2cd8827".to_string(),
                b: "1ef9e41f3327d5be921efeba9fac5f7c61b47c6255beecfcad89261dae10adea07236925348bc4a2ff5da731b1f32b62cf212f4e2f9adc2978fc863688fbd1870b76f4a10c6a6314b12b1dc56d3dc1cd924f630681d9733259ebe8a423673f9428a41ecff43467e303f761b3162857bc45b8c34e94445f8203d9383067f261aa".to_string(),
                c: "23b412ef24ad36b778d77b414d5da0de1dbeaa0fe58daff7b95ec349d7e2c92a07af91753f25dc204c51b1c3d53de02f45940072d1d2d13f7fcae4c3699b950e".to_string(),
            }),
        ];
        (kc, voter_pubs, ballots)
    }

    // ==== GENERATED from hybridPartialBatchFixture.json ====
    // 3-message partial batch (< HYBRID_BATCH_SIZE=5); REAL proof covers isReal-masked padding.
    #[allow(clippy::type_complexity)]
    fn hybrid_partial_batch_fixture() -> (
        [Uint256; 2],
        Uint256,
        Vec<(MessageData, PubKey, HybridCiphertext)>,
        Vec<[Uint256; 2]>,
        Vec<[Uint256; 2]>,
        Uint256,
        Groth16ProofType,
        Vec<(Uint256, Groth16ProofType)>,
    ) {
        let coord_pub_key = [uint256_from_decimal_string("17818764514199701705904019818885983240053494442260857190906103833655526972635"), uint256_from_decimal_string("20375192377076156497071259932898465702799792208881711741092920179651260965396")];
        let actual_count = uint256_from_decimal_string("3");
        let new_nonce_state_root = uint256_from_decimal_string("20128522001198644075866775738845734504280609575926869493402635345420650640973");
        let messages: Vec<(MessageData, PubKey, HybridCiphertext)> = vec![
            (
                MessageData {
                    data: [
                        uint256_from_decimal_string("10294229071745935308016294368632471691109189538832959829842699192771044458535"),
                        uint256_from_decimal_string("15674093725266719859735424480496471340877135108325760755408490475965572389249"),
                        uint256_from_decimal_string("9155887371177250388674230314188265568896500901997693970068474014557491438402"),
                        uint256_from_decimal_string("20139867493980593068392240034881520139296101540514703059452318092852140218774"),
                        uint256_from_decimal_string("6268764725933472515346262163719299096106622156217038873850062169202549404974"),
                        uint256_from_decimal_string("6465106538024223805742452525214784913395196840054783279715489933377844066636"),
                        uint256_from_decimal_string("18003320082478706911675785660412962893918689955819417294040742536881197258750"),
                        uint256_from_decimal_string("3998781932602721162836253585806163004016199751081736295598237189836182649773"),
                        uint256_from_decimal_string("483772643971609456833587586065274430741549889588237968442464658135389023184"),
                        uint256_from_decimal_string("3882778891068720537279465732633905782848608712321356127723462258798273990742"),
                    ],
                },
                PubKey {
                    x: uint256_from_decimal_string("21806447871571599376599414582656441336150564498518374553024666697464543314283"),
                    y: uint256_from_decimal_string("1663321004139982725421910986320245103703176180057425147602544498383150096169"),
                },
                HybridCiphertext {
                    c1: vec![
                        [uint256_from_decimal_string("14792512805293473053170688501924516783874338284866579339596801646978169473135"), uint256_from_decimal_string("2324909642017276331221629323944440539939455880283013267819097951535789603506")],
                        [uint256_from_decimal_string("6767131003027681493448330680257790530024480702546194077894680926239968855954"), uint256_from_decimal_string("14319779363752862419932258756524959582672814502463001657393258239037926347230")],
                        [uint256_from_decimal_string("13712609532489882229015937442395299703352673008110997379135013140723503013403"), uint256_from_decimal_string("17883936973200741890463949239737804050711448081311023304761621514327735688217")],
                        [uint256_from_decimal_string("15558348998615196349703887111952623631366642216644106956918581647918927010284"), uint256_from_decimal_string("6367943311864611716219162694748628356221835252156359579279865292610332679249")],
                        [uint256_from_decimal_string("295351784417946996002654980411749167213339771990010122748878487504576084030"), uint256_from_decimal_string("20192458534292568096826813181971698253880361605840743123533435511783884688740")],
                    ],
                    c2: vec![
                        [uint256_from_decimal_string("12225425842960622309617755224886091695120047980933066511036199555583651533350"), uint256_from_decimal_string("5347930138830744662715073462077691554037293366234838500737771466944503178747")],
                        [uint256_from_decimal_string("1773414314973700930222968986971341110964503392176380781412688484549579675795"), uint256_from_decimal_string("2828394341591764679235692530861923871599835648822879336499398585557114886540")],
                        [uint256_from_decimal_string("5739107674232835863428974178743064581889968483040659401518380340349661582327"), uint256_from_decimal_string("21783307925916601802402433235724432273154778612488777379793196597917235748055")],
                        [uint256_from_decimal_string("10817417027397989204549278567672980182198637625485118154909051969745937728421"), uint256_from_decimal_string("9749472494802647530192571027701748517910409012618984762117057238902269990232")],
                        [uint256_from_decimal_string("10464620551992780600666579395938814688997564038189773101307860360591359487190"), uint256_from_decimal_string("12064617271582666876046050559355648195040368145327438281264136507045057015261")],
                    ],
                },
            ),
            (
                MessageData {
                    data: [
                        uint256_from_decimal_string("21871764060658171705199111178009168531904177589680335259057176960953398331893"),
                        uint256_from_decimal_string("12561564200703419844650063382149230808363010571461575500292601285497060674776"),
                        uint256_from_decimal_string("13277570150099056590517362538951634816326221996999497184032369864202672783140"),
                        uint256_from_decimal_string("4928203458096677528602495206271198895865240339577332368146455873307535305899"),
                        uint256_from_decimal_string("11596282653808294493715353606647325529811221151543687755355213840711645278684"),
                        uint256_from_decimal_string("9089167893565688781071386428250491480574613044403444772668656635616255357979"),
                        uint256_from_decimal_string("3323524802891079988425857104148519393072766190376725445120200724791120616779"),
                        uint256_from_decimal_string("18229371055834726622852039533018084671904148745777288355553385525967035692674"),
                        uint256_from_decimal_string("3748349723496246949763573077759764394784870624285235023803617270460352190025"),
                        uint256_from_decimal_string("5970540934688117300023031388825018315054461627530207156676274581413099603052"),
                    ],
                },
                PubKey {
                    x: uint256_from_decimal_string("3679008096724006980854218964280184152367391926049129615798826806146175977305"),
                    y: uint256_from_decimal_string("14121256492372085842477594079279575920032910996297421980567542209405041390602"),
                },
                HybridCiphertext {
                    c1: vec![
                        [uint256_from_decimal_string("828456308484178694486591996617489881679399394582621584008361385531166159230"), uint256_from_decimal_string("1955909508378990443790819579646739272496606466470245258308721835991428535759")],
                        [uint256_from_decimal_string("2435851791156420905848960019639076434347612090823553960254954573066107706073"), uint256_from_decimal_string("1799148370417967121360523807395433618775953285753408221382910684784342061965")],
                        [uint256_from_decimal_string("1184309326354645514232410326741790673838352089374368190543524599334766938810"), uint256_from_decimal_string("3953956605339463707316548316714023316934075270055394804284269339490936200266")],
                        [uint256_from_decimal_string("10069756485157078273006203901500326817185149754137414135291008501506280976496"), uint256_from_decimal_string("5935161458263842959828090527401337472586552020489759558146263414172869094089")],
                        [uint256_from_decimal_string("17372890541046177720556871216376772098884130386673925299267676547251865316303"), uint256_from_decimal_string("15509073885954676738689862289086190202684918476332493670532001321500368030686")],
                    ],
                    c2: vec![
                        [uint256_from_decimal_string("11961939032521276211095763603572625786905426894170721020359076419671737127982"), uint256_from_decimal_string("20753282774366173268810059642739688192284599856930486277591664024687230296910")],
                        [uint256_from_decimal_string("3949281078264895013707999737432422644733337272218034421165074251628687319025"), uint256_from_decimal_string("13765654612050835592931013412009385938564487368088771840335111324221554950593")],
                        [uint256_from_decimal_string("3396116073006669131803469294260054529583460577282538988525382470764777300386"), uint256_from_decimal_string("21266600612242797969659687360541237065063333954011305977922097533832304691840")],
                        [uint256_from_decimal_string("17873126671950408152700107928439162968617981640036218373327274294320288072756"), uint256_from_decimal_string("11575960813978714715553514315866357090921073555707494821873465208481187197865")],
                        [uint256_from_decimal_string("6891091433163092368814399925106482071430814553431417692775949201437009574749"), uint256_from_decimal_string("11675237368396900845483109968772706696396252244533727974886744578240010290536")],
                    ],
                },
            ),
            (
                MessageData {
                    data: [
                        uint256_from_decimal_string("15403288080333806351205198937672420994916203422037902976936838915410492820143"),
                        uint256_from_decimal_string("20395168945088752779094840339612128540775304842550757786125317783702188744348"),
                        uint256_from_decimal_string("19481913397272004268109697077564493583194693258542216927644277896554009048198"),
                        uint256_from_decimal_string("13369797013100037211381374233792588770760712742307627406152548799172425297137"),
                        uint256_from_decimal_string("12290306380758212485131378098712812023374315986585178438118101794691488792335"),
                        uint256_from_decimal_string("20818538282785006990465960354811449951554075081171134200184031074860632541488"),
                        uint256_from_decimal_string("17984551768784843715658938008399799095798335815661884998726428200811657870514"),
                        uint256_from_decimal_string("11748257650093584804522018810073969274642440031772770860157620489410553229669"),
                        uint256_from_decimal_string("3591563580550751547725907284066478413664970182820355319548922279668787047283"),
                        uint256_from_decimal_string("616828953413119299532794420386259100160009190337974909501955431048562962511"),
                    ],
                },
                PubKey {
                    x: uint256_from_decimal_string("21748304266848698653074754193171743445455510195802999864788783500458581498200"),
                    y: uint256_from_decimal_string("20052126941519596635354796379473393465605840142807232488325908923689518694136"),
                },
                HybridCiphertext {
                    c1: vec![
                        [uint256_from_decimal_string("21655300962170703268654291399143616970673075815316497012330328484960156419316"), uint256_from_decimal_string("8107161917787986634118687263812015662070479600304810656069047466208432783056")],
                        [uint256_from_decimal_string("9936361083445924600291200906673890756979533138046792577014972623936924576256"), uint256_from_decimal_string("10617092247075115737982861158954889166976269628050090886430155201079955734535")],
                        [uint256_from_decimal_string("7538656130806874408049130349651027074654289390372501216580643390678130875821"), uint256_from_decimal_string("3605408612260957860758177401729299578369995241019654138499307941825841106461")],
                        [uint256_from_decimal_string("6741235411136513784151469862618225513091323958802356903394992167420968741647"), uint256_from_decimal_string("3198902424105360264383361776290929529033385914198827849460804643059507527001")],
                        [uint256_from_decimal_string("16158854304071697725120368899033268248651978023621677687140909917689709390798"), uint256_from_decimal_string("8689846573218488186890046083738043235799469061542150362600546612482466911576")],
                    ],
                    c2: vec![
                        [uint256_from_decimal_string("5196985699299344606991544869586636675482178581422295115652076733128351273836"), uint256_from_decimal_string("10731151919679331238110709541819931302656366454252836796079323974938915101770")],
                        [uint256_from_decimal_string("17055138647377328888629009751091705004881034783943989796782707873230647592297"), uint256_from_decimal_string("19346478944387090790939981476115826393275769592459679111661621537272619340584")],
                        [uint256_from_decimal_string("21199052252885759788991234015660630435784314509895461006180885047524749599916"), uint256_from_decimal_string("10298324946612765251013704323238658339241230125017100827420020442099283729078")],
                        [uint256_from_decimal_string("9572346117358177865166405835805136509098587933022808925382420519861757041098"), uint256_from_decimal_string("50269375197542728634791458152956967166845249609470722825024441884314430222")],
                        [uint256_from_decimal_string("11585266490918483949266088088215538628543149489537230793789405245844052590386"), uint256_from_decimal_string("2815845213973395961110010058534846881569554834508999683352136838213063763838")],
                    ],
                },
            ),
        ];
        let new_agg_c1: Vec<[Uint256; 2]> = vec![
            [uint256_from_decimal_string("9263775176223943462174757525510672259419914631579532049695566683167479440482"), uint256_from_decimal_string("2094146996096095012646684625389842360448135322061046813532574398024957365153")],
            [uint256_from_decimal_string("14783971865467986875018777934854253284956345822331671093748601462928405826944"), uint256_from_decimal_string("6530433043063106409131983931195390800366505305141250386918725239425852562367")],
            [uint256_from_decimal_string("11472597665816637281300344517803632625865599749300686589719012414132031194607"), uint256_from_decimal_string("1536236895163664304090172420464373221181223051581864894569190712732742886893")],
            [uint256_from_decimal_string("9856627819505765241333085745459103081619564481707319384206128933529530457535"), uint256_from_decimal_string("4412464987303950971010138493446458379734959966244850207573953215483842346363")],
            [uint256_from_decimal_string("5501532796864967895612501308987781120481190435241967465284721896893578511298"), uint256_from_decimal_string("18616868706466721689821648553038141624830079297647541644538338841421868088410")],
        ];
        let new_agg_c2: Vec<[Uint256; 2]> = vec![
            [uint256_from_decimal_string("21812025898356049411043316942736388090270071159245894820545525068607497354173"), uint256_from_decimal_string("4243215849187604851307610571847447541462880874203902277500702954220289745911")],
            [uint256_from_decimal_string("17236560224464053823136930214082343516700902289362461424878425584226309429432"), uint256_from_decimal_string("15318628895691677642326144504421798488212139551648568876554856235096654507317")],
            [uint256_from_decimal_string("14706928772097746119349856731119337139215570690465558077533192931724208333206"), uint256_from_decimal_string("20174576991223995351475187333006247873392081987330698100143626215839102482163")],
            [uint256_from_decimal_string("13001490852927498264512803680368621734378460120684273879719908520101105027808"), uint256_from_decimal_string("8116438161910601049201599943513643664314375117272478654638829794143306052917")],
            [uint256_from_decimal_string("12075528894604476174439252577919721368656216158372422735391492550274914516870"), uint256_from_decimal_string("20097352307970461236064663770156895248125590509410580863146950847770213703880")],
        ];
        let process_proof =         Groth16ProofType {
            a: "079a04dde0bc64e5ecbcca2410ab784dfd3250633d3c6b0a1708accc230399901eda7fea22da50622d404b4254da0579c9240bb50276f2dc2a026645002a8465".to_string(),
            b: "2e71ffc10d0af3ea5c91fa867730a562e4752f20819c1c63ae6d793eb39f02c10a48980234a1d0ed994c51aaff4ba26fa50c6c6b3c24d8484632abce4956ba5c0b2cf6f444b232cfe9b104ce3a52ae7690bd151200fc1b702d6e7c010bf39aeb1f197feb59ccc8a1057cc8dc69dc92b8b51b914dd78ff5b01fca0dec7c85905b".to_string(),
            c: "1e76da8187d5350f9f3440464634141b4000e083b94e264b4579f2f5c0e9c8451612bd9307b148f18a7ea8d04274b0f99a9b2609ab22ae0238b7a2254476706a".to_string(),
        };
        let ballots: Vec<(Uint256, Groth16ProofType)> = vec![
            (uint256_from_decimal_string("2580633464407632082114628746467550975790407483227975409759994334022189489676"),             Groth16ProofType {
                a: "1a713a3f4aa7806349f5cd15231fc880929865ac0ad681dc367979b8aa9d5b490c20af6f2a205e78b3df94d73c4439b8175d8797b73f8ef024e4a33dec29a2d9".to_string(),
                b: "0445ce80aea126f0ee2ab1733daa04bfa21a67888111e75c7c07a738f4771da02e405aee925461b031832c0feddfb5d2ffb4e8c8a6a82a1580994ce74deacc7f0336389425d56a1c14954234d6be921955b57e23335bb1a00d8b08e6388bd8000fa12ae9747e5d47beca00bac7184f5fd6d1e913f12981e621e7fa637045f584".to_string(),
                c: "0d50b82473248ab2ab49773252792104d0d0d24f610057f31278106e9438fd9e02ac5c6f84618146fa0c2c4c506972db601473861410d70770579f96e75dd736".to_string(),
            }),
            (uint256_from_decimal_string("1494773118021553136665987072180867352028503343412743619374115035813552507712"),             Groth16ProofType {
                a: "2e2318257fcbfe8f6b7a3b305e137d49311e4c4aa38dd221b0f7590f78be82a7237dda28906eefe31698e09a948170a6cc92c76cc9b1010374fd3c22249c8d27".to_string(),
                b: "2a74d29325c5ca2816f6ba0a2470b476e78db56d180b42334a9f66ae597b297c0f094bdd61a841a30ea5b2ff287c9f2021722b2e7288fd5cc7032840704ebac004142457d1a59dd4b131c4b8b6fbc7d8f3863e64e10a9fe029dd2ef759077aeb0f304a1b55084aa9b8dc221b16002c451257842897a9273564dcc2dc7975f7ae".to_string(),
                c: "22707e341fc9f3f41aebc3f14f004fecb4f0e9a2c6eee64f70c0d8a3f1431a16119781fcb0f43447952d350ee290d7b4c7b0a5521e5877cf4481a166c9022786".to_string(),
            }),
            (uint256_from_decimal_string("15475179083673864531071507418452211031370842053881701839777175213612611804486"),             Groth16ProofType {
                a: "18fc7add3a1839311fa41d86c6bd25d7a9bc835888b8ae4025fbd9601dad4359192d82e35a0505029f274dd3dadda2b50cba7b0feae546d6dfa12b8073c2192a".to_string(),
                b: "24375b57509004628dba8b76e931c8d1866f7d90aad8df0ea36a1fc21d10abf42db812673aaf67b7241092203e3a97404668e3e8c1ba18472ad68a9933cab12e1edd5fab91a94c37aee7db7e334d74cf2d1edc99d150229c13bee53f3468d89609bb775391181c61c780be92cbe6088e94cb0f6f7fedc70e29a19ea3ccf8212d".to_string(),
                c: "2bbd8e9cbc0cc7870dac42ff76f27476624893223642fc57c3bff7a666cdeea323290759ab091741f5b87089155863618890947cc28dd2320ea8dacfd690891e".to_string(),
            }),
        ];
        (coord_pub_key, actual_count, messages, new_agg_c1, new_agg_c2, new_nonce_state_root, process_proof, ballots)
    }

    // ==== GENERATED from hybridMultiBatchFixture.json ====
    // 6 messages, 4 voters, TWO chained ProcessHybridBatch calls (reverse order).
    // batch1 (first contract call): processes messages[1..5] (chain indices 1-5)
    // batch2 (second contract call): processes message[0] (chain index 0)
    #[allow(clippy::type_complexity)]
    fn hybrid_multi_batch_fixture() -> (
        [Uint256; 2],
        Vec<PubKey>,
        Vec<(Uint256, Groth16ProofType)>,
        [Uint256; 2],
        (Uint256, Vec<(MessageData, PubKey, HybridCiphertext)>, Vec<[Uint256; 2]>, Vec<[Uint256; 2]>, Uint256, Groth16ProofType),
        (Uint256, Vec<(MessageData, PubKey, HybridCiphertext)>, Vec<[Uint256; 2]>, Vec<[Uint256; 2]>, Uint256, Groth16ProofType),
        (Vec<Uint256>, Uint256, Vec<PubKey>, Vec<Uint256>, Groth16ProofType),
    ) {
        let kc = [uint256_from_decimal_string("12638030528432806444680310326288043858520366543569780948011195983100888895424"), uint256_from_decimal_string("2874222432609678237186489396330648906556209135055008837139779509259876658697")];
        let coord_pub_key = [uint256_from_decimal_string("17818764514199701705904019818885983240053494442260857190906103833655526972635"), uint256_from_decimal_string("20375192377076156497071259932898465702799792208881711741092920179651260965396")];
        let voter_pubs: Vec<PubKey> = vec![
            PubKey { x: uint256_from_decimal_string("8265454795666596656125240298071702470195051017739827855382555757562575706874"), y: uint256_from_decimal_string("17651022999329762667923757296737370771210222197193308584995277648551857814833") },
            PubKey { x: uint256_from_decimal_string("4715974401250111127699083746268308937561418528846266811736423255542344838416"), y: uint256_from_decimal_string("13441991001099811142680021829094172471601907169188638446991109797401190293411") },
            PubKey { x: uint256_from_decimal_string("4924048713913963616383743613637955931969970144272870671762354653678414365399"), y: uint256_from_decimal_string("6826320094766762023406344969915301433742981344912570860537799597515856473618") },
            PubKey { x: uint256_from_decimal_string("3581606918980777415203546809988471586420866133795555059730862275475402405019"), y: uint256_from_decimal_string("1205222093914345685219448539799520963033816985811888907604794234934443298335") },
        ];
        let ballots: Vec<(Uint256, Groth16ProofType)> = vec![
            (uint256_from_decimal_string("2580633464407632082114628746467550975790407483227975409759994334022189489676"),             Groth16ProofType {
                a: "2fc62033b2db5583a3a5686ae90946b94c783a7f6cfda118675557b8e489cd260e9c159637b74364148106643abb319ebdba862c29d81426312cc0464426f8b9".to_string(),
                b: "2544477e60491cbd1046849625b7755cb537a9d2a849409a63a6616df3ded04b17ea6353793284981da807692c42ac5bc8f859b2b4bb99c064c01220cdeab7182acbd0becdcb4afb99df07c91fc66bd92892784244afd1c1687dc27fddeacada087804152b0b25a53c3fd9fd1738be98ab23accf74dd5875db05314c11aa24c9".to_string(),
                c: "076d0d166d88510a1bd74ee2b49adfa075cc3874745094c77a37af61b86d32c12031b3ef5d80e64bcd515c7c7571a308bdbc8262664e4ac53fb325393a0330da".to_string(),
            }),
            (uint256_from_decimal_string("1494773118021553136665987072180867352028503343412743619374115035813552507712"),             Groth16ProofType {
                a: "14ea83f5b122a58d91db239e42cf9ee8d584d762922d9993b74beb57c5ba3d410753616465c8c4af7a3023066c8749f3fa0de1d58e316760b1e36ce551d73806".to_string(),
                b: "2e343be820adcc13211558cae761228b50450180cc0f2b823a0073927960c12528acf38464b3c6fb2794408af9067a0fc539c38410486091ee1edfaaa048624d1e5b3cd6c7d79f560097c247b7a7aa2f6470df60f0c5f5c80858a65f37a4ea590d851bb5d0a04e79eee1e41ee37caa5bb645eb09a10b241f8b8e092de2106dc7".to_string(),
                c: "1c563305985185e91e20f3bc17f601c9f31e1cad1352342cfb9ad0a9e23c663d1b709322bd60e9bd8be932a7940ff4ef73962c0e263413c4a579624007021426".to_string(),
            }),
            (uint256_from_decimal_string("15475179083673864531071507418452211031370842053881701839777175213612611804486"),             Groth16ProofType {
                a: "0d757f3eed756f12827ebd494bc24c163a92dc4553ace0612ab1efbc5b6dbe952b5f791f899372ce7b1707ab3811b20a495d303cbd19bd75d2e126a5c5d682d6".to_string(),
                b: "2ea4295c705ad5ff7e937dcaf9a1cfe60ce67b0e3837943b65aa25161fc1677f10314e5c40f5afbe43e5f96eb27f9a19389973c2e0b762028f72ddaeada97dad2da6331ed891a798872720afbc14501f3ffa1534f9bd15c2f797b9a2a9ff912519347781162631df68a9eac8d5b2095431c4aded9d0a00835ff877e24703670c".to_string(),
                c: "124df891b93b3e1a430c038388e2e0365797c23636bd2e41b5e17d2a3a3ee7ae0b9504520f6f2af3d6e2ecbbc73a7e218ea0e2db589fd73ab88eb31388324d6c".to_string(),
            }),
            (uint256_from_decimal_string("2580633464407632082114628746467550975790407483227975409759994334022189489676"),             Groth16ProofType {
                a: "129d9d87a06921cad0e59341194520fb39e599e9bb4387e34bd6e6568f9acc5a1d21c893ceb6c00a0a1fe9ef68ff938b409122ea1073a5545ba4e7cce9500288".to_string(),
                b: "08cbe37d25498ce538e58021585d3868eb4bb36cfd5e375413c6b0bd5387b0ef178eab697adb7903404f45798cecc15bb356ded939d2e917fade8498b7ce7f072903629c3cb8bceaa956af41fee390a5b24286e88949fd13a0cc553d1d83eecf258458fe477683ee73f6d6e0b9a69252411aa43aefb07dc9db04c442a138d3f8".to_string(),
                c: "012de2ef19ddb55d5ba3b3c2fd1e1ea3c1c436e73959da21fc55830635d1f4ba1bb947d59b83c2796e6ebea36ffa0d1f731b0812133887ebf6ee61092a7817eb".to_string(),
            }),
            (uint256_from_decimal_string("1494773118021553136665987072180867352028503343412743619374115035813552507712"),             Groth16ProofType {
                a: "05dce6adfd0bf07ee357922e01322a5cbf1604059bcd126de062c69089ac1d601372fdbd09aa753f44fd3fce95aa55052f83559797d780e826c9242287014341".to_string(),
                b: "2d68956c6d42aacdb3838d9e1f425b62bf33f3f26462d62455c8c7b5ea949fc10b6fd95261cbd6d557b91f30aeed7625a99231ebd30d504f3a5693352e589c66002992676078383e01d59db2b522a32fcd3ab433472f5e8204d65f134a53ec110ca9a085c365b44c64bb663b42be2d1f12560f7a741a21c150942c69ae67fac1".to_string(),
                c: "304b42f67e0adf48df60159f6963a6c0493c991a08a56d1e99af981c45bd390a035392f840d484cb18695de30c7374e8a7b6d03674663ef777344854fd599c7e".to_string(),
            }),
            (uint256_from_decimal_string("13341661616625141516965270844803228748611428302074781154070356745683997744114"),             Groth16ProofType {
                a: "1f43071f58d76c8d18cd65aac375714af46fdbc0d91544e5fcc40922bef5322b2b7a941521748c1a3b10936202a7fdfb0fe3090de0d47a46b424da94d905453d".to_string(),
                b: "21d0679bd405833bef2da4911021d2f94e86291afd99bd446652e533c41ed1552534c98efab26133a28bb66d0ad5825cdeae0e25b0a3ccf755bda72a17aa4dc7124369d643288c3fc3f322090c788854b3f94a606e5d63e7e3807aa45ebdeb7e01cfc188f3e6efaac2ef1425c13d92367d99a5d7fc97eeda3cd20543e36597c7".to_string(),
                c: "2c8070c49b70136e788dad5f2f8e919cf74515da8bfa0146a03c1d0699aa18cc28205873ae5e523671211c0624ab45610f0ef42e66c1e2be6074314f8485c38b".to_string(),
            }),
        ];
        let batch1_messages: Vec<(MessageData, PubKey, HybridCiphertext)> = vec![
            (
                MessageData {
                    data: [
                        uint256_from_decimal_string("15361052787779267578763355591646376491683357565488799803321412830346703686909"),
                        uint256_from_decimal_string("18338546295702357455093398239109469973030961568809955132072620310652927741123"),
                        uint256_from_decimal_string("12702991607925650149562548000479679316935702531823331807361978613875096899656"),
                        uint256_from_decimal_string("7367266679828962333863240388889604518365407205765154856868885822360123693722"),
                        uint256_from_decimal_string("20631656225411843742186392897753072873472549256256344158486708130546915603798"),
                        uint256_from_decimal_string("16444954188407636006803071192139310703153358924917041522356057910188264967220"),
                        uint256_from_decimal_string("4672476154048649683116132025856737852767722411447165059934774179529760915752"),
                        uint256_from_decimal_string("19933045683280554937056196642232325126438985940607172243511214327620663175827"),
                        uint256_from_decimal_string("20524818055337240312229425269396896703577885105639991321343010938625078748140"),
                        uint256_from_decimal_string("13663741680275964578350979565972412526362852854912354947424484757324722579579"),
                    ],
                },
                PubKey {
                    x: uint256_from_decimal_string("11588708557663978104598098671159408753010087697745530648134135784095902951511"),
                    y: uint256_from_decimal_string("19966279161372773222733926433144353785465523506107634732689070421166827846218"),
                },
                HybridCiphertext {
                    c1: vec![
                        [uint256_from_decimal_string("16737737133567867554723900788241959359279593632430439732141579139795323259165"), uint256_from_decimal_string("5002414145689061709764324180989933665207463134342398157724277647828051269327")],
                        [uint256_from_decimal_string("2168951973384652647454009898843804304643076349896055004588889716788657755139"), uint256_from_decimal_string("1769011926787020108003183992796454841784532796717220727670573188516066272644")],
                        [uint256_from_decimal_string("21497560054847515017581662122641266799530781983632623209210216471607766611343"), uint256_from_decimal_string("14438458888346550759610271510475735345456326537813949074145164352888479488978")],
                        [uint256_from_decimal_string("2613046418982843023225426118027356469841185030387703868560733590560040359629"), uint256_from_decimal_string("7466190452967609471967475440116254558602311335777887518083058590586595560356")],
                        [uint256_from_decimal_string("17393665415898028278789622902238125334166339573720297656688121557973223991831"), uint256_from_decimal_string("8912956703081840994348275131783700528567672628248819252888917005114996676868")],
                    ],
                    c2: vec![
                        [uint256_from_decimal_string("18043938386949157460652721672392557728914092717740882010935413323026493243082"), uint256_from_decimal_string("13378246770261847716888059808756246905520257266690236228502107312366462122186")],
                        [uint256_from_decimal_string("16267239088190327809053004712580074284039963429733604964566941086572925487817"), uint256_from_decimal_string("13428736415088189224224216758845210233549668428240367760346459541133499238093")],
                        [uint256_from_decimal_string("16216429569943423234395885355878078009375052792658997611823633938979233347013"), uint256_from_decimal_string("14377658009124046334067226588139663436017138417643663202623379901924086153225")],
                        [uint256_from_decimal_string("12963426102046190852755196031637285821978020250190466819286344757431757522007"), uint256_from_decimal_string("6677910613060703211055487231249394630858963586165383109423102899019167848173")],
                        [uint256_from_decimal_string("7759307813321593097805868980132556341692911920311776246589263597267566364600"), uint256_from_decimal_string("10096330077008559606496904871371764209129761303653400163706090551326256224745")],
                    ],
                },
            ),
            (
                MessageData {
                    data: [
                        uint256_from_decimal_string("14920160724720734229403856187819314559902117915531695463335958511605296700556"),
                        uint256_from_decimal_string("3194830633217569644881353790148777430826950724311265789807149646884944449620"),
                        uint256_from_decimal_string("8462347659660077314505052628821569701725426780649547772222802272199958504347"),
                        uint256_from_decimal_string("2981598032833307030124038620473112687545905123409493934823769870619113935019"),
                        uint256_from_decimal_string("10491717139718794177224677129012045588434025004316448631003932858228765248848"),
                        uint256_from_decimal_string("20051936325141867047813678690962818533082356794539403864725553564177752378423"),
                        uint256_from_decimal_string("1736614699265547795729147446721109663959018565814478923731886376401056571868"),
                        uint256_from_decimal_string("3969862885785567218806615163160520587172127501695304344034892679809169275610"),
                        uint256_from_decimal_string("3592000956580525590754620209159448998838803136018465915995008702375444707807"),
                        uint256_from_decimal_string("12407107216701769067236110526500719738897363126854251398880567389810362516814"),
                    ],
                },
                PubKey {
                    x: uint256_from_decimal_string("5623063952036543217384842492026855375396504982396064346483494442340402795576"),
                    y: uint256_from_decimal_string("7933716341029488854321384765203354592389515346674055366964807906138135194397"),
                },
                HybridCiphertext {
                    c1: vec![
                        [uint256_from_decimal_string("2208885768904908065103933799175218494399424262627942831807714108639009845132"), uint256_from_decimal_string("7338651452868365341293449123566674361682196498057043694476767592092732128262")],
                        [uint256_from_decimal_string("9550584425984695462647562001424812519092577843337705597828861139077162313693"), uint256_from_decimal_string("3150933255728705945519447117592127940524120196237863695260531212758896758170")],
                        [uint256_from_decimal_string("1208016324865762201757704442147376596231321007832812246016795270390878020869"), uint256_from_decimal_string("11276198470359887638102644187129486656543836520533489170859883395402262633946")],
                        [uint256_from_decimal_string("2441621359056379752189966687138594196904826051027232732019136751866881726540"), uint256_from_decimal_string("11672411092307760191033058090972376452589906361764195699077168536364863924512")],
                        [uint256_from_decimal_string("9913069212536769907087000060114218889743040323882108055326258090794136991259"), uint256_from_decimal_string("17180435406075355777008666824486175322307758814389338109947797858392132274987")],
                    ],
                    c2: vec![
                        [uint256_from_decimal_string("12633674242654333750784000246791871477818934386561125720702159388538833898516"), uint256_from_decimal_string("20318202786889595019637543228315854039237601542347756648721609218735974718978")],
                        [uint256_from_decimal_string("17324284357345397313754768093919556010430824342769224050552097620905223185000"), uint256_from_decimal_string("7988996435791974420309816235460505813564492759619049838831409808640648072379")],
                        [uint256_from_decimal_string("12683895573097433305976050678943521711630112204727558399322891043943488557152"), uint256_from_decimal_string("20628911494354694539465847655638317397731568680071472529759179416597531201593")],
                        [uint256_from_decimal_string("18299063461160754409654552113034723524894063177823503805312791842426066419131"), uint256_from_decimal_string("4353052738881144882517493793874308607176622664434203587753822732203438337410")],
                        [uint256_from_decimal_string("18116507502320069768870126989375742369396560126808603181497507502795762067048"), uint256_from_decimal_string("3073033107686659221075290453967437155713414197987808888013476655775618190161")],
                    ],
                },
            ),
            (
                MessageData {
                    data: [
                        uint256_from_decimal_string("13470165309493230601319346350284850664151452852491959853924150198579970912287"),
                        uint256_from_decimal_string("8215777036460325904848024588605541876140562567648964908098996437902332138203"),
                        uint256_from_decimal_string("2481354824480980441484219292063891717509017941357180917920418975818250776076"),
                        uint256_from_decimal_string("20192526298016137687360080329235071364433927115369165905318220044535471709570"),
                        uint256_from_decimal_string("13928589728842271269207910552605566340283278138618107381791209688073736282323"),
                        uint256_from_decimal_string("8166385400913380459794418401580821384237223287211707062432212405324911133042"),
                        uint256_from_decimal_string("15970733414491099324442762968693946252520001300453053038651978353465711780693"),
                        uint256_from_decimal_string("17852839430155147038449172323152969674656944583690718378778212010681152774083"),
                        uint256_from_decimal_string("3565827948349357467976098242749243133818565856112720060449060488185984976056"),
                        uint256_from_decimal_string("19485805217851381131069583959191035012980815121356193175091351998825458787023"),
                    ],
                },
                PubKey {
                    x: uint256_from_decimal_string("18284790631244386868523900874694522658410198044413604717437988362871986068850"),
                    y: uint256_from_decimal_string("14225452694280308090641811825701113915701088622682326458721317089305174247158"),
                },
                HybridCiphertext {
                    c1: vec![
                        [uint256_from_decimal_string("18876845247114075811587648786045112475702112592870162130183363993595728829223"), uint256_from_decimal_string("6615470953720768096615817011865204482269501962918388821880713241290318667162")],
                        [uint256_from_decimal_string("11024927749785155202019052379473411979014935118766038297027263764757923094920"), uint256_from_decimal_string("15895154765728230347174485383397369610586639324922256370388059478679113250324")],
                        [uint256_from_decimal_string("18622149650474477504118241186110284751878924614690005253001464106576806677350"), uint256_from_decimal_string("12523401831122855510273570441563149876860419819299950738796822237172859925682")],
                        [uint256_from_decimal_string("10876732066363837226336817889105313678497846281999446254088965776104393912457"), uint256_from_decimal_string("2187870594224512877813495903768296715149594792475816024857856326446793831117")],
                        [uint256_from_decimal_string("8886777133065092905313980761442306136343122936181869238598314531795035686565"), uint256_from_decimal_string("2899630629006138533947319543176975941875534917286134032359948666729915167043")],
                    ],
                    c2: vec![
                        [uint256_from_decimal_string("13103006173163865123253350372700780954033961996031821841444070814976954164669"), uint256_from_decimal_string("17301692245808913736869622779881572742323702966277176769267766854910108025011")],
                        [uint256_from_decimal_string("9742793958796631344066553168247284714396147519814566838447852624575004026802"), uint256_from_decimal_string("10398065110174044921807112827083485716493290222760033540475841541274175188901")],
                        [uint256_from_decimal_string("20180450794044267652493178528423088346710090147678316040294172757096659210228"), uint256_from_decimal_string("19962169718349003138330540483000569775639192212948207478922555047089521330103")],
                        [uint256_from_decimal_string("21056980290842172265391379286769425643972269711072845948422610217029856212889"), uint256_from_decimal_string("21184760186848585054829279259627139716589374624926950366455776552792255406340")],
                        [uint256_from_decimal_string("11799746373639559610037648346064927675804759005199205910011099596505461828942"), uint256_from_decimal_string("2552411107542848583250346973956666778534466405036785102403258457031114096296")],
                    ],
                },
            ),
            (
                MessageData {
                    data: [
                        uint256_from_decimal_string("15665676974928173260031571238555619575665508686552849506791367275382140445981"),
                        uint256_from_decimal_string("12346815450399866985512416310923626735535821302773742774833303143749111300709"),
                        uint256_from_decimal_string("8295325172825016675706420185343173784525952094117444830246713883597021383150"),
                        uint256_from_decimal_string("16653656995885191735657701516661195793442832512198984522719933071530729665752"),
                        uint256_from_decimal_string("5096678001680311198139990132342047176086734591192569024682811932565541190564"),
                        uint256_from_decimal_string("7586885933598373228299283144146488966813030323178537294346749172416755824734"),
                        uint256_from_decimal_string("11726240154735702634951336412099490595930399436931345776252059637837659121541"),
                        uint256_from_decimal_string("19992084601970186413639737014440262285432064880922271153564784298364211073320"),
                        uint256_from_decimal_string("14837144808343498953026630176013466535534430342317489637550176982482258209106"),
                        uint256_from_decimal_string("1794918552805581964304007582227443539498612599907714520165683972156281039573"),
                    ],
                },
                PubKey {
                    x: uint256_from_decimal_string("16101005712718833580030137503930526019737104521349926639351489573895386992387"),
                    y: uint256_from_decimal_string("7493672997838706327162524129862195933589697087694354391998736663244123878768"),
                },
                HybridCiphertext {
                    c1: vec![
                        [uint256_from_decimal_string("9958606523733252716799161199638695685919276749543832715575276553045704795165"), uint256_from_decimal_string("14046670276564807684864583591086215428657769064862404069297551986393417886202")],
                        [uint256_from_decimal_string("7398466843247643288781816814062079482808427922032375714024558278085023478879"), uint256_from_decimal_string("7580719992038396864264953613309270542316858287902161253636724811826566949365")],
                        [uint256_from_decimal_string("16785207345230351892939029081782477552240880804827593692858514617975875732968"), uint256_from_decimal_string("17496695409256525485901112422499816775080630375634680527309082320444777514688")],
                        [uint256_from_decimal_string("7506561997467154302112166909128392242480251232230177212387542650070272652101"), uint256_from_decimal_string("8950951897244649354992328410856091842757107075763663587935870458272523115913")],
                        [uint256_from_decimal_string("9848268307411251820502106144173389027277069207497330299852876781083292687649"), uint256_from_decimal_string("11529010723822507436447978844260855925427153871746005701958082238288918871319")],
                    ],
                    c2: vec![
                        [uint256_from_decimal_string("9684256096667248583034901569816999248190944090141558429787407042159575038800"), uint256_from_decimal_string("14866192760218140203311544740329932441030061086067532196046541173692034184173")],
                        [uint256_from_decimal_string("11563495444489697706314667107768813993342879381575349450782006256353838379186"), uint256_from_decimal_string("13964657677288766196089685855667432545151355094268088503492198139623458877047")],
                        [uint256_from_decimal_string("13673122266541191259666456707285271677186283144387988033253112332722982627008"), uint256_from_decimal_string("6834893909325460135705477169408278908675951035509983304139925761451012868614")],
                        [uint256_from_decimal_string("5311698325425574306479943687140599311349848881042388570463422212561719090756"), uint256_from_decimal_string("10063109231782134305638357472106942708033672249805233652672828699231061628021")],
                        [uint256_from_decimal_string("12685185573326174466149999151014479527311853637061427241583089610513618957020"), uint256_from_decimal_string("13290832975984922986170325775867778831820526769722108817752122040977311273264")],
                    ],
                },
            ),
            (
                MessageData {
                    data: [
                        uint256_from_decimal_string("7846491504612541174032516387772309569066360222972356464610385236268856435147"),
                        uint256_from_decimal_string("7837526224950483069112617517307730143073457772571348115170006358033111133371"),
                        uint256_from_decimal_string("8208820314474903949232373938249094149940911650101223340958688943857830480382"),
                        uint256_from_decimal_string("3714815585621626870214544942431026977396838444469835587787426045352250631143"),
                        uint256_from_decimal_string("7626521361639601828936089527178220656664094556946419429897298138803590065913"),
                        uint256_from_decimal_string("12086301515024118383124812098121764740391393791754028130818350157943094726765"),
                        uint256_from_decimal_string("9939087649567293417637876547291528677564416386089624074979007626624583922269"),
                        uint256_from_decimal_string("19662335793053698137895932028164291920616027807170177617903967948302795628682"),
                        uint256_from_decimal_string("18401078097686230313596556654019157837233577826009306162704541465377919295330"),
                        uint256_from_decimal_string("18547404445569535669190117063742088067717477141941779929629755548639620833082"),
                    ],
                },
                PubKey {
                    x: uint256_from_decimal_string("19563052593097547964019577982636037853687670411668715887679455993390467161151"),
                    y: uint256_from_decimal_string("12981573145955590969572627461483108809957382507343341339343054936033979260476"),
                },
                HybridCiphertext {
                    c1: vec![
                        [uint256_from_decimal_string("11382800068794892853454899414538213928890006474865762132422540984607285566696"), uint256_from_decimal_string("16337927713371052641790023059753762135633345264559674881534157361684579960192")],
                        [uint256_from_decimal_string("4892736485782708879831773084825171341496753064917864322655889753220010992827"), uint256_from_decimal_string("4251388400006715606301688402085916622791444930274752413650665510848507946999")],
                        [uint256_from_decimal_string("13218289063881306472994294086458744443009962282686315072691293976490952254363"), uint256_from_decimal_string("5410889814178328326172951581090401952803780583674274515103545955039132874962")],
                        [uint256_from_decimal_string("18980997055164074614819470330743805433807557252009604394815612395333138617115"), uint256_from_decimal_string("12534164006487452265319408585949154684937375719534883563715386270468148919390")],
                        [uint256_from_decimal_string("786898048705536724809265574536939871587245680746011953425593675239398148167"), uint256_from_decimal_string("8195571398650213107956734410521762232688816481905047954784558494349267205932")],
                    ],
                    c2: vec![
                        [uint256_from_decimal_string("1066614757411474743199596225429378504754645764729749323832820039805048528887"), uint256_from_decimal_string("3614326627670708630448828449927312877128099144954942932047945248358769132866")],
                        [uint256_from_decimal_string("14999771351147586087383772132946682558125824441642255137344098903393884727481"), uint256_from_decimal_string("13613318350632517230901612482669680815502011673185048683365642841455686719292")],
                        [uint256_from_decimal_string("985673999516404573948218253762040336970922104199123890430186873399231842847"), uint256_from_decimal_string("7614191747217980544298830231785475938614927367702122550074895542355804674283")],
                        [uint256_from_decimal_string("4489626669478150915606848098250347593643604372475378117150264777242269060995"), uint256_from_decimal_string("20670381314793531173003717527770153704234304773550947413353137039069268035061")],
                        [uint256_from_decimal_string("2802621134126558500584160416957423256249457778446781892998881979504056581907"), uint256_from_decimal_string("19681955580736580393777223599408729178005754730929596041899761949133247040333")],
                    ],
                },
            ),
        ];
        let batch2_messages: Vec<(MessageData, PubKey, HybridCiphertext)> = vec![
            (
                MessageData {
                    data: [
                        uint256_from_decimal_string("11861690016408697376107237785672653347809406641859473645152032701145717166969"),
                        uint256_from_decimal_string("15407159841980614893023429500140298786272631710958833571175837750266634512907"),
                        uint256_from_decimal_string("17773414062563792538534714782036762359586621161940906060687587156452519782440"),
                        uint256_from_decimal_string("17393797110162914771864516309393285772033092678852830442701356299554324435038"),
                        uint256_from_decimal_string("9019912788061523565422244443689484504621559778774287328561244064450475662962"),
                        uint256_from_decimal_string("20819803669237628185096676899799786020460091580519179137650895243080230039557"),
                        uint256_from_decimal_string("12247185859716468930200537661292406915224298418028359964822695374824245312692"),
                        uint256_from_decimal_string("8591297959217091254038367842545129900442470886713970559185522671105019253557"),
                        uint256_from_decimal_string("18124707510347294348150314130297328204734966633909596264819025614294351229805"),
                        uint256_from_decimal_string("8342081294751947163300024727201194905396321312360589112229669907409292551201"),
                    ],
                },
                PubKey {
                    x: uint256_from_decimal_string("7444146713229551520939111881119484598439798951424524047112444218252664907879"),
                    y: uint256_from_decimal_string("19151847245046800912892877292106914615873112039152837893941202055343431126957"),
                },
                HybridCiphertext {
                    c1: vec![
                        [uint256_from_decimal_string("12923791214146336770686271912363001741640995402464310400490184553301271270440"), uint256_from_decimal_string("11585939033838614282018337052099575437066539537654449139089612096207628536325")],
                        [uint256_from_decimal_string("9332256602426931941708265664715958510734447658196325233110066117987084371029"), uint256_from_decimal_string("17845545685932987732595584332367091350174730019392626653131117947166937935690")],
                        [uint256_from_decimal_string("19869464950349908424814050720542921575803343612894351648015478130677827684682"), uint256_from_decimal_string("10709633057148488484227314707416818139865188181599941760090025567220998902355")],
                        [uint256_from_decimal_string("11066738495296487466981224493573941111976086413907412588816636942620436621323"), uint256_from_decimal_string("6254748354910251771520684881708780479053988998146947802313145956605896761925")],
                        [uint256_from_decimal_string("19069400777777106940587362317028395405886252306309373376880898153853562100125"), uint256_from_decimal_string("10234545158248186186818709465033546716943681781809359691644627364454788096875")],
                    ],
                    c2: vec![
                        [uint256_from_decimal_string("17529338855281011253179567986127963742909803941819270365708171415793583870656"), uint256_from_decimal_string("2828752334431442517063846749061378436912276475701350508733087018866515292054")],
                        [uint256_from_decimal_string("6321480683570394989879277317829947596786203833442659968161195019619237174785"), uint256_from_decimal_string("8258811016220728669554336774326052564731348999857190748137588429327595837585")],
                        [uint256_from_decimal_string("275311830773608158793894164136617398914766972596538229999924087799671377868"), uint256_from_decimal_string("2815744113786400634091991189021634237964636851515034507302770440454538808279")],
                        [uint256_from_decimal_string("5458151519419157806674910301314556440173165620547928576196868052769544112750"), uint256_from_decimal_string("14151336450642976526809062965946017023453116226374562627182989024422051870917")],
                        [uint256_from_decimal_string("17556586086433878843138631701781979862693190741117159939154749247893303671828"), uint256_from_decimal_string("6458712833944399377829076229940574169824397336877849956174076805347699078364")],
                    ],
                },
            ),
        ];
        let batch1_new_agg_c1: Vec<[Uint256; 2]> = vec![
            [uint256_from_decimal_string("8887329975027991769313617239522807251201571830935979001966414170441014017415"), uint256_from_decimal_string("19412398536065588325125474826245420426887509616887671266097694503834898861189")],
            [uint256_from_decimal_string("1596896186105365827644783522136656051647197684694932161676108427460757981727"), uint256_from_decimal_string("11026261704651203665074380434352308712680579483453269946406113272673984601589")],
            [uint256_from_decimal_string("6439727071518704195135680769444836258529396690189172296543817613508097081311"), uint256_from_decimal_string("14072919669951335099987775311427809349815209209885655579096410908561494814161")],
            [uint256_from_decimal_string("10503816332525045308661314145897551143991090084104417156226107755585710514742"), uint256_from_decimal_string("781646362790015731246664720808007316303509476746358175962346329202732370094")],
            [uint256_from_decimal_string("20674891951066992208397276068460721200827232468154887193883649027207094376233"), uint256_from_decimal_string("7478145369029027957032223830997151315878423430683244392917807569264386452900")],
        ];
        let batch1_new_agg_c2: Vec<[Uint256; 2]> = vec![
            [uint256_from_decimal_string("9509682384629541015189739457653618629969167105967937697428966477544921604188"), uint256_from_decimal_string("7647835155488730050352189613748366144484185297623466265425479524377310039067")],
            [uint256_from_decimal_string("6842909070135535966010824991939063610224086544888209020490189847402590227148"), uint256_from_decimal_string("2275784037861917424508027286678030327941405160310538350138724405002710714482")],
            [uint256_from_decimal_string("8515834730829254193058608570588340451080146607919088151871878737585928615496"), uint256_from_decimal_string("9275954837520953508779899136871173849703402085725700237251894296610791404052")],
            [uint256_from_decimal_string("20912386973352995883544024612654297974285423313438223960983588789890689485345"), uint256_from_decimal_string("14974801117368709343816898527290038499108600099392076413381618744120516498796")],
            [uint256_from_decimal_string("2433320334967814840432060231799446002304694872903144146121141482912048289191"), uint256_from_decimal_string("11295733906826603903797861294090993806605796276443744575090175602937797458735")],
        ];
        let batch2_new_agg_c1: Vec<[Uint256; 2]> = vec![
            [uint256_from_decimal_string("8887329975027991769313617239522807251201571830935979001966414170441014017415"), uint256_from_decimal_string("19412398536065588325125474826245420426887509616887671266097694503834898861189")],
            [uint256_from_decimal_string("1596896186105365827644783522136656051647197684694932161676108427460757981727"), uint256_from_decimal_string("11026261704651203665074380434352308712680579483453269946406113272673984601589")],
            [uint256_from_decimal_string("6439727071518704195135680769444836258529396690189172296543817613508097081311"), uint256_from_decimal_string("14072919669951335099987775311427809349815209209885655579096410908561494814161")],
            [uint256_from_decimal_string("10503816332525045308661314145897551143991090084104417156226107755585710514742"), uint256_from_decimal_string("781646362790015731246664720808007316303509476746358175962346329202732370094")],
            [uint256_from_decimal_string("20674891951066992208397276068460721200827232468154887193883649027207094376233"), uint256_from_decimal_string("7478145369029027957032223830997151315878423430683244392917807569264386452900")],
        ];
        let batch2_new_agg_c2: Vec<[Uint256; 2]> = vec![
            [uint256_from_decimal_string("9509682384629541015189739457653618629969167105967937697428966477544921604188"), uint256_from_decimal_string("7647835155488730050352189613748366144484185297623466265425479524377310039067")],
            [uint256_from_decimal_string("6842909070135535966010824991939063610224086544888209020490189847402590227148"), uint256_from_decimal_string("2275784037861917424508027286678030327941405160310538350138724405002710714482")],
            [uint256_from_decimal_string("8515834730829254193058608570588340451080146607919088151871878737585928615496"), uint256_from_decimal_string("9275954837520953508779899136871173849703402085725700237251894296610791404052")],
            [uint256_from_decimal_string("20912386973352995883544024612654297974285423313438223960983588789890689485345"), uint256_from_decimal_string("14974801117368709343816898527290038499108600099392076413381618744120516498796")],
            [uint256_from_decimal_string("2433320334967814840432060231799446002304694872903144146121141482912048289191"), uint256_from_decimal_string("11295733906826603903797861294090993806605796276443744575090175602937797458735")],
        ];
        let batch1_actual_count = uint256_from_decimal_string("5");
        let batch1_new_nonce_state_root = uint256_from_decimal_string("2833166335706068362997727908011245257485718383501093387389025037101697700872");
        let batch1_proof =         Groth16ProofType {
            a: "05f1ccfcd05f52e08195e381d9861cd75ff2274d688cdb50f5ce6b49bd25c54b09aacea44a282ba6965765abed755afe3ed94a23a84324e1dc3f2ba64652eec8".to_string(),
            b: "086de078976d59b12f66610dafafe952a8c2f7cb36c4015fa40fc0d108a7409e114a05e0c0b5e9347448c13442f63504c9663036e66c7ae34a395b197a62ad051b2d8c10ca041694867cb88ad797898bd69c1f91b71ddaff10d1a7b5e0569b5a044c8935596f4ed49e92054bf92cf9dcf5433db793641eac290d41fafad317f5".to_string(),
            c: "147d72f91f8eb074b04e96558d7b1db769bcc7fea5beaa08fad0b32910017a2128663c17dba35852efd7e458c35fc3b113483f00989d505e3a9e7235106ebb27".to_string(),
        };
        let batch2_actual_count = uint256_from_decimal_string("1");
        let batch2_new_nonce_state_root = uint256_from_decimal_string("2833166335706068362997727908011245257485718383501093387389025037101697700872");
        let batch2_proof =         Groth16ProofType {
            a: "1687c7da63f2a920ff7ab2c19e8f34b398e688d87864d2266a7b1a2c3010a316137ae6f73021d4d7385cd5d6a3c1a17e512ef22473a746fc2e57ee71c3ffe1cc".to_string(),
            b: "1b664c9f59447de3dfff74cd15311bec106ee81b194501169c468c940abc7b2e042d8649b1b5403ec1184012e513a1ffc592b28770ea0d860febb3471294fe101e65294bc9ab93b0422601c4b52e814ca688b2ed5fd851334f04b1576a3d4f4a21167d2d22aef72d2c4eb8a071304c9b2c66e9362d9426aeede53b972ff5534c".to_string(),
            c: "2106a6f04acf4c6d823e4bdd5bbb9c304df8b7035fb8bef9a89fc6f1778231cc18876413f3a902e5ceadca0dc302040c84368fbf25cc0e41d11027a2bb19b249".to_string(),
        };
        let reveal_results: Vec<Uint256> = vec![
            uint256_from_decimal_string("5"),
            uint256_from_decimal_string("0"),
            uint256_from_decimal_string("4"),
            uint256_from_decimal_string("1"),
            uint256_from_decimal_string("2"),
        ];
        let reveal_salt = uint256_from_decimal_string("4242");
        let reveal_participant_pub_keys: Vec<PubKey> = vec![
            PubKey { x: uint256_from_decimal_string("4864899991292966285039326886114995530797438431053360503065080873169221193412"), y: uint256_from_decimal_string("6853265169388957555803862987705973148067710644793822381168216039376923050656") },
            PubKey { x: uint256_from_decimal_string("21644658723485080274236649396451253763983307540799052914711536473333816570612"), y: uint256_from_decimal_string("10532070064212391985634680642919861126702695449055773362657974530711355717278") },
        ];
        let reveal_participant_indices: Vec<Uint256> = vec![
            uint256_from_decimal_string("1"),
            uint256_from_decimal_string("2"),
        ];
        let reveal_proof =         Groth16ProofType {
            a: "2606f70de8d372aef330e3586a83797dc31801700e6e4ea532d0a16007ca315d07fd99f51bcb7947007a35f5efcb72abc8709968ac0f68077b5a54a708a78433".to_string(),
            b: "03a3b218f4cc7067df7ce7a269eec775338ea66c7aba9d202a2f11fdef20a6331f5acc857a7ddaffd54c6f2a5c969e66f805c782863a920b94571d8de9db221321c61d79d360c1e68370d524a2052a8622a315d406aa90f80e90355517faeed424e475c95efa8eca1dab2f2887c7ada65424bca7c702467c854e25953e6ab534".to_string(),
            c: "1554d48732a4805632f228a7f9c86d524906e37e5f4d5a3543f97172bcde9dc401ee41cf021f0b9bd2eb23ae83075f09c4f18caa9059b37b63dae9252c7a8995".to_string(),
        };
        (
            kc,
            voter_pubs,
            ballots,
            coord_pub_key,
            (batch1_actual_count, batch1_messages, batch1_new_agg_c1, batch1_new_agg_c2, batch1_new_nonce_state_root, batch1_proof),
            (batch2_actual_count, batch2_messages, batch2_new_agg_c1, batch2_new_agg_c2, batch2_new_nonce_state_root, batch2_proof),
            (reveal_results, reveal_salt, reveal_participant_pub_keys, reveal_participant_indices, reveal_proof),
        )
    }

    // ==== GENERATED from hybridRevealE2eFixture.json ====
    // REAL RevealVerifyOnchain_hybrid_1-2 proof (2-of-3 committee threshold).
    fn hybrid_reveal_fixture() -> (
        Vec<Uint256>,
        Uint256,
        Vec<PubKey>,
        Vec<Uint256>,
        Groth16ProofType,
    ) {
        let results: Vec<Uint256> = vec![
            uint256_from_decimal_string("0"),
            uint256_from_decimal_string("0"),
            uint256_from_decimal_string("4"),
            uint256_from_decimal_string("1"),
            uint256_from_decimal_string("2"),
        ];
        let salt = uint256_from_decimal_string("777");
        let participant_pub_keys: Vec<PubKey> = vec![
            PubKey { x: uint256_from_decimal_string("4864899991292966285039326886114995530797438431053360503065080873169221193412"), y: uint256_from_decimal_string("6853265169388957555803862987705973148067710644793822381168216039376923050656") },
            PubKey { x: uint256_from_decimal_string("21644658723485080274236649396451253763983307540799052914711536473333816570612"), y: uint256_from_decimal_string("10532070064212391985634680642919861126702695449055773362657974530711355717278") },
        ];
        let participant_indices: Vec<Uint256> = vec![
            uint256_from_decimal_string("1"),
            uint256_from_decimal_string("2"),
        ];
        let proof =         Groth16ProofType {
            a: "03a2187a734e9f379b83e5a9fa347aa930b2a0ac8a79fdae37d9b1e01c3180d62b3a556b67e2c5bae70dc0500cf36abf874f3643f1be24eda7967ce235a5d8f3".to_string(),
            b: "0008457f50433452208164b5416ca359774cd7067692e0e96ec9dc5c40d31aba161720e3527a919e2eab68818b369b58a4393bb7c4e88adf44614ec27ce6d0f9224df73de4a08073ca022fe240f723d8c50df286e7d586ba8c274ad19af3938510d2902dfa0b3f724e69c6d12990e47a8d45edf054892c2e89524e7c17a4efe9".to_string(),
            c: "2cdf3ac522b5667f81354ea3c1d21f9246a8e7ecddb610d7dd1663300cc2ad40275f0209d5adcb4cf3c04cbceffae5db2e9b524ed65696e4ea8c3d7404114038".to_string(),
        };
        (results, salt, participant_pub_keys, participant_indices, proof)
    }

    // ==== GENERATED from hybridBallotFixture.json ====
    // Single ballot for VerifyHybridBallot query entrypoint test.
    fn hybrid_ballot_fixture() -> (
        [Uint256; 2],
        Uint256,
        [Uint256; 2],
        Uint256,
        Uint256,
        Uint256,
        Uint256,
        Groth16ProofType,
    ) {
        let kc = [uint256_from_decimal_string("12638030528432806444680310326288043858520366543569780948011195983100888895424"), uint256_from_decimal_string("2874222432609678237186489396330648906556209135055008837139779509259876658697")];
        let state_root = uint256_from_decimal_string("5678080290181519019462063264557879497227859626642914837890549155568452727972");
        let coord_pub_key = [uint256_from_decimal_string("17818764514199701705904019818885983240053494442260857190906103833655526972635"), uint256_from_decimal_string("20375192377076156497071259932898465702799792208881711741092920179651260965396")];
        let poll_id = uint256_from_decimal_string("1");
        let routing_commitment = uint256_from_decimal_string("545801352749069181543411248051632631362783976751764448836496158801522369895");
        let ahe_commitment = uint256_from_decimal_string("20990238927326986410874817686633306890997895366666698647275523482875779866434");
        let nullifier = uint256_from_decimal_string("2580633464407632082114628746467550975790407483227975409759994334022189489676");
        let proof =         Groth16ProofType {
            a: "2819f51368bc29c2c763ed1272dc872916180b662fbe943aee78aea8e87c2238201b4c077ac54d7d5ebdaa1c7a096bfcf6cab5af90784b795b490d56b53a200f".to_string(),
            b: "2e35dafe0bac4f0fe23ceff1b5b90e13357dcae977994b1044941249285849842ea4ce0fd8529f345f3e6bb37bb6738a7ddf43511072250549063e386906fb47268809c6c6b23aede6bdbe58e5b043161a257fe39173d380c8d41ddc37a9afab01962b1401b32124d29fa0669d63436ecbf83ae5d8bc5ac6e4af6595c56094b7".to_string(),
            c: "1bef1f9801dfe73635bfebe1f7086d19979d4bd1f7d75a7f8c9aa595c092960d027265baf4d1d35ea22bad8fba70c18405f18f7757630714ef3ac76175bc2027".to_string(),
        };
        (kc, state_root, coord_pub_key, poll_id, routing_commitment, ahe_commitment, nullifier, proof)
    }

    // 3-member committee (threshold 2) reusing voter pubkeys from hybrid_publish_fixture.
    fn hybrid_committee_fixture() -> HybridCommitteeConfig {
        let (_, voter_pubs, _) = hybrid_publish_fixture();
        HybridCommitteeConfig {
            members: vec![
                HybridCommitteeMember {
                    addr: committee1(),
                    pubkey: voter_pubs[0].clone(),
                },
                HybridCommitteeMember {
                    addr: committee2(),
                    pubkey: voter_pubs[1].clone(),
                },
                HybridCommitteeMember {
                    addr: committee3(),
                    pubkey: voter_pubs[2].clone(),
                },
            ],
            threshold: 2,
        }
    }

    #[test]
    fn e2e_hybrid_full_onchain_flow() {
        let mut app = create_app();
        let (coord_pub_key, actual_count, messages, new_agg_c1, new_agg_c2, new_nonce_state_root, process_proof) =
            hybrid_process_fixture();
        let (kc, voter_pubs, ballots) = hybrid_publish_fixture();
        let coordinator = PubKey {
            x: coord_pub_key[0],
            y: coord_pub_key[1],
        };
        let contract = MaciContract::instantiate_hybrid_default(&mut app, coordinator).unwrap();

        // Before voting starts, publishing must be rejected.
        let (routing0, enc_pub_key0, ciphertext0) = messages[0].clone();
        let (nullifier0, ballot_proof0) = ballots[0].clone();
        let too_early = contract
            .publish_hybrid_message(
                &mut app,
                user1(),
                routing0.clone(),
                enc_pub_key0.clone(),
                ciphertext0.clone(),
                coord_pub_key,
                nullifier0,
                ballot_proof0.clone(),
            )
            .unwrap_err();
        assert_eq!(ContractError::PeriodError {}, too_early.downcast().unwrap());

        app.update_block(next_block); // Start Voting

        // Publishing must be rejected before Kc is set.
        let kc_not_set = contract
            .publish_hybrid_message(
                &mut app,
                user1(),
                routing0.clone(),
                enc_pub_key0.clone(),
                ciphertext0.clone(),
                coord_pub_key,
                nullifier0,
                ballot_proof0.clone(),
            )
            .unwrap_err();
        assert_eq!(ContractError::HybridKcNotSet {}, kc_not_set.downcast().unwrap());

        // Only admin can bind Kc, and only once.
        let not_admin = contract.set_hybrid_kc(&mut app, user1(), kc).unwrap_err();
        assert_eq!(ContractError::Unauthorized {}, not_admin.downcast().unwrap());
        contract.set_hybrid_kc(&mut app, owner(), kc).unwrap();
        assert_eq!(contract.get_hybrid_kc(&app).unwrap(), Some(kc));
        let already_set = contract.set_hybrid_kc(&mut app, owner(), kc).unwrap_err();
        assert_eq!(ContractError::HybridKcAlreadySet {}, already_set.downcast().unwrap());

        // Sign up the 3 demo voters.
        contract.sign_up(&mut app, user1(), voter_pubs[0].clone()).unwrap();
        contract.sign_up(&mut app, user2(), voter_pubs[1].clone()).unwrap();
        contract.sign_up(&mut app, user3(), voter_pubs[2].clone()).unwrap();

        assert_eq!(contract.get_hybrid_msg_chain_length(&app).unwrap(), Uint256::zero());
        let identity_agg = contract.get_hybrid_agg_ciphertext(&app).unwrap();
        assert_eq!(identity_agg.agg_c1, vec![[Uint256::zero(), Uint256::from_u128(1u128)]; 5]);
        assert_eq!(identity_agg.agg_c2, vec![[Uint256::zero(), Uint256::from_u128(1u128)]; 5]);

        // Publish all 5 hybrid messages.
        for (i, ((routing, enc_pub_key, ciphertext), (nullifier, ballot_proof))) in messages
            .iter()
            .cloned()
            .zip(ballots.iter().cloned())
            .enumerate()
        {
            contract
                .publish_hybrid_message(
                    &mut app,
                    user1(),
                    routing,
                    enc_pub_key,
                    ciphertext,
                    coord_pub_key,
                    nullifier,
                    ballot_proof,
                )
                .unwrap();
            assert_eq!(
                contract.get_hybrid_msg_chain_length(&app).unwrap(),
                Uint256::from_u128((i + 1) as u128)
            );
        }

        // ProcessHybridBatch must wait for StartProcessPeriod.
        let too_soon = contract
            .process_hybrid_batch(
                &mut app,
                owner(),
                coord_pub_key,
                actual_count,
                new_agg_c1.clone(),
                new_agg_c2.clone(),
                new_nonce_state_root,
                process_proof.clone(),
            )
            .unwrap_err();
        assert_eq!(ContractError::PeriodError {}, too_soon.downcast().unwrap());

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000).plus_minutes(12);
        });
        contract.start_process(&mut app, owner()).unwrap();

        // Wrong coordinator must be rejected.
        let forged_coord_pub_key = [Uint256::from_u128(1u128), Uint256::from_u128(2u128)];
        let err = contract
            .process_hybrid_batch(
                &mut app,
                owner(),
                forged_coord_pub_key,
                actual_count,
                new_agg_c1.clone(),
                new_agg_c2.clone(),
                new_nonce_state_root,
                process_proof.clone(),
            )
            .unwrap_err();
        assert_eq!(ContractError::HybridCoordinatorMismatch {}, err.downcast().unwrap());

        // Real proof accepted by anyone (permissionless).
        contract
            .process_hybrid_batch(
                &mut app,
                user2(),
                coord_pub_key,
                actual_count,
                new_agg_c1.clone(),
                new_agg_c2.clone(),
                new_nonce_state_root,
                process_proof.clone(),
            )
            .unwrap();
        assert!(contract.get_hybrid_processed(&app).unwrap());
        let agg = contract.get_hybrid_agg_ciphertext(&app).unwrap();
        assert_eq!(agg.agg_c1, new_agg_c1);
        assert_eq!(agg.agg_c2, new_agg_c2);

        // Re-processing is rejected (round already advanced to Tallying).
        let err = contract
            .process_hybrid_batch(
                &mut app,
                owner(),
                coord_pub_key,
                actual_count,
                new_agg_c1.clone(),
                new_agg_c2.clone(),
                new_nonce_state_root,
                process_proof.clone(),
            )
            .unwrap_err();
        assert_eq!(ContractError::PeriodError {}, err.downcast().unwrap());

        // RevealHybridTally with a REAL proof.
        let (results, salt, participant_pub_keys, participant_indices, reveal_proof) =
            hybrid_reveal_fixture();
        contract
            .reveal_hybrid_tally(
                &mut app,
                owner(),
                results.clone(),
                salt,
                participant_pub_keys,
                participant_indices,
                reveal_proof,
            )
            .unwrap();
        let tally = contract.get_hybrid_tally(&app).unwrap().expect("tally should be revealed");
        assert_eq!(tally.results, results);
        assert_eq!(tally.salt, salt);

        // Revealing twice is rejected -- period has transitioned to Ended after first reveal.
        let (results2, salt2, pp2, pi2, proof2) = hybrid_reveal_fixture();
        let replay = contract
            .reveal_hybrid_tally(&mut app, owner(), results2, salt2, pp2, pi2, proof2)
            .unwrap_err();
        assert_eq!(ContractError::PeriodError {}, replay.downcast().unwrap());
    }

    #[test]
    fn e2e_hybrid_process_partial_batch() {
        let mut app = create_app();
        let (coord_pub_key, actual_count, messages, new_agg_c1, new_agg_c2, new_nonce_state_root, process_proof, ballots) =
            hybrid_partial_batch_fixture();
        let (kc, voter_pubs, _) = hybrid_publish_fixture();
        let contract = MaciContract::instantiate_hybrid_default(
            &mut app,
            PubKey { x: coord_pub_key[0], y: coord_pub_key[1] },
        )
        .unwrap();

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000);
        });

        contract.set_hybrid_kc(&mut app, owner(), kc).unwrap();
        contract.sign_up(&mut app, user1(), voter_pubs[0].clone()).unwrap();
        contract.sign_up(&mut app, user2(), voter_pubs[1].clone()).unwrap();
        contract.sign_up(&mut app, user3(), voter_pubs[2].clone()).unwrap();

        for (i, (routing, enc_pub_key, ciphertext)) in messages.iter().cloned().enumerate() {
            let (nullifier, ballot_proof) = ballots[i].clone();
            contract
                .publish_hybrid_message(
                    &mut app,
                    user1(),
                    routing,
                    enc_pub_key,
                    ciphertext,
                    coord_pub_key,
                    nullifier,
                    ballot_proof,
                )
                .unwrap();
        }
        assert_eq!(
            contract.get_hybrid_msg_chain_length(&app).unwrap(),
            actual_count
        );
        assert!(!contract.get_hybrid_processed(&app).unwrap());

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000).plus_minutes(12);
        });
        contract.start_process(&mut app, owner()).unwrap();

        contract
            .process_hybrid_batch(
                &mut app,
                user2(),
                coord_pub_key,
                actual_count,
                new_agg_c1.clone(),
                new_agg_c2.clone(),
                new_nonce_state_root,
                process_proof,
            )
            .unwrap();
        assert!(contract.get_hybrid_processed(&app).unwrap());
        assert_eq!(contract.get_hybrid_processed_count(&app).unwrap(), actual_count);
        let agg = contract.get_hybrid_agg_ciphertext(&app).unwrap();
        assert_eq!(agg.agg_c1, new_agg_c1);
        assert_eq!(agg.agg_c2, new_agg_c2);
    }

    #[test]
    fn e2e_hybrid_multi_batch_chaining_preserves_prior_aggregate() {
        let mut app = create_app();
        let (
            kc,
            voter_pubs,
            ballots,
            coord_pub_key,
            (batch1_actual_count, batch1_messages, batch1_new_agg_c1, batch1_new_agg_c2, batch1_new_nonce_state_root, batch1_proof),
            (batch2_actual_count, batch2_messages, batch2_new_agg_c1, batch2_new_agg_c2, batch2_new_nonce_state_root, batch2_proof),
            (reveal_results, reveal_salt, reveal_participant_pub_keys, reveal_participant_indices, reveal_proof),
        ) = hybrid_multi_batch_fixture();
        use cosmwasm_std::coins;
        app.sudo(cw_multi_test::SudoMsg::Bank(
            cw_multi_test::BankSudo::Mint {
                to_address: user4().to_string(),
                amount: coins(100_000_000_000_000_000_000, "peaka"),
            },
        ))
        .unwrap();
        let contract = MaciContract::instantiate_hybrid_default(
            &mut app,
            PubKey { x: coord_pub_key[0], y: coord_pub_key[1] },
        )
        .unwrap();

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000);
        });

        contract.set_hybrid_kc(&mut app, owner(), kc).unwrap();
        // 4 voters: first 3 for user1-3, 4th for user4
        contract.sign_up(&mut app, user1(), voter_pubs[0].clone()).unwrap();
        contract.sign_up(&mut app, user2(), voter_pubs[1].clone()).unwrap();
        contract.sign_up(&mut app, user3(), voter_pubs[2].clone()).unwrap();
        contract.sign_up(&mut app, user4(), voter_pubs[3].clone()).unwrap();

        // Publish in allMessages order: batch2_messages[0] (allMessages[0]) first,
        // then batch1_messages (allMessages[1..5]), to match the fixture hash chain.
        {
            let (routing, enc_pub_key, ciphertext) = batch2_messages[0].clone();
            let (nullifier, ballot_proof) = ballots[0].clone();
            contract
                .publish_hybrid_message(
                    &mut app,
                    user1(),
                    routing,
                    enc_pub_key,
                    ciphertext,
                    coord_pub_key,
                    nullifier,
                    ballot_proof,
                )
                .unwrap();
        }
        for (i, (routing, enc_pub_key, ciphertext)) in batch1_messages.iter().cloned().enumerate() {
            let (nullifier, ballot_proof) = ballots[i + 1].clone();
            contract
                .publish_hybrid_message(
                    &mut app,
                    user1(),
                    routing,
                    enc_pub_key,
                    ciphertext,
                    coord_pub_key,
                    nullifier,
                    ballot_proof,
                )
                .unwrap();
        }
        assert_eq!(
            contract.get_hybrid_msg_chain_length(&app).unwrap(),
            Uint256::from_u128(6u128)
        );

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000).plus_minutes(12);
        });
        contract.start_process(&mut app, owner()).unwrap();

        // First contract call: process messages[1..5] (5 messages, reverse order)
        contract
            .process_hybrid_batch(
                &mut app,
                owner(),
                coord_pub_key,
                batch1_actual_count,
                batch1_new_agg_c1.clone(),
                batch1_new_agg_c2.clone(),
                batch1_new_nonce_state_root,
                batch1_proof,
            )
            .unwrap();
        // Only 5 of 6 processed -- round still in Processing.
        assert!(!contract.get_hybrid_processed(&app).unwrap());
        assert_eq!(
            contract.get_hybrid_processed_count(&app).unwrap(),
            Uint256::from_u128(5u128)
        );
        assert_eq!(
            contract.get_period(&app).unwrap(),
            Period { status: PeriodStatus::Processing }
        );

        // Second contract call: process message[0] (1 message)
        contract
            .process_hybrid_batch(
                &mut app,
                owner(),
                coord_pub_key,
                batch2_actual_count,
                batch2_new_agg_c1.clone(),
                batch2_new_agg_c2.clone(),
                batch2_new_nonce_state_root,
                batch2_proof,
            )
            .unwrap();
        assert!(contract.get_hybrid_processed(&app).unwrap());
        let agg = contract.get_hybrid_agg_ciphertext(&app).unwrap();
        assert_eq!(agg.agg_c1, batch2_new_agg_c1);
        assert_eq!(agg.agg_c2, batch2_new_agg_c2);

        // Reveal the final tally.
        contract
            .reveal_hybrid_tally(
                &mut app,
                owner(),
                reveal_results.clone(),
                reveal_salt,
                reveal_participant_pub_keys,
                reveal_participant_indices,
                reveal_proof,
            )
            .unwrap();
        let tally = contract.get_hybrid_tally(&app).unwrap().expect("tally should be revealed");
        assert_eq!(tally.results, reveal_results);
        assert_eq!(tally.salt, reveal_salt);
    }

    #[test]
    fn e2e_hybrid_process_rejects_wrong_actual_count_mid_chain() {
        let mut app = create_app();
        let (
            kc,
            voter_pubs,
            ballots,
            coord_pub_key,
            (batch1_actual_count, batch1_messages, batch1_new_agg_c1, batch1_new_agg_c2, batch1_new_nonce_state_root, batch1_proof),
            (_, batch2_messages, _, _, _, _),
            _,
        ) = hybrid_multi_batch_fixture();
        use cosmwasm_std::coins;
        app.sudo(cw_multi_test::SudoMsg::Bank(
            cw_multi_test::BankSudo::Mint {
                to_address: user4().to_string(),
                amount: coins(100_000_000_000_000_000_000, "peaka"),
            },
        ))
        .unwrap();
        let contract = MaciContract::instantiate_hybrid_default(
            &mut app,
            PubKey { x: coord_pub_key[0], y: coord_pub_key[1] },
        )
        .unwrap();

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000);
        });

        contract.set_hybrid_kc(&mut app, owner(), kc).unwrap();
        contract.sign_up(&mut app, user1(), voter_pubs[0].clone()).unwrap();
        contract.sign_up(&mut app, user2(), voter_pubs[1].clone()).unwrap();
        contract.sign_up(&mut app, user3(), voter_pubs[2].clone()).unwrap();
        contract.sign_up(&mut app, user4(), voter_pubs[3].clone()).unwrap();

        // Publish in allMessages order: batch2_messages[0] (allMessages[0]) first,
        // then batch1_messages (allMessages[1..5]), to match the fixture hash chain.
        {
            let (routing, enc_pub_key, ciphertext) = batch2_messages[0].clone();
            let (nullifier, ballot_proof) = ballots[0].clone();
            contract
                .publish_hybrid_message(
                    &mut app,
                    user1(),
                    routing,
                    enc_pub_key,
                    ciphertext,
                    coord_pub_key,
                    nullifier,
                    ballot_proof,
                )
                .unwrap();
        }
        for (i, (routing, enc_pub_key, ciphertext)) in batch1_messages.iter().cloned().enumerate() {
            let (nullifier, ballot_proof) = ballots[i + 1].clone();
            contract
                .publish_hybrid_message(
                    &mut app,
                    user1(),
                    routing,
                    enc_pub_key,
                    ciphertext,
                    coord_pub_key,
                    nullifier,
                    ballot_proof,
                )
                .unwrap();
        }
        assert_eq!(
            contract.get_hybrid_msg_chain_length(&app).unwrap(),
            Uint256::from_u128(6u128)
        );

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000).plus_minutes(12);
        });
        contract.start_process(&mut app, owner()).unwrap();

        // First chained call (reverse processing): consumes messages[1..5]
        contract
            .process_hybrid_batch(
                &mut app,
                user2(),
                coord_pub_key,
                batch1_actual_count,
                batch1_new_agg_c1.clone(),
                batch1_new_agg_c2.clone(),
                batch1_new_nonce_state_root,
                batch1_proof,
            )
            .unwrap();
        assert!(!contract.get_hybrid_processed(&app).unwrap());
        assert_eq!(
            contract.get_hybrid_processed_count(&app).unwrap(),
            Uint256::from_u128(5u128)
        );
        assert_eq!(
            contract.get_period(&app).unwrap(),
            Period { status: PeriodStatus::Processing }
        );

        // Second call with wrong count (2 instead of 1) must be rejected.
        let dummy_proof = Groth16ProofType {
            a: "0".repeat(130),
            b: "0".repeat(258),
            c: "0".repeat(130),
        };
        let identity_agg: Vec<[Uint256; 2]> = vec![[Uint256::zero(), Uint256::from_u128(1u128)]; 5];
        let err = contract
            .process_hybrid_batch(
                &mut app,
                user2(),
                coord_pub_key,
                Uint256::from_u128(2u128),
                identity_agg.clone(),
                identity_agg,
                batch1_new_nonce_state_root,
                dummy_proof,
            )
            .unwrap_err();
        assert_eq!(
            ContractError::HybridBatchNotReady {
                expected: Uint256::from_u128(1u128),
                actual: Uint256::from_u128(2u128),
            },
            err.downcast().unwrap()
        );
        // Round remains in Processing.
        assert!(!contract.get_hybrid_processed(&app).unwrap());
        assert_eq!(
            contract.get_hybrid_processed_count(&app).unwrap(),
            Uint256::from_u128(5u128)
        );
    }

    #[test]
    fn e2e_hybrid_publish_allows_beyond_batch_size() {
        // A round should accept MORE than batch_size (5) published messages --
        // multi-batch processing handles the remainder in follow-up calls.
        let mut app = create_app();
        let (
            kc,
            voter_pubs,
            ballots,
            coord_pub_key,
            (batch1_actual_count, batch1_messages, batch1_new_agg_c1, batch1_new_agg_c2, batch1_new_nonce_state_root, batch1_proof),
            (_, batch2_messages, _, _, _, _),
            _,
        ) = hybrid_multi_batch_fixture();
        use cosmwasm_std::coins;
        app.sudo(cw_multi_test::SudoMsg::Bank(
            cw_multi_test::BankSudo::Mint {
                to_address: user4().to_string(),
                amount: coins(100_000_000_000_000_000_000, "peaka"),
            },
        ))
        .unwrap();
        let contract = MaciContract::instantiate_hybrid_default(
            &mut app,
            PubKey { x: coord_pub_key[0], y: coord_pub_key[1] },
        )
        .unwrap();

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000);
        });

        contract.set_hybrid_kc(&mut app, owner(), kc).unwrap();
        contract.sign_up(&mut app, user1(), voter_pubs[0].clone()).unwrap();
        contract.sign_up(&mut app, user2(), voter_pubs[1].clone()).unwrap();
        contract.sign_up(&mut app, user3(), voter_pubs[2].clone()).unwrap();
        contract.sign_up(&mut app, user4(), voter_pubs[3].clone()).unwrap();

        // Publish in allMessages order: batch2_messages[0] first (allMessages[0]) then
        // batch1_messages (allMessages[1..5]).  First 5 messages fill one batch.
        {
            let (routing, enc_pub_key, ciphertext) = batch2_messages[0].clone();
            let (nullifier, ballot_proof) = ballots[0].clone();
            contract
                .publish_hybrid_message(
                    &mut app,
                    user1(),
                    routing,
                    enc_pub_key,
                    ciphertext,
                    coord_pub_key,
                    nullifier,
                    ballot_proof,
                )
                .unwrap();
        }
        for (i, (routing, enc_pub_key, ciphertext)) in batch1_messages[..4].iter().cloned().enumerate() {
            let (nullifier, ballot_proof) = ballots[i + 1].clone();
            contract
                .publish_hybrid_message(
                    &mut app,
                    user1(),
                    routing,
                    enc_pub_key,
                    ciphertext,
                    coord_pub_key,
                    nullifier,
                    ballot_proof,
                )
                .unwrap();
        }
        assert_eq!(
            contract.get_hybrid_msg_chain_length(&app).unwrap(),
            Uint256::from_u128(5u128)
        );

        // Publish the 6th message (beyond batch_size=5) -- must succeed.
        let (routing, enc_pub_key, ciphertext) = batch1_messages[4].clone();
        let (nullifier, ballot_proof) = ballots[5].clone();
        contract
            .publish_hybrid_message(
                &mut app,
                user1(),
                routing,
                enc_pub_key,
                ciphertext,
                coord_pub_key,
                nullifier,
                ballot_proof,
            )
            .unwrap();
        assert_eq!(
            contract.get_hybrid_msg_chain_length(&app).unwrap(),
            Uint256::from_u128(6u128)
        );
    }

    #[test]
    fn e2e_hybrid_publish_rejects_batch_full() {
        // A voter who didn't publish during voting can't publish during processing.
        let mut app = create_app();
        let (coord_pub_key, actual_count, messages, new_agg_c1, new_agg_c2, new_nonce_state_root, process_proof) =
            hybrid_process_fixture();
        let (kc, voter_pubs, ballots) = hybrid_publish_fixture();
        let contract = MaciContract::instantiate_hybrid_default(
            &mut app,
            PubKey { x: coord_pub_key[0], y: coord_pub_key[1] },
        )
        .unwrap();

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000);
        });

        contract.set_hybrid_kc(&mut app, owner(), kc).unwrap();
        contract.sign_up(&mut app, user1(), voter_pubs[0].clone()).unwrap();
        contract.sign_up(&mut app, user2(), voter_pubs[1].clone()).unwrap();
        contract.sign_up(&mut app, user3(), voter_pubs[2].clone()).unwrap();

        for (i, (routing, enc_pub_key, ciphertext)) in messages.iter().cloned().enumerate() {
            let (nullifier, ballot_proof) = ballots[i].clone();
            contract
                .publish_hybrid_message(
                    &mut app,
                    user1(),
                    routing,
                    enc_pub_key,
                    ciphertext,
                    coord_pub_key,
                    nullifier,
                    ballot_proof,
                )
                .unwrap();
        }

        // Advance past voting window and start processing.
        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000).plus_minutes(12);
        });
        contract.start_process(&mut app, owner()).unwrap();

        // Attempt to publish during processing -- must be rejected.
        let (routing0, enc_pub_key0, ciphertext0) = messages[0].clone();
        let (nullifier0, ballot_proof0) = ballots[0].clone();
        let err = contract
            .publish_hybrid_message(
                &mut app,
                user1(),
                routing0,
                enc_pub_key0,
                ciphertext0,
                coord_pub_key,
                nullifier0,
                ballot_proof0,
            )
            .unwrap_err();
        assert_eq!(ContractError::PeriodError {}, err.downcast().unwrap());
    }

    #[test]
    fn e2e_hybrid_publish_rejects_off_curve_ciphertext_point() {
        let mut app = create_app();
        let (coord_pub_key, _, messages, _, _, _, _) = hybrid_process_fixture();
        let (kc, voter_pubs, ballots) = hybrid_publish_fixture();
        let contract = MaciContract::instantiate_hybrid_default(
            &mut app,
            PubKey { x: coord_pub_key[0], y: coord_pub_key[1] },
        )
        .unwrap();

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000);
        });

        contract.set_hybrid_kc(&mut app, owner(), kc).unwrap();
        contract.sign_up(&mut app, user1(), voter_pubs[0].clone()).unwrap();
        contract.sign_up(&mut app, user2(), voter_pubs[1].clone()).unwrap();
        contract.sign_up(&mut app, user3(), voter_pubs[2].clone()).unwrap();

        // Craft a message with an off-curve ciphertext point: (1,1) not on BabyJubjub.
        let (routing, enc_pub_key, mut ciphertext) = messages[0].clone();
        ciphertext.c1[0] = [Uint256::from_u128(1u128), Uint256::from_u128(1u128)];
        let (nullifier, ballot_proof) = ballots[0].clone();
        let err = contract
            .publish_hybrid_message(
                &mut app,
                user1(),
                routing,
                enc_pub_key,
                ciphertext,
                coord_pub_key,
                nullifier,
                ballot_proof,
            )
            .unwrap_err();
        assert_eq!(ContractError::HybridInvalidCiphertextPoint {}, err.downcast().unwrap());
    }

    #[test]
    fn e2e_hybrid_process_rejects_off_curve_aggregate_point() {
        let mut app = create_app();
        let (coord_pub_key, actual_count, messages, new_agg_c1, new_agg_c2, new_nonce_state_root, process_proof) =
            hybrid_process_fixture();
        let (kc, voter_pubs, ballots) = hybrid_publish_fixture();
        let contract = MaciContract::instantiate_hybrid_default(
            &mut app,
            PubKey { x: coord_pub_key[0], y: coord_pub_key[1] },
        )
        .unwrap();

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000);
        });

        contract.set_hybrid_kc(&mut app, owner(), kc).unwrap();
        contract.sign_up(&mut app, user1(), voter_pubs[0].clone()).unwrap();
        contract.sign_up(&mut app, user2(), voter_pubs[1].clone()).unwrap();
        contract.sign_up(&mut app, user3(), voter_pubs[2].clone()).unwrap();

        for (i, (routing, enc_pub_key, ciphertext)) in messages.iter().cloned().enumerate() {
            let (nullifier, ballot_proof) = ballots[i].clone();
            contract
                .publish_hybrid_message(
                    &mut app,
                    user1(),
                    routing,
                    enc_pub_key,
                    ciphertext,
                    coord_pub_key,
                    nullifier,
                    ballot_proof,
                )
                .unwrap();
        }

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000).plus_minutes(12);
        });
        contract.start_process(&mut app, owner()).unwrap();

        // Submit off-curve agg_c1 point.
        let mut corrupted_agg_c1 = new_agg_c1.clone();
        corrupted_agg_c1[0] = [Uint256::from_u128(1u128), Uint256::from_u128(1u128)];
        let err = contract
            .process_hybrid_batch(
                &mut app,
                user2(),
                coord_pub_key,
                actual_count,
                corrupted_agg_c1,
                new_agg_c2,
                new_nonce_state_root,
                process_proof,
            )
            .unwrap_err();
        assert_eq!(ContractError::HybridInvalidAggregatePoint {}, err.downcast().unwrap());
    }

    #[test]
    fn e2e_hybrid_confirm_kc_rejects_non_member() {
        let mut app = create_app();
        let (coord_pub_key, ..) = hybrid_process_fixture();
        let contract = MaciContract::instantiate_hybrid_with_committee(
            &mut app,
            PubKey { x: coord_pub_key[0], y: coord_pub_key[1] },
            Some(hybrid_committee_fixture()),
        )
        .unwrap();

        let (kc, ..) = hybrid_publish_fixture();
        let err = contract.confirm_hybrid_kc(&mut app, user1(), kc).unwrap_err();
        assert_eq!(ContractError::HybridNotCommitteeMember {}, err.downcast().unwrap());
    }

    #[test]
    fn e2e_hybrid_confirm_kc_rejects_when_no_committee_configured() {
        let mut app = create_app();
        let (coord_pub_key, ..) = hybrid_process_fixture();
        let contract = MaciContract::instantiate_hybrid_default(
            &mut app,
            PubKey { x: coord_pub_key[0], y: coord_pub_key[1] },
        )
        .unwrap();

        let (kc, ..) = hybrid_publish_fixture();
        let err = contract.confirm_hybrid_kc(&mut app, committee1(), kc).unwrap_err();
        assert_eq!(ContractError::HybridCommitteeNotConfigured {}, err.downcast().unwrap());
    }

    #[test]
    fn e2e_hybrid_set_kc_rejected_when_committee_configured() {
        let mut app = create_app();
        let (coord_pub_key, ..) = hybrid_process_fixture();
        let contract = MaciContract::instantiate_hybrid_with_committee(
            &mut app,
            PubKey { x: coord_pub_key[0], y: coord_pub_key[1] },
            Some(hybrid_committee_fixture()),
        )
        .unwrap();

        let (kc, ..) = hybrid_publish_fixture();
        let err = contract.set_hybrid_kc(&mut app, owner(), kc).unwrap_err();
        assert_eq!(ContractError::HybridCommitteeConfirmationRequired {}, err.downcast().unwrap());
    }

    #[test]
    fn e2e_hybrid_confirm_kc_finalizes_at_threshold_and_full_flow_proceeds() {
        let mut app = create_app();
        let (coord_pub_key, actual_count, messages, new_agg_c1, new_agg_c2, new_nonce_state_root, process_proof) =
            hybrid_process_fixture();
        let (kc, voter_pubs, ballots) = hybrid_publish_fixture();
        let contract = MaciContract::instantiate_hybrid_with_committee(
            &mut app,
            PubKey { x: coord_pub_key[0], y: coord_pub_key[1] },
            Some(hybrid_committee_fixture()),
        )
        .unwrap();

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000);
        });

        // First committee member confirms Kc -- not yet at threshold (2).
        contract.confirm_hybrid_kc(&mut app, committee1(), kc).unwrap();
        assert_eq!(contract.get_hybrid_kc(&app).unwrap(), None);

        // Second committee member's confirmation reaches threshold -- Kc is finalized.
        contract.confirm_hybrid_kc(&mut app, committee2(), kc).unwrap();
        assert_eq!(contract.get_hybrid_kc(&app).unwrap(), Some(kc));

        // Further confirmations return HybridKcAlreadySet once threshold is reached.
        let already = contract.confirm_hybrid_kc(&mut app, committee3(), kc).unwrap_err();
        assert_eq!(ContractError::HybridKcAlreadySet {}, already.downcast().unwrap());

        // Sign up and publish.
        contract.sign_up(&mut app, user1(), voter_pubs[0].clone()).unwrap();
        contract.sign_up(&mut app, user2(), voter_pubs[1].clone()).unwrap();
        contract.sign_up(&mut app, user3(), voter_pubs[2].clone()).unwrap();

        for (i, (routing, enc_pub_key, ciphertext)) in messages.iter().cloned().enumerate() {
            let (nullifier, ballot_proof) = ballots[i].clone();
            contract
                .publish_hybrid_message(
                    &mut app,
                    user1(),
                    routing,
                    enc_pub_key,
                    ciphertext,
                    coord_pub_key,
                    nullifier,
                    ballot_proof,
                )
                .unwrap();
        }

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000).plus_minutes(12);
        });
        contract.start_process(&mut app, owner()).unwrap();

        contract
            .process_hybrid_batch(
                &mut app,
                user2(),
                coord_pub_key,
                actual_count,
                new_agg_c1,
                new_agg_c2,
                new_nonce_state_root,
                process_proof,
            )
            .unwrap();
        assert!(contract.get_hybrid_processed(&app).unwrap());
    }

    #[test]
    fn e2e_hybrid_committee_threshold_mismatch_rejected_at_instantiate() {
        let mut app = create_app();
        let (coord_pub_key, ..) = hybrid_process_fixture();
        let mut committee = hybrid_committee_fixture();
        committee.threshold = 3; // HYBRID_REVEAL_THRESHOLD is 2
        let err = MaciContract::instantiate_hybrid_with_committee(
            &mut app,
            PubKey { x: coord_pub_key[0], y: coord_pub_key[1] },
            Some(committee),
        )
        .unwrap_err();
        assert_eq!(
            ContractError::HybridCommitteeThresholdMismatch {
                committee_threshold: 3,
                circuit_threshold: 2,
            },
            err.downcast().unwrap()
        );
    }

    #[test]
    fn e2e_hybrid_stop_processing_period_rejected_with_unprocessed_hybrid_messages() {
        // Publishing 1 hybrid message then trying to call stop_processing
        // (classic StopProcessingPeriod) must be rejected because the hybrid
        // message hasn't been processed yet via ProcessHybridBatch.
        let mut app = create_app();
        let (coord_pub_key, _, messages, _, _, _, _) = hybrid_process_fixture();
        let (kc, voter_pubs, ballots) = hybrid_publish_fixture();
        let contract = MaciContract::instantiate_hybrid_default(
            &mut app,
            PubKey { x: coord_pub_key[0], y: coord_pub_key[1] },
        )
        .unwrap();

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000);
        });

        contract.set_hybrid_kc(&mut app, owner(), kc).unwrap();
        contract.sign_up(&mut app, user1(), voter_pubs[0].clone()).unwrap();
        contract.sign_up(&mut app, user2(), voter_pubs[1].clone()).unwrap();
        contract.sign_up(&mut app, user3(), voter_pubs[2].clone()).unwrap();

        // Publish just 1 message.
        let (routing0, enc_pub_key0, ciphertext0) = messages[0].clone();
        let (nullifier0, ballot_proof0) = ballots[0].clone();
        contract
            .publish_hybrid_message(
                &mut app,
                user1(),
                routing0,
                enc_pub_key0,
                ciphertext0,
                coord_pub_key,
                nullifier0,
                ballot_proof0,
            )
            .unwrap();

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000).plus_minutes(12);
        });
        contract.start_process(&mut app, owner()).unwrap();

        // stop_processing while hybrid messages are unprocessed must be rejected.
        let err = contract.stop_processing(&mut app, user1()).unwrap_err();
        assert_eq!(
            ContractError::HybridMsgLeftProcess {
                remaining: Uint256::from_u128(1u128),
            },
            err.downcast().unwrap()
        );
    }

    #[test]
    fn e2e_hybrid_stop_tallying_period_rejected_before_reveal() {
        let mut app = create_app();
        let (coord_pub_key, actual_count, messages, new_agg_c1, new_agg_c2, new_nonce_state_root, process_proof) =
            hybrid_process_fixture();
        let (kc, voter_pubs, ballots) = hybrid_publish_fixture();
        let contract = MaciContract::instantiate_hybrid_default(
            &mut app,
            PubKey { x: coord_pub_key[0], y: coord_pub_key[1] },
        )
        .unwrap();

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000);
        });

        contract.set_hybrid_kc(&mut app, owner(), kc).unwrap();
        contract.sign_up(&mut app, user1(), voter_pubs[0].clone()).unwrap();
        contract.sign_up(&mut app, user2(), voter_pubs[1].clone()).unwrap();
        contract.sign_up(&mut app, user3(), voter_pubs[2].clone()).unwrap();

        for (i, (routing, enc_pub_key, ciphertext)) in messages.iter().cloned().enumerate() {
            let (nullifier, ballot_proof) = ballots[i].clone();
            contract
                .publish_hybrid_message(
                    &mut app,
                    user1(),
                    routing,
                    enc_pub_key,
                    ciphertext,
                    coord_pub_key,
                    nullifier,
                    ballot_proof,
                )
                .unwrap();
        }

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000).plus_minutes(12);
        });
        contract.start_process(&mut app, owner()).unwrap();

        // Full batch processing automatically advances to Tallying.
        contract
            .process_hybrid_batch(
                &mut app,
                owner(),
                coord_pub_key,
                actual_count,
                new_agg_c1,
                new_agg_c2,
                new_nonce_state_root,
                process_proof,
            )
            .unwrap();

        // Round is now in Tallying but HYBRID_TALLY not yet revealed.
        // stop_tallying must be blocked until RevealHybridTally is called.
        let err = contract
            .stop_tallying(&mut app, user2(), vec![Uint256::zero(); 5], Uint256::zero())
            .unwrap_err();
        assert_eq!(ContractError::HybridTallyNotYetRevealed {}, err.downcast().unwrap());
    }

    #[test]
    fn e2e_hybrid_reveal_rejects_off_curve_participant_pubkey() {
        let mut app = create_app();
        let (coord_pub_key, actual_count, messages, new_agg_c1, new_agg_c2, new_nonce_state_root, process_proof) =
            hybrid_process_fixture();
        let (kc, voter_pubs, ballots) = hybrid_publish_fixture();
        let contract = MaciContract::instantiate_hybrid_default(
            &mut app,
            PubKey { x: coord_pub_key[0], y: coord_pub_key[1] },
        )
        .unwrap();

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000);
        });

        contract.set_hybrid_kc(&mut app, owner(), kc).unwrap();
        contract.sign_up(&mut app, user1(), voter_pubs[0].clone()).unwrap();
        contract.sign_up(&mut app, user2(), voter_pubs[1].clone()).unwrap();
        contract.sign_up(&mut app, user3(), voter_pubs[2].clone()).unwrap();

        for (i, (routing, enc_pub_key, ciphertext)) in messages.iter().cloned().enumerate() {
            let (nullifier, ballot_proof) = ballots[i].clone();
            contract
                .publish_hybrid_message(
                    &mut app,
                    user1(),
                    routing,
                    enc_pub_key,
                    ciphertext,
                    coord_pub_key,
                    nullifier,
                    ballot_proof,
                )
                .unwrap();
        }

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000).plus_minutes(12);
        });
        contract.start_process(&mut app, owner()).unwrap();
        contract
            .process_hybrid_batch(
                &mut app,
                owner(),
                coord_pub_key,
                actual_count,
                new_agg_c1,
                new_agg_c2,
                new_nonce_state_root,
                process_proof,
            )
            .unwrap();

        let (results, salt, mut participant_pub_keys, participant_indices, reveal_proof) =
            hybrid_reveal_fixture();
        // Corrupt first participant's pubkey to off-curve point.
        participant_pub_keys[0] = PubKey {
            x: Uint256::from_u128(1u128),
            y: Uint256::from_u128(1u128),
        };
        let err = contract
            .reveal_hybrid_tally(
                &mut app,
                owner(),
                results,
                salt,
                participant_pub_keys,
                participant_indices,
                reveal_proof,
            )
            .unwrap_err();
        assert_eq!(ContractError::HybridInvalidParticipantPubKey {}, err.downcast().unwrap());
    }

    #[test]
    fn e2e_hybrid_reveal_rejects_duplicate_participant_indices() {
        let mut app = create_app();
        let (coord_pub_key, actual_count, messages, new_agg_c1, new_agg_c2, new_nonce_state_root, process_proof) =
            hybrid_process_fixture();
        let (kc, voter_pubs, ballots) = hybrid_publish_fixture();
        let contract = MaciContract::instantiate_hybrid_default(
            &mut app,
            PubKey { x: coord_pub_key[0], y: coord_pub_key[1] },
        )
        .unwrap();

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000);
        });

        contract.set_hybrid_kc(&mut app, owner(), kc).unwrap();
        contract.sign_up(&mut app, user1(), voter_pubs[0].clone()).unwrap();
        contract.sign_up(&mut app, user2(), voter_pubs[1].clone()).unwrap();
        contract.sign_up(&mut app, user3(), voter_pubs[2].clone()).unwrap();

        for (i, (routing, enc_pub_key, ciphertext)) in messages.iter().cloned().enumerate() {
            let (nullifier, ballot_proof) = ballots[i].clone();
            contract
                .publish_hybrid_message(
                    &mut app,
                    user1(),
                    routing,
                    enc_pub_key,
                    ciphertext,
                    coord_pub_key,
                    nullifier,
                    ballot_proof,
                )
                .unwrap();
        }

        app.update_block(|block| {
            block.time = Timestamp::from_nanos(1571797424879000000).plus_minutes(12);
        });
        contract.start_process(&mut app, owner()).unwrap();
        contract
            .process_hybrid_batch(
                &mut app,
                owner(),
                coord_pub_key,
                actual_count,
                new_agg_c1,
                new_agg_c2,
                new_nonce_state_root,
                process_proof,
            )
            .unwrap();

        let (results, salt, participant_pub_keys, mut participant_indices, reveal_proof) =
            hybrid_reveal_fixture();
        // Make indices duplicate.
        participant_indices[1] = participant_indices[0].clone();
        let err = contract
            .reveal_hybrid_tally(
                &mut app,
                owner(),
                results,
                salt,
                participant_pub_keys,
                participant_indices,
                reveal_proof,
            )
            .unwrap_err();
        assert_eq!(ContractError::HybridRevealDuplicateParticipant {}, err.downcast().unwrap());
    }

    #[test]
    fn e2e_hybrid_instantiate_rejects_wrong_vote_option_count() {
        let mut app = create_app();
        let (coord_pub_key, ..) = hybrid_process_fixture();
        let coordinator = PubKey { x: coord_pub_key[0], y: coord_pub_key[1] };

        // 3 options — must be rejected (HYBRID_M = 5)
        let err = MaciContract::try_instantiate_hybrid_with_vote_option_map(
            &mut app,
            coordinator.clone(),
            vec!["A".to_string(), "B".to_string(), "C".to_string()],
        )
        .unwrap_err();
        let msg = format!("{err:?}");
        assert!(
            msg.contains("vote_option_map length") || msg.contains("HybridVoteOptionMapMismatch"),
            "expected vote_option_map length mismatch for 3 options, got: {err:?}"
        );

        // 6 options — also rejected (hits MaxVoteOptionsExceeded before our check,
        // since 6 > 5^vote_option_tree_depth=1=5, but the important thing is it fails)
        let mut app2 = create_app();
        MaciContract::try_instantiate_hybrid_with_vote_option_map(
            &mut app2,
            coordinator.clone(),
            vec!["A".to_string(), "B".to_string(), "C".to_string(),
                 "D".to_string(), "E".to_string(), "F".to_string()],
        )
        .expect_err("6 options must be rejected");

        // Exactly 5 options — must succeed
        let mut app3 = create_app();
        MaciContract::try_instantiate_hybrid_with_vote_option_map(
            &mut app3,
            coordinator,
            vec!["A".to_string(), "B".to_string(), "C".to_string(),
                 "D".to_string(), "E".to_string()],
        )
        .expect("5 options must be accepted");
    }

    #[test]
    fn e2e_hybrid_publish_rejects_cross_message_ballot_proof() {
        // ballot_validity proof is bound to (routingCommitment, aheCommitment,
        // stateRoot, Kc).  Reusing a proof generated for message[0] to publish
        // message[1]'s content must fail the on-chain verifier.
        let mut app = create_app();
        let (kc, voter_pubs, ballots) = hybrid_publish_fixture();
        let (coord_pub_key, _, messages, _, _, _, _) = hybrid_process_fixture();
        let contract = MaciContract::instantiate_hybrid_default(
            &mut app,
            PubKey { x: coord_pub_key[0], y: coord_pub_key[1] },
        )
        .unwrap();

        app.update_block(next_block);

        contract.set_hybrid_kc(&mut app, owner(), kc).unwrap();
        contract.sign_up(&mut app, user1(), voter_pubs[0].clone()).unwrap();
        contract.sign_up(&mut app, user2(), voter_pubs[1].clone()).unwrap();
        contract.sign_up(&mut app, user3(), voter_pubs[2].clone()).unwrap();

        // Use message[1]'s routing + ciphertext but ballot proof from message[0].
        // The proof commits to message[0]'s routingCommitment/aheCommitment, so
        // the verifier will reject the mismatch.
        let (routing1, enc_pub_key1, ciphertext1) = messages[1].clone();
        let (nullifier0, ballot_proof0) = ballots[0].clone(); // proof for message[0]

        let err = contract
            .publish_hybrid_message(
                &mut app,
                user1(),
                routing1,
                enc_pub_key1,
                ciphertext1,
                coord_pub_key,
                nullifier0,
                ballot_proof0,
            )
            .unwrap_err();
        // The groth16 verifier rejects a mismatched proof.
        assert!(
            format!("{err:?}").contains("HybridBallotProofInvalid")
                || format!("{err:?}").contains("verify failed"),
            "expected ballot proof rejection, got: {err:?}"
        );
    }

    #[test]
    fn e2e_verify_hybrid_ballot_accepts_real_proof_via_query_entrypoint() {
        let mut app = create_app();
        let contract = MaciContract::instantiate_default(&mut app, true).unwrap();

        let (kc, state_root, coord_pub_key, poll_id, routing_commitment, ahe_commitment, nullifier, proof) =
            hybrid_ballot_fixture();
        let ok = contract
            .verify_hybrid_ballot(
                &app,
                kc,
                state_root,
                coord_pub_key,
                poll_id,
                routing_commitment,
                ahe_commitment,
                nullifier,
                proof,
            )
            .unwrap();
        assert!(ok, "a valid hybrid ballot proof must verify through the query entry point");
    }

    #[test]
    fn e2e_verify_hybrid_ballot_rejects_tampered_state_root_via_query_entrypoint() {
        let mut app = create_app();
        let contract = MaciContract::instantiate_default(&mut app, true).unwrap();

        let (kc, _state_root, coord_pub_key, poll_id, routing_commitment, ahe_commitment, nullifier, proof) =
            hybrid_ballot_fixture();
        let ok = contract
            .verify_hybrid_ballot(
                &app,
                kc,
                Uint256::from_u128(999_999u128),
                coord_pub_key,
                poll_id,
                routing_commitment,
                ahe_commitment,
                nullifier,
                proof,
            )
            .unwrap();
        assert!(!ok, "a proof replayed against a different state root must be rejected");
    }

    #[test]
    fn e2e_verify_hybrid_ballot_rejects_tampered_ahe_commitment_via_query_entrypoint() {
        let mut app = create_app();
        let contract = MaciContract::instantiate_default(&mut app, true).unwrap();

        let (kc, state_root, coord_pub_key, poll_id, routing_commitment, _ahe_commitment, nullifier, proof) =
            hybrid_ballot_fixture();
        let ok = contract
            .verify_hybrid_ballot(
                &app,
                kc,
                state_root,
                coord_pub_key,
                poll_id,
                routing_commitment,
                Uint256::from_u128(1u128),
                nullifier,
                proof,
            )
            .unwrap();
        assert!(!ok, "a proof replayed against a different aheCommitment must be rejected");
    }
}
