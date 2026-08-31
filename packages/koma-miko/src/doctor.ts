import { closeSync, existsSync, openSync, readFileSync, readdirSync, readSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadMikoConfig } from './config.js';
import type { LoadedMikoConfig } from './config.js';
import type { SkillRequirementInput } from './index.js';

export type DoctorStatus = 'pass' | 'warn' | 'fail';
export type DoctorHost = 'claude' | 'codex' | 'gemini' | 'vscode';

export interface DoctorCheck {
  id: 'config' | 'skills' | 'hooks' | 'activation' | 'state-ignore';
  status: DoctorStatus;
  message: string;
}

export interface DoctorReport {
  ok: boolean;
  projectRoot: string;
  host: DoctorHost;
  configPath?: string;
  specCount: number;
  checks: DoctorCheck[];
}

export interface DoctorOptions {
  /** Select the host-specific Skill and Hook conventions to inspect. */
  host?: DoctorHost;
}

function skillName(requirement: SkillRequirementInput): string {
  return typeof requirement === 'string' ? requirement : requirement.name;
}

function requiredSkills(config: LoadedMikoConfig): string[] {
  return [...new Set(config.contracts.flatMap((contract) =>
    (contract.requires?.skills ?? []).map(skillName),
  ))].sort();
}

function requiresPostCompact(config: LoadedMikoConfig): boolean {
  return config.contracts.some((contract) =>
    (contract.requires?.skills ?? []).some((requirement) =>
      typeof requirement !== 'string' && requirement.reloadAfterCompaction === true,
    ),
  );
}

function hostSkillsDirectories(projectRoot: string, host: DoctorHost): string[] {
  if (host === 'vscode') {
    return ['.github', '.agents', '.claude'].map((directory) =>
      path.join(projectRoot, directory, 'skills'),
    );
  }
  const directory = host === 'codex' ? '.agents' : host === 'gemini' ? '.gemini' : '.claude';
  return [path.join(projectRoot, directory, 'skills')];
}

function projectSkills(projectRoot: string, host: DoctorHost): Set<string> {
  const discovered = new Set<string>();
  for (const skillsRoot of hostSkillsDirectories(projectRoot, host)) {
    if (!existsSync(skillsRoot)) continue;
    for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(path.join(skillsRoot, entry.name, 'SKILL.md'))) {
        discovered.add(entry.name);
      }
    }
  }
  return discovered;
}

function settingsWithMiko(
  projectRoot: string,
  host: DoctorHost,
): Array<{ pathname: string; value: unknown }> {
  let candidates: string[];
  if (host === 'claude') {
    candidates = [
        path.join(projectRoot, '.claude', 'settings.json'),
        path.join(projectRoot, '.claude', 'settings.local.json'),
      ];
  } else if (host === 'vscode') {
    const hooksRoot = path.join(projectRoot, '.github', 'hooks');
    candidates = existsSync(hooksRoot)
      ? readdirSync(hooksRoot, { withFileTypes: true })
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map((entry) => path.join(hooksRoot, entry.name))
      : [];
  } else {
    candidates = [path.join(projectRoot, host === 'codex' ? '.codex/hooks.json' : '.gemini/settings.json')];
  }
  return candidates.filter(existsSync).map((pathname) => ({
    pathname,
    value: JSON.parse(readFileSync(pathname, 'utf8')) as unknown,
  }));
}

function hookEvents(
  settings: Array<{ pathname: string; value: unknown }>,
  host: DoctorHost,
): Set<string> {
  const found = new Set<string>();
  const needles = host === 'claude'
    ? ['claude-hook-cli', 'koma-miko-claude-hook']
    : host === 'codex'
      ? ['codex-hook-cli', 'koma-miko-codex-hook']
      : host === 'gemini'
        ? ['gemini-hook-cli', 'koma-miko-gemini-hook']
        : ['vscode-hook-cli', 'koma-miko-vscode-hook'];
  for (const { value } of settings) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    const hooks = (value as Record<string, unknown>).hooks;
    if (typeof hooks !== 'object' || hooks === null || Array.isArray(hooks)) continue;
    for (const [event, groups] of Object.entries(hooks as Record<string, unknown>)) {
      const serialized = JSON.stringify(groups);
      if (needles.some((needle) => serialized.includes(needle))) {
        found.add(event);
      }
    }
  }
  return found;
}

function stateIsIgnored(projectRoot: string): boolean {
  const ignorePath = path.join(projectRoot, '.gitignore');
  if (!existsSync(ignorePath)) return false;
  return readFileSync(ignorePath, 'utf8').split(/\r?\n/).some((line) => {
    const value = line.trim().replace(/\\/g, '/');
    return value === '.miko/' || value === '.miko/state/' || value === '/.miko/state/';
  });
}

function hasCodexTaskStarted(pathname: string): boolean {
  const size = statSync(pathname).size;
  if (size === 0) return false;
  const buffer = Buffer.alloc(Math.min(size, 4096));
  const file = openSync(pathname, 'r');
  try {
    readSync(file, buffer, 0, buffer.length, 0);
  } finally {
    closeSync(file);
  }
  return /"type"\s*:\s*"task_started"/.test(buffer.toString('utf8'));
}

function codexActivationCheck(projectRoot: string, hookPaths: string[]): DoctorCheck {
  const stateRoot = path.join(projectRoot, '.miko', 'state');
  const recovery = 'Start Codex CLI in this project, run /hooks, trust the five Miko Hooks, run one turn, then rerun doctor. Codex Desktop-only activation remains Preview.';
  if (!existsSync(stateRoot)) {
    return {
      id: 'activation',
      status: 'warn',
      message: `Codex Hooks are configured, but no live Miko runtime has been observed. ${recovery}`,
    };
  }

  const heartbeats = readdirSync(stateRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^codex-.*\.jsonl$/i.test(entry.name))
    .map((entry) => path.join(stateRoot, entry.name))
    .filter((pathname) => {
      try {
        return hasCodexTaskStarted(pathname);
      } catch {
        return false;
      }
    })
    .map((pathname) => ({ pathname, modified: statSync(pathname).mtimeMs }))
    .sort((left, right) => right.modified - left.modified);

  if (heartbeats.length === 0) {
    return {
      id: 'activation',
      status: 'warn',
      message: `Codex Hooks are configured, but no live SessionStart heartbeat was found. ${recovery}`,
    };
  }

  const newestHookWrite = Math.max(0, ...hookPaths.map((pathname) => statSync(pathname).mtimeMs));
  if (heartbeats[0].modified < newestHookWrite) {
    return {
      id: 'activation',
      status: 'warn',
      message: `A Codex runtime heartbeat exists, but the Hook config changed afterward. Trust may need renewed review. ${recovery}`,
    };
  }

  return {
    id: 'activation',
    status: 'pass',
    message: 'A live Codex SessionStart reached Miko after the current Hook config was written. This proves activation for at least one session, not permanent trust.',
  };
}

export function doctorProject(projectRootInput: string, options: DoctorOptions = {}): DoctorReport {
  const projectRoot = path.resolve(projectRootInput);
  const host = options.host ?? 'claude';
  const checks: DoctorCheck[] = [];
  let config: LoadedMikoConfig;

  try {
    config = loadMikoConfig(projectRoot);
    checks.push({
      id: 'config',
      status: config.format === 'agent-spec' ? 'pass' : 'warn',
      message: config.format === 'agent-spec'
        ? `Valid miko.json with ${config.contracts.length} Agent Spec(s).`
        : `Valid legacy config with ${config.contracts.length} contract(s); migrate to miko.json.`,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown config error';
    checks.push({ id: 'config', status: 'fail', message: `Cannot load Miko config: ${reason}` });
    return { ok: false, projectRoot, host, specCount: 0, checks };
  }

  const required = requiredSkills(config);
  const discovered = projectSkills(projectRoot, host);
  const skillsRoots = hostSkillsDirectories(projectRoot, host)
    .map((directory) => path.relative(projectRoot, directory).replace(/\\/g, '/'));
  const missingSkills = required.filter((name) => !discovered.has(name));
  checks.push({
    id: 'skills',
    status: missingSkills.length === 0 ? 'pass' : 'warn',
    message: missingSkills.length === 0
      ? `${required.length} required project Skill(s) discovered.`
      : `Required Skills not found under ${skillsRoots.join(', ')}: ${missingSkills.join(', ')}.`,
  });

  let inspectedHookPaths: string[] = [];
  try {
    const settings = settingsWithMiko(projectRoot, host);
    inspectedHookPaths = settings.map(({ pathname }) => pathname);
    const foundEvents = hookEvents(settings, host);
    const requiredEvents = host === 'claude' || host === 'codex' || host === 'vscode'
      ? ['PreToolUse', 'PostToolUse']
      : ['BeforeTool', 'AfterTool'];
    if (requiresPostCompact(config)) {
      requiredEvents.push(host === 'gemini' ? 'PreCompress' : host === 'vscode' ? 'PreCompact' : 'PostCompact');
    }
    const missingEvents = requiredEvents.filter((event) => !foundEvents.has(event));
    const claudeConflict = host === 'vscode' &&
      hookEvents(settingsWithMiko(projectRoot, 'claude'), 'claude').size > 0;
    checks.push({
      id: 'hooks',
      status: missingEvents.length === 0 && !claudeConflict ? 'pass' : 'warn',
      message: claudeConflict
        ? 'VS Code also discovers a Miko Claude Hook. Disable the Claude hook location in chat.hookFilesLocations to avoid duplicate enforcement.'
        : missingEvents.length === 0
        ? `Miko ${host} Hooks found for ${requiredEvents.join(', ')}.`
        : `Miko ${host} Hook coverage missing: ${missingEvents.join(', ')}.`,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown settings error';
    checks.push({ id: 'hooks', status: 'fail', message: `Cannot inspect ${host} settings: ${reason}` });
  }

  if (host === 'codex') {
    try {
      checks.push(codexActivationCheck(projectRoot, inspectedHookPaths));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown activation error';
      checks.push({
        id: 'activation',
        status: 'warn',
        message: `Cannot verify live Codex Hook activation: ${reason}`,
      });
    }
  }

  checks.push({
    id: 'state-ignore',
    status: stateIsIgnored(projectRoot) ? 'pass' : 'warn',
    message: stateIsIgnored(projectRoot)
      ? '.miko/state/ is ignored by Git.'
      : 'Add .miko/state/ to .gitignore before running the adapter.',
  });

  return {
    ok: checks.every((check) => check.status !== 'fail'),
    projectRoot,
    host,
    configPath: config.path,
    specCount: config.contracts.length,
    checks,
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  const marker: Record<DoctorStatus, string> = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' };
  return [
    `Miko Doctor (${report.host}) — ${report.projectRoot}`,
    ...report.checks.map((check) => `[${marker[check.status]}] ${check.message}`),
  ].join('\n');
}
