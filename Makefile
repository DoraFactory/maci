.PHONY: wasm wasm-amaci wasm-registry wasm-api-maci wasm-api-saas wasm-test
.PHONY: schema schema-amaci schema-registry schema-api-maci schema-api-saas
.PHONY: test unit-test clean optimize help

# Compile all contracts to wasm
wasm:
	@echo "Building all contracts..."
	@cd contracts/amaci && cargo wasm
	@cd contracts/registry && cargo wasm
	@cd contracts/api-maci && cargo wasm
	@cd contracts/api-saas && cargo wasm
	@cd contracts/test && cargo wasm
	@echo "✅ All contracts built successfully"

# Compile individual contracts
wasm-amaci:
	@cd contracts/amaci && cargo wasm

wasm-registry:
	@cd contracts/registry && cargo wasm

wasm-api-maci:
	@cd contracts/api-maci && cargo wasm

wasm-api-saas:
	@cd contracts/api-saas && cargo wasm

wasm-test:
	@cd contracts/test && cargo wasm

# Generate schemas for all contracts
schema:
	@echo "Generating schemas..."
	@cd contracts/amaci && cargo schema
	@cd contracts/registry && cargo schema
	@cd contracts/api-maci && cargo schema
	@cd contracts/api-saas && cargo schema
	@echo "✅ All schemas generated"

# Generate schema for individual contracts
schema-amaci:
	@cd contracts/amaci && cargo schema

schema-registry:
	@cd contracts/registry && cargo schema

schema-api-maci:
	@cd contracts/api-maci && cargo schema

schema-api-saas:
	@cd contracts/api-saas && cargo schema

# Run all tests (contracts + crates)
test:
	@cargo test

# Run unit tests for all contracts
unit-test:
	@echo "Running contract unit tests..."
	@cd contracts/amaci && cargo unit-test
	@cd contracts/registry && cargo unit-test
	@cd contracts/api-maci && cargo unit-test
	@cd contracts/api-saas && cargo unit-test
	@cd contracts/test && cargo unit-test
	@echo "✅ All contract tests passed"

# Run tests for crates only
test-crates:
	@echo "Running crates tests..."
	@cd crates/baby-jubjub && cargo test
	@cd crates/maci-utils && cargo test
	@cd crates/maci-crypto && cargo test
	@cd crates/eddsa-poseidon && cargo test
	@cd crates/crypto-test-gen && cargo test
	@echo "✅ All crate tests passed"

# Optimize wasm files (requires wasm-opt)
optimize:
	@echo "Optimizing wasm files..."
	@for file in target/wasm32-unknown-unknown/release/*.wasm; do \
		if [ -f "$$file" ]; then \
			echo "Optimizing $$file..."; \
			wasm-opt -Os "$$file" -o "$${file%.wasm}_optimized.wasm"; \
		fi \
	done
	@echo "✅ Optimization complete"

# Clean build artifacts
clean:
	@cargo clean
	@echo "✅ Clean complete"

# Show help
help:
	@echo "MACI Workspace Commands:"
	@echo ""
	@echo "  make wasm           - Build all contracts to wasm"
	@echo "  make wasm-amaci     - Build amaci contract"
	@echo "  make wasm-registry  - Build registry contract"
	@echo "  make wasm-api-maci  - Build api-maci contract"
	@echo "  make wasm-api-saas  - Build api-saas contract"
	@echo "  make wasm-test      - Build test contract"
	@echo ""
	@echo "  make schema         - Generate schemas for all contracts"
	@echo "  make schema-amaci   - Generate schema for amaci"
	@echo ""
	@echo "  make test           - Run all tests (contracts + crates)"
	@echo "  make unit-test      - Run unit tests for all contracts"
	@echo "  make test-crates    - Run tests for all crates"
	@echo ""
	@echo "  make optimize       - Optimize wasm files (requires wasm-opt)"
	@echo "  make clean          - Clean build artifacts"
	@echo "  make help           - Show this help message"

