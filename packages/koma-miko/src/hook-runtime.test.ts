import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { handleCodexHookEvent } from './codex';
import type { CodexHookInput } from './codex';
import { handlePersistentHookInput } from './hook-runtime';

const contract = {
  id: 'runtime-recovery-v1',
  appliesWhen: {
    action: {
      tools: ['apply_patch'],
      pathPrefixes: ['src/ui'],
      argumentNames: ['path'],
    },
  },
  requires: {
    skills: ['product-design'],
    references: ['docs/design-system.md'],
  },
  actions: {
    allow: ['apply_patch', 'Read'],
    scope: {
      tools: ['apply_patch'],
      allowedPathPrefixes: ['src/ui'],
      argumentNames: ['path'],
    },
  },
  completion: {
    evidence: [{ type: 'artifact_changed', path: 'src/ui/Hero.tsx' }],
  },
  mode: 'enforce',
} as const;

const base = {
  session_id: 'runtime-recovery-session',
  cwd: '',
};

const runtimeOptions = {
  host: 'codex',
  handle: handleCodexHookEvent,
  toolName(input: CodexHookInput) {
    return 'tool_name' in input && typeof input.tool_name === 'string' ? input.tool_name : undefined;
  },
};

const temporaryRoots: string[] = [];

function fixture(): { root: string; stateDir: string } {
  const temporary = mkdtempSync(path.join(tmpdir(), 'miko-runtime-'));
  temporaryRoots.push(temporary);
  const root = path.join(temporary, 'project');
  const stateDir = path.join(temporary, 'state');
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  mkdirSync(path.join(root, 'src', 'ui'), { recursive: true });
  mkdirSync(path.join(root, '.agents', 'skills', 'product-design'), { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(path.join(root, 'miko.json'), `${JSON.stringify({ version: 1, specs: [contract] })}\n`);
  writeFileSync(path.join(root, 'docs', 'design-system.md'), '# Design system\n');
  writeFileSync(path.join(root, '.agents', 'skills', 'product-design', 'SKILL.md'), '# Product design\n');
  return { root, stateDir };
}

function run(
  input: Omit<CodexHookInput, 'cwd' | 'session_id'>,
  root: string,
  stateDir: string,
): object | undefined {
  const previousStateDir = process.env.MIKO_STATE_DIR;
  process.env.MIKO_STATE_DIR = stateDir;
  try {
    return handlePersistentHookInput({
      ...base,
      ...input,
      cwd: root,
    } as CodexHookInput, runtimeOptions);
  } finally {
    if (previousStateDir === undefined) delete process.env.MIKO_STATE_DIR;
    else process.env.MIKO_STATE_DIR = previousStateDir;
  }
}

function editInput(): CodexHookInput {
  return {
    ...base,
    hook_event_name: 'PreToolUse',
    tool_name: 'apply_patch',
    tool_input: { command: '*** Update File: src/ui/Hero.tsx' },
  };
}

function skillReadInput(): CodexHookInput {
  return {
    ...base,
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: "Get-Content -Raw -LiteralPath '.agents/skills/product-design/SKILL.md'" },
    tool_response: 'private skill body',
  };
}

function referenceReadInput(): CodexHookInput {
  return {
    ...base,
    hook_event_name: 'PostToolUse',
    tool_name: 'Read',
    tool_input: { file_path: 'docs/design-system.md' },
    tool_response: 'private reference body',
  };
}

function artifactInput(): CodexHookInput {
  return {
    ...base,
    hook_event_name: 'PostToolUse',
    tool_name: 'apply_patch',
    tool_input: { command: '*** Update File: src/ui/Hero.tsx' },
    tool_response: 'private patch output',
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('persistent Hook runtime recovery', () => {
  it('replays ledger records appended after a saved snapshot checkpoint', () => {
    const { root, stateDir } = fixture();
    const edit = editInput();

    const denied = run(edit, root, stateDir) as { hookSpecificOutput?: { permissionDecision?: string } };
    expect(denied?.hookSpecificOutput?.permissionDecision).toBe('deny');
    const snapshotPath = snapshotPathFor(stateDir);
    const snapshotName = readFileSync(snapshotPath, 'utf8');
    const ledgerNames = requireLedgerNames(stateDir);
    const snapshot = JSON.parse(snapshotName) as { ledgerBytes: number; task: unknown };

    run(skillReadInput(), root, stateDir);
    run(referenceReadInput(), root, stateDir);
    writeFileSync(snapshotPathFor(stateDir), `${JSON.stringify(snapshot)}\n`);
    expect(run(edit, root, stateDir)).toBeUndefined();
    expect(readFileSync(path.join(stateDir, ledgerNames[0]), 'utf8')).toContain('skill_loaded');
  });

  it('falls back to the complete ledger when the snapshot is corrupt', () => {
    const { root, stateDir } = fixture();
    run(editInput(), root, stateDir);
    run(skillReadInput(), root, stateDir);
    run(referenceReadInput(), root, stateDir);
    run(editInput(), root, stateDir);
    run(artifactInput(), root, stateDir);

    writeFileSync(snapshotPathFor(stateDir), '{"version":1,"ledgerBytes":"bad"}\n');
    expect(run({ ...base, hook_event_name: 'Stop', stop_hook_active: false }, root, stateDir)).toBeUndefined();
  });
});

function requireLedgerNames(stateDir: string): string[] {
  const names = readdirSync(stateDir).filter((name) => name.endsWith('.jsonl'));
  expect(names).toHaveLength(1);
  return names;
}

function fsSessionKey(): string {
  return createHash('sha256').update(`${runtimeOptions.host}:${base.session_id}`).digest('hex').slice(0, 24);
}

function snapshotPathFor(stateDir: string): string {
  return path.join(stateDir, `codex-${fsSessionKey()}.snapshot.json`);
}
