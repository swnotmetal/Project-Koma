import path from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent, SessionStartSource } from '@deepseek-ai/dsh-agent';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import type {
  PreToolDecision,
  ToolExecution,
  ToolExecutionResult,
} from '@deepseek-ai/dsh-tools';
import z from '@deepseek-ai/schemastery';
import {
  createMiko,
  formatMikoDecision,
  type EvidenceEvent,
  type Miko,
  type MikoTaskSnapshot,
  type RiskLevel,
  type VerificationResult,
} from 'koma-miko';
import { loadMikoConfig } from 'koma-miko/config';

export const name = 'koma-miko-dsh';
export const inject = ['agents', 'tools'];

const PLUGIN_SOURCE = { kind: 'plugin' as const, plugin: name };
const PATH_ARGUMENT_NAMES = ['file_path', 'path', 'filePath'];
const DEFAULT_SAFE_ARGUMENT_NAMES = [...PATH_ARGUMENT_NAMES];
const PREPARATION_REASON_CODES = new Set([
  'PREPARATION_EVIDENCE_MISSING',
  'SKILL_DECLARED_BUT_NOT_OBSERVED',
]);

export interface CheckEvidenceRule {
  /** Miko check name recorded after the configured DSH tool succeeds. */
  name: string;
  /** DSH tool name. Defaults to bash. */
  tool?: string;
  /** Argument containing the exact command or suite identity. Defaults to command. */
  argument?: string;
  /** Exact value required before the successful result becomes check evidence. */
  equals: string;
}

export interface ToolRiskOverride {
  tool: string;
  risk: RiskLevel;
}

export interface Config {
  /** Project-relative Agent Spec path, resolved from each DSH session cwd. */
  specPath: string;
  /** Deterministic task tags supplied by the deployment, never inferred from prompts. */
  taskTags: string[];
  /** What to do when a workspace has no Agent Spec. */
  missingSpec: 'silent' | 'warn';
  /** DSH mapping for Miko REVIEW at tools/pre-execute. */
  reviewPolicy: 'ask' | 'deny';
  /** Adapter failure behavior. Invalid existing Agent Specs still produce a warning. */
  failureMode: 'open' | 'closed';
  /** Conservative risk for tools not covered by built-in or configured mappings. */
  unknownRisk: RiskLevel;
  /** Exact per-tool risk overrides. */
  riskOverrides: ToolRiskOverride[];
  /** Exact successful-tool matches that become named check_passed evidence. */
  checks: CheckEvidenceRule[];
  /** Argument names retained in tool_succeeded evidence. Prompt/code/output are omitted. */
  evidenceArgumentNames: string[];
  /** Bounds completion steering so a broken spec cannot create an infinite turn. */
  maxCompletionSteers: number;
}

export const Config: z<Config> = z.object({
  specPath: z.string().default('miko.json'),
  taskTags: z.array(z.string()).default([]),
  missingSpec: z.union(['silent', 'warn'] as const).default('warn'),
  reviewPolicy: z.union(['ask', 'deny'] as const).default('ask'),
  failureMode: z.union(['open', 'closed'] as const).default('open'),
  unknownRisk: z.union(['low', 'medium', 'high'] as const).default('high'),
  riskOverrides: z.array(z.object({
    tool: z.string().required(),
    risk: z.union(['low', 'medium', 'high'] as const).required(),
  })).default([]),
  checks: z.array(z.object({
    name: z.string().required(),
    tool: z.string(),
    argument: z.string(),
    equals: z.string().required(),
  })).default([]),
  evidenceArgumentNames: z.array(z.string()).default(DEFAULT_SAFE_ARGUMENT_NAMES),
  maxCompletionSteers: z.number().min(0).default(2),
});

interface AdapterLogger {
  warn(message: string): void;
}

interface SessionState {
  miko: Miko;
  taskId: string;
  cwd: string;
  completionSteers: number;
}

export interface DshMikoAdapter {
  sessionStart(agent: Agent, source: SessionStartSource): void;
  beforeTool(
    exec: ToolExecution,
    next: () => Promise<PreToolDecision>,
  ): Promise<PreToolDecision>;
  toolResult(exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): void;
  turnStopping(agent: Agent): void;
  snapshot(agent: Agent): MikoTaskSnapshot | undefined;
}

const DEFAULT_CONFIG: Config = {
  specPath: 'miko.json',
  taskTags: [],
  missingSpec: 'warn',
  reviewPolicy: 'ask',
  failureMode: 'open',
  unknownRisk: 'high',
  riskOverrides: [],
  checks: [],
  evidenceArgumentNames: DEFAULT_SAFE_ARGUMENT_NAMES,
  maxCompletionSteers: 2,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function resolvedConfig(input: Partial<Config>): Config {
  const config: Config = {
    ...DEFAULT_CONFIG,
    ...input,
    taskTags: [...(input.taskTags ?? DEFAULT_CONFIG.taskTags)],
    riskOverrides: [...(input.riskOverrides ?? DEFAULT_CONFIG.riskOverrides)],
    checks: [...(input.checks ?? DEFAULT_CONFIG.checks)],
    evidenceArgumentNames: [
      ...(input.evidenceArgumentNames ?? DEFAULT_CONFIG.evidenceArgumentNames),
    ],
  };
  if (!nonEmptyString(config.specPath)) throw new Error('koma-miko-dsh: specPath is required');
  if (!Number.isInteger(config.maxCompletionSteers) || config.maxCompletionSteers < 0) {
    throw new Error('koma-miko-dsh: maxCompletionSteers must be a non-negative integer');
  }
  return config;
}

function sessionCwd(agent: Agent): string {
  return agent.session.header.cwd ?? process.cwd();
}

function sessionId(agent: Agent): string {
  return String(agent.session.header.id ?? agent.id);
}

function projectRelativePath(value: string, cwd: string): string {
  const normalizedValue = value.replace(/\\/g, '/');
  const normalizedCwd = cwd.replace(/\\/g, '/').replace(/\/$/, '');
  if (normalizedValue === normalizedCwd) return '.';
  if (normalizedValue.startsWith(`${normalizedCwd}/`)) {
    return normalizedValue.slice(normalizedCwd.length + 1);
  }
  if (path.isAbsolute(value)) {
    const relative = path.relative(cwd, value).replace(/\\/g, '/');
    return relative.startsWith('../') || relative === '..' ? normalizedValue : relative;
  }
  return normalizedValue.replace(/^\.\//, '');
}

function pathFromArguments(argumentsValue: unknown, cwd: string): string | undefined {
  if (!isRecord(argumentsValue)) return undefined;
  const value = PATH_ARGUMENT_NAMES.map((key) => argumentsValue[key]).find(nonEmptyString);
  return value ? projectRelativePath(value, cwd) : undefined;
}

function normalizedActionArguments(argumentsValue: unknown, cwd: string): Record<string, unknown> {
  if (!isRecord(argumentsValue)) return {};
  const normalized = { ...argumentsValue };
  for (const key of PATH_ARGUMENT_NAMES) {
    if (nonEmptyString(normalized[key])) normalized[key] = projectRelativePath(normalized[key], cwd);
  }
  return normalized;
}

function safeEvidenceArguments(
  argumentsValue: unknown,
  cwd: string,
  allowedNames: readonly string[],
): Record<string, unknown> | undefined {
  if (!isRecord(argumentsValue)) return undefined;
  const safe: Record<string, unknown> = {};
  for (const key of allowedNames) {
    const value = argumentsValue[key];
    if (PATH_ARGUMENT_NAMES.includes(key) && nonEmptyString(value)) {
      safe[key] = projectRelativePath(value, cwd);
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
    }
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

export function riskForDshTool(
  tool: string,
  unknownRisk: RiskLevel = 'high',
  overrides: readonly ToolRiskOverride[] = [],
): RiskLevel {
  const override = overrides.find((item) => item.tool === tool);
  if (override) return override.risk;
  if (tool === 'bash' || tool === 'pwsh' || tool === 'run_code') return 'high';
  if (tool === 'write' || tool === 'edit' || tool === 'str_replace_editor') return 'medium';
  if (tool === 'read' || tool === 'read_image' || tool === 'glob' || tool === 'grep' || tool === 'skill') {
    return 'low';
  }
  return unknownRisk;
}

function isMissingSpec(error: unknown, pathname: string): boolean {
  return isRecord(error) && error.code === 'ENOENT' &&
    (!nonEmptyString(error.path) || path.resolve(String(error.path)) === path.resolve(pathname));
}

function preparationToolMatches(exec: ToolExecution, result: VerificationResult, cwd: string): boolean {
  if (!PREPARATION_REASON_CODES.has(result.reasonCode) || !result.missing?.length) return false;
  const args = isRecord(exec.arguments) ? exec.arguments : {};
  if (exec.name === 'skill' && nonEmptyString(args.name)) {
    return result.missing.some((item) => item.endsWith(`:skill_loaded:${args.name}`));
  }
  if (exec.name === 'read') {
    const filePath = pathFromArguments(args, cwd);
    return filePath !== undefined &&
      result.missing.some((item) => item.endsWith(`:reference_read:${filePath}`));
  }
  if (exec.name === 'str_replace_editor' && args.command === 'view') {
    const filePath = pathFromArguments(args, cwd);
    return filePath !== undefined &&
      result.missing.some((item) => item.endsWith(`:reference_read:${filePath}`));
  }
  return false;
}

function evidenceFromSuccessfulTool(
  exec: Readonly<ToolExecution>,
  cwd: string,
  config: Config,
): EvidenceEvent[] {
  const args = isRecord(exec.arguments) ? exec.arguments : {};
  const evidence: EvidenceEvent[] = [];
  const filePath = pathFromArguments(args, cwd);

  if (exec.name === 'skill' && nonEmptyString(args.name)) {
    evidence.push({ type: 'skill_loaded', name: args.name, source: 'observed' });
  }
  if ((exec.name === 'read' ||
      (exec.name === 'str_replace_editor' && args.command === 'view')) && filePath) {
    evidence.push({ type: 'reference_read', path: filePath, source: 'observed' });
  }
  if ((exec.name === 'write' || exec.name === 'edit' ||
      (exec.name === 'str_replace_editor' && args.command !== 'view')) && filePath) {
    evidence.push({ type: 'artifact_changed', path: filePath, source: 'observed' });
  }

  for (const rule of config.checks) {
    const tool = rule.tool ?? 'bash';
    const argument = rule.argument ?? 'command';
    if (exec.name === tool && args[argument] === rule.equals && args.run_in_background !== true) {
      evidence.push({ type: 'check_passed', name: rule.name, source: 'observed' });
    }
  }

  const safeArguments = safeEvidenceArguments(exec.arguments, cwd, config.evidenceArgumentNames);
  evidence.push({
    type: 'tool_succeeded',
    tool: exec.name,
    ...(safeArguments ? { arguments: safeArguments } : {}),
    source: 'observed',
  });
  return evidence;
}

function mikoMessage(result: VerificationResult) {
  return createUserMessage({
    content: [{ type: 'text' as const, text: formatMikoDecision(result) }],
    source: PLUGIN_SOURCE,
  });
}

/**
 * Creates the stateful adapter used by the Cordis plugin and deterministic tests.
 * State is intentionally per live DSH Agent; durable replay is a post-alpha item.
 */
export function createDshMikoAdapter(
  input: Partial<Config> = {},
  logger: AdapterLogger = console,
): DshMikoAdapter {
  const config = resolvedConfig(input);
  const states = new WeakMap<Agent, SessionState>();
  const warnedWorkspaces = new Set<string>();

  function fail<T>(message: string, fallback: T, error: unknown): T {
    logger.warn(`${message}: ${String(error)}`);
    if (config.failureMode === 'closed') throw error;
    return fallback;
  }

  function ensure(agent: Agent): SessionState | undefined {
    const existing = states.get(agent);
    if (existing) return existing;
    const cwd = sessionCwd(agent);
    const pathname = path.resolve(cwd, config.specPath);
    try {
      const loaded = loadMikoConfig(cwd, config.specPath);
      const miko = createMiko({ contracts: loaded.contracts });
      const taskId = sessionId(agent);
      miko.startTask({ sessionId: taskId, taskId, tags: config.taskTags });
      const state = { miko, taskId, cwd, completionSteers: 0 };
      states.set(agent, state);
      return state;
    } catch (error: unknown) {
      if (isMissingSpec(error, pathname)) {
        if (config.missingSpec === 'warn' && !warnedWorkspaces.has(pathname)) {
          warnedWorkspaces.add(pathname);
          logger.warn(`koma-miko-dsh: no Agent Spec at ${pathname}; this workspace is not guarded`);
        }
        return undefined;
      }
      return fail(`koma-miko-dsh: could not load ${pathname}`, undefined, error);
    }
  }

  return {
    sessionStart(agent, source) {
      if (source === 'clear' || source === 'resume') states.delete(agent);
      const state = ensure(agent);
      if (!state) return;
      if (source === 'compact') state.miko.advanceContext(state.taskId, 'compaction');
      if (source === 'resume') {
        logger.warn(
          'koma-miko-dsh: resumed session starts a fresh evidence epoch; ' +
          'reload required Skills and references before protected actions',
        );
      }
    },

    async beforeTool(exec, next) {
      if (!exec.agent) return next();
      const state = ensure(exec.agent);
      if (!state) return next();

      // run_code is a transport. Its native sub-calls re-enter this same pipeline
      // and are the actions Miko can evaluate without inspecting program text.
      if (exec.name === 'run_code') return next();

      try {
        const verification = state.miko.verifyAction({
          taskId: state.taskId,
          tool: exec.name,
          risk: riskForDshTool(exec.name, config.unknownRisk, config.riskOverrides),
          arguments: normalizedActionArguments(exec.arguments, state.cwd),
        });
        if (verification.decision === 'ALLOW') return next();
        if (preparationToolMatches(exec, verification, state.cwd)) return next();

        const reason = formatMikoDecision(verification);
        if (verification.decision === 'REVIEW' && config.reviewPolicy === 'ask') {
          return { kind: 'ask', reason };
        }
        return { kind: 'deny', reason };
      } catch (error: unknown) {
        logger.warn(`koma-miko-dsh: pre-execute verification failed: ${String(error)}`);
        if (config.failureMode === 'closed') throw error;
        return next();
      }
    },

    toolResult(exec, result) {
      if (!exec.agent || result.isError) return;
      const state = ensure(exec.agent);
      if (!state) return;
      try {
        for (const event of evidenceFromSuccessfulTool(exec, state.cwd, config)) {
          state.miko.record({ taskId: state.taskId, ...event });
        }
      } catch (error: unknown) {
        fail('koma-miko-dsh: result evidence mapping failed', undefined, error);
      }
    },

    turnStopping(agent) {
      const state = ensure(agent);
      if (!state) return;
      try {
        const verification = state.miko.verifyCompletion(state.taskId);
        if (verification.decision === 'ALLOW') {
          state.completionSteers = 0;
          return;
        }
        if (state.completionSteers >= config.maxCompletionSteers) {
          logger.warn(
            `koma-miko-dsh: completion remains ${verification.decision} after ` +
            `${state.completionSteers} steering attempt(s); allowing the turn to close`,
          );
          return;
        }
        state.completionSteers += 1;
        agent.steer(mikoMessage(verification));
      } catch (error: unknown) {
        fail('koma-miko-dsh: completion verification failed', undefined, error);
      }
    },

    snapshot(agent) {
      const state = states.get(agent);
      return state?.miko.snapshotTask(state.taskId);
    },
  };
}

export function apply(ctx: Context, config: Config): void {
  const adapter = createDshMikoAdapter(config, ctx.logger);
  ctx.on('agent/session-start', ({ agent, source }) => adapter.sessionStart(agent, source));
  ctx.on('tools/pre-execute', (exec, next) => adapter.beforeTool(exec, next));
  ctx.on('tools/result', (exec, result) => {
    adapter.toolResult(exec, result);
    return undefined;
  });
  ctx.on('agent/turn-stopping', ({ agent }) => adapter.turnStopping(agent));
}

export default { name, inject, Config, apply };
