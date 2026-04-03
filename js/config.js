// js/config.js — OWS Config System + Vault Backup/Restore
// Custom RPC endpoints, vault export/import

const CONFIG_KEY = 'ows-config';

// Default mainnet RPC endpoints
const DEFAULT_RPCS = {
  'eip155:1': 'https://ethereum-rpc.publicnode.com',
  'eip155:137': 'https://polygon-rpc.com',
  'eip155:42161': 'https://arb1.arbitrum.io/rpc',
  'eip155:10': 'https://mainnet.optimism.io',
  'eip155:8453': 'https://mainnet.base.org',
  'eip155:56': 'https://bsc-dataseed.binance.org',
  'eip155:43114': 'https://api.avax.network/ext/bc/C/rpc',
  'solana:mainnet': 'https://api.mainnet-beta.solana.com',
  'bip122:mainnet': 'https://mempool.space/api',
  'cosmos:cosmoshub-4': 'https://cosmos-rest.publicnode.com',
  'tron:mainnet': 'https://api.trongrid.io',
  'sui:mainnet': 'https://fullnode.mainnet.sui.io:443',
  'ton:mainnet': 'https://toncenter.com/api/v2',
  'xrpl:mainnet': 'https://xrplcluster.com',
  'filecoin:mainnet': 'https://api.node.glif.io/rpc/v1',
};

/**
 * Get current config (merged with defaults)
 */
export function getConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    return {
      rpcs: { ...DEFAULT_RPCS, ...(stored.rpcs || {}) },
      currency: stored.currency || 'usd',
      language: stored.language || 'en',
      autoRefresh: stored.autoRefresh !== false,
      refreshInterval: stored.refreshInterval || 30000,
    };
  } catch {
    return { rpcs: DEFAULT_RPCS, currency: 'usd', language: 'en', autoRefresh: true, refreshInterval: 30000 };
  }
}

/**
 * Update config (merge semantics)
 */
export function updateConfig(updates) {
  const current = getConfig();
  const merged = { ...current, ...updates };
  if (updates.rpcs) merged.rpcs = { ...current.rpcs, ...updates.rpcs };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
  return merged;
}

/**
 * Get RPC endpoint for a chain
 */
export function getRpcUrl(chainId) {
  const config = getConfig();
  return config.rpcs[chainId] || DEFAULT_RPCS[chainId] || null;
}

/**
 * Reset config to defaults
 */
export function resetConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

// ============================================================
// VAULT BACKUP / RESTORE
// ============================================================

import { openDb } from './db.js';

/**
 * Export entire vault as encrypted JSON backup
 * Returns a downloadable JSON string
 */
export async function exportVaultBackup() {
  const db = await openDb();
  const backup = { version: 2, created_at: new Date().toISOString(), stores: {} };

  const storeNames = Array.from(db.objectStoreNames);
  for (const storeName of storeNames) {
    backup.stores[storeName] = await getAllFromStore(db, storeName);
  }

  return JSON.stringify(backup, null, 2);
}

/**
 * Import vault from backup JSON
 * WARNING: Overwrites existing data
 */
export async function importVaultBackup(backupJson) {
  const backup = JSON.parse(backupJson);
  if (!backup.version || !backup.stores) {
    throw new Error('Invalid backup format');
  }

  const db = await openDb();

  for (const [storeName, entries] of Object.entries(backup.stores)) {
    if (!db.objectStoreNames.contains(storeName)) continue;

    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      for (const [key, value] of Object.entries(entries)) {
        store.put(value, key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  return { restored: Object.keys(backup.stores), created_at: backup.created_at };
}

/**
 * Download backup as file
 */
export function downloadBackup(jsonStr, filename = 'ows-vault-backup.json') {
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- DB helpers ----
// openDb imported from db.js

function getAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const entries = {};
    const cursor = store.openCursor();
    cursor.onsuccess = (e) => {
      const c = e.target.result;
      if (c) { entries[c.key] = c.value; c.continue(); }
      else resolve(entries);
    };
    cursor.onerror = () => reject(cursor.error);
  });
}

export { DEFAULT_RPCS };
