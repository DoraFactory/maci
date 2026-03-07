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
            vk_delta_2: "18c60a76759663146568fc6149e37b1b79e4e04e316a8352d709f1025d50dddc19bacaf056a1fcce88f14409ad468b01c4d9fb261fb195458e976f068c6c0d521672c70ece2f5ffbd9b7bcbb11bd44153bd8e186db57928510ad694b1865cefd1467856fd6f70bdcdadfbde395d15dccdc599bf6fd2b9b9a216c05a7d8d34727".to_string(),
            vk_ic0: "10ffd4a423eb7f6fc9cda36b2065908c4d4bb39d2467f2c477177176b8162d790600a7ec8ba3e05c157fdef5290671f9599a0680b138b21a4570881e15da16fa".to_string(),
            vk_ic1: "03280fdf4e9cd3dd1fac6e5bb75ffe58368f6a578863dc10c9628c88ec19fe201b5f718a6145edc92aa1b79660c85fcb9c14fb996da51db91cf7a1fe8ccf993e".to_string(),
        };

        let groth16_tally_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "183b3710e8cfdbf2fcfca592dc4eb1261dcbf91411c05c75438c8cb0f70383df1471819337559c84882f414130d5e56971e78d0199fc50f25e35c2e1ff4ed13112a5bcde0cda1ccf83f6a1f6684cef461420b684343e83b66c33924a98e88fc82b4e5a75e3707aca6b03f6a7b9491cad4e4894a441f9220f653b9ad895cad784".to_string(),
            vk_ic0: "23bee370108a6b1620be673d2c498afc2044e181d018c0339e72c81ea758d1da0bdf3384853747dbeb7569a6329dd9b87a3b816554a885d2f228f6fa51696379".to_string(),
            vk_ic1: "2ef29a80116a8b7c5989c7ea8ed89fef6e574328c0b5168991fbe3ff5c2fee1919c82267e87309edc10ee70705147eafdced664b0d94ba3a704a166bcfa95ee7".to_string(),
        };

        let groth16_deactivate_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "044e9bed633fa3e298d9b8fdf85f3df8e67635f1c420163c2d5ac9603dcfbee912f6880cd923b3becdf2d10664f468058f6e84335a1140e92142f000587bcc431812dec4e399a17eef71f1edd1535a365a24c1cab888f9c1c923d64a94694296108edbd66fdc5545cd4fa5f8d6e35f71f16f7f1e90eb6cbe06223960997f2e61".to_string(),
            vk_ic0: "02e78813ef086abfb50c957de23dab1c9f251e78a4c0e3911dd95015b4efd4721ce478ec4fc28e0b8ee0b345f3eaaf5e846d9e695b517ecc200967c81b3de649".to_string(),
            vk_ic1: "0926a6d1d663f466a6633c9e31b8227c4beb5649f2f59c040aff12e6358af379063becb3f750b20625f63a644cf4b6618c83cf5f50b1540d043ce364e8c7665e".to_string(),
        };

        let groth16_add_new_key_vkey = Groth16VKeyType {
            vk_alpha1: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926".to_string(),
            vk_beta_2: "0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8".to_string(),
            vk_gamma_2: "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa".to_string(),
            vk_delta_2: "0e45c12373f750656603ab7d3ab089bc44c0702fe913fccb78838687d3313a5e0136cbb1154ce45afd20f8dd5c6c5572e7d316c778ff3779bf164c738f64b0960ba1e4b55b5b7b8d3899795d4d9bbc8bb55a1d3f560b2ec118697a385abdec5310952ae09c0da2c2acefea39d74c1227c209f7ce5a39b9d50efefa93298dce8c".to_string(),
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

        return Ok(vkeys);
    } else if parameters.state_tree_depth == Uint256::from_u128(9)
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
            vk_delta_2: "2c9bb2ec409a79fc1f5328ddf98f6287076fb976983ef7c07a6ddf3181be31c92fd262f754a8307b5c494b66d1b43b47d5994e2e433226fc32f2f2b6ad35e3cd023a2cebe8b93465d92fc8b532ef0ab90659fbb5cec575cbf032bb51e38d462e1d7083bfb7fbf4c7b8575781c939e80c4792dd664e717c8d6e19e189130df2ec".to_string(),
            vk_ic0: "2e68c6edd45631f256ea2e533c5d6f11812e1b228c3a69b3b667dbc1b1f66b1020eee6c5b1e3f5fa6df4765e4d8629f018ee8c4229e3b12baa8914ff7c44ee82".to_string(),
            vk_ic1: "2ddc19e105a2db8f7ffcad15524683512f0579901a740c24f3ba8c3d59d74aea29f61d3cf08344d019192fb1033f0807ab9ec747960c52ef82daa9cd91bad338".to_string(),
        };
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
