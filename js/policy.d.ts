export interface PolicyRule {
  type: 'allowed_chains' | 'expires_at' | 'max_daily_spend';
  chain_ids?: string[];
  timestamp?: string;
  amount?: string;
  asset?: string;
}

export interface Policy {
  id: string;
  name: string;
  version: number;
  created_at: string;
  rules: PolicyRule[];
  action: 'deny';
}

export interface PolicyContext {
  chain_id: string;
  wallet_id: string;
  api_key_id: string;
  transaction: { to?: string | null; value?: string | null; raw_hex: string; data?: string | null };
  spending: { daily_total: string; date: string };
  timestamp: string;
}

export interface PolicyResult {
  allow: boolean;
  reason: string | null;
  policy_id: string | null;
}

export function evaluatePolicies(policies: Policy[], context: PolicyContext): PolicyResult;
export function buildPolicyContext(chainId: string, walletId: string, apiKeyId: string, transaction?: Partial<PolicyContext['transaction']>, spending?: Partial<PolicyContext['spending']>): PolicyContext;
export function createPolicy(name: string, rules: PolicyRule[]): Policy;
export function savePolicy(policy: Policy): Promise<void>;
export function listPolicies(): Promise<Policy[]>;
export function getPolicy(id: string): Promise<Policy | null>;
export function deletePolicy(id: string): Promise<void>;
