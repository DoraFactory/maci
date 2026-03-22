use cosmwasm_std::{Uint128, Uint256};
use cw_amaci::state::MaciParameters;

use crate::error::ContractError;

// Base fees per circuit tier (includes 10% protocol fee, rounded up)
// Pricing basis: 1 DORA = $0.005 USD, 1 DORA = 10^18 peaka
//
// 2-1-1-5:  benchmark $0.0201893 × 1.1 / $0.005 = 4.44  → 5 DORA
// 4-2-2-25: benchmark $0.1213993 × 1.1 / $0.005 = 26.71 → 27 DORA
// 6-3-3-125: benchmark $0.941254 × 1.1 / $0.005 = 207.08 → 208 DORA
// 9-4-3-125: TODO - benchmark in progress
pub const BASE_FEE_2_1_1_5: u128 = 5_000_000_000_000_000_000; // 5 DORA
pub const BASE_FEE_4_2_2_25: u128 = 27_000_000_000_000_000_000; // 27 DORA
pub const BASE_FEE_6_3_3_125: u128 = 208_000_000_000_000_000_000; // 208 DORA
// TODO: update BASE_FEE_9_4_3_125 when benchmark is complete
pub const BASE_FEE_9_4_3_125: u128 = 2160_000_000_000_000_000_000; // 2160 DORA (placeholder)

/// Calculate the required fee and MACI parameters based on max voters and vote options.
/// The returned fee is the base fee only; per-vote fees are charged separately in the amaci contract.
pub fn calculate_round_fee_and_params(
    max_voter: Uint256,
    max_option: Uint256,
) -> Result<(Uint128, MaciParameters), ContractError> {
    if max_voter <= Uint256::from_u128(25u128) && max_option <= Uint256::from_u128(5u128) {
        // Circuit 2-1-1-5: ≤25 voters, ≤5 vote options
        // Base fee: 5 DORA
        let maci_parameters = MaciParameters {
            state_tree_depth: Uint256::from_u128(2u128),
            int_state_tree_depth: Uint256::from_u128(1u128),
            vote_option_tree_depth: Uint256::from_u128(1u128),
            message_batch_size: Uint256::from_u128(5u128),
        };
        Ok((Uint128::from(BASE_FEE_2_1_1_5), maci_parameters))
    } else if max_voter <= Uint256::from_u128(625u128) && max_option <= Uint256::from_u128(25u128) {
        // Circuit 4-2-2-25: ≤625 voters, ≤25 vote options
        // Base fee: 27 DORA
        let maci_parameters = MaciParameters {
            state_tree_depth: Uint256::from_u128(4u128),
            int_state_tree_depth: Uint256::from_u128(2u128),
            vote_option_tree_depth: Uint256::from_u128(2u128),
            message_batch_size: Uint256::from_u128(25u128),
        };
        Ok((Uint128::from(BASE_FEE_4_2_2_25), maci_parameters))
    } else if max_voter <= Uint256::from_u128(15625u128)
        && max_option <= Uint256::from_u128(125u128)
    {
        // Circuit 6-3-3-125: ≤15625 voters, ≤125 vote options
        // Base fee: 208 DORA
        let maci_parameters = MaciParameters {
            state_tree_depth: Uint256::from_u128(6u128),
            int_state_tree_depth: Uint256::from_u128(3u128),
            vote_option_tree_depth: Uint256::from_u128(3u128),
            message_batch_size: Uint256::from_u128(125u128),
        };
        Ok((Uint128::from(BASE_FEE_6_3_3_125), maci_parameters))
    } else if max_voter <= Uint256::from_u128(1953125u128)
        && max_option <= Uint256::from_u128(125u128)
    {
        // Circuit 9-4-3-125: ≤1953125 voters, ≤125 vote options
        // TODO: update base fee when benchmark is complete
        let maci_parameters = MaciParameters {
            state_tree_depth: Uint256::from_u128(9u128),
            int_state_tree_depth: Uint256::from_u128(4u128),
            vote_option_tree_depth: Uint256::from_u128(3u128),
            message_batch_size: Uint256::from_u128(125u128),
        };
        Ok((Uint128::from(BASE_FEE_9_4_3_125), maci_parameters))
    } else {
        Err(ContractError::NoMatchedSizeCircuit {})
    }
}

/// Calculate only the required fee for a given configuration
/// This is a convenience function for contracts that only need the fee amount
pub fn calculate_round_fee(
    max_voter: Uint256,
    max_option: Uint256,
) -> Result<Uint128, ContractError> {
    let (fee, _) = calculate_round_fee_and_params(max_voter, max_option)?;
    Ok(fee)
}
