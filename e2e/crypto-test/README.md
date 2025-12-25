# Crypto Consistency Testing

This directory contains utilities for cross-language crypto consistency testing between Rust `maci-crypto` and TypeScript SDK implementations.

## 📁 Structure

```
e2e/crypto-test/
├── generate-vectors.ts       # Generate test vectors from Rust
├── load-vectors.ts            # Load and parse test vectors
├── test-vectors.d.ts          # TypeScript type definitions
├── test-vectors-rust.json     # Generated test vectors (git-ignored)
└── README.md                  # This file
```

## 🚀 Usage

### Generate Test Vectors

```bash
# From e2e directory
pnpm generate:crypto-vectors

# Or using ts-node directly
ts-node crypto-test/generate-vectors.ts
```

This will:
1. Run the Rust binary in `crates/maci-crypto`
2. Capture the JSON output
3. Validate the test vectors
4. Save to `test-vectors-rust.json`

### Run Tests

```bash
# From e2e directory
pnpm test:crypto

# This automatically generates vectors first (via pretest:crypto hook)
```

## 📊 Test Coverage

The test vectors cover:

1. **Keypair Generation** (`keypair`)
   - Deterministic keypair generation from seeds
   - Public key derivation from private keys
   - Public key packing/unpacking

2. **ECDH Shared Keys** (`ecdh`)
   - Shared key derivation between two keypairs
   - Verification of ECDH symmetry property

3. **Message Packing** (`pack`)
   - Packing message fields (nonce, stateIdx, voIdx, newVotes, salt)
   - Unpacking packed messages
   - Edge cases (zero values, max values)

4. **Merkle Trees** (`tree`)
   - Tree root calculation
   - Different tree configurations (degree, depth)
   - Leaf initialization and verification

5. **Ciphertext Rerandomization** (`rerandomize`)
   - Rerandomization with deterministic random values
   - Verification of rerandomized ciphertexts

## 🔄 Workflow

### During Development

```bash
# Generate vectors manually when needed
pnpm generate:crypto-vectors

# Run tests
pnpm test:crypto
```

### Automated (CI/CD)

The test command automatically generates vectors:

```bash
# This runs generate-vectors.ts first, then runs tests
pnpm test:crypto
```

See `package.json` for the `pretest:crypto` hook.

## 📊 Test Vector Format

```json
{
  "name": "keypair_deterministic_seed_12345",
  "description": "Keypair generated from seed 12345",
  "test_type": "keypair",
  "data": {
    "seed": "0x3039",
    "priv_key": "0x3039",
    "pub_key": {
      "x": "0x29ddfdb1a9e74c7e72e3b7ea3454e21f22b5f65bd7db663db02469ef3dfe4ead",
      "y": "0x28bd0d57474968d2e9d3513ac62e59e0e348b24df1fb677c1756b79a29e740c4"
    },
    "formatted_priv_key": "0x43ae11fac487c7f185eaefcc4f11cf46ca88b79a209d3dbce54a97f11cf41d58",
    "packed_pub_key": "0xa8bd0d57474968d2e9d3513ac62e59e0e348b24df1fb677c1756b79a29e740c4"
  }
}
```

### Fields

- `name`: Unique identifier for the test case
- `description`: Human-readable description
- `test_type`: One of "keypair", "ecdh", "pack", "tree", "rerandomize"
- `data`: Test-specific data structure

## 🛠️ Architecture

```
┌─────────────────────────────────────────┐
│   TypeScript Test Runner               │
│   (e2e/tests/crypto-consistency.*)      │
└──────────────┬──────────────────────────┘
               │
               ├─ Generate Phase ──────────┐
               │                           │
               ▼                           ▼
        ┌─────────────┐         ┌──────────────────┐
        │ generate-   │  runs   │ Rust Binary      │
        │ vectors.ts  ├────────>│ (maci-crypto)    │
        └──────┬──────┘         └────────┬─────────┘
               │                         │
               │                         │ writes JSON
               │                         ▼
               │              ┌──────────────────────┐
               │              │ test-vectors-        │
               │              │ rust.json            │
               │              └──────────┬───────────┘
               │                         │
               └─ Test Phase ────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ load-vectors.ts      │
              │ (loads JSON)         │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ crypto-consistency    │
              │ .e2e.test.ts          │
              │ (compares results)    │
              └──────────────────────┘
```

## 📝 Adding New Test Vectors

### Step 1: Update Rust Generator

Edit `crates/maci-crypto/src/bin/generate_crypto_test_vectors.rs`:

```rust
vectors.push(TestVector {
    name: "my_new_test".to_string(),
    description: "My test case".to_string(),
    test_type: "keypair".to_string(),
    data: serde_json::json!({
        // ... test data
    }),
});
```

### Step 2: Regenerate Vectors

```bash
pnpm generate:crypto-vectors
```

### Step 3: Run Tests

```bash
pnpm test:crypto
```

## 🎯 Best Practices

1. **Always regenerate** vectors after modifying the Rust implementation
2. **Validate** vectors before committing
3. **Don't commit** `test-vectors-rust.json` (it's generated)
4. **Run tests** in CI to ensure consistency
5. **Keep names consistent** between Rust and TypeScript test definitions

## 📚 Related Files

- Test implementation: `../tests/crypto-consistency.e2e.test.ts`
- Rust generator: `../../crates/maci-crypto/src/bin/generate_crypto_test_vectors.rs`
- Package scripts: `../package.json`

## 🤝 Contributing

When adding new test cases:

1. Add to Rust generator
2. Regenerate vectors
3. Run tests to verify
4. Update this README if needed

