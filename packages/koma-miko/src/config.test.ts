import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMikoConfig, parseMikoConfig, resolveMikoConfigPath } from './config';

const spec = {
  id: 'ui-checkpoint',
  appliesWhen: { action: { tools: ['Edit'], pathPrefixes: ['src/ui'] } },
  requires: { skills: [{ name: 'product-design', reloadAfterCompaction: true }] },
  mode: 'enforce',
};

describe('Miko Agent Spec config', () => {
  it('parses canonical miko.json and validates its specs', () => {
    const loaded = parseMikoConfig({ version: 1, specs: [spec] });

    expect(loaded.format).toBe('agent-spec');
    expect(loaded.contracts).toHaveLength(1);
  });

  it('keeps the legacy contract-array format compatible', () => {
    const loaded = parseMikoConfig([spec], '.miko/contracts.json');

    expect(loaded.format).toBe('legacy-contract-array');
  });

  it('rejects malformed documents and invalid specs', () => {
    expect(() => parseMikoConfig({ version: 2, specs: [] })).toThrow(/Expected/);
    expect(() => parseMikoConfig({ version: 1, specs: [{ ...spec, id: '' }] })).toThrow();
  });

  it('prefers root miko.json over the legacy path', () => {
    const project = mkdtempSync(path.join(tmpdir(), 'miko-config-'));
    try {
      mkdirSync(path.join(project, '.miko'), { recursive: true });
      writeFileSync(path.join(project, '.miko', 'contracts.json'), JSON.stringify([spec]));
      writeFileSync(path.join(project, 'miko.json'), JSON.stringify({ version: 1, specs: [spec] }));

      expect(resolveMikoConfigPath(project)).toBe(path.join(project, 'miko.json'));
      expect(loadMikoConfig(project).format).toBe('agent-spec');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});
