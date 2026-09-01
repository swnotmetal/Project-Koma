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

interface VSCodeHookBase {
  session_id: string;
  cwd: string;
  hook_event_name: string;
  timestamp?: string;
  transcript_path?: string;
}

export interface VSCodePreToolUseInput extends VSCodeHookBase {
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id?: string;
}

export interface VSCodePostToolUseInput extends VSCodeHookBase {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response?: unknown;
  tool_use_id?: string;
}

export interface VSCodeSessionStartInput extends VSCodeHookBase {
  hook_event_name: 'SessionStart';
  source: 'new';
}

export interface VSCodePreCompactInput extends VSCodeHookBase {
  hook_event_name: 'PreCompact';
  trigger: 'auto' | string;
}

export interface VSCodeStopInput extends VSCodeHookBase {
  hook_event_name: 'Stop';
  stop_hook_active: boolean;
}

export type VSCodeHookInput =
  | VSCodePreToolUseInput
  | VSCodePostToolUseInput
  | VSCodeSessionStartInput
  | VSCodePreCompactInput
  | VSCodeStopInput
  | VSCodeHookBase;

const VSCODE_PROFILE: HostToolProfile = {
  skillTools: [],
  readTools: ['read_file', 'readFile'],
  writeTools: [
    'apply_patch',
    'create_file',
    'createFile',
    'editFiles',
    'insert_edit_into_file',
    'replace_string_in_file',
  ],
  shellTools: ['run_in_terminal', 'runInTerminal'],
  lowRiskTools: ['file_search', 'grep_search', 'list_dir', 'semantic_search'],
  pathArgumentNames: ['filePath', 'path', 'file_path'],
  unknownRisk: 'high',
};

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function pathsFromVSCodeInput(input: Record<string, unknown>, cwd: string): string[] {
  const values: string[] = [];
  for (const key of ['filePath', 'path', 'file_path']) {
    if (nonEmptyString(input[key])) values.push(input[key]);
  }
  for (const key of ['files', 'filePaths', 'replacements', 'edits']) {
    const candidates = input[key];
    if (!Array.isArray(candidates)) continue;
    for (const candidate of candidates) {
      if (nonEmptyString(candidate)) {
        values.push(candidate);
        continue;
      }
      if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) continue;
      const item = candidate as Record<string, unknown>;
      for (const pathKey of ['filePath', 'path', 'file_path']) {
        if (nonEmptyString(item[pathKey])) values.push(item[pathKey]);
      }
    }
  }
  return [...new Set(values.map((value) => toProjectRelativePath(value, cwd)))];
}

/** Keep Agent Specs stable when Copilot renames an equivalent editor tool. */
function canonicalVSCodeToolName(tool: string): string {
  if (tool === 'multi_replace_string_in_file') return 'replace_string_in_file';
  return tool;
}

/** Recognize only a single read-only terminal command that reloads SKILL.md. */
export function skillReadPathFromVSCodeTerminal(
  command: unknown,
  cwd: string,
): string | undefined {
  if (!nonEmptyString(command) || /[;&|><`\r\n]/.test(command)) return undefined;
  const candidate = command.trim();
  const powerShell = candidate.match(
    /^Get-Content(?:\s+-Raw)?\s+-LiteralPath\s+(['"])([^'"]+[\\/]SKILL\.md)\1$/i,
  );
  const posix = candidate.match(/^cat\s+(['"]?)([^'"]+[\\/]SKILL\.md)\1$/i);
  const pathname = powerShell?.[2] ?? posix?.[2];
  return pathname ? toProjectRelativePath(pathname, cwd) : undefined;
}

/**
 * VS Code exposes both single-path and multi-file editing tools. Split the
 * latter so every target is checked independently and only path metadata is
 * retained.
 */
export function canonicalVSCodeCalls(
  tool: string,
  input: Record<string, unknown>,
  cwd: string,
): HostToolCall[] {
  if (VSCODE_PROFILE.shellTools.includes(tool)) {
    const skillPath = skillReadPathFromVSCodeTerminal(input.command, cwd);
    if (skillPath) {
      return [{ tool: 'read_file', arguments: { filePath: skillPath }, cwd }];
    }
  }

  const paths = pathsFromVSCodeInput(input, cwd);
  const canonicalTool = canonicalVSCodeToolName(tool);
  if (paths.length > 0) {
    return paths.map((filePath) => ({ tool: canonicalTool, arguments: { filePath }, cwd }));
  }
  return [{ tool: canonicalTool, arguments: {}, cwd }];
}

function decideVSCodeTool(result: VerificationResult): object | undefined {
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
      additionalContext: agentContext,
    },
  };
}

function evidenceFromVSCodeEvent(input: VSCodeHookInput): EvidenceEvent[] {
  // VS Code documents PostToolUse as firing only after successful tool completion.
  if (input.hook_event_name !== 'PostToolUse') return [];
  const event = input as VSCodePostToolUseInput;
  return canonicalVSCodeCalls(event.tool_name, event.tool_input, event.cwd).flatMap((call) =>
    evidenceFromSuccessfulHostTool(call, VSCODE_PROFILE),
  );
}

export function handleVSCodeHookEvent(
  miko: Miko,
  taskId: string,
  input: VSCodeHookInput,
): HostHookHandlingResult {
  const evidence = evidenceFromVSCodeEvent(input);
  const recoveryNotice = recordHostEvidence(miko, taskId, evidence);

  if (recoveryNotice) return { output: { systemMessage: recoveryNotice }, evidence };

  if (input.hook_event_name === 'PreCompact') {
    return {
      evidence,
      contextAdvance: miko.advanceContext(taskId, 'compaction'),
      contextAdvanceReason: 'compaction',
    };
  }

  if (input.hook_event_name === 'PreToolUse') {
    const event = input as VSCodePreToolUseInput;
    for (const call of canonicalVSCodeCalls(event.tool_name, event.tool_input, event.cwd)) {
      const checked = verifyBeforeHostTool(miko, taskId, call, VSCODE_PROFILE);
      if (checked.remediation) continue;
      const output = decideVSCodeTool(checked.verification);
      if (output) {
        return {
          output,
          evidence,
          verification: checked.verification,
        };
      }
    }
    // Keep VS Code's own approval policy authoritative when Miko has no objection.
    return { evidence };
  }

  if (input.hook_event_name === 'Stop') {
    const event = input as VSCodeStopInput;
    const verification = miko.verifyCompletion(taskId);
    if (verification.decision !== 'ALLOW' && !event.stop_hook_active) {
      const userNotice = formatMikoUserNotice(verification);
      const agentContext = formatMikoAgentContext(verification);
      return {
        output: {
          systemMessage: userNotice,
          hookSpecificOutput: {
            hookEventName: 'Stop',
            decision: 'block',
            reason: agentContext,
          },
        },
        evidence,
        verification,
      };
    }
    const receipt = formatMikoCompletionReceipt(verification, miko.getEvidence(taskId).length);
    return { ...(receipt ? { output: { systemMessage: receipt } } : {}), evidence, verification };
  }

  return { evidence };
}
