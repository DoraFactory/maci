#!/bin/sh

# Compile a parameterized aMACI circuit pack into .bin using circom-witnesscalc.
# Flow:
# 1) Use circomkit to compile parameterized circuits (creates R1CS + circom/main/*.circom)
# 2) Use build-circuit to compile those instantiated circuits into .bin

set -e

POWER="${1:-2-1-1-5}"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK_DIR="$ROOT_DIR"
OUTPUT_DIR="$ROOT_DIR/build/amaci_new/$POWER"
NODE_MEMORY_MB=98304

# circom-witnesscalc path
BUILD_CIRCUIT="${BUILD_CIRCUIT:-}"

if [ -z "$BUILD_CIRCUIT" ]; then
  echo "Error: BUILD_CIRCUIT is not set"
  echo "Please pass the circom-witnesscalc build-circuit path, for example:"
  echo "  BUILD_CIRCUIT=/path/to/circom-witnesscalc/target/release/build-circuit ./start_new_circuit.sh $POWER"
  exit 1
fi

if [ ! -f "$BUILD_CIRCUIT" ]; then
  echo "Error: build-circuit not found at $BUILD_CIRCUIT"
  exit 1
fi

if [ ! -f "$WORK_DIR/circomkit.json" ]; then
  echo "Error: circomkit.json not found at $WORK_DIR/circomkit.json"
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Error: pnpm not found in PATH"
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

mkdir -p "$OUTPUT_DIR/bin"

CONFIG_FILE="$WORK_DIR/circomkit.json"
CONFIG_BACKUP="$WORK_DIR/circomkit.json.bak"

restore_config() {
  if [ -f "$CONFIG_BACKUP" ]; then
    mv "$CONFIG_BACKUP" "$CONFIG_FILE"
  fi
}

trap restore_config EXIT

cp "$CONFIG_FILE" "$CONFIG_BACKUP"
node -e "
const fs = require('fs');
const configPath = process.argv[1];
const outDir = process.argv[2];
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
cfg.dirBuild = outDir;
fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
" "$CONFIG_FILE" "$OUTPUT_DIR"

export NODE_OPTIONS="--max-old-space-size=$NODE_MEMORY_MB"

for circuit_id in "$ADDKEY_CIRCUIT" "$DEACTIVATE_CIRCUIT" "$MSG_CIRCUIT" "$TALLY_CIRCUIT"; do
  if ! grep -q "\"$circuit_id\"[[:space:]]*:" "$WORK_DIR/circom/circuits.json"; then
    echo "Error: circuit \"$circuit_id\" is not defined in $WORK_DIR/circom/circuits.json"
    echo "Add this circuit definition first, then re-run ./start_new_circuit.sh $POWER"
    exit 1
  fi
done

# circuit name -> output bin filename
CIRCUIT_MAP="
$ADDKEY_CIRCUIT addKey
$DEACTIVATE_CIRCUIT deactivate
$MSG_CIRCUIT msg
$TALLY_CIRCUIT tally
"

echo "Compiling circuits with circomkit (R1CS generation)..."
echo "$CIRCUIT_MAP" | while read -r circuit_name bin_name; do
  [ -z "$circuit_name" ] && continue
  (cd "$WORK_DIR" && pnpm exec circomkit compile "$circuit_name")
done

echo ""
echo "Building .bin files with circom-witnesscalc..."
echo "$CIRCUIT_MAP" | while read -r circuit_name bin_name; do
  [ -z "$circuit_name" ] && continue
  src_circom="$WORK_DIR/circom/main/${circuit_name}.circom"
  out_bin="$OUTPUT_DIR/bin/${bin_name}.bin"

  if [ ! -f "$src_circom" ]; then
    echo "Error: instantiated circuit not found: $src_circom"
    exit 1
  fi

  echo "  Building ${bin_name}.bin from ${circuit_name}..."
  "$BUILD_CIRCUIT" "$src_circom" "$out_bin"
done

echo ""
echo "Done. Binaries are in: $OUTPUT_DIR/bin"
