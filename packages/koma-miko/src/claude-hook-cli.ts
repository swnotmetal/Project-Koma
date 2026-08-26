#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createMiko } from './index.js';
import type { EvidenceEvent, MikoContract } from './index.js';
import { handleClaudeHookEvent } from './claude-code.js';
import type { ClaudeHookInput } from './claude-code.js';

type LedgerRecord =
  | { type: 'task_started'; sessionId: string; taskId: string }
  | { type: 'contract_activated'; taskId: string; contractId: string }
  | { type: 'evidence_recorded'; taskId: string; evidence: EvidenceEvent }
  | {
      type: 'decision_recorded';
      taskId: string;
      hookEventName: string;
      tool?: string;
      decision: 'DENY' | 'REVIEW';
      reasonCode: string;
      contractIds: string[];
      missing?: string[];
    };

function readJson(pathname: string): unknown {
  return JSON.parse(readFileSync(pathname, 'utf8')) as unknown;
}

function loadContracts(cwd: string): MikoContract[] {
  const projectRoot = process.env.CLAUDE_PROJECT_DIR ?? cwd;
  const configPath = process.env.MIKO_CONTRACTS_PATH ?? path.join(projectRoot, '.miko', 'contracts.json');
  const parsed = readJson(configPath);
  if (!Array.isArray(parsed)) throw new Error(`Miko contracts must be an array: ${configPath}`);
  return parsed as MikoContract[];
}

function statePathFor(input: ClaudeHookInput): string {
  const projectRoot = process.env.CLAUDE_PROJECT_DIR ?? input.cwd;
  const stateDir = process.env.MIKO_STATE_DIR ?? path.join(projectRoot, '.miko', 'state');
  mkdirSync(stateDir, { recursive: true });
  const sessionKey = createHash('sha256').update(input.session_id).digest('hex').slice(0, 24);
  return path.join(stateDir, `${sessionKey}.jsonl`);
}

function readLedger(pathname: string): LedgerRecord[] {
  if (!existsSync(pathname)) return [];
  return readFileSync(pathname, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LedgerRecord);
}

function appendLedger(pathname: string, record: LedgerRecord): void {
  appendFileSync(pathname, `${JSON.stringify(record)}\n`, 'utf8');
}

function replay(contracts: MikoContract[], records: LedgerRecord[], sessionId: string) {
  const miko = createMiko({ contracts });
  const taskId = sessionId;
  const started = records.some((record) => record.type === 'task_started' && record.taskId === taskId);
  miko.startTask({ sessionId, taskId, tags: [] });
  for (const record of records) {
    if (record.taskId !== taskId) continue;
    if (record.type === 'contract_activated') miko.activateContract(taskId, record.contractId);
    if (record.type === 'evidence_recorded') miko.record({ taskId, ...record.evidence });
  }
  return { miko, taskId, started };
}

function main(): void {
  const input = JSON.parse(readFileSync(0, 'utf8')) as ClaudeHookInput;
  if (!input.session_id || !input.cwd || !input.hook_event_name) {
    throw new Error('Invalid Claude Code hook input.');
  }

  const contracts = loadContracts(input.cwd);
  const ledgerPath = statePathFor(input);
  const { miko, taskId, started } = replay(contracts, readLedger(ledgerPath), input.session_id);
  if (!started) appendLedger(ledgerPath, { type: 'task_started', sessionId: input.session_id, taskId });

  const activeBefore = new Set(miko.getActiveContractIds(taskId));
  const handled = handleClaudeHookEvent(miko, taskId, input);
  for (const contractId of miko.getActiveContractIds(taskId)) {
    if (!activeBefore.has(contractId)) {
      appendLedger(ledgerPath, { type: 'contract_activated', taskId, contractId });
    }
  }
  for (const evidence of handled.evidence) {
    appendLedger(ledgerPath, { type: 'evidence_recorded', taskId, evidence });
  }
  if (handled.verification && handled.verification.decision !== 'ALLOW') {
    appendLedger(ledgerPath, {
      type: 'decision_recorded',
      taskId,
      hookEventName: input.hook_event_name,
      ...('tool_name' in input ? { tool: input.tool_name } : {}),
      decision: handled.verification.decision,
      reasonCode: handled.verification.reasonCode,
      contractIds: handled.verification.contractIds,
      ...(handled.verification.missing ? { missing: handled.verification.missing } : {}),
    });
  }
  if (handled.output) process.stdout.write(JSON.stringify(handled.output));
}

try {
  main();
} catch (error) {
  const reason = error instanceof Error ? error.message : 'Unknown hook failure';
  // Miko remains fail-open on its own operational failures and makes the gap visible.
  process.stdout.write(JSON.stringify({ systemMessage: `Miko unavailable — ${reason}` }));
}
