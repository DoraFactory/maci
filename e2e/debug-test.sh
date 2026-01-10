#!/bin/bash

# Debug script for running only the failing tests with detailed output

cd /Users/feng/Desktop/dora-work/new/maci/e2e

echo "========================================="
echo "Running FIRST failing test with DEBUG"
echo "========================================="
echo ""

# Run only the specific test
pnpm mocha-test tests/add-new-key.e2e.test.ts --grep "should reject old voter votes after AddNewKey"

echo ""
echo "========================================="
echo "Test completed. Check output above for DEBUG logs."
echo "========================================="

