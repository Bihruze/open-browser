// js/agent.js — OWS AI Agent Runtime v2
// Autonomous wallet agent: scheduled tasks, conditions, chains, retry, notifications
// Built for AI agents that transact on-chain without human intervention

import { openDb } from './db.js';
import { logOperation, OPS } from './audit.js';
import { evaluatePolicies, buildPolicyContext, listPolicies } from './policy.js';
import { getBalance } from './rpc.js';
import { fetchPrices, getPrice, formatUSD } from './price.js';

// ============================================================
// OWSAgent — Autonomous wallet operator
// ============================================================

export class OWSAgent {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name || 'unnamed-agent';
    this.walletName = config.walletName;
    this.allowedChains = config.allowedChains || ['eip155:1'];
    this.maxTxPerMinute = config.maxTxPerMinute || 5;
    this.status = 'idle'; // idle, running, paused, error
    this.taskQueue = [];
    this.history = [];
    this.scheduledTasks = []; // recurring
    this.listeners = []; // event callbacks
    this.created = Date.now();
    this._txCount = 0;
    this._txWindowStart = Date.now();
    this._running = false;
    this._timers = [];
    this._signFn = config.signFn || null;
    this._signTypedDataFn = config.signTypedDataFn || null;
    this._onEvent = config.onEvent || null; // (event) => void
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  async start() {
    if (this._running) return;
    this._running = true;
    this.status = 'running';
    this._emit({ type: 'agent_start', agent: this.name });
    await logOperation('agent_start', { wallet_name: this.walletName, metadata: { agent_id: this.id, agent_name: this.name } });
    this._startScheduled();
    this._processLoop();
  }

  pause() {
    this._running = false;
    this.status = 'paused';
    this._clearTimers();
    this._emit({ type: 'agent_pause', agent: this.name });
  }

  stop() {
    this._running = false;
    this.status = 'idle';
    this._clearTimers();
    this.taskQueue = [];
    this._emit({ type: 'agent_stop', agent: this.name });
  }

  // ============================================================
  // Task management
  // ============================================================

  addTask(task) {
    const t = {
      id: crypto.randomUUID(),
      type: task.type, // check_balance, sign_message, sign_tx, sign_typed_data, custom
      chain: task.chain || 'evm',
      params: task.params || {},
      status: 'pending',
      result: null,
      error: null,
      retries: 0,
      maxRetries: task.maxRetries || 3,
      // Conditional execution
      condition: task.condition || null, // { type: 'balance_below', chain, threshold }
      // Chain: run after another task completes
      dependsOn: task.dependsOn || null, // taskId
      created: Date.now(),
      completed: null,
    };
    this.taskQueue.push(t);
    return t.id;
  }

  // Add multiple chained tasks — each depends on the previous
  addChainedTasks(tasks) {
    const ids = [];
    let prevId = null;
    for (const task of tasks) {
      if (prevId) task.dependsOn = prevId;
      const id = this.addTask(task);
      ids.push(id);
      prevId = id;
    }
    return ids;
  }

  // ============================================================
  // Scheduled (recurring) tasks
  // ============================================================

  schedule(config) {
    const s = {
      id: crypto.randomUUID(),
      name: config.name || 'unnamed-schedule',
      intervalMs: config.intervalMs || 60000, // default 1 minute
      task: config.task, // task template { type, chain, params, condition }
      enabled: true,
      lastRun: null,
      runCount: 0,
      maxRuns: config.maxRuns || Infinity,
    };
    this.scheduledTasks.push(s);
    if (this._running) this._startOneSchedule(s);
    return s.id;
  }

  unschedule(scheduleId) {
    this.scheduledTasks = this.scheduledTasks.filter(s => s.id !== scheduleId);
  }

  _startScheduled() {
    for (const s of this.scheduledTasks) {
      if (s.enabled) this._startOneSchedule(s);
    }
  }

  _startOneSchedule(s) {
    const timer = setInterval(() => {
      if (!this._running || !s.enabled) return;
      if (s.runCount >= s.maxRuns) { s.enabled = false; return; }
      this.addTask({ ...s.task });
      s.lastRun = Date.now();
      s.runCount++;
    }, s.intervalMs);
    this._timers.push(timer);
  }

  _clearTimers() {
    this._timers.forEach(t => clearInterval(t));
    this._timers = [];
  }

  // ============================================================
  // Conditions
  // ============================================================

  async _checkCondition(condition) {
    if (!condition) return true;

    switch (condition.type) {
      case 'balance_below': {
        const bal = await getBalance(condition.chain || 'evm', condition.address);
        const current = parseFloat(bal.formatted || '0');
        const threshold = parseFloat(condition.threshold);
        return current < threshold;
      }

      case 'balance_above': {
        const bal = await getBalance(condition.chain || 'evm', condition.address);
        const current = parseFloat(bal.formatted || '0');
        const threshold = parseFloat(condition.threshold);
        return current > threshold;
      }

      case 'price_below': {
        await fetchPrices();
        const price = getPrice(condition.chain || 'evm');
        return price.usd < parseFloat(condition.threshold);
      }

      case 'price_above': {
        await fetchPrices();
        const price = getPrice(condition.chain || 'evm');
        return price.usd > parseFloat(condition.threshold);
      }

      case 'time_after': {
        return Date.now() > new Date(condition.timestamp).getTime();
      }

      case 'always':
        return true;

      default:
        return true;
    }
  }

  // ============================================================
  // Processing loop
  // ============================================================

  async _processLoop() {
    while (this._running) {
      const task = this._findNextTask();
      if (!task) { await sleep(1000); continue; }
      if (!this._checkRateLimit()) { await sleep(5000); continue; }
      await this._executeTask(task);
    }
  }

  _findNextTask() {
    return this.taskQueue.find(t => {
      if (t.status !== 'pending') return false;
      // Dependency check
      if (t.dependsOn) {
        const dep = this.history.find(h => h.id === t.dependsOn);
        if (!dep || dep.status !== 'completed') return false;
      }
      return true;
    });
  }

  _checkRateLimit() {
    const now = Date.now();
    if (now - this._txWindowStart > 60000) {
      this._txCount = 0;
      this._txWindowStart = now;
    }
    return this._txCount < this.maxTxPerMinute;
  }

  async _executeTask(task) {
    task.status = 'running';

    try {
      // Check condition first
      if (task.condition) {
        const conditionMet = await this._checkCondition(task.condition);
        if (!conditionMet) {
          task.status = 'pending'; // Put back, condition not met yet
          await sleep(2000);
          return;
        }
      }

      // Policy check
      const policyResult = await this._checkPolicy(task);
      if (!policyResult.allow) {
        task.status = 'denied';
        task.error = policyResult.reason;
        this._emit({ type: 'task_denied', task, reason: policyResult.reason });
        this._notify(`Task denied: ${policyResult.reason}`);
        this._moveToHistory(task);
        return;
      }

      // Execute
      let result;
      switch (task.type) {
        case 'check_balance':
          result = await this._taskCheckBalance(task);
          break;
        case 'sign_message':
          result = await this._taskSignMessage(task);
          break;
        case 'sign_tx':
          result = await this._taskSignTx(task);
          break;
        case 'sign_typed_data':
          result = await this._taskSignTypedData(task);
          break;
        case 'custom':
          result = await this._taskCustom(task);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      task.status = 'completed';
      task.result = result;
      task.completed = Date.now();
      this._txCount++;
      this._emit({ type: 'task_completed', task });

    } catch (e) {
      task.retries++;
      if (task.retries < task.maxRetries) {
        // Retry — put back as pending
        task.status = 'pending';
        task.error = `Retry ${task.retries}/${task.maxRetries}: ${e.message}`;
        this._emit({ type: 'task_retry', task, attempt: task.retries });
        await sleep(2000 * task.retries); // Exponential backoff
        return;
      }

      task.status = 'failed';
      task.error = e.message || String(e);
      this._emit({ type: 'task_failed', task });
      this._notify(`Task failed: ${e.message}`);
    }

    this._moveToHistory(task);
  }

  _moveToHistory(task) {
    this.history.push(task);
    this.taskQueue = this.taskQueue.filter(t => t.id !== task.id);
    if (this.history.length > 200) this.history = this.history.slice(-200);
  }

  // ============================================================
  // Policy
  // ============================================================

  async _checkPolicy(task) {
    try {
      const policies = await listPolicies();
      if (policies.length === 0) return { allow: true };
      const chainId = this._resolveChainId(task.chain);
      const context = buildPolicyContext(chainId, this.walletName, this.id, {
        value: task.params.amount || '0',
        to: task.params.to || null,
      });
      return evaluatePolicies(policies, context);
    } catch { return { allow: true }; }
  }

  _resolveChainId(chain) {
    const map = {
      evm: 'eip155:1', bitcoin: 'bip122:000000000019d6689c085ae165831e93',
      solana: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', cosmos: 'cosmos:cosmoshub-4',
      tron: 'tron:mainnet', sui: 'sui:mainnet', xrpl: 'xrpl:mainnet',
      filecoin: 'filecoin:mainnet', spark: 'spark:mainnet',
    };
    return map[chain] || chain;
  }

  // ============================================================
  // Task implementations
  // ============================================================

  async _taskCheckBalance(task) {
    const result = await getBalance(task.chain, task.params.address);
    // Auto-notification if threshold check
    if (task.params.notifyBelow && parseFloat(result.formatted) < parseFloat(task.params.notifyBelow)) {
      this._notify(`Low balance: ${result.formatted} ${result.symbol} (below ${task.params.notifyBelow})`);
    }
    return result;
  }

  async _taskSignMessage(task) {
    if (!this._signFn) throw new Error('No sign function provided');
    return this._signFn(this.walletName, task.chain, task.params.message);
  }

  async _taskSignTx(task) {
    if (!this._signFn) throw new Error('No sign function provided');
    return this._signFn(this.walletName, task.chain, task.params.txHex);
  }

  async _taskSignTypedData(task) {
    if (!this._signTypedDataFn) throw new Error('No signTypedData function provided');
    return this._signTypedDataFn(this.walletName, task.params.typedDataJson);
  }

  async _taskCustom(task) {
    // Security: custom tasks are sandboxed — no arbitrary code execution
    // Only pre-registered custom handlers are allowed
    if (!this._customHandlers) throw new Error('No custom handlers registered');
    const handler = this._customHandlers[task.params.handlerName];
    if (!handler) throw new Error(`Unknown custom handler: ${task.params.handlerName}`);
    return handler(task.params);
  }

  registerCustomHandler(name, fn) {
    if (!this._customHandlers) this._customHandlers = {};
    this._customHandlers[name] = fn;
  }

  // ============================================================
  // Events & Notifications
  // ============================================================

  on(eventType, callback) {
    this.listeners.push({ type: eventType, fn: callback });
  }

  _emit(event) {
    event.agentId = this.id;
    event.agentName = this.name;
    event.timestamp = Date.now();
    if (this._onEvent) this._onEvent(event);
    for (const l of this.listeners) {
      if (l.type === event.type || l.type === '*') l.fn(event);
    }
  }

  _notify(message) {
    this._emit({ type: 'notification', message });
    // Browser notification if permitted
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(`OWS Agent: ${this.name}`, { body: message, icon: 'favicon.svg' });
    }
  }

  static async requestNotificationPermission() {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      return Notification.requestPermission();
    }
  }

  // ============================================================
  // Natural language parser (simple)
  // ============================================================

  parseCommand(text) {
    const lower = text.toLowerCase().trim();
    const tasks = [];

    // "check [my] [ETH|BTC|SOL] balance [every X minutes]"
    const balanceMatch = lower.match(/check\s+(?:my\s+)?(\w+)?\s*balance(?:\s+every\s+(\d+)\s*(min|minute|hour|sec))?/);
    if (balanceMatch) {
      const chain = this._parseChainName(balanceMatch[1]) || 'evm';
      const acc = this._getAddress(chain);
      const task = { type: 'check_balance', chain, params: { address: acc } };

      if (balanceMatch[2]) {
        const interval = this._parseInterval(balanceMatch[2], balanceMatch[3]);
        return { scheduled: true, name: `balance-check-${chain}`, intervalMs: interval, task };
      }
      return { tasks: [task] };
    }

    // "sign [message] 'text' [on ETH|SOL]"
    const signMatch = lower.match(/sign\s+(?:message\s+)?['""](.+?)['""](?:\s+on\s+(\w+))?/);
    if (signMatch) {
      const chain = this._parseChainName(signMatch[2]) || 'evm';
      return { tasks: [{ type: 'sign_message', chain, params: { message: signMatch[1] } }] };
    }

    // "alert [me] [if|when] [ETH|BTC] [balance] [below|above] X"
    const alertMatch = lower.match(/alert\s+(?:me\s+)?(?:if|when)\s+(\w+)?\s*(?:balance\s+)?(?:goes\s+)?(below|above|under|over)\s+([\d.]+)/);
    if (alertMatch) {
      const chain = this._parseChainName(alertMatch[1]) || 'evm';
      const direction = (alertMatch[2] === 'below' || alertMatch[2] === 'under') ? 'balance_below' : 'balance_above';
      const threshold = alertMatch[3];
      const acc = this._getAddress(chain);
      return {
        scheduled: true,
        name: `alert-${chain}-${direction}`,
        intervalMs: 60000, // check every minute
        task: {
          type: 'check_balance',
          chain,
          params: { address: acc, notifyBelow: direction === 'balance_below' ? threshold : undefined },
          condition: { type: direction, chain, address: acc, threshold },
        },
      };
    }

    // "every X minutes do Y"
    const everyMatch = lower.match(/every\s+(\d+)\s*(min|minute|hour|sec|second)s?\s+(?:do\s+)?(.+)/);
    if (everyMatch) {
      const interval = this._parseInterval(everyMatch[1], everyMatch[2]);
      const subCommand = this.parseCommand(everyMatch[3]);
      if (subCommand?.tasks?.[0]) {
        return { scheduled: true, name: `recurring-${Date.now()}`, intervalMs: interval, task: subCommand.tasks[0] };
      }
    }

    return null; // Unrecognized
  }

  _parseChainName(name) {
    if (!name) return null;
    const map = {
      eth: 'evm', ethereum: 'evm', btc: 'bitcoin', sol: 'solana',
      atom: 'cosmos', trx: 'tron', xrp: 'xrpl', fil: 'filecoin',
      sui: 'sui', ton: 'ton', spark: 'spark',
    };
    return map[name.toLowerCase()] || name.toLowerCase();
  }

  _parseInterval(num, unit) {
    const n = parseInt(num);
    const multiplier = { sec: 1000, second: 1000, min: 60000, minute: 60000, hour: 3600000 };
    return n * (multiplier[unit] || 60000);
  }

  _getAddress(chain) {
    // Will be overridden by caller with actual wallet accounts
    return this._accounts?.[chain] || '';
  }

  setAccounts(accounts) {
    this._accounts = {};
    for (const acc of accounts) {
      const prefix = acc.chain_id?.split(':')[0] || '';
      const chainMap = { eip155: 'evm', bip122: 'bitcoin', solana: 'solana', cosmos: 'cosmos', tron: 'tron', sui: 'sui', xrpl: 'xrpl', filecoin: 'filecoin', spark: 'spark' };
      const key = chainMap[prefix] || prefix;
      this._accounts[key] = acc.address;
    }
  }

  // ============================================================
  // Serialization
  // ============================================================

  getTask(taskId) {
    return this.taskQueue.find(t => t.id === taskId) || this.history.find(t => t.id === taskId);
  }
  getPendingTasks() { return this.taskQueue.filter(t => t.status === 'pending'); }
  getHistory() { return this.history; }
  getScheduled() { return this.scheduledTasks; }

  toJSON() {
    return {
      id: this.id, name: this.name, walletName: this.walletName,
      allowedChains: this.allowedChains, maxTxPerMinute: this.maxTxPerMinute,
      status: this.status, pendingTasks: this.taskQueue.length,
      completedTasks: this.history.filter(t => t.status === 'completed').length,
      failedTasks: this.history.filter(t => t.status === 'failed').length,
      scheduledTasks: this.scheduledTasks.length,
      created: this.created,
    };
  }
}

// ============================================================
// Agent Manager
// ============================================================

export class AgentManager {
  constructor() { this.agents = new Map(); }

  create(config) {
    const agent = new OWSAgent(config);
    this.agents.set(agent.id, agent);
    return agent;
  }

  get(agentId) { return this.agents.get(agentId); }
  list() { return Array.from(this.agents.values()).map(a => a.toJSON()); }

  remove(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) { agent.stop(); this.agents.delete(agentId); }
  }

  stopAll() { for (const a of this.agents.values()) a.stop(); }
}

// ============================================================
// Quick helpers
// ============================================================

export function createSimpleAgent(name, walletName, signFn, signTypedDataFn, options = {}) {
  const manager = new AgentManager();
  return manager.create({
    name, walletName, signFn, signTypedDataFn,
    allowedChains: options.allowedChains || ['eip155:1'],
    maxTxPerMinute: options.maxTxPerMinute || 5,
  });
}

export async function runAgentTask(walletName, task, signFn, signTypedDataFn) {
  const agent = new OWSAgent({ name: 'one-shot', walletName, signFn, signTypedDataFn });
  const taskId = agent.addTask(task);
  await agent._executeTask(agent.taskQueue[0]);
  return agent.getTask(taskId);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
