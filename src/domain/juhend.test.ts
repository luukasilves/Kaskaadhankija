/**
 * The bidder guide's drift alarm.
 *
 * A guide that quotes an interface and shows screenshots of it goes stale
 * silently — the words stay on the page long after the screen changed, and
 * nobody notices until a partner follows an instruction that no longer works.
 * These assertions make that failure loud.
 *
 * Most of the guide needs no test at all: `juhend.ts` **imports** the label
 * constants rather than retyping them, so a rename is a typecheck error. What
 * is left is copy written inline in the JSX, the rule tags, the figures, and
 * the two numbers — which is what this file pins.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CODE_TTL_MS, SESSION_TTL_MS } from '@/server/auth/codes';
import { LISA_B1_EXPECTED, LISA_B2_EXPECTED } from './__fixtures__/lisa-b';
import {
  FIGURE_IDS,
  KASKAAD,
  KOODI_KEHTIVUS_MIN,
  PEALKIRI,
  QUOTED,
  SECTIONS,
  SESSIOONI_KEHTIVUS_PAEVI,
  type Block,
} from './juhend';

const ROOT = process.cwd();
const PILDID = join(ROOT, 'src', 'app', 'juhend', 'pildid');
const GENERATOR = join(ROOT, 'scripts', 'make-juhend-shots.mjs');

const read = (relative: string) => readFileSync(join(ROOT, relative), 'utf8');

/** Every block of every section, pilot-only included. */
const blocks: Block[] = SECTIONS.flatMap((section) => [...section.blocks]);

/** All the guide's prose in one string, for the sweeps below. */
const proosa = blocks
  .map((block) => {
    switch (block.kind) {
      case 'para':
        return block.text;
      case 'list':
      case 'steps':
        return block.items.join(' ');
      case 'note':
        return `${block.title} ${block.text}`;
      case 'figure':
        return block.caption;
      default:
        return '';
    }
  })
  .join('\n');

describe('the guide quotes an interface that still says that', () => {
  it.each(QUOTED.map((q) => [q.tekst, q.fail] as const))(
    '„%s“ still occurs in %s',
    (tekst, fail) => {
      expect(read(fail)).toContain(tekst);
    },
  );

  it('quotes every string it lists, so the list cannot rot in the other direction', () => {
    // A quoted string that the guide stopped using would be checked forever for
    // no reason, and would hide the fact that the guide no longer names it.
    for (const { tekst } of QUOTED) {
      expect(proosa, `„${tekst}“ is in QUOTED but no longer quoted in the guide`).toContain(tekst);
    }
  });
});

describe('the guide traces to the specification', () => {
  const spec = read('docs/kaskaadi-ariloogika.md');

  it('cites only rules that still exist', () => {
    const cited = [...new Set(SECTIONS.flatMap((s) => s.rules))];
    expect(cited.length).toBeGreaterThan(10);
    for (const tag of cited) {
      expect(spec, `rule [${tag}] is cited by the guide but not in the spec`).toContain(`[${tag}]`);
    }
  });

  it('names a rule for every section that states a procedure', () => {
    // The two exceptions are the opening and the closing, which describe the
    // document itself rather than the process.
    const withoutRules = SECTIONS.filter((s) => s.rules.length === 0).map((s) => s.id);
    expect(withoutRules).toEqual(['reeglid']);
  });
});

describe('the guide states no number it has no right to promise', () => {
  // Each of these is per-lot data or an open question [L-09][L-10][L-14], so
  // printing one would turn it into a promise. The deadline is on the round
  // page and in every notice; the guide says so instead.
  it.each([
    ['tööpäev', 'the response window and the decision time — [L-09] and [L-10] are unresolved'],
    ['25 koolitust', 'the workload threshold is per-lot data [T-03]'],
    ['75 osaleja', 'the workshop ceiling is a framework property the app does not enforce [K-06]'],
  ])('never says %s', (needle) => {
    expect(proosa).not.toContain(needle);
  });

  it('pins the only two numbers it does state to the code', () => {
    expect(KOODI_KEHTIVUS_MIN).toBe(CODE_TTL_MS / 60_000);
    expect(SESSIOONI_KEHTIVUS_PAEVI).toBe(SESSION_TTL_MS / 86_400_000);
    expect(proosa).toContain(`${KOODI_KEHTIVUS_MIN} minutit`);
    expect(proosa).toContain(`${SESSIOONI_KEHTIVUS_PAEVI} päeva`);
  });
});

describe('the guide calls things what the app calls them', () => {
  // From `docs/juhend/glossary/term_preferences.tsv`. The first is the one that
  // matters: in this app „hankija“ is a **buyer** role (`BUYER_ROLE_LABELS`,
  // [R-01]), so addressing a bidder as one would be actively wrong.
  it.each([
    ['hankija', 'a buyer role in this app — the reader is a raamlepingu partner'],
    ['pakkuja', 'a tenderer in an open procurement; these people already hold the agreement'],
    ['tarnija', 'wrong register — a supplier of goods'],
    ['deadline', 'use vastamistähtaeg'],
    ['limiit', 'use ülempiir / piirmäär'],
    ['kvoot', 'use ülempiir / piirmäär'],
    ['demo', 'the app says TESTKESKKOND; „demo“ understates what the data is'],
  ])('never calls anything a %s', (needle) => {
    expect(proosa.toLowerCase()).not.toContain(needle);
  });

  it('names the reader as the app does', () => {
    expect(proosa).toContain('partner');
    // „koolitaja“ is the human word, used in the title and once in the opening.
    expect(`${PEALKIRI} ${proosa}`).toContain('koolitaja');
  });
});

describe('the cascade diagram is the specification’s own worked example', () => {
  // K1..K6 in the fixture are these codes in the seeded round.
  const CODE_OF = ['KK-2026-201', 'KK-2026-202', 'KK-2026-203', 'KK-2026-204', 'KK-2026-205', 'KK-2026-206'];
  const RANK_OF = { A: 1, B: 2, C: 3 } as const;

  it('shows the same four display states, cell for cell [N-03]', () => {
    for (const [name, expected] of Object.entries(LISA_B2_EXPECTED)) {
      const rank = RANK_OF[name as keyof typeof RANK_OF];
      for (const [key, want] of Object.entries(expected)) {
        const code = CODE_OF[Number(key.slice(1)) - 1];
        const row = KASKAAD.find((r) => r.kood === code);
        const cell = row?.kohad.find((k) => k.koht === rank);
        const got = cell?.pohjus ? `${cell.olek}/${cell.pohjus}` : cell?.olek;
        expect(got, `Lisa B.2 ${name} ${key} (koht ${rank}, ${code})`).toBe(want);
      }
    }
  });

  it('shows the same allocation [Lisa B.1]', () => {
    for (const [name, codes] of Object.entries(LISA_B1_EXPECTED)) {
      if (name === 'leftover') continue;
      const rank = RANK_OF[name as keyof typeof RANK_OF];
      const won = KASKAAD.filter((row) => row.kohad.some((k) => k.koht === rank && k.sai)).map((r) => r.kood);
      expect(won, `Lisa B.1 ${name}`).toEqual((codes as string[]).map((k) => CODE_OF[Number(k.slice(1)) - 1]));
    }
  });

  it('leaves nothing unallocated, as Lisa B does', () => {
    expect(LISA_B1_EXPECTED.leftover).toEqual([]);
    for (const row of KASKAAD) {
      expect(row.kohad.filter((k) => k.sai), `${row.kood} goes to exactly one rank`).toHaveLength(1);
    }
  });
});

describe('the figures exist and match the generator', () => {
  const figuresUsed = blocks.filter((b): b is Block & { kind: 'figure' } => b.kind === 'figure');

  it('has a file for every figure, and no orphans', () => {
    const onDisk = readdirSync(PILDID)
      .filter((name) => name.endsWith('.png'))
      .map((name) => name.replace(/\.png$/, ''))
      .sort();
    expect(onDisk).toEqual([...FIGURE_IDS].sort());
  });

  it('is generated by a script that knows the same figures', () => {
    // The generator is `.mjs` and cannot import this module, so the two lists
    // are kept in step here rather than by the type system.
    const script = readFileSync(GENERATOR, 'utf8');
    for (const id of FIGURE_IDS) {
      expect(script, `the generator does not produce „${id}“`).toContain(`'${id}'`);
    }
  });

  it('uses every figure it generates, exactly once', () => {
    expect(figuresUsed.map((f) => f.id).sort()).toEqual([...FIGURE_IDS].sort());
  });

  it('captions every figure, because the prose must survive without it', () => {
    for (const figure of figuresUsed) {
      expect(figure.caption.length, figure.id).toBeGreaterThan(15);
    }
  });
});
