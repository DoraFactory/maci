use cosmwasm_std::{Uint128, Uint256};
use cw_amaci::state::MaciParameters;

use crate::error::ContractError;

/// Calculate the required fee and MACI parameters based on max voters and vote options
/// This function centralizes the fee calculation logic to ensure consistency across all contracts
pub fn calculate_round_fee_and_params(
    max_voter: Uint256,
    max_option: Uint256,
) -> Result<(Uint128, MaciParameters), ContractError> {
    if max_voter <= Uint256::from_u128(25u128) && max_option <= Uint256::from_u128(5u128) {
        // Small round configuration
        // state_tree_depth: 2, vote_option_tree_depth: 1
        // price: 20 DORA
        let maci_parameters = MaciParameters {
            state_tree_depth: Uint256::from_u128(2u128),
            int_state_tree_depth: Uint256::from_u128(1u128),
            vote_option_tree_depth: Uint256::from_u128(1u128),
            message_batch_size: Uint256::from_u128(5u128),
        };
        let required_fee = Uint128::from(20000000000000000000u128); // 20 DORA
        Ok((required_fee, maci_parameters))
    } else if max_voter <= Uint256::from_u128(625u128) && max_option <= Uint256::from_u128(25u128) {
        // Large round configuration
        // state_tree_depth: 4, vote_option_tree_depth: 2
        // price: 750 DORA
        let maci_parameters = MaciParameters {
            state_tree_depth: Uint256::from_u128(4u128),
            int_state_tree_depth: Uint256::from_u128(2u128),
            vote_option_tree_depth: Uint256::from_u128(2u128),
            message_batch_size: Uint256::from_u128(25u128),
        };
        let required_fee = Uint128::from(750000000000000000000u128); // 750 DORA
        Ok((required_fee, maci_parameters))
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
