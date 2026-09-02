import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

function packageJson(name: string) {
  return JSON.parse(readFileSync(path.join(root, 'packages', name, 'package.json'), 'utf8'));
}

describe('Miko npm release invariants', () => {
  const miko = packageJson('koma-miko');
  const dsh = packageJson('koma-miko-dsh');
  const postpublish = 'node ../../scripts/sync-npm-dist-tags.mjs';

  it('publishes both alpha packages through the guarded tag path', () => {
    expect(miko.publishConfig.tag).toBe('alpha');
    expect(dsh.publishConfig.tag).toBe('alpha');
    expect(miko.scripts.postpublish).toBe(postpublish);
    expect(dsh.scripts.postpublish).toBe(postpublish);
  });

  it('pins the DSH adapter to the exact Miko release', () => {
    expect(dsh.dependencies['koma-miko']).toBe(miko.version);
  });
});
