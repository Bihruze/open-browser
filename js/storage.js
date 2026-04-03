// js/storage.js — IndexedDB wrapper for OWS wallet storage
// NOTE: This file is bundled by wasm_bindgen, cannot use ES imports.
// Uses self-contained openDb with version 3 matching db.js

const DB_NAME = "ows-vault";
const STORE_NAME = "wallets";
const DB_VERSION = 4;

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('wallets')) db.createObjectStore('wallets');
            if (!db.objectStoreNames.contains('api_keys')) db.createObjectStore('api_keys');
            if (!db.objectStoreNames.contains('policies')) db.createObjectStore('policies');
            if (!db.objectStoreNames.contains('audit_log')) db.createObjectStore('audit_log');
            if (!db.objectStoreNames.contains('agents')) db.createObjectStore('agents');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function saveWallet(name, walletJson) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(walletJson, name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getWallet(name) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(name);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

export async function listWallets() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).getAllKeys();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function deleteWallet(name) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
