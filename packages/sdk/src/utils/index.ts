// Copyright (c) Dorafactory, Inc.
// SPDX-License-Identifier: Apache-2.0

/*
 * BCS implementation {@see https://github.com/diem/bcs } for JavaScript.
 * Intended to be used for Move applications; supports both NodeJS and browser.
 *
 * For more details and examples {@see README.md }.
 *
 * @module bcs
 * @property {BcsReader}
 */

export { fromB64, fromBase64, toB64, toBase64 } from './base64';
export { fromHex, fromHEX, toHex, toHEX } from './hex';
export { addressToUint256, bigintToHex } from './decode-address';
export { genAccounts } from './account';
export { isValidAddress } from './validate-address';
