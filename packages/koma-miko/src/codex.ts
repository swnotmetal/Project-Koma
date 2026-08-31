import type { EvidenceEvent, Miko, VerificationResult } from './index.js';
import {
  formatMikoAgentContext,
  formatMikoCompletionReceipt,
  formatMikoUserNotice,
  toHostInteractionDecision,
} from './index.js';
import {
  evidenceFromSuccessfulHostTool,
  recordHostEvidence,
  toProjectRelativePath,
  verifyBeforeHostTool,
  type HostHookHandlingResult,
  type HostToolCall,
  type HostToolProfile,
} from './host-adapter.js';

interface CodexHookBase {
  session_id: string;
  cwd: string;
  hook_event_name: string;
  turn_id?: string;
}

export interface CodexPreToolUseInput extends CodexHookBase {
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id?: string;
}

export interface CodexPostToolUseInput extends CodexHookBase {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: unknown;
  tool_use_id?: string;
}

export interface CodexPostCompactInput extends CodexHookBase {
  hook_event_name: 'PostCompact';
  trigger: 'manual' | 'auto';
}

export interface CodexSessionStartInput extends CodexHookBase {
  hook_event_name: 'SessionStart';
  source: 'startup' | 'resume' | 'clear' | 'compact';
}

export interface CodexStopInput extends CodexHookBase {
  hook_event_name: 'Stop';
  stop_hook_active: boolean;
}

export type CodexHookInput =
  | CodexPreToolUseInput
  | CodexPostToolUseInput
  | CodexPostCompactInput
  | CodexSessionStartInput
  | CodexStopInput
  | CodexHookBase;

const CODEX_PROFILE: HostToolProfile = {
  skillTools: ['Skill'],
  readTools: ['Read'],
  writeTools: ['apply_patch', 'Edit', 'Write'],
  shellTools: ['Bash', 'exec_command'],
  lowRiskTools: ['glob', 'grep_search', 'list_directory'],
  pathArgumentNames: ['path', 'file_path', 'filePath'],
  unknownRisk: 'high',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Extract only patch target metadata; patch content is never copied into evidence. */
export function pathsFromCodexPatch(command: unknown, cwd: string): string[] {
  if (!nonEmptyString(command)) return [];
  const paths: string[] = [];
  const pattern = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;
  for (const match of command.matchAll(pattern)) {
    const value = match[1]?.trim();
    if (value) paths.push(toProjectRelativePath(value, cwd));
  }
  return [...new Set(paths)];
}

/**
 * Recognize a deliberately tiny read-only shell subset used to reload SKILL.md.
 * Commands containing separators or redirection are rejected instead of guessed.
 */
export function skillReadPathFromCodexShell(command: unknown, cwd: string): string | undefined {
  if (!nonEmptyString(command) || /[;&|><`\r\n]/.test(command)) return undefined;
  const candidate = command.trim();
  const powerShell = candidate.match(
    /^Get-Content(?:\s+-Raw)?\s+-LiteralPath\s+(['"])([^'"]+\/SKILL\.md)\1$/i,
  );
  const posix = candidate.match(/^cat\s+(['"]?)([^'"]+\/SKILL\.md)\1$/i);
  const pathname = powerShell?.[2] ?? posix?.[2];
  return pathname ? toProjectRelativePath(pathname, cwd) : undefined;
}

function canonicalCodexCalls(
  tool: string,
  input: Record<string, unknown>,
  cwd: string,
): HostToolCall[] {
  if (tool === 'apply_patch') {
    const paths = pathsFromCodexPatch(input.command ?? input.patch, cwd);
    return paths.length > 0
      ? paths.map((pathname) => ({ tool, arguments: { path: pathname }, cwd }))
      : [{ tool, arguments: {}, cwd }];
  }

  if (tool === 'Bash' || tool === 'exec_command') {
    const skillPath = skillReadPathFromCodexShell(input.command ?? input.cmd, cwd);
    if (skillPath) return [{ tool: 'Read', arguments: { path: skillPath }, cwd }];
  }

  if (tool === 'read_file' || tool === 'Read') {
    return [{ tool: 'Read', arguments: input, cwd }];
  }
  if (tool === 'Skill' || tool === 'activate_skill') {
    return [{ tool: 'Skill', arguments: input, cwd }];
  }
  return [{ tool, arguments: input, cwd }];
}

function containsFailureSignal(value: unknown): boolean {
  if (isRecord(value)) {
    if (value.isError === true || value.success === false || value.error != null) return true;
    const exitCode = value.exit_code ?? value.exitCode ?? value['Exit Code'];
    if (typeof exitCode === 'number' && exitCode !== 0) return true;
    if (typeof value.status === 'string' && /^(failed|error|declined|denied)$/i.test(value.status)) {
      return true;
    }
    return Object.values(value).some(containsFailureSignal);
  }
  if (Array.isArray(value)) return value.some(containsFailureSignal);
  return typeof value === 'string' && /^\s*(?:error|failed|denied)\b/i.test(value);
}

/** Codex documents tool_response as host-specific, so unknown/empty results do not satisfy evidence. */
export function codexToolSucceeded(response: unknown): boolean {
  if (response === null || response === undefined || response === '') return false;
  if (containsFailureSignal(response)) return false;
  if (isRecord(response)) {
    if (response.isError === false || response.success === true) return true;
    const exitCode = response.exit_code ?? response.exitCode ?? response['Exit Code'];
    if (exitCode === 0) return true;
    if (typeof response.status === 'string' && /^(completed|success|succeeded)$/i.test(response.status)) {
      return true;
    }
  }
  // Non-empty model-facing output is the only success signal exposed for many local tools.
  return typeof response === 'string' || Array.isArray(response) || isRecord(response);
}

function decideCodexTool(result: VerificationResult): object | undefined {
  const interaction = toHostInteractionDecision(result);
  if (interaction === 'defer') return undefined;
  const userNotice = formatMikoUserNotice(result);
  const agentContext = formatMikoAgentContext(result);
  return {
    systemMessage: userNotice,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: interaction,
      permissionDecisionReason: agentContext,
    },
  };
}

function evidenceFromCodexEvent(input: CodexHookInput): EvidenceEvent[] {
  if (input.hook_event_name !== 'PostToolUse') return [];
  const event = input as CodexPostToolUseInput;
  if (!codexToolSucceeded(event.tool_response)) return [];
  return canonicalCodexCalls(event.tool_name, event.tool_input, event.cwd).flatMap((call) =>
    evidenceFromSuccessfulHostTool(call, CODEX_PROFILE),
  );
}

export function handleCodexHookEvent(
  miko: Miko,
  taskId: string,
  input: CodexHookInput,
): HostHookHandlingResult {
  const evidence = evidenceFromCodexEvent(input);
  const recoveryNotice = recordHostEvidence(miko, taskId, evidence);

  if (recoveryNotice) return { output: { systemMessage: recoveryNotice }, evidence };

  if (input.hook_event_name === 'SessionStart') {
    const event = input as CodexSessionStartInput;
    if (event.source === 'resume' || event.source === 'clear') {
      return {
        evidence,
        contextAdvance: miko.advanceContext(taskId, 'resume'),
        contextAdvanceReason: 'resume',
      };
    }
    return { evidence };
  }

  if (input.hook_event_name === 'PostCompact') {
    return {
      evidence,
      contextAdvance: miko.advanceContext(taskId, 'compaction'),
      contextAdvanceReason: 'compaction',
    };
  }

  if (input.hook_event_name === 'PreToolUse') {
    const event = input as CodexPreToolUseInput;
    for (const call of canonicalCodexCalls(event.tool_name, event.tool_input, event.cwd)) {
      const checked = verifyBeforeHostTool(miko, taskId, call, CODEX_PROFILE);
      if (checked.remediation) continue;
      const output = decideCodexTool(checked.verification);
      if (output) {
        return {
          output,
          evidence,
          verification: checked.verification,
        };
      }
    }
    // Do not return an explicit allow: Codex's own permission system remains authoritative.
    return { evidence };
  }

  if (input.hook_event_name === 'Stop') {
    const event = input as CodexStopInput;
    const verification = miko.verifyCompletion(taskId);
    if (verification.decision !== 'ALLOW' && !event.stop_hook_active) {
      const userNotice = formatMikoUserNotice(verification);
      const agentContext = formatMikoAgentContext(verification);
      return {
        output: { decision: 'block', reason: agentContext, systemMessage: userNotice },
        evidence,
        verification,
      };
    }
    const receipt = formatMikoCompletionReceipt(verification, miko.getEvidence(taskId).length);
    return { ...(receipt ? { output: { systemMessage: receipt } } : {}), evidence, verification };
  }

  return { evidence };
}
