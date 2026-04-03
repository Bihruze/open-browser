// js/price.js — CoinGecko price data with 30s cache

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price';
const COIN_IDS = {
  eth: 'ethereum', eip155: 'ethereum', evm: 'ethereum',
  btc: 'bitcoin', bip122: 'bitcoin', bitcoin: 'bitcoin',
  sol: 'solana', solana: 'solana',
  atom: 'cosmos', cosmos: 'cosmos',
  trx: 'tron', tron: 'tron',
  sui: 'sui',
  ton: 'the-open-network',
  xrp: 'ripple', xrpl: 'ripple',
  fil: 'filecoin', filecoin: 'filecoin',
  spark: 'bitcoin',
};

let priceCache = {};
let lastFetch = 0;
const CACHE_TTL = 30000; // 30 seconds

export async function fetchPrices() {
  const now = Date.now();
  if (now - lastFetch < CACHE_TTL && Object.keys(priceCache).length > 0) {
    return priceCache;
  }

  try {
    const ids = 'bitcoin,ethereum,solana,cosmos,tron,sui,the-open-network,ripple,filecoin';
    const resp = await fetch(`${COINGECKO_URL}?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
    if (!resp.ok) throw new Error(`CoinGecko error: ${resp.status}`);
    const data = await resp.json();

    priceCache = {};
    for (const [id, val] of Object.entries(data)) {
      priceCache[id] = {
        usd: val.usd || 0,
        change24h: val.usd_24h_change || 0,
      };
    }
    lastFetch = now;
  } catch (e) {
    console.warn('Price fetch failed:', e.message);
    // Return stale cache on error
  }

  return priceCache;
}

export function getPrice(chain) {
  const geckoId = COIN_IDS[chain];
  if (!geckoId || !priceCache[geckoId]) return { usd: 0, change24h: 0 };
  return priceCache[geckoId];
}

export function formatUSD(amount) {
  if (!amount || amount === 0) return '$0.00';
  if (amount < 0.01) return '<$0.01';
  return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export { COIN_IDS };
