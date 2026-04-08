use cosmwasm_std::{Uint128, Uint256};
use cw_amaci::state::MaciParameters;

use crate::error::ContractError;

// Base fee for the only supported circuit: 9-4-3-125
// TODO: update when 9-4-3-125 benchmark is complete
pub const BASE_FEE_9_4_3_125: u128 = 2160_000_000_000_000_000_000; // 2160 DORA (placeholder)

/// Calculate the required fee and MACI parameters.
/// Only the 9-4-3-125 circuit is supported. The max_voter and max_option parameters
/// are kept for API compatibility but no longer determine circuit selection.
pub fn calculate_round_fee_and_params(
    _max_voter: Uint256,
    _max_option: Uint256,
) -> Result<(Uint128, MaciParameters), ContractError> {
    let maci_parameters = MaciParameters {
        state_tree_depth: Uint256::from_u128(9u128),
        int_state_tree_depth: Uint256::from_u128(4u128),
        vote_option_tree_depth: Uint256::from_u128(3u128),
        message_batch_size: Uint256::from_u128(125u128),
    };
    Ok((Uint128::from(BASE_FEE_9_4_3_125), maci_parameters))
}

/// Calculate only the required fee for a given configuration.
/// This is a convenience function for contracts that only need the fee amount.
pub fn calculate_round_fee(
    max_voter: Uint256,
    max_option: Uint256,
) -> Result<Uint128, ContractError> {
    let (fee, _) = calculate_round_fee_and_params(max_voter, max_option)?;
    Ok(fee)
}
