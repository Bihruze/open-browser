export interface X402Wallet {
  address: string;
  signTypedData: (typedDataJson: string) => Promise<any>;
}

export interface PaymentRequirement {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  pay_to: string;
  max_timeout_seconds: number;
  extra?: any;
  description?: string;
}

export interface DiscoveryResult {
  services: any[];
  page: number;
  totalPages: number;
  total: number;
  error?: string;
}

export interface X402Version {
  version: number;
  header: string | null;
}

export function fetchWithPayment(url: string, options: RequestInit, wallet: X402Wallet): Promise<Response>;
export function createX402Wallet(address: string, signTypedDataFn: (json: string) => Promise<any>): X402Wallet;
export function probeX402(url: string): Promise<PaymentRequirement[] | null>;
export function discoverServices(directoryUrl: string, options?: { page?: number; limit?: number; excludeTestnets?: boolean }): Promise<DiscoveryResult>;
export function detectX402Version(resp: Response): X402Version;
