#!/usr/bin/env node
import { handleCodexHookEvent } from './codex.js';
import type { CodexHookInput } from './codex.js';
import { runPersistentHookCli } from './hook-runtime.js';

runPersistentHookCli<CodexHookInput>({
  host: 'codex',
  handle: handleCodexHookEvent,
  toolName(input) {
    return 'tool_name' in input && typeof input.tool_name === 'string' ? input.tool_name : undefined;
  },
});
