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
  zkeyUrl: 'https://vota-zkey.s3.ap-southeast-1.amazonaws.com/amaci_9-4-3-125_v6_zkeys.tar.gz',
  zkeyTarSha256: '0a0a983ca9cd15aaae1272b7e5f43392b93011856407d614b096398e4c833936',
  params: { stateTreeDepth: 9, intStateTreeDepth: 4, voteOptionTreeDepth: 3, messageBatchSize: 125 },
  vkeys: {
    process: vkey(
      '059756653a474da0d3a99522bfba92428ff603c8254e3c5016c41fc532baadd42f456e58a452cc9ace1828ca8eafcda8685872703c35ef5d796e7e8bed5a4d00002d372c4d2bbccad47dbed288eaad7a6bce92f605f1082fa4442cf7555b6dff14eea0b33c1832a169e2e42dcb07749d88806193280fd009912ab35af8b2a2c2',
      '2936807506628c01f5c320b0cfe38bcd7de3f1c9f78649cb2ee9fe835c523e602d716f08d8b98a688c9f106bb18060c66feaf31854327cf20dd3170a284f8258',
      '0db49219818833defe6729fe69d23bbbd6c892b45b49792b798c13ff3ab72f3e1674142a207b3a01330a307e9613dc643b181a728bc4a041ad5a0ff37900c71c'
    ),
    tally: vkey(
      '04ac819540c297e090f7798b260dedf91d7d07e0c28c935b1727e815fc0b690a04c5daab1db9d8cf8dd34f682d74f9cc692ad4c48402aad88c0071769e13b589013d75b834c55ff9b9f9d3dd8b2c736b836af659800f6b1b0b1602f3c6007add2d1fe9bebad5ca5847b53d2241fbf84c32ed836b3226136a213236fac682561b',
      '1840e9af4d2094c190adf2e40468515ee760858a2a41a26aa7916bc38bd7ba9f01ea24bf4adad4d679ddf5858dbcb4587b954a6062b264288f6e191c6d697759',
      '1ed068e3bbc130b6a420efe22b7f26b7372686108ff1935eea7508eb814d3e2e0ab2da2095988387330108bee8d58121be18e61bb594ba9b8982a290cfc2571b'
    ),
    deactivate: vkey(
      '147cbe7e7451633254d01f220cf3521717258300cbe8eea7f9c5e4a5aa776a5d1fbe926fe9c14bf755a9c2ac403e2c94eaf9015dda20644279d115e9b8556904205164034510b8e0dbad7647a37b4d958247ac849463e291152460f3cc08cd3c2eeb4a102cd303af7fd64bf0d61319f658330f121373b9b5b983c2e680ba3d8d',
      '2341ef299bd50b06e3885f2c95e6e043ac4a9b30263fb5b212b9c5ee443ab28d17b0dd121483ee7a280fe8a82384e8bbd0e52c32be97148dfaecb953ee0b34fe',
      '04c3cdc1e32f4e6eae21adb419ed037dcd5daa9012bc9fe31e4ebedba31c101b00f8483d686d64d0eb7d1c3278b4409f4717dea169970f62505a52e3c08b6d4d'
    ),
    addNewKey: vkey(
      '0eb06f2f1b513f042895affc86f337c896aff1a9b0b158bbd3608ba3f27165862c47682ba5c8ebad4178c520f9d88e9bfa8cadf098baf2fe5509929131f909741d6888dd7e2462f4e7d0564ace9128facc836d221dff6c0b85181519ee039f2b04f70b9050f84fb9ca004fd086fab7ca49c9c07e32b841805147aa86930fdb9e',
      '0eb39e5aa053d6676afa84d88c23996669b18eda44eb6d97420176ff55c276290ae7df9c85d77b9aef313093fdeada3c53cd1b0cfd7ed04460a719cfff4e5925',
      '200467c396f31ec6b2f3324d5fa38a28e18ce24c1a92742486553e2375204fc82e4feff4af5e2c2ac4acd05af4a64d161edee15e1feef61d2f4977860643c94b'
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
  zkeyUrl: 'https://vota-zkey.s3.ap-southeast-1.amazonaws.com/amaci_2-1-1-5_v6_zkeys.tar.gz',
  zkeyTarSha256: '67818182b14ef30cc8cdd978bffc04264f47b2db7e8cb3cc133a21a880d40f56',
  params: { stateTreeDepth: 2, intStateTreeDepth: 1, voteOptionTreeDepth: 1, messageBatchSize: 5 },
  vkeys: {
    process: vkey(
      '19b3324e99e392444b416f376b6c1985756f2ce27ba8001611844b7709851c86076765c63f2a1ad176699fd24fab90f4a9fd10b7d934e73f168a892aeb8449b22048de2e2e86a887316a883b72b116c571aac32e2bb80fc875db2be20b4ce86e06d2c2711d7f387ccc6eacb5883ecfc78c729d37cf9970909b47b161f14b5763',
      '2109d20e2dfb65b2564cdd873f95f21a9215d9757c6ec62637b8d80373e1e9bb066ef0037b411d062439a5034b5c71bcdc2df0e3999fe5b7afd7cb88a32ceb30',
      '05199f9ffa6b1ec953808a3dd750ad9168ae7a1464ddcead6cf31d61530e22a215b34e716a4871c189f25cf43ebc656d3256812cb98179183df2a9da65da34b9'
    ),
    tally: vkey(
      '2747cb292b1263b86b325ae591e1e226049404334bb09165c6a7efac9744178b22508dbdabea8802179f8f2b7c9d064ab962fe834c16738721d03ad6db6836f9090497dc22da1e7959e91b42bba33f2b74c9f0c2a4a21055a7148b6716fb95e629bdc0b0b474b84c6e41687154ec37b95ccaed7d1a578fef1873dcc5e672d912',
      '0b20a7584a8679cc6cf8e8cffc41ce9ad79c2cd0086214c3cb1af12146916bb9185b916c9938601b30c6fc4e7f2e1f1a7a94cb81e1774cb1f67b54eb33477e82',
      '081919adecf04dd5e1c31a3e34f8907d2ca613df81f99b3aa56c5027cd6416c201ddf039c717b1d29ecc2381db6104506731132f624e60cc09675a100028de25'
    ),
    deactivate: vkey(
      '26f85af9fdc3df0a5ee4a7737e629eb22e1df46aea9c67767eb1c9fa16387a6b1e00017122d8106b5967c49f2e976cec95fdb80aeefd901e808e01c314963e771d7773994f156c2092b98f0e69c2987defa8c338b2e0f3dbe45d78112306782a07227a53bcb6ad9a60b84924da88f13275a9a4f29843b06bf89b2f072b6ab6a6',
      '141ed95aed8eac95334e6dbaa513736949402fd820920d8e2179d7be54593f60070ffd76988c62dbf2cf4a365da0fbecde7e7ccb39f1e0e0728a6941da3435cd',
      '2c1289b05f9093a1d4c7536093702b08d57654fae20ae871de2598565c43c8611d5bc6caad360c2b6f68480aa71efbcc506524104152bb73f79d9cb0f3d12180'
    ),
    addNewKey: vkey(
      '07b9d5bf21365da183856ac35153c99e3778211de334e7dc31db2cd038cb3f84009c65360ff6b5581f7ef5ef43db9ce552ab6a085ed584e1c403a913d320f15c0fe6dbb6aba6461d43b49f4e3dca84aba1564e72bf6d9542e75fd6677834a9611b5c161cc38da933e6e4fb6ef58f5d4e04c19b6df7cab0c650b6c4d572ef5789',
      '29639aea06acd9b07e36d2456153d4e81581d65efb2fc93f0d54618398be1c471f49496bce6f344badecd9493d07faaaa2d09c7216734488f3ce2e2d0bd25be9',
      '20ccb32cbbbb10099ab8ef2bfd196ec22b3c07c8c7eba7076bb8d16be4aa69ad0b0ff4e2a298219ef216024cd65a8b26470a7daa2e8ce55af41038a74d5d589f'
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
