import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { doctorProject, formatDoctorReport } from './doctor';

function fixture(): string {
  const project = mkdtempSync(path.join(tmpdir(), 'miko-doctor-'));
  mkdirSync(path.join(project, '.claude', 'skills', 'product-design'), { recursive: true });
  writeFileSync(path.join(project, '.claude', 'skills', 'product-design', 'SKILL.md'), '# Product design');
  writeFileSync(path.join(project, 'miko.json'), JSON.stringify({
    version: 1,
    specs: [{
      id: 'ui-checkpoint',
      appliesWhen: { action: { tools: ['Edit'], pathPrefixes: ['src/ui'] } },
      requires: { skills: [{ name: 'product-design', reloadAfterCompaction: true }] },
      mode: 'enforce',
    }],
  }));
  const hook = {
    type: 'command',
    command: 'node',
    args: ['node_modules/koma-miko/dist/claude-hook-cli.js'],
  };
  writeFileSync(path.join(project, '.claude', 'settings.json'), JSON.stringify({
    hooks: {
      PreToolUse: [{ matcher: 'Edit', hooks: [hook] }],
      PostToolUse: [{ matcher: 'Skill|Edit', hooks: [hook] }],
      PostCompact: [{ hooks: [hook] }],
    },
  }));
  writeFileSync(path.join(project, '.gitignore'), '.miko/state/\n');
  return project;
}

describe('miko doctor', () => {
  it('passes a complete local Claude project without network access', () => {
    const project = fixture();
    try {
      const report = doctorProject(project);

      expect(report.ok).toBe(true);
      expect(report.specCount).toBe(1);
      expect(report.checks.every((check) => check.status === 'pass')).toBe(true);
      expect(formatDoctorReport(report)).toContain('[PASS] Valid miko.json');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('warns about missing Skills, Hooks, and ignore without treating them as parse failures', () => {
    const project = mkdtempSync(path.join(tmpdir(), 'miko-doctor-warn-'));
    try {
      writeFileSync(path.join(project, 'miko.json'), JSON.stringify({
        version: 1,
        specs: [{
          id: 'ui-checkpoint',
          appliesWhen: { taskTags: ['ui'] },
          requires: { skills: ['product-design'] },
        }],
      }));
      const report = doctorProject(project);

      expect(report.ok).toBe(true);
      expect(report.checks.filter((check) => check.status === 'warn')).toHaveLength(3);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('fails safely when the Agent Spec config is invalid', () => {
    const project = mkdtempSync(path.join(tmpdir(), 'miko-doctor-invalid-'));
    try {
      writeFileSync(path.join(project, 'miko.json'), '{"version":2,"specs":[]}');

      const report = doctorProject(project);
      expect(report.ok).toBe(false);
      expect(report.checks[0].status).toBe('fail');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('checks Codex Skills and Hook coverage when the host is selected', () => {
    const project = mkdtempSync(path.join(tmpdir(), 'miko-doctor-codex-'));
    try {
      mkdirSync(path.join(project, '.agents', 'skills', 'product-design'), { recursive: true });
      mkdirSync(path.join(project, '.codex'), { recursive: true });
      writeFileSync(path.join(project, '.agents', 'skills', 'product-design', 'SKILL.md'), '# Product design');
      writeFileSync(path.join(project, 'miko.json'), JSON.stringify({
        version: 1,
        specs: [{
          id: 'codex-check',
          appliesWhen: { action: { tools: ['apply_patch'], pathPrefixes: ['src'] } },
          requires: { skills: ['product-design'] },
          mode: 'enforce',
        }],
      }));
      writeFileSync(path.join(project, '.codex', 'hooks.json'), JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ type: 'command', command: 'koma-miko-codex-hook' }] }],
          PostToolUse: [{ hooks: [{ type: 'command', command: 'koma-miko-codex-hook' }] }],
        },
      }));
      writeFileSync(path.join(project, '.gitignore'), '.miko/state/\n');

      const report = doctorProject(project, { host: 'codex' });
      expect(report.host).toBe('codex');
      expect(report.ok).toBe(true);
      expect(report.checks.find((check) => check.id === 'hooks')).toMatchObject({ status: 'pass' });
      expect(report.checks.find((check) => check.id === 'activation')).toMatchObject({
        status: 'warn',
        message: expect.stringContaining('no live Miko runtime'),
      });

      mkdirSync(path.join(project, '.miko', 'state'), { recursive: true });
      writeFileSync(
        path.join(project, '.miko', 'state', 'codex-test.jsonl'),
        `${JSON.stringify({ type: 'task_started', sessionId: 'live', taskId: 'live' })}\n`,
      );
      const active = doctorProject(project, { host: 'codex' });
      expect(active.checks.find((check) => check.id === 'activation')).toMatchObject({
        status: 'pass',
        message: expect.stringContaining('live Codex SessionStart'),
      });
      expect(active.checks.every((check) => check.status === 'pass')).toBe(true);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('warns when a Codex Agent Spec uses degraded review mode', () => {
    const project = mkdtempSync(path.join(tmpdir(), 'miko-doctor-codex-review-'));
    try {
      writeFileSync(path.join(project, 'miko.json'), JSON.stringify({
        version: 1,
        specs: [{
          id: 'codex-review',
          appliesWhen: { action: { tools: ['apply_patch'], pathPrefixes: ['src'] } },
          mode: 'review',
        }],
      }));

      const report = doctorProject(project, { host: 'codex' });
      expect(report.checks.find((check) => check.id === 'config')).toMatchObject({
        status: 'warn',
        message: expect.stringContaining('REVIEW pauses the call as deny'),
      });
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('warns when a Codex Agent Spec uses guided mode with degraded user decisions', () => {
    const project = mkdtempSync(path.join(tmpdir(), 'miko-doctor-codex-guided-'));
    try {
      writeFileSync(path.join(project, 'miko.json'), JSON.stringify({
        version: 1,
        specs: [{
          id: 'codex-guided',
          appliesWhen: { action: { tools: ['apply_patch'], pathPrefixes: ['src'] } },
          mode: 'guided',
        }],
      }));

      const report = doctorProject(project, { host: 'codex' });
      expect(report.checks.find((check) => check.id === 'config')).toMatchObject({
        status: 'warn',
        message: expect.stringContaining('guided or review mode'),
      });
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('does not mistake an unrelated Codex state file for a live Hook heartbeat', () => {
    const project = mkdtempSync(path.join(tmpdir(), 'miko-doctor-codex-state-'));
    try {
      mkdirSync(path.join(project, '.miko', 'state'), { recursive: true });
      writeFileSync(path.join(project, '.miko', 'state', 'codex-test.jsonl'),
        `${JSON.stringify({ type: 'evidence_recorded', taskId: 'not-live' })}\n`);
      writeFileSync(path.join(project, 'miko.json'), JSON.stringify({
        version: 1,
        specs: [{ id: 'state-check', appliesWhen: { taskTags: ['state'] }, requires: {} }],
      }));

      const report = doctorProject(project, { host: 'codex' });
      expect(report.checks.find((check) => check.id === 'activation')).toMatchObject({
        status: 'warn',
        message: expect.stringContaining('no live SessionStart heartbeat'),
      });
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('checks Gemini Skills and compaction Hook coverage when the host is selected', () => {
    const project = mkdtempSync(path.join(tmpdir(), 'miko-doctor-gemini-'));
    try {
      mkdirSync(path.join(project, '.gemini', 'skills', 'product-design'), { recursive: true });
      writeFileSync(path.join(project, '.gemini', 'skills', 'product-design', 'SKILL.md'), '# Product design');
      writeFileSync(path.join(project, 'miko.json'), JSON.stringify({
        version: 1,
        specs: [{
          id: 'gemini-check',
          appliesWhen: { action: { tools: ['replace'], pathPrefixes: ['src'] } },
          requires: { skills: [{ name: 'product-design', reloadAfterCompaction: true }] },
        }],
      }));
      writeFileSync(path.join(project, '.gemini', 'settings.json'), JSON.stringify({
        hooks: {
          BeforeTool: [{ hooks: [{ type: 'command', command: 'koma-miko-gemini-hook' }] }],
          AfterTool: [{ hooks: [{ type: 'command', command: 'koma-miko-gemini-hook' }] }],
          PreCompress: [{ hooks: [{ type: 'command', command: 'koma-miko-gemini-hook' }] }],
        },
      }));
      writeFileSync(path.join(project, '.gitignore'), '.miko/state/\n');

      const report = doctorProject(project, { host: 'gemini' });
      expect(report.host).toBe('gemini');
      expect(report.ok).toBe(true);
      expect(report.checks.every((check) => check.status === 'pass')).toBe(true);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('checks VS Code Copilot Skills across supported roots and flat Hook files', () => {
    const project = mkdtempSync(path.join(tmpdir(), 'miko-doctor-vscode-'));
    try {
      mkdirSync(path.join(project, '.github', 'skills', 'product-design'), { recursive: true });
      mkdirSync(path.join(project, '.github', 'hooks'), { recursive: true });
      writeFileSync(
        path.join(project, '.github', 'skills', 'product-design', 'SKILL.md'),
        '# Product design',
      );
      writeFileSync(path.join(project, 'miko.json'), JSON.stringify({
        version: 1,
        specs: [{
          id: 'vscode-check',
          appliesWhen: {
            action: {
              tools: ['replace_string_in_file'],
              pathPrefixes: ['src'],
              argumentNames: ['filePath'],
            },
          },
          requires: { skills: [{ name: 'product-design', reloadAfterCompaction: true }] },
        }],
      }));
      const hook = {
        type: 'command',
        command: 'node ./node_modules/koma-miko/dist/vscode-hook-cli.js',
      };
      writeFileSync(path.join(project, '.github', 'hooks', 'miko.json'), JSON.stringify({
        hooks: {
          PreToolUse: [hook],
          PostToolUse: [hook],
          PreCompact: [hook],
        },
      }));
      writeFileSync(path.join(project, '.gitignore'), '.miko/state/\n');

      const report = doctorProject(project, { host: 'vscode' });
      expect(report.host).toBe('vscode');
      expect(report.checks.every((check) => check.status === 'pass')).toBe(true);

      mkdirSync(path.join(project, '.claude'), { recursive: true });
      writeFileSync(path.join(project, '.claude', 'settings.json'), JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ command: 'koma-miko-claude-hook' }] }],
        },
      }));
      const conflicted = doctorProject(project, { host: 'vscode' });
      expect(conflicted.checks.find((check) => check.id === 'hooks')).toMatchObject({
        status: 'warn',
      });
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});
