export type AgentStatus = 'idle' | 'running' | 'paused' | 'error';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'denied';
export type TaskType = 'sign_message' | 'sign_tx' | 'sign_typed_data' | 'check_balance' | 'custom';

export interface AgentTask {
  id: string;
  type: TaskType;
  chain: string;
  params: Record<string, any>;
  status: TaskStatus;
  result: any;
  error: string | null;
  created: number;
  completed: number | null;
}

export interface AgentConfig {
  id?: string;
  name?: string;
  apiToken?: string;
  walletName: string;
  allowedChains?: string[];
  maxTxPerMinute?: number;
  signFn?: (walletName: string, chain: string, data: string) => Promise<any>;
  signTypedDataFn?: (walletName: string, data: string) => Promise<any>;
}

export interface AgentInfo {
  id: string;
  name: string;
  walletName: string;
  allowedChains: string[];
  maxTxPerMinute: number;
  status: AgentStatus;
  pendingTasks: number;
  completedTasks: number;
  created: number;
}

export class OWSAgent {
  id: string;
  name: string;
  walletName: string;
  status: AgentStatus;
  taskQueue: AgentTask[];
  history: AgentTask[];

  constructor(config: AgentConfig);
  start(): Promise<void>;
  pause(): void;
  stop(): void;
  addTask(task: { type: TaskType; chain?: string; params?: Record<string, any> }): string;
  addTasks(tasks: Array<{ type: TaskType; chain?: string; params?: Record<string, any> }>): string[];
  getTask(taskId: string): AgentTask | undefined;
  getPendingTasks(): AgentTask[];
  getHistory(): AgentTask[];
  toJSON(): AgentInfo;
}

export class AgentManager {
  create(config: AgentConfig): OWSAgent;
  get(agentId: string): OWSAgent | undefined;
  list(): AgentInfo[];
  remove(agentId: string): void;
  stopAll(): void;
  loadFromDb(): Promise<AgentInfo[]>;
}

export function createSimpleAgent(
  name: string,
  walletName: string,
  signFn: (walletName: string, chain: string, data: string) => Promise<any>,
  signTypedDataFn: (walletName: string, data: string) => Promise<any>,
  options?: { allowedChains?: string[]; maxTxPerMinute?: number }
): OWSAgent;

export function runAgentTask(
  walletName: string,
  task: { type: TaskType; chain?: string; params?: Record<string, any> },
  signFn: (walletName: string, chain: string, data: string) => Promise<any>,
  signTypedDataFn: (walletName: string, data: string) => Promise<any>
): Promise<AgentTask>;
