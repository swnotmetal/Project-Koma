/**
 * Koma Miko alpha: deterministic contract verification for agent workflows.
 *
 * Miko checks three observable boundaries:
 * 1. Preparation evidence (required skills and references)
 * 2. Proposed actions (tool, risk, and path scope)
 * 3. Completion evidence (tests, reviews, and artifacts)
 *
 * It does not inspect model context or plan work for the agent.
 */

export type MikoDecision = 'ALLOW' | 'DENY' | 'REVIEW';
export type RiskLevel = 'low' | 'medium' | 'high';
export type ContractMode = 'review' | 'enforce';

export type EvidenceRequirement =
  | { type: 'skill_loaded'; name: string }
  | { type: 'reference_read'; path: string }
  | { type: 'tool_succeeded'; tool: string; matches?: Record<string, unknown> }
  | { type: 'artifact_changed'; path: string }
  | { type: 'check_passed'; name: string };

export type EvidenceEvent =
  | { type: 'skill_loaded'; name: string }
  | { type: 'reference_read'; path: string }
  | { type: 'tool_succeeded'; tool: string; arguments?: Record<string, unknown> }
  | { type: 'artifact_changed'; path: string }
  | { type: 'check_passed'; name: string };

export interface MikoContract {
  id: string;
  appliesWhen: {
    /** A contract applies when at least one of these tags is on the task. */
    taskTags: string[];
  };
  requires?: {
    skills?: string[];
    references?: string[];
  };
  actions?: {
    /** When present, tools outside this list are denied. */
    allow?: string[];
    deny?: string[];
    maxRisk?: RiskLevel;
    scope?: {
      /** Only these tools are subject to the path scope rule. */
      tools: string[];
      allowedPathPrefixes: string[];
      /** Argument names that may contain a path. Defaults to ["path"]. */
      argumentNames?: string[];
    };
  };
  completion?: {
    evidence: EvidenceRequirement[];
  };
  /** Missing evidence is REVIEW by default; enforce mode makes it DENY. */
  mode?: ContractMode;
}

export interface StartTaskInput {
  sessionId: string;
  taskId: string;
  tags: string[];
}

export interface VerifyActionInput {
  taskId: string;
  tool: string;
  risk: RiskLevel;
  arguments?: Record<string, unknown>;
}

export interface VerificationResult {
  decision: MikoDecision;
  reasonCode:
    | 'CONTRACT_SATISFIED'
    | 'NO_APPLICABLE_CONTRACT'
    | 'TASK_NOT_FOUND'
    | 'PREPARATION_EVIDENCE_MISSING'
    | 'TOOL_DENIED'
    | 'TOOL_NOT_ALLOWED'
    | 'RISK_TOO_HIGH'
    | 'SCOPE_ARGUMENT_MISSING'
    | 'PATH_OUT_OF_SCOPE'
    | 'COMPLETION_EVIDENCE_MISSING'
    | 'INVALID_ACTION';
  reason: string;
  contractIds: string[];
  missing?: string[];
}

export interface RecordEvidenceResult {
  accepted: boolean;
  reasonCode: 'EVIDENCE_RECORDED' | 'TASK_NOT_FOUND' | 'INVALID_EVIDENCE';
  reason: string;
}

export interface Miko {
  startTask(input: StartTaskInput): void;
  record(input: EvidenceEvent & { taskId: string }): RecordEvidenceResult;
  verifyPreparation(taskId: string): VerificationResult;
  verifyAction(input: VerifyActionInput): VerificationResult;
  verifyCompletion(taskId: string): VerificationResult;
  getEvidence(taskId: string): readonly EvidenceEvent[];
}

interface TaskState extends StartTaskInput {
  evidence: EvidenceEvent[];
}

const RISK_RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };
const RISK_LEVELS = new Set<RiskLevel>(['low', 'medium', 'high']);
const EVIDENCE_TYPES = new Set([
  'skill_loaded',
  'reference_read',
  'tool_succeeded',
  'artifact_changed',
  'check_passed',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireStringArray(value: unknown, label: string, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || !value.every(isNonEmptyString)) {
    throw new Error(`${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array of strings`);
  }
  return value;
}

function normalizeRelativePath(value: string): string | null {
  const candidate = value.trim().replace(/\\/g, '/');
  if (!candidate || candidate.startsWith('/') || /^[A-Za-z]:\//.test(candidate)) return null;

  const parts: string[] = [];
  for (const part of candidate.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.length > 0 ? parts.join('/') : null;
}

function isPathWithin(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validateRequirement(value: unknown, label: string): asserts value is EvidenceRequirement {
  if (!isRecord(value) || !EVIDENCE_TYPES.has(String(value.type))) {
    throw new Error(`${label} has an unknown evidence type`);
  }
  if (value.type === 'skill_loaded' || value.type === 'check_passed') {
    if (!isNonEmptyString(value.name)) throw new Error(`${label}.name must be a non-empty string`);
  } else if (value.type === 'reference_read' || value.type === 'artifact_changed') {
    if (!isNonEmptyString(value.path) || normalizeRelativePath(value.path) === null) {
      throw new Error(`${label}.path must be a project-relative path`);
    }
  } else if (value.type === 'tool_succeeded') {
    if (!isNonEmptyString(value.tool)) throw new Error(`${label}.tool must be a non-empty string`);
    if (value.matches !== undefined && !isRecord(value.matches)) {
      throw new Error(`${label}.matches must be an object`);
    }
  }
}

function validateContract(contract: MikoContract, index: number): MikoContract {
  const label = `contracts[${index}]`;
  if (!isRecord(contract)) throw new Error(`${label} must be an object`);
  if (!isNonEmptyString(contract.id)) throw new Error(`${label}.id must be a non-empty string`);
  if (!isRecord(contract.appliesWhen)) throw new Error(`${label}.appliesWhen is required`);
  requireStringArray(contract.appliesWhen.taskTags, `${label}.appliesWhen.taskTags`);

  if (contract.mode !== undefined && contract.mode !== 'review' && contract.mode !== 'enforce') {
    throw new Error(`${label}.mode must be "review" or "enforce"`);
  }

  if (contract.requires !== undefined) {
    if (!isRecord(contract.requires)) throw new Error(`${label}.requires must be an object`);
    if (contract.requires.skills !== undefined) {
      requireStringArray(contract.requires.skills, `${label}.requires.skills`, true);
    }
    if (contract.requires.references !== undefined) {
      requireStringArray(contract.requires.references, `${label}.requires.references`, true);
      for (const path of contract.requires.references) {
        if (normalizeRelativePath(path) === null) {
          throw new Error(`${label}.requires.references must contain project-relative paths`);
        }
      }
    }
  }

  if (contract.actions !== undefined) {
    if (!isRecord(contract.actions)) throw new Error(`${label}.actions must be an object`);
    const allow = contract.actions.allow;
    const deny = contract.actions.deny;
    if (allow !== undefined) requireStringArray(allow, `${label}.actions.allow`, true);
    if (deny !== undefined) requireStringArray(deny, `${label}.actions.deny`, true);
    if (allow && deny) {
      const overlap = allow.find((tool) => deny.includes(tool));
      if (overlap) throw new Error(`${label} lists ${overlap} in both actions.allow and actions.deny`);
    }
    if (contract.actions.maxRisk !== undefined && !RISK_LEVELS.has(contract.actions.maxRisk)) {
      throw new Error(`${label}.actions.maxRisk is invalid`);
    }
    const scope = contract.actions.scope;
    if (scope !== undefined) {
      if (!isRecord(scope)) throw new Error(`${label}.actions.scope must be an object`);
      requireStringArray(scope.tools, `${label}.actions.scope.tools`);
      requireStringArray(scope.allowedPathPrefixes, `${label}.actions.scope.allowedPathPrefixes`);
      if (scope.argumentNames !== undefined) {
        requireStringArray(scope.argumentNames, `${label}.actions.scope.argumentNames`);
      }
      for (const prefix of scope.allowedPathPrefixes) {
        if (normalizeRelativePath(prefix) === null) {
          throw new Error(`${label}.actions.scope.allowedPathPrefixes must be project-relative`);
        }
      }
    }
  }

  if (contract.completion !== undefined) {
    if (!isRecord(contract.completion) || !Array.isArray(contract.completion.evidence)) {
      throw new Error(`${label}.completion.evidence must be an array`);
    }
    contract.completion.evidence.forEach((item, itemIndex) =>
      validateRequirement(item, `${label}.completion.evidence[${itemIndex}]`),
    );
  }

  return cloneJson(contract);
}

function validateEvidence(value: unknown): value is EvidenceEvent {
  try {
    validateRequirement(value, 'evidence');
    const candidate = value as unknown as Record<string, unknown>;
    if (candidate.type === 'tool_succeeded') {
      if (candidate.arguments !== undefined && !isRecord(candidate.arguments)) return false;
      if ('matches' in candidate) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function deepSubset(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((item, index) => deepSubset(item, actual[index]));
  }
  if (isRecord(expected)) {
    return isRecord(actual) && Object.entries(expected).every(([key, value]) =>
      Object.hasOwn(actual, key) && deepSubset(value, actual[key]),
    );
  }
  return Object.is(expected, actual);
}

function requirementKey(requirement: EvidenceRequirement): string {
  if (requirement.type === 'skill_loaded' || requirement.type === 'check_passed') {
    return `${requirement.type}:${requirement.name}`;
  }
  if (requirement.type === 'reference_read' || requirement.type === 'artifact_changed') {
    return `${requirement.type}:${normalizeRelativePath(requirement.path)}`;
  }
  return `${requirement.type}:${requirement.tool}`;
}

function hasEvidence(events: EvidenceEvent[], requirement: EvidenceRequirement): boolean {
  return events.some((event) => {
    if (event.type !== requirement.type) return false;
    if (event.type === 'skill_loaded' && requirement.type === 'skill_loaded') {
      return event.name === requirement.name;
    }
    if (event.type === 'check_passed' && requirement.type === 'check_passed') {
      return event.name === requirement.name;
    }
    if (event.type === 'reference_read' && requirement.type === 'reference_read') {
      return normalizeRelativePath(event.path) === normalizeRelativePath(requirement.path);
    }
    if (event.type === 'artifact_changed' && requirement.type === 'artifact_changed') {
      return normalizeRelativePath(event.path) === normalizeRelativePath(requirement.path);
    }
    if (event.type === 'tool_succeeded' && requirement.type === 'tool_succeeded') {
      return event.tool === requirement.tool &&
        (requirement.matches === undefined || deepSubset(requirement.matches, event.arguments));
    }
    return false;
  });
}

function missingDecision(contracts: MikoContract[]): MikoDecision {
  return contracts.some((contract) => contract.mode === 'enforce') ? 'DENY' : 'REVIEW';
}

function result(
  decision: MikoDecision,
  reasonCode: VerificationResult['reasonCode'],
  reason: string,
  contractIds: string[],
  missing?: string[],
): VerificationResult {
  return { decision, reasonCode, reason, contractIds, ...(missing?.length ? { missing } : {}) };
}

export function createMiko(config: { contracts: MikoContract[] }): Miko {
  if (!isRecord(config) || !Array.isArray(config.contracts)) {
    throw new Error('contracts must be an array');
  }
  const contracts = config.contracts.map(validateContract);
  const ids = new Set<string>();
  for (const contract of contracts) {
    if (ids.has(contract.id)) throw new Error(`duplicate contract id: ${contract.id}`);
    ids.add(contract.id);
  }

  const tasks = new Map<string, TaskState>();

  function getTask(taskId: string): TaskState | undefined {
    return tasks.get(taskId);
  }

  function applicable(task: TaskState): MikoContract[] {
    const tags = new Set(task.tags);
    return contracts.filter((contract) => contract.appliesWhen.taskTags.some((tag) => tags.has(tag)));
  }

  function missingPreparation(
    task: TaskState,
    matched: MikoContract[],
  ): { items: string[]; contracts: MikoContract[] } {
    const missing: string[] = [];
    const missingContracts = new Set<MikoContract>();
    for (const contract of matched) {
      for (const name of contract.requires?.skills ?? []) {
        const requirement: EvidenceRequirement = { type: 'skill_loaded', name };
        if (!hasEvidence(task.evidence, requirement)) {
          missing.push(`${contract.id}:${requirementKey(requirement)}`);
          missingContracts.add(contract);
        }
      }
      for (const path of contract.requires?.references ?? []) {
        const requirement: EvidenceRequirement = { type: 'reference_read', path };
        if (!hasEvidence(task.evidence, requirement)) {
          missing.push(`${contract.id}:${requirementKey(requirement)}`);
          missingContracts.add(contract);
        }
      }
    }
    return { items: missing, contracts: [...missingContracts] };
  }

  function lookup(taskId: string): { task?: TaskState; matched: MikoContract[]; error?: VerificationResult } {
    const task = getTask(taskId);
    if (!task) {
      return {
        matched: [],
        error: result('REVIEW', 'TASK_NOT_FOUND', `Task "${taskId}" has not been started.`, []),
      };
    }
    const matched = applicable(task);
    if (matched.length === 0) {
      return {
        task,
        matched,
        error: result('ALLOW', 'NO_APPLICABLE_CONTRACT', 'No contract applies to this task.', []),
      };
    }
    return { task, matched };
  }

  function verifyPreparation(taskId: string): VerificationResult {
    const found = lookup(taskId);
    if (found.error) return found.error;
    const missing = missingPreparation(found.task!, found.matched);
    const contractIds = found.matched.map((contract) => contract.id);
    if (missing.items.length > 0) {
      return result(
        missingDecision(missing.contracts),
        'PREPARATION_EVIDENCE_MISSING',
        'Required preparation evidence is missing.',
        contractIds,
        missing.items,
      );
    }
    return result('ALLOW', 'CONTRACT_SATISFIED', 'Preparation requirements are satisfied.', contractIds);
  }

  return {
    startTask(input) {
      if (!isRecord(input) || !isNonEmptyString(input.sessionId) || !isNonEmptyString(input.taskId)) {
        throw new Error('sessionId and taskId must be non-empty strings');
      }
      requireStringArray(input.tags, 'tags', true);
      if (tasks.has(input.taskId)) throw new Error(`task already exists: ${input.taskId}`);
      tasks.set(input.taskId, { ...cloneJson(input), evidence: [] });
    },

    record(input) {
      if (!isRecord(input) || !isNonEmptyString(input.taskId)) {
        return { accepted: false, reasonCode: 'INVALID_EVIDENCE', reason: 'taskId is required.' };
      }
      const task = getTask(input.taskId);
      if (!task) {
        return { accepted: false, reasonCode: 'TASK_NOT_FOUND', reason: `Task "${input.taskId}" has not been started.` };
      }
      const { taskId: _taskId, ...event } = input;
      if (!validateEvidence(event)) {
        return { accepted: false, reasonCode: 'INVALID_EVIDENCE', reason: 'Evidence does not match a supported schema.' };
      }
      task.evidence.push(cloneJson(event));
      return { accepted: true, reasonCode: 'EVIDENCE_RECORDED', reason: 'Evidence recorded.' };
    },

    verifyPreparation,

    verifyAction(input) {
      if (!isRecord(input) || !isNonEmptyString(input.taskId) || !isNonEmptyString(input.tool) ||
          !RISK_LEVELS.has(input.risk) || (input.arguments !== undefined && !isRecord(input.arguments))) {
        return result('REVIEW', 'INVALID_ACTION', 'Action does not match the expected schema.', []);
      }
      const found = lookup(input.taskId);
      if (found.error) return found.error;
      const preparation = verifyPreparation(input.taskId);
      if (preparation.decision !== 'ALLOW') return preparation;
      const contractIds = found.matched.map((contract) => contract.id);

      for (const contract of found.matched) {
        const actions = contract.actions;
        if (!actions) continue;
        if (actions.deny?.includes(input.tool)) {
          return result('DENY', 'TOOL_DENIED', `Tool "${input.tool}" is explicitly denied.`, [contract.id]);
        }
        if (actions.allow !== undefined && !actions.allow.includes(input.tool)) {
          return result('DENY', 'TOOL_NOT_ALLOWED', `Tool "${input.tool}" is outside the allowlist.`, [contract.id]);
        }
        if (actions.maxRisk && RISK_RANK[input.risk] > RISK_RANK[actions.maxRisk]) {
          return result('DENY', 'RISK_TOO_HIGH', `Risk "${input.risk}" exceeds "${actions.maxRisk}".`, [contract.id]);
        }

        const scope = actions.scope;
        if (scope?.tools.includes(input.tool)) {
          const argumentNames = scope.argumentNames ?? ['path'];
          const candidate = argumentNames
            .map((name) => input.arguments?.[name])
            .find((value): value is string => isNonEmptyString(value));
          if (!candidate) {
            return result('REVIEW', 'SCOPE_ARGUMENT_MISSING', 'The scoped action has no usable path argument.', [contract.id]);
          }
          const normalized = normalizeRelativePath(candidate);
          const prefixes = scope.allowedPathPrefixes.map((prefix) => normalizeRelativePath(prefix)!);
          if (normalized === null || !prefixes.some((prefix) => isPathWithin(normalized, prefix))) {
            return result('DENY', 'PATH_OUT_OF_SCOPE', `Path "${candidate}" is outside the allowed scope.`, [contract.id]);
          }
        }
      }

      return result('ALLOW', 'CONTRACT_SATISFIED', 'The proposed action satisfies every applicable contract.', contractIds);
    },

    verifyCompletion(taskId) {
      const found = lookup(taskId);
      if (found.error) return found.error;
      const preparation = verifyPreparation(taskId);
      if (preparation.decision !== 'ALLOW') return preparation;
      const missing: string[] = [];
      const missingContracts = new Set<MikoContract>();
      for (const contract of found.matched) {
        for (const requirement of contract.completion?.evidence ?? []) {
          if (!hasEvidence(found.task!.evidence, requirement)) {
            missing.push(`${contract.id}:${requirementKey(requirement)}`);
            missingContracts.add(contract);
          }
        }
      }
      const contractIds = found.matched.map((contract) => contract.id);
      if (missing.length > 0) {
        return result(
          missingDecision([...missingContracts]),
          'COMPLETION_EVIDENCE_MISSING',
          'Required completion evidence is missing.',
          contractIds,
          missing,
        );
      }
      return result('ALLOW', 'CONTRACT_SATISFIED', 'Completion requirements are satisfied.', contractIds);
    },

    getEvidence(taskId) {
      return cloneJson(getTask(taskId)?.evidence ?? []);
    },
  };
}

export interface ClaudePreToolUseDecision {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'allow' | 'deny' | 'ask';
    permissionDecisionReason: string;
  };
}

/**
 * Maps a Miko result to Claude Code's structured PreToolUse hook output.
 * The host remains responsible for task/evidence persistence across hook processes.
 */
export function toClaudePreToolUseDecision(result: VerificationResult): ClaudePreToolUseDecision {
  const permissionDecision = result.decision === 'ALLOW'
    ? 'allow'
    : result.decision === 'DENY'
      ? 'deny'
      : 'ask';
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision,
      permissionDecisionReason: `[${result.reasonCode}] ${result.reason}`,
    },
  };
}

export default { createMiko, toClaudePreToolUseDecision };
