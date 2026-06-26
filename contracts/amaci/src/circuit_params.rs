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
        vk_delta_2: "14fcf460ec67f39e7604ce59622a530797f70d5dce2cdbfcc6285acb11a091490a51cc6cc5aec73e4b1fcd45f152e8d18d9831efa2ca2d8aba5ec00a5258a86c2588c3053fe7907bd6e3b3b455283a441df9f5e9cc8b1aca6712d37004c28e4311915d144397caf4c4e74e150159574574d84d4a620cc22e1ee695b45f0c09fb".to_string(),
        vk_ic0: "152b83fbeccaaf60ff7c47ebcefc9368d1d81271fc47d36e3032f589112849c900ce96219b641b39a390c8fe58b8ff805e21e55257e1437c26285d030fb52a70".to_string(),
        vk_ic1: "0722c7bc6aaf03f86fc32096b9ad50fa14a99d113cd02d3a26df629703f7b9b61a19f057b25b77efefe232bb2cc87d9637bca988fc0325bd8c9e4b1febe5eca4".to_string(),
    };
    let groth16_process_vkeys = format_vkey(&groth16_process_vkey)?;

    let groth16_tally_vkey = Groth16VKeyType {
        vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
        vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
        vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
        vk_delta_2: "21770a545c0aaa828d45a00c7335a689ac65650edb60d582ae66928eb860ac8811ec3ee19549dc6bf84515db12f782b7c6848fe4d004d32a5d27bce19440c34a173c6f347154f90a6052e1ca1faf89d4940527f248597c340c5c6cdf436225342c0fa0a92e84c22bb553aa427aa53c0f5f3ba7f7d223f6eb89b7d7cba26eb070".to_string(),
        vk_ic0: "0b20a7584a8679cc6cf8e8cffc41ce9ad79c2cd0086214c3cb1af12146916bb9185b916c9938601b30c6fc4e7f2e1f1a7a94cb81e1774cb1f67b54eb33477e82".to_string(),
        vk_ic1: "081919adecf04dd5e1c31a3e34f8907d2ca613df81f99b3aa56c5027cd6416c201ddf039c717b1d29ecc2381db6104506731132f624e60cc09675a100028de25".to_string(),
    };
    let groth16_tally_vkeys = format_vkey(&groth16_tally_vkey)?;

    let groth16_deactivate_vkey = Groth16VKeyType {
        vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
        vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
        vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
        vk_delta_2: "0b2b685a254c97378d11100e45db341efebcc5e3d026fe920fdf1cac04c5feb4135b02f250b191e658c55341d45184bde62cec70444c4f210fdb507d5622dc821fe7bc3e41c31a4e6b7288ca0d519b80b18e722712d24f8786155d683f0bff7101e736bd668785e26ceb252106aaa784c922e2509d37444c711da6b3d8d0c8ad".to_string(),
        vk_ic0: "141ed95aed8eac95334e6dbaa513736949402fd820920d8e2179d7be54593f60070ffd76988c62dbf2cf4a365da0fbecde7e7ccb39f1e0e0728a6941da3435cd".to_string(),
        vk_ic1: "2c1289b05f9093a1d4c7536093702b08d57654fae20ae871de2598565c43c8611d5bc6caad360c2b6f68480aa71efbcc506524104152bb73f79d9cb0f3d12180".to_string(),
    };
    let groth16_deactivate_vkeys = format_vkey(&groth16_deactivate_vkey)?;

    let groth16_add_new_key_vkey = Groth16VKeyType {
        vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
        vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
        vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
        vk_delta_2: "2b135a96b33686a78339372bd40e3bef10aea0554c15a4770aeecdea0ce74b65265875823bf58d64d42fdf4ab9b8dba0a8b71dc2c1a140c68069d013a661c6a4150290c14390c9f212516d006b2b67012db77104bb20f3b980e924069a27c725119f442673a5ead331dfdfbbb1963ff41eca2f0a518e535f7b6b44cea1efd3df".to_string(),
        vk_ic0: "29639aea06acd9b07e36d2456153d4e81581d65efb2fc93f0d54618398be1c471f49496bce6f344badecd9493d07faaaa2d09c7216734488f3ce2e2d0bd25be9".to_string(),
        vk_ic1: "20ccb32cbbbb10099ab8ef2bfd196ec22b3c07c8c7eba7076bb8d16be4aa69ad0b0ff4e2a298219ef216024cd65a8b26470a7daa2e8ce55af41038a74d5d589f".to_string(),
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
            vk_delta_2: "1ca282bdb2bf70aeae2a394515a6b090972b172f2baa302c9c4a5e2e62044085172b006b637672503a9ad454148c20024cc3412cd3af07fdc172cbeec61de5252e7f42a023bce7df1c2b9bb817d5c6345e03462f2231ef0b4057c487da87e4fa1df5a5ff810e7c9f18acf76a9ef37ed89169f54af3326f63e5c732886b57b0d0".to_string(),
            vk_ic0: "0f4ca042d9df017c2277a5348138072354637d7a548ed2432a62b22bd6b0793c14d190e06d249c579f2f3cb9c0d8e5223798931ac8fc645efc96739d34e3a553".to_string(),
            vk_ic1: "0231a17b99604840a6870d1c5ba31394ceb6683af703d083338c30bdb87b88851283ec802a494552bd00732fa61bfc619a4238a0ab6659e5c8fa91b2a5e5143b".to_string(),
        };
        let groth16_process_vkeys = format_vkey(&groth16_process_vkey)?;

        let groth16_tally_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "232a958bbc349f1fa27cf560c9efa7248aa95d954de64a3e170c2abe8265386529255f7c77a1a70b4237d6fa8763c64699c3d1eb62a54e60349cb32c850ef1b10044d8b3fc7298d54a097453c9a9b62442fa3851e2c1dc582c47b9d60e0a62392ca45e26a1793a485d1e8c81de124d2b1cf2afefa69459ef7d567076bc864dec".to_string(),
            vk_ic0: "1840e9af4d2094c190adf2e40468515ee760858a2a41a26aa7916bc38bd7ba9f01ea24bf4adad4d679ddf5858dbcb4587b954a6062b264288f6e191c6d697759".to_string(),
            vk_ic1: "1ed068e3bbc130b6a420efe22b7f26b7372686108ff1935eea7508eb814d3e2e0ab2da2095988387330108bee8d58121be18e61bb594ba9b8982a290cfc2571b".to_string(),
        };
        let groth16_tally_vkeys = format_vkey(&groth16_tally_vkey)?;

        let groth16_deactivate_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "11e969c11af8421c1474c478725abee854af14412b35f69010f5c9913c9eb9401474968c8c1608ebdfb978f7e72380d046d1ac079a64bae0fef5052137ae829d07317efdfe94d826337c8225c7e78be3775f3dd61a60486fe32ca7587223c58323534bc421de3812160299521a2670b43351d8c6ef3a3204ab9394c05111f805".to_string(),
            vk_ic0: "2341ef299bd50b06e3885f2c95e6e043ac4a9b30263fb5b212b9c5ee443ab28d17b0dd121483ee7a280fe8a82384e8bbd0e52c32be97148dfaecb953ee0b34fe".to_string(),
            vk_ic1: "04c3cdc1e32f4e6eae21adb419ed037dcd5daa9012bc9fe31e4ebedba31c101b00f8483d686d64d0eb7d1c3278b4409f4717dea169970f62505a52e3c08b6d4d".to_string(),
        };
        let groth16_deactivate_vkeys = format_vkey(&groth16_deactivate_vkey)?;

        let groth16_add_new_key_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "1c94083c2b90d4f41d7e83000647860bb278e98705f0c9553b790ba4556d88451b2e0741e3cba46801412cff620bb191ab358604fff432bf073a325c9f19a1860cb0286d5261f5e0214f11320d740fee711f78575a8f3b47bebecad7e16a301c0b0d80535eb8f30fd18c2627e9f08d1b1bf3f7210994465489722587bba1487f".to_string(),
            vk_ic0: "0eb39e5aa053d6676afa84d88c23996669b18eda44eb6d97420176ff55c276290ae7df9c85d77b9aef313093fdeada3c53cd1b0cfd7ed04460a719cfff4e5925".to_string(),
            vk_ic1: "200467c396f31ec6b2f3324d5fa38a28e18ce24c1a92742486553e2375204fc82e4feff4af5e2c2ac4acd05af4a64d161edee15e1feef61d2f4977860643c94b".to_string(),
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
