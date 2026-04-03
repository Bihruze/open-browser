export interface PriceData {
  usd: number;
  change24h: number;
}

export function fetchPrices(): Promise<Record<string, PriceData>>;
export function getPrice(chain: string): PriceData;
export function formatUSD(amount: number): string;

export const COIN_IDS: Record<string, string>;
