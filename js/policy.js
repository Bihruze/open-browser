// js/policy.js — OWS Policy Engine
// Declarative rules: allowed_chains, expires_at, max_daily_spend
// Compatible with OWS CLI policy format

import { openDb } from './db.js';
const POLICIES_STORE = 'policies';

/**
 * Policy structure:
 * {
 *   id: string,
 *   name: string,
 *   version: 1,
 *   created_at: string (ISO 8601),
 *   rules: PolicyRule[],
 *   action: "deny"
 * }
 *
 * PolicyRule variants:
 * { type: "allowed_chains", chain_ids: ["eip155:1", "solana:..."] }
 * { type: "expires_at", timestamp: "2025-12-31T23:59:59Z" }
 * { type: "max_daily_spend", amount: "1000000", asset: "usd" }
 */

/**
 * Evaluate policies against a context. Returns { allow, reason, policy_id }
 * AND semantics: ALL policies must pass, first denial stops.
 */
export function evaluatePolicies(policies, context) {
  for (const policy of policies) {
    const result = evaluateOne(policy, context);
    if (!result.allow) return result;
  }
  return { allow: true, reason: null, policy_id: null };
}

function evaluateOne(policy, context) {
  for (const rule of policy.rules) {
    switch (rule.type) {
      case 'allowed_chains': {
        if (!rule.chain_ids.includes(context.chain_id)) {
          return {
            allow: false,
            reason: `Chain "${context.chain_id}" is not in the allowed list: [${rule.chain_ids.join(', ')}]`,
            policy_id: policy.id,
          };
        }
        break;
      }

      case 'expires_at': {
        if (context.timestamp > rule.timestamp) {
          return {
            allow: false,
            reason: `Policy expired at ${rule.timestamp}`,
            policy_id: policy.id,
          };
        }
        break;
      }

      case 'max_daily_spend': {
        const dailyTotal = parseFloat(context.spending?.daily_total || '0');
        const txAmount = parseFloat(context.transaction?.value || '0');
        const limit = parseFloat(rule.amount);
        if (dailyTotal + txAmount > limit) {
          return {
            allow: false,
            reason: `Daily spending limit exceeded (${dailyTotal + txAmount} > ${limit} ${rule.asset || ''})`,
            policy_id: policy.id,
          };
        }
        break;
      }

      default:
        // Fail-closed: unknown rule types are denied for security
        return {
          allow: false,
          reason: `Unknown policy rule type: "${rule.type}". Denied for safety.`,
          policy_id: policy.id,
        };
    }
  }

  return { allow: true, reason: null, policy_id: null };
}

/**
 * Build a policy context for evaluation
 */
export function buildPolicyContext(chainId, walletId, apiKeyId, transaction = {}, spending = {}) {
  return {
    chain_id: chainId,
    wallet_id: walletId,
    api_key_id: apiKeyId,
    transaction: {
      to: transaction.to || null,
      value: transaction.value || null,
      raw_hex: transaction.raw_hex || '',
      data: transaction.data || null,
    },
    spending: {
      daily_total: spending.daily_total || '0',
      date: spending.date || new Date().toISOString().split('T')[0],
    },
    timestamp: new Date().toISOString(),
  };
}

// ---- CRUD for policies ----

export function createPolicy(name, rules) {
  return {
    id: crypto.randomUUID(),
    name,
    version: 1,
    created_at: new Date().toISOString(),
    rules,
    action: 'deny',
  };
}


export async function savePolicy(policy) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(POLICIES_STORE, 'readwrite');
    tx.objectStore(POLICIES_STORE).put(JSON.stringify(policy), policy.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listPolicies() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(POLICIES_STORE, 'readonly');
    const req = tx.objectStore(POLICIES_STORE).getAll();
    req.onsuccess = () => resolve((req.result || []).map(r => JSON.parse(r)));
    req.onerror = () => reject(req.error);
  });
}

export async function getPolicy(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(POLICIES_STORE, 'readonly');
    const req = tx.objectStore(POLICIES_STORE).get(id);
    req.onsuccess = () => resolve(req.result ? JSON.parse(req.result) : null);
    req.onerror = () => reject(req.error);
  });
}

export async function deletePolicy(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(POLICIES_STORE, 'readwrite');
    tx.objectStore(POLICIES_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
