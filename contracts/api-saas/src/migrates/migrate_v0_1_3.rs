use crate::error::ContractError;
use crate::state::{SaasFeeConfig, SAAS_FEE_CONFIG};
use cosmwasm_std::{Attribute, DepsMut, Response, Uint128};

pub fn migrate_v0_1_3(deps: DepsMut) -> Result<Response, ContractError> {
    // Initialize SAAS_FEE_CONFIG if not present.
    // This item did not exist in v0.1.2; it mirrors the Registry's FeeConfig
    // so that api-saas can check fees locally without cross-contract queries.
    if SAAS_FEE_CONFIG.may_load(deps.storage)?.is_none() {
        let fee_config = SaasFeeConfig {
            message_fee: Uint128::new(60_000_000_000_000_000),        // 0.06 DORA
            deactivate_fee: Uint128::new(10_000_000_000_000_000_000), // 10 DORA
            base_fee: Uint128::new(30_000_000_000_000_000_000),       // 30 DORA
            signup_fee: Uint128::new(30_000_000_000_000_000),         // 0.03 DORA
        };
        SAAS_FEE_CONFIG.save(deps.storage, &fee_config)?;
    }

    let attributes: Vec<Attribute> = vec![
        Attribute::new("action", "migrate"),
        Attribute::new("version", "0.1.3"),
        Attribute::new("changes", "initialize_saas_fee_config"),
    ];

    Ok(Response::new().add_attributes(attributes))
}
