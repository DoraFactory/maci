import {
  compressPublicKey,
  decompressPublicKey,
  transformPubkey,
} from '../src/utils';

import { packPubKey, unpackPubKey } from '../src/libs/crypto';

const mainnetOldPubkey =
  '1c3b06925c6239136b827dfd20b7b83218514418ba904d1dffcccc00a391f5d01d5f2dd3f387f1fee338b299167ddffed5a464be352a8a7fe2121340395d4c06';

const decompressedMainnetPubkey = transformPubkey(mainnetOldPubkey);
console.log('decompressedMainnetPubkey', decompressedMainnetPubkey);

const testnetOldPubkey =
  '0d622736d5630a9e39a2998599bebf703a794978b64d30148cf7a15870f014fe2d79c78ccd5fffa53897b817075bdeef74a2ea9f244983d2f0829e19f44c59b5';

const decompressedTestnetPubkey = transformPubkey(testnetOldPubkey);
console.log('decompressedTestnetPubkey', decompressedTestnetPubkey);

// const new_mainnet_pubkey = packPubKey(decompressedPubkey);
// console.log('new_mainnet_pubkey', new_mainnet_pubkey);

// const compressedPubkey = compressPublicKey(new_mainnet_pubkey);
// console.log('compressedPubkey', compressedPubkey);

// const decompressedPubkey2 = decompressPublicKey(compressedPubkey);
// console.log('decompressedPubkey2', decompressedPubkey2);
