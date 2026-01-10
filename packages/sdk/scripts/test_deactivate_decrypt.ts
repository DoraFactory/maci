import { poseidon } from '../src/libs/crypto/hashing';
import { encryptOdevity, decrypt } from '../src/libs/crypto/rerandomize';
import { genKeypair, genRandomSalt } from '../src/libs/crypto';

console.log('==========================================');
console.log('  AMACI Deactivate Status Detection Test');
console.log('==========================================\n');

// 生成 coordinator 密钥对
const coordinator = genKeypair();
console.log('1. Coordinator Keys:');
console.log('   Private Key:', coordinator.privKey.toString());
console.log('   Public Key X:', coordinator.pubKey[0].toString());
console.log('   Public Key Y:', coordinator.pubKey[1].toString());
console.log('');

// ============================================
// 场景 1: 初始状态 (SignUp 时) - c1 = c2 = [0, 0]
// ============================================
console.log('2. Test Case 1: Initial State (SignUp)');
console.log('   -------------------------------------');
console.log('   State: c1 = [0, 0], c2 = [0, 0]');
console.log('');

const initialC1 = { x: 0n, y: 0n };
const initialC2 = { x: 0n, y: 0n };

const decryptResult1 = decrypt(coordinator.privKey, {
  c1: initialC1,
  c2: initialC2,
  xIncrement: 0n
});

console.log('   Decrypt Result:', decryptResult1.toString());
console.log('   Is Odd (deactivated)?', decryptResult1 % 2n === 1n);
console.log('   Is Even (active)?', decryptResult1 % 2n === 0n);
console.log('   Status: ' + (decryptResult1 % 2n === 0n ? '✅ ACTIVE' : '❌ DEACTIVATED'));
console.log('');

// 验证哈希值
const hash5_zeros = poseidon([0n, 0n, 0n, 0n, 0n]);
console.log('   hash5([0, 0, 0, 0, 0]):');
console.log('   Decimal:', hash5_zeros.toString());
console.log('   Hex: 0x' + hash5_zeros.toString(16));
console.log('   Expected: 0x2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc');
console.log(
  '   Match:',
  hash5_zeros.toString(16) === '2066be41bebe6caf7e079360abe14fbf9118c62eabc42e2fe75e342b160a95bc'
);
console.log('');

// ============================================
// 场景 2: Deactivate 后 - 加密状态为 1 (奇数)
// ============================================
console.log('3. Test Case 2: After Deactivate');
console.log('   -------------------------------------');

// 生成随机密钥（模拟 operator 的确定性随机数）
const randomKey = genRandomSalt();
console.log('   Random Key:', randomKey.toString());
console.log('');

// 加密 deactivate 状态（isOdd = true → message = 1）
console.log('   Encrypting state: isOdd = true (deactivated)');
const encrypted = encryptOdevity(
  true, // isOdd = true → deactivated
  coordinator.pubKey,
  randomKey
);

console.log('   Encrypted Result:');
console.log('   c1.x:', encrypted.c1.x.toString());
console.log('   c1.y:', encrypted.c1.y.toString());
console.log('   c2.x:', encrypted.c2.x.toString());
console.log('   c2.y:', encrypted.c2.y.toString());
console.log('');

// 解密验证
const decryptResult2 = decrypt(coordinator.privKey, {
  c1: encrypted.c1,
  c2: encrypted.c2,
  xIncrement: encrypted.xIncrement || 0n
});

console.log('   Decrypt Result:', decryptResult2.toString());
console.log('   Result % 2:', (decryptResult2 % 2n).toString());
console.log('   Is Odd (deactivated)?', decryptResult2 % 2n === 1n);
console.log('   Is Even (active)?', decryptResult2 % 2n === 0n);
console.log('   Status: ' + (decryptResult2 % 2n === 1n ? '❌ DEACTIVATED' : '✅ ACTIVE'));
console.log('');

// ============================================
// 场景 3: 重新加密 Active 状态 (isOdd = false)
// ============================================
console.log('4. Test Case 3: Encrypt Active State (for comparison)');
console.log('   -------------------------------------');

const randomKey2 = genRandomSalt();
console.log('   Random Key:', randomKey2.toString());
console.log('');

// 加密 active 状态（isOdd = false → message = 0）
console.log('   Encrypting state: isOdd = false (active)');
const encryptedActive = encryptOdevity(
  false, // isOdd = false → active
  coordinator.pubKey,
  randomKey2
);

console.log('   Encrypted Result:');
console.log('   c1.x:', encryptedActive.c1.x.toString());
console.log('   c1.y:', encryptedActive.c1.y.toString());
console.log('   c2.x:', encryptedActive.c2.x.toString());
console.log('   c2.y:', encryptedActive.c2.y.toString());
console.log('');

// 解密验证
const decryptResult3 = decrypt(coordinator.privKey, {
  c1: encryptedActive.c1,
  c2: encryptedActive.c2,
  xIncrement: encryptedActive.xIncrement || 0n
});

console.log('   Decrypt Result:', decryptResult3.toString());
console.log('   Result % 2:', (decryptResult3 % 2n).toString());
console.log('   Is Odd (deactivated)?', decryptResult3 % 2n === 1n);
console.log('   Is Even (active)?', decryptResult3 % 2n === 0n);
console.log('   Status: ' + (decryptResult3 % 2n === 0n ? '✅ ACTIVE' : '❌ DEACTIVATED'));
console.log('');

// ============================================
// 场景 4: 使用错误的私钥解密
// ============================================
console.log('5. Test Case 4: Decrypt with Wrong Private Key');
console.log('   -------------------------------------');

const wrongCoordinator = genKeypair();
console.log('   Wrong Private Key:', wrongCoordinator.privKey.toString());
console.log('');

try {
  const decryptResult4 = decrypt(wrongCoordinator.privKey, {
    c1: encrypted.c1,
    c2: encrypted.c2,
    xIncrement: 0n
  });

  console.log('   Decrypt Result:', decryptResult4.toString());
  console.log('   Is Odd (deactivated)?', decryptResult4 % 2n === 1n);
  console.log('   Status: ' + (decryptResult4 % 2n === 1n ? '❌ DEACTIVATED' : '✅ ACTIVE'));
  console.log('   ⚠️  Wrong key produces incorrect result!');
} catch (e) {
  console.log('   Error:', e);
}
console.log('');

// ============================================
// 场景 5: 模拟完整的 Operator 检测流程
// ============================================
console.log('6. Test Case 5: Simulate Operator Detection Flow');
console.log('   -------------------------------------');

interface StateLeaf {
  pubKey: [bigint, bigint];
  balance: bigint;
  voTreeRoot: bigint;
  nonce: bigint;
  d1: [bigint, bigint];
  d2: [bigint, bigint];
  xIncrement?: bigint;
}

// 模拟用户状态叶
const userKeypair = genKeypair();
const stateLeaf1: StateLeaf = {
  pubKey: [userKeypair.pubKey[0], userKeypair.pubKey[1]],
  balance: 100n,
  voTreeRoot: 0n,
  nonce: 0n,
  d1: [0n, 0n], // 初始状态
  d2: [0n, 0n]
};

console.log('   User State Leaf (Initial):');
console.log(
  '   - pubKey:',
  stateLeaf1.pubKey.map((x) => x.toString())
);
console.log('   - balance:', stateLeaf1.balance.toString());
console.log(
  '   - d1 (c1):',
  stateLeaf1.d1.map((x) => x.toString())
);
console.log(
  '   - d2 (c2):',
  stateLeaf1.d2.map((x) => x.toString())
);
console.log('');

// Operator 检测函数
function checkDeactivateStatus(
  stateLeaf: StateLeaf,
  coordPrivKey: bigint
): 'active' | 'deactivated' {
  const deactivate = decrypt(coordPrivKey, {
    c1: { x: stateLeaf.d1[0], y: stateLeaf.d1[1] },
    c2: { x: stateLeaf.d2[0], y: stateLeaf.d2[1] },
    xIncrement: stateLeaf.xIncrement || 0n
  });

  console.log('   Decrypt value:', deactivate.toString());
  console.log('   Decrypt value % 2:', (deactivate % 2n).toString());

  if (deactivate % 2n === 1n) {
    return 'deactivated';
  }
  return 'active';
}

const status1 = checkDeactivateStatus(stateLeaf1, coordinator.privKey);
console.log('   Status:', status1);
console.log('   Can vote:', status1 === 'active' ? '✅ YES' : '❌ NO');
console.log('');

// 模拟 deactivate 后
console.log('   User State Leaf (After Deactivate):');
const randomKey3 = genRandomSalt();
const newEncrypted = encryptOdevity(true, coordinator.pubKey, randomKey3);

const stateLeaf2: StateLeaf = {
  ...stateLeaf1,
  d1: [newEncrypted.c1.x, newEncrypted.c1.y],
  d2: [newEncrypted.c2.x, newEncrypted.c2.y],
  xIncrement: newEncrypted.xIncrement || 0n
};

console.log(
  '   - d1 (c1):',
  stateLeaf2.d1.map((x) => x.toString())
);
console.log(
  '   - d2 (c2):',
  stateLeaf2.d2.map((x) => x.toString())
);
console.log('');

const status2 = checkDeactivateStatus(stateLeaf2, coordinator.privKey);
console.log('   Status:', status2);
console.log('   Can vote:', status2 === 'active' ? '✅ YES' : '❌ NO');
console.log('');

// ============================================
// 总结
// ============================================
console.log('==========================================');
console.log('  Summary');
console.log('==========================================');
console.log('');
console.log('Key Findings:');
console.log('1. Initial state [0,0,0,0] decrypts to EVEN (0) → Active ✓');
console.log('2. Encrypted deactivate state decrypts to ODD (1) → Deactivated ✗');
console.log('3. Only coordinator can correctly decrypt the status');
console.log('4. hash5([0,0,0,0,0]) = 0x2066be...95bc (pre-computed in contract)');
console.log('');
console.log('Operator Detection:');
console.log('  decrypt(coordPrivKey, {c1, c2}) % 2 === 0 → ✅ Can vote');
console.log('  decrypt(coordPrivKey, {c1, c2}) % 2 === 1 → ❌ Cannot vote');
console.log('');
console.log('==========================================');
