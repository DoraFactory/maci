const { babyJub, poseidon } = require("circom");
const { groth16 } = require("snarkjs");
const Tree = require("./tree");
const { stringizing, genRandomKey } = require("./keypair");
const { utils } = require("ethers");

const rerandomize = (pubKey, ciphertext, randomVal = genRandomKey()) => {
  const d1 = babyJub.addPoint(
    babyJub.mulPointEscalar(babyJub.Base8, randomVal),
    ciphertext.c1
  );

  const d2 = babyJub.addPoint(
    babyJub.mulPointEscalar(pubKey, randomVal),
    ciphertext.c2
  );

  return {
    d1,
    d2,
  };
};

const SNARK_FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const addKeyInput = ({
  coordPubKey = [],
  oldKey = null,
  deactivates = [],
  dIdx = 0,
  depth = 4,
}) => {
  const randomVal = genRandomKey();
  const deactivateLeaf = deactivates[dIdx];
  const c1 = [deactivateLeaf[0], deactivateLeaf[1]];
  const c2 = [deactivateLeaf[2], deactivateLeaf[3]];

  const { d1, d2 } = rerandomize(coordPubKey, { c1, c2 }, randomVal);

  const nullifier = poseidon([oldKey.formatedPrivKey, 1444992409218394441042n]);

  const tree = new Tree(5, depth, 0n);
  const leaves = deactivates.map((d) => poseidon(d));
  tree.initLeaves(leaves);

  const deactivateRoot = tree.root;
  const deactivateLeafPathElements = tree.pathElementOf(dIdx);

  const inputHash =
    BigInt(
      utils.soliditySha256(
        new Array(7).fill("uint256"),
        stringizing([
          deactivateRoot,
          poseidon(coordPubKey),
          nullifier,
          d1[0],
          d1[1],
          d2[0],
          d2[1],
        ])
      )
    ) % SNARK_FIELD_SIZE;

  const input = {
    inputHash,
    coordPubKey,
    deactivateRoot,
    deactivateIndex: dIdx,
    deactivateLeaf: poseidon(deactivateLeaf),
    c1,
    c2,
    randomVal,
    d1,
    d2,
    deactivateLeafPathElements,
    nullifier,
    oldPrivateKey: oldKey.formatedPrivKey,
  };

  return { input, d1, d2, nullifier };
};

module.exports.addKeyInput = addKeyInput;

module.exports.proofAddKey = async ({
  coordPubKey = [],
  oldKey = null,
  deactivates = [],
  dIdx = 0,
  depth = 4,
}) => {
  const { input, d1, d2, nullifier } = addKeyInput({
    coordPubKey,
    oldKey,
    deactivates,
    dIdx,
    depth,
  });

  // console.log(JSON.stringify(stringizing(input)))

  const res = await groth16.fullProve(
    input,
    "./build/addKey_js/addKey.wasm",
    "./build/zkey/addKey_0.zkey"
  );

  // const proof = [];
  // proof.push(...res.proof.pi_a.slice(0, 2));
  // proof.push(...res.proof.pi_b[0].reverse());
  // proof.push(...res.proof.pi_b[1].reverse());
  // proof.push(...res.proof.pi_c.slice(0, 2));

  return stringizing({
    proof: { proof: res.proof, d: [...d1, ...d2], nullifier },
    input,
  });
};
