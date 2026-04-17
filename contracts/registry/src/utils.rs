use cosmwasm_std::Uint256;
use cw_amaci::state::MaciParameters;

use crate::error::ContractError;

/// Returns the fixed MACI circuit parameters for production builds (9-4-3-125).
#[cfg(not(any(test, feature = "test-circuit")))]
pub fn get_maci_parameters() -> Result<MaciParameters, ContractError> {
    Ok(MaciParameters {
        state_tree_depth: Uint256::from_u128(9u128),
        int_state_tree_depth: Uint256::from_u128(4u128),
        vote_option_tree_depth: Uint256::from_u128(3u128),
        message_batch_size: Uint256::from_u128(125u128),
    })
}

/// Returns the fixed MACI circuit parameters for test/test-circuit builds (2-1-1-5).
#[cfg(any(test, feature = "test-circuit"))]
pub fn get_maci_parameters() -> Result<MaciParameters, ContractError> {
    Ok(MaciParameters {
        state_tree_depth: Uint256::from_u128(2u128),
        int_state_tree_depth: Uint256::from_u128(1u128),
        vote_option_tree_depth: Uint256::from_u128(1u128),
        message_batch_size: Uint256::from_u128(5u128),
    })
}
