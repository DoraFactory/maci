use crate::error::ContractError;
use crate::groth16_parser::parse_groth16_vkey;
use crate::{
    msg::Groth16VKeyType,
    state::{Groth16VkeyStr, MaciParameters},
};
use cosmwasm_std::Uint256;
use pairing_ce::bn256::Bn256;

pub struct OracleVkeyParams {
    pub process_vkey: Groth16VkeyStr,
    pub tally_vkey: Groth16VkeyStr,
}

pub fn format_vkey(groth16_vkey: &Groth16VKeyType) -> Result<Groth16VkeyStr, ContractError> {
    // Create a process_vkeys struct from the process_vkey in the message
    let groth16_vkey_formatted = Groth16VkeyStr {
        alpha_1: hex::decode(&groth16_vkey.vk_alpha1)
            .map_err(|_| ContractError::HexDecodingError {})?,
        beta_2: hex::decode(&groth16_vkey.vk_beta_2)
            .map_err(|_| ContractError::HexDecodingError {})?,
        gamma_2: hex::decode(&groth16_vkey.vk_gamma_2)
            .map_err(|_| ContractError::HexDecodingError {})?,
        delta_2: hex::decode(&groth16_vkey.vk_delta_2)
            .map_err(|_| ContractError::HexDecodingError {})?,
        ic0: hex::decode(&groth16_vkey.vk_ic0).map_err(|_| ContractError::HexDecodingError {})?,
        ic1: hex::decode(&groth16_vkey.vk_ic1).map_err(|_| ContractError::HexDecodingError {})?,
    };
    parse_groth16_vkey::<Bn256>(groth16_vkey_formatted.clone())
        .map_err(|_| ContractError::InvalidVKeyError {})?;

    Ok(groth16_vkey_formatted)
}

pub fn calculate_circuit_params(
    max_voters: u128,
    max_vote_options: u128,
) -> Result<MaciParameters, ContractError> {
    // Select the minimum circuit parameters that can meet the requirements based on max_voters and max_vote_options
    if max_voters <= 25 && max_vote_options <= 5 {
        // 2-1-1-5 scale: supports up to 25 voters, 5 options
        Ok(MaciParameters {
            state_tree_depth: Uint256::from_u128(2u128),
            int_state_tree_depth: Uint256::from_u128(1u128),
            vote_option_tree_depth: Uint256::from_u128(1u128),
            message_batch_size: Uint256::from_u128(5u128),
        })
    } else if max_voters <= 625 && max_vote_options <= 25 {
        // 4-2-2-25 scale: supports up to 625 voters, 25 options
        Ok(MaciParameters {
            state_tree_depth: Uint256::from_u128(4u128),
            int_state_tree_depth: Uint256::from_u128(2u128),
            vote_option_tree_depth: Uint256::from_u128(2u128),
            message_batch_size: Uint256::from_u128(25u128),
        })
    } else if max_voters <= 15625 && max_vote_options <= 125 {
        // 6-3-3-125 scale: supports up to 15625 voters, 125 options
        Ok(MaciParameters {
            state_tree_depth: Uint256::from_u128(6u128),
            int_state_tree_depth: Uint256::from_u128(3u128),
            vote_option_tree_depth: Uint256::from_u128(3u128),
            message_batch_size: Uint256::from_u128(125u128),
        })
    } else {
        Err(ContractError::UnsupportedCircuitSize {})
    }
}

pub fn match_oracle_vkeys(parameters: &MaciParameters) -> Result<OracleVkeyParams, ContractError> {
    if parameters.state_tree_depth == Uint256::from_u128(2)
        && parameters.int_state_tree_depth == Uint256::from_u128(1)
        && parameters.vote_option_tree_depth == Uint256::from_u128(1)
        && parameters.message_batch_size == Uint256::from_u128(5)
    {
        // vkey for 2-1-1-5 scale
        let groth16_process_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "0dc5c56eca93b0758f0f1aab37e40fe8dc9e7b094f0753d3b4790561722ae10d2c6b79c93b192170631bfed8f95d199a6235c1019830dc6c721a9a44b3484639220a9698543c81a8f2387b55efacb5056b4b2e03d5e0c38d4eb2a61c5f3f6f0d22f9fba69eb172a708e019123830c58bc6c89da9450f378a2c24f948ce72f3d2".to_string(),
            vk_ic0: "241b91622b884684e441fa52f179f6ac34650e30acd61b740c5732bfdc3230f62511fce9430abe4dd5bc6a552d97da9b877db17cd71f29b12c7cb522203fb4eb".to_string(),
            vk_ic1: "0632e625fefc7172e8aec1070c4d32b90b6c482f6f3806773a4c55a03877c2d716cfd935eb3e3883f580c93f56adbf3a253ce3c208c52fb784f9d8fec139c617".to_string(),
        };

        let groth16_process_vkeys = format_vkey(&groth16_process_vkey)?;

        let groth16_tally_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "15ebf2838ce21cd730c82617b5acfcee3f89c3969f4b571152d00b1965c4851c065d38111e1ecb2fe718a11acd74ccc136c01c2c3f20c9b34d358a5d4f188b7b01d51b95a5f25a3a2b36c7a83ea5564b3dc08346e340009c5d93e466a3c2df161599f4d52080d3ed1bf224427f70e9debbd07afcd187acab5b5ff48fed2b6951".to_string(),
            vk_ic0: "22e859fa9fb9b9915cb6e3b3baff96d04539d15ac32e3bd9ec90f03d0c1d2bdf21af4ecab109caba16c55a0318dace310c53b2dc5a31496b6dad603137ae7ccb".to_string(),
            vk_ic1: "05b8b475f2bfedba4fa04ab1972006da9764c2c3e6fb65d6dd0aac938fd298112a560e13770b06a3f709a49fddf016331ea205fa125026993f6666eff69f4def".to_string(),
      };
        let groth16_tally_vkeys = format_vkey(&groth16_tally_vkey)?;

        let vkeys = OracleVkeyParams {
            process_vkey: groth16_process_vkeys,
            tally_vkey: groth16_tally_vkeys,
        };
        return Ok(vkeys);
    } else if parameters.state_tree_depth == Uint256::from_u128(4)
        && parameters.int_state_tree_depth == Uint256::from_u128(2)
        && parameters.vote_option_tree_depth == Uint256::from_u128(2)
        && parameters.message_batch_size == Uint256::from_u128(25)
    {
        // vkey for 4-2-2-25 scale
        let groth16_process_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "19eef0d34e27608d067ece7c262a9b74965d2d3eb0c4649db49caddb7f9ec0a92e4d78f5b667da44eb4b13ff21b79aa3584059b5b8345ae083fd0b0b42b13a400220e2cfc81f8c4278b15e078146ef804d4515b451c11d17e969ae45e72b288822d9554762428a8e6fd36e9fc4529492250e4d3fe4aa8d7ac0f0fa597a5661b9".to_string(),
            vk_ic0: "1164e91a7bf8dc2f52f0794fdb7fd97bba7ee48a211891e3c3aa0f4703eec1e40d2817d1eb66769bd3227f997480c3de433e273eeb0871fd804c913d97338cb0".to_string(),
            vk_ic1: "0a47be101a59d20641e1369c0b2b9fb839cd35ecbfbeac3866df43723b70c78d17e96303c417743d93b7726805b736f364d305036b50e4ad1b885fc41284daf5".to_string(),
        };

        let groth16_process_vkeys = format_vkey(&groth16_process_vkey)?;

        let groth16_tally_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "130e59dc53aba257e0928830f57eda415e2c5d3cc19da28684952fd1420e8f6028f9232da04383ca9a5fc38e231bd081759e8024a466752755d4d486857027c22d7c0ccceb8a58b3af83e4ac7f60d9ff0d037c9eb5554a063c7380ffbf224de3134d54ca7253c210451614e03618e76f8cf15d6679ffb74a0c9edc4fb774c2c2".to_string(),
            vk_ic0: "1c0a95b9325165ba2d3fa5dadaceb268a0ff1e5d0049ea7db4612b443bb054c90a5060397eae86ab969ca3e1cc36ff1cddc03a672906326973d3f30d0ea8e203".to_string(),
            vk_ic1: "299cfb28054cde0470bd7ff280349089350226d1ca154dcf6544b2680bf3bea925026e6644668273d6066ef6766c2f561c3607c523fbbd1379c5002376ef69c3".to_string(),
       };
        let groth16_tally_vkeys = format_vkey(&groth16_tally_vkey)?;

        let vkeys = OracleVkeyParams {
            process_vkey: groth16_process_vkeys,
            tally_vkey: groth16_tally_vkeys,
        };
        return Ok(vkeys);
    } else if parameters.state_tree_depth == Uint256::from_u128(6)
        && parameters.int_state_tree_depth == Uint256::from_u128(3)
        && parameters.vote_option_tree_depth == Uint256::from_u128(3)
        && parameters.message_batch_size == Uint256::from_u128(125)
    {
        // vkey for 6-3-3-125 scale
        let groth16_process_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "057f25675851ef5a79a6d8706a43a6cd8e494cfb12c241ede46991d9174cf30605b081ff44f3ede774dab68ea9324c12308c13cb09cbb129adf94401b9134f5b16137d952fd32ab2d4243ebff4cb15d17206948ef17909ea8606886a8109bdad082f7d27e1cbf98925f055b39d1c89f9bcc4f6d92fdb920934ff5e37ba4d9b49".to_string(),
            vk_ic0: "27c937c032a18a320566e934448a0ffceea7050492a509c45a3bcb7e8ff8905d20789ada31729a833a4f595ff9f49f88adb66f2ab987de15a15deccb0e785bf4".to_string(),
            vk_ic1: "0ed2cefc103a2234dbc6bbd8634812d65332218b7589f4079b2c08eb5a4f5f63113a7f3cb53797a7f5819d7de7e3f0b2197d1c34790685a4a59af4314810420b".to_string(),
        };

        let groth16_process_vkeys = format_vkey(&groth16_process_vkey)?;

        let groth16_tally_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "2065e91c00fcc5cbc3d974cf52e24de972bdb1b4d8ded629dec20b5c904c3fa327ffe02402094795ff4d02588c8268fcad738f69eb4c732a0c98b485035e1f4913ede11b074ff143a929673e581a547717c58ce01af87d9d8b28f65f506093a61013e367b93e6782129362065840a0af9b77d7d9659a84577176e64a918d8d4c".to_string(),
            vk_ic0: "11db4a022aab89a265f06ff62aa18c74b21e913a8b23e7fce9cb46f76d1c4d9f2a7475b1eeb7be0a0dc457e6d52536ba351b621b63a7d77da75d4e773048537e".to_string(),
            vk_ic1: "0f298d235d0822ad281386abdf511853529af4c864b0cd54140facebfc1356a3059cd6d0d4b27b39e5683548fe12025e2a6b2e2724c2ca87d2008ef932ed3801".to_string(),
        };
        let groth16_tally_vkeys = format_vkey(&groth16_tally_vkey)?;

        let vkeys = OracleVkeyParams {
            process_vkey: groth16_process_vkeys,
            tally_vkey: groth16_tally_vkeys,
        };
        return Ok(vkeys);
    } else {
        return Err(ContractError::NotMatchCircuitSize {});
    }
}
