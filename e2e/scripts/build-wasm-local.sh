#!/usr/bin/env bash
# Build CosmWasm contracts (release mode) for e2e testing.
#
# cw-amaci is built in isolation to prevent Cargo feature unification:
#   cw-amaci-registry depends on cw-amaci with features=["library"], which
#   suppresses entry-point exports. Building cw-amaci first, then copying
#   its artifact before the next step rebuilds it, avoids this.
#
# The schema binary in cw-amaci is gated behind the "schema" feature
# (required-features = ["schema"] in Cargo.toml), so it is skipped when
# building for wasm32 without that feature.
#
# Usage (from e2e directory):
#   pnpm build:wasm

set -euo pipefail

# e2e/scripts/ -> e2e/ -> repo root
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARTIFACTS_DIR="$REPO_ROOT/e2e/artifacts"
WASM_SRC="$REPO_ROOT/target/wasm32-unknown-unknown/release"

# Always write build artifacts to the workspace target directory.
# (Cursor/IDE sandboxes may set CARGO_TARGET_DIR to a temp path, which would
# prevent the WASM files from appearing in the expected location.)
export CARGO_TARGET_DIR="$REPO_ROOT/target"

echo "=== Building CosmWasm contracts (release mode) ==="
echo "Repo root:  $REPO_ROOT"
echo "Artifacts:  $ARTIFACTS_DIR"

# Ensure wasm32 target is installed
if ! rustup target list --installed | grep -q "wasm32-unknown-unknown"; then
  echo "Installing wasm32-unknown-unknown target..."
  rustup target add wasm32-unknown-unknown
fi

mkdir -p "$ARTIFACTS_DIR"

cd "$REPO_ROOT"

# ── Step 1: Build cw-amaci in isolation ──────────────────────────────────────
# Must be separate from registry/api-saas to avoid feature unification.
# --features test-vkeys enables 2-1-1-5 circuit support required by e2e tests.
# The schema binary is excluded because it requires the "schema" feature.
echo ""
echo "→ Building cw-amaci (release, with test-vkeys)..."
cargo build -p cw-amaci \
  --release \
  --target wasm32-unknown-unknown \
  --features test-vkeys

# Copy immediately before registry/api-saas rebuild cw-amaci as a lib dep
cp "$WASM_SRC/cw_amaci.wasm" "$ARTIFACTS_DIR/cw_amaci_test.wasm"
echo "  ✓ cw_amaci_test.wasm  ($(du -h "$ARTIFACTS_DIR/cw_amaci_test.wasm" | cut -f1))"

# ── Step 2: Build cw-amaci-registry ──────────────────────────────────────────
echo ""
echo "→ Building cw-amaci-registry (release)..."
cargo build -p cw-amaci-registry \
  --release \
  --target wasm32-unknown-unknown \
  --lib

cp "$WASM_SRC/cw_amaci_registry.wasm" "$ARTIFACTS_DIR/cw_amaci_registry_test.wasm"
echo "  ✓ cw_amaci_registry_test.wasm  ($(du -h "$ARTIFACTS_DIR/cw_amaci_registry_test.wasm" | cut -f1))"

# ── Step 3: Build cw-api-saas ────────────────────────────────────────────────
echo ""
echo "→ Building cw-api-saas (release)..."
cargo build -p cw-api-saas \
  --release \
  --target wasm32-unknown-unknown \
  --lib

cp "$WASM_SRC/cw_api_saas.wasm" "$ARTIFACTS_DIR/cw_api_saas_test.wasm"
echo "  ✓ cw_api_saas_test.wasm  ($(du -h "$ARTIFACTS_DIR/cw_api_saas_test.wasm" | cut -f1))"

# ── Step 4: Build cw-maci ────────────────────────────────────────────────────
# Required by state-tree e2e tests. No other package depends on it with
# features=["library"], so it can be built without isolation concerns.
echo ""
echo "→ Building cw-maci (release)..."
cargo build -p cw-maci \
  --release \
  --target wasm32-unknown-unknown \
  --lib

cp "$WASM_SRC/cw_maci.wasm" "$ARTIFACTS_DIR/cw_maci_test.wasm"
echo "  ✓ cw_maci_test.wasm  ($(du -h "$ARTIFACTS_DIR/cw_maci_test.wasm" | cut -f1))"

echo ""
echo "=== Build complete ==="
echo "Run e2e tests with: pnpm test"
