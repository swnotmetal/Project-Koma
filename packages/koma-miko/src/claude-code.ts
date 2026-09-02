import { createHash } from 'node:crypto';
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
  tool_response?: unknown;
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

export interface ClaudeSessionStartInput extends ClaudeHookBase {
  hook_event_name: 'SessionStart';
}

export type ClaudeHookInput =
  | ClaudePreToolUseInput
  | ClaudePostToolUseInput
  | ClaudeUserPromptExpansionInput
  | ClaudePostCompactInput
  | ClaudeSessionStartInput
  | ClaudeHookBase;

export interface ClaudeHookHandlingResult {
  output?: object;
  evidence: EvidenceEvent[];
  verification?: VerificationResult;
  contextAdvance?: AdvanceContextResult;
  reviewState?: ClaudeReviewHandshakeState;
  reviewAudit?: ClaudeReviewAuditEvent[];
}

export interface ClaudeReviewTicket {
  id: string;
  fingerprint: string;
  question: string;
  tool: string;
  path?: string;
  reasonCode: VerificationResult['reasonCode'];
  contractIds: string[];
}

export interface ClaudeReviewHandshakeState {
  pending?: ClaudeReviewTicket;
  approved?: ClaudeReviewTicket;
}

export type ClaudeReviewAuditEvent =
  | { type: 'review_requested'; review: ClaudeReviewTicket }
  | { type: 'review_decided'; reviewId: string; decision: 'allow_once' | 'keep_scope' }
  | { type: 'review_consumed'; reviewId: string };

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

const REVIEW_POLICY_CODES = new Set<VerificationResult['reasonCode']>([
  'TOOL_NOT_ALLOWED',
  'RISK_TOO_HIGH',
  'SCOPE_ARGUMENT_MISSING',
  'PATH_OUT_OF_SCOPE',
]);
const ALLOW_ONCE = 'Allow once';
const KEEP_SCOPE = 'Keep current scope';

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

function actionFingerprint(tool: string, risk: RiskLevel, args: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue({ tool, risk, arguments: args })))
    .digest('hex');
}

function reviewTicket(
  event: ClaudePreToolUseInput,
  verification: VerificationResult,
  risk: RiskLevel,
  args: Record<string, unknown>,
): ClaudeReviewTicket {
  const fingerprint = actionFingerprint(event.tool_name, risk, args);
  const path = PATH_KEYS.map((key) => args[key]).find(nonEmptyString);
  const id = fingerprint.slice(0, 10);
  const target = path ? `\"${path}\"` : `the proposed ${event.tool_name} action`;
  return {
    id,
    fingerprint,
    question: `[Miko ${id}] ${verification.reason} Allow this exact ${event.tool_name} on ${target} once?`,
    tool: event.tool_name,
    ...(path ? { path } : {}),
    reasonCode: verification.reasonCode,
    contractIds: [...verification.contractIds],
  };
}

function reviewQuestionInstruction(ticket: ClaudeReviewTicket): string {
  return [
    'Miko paused this policy exception before the tool ran.',
    'Call AskUserQuestion now with exactly one question:',
    `Question: ${ticket.question}`,
    'Header: Miko review',
    `Options: ${ALLOW_ONCE} | ${KEEP_SCOPE}`,
    'Do not retry the blocked action until that question has completed.',
  ].join('\n');
}

function questionMatches(input: Record<string, unknown>, ticket: ClaudeReviewTicket): boolean {
  const questions = input.questions;
  if (!Array.isArray(questions) || questions.length !== 1) return false;
  const question = questions[0];
  if (!question || typeof question !== 'object') return false;
  const record = question as Record<string, unknown>;
  if (!nonEmptyString(record.question) || record.header !== 'Miko review') return false;
  const normalizedQuestion = record.question.toLowerCase();
  if (ticket.path && !normalizedQuestion.includes(ticket.path.toLowerCase())) return false;
  if (!normalizedQuestion.includes(ticket.tool.toLowerCase())) return false;
  const labels = Array.isArray(record.options)
    ? record.options.map((option) => option && typeof option === 'object'
      ? (option as Record<string, unknown>).label
      : undefined)
    : [];
  return labels.includes(ALLOW_ONCE) && labels.includes(KEEP_SCOPE);
}

function answerFrom(value: unknown, question: string): string | undefined {
  if (typeof value === 'string') {
    if (value.includes(ALLOW_ONCE)) return ALLOW_ONCE;
    if (value.includes(KEEP_SCOPE)) return KEEP_SCOPE;
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const answers = record.answers;
  if (answers && typeof answers === 'object') {
    const exact = (answers as Record<string, unknown>)[question];
    const parsed = answerFrom(exact, question);
    if (parsed) return parsed;
    for (const answer of Object.values(answers as Record<string, unknown>)) {
      const candidate = answerFrom(answer, question);
      if (candidate) return candidate;
    }
  }
  for (const key of ['answer', 'result', 'response', 'selected']) {
    const parsed = answerFrom(record[key], question);
    if (parsed) return parsed;
  }
  return undefined;
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
  reviewState: ClaudeReviewHandshakeState = {},
): ClaudeHookHandlingResult {
  const evidence = evidenceFromClaudeEvent(input);
  const recoveryNotice = recordHostEvidence(miko, taskId, evidence);

  if (recoveryNotice) return { output: { systemMessage: recoveryNotice }, evidence };

  if (input.hook_event_name === 'SessionStart') {
    return {
      evidence,
      output: {
        systemMessage: [
          '🟢 Miko active · Agent Specs loaded',
          'Red pauses recover deterministic gaps; yellow asks only about policy exceptions.',
        ].join('\n'),
      },
    };
  }

  if (input.hook_event_name === 'PostToolUse') {
    const event = input as ClaudePostToolUseInput;
    const pending = reviewState.pending;
    if (event.tool_name === 'AskUserQuestion' && pending && questionMatches(event.tool_input, pending)) {
      const answer = answerFrom(event.tool_response, pending.question) ??
        answerFrom(event.tool_input, pending.question);
      if (answer === ALLOW_ONCE) {
        return {
          evidence,
          reviewState: { approved: pending },
          reviewAudit: [{ type: 'review_decided', reviewId: pending.id, decision: 'allow_once' }],
          output: {
            systemMessage: `🟡 Miko approved one exact exception · ${pending.id}`,
            hookSpecificOutput: {
              hookEventName: 'PostToolUse',
              additionalContext: 'Miko observed Allow once. Retry the original blocked action exactly once.',
            },
          },
        };
      }
      if (answer === KEEP_SCOPE) {
        return {
          evidence,
          reviewState: {},
          reviewAudit: [{ type: 'review_decided', reviewId: pending.id, decision: 'keep_scope' }],
          output: {
            systemMessage: '🟡 Miko kept the current scope. The proposed exception was not applied.',
            hookSpecificOutput: {
              hookEventName: 'PostToolUse',
              additionalContext: [
                'The user chose Keep current scope.',
                'Acknowledge that Miko kept the boundary and stop.',
                'Do not retry, ask to enable access, or suggest a manual edit.',
              ].join(' '),
            },
          },
        };
      }
    }
  }

  if (input.hook_event_name === 'PostCompact') {
    return {
      evidence,
      contextAdvance: miko.advanceContext(taskId, 'compaction'),
      reviewState: {},
    };
  }

  if (input.hook_event_name === 'PreToolUse') {
    const event = input as ClaudePreToolUseInput;
    if (event.tool_name === 'Skill') return { evidence };
    if (event.tool_name === 'AskUserQuestion') return { evidence };
    const risk = riskForClaudeTool(event.tool_name);
    const args = normalizedHostArguments(event.tool_input, event.cwd, PATH_KEYS);
    const fingerprint = actionFingerprint(event.tool_name, risk, args);
    if (reviewState.approved?.fingerprint === fingerprint) {
      const approved = reviewState.approved;
      return {
        evidence,
        reviewState: {},
        reviewAudit: [{ type: 'review_consumed', reviewId: approved.id }],
        output: {
          systemMessage: `🟡 Miko allowed one exact exception · ${approved.id}`,
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
            permissionDecisionReason: `Miko one-time approval ${approved.id}`,
          },
        },
      };
    }
    const verification = miko.verifyAction({
      taskId,
      tool: event.tool_name,
      risk,
      arguments: args,
    });
    // ALLOW means Miko has no objection; it must not override Claude's own permission policy.
    if (toHostInteractionDecision(verification) === 'defer') {
      return { evidence, verification };
    }
    if (verification.decision === 'REVIEW' && REVIEW_POLICY_CODES.has(verification.reasonCode)) {
      const ticket = reviewTicket(event, verification, risk, args);
      const context = reviewQuestionInstruction(ticket);
      return {
        evidence,
        verification,
        reviewState: { pending: ticket },
        reviewAudit: [{ type: 'review_requested', review: ticket }],
        output: {
          systemMessage: [
            '🟡 Miko paused for a decision · PRE_ACTION',
            verification.reason,
            `Review ${ticket.id} must be answered before retrying.`,
          ].join('\n'),
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: context,
            additionalContext: context,
          },
        },
      };
    }
    return { output: toClaudePreToolUseDecision(verification), evidence, verification };
  }

  if (input.hook_event_name === 'Stop') {
    if (reviewState.pending) {
      return {
        evidence,
        reviewState,
        output: {
          systemMessage: `🟡 Miko is waiting for review ${reviewState.pending.id}. No exception has run.`,
        },
      };
    }
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
