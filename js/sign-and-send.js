// js/sign-and-send.js — Unified sign + encode + broadcast pipeline
// One function call: build TX → sign via WASM → encode → broadcast
// Supports ETH transfers (more chains coming)

import { buildEthTransfer, encodeSignedEthTx } from './tx-builder.js';
import { broadcastTx } from './rpc.js';
import { logOperation, OPS } from './audit.js';

/**
 * Sign and send a transfer in one call.
 *
 * @param {string} chain - Chain key (evm, bitcoin, solana, etc.)
 * @param {string} fromAddress - Sender address
 * @param {string} toAddress - Recipient address
 * @param {string} amount - Amount in native units (e.g., "0.1" ETH)
 * @param {function} signTxFn - async (unsignedTxHex) => { signature: "0x..." }
 * @param {object} options - { walletName, auditLog: true }
 * @returns {{ txHash, explorer, chain, amount }}
 */
export async function signAndSend(chain, fromAddress, toAddress, amount, signTxFn, options = {}) {
  let txHash, explorer;

  switch (chain) {
    case 'evm':
    case 'eip155':
    case 'eth': {
      // 1. Build unsigned TX
      const txParams = await buildEthTransfer(fromAddress, toAddress, amount);

      // 2. Sign with WASM
      const signResult = await signTxFn(txParams.unsignedTxHex);
      const sig = typeof signResult === 'string' ? signResult : signResult.signature;

      // 3. Encode signed TX
      const signedTxHex = encodeSignedEthTx({ ...txParams, toAddress }, sig);

      // 4. Broadcast
      txHash = await broadcastTx('evm', signedTxHex);
      explorer = `https://etherscan.io/tx/${txHash}`;
      break;
    }

    // Future: add other chains here
    // case 'solana': { ... }
    // case 'tron': { ... }

    default:
      throw new Error(`sign_and_send not yet supported for chain: ${chain}. Use OWS CLI for this chain.`);
  }

  // Audit log
  if (options.auditLog !== false) {
    await logOperation(OPS.TX_BROADCAST, {
      wallet_name: options.walletName,
      chain,
      address: fromAddress,
      tx_hash: txHash,
      metadata: { to: toAddress, amount },
    });
  }

  return { txHash, explorer, chain, amount, from: fromAddress, to: toAddress };
}
