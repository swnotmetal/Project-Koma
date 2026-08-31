import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DoctorHost } from './doctor.js';

export type InitHost = DoctorHost;

export interface InitOptions {
  host?: InitHost;
  skill?: string;
  pathPrefix?: string;
  mode?: 'review' | 'enforce';
  dryRun?: boolean;
}

export interface InitResult {
  projectRoot: string;
  host: InitHost;
  configPath: string;
  settingsPath: string;
  configCreated: boolean;
  settingsCreated: boolean;
  settingsChanged: boolean;
  gitignoreChanged: boolean;
  backupPath?: string;
  changes: string[];
}

type JsonObject = Record<string, unknown>;

const HOST_DETAILS: Record<InitHost, {
  settingsRelativePath: string;
  layout?: 'grouped' | 'flat';
  events: Record<string, { matcher?: string; hook: JsonObject }>;
}> = {
  claude: {
    settingsRelativePath: path.join('.claude', 'settings.json'),
    events: {
      UserPromptExpansion: {
        matcher: '',
        hook: {
          type: 'command',
          command: 'node',
          args: ['${CLAUDE_PROJECT_DIR}/node_modules/koma-miko/dist/claude-hook-cli.js'],
        },
      },
      PreToolUse: {
        matcher: 'Edit|Write',
        hook: {
          type: 'command',
          command: 'node',
          args: ['${CLAUDE_PROJECT_DIR}/node_modules/koma-miko/dist/claude-hook-cli.js'],
        },
      },
      PostToolUse: {
        matcher: 'Skill|Read|Edit|Write',
        hook: {
          type: 'command',
          command: 'node',
          args: ['${CLAUDE_PROJECT_DIR}/node_modules/koma-miko/dist/claude-hook-cli.js'],
        },
      },
      PostCompact: {
        hook: {
          type: 'command',
          command: 'node',
          args: ['${CLAUDE_PROJECT_DIR}/node_modules/koma-miko/dist/claude-hook-cli.js'],
        },
      },
      Stop: {
        hook: {
          type: 'command',
          command: 'node',
          args: ['${CLAUDE_PROJECT_DIR}/node_modules/koma-miko/dist/claude-hook-cli.js'],
        },
      },
    },
  },
  codex: {
    settingsRelativePath: path.join('.codex', 'hooks.json'),
    events: Object.fromEntries([
      'SessionStart', 'PreToolUse', 'PostToolUse', 'PostCompact', 'Stop',
    ].map((event) => [event, {
      hook: {
        type: 'command',
        command: 'node ./node_modules/koma-miko/dist/codex-hook-cli.js',
        timeout: 10,
        statusMessage: 'Miko is checking the Agent Spec',
      },
    }])),
  },
  gemini: {
    settingsRelativePath: path.join('.gemini', 'settings.json'),
    events: Object.fromEntries([
      'BeforeTool', 'AfterTool', 'PreCompress', 'AfterAgent',
    ].map((event) => [event, {
      matcher: '*',
      hook: {
        name: 'koma-miko',
        type: 'command',
        command: 'node',
        args: ['./node_modules/koma-miko/dist/gemini-hook-cli.js'],
        timeout: 10000,
      },
    }])),
  },
  vscode: {
    settingsRelativePath: path.join('.github', 'hooks', 'miko.json'),
    layout: 'flat',
    events: Object.fromEntries([
      'SessionStart', 'PreToolUse', 'PostToolUse', 'PreCompact', 'Stop',
    ].map((event) => [event, {
      hook: {
        type: 'command',
        command: 'node ./node_modules/koma-miko/dist/vscode-hook-cli.js',
        cwd: '.',
        timeout: 10,
      },
    }])),
  },
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readObject(pathname: string): JsonObject | undefined {
  if (!existsSync(pathname)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(pathname, 'utf8')) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'invalid JSON';
    throw new Error(`Cannot parse ${pathname}: ${reason}`);
  }
  if (!isObject(parsed)) throw new Error(`${pathname} must contain a JSON object.`);
  return parsed;
}

function starterTools(host: InitHost): string[] {
  if (host === 'codex') return ['apply_patch', 'Edit', 'Write'];
  if (host === 'gemini') return ['replace', 'write_file'];
  if (host === 'vscode') {
    return [
      'apply_patch',
      'create_file',
      'createFile',
      'editFiles',
      'insert_edit_into_file',
      'replace_string_in_file',
    ];
  }
  return ['Edit', 'Write'];
}

function starterConfig(
  host: InitHost,
  skill: string,
  pathPrefix: string,
  mode: 'review' | 'enforce',
): JsonObject {
  return {
    $schema: './node_modules/koma-miko/schema/miko.schema.json',
    version: 1,
    specs: [{
      id: 'example-ui-change',
      appliesWhen: {
        action: {
          tools: starterTools(host),
          pathPrefixes: [pathPrefix],
          ...(host === 'vscode' ? { argumentNames: ['filePath'] } : {}),
        },
      },
      requires: {
        skills: [{ name: skill, reloadAfterCompaction: true }],
      },
      mode,
    }],
  };
}

function hookContainsMiko(value: unknown, host: InitHost): boolean {
  const serialized = JSON.stringify(value);
  const needles = host === 'claude'
    ? ['koma-miko-claude-hook', 'claude-hook-cli']
    : host === 'codex'
      ? ['koma-miko-codex-hook', 'codex-hook-cli']
      : host === 'gemini'
        ? ['koma-miko-gemini-hook', 'gemini-hook-cli']
        : ['koma-miko-vscode-hook', 'vscode-hook-cli'];
  return needles.some((needle) => serialized.includes(needle));
}

function matcherCovers(existing: unknown, requested: string | undefined): boolean {
  if (requested === undefined) return true;
  if (existing === undefined) return true;
  if (typeof existing !== 'string') return false;
  return existing === requested || existing === '*' || existing === '';
}

function mergeHooks(settings: JsonObject, host: InitHost): { settings: JsonObject; changed: boolean } {
  const details = HOST_DETAILS[host];
  const next: JsonObject = { ...settings };
  const rawHooks = next.hooks;
  if (rawHooks !== undefined && !isObject(rawHooks)) {
    throw new Error('The host settings "hooks" property must be a JSON object.');
  }
  const hooks: JsonObject = { ...(rawHooks as JsonObject | undefined) };
  let changed = false;

  for (const [event, definition] of Object.entries(details.events)) {
    const rawGroups = hooks[event];
    if (rawGroups !== undefined && !Array.isArray(rawGroups)) {
      throw new Error(`The host settings hook event "${event}" must be an array.`);
    }
    const groups = [...(rawGroups as unknown[] | undefined ?? [])];
    const alreadyConfigured = groups.some((group) => {
      if (!isObject(group) || !hookContainsMiko(group, host)) return false;
      return matcherCovers(group.matcher, definition.matcher);
    });
    if (alreadyConfigured) continue;
    groups.push(details.layout === 'flat'
      ? definition.hook
      : {
          ...(definition.matcher === undefined ? {} : { matcher: definition.matcher }),
          hooks: [definition.hook],
        });
    hooks[event] = groups;
    changed = true;
  }

  if (changed || rawHooks === undefined) next.hooks = hooks;
  return { settings: next, changed };
}

function backupPath(pathname: string): string {
  const first = `${pathname}.miko.bak`;
  if (!existsSync(first)) return first;
  for (let index = 1; ; index += 1) {
    const candidate = `${first}.${index}`;
    if (!existsSync(candidate)) return candidate;
  }
}

function writeJson(pathname: string, value: JsonObject): void {
  mkdirSync(path.dirname(pathname), { recursive: true });
  writeFileSync(pathname, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function withTrailingNewline(value: string): string {
  return value.length === 0 || value.endsWith('\n') ? value : `${value}\n`;
}

function addGitignoreEntry(value: string): { value: string; changed: boolean } {
  const hasEntry = value.split(/\r?\n/).some((line) => {
    const normalized = line.trim().replace(/\\/g, '/');
    return normalized === '.miko/' || normalized === '.miko/state/' || normalized === '/.miko/state/';
  });
  if (hasEntry) return { value, changed: false };
  const prefix = withTrailingNewline(value);
  return {
    value: `${prefix}${prefix.length > 1 ? '\n' : ''}# Miko local session state\n.miko/state/\n`,
    changed: true,
  };
}

export function initProject(projectRootInput: string, options: InitOptions = {}): InitResult {
  const projectRoot = path.resolve(projectRootInput);
  const host = options.host ?? 'claude';
  const details = HOST_DETAILS[host];
  if (!details) throw new Error(`Unsupported Miko host: ${host}`);
  const skill = options.skill ?? 'frontend-design';
  const pathPrefix = options.pathPrefix ?? 'src';
  const mode = options.mode ?? 'review';
  if (!skill.trim()) throw new Error('--skill must not be empty.');
  if (!pathPrefix.trim()) throw new Error('--path must not be empty.');

  const configPath = path.join(projectRoot, 'miko.json');
  const settingsPath = path.join(projectRoot, details.settingsRelativePath);
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const existingSettings = readObject(settingsPath);
  const merged = mergeHooks(existingSettings ?? {}, host);
  const existingGitignore = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, 'utf8')
    : '';
  const ignored = addGitignoreEntry(existingGitignore);
  const configCreated = !existsSync(configPath);
  const settingsCreated = existingSettings === undefined;
  const settingsChanged = settingsCreated || merged.changed;
  const changes: string[] = [];
  if (configCreated) changes.push('create miko.json');
  if (settingsChanged) changes.push(`${settingsCreated ? 'create' : 'update'} ${path.relative(projectRoot, settingsPath).replace(/\\/g, '/')}`);
  if (ignored.changed) changes.push('update .gitignore');

  let savedBackup: string | undefined;
  if (!options.dryRun) {
    if (configCreated) writeJson(configPath, starterConfig(host, skill, pathPrefix, mode));
    if (settingsChanged) {
      if (!settingsCreated) {
        savedBackup = backupPath(settingsPath);
        writeFileSync(savedBackup, readFileSync(settingsPath));
      }
      writeJson(settingsPath, merged.settings);
    }
    if (ignored.changed) writeFileSync(gitignorePath, ignored.value, 'utf8');
  }

  return {
    projectRoot,
    host,
    configPath,
    settingsPath,
    configCreated,
    settingsCreated,
    settingsChanged,
    gitignoreChanged: ignored.changed,
    ...(savedBackup ? { backupPath: savedBackup } : {}),
    changes,
  };
}
