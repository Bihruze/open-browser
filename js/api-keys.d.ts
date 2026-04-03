export interface ApiKeyFile {
  id: string;
  name: string;
  token_hash: string;
  created_at: string;
  wallet_ids: string[];
  policy_ids: string[];
  expires_at: string | null;
  wallet_secrets: Record<string, any>;
}

export interface CreateApiKeyResult {
  token: string;
  keyFile: ApiKeyFile;
}

export function generateToken(): string;
export function hashToken(token: string): Promise<string>;
export function encryptWithHkdf(plaintext: string, token: string): Promise<any>;
export function decryptWithHkdf(envelope: any, token: string): Promise<string>;
export function createApiKey(name: string, walletName: string, walletSecret: string, policyIds?: string[], expiresAt?: string | null): Promise<CreateApiKeyResult>;
export function lookupApiKey(token: string): Promise<ApiKeyFile>;
export function decryptWithApiKey(token: string, walletName: string): Promise<string>;
export function signTypedDataWithApiKey(token: string, walletName: string, typedDataJson: string, signFn: (secret: string, json: string) => Promise<any>): Promise<any>;
export function signMessageWithApiKey(token: string, walletName: string, chain: string, message: string, signFn: (secret: string, chain: string, msg: string) => Promise<any>): Promise<any>;
export function listApiKeys(): Promise<ApiKeyFile[]>;
export function deleteApiKey(id: string): Promise<void>;
