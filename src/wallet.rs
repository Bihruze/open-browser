use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use bip39::Mnemonic;
use tiny_hderive::bip32::ExtendedPrivKey;
use k256::ecdsa::SigningKey;
#[allow(unused_imports)]
use k256::elliptic_curve::sec1::ToEncodedPoint;
use sha3::Keccak256;
use sha2::{Sha256, Digest};
use ripemd::Ripemd160;

use crate::crypto;
use crate::storage;

// ============================================================
// Data structures — OWS vault v2 format
// ============================================================

#[derive(Serialize, Deserialize, Clone)]
pub struct WalletFile {
    pub ows_version: u32,
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub accounts: Vec<AccountInfo>,
    pub crypto: serde_json::Value,
    pub key_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AccountInfo {
    pub account_id: String,
    pub address: String,
    pub chain_id: String,
    pub derivation_path: String,
}

#[derive(Serialize, Deserialize)]
pub struct WalletResult {
    pub id: String,
    pub name: String,
    pub mnemonic: String,
    pub accounts: Vec<AccountInfo>,
}

#[derive(Serialize, Deserialize)]
pub struct WalletInfo {
    pub id: String,
    pub name: String,
    pub accounts: Vec<AccountInfo>,
    pub key_type: String,
    pub created_at: String,
}

// ============================================================
// Public API
// ============================================================

pub async fn create(name: &str, password: &str) -> Result<JsValue, JsValue> {
    let mut entropy = [0u8; 16];
    getrandom::getrandom(&mut entropy)
        .map_err(|e| JsValue::from_str(&format!("RNG error: {}", e)))?;

    let mnemonic = Mnemonic::from_entropy(&entropy)
        .map_err(|e| JsValue::from_str(&format!("Mnemonic error: {}", e)))?;

    let phrase = mnemonic.to_string();
    let seed = mnemonic.to_seed_normalized("");
    let accounts = derive_all_accounts(&seed);

    let (id, _) = build_and_save(&name, &phrase, &accounts, password).await?;

    let result = WalletResult {
        id,
        name: name.to_string(),
        mnemonic: phrase,
        accounts,
    };
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

pub async fn import_mnemonic(name: &str, mnemonic_phrase: &str, password: &str) -> Result<JsValue, JsValue> {
    let mnemonic = Mnemonic::parse_normalized(mnemonic_phrase)
        .map_err(|e| JsValue::from_str(&format!("Invalid mnemonic: {}", e)))?;

    let phrase = mnemonic.to_string();
    let seed = mnemonic.to_seed_normalized("");
    let accounts = derive_all_accounts(&seed);

    let (id, created_at) = build_and_save(&name, &phrase, &accounts, password).await?;

    let info = WalletInfo {
        id,
        name: name.to_string(),
        accounts,
        key_type: "mnemonic".to_string(),
        created_at,
    };
    serde_wasm_bindgen::to_value(&info)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

pub async fn load(name: &str, password: &str) -> Result<JsValue, JsValue> {
    let wallet_file = load_wallet_file(name).await?;

    // Decrypt to verify password
    let crypto_str = serde_json::to_string(&wallet_file.crypto)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))?;
    let _decrypted = crypto::decrypt_keystore(&crypto_str, password).await
        .map_err(|_| JsValue::from_str("Wrong password or corrupted wallet"))?;

    let info = WalletInfo {
        id: wallet_file.id,
        name: wallet_file.name,
        accounts: wallet_file.accounts,
        key_type: wallet_file.key_type,
        created_at: wallet_file.created_at,
    };
    serde_wasm_bindgen::to_value(&info)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

pub async fn list() -> Result<JsValue, JsValue> {
    storage::list_wallets().await
}

pub async fn export_mnemonic(name: &str, password: &str) -> Result<JsValue, JsValue> {
    let wallet_file = load_wallet_file(name).await?;
    let crypto_str = serde_json::to_string(&wallet_file.crypto)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))?;
    crypto::decrypt_keystore(&crypto_str, password).await
        .map_err(|_| JsValue::from_str("Wrong password or corrupted wallet"))
}

pub async fn derive_at_index(name: &str, password: &str, index: u32) -> Result<JsValue, JsValue> {
    let wallet_file = load_wallet_file(name).await?;
    let crypto_str = serde_json::to_string(&wallet_file.crypto)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))?;
    let decrypted = crypto::decrypt_keystore(&crypto_str, password).await
        .map_err(|_| JsValue::from_str("Wrong password or corrupted wallet"))?;
    let mnemonic_str = decrypted.as_string()
        .ok_or_else(|| JsValue::from_str("Decrypted value is not a string"))?;
    let mnemonic = Mnemonic::parse_normalized(&mnemonic_str)
        .map_err(|e| JsValue::from_str(&format!("Invalid mnemonic: {}", e)))?;
    let seed = mnemonic.to_seed_normalized("");
    let accounts = derive_all_accounts_at_index(&seed, index);
    serde_wasm_bindgen::to_value(&accounts)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

pub async fn delete(name: &str) -> Result<JsValue, JsValue> {
    storage::delete_wallet(name).await
}

pub async fn rename(old_name: &str, new_name: &str, password: &str) -> Result<JsValue, JsValue> {
    let mut wallet_file = load_wallet_file(old_name).await?;

    // Verify password
    let crypto_str = serde_json::to_string(&wallet_file.crypto)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))?;
    let _decrypted = crypto::decrypt_keystore(&crypto_str, password).await
        .map_err(|_| JsValue::from_str("Wrong password or corrupted wallet"))?;

    // Update name, save under new key, delete old
    wallet_file.name = new_name.to_string();
    let wallet_json = serde_json::to_string(&wallet_file)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))?;
    storage::save_wallet(new_name, &wallet_json).await?;
    storage::delete_wallet(old_name).await?;

    Ok(JsValue::from_str("ok"))
}

// ============================================================
// Private helpers
// ============================================================

async fn build_and_save(
    name: &str,
    phrase: &str,
    accounts: &Vec<AccountInfo>,
    password: &str,
) -> Result<(String, String), JsValue> {
    let crypto_json = crypto::encrypt_keystore(phrase, password).await?;
    let crypto_val: serde_json::Value = serde_json::from_str(
        &crypto_json.as_string().ok_or_else(|| JsValue::from_str("encrypt returned non-string"))?
    ).map_err(|e| JsValue::from_str(&format!("JSON parse error: {}", e)))?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let wallet_file = WalletFile {
        ows_version: 2,
        id: id.clone(),
        name: name.to_string(),
        created_at: now.clone(),
        accounts: accounts.clone(),
        crypto: crypto_val,
        key_type: "mnemonic".to_string(),
        metadata: None,
    };

    let wallet_json = serde_json::to_string(&wallet_file)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))?;
    storage::save_wallet(name, &wallet_json).await?;

    Ok((id, now))
}

async fn load_wallet_file(name: &str) -> Result<WalletFile, JsValue> {
    let stored = storage::get_wallet(name).await?;
    if stored.is_null() || stored.is_undefined() {
        return Err(JsValue::from_str(&format!("Wallet '{}' not found", name)));
    }
    let wallet_json = stored.as_string()
        .ok_or_else(|| JsValue::from_str("Stored wallet is not a string"))?;
    serde_json::from_str(&wallet_json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))
}

// ============================================================
// SLIP-10 ed25519 derivation (generic helper)
// ============================================================

fn slip10_derive_ed25519(seed: &[u8], hardened_indices: &[u32]) -> Result<[u8; 32], String> {
    use sha2::Sha512;
    use hmac::{Hmac, Mac};
    type HmacSha512 = Hmac<Sha512>;

    let mut mac = HmacSha512::new_from_slice(b"ed25519 seed")
        .map_err(|e| format!("HMAC error: {}", e))?;
    mac.update(seed);
    let result = mac.finalize().into_bytes();
    let mut key = [0u8; 32];
    let mut chain_code = [0u8; 32];
    key.copy_from_slice(&result[..32]);
    chain_code.copy_from_slice(&result[32..]);

    for &index in hardened_indices {
        let idx = index | 0x80000000;
        let mut mac = HmacSha512::new_from_slice(&chain_code)
            .map_err(|e| format!("HMAC error: {}", e))?;
        mac.update(&[0u8]);
        mac.update(&key);
        mac.update(&idx.to_be_bytes());
        let result = mac.finalize().into_bytes();
        key.copy_from_slice(&result[..32]);
        chain_code.copy_from_slice(&result[32..]);
    }

    Ok(key)
}

// ============================================================
// HD Derivation — All 9 chains (+Spark shares BTC key)
// ============================================================

fn derive_all_accounts(seed: &[u8]) -> Vec<AccountInfo> {
    derive_all_accounts_at_index(seed, 0)
}

fn derive_all_accounts_at_index(seed: &[u8], index: u32) -> Vec<AccountInfo> {
    let mut accounts = Vec::new();

    // 1. EVM — m/44'/60'/0'/0/{index}
    if let Ok(addr) = derive_evm_address_at(seed, index) {
        accounts.push(AccountInfo {
            account_id: format!("eip155:1:{}", addr),
            address: addr,
            chain_id: "eip155:1".to_string(),
            derivation_path: format!("m/44'/60'/0'/0/{}", index),
        });
    }

    // 2. Solana — m/44'/501'/{index}'/0'
    if let Ok(addr) = derive_solana_address_at(seed, index) {
        accounts.push(AccountInfo {
            account_id: format!("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:{}", addr),
            address: addr,
            chain_id: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp".to_string(),
            derivation_path: format!("m/44'/501'/{}'/0'", index),
        });
    }

    // 3. Bitcoin — m/84'/0'/0'/0/{index}
    if let Ok(addr) = derive_bitcoin_address_at(seed, index) {
        accounts.push(AccountInfo {
            account_id: format!("bip122:000000000019d6689c085ae165831e93:{}", addr),
            address: addr,
            chain_id: "bip122:000000000019d6689c085ae165831e93".to_string(),
            derivation_path: format!("m/84'/0'/0'/0/{}", index),
        });
    }

    // 4. Cosmos — m/44'/118'/0'/0/{index}
    if let Ok(addr) = derive_secp_address_at(seed, &format!("m/44'/118'/0'/0/{}", index), "cosmos") {
        accounts.push(AccountInfo {
            account_id: format!("cosmos:cosmoshub-4:{}", addr),
            address: addr,
            chain_id: "cosmos:cosmoshub-4".to_string(),
            derivation_path: format!("m/44'/118'/0'/0/{}", index),
        });
    }

    // 5. Tron — m/44'/195'/0'/0/{index}
    if let Ok(addr) = derive_tron_address_at(seed, index) {
        accounts.push(AccountInfo {
            account_id: format!("tron:mainnet:{}", addr),
            address: addr,
            chain_id: "tron:mainnet".to_string(),
            derivation_path: format!("m/44'/195'/0'/0/{}", index),
        });
    }

    // 6. Filecoin — m/44'/461'/0'/0/{index}
    if let Ok(addr) = derive_filecoin_address_at(seed, index) {
        accounts.push(AccountInfo {
            account_id: format!("filecoin:mainnet:{}", addr),
            address: addr,
            chain_id: "filecoin:mainnet".to_string(),
            derivation_path: format!("m/44'/461'/0'/0/{}", index),
        });
    }

    // 7. Sui — m/44'/784'/{index}'/0'
    if let Ok(addr) = derive_sui_address_at(seed, index) {
        accounts.push(AccountInfo {
            account_id: format!("sui:mainnet:{}", addr),
            address: addr,
            chain_id: "sui:mainnet".to_string(),
            derivation_path: format!("m/44'/784'/{}'/0'", index),
        });
    }

    // 8. XRPL — m/44'/144'/0'/0/{index}
    if let Ok(addr) = derive_xrpl_address_at(seed, index) {
        accounts.push(AccountInfo {
            account_id: format!("xrpl:mainnet:{}", addr),
            address: addr,
            chain_id: "xrpl:mainnet".to_string(),
            derivation_path: format!("m/44'/144'/0'/0/{}", index),
        });
    }

    // 9. Spark — same key as Bitcoin m/84'/0'/0'/0/{index}
    if let Ok(addr) = derive_spark_address_at(seed, index) {
        accounts.push(AccountInfo {
            account_id: format!("spark:mainnet:{}", addr),
            address: addr,
            chain_id: "spark:mainnet".to_string(),
            derivation_path: format!("m/84'/0'/0'/0/{}", index),
        });
    }

    accounts
}

// ============================================================
// Chain-specific address derivation
// ============================================================

fn get_secp256k1_pubkey(seed: &[u8], path: &str) -> Result<(SigningKey, Vec<u8>, Vec<u8>), String> {
    let ext = ExtendedPrivKey::derive(seed, path)
        .map_err(|e| format!("Derivation failed: {:?}", e))?;
    let signing_key = SigningKey::from_slice(&ext.secret())
        .map_err(|e| format!("Invalid key: {}", e))?;
    let vk = signing_key.verifying_key();
    let uncompressed = vk.to_encoded_point(false).as_bytes().to_vec();
    let compressed = vk.to_encoded_point(true).as_bytes().to_vec();
    Ok((signing_key, uncompressed, compressed))
}

// 1. EVM
fn derive_evm_address_at(seed: &[u8], index: u32) -> Result<String, String> {
    let path = format!("m/44'/60'/0'/0/{}", index);
    let (_, uncompressed, _) = get_secp256k1_pubkey(seed, &path)?;
    let pub_bytes = &uncompressed[1..];
    let mut hasher = Keccak256::new();
    hasher.update(pub_bytes);
    let hash = hasher.finalize();
    let addr_hex = hex::encode(&hash[12..]);
    Ok(format!("0x{}", eip55_checksum(&addr_hex)))
}

fn eip55_checksum(addr_hex: &str) -> String {
    let lower = addr_hex.to_lowercase();
    let mut hasher = Keccak256::new();
    hasher.update(lower.as_bytes());
    let hash = hex::encode(hasher.finalize());
    lower.chars().enumerate().map(|(i, c)| {
        if c.is_ascii_alphabetic() {
            if let Some(h) = hash.as_bytes().get(i).and_then(|&b| (b as char).to_digit(16)) {
                if h >= 8 { return c.to_ascii_uppercase(); }
            }
        }
        c
    }).collect()
}

// 2. Solana
fn derive_solana_address_at(seed: &[u8], index: u32) -> Result<String, String> {
    let key = slip10_derive_ed25519(seed, &[44, 501, index, 0])?;
    let sk = ed25519_dalek::SigningKey::from_bytes(&key);
    let pk = ed25519_dalek::VerifyingKey::from(&sk);
    Ok(bs58::encode(pk.as_bytes()).into_string())
}

// 3. Bitcoin (BIP-84 segwit)
fn derive_bitcoin_address_at(seed: &[u8], index: u32) -> Result<String, String> {
    let path = format!("m/84'/0'/0'/0/{}", index);
    let (_, _, compressed) = get_secp256k1_pubkey(seed, &path)?;
    let sha_hash = Sha256::digest(&compressed);
    let pubkey_hash = Ripemd160::digest(&sha_hash);
    let hrp = bech32::Hrp::parse("bc").map_err(|e| format!("bech32: {}", e))?;
    bech32::segwit::encode(hrp, bech32::segwit::VERSION_0, &pubkey_hash)
        .map_err(|e| format!("bech32 encode: {}", e))
}

// 4. Cosmos — generic secp256k1 bech32 address
fn derive_secp_address_at(seed: &[u8], path: &str, hrp: &str) -> Result<String, String> {
    let (_, _, compressed) = get_secp256k1_pubkey(seed, path)?;
    let sha_hash = Sha256::digest(&compressed);
    let pubkey_hash = Ripemd160::digest(&sha_hash);
    let hrp_parsed = bech32::Hrp::parse(hrp).map_err(|e| format!("bech32: {}", e))?;
    bech32::encode::<bech32::Bech32>(hrp_parsed, &pubkey_hash)
        .map_err(|e| format!("bech32 encode: {}", e))
}

// 5. Tron
fn derive_tron_address_at(seed: &[u8], index: u32) -> Result<String, String> {
    let path = format!("m/44'/195'/0'/0/{}", index);
    let (_, uncompressed, _) = get_secp256k1_pubkey(seed, &path)?;
    let pub_bytes = &uncompressed[1..];
    let mut hasher = Keccak256::new();
    hasher.update(pub_bytes);
    let hash = hasher.finalize();
    let addr_bytes = &hash[12..]; // last 20 bytes

    // 0x41 prefix + 20 bytes address
    let mut payload = vec![0x41];
    payload.extend_from_slice(addr_bytes);

    // Base58Check: double SHA256 checksum
    let hash1 = Sha256::digest(&payload);
    let hash2 = Sha256::digest(&hash1);
    payload.extend_from_slice(&hash2[..4]);

    Ok(bs58::encode(&payload).into_string())
}

// 6. Filecoin
fn derive_filecoin_address_at(seed: &[u8], index: u32) -> Result<String, String> {
    use blake2::digest::consts::U20;
    use blake2::digest::consts::U4;
    use blake2::Blake2b;

    let path = format!("m/44'/461'/0'/0/{}", index);
    let (_, uncompressed, _) = get_secp256k1_pubkey(seed, &path)?;

    // blake2b-160 of uncompressed pubkey
    let payload_hash: [u8; 20] = Blake2b::<U20>::digest(&uncompressed).into();

    // Checksum: blake2b-4(protocol_byte || payload)
    let mut checksum_input = vec![0x01u8]; // protocol 1 = secp256k1
    checksum_input.extend_from_slice(&payload_hash);
    let checksum: [u8; 4] = Blake2b::<U4>::digest(&checksum_input).into();

    // base32 encode (payload + checksum), lowercase, no padding
    let mut to_encode = payload_hash.to_vec();
    to_encode.extend_from_slice(&checksum);
    let encoded = data_encoding::BASE32_NOPAD.encode(&to_encode).to_lowercase();

    Ok(format!("f1{}", encoded))
}

// 7. Sui
fn derive_sui_address_at(seed: &[u8], index: u32) -> Result<String, String> {
    use blake2::digest::consts::U32;
    use blake2::Blake2b;

    let key = slip10_derive_ed25519(seed, &[44, 784, index, 0])?;
    let sk = ed25519_dalek::SigningKey::from_bytes(&key);
    let pk = ed25519_dalek::VerifyingKey::from(&sk);

    // flag(0x00 for ed25519) || pubkey
    let mut data = vec![0x00u8];
    data.extend_from_slice(pk.as_bytes());
    let hash: [u8; 32] = Blake2b::<U32>::digest(&data).into();

    Ok(format!("0x{}", hex::encode(hash)))
}

// 8. XRPL
fn derive_xrpl_address_at(seed: &[u8], index: u32) -> Result<String, String> {
    let path = format!("m/44'/144'/0'/0/{}", index);
    let (_, _, compressed) = get_secp256k1_pubkey(seed, &path)?;
    let sha_hash = Sha256::digest(&compressed);
    let account_id = Ripemd160::digest(&sha_hash);

    // XRPL uses version byte 0x00
    let mut payload = vec![0x00u8];
    payload.extend_from_slice(&account_id);

    // Double SHA256 checksum
    let hash1 = Sha256::digest(&payload);
    let hash2 = Sha256::digest(&hash1);
    payload.extend_from_slice(&hash2[..4]);

    // XRPL base58 alphabet
    let alphabet = bs58::Alphabet::new(b"rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz")
        .map_err(|e| format!("XRPL alphabet error: {:?}", e))?;
    Ok(bs58::encode(&payload).with_alphabet(&alphabet).into_string())
}

// 9. Spark
fn derive_spark_address_at(seed: &[u8], index: u32) -> Result<String, String> {
    let path = format!("m/84'/0'/0'/0/{}", index);
    let (_, _, compressed) = get_secp256k1_pubkey(seed, &path)?;
    Ok(format!("spark:{}", hex::encode(&compressed)))
}

// ============================================================
// Get private key for signing
// ============================================================

pub async fn get_private_key(name: &str, password: &str, chain: &str) -> Result<Vec<u8>, JsValue> {
    let wallet_file = load_wallet_file(name).await?;
    let crypto_str = serde_json::to_string(&wallet_file.crypto)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))?;
    let decrypted = crypto::decrypt_keystore(&crypto_str, password).await
        .map_err(|_| JsValue::from_str("Wrong password or corrupted wallet"))?;
    let mnemonic_str = decrypted.as_string()
        .ok_or_else(|| JsValue::from_str("Decrypted value is not a string"))?;
    let mnemonic = Mnemonic::parse_normalized(&mnemonic_str)
        .map_err(|e| JsValue::from_str(&format!("Invalid mnemonic: {}", e)))?;
    let seed = mnemonic.to_seed_normalized("");

    match chain {
        "eip155" | "evm" => {
            let ext = ExtendedPrivKey::derive(&seed, "m/44'/60'/0'/0/0")
                .map_err(|_| JsValue::from_str("EVM derivation failed"))?;
            Ok(ext.secret().to_vec())
        }
        "bip122" | "bitcoin" => {
            let ext = ExtendedPrivKey::derive(&seed, "m/84'/0'/0'/0/0")
                .map_err(|_| JsValue::from_str("Bitcoin derivation failed"))?;
            Ok(ext.secret().to_vec())
        }
        "cosmos" => {
            let ext = ExtendedPrivKey::derive(&seed, "m/44'/118'/0'/0/0")
                .map_err(|_| JsValue::from_str("Cosmos derivation failed"))?;
            Ok(ext.secret().to_vec())
        }
        "solana" => {
            let key = slip10_derive_ed25519(&seed, &[44, 501, 0, 0])
                .map_err(|e| JsValue::from_str(&e))?;
            Ok(key.to_vec())
        }
        "tron" => {
            let ext = ExtendedPrivKey::derive(&seed, "m/44'/195'/0'/0/0")
                .map_err(|_| JsValue::from_str("Tron derivation failed"))?;
            Ok(ext.secret().to_vec())
        }
        "filecoin" => {
            let ext = ExtendedPrivKey::derive(&seed, "m/44'/461'/0'/0/0")
                .map_err(|_| JsValue::from_str("Filecoin derivation failed"))?;
            Ok(ext.secret().to_vec())
        }
        "sui" => {
            let key = slip10_derive_ed25519(&seed, &[44, 784, 0, 0])
                .map_err(|e| JsValue::from_str(&e))?;
            Ok(key.to_vec())
        }
        "xrpl" => {
            let ext = ExtendedPrivKey::derive(&seed, "m/44'/144'/0'/0/0")
                .map_err(|_| JsValue::from_str("XRPL derivation failed"))?;
            Ok(ext.secret().to_vec())
        }
        "spark" => {
            // Same key as Bitcoin
            let ext = ExtendedPrivKey::derive(&seed, "m/84'/0'/0'/0/0")
                .map_err(|_| JsValue::from_str("Spark derivation failed"))?;
            Ok(ext.secret().to_vec())
        }
        _ => Err(JsValue::from_str(&format!("Unsupported chain: {}", chain))),
    }
}
