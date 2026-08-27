import type { EvidenceEvent, Miko } from './index.js';
import { formatMikoDecision } from './index.js';
import {
  evidenceFromSuccessfulHostTool,
  verifyBeforeHostTool,
  type HostHookHandlingResult,
  type HostToolProfile,
} from './host-adapter.js';

interface GeminiHookBase {
  session_id: string;
  cwd: string;
  hook_event_name: string;
  timestamp?: string;
}

export interface GeminiBeforeToolInput extends GeminiHookBase {
  hook_event_name: 'BeforeTool';
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface GeminiAfterToolInput extends GeminiHookBase {
  hook_event_name: 'AfterTool';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: unknown;
}

export interface GeminiSessionStartInput extends GeminiHookBase {
  hook_event_name: 'SessionStart';
  source: 'startup' | 'resume' | 'clear';
}

export interface GeminiPreCompressInput extends GeminiHookBase {
  hook_event_name: 'PreCompress';
  trigger: 'auto' | 'manual';
}

export interface GeminiAfterAgentInput extends GeminiHookBase {
  hook_event_name: 'AfterAgent';
  stop_hook_active: boolean;
}

export type GeminiHookInput =
  | GeminiBeforeToolInput
  | GeminiAfterToolInput
  | GeminiSessionStartInput
  | GeminiPreCompressInput
  | GeminiAfterAgentInput
  | GeminiHookBase;

const GEMINI_PROFILE: HostToolProfile = {
  skillTools: ['activate_skill'],
  readTools: ['read_file'],
  writeTools: ['replace', 'write_file'],
  shellTools: ['run_shell_command'],
  lowRiskTools: ['glob', 'grep_search', 'list_directory', 'read_many_files'],
  skillArgumentNames: ['name'],
  pathArgumentNames: ['file_path', 'path'],
  unknownRisk: 'high',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function geminiToolSucceeded(response: unknown): boolean {
  if (!isRecord(response)) return false;
  if (response.error != null || response.isError === true || response.success === false) return false;
  const exitCode = response['Exit Code'] ?? response.exit_code ?? response.exitCode;
  if (typeof exitCode === 'number' && exitCode !== 0) return false;
  return true;
}

function evidenceFromGeminiEvent(input: GeminiHookInput): EvidenceEvent[] {
  if (input.hook_event_name !== 'AfterTool') return [];
  const event = input as GeminiAfterToolInput;
  if (!geminiToolSucceeded(event.tool_response)) return [];
  return evidenceFromSuccessfulHostTool({
    tool: event.tool_name,
    arguments: event.tool_input,
    cwd: event.cwd,
  }, GEMINI_PROFILE);
}

export function handleGeminiHookEvent(
  miko: Miko,
  taskId: string,
  input: GeminiHookInput,
): HostHookHandlingResult {
  const evidence = evidenceFromGeminiEvent(input);
  for (const event of evidence) miko.record({ taskId, ...event });

  if (input.hook_event_name === 'SessionStart') {
    const event = input as GeminiSessionStartInput;
    if (event.source === 'resume' || event.source === 'clear') {
      return {
        evidence,
        contextAdvance: miko.advanceContext(taskId, 'resume'),
        contextAdvanceReason: 'resume',
      };
    }
    return { evidence };
  }

  if (input.hook_event_name === 'PreCompress') {
    return {
      evidence,
      contextAdvance: miko.advanceContext(taskId, 'compaction'),
      contextAdvanceReason: 'compaction',
    };
  }

  if (input.hook_event_name === 'BeforeTool') {
    const event = input as GeminiBeforeToolInput;
    const checked = verifyBeforeHostTool(miko, taskId, {
      tool: event.tool_name,
      arguments: event.tool_input,
      cwd: event.cwd,
    }, GEMINI_PROFILE);
    if (checked.remediation || checked.verification.decision === 'ALLOW') {
      // Keep Gemini's normal confirmation and policy engine in control.
      return { evidence };
    }
    const message = formatMikoDecision(checked.verification);
    return {
      output: { decision: 'deny', reason: message, systemMessage: message },
      evidence,
      verification: checked.verification,
    };
  }

  if (input.hook_event_name === 'AfterAgent') {
    const event = input as GeminiAfterAgentInput;
    const verification = miko.verifyCompletion(taskId);
    if (verification.decision !== 'ALLOW' && !event.stop_hook_active) {
      const message = formatMikoDecision(verification);
      return {
        output: { decision: 'deny', reason: message, systemMessage: message },
        evidence,
        verification,
      };
    }
    return { evidence, verification };
  }

  return { evidence };
}
