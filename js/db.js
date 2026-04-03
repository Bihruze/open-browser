// js/db.js — Centralized IndexedDB connection
// Single DB version, single upgrade handler — prevents data loss

const DB_NAME = 'ows-vault';
const DB_VERSION = 4;

let dbInstance = null;

export function openDb() {
  if (dbInstance) return Promise.resolve(dbInstance);

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
    req.onsuccess = () => { dbInstance = req.result; resolve(dbInstance); };
    req.onerror = () => reject(req.error);
  });
}
