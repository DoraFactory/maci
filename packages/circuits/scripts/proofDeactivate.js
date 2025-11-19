// const fs = require("fs");
const { groth16 } = require("snarkjs");
const { stringizing } = require("./keypair");

module.exports.proofDeactivate = async ({ input, size }) => {
  const res = await groth16.fullProve(
    input,
    "./build/deactivate_js/deactivate.wasm",
    "./build/zkey/deactivate_0.zkey"
  );

  // console.log(input.inputHash.toString(), res.proof);

  // const proof = [];
  // proof.push(...res.proof.pi_a.slice(0, 2));
  // proof.push(...res.proof.pi_b[0].reverse());
  // proof.push(...res.proof.pi_b[1].reverse());
  // proof.push(...res.proof.pi_c.slice(0, 2));

  return stringizing({
    proof: res.proof,
    size,
    newDeactivateCommitment: input.newDeactivateCommitment,
    newDeactivateRoot: input.newDeactivateRoot,
  });
};
