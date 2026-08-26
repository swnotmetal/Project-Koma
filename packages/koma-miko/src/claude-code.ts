import path from 'node:path';
import type { EvidenceEvent, Miko, RiskLevel, VerificationResult } from './index.js';
import { formatMikoDecision, toClaudePreToolUseDecision } from './index.js';

interface ClaudeHookBase {
  session_id: string;
  cwd: string;
  hook_event_name: string;
}

export interface ClaudePreToolUseInput extends ClaudeHookBase {
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface ClaudePostToolUseInput extends ClaudeHookBase {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface ClaudeUserPromptExpansionInput extends ClaudeHookBase {
  hook_event_name: 'UserPromptExpansion';
  expansion_type: 'slash_command' | 'mcp_prompt';
  command_name: string;
}

export type ClaudeHookInput =
  | ClaudePreToolUseInput
  | ClaudePostToolUseInput
  | ClaudeUserPromptExpansionInput
  | ClaudeHookBase;

export interface ClaudeHookHandlingResult {
  output?: object;
  evidence: EvidenceEvent[];
  verification?: VerificationResult;
}

const PATH_KEYS = ['file_path', 'path', 'filePath'];

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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

function relativeToolInput(input: Record<string, unknown>, cwd: string): Record<string, unknown> {
  const next = { ...input };
  for (const key of PATH_KEYS) {
    if (nonEmptyString(next[key])) next[key] = toProjectRelativePath(next[key], cwd);
  }
  return next;
}

function privacySafeArguments(input: Record<string, unknown>, cwd: string): Record<string, unknown> | undefined {
  const safe: Record<string, unknown> = {};
  for (const key of PATH_KEYS) {
    if (nonEmptyString(input[key])) safe[key] = toProjectRelativePath(input[key], cwd);
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

function pathFromInput(input: Record<string, unknown>, cwd: string): string | undefined {
  const value = PATH_KEYS.map((key) => input[key]).find(nonEmptyString);
  return value ? toProjectRelativePath(value, cwd) : undefined;
}

function skillFromToolInput(input: Record<string, unknown>): string | undefined {
  return ['skill', 'name', 'command_name']
    .map((key) => input[key])
    .find(nonEmptyString);
}

function skillFromReadPath(filePath: string): string | undefined {
  const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.at(-1)?.toLowerCase() !== 'skill.md' || parts.length < 2) return undefined;
  return parts.at(-2);
}

export function riskForClaudeTool(tool: string): RiskLevel {
  if (tool === 'Bash' || tool.startsWith('mcp__')) return 'high';
  if (tool === 'Edit' || tool === 'Write') return 'medium';
  return 'low';
}

export function evidenceFromClaudeEvent(input: ClaudeHookInput): EvidenceEvent[] {
  if (input.hook_event_name === 'UserPromptExpansion') {
    const event = input as ClaudeUserPromptExpansionInput;
    if (event.expansion_type === 'slash_command' && nonEmptyString(event.command_name)) {
      return [{ type: 'skill_loaded', name: event.command_name, source: 'observed' }];
    }
    return [];
  }

  if (input.hook_event_name !== 'PostToolUse') return [];
  const event = input as ClaudePostToolUseInput;
  const evidence: EvidenceEvent[] = [];

  if (event.tool_name === 'Skill') {
    const skill = skillFromToolInput(event.tool_input);
    if (skill) evidence.push({ type: 'skill_loaded', name: skill, source: 'observed' });
  }

  const filePath = pathFromInput(event.tool_input, event.cwd);
  if (event.tool_name === 'Read' && filePath) {
    evidence.push({ type: 'reference_read', path: filePath, source: 'observed' });
    const skill = skillFromReadPath(filePath);
    if (skill) evidence.push({ type: 'skill_loaded', name: skill, source: 'observed' });
  }
  if ((event.tool_name === 'Edit' || event.tool_name === 'Write') && filePath) {
    evidence.push({ type: 'artifact_changed', path: filePath, source: 'observed' });
  }

  evidence.push({
    type: 'tool_succeeded',
    tool: event.tool_name,
    ...(privacySafeArguments(event.tool_input, event.cwd)
      ? { arguments: privacySafeArguments(event.tool_input, event.cwd) }
      : {}),
    source: 'observed',
  });
  return evidence;
}

/**
 * Handles the host-specific surface while leaving persistence to the caller.
 * No prompt, file contents, Bash command, or model response is copied into evidence.
 */
export function handleClaudeHookEvent(
  miko: Miko,
  taskId: string,
  input: ClaudeHookInput,
): ClaudeHookHandlingResult {
  const evidence = evidenceFromClaudeEvent(input);
  for (const event of evidence) miko.record({ taskId, ...event });

  if (input.hook_event_name === 'PreToolUse') {
    const event = input as ClaudePreToolUseInput;
    if (event.tool_name === 'Skill') return { evidence };
    const verification = miko.verifyAction({
      taskId,
      tool: event.tool_name,
      risk: riskForClaudeTool(event.tool_name),
      arguments: relativeToolInput(event.tool_input, event.cwd),
    });
    return { output: toClaudePreToolUseDecision(verification), evidence, verification };
  }

  if (input.hook_event_name === 'Stop') {
    const verification = miko.verifyCompletion(taskId);
    if (verification.decision !== 'ALLOW') {
      return {
        output: { systemMessage: formatMikoDecision(verification) },
        evidence,
        verification,
      };
    }
    return { evidence, verification };
  }

  return { evidence };
}
