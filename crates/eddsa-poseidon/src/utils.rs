use crate::types::HashingAlgorithm;
use blake::Blake;
use blake2::{Blake2b512, Digest};

/// Prunes a buffer to meet the specific requirements for using it as a private key.
/// Direct translation of the TypeScript pruneBuffer() function.
///
/// ```javascript
/// buff[0] &= 0xf8   // Clear lowest 3 bits
/// buff[31] &= 0x7f  // Clear highest bit
/// buff[31] |= 0x40  // Set second-highest bit
/// ```
pub fn prune_buffer(buff: &mut [u8]) {
    if buff.len() >= 32 {
        buff[0] &= 0xf8;
        buff[31] &= 0x7f;
        buff[31] |= 0x40;
    }
}

/// Hashes input data using the specified algorithm.
/// Returns 64 bytes of hash output.
pub fn hash_input(data: &[u8], algorithm: HashingAlgorithm) -> Vec<u8> {
    match algorithm {
        HashingAlgorithm::Blake512 => {
            let mut hasher = Blake::new(512).expect("Failed to create Blake-512 hasher");
            hasher.update(data);
            let mut output = vec![0u8; 64];
            hasher.finalise(&mut output);
            output
        }
        HashingAlgorithm::Blake2b => {
            let mut hasher = Blake2b512::new();
            hasher.update(data);
            hasher.finalize().to_vec()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prune_buffer() {
        let mut buff = [0xFFu8; 32];
        prune_buffer(&mut buff);

        assert_eq!(buff[0] & 0x07, 0x00); // Lowest 3 bits cleared
        assert_eq!(buff[31] & 0x80, 0x00); // Highest bit cleared
        assert_eq!(buff[31] & 0x40, 0x40); // Second-highest bit set
    }

    #[test]
    fn test_hash_input_blake512() {
        let data = b"test";
        let hash = hash_input(data, HashingAlgorithm::Blake512);
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn test_hash_input_blake2b() {
        let data = b"test";
        let hash = hash_input(data, HashingAlgorithm::Blake2b);
        assert_eq!(hash.len(), 64);
    }
}
