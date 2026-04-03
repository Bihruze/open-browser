use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use k256::ecdsa::SigningKey;
use sha3::Keccak256;
use sha2::{Sha256, Sha512, Digest};

use crate::wallet;
use crate::eip712;
use zeroize::Zeroize;

#[derive(Serialize, Deserialize)]
pub struct SignResult {
    pub signature: String,
    pub recovery_id: Option<u8>,
    pub public_key: Option<String>,
}

pub async fn sign_message(
    wallet_name: &str,
    password: &str,
    chain: &str,
    message: &str,
) -> Result<JsValue, JsValue> {
    let private_key = wallet::get_private_key(wallet_name, password, chain).await?;

    let result = match chain {
        "eip155" | "evm" => sign_evm_message(&private_key, message)?,
        "solana" => sign_solana_message(&private_key, message)?,
        "bip122" | "bitcoin" => sign_bitcoin_message(&private_key, message)?,
        "cosmos" => sign_cosmos_message(&private_key, message)?,
        "tron" => sign_tron_message(&private_key, message)?,
        "spark" => sign_spark_message(&private_key, message)?,
        "filecoin" => sign_filecoin_message(&private_key, message)?,
        "sui" => sign_sui_message(&private_key, message)?,
        "ton" => sign_ton_message(&private_key, message)?,
        "xrpl" => return Err(JsValue::from_str("XRPL does not support message signing")),
        _ => return Err(JsValue::from_str(&format!("Unsupported chain: {}", chain))),
    };

    { let mut pk = private_key; pk.zeroize(); }

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

pub async fn sign_tx(
    wallet_name: &str,
    password: &str,
    chain: &str,
    tx_hex: &str,
) -> Result<JsValue, JsValue> {
    let private_key = wallet::get_private_key(wallet_name, password, chain).await?;

    let tx_bytes = hex::decode(tx_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid hex: {}", e)))?;

    let result = match chain {
        "eip155" | "evm" => sign_evm_tx(&private_key, &tx_bytes)?,
        "solana" => sign_solana_tx(&private_key, &tx_bytes)?,
        "bip122" | "bitcoin" => sign_bitcoin_tx(&private_key, &tx_bytes)?,
        "cosmos" => sign_cosmos_tx(&private_key, &tx_bytes)?,
        "tron" => sign_tron_tx(&private_key, &tx_bytes)?,
        "spark" => sign_spark_tx(&private_key, &tx_bytes)?,
        "filecoin" => sign_filecoin_tx(&private_key, &tx_bytes)?,
        "sui" => sign_sui_tx(&private_key, &tx_bytes)?,
        "ton" => sign_ton_tx(&private_key, &tx_bytes)?,
        "xrpl" => sign_xrpl_tx(&private_key, &tx_bytes)?,
        _ => return Err(JsValue::from_str(&format!("Unsupported chain: {}", chain))),
    };

    { let mut pk = private_key; pk.zeroize(); }

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

// ============================================================
// Helper: secp256k1 prehash sign
// ============================================================

fn secp256k1_sign_prehash(private_key: &[u8], hash: &[u8]) -> Result<(Vec<u8>, u8), JsValue> {
    let signing_key = SigningKey::from_slice(private_key)
        .map_err(|e| JsValue::from_str(&format!("Invalid key: {}", e)))?;
    let (signature, recovery_id) = signing_key
        .sign_prehash_recoverable(hash)
        .map_err(|e| JsValue::from_str(&format!("Sign error: {}", e)))?;
    Ok((signature.to_bytes().to_vec(), recovery_id.to_byte()))
}

fn ed25519_sign(private_key: &[u8], data: &[u8]) -> Result<(Vec<u8>, Vec<u8>), JsValue> {
    let mut key_bytes = [0u8; 32];
    key_bytes.copy_from_slice(private_key);
    let sk = ed25519_dalek::SigningKey::from_bytes(&key_bytes);
    let pk = ed25519_dalek::VerifyingKey::from(&sk);
    use ed25519_dalek::Signer;
    let sig = sk.sign(data);
    Ok((sig.to_bytes().to_vec(), pk.as_bytes().to_vec()))
}

// ============================================================
// EVM
// ============================================================

fn sign_evm_message(private_key: &[u8], message: &str) -> Result<SignResult, JsValue> {
    let prefix = format!("\x19Ethereum Signed Message:\n{}", message.len());
    let mut hasher = Keccak256::new();
    hasher.update(prefix.as_bytes());
    hasher.update(message.as_bytes());
    let hash = hasher.finalize();

    let (sig, rec) = secp256k1_sign_prehash(private_key, &hash)?;
    let mut sig_v = sig.clone();
    sig_v.push(rec + 27);

    Ok(SignResult {
        signature: format!("0x{}", hex::encode(&sig_v)),
        recovery_id: Some(rec),
        public_key: None,
    })
}

fn sign_evm_tx(private_key: &[u8], tx_bytes: &[u8]) -> Result<SignResult, JsValue> {
    let hash = Keccak256::digest(tx_bytes);
    let (sig, rec) = secp256k1_sign_prehash(private_key, &hash)?;
    let mut sig_v = sig.clone();
    sig_v.push(rec + 27);
    Ok(SignResult {
        signature: format!("0x{}", hex::encode(&sig_v)),
        recovery_id: Some(rec),
        public_key: None,
    })
}

// ============================================================
// Solana
// ============================================================

fn sign_solana_message(private_key: &[u8], message: &str) -> Result<SignResult, JsValue> {
    let (sig, pk) = ed25519_sign(private_key, message.as_bytes())?;
    Ok(SignResult {
        signature: bs58::encode(&sig).into_string(),
        recovery_id: None,
        public_key: Some(bs58::encode(&pk).into_string()),
    })
}

fn sign_solana_tx(private_key: &[u8], tx_bytes: &[u8]) -> Result<SignResult, JsValue> {
    let (sig, _) = ed25519_sign(private_key, tx_bytes)?;
    Ok(SignResult {
        signature: bs58::encode(&sig).into_string(),
        recovery_id: None,
        public_key: None,
    })
}

// ============================================================
// Bitcoin
// ============================================================

fn sign_bitcoin_message(private_key: &[u8], message: &str) -> Result<SignResult, JsValue> {
    let prefix = "\x18Bitcoin Signed Message:\n";
    let mut data = Vec::new();
    data.extend_from_slice(prefix.as_bytes());
    let msg_len = message.len();
    if msg_len < 253 { data.push(msg_len as u8); }
    else { data.push(0xfd); data.extend_from_slice(&(msg_len as u16).to_le_bytes()); }
    data.extend_from_slice(message.as_bytes());
    let hash = Sha256::digest(&Sha256::digest(&data));
    let (sig, rec) = secp256k1_sign_prehash(private_key, &hash)?;
    Ok(SignResult { signature: hex::encode(&sig), recovery_id: Some(rec), public_key: None })
}

fn sign_bitcoin_tx(private_key: &[u8], tx_bytes: &[u8]) -> Result<SignResult, JsValue> {
    let hash = Sha256::digest(&Sha256::digest(tx_bytes));
    let (sig, rec) = secp256k1_sign_prehash(private_key, &hash)?;
    Ok(SignResult { signature: hex::encode(&sig), recovery_id: Some(rec), public_key: None })
}

// ============================================================
// Cosmos
// ============================================================

fn sign_cosmos_message(private_key: &[u8], message: &str) -> Result<SignResult, JsValue> {
    let hash = Sha256::digest(message.as_bytes());
    let (sig, _) = secp256k1_sign_prehash(private_key, &hash)?;
    Ok(SignResult { signature: hex::encode(&sig), recovery_id: None, public_key: None })
}

fn sign_cosmos_tx(private_key: &[u8], tx_bytes: &[u8]) -> Result<SignResult, JsValue> {
    let hash = Sha256::digest(tx_bytes);
    let (sig, _) = secp256k1_sign_prehash(private_key, &hash)?;
    Ok(SignResult { signature: hex::encode(&sig), recovery_id: None, public_key: None })
}

// ============================================================
// Tron — "\x19TRON Signed Message:\n{len}" + keccak256
// ============================================================

fn sign_tron_message(private_key: &[u8], message: &str) -> Result<SignResult, JsValue> {
    let prefix = format!("\x19TRON Signed Message:\n{}", message.len());
    let mut hasher = Keccak256::new();
    hasher.update(prefix.as_bytes());
    hasher.update(message.as_bytes());
    let hash = hasher.finalize();
    let (sig, rec) = secp256k1_sign_prehash(private_key, &hash)?;
    let mut sig_v = sig.clone();
    sig_v.push(rec + 27);
    Ok(SignResult {
        signature: format!("0x{}", hex::encode(&sig_v)),
        recovery_id: Some(rec),
        public_key: None,
    })
}

fn sign_tron_tx(private_key: &[u8], tx_bytes: &[u8]) -> Result<SignResult, JsValue> {
    let hash = Sha256::digest(tx_bytes);
    let (sig, rec) = secp256k1_sign_prehash(private_key, &hash)?;
    Ok(SignResult { signature: hex::encode(&sig), recovery_id: Some(rec), public_key: None })
}

// ============================================================
// Spark — SHA256 message, double-SHA256 tx
// ============================================================

fn sign_spark_message(private_key: &[u8], message: &str) -> Result<SignResult, JsValue> {
    let hash = Sha256::digest(message.as_bytes());
    let (sig, rec) = secp256k1_sign_prehash(private_key, &hash)?;
    Ok(SignResult { signature: hex::encode(&sig), recovery_id: Some(rec), public_key: None })
}

fn sign_spark_tx(private_key: &[u8], tx_bytes: &[u8]) -> Result<SignResult, JsValue> {
    let hash = Sha256::digest(&Sha256::digest(tx_bytes));
    let (sig, rec) = secp256k1_sign_prehash(private_key, &hash)?;
    Ok(SignResult { signature: hex::encode(&sig), recovery_id: Some(rec), public_key: None })
}

// ============================================================
// Filecoin — blake2b-256
// ============================================================

fn sign_filecoin_message(private_key: &[u8], message: &str) -> Result<SignResult, JsValue> {
    use blake2::digest::consts::U32;
    use blake2::Blake2b;
    let hash: [u8; 32] = Blake2b::<U32>::digest(message.as_bytes()).into();
    let (sig, rec) = secp256k1_sign_prehash(private_key, &hash)?;
    Ok(SignResult { signature: hex::encode(&sig), recovery_id: Some(rec), public_key: None })
}

fn sign_filecoin_tx(private_key: &[u8], tx_bytes: &[u8]) -> Result<SignResult, JsValue> {
    use blake2::digest::consts::U32;
    use blake2::Blake2b;
    let hash: [u8; 32] = Blake2b::<U32>::digest(tx_bytes).into();
    let (sig, rec) = secp256k1_sign_prehash(private_key, &hash)?;
    Ok(SignResult { signature: hex::encode(&sig), recovery_id: Some(rec), public_key: None })
}

// ============================================================
// Sui — blake2b-256 with intent prefix, wire format output
// ============================================================

fn sign_sui_message(private_key: &[u8], message: &str) -> Result<SignResult, JsValue> {
    use blake2::digest::consts::U32;
    use blake2::Blake2b;
    // Intent: [0x03, 0x00, 0x00] for personal message
    let mut data = vec![0x03, 0x00, 0x00];
    data.extend_from_slice(message.as_bytes());
    let hash: [u8; 32] = Blake2b::<U32>::digest(&data).into();

    let (sig, pk) = ed25519_sign(private_key, &hash)?;
    // Wire format: flag(0x00) || sig(64) || pubkey(32)
    let mut wire = vec![0x00u8];
    wire.extend_from_slice(&sig);
    wire.extend_from_slice(&pk);
    Ok(SignResult {
        signature: hex::encode(&wire),
        recovery_id: None,
        public_key: Some(hex::encode(&pk)),
    })
}

fn sign_sui_tx(private_key: &[u8], tx_bytes: &[u8]) -> Result<SignResult, JsValue> {
    use blake2::digest::consts::U32;
    use blake2::Blake2b;
    // Intent: [0x00, 0x00, 0x00] for transaction
    let mut data = vec![0x00, 0x00, 0x00];
    data.extend_from_slice(tx_bytes);
    let hash: [u8; 32] = Blake2b::<U32>::digest(&data).into();

    let (sig, pk) = ed25519_sign(private_key, &hash)?;
    let mut wire = vec![0x00u8];
    wire.extend_from_slice(&sig);
    wire.extend_from_slice(&pk);
    Ok(SignResult {
        signature: hex::encode(&wire),
        recovery_id: None,
        public_key: Some(hex::encode(&pk)),
    })
}

// ============================================================
// TON — raw ed25519
// ============================================================

fn sign_ton_message(private_key: &[u8], message: &str) -> Result<SignResult, JsValue> {
    let (sig, pk) = ed25519_sign(private_key, message.as_bytes())?;
    Ok(SignResult {
        signature: hex::encode(&sig),
        recovery_id: None,
        public_key: Some(hex::encode(&pk)),
    })
}

fn sign_ton_tx(private_key: &[u8], tx_bytes: &[u8]) -> Result<SignResult, JsValue> {
    let (sig, pk) = ed25519_sign(private_key, tx_bytes)?;
    Ok(SignResult {
        signature: hex::encode(&sig),
        recovery_id: None,
        public_key: Some(hex::encode(&pk)),
    })
}

// ============================================================
// XRPL — STX\0 prefix + SHA512-half, DER signature
// ============================================================

fn sign_xrpl_tx(private_key: &[u8], tx_bytes: &[u8]) -> Result<SignResult, JsValue> {
    // STX\0 prefix
    let mut data = vec![0x53, 0x54, 0x58, 0x00]; // "STX\0"
    data.extend_from_slice(tx_bytes);

    // SHA-512 half (first 32 bytes of SHA-512)
    let full_hash = Sha512::digest(&data);
    let hash = &full_hash[..32];

    let signing_key = SigningKey::from_slice(private_key)
        .map_err(|e| JsValue::from_str(&format!("Invalid key: {}", e)))?;

    let (signature, _) = signing_key
        .sign_prehash_recoverable(hash)
        .map_err(|e| JsValue::from_str(&format!("Sign error: {}", e)))?;

    // DER encode the signature
    let der_sig = signature.to_der();

    Ok(SignResult {
        signature: hex::encode(der_sig.as_bytes()),
        recovery_id: None,
        public_key: None,
    })
}

// ============================================================
// EIP-712 Typed Data Signing (EVM only)
// ============================================================

pub async fn sign_typed_data(
    wallet_name: &str,
    password: &str,
    typed_data_json: &str,
) -> Result<JsValue, JsValue> {
    let private_key = wallet::get_private_key(wallet_name, password, "evm").await?;

    let hash = eip712::hash_typed_data(typed_data_json)
        .map_err(|e| JsValue::from_str(&format!("EIP-712 error: {}", e)))?;

    let (sig, rec) = secp256k1_sign_prehash(&private_key, &hash)?;
    let mut sig_v = sig.clone();
    sig_v.push(rec + 27);

    { let mut pk = private_key; pk.zeroize(); }

    let result = SignResult {
        signature: format!("0x{}", hex::encode(&sig_v)),
        recovery_id: Some(rec),
        public_key: None,
    };
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}
