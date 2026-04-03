export interface SignAndSendResult {
  txHash: string;
  explorer: string;
  chain: string;
  amount: string;
  from: string;
  to: string;
}

export interface SignAndSendOptions {
  walletName?: string;
  auditLog?: boolean;
}

export function signAndSend(
  chain: string,
  fromAddress: string,
  toAddress: string,
  amount: string,
  signTxFn: (unsignedTxHex: string) => Promise<{ signature: string }>,
  options?: SignAndSendOptions
): Promise<SignAndSendResult>;
