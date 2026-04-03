export interface AuditEntry {
  id: string;
  timestamp: string;
  operation: string;
  wallet_id: string | null;
  wallet_name: string | null;
  chain: string | null;
  address: string | null;
  tx_hash: string | null;
  api_key_id: string | null;
  status: 'success' | 'error';
  error: string | null;
  metadata: any;
}

export interface AuditDetails {
  wallet_id?: string;
  wallet_name?: string;
  chain?: string;
  address?: string;
  tx_hash?: string;
  api_key_id?: string;
  status?: string;
  error?: string;
  metadata?: any;
}

export function logOperation(operation: string, details?: AuditDetails): Promise<AuditEntry>;
export function getAuditLog(limit?: number): Promise<AuditEntry[]>;
export function exportAuditLog(): Promise<string>;
export function clearAuditLog(): Promise<void>;

export const OPS: {
  WALLET_CREATE: string;
  WALLET_IMPORT: string;
  WALLET_LOAD: string;
  WALLET_DELETE: string;
  WALLET_RENAME: string;
  WALLET_EXPORT: string;
  SIGN_MESSAGE: string;
  SIGN_TX: string;
  SIGN_TYPED_DATA: string;
  TX_BROADCAST: string;
  API_KEY_CREATE: string;
  API_KEY_DELETE: string;
  API_KEY_USE: string;
  POLICY_CREATE: string;
  POLICY_DELETE: string;
  POLICY_DENY: string;
  X402_PAYMENT: string;
  BALANCE_QUERY: string;
};
