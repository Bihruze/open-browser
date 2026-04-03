// js/rpc.js — Mainnet RPC for all 9 chains
// Balance queries + transaction broadcast

const ENDPOINTS = {
  eth:      'https://ethereum-rpc.publicnode.com',
  btc:      'https://mempool.space/api',
  sol:      'https://api.mainnet-beta.solana.com',
  atom:     'https://cosmos-rest.publicnode.com',
  trx:      'https://api.trongrid.io',
  sui:      'https://fullnode.mainnet.sui.io:443',
  ton:      'https://toncenter.com/api/v2',
  xrp:      'https://xrplcluster.com',
  fil:      'https://api.node.glif.io/rpc/v1',
};

const DECIMALS = {
  eth: 18, btc: 8, sol: 9, atom: 6, trx: 6, sui: 9, ton: 9, xrp: 6, fil: 18
};

const SYMBOLS = {
  eth: 'ETH', btc: 'BTC', sol: 'SOL', atom: 'ATOM', trx: 'TRX',
  sui: 'SUI', ton: 'TON', xrp: 'XRP', fil: 'FIL', spark: 'BTC'
};

function formatBalance(raw, decimals) {
  if (!raw || raw === '0') return '0';
  const s = raw.padStart(decimals + 1, '0');
  const intPart = s.slice(0, s.length - decimals) || '0';
  const decPart = s.slice(s.length - decimals).replace(/0+$/, '');
  return decPart ? `${intPart}.${decPart}` : intPart;
}

async function jsonRpc(url, method, params = []) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.result;
}

// ---- Per-chain balance functions ----

async function getBalanceETH(address) {
  const result = await jsonRpc(ENDPOINTS.eth, 'eth_getBalance', [address, 'latest']);
  const wei = BigInt(result).toString();
  return { raw: wei, formatted: formatBalance(wei, 18), symbol: 'ETH' };
}

async function getBalanceBTC(address) {
  const resp = await fetch(`${ENDPOINTS.btc}/address/${address}`);
  if (!resp.ok) throw new Error(`BTC API error: ${resp.status}`);
  const data = await resp.json();
  const funded = BigInt(data.chain_stats?.funded_txo_sum || 0);
  const spent = BigInt(data.chain_stats?.spent_txo_sum || 0);
  const sats = (funded - spent).toString();
  return { raw: sats, formatted: formatBalance(sats, 8), symbol: 'BTC' };
}

async function getBalanceSOL(address) {
  const result = await jsonRpc(ENDPOINTS.sol, 'getBalance', [address]);
  const lamports = String(result?.value || 0);
  return { raw: lamports, formatted: formatBalance(lamports, 9), symbol: 'SOL' };
}

async function getBalanceATOM(address) {
  const resp = await fetch(`${ENDPOINTS.atom}/cosmos/bank/v1beta1/balances/${address}`);
  if (!resp.ok) throw new Error(`Cosmos API error: ${resp.status}`);
  const data = await resp.json();
  const uatom = data.balances?.find(b => b.denom === 'uatom')?.amount || '0';
  return { raw: uatom, formatted: formatBalance(uatom, 6), symbol: 'ATOM' };
}

async function getBalanceTRX(address) {
  const resp = await fetch(`${ENDPOINTS.trx}/wallet/getaccount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, visible: true })
  });
  if (!resp.ok) throw new Error(`Tron API error: ${resp.status}`);
  const data = await resp.json();
  const sun = String(data.balance || 0);
  return { raw: sun, formatted: formatBalance(sun, 6), symbol: 'TRX' };
}

async function getBalanceSUI(address) {
  const result = await jsonRpc(ENDPOINTS.sui, 'suix_getBalance', [address, '0x2::sui::SUI']);
  const mist = result?.totalBalance || '0';
  return { raw: mist, formatted: formatBalance(mist, 9), symbol: 'SUI' };
}

async function getBalanceTON(address) {
  const resp = await fetch(`${ENDPOINTS.ton}/getAddressBalance?address=${encodeURIComponent(address)}`);
  if (!resp.ok) throw new Error(`TON API error: ${resp.status}`);
  const data = await resp.json();
  const nanoton = String(data.result || 0);
  return { raw: nanoton, formatted: formatBalance(nanoton, 9), symbol: 'TON' };
}

async function getBalanceXRP(address) {
  const result = await jsonRpc(ENDPOINTS.xrp, 'account_info', [{ account: address, ledger_index: 'validated' }]);
  if (result?.error === 'actNotFound') return { raw: '0', formatted: '0', symbol: 'XRP' };
  const drops = result?.account_data?.Balance || '0';
  return { raw: drops, formatted: formatBalance(drops, 6), symbol: 'XRP' };
}

async function getBalanceFIL(address) {
  const result = await jsonRpc(ENDPOINTS.fil, 'Filecoin.WalletBalance', [address]);
  const attoFil = result || '0';
  return { raw: attoFil, formatted: formatBalance(attoFil, 18), symbol: 'FIL' };
}

// ---- Unified API ----

const BALANCE_FNS = {
  evm: getBalanceETH, eip155: getBalanceETH, eth: getBalanceETH,
  bitcoin: getBalanceBTC, bip122: getBalanceBTC, btc: getBalanceBTC,
  solana: getBalanceSOL, sol: getBalanceSOL,
  cosmos: getBalanceATOM, atom: getBalanceATOM,
  tron: getBalanceTRX, trx: getBalanceTRX,
  sui: getBalanceSUI,
  ton: getBalanceTON,
  xrpl: getBalanceXRP, xrp: getBalanceXRP,
  filecoin: getBalanceFIL, fil: getBalanceFIL,
};

export async function getBalance(chain, address) {
  const fn = BALANCE_FNS[chain];
  if (!fn) return { raw: '0', formatted: '0', symbol: chain.toUpperCase(), error: 'Unsupported' };
  try {
    return await fn(address);
  } catch (e) {
    return { raw: '0', formatted: '0', symbol: SYMBOLS[chain] || chain.toUpperCase(), error: e.message };
  }
}

export async function getAllBalances(accounts) {
  const results = {};
  const promises = accounts.map(async (acc) => {
    const chainKey = acc.chain_id?.split(':')[0] || '';
    const bal = await getBalance(chainKey, acc.address);
    results[chainKey] = { ...bal, address: acc.address, chain_id: acc.chain_id };
  });
  await Promise.allSettled(promises);
  return results;
}

// ---- Broadcast signed TX ----

export async function broadcastTx(chain, signedTxHex) {
  switch (chain) {
    case 'evm': case 'eip155': case 'eth':
      return jsonRpc(ENDPOINTS.eth, 'eth_sendRawTransaction', [`0x${signedTxHex}`]);
    case 'bitcoin': case 'bip122': case 'btc': {
      const resp = await fetch(`${ENDPOINTS.btc}/tx`, { method: 'POST', body: signedTxHex });
      return resp.text();
    }
    case 'solana': case 'sol':
      return jsonRpc(ENDPOINTS.sol, 'sendTransaction', [signedTxHex, { encoding: 'base64' }]);
    case 'tron': case 'trx': {
      const resp = await fetch(`${ENDPOINTS.trx}/wallet/broadcasttransaction`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: signedTxHex
      });
      return resp.json();
    }
    case 'sui': {
      const [txBytes, sig] = JSON.parse(signedTxHex);
      return jsonRpc(ENDPOINTS.sui, 'sui_executeTransactionBlock', [txBytes, [sig], { showEffects: true }, 'WaitForLocalExecution']);
    }
    case 'xrpl': case 'xrp':
      return jsonRpc(ENDPOINTS.xrp, 'submit', [{ tx_blob: signedTxHex }]);
    case 'filecoin': case 'fil':
      return jsonRpc(ENDPOINTS.fil, 'Filecoin.MpoolPush', [JSON.parse(signedTxHex)]);
    default:
      throw new Error(`Broadcast not supported for ${chain}`);
  }
}

export { ENDPOINTS, DECIMALS, SYMBOLS };
