// js/history.js — Transaction history for all 9 chains (mainnet)

import { ENDPOINTS } from './rpc.js';

async function jsonRpc(url, method, params = []) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

function shortAddr(addr) {
  if (!addr) return '';
  return addr.length > 16 ? addr.slice(0, 8) + '...' + addr.slice(-6) : addr;
}

// ---- Per-chain history ----

async function historyETH(address) {
  // Public RPC doesn't have tx history. Use Etherscan-like free API
  // Fallback: return empty with note
  return { txs: [], note: 'Use Etherscan to view full history' };
}

async function historyBTC(address) {
  const resp = await fetch(`${ENDPOINTS.btc}/address/${address}/txs`);
  if (!resp.ok) return { txs: [] };
  const data = await resp.json();
  return {
    txs: data.slice(0, 20).map(tx => ({
      hash: tx.txid,
      time: tx.status?.block_time ? new Date(tx.status.block_time * 1000).toISOString() : 'pending',
      confirmed: tx.status?.confirmed || false,
      fee: tx.fee,
      explorer: `https://mempool.space/tx/${tx.txid}`
    }))
  };
}

async function historySOL(address) {
  const sigs = await jsonRpc(ENDPOINTS.sol, 'getSignaturesForAddress', [address, { limit: 20 }]);
  return {
    txs: (sigs || []).map(s => ({
      hash: s.signature,
      time: s.blockTime ? new Date(s.blockTime * 1000).toISOString() : '',
      confirmed: s.confirmationStatus === 'finalized',
      error: s.err ? true : false,
      explorer: `https://solscan.io/tx/${s.signature}`
    }))
  };
}

async function historyATOM(address) {
  try {
    const resp = await fetch(`${ENDPOINTS.atom}/cosmos/tx/v1beta1/txs?events=transfer.sender%3D%27${address}%27&order_by=2&pagination.limit=20`);
    if (!resp.ok) return { txs: [] };
    const data = await resp.json();
    return {
      txs: (data.tx_responses || []).map(tx => ({
        hash: tx.txhash,
        time: tx.timestamp || '',
        confirmed: tx.code === 0,
        height: tx.height,
        explorer: `https://www.mintscan.io/cosmos/tx/${tx.txhash}`
      }))
    };
  } catch { return { txs: [] }; }
}

async function historyTRX(address) {
  const resp = await fetch(`${ENDPOINTS.trx}/v1/accounts/${address}/transactions?limit=20`);
  if (!resp.ok) return { txs: [] };
  const data = await resp.json();
  return {
    txs: (data.data || []).map(tx => ({
      hash: tx.txID,
      time: tx.block_timestamp ? new Date(tx.block_timestamp).toISOString() : '',
      confirmed: tx.ret?.[0]?.contractRet === 'SUCCESS',
      explorer: `https://tronscan.org/#/transaction/${tx.txID}`
    }))
  };
}

async function historySUI(address) {
  try {
    const result = await jsonRpc(ENDPOINTS.sui, 'suix_queryTransactionBlocks', [
      { filter: { FromAddress: address } }, null, 20, true
    ]);
    return {
      txs: (result?.data || []).map(tx => ({
        hash: tx.digest,
        time: tx.timestampMs ? new Date(Number(tx.timestampMs)).toISOString() : '',
        confirmed: tx.effects?.status?.status === 'success',
        explorer: `https://suiscan.xyz/mainnet/tx/${tx.digest}`
      }))
    };
  } catch { return { txs: [] }; }
}

async function historyTON(address) {
  const resp = await fetch(`${ENDPOINTS.ton}/getTransactions?address=${encodeURIComponent(address)}&limit=20`);
  if (!resp.ok) return { txs: [] };
  const data = await resp.json();
  return {
    txs: (data.result || []).map(tx => ({
      hash: tx.transaction_id?.hash || '',
      time: tx.utime ? new Date(tx.utime * 1000).toISOString() : '',
      confirmed: true,
      fee: tx.fee,
      explorer: `https://tonscan.org/tx/${tx.transaction_id?.hash}`
    }))
  };
}

async function historyXRP(address) {
  try {
    const result = await jsonRpc(ENDPOINTS.xrp, 'account_tx', [{
      account: address, ledger_index_min: -1, ledger_index_max: -1, limit: 20
    }]);
    return {
      txs: (result?.transactions || []).map(tx => ({
        hash: tx.tx?.hash || tx.tx_blob,
        time: tx.tx?.date ? new Date((tx.tx.date + 946684800) * 1000).toISOString() : '',
        confirmed: tx.validated || false,
        type: tx.tx?.TransactionType || '',
        explorer: `https://xrpscan.com/tx/${tx.tx?.hash}`
      }))
    };
  } catch { return { txs: [] }; }
}

async function historyFIL(address) {
  try {
    const resp = await fetch(`https://filfox.info/api/v1/address/${address}/messages?pageSize=20&page=0`);
    if (!resp.ok) return { txs: [] };
    const data = await resp.json();
    return {
      txs: (data.messages || []).map(tx => ({
        hash: tx.cid,
        time: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : '',
        confirmed: tx.receipt?.exitCode === 0,
        explorer: `https://filfox.info/en/message/${tx.cid}`
      }))
    };
  } catch { return { txs: [] }; }
}

// ---- Unified API ----

const HISTORY_FNS = {
  eip155: historyETH, evm: historyETH, eth: historyETH,
  bip122: historyBTC, bitcoin: historyBTC, btc: historyBTC,
  solana: historySOL, sol: historySOL,
  cosmos: historyATOM, atom: historyATOM,
  tron: historyTRX, trx: historyTRX,
  sui: historySUI,
  ton: historyTON,
  xrpl: historyXRP, xrp: historyXRP,
  filecoin: historyFIL, fil: historyFIL,
};

export async function getHistory(chain, address) {
  const fn = HISTORY_FNS[chain];
  if (!fn) return { txs: [], note: 'History not available for this chain' };
  try {
    return await fn(address);
  } catch (e) {
    return { txs: [], error: e.message };
  }
}
