/**
 * Koma Gate MCP Server
 *
 * Exposes Koma Gate's prompt-injection classification as an MCP tool so AI
 * agents can check whether user input is in-scope before acting on it.
 *
 * Environment:
 *   KOMA_PROVIDER   — openai | anthropic | google | deepseek | ollama (default: google)
 *   KOMA_MODEL      — optional model override
 *   Provider key    — OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY / DEEPSEEK_API_KEY
 */

import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import {
  createGeneralKnowledgeGuard,
  createCodeAssistantGuard,
  createSupportGuard,
  createReferenceToolGuard,
  KomaGuard,
  GuardConfig,
} from 'koma-gate';

const runtimeEnv = (globalThis as any).process?.env ?? {};

type Preset = 'general' | 'code' | 'support' | 'reference';
type Provider = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'ollama';

const PRESET_DEFAULTS: Record<Preset, { model: string; provider: Provider }> = {
  general: { provider: 'google', model: 'gemini-2.5-flash' },
  code: { provider: 'ollama', model: 'llama3.1:8b' },
  support: { provider: 'openai', model: 'gpt-4o-mini' },
  reference: { provider: 'google', model: 'gemini-2.5-flash' },
};

const API_KEY_ENV: Record<Provider, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GEMINI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  ollama: '',
};

// Provider used across all presets (env override)
const configuredProvider = (runtimeEnv.KOMA_PROVIDER as Provider) || 'google';
const configuredModel = runtimeEnv.KOMA_MODEL;

function apiKeyFor(provider: Provider): string | undefined {
  const envKey = API_KEY_ENV[provider];
  if (!envKey) return undefined;
  return runtimeEnv[envKey];
}

function buildLlmConfig(provider: Provider, fallbackModel: string) {
  const llm: any = {
    provider,
    model: configuredModel || fallbackModel,
    timeoutMs: 15000,
    maxRetries: 1,
  };
  const key = apiKeyFor(provider);
  if (key) llm.apiKey = key;
  if (provider === 'deepseek') llm.baseUrl = 'https://api.deepseek.com';
  return llm;
}

function createGuard(preset: Preset): KomaGuard {
  const defaults = PRESET_DEFAULTS[preset];
  const provider = configuredProvider;
  const llm = buildLlmConfig(provider, defaults.model);
  const base: Partial<GuardConfig> = {
    llm,
    behavior: { failOpen: false, maxInputLength: 500, logDecisions: false },
    cache: { enabled: true, ttlMs: 3600000, maxSize: 5000 },
  };

  switch (preset) {
    case 'code':
      return createCodeAssistantGuard(base);
    case 'support':
      return createSupportGuard(base);
    case 'reference':
      return createReferenceToolGuard(base);
    case 'general':
    default:
      return createGeneralKnowledgeGuard(base);
  }
}

const server = new McpServer({ name: 'koma-gate', version: '0.1.0' });

const guards: Partial<Record<Preset, KomaGuard>> = {};

function guardFor(preset: Preset): KomaGuard {
  if (!guards[preset]) guards[preset] = createGuard(preset);
  return guards[preset]!;
}

server.registerTool(
  'classify_input',
  {
    description:
      'Check whether user input is safe and in-scope before an AI system processes it. ' +
      'Detects prompt injection, jailbreak attempts, instruction overrides, and off-topic requests. ' +
      'Use this to validate untrusted user text before passing it to an LLM or executing a tool.',
    inputSchema: z.object({
      text: z.string().describe('The untrusted user input to classify'),
      preset: z
        .enum(['general', 'code', 'support', 'reference'])
        .optional()
        .describe('Which guard domain to use. Default: general knowledge assistant'),
    }),
  },
  async ({ text, preset }) => {
    const chosen = (preset as Preset) || 'general';
    const guard = guardFor(chosen);
    const result = await guard.classify(text);
    const payload = {
      allowed: result.allowed,
      in_scope: result.decision.inScope,
      reason: result.rejectReason || (result.allowed ? 'in scope' : 'out of scope'),
      preset: chosen,
      model: result.decision.model,
    };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for stdio servers; stdout is reserved for JSON-RPC
  console.error(`koma-gate MCP server running (provider: ${configuredProvider})`);
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
