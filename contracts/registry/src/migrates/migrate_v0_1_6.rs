use crate::error::ContractError;
use crate::migrates::migrate_v0_1_5::migrate_v0_1_5;
use crate::state::{DelayConfig, FeeConfig, DELAY_CONFIG, FEE_CONFIG};
use cosmwasm_std::{Attribute, DepsMut, Response, Uint128};

pub fn migrate_v0_1_6(mut deps: DepsMut) -> Result<Response, ContractError> {
    // Chain v0.1.5: initialize NEXT_POLL_ID if not present
    migrate_v0_1_5(deps.branch())?;

    // Initialize FEE_CONFIG if not present
    if FEE_CONFIG.may_load(deps.storage)?.is_none() {
        let fee_config = FeeConfig {
            base_fee: Uint128::new(30_000_000_000_000_000_000),       // 30 DORA
            message_fee: Uint128::new(60_000_000_000_000_000),        // 0.06 DORA
            deactivate_fee: Uint128::new(10_000_000_000_000_000_000), // 10 DORA
            signup_fee: Uint128::new(30_000_000_000_000_000),         // 0.03 DORA
        };
        FEE_CONFIG.save(deps.storage, &fee_config)?;
    }

    // Initialize DELAY_CONFIG if not present
    if DELAY_CONFIG.may_load(deps.storage)?.is_none() {
        let delay_config = DelayConfig {
            base_delay: 200u64,       // 200s
            message_delay: 2u64,      // 2s per message in tally window
            signup_delay: 1u64,       // 1s per registered user in tally window
            deactivate_delay: 600u64, // 10 min: operator processing window for deactivate msgs
        };
        DELAY_CONFIG.save(deps.storage, &delay_config)?;
    }

    let attributes: Vec<Attribute> = vec![
        Attribute::new("action", "migrate"),
        Attribute::new("version", "0.1.6"),
        Attribute::new(
            "changes",
            "initialize_fee_config,initialize_delay_config",
        ),
    ];

    Ok(Response::new().add_attributes(attributes))
}
