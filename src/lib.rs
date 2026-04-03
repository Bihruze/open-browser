use wasm_bindgen::prelude::*;

mod wallet;
mod signer;
mod storage;
mod crypto;
mod eip712;

#[wasm_bindgen]
pub async fn create_wallet(name: &str, password: &str) -> Result<JsValue, JsValue> {
    wallet::create(name, password).await
}

#[wasm_bindgen]
pub async fn import_wallet(name: &str, mnemonic: &str, password: &str) -> Result<JsValue, JsValue> {
    wallet::import_mnemonic(name, mnemonic, password).await
}

#[wasm_bindgen]
pub async fn load_wallet(name: &str, password: &str) -> Result<JsValue, JsValue> {
    wallet::load(name, password).await
}

#[wasm_bindgen]
pub async fn list_wallets() -> Result<JsValue, JsValue> {
    wallet::list().await
}

#[wasm_bindgen]
pub async fn export_wallet(name: &str, password: &str) -> Result<JsValue, JsValue> {
    wallet::export_mnemonic(name, password).await
}

#[wasm_bindgen]
pub async fn delete_wallet(name: &str) -> Result<JsValue, JsValue> {
    wallet::delete(name).await
}

#[wasm_bindgen]
pub async fn rename_wallet(old_name: &str, new_name: &str, password: &str) -> Result<JsValue, JsValue> {
    wallet::rename(old_name, new_name, password).await
}

/// Derive additional accounts at a specific index (multi-account support)
#[wasm_bindgen]
pub async fn derive_accounts(name: &str, password: &str, index: u32) -> Result<JsValue, JsValue> {
    wallet::derive_at_index(name, password, index).await
}

#[wasm_bindgen]
pub async fn sign_message(
    wallet_name: &str,
    password: &str,
    chain: &str,
    message: &str,
) -> Result<JsValue, JsValue> {
    signer::sign_message(wallet_name, password, chain, message).await
}

#[wasm_bindgen]
pub async fn sign_typed_data(
    wallet_name: &str,
    password: &str,
    typed_data_json: &str,
) -> Result<JsValue, JsValue> {
    signer::sign_typed_data(wallet_name, password, typed_data_json).await
}

#[wasm_bindgen]
pub async fn sign_tx(
    wallet_name: &str,
    password: &str,
    chain: &str,
    tx_hex: &str,
) -> Result<JsValue, JsValue> {
    signer::sign_tx(wallet_name, password, chain, tx_hex).await
}
