import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Agent, SessionStartSource } from '@deepseek-ai/dsh-agent';
import type {
  PreToolDecision,
  ToolExecution,
  ToolExecutionResult,
} from '@deepseek-ai/dsh-tools';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDshMikoAdapter, riskForDshTool, type Config } from './index';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function workspace(spec: unknown): string {
  const root = mkdtempSync(path.join(tmpdir(), 'koma-miko-dsh-'));
  temporaryRoots.push(root);
  writeFileSync(path.join(root, 'miko.json'), JSON.stringify(spec), 'utf8');
  return root;
}

function fakeAgent(cwd: string) {
  const steer = vi.fn();
  const agent = {
    id: 'dsh-session-1',
    session: { header: { id: 'dsh-session-1', cwd } },
    steer,
  } as unknown as Agent;
  return { agent, steer };
}

let callCounter = 0;
function execution(agent: Agent, name: string, args: Record<string, unknown>): ToolExecution {
  callCounter += 1;
  const callId = `call-${callCounter}`;
  return {
    callId,
    rootCallId: callId,
    name,
    arguments: args,
    agent,
    signal: new AbortController().signal,
    token: Symbol(callId),
  } as unknown as ToolExecution;
}

const success: ToolExecutionResult = {
  isError: false,
  value: null,
  content: [],
};

const failure: ToolExecutionResult = {
  isError: true,
  error: { message: 'failed' },
  content: [],
};

function allowNext() {
  return vi.fn(async (): Promise<PreToolDecision> => ({ kind: 'allow' }));
}

function uiSpec(mode: 'review' | 'enforce' = 'enforce') {
  return {
    version: 1,
    specs: [{
      id: 'dsh-ui-change',
      appliesWhen: {
        action: {
          tools: ['write', 'edit'],
          pathPrefixes: ['src/ui'],
          argumentNames: ['file_path'],
        },
      },
      requires: {
        skills: ['product-design'],
        references: ['docs/design-system.md'],
      },
      actions: {
        allow: ['skill', 'read', 'write', 'edit', 'bash'],
        maxRisk: 'high',
        scope: {
          tools: ['write', 'edit'],
          allowedPathPrefixes: ['src/ui'],
          argumentNames: ['file_path'],
        },
      },
      completion: {
        evidence: [
          { type: 'artifact_changed', path: 'src/ui/Hero.tsx' },
          { type: 'check_passed', name: 'targeted-tests' },
        ],
      },
      mode,
    }],
  };
}

function configuredAdapter(
  cwd: string,
  overrides: Partial<Config> = {},
  warn = vi.fn(),
  info = vi.fn(),
) {
  const adapter = createDshMikoAdapter({
    checks: [{
      name: 'targeted-tests',
      tool: 'bash',
      argument: 'command',
      equals: 'npm test -- Hero',
    }],
    ...overrides,
  }, { warn, info });
  const { agent, steer } = fakeAgent(cwd);
  adapter.sessionStart(agent, 'startup');
  return { adapter, agent, steer, warn, info };
}

describe('koma-miko-dsh experimental adapter', () => {
  it('blocks an applicable write until DSH observes the required skill and reference', async () => {
    const cwd = workspace(uiSpec());
    const { adapter, agent, info } = configuredAdapter(cwd);
    const write = execution(agent, 'write', {
      file_path: path.join(cwd, 'src/ui/Hero.tsx'),
      content: 'private source code',
    });

    const blocked = await adapter.beforeTool(write, allowNext());
    expect(blocked.kind).toBe('deny');
    expect('reason' in blocked ? blocked.reason : '').toContain('skill_loaded:product-design');

    const skill = execution(agent, 'skill', { name: 'product-design' });
    const skillNext = allowNext();
    expect(await adapter.beforeTool(skill, skillNext)).toEqual({ kind: 'allow' });
    expect(skillNext).toHaveBeenCalledOnce();
    adapter.toolResult(skill, success);

    const read = execution(agent, 'read', {
      file_path: path.join(cwd, 'docs/design-system.md'),
    });
    expect(await adapter.beforeTool(read, allowNext())).toEqual({ kind: 'allow' });
    adapter.toolResult(read, success);
    expect(info).toHaveBeenCalledWith(expect.stringContaining('Miko recovered'));

    expect(await adapter.beforeTool(write, allowNext())).toEqual({ kind: 'allow' });
  });

  it('records only authoritative successful outcomes and satisfies completion', async () => {
    const cwd = workspace(uiSpec());
    const { adapter, agent, steer, info } = configuredAdapter(cwd);
    const write = execution(agent, 'write', {
      file_path: 'src/ui/Hero.tsx',
      content: 'must not enter evidence',
    });
    const skill = execution(agent, 'skill', { name: 'product-design' });
    const read = execution(agent, 'read', { file_path: 'docs/design-system.md' });
    const check = execution(agent, 'bash', {
      command: 'npm test -- Hero',
      description: 'Run targeted Hero tests',
    });

    expect((await adapter.beforeTool(write, allowNext())).kind).toBe('deny');
    adapter.toolResult(skill, success);
    adapter.toolResult(read, success);
    adapter.toolResult(write, success);
    adapter.toolResult(check, success);
    adapter.turnStopping(agent);

    expect(steer).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining('Miko verified'));
    const evidence = adapter.snapshot(agent)?.evidence.map((item) => item.event) ?? [];
    expect(evidence).toContainEqual({
      type: 'check_passed', name: 'targeted-tests', source: 'observed',
    });
    expect(JSON.stringify(evidence)).not.toContain('must not enter evidence');
    expect(JSON.stringify(evidence)).not.toContain('npm test -- Hero');
  });

  it('never records failed or background tool calls as passing checks', () => {
    const cwd = workspace(uiSpec());
    const { adapter, agent } = configuredAdapter(cwd);
    const failedCheck = execution(agent, 'bash', { command: 'npm test -- Hero' });
    const backgroundCheck = execution(agent, 'bash', {
      command: 'npm test -- Hero',
      run_in_background: true,
    });

    adapter.toolResult(failedCheck, failure);
    adapter.toolResult(backgroundCheck, success);

    const evidence = adapter.snapshot(agent)?.evidence.map((item) => item.event) ?? [];
    expect(evidence.some((item) => item.type === 'check_passed')).toBe(false);
  });

  it('uses the native DSH approval path for REVIEW and can map it to deny', async () => {
    const cwd = workspace(uiSpec('review'));
    const first = configuredAdapter(cwd);
    const write = execution(first.agent, 'write', { file_path: 'src/ui/Hero.tsx' });
    expect((await first.adapter.beforeTool(write, allowNext())).kind).toBe('ask');

    const second = configuredAdapter(cwd, { reviewPolicy: 'deny' });
    const secondWrite = execution(second.agent, 'write', { file_path: 'src/ui/Hero.tsx' });
    expect((await second.adapter.beforeTool(secondWrite, allowNext())).kind).toBe('deny');
  });

  it('bounds completion steering instead of creating an infinite stop loop', async () => {
    const cwd = workspace(uiSpec());
    const { adapter, agent, steer, warn } = configuredAdapter(cwd, {
      maxCompletionSteers: 2,
    });
    await adapter.beforeTool(
      execution(agent, 'write', { file_path: 'src/ui/Hero.tsx' }),
      allowNext(),
    );

    adapter.turnStopping(agent);
    adapter.turnStopping(agent);
    adapter.turnStopping(agent);

    expect(steer).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('allowing the turn to close'));
  });

  it('treats run_code as a transport while still guarding its native sub-calls', async () => {
    const cwd = workspace(uiSpec());
    const { adapter, agent } = configuredAdapter(cwd);
    const transportNext = allowNext();
    const runCode = execution(agent, 'run_code', {
      code: 'await tools.write({ file_path: "src/ui/Hero.tsx", content: "x" })',
      description: 'Edit the Hero component',
    });

    expect(await adapter.beforeTool(runCode, transportNext)).toEqual({ kind: 'allow' });
    expect(transportNext).toHaveBeenCalledOnce();

    const nestedWrite = execution(agent, 'write', { file_path: 'src/ui/Hero.tsx' });
    expect((await adapter.beforeTool(nestedWrite, allowNext())).kind).toBe('deny');
  });

  it('fails open with one workspace warning when miko.json is absent', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'koma-miko-dsh-empty-'));
    temporaryRoots.push(cwd);
    const warn = vi.fn();
    const { adapter, agent } = configuredAdapter(cwd, {}, warn);
    adapter.sessionStart(agent, 'startup' as SessionStartSource);
    const next = allowNext();

    expect(await adapter.beforeTool(execution(agent, 'write', {}), next)).toEqual({ kind: 'allow' });
    expect(next).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('invalidates context-fresh skill evidence on a DSH compact lifecycle', async () => {
    const cwd = workspace({
      version: 1,
      specs: [{
        id: 'fresh-skill',
        appliesWhen: { taskTags: ['ui'] },
        requires: { skills: [{ name: 'product-design', reloadAfterCompaction: true }] },
        mode: 'enforce',
      }],
    });
    const { adapter, agent } = configuredAdapter(cwd, { taskTags: ['ui'] });
    const skill = execution(agent, 'skill', { name: 'product-design' });
    adapter.toolResult(skill, success);
    expect((await adapter.beforeTool(execution(agent, 'read', {}), allowNext())).kind).toBe('allow');

    adapter.sessionStart(agent, 'compact');
    expect((await adapter.beforeTool(execution(agent, 'write', {}), allowNext())).kind).toBe('deny');
  });

  it('starts a fresh evidence epoch on resume and requires Skill reload', async () => {
    const cwd = workspace(uiSpec());
    const { adapter, agent, steer, warn } = configuredAdapter(cwd);
    const skill = execution(agent, 'skill', { name: 'product-design' });
    const reference = execution(agent, 'read', { file_path: 'docs/design-system.md' });
    const write = execution(agent, 'write', { file_path: 'src/ui/Hero.tsx' });
    const check = execution(agent, 'bash', { command: 'npm test -- Hero' });

    adapter.toolResult(skill, success);
    adapter.toolResult(reference, success);
    adapter.toolResult(write, success);
    adapter.toolResult(check, success);
    adapter.turnStopping(agent);
    expect(steer).not.toHaveBeenCalled();
    expect(adapter.snapshot(agent)?.evidence.length).toBeGreaterThan(0);

    adapter.sessionStart(agent, 'resume');

    expect(adapter.snapshot(agent)?.evidence).toHaveLength(0);
    const denied = await adapter.beforeTool(
      execution(agent, 'write', { file_path: 'src/ui/Hero.tsx' }),
      allowNext(),
    );
    expect(denied.kind).toBe('deny');
    expect('reason' in denied ? denied.reason : '').toContain('skill_loaded:product-design');
    expect('reason' in denied ? denied.reason : '').toContain('reference_read:docs/design-system.md');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('fresh evidence epoch'));
  });

  it('uses conservative risk defaults with explicit deployment overrides', () => {
    expect(riskForDshTool('read')).toBe('low');
    expect(riskForDshTool('write')).toBe('medium');
    expect(riskForDshTool('bash')).toBe('high');
    expect(riskForDshTool('deploy_to_prod')).toBe('high');
    expect(riskForDshTool('deploy_to_prod', 'high', [
      { tool: 'deploy_to_prod', risk: 'medium' },
    ])).toBe('medium');
  });
});
