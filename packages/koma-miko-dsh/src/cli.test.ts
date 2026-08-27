import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDshProbeReport, formatDshProbeReport } from './cli';

describe('koma-miko-dsh probe', () => {
  it('performs a no-model package preflight', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'koma-miko-dsh-probe-'));
    try {
      mkdirSync(path.join(root, 'dist'), { recursive: true });
      mkdirSync(path.join(root, 'evals'), { recursive: true });
      writeFileSync(path.join(root, 'package.json'), JSON.stringify({
        name: 'koma-miko-dsh',
        version: '0.1.0-test',
        dependencies: { 'koma-miko': '0.1.0-test' },
      }));
      writeFileSync(path.join(root, 'dist', 'index.js'), '');
      writeFileSync(path.join(root, 'cordis.patch.yml'), '');
      writeFileSync(path.join(root, 'evals', 'live.mjs'), '');

      const report = createDshProbeReport(root);
      expect(report).toMatchObject({
        kind: 'dsh-adapter-preflight',
        status: 'READY',
        modelInvoked: false,
        projectModified: false,
        artifacts: { plugin: true, patch: true, liveProbe: true },
      });
      expect(formatDshProbeReport(report)).toContain('no model or API invoked');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
