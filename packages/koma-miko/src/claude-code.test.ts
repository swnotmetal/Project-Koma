import { describe, expect, it } from 'vitest';
import { createMiko } from './index';
import type { MikoContract } from './index';
import {
  evidenceFromClaudeEvent,
  handleClaudeHookEvent,
  toProjectRelativePath,
} from './claude-code';

const contract: MikoContract = {
  id: 'ui-skill-checkpoint',
  appliesWhen: {
    action: { tools: ['Edit', 'Write'], pathPrefixes: ['src/components'] },
  },
  requires: { skills: ['frontend-design'] },
  mode: 'enforce',
};

function start() {
  const miko = createMiko({ contracts: [contract] });
  miko.startTask({ sessionId: 'claude-session', taskId: 'claude-session', tags: [] });
  return miko;
}

describe('Claude Code adapter', () => {
  it('normalizes host absolute paths to project-relative paths', () => {
    expect(toProjectRelativePath(
      'D:\\portfolio\\src\\components\\Hero.tsx',
      'D:\\portfolio',
    )).toBe('src/components/Hero.tsx');
  });

  it('observes direct slash-command skill activation', () => {
    const evidence = evidenceFromClaudeEvent({
      session_id: 'claude-session',
      cwd: 'D:\\portfolio',
      hook_event_name: 'UserPromptExpansion',
      expansion_type: 'slash_command',
      command_name: 'frontend-design',
    });

    expect(evidence).toEqual([
      { type: 'skill_loaded', name: 'frontend-design', source: 'observed' },
    ]);
  });

  it('blocks one real UI edit until the host observes the required skill', () => {
    const miko = start();
    const edit = {
      session_id: 'claude-session',
      cwd: 'D:\\portfolio',
      hook_event_name: 'PreToolUse' as const,
      tool_name: 'Edit',
      tool_input: {
        file_path: 'D:\\portfolio\\src\\components\\Hero.tsx',
        old_string: 'private content that must not be persisted',
        new_string: 'private content that must not be persisted',
      },
    };

    const blocked = handleClaudeHookEvent(miko, 'claude-session', edit);
    expect(blocked.verification?.decision).toBe('DENY');
    expect(blocked.output).toMatchObject({
      hookSpecificOutput: { permissionDecision: 'deny' },
    });

    handleClaudeHookEvent(miko, 'claude-session', {
      session_id: 'claude-session',
      cwd: 'D:\\portfolio',
      hook_event_name: 'PostToolUse',
      tool_name: 'Skill',
      tool_input: { skill: 'frontend-design' },
    });

    const allowed = handleClaudeHookEvent(miko, 'claude-session', edit);
    expect(allowed.verification?.decision).toBe('ALLOW');
  });

  it('invalidates context-fresh skill evidence after Claude compaction', () => {
    const freshContract: MikoContract = {
      ...contract,
      requires: {
        skills: [{ name: 'frontend-design', reloadAfterCompaction: true }],
      },
    };
    const miko = createMiko({ contracts: [freshContract] });
    miko.startTask({ sessionId: 'claude-session', taskId: 'claude-session', tags: [] });
    handleClaudeHookEvent(miko, 'claude-session', {
      session_id: 'claude-session',
      cwd: 'D:\\portfolio',
      hook_event_name: 'PostToolUse',
      tool_name: 'Skill',
      tool_input: { skill: 'frontend-design' },
    });
    const edit = {
      session_id: 'claude-session',
      cwd: 'D:\\portfolio',
      hook_event_name: 'PreToolUse' as const,
      tool_name: 'Edit',
      tool_input: { file_path: 'D:\\portfolio\\src\\components\\Hero.tsx' },
    };
    expect(handleClaudeHookEvent(miko, 'claude-session', edit).verification?.decision).toBe('ALLOW');

    const compacted = handleClaudeHookEvent(miko, 'claude-session', {
      session_id: 'claude-session',
      cwd: 'D:\\portfolio',
      hook_event_name: 'PostCompact',
      trigger: 'auto',
    });

    expect(compacted.contextAdvance?.epoch).toBe(1);
    expect(handleClaudeHookEvent(miko, 'claude-session', edit).verification?.decision).toBe('DENY');
  });

  it('stores only path metadata from edits, never file content', () => {
    const evidence = evidenceFromClaudeEvent({
      session_id: 'claude-session',
      cwd: 'D:\\portfolio',
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: 'D:\\portfolio\\src\\components\\Hero.tsx',
        old_string: 'secret-old',
        new_string: 'secret-new',
      },
    });
    const serialized = JSON.stringify(evidence);

    expect(serialized).toContain('src/components/Hero.tsx');
    expect(serialized).not.toContain('secret-old');
    expect(serialized).not.toContain('secret-new');
  });
});
