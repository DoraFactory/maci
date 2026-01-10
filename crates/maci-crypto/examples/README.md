# MACI Crypto Examples

This directory contains usage examples for the maci-crypto library.

## 📁 Example List

### 1. `basic_usage.rs` - Basic Usage
Demonstrates core library functionality:
- ✅ Key pair generation
- ✅ Poseidon hashing
- ✅ Message packing/unpacking
- ✅ Basic Merkle tree operations

**Run:**
```bash
cargo run --example basic_usage
```

### 2. `keys_and_ecdh.rs` - Keys and ECDH
Detailed demonstration of key management and ECDH shared keys:
- ✅ Random key generation
- ✅ Deterministic key generation
- ✅ Private key formatting
- ✅ Public key derivation
- ✅ Public key packing/unpacking
- ✅ ECDH shared key computation

**Run:**
```bash
cargo run --example keys_and_ecdh
```

### 3. `merkle_tree.rs` - Merkle Tree
Comprehensive Merkle tree operations:
- ✅ Create binary and n-ary trees
- ✅ Initialize leaf nodes
- ✅ Update leaves
- ✅ Generate Merkle proof
- ✅ Compute zero hashes
- ✅ Extend tree root
- ✅ Large tree examples

**Run:**
```bash
cargo run --example merkle_tree
```

### 4. `poseidon_hashing.rs` - Poseidon Hashing
In-depth exploration of Poseidon hashing features:
- ✅ Basic Poseidon hashing
- ✅ Poseidon with different arities (T3-T6)
- ✅ Hashing with automatic padding
- ✅ Merkle tree specific hashing
- ✅ Single element hashing
- ✅ Large input hashing (hash10, hash12)
- ✅ SHA256 comparison
- ✅ Deterministic verification
- ✅ Avalanche effect demonstration
- ✅ Batch hashing

**Run:**
```bash
cargo run --example poseidon_hashing
```

## 🚀 Quick Start

### Run All Examples

```bash
# Navigate to project directory
cd /Users/feng/Desktop/dora-work/new/maci/crates/maci-crypto

# Run basic example
cargo run --example basic_usage

# Run keys example
cargo run --example keys_and_ecdh

# Run Merkle tree example
cargo run --example merkle_tree

# Run hashing example
cargo run --example poseidon_hashing
```

### Show Verbose Output

```bash
# Use --verbose to see compilation details
cargo run --example basic_usage --verbose

# Run in release mode (faster)
cargo run --example basic_usage --release
```

### List All Available Examples

```bash
# View examples/ directory
ls examples/

# Or check Cargo output
cargo run --example
```

## 📊 Example Output Description

Each example outputs:
- 📝 Detailed step-by-step descriptions
- 🔢 Input and output data
- ✅ Verification results
- 📊 Statistics

Example output format:
```
🚀 MACI Crypto - Basic Usage Example

============================================================

📝 1. Generate Key Pair
------------------------------------------------------------
Private Key: 12345...
Public Key X: 67890...
Public Key Y: 11121...
...
```

## 🧪 Difference from Tests

| Feature | Examples (examples/) | Tests (tests/) |
|---------|---------------------|----------------|
| **Purpose** | Demonstrate usage | Verify functionality |
| **Output** | Detailed print output | Concise assertions |
| **Run** | `cargo run --example` | `cargo test` |
| **Failure Handling** | Show error messages | Assert failures |
| **User Experience** | Interactive, educational | Automated, verification |

## 💡 Learning Path

Recommended learning order:

1. **Getting Started**: `basic_usage.rs`
   - Understand core library functionality
   - Quick start with basic operations

2. **Key Management**: `keys_and_ecdh.rs`
   - Deep dive into key generation and management
   - Learn ECDH shared keys

3. **Hashing**: `poseidon_hashing.rs`
   - Master various uses of Poseidon hashing
   - Understand differences between hash functions

4. **Advanced**: `merkle_tree.rs`
   - Learn complete Merkle tree operations
   - Understand Merkle proof in zero-knowledge proofs

## 🔍 Debugging Tips

### 1. Add Debug Output

Add `println!` or `dbg!` in code:

```rust
let hash = poseidon(&inputs);
println!("Debug: hash = {}", hash);
dbg!(&hash);
```

### 2. Use Rust Analyzer

In VS Code or other IDEs:
- Set breakpoints
- Step through execution
- View variable values

### 3. Run Specific Parts

Comment out unneeded parts to focus on specific functionality:

```rust
fn main() {
    // Only run the part of interest
    test_poseidon();
    // test_merkle_tree();  // Commented out
}
```

## 📚 More Resources

- **Quick Start**: See `../QUICKSTART.md`
- **API Documentation**: Run `cargo doc --open`
- **Source Code**: View `../src/` directory
- **Tests**: View `#[cfg(test)]` modules in `../src/`

## 🤝 Contributing Examples

If you want to add a new example:

1. Create a new file in `examples/` directory
2. Add documentation comments explaining purpose
3. Add detailed print output
4. Add description in this README
5. Ensure the example runs successfully

Example template:

```rust
//! My Example - Brief description
//! 
//! Run with: cargo run --example my_example

use maci_crypto::*;

fn main() {
    println!("🚀 My Example\n");
    println!("=" .repeat(60));
    
    // Your code here
    
    println!("\n✅ Example completed!");
}
```

## ⚙️ Performance Testing

To test performance, use release mode:

```bash
# Debug mode (default, slower)
cargo run --example basic_usage

# Release mode (optimized, much faster)
cargo run --example basic_usage --release

# Compare time differences
time cargo run --example basic_usage
time cargo run --example basic_usage --release
```

## 🐛 Common Issues

### Issue 1: Compilation Errors

```bash
# Clean and rebuild
cargo clean
cargo build
cargo run --example basic_usage
```

### Issue 2: Example Not Found

```bash
# Ensure you're in the correct directory
cd crates/maci-crypto

# List all examples
ls examples/
```

### Issue 3: Slow Execution

```bash
# Use release mode
cargo run --example basic_usage --release
```

---

**Tip**: These examples are the best starting point for learning maci-crypto! It's recommended to run them in order and review the output.

