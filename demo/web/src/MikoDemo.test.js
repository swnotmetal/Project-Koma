import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(webRoot, 'public', 'index.html'), 'utf8');
const fixture = JSON.parse(readFileSync(path.join(webRoot, 'public', 'miko-replay.json'), 'utf8'));

describe('Miko public demo', () => {
  it('opens Miko first as a guided CLI simulation', () => {
    const mikoTab = html.indexOf('id="tab-btn-miko"');
    const gateTab = html.indexOf('id="tab-btn-gate"');

    expect(mikoTab).toBeGreaterThan(-1);
    expect(mikoTab).toBeLessThan(gateTab);
    expect(html).toContain('id="tab-btn-miko" aria-controls="tab-miko" aria-selected="true"');
    expect(html).toContain('class="tabpanel active" id="tab-miko"');
    expect(html).toContain('id="miko-terminal"');
    expect(html).toContain('Play 10-sec demo');
    expect(html).toContain('Show next step');
    expect(html).toContain('Restart demo');
    expect(html).toContain('id="miko-evidence-title">Demo evidence');
    expect(html).toContain('class="demo-evidence-list"');
    expect(html).not.toContain('class="verified"');
    expect(html).toContain("mikoProgress.textContent = '0 / ' + mikoSteps.length");
    expect(html).toContain("number.textContent = 'Scenario ' + (index + 1) + ' / ' + mikoSteps.length");
    expect(html).toContain("scenario: 'Unsafe edit attempt'");
    expect(html).toContain('class="miko-terminal-footer"');
  });

  it('keeps the CLI story backed by the privacy-minimized verifier fixture', () => {
    expect(fixture.generatedBy).toBe('koma-miko deterministic verifier replay');
    expect(fixture.privacy).toEqual({
      containsPrompt: false,
      containsCode: false,
      containsModelResponse: false,
    });
    expect(fixture.events).toHaveLength(13);
    expect(fixture.events.filter((event) => event.decision === 'DENY')).toHaveLength(3);
    expect(fixture.events.at(-1)).toMatchObject({
      checkpoint: 'PRE_ACTION',
      decision: 'ALLOW',
      reasonCode: 'CONTRACT_SATISFIED',
    });
  });
});
