export interface AIConfig {
  provider: 'openai' | 'anthropic' | 'gemini';
  apiKey: string;
  model?: string;
}

export interface AIAction {
  action: string;
  chain?: string;
  message?: string;
  typedDataJson?: string;
  name?: string;
  intervalMs?: number;
  task?: any;
  condition?: string;
  threshold?: string;
  tasks?: AIAction[];
}

export interface ProviderInfo {
  name: string;
  url: string;
  models: string[];
  defaultModel: string;
}

export function getAIConfig(): AIConfig;
export function saveAIConfig(config: AIConfig): void;
export function hasAIConfig(): boolean;
export function chat(userMessage: string, walletContext?: { name?: string; accounts?: any[]; balances?: string }): Promise<AIAction>;

export const PROVIDERS: Record<string, ProviderInfo>;
