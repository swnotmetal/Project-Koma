#!/usr/bin/env node
import { handleGeminiHookEvent } from './gemini.js';
import type { GeminiHookInput } from './gemini.js';
import { runPersistentHookCli } from './hook-runtime.js';

runPersistentHookCli<GeminiHookInput>({
  host: 'gemini',
  handle: handleGeminiHookEvent,
  toolName(input) {
    return 'tool_name' in input && typeof input.tool_name === 'string' ? input.tool_name : undefined;
  },
});
