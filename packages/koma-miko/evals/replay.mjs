import { createMiko } from '../dist/index.js';

const profiles = [
  ['frontend-design', 'src/components', 'enforce'],
  ['accessibility-review', 'src/a11y', 'review'],
  ['secure-coding', 'src/auth', 'review'],
  ['api-contracts', 'src/api', 'review'],
  ['database-migrations', 'db/migrations', 'review'],
  ['testing', 'tests', 'review'],
  ['documentation', 'docs', 'review'],
  ['performance', 'src/performance', 'review'],
  ['privacy', 'src/privacy', 'review'],
  ['deployment', 'infra', 'review'],
];

const rows = [];
let failed = false;

for (const [skill, prefix, mode] of profiles) {
  const contract = {
    id: `${skill}-contract`,
    appliesWhen: { action: { tools: ['Edit'], pathPrefixes: [prefix] } },
    requires: { skills: [skill] },
    mode,
  };
  const action = {
    taskId: skill,
    tool: 'Edit',
    risk: 'medium',
    arguments: { file_path: `${prefix}/fixture.ts` },
  };
  const expectedMissing = mode === 'enforce' ? 'DENY' : 'REVIEW';

  const missing = createMiko({ contracts: [contract] });
  missing.startTask({ sessionId: skill, taskId: skill, tags: [] });
  const missingResult = missing.verifyAction(action);

  const asserted = createMiko({ contracts: [contract] });
  asserted.startTask({ sessionId: skill, taskId: skill, tags: [] });
  asserted.record({ taskId: skill, type: 'skill_loaded', name: skill, source: 'asserted' });
  const assertedResult = asserted.verifyAction(action);

  const observed = createMiko({ contracts: [contract] });
  observed.startTask({ sessionId: skill, taskId: skill, tags: [] });
  observed.record({ taskId: skill, type: 'skill_loaded', name: skill, source: 'observed' });
  const observedResult = observed.verifyAction(action);

  const pass = missingResult.decision === expectedMissing &&
    assertedResult.decision === expectedMissing &&
    assertedResult.reasonCode === 'SKILL_DECLARED_BUT_NOT_OBSERVED' &&
    observedResult.decision === 'ALLOW';
  failed ||= !pass;
  rows.push({
    skill,
    missing: missingResult.decision,
    asserted: assertedResult.decision,
    observed: observedResult.decision,
    result: pass ? 'PASS' : 'FAIL',
  });
}

console.table(rows);
console.log(`Miko replay: ${rows.filter((row) => row.result === 'PASS').length}/${rows.length} skill contracts passed`);
if (failed) process.exitCode = 1;
