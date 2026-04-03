export interface TxEntry {
  hash: string;
  time: string;
  confirmed: boolean;
  explorer?: string;
  fee?: number;
  type?: string;
  error?: boolean;
}

export interface HistoryResult {
  txs: TxEntry[];
  note?: string;
  error?: string;
}

export function getHistory(chain: string, address: string): Promise<HistoryResult>;
