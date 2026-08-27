import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { loadMikoConfig } from './config.js';
import type { LoadedMikoConfig } from './config.js';
import type { SkillRequirementInput } from './index.js';

export type DoctorStatus = 'pass' | 'warn' | 'fail';
export type DoctorHost = 'claude' | 'codex' | 'gemini';

export interface DoctorCheck {
  id: 'config' | 'skills' | 'hooks' | 'state-ignore';
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

function hostSkillsDirectory(projectRoot: string, host: DoctorHost): string {
  const directory = host === 'codex' ? '.agents' : host === 'gemini' ? '.gemini' : '.claude';
  return path.join(projectRoot, directory, 'skills');
}

function projectSkills(projectRoot: string, host: DoctorHost): Set<string> {
  const skillsRoot = hostSkillsDirectory(projectRoot, host);
  if (!existsSync(skillsRoot)) return new Set();
  return new Set(readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() &&
      existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
    .map((entry) => entry.name));
}

function settingsWithMiko(
  projectRoot: string,
  host: DoctorHost,
): Array<{ pathname: string; value: unknown }> {
  const candidates = host === 'claude'
    ? [
        path.join(projectRoot, '.claude', 'settings.json'),
        path.join(projectRoot, '.claude', 'settings.local.json'),
      ]
    : [path.join(projectRoot, host === 'codex' ? '.codex/hooks.json' : '.gemini/settings.json')];
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
      : ['gemini-hook-cli', 'koma-miko-gemini-hook'];
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
  const skillsRoot = path.relative(projectRoot, hostSkillsDirectory(projectRoot, host)).replace(/\\/g, '/');
  const missingSkills = required.filter((name) => !discovered.has(name));
  checks.push({
    id: 'skills',
    status: missingSkills.length === 0 ? 'pass' : 'warn',
    message: missingSkills.length === 0
      ? `${required.length} required project Skill(s) discovered.`
      : `Required Skills not found under ${skillsRoot}: ${missingSkills.join(', ')}.`,
  });

  try {
    const settings = settingsWithMiko(projectRoot, host);
    const foundEvents = hookEvents(settings, host);
    const requiredEvents = host === 'claude'
      ? ['PreToolUse', 'PostToolUse']
      : host === 'codex'
        ? ['PreToolUse', 'PostToolUse']
        : ['BeforeTool', 'AfterTool'];
    if (requiresPostCompact(config)) requiredEvents.push(host === 'gemini' ? 'PreCompress' : 'PostCompact');
    const missingEvents = requiredEvents.filter((event) => !foundEvents.has(event));
    checks.push({
      id: 'hooks',
      status: missingEvents.length === 0 ? 'pass' : 'warn',
      message: missingEvents.length === 0
        ? `Miko ${host} Hooks found for ${requiredEvents.join(', ')}.`
        : `Miko ${host} Hook coverage missing: ${missingEvents.join(', ')}.`,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown settings error';
    checks.push({ id: 'hooks', status: 'fail', message: `Cannot inspect ${host} settings: ${reason}` });
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
