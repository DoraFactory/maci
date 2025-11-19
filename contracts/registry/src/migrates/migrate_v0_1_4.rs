use crate::error::ContractError;
use cosmwasm_std::{Attribute, DepsMut, Response};

pub fn migrate_v0_1_4(_deps: DepsMut) -> Result<Response, ContractError> {
    let attributes: Vec<Attribute> = vec![
        Attribute::new("action", "migrate"),
        Attribute::new("version", "0.1.4"),
    ];

    Ok(Response::new().add_attributes(attributes))
}
