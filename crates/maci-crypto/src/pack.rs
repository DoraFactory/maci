use crate::constants::{UINT32, UINT96};
use num_bigint::BigUint;
use rand::Rng;
use serde::{Deserialize, Serialize};

/// A packed element containing message fields
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PackedElement {
    pub nonce: BigUint,
    pub state_idx: BigUint,
    pub vo_idx: BigUint,
    pub new_votes: BigUint,
    pub salt: Option<BigUint>,
}

/// Pack message fields into a single BigUint
/// Structure: nonce + (stateIdx << 32) + (voIdx << 64) + (newVotes << 96) + (salt << 192)
pub fn pack_element(
    nonce: &BigUint,
    state_idx: &BigUint,
    vo_idx: &BigUint,
    new_votes: &BigUint,
    salt: Option<&BigUint>,
) -> BigUint {
    let salt = if let Some(s) = salt {
        s.clone()
    } else {
        // Generate random 56-bit salt (7 bytes)
        let mut rng = rand::thread_rng();
        let mut bytes = [0u8; 7];
        rng.fill(&mut bytes);
        BigUint::from_bytes_be(&bytes)
    };

    // Pack: nonce + (stateIdx << 32) + (voIdx << 64) + (newVotes << 96) + (salt << 192)
    let packed = nonce
        + (state_idx << 32)
        + (vo_idx << 64)
        + (new_votes << 96)
        + (salt << 192);

    packed
}

/// Unpack a BigUint back into its component fields
pub fn unpack_element(packed: &BigUint) -> PackedElement {
    let nonce = packed % &*UINT32;
    let state_idx = (packed >> 32) % &*UINT32;
    let vo_idx = (packed >> 64) % &*UINT32;
    let new_votes = (packed >> 96) % &*UINT96;

    PackedElement {
        nonce,
        state_idx,
        vo_idx,
        new_votes,
        salt: None, // Salt is not recovered in the TS implementation
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pack_unpack_roundtrip() {
        let nonce = BigUint::from(123u32);
        let state_idx = BigUint::from(456u32);
        let vo_idx = BigUint::from(789u32);
        let new_votes = BigUint::from(1000u32);
        let salt = BigUint::from(999999u32);

        let packed = pack_element(&nonce, &state_idx, &vo_idx, &new_votes, Some(&salt));
        let unpacked = unpack_element(&packed);

        assert_eq!(unpacked.nonce, nonce);
        assert_eq!(unpacked.state_idx, state_idx);
        assert_eq!(unpacked.vo_idx, vo_idx);
        assert_eq!(unpacked.new_votes, new_votes);
    }

    #[test]
    fn test_pack_without_salt() {
        let nonce = BigUint::from(123u32);
        let state_idx = BigUint::from(456u32);
        let vo_idx = BigUint::from(789u32);
        let new_votes = BigUint::from(1000u32);

        let packed = pack_element(&nonce, &state_idx, &vo_idx, &new_votes, None);
        let unpacked = unpack_element(&packed);

        assert_eq!(unpacked.nonce, nonce);
        assert_eq!(unpacked.state_idx, state_idx);
        assert_eq!(unpacked.vo_idx, vo_idx);
        assert_eq!(unpacked.new_votes, new_votes);
    }

    #[test]
    fn test_pack_zero_values() {
        let nonce = BigUint::from(0u32);
        let state_idx = BigUint::from(0u32);
        let vo_idx = BigUint::from(0u32);
        let new_votes = BigUint::from(0u32);
        let salt = BigUint::from(0u32);

        let packed = pack_element(&nonce, &state_idx, &vo_idx, &new_votes, Some(&salt));
        let unpacked = unpack_element(&packed);

        assert_eq!(unpacked.nonce, nonce);
        assert_eq!(unpacked.state_idx, state_idx);
        assert_eq!(unpacked.vo_idx, vo_idx);
        assert_eq!(unpacked.new_votes, new_votes);
    }

    #[test]
    fn test_pack_max_values() {
        // Max values for each field based on bit sizes
        let nonce = &*UINT32 - BigUint::from(1u32); // 32 bits
        let state_idx = &*UINT32 - BigUint::from(1u32); // 32 bits
        let vo_idx = &*UINT32 - BigUint::from(1u32); // 32 bits
        let new_votes = &*UINT96 - BigUint::from(1u32); // 96 bits

        let packed = pack_element(&nonce, &state_idx, &vo_idx, &new_votes, None);
        let unpacked = unpack_element(&packed);

        assert_eq!(unpacked.nonce, nonce);
        assert_eq!(unpacked.state_idx, state_idx);
        assert_eq!(unpacked.vo_idx, vo_idx);
        assert_eq!(unpacked.new_votes, new_votes);
    }
}

