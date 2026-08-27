import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(webRoot, 'public', 'index.html'), 'utf8');

describe('scenario-first defense demos', () => {
  it('keeps Gate as the direct prompt playground', () => {
    expect(html).toContain('id="input" maxlength="1000"');
    expect(html).toContain('id="run" type="button">Classify this prompt');
    expect(html).toContain('Runs the real <code>koma-gate</code> classifier.');
    expect(html).toContain('id="gate-evidence-title">Demo evidence');
  });

  it('frames Scout around downstream cost and visible request scenarios', () => {
    expect(html).toContain('Stop bad voice uploads before they burn an AI call.');
    expect(html).toContain('id="scout-terminal"');
    expect(html).toContain('data-scout-scenario="oversized" aria-pressed="true"');
    expect(html).toContain('data-scout-scenario="flood"');
    expect(html).toContain('id="scout-downstream"');
    expect(html).toContain('id="scout-evidence-title">Demo evidence');
    expect(html).toContain('<dt>Input</dt><dd>Simulated metadata</dd>');
    expect(html).toContain('id="run-scout" type="button">Check this request');
  });

  it('lets Core compare the scraper attack with the legitimate backend path', () => {
    expect(html).toContain('Let a scraper steal the whole index—and still get zero content.');
    expect(html).toContain('id="core-terminal"');
    expect(html).toContain('data-core-scenario="attack" aria-pressed="true"');
    expect(html).toContain('data-core-scenario="legit"');
    expect(html).toContain('id="core-index-raw"');
    expect(html).toContain('derive content token with HKDF(masterKey, sourceId)');
    expect(html).toContain('id="core-evidence-title">Demo evidence');
    expect(html).toContain('data-core-scenario="attack" aria-pressed="true">Scraper attack');
  });

  it('renders proof as static evidence instead of button-like pills', () => {
    expect(html.match(/class="demo-evidence"/g)).toHaveLength(4);
    expect(html).not.toContain('class="defense-proof"');
  });
});
