import { Groth16Proof } from 'snarkjs'
import { utils } from 'ffjavascript'
const { unstringifyBigInts } = utils

import * as curves from './curve'


const Bytes2Str = (arr: number[]) => {
  let str = ''
  for (let i = 0; i < arr.length; i++) {
    let tmp = arr[i].toString(16)
    if (tmp.length == 1) {
      tmp = '0' + tmp
    }
    str += tmp
  }
  return str
}

let BN128Curve: any = null

export const adaptToUncompressed = async (proof: Groth16Proof) => {
  const p = unstringifyBigInts(proof)

  let curve = BN128Curve
  if (!curve) {
    BN128Curve = await curves.getCurveFromName('BN128')
    curve = BN128Curve
  }

  // convert u8 array(little-endian order)to uncompressed type(big-endian order and on bls12_381 curve)
  // which can be convert into Affine type in bellman
  const pi_a = curve.G1.toUncompressed(curve.G1.fromObject(p.pi_a))
  const pi_b = curve.G2.toUncompressed(curve.G2.fromObject(p.pi_b))
  const pi_c = curve.G1.toUncompressed(curve.G1.fromObject(p.pi_c))

  return {
    a: Bytes2Str(Array.from(pi_a)),
    b: Bytes2Str(Array.from(pi_b)),
    c: Bytes2Str(Array.from(pi_c)),
  }
}
