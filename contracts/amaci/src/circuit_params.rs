use crate::groth16_parser::parse_groth16_vkey;

use crate::ContractError;
use crate::{
    msg::Groth16VKeyType,
    state::{Groth16VkeyStr, MaciParameters},
};
use cosmwasm_std::Uint256;
use pairing_ce::bn256::Bn256;

pub struct VkeyParams {
    pub process_vkey: Groth16VkeyStr,
    pub tally_vkey: Groth16VkeyStr,
    pub deactivate_vkey: Groth16VkeyStr,
    pub add_key_vkey: Groth16VkeyStr,
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

// Only the 9-4-3-125 circuit is supported.
pub fn match_vkeys(parameters: &MaciParameters) -> Result<VkeyParams, ContractError> {
    if parameters.state_tree_depth == Uint256::from_u128(9)
        && parameters.int_state_tree_depth == Uint256::from_u128(4)
        && parameters.vote_option_tree_depth == Uint256::from_u128(3)
        && parameters.message_batch_size == Uint256::from_u128(125)
    {
        let groth16_process_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "2dbffc165f233085543452db1b07e19825da7b484ae3235d313a7925295f74aa1c677a0ddeb670f959b9ccc65424510884fa979cc12ab84590a81042f5a4823d041a5c65da8b3a24acf0eac8cde7f17ed3aac13a00409323aed25cc8774858c70d6a70d0e13a58de912576787be49715d0ea2a5ce233fb11d0e1493e53e66e68".to_string(),
            vk_ic0: "2c9c9cd3b95feae386eaea719d6eb7a0c02b72a97d6a7394be5b7a76ca1c18950fd37bbe8d787a2e88fd2cba6cf254f958b4ee38df293a82733b674bf67e24fe".to_string(),
            vk_ic1: "1de933127fba2a68731bd06c034f809542ac58820d6d3440ef4b970c9b65f2551d74125154419c8ffc8c9b82cd7bd1fe85630acdae7f066207c0c1c00cfa3504".to_string(),
        };
        let groth16_process_vkeys = format_vkey(&groth16_process_vkey)?;

        let groth16_tally_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "1aa1822e73f5f9ae451c29496938ca309910868b8d833e7f83e8f4c8127f29490def84b53ae9060028d94fb6f70eb199f834ecc3456cbe873b673457eeb38f6a0e36b4bcb2cbdf4c5636d22ccbb32aa70d990f8e07306a79db15ad485287846d0d5d4496fdd22ca28841c9a2f6b0ec4b7a3cb0eefab93435eb86f08a79e7752b".to_string(),
            vk_ic0: "1840e9af4d2094c190adf2e40468515ee760858a2a41a26aa7916bc38bd7ba9f01ea24bf4adad4d679ddf5858dbcb4587b954a6062b264288f6e191c6d697759".to_string(),
            vk_ic1: "1ed068e3bbc130b6a420efe22b7f26b7372686108ff1935eea7508eb814d3e2e0ab2da2095988387330108bee8d58121be18e61bb594ba9b8982a290cfc2571b".to_string(),
        };
        let groth16_tally_vkeys = format_vkey(&groth16_tally_vkey)?;

        let groth16_deactivate_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "09e17774c0f6084118170566c0357533d1ed4121e4dfbae1a1e29c2a4b6b6fe41d98a7cb2321ff5e2d8f596b447fe11d9117305765e6547b6dfbe10ff6a085e5081c5f48d1f4df743ffca8f184c82dd3e7da87b922e163bafd9818b8754c0dc31ffab6d55ef297f27480a149c3c6032d5d8ab7f82482c5500315205b8a4cc615".to_string(),
            vk_ic0: "04dc535125bae902c4a45f46388be776f06560cf88f0be4aaeb0710c8bb85f9811b9f57acefc9efd60005cf52225cfd297868fe705fe804ef28085c58c765c71".to_string(),
            vk_ic1: "09ef42aaa574bd107d918a1273e242eae9836078ac0d3011f50d2f131aa5ee5b1aaffa83cb6ffa404cb8d1a5eb232ab78b4ef8a5bcc2e21439d16da63d70ea25".to_string(),
        };
        let groth16_deactivate_vkeys = format_vkey(&groth16_deactivate_vkey)?;

        let groth16_add_new_key_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "238ac559fa8319acec84e7a8e1d6cdb7294e055ccc778727745ba3434ab3e3db275f1e444dd1dd4b7f9a4761ef151e0378c4ac08c02bb790ada130aa28d3fc0b25ff2248317365960e06183f9c5680ac049abb4a41457a3a466972a531c1c5b405d08dce3362629c9384d6381c0b2f8b3a7a9d8736db69913e01522f4ab8ed4a".to_string(),
            vk_ic0: "0255c90c4ab912fa162f9edb0d1f40a20559db7660fe597a7b1b2a9d5194dce402312ed702216f0c29e34e2b7d0f173e1ddc0ae4dabb255682e53d6264807c1e".to_string(),
            vk_ic1: "20f68fe36f8690c6e09b199cdea1e5f59c6fdb01edbdd1b7b9950aa790b9f4ce2d39c2e8fe6e99f5681543f2264ce07697b51c2ed8e6f7e66533c59eba716764".to_string(),
        };
        let groth16_add_new_key_vkeys = format_vkey(&groth16_add_new_key_vkey)?;

        Ok(VkeyParams {
            process_vkey: groth16_process_vkeys,
            tally_vkey: groth16_tally_vkeys,
            deactivate_vkey: groth16_deactivate_vkeys,
            add_key_vkey: groth16_add_new_key_vkeys,
        })
    } else {
        Err(ContractError::NotMatchCircuitSize {})
    }
}
