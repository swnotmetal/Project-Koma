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
      expect(report.checks.every((check) => check.status === 'pass')).toBe(true);
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
});
