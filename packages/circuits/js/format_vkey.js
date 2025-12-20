const fs = require("fs");
const path = require("path");
const curves = require("./curve.js");
const { utils } = require("ffjavascript");
const { unstringifyBigInts } = utils;

const adaptToUncompressed = async (verificationKeyName, hexOutputPath, rsOutputPath = null, circuitName = null) => {

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

    // Write hex JSON file
    fs.writeFileSync(path.resolve(hexOutputPath), JSON.stringify(hex_vkey, null, 2));
    console.log(`generate uncompressed verification data successfully!`);
    console.log(`Output saved to: ${path.resolve(hexOutputPath)}`);

    // Generate Rust file if rsOutputPath is provided
    if (rsOutputPath && circuitName) {
        const rustCode = generateRustCode(hex_vkey, circuitName);
        fs.writeFileSync(path.resolve(rsOutputPath), rustCode);
        console.log(`Rust verification key file generated!`);
        console.log(`Output saved to: ${path.resolve(rsOutputPath)}`);
    }

    return hex_vkey;
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

// Map circuit directory names to Rust variable names
function getCircuitVarName(circuitName) {
    const nameMap = {
        'msg': 'groth16_process_vkey',
        'tally': 'groth16_tally_vkey',
        'deactivate': 'groth16_deactivate_vkey',
        'addKey': 'groth16_add_new_key_vkey'
    };
    return nameMap[circuitName] || `groth16_${circuitName}_vkey`;
}

// Generate Rust code from hex verification key
function generateRustCode(hexVkey, circuitName) {
    const varName = getCircuitVarName(circuitName);
    
    const rustCode = `let ${varName} = Groth16VKeyType {
    vk_alpha1: "${hexVkey.vk_alpha_1}".to_string(),
    vk_beta_2: "${hexVkey.vk_beta_2}".to_string(),
    vk_gamma_2: "${hexVkey.vk_gamma_2}".to_string(),
    vk_delta_2: "${hexVkey.vk_delta_2}".to_string(),
    vk_ic0: "${hexVkey.vk_ic0}".to_string(),
    vk_ic1: "${hexVkey.vk_ic1}".to_string(),
};`;

    return rustCode;
}

// Generate summary Rust file with all verification keys
function generateSummaryRustFile(allVkeys, outputPath) {
    const sortedCircuits = ['msg', 'tally', 'deactivate', 'addKey'];
    let rustCode = `// Auto-generated verification keys for all circuits
// Generated at: ${new Date().toISOString()}

use crate::Groth16VKeyType;
use crate::VkeyParams;

pub fn get_verification_keys() -> Result<VkeyParams, Box<dyn std::error::Error>> {
`;

    // Generate each verification key
    sortedCircuits.forEach(circuit => {
        if (allVkeys[circuit]) {
            const varName = getCircuitVarName(circuit);
            const hexVkey = allVkeys[circuit];
            
            rustCode += `    let ${varName} = Groth16VKeyType {
        vk_alpha1: "${hexVkey.vk_alpha_1}".to_string(),
        vk_beta_2: "${hexVkey.vk_beta_2}".to_string(),
        vk_gamma_2: "${hexVkey.vk_gamma_2}".to_string(),
        vk_delta_2: "${hexVkey.vk_delta_2}".to_string(),
        vk_ic0: "${hexVkey.vk_ic0}".to_string(),
        vk_ic1: "${hexVkey.vk_ic1}".to_string(),
    };

`;
        }
    });

    // Generate format_vkey calls
    sortedCircuits.forEach(circuit => {
        if (allVkeys[circuit]) {
            const varName = getCircuitVarName(circuit);
            const vkeysVarName = varName.replace('_vkey', '_vkeys');
            rustCode += `    let ${vkeysVarName} = format_vkey(&${varName})?;\n`;
        }
    });

    rustCode += `
    let vkeys = VkeyParams {
        process_vkey: groth16_process_vkeys,
        tally_vkey: groth16_tally_vkeys,
        deactivate_vkey: groth16_deactivate_vkeys,
        add_key_vkey: groth16_add_new_key_vkeys,
    };

    Ok(vkeys)
}
`;

    fs.writeFileSync(path.resolve(outputPath), rustCode);
    console.log(`Summary Rust file generated successfully!`);
    console.log(`Output saved to: ${path.resolve(outputPath)}`);
}

// Process a directory in batch mode
async function processBatchMode(vkeyDirectory) {
    console.log(`\n=== Batch Mode: Processing directory: ${vkeyDirectory} ===\n`);
    
    if (!fs.existsSync(vkeyDirectory)) {
        console.error(`Error: Directory '${vkeyDirectory}' does not exist.`);
        process.exit(1);
    }

    const stats = fs.statSync(vkeyDirectory);
    if (!stats.isDirectory()) {
        console.error(`Error: '${vkeyDirectory}' is not a directory.`);
        process.exit(1);
    }

    // Get all subdirectories
    const subdirs = fs.readdirSync(vkeyDirectory).filter(file => {
        const fullPath = path.join(vkeyDirectory, file);
        return fs.statSync(fullPath).isDirectory();
    });

    if (subdirs.length === 0) {
        console.log("No subdirectories found to process.");
        return;
    }

    let successCount = 0;
    let failCount = 0;
    let allVkeys = {}; // Store all verification keys for summary

    for (const subdir of subdirs) {
        const vkeyPath = path.join(vkeyDirectory, subdir, "verification_key.json");
        
        if (!fs.existsSync(vkeyPath)) {
            console.log(`⚠️  Skipping ${subdir}: verification_key.json not found`);
            continue;
        }

        const hexOutputPath = path.join(vkeyDirectory, subdir, "verification_key_hex.json");
        const rsOutputPath = path.join(vkeyDirectory, subdir, "verification_key.rs");
        
        try {
            console.log(`📝 Processing: ${subdir}/verification_key.json`);
            const hexVkey = await adaptToUncompressed(vkeyPath, hexOutputPath, rsOutputPath, subdir);
            allVkeys[subdir] = hexVkey;
            successCount++;
        } catch (error) {
            console.error(`❌ Error processing ${subdir}:`, error.message);
            failCount++;
        }
        console.log(""); // Empty line for readability
    }

    // Generate summary Rust file
    if (Object.keys(allVkeys).length > 0) {
        const summaryRsPath = path.join(vkeyDirectory, "all_verification_keys.rs");
        generateSummaryRustFile(allVkeys, summaryRsPath);
        console.log(`📦 Generated summary file: all_verification_keys.rs\n`);
    }

    console.log("=== Batch Processing Summary ===");
    console.log(`✅ Successfully processed: ${successCount} file(s)`);
    if (failCount > 0) {
        console.log(`❌ Failed: ${failCount} file(s)`);
    }
    console.log("================================\n");
}

// 获取命令行参数
const args = process.argv.slice(2);

// Main execution
(async () => {
    try {
        // Check for batch mode
        if (args.length === 2 && args[0] === "--batch") {
            await processBatchMode(args[1]);
        }
        // Check for single file mode
        else if (args.length === 2) {
            const [inputPath, outputPath] = args;

            // 检查输入文件是否存在
            if (!fs.existsSync(inputPath)) {
                console.error(`Error: Input file '${inputPath}' does not exist.`);
                process.exit(1);
            }

            // 确保输出目录存在
            const outputDir = path.dirname(outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
                console.log(`Created output directory: ${outputDir}`);
            }

            console.log(`Processing verification key from: ${inputPath}`);
            console.log(`Output will be saved to: ${outputPath}`);

            // 执行转换
            await adaptToUncompressed(inputPath, outputPath);
        }
        // Invalid arguments
        else {
            console.error("Usage:");
            console.error("  Single file mode: node format_vkey.js <input_verification_key_path> <output_hex_path>");
            console.error("  Batch mode:       node format_vkey.js --batch <verification_key_directory>");
            console.error("\nExamples:");
            console.error("  node format_vkey.js ./maci-2-1-1-5/tally-vkey.json ./maci-2-1-1-5/tally-vkey-hex.json");
            console.error("  node format_vkey.js --batch ./build/amaci/6-3-3-125/verification_key");
            process.exit(1);
        }

        console.log("Script completed successfully!");
        process.exit(0);
    } catch (error) {
        console.error("Error processing verification key:", error);
        process.exit(1);
    }
})();
