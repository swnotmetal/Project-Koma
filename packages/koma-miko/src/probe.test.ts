import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cli = readFileSync(path.join(packageRoot, 'src', 'cli.ts'), 'utf8');
const probe = readFileSync(path.join(packageRoot, 'evals', 'probe.mjs'), 'utf8');
const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
  files: string[];
};

describe('published host probe', () => {
  it('exposes one offline command for every core host adapter', () => {
    expect(cli).toContain("args[0] === 'probe'");
    for (const host of ['claude', 'codex', 'gemini', 'vscode']) {
      expect(probe).toContain(`${host}: {`);
    }
    expect(probe).toContain("value === 'copilot' ? 'vscode'");
  });

  it('keeps the report privacy-safe and explicit about its limits', () => {
    expect(probe).toContain("kind: 'offline-hook-conformance'");
    expect(probe).toContain('containsPrompt: false');
    expect(probe).toContain('containsSource: false');
    expect(probe).toContain('containsToolOutput: false');
    expect(probe).toContain('does not prove that an installed host emits the same events');
  });

  it('ships the probe and logo assets in the npm package', () => {
    expect(packageJson.files).toContain('evals');
    expect(packageJson.files).toContain('assets');
  });
});
