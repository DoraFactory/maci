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

// Build the vkeys for the lightweight test circuit: 2-1-1-5.
// Enabled when running cw-amaci's own tests, or when a dependent crate enables
// the "test-vkeys" feature (e.g. cw-amaci-registry and cw-api-saas dev-deps).
#[cfg(any(test, feature = "test-vkeys"))]
fn vkeys_2_1_1_5() -> Result<VkeyParams, ContractError> {
    let groth16_process_vkey = Groth16VKeyType {
        vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
        vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
        vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
        vk_delta_2: "11d6662dc397c9ae962355300621f33d29bf4960e9e39fc8db294534185704c10d9a1cd6562db68b8ffef18fe094f2a172425158ded443d3c670d3463047b3dd098ee6cc97e12e62dcd1ec7f5d3a5139a8fa0aca0ff5902be732b542943e179a2c23762491d8ab7d20352c2e8c62d844dd03f477af2842ffb189e75eae04703a".to_string(),
        vk_ic0: "063ad50333482e2f29a36cbfb847dafdba766a58a6165b0ea693feac43417160165e0e036fbc0105cdef72c5cdff80223c2f8226ae10cbc3f3ab6ad9c684ced7".to_string(),
        vk_ic1: "1e8df3e852c155a3e173e5f7aa07e74accf15894854e20124016e41fa21026e41baf26dec20984679aecfdd0667a137ee746c23c5598cd530618bbbfd61a82e9".to_string(),
    };
    let groth16_process_vkeys = format_vkey(&groth16_process_vkey)?;

    let groth16_tally_vkey = Groth16VKeyType {
        vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
        vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
        vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
        vk_delta_2: "1ac6fcb923e8a72ba02c4a9ecc2584f17365da4993c303c69c67302e723ae4b22acaaf0f622bb6a87f929a43177def12566b5a5d5af220086cba3facc17d337e02b46797fdb2a579e52d243f70bc9211e29d58dfffc4aec3908e95d2484766ab07f163b00d30e610c8a7d366cd2a363cca2b7cfcb375dde541ef3e15a85b92a6".to_string(),
        vk_ic0: "0b20a7584a8679cc6cf8e8cffc41ce9ad79c2cd0086214c3cb1af12146916bb9185b916c9938601b30c6fc4e7f2e1f1a7a94cb81e1774cb1f67b54eb33477e82".to_string(),
        vk_ic1: "081919adecf04dd5e1c31a3e34f8907d2ca613df81f99b3aa56c5027cd6416c201ddf039c717b1d29ecc2381db6104506731132f624e60cc09675a100028de25".to_string(),
    };
    let groth16_tally_vkeys = format_vkey(&groth16_tally_vkey)?;

    let groth16_deactivate_vkey = Groth16VKeyType {
        vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
        vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
        vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
        vk_delta_2: "29cb6daca9a9656f1d4ba4921a224e7f4eace00f8edcd3e325d1735afc9399e30a162284708bef3899798526b60d694364578a04b8d5069c780652a4f064e00117903c8ad872a5894b7c9d2e11ff196b2c7f4bd9a81d16e06b87289a8722294f01b860eec043b480f39c0073d64012963345db302baa45582bdd16e8f48b82ce".to_string(),
        vk_ic0: "24fcf45858d52df1307621609f9b3458575acdb85e40d5f963865ae9a55490be05d0b31cfefecf6b559403db12de44f7f514f96bfe485549bb15d639bd6ed085".to_string(),
        vk_ic1: "027a268d55de6d91ad4bb34ff88cb7f41933c1f842f521df118d925947b0252e11bcf96bf4363a1a0bf2c78ab3d8499370dda56d6db5a82f9ccf8303e8edfd38".to_string(),
    };
    let groth16_deactivate_vkeys = format_vkey(&groth16_deactivate_vkey)?;

    let groth16_add_new_key_vkey = Groth16VKeyType {
        vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
        vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
        vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
        vk_delta_2: "04dcac1a3227b1817e5444df538f10c7987e98acb0397e3a8ca797a509c20f61104ffaf38a5cc468937888724e98984046e511f765e60201b812fa86c89e25ae29f4a0820a41568bd2490cfcb35546bc1a8d3cd0898de7ed7b56735545b36d79247abc2ad701eb8206003efe41d7888f08ed807b29c33f2bf15947b05405339e".to_string(),
        vk_ic0: "24e55d47c4c673366c206d869261c291c3d81af0c4fdb04d2dfb7d0d630311320c1746039c41e1faba6b0426f065f8da677d7947921927ce07672d3ff5f8c576".to_string(),
        vk_ic1: "07a3d995030b94273cfa93d73c154f897e3b7192e6a49c3a17b3852f93894cd62c26b813d69e5b59ecffeda588fd3762c772ac5f290920ee0865902765cf8e3a".to_string(),
    };
    let groth16_add_new_key_vkeys = format_vkey(&groth16_add_new_key_vkey)?;

    Ok(VkeyParams {
        process_vkey: groth16_process_vkeys,
        tally_vkey: groth16_tally_vkeys,
        deactivate_vkey: groth16_deactivate_vkeys,
        add_key_vkey: groth16_add_new_key_vkeys,
    })
}

// Build the vkeys for the only supported production circuit: 9-4-3-125.
fn vkeys_9_4_3_125() -> Result<VkeyParams, ContractError> {
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
}

// Production: only 9-4-3-125 is accepted.
#[cfg(not(any(test, feature = "test-vkeys")))]
pub fn match_vkeys(parameters: &MaciParameters) -> Result<VkeyParams, ContractError> {
    if parameters.state_tree_depth == Uint256::from_u128(9)
        && parameters.int_state_tree_depth == Uint256::from_u128(4)
        && parameters.vote_option_tree_depth == Uint256::from_u128(3)
        && parameters.message_batch_size == Uint256::from_u128(125)
    {
        vkeys_9_4_3_125()
    } else {
        Err(ContractError::NotMatchCircuitSize {})
    }
}

// Test/test-vkeys mode: both 9-4-3-125 (production circuit) and the lightweight
// 2-1-1-5 (test circuit) are accepted, each with their own correct vkeys.
#[cfg(any(test, feature = "test-vkeys"))]
pub fn match_vkeys(parameters: &MaciParameters) -> Result<VkeyParams, ContractError> {
    let is_9_4_3_125 = parameters.state_tree_depth == Uint256::from_u128(9)
        && parameters.int_state_tree_depth == Uint256::from_u128(4)
        && parameters.vote_option_tree_depth == Uint256::from_u128(3)
        && parameters.message_batch_size == Uint256::from_u128(125);
    let is_2_1_1_5 = parameters.state_tree_depth == Uint256::from_u128(2)
        && parameters.int_state_tree_depth == Uint256::from_u128(1)
        && parameters.vote_option_tree_depth == Uint256::from_u128(1)
        && parameters.message_batch_size == Uint256::from_u128(5);

    if is_9_4_3_125 {
        vkeys_9_4_3_125()
    } else if is_2_1_1_5 {
        vkeys_2_1_1_5()
    } else {
        Err(ContractError::NotMatchCircuitSize {})
    }
}
