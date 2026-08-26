import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMiko } from '../dist/index.js';

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outputPath = path.resolve(packageDir, '../../demo/web/public/miko-replay.json');
const checkOnly = process.argv.includes('--check');

const contracts = [
  {
    id: 'ui-skill-checkpoint',
    appliesWhen: { taskTags: ['ui-change'] },
    requires: {
      skills: [{ name: 'product-design', reloadAfterCompaction: true }],
    },
    actions: {
      allow: ['Read', 'Skill', 'Edit'],
      maxRisk: 'medium',
      scope: {
        tools: ['Edit'],
        allowedPathPrefixes: ['src/components'],
        argumentNames: ['file_path'],
      },
    },
    mode: 'enforce',
  },
  {
    id: 'design-reference-checkpoint',
    appliesWhen: { taskTags: ['ui-change'] },
    requires: { references: ['docs/design-system.md'] },
    mode: 'review',
  },
  {
    id: 'targeted-test-checkpoint',
    appliesWhen: { taskTags: ['ui-change'] },
    completion: {
      evidence: [{ type: 'check_passed', name: 'targeted-tests' }],
    },
    mode: 'enforce',
  },
];

const miko = createMiko({ contracts });
const taskId = 'sanitized-ui-replay';
miko.startTask({ sessionId: 'public-demo', taskId, tags: ['ui-change'] });

const events = [];
let sequence = 0;

function pushEvent(event) {
  sequence += 1;
  events.push({ sequence, offsetMs: (sequence - 1) * 850, ...event });
}

function pushDecision(title, result) {
  pushEvent({
    kind: 'decision',
    title,
    checkpoint: result.checkpoint,
    decision: result.decision,
    reasonCode: result.reasonCode,
    detail: result.reason,
    contractIds: result.contractIds,
    ...(result.missing ? { missing: result.missing } : {}),
  });
  return result;
}

function recordEvidence(title, evidence) {
  const result = miko.record({ taskId, ...evidence });
  if (!result.accepted) throw new Error(`Fixture evidence was rejected: ${result.reason}`);
  const value = evidence.name ?? evidence.path ?? evidence.tool;
  pushEvent({
    kind: 'evidence',
    title,
    evidenceType: evidence.type,
    source: evidence.source,
    value,
    detail: evidence.source === 'asserted'
      ? 'Retained for audit, but it cannot satisfy an Agent Spec.'
      : 'Captured from a host event without prompt or file contents.',
  });
}

pushDecision('Agent proposes a UI change', miko.verifyPreparation(taskId));

recordEvidence('Host observes the required Skill', {
  type: 'skill_loaded',
  name: 'product-design',
  source: 'observed',
});

pushDecision('Skill is ready; reference is still missing', miko.verifyPreparation(taskId));

recordEvidence('Host observes the design reference read', {
  type: 'reference_read',
  path: 'docs/design-system.md',
  source: 'observed',
});

pushDecision('Scoped edit reaches the checkpoint', miko.verifyAction({
  taskId,
  tool: 'Edit',
  risk: 'medium',
  arguments: { file_path: 'src/components/Hero.tsx' },
}));

recordEvidence('Agent says the targeted test passed', {
  type: 'check_passed',
  name: 'targeted-tests',
  source: 'asserted',
});

pushDecision('Claim alone cannot complete the spec', miko.verifyCompletion(taskId));

recordEvidence('Test runner reports a real pass', {
  type: 'check_passed',
  name: 'targeted-tests',
  source: 'external',
});

pushDecision('Agent Spec completes with trusted evidence', miko.verifyCompletion(taskId));

const advanced = miko.advanceContext(taskId, 'compaction');
if (!advanced.advanced) throw new Error(advanced.reason);
pushEvent({
  kind: 'context',
  title: 'Claude compacts its context',
  detail: `Context epoch advanced to ${advanced.epoch}; stale Skill evidence is no longer accepted.`,
  epoch: advanced.epoch,
});

pushDecision('The next edit requires a Skill reload', miko.verifyAction({
  taskId,
  tool: 'Edit',
  risk: 'medium',
  arguments: { file_path: 'src/components/Hero.tsx' },
}));

recordEvidence('Host observes the Skill reload', {
  type: 'skill_loaded',
  name: 'product-design',
  source: 'observed',
});

pushDecision('The edit is allowed in the new epoch', miko.verifyAction({
  taskId,
  tool: 'Edit',
  risk: 'medium',
  arguments: { file_path: 'src/components/Hero.tsx' },
}));

const expected = [
  ['decision', 'DENY'],
  ['evidence', 'observed'],
  ['decision', 'REVIEW'],
  ['evidence', 'observed'],
  ['decision', 'ALLOW'],
  ['evidence', 'asserted'],
  ['decision', 'DENY'],
  ['evidence', 'external'],
  ['decision', 'ALLOW'],
  ['context', 1],
  ['decision', 'DENY'],
  ['evidence', 'observed'],
  ['decision', 'ALLOW'],
];

for (const [index, event] of events.entries()) {
  const [kind, outcome] = expected[index];
  const actual = event.kind === 'decision'
    ? event.decision
    : event.kind === 'evidence'
      ? event.source
      : event.epoch;
  if (event.kind !== kind || actual !== outcome) {
    throw new Error(`Unexpected fixture event ${index + 1}: ${event.kind}/${actual}`);
  }
}

const fixture = {
  version: 1,
  generatedBy: 'koma-miko deterministic verifier replay',
  privacy: {
    containsPrompt: false,
    containsCode: false,
    containsModelResponse: false,
  },
  scenario: {
    title: 'UI change with a context compaction',
    description: 'A sanitized replay showing trusted evidence, an untrusted claim, and Skill reload after compaction.',
    specIds: contracts.map((contract) => contract.id),
  },
  events,
};

const serialized = `${JSON.stringify(fixture, null, 2)}\n`;
if (checkOnly) {
  const current = readFileSync(outputPath, 'utf8');
  if (current !== serialized) {
    throw new Error('demo/web/public/miko-replay.json is stale; run npm run eval:audit-demo -w koma-miko');
  }
  console.log(`Miko audit demo fixture is current (${events.length} events).`);
} else {
  writeFileSync(outputPath, serialized, 'utf8');
  console.log(`Wrote ${path.relative(process.cwd(), outputPath)} (${events.length} verified events).`);
}
