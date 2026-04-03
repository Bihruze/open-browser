use wasm_bindgen::prelude::*;

#[wasm_bindgen(module = "/js/crypto.js")]
extern "C" {
    #[wasm_bindgen(js_name = encryptKeystore, catch)]
    pub async fn encrypt_keystore(plaintext: &str, password: &str) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(js_name = decryptKeystore, catch)]
    pub async fn decrypt_keystore(crypto_json: &str, password: &str) -> Result<JsValue, JsValue>;
}
