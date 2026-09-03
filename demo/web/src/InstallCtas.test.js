import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(webRoot, 'public', 'index.html'), 'utf8');

function tabPanelMarkup(id, nextId) {
  const start = html.indexOf(`id="${id}" role="tabpanel"`);
  const end = nextId ? html.indexOf(`id="${nextId}" role="tabpanel"`, start) : html.length;
  return html.slice(start, end);
}

describe('package install calls to action', () => {
  it('shows one contextual install card in every product tab', () => {
    expect(html.match(/class="install-card"/g)).toHaveLength(4);
    expect(html).toContain('id="miko-install-title">Start with Claude Code');
    expect(html).toContain('id="gate-install-title">Guard an LLM endpoint');
    expect(html).toContain('id="scout-install-title">Protect a voice or upload boundary');
    expect(html).toContain('id="core-install-title">Separate search from protected content');
  });

  it('uses the published package commands and includes Miko initialization', () => {
    expect(html).toContain('npm install -D koma-miko@alpha');
    expect(html).toContain('npx koma-miko init --host claude');
    expect(html).toContain('npm install koma-gate');
    expect(html).toContain('npm install koma-scout');
    expect(html).toContain('npm install koma-core');
  });

  it('keeps each command inside its package tab', () => {
    expect(tabPanelMarkup('tab-gate', 'tab-scout')).toContain('id="install-gate-command"');
    expect(tabPanelMarkup('tab-scout', 'tab-core')).toContain('id="install-scout-command"');
    expect(tabPanelMarkup('tab-core', 'tab-miko')).toContain('id="install-core-command"');
    expect(tabPanelMarkup('tab-miko', 'tab-faq')).toContain('id="install-miko-command"');
  });

  it('labels every copy action with its package and reports the outcome', () => {
    expect(html.match(/class="install-copy"/g)).toHaveLength(4);
    expect(html).toContain('data-default-label="Copy Miko setup" data-success-label="Miko setup copied"');
    expect(html).toContain('data-default-label="Copy Gate install" data-success-label="Gate install copied"');
    expect(html).toContain('data-default-label="Copy Scout install" data-success-label="Scout install copied"');
    expect(html).toContain('data-default-label="Copy Core install" data-success-label="Core install copied"');
  });
});
