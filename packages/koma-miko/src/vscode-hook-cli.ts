#!/usr/bin/env node
import { runPersistentHookCli } from './hook-runtime.js';
import { handleVSCodeHookEvent } from './vscode.js';
import type { VSCodeHookInput } from './vscode.js';

runPersistentHookCli<VSCodeHookInput>({
  host: 'vscode',
  handle: handleVSCodeHookEvent,
  toolName(input) {
    return 'tool_name' in input && typeof input.tool_name === 'string'
      ? input.tool_name
      : undefined;
  },
});
