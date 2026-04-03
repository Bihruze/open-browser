// js/key-cache.js — Derived key cache with TTL, LRU eviction, and zeroization
// Matches OWS CLI: TTL 5s, max 32 entries, zeroize on eviction/unload

const MAX_ENTRIES = 32;
const TTL_MS = 5000; // 5 seconds

class KeyCache {
  constructor() {
    this._cache = new Map(); // key: cacheKey, value: { data, expiry, accessTime }
    this._cleanupInterval = setInterval(() => this._evictExpired(), 1000);

    // Graceful zeroization on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.clearAll());
      window.addEventListener('pagehide', () => this.clearAll());
    }
  }

  /**
   * Get cached value or null if expired/missing
   */
  get(cacheKey) {
    const entry = this._cache.get(cacheKey);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this._zeroizeAndDelete(cacheKey);
      return null;
    }

    entry.accessTime = Date.now(); // LRU touch
    return entry.data;
  }

  /**
   * Store a value with TTL
   */
  set(cacheKey, data) {
    // LRU eviction if at capacity
    if (this._cache.size >= MAX_ENTRIES && !this._cache.has(cacheKey)) {
      this._evictLRU();
    }

    this._cache.set(cacheKey, {
      data,
      expiry: Date.now() + TTL_MS,
      accessTime: Date.now(),
    });
  }

  /**
   * Build cache key from inputs (SHA-256 hash of concatenated params)
   */
  static async buildKey(...parts) {
    const combined = parts.join('|');
    const data = new TextEncoder().encode(combined);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Clear all cached keys and zeroize
   */
  clearAll() {
    for (const [key] of this._cache) {
      this._zeroizeAndDelete(key);
    }
  }

  /**
   * Get cache stats
   */
  stats() {
    return {
      entries: this._cache.size,
      maxEntries: MAX_ENTRIES,
      ttlMs: TTL_MS,
    };
  }

  // ---- Internal ----

  _zeroizeAndDelete(cacheKey) {
    const entry = this._cache.get(cacheKey);
    if (entry?.data) {
      // Zeroize if Uint8Array
      if (entry.data instanceof Uint8Array) {
        entry.data.fill(0);
      } else if (typeof entry.data === 'string') {
        // Can't truly zeroize JS strings, but we can dereference
        entry.data = '';
      }
    }
    this._cache.delete(cacheKey);
  }

  _evictExpired() {
    const now = Date.now();
    for (const [key, entry] of this._cache) {
      if (now > entry.expiry) {
        this._zeroizeAndDelete(key);
      }
    }
  }

  _evictLRU() {
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this._cache) {
      if (entry.accessTime < oldestTime) {
        oldestTime = entry.accessTime;
        oldestKey = key;
      }
    }
    if (oldestKey) this._zeroizeAndDelete(oldestKey);
  }

  destroy() {
    this.clearAll();
    clearInterval(this._cleanupInterval);
  }
}

// Singleton instance
export const keyCache = new KeyCache();

/**
 * Cached decrypt — avoids re-running scrypt for repeated operations
 * Returns decrypted mnemonic/key from cache or freshly decrypted
 */
export async function cachedDecrypt(walletName, password, decryptFn) {
  const cacheKey = await KeyCache.buildKey(walletName, password);
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;

  const result = await decryptFn();
  keyCache.set(cacheKey, result);
  return result;
}
