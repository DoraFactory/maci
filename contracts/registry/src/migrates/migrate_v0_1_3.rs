use crate::error::ContractError;
use crate::state::{CircuitChargeConfig, CIRCUIT_CHARGE_CONFIG};
use cosmwasm_std::{Attribute, Decimal, DepsMut, Response};

pub fn migrate_v0_1_3(deps: DepsMut) -> Result<Response, ContractError> {
    let circuit_charge_config = CircuitChargeConfig {
        // small_circuit_fee: Uint128::from(50000000000000000000u128), // 50 DORA
        // medium_circuit_fee: Uint128::from(100000000000000000000u128), // 100 DORA
        fee_rate: Decimal::from_ratio(1u128, 10u128), // 10%
    };

    CIRCUIT_CHARGE_CONFIG.save(deps.storage, &circuit_charge_config)?;

    let attributes: Vec<Attribute> = vec![
        Attribute::new("action", "migrate"),
        Attribute::new("version", "0.1.3"),
        Attribute::new("fee_rate", circuit_charge_config.fee_rate.to_string()),
    ];

    Ok(Response::new().add_attributes(attributes))
}
