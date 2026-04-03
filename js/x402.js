// js/x402.js — X402 Payment Protocol (HTTP 402 Payment Required)
// Implements EIP-3009 TransferWithAuthorization for USDC payments
// Compatible with OWS CLI x402 implementation

/**
 * Make a fetch request with automatic X402 payment handling.
 * If server responds with 402, sign payment and retry.
 *
 * @param {string} url - The URL to fetch
 * @param {object} options - Standard fetch options
 * @param {object} wallet - { address, signTypedData(json) => signature }
 * @returns {Response} Final response after payment (if needed)
 */
export async function fetchWithPayment(url, options = {}, wallet) {
  // First request — no payment header
  const resp = await fetch(url, options);

  if (resp.status !== 402) return resp;

  // Parse 402 payment requirements
  const requirements = await parsePaymentRequired(resp);
  if (!requirements || requirements.length === 0) {
    throw new Error('402 received but no payment requirements found');
  }

  // Find a requirement we can fulfill (scheme: "exact", EVM network)
  const req = requirements.find(r =>
    r.scheme === 'exact' && r.network?.startsWith('eip155:')
  );
  if (!req) {
    throw new Error('No supported payment scheme found (need scheme:"exact" on EVM)');
  }

  // Build and sign payment
  const payload = await buildPayment(req, wallet);

  // Retry with payment header
  const paymentB64 = btoa(JSON.stringify(payload));
  const retryOptions = { ...options, headers: { ...(options.headers || {}) } };
  retryOptions.headers['X-PAYMENT'] = paymentB64;
  retryOptions.headers['payment-signature'] = paymentB64;

  return fetch(url, retryOptions);
}

/**
 * Parse 402 response for payment requirements
 */
async function parsePaymentRequired(resp) {
  // Try v2 header first, then v1
  const headerV2 = resp.headers.get('payment-required');
  const headerV1 = resp.headers.get('x-payment-required');
  const header = headerV2 || headerV1;

  let parsed;

  if (header) {
    try {
      const decoded = atob(header);
      parsed = JSON.parse(decoded);
    } catch {
      // Try direct JSON
      try { parsed = JSON.parse(header); } catch {}
    }
  }

  // Fallback: parse response body
  if (!parsed) {
    try {
      const body = await resp.text();
      parsed = JSON.parse(body);
    } catch {}
  }

  if (!parsed) return null;

  // Determine version
  const version = parsed.x402_version || (headerV2 ? 2 : 1);

  return parsed.accepts || [];
}

/**
 * Build EIP-3009 TransferWithAuthorization payment
 */
async function buildPayment(req, wallet) {
  const now = Math.floor(Date.now() / 1000);
  const nonce = '0x' + randomHex(32);
  const chainId = req.network.split(':')[1] || '1';

  // EIP-3009 domain — USDC contract
  const tokenName = req.extra?.name || 'USD Coin';
  const tokenVersion = req.extra?.version || '2';

  // EIP-712 typed data for TransferWithAuthorization
  const typedData = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    domain: {
      name: tokenName,
      version: tokenVersion,
      chainId: chainId,
      verifyingContract: req.asset,
    },
    message: {
      from: wallet.address,
      to: req.pay_to || req.payTo,
      value: req.amount || req.maxAmountRequired,
      validAfter: String(now - 5),
      validBefore: String(now + (req.max_timeout_seconds || req.maxTimeoutSeconds || 30)),
      nonce: nonce,
    },
  };

  // Sign with wallet's EIP-712 signer
  const signature = await wallet.signTypedData(JSON.stringify(typedData));

  // Build payload
  const authorization = {
    from: typedData.message.from,
    to: typedData.message.to,
    value: typedData.message.value,
    validAfter: typedData.message.validAfter,
    validBefore: typedData.message.validBefore,
    nonce: typedData.message.nonce,
  };

  return {
    x402_version: 2,
    scheme: 'exact',
    network: req.network,
    payload: {
      signature: typeof signature === 'string' ? signature : signature.signature,
      authorization,
    },
  };
}

function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a wallet adapter for X402 from our OWS SDK
 */
export function createX402Wallet(address, signTypedDataFn) {
  return {
    address,
    signTypedData: signTypedDataFn,
  };
}

// ============================================================
// X402 SERVICE DISCOVERY
// Discover which services accept X402 payments
// ============================================================

/**
 * Discover X402-enabled services from a directory URL
 * Returns paginated list of services that accept 402 payments
 */
export async function discoverServices(directoryUrl, options = {}) {
  const { page = 1, limit = 20, excludeTestnets = true } = options;

  try {
    const url = new URL(directoryUrl);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(limit));

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`Discovery failed: ${resp.status}`);

    const data = await resp.json();
    let services = data.services || data.items || data.results || [];

    // Filter testnets if requested
    if (excludeTestnets) {
      services = services.filter(s => {
        const network = s.network || '';
        return !network.includes('testnet') &&
               !network.includes('sepolia') &&
               !network.includes('goerli') &&
               !network.includes('devnet');
      });
    }

    return {
      services,
      page: data.page || page,
      totalPages: data.totalPages || data.total_pages || 1,
      total: data.total || services.length,
    };
  } catch (e) {
    return { services: [], page: 1, totalPages: 1, total: 0, error: e.message };
  }
}

/**
 * Check if a URL supports X402 by sending a probe request
 * Returns payment requirements if 402, null if not
 */
export async function probeX402(url) {
  try {
    const resp = await fetch(url, { method: 'HEAD' });
    if (resp.status === 402) {
      // Re-fetch with GET to get full requirements
      const fullResp = await fetch(url);
      return await parsePaymentRequired(fullResp);
    }
    return null; // Not a 402 service
  } catch (e) {
    return null;
  }
}

// ============================================================
// V1/V2 VERSION DETECTION
// ============================================================

/**
 * Detect X402 protocol version from response
 */
export function detectX402Version(resp) {
  const headerV2 = resp.headers.get('payment-required');
  const headerV1 = resp.headers.get('x-payment-required');

  if (headerV2) return { version: 2, header: 'payment-required' };
  if (headerV1) return { version: 1, header: 'x-payment-required' };
  return { version: 0, header: null }; // Body-only or not X402
}
