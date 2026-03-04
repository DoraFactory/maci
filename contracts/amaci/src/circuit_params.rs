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

pub fn match_vkeys(parameters: &MaciParameters) -> Result<VkeyParams, ContractError> {
    if parameters.state_tree_depth == Uint256::from_u128(2)
        && parameters.int_state_tree_depth == Uint256::from_u128(1)
        && parameters.vote_option_tree_depth == Uint256::from_u128(1)
        && parameters.message_batch_size == Uint256::from_u128(5)
    {
        let groth16_process_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "11d6662dc397c9ae962355300621f33d29bf4960e9e39fc8db294534185704c10d9a1cd6562db68b8ffef18fe094f2a172425158ded443d3c670d3463047b3dd098ee6cc97e12e62dcd1ec7f5d3a5139a8fa0aca0ff5902be732b542943e179a2c23762491d8ab7d20352c2e8c62d844dd03f477af2842ffb189e75eae04703a".to_string(),
            vk_ic0: "063ad50333482e2f29a36cbfb847dafdba766a58a6165b0ea693feac43417160165e0e036fbc0105cdef72c5cdff80223c2f8226ae10cbc3f3ab6ad9c684ced7".to_string(),
            vk_ic1: "1e8df3e852c155a3e173e5f7aa07e74accf15894854e20124016e41fa21026e41baf26dec20984679aecfdd0667a137ee746c23c5598cd530618bbbfd61a82e9".to_string(),
        };

        let groth16_process_vkeys = format_vkey(&groth16_process_vkey)?;
        // Create a tally_vkeys struct from the tally_vkey in the message
        let groth16_tally_vkey =     Groth16VKeyType {
            vk_alpha1:
					"2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
				vk_beta_2:
					"0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
				vk_gamma_2:
					"198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
				vk_delta_2:
					"1ac6fcb923e8a72ba02c4a9ecc2584f17365da4993c303c69c67302e723ae4b22acaaf0f622bb6a87f929a43177def12566b5a5d5af220086cba3facc17d337e02b46797fdb2a579e52d243f70bc9211e29d58dfffc4aec3908e95d2484766ab07f163b00d30e610c8a7d366cd2a363cca2b7cfcb375dde541ef3e15a85b92a6".to_string(),
				vk_ic0: "0b20a7584a8679cc6cf8e8cffc41ce9ad79c2cd0086214c3cb1af12146916bb9185b916c9938601b30c6fc4e7f2e1f1a7a94cb81e1774cb1f67b54eb33477e82".to_string(),
				vk_ic1: "081919adecf04dd5e1c31a3e34f8907d2ca613df81f99b3aa56c5027cd6416c201ddf039c717b1d29ecc2381db6104506731132f624e60cc09675a100028de25".to_string(),
        };
        let groth16_tally_vkeys = format_vkey(&groth16_tally_vkey)?;

        // Create a deactivate_vkeys struct from the deactivate_vkey in the message
        let groth16_deactivate_vkey =  Groth16VKeyType {
            vk_alpha1:
					"2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
				vk_beta_2:
					"0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
				vk_gamma_2:
					"198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
				vk_delta_2:
					"29cb6daca9a9656f1d4ba4921a224e7f4eace00f8edcd3e325d1735afc9399e30a162284708bef3899798526b60d694364578a04b8d5069c780652a4f064e00117903c8ad872a5894b7c9d2e11ff196b2c7f4bd9a81d16e06b87289a8722294f01b860eec043b480f39c0073d64012963345db302baa45582bdd16e8f48b82ce".to_string(),
				vk_ic0: "24fcf45858d52df1307621609f9b3458575acdb85e40d5f963865ae9a55490be05d0b31cfefecf6b559403db12de44f7f514f96bfe485549bb15d639bd6ed085".to_string(),
				vk_ic1: "027a268d55de6d91ad4bb34ff88cb7f41933c1f842f521df118d925947b0252e11bcf96bf4363a1a0bf2c78ab3d8499370dda56d6db5a82f9ccf8303e8edfd38".to_string(),
        };
        let groth16_deactivate_vkeys = format_vkey(&groth16_deactivate_vkey)?;

        // Create an add_new_key_vkeys struct from the add_new_key_vkey in the message
        let groth16_add_new_key_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "1917bfd8452b92e8a2886595f62ebed7adb97172554f21a61a99b5b2a1d4d25f2fa61cef88c1a1ac2f37e017dbe617bbdc04ffa29a00d8bc46a440e5ffd7206b1d753b1cc98be00cd33badc688a586e77c74a514a82984ab3e9a22a1f71470e6047625e5d4f9580a5151660333621bf1f690eff749d8e91f99064542af5f685b".to_string(),
            vk_ic0: "2dbbb532c47e57c996a41c322bc54ac68b013ba0ff1771d5b70a4bc48531307812d75438820b13ef0535a5968d2b8b5b2d5e52cafe1c62276b1f4d6c83c49509".to_string(),
            vk_ic1: "1003003b0c3c93ab80b2e37ee1b38f80a769445a49535fd86f86fb07b269073c1059f3de74eb805c960928de9d3cda4416c59dbe39a11f7e6fbbbd5c99e10bff".to_string(),
        };
        let groth16_add_new_key_vkeys = format_vkey(&groth16_add_new_key_vkey)?;

        let vkeys = VkeyParams {
            process_vkey: groth16_process_vkeys,
            tally_vkey: groth16_tally_vkeys,
            deactivate_vkey: groth16_deactivate_vkeys,
            add_key_vkey: groth16_add_new_key_vkeys,
        };
        return Ok(vkeys);
    } else if parameters.state_tree_depth == Uint256::from_u128(4)
        && parameters.int_state_tree_depth == Uint256::from_u128(2)
        && parameters.vote_option_tree_depth == Uint256::from_u128(2)
        && parameters.message_batch_size == Uint256::from_u128(25)
    {
        let groth16_process_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "00ac9303246b3b8b2c649aa38df16830f91dde8460660dfcf8c87fc930106b91055d7e9a5e2d4383c74ec0b4fc1e4dbbbc1244b9130bd4d7cf6828e9d88cc911197b27ba92fb6d545705a8e08be249726f960f4732a278493f710f52c45ab21216278404c3a57035877002e3c689e4d965db91a107576780957eec1f0c2401ef".to_string(),
            vk_ic0: "08175debf4a726467fc049a913b4a45fff37b3e7d72d8123e82323caa43a109a22835440de8c81bde5dc97f400d48a1c9d0cbaee08c386eda8732c724804343e".to_string(),
            vk_ic1: "0890cdb4486f2ec390e15e7d5da7234ea05e953a761319a8a3009aa566facd0b194b1c687bcf0ce9838669208fbc4b9132184fd1bcd63d8f65aa023c0745f2cb".to_string(),
        };

        let groth16_process_vkeys = format_vkey(&groth16_process_vkey)?;
        // Create a tally_vkeys struct from the tally_vkey in the message
        let groth16_tally_vkey =     Groth16VKeyType {
            vk_alpha1:
				"2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
			vk_beta_2:
				"0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
			vk_gamma_2:
				"198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
				vk_delta_2:
				"177845e8b046bdf880ff13382d43091d446b1675f63b30591de497f13cb3047817046e858bff9c2f586cd2910d9cf93647e6c9da4206d6c3a0d8133759f78e2e2500fc604f1b7e86c9dfc7e467c230024a5c606dc55279b363cef9409078ad6f18a0e28602687f2bbc62f79a1299bd18f15b1dc59d1b1fc6aa0738673d9628d8".to_string(),
            vk_ic0: "0ea52cbde58120337cc92e98bae21083d0fd9bb04644c1cd9ff34a3e61a7eec00488120d2e24eb5fc0de14ab3490a35947ebc939385bea1f65fc6ab0bb9c9fc3".to_string(),
            vk_ic1: "2b3ae8f64c57b5dc15daa78c1cc914737d45f18c5cb1e3829bebff818849c5a92223665f0add13bc82d0dfb1ea5e95be77929bb8ab0a811b26ad76295a8f8576".to_string(),
        };
        let groth16_tally_vkeys = format_vkey(&groth16_tally_vkey)?;

        // Create a tally_vkeys struct from the tally_vkey in the message
        let groth16_deactivate_vkey =  Groth16VKeyType {
            vk_alpha1:
                "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2:
                "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2:
                "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2:
                "0285898edb6c321ab5f9b00d17d26f66afaf712d0eca60c23b26e616c4396ded1d630a86f7ad697b99fd85966186c594e03c2961197c9ae353874de5f06351b70a021fcb254c151fdba939d79b94b97973b0c62273bed53a3b32f5d8d6cdadb114a857a0b21f387dbfc3b07b7f9dd780579a28da6689c3ed2fe9ee00d0d264e0".to_string(),
            vk_ic0: "1b3d4ecc1f164ed5685bdfe15ecd5a7f353d4e59ebc9f3db9bfa22df6228712f13fc23ab73a75591590f3bcd61e0fec4033265f7d22d1a52585fa0f340bb244f".to_string(),
            vk_ic1: "18fd52597babf9f0d2b21e063c217cff0dfd44e5bb10cbcdcca5c0fa5352d6b43026087847d956be3afad799128a94f887e163535e5f8f45384c1a010d8d29da".to_string(),
        };
        let groth16_deactivate_vkeys = format_vkey(&groth16_deactivate_vkey)?;

        // Create a tally_vkeys struct from the tally_vkey in the message
        let groth16_add_new_key_vkey = Groth16VKeyType {
            vk_alpha1:
				"2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
			vk_beta_2:
				"0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
			vk_gamma_2:
				"198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
				vk_delta_2:
				"062fe7880d7a1b50be2c10cddb39ea4984bcc54a7950fe348ff42fb556a18ffc0a0a94bb1bd38aef37ff599abecea18345dbebb70c5f10b8aa728f72cb8b7c0e1c0a2592dc79a3919d728dc821209a49d44058f7c7b01de44c45dc5a9cb19d4428e826b4ac22e185f6af939d8c4ae4760aa4df77781450ce9ee27a223011b7cf".to_string(),
			vk_ic0: "0310de84dfa4481fd0ad8fdefaad0e69a85d47a1da407a5081df2cd7194873f62bd14d7f28c1e947bf07bbeb840371c75902b0f22351df949f9919a08d692a90".to_string(),
			vk_ic1: "01bec14f99974f9072bfc82670917bfc4bdc1ed56167f6aee9dfb5eca1f5af9304e408d5736afbc978b7f07def0a6988d4b68cf2ac9feabaf642ee94b2582982".to_string(),
        };

        // Create a process_vkeys struct from the process_vkey in the message
        let groth16_add_new_key_vkeys = format_vkey(&groth16_add_new_key_vkey)?;

        let vkeys = VkeyParams {
            process_vkey: groth16_process_vkeys,
            tally_vkey: groth16_tally_vkeys,
            deactivate_vkey: groth16_deactivate_vkeys,
            add_key_vkey: groth16_add_new_key_vkeys,
        };
        return Ok(vkeys);
    } else if parameters.state_tree_depth == Uint256::from_u128(6)
        && parameters.int_state_tree_depth == Uint256::from_u128(3)
        && parameters.vote_option_tree_depth == Uint256::from_u128(3)
        && parameters.message_batch_size == Uint256::from_u128(125)
    {
        let groth16_process_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_ic0: "004acde283c7e2f3a172146fde9076f996a4aee5f8855fd644c8cda0bbbe501504bde32d4f9976252ece9e5f41f00e19317587ddd7e80092937d0faa08896421".to_string(),
            vk_ic1: "22cd5260f9bfb2e93bcb2e378aabc18a195d8c9f4c571cb8663381c0642daaff0e67b71c87fcfee8e9b0b46ef46874c43b02cc93bab22949afe5550afe07f224".to_string(),
        };

        let groth16_tally_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_ic0: "23bee370108a6b1620be673d2c498afc2044e181d018c0339e72c81ea758d1da0bdf3384853747dbeb7569a6329dd9b87a3b816554a885d2f228f6fa51696379".to_string(),
            vk_ic1: "2ef29a80116a8b7c5989c7ea8ed89fef6e574328c0b5168991fbe3ff5c2fee1919c82267e87309edc10ee70705147eafdced664b0d94ba3a704a166bcfa95ee7".to_string(),
        };

        let groth16_deactivate_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_ic0: "03dd160100847287cbdb29dd3117ee0edac3f66bd19454ccc68191af41d1498d21070e29927c04c68b0428d5b701a3e935a7951cfc49afa174da33c0066c159c".to_string(),
            vk_ic1: "12b983c06d2fde3b7ec2726e3180efcd5db34ac4bea974dab3221c1ba584b6cb17aaff163a8d99e8f3b05378294f10b71dbf21d3471cb8b3d4a82de7d6d0b60c".to_string(),
        };

        let groth16_add_new_key_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_ic0: "0ddc195c17736cafb45d5ceabe6e9e8d038a5c4ea456f3a09c42891cce237f5e1da82175eeb13cc895f8d69d6c28e2514fbfd5dc25eeec8c4f7ca3cd9e6b80b2".to_string(),
            vk_ic1: "018feb5d122cb96fc55309e5818ba2dbd5f493db38dbd10aceab2e846e7838fe04d0b00b725ac7a20c033868b342291db38d85fefb1e34486c0ba254c8904783".to_string(),
        };

        let groth16_process_vkeys = format_vkey(&groth16_process_vkey)?;
        let groth16_tally_vkeys = format_vkey(&groth16_tally_vkey)?;
        let groth16_deactivate_vkeys = format_vkey(&groth16_deactivate_vkey)?;
        let groth16_add_new_key_vkeys = format_vkey(&groth16_add_new_key_vkey)?;

        let vkeys = VkeyParams {
            process_vkey: groth16_process_vkeys,
            tally_vkey: groth16_tally_vkeys,
            deactivate_vkey: groth16_deactivate_vkeys,
            add_key_vkey: groth16_add_new_key_vkeys,
        };

        Ok(vkeys)
    } else {
        return Err(ContractError::NotMatchCircuitSize {});
    }
}
