# Poseidon Hash Consistency Testing

This directory contains utilities for cross-language Poseidon hash consistency testing.

## 📁 Structure

```
e2e/poseidon-test/
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
pnpm generate:vectors

# Or using ts-node directly
ts-node poseidon-test/generate-vectors.ts
```

This will:
1. Run the Rust binary in `crates/maci-utils`
2. Capture the JSON output
3. Validate the test vectors
4. Save to `test-vectors-rust.json`

### Use in Tests

```typescript
import { loadRustTestVectors, findVector } from './poseidon-test/load-vectors';

// Load all vectors
const rustVectors = loadRustTestVectors();

// Find specific vector
const vector = findVector(rustVectors, 'basic_hash2_small');

// Use in test
const sdkResult = hash2([1n, 2n]);
const rustResult = BigInt(vector.rust_result);
expect(sdkResult).to.equal(rustResult);
```

## 🔄 Workflow

### During Development

```bash
# Generate vectors manually when needed
pnpm generate:vectors

# Run tests
pnpm test:poseidon
```

### Automated (CI/CD)

The test command automatically generates vectors:

```bash
# This runs generate-vectors.ts first, then runs tests
pnpm test:poseidon
```

See `package.json` for the `pretest:poseidon` hook.

## 📊 Test Vector Format

```json
[
  {
    "name": "basic_hash2_small",
    "description": "Simple small integers",
    "hash_type": "hash2",
    "inputs": ["0x01", "0x02"],
    "rust_result": "0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a"
  }
]
```

### Fields

- `name`: Unique identifier for the test case
- `description`: Human-readable description
- `hash_type`: Either "hash2" or "hash5"
- `inputs`: Array of hex-encoded input values
- `rust_result`: Hex-encoded hash result from Rust implementation

## 🛠️ Architecture

```
┌─────────────────────────────────────────┐
│   TypeScript Test Runner               │
│   (e2e/tests/poseidon-consistency.*)    │
└──────────────┬──────────────────────────┘
               │
               ├─ Generate Phase ──────────┐
               │                           │
               ▼                           ▼
        ┌─────────────┐         ┌──────────────────┐
        │ generate-   │  runs   │ Rust Binary      │
        │ vectors.ts  ├────────>│ (maci-utils)     │
        └──────┬──────┘         └────────┬─────────┘
               │                         │
               │                         ▼
               │                  ┌─────────────┐
               │                  │  JSON Output│
               │                  └──────┬──────┘
               │                         │
               └─────────────────────────┘
                         │
                         ▼
               ┌──────────────────┐
               │ test-vectors-    │
               │   rust.json      │
               └──────────────────┘
                         │
                         │
               ├─ Test Phase ─────────────┐
               │                          │
               ▼                          ▼
        ┌─────────────┐          ┌──────────────┐
        │ load-       │  reads   │ SDK/Circuit  │
        │ vectors.ts  │          │ Computation  │
        └──────┬──────┘          └──────┬───────┘
               │                        │
               └────────┬───────────────┘
                        │
                        ▼
                 ┌─────────────┐
                 │  Compare &  │
                 │  Validate   │
                 └─────────────┘
```

## 🔍 Troubleshooting

### Vectors not found

```
Error: Test vectors not found
```

**Solution**: Run `pnpm generate:vectors` first.

### Rust compilation error

```
Error: cargo command failed
```

**Solution**: 
1. Check Rust is installed: `cargo --version`
2. Ensure you're in the correct directory
3. Try manual compilation: `cd crates/maci-utils && cargo build`

### Invalid JSON output

```
Error: Could not find JSON output
```

**Solution**: The Rust binary might have changed output format. Check `crates/maci-utils/src/bin/generate_test_vectors.rs`.

## 📝 Adding New Test Vectors

### Step 1: Update Rust Generator

Edit `crates/maci-utils/src/bin/generate_test_vectors.rs`:

```rust
vectors.push(TestVector {
    name: "my_new_test".to_string(),
    description: "My test case".to_string(),
    hash_type: "hash2".to_string(),
    inputs: vec!["0x0A".to_string(), "0x0B".to_string()],
    rust_result: uint256_to_hex(&hash2([
        Uint256::from_u128(10),
        Uint256::from_u128(11)
    ])),
});
```

### Step 2: Regenerate Vectors

```bash
pnpm generate:vectors
```

### Step 3: Update TypeScript Tests

Edit `e2e/tests/poseidon-consistency.e2e.test.ts`:

```typescript
const TEST_VECTORS: TestVector[] = [
  // ... existing vectors
  {
    name: 'my_new_test',
    inputs: [BigInt(10), BigInt(11)],
    hashType: 'hash2',
    description: 'My test case'
  }
];
```

### Step 4: Run Tests

```bash
pnpm test:poseidon
```

## 🎯 Best Practices

1. **Always regenerate** vectors after modifying the Rust implementation
2. **Validate** vectors before committing
3. **Don't commit** `test-vectors-rust.json` (it's generated)
4. **Run tests** in CI to ensure consistency
5. **Keep names consistent** between Rust and TypeScript test definitions

## 📚 Related Files

- Test implementation: `../tests/poseidon-consistency.e2e.test.ts`
- Rust generator: `../../crates/maci-utils/src/bin/generate_test_vectors.rs`
- Package scripts: `../package.json`
- Documentation: `../../RUST_INTEGRATION_GUIDE.md`

## 🤝 Contributing

When adding new test cases:

1. Add to Rust generator
2. Regenerate vectors
3. Update TypeScript test definitions
4. Ensure names match exactly
5. Run full test suite
6. Document special cases

---

**Last Updated**: 2025-11-15  
**Maintainer**: MACI Team

