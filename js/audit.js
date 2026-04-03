// js/audit.js — OWS Audit Log
// Append-only operation log stored in IndexedDB
// Compatible with OWS CLI audit.jsonl format

import { openDb } from './db.js';
const AUDIT_STORE = 'audit_log';

/**
 * Log an operation to the audit trail
 */
export async function logOperation(operation, details = {}) {
  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    operation,
    wallet_id: details.wallet_id || null,
    wallet_name: details.wallet_name || null,
    chain: details.chain || null,
    address: details.address || null,
    tx_hash: details.tx_hash || null,
    api_key_id: details.api_key_id || null,
    status: details.status || 'success',
    error: details.error || null,
    metadata: details.metadata || null,
  };

  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIT_STORE, 'readwrite');
      tx.objectStore(AUDIT_STORE).put(entry, entry.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Audit log write failed:', e);
  }

  return entry;
}

/**
 * Get recent audit entries
 */
export async function getAuditLog(limit = 50) {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIT_STORE, 'readonly');
      const req = tx.objectStore(AUDIT_STORE).getAll();
      req.onsuccess = () => {
        const all = req.result || [];
        // Sort by timestamp desc, limit
        all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        resolve(all.slice(0, limit));
      };
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}

/**
 * Export audit log as JSONL (one JSON per line)
 */
export async function exportAuditLog() {
  const entries = await getAuditLog(10000);
  return entries.map(e => JSON.stringify(e)).join('\n');
}

/**
 * Clear audit log
 */
/**
 * Clear audit log — requires explicit confirmation token
 * This is a destructive operation. Pass confirmToken = "CLEAR_AUDIT_LOG" to confirm.
 */
export async function clearAuditLog(confirmToken) {
  if (confirmToken !== 'CLEAR_AUDIT_LOG') {
    throw new Error('Audit log clear requires confirmation token: "CLEAR_AUDIT_LOG"');
  }
  // Log the clear operation itself before clearing
  await logOperation('audit_clear', { status: 'success', metadata: { reason: 'user_requested' } });
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIT_STORE, 'readwrite');
    tx.objectStore(AUDIT_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Operation types
export const OPS = {
  WALLET_CREATE: 'wallet_create',
  WALLET_IMPORT: 'wallet_import',
  WALLET_LOAD: 'wallet_load',
  WALLET_DELETE: 'wallet_delete',
  WALLET_RENAME: 'wallet_rename',
  WALLET_EXPORT: 'wallet_export',
  SIGN_MESSAGE: 'sign_message',
  SIGN_TX: 'sign_tx',
  SIGN_TYPED_DATA: 'sign_typed_data',
  TX_BROADCAST: 'tx_broadcast',
  API_KEY_CREATE: 'api_key_create',
  API_KEY_DELETE: 'api_key_delete',
  API_KEY_USE: 'api_key_use',
  POLICY_CREATE: 'policy_create',
  POLICY_DELETE: 'policy_delete',
  POLICY_DENY: 'policy_deny',
  X402_PAYMENT: 'x402_payment',
  BALANCE_QUERY: 'balance_query',
};

// openAuditDb removed — using centralized db.js
