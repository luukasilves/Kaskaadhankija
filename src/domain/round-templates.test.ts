/**
 * The two renderings of a notice must say the same thing — and a list of
 * workshops must stay a list in the mail client, not collapse into one
 * paragraph. A tester read her confirmation receipt in a mail client and saw
 * five trainings run together; the in-app log (which uses `<pre>`) looked fine,
 * which is why nobody had noticed [D-01].
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_FRAMEWORK_IDENTITY } from './framework';
import { composeNotice, renderConfirmationReceipt, renderRoundPublished } from './round-templates';

const lines = [
  'KK-2026-101 — Töötuba 1 Tallinna teenistujatele · 15.09.2026 · Töötuba 1 · Harju maakond · 28 osalejat',
  'KK-2026-102 — Töötuba 1 Tartu teenistujatele · 22.09.2026 · Töötuba 1 · Tartu maakond · 26 osalejat',
];

describe('composeNotice', () => {
  it('renders a list block as one <li> per item and one "· " line per item', () => {
    const notice = composeNotice('Pealkiri', ['Tere', { list: lines }, 'Lõpp']);
    expect(notice.body).toBe(`Tere\n\n· ${lines[0]}\n· ${lines[1]}\n\nLõpp`);
    expect(notice.bodyHtml.match(/<li\b/g)).toHaveLength(2);
    expect(notice.bodyHtml).toContain(`<li style="margin:0 0 6px">${lines[0]}</li>`);
    // No newline survives inside a paragraph — that is what collapsed before.
    expect(notice.bodyHtml).not.toMatch(/<p>[^<]*\n[^<]*<\/p>/);
  });

  it('escapes HTML inside list items and paragraphs alike', () => {
    const notice = composeNotice('T', ['a < b', { list: ['Tere & tere', '<script>'] }]);
    expect(notice.bodyHtml).toContain('<p>a &lt; b</p>');
    expect(notice.bodyHtml).toContain('<li style="margin:0 0 6px">Tere &amp; tere</li>');
    expect(notice.bodyHtml).toContain('&lt;script&gt;');
    expect(notice.bodyHtml).not.toContain('<script>');
  });

  it('skips empty paragraphs and empty lists in both forms', () => {
    const notice = composeNotice('T', ['', { list: [] }, 'Ainus lõik']);
    expect(notice.body).toBe('Ainus lõik');
    expect(notice.bodyHtml).not.toContain('<ul');
    expect(notice.bodyHtml.match(/<p>/g)).toHaveLength(1);
  });

  it('keeps the link and the framework signature after the blocks', () => {
    const notice = composeNotice('T', ['Lõik'], { url: 'https://x.ee/v', label: 'Ava' }, DEFAULT_FRAMEWORK_IDENTITY);
    expect(notice.body.endsWith('Ava: https://x.ee/v')).toBe(true);
    expect(notice.bodyHtml).toContain('href="https://x.ee/v"');
    expect(notice.bodyHtml.indexOf('<ul')).toBe(-1);
  });
});

describe('the templates that carry a training list', () => {
  const base = {
    roundCode: 'VOOR-2026-001',
    lotLabel: 'OSA-1 — Koolitused',
    deadlineText: '15.09.2026 17:00',
    url: 'https://x.ee/partner/voorud/1',
    framework: DEFAULT_FRAMEWORK_IDENTITY,
    contactName: 'Jaan Kask',
  };

  it('[D-01] puts every training of the publication on its own line', () => {
    const notice = renderRoundPublished({
      ...base,
      partnerName: 'Tehisaru Koolitus OÜ',
      trainingCount: 2,
      trainingLines: lines,
      visibilityDynamic: true,
      capOptionsText: '',
      decisionText: '18.09.2026',
    });
    expect(notice.bodyHtml.match(/<li\b/g)).toHaveLength(2);
    expect(notice.body).toContain(`· ${lines[1]}`);
  });

  it('[D-02] does the same for the confirmation receipt', () => {
    const notice = renderConfirmationReceipt({
      ...base,
      confirmedAtText: '12.09.2026 10:00',
      trainingLines: lines,
      capText: 'Piirmäär: kuni 3 koolitust.',
      projectionText: 'Prognoosis teile: 2 koolitust.',
    });
    expect(notice.bodyHtml.match(/<li\b/g)).toHaveLength(2);
    expect(notice.bodyHtml).toContain('Töötuba 1 Tartu teenistujatele');
  });
});
