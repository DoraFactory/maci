import { poseidon } from './hashing';

export class Tree {
  public readonly DEPTH: number;
  public readonly HEIGHT: number;
  public readonly DEGREE: number;
  public readonly LEAVES_COUNT: number;
  public readonly LEAVES_IDX_0: number;
  public readonly NODES_COUNT: number;

  protected nodes: bigint[] = [];
  protected zeros: bigint[] = [];

  constructor(degree: number, depth: number, zero: bigint) {
    this.DEPTH = depth;
    this.HEIGHT = depth + 1;
    this.DEGREE = degree;

    this.LEAVES_COUNT = degree ** depth;
    this.LEAVES_IDX_0 = (degree ** depth - 1) / (degree - 1);
    this.NODES_COUNT = (degree ** (depth + 1) - 1) / (degree - 1);

    this.initZero(zero);
    this.initNodes();
  }

  get root() {
    return this.nodes[0];
  }

  initZero(zero: bigint) {
    const zeros = new Array(this.HEIGHT);
    zeros[0] = zero;
    for (let i = 1; i < zeros.length; i++) {
      const children = new Array(this.DEGREE).fill(zeros[i - 1]);
      zeros[i] = poseidon(children);
    }
    this.zeros = zeros;
  }

  initNodes() {
    const DEGREE = this.DEGREE;

    const nodes = new Array(this.NODES_COUNT);

    for (let d = this.DEPTH; d >= 0; d--) {
      const size = DEGREE ** d;
      const idx0 = (DEGREE ** d - 1) / (DEGREE - 1);
      const zero = this.zeros[this.DEPTH - d];
      for (let i = 0; i < size; i++) {
        nodes[idx0 + i] = zero;
      }
    }

    this.nodes = nodes;
  }

  initLeaves(leaves: bigint[]) {
    const DEGREE = this.DEGREE;
    for (let i = 0; i < leaves.length; i++) {
      if (i >= this.LEAVES_COUNT) {
        console.error('OVERFLOW');
        break;
      }
      this.nodes[this.LEAVES_IDX_0 + i] = BigInt(leaves[i]);
    }

    for (let d = this.DEPTH - 1; d >= 0; d--) {
      const size = DEGREE ** d;
      const idx0 = (DEGREE ** d - 1) / (DEGREE - 1);
      for (let i = 0; i < size; i++) {
        const start = (idx0 + i) * DEGREE + 1;
        const children = this.nodes.slice(start, start + DEGREE);
        this.nodes[idx0 + i] = poseidon(children);
      }
    }
  }

  leaf(leafIdx: number) {
    if (leafIdx > this.LEAVES_COUNT || leafIdx < 0) {
      throw new Error('wrong leaf index');
    }
    const nodeIdx = this.LEAVES_IDX_0 + leafIdx;
    return this.nodes[nodeIdx];
  }

  leaves() {
    return this.nodes.slice(this.LEAVES_IDX_0);
  }

  updateLeaf(leafIdx: number, leaf: bigint) {
    if (leafIdx > this.LEAVES_COUNT || leafIdx < 0) {
      throw new Error('wrong leaf index');
    }
    const nodeIdx = this.LEAVES_IDX_0 + leafIdx;
    this.nodes[nodeIdx] = leaf;

    this._update(nodeIdx);
  }

  pathIdxOf(leafIdx: number) {
    if (leafIdx > this.LEAVES_COUNT || leafIdx < 0) {
      throw new Error('wrong leaf index');
    }
    let idx = this.LEAVES_IDX_0 + leafIdx;
    const pathIdx: bigint[] = [];

    for (let i = 0; i < this.DEPTH; i++) {
      const parentIdx = Math.floor((idx - 1) / this.DEGREE);
      const childrenIdx0 = parentIdx * this.DEGREE + 1;

      pathIdx.push(BigInt(idx - childrenIdx0));

      idx = parentIdx;
    }

    return pathIdx;
  }

  pathElementOf(leafIdx: number) {
    if (leafIdx > this.LEAVES_COUNT || leafIdx < 0) {
      throw new Error('wrong leaf index');
    }
    let idx = this.LEAVES_IDX_0 + leafIdx;
    const pathElement: bigint[][] = [];

    for (let h = 0; h < this.DEPTH; h++) {
      const parentIdx = Math.floor((idx - 1) / this.DEGREE);
      const childrenIdx0 = parentIdx * this.DEGREE + 1;

      const el: bigint[] = [];
      for (let i = childrenIdx0; i < childrenIdx0 + this.DEGREE; i++) {
        if (i === idx) continue;
        el.push(this.nodes[i]);
      }

      pathElement.push(el);

      idx = parentIdx;
    }

    return pathElement;
  }

  subTree(length: number) {
    const subTree = new Tree(this.DEGREE, this.DEPTH, this.zeros[0]);
    const nodes = [...this.nodes];

    const DEGREE = this.DEGREE;
    let tail = length;
    for (let d = this.DEPTH; d >= 0; d--) {
      const size = DEGREE ** d;
      const idx0 = (DEGREE ** d - 1) / (DEGREE - 1);
      const zero = this.zeros[this.DEPTH - d];
      for (let i = tail; i < size; i++) {
        nodes[idx0 + i] = zero;
      }
      tail = Math.ceil(tail / DEGREE);
    }

    subTree.nodes = nodes;
    subTree._update(this.LEAVES_IDX_0 + length - 1);

    return subTree;
  }

  protected _update(nodeIdx: number) {
    let idx = nodeIdx;
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / this.DEGREE);
      const childrenIdx0 = parentIdx * this.DEGREE + 1;
      this.nodes[parentIdx] = poseidon(this.nodes.slice(childrenIdx0, childrenIdx0 + 5));

      idx = parentIdx;
    }
  }

  /**
   * Compute zero hashes for a tree with given parameters
   * This is a static utility that can be used without creating a Tree instance
   *
   * @param degree - The branching factor of the tree
   * @param maxDepth - Maximum depth to compute zero hashes for
   * @param zero - The zero value at leaf level
   * @returns Array of zero hashes where zeroHashes[i] is the hash of a completely empty subtree of depth i
   */
  static computeZeroHashes(degree: number, maxDepth: number, zero: bigint): bigint[] {
    const zeroHashes = new Array(maxDepth + 1);
    zeroHashes[0] = zero;
    for (let i = 1; i <= maxDepth; i++) {
      const children = new Array(degree).fill(zeroHashes[i - 1]);
      zeroHashes[i] = poseidon(children);
    }
    return zeroHashes;
  }

  /**
   * Extend a tree root from a smaller depth to a larger depth
   * This is much more efficient than rebuilding the entire larger tree
   * when you know that all additional leaves are zero.
   *
   * Example: If you have a tree of depth 3 with 5^3=125 real leaves,
   * and you want to extend it to depth 5 (5^5=3125 capacity), where
   * the additional 3000 leaves are all zeros, this function computes
   * the new root in O(k) time instead of O(5^5).
   *
   * @param smallRoot - Root hash of the smaller tree (depth=fromDepth)
   * @param fromDepth - Original tree depth
   * @param toDepth - Target tree depth (must be > fromDepth)
   * @param zeroHashes - Precomputed zero hashes (from computeZeroHashes or Tree.zeros)
   * @param degree - Tree branching factor (default: 5)
   * @returns Root hash of the extended tree
   */
  static extendTreeRoot(
    smallRoot: bigint,
    fromDepth: number,
    toDepth: number,
    zeroHashes: bigint[],
    degree: number = 5
  ): bigint {
    if (toDepth <= fromDepth) {
      throw new Error('toDepth must be greater than fromDepth');
    }
    if (zeroHashes.length <= toDepth) {
      throw new Error('zeroHashes array is too short for target depth');
    }

    let currentRoot = smallRoot;

    // For each level we need to add
    for (let level = fromDepth; level < toDepth; level++) {
      // At this level, the current root represents a full subtree
      // All sibling subtrees are empty (zero)
      // Create array: [currentRoot, zero, zero, zero, ...]
      const siblings = [currentRoot];
      for (let i = 1; i < degree; i++) {
        siblings.push(zeroHashes[level]);
      }
      currentRoot = poseidon(siblings);
    }

    return currentRoot;
  }
}
