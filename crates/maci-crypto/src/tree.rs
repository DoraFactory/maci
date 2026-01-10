use crate::error::CryptoError;
use crate::hashing::poseidon;
use num_bigint::BigUint;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use zk_kit_imt::imt::{IMTNode, IMT};

// Use full path for Result to avoid conflict with serde::Result
type CryptoResult<T> = crate::error::Result<T>;

/// Convert BigUint to IMTNode (String)
pub fn biguint_to_node(value: &BigUint) -> IMTNode {
    value.to_string()
}

/// Convert IMTNode (String) to BigUint
pub fn node_to_biguint(node: &IMTNode) -> BigUint {
    node.parse::<BigUint>()
        .unwrap_or_else(|_| BigUint::from(0u32))
}

/// Hash function adapter for zkkit IMT
/// Converts Vec<IMTNode> to BigUint, hashes with Poseidon, and converts result back to IMTNode
fn hash_function(inputs: Vec<IMTNode>) -> IMTNode {
    // Convert IMTNode inputs to BigUint
    let big_uints: Vec<BigUint> = inputs.iter().map(|node| node_to_biguint(node)).collect();

    // Hash using Poseidon
    let hash_result = poseidon(&big_uints);

    // Convert result back to IMTNode
    biguint_to_node(&hash_result)
}

/// An N-ary Merkle Tree implementation using zkkit IMT
pub struct Tree {
    /// Depth of the tree
    pub depth: usize,
    /// Height of the tree (depth + 1)
    pub height: usize,
    /// Degree (arity) of the tree
    pub degree: usize,
    /// Total number of leaves
    pub leaves_count: usize,
    /// Index of the first leaf in the nodes array
    pub leaves_idx_0: usize,
    /// Total number of nodes
    pub nodes_count: usize,
    /// Zero value for the tree
    zero: IMTNode,
    /// Cached root value
    cached_root: RefCell<IMTNode>,
    /// Internal zkkit IMT instance (non-serializable)
    imt: RefCell<Option<IMT>>,
}

// Manual Serialize/Deserialize implementation
impl Serialize for Tree {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("Tree", 8)?;
        state.serialize_field("depth", &self.depth)?;
        state.serialize_field("height", &self.height)?;
        state.serialize_field("degree", &self.degree)?;
        state.serialize_field("leaves_count", &self.leaves_count)?;
        state.serialize_field("leaves_idx_0", &self.leaves_idx_0)?;
        state.serialize_field("nodes_count", &self.nodes_count)?;
        state.serialize_field("zero", &self.zero)?;
        state.serialize_field("leaves", &self.leaves())?;
        state.end()
    }
}

impl<'de> Deserialize<'de> for Tree {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[allow(dead_code)] // These fields are serialized for compatibility but recalculated during deserialization
        struct TreeData {
            depth: usize,
            height: usize, // Recalculated as depth + 1
            degree: usize,
            leaves_count: usize, // Recalculated as degree^depth
            leaves_idx_0: usize, // Recalculated from formula
            nodes_count: usize,  // Recalculated from formula
            zero: IMTNode,
            leaves: Vec<IMTNode>,
        }

        let data = TreeData::deserialize(deserializer)?;
        let mut tree = Tree::new(data.degree, data.depth, data.zero);
        tree.init_leaves(&data.leaves);
        Ok(tree)
    }
}

impl Tree {
    /// Create a new tree with the given parameters
    pub fn new(degree: usize, depth: usize, zero: IMTNode) -> Self {
        let height = depth + 1;
        let leaves_count = degree.pow(depth as u32);
        let leaves_idx_0 = (degree.pow(depth as u32) - 1) / (degree - 1);
        let nodes_count = (degree.pow((depth + 1) as u32) - 1) / (degree - 1);

        // Create zkkit IMT instance
        let imt = IMT::new(
            hash_function,
            depth,
            zero.clone(),
            degree,
            vec![], // Start with empty leaves
        )
        .ok();

        let cached_root = RefCell::new(zero.clone());

        Self {
            depth,
            height,
            degree,
            leaves_count,
            leaves_idx_0,
            nodes_count,
            zero,
            cached_root,
            imt: RefCell::new(imt),
        }
    }

    /// Update cached root from IMT (internal helper)
    fn sync_root(&self) {
        // Borrow IMT mutably in a limited scope
        let root_node = {
            let mut imt_borrow = self.imt.borrow_mut();
            if let Some(ref mut imt) = *imt_borrow {
                imt.root()
            } else {
                None
            }
        };

        // Update cached root outside of IMT borrow
        if let Some(root_node) = root_node {
            *self.cached_root.borrow_mut() = root_node;
        }
    }

    /// Get the root of the tree
    pub fn root(&self) -> &IMTNode {
        self.sync_root();
        // Safety: We're returning a reference to RefCell content
        // This is safe because we're only reading
        unsafe { &*self.cached_root.as_ptr() }
    }

    /// Initialize leaves with the given values
    pub fn init_leaves(&mut self, leaves: &[IMTNode]) {
        if leaves.is_empty() {
            return;
        }

        // Create new IMT with initial leaves
        let new_imt = IMT::new(
            hash_function,
            self.depth,
            self.zero.clone(),
            self.degree,
            leaves.to_vec(),
        )
        .ok();

        *self.imt.borrow_mut() = new_imt;
        self.sync_root();
    }

    /// Get a leaf by index
    pub fn leaf(&self, leaf_idx: usize) -> CryptoResult<IMTNode> {
        if leaf_idx >= self.leaves_count {
            return Err(CryptoError::LeafIndexOutOfRange { index: leaf_idx });
        }

        // Get all leaves and return the requested one
        let leaves = self.leaves();
        Ok(leaves[leaf_idx].clone())
    }

    /// Get all leaves
    pub fn leaves(&self) -> Vec<IMTNode> {
        if let Some(ref imt) = *self.imt.borrow() {
            imt.leaves().to_vec()
        } else {
            vec![self.zero.clone(); self.leaves_count]
        }
    }

    /// Update a leaf at the given index
    pub fn update_leaf(&mut self, leaf_idx: usize, leaf: IMTNode) -> CryptoResult<()> {
        if leaf_idx >= self.leaves_count {
            return Err(CryptoError::LeafIndexOutOfRange { index: leaf_idx });
        }

        {
            let mut imt_borrow = self.imt.borrow_mut();
            if let Some(ref mut imt) = *imt_borrow {
                imt.update(leaf_idx, leaf)
                    .map_err(|e| CryptoError::LeafUpdateFailed(e.to_string()))?;
            } else {
                return Err(CryptoError::IMTNotInitialized);
            }
        }

        // Update root after releasing the borrow
        self.sync_root();
        Ok(())
    }

    /// Get path indices for a leaf
    pub fn path_idx_of(&self, leaf_idx: usize) -> CryptoResult<Vec<IMTNode>> {
        if leaf_idx >= self.leaves_count {
            return Err(CryptoError::LeafIndexOutOfRange { index: leaf_idx });
        }

        // Calculate path indices manually
        let mut indices = Vec::new();
        let mut current_idx = leaf_idx;

        for _ in 0..self.depth {
            let position = current_idx % self.degree;
            indices.push(position.to_string());
            current_idx /= self.degree;
        }

        Ok(indices)
    }

    /// Get path elements (siblings) for a leaf
    pub fn path_element_of(&self, leaf_idx: usize) -> CryptoResult<Vec<Vec<IMTNode>>> {
        if leaf_idx >= self.leaves_count {
            return Err(CryptoError::LeafIndexOutOfRange { index: leaf_idx });
        }

        if let Some(ref imt) = *self.imt.borrow() {
            // Get all nodes from IMT
            let all_nodes = imt.nodes();
            let zeroes = imt.zeroes();

            let mut siblings = Vec::new();
            let mut current_idx = leaf_idx;

            for level in 0..self.depth {
                let position = current_idx % self.degree;
                let level_start_idx = current_idx - position;
                let level_end_idx = level_start_idx + self.degree;

                let mut level_siblings = Vec::new();

                for i in level_start_idx..level_end_idx {
                    if i != current_idx {
                        let node = all_nodes[level]
                            .get(i)
                            .cloned()
                            .unwrap_or_else(|| zeroes[level].clone());

                        level_siblings.push(node);
                    }
                }

                siblings.push(level_siblings);
                current_idx /= self.degree;
            }

            Ok(siblings)
        } else {
            Err(CryptoError::IMTNotInitialized)
        }
    }

    /// Create a subtree with only the first `length` leaves
    pub fn sub_tree(&self, length: usize) -> Self {
        let mut sub_tree = Tree::new(self.degree, self.depth, self.zero.clone());

        if length > 0 {
            let leaves = self.leaves();
            let sub_leaves: Vec<IMTNode> = leaves.into_iter().take(length).collect();
            sub_tree.init_leaves(&sub_leaves);
        }

        sub_tree
    }

    /// Compute zero hashes for a tree with given parameters (static utility)
    pub fn compute_zero_hashes(degree: usize, max_depth: usize, zero: IMTNode) -> Vec<IMTNode> {
        let mut zero_hashes = vec![zero.clone(); max_depth + 1];
        zero_hashes[0] = zero;

        for i in 1..=max_depth {
            let children = vec![zero_hashes[i - 1].clone(); degree];
            zero_hashes[i] = hash_function(children);
        }

        zero_hashes
    }

    /// Extend a tree root from a smaller depth to a larger depth
    pub fn extend_tree_root(
        small_root: &IMTNode,
        from_depth: usize,
        to_depth: usize,
        zero_hashes: &[IMTNode],
        degree: usize,
    ) -> CryptoResult<IMTNode> {
        if to_depth <= from_depth {
            return Err(CryptoError::InvalidTreeDepth);
        }
        if zero_hashes.len() <= to_depth {
            return Err(CryptoError::ZeroHashesTooShort);
        }

        let mut current_root = small_root.clone();

        for level in from_depth..to_depth {
            let mut siblings = vec![current_root.clone()];
            for _ in 1..degree {
                siblings.push(zero_hashes[level].clone());
            }
            current_root = hash_function(siblings);
        }

        Ok(current_root)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tree_creation() {
        let tree = Tree::new(5, 3, "0".to_string());
        assert_eq!(tree.depth, 3);
        assert_eq!(tree.degree, 5);
        assert_eq!(tree.leaves_count, 125); // 5^3
    }

    #[test]
    fn test_tree_init_leaves() {
        let mut tree = Tree::new(5, 2, "0".to_string());
        let leaves = vec!["1".to_string(), "2".to_string(), "3".to_string()];
        tree.init_leaves(&leaves);

        let all_leaves = tree.leaves();
        assert_eq!(all_leaves[0], "1".to_string());
        assert_eq!(all_leaves[1], "2".to_string());
        assert_eq!(all_leaves[2], "3".to_string());
    }

    #[test]
    fn test_tree_update_leaf() {
        let mut tree = Tree::new(5, 2, "0".to_string());
        let leaves = vec!["1".to_string(), "2".to_string()];
        tree.init_leaves(&leaves);

        let old_root = tree.root().clone();
        tree.update_leaf(0, "100".to_string()).unwrap();
        let new_root = tree.root().clone();

        assert_ne!(old_root, new_root);

        let all_leaves = tree.leaves();
        assert_eq!(all_leaves[0], "100".to_string());
    }

    #[test]
    fn test_tree_path_elements() {
        let mut tree = Tree::new(5, 2, "0".to_string());
        let leaves = vec!["1".to_string(), "2".to_string()];
        tree.init_leaves(&leaves);

        let path = tree.path_element_of(0);
        assert!(path.is_ok());
        let path_elements = path.unwrap();
        assert_eq!(path_elements.len(), tree.depth);
    }

    #[test]
    fn test_tree_sub_tree() {
        let mut tree = Tree::new(5, 2, "0".to_string());
        let leaves = vec!["1".to_string(), "2".to_string(), "3".to_string()];
        tree.init_leaves(&leaves);

        let sub = tree.sub_tree(2);
        let sub_leaves = sub.leaves();
        assert_eq!(sub_leaves[0], "1".to_string());
        assert_eq!(sub_leaves[1], "2".to_string());
    }

    #[test]
    fn test_compute_zero_hashes() {
        let zeros = Tree::compute_zero_hashes(5, 3, "0".to_string());
        assert_eq!(zeros.len(), 4);
        assert_eq!(zeros[0], "0".to_string());
    }

    #[test]
    fn test_extend_tree_root() {
        let zero_hashes = Tree::compute_zero_hashes(5, 5, "0".to_string());
        let small_root = "12345".to_string();

        let result = Tree::extend_tree_root(&small_root, 2, 4, &zero_hashes, 5);
        assert!(result.is_ok());
    }

    #[test]
    fn test_path_idx_of() {
        let mut tree = Tree::new(5, 2, "0".to_string());
        let leaves = vec!["1".to_string(), "2".to_string()];
        tree.init_leaves(&leaves);

        let path_idx = tree.path_idx_of(0);
        assert!(path_idx.is_ok());
        assert_eq!(path_idx.unwrap().len(), tree.depth);
    }

    #[test]
    fn test_leaves() {
        let mut tree = Tree::new(5, 2, "0".to_string());
        let input_leaves = vec!["1".to_string(), "2".to_string()];
        tree.init_leaves(&input_leaves);

        let leaves = tree.leaves();
        assert_eq!(leaves[0], "1".to_string());
        assert_eq!(leaves[1], "2".to_string());
    }

    #[test]
    fn test_biguint_conversion() {
        let value = BigUint::from(12345u32);
        let node = biguint_to_node(&value);
        assert_eq!(node, "12345");

        let converted_back = node_to_biguint(&node);
        assert_eq!(converted_back, value);
    }

    #[test]
    fn test_direct_string_usage() {
        // Test creating tree with string directly
        let mut tree = Tree::new(2, 2, "0".to_string());
        assert_eq!(tree.depth, 2);
        assert_eq!(tree.degree, 2);

        // Test initializing with string leaves
        let leaves = vec!["100".to_string(), "200".to_string(), "300".to_string()];
        tree.init_leaves(&leaves);

        let all_leaves = tree.leaves();
        assert_eq!(all_leaves[0], "100");
        assert_eq!(all_leaves[1], "200");
        assert_eq!(all_leaves[2], "300");

        // Test updating with string
        let old_root = tree.root().clone();
        tree.update_leaf(1, "999".to_string()).unwrap();
        let new_root = tree.root().clone();
        assert_ne!(old_root, new_root);

        // Verify update
        let updated_leaves = tree.leaves();
        assert_eq!(updated_leaves[1], "999");
    }

    #[test]
    fn test_string_merkle_proof() {
        let mut tree = Tree::new(2, 2, "0".to_string());
        let leaves = vec!["10".to_string(), "20".to_string(), "30".to_string()];
        tree.init_leaves(&leaves);

        // Get proof for leaf 1
        let proof_elements = tree.path_element_of(1).unwrap();
        let proof_indices = tree.path_idx_of(1).unwrap();

        assert_eq!(proof_elements.len(), tree.depth);
        assert_eq!(proof_indices.len(), tree.depth);

        // Verify indices are strings
        for idx in &proof_indices {
            assert!(idx.parse::<usize>().is_ok());
        }
    }
}
