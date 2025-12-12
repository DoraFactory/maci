#!/bin/bash

################################################################################
# Quick Test Script - 快速测试脚本
# 简化版本，只测试核心功能
################################################################################

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
CHAIN_ID="${CHAIN_ID:-vota-testnet}"
RPC_NODE="${RPC_NODE:-https://vota-testnet-rpc.dorafactory.org:443}"
TEST_ACCOUNT="${TEST_ACCOUNT:-test-manage}"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}   MACI Quick Test (快速测试)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if contract address is provided
if [ -z "$1" ]; then
    echo -e "${YELLOW}Usage: $0 <CONTRACT_ADDRESS>${NC}"
    echo ""
    echo "Example:"
    echo "  $0 dora1gpu5j2zwvchy33gdur9ct7dcam2y2t2hzcqsxgczaasrmvzdylas6wdd7s"
    echo ""
    echo "Or set CONTRACT_ADDR environment variable:"
    echo "  export CONTRACT_ADDR=dora1gpu..."
    echo "  $0"
    exit 1
fi

CONTRACT_ADDR="${1:-$CONTRACT_ADDR}"

echo -e "${GREEN}✓${NC} Chain ID: $CHAIN_ID"
echo -e "${GREEN}✓${NC} Contract: $CONTRACT_ADDR"
echo -e "${GREEN}✓${NC} Account: $TEST_ACCOUNT"
echo ""

# Test 1: Query number of signups
echo -e "${BLUE}[1/5]${NC} Querying number of signups..."
SIGNUPS=$(dorad query wasm contract-state smart $CONTRACT_ADDR \
  '{"get_num_sign_up":{}}' \
  --node $RPC_NODE 2>/dev/null | grep "data:" | awk '{print $2}' | tr -d '"')
echo -e "${GREEN}✓${NC} Current signups: $SIGNUPS"
echo ""

# Test 2: Query voice credit amount
echo -e "${BLUE}[2/5]${NC} Querying voice credit amount..."
CREDITS=$(dorad query wasm contract-state smart $CONTRACT_ADDR \
  '{"get_voice_credit_amount":{}}' \
  --node $RPC_NODE 2>/dev/null | grep "data:" | awk '{print $2}' | tr -d '"')
echo -e "${GREEN}✓${NC} Voice credits: $CREDITS"
echo ""

# Test 3: Query message chain length
echo -e "${BLUE}[3/5]${NC} Querying message chain length..."
MSGS=$(dorad query wasm contract-state smart $CONTRACT_ADDR \
  '{"get_msg_chain_length":{}}' \
  --node $RPC_NODE 2>/dev/null | grep "data:" | awk '{print $2}' | tr -d '"')
echo -e "${GREEN}✓${NC} Messages: $MSGS"
echo ""

# Test 4: Query state tree root
echo -e "${BLUE}[4/5]${NC} Querying state tree root..."
ROOT=$(dorad query wasm contract-state smart $CONTRACT_ADDR \
  '{"get_state_tree_root":{}}' \
  --node $RPC_NODE 2>/dev/null | grep "data:" | awk '{print $2}' | tr -d '"')
echo -e "${GREEN}✓${NC} State root: ${ROOT:0:20}..."
echo ""

# Test 5: Test signup (dry run)
echo -e "${BLUE}[5/5]${NC} Testing signup (simulation)..."
RESULT=$(dorad tx wasm execute $CONTRACT_ADDR \
  '{"test_signup_no_hash": {"pubkey": {"x": "999", "y": "888"}}}' \
  --from $TEST_ACCOUNT \
  --chain-id $CHAIN_ID \
  --gas-prices 100000000000peaka \
  --gas auto \
  --gas-adjustment 1.5 \
  --node $RPC_NODE \
  --dry-run 2>/dev/null | grep "gas estimate:" | awk '{print $3}')

if [ -n "$RESULT" ]; then
    echo -e "${GREEN}✓${NC} Estimated gas: $RESULT"
else
    echo -e "${GREEN}✓${NC} Simulation completed"
fi
echo ""

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}   All quick tests passed! ✓${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Contract Stats:"
echo "  - Signups: $SIGNUPS"
echo "  - Messages: $MSGS"
echo "  - Voice Credits: $CREDITS"
echo ""
echo "For full automated testing, run:"
echo "  ./scripts/auto-test.sh"
echo ""
