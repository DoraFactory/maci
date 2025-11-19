# CI/CD Workflow Documentation

This directory contains CI/CD configuration files for GitHub Actions.

## test.yml - Automated Testing Workflow

### Trigger Conditions
- `push` events on all branches (including pushes after PR merge)

### Test Jobs

The workflow contains three test jobs that run in parallel:

#### 1. Contract Tests
- **Runtime Environment**: Ubuntu Latest
- **Duration**: Approximately 10-20 minutes
- **Steps**:
  1. Setup Rust 1.79.0 toolchain
  2. Configure Cargo cache (to speed up subsequent builds)
  3. Run command: `cargo test --lib -- --nocapture`

#### 2. E2E Tests
- **Runtime Environment**: macOS-14 (Apple Silicon M1/M2)
- **Duration**: Approximately 40-60 minutes
- **Steps**:
  1. Setup Rust toolchain
  2. Compile contract WASM files using Docker + rust-optimizer
  3. Setup Node.js 22 and pnpm 9.12.3
  4. Download and cache circuit zkey files (approximately 100MB)
  5. Install dependencies and run e2e tests

**Notes**:
- First run requires contract compilation (approximately 15-20 minutes)
- First run requires downloading zkey files (approximately 5-10 minutes)
- Subsequent runs use cache and are faster
- Circuit files are cached to avoid repeated downloads

#### 3. Circuits Tests
- **Runtime Environment**: Ubuntu Latest
- **Duration**: Approximately 10-15 minutes
- **Steps**:
  1. Setup Node.js 22 and pnpm 9.12.3
  2. Install dependencies
  3. Run circuits tests

### Caching Strategy

The following caches are configured to speed up CI runs:

1. **Cargo Cache**:
   - `~/.cargo/registry` - Cargo registry
   - `~/.cargo/git` - Cargo git dependencies
   - `target/` - Build artifacts

2. **pnpm Cache**:
   - pnpm store - Node.js dependencies

3. **Circuit Files Cache**:
   - `e2e/circuits/` - zkey and wasm files

### Estimated Total Duration

- **First Run**: Approximately 60 minutes (parallel execution)
- **Subsequent Runs**: Approximately 20-30 minutes (benefiting from cache)

### Viewing Test Results

1. Go to the GitHub repository
2. Click on the "Actions" tab
3. Select the corresponding workflow run
4. View the execution status and logs for each job

### Local Testing

Before committing, you can run the same tests locally:

```bash
# Contract tests
cargo test --lib -- --nocapture

# E2E tests
cd e2e
pnpm install
pnpm setup-circuits  # Required for first run
pnpm test

# Circuits tests
cd packages/circuits
pnpm install
pnpm test
```

### Troubleshooting

#### E2E Test Failures
- Check if contracts compiled successfully
- Check if circuit files downloaded successfully
- Review specific test logs

#### Circuits Test Failures
- Check if Node.js has sufficient memory
- Review specific test case failure reasons

#### Cache Issues
If cache causes issues, you can clear the cache in the GitHub Actions page:
1. Settings -> Actions -> Caches
2. Delete relevant caches
3. Re-run the workflow

### Maintenance

- Regularly check for dependency updates
- Update Rust toolchain version (`rust-toolchain.toml`)
- Update Node.js version
- Update pnpm version
