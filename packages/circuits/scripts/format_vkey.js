const fs = require("fs");
const path = require("path");
const curves = require("./curve.js");
const { utils } = require("ffjavascript");
const { unstringifyBigInts } = utils;

const adaptToUncompressed = async (verificationKeyName, hexOutputPath) => {

    const verificationKey = JSON.parse(fs.readFileSync(verificationKeyName, "utf8"));

    // from object to u8 array
    const vkey = unstringifyBigInts(verificationKey);

    const curve = await curves.getCurveFromName(vkey.curve);

    const vk_alpha_1 = curve.G1.toUncompressed(curve.G1.fromObject(vkey.vk_alpha_1));
    const vk_beta_2 = curve.G2.toUncompressed(curve.G2.fromObject(vkey.vk_beta_2));
    const vk_gamma_2 = curve.G2.toUncompressed(curve.G2.fromObject(vkey.vk_gamma_2));
    const vk_delta_2 = curve.G2.toUncompressed(curve.G2.fromObject(vkey.vk_delta_2));
    const ic_0 = curve.G1.toUncompressed(curve.G1.fromObject(vkey.IC[0]));
    const ic_1 = curve.G1.toUncompressed(curve.G1.fromObject(vkey.IC[1]));

    let ic = [];
    ic.push(Array.from(ic_0));
    ic.push(Array.from(ic_1));

    let uncompressed_vkey = {};

    uncompressed_vkey.alpha_1 = Array.from(vk_alpha_1);
    uncompressed_vkey.beta_2 = Array.from(vk_beta_2);
    uncompressed_vkey.gamma_2 = Array.from(vk_gamma_2);
    uncompressed_vkey.delta_2 = Array.from(vk_delta_2);
    uncompressed_vkey.ic = ic;

    let hex_vkey = {};

    /*     hex_vkey.vk_alpha_1 = '0x'+Bytes2Str( uncompressed_vkey.alpha_1)
        hex_vkey.vk_beta_2 = '0x'+Bytes2Str( uncompressed_vkey.beta_2)
        hex_vkey.vk_gamma_2 = '0x'+Bytes2Str( uncompressed_vkey.gamma_2)
        hex_vkey.vk_delta_2 = '0x'+Bytes2Str( uncompressed_vkey.delta_2)
        hex_vkey.vk_ic0 = '0x'+Bytes2Str( uncompressed_vkey.ic[0])
        hex_vkey.vk_ic1 = '0x'+Bytes2Str( uncompressed_vkey.ic[1]) */

    hex_vkey.vk_alpha_1 = Bytes2Str(uncompressed_vkey.alpha_1)
    hex_vkey.vk_beta_2 = Bytes2Str(uncompressed_vkey.beta_2)
    hex_vkey.vk_gamma_2 = Bytes2Str(uncompressed_vkey.gamma_2)
    hex_vkey.vk_delta_2 = Bytes2Str(uncompressed_vkey.delta_2)
    hex_vkey.vk_ic0 = Bytes2Str(uncompressed_vkey.ic[0])
    hex_vkey.vk_ic1 = Bytes2Str(uncompressed_vkey.ic[1])

    fs.writeFileSync(path.resolve(hexOutputPath), JSON.stringify(hex_vkey));

    console.log(`generate uncompressed verification data successfully!`);
    console.log(`Output saved to: ${path.resolve(hexOutputPath)}`);
}

function Bytes2Str (arr) {
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

// Get command line arguments
const args = process.argv.slice(2);

// Check number of arguments
if (args.length !== 2) {
    console.error("Usage: node formatVkey.js <input_verification_key_path> <output_hex_path>");
    console.error("Example: node formatVkey.js ./maci-2-1-1-5/tally-vkey.json ./maci-2-1-1-5/tally-vkey-hex.json");
    process.exit(1);
}

const [inputPath, outputPath] = args;

// Check if input file exists
if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file '${inputPath}' does not exist.`);
    process.exit(1);
}

// Ensure output directory exists
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
}

console.log(`Processing verification key from: ${inputPath}`);
console.log(`Output will be saved to: ${outputPath}`);

// Execute conversion
adaptToUncompressed(inputPath, outputPath).catch(error => {
    console.error("Error processing verification key:", error);
    process.exit(1);
}).then(() => {
    console.log("Script completed successfully!");
    process.exit(0);
});