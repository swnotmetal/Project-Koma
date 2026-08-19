/**
 * Koma Gate unit tests.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  KomaGuard,
  buildClassificationPrompt,
  SYSTEM_PROMPT_TEMPLATE,
  createGeneralKnowledgeGuard,
  createCodeAssistantGuard,
  createSupportGuard,
} from './index';
import type { GuardConfig, DomainConfig } from './index';

// ---------------------------------------------------------------------------
// buildClassificationPrompt
// ---------------------------------------------------------------------------

describe('buildClassificationPrompt', () => {
  const domain: DomainConfig = {
    name: 'Test Assistant',
    description: 'A test assistant for unit tests.',
    allowedTopics: ['testing', 'code'],
    blockedTopics: ['cooking', 'gossip'],
    positiveExamples: ['How to write a test?', 'What is TDD?'],
    negativeExamples: ['How to bake a cake?', 'Tell me a secret'],
  };

  it('should include domain name in prompt', () => {
    const prompt = buildClassificationPrompt(domain, 'Hello');
    expect(prompt).toContain('Test Assistant');
  });

  it('should include allowed topics', () => {
    const prompt = buildClassificationPrompt(domain, 'Hello');
    expect(prompt).toContain('testing');
    expect(prompt).toContain('code');
  });

  it('should include blocked topics', () => {
    const prompt = buildClassificationPrompt(domain, 'Hello');
    expect(prompt).toContain('cooking');
  });

  it('should include the user input at the end', () => {
    const prompt = buildClassificationPrompt(domain, 'How to write a test?');
    expect(prompt).toContain('"How to write a test?"');
  });

  it('should escape double quotes in input', () => {
    const prompt = buildClassificationPrompt(domain, 'He said "hello"');
    expect(prompt).toContain('\\"hello\\"');
  });
});

// ---------------------------------------------------------------------------
// KomaGuard — unit tests with a mock adapter
// ---------------------------------------------------------------------------

function createMockConfig(overrides: Partial<GuardConfig> = {}): GuardConfig {
  return {
    llm: {
      provider: 'custom',
      model: 'mock',
      customRequest: async (prompt: string) => {
        // Default mock: always return in_scope true
        return '{"in_scope": true}';
      },
      timeoutMs: 1000,
    },
    domain: {
      name: 'Mock Assistant',
      description: 'Mock for testing.',
      allowedTopics: ['test'],
      blockedTopics: ['evil'],
      positiveExamples: ['test query'],
      negativeExamples: ['evil query'],
    },
    behavior: {
      failOpen: true,
      maxInputLength: 500,
      logDecisions: false,
    },
    cache: { enabled: false, ttlMs: 1000, maxSize: 10 },
    ...overrides,
  };
}

describe('KomaGuard', () => {
  it('should classify in-scope input as allowed', async () => {
    const guard = new KomaGuard(createMockConfig());
    const result = await guard.classify('test query');
    expect(result.allowed).toBe(true);
    expect(result.decision.inScope).toBe(true);
  });

  it('should classify out-of-scope input as rejected', async () => {
    const guard = new KomaGuard(createMockConfig({
      llm: {
        provider: 'custom',
        model: 'mock',
        customRequest: async () => '{"in_scope": false}',
      },
    }));

    const result = await guard.classify('evil query');
    expect(result.allowed).toBe(false);
  });

  it('should reject input exceeding max length', async () => {
    const guard = new KomaGuard(createMockConfig({
      behavior: { failOpen: true, maxInputLength: 10, logDecisions: false },
    }));

    const result = await guard.classify('this is a very long input that exceeds the limit');
    expect(result.allowed).toBe(false); // length check hard-rejects, never truncates
    expect(result.rejectReason).toContain('exceeds maximum length');
  });

  it('should fail open on adapter error', async () => {
    const guard = new KomaGuard(createMockConfig({
      llm: {
        provider: 'custom',
        model: 'mock',
        customRequest: async () => { throw new Error('Network error'); },
      },
      behavior: { failOpen: true, maxInputLength: 500, logDecisions: false },
    }));

    const result = await guard.classify('anything');
    expect(result.allowed).toBe(true); // fail-open
  });

  it('should fail closed when failOpen is false', async () => {
    const guard = new KomaGuard(createMockConfig({
      llm: {
        provider: 'custom',
        model: 'mock',
        customRequest: async () => { throw new Error('Network error'); },
      },
      behavior: { failOpen: false, maxInputLength: 500, logDecisions: false },
    }));

    const result = await guard.classify('anything');
    expect(result.allowed).toBe(false);
    expect(result.rejectReason).toContain('fail-closed');
  });

  it('should use cache on repeated input', async () => {
    let callCount = 0;
    const guard = new KomaGuard(createMockConfig({
      llm: {
        provider: 'custom',
        model: 'mock',
        customRequest: async () => {
          callCount++;
          return '{"in_scope": true}';
        },
      },
      cache: { enabled: true, ttlMs: 60000, maxSize: 100 },
    }));

    await guard.classify('cached query');
    await guard.classify('cached query');
    await guard.classify('cached query');

    // The custom request should only be called once (second and third hit cache)
    expect(callCount).toBe(1);
  });

  it('should track statistics', async () => {
    const guard = new KomaGuard(createMockConfig());

    await guard.classify('a');
    await guard.classify('b');

    const stats = guard.getStats();
    expect(stats.total).toBe(2);
    expect(stats.allowed).toBe(2);
  });

  it('should reset statistics', async () => {
    const guard = new KomaGuard(createMockConfig());
    await guard.classify('a');
    guard.resetStats();
    expect(guard.getStats().total).toBe(0);
  });

  it('should sanitize zero-width characters', async () => {
    const guard = new KomaGuard(createMockConfig());
    // Input with zero-width space (U+200B)
    const result = await guard.classify('hello\u200Bworld');
    expect(result.allowed).toBe(true);
  });

  it('should emit decision events', async () => {
    const decisions: any[] = [];
    const guard = new KomaGuard(createMockConfig({
      onDecision: (d) => decisions.push(d),
    }));

    await guard.classify('event test');
    expect(decisions).toHaveLength(1);
    expect(decisions[0].inScope).toBe(true);
  });

  it('should clear cache', async () => {
    let callCount = 0;
    const guard = new KomaGuard(createMockConfig({
      llm: {
        provider: 'custom',
        model: 'mock',
        customRequest: async () => { callCount++; return '{"in_scope": true}'; },
      },
      cache: { enabled: true, ttlMs: 60000, maxSize: 100 },
    }));

    await guard.classify('x');
    guard.clearCache();
    await guard.classify('x');

    expect(callCount).toBe(2); // cache cleared → second call also hits adapter
  });
});

// ---------------------------------------------------------------------------
// Preset factories
// ---------------------------------------------------------------------------

describe('Preset factories', () => {
  it('createGeneralKnowledgeGuard should return a KomaGuard', () => {
    // Use a custom request to avoid needing real API keys
    const guard = createGeneralKnowledgeGuard({
      llm: {
        provider: 'custom',
        model: 'mock',
        customRequest: async () => '{"in_scope": true}',
      },
    });
    expect(guard).toBeInstanceOf(KomaGuard);
  });

  it('createCodeAssistantGuard should return a KomaGuard', () => {
    const guard = createCodeAssistantGuard({
      llm: {
        provider: 'custom',
        model: 'mock',
        customRequest: async () => '{"in_scope": true}',
      },
    });
    expect(guard).toBeInstanceOf(KomaGuard);
  });

  it('createSupportGuard should return a KomaGuard', () => {
    const guard = createSupportGuard({
      llm: {
        provider: 'custom',
        model: 'mock',
        customRequest: async () => '{"in_scope": true}',
      },
    });
    expect(guard).toBeInstanceOf(KomaGuard);
  });

  it('preset guards should classify correctly with mock adapter', async () => {
    const guard = createGeneralKnowledgeGuard({
      llm: {
        provider: 'custom',
        model: 'mock',
        customRequest: async () => '{"in_scope": true}',
      },
    });

    const result = await guard.classify('What is TypeScript?');
    expect(result.allowed).toBe(true);
  });
});
