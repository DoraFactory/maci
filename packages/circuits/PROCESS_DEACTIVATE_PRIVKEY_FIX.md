# ProcessDeactivate 测试私钥格式修复

## 问题描述

测试失败在电路第 160 行：
```circom
derivedPubKey.pubKey[0] === coordPubKey[0];
```

**错误**: 从 `coordPrivKey` 派生的公钥与提供的 `coordPubKey` 不匹配。

## 根本原因

测试代码使用了**错误的私钥格式**：

```typescript
const coordPrivKey = coordKeypair.getPrivateKey();  // ❌ 原始私钥
```

但是电路和 SDK 使用的是**格式化的私钥**：

```typescript
coordPrivKey: signer.getFormatedPrivKey()  // ✅ 格式化私钥
```

## 私钥的两种格式

### 1. 原始私钥 (`getPrivateKey()`)
```typescript
// 由 genPrivKey() 生成的原始随机值
const privKey = BigInt(`0x${CryptoJS.lib.WordArray.random(32).toString()}`);
```

### 2. 格式化私钥 (`getFormatedPrivKey()`)
```typescript
// 格式化以兼容 BabyJub 曲线
const formatedPrivKey = BigInt(deriveSecretScalar(bigInt2Buffer(privKey)));
```

**关键区别**：
- 原始私钥是直接生成的随机数
- 格式化私钥经过 `deriveSecretScalar` 处理，确保与 BabyJub 曲线兼容
- 两者的值**不同**

## 为什么电路需要格式化私钥？

电路中的 `PrivToPubKey` 组件：
```circom
component derivedPubKey = PrivToPubKey();
derivedPubKey.privKey <== coordPrivKey;
derivedPubKey.pubKey[0] === coordPubKey[0];
derivedPubKey.pubKey[1] === coordPubKey[1];
```

这个组件内部使用 BabyJub 曲线进行公钥派生：
```
pubKey = privKey * G  (G 是 BabyJub 基点)
```

为了保证一致性，私钥必须是**格式化的**，否则派生出的公钥将不匹配。

## SDK 中的使用

在 SDK 中，所有电路相关的操作都使用格式化私钥：

### OperatorClient.processDeactivateMessages
```typescript
const input = {
  // ...
  coordPrivKey: signer.getFormatedPrivKey(),  // ✅
  coordPubKey: signer.getPublicKey().toPoints(),
  // ...
};
```

### OperatorClient.processMessages
```typescript
const input = {
  // ...
  coordPrivKey: signer.getFormatedPrivKey(),  // ✅
  coordPubKey: signer.getPublicKey().toPoints(),
  // ...
};
```

### VoterClient 中的所有证明生成
```typescript
const input = {
  // ...
  oldPrivateKey: signer.getFormatedPrivKey()  // ✅
};
```

## 修复

**修改前**:
```typescript
const coordPrivKey = coordKeypair.getPrivateKey();  // ❌ 错误
```

**修改后**:
```typescript
const coordPrivKey = coordKeypair.getFormatedPrivKey();  // ✅ 正确
```

## 验证

修复后，电路的公钥验证将通过：

```
1. 测试提供 coordPrivKey (格式化的)
2. 电路计算 derivedPubKey = PrivToPubKey(coordPrivKey)
3. 验证: derivedPubKey === coordPubKey ✅
```

因为：
```typescript
// 在 SDK 中
const signer = operator.getSigner();
const formatedPrivKey = signer.getFormatedPrivKey();
const pubKey = signer.getPublicKey();  // 从 formatedPrivKey 派生

// 在电路中
derivedPubKey = PrivToPubKey(formatedPrivKey);

// 结果
derivedPubKey === pubKey ✅  // 匹配！
```

## 完整的数据流

```
原始私钥 (secretKey: 123456n)
  ↓ deriveSecretScalar
格式化私钥 (formatedPrivKey)
  ↓ PrivToPubKey (BabyJub)
公钥 (pubKey: [x, y])
```

在测试中：
```typescript
// 1. 创建 operator
const operator = new OperatorClient({ secretKey: 123456n });
const signer = operator.getSigner();

// 2. 获取格式化私钥和公钥
const coordPrivKey = signer.getFormatedPrivKey();  // ✅
const coordPubKey = signer.getPublicKey().toPoints();

// 3. 传递给电路
const circuitInputs = {
  coordPrivKey,  // 格式化的
  coordPubKey,   // 从格式化私钥派生
  // ...
};

// 4. 电路内部验证
// PrivToPubKey(coordPrivKey) === coordPubKey ✅ 通过！
```

## 其他测试的参考

这个修复与其他测试文件一致：

**ProcessMessagesAmaci.test.ts**:
```typescript
// 使用 SDK 生成的输入，SDK 内部使用 getFormatedPrivKey()
const result = await operator.processMessages({
  newStateSalt: 0n,
  derivePathParams
});
```

**MessageValidatorMaci.test.ts**:
```typescript
const voter = new VoterClient({ secretKey: 111n });
const signer = voter.getSigner();
// 所有电路输入都使用 signer 生成，内部使用格式化私钥
```

## 总结

### 问题
- ❌ 测试使用 `getPrivateKey()`（原始私钥）
- ❌ 电路派生的公钥与提供的公钥不匹配

### 修复
- ✅ 测试改用 `getFormatedPrivKey()`（格式化私钥）
- ✅ 与 SDK 中的所有电路操作保持一致
- ✅ 电路验证通过

### 关键点
- 电路始终需要**格式化私钥**
- 公钥是从**格式化私钥**派生的
- 测试必须使用与 SDK 相同的私钥格式

---

修复完成！现在私钥格式正确，电路应该能够验证公钥匹配。
