# Merkle Tree Root Optimization

## Problem Description

Currently, pre-add-new-key uses a tree depth of `state tree depth + 2` to generate the Tree, but only `5^state_tree_depth` leaves contain actual data, while the rest are all zeros.

## Optimization Solution: Zero Node Hash Precomputation

### 1. Basic Concept

For a 5-ary Merkle Tree (degree = 5):

```
Leaf layer (depth=0):  [Data1] [Data2] ... [DataN] [0] [0] ... [0]
                        ←—— 5^d leaves ——→   ←—— All zeros ——→

Layer 1:               Merge every 5 leaves → parent node
Layer 2:               Merge every 5 layer-1 nodes → parent node
...
Root layer:            Final Root
```

### 2. Zero Node Hash Chain

Precompute the root hash of "all-zero subtrees" at each layer:

```
zeroHashes[0] = 0n                                    // Zero leaf
zeroHashes[1] = hash(0, 0, 0, 0, 0)                  // Parent of 5 zero leaves
zeroHashes[2] = hash(H₁, H₁, H₁, H₁, H₁)            // Parent of 5 layer-1 zero nodes
zeroHashes[3] = hash(H₂, H₂, H₂, H₂, H₂)            // Parent of 5 layer-2 zero nodes
...
zeroHashes[k] = Root hash of "all-zero subtree" at layer k
```

### 3. Optimization Process Illustrated

#### Scenario: Extending from depth=3 to depth=5

```
Original (depth=3, capacity 125 leaves):

                    Root₃
                 /   |   \
               /     |     \
           Layer2  Layer2  Layer2
            / \      / \      / \
           /   \    /   \    /   \
     Layer1 ... Total 25 Layer1 nodes
       /|\
      / | \
   125 leaves [All contain data]


Target (depth=5, capacity 3125 leaves):

                         Root₅
                    /  /  |  \  \
                  /   /   |   \   \
                /    /    |    \    \
              N₁   N₂   N₃   N₄   N₅    ← 5 subtrees at layer 4
             ↓     ↓     ↓     ↓     ↓
          Root₃  Zero₃ Zero₃ Zero₃ Zero₃
           
N₁ = Subtree containing 125 real data leaves (the original Root₃)
N₂-N₅ = 4 "all-zero subtrees" of depth 3, all equal to zeroHashes[3]
```

#### Calculation Steps

**Step 1**: Compute Root₃ at depth=3 (existing method)
```
Root₃ = buildTree(125 real data leaves, depth=3)
```

**Step 2**: Compute layer 4 nodes
```
Layer 4 has 5 nodes:
- nodes[0] = Root₃  (root of real data subtree)
- nodes[1] = zeroHashes[3]  (zero subtree of depth 3)
- nodes[2] = zeroHashes[3]
- nodes[3] = zeroHashes[3]
- nodes[4] = zeroHashes[3]
```

**Step 3**: Compute Root₅
```
Root₅ = hash(nodes[0], nodes[1], nodes[2], nodes[3], nodes[4])
      = hash(Root₃, Zero₃, Zero₃, Zero₃, Zero₃)
```

### 4. General Formula

Extending from `depth=d` to `depth=d+k`:

```python
def extendTreeRoot(rootD: BigInt, originalDepth: int, targetDepth: int, 
                   zeroHashes: List[BigInt], degree: int = 5) -> BigInt:
    """
    rootD: Root hash at depth=d
    originalDepth: Original depth d
    targetDepth: Target depth d+k
    zeroHashes: Precomputed zero node hash array
    degree: Tree branching factor (5-ary tree)
    """
    currentRoot = rootD
    
    # Extend from layer d+1 to layer d+k
    for level in range(originalDepth + 1, targetDepth + 1):
        # Nodes at current layer: [currentRoot, Zero, Zero, Zero, Zero]
        # Where Zero = zeroHashes[level - 1]
        siblings = [zeroHashes[level - 1]] * (degree - 1)
        currentRoot = hash([currentRoot] + siblings)
    
    return currentRoot
```

### 5. Performance Improvement

#### Time Complexity Comparison

**Original Method**:
- Process `5^(d+2)` leaf nodes
- Compute `(5^(d+2) - 1) / 4` internal node hashes

**Optimized Method**:
- Process `5^d` real leaf nodes
- Compute `(5^d - 1) / 4` internal node hashes
- Additional 2 hash extensions (d→d+1, d+1→d+2)

**Speedup**: Approximately `5² = 25` times

#### Example (state_tree_depth = 3):

| Method | Leaf Nodes | Internal Nodes | Total Hashes |
|--------|-----------|---------------|--------------|
| Original (depth=5) | 3,125 | ~781 | ~781 |
| Optimized (depth=3→5) | 125 | ~31 | ~33 |
| **Speedup** | **25x** | **24x** | **~24x** |

### 6. Code Implementation

```typescript
// 1. Precompute zero node hashes
function computeZeroHashes(degree: number, maxDepth: number, zero: bigint): bigint[] {
  const zeroHashes: bigint[] = [zero];
  
  for (let i = 1; i <= maxDepth; i++) {
    const siblings = new Array(degree).fill(zeroHashes[i - 1]);
    zeroHashes[i] = poseidon(siblings);
  }
  
  return zeroHashes;
}

// 2. Extend small tree root to large tree root
function extendTreeRoot(
  smallRoot: bigint,
  fromDepth: number,
  toDepth: number,
  zeroHashes: bigint[],
  degree: number = 5
): bigint {
  let currentRoot = smallRoot;
  
  for (let level = fromDepth; level < toDepth; level++) {
    // Current root is the first child, remaining children are zero subtrees
    const siblings = [currentRoot];
    for (let i = 1; i < degree; i++) {
      siblings.push(zeroHashes[level]);
    }
    currentRoot = poseidon(siblings);
  }
  
  return currentRoot;
}
```

## Summary

Through precomputing the zero node hash chain, we can:
1. Build only the small tree containing real data (depth=d)
2. Extend to the large tree (depth=d+k) with O(k) hash operations
3. Achieve approximately **25x performance improvement** compared to rebuilding the full tree (for k=2)

This is a classic Sparse Merkle Tree optimization technique!

