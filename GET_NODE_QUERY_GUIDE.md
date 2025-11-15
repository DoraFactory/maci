# GetNode 查询方法完整指南

## 概述

`GetNode` 是一个强大的查询方法，允许你查询状态树中任意节点的值。这对于详细验证树的结构、调试状态更新问题，以及对比合约与 SDK 的计算结果非常有用。

## 合约实现

### API-MACI 合约

**QueryMsg 定义**:
```rust
#[returns(Uint256)]
GetNode { index: Uint256 },
```

**实现**:
```rust
QueryMsg::GetNode { index } => {
    let node = NODES
        .may_load(deps.storage, index.to_be_bytes().to_vec())?
        .unwrap_or_default();
    to_json_binary::<Uint256>(&node)
}
```

### AMACI 合约

完全相同的实现，两个合约都支持这个查询方法。

## 使用方法

### TypeScript/JavaScript 调用

```typescript
// 查询叶子节点（用户状态）
const leafIndex = 31; // 第一个叶子节点
const leafValue = await maciContract.query({ 
  get_node: { index: leafIndex.toString() } 
});

// 查询父节点
const parentIndex = 6;
const parentValue = await maciContract.query({ 
  get_node: { index: parentIndex.toString() } 
});

// 查询根节点
const rootValue = await maciContract.query({ 
  get_node: { index: '0' } 
});
```

### CosmWasm 智能查询

```json
{
  "get_node": {
    "index": "31"
  }
}
```

返回：
```json
"12345678901234567890123456789012345678901234567890123456789012345"
```

## 五叉树节点索引结构

### 索引计算

对于深度为 `d` 的五叉树：

```
总节点数 = (5^(d+1) - 1) / 4
第一个叶子索引 = (5^d - 1) / 4
叶子数量 = 5^d
```

### 示例：深度 = 2 的树

```
总节点数：31
第一个叶子索引：6
叶子数量：25 (索引 6-30)

树结构：
           [0] Root
          /  |  |  \  \
        [1][2][3][4][5]  ← 第一层父节点
        / |\ ...
     [6][7][8]... [30]   ← 叶子节点（深度2）
```

### 节点层级关系

```typescript
// 计算父节点索引
function getParentIndex(childIndex: number): number {
  return Math.floor((childIndex - 1) / 5);
}

// 计算子节点索引
function getChildIndices(parentIndex: number): number[] {
  const firstChild = parentIndex * 5 + 1;
  return [
    firstChild,
    firstChild + 1,
    firstChild + 2,
    firstChild + 3,
    firstChild + 4
  ];
}

// 示例
getParentIndex(31) // → 6 (叶子31的父节点是6)
getChildIndices(1) // → [6, 7, 8, 9, 10] (节点1的5个子节点)
```

## 测试场景

### 1. 验证叶子节点（用户状态）

测试每个用户的状态叶子是否正确存储：

```typescript
const leafIdx0 = operator.stateTree!.LEAVES_IDX_0;

for (let i = 0; i < numUsers; i++) {
  const nodeIndex = leafIdx0 + i;
  
  // 从合约查询
  const contractNode = await maciContract.query({ 
    get_node: { index: nodeIndex.toString() } 
  });
  
  // 从 SDK 获取
  const sdkNode = operator.stateTree!['nodes'][nodeIndex];
  
  // 验证一致性
  expect(contractNode).to.equal(sdkNode.toString());
}
```

### 2. 验证父节点（哈希值）

验证树的中间层节点是否正确计算：

```typescript
// 第一层父节点
const parentIdx = Math.floor((leafIdx0 - 1) / 5);

const contractParent = await maciContract.query({ 
  get_node: { index: parentIdx.toString() } 
});

const sdkParent = operator.stateTree!['nodes'][parentIdx];

expect(contractParent).to.equal(sdkParent.toString());
```

### 3. 验证根节点

根节点是整个树的顶点：

```typescript
const contractRoot = await maciContract.query({ 
  get_node: { index: '0' } 
});

const sdkRoot = operator.stateTree!.root.toString();
// 或者
const sdkRootFromNodes = operator.stateTree!['nodes'][0].toString();

expect(contractRoot).to.equal(sdkRoot);
```

### 4. 验证不存在的节点

如果查询的节点还未初始化，会返回 `"0"`：

```typescript
// 查询一个超出范围的索引
const emptyNode = await maciContract.query({ 
  get_node: { index: '999999' } 
});

expect(emptyNode).to.equal('0');
```

## MACI vs AMACI 行为差异

### MACI（增量更新）

在用户注册阶段，MACI 使用增量更新策略：

```typescript
// 注册5个用户后
for (let i = 0; i < 5; i++) {
  await maciContract.signUp(user[i]);
}

// ❓ 父节点可能还未更新
const parentNode = await maciContract.query({ 
  get_node: { index: parentIdx.toString() } 
});
// parentNode 可能与 SDK 计算的不同

// ✓ start_process_period 后，所有节点都会更新
await maciContract.startProcessPeriod();

const updatedParentNode = await maciContract.query({ 
  get_node: { index: parentIdx.toString() } 
});
// 现在 updatedParentNode 与 SDK 一致
```

**关键点**：
- 注册时：只有特定节点（索引是5的倍数）会向上传播更新
- Start Process 后：执行完整更新，所有节点都同步

### AMACI（完整更新）

AMACI 每次操作都执行完整更新：

```typescript
// 每次注册后，所有节点都立即更新
await amaciContract.signUp(user[0]);

const leafNode = await amaciContract.query({ 
  get_node: { index: leafIdx.toString() } 
});

const parentNode = await amaciContract.query({ 
  get_node: { index: parentIdx.toString() } 
});

const rootNode = await amaciContract.query({ 
  get_node: { index: '0' } 
});

// ✓ 所有节点都与 SDK 一致
```

**关键点**：
- 任何时候查询都能获得最新值
- 适合需要实时状态的场景
- Gas 成本相对较高

## 实际应用

### 1. 调试状态树问题

当合约状态根与预期不符时：

```typescript
async function debugTree(contract: any, sdk: any, depth: number) {
  const leafIdx0 = (5 ** depth - 1) / 4;
  
  console.log('=== Tree Debug Report ===\n');
  
  // 检查根
  const contractRoot = await contract.query({ get_node: { index: '0' } });
  const sdkRoot = sdk['nodes'][0].toString();
  console.log(`Root Match: ${contractRoot === sdkRoot ? '✓' : '✗'}`);
  console.log(`  Contract: ${contractRoot}`);
  console.log(`  SDK:      ${sdkRoot}\n`);
  
  // 检查第一层父节点
  for (let i = 1; i <= 5; i++) {
    const contractNode = await contract.query({ get_node: { index: i.toString() } });
    const sdkNode = sdk['nodes'][i].toString();
    const match = contractNode === sdkNode ? '✓' : '✗';
    console.log(`Node ${i}: ${match} (Contract: ${contractNode.substring(0, 20)}...)`);
  }
  
  // 检查叶子节点
  console.log(`\nLeaf Nodes (starting at ${leafIdx0}):`);
  for (let i = 0; i < 5; i++) {
    const idx = leafIdx0 + i;
    const contractNode = await contract.query({ get_node: { index: idx.toString() } });
    const sdkNode = sdk['nodes'][idx].toString();
    const match = contractNode === sdkNode ? '✓' : '✗';
    console.log(`Leaf ${i} (${idx}): ${match}`);
  }
}
```

### 2. 追踪节点更新路径

验证某个叶子节点的更新是如何向上传播的：

```typescript
async function traceUpdatePath(contract: any, sdk: any, leafIndex: number) {
  const path: number[] = [];
  let current = leafIndex;
  
  console.log('=== Update Path Trace ===\n');
  
  while (current >= 0) {
    path.push(current);
    
    const contractNode = await contract.query({ 
      get_node: { index: current.toString() } 
    });
    const sdkNode = sdk['nodes'][current].toString();
    const match = contractNode === sdkNode ? '✓' : '✗';
    
    console.log(`[${current}] ${match}`);
    console.log(`  Contract: ${contractNode.substring(0, 40)}...`);
    console.log(`  SDK:      ${sdkNode.substring(0, 40)}...`);
    
    if (current === 0) break;
    current = Math.floor((current - 1) / 5);
  }
  
  console.log(`\nPath: ${path.join(' → ')}`);
}
```

### 3. 性能分析

比较不同更新策略的节点修改情况：

```typescript
async function analyzeUpdatePattern(contract: any, numUsers: number) {
  const leafIdx0 = 6; // 深度2的树
  const modifiedNodes: Set<string> = new Set();
  
  for (let i = 0; i < numUsers; i++) {
    const leafIdx = leafIdx0 + i;
    let current = leafIdx;
    
    // 追踪这次注册修改了哪些节点
    const thisUpdate: number[] = [];
    while (current >= 0) {
      modifiedNodes.add(current.toString());
      thisUpdate.push(current);
      
      // MACI 增量更新的条件
      if (current % 5 !== 0) break;
      
      if (current === 0) break;
      current = Math.floor((current - 1) / 5);
    }
    
    console.log(`User ${i + 1}: Modified ${thisUpdate.length} nodes [${thisUpdate.join(', ')}]`);
  }
  
  console.log(`\nTotal modified nodes: ${modifiedNodes.size}`);
}
```

## 与其他查询方法的配合

### GetStateTreeRoot + GetNode

```typescript
// 1. 获取根节点哈希（快速）
const rootHash = await contract.query({ get_state_tree_root: {} });

// 2. 验证根节点（详细）
const rootNode = await contract.query({ get_node: { index: '0' } });

expect(rootHash).to.equal(rootNode); // 应该相等
```

### GetNumSignUp + GetNode

```typescript
// 1. 获取注册用户数
const numSignUps = await contract.query({ get_num_sign_up: {} });

// 2. 查询每个用户的叶子节点
const leafIdx0 = 6; // 根据树深度计算
for (let i = 0; i < parseInt(numSignUps); i++) {
  const leafNode = await contract.query({ 
    get_node: { index: (leafIdx0 + i).toString() } 
  });
  console.log(`User ${i}: ${leafNode}`);
}
```

## 最佳实践

### 1. 批量查询优化

```typescript
// ❌ 不好：逐个查询
for (let i = 0; i < 100; i++) {
  const node = await contract.query({ get_node: { index: i.toString() } });
  // 处理节点...
}

// ✓ 好：批量并发查询
const promises = [];
for (let i = 0; i < 100; i++) {
  promises.push(
    contract.query({ get_node: { index: i.toString() } })
  );
}
const nodes = await Promise.all(promises);
```

### 2. 缓存常用节点

```typescript
class TreeNodeCache {
  private cache: Map<string, string> = new Map();
  
  async getNode(contract: any, index: number): Promise<string> {
    const key = index.toString();
    
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }
    
    const node = await contract.query({ get_node: { index: key } });
    this.cache.set(key, node);
    return node;
  }
  
  invalidate(index: number) {
    this.cache.delete(index.toString());
  }
}
```

### 3. 渐进式验证

```typescript
// 先验证根，再深入到子树
const root = await contract.query({ get_node: { index: '0' } });
if (root !== expectedRoot) {
  // 根不匹配，检查第一层
  for (let i = 1; i <= 5; i++) {
    const node = await contract.query({ get_node: { index: i.toString() } });
    if (node !== expected[i]) {
      console.log(`Mismatch at node ${i}`);
      // 继续深入这个子树...
    }
  }
}
```

## 故障排除

### 问题：查询返回 "0"

**原因**：
- 节点索引超出范围
- 节点还未初始化
- 节点在增量更新中被跳过

**解决**：
```typescript
const leafIdx0 = operator.stateTree!.LEAVES_IDX_0;
const maxIndex = operator.stateTree!.NODES_COUNT - 1;

if (queryIndex >= 0 && queryIndex <= maxIndex) {
  // 索引有效
  const node = await contract.query({ get_node: { index: queryIndex.toString() } });
  if (node === '0') {
    console.log('Node not initialized yet');
  }
}
```

### 问题：合约节点与 SDK 不匹配

**排查步骤**：

1. 确认是否执行了完整更新（MACI）：
```typescript
const period = await contract.query({ get_period: {} });
if (period.status !== 'Processing') {
  console.log('Warning: MACI tree may not be fully updated yet');
}
```

2. 检查叶子节点是否正确：
```typescript
// 叶子节点应该始终匹配（即使增量更新）
const leafNode = await contract.query({ get_node: { index: leafIdx.toString() } });
expect(leafNode).to.equal(sdkLeafNode);
```

3. 验证 SDK 树的初始化：
```typescript
// 确保 SDK 使用正确的零值
const isAmaci = true; // 或 false
operator.initMaci({ 
  /* ... */
  isAmaci 
});
```

## 总结

`GetNode` 查询方法提供了：

✅ **细粒度控制**：查询树中任意节点  
✅ **调试能力**：追踪和验证状态更新  
✅ **灵活性**：配合其他方法实现复杂验证  
✅ **透明性**：直接查看合约内部树结构  

配合 `GetStateTreeRoot`，你可以全面验证和调试 MACI/AMACI 的状态树逻辑。

