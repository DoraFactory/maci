
const fs = require("fs");
const path = require("path");
const curves = require("./curve.js");
const { utils } = require("ffjavascript");
const { unstringifyBigInts } = utils;


module.exports.adaptToUncompressed = async (pof) => {
    // const pof = JSON.parse(fs.readFileSync(proofName, "utf8"));

    // from object to u8 array
    // const proof = unstringifyBigInts(proofName);
    const curve = await curves.getCurveFromName("BN128");
    const proof = unstringifyBigInts(pof);

    // which can be convert into Affine type in bellman
    const pi_a = curve.G1.toUncompressed(curve.G1.fromObject(proof.pi_a));
    const pi_b = curve.G2.toUncompressed(curve.G2.fromObject(proof.pi_b));
    const pi_c = curve.G1.toUncompressed(curve.G1.fromObject(proof.pi_c));

    let uncompressed_proof = {};
    uncompressed_proof.pi_a = Array.from(pi_a);
    uncompressed_proof.pi_b = Array.from(pi_b);
    uncompressed_proof.pi_c = Array.from(pi_c);

    let hex_proof = {};


    hex_proof.pi_a = Bytes2Str( uncompressed_proof.pi_a)
    hex_proof.pi_b = Bytes2Str( uncompressed_proof.pi_b)
    hex_proof.pi_c = Bytes2Str( uncompressed_proof.pi_c)

    return hex_proof;
}

function Bytes2Str(arr) {
    let str = "";
    for (let i = 0; i < arr.length; i++) {
        let tmp = arr[i].toString(16);
        if (tmp.length == 1) {
            tmp = "0" + tmp;
        }
        str += tmp;
    }
    return str;
}

