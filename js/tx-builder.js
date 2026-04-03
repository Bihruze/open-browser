// js/tx-builder.js — Transaction builder for ETH transfers
// Implements EIP-1559 (type 2) and legacy transaction encoding

const ETH_RPC = 'https://ethereum-rpc.publicnode.com';

async function jsonRpc(method, params = []) {
  const resp = await fetch(ETH_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.result;
}

// ---- RLP Encoding ----

function rlpEncode(input) {
  if (input instanceof Uint8Array) {
    if (input.length === 1 && input[0] < 0x80) return input;
    return concatBytes(rlpLength(input.length, 0x80), input);
  }
  if (Array.isArray(input)) {
    const encoded = concatAll(input.map(rlpEncode));
    return concatBytes(rlpLength(encoded.length, 0xc0), encoded);
  }
  throw new Error('RLP: unsupported type');
}

function rlpLength(len, offset) {
  if (len < 56) return new Uint8Array([offset + len]);
  const hexLen = numberToBytes(len);
  return concatBytes(new Uint8Array([offset + 55 + hexLen.length]), hexLen);
}

function numberToBytes(n) {
  if (n === 0) return new Uint8Array([]);
  const hex = n.toString(16);
  const padded = hex.length % 2 ? '0' + hex : hex;
  return hexToBytes(padded);
}

function concatBytes(a, b) {
  const r = new Uint8Array(a.length + b.length);
  r.set(a); r.set(b, a.length);
  return r;
}

function concatAll(arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const r = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { r.set(a, offset); offset += a.length; }
  return r;
}

// ---- Hex utils ----

function hexToBytes(hex) {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length === 0) return new Uint8Array([]);
  const padded = clean.length % 2 ? '0' + clean : clean;
  const bytes = new Uint8Array(padded.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(padded.substr(i * 2, 2), 16);
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function bigintToBytes(n) {
  if (n === 0n) return new Uint8Array([]);
  const hex = n.toString(16);
  return hexToBytes(hex);
}

function stripLeadingZeros(bytes) {
  if (bytes.length === 0) return bytes;
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  return bytes.slice(i);
}

// Convert ETH string to wei BigInt without float precision loss
function ethToWei(ethStr) {
  const str = String(ethStr).trim();
  const parts = str.split('.');
  const whole = parts[0] || '0';
  let frac = (parts[1] || '').padEnd(18, '0').slice(0, 18);
  // Remove leading zeros from combined string then parse as BigInt
  const combined = whole + frac;
  return BigInt(combined.replace(/^0+/, '') || '0');
}

// ---- ETH Transaction Building ----

/**
 * Get current gas price and estimate fee for a simple transfer
 */
export async function estimateEthFee() {
  const gasPrice = await jsonRpc('eth_gasPrice');
  const gasPriceWei = BigInt(gasPrice);
  const gasLimit = 21000n; // Simple ETH transfer
  const feeWei = gasPriceWei * gasLimit;

  const feeGwei = Number(gasPriceWei) / 1e9;
  const feeEth = Number(feeWei) / 1e18;

  return {
    gasPrice: gasPrice,
    gasPriceGwei: feeGwei.toFixed(2),
    gasLimit: '21000',
    estimatedFeeEth: feeEth.toFixed(6),
    estimatedFeeWei: feeWei.toString(),
  };
}

/**
 * Build unsigned legacy ETH transfer transaction
 * Returns hex string ready for sign_tx
 */
export async function buildEthTransfer(fromAddress, toAddress, amountEth) {
  // Validate addresses
  if (!toAddress || !toAddress.startsWith('0x') || toAddress.length !== 42) {
    throw new Error('Invalid recipient address');
  }

  // Get nonce
  const nonceHex = await jsonRpc('eth_getTransactionCount', [fromAddress, 'latest']);
  const nonce = BigInt(nonceHex);

  // Get gas price
  const gasPriceHex = await jsonRpc('eth_gasPrice');
  const gasPrice = BigInt(gasPriceHex);

  const gasLimit = 21000n;

  // Convert ETH to wei (avoid float precision loss)
  const amountWei = ethToWei(amountEth);
  if (amountWei <= 0n) throw new Error('Amount must be greater than 0');

  const chainId = 1n; // Ethereum mainnet

  // Legacy transaction fields for signing (EIP-155):
  // [nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0]
  const txFields = [
    stripLeadingZeros(bigintToBytes(nonce)),
    stripLeadingZeros(bigintToBytes(gasPrice)),
    stripLeadingZeros(bigintToBytes(gasLimit)),
    hexToBytes(toAddress),
    stripLeadingZeros(bigintToBytes(amountWei)),
    new Uint8Array([]), // data (empty for simple transfer)
    stripLeadingZeros(bigintToBytes(chainId)),
    new Uint8Array([]), // EIP-155 v placeholder
    new Uint8Array([]), // EIP-155 r placeholder
  ];

  const encoded = rlpEncode(txFields);

  return {
    unsignedTxHex: bytesToHex(encoded),
    nonce: nonce.toString(),
    gasPrice: gasPrice.toString(),
    gasPriceGwei: (Number(gasPrice) / 1e9).toFixed(2),
    gasLimit: gasLimit.toString(),
    amountWei: amountWei.toString(),
    amountEth: amountEth,
    chainId: '1',
    estimatedFeeEth: (Number(gasPrice * gasLimit) / 1e18).toFixed(6),
  };
}

/**
 * Encode signed legacy transaction for broadcast
 * Takes the original tx params + signature from WASM
 */
export function encodeSignedEthTx(txParams, signatureHex) {
  // Parse signature: 64 bytes r+s + 1 byte v
  const sigClean = signatureHex.startsWith('0x') ? signatureHex.slice(2) : signatureHex;
  const sigBytes = hexToBytes(sigClean);

  const r = sigBytes.slice(0, 32);
  const s = sigBytes.slice(32, 64);
  const recoveryBit = sigBytes[64]; // 27 or 28

  // EIP-155: v = chainId * 2 + 35 + recovery_id
  const chainId = BigInt(txParams.chainId);
  const v = chainId * 2n + 35n + BigInt(recoveryBit - 27);

  const nonce = BigInt(txParams.nonce);
  const gasPrice = BigInt(txParams.gasPrice);
  const gasLimit = BigInt(txParams.gasLimit);
  const amountWei = BigInt(txParams.amountWei);
  const toAddress = txParams.toAddress;

  const signedFields = [
    stripLeadingZeros(bigintToBytes(nonce)),
    stripLeadingZeros(bigintToBytes(gasPrice)),
    stripLeadingZeros(bigintToBytes(gasLimit)),
    hexToBytes(toAddress),
    stripLeadingZeros(bigintToBytes(amountWei)),
    new Uint8Array([]), // data
    stripLeadingZeros(bigintToBytes(v)),
    stripLeadingZeros(r),
    stripLeadingZeros(s),
  ];

  const encoded = rlpEncode(signedFields);
  return '0x' + bytesToHex(encoded);
}

/**
 * Full ETH send flow: build → sign (via callback) → encode → broadcast
 */
export async function sendEth(fromAddress, toAddress, amountEth, signCallback) {
  // 1. Build unsigned tx
  const txParams = await buildEthTransfer(fromAddress, toAddress, amountEth);

  // 2. Sign with WASM (callback provides sign_tx)
  const signResult = await signCallback(txParams.unsignedTxHex);

  // 3. Encode signed tx
  const signedTxHex = encodeSignedEthTx(
    { ...txParams, toAddress },
    signResult.signature
  );

  // 4. Broadcast
  const txHash = await jsonRpc('eth_sendRawTransaction', [signedTxHex]);

  return {
    txHash,
    explorer: `https://etherscan.io/tx/${txHash}`,
    ...txParams
  };
}
