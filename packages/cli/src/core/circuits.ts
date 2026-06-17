/**
 * aMACI circuit registry.
 *
 * All vkeys are sourced directly from:
 *   maci/contracts/amaci/src/circuit_params.rs
 *
 * Supported circuits:
 *   - 9-4-3-125 (production): the only circuit accepted by the live aMACI contract binary.
 *   - 2-1-1-5 (test-only):    accepted only when compiled with #[cfg(test)] or feature="test-vkeys".
 *
 * Each aMACI circuit requires four Groth16 vkeys: process, tally, deactivate, addNewKey.
 */

export type AmaciVkeySet = {
  vk_alpha1: string;
  vk_beta_2: string;
  vk_gamma_2: string;
  vk_delta_2: string;
  vk_ic0: string;
  vk_ic1: string;
};

export type AmaciCircuitEntry = {
  /** Human-readable label, e.g. "9-4-3-125" */
  label: string;
  /** Whether this circuit is accepted by the production aMACI contract binary */
  production: boolean;
  /** Where the vkey data originates */
  source: string;
  /** Download URL for the zkeys tar.gz archive */
  zkeyUrl: string;
  /** SHA-256 hash of the zkeys tar.gz archive */
  zkeyTarSha256: string;
  params: {
    stateTreeDepth: number;
    intStateTreeDepth: number;
    voteOptionTreeDepth: number;
    messageBatchSize: number;
  };
  vkeys: {
    process: AmaciVkeySet;
    tally: AmaciVkeySet;
    deactivate: AmaciVkeySet;
    addNewKey: AmaciVkeySet;
  };
};

// Shared BN256 Powers-of-Tau constants — identical across all aMACI circuits.
const SHARED_ALPHA1 =
  '2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e214bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926';
const SHARED_BETA_2 =
  '0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a71739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8';
const SHARED_GAMMA_2 =
  '198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa';

function vkey(delta2: string, ic0: string, ic1: string): AmaciVkeySet {
  return {
    vk_alpha1: SHARED_ALPHA1,
    vk_beta_2: SHARED_BETA_2,
    vk_gamma_2: SHARED_GAMMA_2,
    vk_delta_2: delta2,
    vk_ic0: ic0,
    vk_ic1: ic1,
  };
}

// ─── 9-4-3-125 ───────────────────────────────────────────────────────────────
// The only circuit accepted by the production aMACI contract.
// Source: vkeys_9_4_3_125() in circuit_params.rs

const CIRCUIT_9_4_3_125: AmaciCircuitEntry = {
  label: '9-4-3-125',
  production: true,
  source: 'vkeys_9_4_3_125() — maci/contracts/amaci/src/circuit_params.rs',
  zkeyUrl: 'https://vota-zkey.s3.ap-southeast-1.amazonaws.com/amaci_9-4-3-125_v5_zkeys.tar.gz',
  zkeyTarSha256: '7859912709321d51bbc90043558140c20b7bfe9a5693c1e40dcd5ccac0a35aa9',
  params: { stateTreeDepth: 9, intStateTreeDepth: 4, voteOptionTreeDepth: 3, messageBatchSize: 125 },
  vkeys: {
    process: vkey(
      '1ca282bdb2bf70aeae2a394515a6b090972b172f2baa302c9c4a5e2e62044085172b006b637672503a9ad454148c20024cc3412cd3af07fdc172cbeec61de5252e7f42a023bce7df1c2b9bb817d5c6345e03462f2231ef0b4057c487da87e4fa1df5a5ff810e7c9f18acf76a9ef37ed89169f54af3326f63e5c732886b57b0d0',
      '0f4ca042d9df017c2277a5348138072354637d7a548ed2432a62b22bd6b0793c14d190e06d249c579f2f3cb9c0d8e5223798931ac8fc645efc96739d34e3a553',
      '0231a17b99604840a6870d1c5ba31394ceb6683af703d083338c30bdb87b88851283ec802a494552bd00732fa61bfc619a4238a0ab6659e5c8fa91b2a5e5143b'
    ),
    tally: vkey(
      '232a958bbc349f1fa27cf560c9efa7248aa95d954de64a3e170c2abe8265386529255f7c77a1a70b4237d6fa8763c64699c3d1eb62a54e60349cb32c850ef1b10044d8b3fc7298d54a097453c9a9b62442fa3851e2c1dc582c47b9d60e0a62392ca45e26a1793a485d1e8c81de124d2b1cf2afefa69459ef7d567076bc864dec',
      '1840e9af4d2094c190adf2e40468515ee760858a2a41a26aa7916bc38bd7ba9f01ea24bf4adad4d679ddf5858dbcb4587b954a6062b264288f6e191c6d697759',
      '1ed068e3bbc130b6a420efe22b7f26b7372686108ff1935eea7508eb814d3e2e0ab2da2095988387330108bee8d58121be18e61bb594ba9b8982a290cfc2571b'
    ),
    deactivate: vkey(
      '11e969c11af8421c1474c478725abee854af14412b35f69010f5c9913c9eb9401474968c8c1608ebdfb978f7e72380d046d1ac079a64bae0fef5052137ae829d07317efdfe94d826337c8225c7e78be3775f3dd61a60486fe32ca7587223c58323534bc421de3812160299521a2670b43351d8c6ef3a3204ab9394c05111f805',
      '2341ef299bd50b06e3885f2c95e6e043ac4a9b30263fb5b212b9c5ee443ab28d17b0dd121483ee7a280fe8a82384e8bbd0e52c32be97148dfaecb953ee0b34fe',
      '04c3cdc1e32f4e6eae21adb419ed037dcd5daa9012bc9fe31e4ebedba31c101b00f8483d686d64d0eb7d1c3278b4409f4717dea169970f62505a52e3c08b6d4d'
    ),
    addNewKey: vkey(
      '02a72a80dfde6ca948dbeea458e76020c8627d39c60c5077d5404c5819bc08a11df56452318c35ef47cb92c9f435361a7c818e0f626f50e0dd6892c27b8536381b9996a4730c9fef7e0a9c8ac83927dd46bbfa9efc51ac1602fd53d0b496550e2d585463428f4fb1e060123a6c95ec263ae487f19c315395eb5b40b79793bb0b',
      '0255c90c4ab912fa162f9edb0d1f40a20559db7660fe597a7b1b2a9d5194dce402312ed702216f0c29e34e2b7d0f173e1ddc0ae4dabb255682e53d6264807c1e',
      '20f68fe36f8690c6e09b199cdea1e5f59c6fdb01edbdd1b7b9950aa790b9f4ce2d39c2e8fe6e99f5681543f2264ce07697b51c2ed8e6f7e66533c59eba716764'
    ),
  },
};

// ─── 2-1-1-5 ─────────────────────────────────────────────────────────────────
// Lightweight test circuit. Only compiled in #[cfg(test)] or feature="test-vkeys".
// Source: vkeys_2_1_1_5() in circuit_params.rs

const CIRCUIT_2_1_1_5: AmaciCircuitEntry = {
  label: '2-1-1-5',
  production: false,
  source: 'vkeys_2_1_1_5() — maci/contracts/amaci/src/circuit_params.rs (test-only)',
  zkeyUrl: 'https://vota-zkey.s3.ap-southeast-1.amazonaws.com/amaci_2-1-1-5_v5_zkeys.tar.gz',
  zkeyTarSha256: '098189ab917de8bbbb5265b4117a447aeb56dac4773868acbd4c11efc9252ea2',
  params: { stateTreeDepth: 2, intStateTreeDepth: 1, voteOptionTreeDepth: 1, messageBatchSize: 5 },
  vkeys: {
    process: vkey(
      '14fcf460ec67f39e7604ce59622a530797f70d5dce2cdbfcc6285acb11a091490a51cc6cc5aec73e4b1fcd45f152e8d18d9831efa2ca2d8aba5ec00a5258a86c2588c3053fe7907bd6e3b3b455283a441df9f5e9cc8b1aca6712d37004c28e4311915d144397caf4c4e74e150159574574d84d4a620cc22e1ee695b45f0c09fb',
      '152b83fbeccaaf60ff7c47ebcefc9368d1d81271fc47d36e3032f589112849c900ce96219b641b39a390c8fe58b8ff805e21e55257e1437c26285d030fb52a70',
      '0722c7bc6aaf03f86fc32096b9ad50fa14a99d113cd02d3a26df629703f7b9b61a19f057b25b77efefe232bb2cc87d9637bca988fc0325bd8c9e4b1febe5eca4'
    ),
    tally: vkey(
      '21770a545c0aaa828d45a00c7335a689ac65650edb60d582ae66928eb860ac8811ec3ee19549dc6bf84515db12f782b7c6848fe4d004d32a5d27bce19440c34a173c6f347154f90a6052e1ca1faf89d4940527f248597c340c5c6cdf436225342c0fa0a92e84c22bb553aa427aa53c0f5f3ba7f7d223f6eb89b7d7cba26eb070',
      '0b20a7584a8679cc6cf8e8cffc41ce9ad79c2cd0086214c3cb1af12146916bb9185b916c9938601b30c6fc4e7f2e1f1a7a94cb81e1774cb1f67b54eb33477e82',
      '081919adecf04dd5e1c31a3e34f8907d2ca613df81f99b3aa56c5027cd6416c201ddf039c717b1d29ecc2381db6104506731132f624e60cc09675a100028de25'
    ),
    deactivate: vkey(
      '0b2b685a254c97378d11100e45db341efebcc5e3d026fe920fdf1cac04c5feb4135b02f250b191e658c55341d45184bde62cec70444c4f210fdb507d5622dc821fe7bc3e41c31a4e6b7288ca0d519b80b18e722712d24f8786155d683f0bff7101e736bd668785e26ceb252106aaa784c922e2509d37444c711da6b3d8d0c8ad',
      '141ed95aed8eac95334e6dbaa513736949402fd820920d8e2179d7be54593f60070ffd76988c62dbf2cf4a365da0fbecde7e7ccb39f1e0e0728a6941da3435cd',
      '2c1289b05f9093a1d4c7536093702b08d57654fae20ae871de2598565c43c8611d5bc6caad360c2b6f68480aa71efbcc506524104152bb73f79d9cb0f3d12180'
    ),
    addNewKey: vkey(
      '10bec445edf1f289fe3155b575ea44b1c6a7324c5caa49e2844e6ac2a64a9760214bb37d2681588e017eafb3df83b4ab723ad7cec885795bdde199ce4ab84b672cce9d642cca67c76e5429f7688cc9488fd11e961ee40d475b9b4e5c9f4d6150227215df67b855ff3624fc15bb21c061f5f776e855f1ed4c17f3f009bb62cd1c',
      '24e55d47c4c673366c206d869261c291c3d81af0c4fdb04d2dfb7d0d630311320c1746039c41e1faba6b0426f065f8da677d7947921927ce07672d3ff5f8c576',
      '07a3d995030b94273cfa93d73c154f897e3b7192e6a49c3a17b3852f93894cd62c26b813d69e5b59ecffeda588fd3762c772ac5f290920ee0865902765cf8e3a'
    ),
  },
};

// ─── Exported registry ────────────────────────────────────────────────────────

/**
 * All known aMACI circuits, keyed by power string.
 * 9-4-3-125: production circuit (only one accepted by the live contract).
 * 2-1-1-5:   test-only circuit (accepted when contract compiled with test feature).
 */
export const AMACI_CIRCUITS: Record<string, AmaciCircuitEntry> = {
  '9-4-3-125': CIRCUIT_9_4_3_125,
  '2-1-1-5': CIRCUIT_2_1_1_5,
};
