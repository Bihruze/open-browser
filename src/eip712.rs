use sha3::{Keccak256, Digest};
use serde_json::Value;
use std::collections::BTreeSet;

/// Compute the EIP-712 hash for signing.
/// Input: JSON string with { types, primaryType, domain, message }
/// Output: 32-byte hash ready for secp256k1 signing
pub fn hash_typed_data(json_str: &str) -> Result<[u8; 32], String> {
    let data: Value = serde_json::from_str(json_str)
        .map_err(|e| format!("Invalid JSON: {}", e))?;

    let types = data.get("types").ok_or("Missing 'types' field")?;
    let primary_type = data.get("primaryType")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'primaryType' field")?;
    let domain = data.get("domain").ok_or("Missing 'domain' field")?;
    let message = data.get("message").ok_or("Missing 'message' field")?;

    let domain_separator = hash_struct("EIP712Domain", domain, types)?;
    let struct_hash = hash_struct(primary_type, message, types)?;

    // keccak256("\x19\x01" || domainSeparator || structHash)
    let mut hasher = Keccak256::new();
    hasher.update(&[0x19, 0x01]);
    hasher.update(&domain_separator);
    hasher.update(&struct_hash);
    Ok(hasher.finalize().into())
}

fn hash_struct(type_name: &str, data: &Value, types: &Value) -> Result<[u8; 32], String> {
    let type_hash = compute_type_hash(type_name, types)?;
    let encoded = encode_data(type_name, data, types)?;

    let mut hasher = Keccak256::new();
    hasher.update(&type_hash);
    hasher.update(&encoded);
    Ok(hasher.finalize().into())
}

fn compute_type_hash(type_name: &str, types: &Value) -> Result<[u8; 32], String> {
    let encoded_type = encode_type(type_name, types)?;
    Ok(Keccak256::digest(encoded_type.as_bytes()).into())
}

/// Build the canonical type string with all transitive dependencies sorted alphabetically
fn encode_type(type_name: &str, types: &Value) -> Result<String, String> {
    let mut deps = BTreeSet::new();
    find_type_dependencies(type_name, types, &mut deps)?;
    deps.remove(type_name); // primary type goes first, not in sorted deps

    let mut result = format_type_string(type_name, types)?;
    for dep in &deps {
        result.push_str(&format_type_string(dep, types)?);
    }
    Ok(result)
}

fn format_type_string(type_name: &str, types: &Value) -> Result<String, String> {
    let fields = types.get(type_name)
        .and_then(|v| v.as_array())
        .ok_or_else(|| format!("Type '{}' not found", type_name))?;

    let params: Vec<String> = fields.iter().map(|f| {
        let t = f.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let n = f.get("name").and_then(|v| v.as_str()).unwrap_or("");
        format!("{} {}", t, n)
    }).collect();

    Ok(format!("{}({})", type_name, params.join(",")))
}

fn find_type_dependencies(type_name: &str, types: &Value, deps: &mut BTreeSet<String>) -> Result<(), String> {
    if deps.contains(type_name) { return Ok(()); }
    let fields = match types.get(type_name).and_then(|v| v.as_array()) {
        Some(f) => f,
        None => return Ok(()), // atomic type
    };
    deps.insert(type_name.to_string());
    for field in fields {
        let field_type = field.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let base_type = strip_array_suffix(field_type);
        if types.get(base_type).is_some() {
            find_type_dependencies(base_type, types, deps)?;
        }
    }
    Ok(())
}

fn strip_array_suffix(t: &str) -> &str {
    if let Some(idx) = t.find('[') { &t[..idx] } else { t }
}

/// Encode all fields of a struct according to EIP-712 rules
fn encode_data(type_name: &str, data: &Value, types: &Value) -> Result<Vec<u8>, String> {
    let fields = types.get(type_name)
        .and_then(|v| v.as_array())
        .ok_or_else(|| format!("Type '{}' not found", type_name))?;

    let mut encoded = Vec::new();

    for field in fields {
        let field_type = field.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let field_name = field.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let value = data.get(field_name);

        let word = encode_value(field_type, value, types)?;
        encoded.extend_from_slice(&word);
    }

    Ok(encoded)
}

// Max recursion depth to prevent cycle-based DoS
const MAX_DEPTH: usize = 16;
static DEPTH_COUNTER: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

fn encode_value(field_type: &str, value: Option<&Value>, types: &Value) -> Result<[u8; 32], String> {
    let depth = DEPTH_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    if depth > MAX_DEPTH {
        DEPTH_COUNTER.store(0, std::sync::atomic::Ordering::Relaxed);
        return Err("EIP-712 type recursion too deep (possible cycle)".to_string());
    }
    let result = encode_value_inner(field_type, value, types);
    DEPTH_COUNTER.fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
    result
}

fn encode_value_inner(field_type: &str, value: Option<&Value>, types: &Value) -> Result<[u8; 32], String> {
    let value = match value {
        Some(v) if !v.is_null() => v,
        _ => return Ok([0u8; 32]), // missing/null → zero bytes
    };

    // Array types
    if field_type.ends_with(']') {
        let base_type = strip_array_suffix(field_type);
        let arr = value.as_array().ok_or("Expected array value")?;
        let mut hasher = Keccak256::new();
        for item in arr {
            let word = encode_value(base_type, Some(item), types)?;
            hasher.update(&word);
        }
        return Ok(hasher.finalize().into());
    }

    // Struct types (custom types defined in `types`)
    if types.get(field_type).is_some() {
        let hash = hash_struct(field_type, value, types)?;
        return Ok(hash);
    }

    // Atomic types
    match field_type {
        "address" => {
            let addr = value.as_str().ok_or("address must be string")?;
            let addr_clean = addr.strip_prefix("0x").unwrap_or(addr);
            let bytes = hex::decode(addr_clean)
                .map_err(|_| "Invalid address hex")?;
            let mut word = [0u8; 32];
            let start = 32 - bytes.len().min(20);
            word[start..start + bytes.len().min(20)].copy_from_slice(&bytes[..bytes.len().min(20)]);
            Ok(word)
        }
        "bool" => {
            let b = value.as_bool().unwrap_or(false);
            let mut word = [0u8; 32];
            if b { word[31] = 1; }
            Ok(word)
        }
        "string" => {
            let s = value.as_str().unwrap_or("");
            Ok(Keccak256::digest(s.as_bytes()).into())
        }
        "bytes" => {
            let s = value.as_str().ok_or("bytes must be hex string")?;
            let clean = s.strip_prefix("0x").unwrap_or(s);
            let bytes = hex::decode(clean).map_err(|_| "Invalid bytes hex")?;
            Ok(Keccak256::digest(&bytes).into())
        }
        t if t.starts_with("bytes") => {
            // bytes1..bytes32
            let s = value.as_str().ok_or("bytesN must be hex string")?;
            let clean = s.strip_prefix("0x").unwrap_or(s);
            let bytes = hex::decode(clean).map_err(|_| "Invalid bytesN hex")?;
            let mut word = [0u8; 32];
            let len = bytes.len().min(32);
            word[..len].copy_from_slice(&bytes[..len]); // left-aligned
            Ok(word)
        }
        t if t.starts_with("uint") => {
            let mut word = [0u8; 32];
            if let Some(n) = value.as_u64() {
                let bytes = n.to_be_bytes();
                word[24..].copy_from_slice(&bytes);
            } else if let Some(s) = value.as_str() {
                // Handle large numbers as hex or decimal strings
                let clean = s.strip_prefix("0x").unwrap_or(s);
                if s.starts_with("0x") {
                    let bytes = hex::decode(clean).map_err(|_| "Invalid uint hex")?;
                    let start = 32 - bytes.len().min(32);
                    word[start..start + bytes.len().min(32)].copy_from_slice(&bytes);
                } else {
                    let n: u128 = clean.parse().map_err(|_| "Invalid uint decimal")?;
                    let bytes = n.to_be_bytes();
                    word[16..].copy_from_slice(&bytes);
                }
            }
            Ok(word)
        }
        t if t.starts_with("int") => {
            let mut word = [0u8; 32];
            if let Some(n) = value.as_i64() {
                if n < 0 {
                    word = [0xffu8; 32]; // two's complement for negatives
                }
                let bytes = n.to_be_bytes();
                word[24..].copy_from_slice(&bytes);
            }
            Ok(word)
        }
        _ => Err(format!("Unknown type: {}", field_type)),
    }
}
