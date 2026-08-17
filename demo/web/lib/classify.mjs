/**
 * Shared classification logic for the Koma online demo.
 *
 * Uses the real koma-gate package (semantic LLM firewall), not a keyword list.
 * Provider config is resolved from an environment object so the same module works
 * in Node/Vercel (`process.env`) and Cloudflare Workers (bindings).
 */

import { createGeneralKnowledgeGuard } from 'koma-gate';

const SUPPORTED = new Set(['openai', 'anthropic', 'google', 'ollama']);

const DEFAULT_MODEL = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-haiku',
  google: 'gemini-2.5-flash',
  ollama: 'llama3.1:8b',
};

const KEY_ENV = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GEMINI_API_KEY',
  ollama: null,
};

/** Turn an env object (process.env or Worker bindings) into an LLM config. */
export function resolveConfig(env = {}) {
  const provider = SUPPORTED.has(env.KOMA_PROVIDER || '') ? env.KOMA_PROVIDER : 'google';
  const keyEnv = KEY_ENV[provider];
  return {
    provider,
    model: env.KOMA_MODEL || DEFAULT_MODEL[provider],
    apiKey: keyEnv ? env[keyEnv] : undefined,
    baseUrl: env.KOMA_BASE_URL || undefined,
    timeoutMs: 10000,
    maxRetries: 1,
  };
}

export function createClassifier(config) {
  const { provider } = config;

  const guard = createGeneralKnowledgeGuard({
    llm: {
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs ?? 10000,
      maxRetries: config.maxRetries ?? 1,
    },
    behavior: {
      failOpen: false,
      maxInputLength: 1000,
      logDecisions: false,
    },
  });

  return {
    isConfigured() {
      return provider === 'ollama' || Boolean(config.apiKey);
    },
    async classifyText(input) {
      const result = await guard.classify(input);
      return {
        allowed: result.allowed,
        inScope: result.decision.inScope,
        confidence: result.decision.confidence ?? null,
        latencyMs: result.decision.latencyMs,
        cached: result.decision.cached,
        model: result.decision.model,
        provider,
        rejectReason: result.rejectReason ?? null,
        inputHash: result.decision.inputHash,
      };
    },
  };
}

// Node / Vercel default instance, configured from process.env.
// Lazy so that a local .env loaded by server.mjs is picked up on first use
// (ES module imports are hoisted, so an eager singleton would miss it).
let defaultClassifier = null;

function getDefaultClassifier() {
  if (!defaultClassifier) {
    defaultClassifier = createClassifier(resolveConfig(globalThis.process?.env ?? {}));
  }
  return defaultClassifier;
}

export function isConfigured() {
  return getDefaultClassifier().isConfigured();
}

export async function classifyText(input) {
  return getDefaultClassifier().classifyText(input);
}
