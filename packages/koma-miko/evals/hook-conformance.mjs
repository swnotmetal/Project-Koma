import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function assertThat(condition, message) {
  if (!condition) throw new Error(message);
}

function runHook(bin, input, env, cwd) {
  const result = spawnSync(process.execPath, [bin], {
    cwd,
    env,
    input: JSON.stringify(input),
    encoding: 'utf8',
    shell: false,
  });
  if (result.error) throw result.error;
  assertThat(result.status === 0, `${bin} exited ${result.status}: ${result.stderr}`);
  return result.stdout ? JSON.parse(result.stdout) : undefined;
}

async function ledgerText(stateDir) {
  const names = (await readdir(stateDir)).filter((name) => name.endsWith('.jsonl'));
  assertThat(names.length === 1, `Expected one ledger, saw ${names.join(', ')}`);
  return readFile(join(stateDir, names[0]), 'utf8');
}

async function codexCase(root, stateDir) {
  const spec = {
    version: 1,
    specs: [{
      id: 'codex-conformance-v1',
      appliesWhen: { action: { tools: ['apply_patch'], pathPrefixes: ['src/ui'], argumentNames: ['path'] } },
      requires: { skills: ['product-design'] },
      actions: {
        allow: ['apply_patch', 'Read'],
        scope: { tools: ['apply_patch'], allowedPathPrefixes: ['src/ui'], argumentNames: ['path'] },
      },
      completion: { evidence: [{ type: 'artifact_changed', path: 'src/ui/Hero.tsx' }] },
      mode: 'enforce',
    }],
  };
  await writeFile(join(root, 'miko.json'), `${JSON.stringify(spec, null, 2)}\n`);
  const env = { ...process.env, MIKO_STATE_DIR: stateDir };
  const bin = join(packageRoot, 'dist', 'codex-hook-cli.js');
  const base = { session_id: 'codex-conformance', cwd: root };
  const patch = '*** Begin Patch\n*** Update File: src/ui/Hero.tsx\n@@\n-private-old\n+private-new\n*** End Patch';
  const edit = { ...base, hook_event_name: 'PreToolUse', tool_name: 'apply_patch', tool_input: { command: patch } };

  assertThat(runHook(bin, edit, env, root)?.hookSpecificOutput?.permissionDecision === 'deny',
    'Expected Codex edit denial');
  const read = {
    ...base,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: "Get-Content -Raw -LiteralPath '.agents/skills/product-design/SKILL.md'" },
  };
  assertThat(runHook(bin, read, env, root) === undefined, 'Expected exact Skill read remediation');
  runHook(bin, { ...read, hook_event_name: 'PostToolUse', tool_response: 'private-skill-body' }, env, root);
  assertThat(runHook(bin, edit, env, root) === undefined, 'Expected Codex edit after Skill evidence');
  runHook(bin, { ...edit, hook_event_name: 'PostToolUse', tool_response: 'Done!' }, env, root);
  assertThat(runHook(bin, { ...base, hook_event_name: 'Stop', stop_hook_active: false }, env, root) === undefined,
    'Expected Codex completion');

  const ledger = await ledgerText(stateDir);
  assertThat(ledger.includes('PREPARATION_EVIDENCE_MISSING'), 'Expected audited Codex denial');
  assertThat(ledger.includes('skill_loaded'), 'Expected Codex Skill evidence');
  assertThat(!ledger.includes('private-old') && !ledger.includes('private-new'), 'Codex patch leaked');
  assertThat(!ledger.includes('private-skill-body'), 'Codex tool response leaked');
  return { host: 'codex', steps: 6 };
}

async function geminiCase(root, stateDir) {
  const spec = {
    version: 1,
    specs: [{
      id: 'gemini-conformance-v1',
      appliesWhen: { action: { tools: ['replace'], pathPrefixes: ['src/ui'] } },
      requires: { skills: ['product-design'] },
      actions: {
        allow: ['activate_skill', 'replace'],
        scope: { tools: ['replace'], allowedPathPrefixes: ['src/ui'], argumentNames: ['file_path'] },
      },
      completion: { evidence: [{ type: 'artifact_changed', path: 'src/ui/Hero.tsx' }] },
      mode: 'enforce',
    }],
  };
  await writeFile(join(root, 'miko.json'), `${JSON.stringify(spec, null, 2)}\n`);
  const env = { ...process.env, MIKO_STATE_DIR: stateDir };
  const bin = join(packageRoot, 'dist', 'gemini-hook-cli.js');
  const base = { session_id: 'gemini-conformance', cwd: root, timestamp: new Date(0).toISOString() };
  const edit = {
    ...base,
    hook_event_name: 'BeforeTool',
    tool_name: 'replace',
    tool_input: { file_path: 'src/ui/Hero.tsx', old_string: 'private-old', new_string: 'private-new' },
  };

  assertThat(runHook(bin, edit, env, root)?.decision === 'deny', 'Expected Gemini edit denial');
  const skill = { ...base, hook_event_name: 'BeforeTool', tool_name: 'activate_skill', tool_input: { name: 'product-design' } };
  assertThat(runHook(bin, skill, env, root) === undefined, 'Expected activate_skill remediation');
  runHook(bin, { ...skill, hook_event_name: 'AfterTool', tool_response: { llmContent: 'private-skill-body' } }, env, root);
  assertThat(runHook(bin, edit, env, root) === undefined, 'Expected Gemini edit after Skill evidence');
  runHook(bin, { ...edit, hook_event_name: 'AfterTool', tool_response: { llmContent: 'private-tool-output' } }, env, root);
  assertThat(runHook(bin, { ...base, hook_event_name: 'AfterAgent', stop_hook_active: false }, env, root) === undefined,
    'Expected Gemini completion');

  const ledger = await ledgerText(stateDir);
  assertThat(ledger.includes('PREPARATION_EVIDENCE_MISSING'), 'Expected audited Gemini denial');
  assertThat(ledger.includes('skill_loaded'), 'Expected Gemini Skill evidence');
  assertThat(!ledger.includes('private-old') && !ledger.includes('private-new'), 'Gemini edit content leaked');
  assertThat(!ledger.includes('private-skill-body') && !ledger.includes('private-tool-output'),
    'Gemini tool response leaked');
  return { host: 'gemini', steps: 6 };
}

export async function runConformance(host) {
  assertThat(host === 'codex' || host === 'gemini', 'Host must be codex or gemini');
  const temporary = await mkdtemp(join(tmpdir(), `koma-miko-${host}-hook-`));
  const root = join(temporary, 'fixture');
  const stateDir = join(temporary, 'state');
  try {
    await mkdir(join(root, 'src', 'ui'), { recursive: true });
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(root, 'src', 'ui', 'Hero.tsx'), 'export const Hero = "Before";\n');
    return host === 'codex' ? codexCase(root, stateDir) : geminiCase(root, stateDir);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
