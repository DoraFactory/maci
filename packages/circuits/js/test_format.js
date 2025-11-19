const uncompressed_proof = require("./format_proof")
const fs = require('fs')

async function main () {
    const pof = JSON.parse(fs.readFileSync('../inputs/deacive_proof.json', "utf8"));
    console.log(pof)
    let hex_proof = await uncompressed_proof.adaptToUncompressed(pof)
    console.log(hex_proof)
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});