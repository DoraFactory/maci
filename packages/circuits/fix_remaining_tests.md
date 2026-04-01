# 剩余需要修复的测试

所有测试都需要做以下修改：

1. 添加 `const pollId = 1;`
2. 将 `packaged` 计算改为 `packElement({ nonce, stateIdx, voIdx, newVotes: votes, pollId })`
3. 在 `command` 数组的索引 [3] 位置添加 `salt`

需要修复的测试位置：
- Line 277-306: "should correctly handle large vote weights (96-bit)"
- Line 339-367: "should handle maximum 32-bit values for indices"  
- Line 390-437: "should correctly extract packedCommandOut"
- Line 459-506: "should produce correct shared key through ECDH"
- Line 529-575: "should handle zero vote weight"
- Line 597-636: "should work with different voter and coordinator keypairs"

修复完成后验证：
- 运行 `pnpm test:messageToCommand`
- 运行 `pnpm test:unpackElement`
