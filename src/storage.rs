use wasm_bindgen::prelude::*;

#[wasm_bindgen(module = "/js/storage.js")]
extern "C" {
    #[wasm_bindgen(js_name = saveWallet, catch)]
    pub async fn save_wallet(name: &str, wallet_json: &str) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(js_name = getWallet, catch)]
    pub async fn get_wallet(name: &str) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(js_name = listWallets, catch)]
    pub async fn list_wallets() -> Result<JsValue, JsValue>;

    #[wasm_bindgen(js_name = deleteWallet, catch)]
    pub async fn delete_wallet(name: &str) -> Result<JsValue, JsValue>;
}
