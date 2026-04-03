# Changelog

## [0.1.0] - 2025-04-03

### Added
- 9 chain wallet support (Ethereum, Bitcoin, Solana, Cosmos, Tron, Sui, XRPL, Filecoin, Spark)
- BIP-39 mnemonic generation and import
- HD derivation: BIP-32 (secp256k1) + SLIP-10 (ed25519)
- Multi-account derivation (custom index)
- Scrypt KDF (N=65536, r=8, p=1) + AES-256-GCM encryption
- OWS CLI vault v2 format compatibility
- Message signing for all 9 chains
- Transaction signing for all 9 chains
- EIP-712 typed data signing (full spec implementation)
- X402 Payment Protocol (HTTP 402, EIP-3009 TransferWithAuthorization)
- X402 service discovery and probing
- API Key system with HKDF-SHA256 encryption
- Token-based wallet access (ows_key_ format)
- Policy engine (allowed_chains, expires_at, max_daily_spend)
- Append-only audit log with JSONL export
- Mainnet RPC balance queries (9 chains)
- CoinGecko price data (30s cache)
- Transaction history (8 chains)
- ETH transfer (build, sign, broadcast)
- Gas fee estimation
- Vault backup and restore
- Custom RPC endpoint configuration
- Address book (contacts)
- Key cache (5s TTL, 32 entries max, LRU eviction)
- Graceful key zeroization (beforeunload)
- QR code generation (pure JS)
- Chain SVG icons (fine-line style)
- Dark mode
- Mobile responsive layout
- PWA manifest + favicon
- Archival Ledger design system
- SDK Guide with integration examples
