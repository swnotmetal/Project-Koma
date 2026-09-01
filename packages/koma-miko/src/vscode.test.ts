import { describe, expect, it } from 'vitest';
import { createMiko } from './index';
import type { MikoContract } from './index';
import {
  canonicalVSCodeCalls,
  handleVSCodeHookEvent,
  skillReadPathFromVSCodeTerminal,
} from './vscode';

const contract: MikoContract = {
  id: 'vscode-ui-v1',
  appliesWhen: {
    action: {
      tools: ['replace_string_in_file', 'editFiles'],
      pathPrefixes: ['src/ui'],
      argumentNames: ['filePath'],
    },
  },
  requires: { skills: [{ name: 'product-design', reloadAfterCompaction: true }] },
  actions: {
    allow: ['read_file', 'replace_string_in_file', 'editFiles'],
    scope: {
      tools: ['replace_string_in_file', 'editFiles'],
      allowedPathPrefixes: ['src/ui'],
      argumentNames: ['filePath'],
    },
  },
  completion: { evidence: [{ type: 'artifact_changed', path: 'src/ui/Hero.tsx' }] },
  mode: 'enforce',
};

function start() {
  const miko = createMiko({ contracts: [contract] });
  miko.startTask({ sessionId: 'vscode-session', taskId: 'vscode-session', tags: [] });
  return miko;
}

const base = {
  session_id: 'vscode-session',
  cwd: 'D:\\portfolio',
  timestamp: new Date(0).toISOString(),
};

describe('VS Code Copilot adapter', () => {
  it('splits multi-file editor input into independently scoped calls', () => {
    expect(canonicalVSCodeCalls('editFiles', {
      files: ['src/ui/Hero.tsx', 'src/server.ts'],
    }, base.cwd)).toEqual([
      { tool: 'editFiles', arguments: { filePath: 'src/ui/Hero.tsx' }, cwd: base.cwd },
      { tool: 'editFiles', arguments: { filePath: 'src/server.ts' }, cwd: base.cwd },
    ]);
  });

  it('normalizes Copilot multi-replace and extracts each nested target path', () => {
    expect(canonicalVSCodeCalls('multi_replace_string_in_file', {
      replacements: [
        { filePath: 'src/ui/Hero.tsx', oldString: 'private-old', newString: 'private-new' },
        { filePath: 'src/ui/Footer.tsx', oldString: 'private-old', newString: 'private-new' },
      ],
    }, base.cwd)).toEqual([
      { tool: 'replace_string_in_file', arguments: { filePath: 'src/ui/Hero.tsx' }, cwd: base.cwd },
      { tool: 'replace_string_in_file', arguments: { filePath: 'src/ui/Footer.tsx' }, cwd: base.cwd },
    ]);
  });

  it('reviews a live Copilot multi-replace through the stable edit tool name', () => {
    const miko = createMiko({ contracts: [{ ...contract, mode: 'review' }] });
    miko.startTask({ sessionId: 'vscode-session', taskId: 'vscode-session', tags: [] });
    const reviewed = handleVSCodeHookEvent(miko, 'vscode-session', {
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'multi_replace_string_in_file',
      tool_input: {
        replacements: [{ filePath: 'src/ui/Hero.tsx', oldString: 'private-old', newString: 'private-new' }],
      },
    });

    expect(reviewed.verification?.decision).toBe('REVIEW');
    expect(reviewed.output).toMatchObject({
      hookSpecificOutput: { permissionDecision: 'ask' },
    });
  });

  it('recognizes only a narrow terminal Skill read', () => {
    expect(skillReadPathFromVSCodeTerminal(
      "Get-Content -Raw -LiteralPath '.github/skills/product-design/SKILL.md'",
      base.cwd,
    )).toBe('.github/skills/product-design/SKILL.md');
    expect(skillReadPathFromVSCodeTerminal(
      "cat '.github/skills/product-design/SKILL.md' && npm test",
      base.cwd,
    )).toBeUndefined();
  });

  it('denies an edit, permits the exact Skill read, then allows the retry', () => {
    const miko = start();
    const edit = {
      ...base,
      hook_event_name: 'PreToolUse' as const,
      tool_name: 'replace_string_in_file',
      tool_input: {
        filePath: 'src/ui/Hero.tsx',
        oldString: 'private-old',
        newString: 'private-new',
      },
    };

    expect(handleVSCodeHookEvent(miko, 'vscode-session', edit).output).toMatchObject({
      hookSpecificOutput: { permissionDecision: 'deny' },
    });

    const read = {
      ...base,
      hook_event_name: 'PreToolUse' as const,
      tool_name: 'read_file',
      tool_input: { filePath: '.github/skills/product-design/SKILL.md' },
    };
    expect(handleVSCodeHookEvent(miko, 'vscode-session', read).output).toBeUndefined();
    const recovered = handleVSCodeHookEvent(miko, 'vscode-session', {
      ...read,
      hook_event_name: 'PostToolUse',
      tool_response: 'private-skill-body',
    });
    expect(recovered.output).toMatchObject({ systemMessage: expect.stringContaining('Miko recovered') });
    expect(handleVSCodeHookEvent(miko, 'vscode-session', edit).output).toBeUndefined();
  });

  it('uses the native approval surface for REVIEW instead of hard-denying it', () => {
    const miko = createMiko({ contracts: [{ ...contract, mode: 'review' }] });
    miko.startTask({ sessionId: 'vscode-session', taskId: 'vscode-session', tags: [] });
    const reviewed = handleVSCodeHookEvent(miko, 'vscode-session', {
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'replace_string_in_file',
      tool_input: { filePath: 'src/ui/Hero.tsx' },
    });

    expect(reviewed.verification?.decision).toBe('REVIEW');
    expect(reviewed.output).toMatchObject({
      hookSpecificOutput: { permissionDecision: 'ask' },
    });
  });

  it('records every successful multi-file edit without retaining edit content', () => {
    const miko = start();
    miko.record({
      taskId: 'vscode-session',
      type: 'skill_loaded',
      name: 'product-design',
      source: 'observed',
    });
    const result = handleVSCodeHookEvent(miko, 'vscode-session', {
      ...base,
      hook_event_name: 'PostToolUse',
      tool_name: 'editFiles',
      tool_input: {
        files: ['src/ui/Hero.tsx', 'src/ui/Footer.tsx'],
        content: 'private-source',
      },
      tool_response: 'private-response',
    });
    expect(result.evidence.filter((event) => event.type === 'artifact_changed')).toEqual([
      { type: 'artifact_changed', path: 'src/ui/Hero.tsx', source: 'observed' },
      { type: 'artifact_changed', path: 'src/ui/Footer.tsx', source: 'observed' },
    ]);
    expect(JSON.stringify(result.evidence)).not.toContain('private');
  });

  it('invalidates reload-required Skill evidence before compaction', () => {
    const miko = start();
    miko.record({
      taskId: 'vscode-session',
      type: 'skill_loaded',
      name: 'product-design',
      source: 'observed',
    });
    const compacted = handleVSCodeHookEvent(miko, 'vscode-session', {
      ...base,
      hook_event_name: 'PreCompact',
      trigger: 'auto',
    });
    expect(compacted.contextAdvance?.epoch).toBe(1);

    const retried = handleVSCodeHookEvent(miko, 'vscode-session', {
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'replace_string_in_file',
      tool_input: { filePath: 'src/ui/Hero.tsx' },
    });
    expect(retried.verification?.reasonCode).toBe('PREPARATION_EVIDENCE_MISSING');
  });

  it('uses the documented nested Stop output and prevents a continuation loop', () => {
    const miko = start();
    handleVSCodeHookEvent(miko, 'vscode-session', {
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'replace_string_in_file',
      tool_input: { filePath: 'src/ui/Hero.tsx' },
    });
    const first = handleVSCodeHookEvent(miko, 'vscode-session', {
      ...base,
      hook_event_name: 'Stop',
      stop_hook_active: false,
    });
    expect(first.output).toMatchObject({
      hookSpecificOutput: { hookEventName: 'Stop', decision: 'block' },
    });
    const second = handleVSCodeHookEvent(miko, 'vscode-session', {
      ...base,
      hook_event_name: 'Stop',
      stop_hook_active: true,
    });
    expect(second.output).toBeUndefined();
  });

  it('shows a green completion receipt after the guarded artifact is observed', () => {
    const miko = start();
    handleVSCodeHookEvent(miko, 'vscode-session', {
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'replace_string_in_file',
      tool_input: { filePath: 'src/ui/Hero.tsx' },
    });
    miko.record({
      taskId: 'vscode-session', type: 'skill_loaded', name: 'product-design', source: 'observed',
    });
    handleVSCodeHookEvent(miko, 'vscode-session', {
      ...base,
      hook_event_name: 'PostToolUse',
      tool_name: 'replace_string_in_file',
      tool_input: { filePath: 'src/ui/Hero.tsx' },
      tool_response: 'done',
    });
    const completed = handleVSCodeHookEvent(miko, 'vscode-session', {
      ...base,
      hook_event_name: 'Stop',
      stop_hook_active: false,
    });
    expect(completed.output).toMatchObject({ systemMessage: expect.stringContaining('Miko verified') });
  });
});
