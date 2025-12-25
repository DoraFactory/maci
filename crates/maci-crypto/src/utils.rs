use num_bigint::BigUint;
use serde_json::Value;

/// Convert a BigUint to a byte array (big-endian)
pub fn bigint_to_bytes(value: &BigUint) -> Vec<u8> {
    value.to_bytes_be()
}

/// Convert a byte array (big-endian) to a BigUint
pub fn bytes_to_bigint(bytes: &[u8]) -> BigUint {
    BigUint::from_bytes_be(bytes)
}

/// Convert BigUint to hex string
pub fn bigint_to_hex(value: &BigUint) -> String {
    hex::encode(bigint_to_bytes(value))
}

/// Convert hex string to BigUint
pub fn hex_to_bigint(hex_str: &str) -> Result<BigUint, hex::FromHexError> {
    let hex_str = hex_str.strip_prefix("0x").unwrap_or(hex_str);
    let bytes = hex::decode(hex_str)?;
    Ok(bytes_to_bigint(&bytes))
}

/// Recursively convert BigUint values to strings for serialization
pub fn stringizing(value: &Value) -> Value {
    match value {
        Value::Array(arr) => Value::Array(arr.iter().map(stringizing).collect()),
        Value::Object(obj) => Value::Object(
            obj.iter()
                .map(|(k, v)| (k.clone(), stringizing(v)))
                .collect(),
        ),
        Value::Number(n) => {
            if let Some(i) = n.as_u64() {
                Value::String(i.to_string())
            } else if let Some(i) = n.as_i64() {
                Value::String(i.to_string())
            } else {
                value.clone()
            }
        }
        _ => value.clone(),
    }
}

/// Recursively convert string values to numbers for deserialization
pub fn destringizing(value: &Value) -> Value {
    match value {
        Value::Array(arr) => Value::Array(arr.iter().map(destringizing).collect()),
        Value::Object(obj) => Value::Object(
            obj.iter()
                .map(|(k, v)| (k.clone(), destringizing(v)))
                .collect(),
        ),
        Value::String(s) => {
            if let Ok(n) = s.parse::<u64>() {
                Value::Number(n.into())
            } else if let Ok(n) = s.parse::<i64>() {
                Value::Number(n.into())
            } else {
                value.clone()
            }
        }
        _ => value.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bigint_to_bytes_and_back() {
        let value = BigUint::from(12345u64);
        let bytes = bigint_to_bytes(&value);
        let restored = bytes_to_bigint(&bytes);
        assert_eq!(value, restored);
    }

    #[test]
    fn test_bigint_to_hex() {
        let value = BigUint::from(255u64);
        let hex = bigint_to_hex(&value);
        assert_eq!(hex, "ff");
    }

    #[test]
    fn test_hex_to_bigint() {
        let hex = "0xff";
        let value = hex_to_bigint(hex).unwrap();
        assert_eq!(value, BigUint::from(255u64));
    }

    #[test]
    fn test_hex_without_prefix() {
        let hex = "ff";
        let value = hex_to_bigint(hex).unwrap();
        assert_eq!(value, BigUint::from(255u64));
    }

    #[test]
    fn test_stringizing() {
        let json = serde_json::json!({
            "num": 123,
            "arr": [1, 2, 3]
        });
        let stringized = stringizing(&json);
        assert_eq!(stringized["num"], "123");
        assert_eq!(stringized["arr"][0], "1");
    }

    #[test]
    fn test_destringizing() {
        let json = serde_json::json!({
            "num": "123",
            "arr": ["1", "2", "3"]
        });
        let destringized = destringizing(&json);
        assert_eq!(destringized["num"], 123);
        assert_eq!(destringized["arr"][0], 1);
    }
}

