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
export type MikoCheckpoint = 'PREPARE' | 'PRE_ACTION' | 'COMPLETE';
export type RiskLevel = 'low' | 'medium' | 'high';
export type ContractMode = 'review' | 'enforce';
export type EvidenceSource = 'observed' | 'asserted' | 'external';
export type ContextAdvanceReason = 'compaction' | 'resume' | 'manual';

export interface SkillRequirement {
  name: string;
  /** Require a load observed in the current context epoch. */
  reloadAfterCompaction?: boolean;
}

export type SkillRequirementInput = string | SkillRequirement;

export type EvidenceRequirement =
  | { type: 'skill_loaded'; name: string }
  | { type: 'reference_read'; path: string }
  | { type: 'tool_succeeded'; tool: string; matches?: Record<string, unknown> }
  | { type: 'artifact_changed'; path: string }
  | { type: 'check_passed'; name: string };

export type EvidenceEvent = (
  | { type: 'skill_loaded'; name: string }
  | { type: 'reference_read'; path: string }
  | { type: 'tool_succeeded'; tool: string; arguments?: Record<string, unknown> }
  | { type: 'artifact_changed'; path: string }
  | { type: 'check_passed'; name: string }
) & {
  /**
   * `observed` comes from a host lifecycle/tool event, `external` from an
   * independently executed check, and `asserted` is only an agent claim.
   * Asserted evidence is retained for audit but never satisfies a contract.
   */
  source: EvidenceSource;
};

export interface ActionSelector {
  /** Every configured field must match. */
  tools?: string[];
  pathPrefixes?: string[];
  /** Argument names that may contain a path. Defaults to Claude and generic names. */
  argumentNames?: string[];
}

export interface MikoContract {
  id: string;
  appliesWhen: {
    /** A matching tag activates the contract without relying on an action. */
    taskTags?: string[];
    /** A matching observed action activates the contract independently of task tags. */
    action?: ActionSelector;
  };
  requires?: {
    skills?: SkillRequirementInput[];
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
  checkpoint: MikoCheckpoint;
  reasonCode:
    | 'CONTRACT_SATISFIED'
    | 'NO_APPLICABLE_CONTRACT'
    | 'TASK_NOT_FOUND'
    | 'PREPARATION_EVIDENCE_MISSING'
    | 'SKILL_DECLARED_BUT_NOT_OBSERVED'
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

export interface ActivateContractResult {
  activated: boolean;
  reasonCode: 'CONTRACT_ACTIVATED' | 'TASK_NOT_FOUND' | 'CONTRACT_NOT_FOUND';
  reason: string;
}

export interface AdvanceContextResult {
  advanced: boolean;
  reasonCode: 'CONTEXT_ADVANCED' | 'TASK_NOT_FOUND';
  reason: string;
  epoch?: number;
}

export interface MikoTaskSnapshot {
  version: 1;
  sessionId: string;
  taskId: string;
  tags: string[];
  contextEpoch: number;
  activeContractIds: string[];
  evidence: Array<{ event: EvidenceEvent; contextEpoch: number }>;
}

export interface Miko {
  startTask(input: StartTaskInput): void;
  restoreTask(snapshot: MikoTaskSnapshot): void;
  activateContract(taskId: string, contractId: string): ActivateContractResult;
  advanceContext(taskId: string, reason: ContextAdvanceReason): AdvanceContextResult;
  record(input: EvidenceEvent & { taskId: string }): RecordEvidenceResult;
  verifyPreparation(taskId: string): VerificationResult;
  verifyAction(input: VerifyActionInput): VerificationResult;
  verifyCompletion(taskId: string): VerificationResult;
  getEvidence(taskId: string): readonly EvidenceEvent[];
  getActiveContractIds(taskId: string): readonly string[];
  getContextEpoch(taskId: string): number | undefined;
  snapshotTask(taskId: string): MikoTaskSnapshot | undefined;
}

interface TaskState extends StartTaskInput {
  contextEpoch: number;
  evidence: Array<{ event: EvidenceEvent; contextEpoch: number }>;
  evidenceIndex: Map<string, Array<{ event: EvidenceEvent; contextEpoch: number }>>;
  activeContractIds: Set<string>;
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
const EVIDENCE_SOURCES = new Set<EvidenceSource>(['observed', 'asserted', 'external']);
const DEFAULT_PATH_ARGUMENT_NAMES = ['path', 'file_path', 'filePath'];

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
  const taskTags = contract.appliesWhen.taskTags;
  const actionSelector = contract.appliesWhen.action;
  if (taskTags !== undefined) {
    requireStringArray(taskTags, `${label}.appliesWhen.taskTags`);
  }
  if (actionSelector !== undefined) {
    if (!isRecord(actionSelector)) throw new Error(`${label}.appliesWhen.action must be an object`);
    if (actionSelector.tools !== undefined) {
      requireStringArray(actionSelector.tools, `${label}.appliesWhen.action.tools`);
    }
    if (actionSelector.pathPrefixes !== undefined) {
      const pathPrefixes = requireStringArray(
        actionSelector.pathPrefixes,
        `${label}.appliesWhen.action.pathPrefixes`,
      );
      for (const prefix of pathPrefixes) {
        if (normalizeRelativePath(prefix) === null) {
          throw new Error(`${label}.appliesWhen.action.pathPrefixes must be project-relative`);
        }
      }
    }
    if (actionSelector.argumentNames !== undefined) {
      requireStringArray(actionSelector.argumentNames, `${label}.appliesWhen.action.argumentNames`);
    }
    if (actionSelector.tools === undefined && actionSelector.pathPrefixes === undefined) {
      throw new Error(`${label}.appliesWhen.action must select tools or pathPrefixes`);
    }
  }
  if (taskTags === undefined && actionSelector === undefined) {
    throw new Error(`${label}.appliesWhen must select taskTags or an action`);
  }

  if (contract.mode !== undefined && contract.mode !== 'review' && contract.mode !== 'enforce') {
    throw new Error(`${label}.mode must be "review" or "enforce"`);
  }

  if (contract.requires !== undefined) {
    if (!isRecord(contract.requires)) throw new Error(`${label}.requires must be an object`);
    if (contract.requires.skills !== undefined) {
      if (!Array.isArray(contract.requires.skills)) {
        throw new Error(`${label}.requires.skills must be an array`);
      }
      for (const [skillIndex, skill] of contract.requires.skills.entries()) {
        if (isNonEmptyString(skill)) continue;
        if (!isRecord(skill) || !isNonEmptyString(skill.name) ||
            (skill.reloadAfterCompaction !== undefined &&
              typeof skill.reloadAfterCompaction !== 'boolean')) {
          throw new Error(
            `${label}.requires.skills[${skillIndex}] must be a name or skill requirement`,
          );
        }
      }
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
    if (!EVIDENCE_SOURCES.has(candidate.source as EvidenceSource)) return false;
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

function normalizeSkillRequirement(requirement: SkillRequirementInput): SkillRequirement {
  return typeof requirement === 'string' ? { name: requirement } : requirement;
}

function evidenceIndexKey(event: EvidenceEvent): string {
  if (event.type === 'skill_loaded' || event.type === 'check_passed') {
    return `${event.type}:${event.name}`;
  }
  if (event.type === 'reference_read' || event.type === 'artifact_changed') {
    return `${event.type}:${normalizeRelativePath(event.path)}`;
  }
  return `${event.type}:${event.tool}`;
}

function evidenceMatches(event: EvidenceEvent, requirement: EvidenceRequirement): boolean {
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
}

function hasEvidence(
  task: TaskState,
  requirement: EvidenceRequirement,
  minimumEpoch = 0,
): boolean {
  return (task.evidenceIndex.get(requirementKey(requirement)) ?? []).some((record) => {
    return record.contextEpoch >= minimumEpoch && record.event.source !== 'asserted' &&
      evidenceMatches(record.event, requirement);
  });
}

function hasAssertedEvidence(
  task: TaskState,
  requirement: EvidenceRequirement,
  minimumEpoch = 0,
): boolean {
  return (task.evidenceIndex.get(requirementKey(requirement)) ?? []).some((record) =>
    record.contextEpoch >= minimumEpoch && record.event.source === 'asserted' &&
    evidenceMatches(record.event, requirement),
  );
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
  checkpoint: MikoCheckpoint = 'PRE_ACTION',
): VerificationResult {
  return {
    decision,
    checkpoint,
    reasonCode,
    reason,
    contractIds,
    ...(missing?.length ? { missing } : {}),
  };
}

function actionPath(input: VerifyActionInput, argumentNames = DEFAULT_PATH_ARGUMENT_NAMES): string | null {
  const candidate = argumentNames
    .map((name) => input.arguments?.[name])
    .find((value): value is string => isNonEmptyString(value));
  return candidate ? normalizeRelativePath(candidate) : null;
}

function matchesActionSelector(input: VerifyActionInput, selector: ActionSelector): boolean {
  if (selector.tools !== undefined && !selector.tools.includes(input.tool)) return false;
  if (selector.pathPrefixes !== undefined) {
    const path = actionPath(input, selector.argumentNames ?? DEFAULT_PATH_ARGUMENT_NAMES);
    if (path === null) return false;
    const prefixes = selector.pathPrefixes.map((prefix) => normalizeRelativePath(prefix)!);
    if (!prefixes.some((prefix) => isPathWithin(path, prefix))) return false;
  }
  return true;
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

  function newTaskState(input: StartTaskInput, contextEpoch = 0): TaskState {
    return {
      ...cloneJson(input),
      contextEpoch,
      evidence: [],
      evidenceIndex: new Map(),
      activeContractIds: new Set(),
    };
  }

  function addEvidence(
    task: TaskState,
    event: EvidenceEvent,
    contextEpoch = task.contextEpoch,
  ): void {
    const record = { event: cloneJson(event), contextEpoch };
    task.evidence.push(record);
    const key = evidenceIndexKey(record.event);
    const indexed = task.evidenceIndex.get(key) ?? [];
    indexed.push(record);
    task.evidenceIndex.set(key, indexed);
  }

  function getTask(taskId: string): TaskState | undefined {
    return tasks.get(taskId);
  }

  function applicable(task: TaskState, action?: VerifyActionInput): MikoContract[] {
    const tags = new Set(task.tags);
    return contracts.filter((contract) => {
      const tagMatch = contract.appliesWhen.taskTags?.some((tag) => tags.has(tag)) ?? false;
      const explicitMatch = task.activeContractIds.has(contract.id);
      const actionMatch = action !== undefined && contract.appliesWhen.action !== undefined &&
        matchesActionSelector(action, contract.appliesWhen.action);
      if (actionMatch) task.activeContractIds.add(contract.id);
      return tagMatch || explicitMatch || actionMatch;
    });
  }

  function missingPreparation(
    task: TaskState,
    matched: MikoContract[],
  ): { items: string[]; contracts: MikoContract[]; assertedSkills: boolean } {
    const missing: string[] = [];
    const missingContracts = new Set<MikoContract>();
    let assertedSkills = false;
    for (const contract of matched) {
      for (const name of contract.requires?.skills ?? []) {
        const skill = normalizeSkillRequirement(name);
        const requirement: EvidenceRequirement = { type: 'skill_loaded', name: skill.name };
        const minimumEpoch = skill.reloadAfterCompaction ? task.contextEpoch : 0;
        if (!hasEvidence(task, requirement, minimumEpoch)) {
          missing.push(`${contract.id}:${requirementKey(requirement)}`);
          missingContracts.add(contract);
          assertedSkills ||= hasAssertedEvidence(task, requirement, minimumEpoch);
        }
      }
      for (const path of contract.requires?.references ?? []) {
        const requirement: EvidenceRequirement = { type: 'reference_read', path };
        if (!hasEvidence(task, requirement)) {
          missing.push(`${contract.id}:${requirementKey(requirement)}`);
          missingContracts.add(contract);
        }
      }
    }
    return { items: missing, contracts: [...missingContracts], assertedSkills };
  }

  function lookup(
    taskId: string,
    action?: VerifyActionInput,
    checkpoint: MikoCheckpoint = action ? 'PRE_ACTION' : 'PREPARE',
  ): { task?: TaskState; matched: MikoContract[]; error?: VerificationResult } {
    const task = getTask(taskId);
    if (!task) {
      return {
        matched: [],
        error: result(
          'REVIEW',
          'TASK_NOT_FOUND',
          `Task "${taskId}" has not been started.`,
          [],
          undefined,
          checkpoint,
        ),
      };
    }
    const matched = applicable(task, action);
    if (matched.length === 0) {
      return {
        task,
        matched,
        error: result(
          'ALLOW',
          'NO_APPLICABLE_CONTRACT',
          'No contract applies to this task.',
          [],
          undefined,
          checkpoint,
        ),
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
        missing.assertedSkills ? 'SKILL_DECLARED_BUT_NOT_OBSERVED' : 'PREPARATION_EVIDENCE_MISSING',
        missing.assertedSkills
          ? 'The agent declared a required skill, but the host did not observe it being loaded.'
          : 'Required preparation evidence is missing.',
        contractIds,
        missing.items,
        'PREPARE',
      );
    }
    return result(
      'ALLOW',
      'CONTRACT_SATISFIED',
      'Preparation requirements are satisfied.',
      contractIds,
      undefined,
      'PREPARE',
    );
  }

  return {
    startTask(input) {
      if (!isRecord(input) || !isNonEmptyString(input.sessionId) || !isNonEmptyString(input.taskId)) {
        throw new Error('sessionId and taskId must be non-empty strings');
      }
      requireStringArray(input.tags, 'tags', true);
      if (tasks.has(input.taskId)) throw new Error(`task already exists: ${input.taskId}`);
      tasks.set(input.taskId, newTaskState(input));
    },

    restoreTask(snapshot) {
      if (!isRecord(snapshot) || snapshot.version !== 1 ||
          !isNonEmptyString(snapshot.sessionId) || !isNonEmptyString(snapshot.taskId) ||
          !Array.isArray(snapshot.tags) || !snapshot.tags.every(isNonEmptyString) ||
          !Number.isSafeInteger(snapshot.contextEpoch) || snapshot.contextEpoch < 0 ||
          !Array.isArray(snapshot.activeContractIds) ||
          !snapshot.activeContractIds.every(isNonEmptyString) ||
          !Array.isArray(snapshot.evidence)) {
        throw new Error('Invalid Miko task snapshot.');
      }
      if (tasks.has(snapshot.taskId)) throw new Error(`task already exists: ${snapshot.taskId}`);
      const task = newTaskState({
        sessionId: snapshot.sessionId,
        taskId: snapshot.taskId,
        tags: snapshot.tags,
      }, snapshot.contextEpoch);
      for (const contractId of snapshot.activeContractIds) {
        if (!ids.has(contractId)) throw new Error(`snapshot contract does not exist: ${contractId}`);
        task.activeContractIds.add(contractId);
      }
      for (const record of snapshot.evidence) {
        if (!isRecord(record) || !validateEvidence(record.event) ||
            !Number.isSafeInteger(record.contextEpoch) || record.contextEpoch < 0 ||
            record.contextEpoch > snapshot.contextEpoch) {
          throw new Error('Invalid evidence in Miko task snapshot.');
        }
        addEvidence(task, record.event, record.contextEpoch);
      }
      tasks.set(snapshot.taskId, task);
    },

    activateContract(taskId, contractId) {
      const task = getTask(taskId);
      if (!task) {
        return { activated: false, reasonCode: 'TASK_NOT_FOUND', reason: `Task "${taskId}" has not been started.` };
      }
      if (!ids.has(contractId)) {
        return { activated: false, reasonCode: 'CONTRACT_NOT_FOUND', reason: `Contract "${contractId}" does not exist.` };
      }
      task.activeContractIds.add(contractId);
      return { activated: true, reasonCode: 'CONTRACT_ACTIVATED', reason: `Contract "${contractId}" is active.` };
    },

    advanceContext(taskId, reason) {
      const task = getTask(taskId);
      if (!task) {
        return {
          advanced: false,
          reasonCode: 'TASK_NOT_FOUND',
          reason: `Task "${taskId}" has not been started.`,
        };
      }
      if (reason !== 'compaction' && reason !== 'resume' && reason !== 'manual') {
        throw new Error(`Unknown context advance reason: ${String(reason)}`);
      }
      task.contextEpoch += 1;
      return {
        advanced: true,
        reasonCode: 'CONTEXT_ADVANCED',
        reason: `Context advanced after ${reason}.`,
        epoch: task.contextEpoch,
      };
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
      addEvidence(task, event);
      return { accepted: true, reasonCode: 'EVIDENCE_RECORDED', reason: 'Evidence recorded.' };
    },

    verifyPreparation,

    verifyAction(input) {
      if (!isRecord(input) || !isNonEmptyString(input.taskId) || !isNonEmptyString(input.tool) ||
          !RISK_LEVELS.has(input.risk) || (input.arguments !== undefined && !isRecord(input.arguments))) {
        return result(
          'REVIEW',
          'INVALID_ACTION',
          'Action does not match the expected schema.',
          [],
          undefined,
          'PRE_ACTION',
        );
      }
      const found = lookup(input.taskId, input);
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
      const found = lookup(taskId, undefined, 'COMPLETE');
      if (found.error) return found.error;
      const preparation = verifyPreparation(taskId);
      if (preparation.decision !== 'ALLOW') return preparation;
      const missing: string[] = [];
      const missingContracts = new Set<MikoContract>();
      for (const contract of found.matched) {
        for (const requirement of contract.completion?.evidence ?? []) {
          if (!hasEvidence(found.task!, requirement)) {
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
          'COMPLETE',
        );
      }
      return result(
        'ALLOW',
        'CONTRACT_SATISFIED',
        'Completion requirements are satisfied.',
        contractIds,
        undefined,
        'COMPLETE',
      );
    },

    getEvidence(taskId) {
      return cloneJson((getTask(taskId)?.evidence ?? []).map((record) => record.event));
    },

    getActiveContractIds(taskId) {
      return [...(getTask(taskId)?.activeContractIds ?? [])];
    },

    getContextEpoch(taskId) {
      return getTask(taskId)?.contextEpoch;
    },

    snapshotTask(taskId) {
      const task = getTask(taskId);
      if (!task) return undefined;
      return cloneJson({
        version: 1,
        sessionId: task.sessionId,
        taskId: task.taskId,
        tags: task.tags,
        contextEpoch: task.contextEpoch,
        activeContractIds: [...task.activeContractIds],
        evidence: task.evidence,
      });
    },
  };
}

export interface ClaudePreToolUseDecision {
  /** Claude Code displays this warning to the user on interactive surfaces. */
  systemMessage?: string;
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'allow' | 'deny' | 'ask';
    permissionDecisionReason: string;
    additionalContext?: string;
  };
}

export function formatMikoDecision(
  result: VerificationResult,
  options: { maxItems?: number; maxContracts?: number } = {},
): string {
  const maxItems = Math.max(1, options.maxItems ?? 3);
  const maxContracts = Math.max(1, options.maxContracts ?? 3);
  const signal = result.decision === 'ALLOW' ? '🟢' : result.decision === 'DENY' ? '🔴' : '🟡';
  const lines = [
    `${signal} Miko ${result.decision} · ${result.checkpoint} — ${result.reasonCode}`,
    result.reason,
  ];
  if (result.contractIds.length > 0) {
    const visible = result.contractIds.slice(0, maxContracts);
    const remaining = result.contractIds.length - visible.length;
    lines.push(`Contracts: ${visible.join(', ')}${remaining > 0 ? ` (+${remaining} more)` : ''}`);
  }
  if (result.missing?.length) {
    lines.push('Missing evidence:');
    const visible = result.missing.slice(0, maxItems);
    lines.push(...visible.map((item) => `- ${item}`));
    if (result.missing.length > visible.length) {
      lines.push(`- … and ${result.missing.length - visible.length} more`);
    }
  }
  if (result.reasonCode === 'PREPARATION_EVIDENCE_MISSING' ||
      result.reasonCode === 'SKILL_DECLARED_BUT_NOT_OBSERVED') {
    lines.push('Next: load the required skill/reference, then retry the blocked action.');
  }
  return lines.join('\n');
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
  const message = formatMikoDecision(result);
  return {
    ...(result.decision === 'ALLOW' ? {} : { systemMessage: message }),
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision,
      permissionDecisionReason: message,
      ...(result.decision === 'ALLOW' ? {} : { additionalContext: message }),
    },
  };
}

export default { createMiko, formatMikoDecision, toClaudePreToolUseDecision };
