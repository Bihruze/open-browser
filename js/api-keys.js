// js/api-keys.js — OWS API Key System
// Token-based wallet access with HKDF-SHA256 encryption
// Compatible with OWS CLI api key format

const TOKEN_PREFIX = 'ows_key_';
const HKDF_INFO = 'ows-api-key-v1';
const HKDF_DKLEN = 32;
import { openDb } from './db.js';
const KEYS_STORE = 'api_keys';

/**
 * Generate a new API key token
 * Format: ows_key_ + 64 hex chars (256 bits entropy)
 */
export function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return TOKEN_PREFIX + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a token with SHA-256 for storage (never store raw token)
 */
export async function hashToken(token) {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Encrypt wallet secret using HKDF-SHA256 (not scrypt)
 * Used for API key re-encryption
 */
export async function encryptWithHkdf(plaintext, token) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // HKDF-SHA256 key derivation
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(token), 'HKDF', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(HKDF_INFO) },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 }, key, enc.encode(plaintext)
  );

  const full = new Uint8Array(ciphertextBuf);
  const cipherBytes = full.slice(0, full.length - 16);
  const authTag = full.slice(full.length - 16);

  return {
    cipher: 'aes-256-gcm',
    cipherparams: { iv: toHex(iv) },
    ciphertext: toHex(cipherBytes),
    auth_tag: toHex(authTag),
    kdf: 'hkdf-sha256',
    kdfparams: { dklen: HKDF_DKLEN, salt: toHex(salt), info: HKDF_INFO },
  };
}

/**
 * Decrypt with HKDF-SHA256
 */
export async function decryptWithHkdf(envelope, token) {
  const enc = new TextEncoder();
  const salt = fromHex(envelope.kdfparams.salt);
  const iv = fromHex(envelope.cipherparams.iv);
  const cipherBytes = fromHex(envelope.ciphertext);
  const authTag = fromHex(envelope.auth_tag);

  if (envelope.kdfparams.dklen !== HKDF_DKLEN) throw new Error('Invalid HKDF dklen');

  const fullCiphertext = new Uint8Array(cipherBytes.length + authTag.length);
  fullCiphertext.set(cipherBytes);
  fullCiphertext.set(authTag, cipherBytes.length);

  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(token), 'HKDF', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(envelope.kdfparams.info || HKDF_INFO) },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 }, key, fullCiphertext
  );
  return new TextDecoder().decode(plaintext);
}

/**
 * Create an API key for a wallet
 * Returns { token, keyFile } — token shown once to user
 */
export async function createApiKey(name, walletName, walletSecret, policyIds = [], expiresAt = null) {
  const token = generateToken();
  const tokenHash = await hashToken(token);

  // Re-encrypt wallet secret under HKDF(token)
  const encryptedSecret = await encryptWithHkdf(walletSecret, token);

  const keyFile = {
    id: crypto.randomUUID(),
    name,
    token_hash: tokenHash,
    created_at: new Date().toISOString(),
    wallet_ids: [walletName],
    policy_ids: policyIds,
    expires_at: expiresAt,
    wallet_secrets: { [walletName]: encryptedSecret },
  };

  // Save to IndexedDB
  await saveApiKey(keyFile);

  return { token, keyFile };
}

/**
 * Lookup API key by token
 */
export async function lookupApiKey(token) {
  const tokenHash = await hashToken(token);
  const keys = await listApiKeys();
  // Constant-time comparison to prevent timing attacks
  const found = keys.find(k => constantTimeEqual(k.token_hash, tokenHash));
  if (!found) throw new Error('API key not found');

  // Check expiry
  if (found.expires_at && new Date(found.expires_at) < new Date()) {
    throw new Error('API key has expired');
  }

  return found;
}

/**
 * Decrypt wallet secret using API key token
 */
export async function decryptWithApiKey(token, walletName) {
  const keyFile = await lookupApiKey(token);

  if (!keyFile.wallet_ids.includes(walletName)) {
    throw new Error(`API key does not have access to wallet "${walletName}"`);
  }

  const envelope = keyFile.wallet_secrets[walletName];
  if (!envelope) throw new Error('No encrypted secret for this wallet');

  return decryptWithHkdf(envelope, token);
}

/**
 * Sign typed data (EIP-712) using an API key token
 * Decrypts wallet secret via HKDF, derives key, signs
 * @param {string} token - ows_key_... token
 * @param {string} walletName - wallet to sign with
 * @param {string} typedDataJson - EIP-712 JSON
 * @param {function} signFn - async (mnemonic, typedDataJson) => signature
 * @returns {object} signature result
 */
export async function signTypedDataWithApiKey(token, walletName, typedDataJson, signFn) {
  const keyFile = await lookupApiKey(token);

  // Check wallet scope
  if (!keyFile.wallet_ids.includes(walletName)) {
    throw new Error(`API key does not have access to wallet "${walletName}"`);
  }

  // Decrypt wallet secret
  const secret = await decryptWithApiKey(token, walletName);

  // Delegate to sign function (caller provides WASM bridge)
  return signFn(secret, typedDataJson);
}

/**
 * Sign message using an API key token
 */
export async function signMessageWithApiKey(token, walletName, chain, message, signFn) {
  const keyFile = await lookupApiKey(token);

  if (!keyFile.wallet_ids.includes(walletName)) {
    throw new Error(`API key does not have access to wallet "${walletName}"`);
  }

  const secret = await decryptWithApiKey(token, walletName);
  return signFn(secret, chain, message);
}

// ---- IndexedDB storage for API keys ----

async function saveApiKey(keyFile) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEYS_STORE, 'readwrite');
    tx.objectStore(KEYS_STORE).put(JSON.stringify(keyFile), keyFile.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listApiKeys() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEYS_STORE, 'readonly');
    const store = tx.objectStore(KEYS_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result || []).map(r => JSON.parse(r)));
    req.onerror = () => reject(req.error);
  });
}

export async function deleteApiKey(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEYS_STORE, 'readwrite');
    tx.objectStore(KEYS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function fromHex(hex) {
  return new Uint8Array(hex.match(/.{2}/g).map(b => parseInt(b, 16)));
}
