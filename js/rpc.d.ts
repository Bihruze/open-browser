export interface BalanceResult {
  raw: string;
  formatted: string;
  symbol: string;
  error?: string;
  address?: string;
  chain_id?: string;
}

export function getBalance(chain: string, address: string): Promise<BalanceResult>;
export function getAllBalances(accounts: Array<{ chain_id: string; address: string }>): Promise<Record<string, BalanceResult>>;
export function broadcastTx(chain: string, signedTxHex: string): Promise<any>;

export const ENDPOINTS: Record<string, string>;
export const DECIMALS: Record<string, number>;
export const SYMBOLS: Record<string, string>;
