export interface FeeEstimate {
  gasPrice: string;
  gasPriceGwei: string;
  gasLimit: string;
  estimatedFeeEth: string;
  estimatedFeeWei: string;
}

export interface TxParams {
  unsignedTxHex: string;
  nonce: string;
  gasPrice: string;
  gasPriceGwei: string;
  gasLimit: string;
  amountWei: string;
  amountEth: string;
  chainId: string;
  estimatedFeeEth: string;
}

export interface SendResult {
  txHash: string;
  explorer: string;
  nonce: string;
  gasPrice: string;
  amountEth: string;
}

export function estimateEthFee(): Promise<FeeEstimate>;
export function buildEthTransfer(fromAddress: string, toAddress: string, amountEth: string): Promise<TxParams>;
export function encodeSignedEthTx(txParams: TxParams & { toAddress: string }, signatureHex: string): string;
export function sendEth(fromAddress: string, toAddress: string, amountEth: string, signCallback: (unsignedTxHex: string) => Promise<{ signature: string }>): Promise<SendResult>;
