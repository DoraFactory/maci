# 注释清理与优化 ✅

## 清理内容

本次清理移除了所有临时修改标记注释，并添加了更专业的 JSDoc 格式文档注释。

---

## 移除的修改标记

### 之前存在的标记：
- `// ✅ 移除 async`
- `// ✅ 移除 await`
- `// ✅ 移除 Promise`
- `// ❌` 
- `// Change from`
- `// Add pollId parameter`
- `// NEW`

这些标记是在开发过程中添加的，用于标识修改点，但在生产代码中应该移除。

---

## 添加的文档注释

### 1. VoterClient (`voter.ts`)

#### `buildVotePayload`
```typescript
/**
 * Build vote payload for batch message publishing
 * @param stateIdx - The state index of the voter
 * @param operatorPubkey - The coordinator's public key
 * @param selectedOptions - The vote options with their vote credits
 * @param pollId - The poll ID for this round (prevents replay attacks)
 * @param derivePathParams - Optional BIP44 derive path parameters
 * @returns Stringified vote payload ready for submission
 */
```

#### `batchGenMessage`
```typescript
/**
 * Generate multiple encrypted messages in batch
 * Messages are generated in reverse order for on-chain processing
 * @param stateIdx - The state index of the voter
 * @param operatorPubkey - The coordinator's public key
 * @param pollId - The poll ID for this round
 * @param plan - Array of [voteOptionIndex, voteCredit] tuples
 * @param derivePathParams - Optional BIP44 derive path parameters
 * @returns Array of encrypted messages with their encryption public keys
 */
```

#### `genMessageFactory`
```typescript
/**
 * Create a message factory for generating encrypted vote messages
 * The factory returns a function that can generate individual messages
 * @param stateIdx - The state index of the voter
 * @param operatorPubkey - The coordinator's public key
 * @param pollId - The poll ID for this round (prevents replay attacks across different polls)
 * @param derivePathParams - Optional BIP44 derive path parameters
 * @returns A function that generates encrypted messages
 */
```

**关键注释保留：**
```typescript
// Generate random 56-bit salt
// Pack command data including pollId to prevent replay attacks
// Last command uses null public key to indicate end of batch
// For non-last commands, keep the current public key (no rotation)
// Create hash of packed data and public key for signing
// Build command array: [packed_data, salt, new_pubkey_x, new_pubkey_y, sig_R8_x, sig_R8_y, sig_S]
// Encrypt command with shared key derived from encPriKey and coordinator's public key
```

#### `buildDeactivatePayload`
```typescript
/**
 * Build deactivate message payload
 * Deactivate messages use a specific nonce (default 0) and are independent from vote messages
 * @param stateIdx - The state index of the voter
 * @param operatorPubkey - The coordinator's public key
 * @param pollId - The poll ID for this round
 * @param nonce - The nonce for deactivation (default: 0)
 * @param derivePathParams - Optional BIP44 derive path parameters
 * @returns Stringified deactivate payload
 */
```

---

### 2. OperatorClient (`operator.ts`)

#### `buildVotePayload`
```typescript
/**
 * Build vote payload for batch message publishing
 * @param stateIdx - The state index of the voter
 * @param operatorPubkey - The coordinator's public key
 * @param selectedOptions - The vote options with their vote credits
 * @param pollId - The poll ID for this round (prevents replay attacks)
 * @param derivePathParams - Optional BIP44 derive path parameters
 * @returns Stringified vote payload ready for submission
 */
```

#### `batchGenMessage`
```typescript
/**
 * Generate multiple encrypted messages in batch
 * Messages are generated in reverse order for on-chain processing
 * @param stateIdx - The state index of the voter
 * @param operatorPubkey - The coordinator's public key
 * @param plan - Array of [voteOptionIndex, voteCredit] tuples
 * @param pollId - The poll ID for this round
 * @param derivePathParams - Optional BIP44 derive path parameters
 * @returns Array of encrypted messages with their encryption public keys
 */
```

#### `genMessageFactory`
```typescript
/**
 * Create a message factory for generating encrypted vote messages
 * The factory returns a function that can generate individual messages
 * @param stateIdx - The state index of the voter
 * @param operatorPubkey - The coordinator's public key
 * @param pollId - The poll ID for this round (prevents replay attacks across different polls)
 * @param derivePathParams - Optional BIP44 derive path parameters
 * @returns A function that generates encrypted messages
 */
```

**关键注释保留：**
```typescript
// Generate random 56-bit salt
// Pack command data including pollId to prevent replay attacks
// Last command uses null public key to indicate end of batch
// Create hash of packed data and public key for signing
// Build command array: [packed_data, salt, new_pubkey_x, new_pubkey_y, sig_R8_x, sig_R8_y, sig_S]
// Encrypt command with shared key derived from encPriKey and coordinator's public key
```

#### `buildDeactivatePayload`
```typescript
/**
 * Build deactivate message payload
 * Deactivate messages are used to mark a user as inactive in AMACI
 * @param stateIdx - The state index of the voter
 * @param operatorPubkey - The coordinator's public key
 * @param pollId - The poll ID for this round
 * @param derivePathParams - Optional BIP44 derive path parameters
 * @returns Stringified deactivate payload
 */
```

---

### 3. Crypto Utilities (`libs/crypto/keys.ts`)

#### `genMessageFactory`
```typescript
/**
 * Generate a message factory for creating encrypted vote messages
 * This is a lower-level utility function used by the SDK
 * @param stateIdx - The state index of the voter
 * @param signPriKey - The signing private key
 * @param signPubKey - The signing public key
 * @param coordPubKey - The coordinator's public key
 * @param pollId - The poll ID for this round (prevents replay attacks)
 * @returns A function that generates encrypted messages
 */
```

#### `batchGenMessage`
```typescript
/**
 * Batch generate encrypted commands
 * Output format: array of { msg, encPubkeys } objects
 * Messages are generated for commands 1 ~ N
 * @param stateIdx - The state index of the voter
 * @param keypair - The voter's keypair
 * @param coordPubKey - The coordinator's public key
 * @param plan - Array of [voteOptionIndex, voteCredit] tuples
 * @param pollId - The poll ID for this round
 * @returns Array of encrypted messages with their encryption public keys
 */
```

---

## 注释原则

### ✅ 保留的注释：

1. **解释业务逻辑**
   - "Pack command data including pollId to prevent replay attacks"
   - "Deactivate messages use a specific nonce (default 0)"

2. **说明技术细节**
   - "Generate random 56-bit salt"
   - "Last command uses null public key to indicate end of batch"

3. **文档化 API**
   - JSDoc 格式的函数文档
   - 参数说明和返回值说明

4. **重要的实现细节**
   - "Messages are generated in reverse order for on-chain processing"
   - "Encrypt command with shared key derived from encPriKey and coordinator's public key"

### ❌ 移除的注释：

1. **临时修改标记**
   - `// ✅ 移除 async`
   - `// Change from contractAddress to pollId`

2. **显而易见的注释**
   - 对代码字面意思的重复说明

3. **过时的注释**
   - 被注释掉的旧代码（除非有历史参考价值）

---

## 文档注释格式

我们使用 **JSDoc** 格式，这是 TypeScript 的标准文档格式：

```typescript
/**
 * Brief description of the function
 * More detailed explanation if needed
 * @param paramName - Description of the parameter
 * @param anotherParam - Another parameter description
 * @returns Description of the return value
 */
```

### 优势：

1. **IDE 支持** - VSCode 和其他 IDE 可以显示这些文档
2. **自动生成文档** - 可以用工具生成 API 文档
3. **类型提示** - 鼠标悬停时显示完整说明
4. **标准化** - 遵循 JavaScript/TypeScript 社区标准

---

## 代码质量提升

### 之前：
```typescript
buildVotePayload({  // ✅ 移除 async
  stateIdx,
  operatorPubkey,
  selectedOptions,
  pollId,  // Change from contractAddress to pollId
  derivePathParams
}: { ... }) {
  // Use pollId directly (passed from outer method)
  const packaged = packElement({ nonce, stateIdx, voIdx, newVotes, pollId });
  // ...
}
```

### 现在：
```typescript
/**
 * Build vote payload for batch message publishing
 * @param stateIdx - The state index of the voter
 * @param operatorPubkey - The coordinator's public key
 * @param selectedOptions - The vote options with their vote credits
 * @param pollId - The poll ID for this round (prevents replay attacks)
 * @param derivePathParams - Optional BIP44 derive path parameters
 * @returns Stringified vote payload ready for submission
 */
buildVotePayload({
  stateIdx,
  operatorPubkey,
  selectedOptions,
  pollId,
  derivePathParams
}: { ... }) {
  // Pack command data including pollId to prevent replay attacks
  const packaged = packElement({ nonce, stateIdx, voIdx, newVotes, pollId });
  // ...
}
```

---

## 验证结果

✅ **所有修改标记已清除**
```bash
grep -r "// ✅|// ❌|// Change|// Add |// NEW|// 移除" packages/sdk/src
# No matches found
```

✅ **TypeScript 编译成功**
```bash
npm run build
# ✅ Build success
# ESM dist/index.mjs     373.38 KB
# CJS dist/index.js      381.10 KB
```

✅ **代码质量提升**
- 专业的 JSDoc 文档注释
- 清晰的参数和返回值说明
- 保留了有价值的业务逻辑注释
- 移除了临时性的修改标记

---

## 最佳实践

### 1. **注释应该说明 "为什么"，而不是 "是什么"**

❌ 不好的注释：
```typescript
// Add 1 to i
i = i + 1;
```

✅ 好的注释：
```typescript
// Skip the first element (header row)
i = i + 1;
```

### 2. **使用 JSDoc 格式文档化公共 API**

```typescript
/**
 * Calculate the total vote credits
 * @param votes - Array of vote amounts
 * @returns The sum of all votes
 */
function calculateTotal(votes: number[]): number { ... }
```

### 3. **重要的业务逻辑需要注释**

```typescript
// Pack command data including pollId to prevent replay attacks across different polls
const packaged = packElement({ nonce, stateIdx, voIdx, newVotes, pollId });
```

### 4. **避免显而易见的注释**

❌ 不需要：
```typescript
// Set x to 5
const x = 5;
```

✅ 需要：
```typescript
// Maximum retries before giving up (based on network timeout constraints)
const MAX_RETRIES = 5;
```

---

## 总结

通过这次注释清理和优化，我们实现了：

1. ✅ **移除了所有临时修改标记** - 代码更干净
2. ✅ **添加了专业的 JSDoc 文档** - IDE 支持更好
3. ✅ **保留了有价值的业务注释** - 代码更易理解
4. ✅ **遵循最佳实践** - 符合社区标准

现在代码注释既专业又实用！🎉
