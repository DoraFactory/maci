use crate::error::ContractError;
use crate::state::NEXT_POLL_ID;
use cosmwasm_std::{Attribute, DepsMut, Response};

pub fn migrate_v0_1_5(deps: DepsMut) -> Result<Response, ContractError> {
    // Initialize the poll ID counter if it doesn't exist
    if NEXT_POLL_ID.may_load(deps.storage)?.is_none() {
        NEXT_POLL_ID.save(deps.storage, &1u64)?;
    }

    let attributes: Vec<Attribute> = vec![
        Attribute::new("action", "migrate"),
        Attribute::new("version", "0.1.5"),
        Attribute::new("changes", "initialize_poll_id_management"),
    ];

    Ok(Response::new().add_attributes(attributes))
}
