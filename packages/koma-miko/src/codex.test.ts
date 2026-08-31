import { describe, expect, it } from 'vitest';
import { createMiko } from './index';
import type { MikoContract } from './index';
import {
  codexToolSucceeded,
  handleCodexHookEvent,
  pathsFromCodexPatch,
  skillReadPathFromCodexShell,
} from './codex';

const contract: MikoContract = {
  id: 'codex-ui-v1',
  appliesWhen: {
    action: { tools: ['apply_patch'], pathPrefixes: ['src/ui'], argumentNames: ['path'] },
  },
  requires: { skills: ['product-design'] },
  actions: {
    allow: ['apply_patch', 'Read'],
    scope: { tools: ['apply_patch'], allowedPathPrefixes: ['src/ui'], argumentNames: ['path'] },
  },
  completion: { evidence: [{ type: 'artifact_changed', path: 'src/ui/Hero.tsx' }] },
  mode: 'enforce',
};

function start() {
  const miko = createMiko({ contracts: [contract] });
  miko.startTask({ sessionId: 'codex-session', taskId: 'codex-session', tags: [] });
  return miko;
}

const patchInput = {
  session_id: 'codex-session',
  cwd: 'D:\\portfolio',
  hook_event_name: 'PreToolUse' as const,
  tool_name: 'apply_patch',
  tool_input: {
    command: '*** Begin Patch\n*** Update File: src/ui/Hero.tsx\n@@\n-old\n+new\n*** End Patch',
  },
};

describe('Codex adapter', () => {
  it('extracts every target path without retaining patch content', () => {
    expect(pathsFromCodexPatch(
      '*** Update File: src/ui/A.tsx\n*** Add File: src/ui/B.tsx',
      'D:\\portfolio',
    )).toEqual(['src/ui/A.tsx', 'src/ui/B.tsx']);
  });

  it('recognizes only a narrow read-only SKILL.md shell command', () => {
    expect(skillReadPathFromCodexShell(
      "Get-Content -Raw -LiteralPath '.agents/skills/product-design/SKILL.md'",
      'D:\\portfolio',
    )).toBe('.agents/skills/product-design/SKILL.md');
    expect(skillReadPathFromCodexShell(
      "Get-Content -Raw -LiteralPath '.agents/skills/product-design/SKILL.md'; npm test",
      'D:\\portfolio',
    )).toBeUndefined();
  });

  it('supports current Codex exec_command/cmd Skill recovery', () => {
    const miko = start();
    handleCodexHookEvent(miko, 'codex-session', patchInput);
    const shellInput = {
      session_id: 'codex-session',
      cwd: 'D:\\portfolio',
      hook_event_name: 'PreToolUse' as const,
      tool_name: 'exec_command',
      tool_input: {
        cmd: "Get-Content -Raw -LiteralPath '.agents/skills/product-design/SKILL.md'",
      },
    };
    expect(handleCodexHookEvent(miko, 'codex-session', shellInput).output).toBeUndefined();
    const recovered = handleCodexHookEvent(miko, 'codex-session', {
      ...shellInput,
      hook_event_name: 'PostToolUse',
      tool_response: { status: 'completed', exitCode: 0 },
    });
    expect(recovered.output).toMatchObject({ systemMessage: expect.stringContaining('Miko recovered') });
    expect(handleCodexHookEvent(miko, 'codex-session', patchInput).output).toBeUndefined();
  });

  it('blocks a patch, permits exact Skill recovery, then allows the retried patch', () => {
    const miko = start();
    const blocked = handleCodexHookEvent(miko, 'codex-session', patchInput);
    expect(blocked.verification?.decision).toBe('DENY');
    expect(blocked.output).toMatchObject({
      hookSpecificOutput: { permissionDecision: 'deny' },
    });

    const readInput = {
      session_id: 'codex-session',
      cwd: 'D:\\portfolio',
      hook_event_name: 'PreToolUse' as const,
      tool_name: 'Bash',
      tool_input: {
        command: "Get-Content -Raw -LiteralPath '.agents/skills/product-design/SKILL.md'",
      },
    };
    expect(handleCodexHookEvent(miko, 'codex-session', readInput).output).toBeUndefined();

    const recovered = handleCodexHookEvent(miko, 'codex-session', {
      ...readInput,
      hook_event_name: 'PostToolUse',
      tool_response: 'Skill instructions loaded.',
    });
    expect(recovered.output).toMatchObject({ systemMessage: expect.stringContaining('Miko recovered') });
    expect(handleCodexHookEvent(miko, 'codex-session', patchInput).output).toBeUndefined();
  });

  it('uses the host approval surface for REVIEW instead of hard-denying it', () => {
    const miko = createMiko({ contracts: [{ ...contract, mode: 'review' }] });
    miko.startTask({ sessionId: 'codex-session', taskId: 'codex-session', tags: [] });
    const reviewed = handleCodexHookEvent(miko, 'codex-session', patchInput);

    expect(reviewed.verification?.decision).toBe('REVIEW');
    expect(reviewed.output).toMatchObject({
      hookSpecificOutput: { permissionDecision: 'ask' },
    });
  });

  it('does not treat an explicit failed tool response as evidence', () => {
    expect(codexToolSucceeded({ exitCode: 1, error: 'failed' })).toBe(false);
    expect(codexToolSucceeded({ exitCode: 0, status: 'completed' })).toBe(true);
  });

  it('continues once for missing completion evidence and then stops looping', () => {
    const miko = start();
    handleCodexHookEvent(miko, 'codex-session', patchInput);
    const first = handleCodexHookEvent(miko, 'codex-session', {
      session_id: 'codex-session',
      cwd: 'D:\\portfolio',
      hook_event_name: 'Stop',
      stop_hook_active: false,
    });
    expect(first.output).toMatchObject({ decision: 'block' });

    const second = handleCodexHookEvent(miko, 'codex-session', {
      session_id: 'codex-session',
      cwd: 'D:\\portfolio',
      hook_event_name: 'Stop',
      stop_hook_active: true,
    });
    expect(second.output).toBeUndefined();
  });

  it('emits a green receipt when completion evidence is observed', () => {
    const miko = start();
    handleCodexHookEvent(miko, 'codex-session', patchInput);
    miko.record({
      taskId: 'codex-session', type: 'skill_loaded', name: 'product-design', source: 'observed',
    });
    handleCodexHookEvent(miko, 'codex-session', {
      ...patchInput,
      hook_event_name: 'PostToolUse',
      tool_response: { status: 'completed', exitCode: 0 },
    });
    const completed = handleCodexHookEvent(miko, 'codex-session', {
      session_id: 'codex-session', cwd: 'D:\\portfolio', hook_event_name: 'Stop', stop_hook_active: false,
    });
    expect(completed.output).toMatchObject({ systemMessage: expect.stringContaining('Miko verified') });
  });
});
