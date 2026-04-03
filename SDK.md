# OWS Browser SDK — Developer Guide

## Quick Start

```bash
# Install
npm install @open-wallet-standard/browser

# Or use directly from source
git clone https://github.com/open-wallet-standard/browser.git
cd browser && wasm-pack build --target web --out-dir pkg
```

```javascript
import init, { create_wallet, sign_message } from '@open-wallet-standard/browser';

await init(); // Load WASM — call once per page

const wallet = await create_wallet("my-wallet", "strong-passphrase");
console.log(wallet.accounts); // 9 chain addresses ready
```

---

## Installation

### NPM
```bash
npm install @open-wallet-standard/browser
```

### CDN / Script Tag
```html
<script type="module">
  import init, * as ows from './pkg/ows_browser.js';
  await init();
</script>
```

### Build from Source
```bash
# Prerequisites: Rust, wasm-pack
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# Build
wasm-pack build --target web --out-dir pkg --release
```

---

## Core API

### Wallet Management

```javascript
// Create new wallet (generates 12-word BIP-39 mnemonic)
const wallet = await create_wallet(name, password);
// Returns: { id, name, mnemonic, accounts[] }
// IMPORTANT: mnemonic shown ONCE — user must save it

// Import existing mnemonic (CLI compatible)
const info = await import_wallet(name, "abandon ability able ...", password);
// Returns: { id, name, accounts[], key_type, created_at }

// Load wallet (verify password)
const info = await load_wallet(name, password);

// List all wallet names
const names = await list_wallets(); // ["wallet-1", "wallet-2"]

// Export mnemonic
const mnemonic = await export_wallet(name, password);

// Delete wallet
await delete_wallet(name);

// Rename wallet
await rename_wallet(oldName, newName, password);

// Derive additional accounts (multi-account)
const accounts = await derive_accounts(name, password, 1); // index 1
```

### Signing

```javascript
// Sign message (chain-specific prefixing)
const result = await sign_message(walletName, password, chain, message);
// Returns: { signature, recovery_id?, public_key? }
//
// Supported chains: "evm", "bitcoin", "solana", "cosmos",
//                   "tron", "sui", "xrpl", "filecoin", "spark", "ton"

// Sign transaction
const result = await sign_tx(walletName, password, chain, txHex);

// Sign EIP-712 typed data (EVM only)
const result = await sign_typed_data(walletName, password, typedDataJson);
```

### Accounts Structure

Each wallet derives 9 accounts automatically:

```javascript
wallet.accounts = [
  { account_id: "eip155:1:0x...",     address: "0x...",    chain_id: "eip155:1",     derivation_path: "m/44'/60'/0'/0/0" },
  { account_id: "bip122:...:bc1...",   address: "bc1...",   chain_id: "bip122:...",   derivation_path: "m/84'/0'/0'/0/0" },
  { account_id: "solana:...:7Ec...",   address: "7Ec...",   chain_id: "solana:...",   derivation_path: "m/44'/501'/0'/0'" },
  { account_id: "cosmos:...:cosmos1..", address: "cosmos1..", chain_id: "cosmos:...",  derivation_path: "m/44'/118'/0'/0/0" },
  { account_id: "tron:...:T...",       address: "T...",     chain_id: "tron:...",     derivation_path: "m/44'/195'/0'/0/0" },
  { account_id: "filecoin:...:f1...",  address: "f1...",    chain_id: "filecoin:...", derivation_path: "m/44'/461'/0'/0/0" },
  { account_id: "sui:...:0x...",       address: "0x...",    chain_id: "sui:...",      derivation_path: "m/44'/784'/0'/0'" },
  { account_id: "xrpl:...:r...",       address: "r...",     chain_id: "xrpl:...",     derivation_path: "m/44'/144'/0'/0/0" },
  { account_id: "spark:...:spark:...", address: "spark:..", chain_id: "spark:...",    derivation_path: "m/84'/0'/0'/0/0" },
];
```

---

## JavaScript Modules

### Balance & Price

```javascript
import { getBalance, getAllBalances } from '@open-wallet-standard/browser/rpc';
import { fetchPrices, getPrice, formatUSD } from '@open-wallet-standard/browser/price';

// Single chain balance
const bal = await getBalance('evm', '0x...');
// { raw: "1500000000000000000", formatted: "1.5", symbol: "ETH" }

// All chains at once
const all = await getAllBalances(wallet.accounts);
// { eip155: { formatted: "1.5", symbol: "ETH" }, bip122: { ... }, ... }

// USD prices (30s cache)
await fetchPrices();
const price = getPrice('evm'); // { usd: 3500, change24h: 2.1 }
console.log(formatUSD(1.5 * price.usd)); // "$5,250.00"
```

### Send ETH

```javascript
import { estimateEthFee, buildEthTransfer, encodeSignedEthTx } from '@open-wallet-standard/browser/tx-builder';

// 1. Estimate fee
const fee = await estimateEthFee();
// { gasPriceGwei: "25.50", estimatedFeeEth: "0.000535", gasLimit: "21000" }

// 2. Build unsigned TX
const tx = await buildEthTransfer(fromAddress, toAddress, "0.1");

// 3. Sign with WASM
const sig = await sign_tx(walletName, password, "evm", tx.unsignedTxHex);

// 4. Encode signed TX
const signedHex = encodeSignedEthTx({ ...tx, toAddress }, sig.signature);

// 5. Broadcast
const resp = await fetch('https://ethereum-rpc.publicnode.com', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: [signedHex] })
});

// Or use the unified pipeline:
import { signAndSend } from '@open-wallet-standard/browser/sign-and-send';
const result = await signAndSend('evm', from, to, '0.1', async (hex) => {
  return await sign_tx(walletName, password, 'evm', hex);
});
// { txHash: "0x...", explorer: "https://etherscan.io/tx/0x..." }
```

### Transaction History

```javascript
import { getHistory } from '@open-wallet-standard/browser/history';

const hist = await getHistory('evm', '0x...');
// { txs: [{ hash, time, confirmed, explorer }, ...] }

// Supported: evm, bitcoin, solana, cosmos, tron, sui, xrpl, filecoin, ton
```

### X402 Payments (Agentic Commerce)

```javascript
import { fetchWithPayment, createX402Wallet, probeX402 } from '@open-wallet-standard/browser/x402';

// Check if URL supports X402
const reqs = await probeX402('https://api.service.com/data');
if (reqs) console.log('X402 supported:', reqs.length, 'payment options');

// Auto-pay on 402
const wallet = createX402Wallet(evmAddress, async (typedDataJson) => {
  return await sign_typed_data(walletName, password, typedDataJson);
});

const resp = await fetchWithPayment('https://api.service.com/data', {
  method: 'GET',
  headers: { 'Authorization': 'Bearer ...' }
}, wallet);

const data = await resp.json(); // Paid resource
```

### API Keys (Agent Access)

```javascript
import { createApiKey, lookupApiKey, decryptWithApiKey, signTypedDataWithApiKey } from '@open-wallet-standard/browser/api-keys';

// Create scoped access token
const mnemonic = await export_wallet(walletName, ownerPassword);
const { token, keyFile } = await createApiKey(
  "agent-key",     // key name
  walletName,      // wallet to grant access
  mnemonic,        // wallet secret (re-encrypted with HKDF)
  ["policy-id"],   // policy IDs to enforce
  "2025-12-31T23:59:59Z" // optional expiry
);
// token: "ows_key_a1b2c3d4..." — give this to the agent

// Agent uses token to sign (no password needed)
const sig = await signTypedDataWithApiKey(token, walletName, typedDataJson, async (secret, json) => {
  // Agent-side: import secret, sign
  const tempWallet = await import_wallet("temp", secret, "temp-pass");
  return await sign_typed_data("temp", "temp-pass", json);
});
```

### Policies (Access Control)

```javascript
import { createPolicy, savePolicy, evaluatePolicies, buildPolicyContext } from '@open-wallet-standard/browser/policy';

// Define rules
const policy = createPolicy("eth-only-limited", [
  { type: "allowed_chains", chain_ids: ["eip155:1", "eip155:137"] },
  { type: "max_daily_spend", amount: "500", asset: "usd" },
  { type: "expires_at", timestamp: "2025-12-31T23:59:59Z" }
]);
await savePolicy(policy);

// Evaluate before signing
const context = buildPolicyContext("eip155:1", walletId, apiKeyId, {
  to: "0xRecipient",
  value: "100000000000000000" // 0.1 ETH in wei
});
const result = evaluatePolicies([policy], context);

if (result.allow) {
  // Proceed with signing
} else {
  console.error('Denied:', result.reason);
  // "Chain eip155:42161 is not in the allowed list"
  // "Daily spending limit exceeded (600 > 500 usd)"
  // "Policy expired at 2025-12-31T23:59:59Z"
}
```

### Audit Log

```javascript
import { logOperation, getAuditLog, exportAuditLog, OPS } from '@open-wallet-standard/browser/audit';

// Log operations
await logOperation(OPS.WALLET_CREATE, { wallet_name: "my-wallet" });
await logOperation(OPS.SIGN_TX, { wallet_name: "my-wallet", chain: "evm", tx_hash: "0x..." });
await logOperation(OPS.X402_PAYMENT, { chain: "evm", metadata: { url: "https://...", amount: "0.01" } });

// Read log
const entries = await getAuditLog(50);
entries.forEach(e => console.log(e.timestamp, e.operation, e.status));

// Export for compliance
const jsonl = await exportAuditLog();
// Each line: {"id":"...","timestamp":"...","operation":"sign_tx","wallet_name":"...","status":"success"}
```

### Key Cache

```javascript
import { keyCache, cachedDecrypt } from '@open-wallet-standard/browser/key-cache';

// Automatic caching — avoids re-running scrypt for 5 seconds
const secret = await cachedDecrypt("my-wallet", password, async () => {
  return await export_wallet("my-wallet", password);
});

// Cache stats
console.log(keyCache.stats()); // { entries: 3, maxEntries: 32, ttlMs: 5000 }

// Manual clear
keyCache.clearAll(); // Zeroizes all cached keys
```

### Vault Backup & Restore

```javascript
import { exportVaultBackup, importVaultBackup, downloadBackup } from '@open-wallet-standard/browser/config';

// Export entire vault (wallets + keys + policies + audit)
const backup = await exportVaultBackup();
downloadBackup(backup, 'my-vault-backup.json'); // Triggers file download

// Restore from backup
const fileContent = await file.text(); // From <input type="file">
await importVaultBackup(fileContent);
```

### Custom RPC Endpoints

```javascript
import { getConfig, updateConfig, getRpcUrl } from '@open-wallet-standard/browser/config';

// Override default RPCs
updateConfig({
  rpcs: {
    'eip155:1': 'https://my-private-eth-node.com',
    'solana:mainnet': 'https://my-solana-rpc.com',
  }
});

// Check current config
const url = getRpcUrl('eip155:1'); // Your custom URL
```

---

## Integration Examples

### React DeFi App

```jsx
import { useEffect, useState } from 'react';
import init, { create_wallet, load_wallet, sign_message } from '@open-wallet-standard/browser';
import { getBalance } from '@open-wallet-standard/browser/rpc';
import { fetchPrices, getPrice } from '@open-wallet-standard/browser/price';

function WalletProvider({ children }) {
  const [wallet, setWallet] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    init().then(() => setReady(true));
  }, []);

  const connect = async (name, pass) => {
    const w = await load_wallet(name, pass);
    setWallet({ name, pass, ...w });
  };

  const sign = async (chain, msg) => {
    return sign_message(wallet.name, wallet.pass, chain, msg);
  };

  return <WalletContext.Provider value={{ wallet, ready, connect, sign }}>
    {children}
  </WalletContext.Provider>;
}
```

### AI Agent with X402

```javascript
import init, { create_wallet, sign_typed_data } from '@open-wallet-standard/browser';
import { fetchWithPayment, createX402Wallet } from '@open-wallet-standard/browser/x402';

await init();

// Agent creates its own wallet
const agent = await create_wallet("agent-wallet", "agent-secret");
const evmAddr = agent.accounts.find(a => a.chain_id.startsWith('eip155')).address;

// Agent can now pay for API access
const w = createX402Wallet(evmAddr, async (json) => {
  return await sign_typed_data("agent-wallet", "agent-secret", json);
});

// Every request auto-pays if needed
const data = await fetchWithPayment('https://ai-api.com/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: "Analyze this data..." })
}, w);
```

### Multi-Chain Portfolio Tracker

```javascript
import init, { load_wallet } from '@open-wallet-standard/browser';
import { getAllBalances } from '@open-wallet-standard/browser/rpc';
import { fetchPrices, getPrice, formatUSD } from '@open-wallet-standard/browser/price';

await init();
const wallet = await load_wallet("my-wallet", "pass");

// Get all balances + prices
await fetchPrices();
const balances = await getAllBalances(wallet.accounts);

let totalUsd = 0;
for (const [chain, bal] of Object.entries(balances)) {
  const price = getPrice(chain);
  const usd = parseFloat(bal.formatted) * price.usd;
  totalUsd += usd;
  console.log(`${bal.symbol}: ${bal.formatted} (${formatUSD(usd)})`);
}
console.log(`Total portfolio: ${formatUSD(totalUsd)}`);
```

---

## Security

| Feature | Detail |
|---------|--------|
| Encryption | Scrypt (N=65536, r=8, p=1) + AES-256-GCM |
| Key Storage | IndexedDB only (never localStorage) |
| Key Zeroization | beforeunload + pagehide hooks clear cache |
| Key Cache | 5s TTL, max 32 entries, LRU eviction |
| Vault Format | OWS v2 — CLI compatible |
| API Key Encryption | HKDF-SHA256 (not scrypt) |
| Policy Enforcement | AND logic, fail-closed for unknown rules |
| Audit Trail | Append-only, exportable JSONL |
| Private Keys | Never leave WASM sandbox |
| Network | Zero custody — no server communication for keys |

---

## Supported Chains

| Chain | Curve | Derivation | Balance | Send | Sign | History |
|-------|-------|------------|:-------:|:----:|:----:|:-------:|
| Ethereum | secp256k1 | m/44'/60'/0'/0/{i} | Yes | Yes | Yes | Yes |
| Bitcoin | secp256k1 | m/84'/0'/0'/0/{i} | Yes | — | Yes | Yes |
| Solana | ed25519 | m/44'/501'/{i}'/0' | Yes | — | Yes | Yes |
| Cosmos | secp256k1 | m/44'/118'/0'/0/{i} | Yes | — | Yes | Yes |
| Tron | secp256k1 | m/44'/195'/0'/0/{i} | Yes | — | Yes | Yes |
| Sui | ed25519 | m/44'/784'/{i}'/0' | Yes | — | Yes | Yes |
| XRPL | secp256k1 | m/44'/144'/0'/0/{i} | Yes | — | Yes | Yes |
| Filecoin | secp256k1 | m/44'/461'/0'/0/{i} | Yes | — | Yes | Yes |
| Spark | secp256k1 | m/84'/0'/0'/0/{i} | — | — | Yes | — |
