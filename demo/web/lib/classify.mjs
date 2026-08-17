/**
 * Shared classification logic for the Koma online demo.
 *
 * Uses the real koma-gate package (semantic LLM firewall), not a keyword list.
 * Provider is configured via environment variables and never exposed to the client.
 */

import { createGeneralKnowledgeGuard } from 'koma-gate';

const SUPPORTED = new Set(['openai', 'anthropic', 'google', 'ollama']);

const PROVIDER = SUPPORTED.has(process.env.KOMA_PROVIDER || '')
  ? process.env.KOMA_PROVIDER
  : 'google';

const DEFAULT_MODEL = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-haiku',
  google: 'gemini-2.5-flash',
  ollama: 'llama3.1:8b',
}[PROVIDER];

const KEY_ENV = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GEMINI_API_KEY',
  ollama: null,
}[PROVIDER];

const apiKey = KEY_ENV ? process.env[KEY_ENV] : undefined;

export function isConfigured() {
  return PROVIDER === 'ollama' || Boolean(apiKey);
}

const guard = createGeneralKnowledgeGuard({
  llm: {
    provider: PROVIDER,
    model: process.env.KOMA_MODEL || DEFAULT_MODEL,
    apiKey,
    baseUrl: process.env.KOMA_BASE_URL || undefined,
    timeoutMs: 10000,
    maxRetries: 1,
  },
  behavior: {
    failOpen: false,
    maxInputLength: 1000,
    logDecisions: false,
  },
});

export async function classifyText(input) {
  const result = await guard.classify(input);
  return {
    allowed: result.allowed,
    inScope: result.decision.inScope,
    confidence: result.decision.confidence ?? null,
    latencyMs: result.decision.latencyMs,
    cached: result.decision.cached,
    model: result.decision.model,
    provider: PROVIDER,
    rejectReason: result.rejectReason ?? null,
    inputHash: result.decision.inputHash,
  };
}
