import { describe, expect, it } from 'vitest';
import { createMiko, formatMikoDecision, toClaudePreToolUseDecision } from './index';
import type { MikoContract } from './index';

const uiContract: MikoContract = {
  id: 'ui-change-v1',
  appliesWhen: { taskTags: ['ui'] },
  requires: {
    skills: ['product-design'],
    references: ['docs/design-system.md'],
  },
  actions: {
    allow: ['read_file', 'write_file', 'run_check'],
    deny: ['delete_file'],
    maxRisk: 'medium',
    scope: {
      tools: ['write_file'],
      allowedPathPrefixes: ['src/ui'],
      argumentNames: ['path'],
    },
  },
  completion: {
    evidence: [
      { type: 'check_passed', name: 'rendered-ui-review' },
      { type: 'check_passed', name: 'targeted-tests' },
      { type: 'tool_succeeded', tool: 'run_check', matches: { suite: 'ui' } },
    ],
  },
  mode: 'review',
};

function startUiTask() {
  const miko = createMiko({ contracts: [uiContract] });
  miko.startTask({ sessionId: 'session-1', taskId: 'settings-page', tags: ['ui'] });
  return miko;
}

function recordPreparation(miko: ReturnType<typeof startUiTask>) {
  miko.record({ taskId: 'settings-page', type: 'skill_loaded', name: 'product-design', source: 'observed' });
  miko.record({
    taskId: 'settings-page',
    type: 'reference_read',
    path: './docs/design-system.md',
    source: 'observed',
  });
}

describe('Koma Miko alpha', () => {
  it('reviews a UI task that starts without its required skill and reference', () => {
    const result = startUiTask().verifyPreparation('settings-page');

    expect(result.decision).toBe('REVIEW');
    expect(result.reasonCode).toBe('PREPARATION_EVIDENCE_MISSING');
    expect(result.missing).toEqual([
      'ui-change-v1:skill_loaded:product-design',
      'ui-change-v1:reference_read:docs/design-system.md',
    ]);
  });

  it('allows preparation after the required evidence is recorded', () => {
    const miko = startUiTask();
    recordPreparation(miko);

    expect(miko.verifyPreparation('settings-page').decision).toBe('ALLOW');
  });

  it('retains an agent claim but never accepts it as observed skill evidence', () => {
    const miko = startUiTask();
    miko.record({
      taskId: 'settings-page', type: 'skill_loaded', name: 'product-design', source: 'asserted',
    });

    const result = miko.verifyPreparation('settings-page');
    expect(result.decision).toBe('REVIEW');
    expect(result.reasonCode).toBe('SKILL_DECLARED_BUT_NOT_OBSERVED');
    expect(miko.getEvidence('settings-page')).toHaveLength(1);
  });

  it('activates a UI contract from an observed edit path without model-supplied task tags', () => {
    const pathContract: MikoContract = {
      id: 'ui-path-contract',
      appliesWhen: {
        action: { tools: ['Edit', 'Write'], pathPrefixes: ['src/components'] },
      },
      requires: { skills: ['frontend-design'] },
      mode: 'enforce',
    };
    const miko = createMiko({ contracts: [pathContract] });
    miko.startTask({ sessionId: 'session-path', taskId: 'path-task', tags: [] });

    const blocked = miko.verifyAction({
      taskId: 'path-task',
      tool: 'Edit',
      risk: 'medium',
      arguments: { file_path: 'src/components/Hero.tsx' },
    });

    expect(blocked.decision).toBe('DENY');
    expect(blocked.reasonCode).toBe('PREPARATION_EVIDENCE_MISSING');
    expect(miko.getActiveContractIds('path-task')).toEqual(['ui-path-contract']);
  });

  it('denies a forbidden tool even after preparation succeeds', () => {
    const miko = startUiTask();
    recordPreparation(miko);

    const result = miko.verifyAction({
      taskId: 'settings-page',
      tool: 'delete_file',
      risk: 'high',
      arguments: { path: 'src/ui/Settings.tsx' },
    });

    expect(result.decision).toBe('DENY');
    expect(result.reasonCode).toBe('TOOL_DENIED');
  });

  it('denies tools outside an explicit allowlist', () => {
    const miko = startUiTask();
    recordPreparation(miko);

    const result = miko.verifyAction({ taskId: 'settings-page', tool: 'shell', risk: 'low' });
    expect(result.reasonCode).toBe('TOOL_NOT_ALLOWED');
  });

  it('denies actions above the contract risk ceiling', () => {
    const miko = startUiTask();
    recordPreparation(miko);

    const result = miko.verifyAction({ taskId: 'settings-page', tool: 'write_file', risk: 'high' });
    expect(result.reasonCode).toBe('RISK_TOO_HIGH');
  });

  it('allows a scoped write inside the configured path', () => {
    const miko = startUiTask();
    recordPreparation(miko);

    const result = miko.verifyAction({
      taskId: 'settings-page',
      tool: 'write_file',
      risk: 'medium',
      arguments: { path: 'src/ui/settings/Panel.tsx' },
    });
    expect(result.decision).toBe('ALLOW');
  });

  it('denies sibling-prefix and traversal escapes from path scope', () => {
    const miko = startUiTask();
    recordPreparation(miko);

    const sibling = miko.verifyAction({
      taskId: 'settings-page',
      tool: 'write_file',
      risk: 'medium',
      arguments: { path: 'src/ui-admin/Panel.tsx' },
    });
    const traversal = miko.verifyAction({
      taskId: 'settings-page',
      tool: 'write_file',
      risk: 'medium',
      arguments: { path: 'src/ui/../../secrets.txt' },
    });

    expect(sibling.reasonCode).toBe('PATH_OUT_OF_SCOPE');
    expect(traversal.reasonCode).toBe('PATH_OUT_OF_SCOPE');
  });

  it('reviews a scoped action when its path argument is missing', () => {
    const miko = startUiTask();
    recordPreparation(miko);

    const result = miko.verifyAction({
      taskId: 'settings-page',
      tool: 'write_file',
      risk: 'medium',
      arguments: {},
    });
    expect(result.reasonCode).toBe('SCOPE_ARGUMENT_MISSING');
  });

  it('reviews completion while tests, rendered review, and matching tool evidence are absent', () => {
    const miko = startUiTask();
    recordPreparation(miko);

    const result = miko.verifyCompletion('settings-page');
    expect(result.decision).toBe('REVIEW');
    expect(result.reasonCode).toBe('COMPLETION_EVIDENCE_MISSING');
    expect(result.missing).toHaveLength(3);
  });

  it('allows completion only after all declared evidence is present', () => {
    const miko = startUiTask();
    recordPreparation(miko);
    miko.record({
      taskId: 'settings-page', type: 'check_passed', name: 'rendered-ui-review', source: 'external',
    });
    miko.record({
      taskId: 'settings-page', type: 'check_passed', name: 'targeted-tests', source: 'external',
    });
    miko.record({
      taskId: 'settings-page',
      type: 'tool_succeeded',
      tool: 'run_check',
      arguments: { suite: 'ui', attempt: 1 },
      source: 'observed',
    });

    expect(miko.verifyCompletion('settings-page').decision).toBe('ALLOW');
  });

  it('does not accept tool evidence whose arguments fail the declared subset match', () => {
    const miko = startUiTask();
    recordPreparation(miko);
    miko.record({
      taskId: 'settings-page', type: 'check_passed', name: 'rendered-ui-review', source: 'external',
    });
    miko.record({
      taskId: 'settings-page', type: 'check_passed', name: 'targeted-tests', source: 'external',
    });
    miko.record({
      taskId: 'settings-page',
      type: 'tool_succeeded',
      tool: 'run_check',
      arguments: { suite: 'server' },
      source: 'observed',
    });

    expect(miko.verifyCompletion('settings-page').missing).toContain(
      'ui-change-v1:tool_succeeded:run_check',
    );
  });

  it('does not apply a UI contract to an unrelated task', () => {
    const miko = createMiko({ contracts: [uiContract] });
    miko.startTask({ sessionId: 'session-2', taskId: 'database-index', tags: ['backend'] });

    const result = miko.verifyCompletion('database-index');
    expect(result.decision).toBe('ALLOW');
    expect(result.reasonCode).toBe('NO_APPLICABLE_CONTRACT');
  });

  it('rejects unknown evidence at runtime and never lets it satisfy a requirement', () => {
    const miko = startUiTask();
    const recorded = miko.record({
      taskId: 'settings-page',
      type: 'skill_loaded',
      name: '',
      source: 'observed',
    } as any);

    expect(recorded.accepted).toBe(false);
    expect(recorded.reasonCode).toBe('INVALID_EVIDENCE');
    expect(miko.getEvidence('settings-page')).toHaveLength(0);
    expect(miko.verifyPreparation('settings-page').decision).toBe('REVIEW');
  });

  it('makes missing evidence a denial in enforce mode', () => {
    const enforceContract: MikoContract = { ...uiContract, id: 'ui-enforced', mode: 'enforce' };
    const miko = createMiko({ contracts: [enforceContract] });
    miko.startTask({ sessionId: 'session-3', taskId: 'strict-ui', tags: ['ui'] });

    expect(miko.verifyPreparation('strict-ui').decision).toBe('DENY');
  });

  it('does not let an unrelated enforce contract upgrade a review-only gap to DENY', () => {
    const enforceContract: MikoContract = {
      id: 'safe-actions',
      appliesWhen: { taskTags: ['ui'] },
      actions: { deny: ['delete_file'] },
      mode: 'enforce',
    };
    const miko = createMiko({ contracts: [uiContract, enforceContract] });
    miko.startTask({ sessionId: 'session-4', taskId: 'mixed-ui', tags: ['ui'] });

    expect(miko.verifyPreparation('mixed-ui').decision).toBe('REVIEW');
  });

  it('returns REVIEW for unknown tasks and malformed actions', () => {
    const miko = createMiko({ contracts: [uiContract] });
    expect(miko.verifyCompletion('missing').reasonCode).toBe('TASK_NOT_FOUND');
    expect(miko.verifyAction({ taskId: '', tool: '', risk: 'low' }).reasonCode).toBe('INVALID_ACTION');
  });

  it('validates contracts and rejects duplicate IDs', () => {
    expect(() => createMiko({ contracts: [uiContract, uiContract] })).toThrow(/duplicate contract id/);
    expect(() => createMiko({
      contracts: [{ ...uiContract, id: '', appliesWhen: { taskTags: [] } }],
    })).toThrow();
  });

  it('returns a defensive copy of recorded evidence', () => {
    const miko = startUiTask();
    miko.record({
      taskId: 'settings-page', type: 'skill_loaded', name: 'product-design', source: 'observed',
    });
    const evidence = miko.getEvidence('settings-page') as Array<{ type: string; name: string }>;
    evidence[0].name = 'tampered';

    expect(miko.getEvidence('settings-page')[0]).toEqual({
      type: 'skill_loaded',
      name: 'product-design',
      source: 'observed',
    });
  });

  it('maps ALLOW, DENY, and REVIEW to Claude Code PreToolUse decisions', () => {
    const miko = startUiTask();
    const review = miko.verifyPreparation('settings-page');
    recordPreparation(miko);
    const allow = miko.verifyAction({
      taskId: 'settings-page',
      tool: 'read_file',
      risk: 'low',
    });
    const deny = miko.verifyAction({
      taskId: 'settings-page',
      tool: 'delete_file',
      risk: 'high',
    });

    expect(toClaudePreToolUseDecision(review).hookSpecificOutput.permissionDecision).toBe('ask');
    expect(toClaudePreToolUseDecision(review).systemMessage).toContain('Miko REVIEW');
    expect(toClaudePreToolUseDecision(allow).hookSpecificOutput.permissionDecision).toBe('allow');
    expect(toClaudePreToolUseDecision(allow).systemMessage).toBeUndefined();
    expect(toClaudePreToolUseDecision(deny).hookSpecificOutput.permissionDecision).toBe('deny');
    expect(formatMikoDecision(deny)).toContain('TOOL_DENIED');
  });
});
