export interface OWSConfig {
  rpcs: Record<string, string>;
  currency: string;
  language: string;
  autoRefresh: boolean;
  refreshInterval: number;
}

export interface BackupResult {
  restored: string[];
  created_at: string;
}

export function getConfig(): OWSConfig;
export function updateConfig(updates: Partial<OWSConfig>): OWSConfig;
export function getRpcUrl(chainId: string): string | null;
export function resetConfig(): void;

export function exportVaultBackup(): Promise<string>;
export function importVaultBackup(backupJson: string): Promise<BackupResult>;
export function downloadBackup(jsonStr: string, filename?: string): void;

export const DEFAULT_RPCS: Record<string, string>;
