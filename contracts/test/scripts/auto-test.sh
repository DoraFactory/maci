#!/bin/sh

################################################################################
# MACI Test Contract - Automated Testing Script
# 自动化测试脚本 - 执行链上测试并生成报告
################################################################################

set -e  # Exit on error

# Color definitions for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test results storage (using simple variables with prefixes)
TEST_RESULTS=""
GAS_USED=""
TX_HASHES=""
TX_FEES=""

# Timestamp for report
TEST_START_TIME=$(date +%s)
TEST_DATE=$(date '+%Y-%m-%d %H:%M:%S')

################################################################################
# Configuration
################################################################################

# Network configuration
CHAIN_ID="${CHAIN_ID:-vota-testnet}"
RPC_NODE="${RPC_NODE:-https://vota-testnet-rpc.dorafactory.org:443}"
GAS_PRICES="${GAS_PRICES:-100000000000peaka}"
GAS_ADJUSTMENT="${GAS_ADJUSTMENT:-1.5}"
TEST_ACCOUNT="${TEST_ACCOUNT:-test-manage}"

# Debug mode (set DEBUG=1 to enable full output)
DEBUG_MODE="${DEBUG:-0}"

# File paths
WASM_FILE="${WASM_FILE:-../../artifacts/cw_test-aarch64.wasm}"
REPORT_FILE="test-report-$(date +%Y%m%d-%H%M%S).md"
LOG_FILE="test-log-$(date +%Y%m%d-%H%M%S).log"

# Test data from JSON files
USER1_X="8446677751716569713622015905729882243875224951572887602730835165068040887285"
USER1_Y="12484654491029393893324568717198080229359788322121893494118068510674758553628"
USER2_X="4934845797881523927654842245387640257368309434525961062601274110069416343731"
USER2_Y="7218132018004361008636029786293016526331813670637191622129869640055131468762"

# Message test data
MSG_DATA='["12464466727380559741327029120716347565653310312805404943915221364233278355900","21756441382307499802075883466410791472157330940626781651729753858169806666424","16969575794768092744384541035544740469107350730057435369856614212872736197087","21106921111328932602220561288958073500538147520872081228867170491702777820919","14247661340753952303912914431542420007228355835757020038580415480350873616819","1913470981312317779087601088668868709201150623028133851357692554008495433683","5278987120186068145861189009145856833865800618239583715075012754431163754428"]'
ENC_PUB_X="7169482574855732726427143738152492655331222726959638442902625038852449210076"
ENC_PUB_Y="18313605050567479150590532619972444964205796585191616809522388018889233970802"

# Contract variables (can be preset via environment variables)
# Set CODE_ID and/or CONTRACT_ADDR to skip deployment steps
CODE_ID="${CODE_ID:-}"
CONTRACT_ADDR="${CONTRACT_ADDR:-}"

################################################################################
# Utility Functions
################################################################################

log() {
    printf "${CYAN}[$(date '+%H:%M:%S')]${NC} %s\n" "$1" | tee -a "$LOG_FILE"
}

log_success() {
    printf "${GREEN}[✓]${NC} %s\n" "$1" | tee -a "$LOG_FILE"
}

log_error() {
    printf "${RED}[✗]${NC} %s\n" "$1" | tee -a "$LOG_FILE"
}

log_info() {
    printf "${BLUE}[i]${NC} %s\n" "$1" | tee -a "$LOG_FILE"
}

log_warning() {
    printf "${YELLOW}[!]${NC} %s\n" "$1" | tee -a "$LOG_FILE"
}

log_debug() {
    if [ "$DEBUG_MODE" = "1" ]; then
        printf "${CYAN}[DEBUG]${NC} %s\n" "$1" | tee -a "$LOG_FILE"
    fi
}

section_header() {
    echo "" | tee -a "$LOG_FILE"
    printf "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n" | tee -a "$LOG_FILE"
    printf "${PURPLE}  %s${NC}\n" "$1" | tee -a "$LOG_FILE"
    printf "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
}

# Store test result
store_result() {
    local test_name="$1"
    local status="$2"
    TEST_RESULTS="${TEST_RESULTS}${test_name}:${status}|"
}

get_result() {
    local test_name="$1"
    echo "$TEST_RESULTS" | grep -o "${test_name}:[^|]*" | cut -d: -f2
}

# Store gas used
store_gas() {
    local test_name="$1"
    local gas="$2"
    GAS_USED="${GAS_USED}${test_name}:${gas}|"
}

get_gas() {
    local test_name="$1"
    echo "$GAS_USED" | grep -o "${test_name}:[^|]*" | cut -d: -f2 | tr -d '\n\r' | xargs
}

# Store tx hash
store_tx() {
    local test_name="$1"
    local tx="$2"
    TX_HASHES="${TX_HASHES}${test_name}:${tx}|"
}

get_tx() {
    local test_name="$1"
    echo "$TX_HASHES" | grep -o "${test_name}:[^|]*" | cut -d: -f2
}

# Store tx fee
store_fee() {
    local test_name="$1"
    local fee="$2"
    TX_FEES="${TX_FEES}${test_name}:${fee}|"
}

get_fee() {
    local test_name="$1"
    echo "$TX_FEES" | grep -o "${test_name}:[^|]*" | cut -d: -f2 | tr -d '\n\r' | xargs
}

# Extract gas used from transaction
extract_gas() {
    local tx_hash=$1
    local gas_used=$(dorad query tx "$tx_hash" --node "$RPC_NODE" --output json 2>/dev/null | jq -r '.gas_used // empty' | tr -d '\n\r' | xargs)
    echo "$gas_used"
}

# Extract fee from transaction
extract_fee() {
    local tx_hash=$1
    local fee=$(dorad query tx "$tx_hash" --node "$RPC_NODE" --output json 2>/dev/null | jq -r '.tx.auth_info.fee.amount[0].amount // empty' | tr -d '\n\r' | xargs)
    echo "$fee"
}

# Format fee to DORA (safely handles empty values)
format_fee_to_dora() {
    local test_name=$1
    local fee=$(get_fee "$test_name")
    if [ -n "$fee" ] && [ "$fee" != "0" ]; then
        awk -v f="$fee" 'BEGIN {printf "%.6f", f/1000000000000000000}'
    else
        echo "N/A"
    fi
}

# Wait for transaction to be included in a block
wait_for_tx() {
    local tx_hash=$1
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if dorad query tx "$tx_hash" --node "$RPC_NODE" >/dev/null 2>&1; then
            return 0
        fi
        sleep 2
        attempt=$((attempt + 1))
    done
    return 1
}

# Execute transaction and record results
execute_tx() {
    local test_name=$1
    local tx_command=$2
    
    log "Executing: $test_name"
    
    # Execute transaction
    local output
    output=$(eval "$tx_command" 2>&1)
    local exit_code=$?
    
    if [ $exit_code -ne 0 ]; then
        log_error "Transaction failed: $test_name"
        log_error "Error output:"
        echo "$output" | tee -a "$LOG_FILE"
        store_result "$test_name" "FAILED"
        return 1
    fi
    
    # Debug: output full transaction result
    if [ "$DEBUG_MODE" = "1" ]; then
        log_debug "Full transaction output:"
        echo "$output" | tee -a "$LOG_FILE"
    fi
    
    # Extract transaction hash
    local tx_hash=$(echo "$output" | grep -o 'txhash: [A-F0-9]*' | awk '{print $2}')
    
    if [ -z "$tx_hash" ]; then
        log_error "Could not extract transaction hash"
        log_error "Transaction output:"
        echo "$output" | tee -a "$LOG_FILE"
        store_result "$test_name" "FAILED"
        return 1
    fi
    
    log_info "Transaction hash: $tx_hash"
    store_tx "$test_name" "$tx_hash"
    
    # Wait for transaction to be processed
    log "Waiting for transaction to be processed..."
    if ! wait_for_tx "$tx_hash"; then
        log_error "Transaction not found in blockchain"
        store_result "$test_name" "TIMEOUT"
        return 1
    fi
    
    # Query full transaction details in debug mode
    if [ "$DEBUG_MODE" = "1" ]; then
        local tx_details=$(dorad query tx "$tx_hash" --node "$RPC_NODE" --output json 2>/dev/null)
        log_debug "Full transaction details:"
        echo "$tx_details" | jq '.' | tee -a "$LOG_FILE"
    fi
    
    # Extract gas used and fee
    local gas_used=$(extract_gas "$tx_hash")
    if [ -n "$gas_used" ]; then
        store_gas "$test_name" "$gas_used"
        log_info "Gas used: $gas_used"
    fi
    
    local fee=$(extract_fee "$tx_hash")
    if [ -n "$fee" ]; then
        store_fee "$test_name" "$fee"
        # Convert fee to DORA (divide by 10^18)
        local fee_dora=$(awk -v f="$fee" 'BEGIN {printf "%.6f", f/1000000000000000000}')
        log_info "Fee: $fee peaka ($fee_dora DORA)"
    fi
    
    store_result "$test_name" "SUCCESS"
    log_success "Test completed: $test_name"
    return 0
}

# Query contract and log result (no validation for reusable testing)
query_contract() {
    local test_name=$1
    local query_msg=$2
    
    log "Querying: $test_name"
    
    local result
    result=$(dorad query wasm contract-state smart "$CONTRACT_ADDR" "$query_msg" --node "$RPC_NODE" --output json 2>&1)
    local exit_code=$?
    
    if [ $exit_code -ne 0 ]; then
        log_error "Query failed: $test_name"
        log_info "Error: $result"
        store_result "$test_name" "FAILED"
        return 1
    fi
    
    # Debug: output full query result
    if [ "$DEBUG_MODE" = "1" ]; then
        log_debug "Full query result:"
        echo "$result" | jq '.' | tee -a "$LOG_FILE"
    fi
    
    # Extract the data value using jq
    local data_value=$(echo "$result" | jq -r '.data // empty')
    log_info "Result: $data_value"
    
    # Always mark as success if query succeeded (no validation for reusable contracts)
    store_result "$test_name" "SUCCESS"
    log_success "Query completed: $test_name"
}

################################################################################
# Pre-flight Checks
################################################################################

preflight_checks() {
    section_header "Pre-flight Checks"
    
    # Check if dorad is installed
    if ! command -v dorad >/dev/null 2>&1; then
        log_error "dorad not found. Please install dorad first."
        exit 1
    fi
    log_success "dorad found: $(dorad version 2>&1 | head -1)"
    
    # Check if jq is installed
    if ! command -v jq >/dev/null 2>&1; then
        log_error "jq not found. Please install jq first."
        log_info "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
        exit 1
    fi
    log_success "jq found: $(jq --version)"
    
    # Check if WASM file exists
    if [ ! -f "$WASM_FILE" ]; then
        log_error "WASM file not found: $WASM_FILE"
        log_info "Please compile the contract first or specify WASM_FILE environment variable"
        exit 1
    fi
    log_success "WASM file found: $WASM_FILE ($(du -h "$WASM_FILE" | cut -f1))"
    
    # Check account exists
    if ! dorad keys show "$TEST_ACCOUNT" >/dev/null 2>&1; then
        log_error "Account not found: $TEST_ACCOUNT"
        exit 1
    fi
    log_success "Account found: $TEST_ACCOUNT"
    
    # Check RPC connection
    if curl -s "$RPC_NODE/status" >/dev/null 2>&1; then
        log_success "RPC connection successful: $RPC_NODE"
    else
        log_error "Cannot connect to RPC node: $RPC_NODE"
        exit 1
    fi
    
    log_success "All pre-flight checks passed!"
}

################################################################################
# Deployment
################################################################################

deploy_contract() {
    section_header "Contract Deployment"
    
    # Store code (skip if CODE_ID is preset)
    if [ -n "$CODE_ID" ]; then
        log_warning "Using preset Code ID: $CODE_ID"
        log_info "Skipping store code step"
    else
        log "Storing contract code..."
        local store_cmd="dorad tx wasm store '$WASM_FILE' \
            --from '$TEST_ACCOUNT' \
            --chain-id '$CHAIN_ID' \
            --gas-prices '$GAS_PRICES' \
            --gas auto \
            --gas-adjustment '$GAS_ADJUSTMENT' \
            --node '$RPC_NODE' \
            -y"
        
        if execute_tx "store_code" "$store_cmd"; then
            # Extract code ID using jq
            local tx_hash=$(get_tx "store_code")
            sleep 3
            
            # Try to extract code_id from transaction events
            CODE_ID=$(dorad query tx "$tx_hash" --node "$RPC_NODE" --output json 2>/dev/null | jq -r '.logs[0].events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value')
            
            # Fallback: try alternative extraction method
            if [ -z "$CODE_ID" ]; then
                CODE_ID=$(dorad query tx "$tx_hash" --node "$RPC_NODE" --output json 2>/dev/null | jq -r '.logs[0].events[-1].attributes[0].value')
            fi
            
            if [ -z "$CODE_ID" ] || [ "$CODE_ID" = "null" ]; then
                log_error "Could not extract Code ID from transaction"
                log_info "Transaction hash: $tx_hash"
                log_info "Please check the transaction manually"
                exit 1
            fi
            
            log_success "Code ID: $CODE_ID"
        else
            log_error "Failed to store contract code"
            exit 1
        fi
    fi
    
    # Instantiate contract (skip if CONTRACT_ADDR is preset)
    if [ -n "$CONTRACT_ADDR" ]; then
        log_warning "Using preset Contract Address: $CONTRACT_ADDR"
        log_info "Skipping instantiate step"
    else
        log "Instantiating contract..."
        local instantiate_msg='{"parameters": {"state_tree_depth": "2", "int_state_tree_depth": "1", "message_batch_size": "5", "vote_option_tree_depth": "2"}}'
        local instantiate_cmd="dorad tx wasm instantiate '$CODE_ID' \
            '$instantiate_msg' \
            --from '$TEST_ACCOUNT' \
            --label 'MACI Test Contract Auto' \
            --admin '$TEST_ACCOUNT' \
            --chain-id '$CHAIN_ID' \
            --gas-prices '$GAS_PRICES' \
            --gas auto \
            --gas-adjustment '$GAS_ADJUSTMENT' \
            --node '$RPC_NODE' \
            -y"
        
        if execute_tx "instantiate" "$instantiate_cmd"; then
            # Extract contract address using jq
            sleep 3
            CONTRACT_ADDR=$(dorad query wasm list-contract-by-code "$CODE_ID" --node "$RPC_NODE" --output json 2>/dev/null | jq -r '.contracts[0] // empty')
            
            if [ -z "$CONTRACT_ADDR" ] || [ "$CONTRACT_ADDR" = "null" ]; then
                log_error "Could not extract Contract Address"
                log_info "Code ID: $CODE_ID"
                log_info "Trying to query contracts..."
                # Try alternative method
                CONTRACT_ADDR=$(dorad query wasm list-contract-by-code "$CODE_ID" --node "$RPC_NODE" --output json 2>/dev/null | jq -r '.contracts[-1] // empty')
            fi
            
            if [ -z "$CONTRACT_ADDR" ] || [ "$CONTRACT_ADDR" = "null" ]; then
                log_error "Still could not extract Contract Address"
                exit 1
            fi
            
            log_success "Contract Address: $CONTRACT_ADDR"
        else
            log_error "Failed to instantiate contract"
            exit 1
        fi
    fi
    
    # Verify that we have both CODE_ID and CONTRACT_ADDR
    if [ -z "$CODE_ID" ] || [ "$CODE_ID" = "null" ]; then
        log_error "CODE_ID is not set. Please provide CODE_ID or run without preset values."
        exit 1
    fi
    
    if [ -z "$CONTRACT_ADDR" ] || [ "$CONTRACT_ADDR" = "null" ]; then
        log_error "CONTRACT_ADDR is not set. Please provide CONTRACT_ADDR or run without preset values."
        exit 1
    fi
    
    log_success "Ready to test - Code ID: $CODE_ID, Contract: $CONTRACT_ADDR"
}

################################################################################
# Basic Functionality Tests
################################################################################

test_basic_functionality() {
    section_header "Basic Functionality Tests"
    
    # Disable exit on error for this function to allow tests to continue
    set +e
    
    # Test SignUp - User 1
    log "Testing SignUp for User 1..."
    local signup1_msg="{\"sign_up\": {\"pubkey\": {\"x\": \"$USER1_X\", \"y\": \"$USER1_Y\"}}}"
    local signup1_cmd="dorad tx wasm execute '$CONTRACT_ADDR' \
        '$signup1_msg' \
        --from '$TEST_ACCOUNT' \
        --chain-id '$CHAIN_ID' \
        --gas-prices '$GAS_PRICES' \
        --gas auto \
        --gas-adjustment '$GAS_ADJUSTMENT' \
        --node '$RPC_NODE' \
        -y"
    
    execute_tx "signup_user1" "$signup1_cmd" || log_warning "Signup user1 failed, continuing..."
    sleep 2
    
    # Query number of signups
    query_contract "query_num_signups_1" '{"get_num_sign_up":{}}' || log_warning "Query num signups 1 failed, continuing..."
    
    # Test SignUp - User 2
    log "Testing SignUp for User 2..."
    local signup2_msg="{\"sign_up\": {\"pubkey\": {\"x\": \"$USER2_X\", \"y\": \"$USER2_Y\"}}}"
    local signup2_cmd="dorad tx wasm execute '$CONTRACT_ADDR' \
        '$signup2_msg' \
        --from '$TEST_ACCOUNT' \
        --chain-id '$CHAIN_ID' \
        --gas-prices '$GAS_PRICES' \
        --gas auto \
        --gas-adjustment '$GAS_ADJUSTMENT' \
        --node '$RPC_NODE' \
        -y"
    
    execute_tx "signup_user2" "$signup2_cmd" || log_warning "Signup user2 failed, continuing..."
    sleep 2
    
    query_contract "query_num_signups_2" '{"get_num_sign_up":{}}' || log_warning "Query num signups 2 failed, continuing..."
    
    # Test PublishMessage
    log "Testing PublishMessage..."
    local publish_msg="{\"publish_message\": {\"message\": {\"data\": $MSG_DATA}, \"enc_pub_key\": {\"x\": \"$ENC_PUB_X\", \"y\": \"$ENC_PUB_Y\"}}}"
    local publish_cmd="dorad tx wasm execute '$CONTRACT_ADDR' \
        '$publish_msg' \
        --from '$TEST_ACCOUNT' \
        --chain-id '$CHAIN_ID' \
        --gas-prices '$GAS_PRICES' \
        --gas auto \
        --gas-adjustment '$GAS_ADJUSTMENT' \
        --node '$RPC_NODE' \
        -y"
    
    execute_tx "publish_message" "$publish_cmd" || log_warning "Publish message test failed, continuing..."
    sleep 2
    
    query_contract "query_msg_chain_length" '{"get_msg_chain_length":{}}' || log_warning "Query msg chain length failed, continuing..."
    
    # Re-enable exit on error
    set -e
}

################################################################################
# Gas Performance Tests
################################################################################

test_gas_performance() {
    section_header "Gas Performance Tests"
    
    # Disable exit on error for this function to allow tests to continue
    set +e
    
    # Test SignupNoHash
    log "Testing SignupNoHash (baseline)..."
    local signup_nohash_msg='{"test_signup_no_hash": {"pubkey": {"x": "1234567890", "y": "9876543210"}}}'
    local signup_nohash_cmd="dorad tx wasm execute '$CONTRACT_ADDR' \
        '$signup_nohash_msg' \
        --from '$TEST_ACCOUNT' \
        --chain-id '$CHAIN_ID' \
        --gas-prices '$GAS_PRICES' \
        --gas auto \
        --gas-adjustment '$GAS_ADJUSTMENT' \
        --node '$RPC_NODE' \
        -y"
    
    execute_tx "test_signup_no_hash" "$signup_nohash_cmd"
    sleep 2
    
    # Test SignupWithHash
    log "Testing SignupWithHash (full hash)..."
    local signup_hash_msg='{"test_signup_with_hash": {"pubkey": {"x": "1111111111", "y": "2222222222"}}}'
    local signup_hash_cmd="dorad tx wasm execute '$CONTRACT_ADDR' \
        '$signup_hash_msg' \
        --from '$TEST_ACCOUNT' \
        --chain-id '$CHAIN_ID' \
        --gas-prices '$GAS_PRICES' \
        --gas auto \
        --gas-adjustment '$GAS_ADJUSTMENT' \
        --node '$RPC_NODE' \
        -y"
    
    execute_tx "test_signup_with_hash" "$signup_hash_cmd"
    sleep 2
    
    # Test PoseidonHashOnce
    log "Testing PoseidonHashOnce..."
    local hash_once_msg='{"test_poseidon_hash_once": {"data": ["1", "2", "3", "4", "5"]}}'
    local hash_once_cmd="dorad tx wasm execute '$CONTRACT_ADDR' \
        '$hash_once_msg' \
        --from '$TEST_ACCOUNT' \
        --chain-id '$CHAIN_ID' \
        --gas-prices '$GAS_PRICES' \
        --gas auto \
        --gas-adjustment '$GAS_ADJUSTMENT' \
        --node '$RPC_NODE' \
        -y"
    
    execute_tx "test_hash_once" "$hash_once_cmd"
    sleep 2
    
    # Test PublishMessage (5.3)
    log "Testing PublishMessage..."
    local test_publish_msg='{"test_publish_message": {"message": {"data": ["1", "2", "3", "4", "5", "6", "7"]}, "enc_pub_key": {"x": "111", "y": "222"}}}'
    local test_publish_cmd="dorad tx wasm execute '$CONTRACT_ADDR' \
        '$test_publish_msg' \
        --from '$TEST_ACCOUNT' \
        --chain-id '$CHAIN_ID' \
        --gas-prices '$GAS_PRICES' \
        --gas auto \
        --gas-adjustment '$GAS_ADJUSTMENT' \
        --node '$RPC_NODE' \
        -y"
    
    execute_tx "test_publish_message" "$test_publish_cmd"
    sleep 2
    
    # Test PoseidonHashMultiple (5.5) - test different instance counts
    for count in 1 5 10 20; do
        log "Testing PoseidonHashMultiple with $count instances..."
        local hash_multiple_msg="{\"test_poseidon_hash_multiple\": {\"data\": [\"1\", \"2\", \"3\", \"4\", \"5\"], \"instance_count\": $count}}"
        local hash_multiple_cmd="dorad tx wasm execute '$CONTRACT_ADDR' \
            '$hash_multiple_msg' \
            --from '$TEST_ACCOUNT' \
            --chain-id '$CHAIN_ID' \
            --gas-prices '$GAS_PRICES' \
            --gas auto \
            --gas-adjustment '$GAS_ADJUSTMENT' \
            --node '$RPC_NODE' \
            -y"
        
        execute_tx "test_hash_multiple_${count}" "$hash_multiple_cmd"
        sleep 2
    done
    
    # Test PoseidonHashBatch (5.6) - test batch size of 3
    log "Testing PoseidonHashBatch (batch of 3)..."
    local hash_batch_msg='{"test_poseidon_hash_batch": {"data": [["1","2","3","4","5"], ["6","7","8","9","10"], ["11","12","13","14","15"]]}}'
    local hash_batch_cmd="dorad tx wasm execute '$CONTRACT_ADDR' \
        '$hash_batch_msg' \
        --from '$TEST_ACCOUNT' \
        --chain-id '$CHAIN_ID' \
        --gas-prices '$GAS_PRICES' \
        --gas auto \
        --gas-adjustment '$GAS_ADJUSTMENT' \
        --node '$RPC_NODE' \
        -y"
    
    execute_tx "test_hash_batch_3" "$hash_batch_cmd"
    sleep 2
    
    # Test PoseidonHashMode (5.7) - test all mode combinations
    for impl in "local_utils" "maci_utils"; do
        for mode in "hash2" "hash5"; do
            log "Testing PoseidonHashMode: $impl - $mode..."
            local hash_mode_msg="{\"test_poseidon_hash_mode\": {\"implementation\": \"$impl\", \"mode\": \"$mode\", \"data\": [\"1\",\"2\",\"3\",\"4\",\"5\"], \"repeat_count\": 1}}"
            local hash_mode_cmd="dorad tx wasm execute '$CONTRACT_ADDR' \
                '$hash_mode_msg' \
                --from '$TEST_ACCOUNT' \
                --chain-id '$CHAIN_ID' \
                --gas-prices '$GAS_PRICES' \
                --gas auto \
                --gas-adjustment '$GAS_ADJUSTMENT' \
                --node '$RPC_NODE' \
                -y"
            
            execute_tx "test_hash_mode_${impl}_${mode}" "$hash_mode_cmd"
            sleep 2
        done
    done
    
    # MaciUtils special modes
    for mode in "hash2_hash5_hash5" "hash5_hash2"; do
        log "Testing PoseidonHashMode: maci_utils - $mode..."
        local hash_mode_msg="{\"test_poseidon_hash_mode\": {\"implementation\": \"maci_utils\", \"mode\": \"$mode\", \"data\": [\"1\",\"2\",\"3\",\"4\",\"5\"], \"repeat_count\": 1}}"
        local hash_mode_cmd="dorad tx wasm execute '$CONTRACT_ADDR' \
            '$hash_mode_msg' \
            --from '$TEST_ACCOUNT' \
            --chain-id '$CHAIN_ID' \
            --gas-prices '$GAS_PRICES' \
            --gas auto \
            --gas-adjustment '$GAS_ADJUSTMENT' \
            --node '$RPC_NODE' \
            -y"
        
        execute_tx "test_hash_mode_maci_utils_${mode}" "$hash_mode_cmd"
        sleep 2
    done
    
    # Re-enable exit on error
    set -e
}

################################################################################
# Query Tests
################################################################################

test_queries() {
    section_header "Query Function Tests"
    
    # Disable exit on error for this function to allow tests to continue
    set +e
    
    query_contract "query_state_tree_root" '{"get_state_tree_root":{}}'
    query_contract "query_voice_credit_amount" '{"get_voice_credit_amount":{}}'
    
    local signuped_query="{\"signuped\": {\"pubkey\": {\"x\": \"$USER1_X\", \"y\": \"$USER1_Y\"}}}"
    query_contract "query_user1_signuped" "$signuped_query"
    
    # Query GetNode (6.3.1) - Query tree nodes
    log "Querying tree nodes..."
    query_contract "query_node_root" '{"get_node": {"index": "0"}}'
    query_contract "query_node_leaf_31" '{"get_node": {"index": "31"}}'
    query_contract "query_node_leaf_32" '{"get_node": {"index": "32"}}'
    
    # Query NoHash tests (6.4) - Query no-hash test data
    log "Querying no-hash test data..."
    query_contract "query_num_signup_no_hash" '{"get_num_sign_up_no_hash":{}}'
    query_contract "query_state_tree_root_no_hash" '{"get_state_tree_root_no_hash":{}}'
    
    local signuped_nohash_query='{"signuped_no_hash": {"pubkey": {"x": "1234567890", "y": "9876543210"}}}'
    query_contract "query_signuped_no_hash" "$signuped_nohash_query"
    
    # Re-enable exit on error
    set -e
}

################################################################################
# Generate Report
################################################################################

generate_report() {
    section_header "Generating Test Report"
    
    local test_end_time=$(date +%s)
    local test_duration=$((test_end_time - TEST_START_TIME))
    
    # Count test results
    local total_tests=0
    local passed_tests=0
    
    # Count from stored results
    local IFS='|'
    for entry in $TEST_RESULTS; do
        if [ -n "$entry" ]; then
            total_tests=$((total_tests + 1))
            if echo "$entry" | grep -q ":SUCCESS"; then
                passed_tests=$((passed_tests + 1))
            fi
        fi
    done
    
    local failed_tests=$((total_tests - passed_tests))
    
    # Generate report
    cat > "$REPORT_FILE" << EOF
# MACI Test Contract - Automated Test Report

**Generated**: $TEST_DATE  
**Duration**: ${test_duration}s  
**Chain**: $CHAIN_ID  
**RPC Node**: $RPC_NODE

---

## 📊 Test Summary

| Metric | Value |
|--------|-------|
| Total Tests | $total_tests |
| ✅ Passed | $passed_tests |
| ❌ Failed | $failed_tests |
| Success Rate | $(awk -v t="$total_tests" -v p="$passed_tests" 'BEGIN {if (t > 0) printf "%.1f", (p/t)*100; else print "0"}')% |

---

## 🚀 Deployment Information

| Item | Value |
|------|-------|
| Code ID | $CODE_ID |
| Contract Address | $CONTRACT_ADDR |
| Store Code Gas | $(get_gas "store_code" || echo "N/A (preset)") |
| Store Code Fee | $(if [ -n "$(get_fee "store_code")" ]; then echo "$(get_fee "store_code") peaka ($(format_fee_to_dora "store_code") DORA)"; else echo "N/A (preset)"; fi) |
| Instantiate Gas | $(get_gas "instantiate" || echo "N/A (preset)") |
| Instantiate Fee | $(if [ -n "$(get_fee "instantiate")" ]; then echo "$(get_fee "instantiate") peaka ($(format_fee_to_dora "instantiate") DORA)"; else echo "N/A (preset)"; fi) |
| Store Code TX | $(get_tx "store_code" || echo "N/A (preset)") |
| Instantiate TX | $(get_tx "instantiate" || echo "N/A (preset)") |

---

## ✅ Basic Functionality Tests

| Test | Status | Gas Used | Fee (peaka) | Fee (DORA) | TX Hash |
|------|--------|----------|-------------|------------|---------|
| SignUp User 1 | $(get_result "signup_user1") | $(get_gas "signup_user1") | $(get_fee "signup_user1") | $(format_fee_to_dora "signup_user1") | $(get_tx "signup_user1") |
| SignUp User 2 | $(get_result "signup_user2") | $(get_gas "signup_user2") | $(get_fee "signup_user2") | $(format_fee_to_dora "signup_user2") | $(get_tx "signup_user2") |
| Publish Message | $(get_result "publish_message") | $(get_gas "publish_message") | $(get_fee "publish_message") | $(format_fee_to_dora "publish_message") | $(get_tx "publish_message") |
| Query Num Signups | $(get_result "query_num_signups_2") | - | - | - | - |
| Query Msg Chain Length | $(get_result "query_msg_chain_length") | - | - | - | - |

---

## ⚡ Gas Performance Tests

| Test | Status | Gas Used | Fee (peaka) | Fee (DORA) | TX Hash |
|------|--------|----------|-------------|------------|---------|
| SignupNoHash (baseline) | $(get_result "test_signup_no_hash") | $(get_gas "test_signup_no_hash") | $(get_fee "test_signup_no_hash") | $(format_fee_to_dora "test_signup_no_hash") | $(get_tx "test_signup_no_hash") |
| SignupWithHash (full) | $(get_result "test_signup_with_hash") | $(get_gas "test_signup_with_hash") | $(get_fee "test_signup_with_hash") | $(format_fee_to_dora "test_signup_with_hash") | $(get_tx "test_signup_with_hash") |
| PoseidonHashOnce | $(get_result "test_hash_once") | $(get_gas "test_hash_once") | $(get_fee "test_hash_once") | $(format_fee_to_dora "test_hash_once") | $(get_tx "test_hash_once") |
| TestPublishMessage | $(get_result "test_publish_message") | $(get_gas "test_publish_message") | $(get_fee "test_publish_message") | $(format_fee_to_dora "test_publish_message") | $(get_tx "test_publish_message") |
| HashMultiple (1x) | $(get_result "test_hash_multiple_1") | $(get_gas "test_hash_multiple_1") | $(get_fee "test_hash_multiple_1") | $(format_fee_to_dora "test_hash_multiple_1") | $(get_tx "test_hash_multiple_1") |
| HashMultiple (5x) | $(get_result "test_hash_multiple_5") | $(get_gas "test_hash_multiple_5") | $(get_fee "test_hash_multiple_5") | $(format_fee_to_dora "test_hash_multiple_5") | $(get_tx "test_hash_multiple_5") |
| HashMultiple (10x) | $(get_result "test_hash_multiple_10") | $(get_gas "test_hash_multiple_10") | $(get_fee "test_hash_multiple_10") | $(format_fee_to_dora "test_hash_multiple_10") | $(get_tx "test_hash_multiple_10") |
| HashMultiple (20x) | $(get_result "test_hash_multiple_20") | $(get_gas "test_hash_multiple_20") | $(get_fee "test_hash_multiple_20") | $(format_fee_to_dora "test_hash_multiple_20") | $(get_tx "test_hash_multiple_20") |
| HashBatch (3 batches) | $(get_result "test_hash_batch_3") | $(get_gas "test_hash_batch_3") | $(get_fee "test_hash_batch_3") | $(format_fee_to_dora "test_hash_batch_3") | $(get_tx "test_hash_batch_3") |
| HashMode LocalUtils-Hash2 | $(get_result "test_hash_mode_local_utils_hash2") | $(get_gas "test_hash_mode_local_utils_hash2") | $(get_fee "test_hash_mode_local_utils_hash2") | $(format_fee_to_dora "test_hash_mode_local_utils_hash2") | $(get_tx "test_hash_mode_local_utils_hash2") |
| HashMode LocalUtils-Hash5 | $(get_result "test_hash_mode_local_utils_hash5") | $(get_gas "test_hash_mode_local_utils_hash5") | $(get_fee "test_hash_mode_local_utils_hash5") | $(format_fee_to_dora "test_hash_mode_local_utils_hash5") | $(get_tx "test_hash_mode_local_utils_hash5") |
| HashMode MaciUtils-Hash2 | $(get_result "test_hash_mode_maci_utils_hash2") | $(get_gas "test_hash_mode_maci_utils_hash2") | $(get_fee "test_hash_mode_maci_utils_hash2") | $(format_fee_to_dora "test_hash_mode_maci_utils_hash2") | $(get_tx "test_hash_mode_maci_utils_hash2") |
| HashMode MaciUtils-Hash5 | $(get_result "test_hash_mode_maci_utils_hash5") | $(get_gas "test_hash_mode_maci_utils_hash5") | $(get_fee "test_hash_mode_maci_utils_hash5") | $(format_fee_to_dora "test_hash_mode_maci_utils_hash5") | $(get_tx "test_hash_mode_maci_utils_hash5") |
| HashMode MaciUtils-Hash2Hash5Hash5 | $(get_result "test_hash_mode_maci_utils_hash2_hash5_hash5") | $(get_gas "test_hash_mode_maci_utils_hash2_hash5_hash5") | $(get_fee "test_hash_mode_maci_utils_hash2_hash5_hash5") | $(format_fee_to_dora "test_hash_mode_maci_utils_hash2_hash5_hash5") | $(get_tx "test_hash_mode_maci_utils_hash2_hash5_hash5") |
| HashMode MaciUtils-Hash5Hash2 | $(get_result "test_hash_mode_maci_utils_hash5_hash2") | $(get_gas "test_hash_mode_maci_utils_hash5_hash2") | $(get_fee "test_hash_mode_maci_utils_hash5_hash2") | $(format_fee_to_dora "test_hash_mode_maci_utils_hash5_hash2") | $(get_tx "test_hash_mode_maci_utils_hash5_hash2") |

### Gas Performance Analysis

EOF

    # Calculate hash overhead if both tests passed
    local gas_no_hash=$(get_gas "test_signup_no_hash")
    local gas_with_hash=$(get_gas "test_signup_with_hash")
    if [ -n "$gas_no_hash" ] && [ -n "$gas_with_hash" ] && [ "$gas_no_hash" != "0" ] && [ "$gas_with_hash" != "0" ]; then
        local hash_overhead=$((gas_with_hash - gas_no_hash))
        local overhead_percent=$(awk -v g="$gas_with_hash" -v h="$hash_overhead" 'BEGIN {if (g > 0) printf "%.1f", (h/g)*100; else print "0"}')
        
        cat >> "$REPORT_FILE" << EOF
| Metric | Value |
|--------|-------|
| Baseline (NoHash) | $gas_no_hash gas |
| Full Hash | $gas_with_hash gas |
| Hash Overhead | $hash_overhead gas |
| Overhead Percentage | ${overhead_percent}% |

EOF
    fi
    
    # Add HashMultiple performance comparison table
    local gas_hash_1=$(get_gas "test_hash_multiple_1")
    local gas_hash5=$(get_gas "test_hash_multiple_5")
    local gas_hash_10=$(get_gas "test_hash_multiple_10")
    local gas_hash20=$(get_gas "test_hash_multiple_20")
    
    if [ -n "$gas_hash_1" ] && [ "$gas_hash_1" != "0" ]; then
        cat >> "$REPORT_FILE" << EOF

### PoseidonHashMultiple Performance Comparison

| Instance Count | Gas Used | Avg Gas/Instance |
|---------------|----------|------------------|
| 1x | $gas_hash_1 | $gas_hash_1 |
| 5x | $gas_hash5 | $(if [ -n "$gas_hash5" ] && [ "$gas_hash5" != "0" ]; then awk -v g="$gas_hash5" 'BEGIN {printf "%d", g/5}'; else echo "N/A"; fi) |
| 10x | $gas_hash_10 | $(if [ -n "$gas_hash_10" ] && [ "$gas_hash_10" != "0" ]; then awk -v g="$gas_hash_10" 'BEGIN {printf "%d", g/10}'; else echo "N/A"; fi) |
| 20x | $gas_hash20 | $(if [ -n "$gas_hash20" ] && [ "$gas_hash20" != "0" ]; then awk -v g="$gas_hash20" 'BEGIN {printf "%d", g/20}'; else echo "N/A"; fi) |

EOF
    fi
    
    # Add HashMode performance comparison table
    local gas_local_hash2=$(get_gas "test_hash_mode_local_utils_hash2")
    local gas_local_hash5=$(get_gas "test_hash_mode_local_utils_hash5")
    local gas_maci_hash2=$(get_gas "test_hash_mode_maci_utils_hash2")
    local gas_maci_hash5=$(get_gas "test_hash_mode_maci_utils_hash5")
    local gas_maci_h2h5h5=$(get_gas "test_hash_mode_maci_utils_hash2_hash5_hash5")
    local gas_maci_h5h2=$(get_gas "test_hash_mode_maci_utils_hash5_hash2")
    
    if [ -n "$gas_local_hash2" ] && [ "$gas_local_hash2" != "0" ]; then
        cat >> "$REPORT_FILE" << EOF

### PoseidonHashMode Performance Comparison

| Implementation | Mode | Gas Used | Relative Performance |
|---------------|------|----------|---------------------|
| LocalUtils | Hash2 | $gas_local_hash2 | Baseline |
| LocalUtils | Hash5 | $gas_local_hash5 | $(if [ -n "$gas_local_hash2" ] && [ -n "$gas_local_hash5" ] && [ "$gas_local_hash2" != "0" ] && [ "$gas_local_hash5" != "0" ]; then awk -v h5="$gas_local_hash5" -v h2="$gas_local_hash2" 'BEGIN {printf "%.2fx", h5/h2}'; else echo "N/A"; fi) |
| MaciUtils | Hash2 | $gas_maci_hash2 | $(if [ -n "$gas_local_hash2" ] && [ -n "$gas_maci_hash2" ] && [ "$gas_local_hash2" != "0" ] && [ "$gas_maci_hash2" != "0" ]; then awk -v m="$gas_maci_hash2" -v l="$gas_local_hash2" 'BEGIN {printf "%.2fx", m/l}'; else echo "N/A"; fi) |
| MaciUtils | Hash5 | $gas_maci_hash5 | $(if [ -n "$gas_local_hash2" ] && [ -n "$gas_maci_hash5" ] && [ "$gas_local_hash2" != "0" ] && [ "$gas_maci_hash5" != "0" ]; then awk -v m="$gas_maci_hash5" -v l="$gas_local_hash2" 'BEGIN {printf "%.2fx", m/l}'; else echo "N/A"; fi) |
| MaciUtils | Hash2Hash5Hash5 | $gas_maci_h2h5h5 | $(if [ -n "$gas_local_hash2" ] && [ -n "$gas_maci_h2h5h5" ] && [ "$gas_local_hash2" != "0" ] && [ "$gas_maci_h2h5h5" != "0" ]; then awk -v m="$gas_maci_h2h5h5" -v l="$gas_local_hash2" 'BEGIN {printf "%.2fx", m/l}'; else echo "N/A"; fi) |
| MaciUtils | Hash5Hash2 | $gas_maci_h5h2 | $(if [ -n "$gas_local_hash2" ] && [ -n "$gas_maci_h5h2" ] && [ "$gas_local_hash2" != "0" ] && [ "$gas_maci_h5h2" != "0" ]; then awk -v m="$gas_maci_h5h2" -v l="$gas_local_hash2" 'BEGIN {printf "%.2fx", m/l}'; else echo "N/A"; fi) |

EOF
    fi

    # Calculate total fees
    local total_fee=0
    local store_fee=$(get_fee "store_code")
    local inst_fee=$(get_fee "instantiate")
    local signup1_fee=$(get_fee "signup_user1")
    local signup2_fee=$(get_fee "signup_user2")
    local publish_fee=$(get_fee "publish_message")
    local nohash_fee=$(get_fee "test_signup_no_hash")
    local withhash_fee=$(get_fee "test_signup_with_hash")
    local hash_fee=$(get_fee "test_hash_once")
    local test_publish_fee=$(get_fee "test_publish_message")
    local hash_mult_1_fee=$(get_fee "test_hash_multiple_1")
    local hash_mult_5_fee=$(get_fee "test_hash_multiple_5")
    local hash_mult_10_fee=$(get_fee "test_hash_multiple_10")
    local hash_mult_20_fee=$(get_fee "test_hash_multiple_20")
    local hash_batch_fee=$(get_fee "test_hash_batch_3")
    local hash_mode_lu_h2_fee=$(get_fee "test_hash_mode_local_utils_hash2")
    local hash_mode_lu_h5_fee=$(get_fee "test_hash_mode_local_utils_hash5")
    local hash_mode_mu_h2_fee=$(get_fee "test_hash_mode_maci_utils_hash2")
    local hash_mode_mu_h5_fee=$(get_fee "test_hash_mode_maci_utils_hash5")
    local hash_mode_mu_h2h5h5_fee=$(get_fee "test_hash_mode_maci_utils_hash2_hash5_hash5")
    local hash_mode_mu_h5h2_fee=$(get_fee "test_hash_mode_maci_utils_hash5_hash2")
    
    # Sum up all fees (if they exist and are not empty)
    # Use awk for large number arithmetic (fees are too large for bash arithmetic)
    for fee in "$store_fee" "$inst_fee" "$signup1_fee" "$signup2_fee" "$publish_fee" "$nohash_fee" "$withhash_fee" "$hash_fee" "$test_publish_fee" "$hash_mult_1_fee" "$hash_mult_5_fee" "$hash_mult_10_fee" "$hash_mult_20_fee" "$hash_batch_fee" "$hash_mode_lu_h2_fee" "$hash_mode_lu_h5_fee" "$hash_mode_mu_h2_fee" "$hash_mode_mu_h5_fee" "$hash_mode_mu_h2h5h5_fee" "$hash_mode_mu_h5h2_fee"; do
        if [ -n "$fee" ] && [ "$fee" != "0" ]; then
            total_fee=$(awk -v t="$total_fee" -v f="$fee" 'BEGIN {printf "%.0f", t + f}')
        fi
    done
    
    cat >> "$REPORT_FILE" << EOF

### Total Cost Summary

| Item | Amount |
|------|--------|
| Total Gas Used | N/A |
| Total Fees Paid (peaka) | $total_fee |
| Total Fees Paid (DORA) | $(if [ -n "$total_fee" ] && [ "$total_fee" != "0" ]; then awk -v t="$total_fee" 'BEGIN {printf "%.6f", t/1000000000000000000}'; else echo "N/A"; fi) |

---

## 🔍 Query Function Tests

| Query | Status |
|-------|--------|
| GetStateTreeRoot | $(get_result "query_state_tree_root") |
| GetVoiceCreditAmount | $(get_result "query_voice_credit_amount") |
| Signuped (User 1) | $(get_result "query_user1_signuped") |
| GetNode (root) | $(get_result "query_node_root") |
| GetNode (leaf 31) | $(get_result "query_node_leaf_31") |
| GetNode (leaf 32) | $(get_result "query_node_leaf_32") |
| GetNumSignUpNoHash | $(get_result "query_num_signup_no_hash") |
| GetStateTreeRootNoHash | $(get_result "query_state_tree_root_no_hash") |
| SignupedNoHash | $(get_result "query_signuped_no_hash") |

---

## 📝 Notes

- All tests were executed automatically using the auto-test.sh script
- Gas prices: $GAS_PRICES
- Gas adjustment: $GAS_ADJUSTMENT
- Test account: $TEST_ACCOUNT

---

## 🔗 Links

- Contract Address: \`$CONTRACT_ADDR\`
- Code ID: \`$CODE_ID\`
- Chain ID: \`$CHAIN_ID\`
- RPC Node: $RPC_NODE

---

**Report generated automatically by MACI Test Contract Auto-Test Script**  
**Timestamp**: $(date)
EOF

    log_success "Report generated: $REPORT_FILE"
    log_success "Log file: $LOG_FILE"
}

################################################################################
# Main Execution
################################################################################

main() {
    printf "${PURPLE}"
    cat << "EOF"
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   MACI Test Contract - Automated Testing Script              ║
║   自动化测试脚本                                                ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
EOF
    printf "${NC}\n"
    
    log "Starting automated test suite..."
    log "Test configuration:"
    log "  Chain ID: $CHAIN_ID"
    log "  RPC Node: $RPC_NODE"
    log "  Test Account: $TEST_ACCOUNT"
    log "  WASM File: $WASM_FILE"
    
    # Show debug mode status
    if [ "$DEBUG_MODE" = "1" ]; then
        log_warning "Debug Mode: ENABLED (Full output will be displayed)"
    else
        log "  Debug Mode: Disabled (Set DEBUG=1 to enable)"
    fi
    
    # Show preset values if any
    if [ -n "$CODE_ID" ]; then
        log "  Preset Code ID: $CODE_ID"
    fi
    if [ -n "$CONTRACT_ADDR" ]; then
        log "  Preset Contract Address: $CONTRACT_ADDR"
    fi
    
    preflight_checks
    deploy_contract
    test_basic_functionality
    test_gas_performance
    test_queries
    generate_report
    
    section_header "Test Suite Completed"
    
    # Count results
    local total_tests=0
    local passed_tests=0
    local IFS='|'
    for entry in $TEST_RESULTS; do
        if [ -n "$entry" ]; then
            total_tests=$((total_tests + 1))
            if echo "$entry" | grep -q ":SUCCESS"; then
                passed_tests=$((passed_tests + 1))
            fi
        fi
    done
    
    echo ""
    log_success "Total Tests: $total_tests"
    log_success "Passed: $passed_tests"
    log_success "Failed: $((total_tests - passed_tests))"
    echo ""
    log_success "Contract Address: $CONTRACT_ADDR"
    log_success "Code ID: $CODE_ID"
    echo ""
    log_success "Report: $REPORT_FILE"
    log_success "Log: $LOG_FILE"
    echo ""
    
    if [ $passed_tests -eq $total_tests ]; then
        printf "${GREEN}"
        cat << "EOF"
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║                   ✓ ALL TESTS PASSED!                         ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
EOF
        printf "${NC}\n"
        exit 0
    else
        printf "${YELLOW}"
        cat << "EOF"
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║              ⚠ SOME TESTS FAILED OR SKIPPED                   ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
EOF
        printf "${NC}\n"
        exit 1
    fi
}

# Handle script interruption
trap 'echo ""; log_error "Script interrupted by user"; exit 130' INT TERM

# Run main
main
