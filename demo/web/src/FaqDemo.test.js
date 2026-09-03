import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(webRoot, 'public', 'index.html'), 'utf8');

describe('bilingual FAQ tab', () => {
  it('places FAQ at the right edge of the tab list', () => {
    const coreTab = html.indexOf('id="tab-btn-core"');
    const faqTab = html.indexOf('id="tab-btn-faq"');
    const tabListEnd = html.indexOf('</nav>', faqTab);

    expect(coreTab).toBeGreaterThan(-1);
    expect(faqTab).toBeGreaterThan(coreTab);
    expect(tabListEnd).toBeGreaterThan(faqTab);
    expect(html.slice(faqTab, tabListEnd)).not.toContain('role="tab"');
  });

  it('uses two expandable audience components with bilingual questions', () => {
    expect(html.match(/<details class="faq-component">/g)).toHaveLength(2);
    expect(html.match(/<article class="faq-item">/g)?.length).toBeGreaterThanOrEqual(6);
    expect(html).toContain('For vibe coders');
    expect(html).toContain('给 Vibe Coders');
    expect(html).toContain('For experienced engineers');
    expect(html).toContain('给职业开发者');
    expect(html.match(/lang="zh-CN"/g)?.length).toBeGreaterThanOrEqual(12);
  });
});
