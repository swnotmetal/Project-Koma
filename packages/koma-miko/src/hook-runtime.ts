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
import type { HostHookHandlingResult } from './host-adapter.js';
import { loadMikoConfig } from './config.js';

export interface PersistentHookInput {
  session_id: string;
  cwd: string;
  hook_event_name: string;
}

export interface PersistentHookRuntimeOptions<TInput extends PersistentHookInput> {
  host: string;
  projectRootEnvironmentVariable?: string;
  handle(miko: Miko, taskId: string, input: TInput): HostHookHandlingResult;
  toolName?(input: TInput): string | undefined;
}

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
    };

interface PersistedSnapshot {
  version: 1;
  ledgerBytes: number;
  task: MikoTaskSnapshot;
  passiveNoticeKey?: string;
}

function readJson(pathname: string): unknown {
  return JSON.parse(readFileSync(pathname, 'utf8')) as unknown;
}

function projectRootFor<TInput extends PersistentHookInput>(
  input: TInput,
  options: PersistentHookRuntimeOptions<TInput>,
): string {
  const explicit = options.projectRootEnvironmentVariable
    ? process.env[options.projectRootEnvironmentVariable]
    : undefined;
  return explicit ?? input.cwd;
}

function loadContracts<TInput extends PersistentHookInput>(
  input: TInput,
  options: PersistentHookRuntimeOptions<TInput>,
): MikoContract[] {
  return loadMikoConfig(projectRootFor(input, options), process.env.MIKO_CONTRACTS_PATH).contracts;
}

function statePathsFor<TInput extends PersistentHookInput>(
  input: TInput,
  options: PersistentHookRuntimeOptions<TInput>,
): { ledger: string; snapshot: string } {
  const stateDir = process.env.MIKO_STATE_DIR ??
    path.join(projectRootFor(input, options), '.miko', 'state');
  mkdirSync(stateDir, { recursive: true });
  const sessionKey = createHash('sha256')
    .update(`${options.host}:${input.session_id}`)
    .digest('hex')
    .slice(0, 24);
  const prefix = options.host.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  return {
    ledger: path.join(stateDir, `${prefix}-${sessionKey}.jsonl`),
    snapshot: path.join(stateDir, `${prefix}-${sessionKey}.snapshot.json`),
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
): { miko: Miko; taskId: string; started: boolean; passiveNoticeKey?: string } {
  const taskId = sessionId;
  const snapshot = readSnapshot(paths.snapshot);
  if (snapshot && snapshot.task.sessionId === sessionId && snapshot.task.taskId === taskId) {
    const miko = createMiko({ contracts });
    try {
      miko.restoreTask(snapshot.task);
      applyLedgerRecords(miko, taskId, readLedgerTail(paths.ledger, snapshot.ledgerBytes));
      return { miko, taskId, started: true, passiveNoticeKey: snapshot.passiveNoticeKey };
    } catch {
      // Changed contracts or a stale/corrupt snapshot fall back to the audit log.
    }
  }

  const records = readLedgerTail(paths.ledger, 0);
  const started = records.some((record) => record.type === 'task_started' && record.taskId === taskId);
  const miko = createMiko({ contracts });
  miko.startTask({ sessionId, taskId, tags: [] });
  applyLedgerRecords(miko, taskId, records);
  return { miko, taskId, started };
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
  pathname: string, ledgerPath: string, snapshot: MikoTaskSnapshot, passiveNoticeKey?: string,
): void {
  const persisted: PersistedSnapshot = {
    version: 1,
    ledgerBytes: existsSync(ledgerPath) ? statSync(ledgerPath).size : 0,
    task: compactSnapshot(snapshot),
    ...(passiveNoticeKey === undefined ? {} : { passiveNoticeKey }),
  };
  writeFileSync(pathname, `${JSON.stringify(persisted)}\n`, 'utf8');
}

export function handlePersistentHookInput<TInput extends PersistentHookInput>(
  input: TInput,
  options: PersistentHookRuntimeOptions<TInput>,
): object | undefined {
  if (!input.session_id || !input.cwd || !input.hook_event_name) {
    throw new Error(`Invalid ${options.host} hook input.`);
  }

  const contracts = loadContracts(input, options);
  const statePaths = statePathsFor(input, options);
  const { miko, taskId, started, passiveNoticeKey } = restoreState(contracts, statePaths, input.session_id);
  if (!started) {
    appendLedger(statePaths.ledger, { type: 'task_started', sessionId: input.session_id, taskId });
  }

  const activeBefore = new Set(miko.getActiveContractIds(taskId));
  const handled = options.handle(miko, taskId, input);
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
      reason: handled.contextAdvanceReason ?? 'manual',
      epoch: handled.contextAdvance.epoch,
    });
  }
  if (handled.verification && handled.verification.decision !== 'ALLOW') {
    const tool = options.toolName?.(input);
    appendLedger(statePaths.ledger, {
      type: 'decision_recorded',
      taskId,
      hookEventName: input.hook_event_name,
      ...(tool ? { tool } : {}),
      decision: handled.verification.decision,
      checkpoint: handled.verification.checkpoint,
      reasonCode: handled.verification.reasonCode,
      contractIds: handled.verification.contractIds,
      ...(handled.verification.missing ? { missing: handled.verification.missing } : {}),
    });
  }
  const snapshot = miko.snapshotTask(taskId);
  const nextNoticeKey = input.hook_event_name === 'Stop' || handled.contextAdvance?.advanced ||
    (handled.verification && handled.verification.decision !== 'ALLOW')
    ? undefined
    : handled.passiveNoticeKey ?? passiveNoticeKey;
  if (snapshot) saveSnapshot(statePaths.snapshot, statePaths.ledger, snapshot, nextNoticeKey);
  return handled.passiveNoticeKey !== undefined && handled.passiveNoticeKey === passiveNoticeKey
    ? undefined
    : handled.output;
}

export function runPersistentHookCli<TInput extends PersistentHookInput>(
  options: PersistentHookRuntimeOptions<TInput>,
): void {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8')) as TInput;
    const output = handlePersistentHookInput(input, options);
    if (output) process.stdout.write(JSON.stringify(output));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown hook failure';
    // Miko remains fail-open on its own operational failures and makes the gap visible.
    process.stdout.write(JSON.stringify({ systemMessage: `Miko unavailable — ${reason}` }));
  }
}
