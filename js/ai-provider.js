// js/ai-provider.js — LLM Provider for OWS Agent
// Supports OpenAI, Anthropic (Claude), Google (Gemini)
// API key stored in localStorage, never sent to OWS servers

// AI config stored in localStorage — API key is base64 obfuscated (not plaintext)
// For true security, use the vault backup which is scrypt-encrypted
const STORAGE_KEY = 'ows-ai-config';

function obfuscate(str) { return btoa(str.split('').reverse().join('')); }
function deobfuscate(str) { try { return atob(str).split('').reverse().join(''); } catch { return str; } }

const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    url: 'https://api.openai.com/v1/chat/completions',
    models: [
      'gpt-4.1-nano',
      'gpt-4.1-mini',
      'gpt-4.1',
      'gpt-4o-mini',
      'gpt-4o',
      'o4-mini',
      'o3',
      'o3-mini',
    ],
    defaultModel: 'gpt-4.1-nano',
  },
  anthropic: {
    name: 'Anthropic (Claude)',
    url: 'https://api.anthropic.com/v1/messages',
    models: [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-haiku-4-20250514',
    ],
    defaultModel: 'claude-sonnet-4-20250514',
  },
  gemini: {
    name: 'Google (Gemini)',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    models: [
      'gemini-2.5-flash-preview-05-20',
      'gemini-2.5-pro-preview-05-06',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
    ],
    defaultModel: 'gemini-2.5-flash-preview-05-20',
  },
  deepseek: {
    name: 'DeepSeek',
    url: 'https://api.deepseek.com/chat/completions',
    models: [
      'deepseek-chat',
      'deepseek-reasoner',
    ],
    defaultModel: 'deepseek-chat',
  },
  groq: {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
    ],
    defaultModel: 'llama-3.3-70b-versatile',
  },
};

// ---- Config ----

export function getAIConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (raw.apiKey) raw.apiKey = deobfuscate(raw.apiKey);
    return raw;
  } catch { return {}; }
}

export function saveAIConfig(config) {
  const safe = { ...config };
  if (safe.apiKey) safe.apiKey = obfuscate(safe.apiKey);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
}

export function hasAIConfig() {
  const c = getAIConfig();
  return !!(c.provider && c.apiKey);
}

// ---- System prompt for wallet agent ----

const SYSTEM_PROMPT = `You are an autonomous AI wallet agent running inside the OWS Browser SDK. You manage a non-custodial multi-chain cryptocurrency wallet.

You can execute these actions by responding with JSON:
- {"action": "check_balance", "chain": "evm"} — Check wallet balance on a chain
- {"action": "sign_message", "chain": "evm", "message": "text"} — Sign a message
- {"action": "sign_typed_data", "typedDataJson": "..."} — Sign EIP-712 data
- {"action": "schedule", "name": "task-name", "intervalMs": 60000, "task": {...}} — Schedule recurring task
- {"action": "alert", "condition": "balance_below", "chain": "evm", "threshold": "0.5"} — Set alert
- {"action": "info", "message": "text"} — Just respond with information
- {"action": "multi", "tasks": [{...}, {...}]} — Execute multiple actions

Available chains: evm (Ethereum), bitcoin, solana, cosmos, tron, sui, xrpl, filecoin, spark

Current wallet info will be provided. Always respond with valid JSON. If the user asks something you can't do with wallet actions, use the "info" action to explain.`;

// ---- API Calls ----

async function callOpenAI(apiKey, model, messages) {
  const resp = await fetch(PROVIDERS.openai.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI error: ${resp.status}`);
  }
  const data = await resp.json();
  return data.choices[0]?.message?.content || '';
}

async function callAnthropic(apiKey, model, messages) {
  const systemMsg = messages.find(m => m.role === 'system')?.content || '';
  const userMsgs = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  const resp = await fetch(PROVIDERS.anthropic.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      system: systemMsg,
      messages: userMsgs,
      max_tokens: 1024,
      temperature: 0.3,
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic error: ${resp.status}`);
  }
  const data = await resp.json();
  return data.content?.[0]?.text || '';
}

async function callGemini(apiKey, model, messages) {
  const url = PROVIDERS.gemini.url.replace('{model}', model) + `?key=${apiKey}`;
  const systemMsg = messages.find(m => m.role === 'system')?.content || '';
  const parts = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemMsg }] },
      contents: parts,
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024, responseMimeType: 'application/json' },
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini error: ${resp.status}`);
  }
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callOpenAICompat(url, apiKey, model, messages) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 1024 }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${resp.status}`);
  }
  const data = await resp.json();
  return data.choices[0]?.message?.content || '';
}

// ---- Unified chat ----

export async function chat(userMessage, walletContext = {}) {
  const config = getAIConfig();
  if (!config.provider || !config.apiKey) {
    throw new Error('No AI provider configured. Add your API key in Settings.');
  }

  const provider = config.provider;
  const model = config.model || PROVIDERS[provider]?.defaultModel;
  const apiKey = config.apiKey;

  // Build context
  const contextStr = walletContext.accounts
    ? `\nWallet: "${walletContext.name}"\nAccounts:\n${walletContext.accounts.map(a => `- ${a.chain_id}: ${a.address}`).join('\n')}\n${walletContext.balances ? `Balances:\n${walletContext.balances}` : ''}`
    : '';

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + contextStr },
    { role: 'user', content: userMessage },
  ];

  let responseText;
  switch (provider) {
    case 'openai': responseText = await callOpenAI(apiKey, model, messages); break;
    case 'anthropic': responseText = await callAnthropic(apiKey, model, messages); break;
    case 'gemini': responseText = await callGemini(apiKey, model, messages); break;
    case 'deepseek': responseText = await callOpenAICompat(PROVIDERS.deepseek.url, apiKey, model, messages); break;
    case 'groq': responseText = await callOpenAICompat(PROVIDERS.groq.url, apiKey, model, messages); break;
    default: throw new Error(`Unknown provider: ${provider}`);
  }

  // Parse JSON response
  try {
    // Extract JSON from markdown code blocks if wrapped
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
    return JSON.parse(jsonMatch[1].trim());
  } catch {
    return { action: 'info', message: responseText };
  }
}

export { PROVIDERS };
