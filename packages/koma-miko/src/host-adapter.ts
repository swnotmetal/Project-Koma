import path from 'node:path';
import type {
  EvidenceEvent,
  Miko,
  RiskLevel,
  VerificationResult,
} from './index.js';
import { formatMikoRecoveryNotice } from './index.js';

export const DEFAULT_PATH_ARGUMENT_NAMES = ['file_path', 'path', 'filePath'] as const;

export interface HostToolProfile {
  skillTools: readonly string[];
  readTools: readonly string[];
  writeTools: readonly string[];
  shellTools: readonly string[];
  lowRiskTools?: readonly string[];
  skillArgumentNames?: readonly string[];
  pathArgumentNames?: readonly string[];
  unknownRisk?: RiskLevel;
}

export interface HostToolCall {
  tool: string;
  arguments: Record<string, unknown>;
  cwd: string;
}

export interface HostBeforeToolResult {
  verification: VerificationResult;
  /** An exact missing Skill/reference load must remain possible after a denial. */
  remediation: boolean;
}

export interface HostHookHandlingResult {
  output?: object;
  evidence: EvidenceEvent[];
  verification?: VerificationResult;
  contextAdvance?: ReturnType<Miko['advanceContext']>;
  contextAdvanceReason?: 'compaction' | 'resume' | 'manual';
}

/** Record a successful host event and report only a real PREPARE transition. */
export function recordHostEvidence(
  miko: Miko,
  taskId: string,
  evidence: readonly EvidenceEvent[],
): string | undefined {
  if (evidence.length === 0) return undefined;
  const before = miko.verifyPreparation(taskId);
  for (const event of evidence) miko.record({ taskId, ...event });
  const after = miko.verifyPreparation(taskId);
  return formatMikoRecoveryNotice(before, after);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function names(profile: HostToolProfile): readonly string[] {
  return profile.pathArgumentNames ?? DEFAULT_PATH_ARGUMENT_NAMES;
}

export function toProjectRelativePath(value: string, cwd: string): string {
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

export function pathFromHostArguments(
  input: Record<string, unknown>,
  cwd: string,
  argumentNames: readonly string[] = DEFAULT_PATH_ARGUMENT_NAMES,
): string | undefined {
  const value = argumentNames.map((key) => input[key]).find(nonEmptyString);
  return value ? toProjectRelativePath(value, cwd) : undefined;
}

export function normalizedHostArguments(
  input: Record<string, unknown>,
  cwd: string,
  argumentNames: readonly string[] = DEFAULT_PATH_ARGUMENT_NAMES,
): Record<string, unknown> {
  const next = { ...input };
  for (const key of argumentNames) {
    if (nonEmptyString(next[key])) next[key] = toProjectRelativePath(next[key], cwd);
  }
  return next;
}

export function privacySafeHostArguments(
  input: Record<string, unknown>,
  cwd: string,
  argumentNames: readonly string[] = DEFAULT_PATH_ARGUMENT_NAMES,
): Record<string, unknown> | undefined {
  const safe: Record<string, unknown> = {};
  for (const key of argumentNames) {
    if (nonEmptyString(input[key])) safe[key] = toProjectRelativePath(input[key], cwd);
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

export function skillFromHostArguments(
  input: Record<string, unknown>,
  argumentNames: readonly string[] = ['skill', 'name', 'command_name'],
): string | undefined {
  return argumentNames.map((key) => input[key]).find(nonEmptyString);
}

export function skillFromReadPath(filePath: string): string | undefined {
  const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.at(-1)?.toLowerCase() !== 'skill.md' || parts.length < 2) return undefined;
  return parts.at(-2);
}

export function riskForHostTool(tool: string, profile: HostToolProfile): RiskLevel {
  if (profile.shellTools.includes(tool) || tool.startsWith('mcp__') || tool.startsWith('mcp_')) {
    return 'high';
  }
  if (profile.writeTools.includes(tool)) return 'medium';
  if (
    profile.skillTools.includes(tool) ||
    profile.readTools.includes(tool) ||
    profile.lowRiskTools?.includes(tool)
  ) {
    return 'low';
  }
  return profile.unknownRisk ?? 'high';
}

export function evidenceFromSuccessfulHostTool(
  call: HostToolCall,
  profile: HostToolProfile,
): EvidenceEvent[] {
  const evidence: EvidenceEvent[] = [];
  const pathArgumentNames = names(profile);
  const filePath = pathFromHostArguments(call.arguments, call.cwd, pathArgumentNames);

  if (profile.skillTools.includes(call.tool)) {
    const skill = skillFromHostArguments(call.arguments, profile.skillArgumentNames);
    if (skill) evidence.push({ type: 'skill_loaded', name: skill, source: 'observed' });
  }

  if (profile.readTools.includes(call.tool) && filePath) {
    evidence.push({ type: 'reference_read', path: filePath, source: 'observed' });
    const skill = skillFromReadPath(filePath);
    if (skill) evidence.push({ type: 'skill_loaded', name: skill, source: 'observed' });
  }

  if (profile.writeTools.includes(call.tool) && filePath) {
    evidence.push({ type: 'artifact_changed', path: filePath, source: 'observed' });
  }

  const safeArguments = privacySafeHostArguments(call.arguments, call.cwd, pathArgumentNames);
  evidence.push({
    type: 'tool_succeeded',
    tool: call.tool,
    ...(safeArguments ? { arguments: safeArguments } : {}),
    source: 'observed',
  });
  return evidence;
}

function preparationReason(result: VerificationResult): boolean {
  return result.reasonCode === 'PREPARATION_EVIDENCE_MISSING' ||
    result.reasonCode === 'SKILL_DECLARED_BUT_NOT_OBSERVED';
}

export function isRequiredPreparationTool(
  call: HostToolCall,
  result: VerificationResult,
  profile: HostToolProfile,
): boolean {
  if (!preparationReason(result) || !result.missing?.length) return false;

  if (profile.skillTools.includes(call.tool)) {
    const skill = skillFromHostArguments(call.arguments, profile.skillArgumentNames);
    return skill !== undefined && result.missing.some((item) =>
      item.endsWith(`:skill_loaded:${skill}`),
    );
  }

  if (profile.readTools.includes(call.tool)) {
    const filePath = pathFromHostArguments(call.arguments, call.cwd, names(profile));
    if (!filePath) return false;
    const skill = skillFromReadPath(filePath);
    return result.missing.some((item) =>
      item.endsWith(`:reference_read:${filePath}`) ||
      (skill !== undefined && item.endsWith(`:skill_loaded:${skill}`)),
    );
  }

  return false;
}

export function verifyBeforeHostTool(
  miko: Miko,
  taskId: string,
  call: HostToolCall,
  profile: HostToolProfile,
): HostBeforeToolResult {
  const verification = miko.verifyAction({
    taskId,
    tool: call.tool,
    risk: riskForHostTool(call.tool, profile),
    arguments: normalizedHostArguments(call.arguments, call.cwd, names(profile)),
  });
  return {
    verification,
    remediation: isRequiredPreparationTool(call, verification, profile),
  };
}
