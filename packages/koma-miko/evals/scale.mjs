import { performance } from 'node:perf_hooks';
import { createMiko, formatMikoDecision } from '../dist/index.js';

function percentile(sorted, value) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))];
}

function measure(operation, iterations) {
  for (let index = 0; index < Math.min(25, iterations); index += 1) operation();
  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    operation();
    samples.push(performance.now() - started);
  }
  samples.sort((left, right) => left - right);
  return {
    p50Ms: Number(percentile(samples, 0.5).toFixed(4)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(4)),
  };
}

function contracts(count, overlap = false) {
  return Array.from({ length: count }, (_, index) => ({
    id: `agent-spec-${index}`,
    appliesWhen: {
      action: {
        tools: ['Edit'],
        pathPrefixes: [overlap ? 'src/shared' : `src/feature-${index}`],
      },
    },
    requires: {
      skills: [{ name: `skill-${index}`, reloadAfterCompaction: true }],
    },
    mode: 'enforce',
  }));
}

function targetScenario(contractCount, iterations) {
  const miko = createMiko({ contracts: contracts(contractCount) });
  miko.startTask({ sessionId: `target-${contractCount}`, taskId: 'task', tags: [] });
  miko.record({ taskId: 'task', type: 'skill_loaded', name: `skill-${contractCount - 1}`, source: 'observed' });
  const action = {
    taskId: 'task',
    tool: 'Edit',
    risk: 'medium',
    arguments: { file_path: `src/feature-${contractCount - 1}/fixture.ts` },
  };
  const result = miko.verifyAction(action);
  if (result.decision !== 'ALLOW') throw new Error(`Target scenario ${contractCount} did not allow`);
  return {
    scenario: `one match / ${contractCount} specs`,
    contracts: contractCount,
    evidence: 1,
    iterations,
    ...measure(() => miko.verifyAction(action), iterations),
  };
}

function overlapScenario(contractCount, iterations) {
  const miko = createMiko({ contracts: contracts(contractCount, true) });
  miko.startTask({ sessionId: `overlap-${contractCount}`, taskId: 'task', tags: [] });
  const action = {
    taskId: 'task',
    tool: 'Edit',
    risk: 'medium',
    arguments: { file_path: 'src/shared/fixture.ts' },
  };
  const result = miko.verifyAction(action);
  if (result.decision !== 'DENY' || result.missing?.length !== contractCount) {
    throw new Error(`Overlap scenario ${contractCount} did not preserve machine evidence`);
  }
  const rendered = formatMikoDecision(result);
  if (!rendered.includes(`and ${contractCount - 3} more`) || rendered.split('\n').length > 10) {
    throw new Error('Traffic-light output is not bounded');
  }
  return {
    scenario: `${contractCount} overlapping specs`,
    contracts: contractCount,
    evidence: 0,
    iterations,
    ...measure(() => miko.verifyAction(action), iterations),
  };
}

function longEvidenceScenario(evidenceCount, iterations) {
  const contract = contracts(1)[0];
  const miko = createMiko({ contracts: [contract] });
  miko.startTask({ sessionId: 'long-evidence', taskId: 'task', tags: [] });
  for (let index = 0; index < evidenceCount; index += 1) {
    miko.record({
      taskId: 'task',
      type: 'check_passed',
      name: `historical-check-${index}`,
      source: 'external',
    });
  }
  miko.record({ taskId: 'task', type: 'skill_loaded', name: 'skill-0', source: 'observed' });
  const action = {
    taskId: 'task',
    tool: 'Edit',
    risk: 'medium',
    arguments: { file_path: 'src/feature-0/fixture.ts' },
  };
  const result = miko.verifyAction(action);
  if (result.decision !== 'ALLOW') throw new Error('Long evidence scenario did not allow');
  return {
    scenario: `${evidenceCount.toLocaleString()} indexed evidence`,
    contracts: 1,
    evidence: evidenceCount + 1,
    iterations,
    ...measure(() => miko.verifyAction(action), iterations),
  };
}

function snapshotScenario(evidenceCount, iterations) {
  const source = createMiko({ contracts: contracts(100) });
  source.startTask({ sessionId: 'snapshot-scale', taskId: 'task', tags: [] });
  for (let index = 0; index < evidenceCount; index += 1) {
    source.record({
      taskId: 'task',
      type: 'check_passed',
      name: `snapshot-check-${index}`,
      source: 'external',
    });
  }
  const snapshot = source.snapshotTask('task');
  if (!snapshot) throw new Error('Snapshot was not produced');
  return {
    scenario: `restore ${evidenceCount.toLocaleString()} evidence`,
    contracts: 100,
    evidence: evidenceCount,
    iterations,
    ...measure(() => {
      const restored = createMiko({ contracts: contracts(100) });
      restored.restoreTask(snapshot);
    }, iterations),
  };
}

const heapBefore = process.memoryUsage().heapUsed;
const rows = [
  targetScenario(100, 2_000),
  targetScenario(1_000, 500),
  overlapScenario(100, 1_000),
  longEvidenceScenario(10_000, 1_000),
  snapshotScenario(1_000, 100),
];
const heapDeltaMiB = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;

console.table(rows);
console.log(`Heap delta: ${heapDeltaMiB.toFixed(2)} MiB`);
console.log('Context tokens: not ingested by Miko Verifier (model behavior requires a separate paid eval)');
console.log('Miko scale replay: PASS');
