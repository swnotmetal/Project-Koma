#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { createMiko } from './index.js';
import type { EvidenceEvent, Miko, MikoContract, MikoTaskSnapshot } from './index.js';
import { handleClaudeHookEvent } from './claude-code.js';
import type {
  ClaudeHookInput,
  ClaudeReviewAuditEvent,
  ClaudeReviewHandshakeState,
} from './claude-code.js';
import { loadMikoConfig } from './config.js';

type LedgerRecord =
  | { type: 'task_started'; sessionId: string; taskId: string }
  | { type: 'contract_activated'; taskId: string; contractId: string }
  | {
      type: 'context_advanced';
      taskId: string;
      reason: 'compaction' | 'resume' | 'manual';
      epoch: number;
    }
  | { type: 'evidence_recorded'; taskId: string; evidence: EvidenceEvent }
  | {
      type: 'decision_recorded';
      taskId: string;
      hookEventName: string;
      tool?: string;
      decision: 'DENY' | 'REVIEW';
      checkpoint: 'PREPARE' | 'PRE_ACTION' | 'COMPLETE';
      reasonCode: string;
      contractIds: string[];
      missing?: string[];
    }
  | ({ taskId: string } & ClaudeReviewAuditEvent);

interface PersistedSnapshot {
  version: 1;
  ledgerBytes: number;
  task: MikoTaskSnapshot;
  review?: ClaudeReviewHandshakeState;
}

function readJson(pathname: string): unknown {
  return JSON.parse(readFileSync(pathname, 'utf8')) as unknown;
}

function loadContracts(cwd: string): MikoContract[] {
  const projectRoot = process.env.CLAUDE_PROJECT_DIR ?? cwd;
  return loadMikoConfig(projectRoot, process.env.MIKO_CONTRACTS_PATH).contracts;
}

function statePathsFor(input: ClaudeHookInput): { ledger: string; snapshot: string } {
  const projectRoot = process.env.CLAUDE_PROJECT_DIR ?? input.cwd;
  const stateDir = process.env.MIKO_STATE_DIR ?? path.join(projectRoot, '.miko', 'state');
  mkdirSync(stateDir, { recursive: true });
  const sessionKey = createHash('sha256').update(input.session_id).digest('hex').slice(0, 24);
  return {
    ledger: path.join(stateDir, `${sessionKey}.jsonl`),
    snapshot: path.join(stateDir, `${sessionKey}.snapshot.json`),
  };
}

function readLedgerTail(pathname: string, requestedOffset: number): LedgerRecord[] {
  if (!existsSync(pathname)) return [];
  const size = statSync(pathname).size;
  const offset = Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 && requestedOffset <= size
    ? requestedOffset
    : 0;
  if (offset === size) return [];
  const buffer = Buffer.alloc(size - offset);
  const file = openSync(pathname, 'r');
  try {
    readSync(file, buffer, 0, buffer.length, offset);
  } finally {
    closeSync(file);
  }
  return buffer.toString('utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LedgerRecord);
}

function appendLedger(pathname: string, record: LedgerRecord): void {
  appendFileSync(pathname, `${JSON.stringify(record)}\n`, 'utf8');
}

function applyLedgerRecords(miko: Miko, taskId: string, records: LedgerRecord[]): void {
  for (const record of records) {
    if (record.taskId !== taskId) continue;
    if (record.type === 'contract_activated') miko.activateContract(taskId, record.contractId);
    if (record.type === 'context_advanced') miko.advanceContext(taskId, record.reason);
    if (record.type === 'evidence_recorded') miko.record({ taskId, ...record.evidence });
  }
}

function readSnapshot(pathname: string): PersistedSnapshot | undefined {
  if (!existsSync(pathname)) return undefined;
  try {
    const parsed = readJson(pathname) as PersistedSnapshot;
    if (parsed.version !== 1 || !Number.isSafeInteger(parsed.ledgerBytes) || parsed.ledgerBytes < 0) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function restoreState(
  contracts: MikoContract[],
  paths: { ledger: string; snapshot: string },
  sessionId: string,
): { miko: Miko; taskId: string; started: boolean; reviewState: ClaudeReviewHandshakeState } {
  const taskId = sessionId;
  const snapshot = readSnapshot(paths.snapshot);
  if (snapshot && snapshot.task.sessionId === sessionId && snapshot.task.taskId === taskId) {
    const miko = createMiko({ contracts });
    try {
      miko.restoreTask(snapshot.task);
      applyLedgerRecords(miko, taskId, readLedgerTail(paths.ledger, snapshot.ledgerBytes));
      return { miko, taskId, started: true, reviewState: snapshot.review ?? {} };
    } catch {
      // Contract changes or a stale/corrupt snapshot fall back to the audit log.
    }
  }

  const records = readLedgerTail(paths.ledger, 0);
  const started = records.some((record) => record.type === 'task_started' && record.taskId === taskId);
  const miko = createMiko({ contracts });
  miko.startTask({ sessionId, taskId, tags: [] });
  applyLedgerRecords(miko, taskId, records);
  return { miko, taskId, started, reviewState: {} };
}

function compactSnapshot(snapshot: MikoTaskSnapshot): MikoTaskSnapshot {
  const seen = new Set<string>();
  const evidence = [] as MikoTaskSnapshot['evidence'];
  for (let index = snapshot.evidence.length - 1; index >= 0; index -= 1) {
    const record = snapshot.evidence[index];
    const key = JSON.stringify([record.contextEpoch, record.event]);
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push(record);
  }
  evidence.reverse();
  return { ...snapshot, evidence };
}

function saveSnapshot(
  pathname: string,
  ledgerPath: string,
  snapshot: MikoTaskSnapshot,
  reviewState: ClaudeReviewHandshakeState,
): void {
  const persisted: PersistedSnapshot = {
    version: 1,
    ledgerBytes: existsSync(ledgerPath) ? statSync(ledgerPath).size : 0,
    task: compactSnapshot(snapshot),
    ...(reviewState.pending || reviewState.approved ? { review: reviewState } : {}),
  };
  writeFileSync(pathname, `${JSON.stringify(persisted)}\n`, 'utf8');
}

function main(): void {
  const input = JSON.parse(readFileSync(0, 'utf8')) as ClaudeHookInput;
  if (!input.session_id || !input.cwd || !input.hook_event_name) {
    throw new Error('Invalid Claude Code hook input.');
  }

  const contracts = loadContracts(input.cwd);
  const statePaths = statePathsFor(input);
  const { miko, taskId, started, reviewState } = restoreState(contracts, statePaths, input.session_id);
  if (!started) {
    appendLedger(statePaths.ledger, { type: 'task_started', sessionId: input.session_id, taskId });
  }

  const activeBefore = new Set(miko.getActiveContractIds(taskId));
  const handled = handleClaudeHookEvent(miko, taskId, input, reviewState);
  for (const contractId of miko.getActiveContractIds(taskId)) {
    if (!activeBefore.has(contractId)) {
      appendLedger(statePaths.ledger, { type: 'contract_activated', taskId, contractId });
    }
  }
  for (const evidence of handled.evidence) {
    appendLedger(statePaths.ledger, { type: 'evidence_recorded', taskId, evidence });
  }
  if (handled.contextAdvance?.advanced && handled.contextAdvance.epoch !== undefined) {
    appendLedger(statePaths.ledger, {
      type: 'context_advanced',
      taskId,
      reason: 'compaction',
      epoch: handled.contextAdvance.epoch,
    });
  }
  if (handled.verification && handled.verification.decision !== 'ALLOW') {
    appendLedger(statePaths.ledger, {
      type: 'decision_recorded',
      taskId,
      hookEventName: input.hook_event_name,
      ...('tool_name' in input ? { tool: input.tool_name } : {}),
      decision: handled.verification.decision,
      checkpoint: handled.verification.checkpoint,
      reasonCode: handled.verification.reasonCode,
      contractIds: handled.verification.contractIds,
      ...(handled.verification.missing ? { missing: handled.verification.missing } : {}),
    });
  }
  for (const reviewEvent of handled.reviewAudit ?? []) {
    appendLedger(statePaths.ledger, { taskId, ...reviewEvent });
  }
  const snapshot = miko.snapshotTask(taskId);
  if (snapshot) {
    saveSnapshot(
      statePaths.snapshot,
      statePaths.ledger,
      snapshot,
      handled.reviewState ?? reviewState,
    );
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
