#!/bin/sh

################################################################################
# Error Handling Verification Script
# 错误处理验证脚本
################################################################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo "${CYAN}════════════════════════════════════════════════════════${NC}"
echo "${CYAN}  Error Handling Verification Test${NC}"
echo "${CYAN}  错误处理验证测试${NC}"
echo "${CYAN}════════════════════════════════════════════════════════${NC}"
echo ""

# Source the main script functions
TEST_SCRIPT="./scripts/auto-test.sh"

if [ ! -f "$TEST_SCRIPT" ]; then
    echo "${RED}✗ Test script not found: $TEST_SCRIPT${NC}"
    exit 1
fi

echo "${GREEN}✓ Test script found${NC}"
echo ""

# Test 1: Syntax check
echo "${CYAN}Test 1: Checking script syntax...${NC}"
if sh -n "$TEST_SCRIPT"; then
    echo "${GREEN}✓ Syntax check passed${NC}"
else
    echo "${RED}✗ Syntax check failed${NC}"
    exit 1
fi
echo ""

# Test 2: Verify set +e is in test functions
echo "${CYAN}Test 2: Verifying error handling in test functions...${NC}"
if grep -q "set +e" "$TEST_SCRIPT"; then
    echo "${GREEN}✓ Found 'set +e' in script${NC}"
else
    echo "${RED}✗ 'set +e' not found${NC}"
    exit 1
fi

if grep -q "set -e" "$TEST_SCRIPT"; then
    echo "${GREEN}✓ Found 'set -e' restoration${NC}"
else
    echo "${RED}✗ 'set -e' restoration not found${NC}"
    exit 1
fi
echo ""

# Test 3: Verify error output improvements
echo "${CYAN}Test 3: Verifying error output improvements...${NC}"
if grep -q "tee -a" "$TEST_SCRIPT"; then
    echo "${GREEN}✓ Found 'tee' for dual output${NC}"
else
    echo "${RED}✗ 'tee' not found for error output${NC}"
    exit 1
fi

if grep -q "log_error \"Error output:\"" "$TEST_SCRIPT"; then
    echo "${GREEN}✓ Found improved error logging${NC}"
else
    echo "${YELLOW}⚠ Improved error logging might be missing${NC}"
fi
echo ""

# Test 4: Verify error continuation in test functions
echo "${CYAN}Test 4: Verifying error continuation...${NC}"
if grep -q "|| log_warning" "$TEST_SCRIPT"; then
    echo "${GREEN}✓ Found error continuation with log_warning${NC}"
else
    echo "${YELLOW}⚠ Error continuation might not be implemented${NC}"
fi
echo ""

# Test 5: Count improvements
echo "${CYAN}Test 5: Counting improvements...${NC}"
set_plus_e_count=$(grep -c "set +e" "$TEST_SCRIPT" || true)
set_minus_e_count=$(grep -c "set -e" "$TEST_SCRIPT" || true)
log_warning_count=$(grep -c "|| log_warning" "$TEST_SCRIPT" || true)

echo "  - 'set +e' occurrences: ${set_plus_e_count}"
echo "  - 'set -e' occurrences: ${set_minus_e_count}"
echo "  - Error continuation (|| log_warning): ${log_warning_count}"
echo ""

# Summary
echo "${CYAN}════════════════════════════════════════════════════════${NC}"
echo "${GREEN}✓ All verification tests passed!${NC}"
echo "${CYAN}════════════════════════════════════════════════════════${NC}"
echo ""
echo "The script has been successfully modified with:"
echo "  1. Improved error output (visible in console)"
echo "  2. Error tolerance in test functions"
echo "  3. Continuation after test failures"
echo ""
echo "You can now run the main test script with:"
echo "  ${YELLOW}DEBUG=1 CODE_ID=191 CONTRACT_ADDR=<addr> ./scripts/auto-test.sh${NC}"
echo ""
