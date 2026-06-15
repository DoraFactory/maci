#!/bin/sh

# Step 2 for a parameterized aMACI circuit pack:
# - Generate zkeys and verification keys from R1CS
# - Create helper scripts for witness/proof generation using circom-witnesscalc

set -e

POWER="${1:-2-1-1-5}"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$ROOT_DIR/build/amaci_new/$POWER"
PTAU="${PTAU:-}"
NODE_MEMORY_MB=98304

# circom-witnesscalc / rapidsnark paths
CALC_WITNESS="${CALC_WITNESS:-}"
RAPIDSNARK="${RAPIDSNARK:-}"
SNARKJS_CMD="${SNARKJS_CMD:-pnpm exec snarkjs}"

if [ ! -d "$OUT_DIR" ]; then
  echo "Error: output directory not found: $OUT_DIR"
  echo "Run ./start_new_circuit.sh $POWER first."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Error: pnpm not found in PATH"
  exit 1
fi

if [ -z "$PTAU" ]; then
  echo "Error: PTAU is not set"
  echo "Please pass the ptau file path, for example:"
  echo "  PTAU=/path/to/powersOfTau28_hez_final_22.ptau CALC_WITNESS=/path/to/calc-witness RAPIDSNARK=/path/to/prover ./start_new_circuit_step2.sh $POWER"
  exit 1
fi

if [ -z "$CALC_WITNESS" ]; then
  echo "Error: CALC_WITNESS is not set"
  echo "Please pass the circom-witnesscalc calc-witness path, for example:"
  echo "  PTAU=/path/to/powersOfTau28_hez_final_22.ptau CALC_WITNESS=/path/to/calc-witness RAPIDSNARK=/path/to/prover ./start_new_circuit_step2.sh $POWER"
  exit 1
fi

if [ -z "$RAPIDSNARK" ]; then
  echo "Error: RAPIDSNARK is not set"
  echo "Please pass the rapidsnark prover path, for example:"
  echo "  PTAU=/path/to/powersOfTau28_hez_final_22.ptau CALC_WITNESS=/path/to/calc-witness RAPIDSNARK=/path/to/prover ./start_new_circuit_step2.sh $POWER"
  exit 1
fi

if [ ! -f "$PTAU" ]; then
  echo "Error: PTAU file not found: $PTAU"
  exit 1
fi

if [ ! -f "$CALC_WITNESS" ]; then
  echo "Error: calc-witness not found: $CALC_WITNESS"
  exit 1
fi

if [ ! -f "$RAPIDSNARK" ]; then
  echo "Error: rapidsnark prover not found: $RAPIDSNARK"
  exit 1
fi

is_uint() {
  case "$1" in
    ''|*[!0-9]*)
      return 1
      ;;
    *)
      return 0
      ;;
  esac
}

IFS='-' read -r STATE_TREE_DEPTH INT_STATE_TREE_DEPTH VOTE_OPTION_TREE_DEPTH MESSAGE_BATCH_SIZE <<EOF
$POWER
EOF

if [ -z "$STATE_TREE_DEPTH" ] || [ -z "$INT_STATE_TREE_DEPTH" ] || [ -z "$VOTE_OPTION_TREE_DEPTH" ] || [ -z "$MESSAGE_BATCH_SIZE" ]; then
  echo "Error: invalid POWER format: $POWER"
  echo "Expected format: stateTreeDepth-intStateTreeDepth-voteOptionTreeDepth-messageBatchSize (e.g. 9-4-3-125)"
  exit 1
fi

if ! is_uint "$STATE_TREE_DEPTH" || ! is_uint "$INT_STATE_TREE_DEPTH" || ! is_uint "$VOTE_OPTION_TREE_DEPTH" || ! is_uint "$MESSAGE_BATCH_SIZE"; then
  echo "Error: POWER must contain positive integers only: $POWER"
  exit 1
fi

ADDKEY_CIRCUIT="AddNewKey_amaci_${STATE_TREE_DEPTH}"
DEACTIVATE_CIRCUIT="ProcessDeactivateMessages_amaci_${STATE_TREE_DEPTH}-${MESSAGE_BATCH_SIZE}"
MSG_CIRCUIT="ProcessMessages_amaci_${STATE_TREE_DEPTH}-${VOTE_OPTION_TREE_DEPTH}-${MESSAGE_BATCH_SIZE}"
TALLY_CIRCUIT="TallyVotes_amaci_${STATE_TREE_DEPTH}-${INT_STATE_TREE_DEPTH}-${VOTE_OPTION_TREE_DEPTH}"

MSG_R1CS="$OUT_DIR/$MSG_CIRCUIT/$MSG_CIRCUIT.r1cs"
TALLY_R1CS="$OUT_DIR/$TALLY_CIRCUIT/$TALLY_CIRCUIT.r1cs"
ADDKEY_R1CS="$OUT_DIR/$ADDKEY_CIRCUIT/$ADDKEY_CIRCUIT.r1cs"
DEACTIVATE_R1CS="$OUT_DIR/$DEACTIVATE_CIRCUIT/$DEACTIVATE_CIRCUIT.r1cs"

if [ ! -f "$MSG_R1CS" ] || [ ! -f "$TALLY_R1CS" ] || [ ! -f "$ADDKEY_R1CS" ] || [ ! -f "$DEACTIVATE_R1CS" ]; then
  echo "Error: missing required R1CS files under $OUT_DIR"
  echo "Expected circuit IDs:"
  echo "  $MSG_CIRCUIT"
  echo "  $TALLY_CIRCUIT"
  echo "  $ADDKEY_CIRCUIT"
  echo "  $DEACTIVATE_CIRCUIT"
  echo ""
  echo "Currently available R1CS files:"
  find "$OUT_DIR" -maxdepth 2 -type f -name "*.r1cs" | sort
  echo ""
  echo "Run ./start_new_circuit.sh $POWER first, and ensure all four circuits compile successfully."
  exit 1
fi

mkdir -p "$OUT_DIR/zkey"
mkdir -p "$OUT_DIR/verification_key/msg"
mkdir -p "$OUT_DIR/verification_key/tally"
mkdir -p "$OUT_DIR/verification_key/addKey"
mkdir -p "$OUT_DIR/verification_key/deactivate"
mkdir -p "$OUT_DIR/inputs"

export NODE_OPTIONS="--max-old-space-size=$NODE_MEMORY_MB"
echo "Generating zkeys..."
$SNARKJS_CMD g16s "$MSG_R1CS" "$PTAU" "$OUT_DIR/zkey/msg_0.zkey"
$SNARKJS_CMD g16s "$TALLY_R1CS" "$PTAU" "$OUT_DIR/zkey/tally_0.zkey"
$SNARKJS_CMD g16s "$ADDKEY_R1CS" "$PTAU" "$OUT_DIR/zkey/addKey_0.zkey"
$SNARKJS_CMD g16s "$DEACTIVATE_R1CS" "$PTAU" "$OUT_DIR/zkey/deactivate_0.zkey"

echo "Contributing to ceremony and exporting verification keys..."
echo "entropy_$(date +%s)" | $SNARKJS_CMD zkc "$OUT_DIR/zkey/msg_0.zkey" "$OUT_DIR/zkey/msg.zkey" --name="DoraHacks" -v
$SNARKJS_CMD zkev "$OUT_DIR/zkey/msg.zkey" "$OUT_DIR/verification_key/msg/verification_key.json"

echo "entropy_$(date +%s)" | $SNARKJS_CMD zkc "$OUT_DIR/zkey/tally_0.zkey" "$OUT_DIR/zkey/tally.zkey" --name="DoraHacks" -v
$SNARKJS_CMD zkev "$OUT_DIR/zkey/tally.zkey" "$OUT_DIR/verification_key/tally/verification_key.json"

echo "entropy_$(date +%s)" | $SNARKJS_CMD zkc "$OUT_DIR/zkey/addKey_0.zkey" "$OUT_DIR/zkey/addKey.zkey" --name="DoraHacks" -v
$SNARKJS_CMD zkev "$OUT_DIR/zkey/addKey.zkey" "$OUT_DIR/verification_key/addKey/verification_key.json"

echo "entropy_$(date +%s)" | $SNARKJS_CMD zkc "$OUT_DIR/zkey/deactivate_0.zkey" "$OUT_DIR/zkey/deactivate.zkey" --name="DoraHacks" -v
$SNARKJS_CMD zkev "$OUT_DIR/zkey/deactivate.zkey" "$OUT_DIR/verification_key/deactivate/verification_key.json"

cat > "$OUT_DIR/generate_witness.sh" << WITNESS_EOF
#!/bin/sh
# Automated Witness Generation Script using circom-witnesscalc
# Usage: ./generate_witness.sh <circuit_name> <input_json> [output_wtns]

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <circuit_name> <input_json> [output_wtns]"
  echo "  circuit_name: msg, tally, addKey, or deactivate"
  echo "  input_json: path to input JSON file"
  echo "  output_wtns: (optional) output witness file path"
  exit 1
fi

CIRCUIT_NAME=$1
INPUT_JSON=$2
OUTPUT_WTNS=${3:-witness_${CIRCUIT_NAME}_$(date +%s).wtns}

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
CIRCUIT_BIN="$SCRIPT_DIR/bin/${CIRCUIT_NAME}.bin"
CALC_WITNESS="\${CALC_WITNESS:-}"

if [ -z "$CALC_WITNESS" ]; then
  echo "Error: CALC_WITNESS is not set"
  echo "Please pass it explicitly, for example:"
  echo "  CALC_WITNESS=/path/to/calc-witness ./generate_witness.sh \$CIRCUIT_NAME \$INPUT_JSON"
  exit 1
fi

if [ ! -f "$CIRCUIT_BIN" ]; then
  echo "Error: Circuit binary not found: $CIRCUIT_BIN"
  exit 1
fi

if [ ! -f "$CALC_WITNESS" ]; then
  echo "Error: calc-witness not found: $CALC_WITNESS"
  exit 1
fi

if [ ! -f "$INPUT_JSON" ]; then
  if [ -f "$SCRIPT_DIR/inputs/$INPUT_JSON" ]; then
    INPUT_JSON="$SCRIPT_DIR/inputs/$INPUT_JSON"
  else
    echo "Error: Input file not found: $INPUT_JSON"
    exit 1
  fi
fi

echo "Generating witness for $CIRCUIT_NAME..."
$CALC_WITNESS "$CIRCUIT_BIN" "$INPUT_JSON" "$OUTPUT_WTNS"
echo "Witness generated: $OUTPUT_WTNS"
WITNESS_EOF

chmod +x "$OUT_DIR/generate_witness.sh"

cat > "$OUT_DIR/generate_proof.sh" << PROOF_EOF
#!/bin/sh
# Complete Automated Proof Generation Script using circom-witnesscalc
# Usage: ./generate_proof.sh <circuit_name> <input_json> [output_dir]
#        ./generate_proof.sh all [input_dir] [output_dir]

if [ -z "$1" ]; then
  echo "Usage: $0 <circuit_name> <input_json> [output_dir]"
  echo "       $0 all [input_dir] [output_dir]"
  echo "  circuit_name: msg, tally, addKey, or deactivate"
  echo "  input_json: path to input JSON file"
  echo "  input_dir: directory containing msg.json, tally.json, addKey.json, deactivate.json"
  echo "  output_dir: (optional) output directory for proof files"
  exit 1
fi

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
CALC_WITNESS="\${CALC_WITNESS:-}"
RAPIDSNARK="\${RAPIDSNARK:-}"
SNARKJS_CMD="\${SNARKJS_CMD:-pnpm exec snarkjs}"

if [ -z "$CALC_WITNESS" ]; then
  echo "Error: CALC_WITNESS is not set"
  echo "Please pass it explicitly, for example:"
  echo "  CALC_WITNESS=/path/to/calc-witness RAPIDSNARK=/path/to/prover ./generate_proof.sh <circuit_name> <input_json>"
  exit 1
fi

if [ -z "$RAPIDSNARK" ]; then
  echo "Error: RAPIDSNARK is not set"
  echo "Please pass it explicitly, for example:"
  echo "  CALC_WITNESS=/path/to/calc-witness RAPIDSNARK=/path/to/prover ./generate_proof.sh <circuit_name> <input_json>"
  exit 1
fi

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

now_ms() {
  node -e "process.stdout.write(Date.now().toString())"
}

run_one() {
  CIRCUIT_NAME="$1"
  INPUT_JSON="$2"
  OUTPUT_DIR_PARAM="$3"

  CIRCUIT_BIN="$SCRIPT_DIR/bin/${CIRCUIT_NAME}.bin"
  ZKEY="$SCRIPT_DIR/zkey/${CIRCUIT_NAME}.zkey"
  VKEY="$SCRIPT_DIR/verification_key/${CIRCUIT_NAME}/verification_key.json"

  echo "${BLUE}========================================${NC}"
  echo "${BLUE}Automated Proof Generation${NC}"
  echo "${BLUE}Using circom-witnesscalc (Rust)${NC}"
  echo "${BLUE}========================================${NC}"
  echo "Circuit: ${CIRCUIT_NAME}"
  echo "Input: ${INPUT_JSON}"
  echo ""

  if [ ! -f "$INPUT_JSON" ]; then
    if [ -f "$SCRIPT_DIR/inputs/$INPUT_JSON" ]; then
      INPUT_JSON="$SCRIPT_DIR/inputs/$INPUT_JSON"
    else
      echo "${RED}✗ Error: Input file not found: $INPUT_JSON${NC}"
      exit 1
    fi
  fi

  if [ ! -f "$CIRCUIT_BIN" ]; then
    echo "${RED}✗ Error: Circuit binary not found: $CIRCUIT_BIN${NC}"
    exit 1
  fi

  if [ ! -f "$CALC_WITNESS" ]; then
    echo "${RED}✗ Error: calc-witness not found: $CALC_WITNESS${NC}"
    exit 1
  fi

  if [ ! -f "$ZKEY" ]; then
    echo "${RED}✗ Error: Zkey not found: $ZKEY${NC}"
    exit 1
  fi

  mkdir -p "$OUTPUT_DIR_PARAM"
  TIMESTAMP=$(date +%s)
  WITNESS="$OUTPUT_DIR_PARAM/${CIRCUIT_NAME}_witness_${TIMESTAMP}.wtns"
  PROOF="$OUTPUT_DIR_PARAM/${CIRCUIT_NAME}_proof_${TIMESTAMP}.json"
  PUBLIC="$OUTPUT_DIR_PARAM/${CIRCUIT_NAME}_public_${TIMESTAMP}.json"

  echo "${GREEN}[1/3] Generating witness with circom-witnesscalc...${NC}"
  witness_start=$(now_ms)
  $CALC_WITNESS "$CIRCUIT_BIN" "$INPUT_JSON" "$WITNESS"
  if [ $? -ne 0 ]; then
    echo "${RED}✗ Witness generation failed${NC}"
    exit 1
  fi
  witness_end=$(now_ms)
  witness_time=$((witness_end - witness_start))
  echo "${YELLOW}  ✓ Witness generated in ${witness_time}ms${NC}"

  echo ""
  echo "${GREEN}[2/3] Generating proof...${NC}"
  if [ ! -f "$RAPIDSNARK" ]; then
    echo "${RED}✗ Error: rapidsnark prover not found: $RAPIDSNARK${NC}"
    exit 1
  fi

  proof_start=$(now_ms)
  $RAPIDSNARK "$ZKEY" "$WITNESS" "$PROOF" "$PUBLIC"
  if [ $? -ne 0 ]; then
    echo "${RED}✗ Proof generation failed${NC}"
    exit 1
  fi
  proof_end=$(now_ms)
  proof_time=$((proof_end - proof_start))
  echo "${YELLOW}  ✓ Proof generated in ${proof_time}ms${NC}"

  echo ""
  echo "${GREEN}[3/3] Verifying proof...${NC}"
  if [ ! -f "$VKEY" ]; then
    echo "${YELLOW}  Verification key not found, skipping verification${NC}"
  else
    verify_start=$(now_ms)
    $SNARKJS_CMD groth16 verify "$VKEY" "$PUBLIC" "$PROOF" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
      verify_end=$(now_ms)
      verify_time=$((verify_end - verify_start))
      echo "${GREEN}  ✓ Proof verified successfully in ${verify_time}ms${NC}"
    else
      echo "${RED}  ✗ Proof verification failed!${NC}"
      exit 1
    fi
  fi

  echo ""
  echo "${BLUE}========================================${NC}"
  echo "${GREEN}Proof Generation Complete!${NC}"
  echo "${BLUE}========================================${NC}"
  echo ""
  echo "Output files:"
  echo "  Witness: ${WITNESS}"
  echo "  Proof:   ${PROOF}"
  echo "  Public:  ${PUBLIC}"
  echo ""
}

if [ "$1" = "all" ]; then
  INPUT_DIR="${2:-$SCRIPT_DIR/inputs}"
  OUTPUT_DIR_PARAM=${3:-$SCRIPT_DIR/proofs}

  if [ ! -d "$INPUT_DIR" ]; then
    echo "${RED}✗ Error: Input directory not found: $INPUT_DIR${NC}"
    exit 1
  fi

  for CIRCUIT in msg tally addKey deactivate; do
    run_one "$CIRCUIT" "$INPUT_DIR/${CIRCUIT}.json" "$OUTPUT_DIR_PARAM"
  done
  exit 0
fi

if [ -z "$2" ]; then
  echo "Usage: $0 <circuit_name> <input_json> [output_dir]"
  echo "       $0 all [input_dir] [output_dir]"
  exit 1
fi

run_one "$1" "$2" "${3:-$SCRIPT_DIR/proofs}"
PROOF_EOF

chmod +x "$OUT_DIR/generate_proof.sh"

echo "Done."
echo "Artifacts: $OUT_DIR"
echo "Scripts:"
echo "  $OUT_DIR/generate_witness.sh"
echo "  $OUT_DIR/generate_proof.sh"
