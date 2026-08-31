import type {
  AdvanceContextResult,
  EvidenceEvent,
  Miko,
  RiskLevel,
  VerificationResult,
} from './index.js';
import {
  formatMikoCompletionReceipt,
  formatMikoUserNotice,
  toClaudePreToolUseDecision,
  toHostInteractionDecision,
} from './index.js';
import {
  evidenceFromSuccessfulHostTool,
  normalizedHostArguments,
  recordHostEvidence,
  riskForHostTool,
  type HostToolProfile,
} from './host-adapter.js';
export { toProjectRelativePath } from './host-adapter.js';

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

export interface ClaudePostCompactInput extends ClaudeHookBase {
  hook_event_name: 'PostCompact';
  trigger?: 'manual' | 'auto';
}

export type ClaudeHookInput =
  | ClaudePreToolUseInput
  | ClaudePostToolUseInput
  | ClaudeUserPromptExpansionInput
  | ClaudePostCompactInput
  | ClaudeHookBase;

export interface ClaudeHookHandlingResult {
  output?: object;
  evidence: EvidenceEvent[];
  verification?: VerificationResult;
  contextAdvance?: AdvanceContextResult;
}

const PATH_KEYS = ['file_path', 'path', 'filePath'];
const CLAUDE_PROFILE: HostToolProfile = {
  skillTools: ['Skill'],
  readTools: ['Read'],
  writeTools: ['Edit', 'Write'],
  shellTools: ['Bash'],
  pathArgumentNames: PATH_KEYS,
  unknownRisk: 'low',
};

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function riskForClaudeTool(tool: string): RiskLevel {
  return riskForHostTool(tool, CLAUDE_PROFILE);
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
  return evidenceFromSuccessfulHostTool({
    tool: event.tool_name,
    arguments: event.tool_input,
    cwd: event.cwd,
  }, CLAUDE_PROFILE);
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
  const recoveryNotice = recordHostEvidence(miko, taskId, evidence);

  if (recoveryNotice) return { output: { systemMessage: recoveryNotice }, evidence };

  if (input.hook_event_name === 'PostCompact') {
    return {
      evidence,
      contextAdvance: miko.advanceContext(taskId, 'compaction'),
    };
  }

  if (input.hook_event_name === 'PreToolUse') {
    const event = input as ClaudePreToolUseInput;
    if (event.tool_name === 'Skill') return { evidence };
    const verification = miko.verifyAction({
      taskId,
      tool: event.tool_name,
      risk: riskForClaudeTool(event.tool_name),
      arguments: normalizedHostArguments(event.tool_input, event.cwd, PATH_KEYS),
    });
    // ALLOW means Miko has no objection; it must not override Claude's own permission policy.
    if (toHostInteractionDecision(verification) === 'defer') {
      return { evidence, verification };
    }
    return { output: toClaudePreToolUseDecision(verification), evidence, verification };
  }

  if (input.hook_event_name === 'Stop') {
    const verification = miko.verifyCompletion(taskId);
    if (verification.decision !== 'ALLOW') {
      return {
        output: {
          systemMessage: formatMikoUserNotice(verification),
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
