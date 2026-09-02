import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { initProject } from './init';

function temporaryProject(): string {
  return mkdtempSync(path.join(tmpdir(), 'miko-init-'));
}

function readJson(pathname: string): Record<string, any> {
  return JSON.parse(readFileSync(pathname, 'utf8')) as Record<string, any>;
}

describe('miko init', () => {
  it('creates a safe Claude starter config, hooks, and Git ignore entry', () => {
    const project = temporaryProject();
    try {
      const result = initProject(project, {
        skill: 'my-design-skill',
        pathPrefix: 'app',
      });

      expect(result.configCreated).toBe(true);
      expect(result.settingsCreated).toBe(true);
      expect(result.gitignoreChanged).toBe(true);
      expect(readJson(path.join(project, 'miko.json')).specs[0].mode).toBe('guided');
      expect(readJson(path.join(project, 'miko.json')).specs[0].requires.skills[0].name)
        .toBe('my-design-skill');
      const settings = readJson(path.join(project, '.claude', 'settings.json'));
      expect(settings.hooks.SessionStart).toHaveLength(1);
      expect(settings.hooks.PreToolUse).toHaveLength(1);
      expect(settings.hooks.PostToolUse[0].matcher).toContain('AskUserQuestion');
      expect(settings.hooks.PostCompact).toHaveLength(1);
      expect(readFileSync(path.join(project, '.gitignore'), 'utf8')).toContain('.miko/state/');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('preserves existing Claude settings, backs them up, and is idempotent', () => {
    const project = temporaryProject();
    try {
      mkdirSync(path.join(project, '.claude'), { recursive: true });
      writeFileSync(path.join(project, '.claude', 'settings.json'), JSON.stringify({
        permissions: { allow: ['Read'] },
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'custom-check' }] }],
        },
      }));

      const first = initProject(project);
      expect(first.settingsCreated).toBe(false);
      expect(first.backupPath).toBeDefined();
      expect(existsSync(first.backupPath!)).toBe(true);
      const settings = readJson(path.join(project, '.claude', 'settings.json'));
      expect(settings.permissions.allow).toEqual(['Read']);
      expect(settings.hooks.PreToolUse).toHaveLength(2);

      const second = initProject(project);
      expect(second.changes).toEqual([]);
      expect(second.backupPath).toBeUndefined();
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('supports Codex, Gemini, and VS Code hook layouts', () => {
    for (const host of ['codex', 'gemini', 'vscode'] as const) {
      const project = temporaryProject();
      try {
        const result = initProject(project, { host });
        const settings = readJson(result.settingsPath);
        expect(Object.keys(settings.hooks).length).toBeGreaterThan(0);
        expect(JSON.stringify(settings)).toContain(`${host}-hook-cli.js`);
        if (host === 'codex') {
          expect(readJson(path.join(project, 'miko.json')).specs[0].mode).toBe('enforce');
          expect(settings.hooks.PreToolUse[0]).not.toHaveProperty('matcher');
          expect(settings.hooks.PreToolUse[0].hooks[0]).toMatchObject({
            type: 'command',
            command: 'node ./node_modules/koma-miko/dist/codex-hook-cli.js',
            timeout: 10,
          });
          expect(settings.hooks.PreToolUse[0].hooks[0]).not.toHaveProperty('args');
        } else if (host === 'vscode') {
          expect(readJson(path.join(project, 'miko.json')).specs[0].mode).toBe('guided');
          expect(result.settingsPath.replace(/\\/g, '/')).toContain('.github/hooks/miko.json');
          expect(settings.hooks.PreToolUse[0]).toMatchObject({ type: 'command' });
          expect(settings.hooks.PreToolUse[0]).not.toHaveProperty('hooks');
          expect(readJson(path.join(project, 'miko.json')).specs[0].appliesWhen.action.tools)
            .toContain('replace_string_in_file');
        }
      } finally {
        rmSync(project, { recursive: true, force: true });
      }
    }
  });

  it('allows an explicit Codex review spec while keeping enforce as the default', () => {
    const project = temporaryProject();
    try {
      initProject(project, { host: 'codex', mode: 'review' });
      expect(readJson(path.join(project, 'miko.json')).specs[0].mode).toBe('review');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('does not write files during a dry run', () => {
    const project = temporaryProject();
    try {
      const result = initProject(project, { dryRun: true });
      expect(result.changes).toHaveLength(3);
      expect(existsSync(path.join(project, 'miko.json'))).toBe(false);
      expect(existsSync(path.join(project, '.claude'))).toBe(false);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('refuses malformed host settings before creating a starter config', () => {
    const project = temporaryProject();
    try {
      mkdirSync(path.join(project, '.claude'), { recursive: true });
      writeFileSync(path.join(project, '.claude', 'settings.json'), '{not json');
      expect(() => initProject(project)).toThrow(/Cannot parse/);
      expect(existsSync(path.join(project, 'miko.json'))).toBe(false);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});
