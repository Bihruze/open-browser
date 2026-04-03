export interface CacheStats {
  entries: number;
  maxEntries: number;
  ttlMs: number;
}

export interface KeyCacheInstance {
  get(cacheKey: string): any;
  set(cacheKey: string, data: any): void;
  clearAll(): void;
  stats(): CacheStats;
  destroy(): void;
}

export const keyCache: KeyCacheInstance;
export function cachedDecrypt(walletName: string, password: string, decryptFn: () => Promise<any>): Promise<any>;
