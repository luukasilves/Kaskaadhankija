/**
 * The guide's drawn diagrams — inline SVG, server-rendered, no script.
 *
 * Every word comes from the `JOONIS_*` constants in `src/domain/juhend.ts`, so
 * the drawings say what the prose says and the test sweeps them with it. This
 * file holds geometry only.
 *
 * Why SVG here when the cascade table (`page.tsx`) deliberately is not: these
 * three show *shape* — a tree, two flows side by side, a loop — which a table
 * cannot. They are drawn on a 420-unit-wide canvas so that on a phone they
 * render close to 1:1 and the smallest text stays about 10 px; on a desktop
 * they are capped at 560 px. Colours are the page's own tokens, so the
 * high-contrast and print palettes apply to them too. The figcaption carries
 * the meaning: a reader who cannot see the drawing loses nothing the prose
 * does not also say [locked decision: every figure is droppable].
 */

import type { ReactNode } from 'react';
import { JOONIS_JAOTUS_SAMM, JOONIS_KAKS_MUDELIT, JOONIS_RAAMLEPING } from '@/domain/juhend';

/* ------------------------------------------------------------------ *
 * primitives
 * ------------------------------------------------------------------ */

type Tone = 'box' | 'buyer' | 'ok' | 'question' | 'neutral';

const TONES: Record<Tone, { fill: string; stroke: string; width: number }> = {
  box: { fill: 'var(--color-surface-alt)', stroke: 'var(--color-border-strong)', width: 1.2 },
  buyer: { fill: 'var(--color-brand-soft)', stroke: 'var(--color-brand)', width: 1.4 },
  ok: { fill: 'var(--color-success-soft)', stroke: 'var(--color-success)', width: 1.4 },
  question: { fill: 'var(--color-surface)', stroke: 'var(--color-brand)', width: 1.4 },
  neutral: { fill: 'var(--color-neutral-soft)', stroke: 'var(--color-border-strong)', width: 1.2 },
};

type Rida = string | { t: string; size?: number; weight?: number; muted?: boolean };

const TEXT = 'var(--color-text)';
const MUTED = 'var(--color-muted)';

function ridaOsad(rida: Rida) {
  return typeof rida === 'string' ? { t: rida } : rida;
}

/** A rounded box with centred text, one `<tspan>` per line. */
function Kast({
  x,
  y,
  w,
  h,
  lines,
  tone = 'box',
  size = 12,
  weight,
  r = 6,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: readonly Rida[];
  tone?: Tone;
  size?: number;
  weight?: number;
  r?: number;
}) {
  const t = TONES[tone];
  const rows = lines.map(ridaOsad);
  const heights = rows.map((row) => (row.size ?? size) * 1.3);
  const total = heights.reduce((a, b) => a + b, 0);
  // baseline of the first line so that the block of lines is vertically centred
  let baseline = y + h / 2 - total / 2 + (rows[0]?.size ?? size) * 0.95;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={r} fill={t.fill} stroke={t.stroke} strokeWidth={t.width} />
      {rows.map((row, i) => {
        const yy = baseline;
        baseline += heights[i] ?? 0;
        return (
          <text
            key={i}
            x={x + w / 2}
            y={yy}
            textAnchor="middle"
            fontSize={row.size ?? size}
            fontWeight={row.weight ?? (i === 0 ? weight : undefined)}
            fill={row.muted ? MUTED : TEXT}
          >
            {row.t}
          </text>
        );
      })}
    </g>
  );
}

/** A connector; `nool` adds the arrowhead defined once per diagram. */
function Joon({ d, nool, dashed, marker }: { d: string; nool?: boolean; dashed?: boolean; marker: string }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={MUTED}
      strokeWidth={1.4}
      strokeDasharray={dashed ? '4 3' : undefined}
      markerEnd={nool ? `url(#${marker})` : undefined}
    />
  );
}

function Silt({
  x,
  y,
  text,
  size = 10.5,
  anchor = 'middle',
  muted = true,
  weight,
  rotate,
  fill,
}: {
  x: number;
  y: number;
  text: string;
  size?: number;
  anchor?: 'start' | 'middle' | 'end';
  muted?: boolean;
  weight?: number;
  rotate?: number;
  fill?: string;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      textAnchor={anchor}
      fontWeight={weight}
      fill={fill ?? (muted ? MUTED : TEXT)}
      transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}
    >
      {text}
    </text>
  );
}

/** The frame every diagram shares: card, caption, accessible name, arrowhead. */
function Joonis({
  id,
  pealkiri,
  selgitus,
  width,
  height,
  children,
}: {
  id: string;
  pealkiri: string;
  selgitus: string;
  width: number;
  height: number;
  children: ReactNode;
}) {
  const titleId = `joonis-${id}-pealkiri`;
  const marker = `joonis-${id}-nool`;
  return (
    <figure className="kh-card my-5 p-4" data-testid={`joonis-${id}`}>
      <figcaption className="mb-3 text-[13px]">
        <strong>{pealkiri}.</strong> {selgitus}
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={titleId}
        style={{ display: 'block', width: '100%', maxWidth: 560, height: 'auto', margin: '0 auto', fontFamily: 'inherit' }}
      >
        <title id={titleId}>{pealkiri}</title>
        <defs>
          <marker id={marker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L8,4 L0,8 z" fill={MUTED} />
          </marker>
        </defs>
        {children}
      </svg>
    </figure>
  );
}

/* ------------------------------------------------------------------ *
 * diagram 3 — the framework, its lots, each lot's ranking
 * ------------------------------------------------------------------ */

export function RaamlepingJoonis() {
  const J = JOONIS_RAAMLEPING;
  const marker = 'joonis-raamleping-nool';
  const lotW = 90;
  const lotXs = [12, 114, 216, 318];
  const centres = lotXs.map((x) => x + lotW / 2);
  const ladderW = 70;
  const ladderYs = [116, 142, 168];
  return (
    <Joonis id="raamleping" pealkiri={J.pealkiri} selgitus={J.selgitus} width={420} height={236}>
      <Kast x={70} y={6} w={280} h={42} tone="buyer" lines={[{ t: J.raamleping[0], size: 13, weight: 650 }, { t: J.raamleping[1], size: 10.5, muted: true }]} />
      {/* the bus from the agreement down to the four lots */}
      <Joon marker={marker} d={`M210,48 V64 M${centres[0]},64 H${centres[3]}`} />
      {centres.map((c) => (
        <Joon key={c} marker={marker} d={`M${c},64 V76`} nool />
      ))}
      {J.hankeosad.map((nimi, i) => (
        <g key={nimi}>
          <Kast x={lotXs[i] ?? 0} y={76} w={lotW} h={28} lines={[{ t: nimi, weight: 600 }]} />
          <Joon marker={marker} d={`M${centres[i]},104 V116`} />
          {J.kohad.map((koht, k) =>
            k < ladderYs.length ? (
              <Kast
                key={koht}
                x={(centres[i] ?? 0) - ladderW / 2}
                y={ladderYs[k] ?? 0}
                w={ladderW}
                h={20}
                r={4}
                tone={k === 0 ? 'buyer' : 'box'}
                lines={[{ t: koht, size: 11, weight: k === 0 ? 600 : undefined }]}
              />
            ) : (
              <Silt key={koht} x={centres[i] ?? 0} y={202} text={koht} size={13} />
            ),
          )}
        </g>
      ))}
      {/* legend */}
      <rect x={12} y={216} width={14} height={10} rx={2} fill={TONES.buyer.fill} stroke={TONES.buyer.stroke} strokeWidth={1.2} />
      <Silt x={32} y={225} text={J.legend} anchor="start" size={11} />
    </Joonis>
  );
}

/* ------------------------------------------------------------------ *
 * diagram 4 — the classic cascade above, the parallel one below
 * ------------------------------------------------------------------ */

export function KaksMudelitJoonis() {
  const J = JOONIS_KAKS_MUDELIT;
  const marker = 'joonis-kaks-mudelit-nool';
  const A = J.klassikaline;
  const B = J.paralleelne;
  const rowY = 32;
  const boxW = 64;
  const boxH = 30;
  const xs = [8, 112, 216, 320];
  return (
    <Joonis id="kaks-mudelit" pealkiri={J.pealkiri} selgitus={J.selgitus} width={420} height={352}>
      {/* --- A: one at a time --- */}
      <Silt x={8} y={16} text={A.pealkiri} anchor="start" size={12.5} weight={650} muted={false} />
      <Kast x={xs[0] ?? 0} y={rowY} w={boxW} h={boxH} tone="buyer" lines={[{ t: A.tellija, weight: 600 }]} />
      {A.kohad.map((koht, i) => (
        <Kast
          key={koht}
          x={xs[i + 1] ?? 0}
          y={rowY}
          w={boxW}
          h={boxH}
          tone={i === A.kohad.length - 1 ? 'ok' : 'box'}
          lines={[{ t: koht, weight: 600 }]}
        />
      ))}
      {A.nooled.map((silt, i) => {
        const from = (xs[i] ?? 0) + boxW;
        const to = xs[i + 1] ?? 0;
        return (
          <g key={silt + i}>
            <Joon marker={marker} d={`M${from},${rowY + boxH / 2} H${to}`} nool />
            <Silt x={(from + to) / 2} y={rowY - 4} text={silt} size={10} />
          </g>
        );
      })}
      <Silt x={(xs[3] ?? 0) + boxW / 2} y={rowY + boxH + 14} text={A.tulemus} size={10.5} fill="var(--color-success)" weight={600} />
      {/* time runs left to right */}
      <Joon marker={marker} d={`M8,92 H384`} nool dashed />
      <Silt x={392} y={95} text="aeg" anchor="start" size={10} />
      {A.markus.map((rida, i) => (
        <Silt key={rida} x={8} y={112 + i * 14} text={rida} anchor="start" size={10.5} />
      ))}

      <path d="M8,142 H412" stroke="var(--color-border)" strokeWidth={1} />

      {/* --- B: all at once --- */}
      <Silt x={8} y={164} text={B.pealkiri} anchor="start" size={12.5} weight={650} muted={false} />
      <Kast x={8} y={206} w={84} h={40} tone="buyer" lines={[{ t: B.tellija[0], weight: 600 }, { t: B.tellija[1], size: 10.5, muted: true }]} />
      {/* the response window */}
      <rect x={140} y={172} width={80} height={110} rx={8} fill="none" stroke="var(--color-border)" strokeDasharray="4 3" />
      <Silt x={180} y={296} text={B.aken} size={10} />
      {B.kohad.map((koht, i) => {
        const y = 180 + i * 34;
        return (
          <g key={koht}>
            <Joon marker={marker} d={`M92,226 L150,${y + 12}`} nool />
            <Kast x={150} y={y} w={60} h={24} lines={[{ t: koht, weight: 600 }]} />
            <Joon marker={marker} d={`M210,${y + 12} L290,226`} nool />
          </g>
        );
      })}
      {/* the deadline */}
      <path d="M250,172 V286" stroke="var(--color-warning)" strokeWidth={1.4} strokeDasharray="5 3" />
      <Silt x={256} y={181} text={B.tahtaeg} anchor="start" size={10} fill="var(--color-warning)" weight={600} />
      <Kast x={290} y={206} w={122} h={40} tone="ok" lines={[{ t: B.tulemus[0], weight: 600 }, { t: B.tulemus[1], size: 10.5 }]} />
      {B.markus.map((rida, i) => (
        <Silt key={rida} x={8} y={314 + i * 13} text={rida} anchor="start" size={10.5} />
      ))}
    </Joonis>
  );
}

/* ------------------------------------------------------------------ *
 * diagram 5 — one training walks down the ranking
 * ------------------------------------------------------------------ */

export function JaotusSammJoonis() {
  const J = JOONIS_JAOTUS_SAMM;
  const marker = 'joonis-jaotus-samm-nool';
  const cx = 210;
  return (
    <Joonis id="jaotus-samm" pealkiri={J.pealkiri} selgitus={J.selgitus} width={420} height={316}>
      <Kast x={cx - 80} y={6} w={160} h={26} r={13} tone="buyer" lines={[{ t: J.algus, weight: 650 }]} />
      <Joon marker={marker} d={`M${cx},32 V46`} nool />

      <Kast x={80} y={46} w={260} h={38} lines={[{ t: J.jargmine[0], weight: 600 }, { t: J.jargmine[1], size: 10.5, muted: true }]} />
      <Joon marker={marker} d={`M${cx},84 V100`} nool />

      <Kast x={110} y={100} w={200} h={40} tone="question" lines={[...J.kysimus1]} />
      <Silt x={cx + 6} y={152} text={J.jah} anchor="start" size={11} weight={600} />
      <Joon marker={marker} d={`M${cx},140 V156`} nool />
      <Silt x={330} y={114} text={J.ei} size={11} weight={600} />
      <Joon marker={marker} d="M310,120 H370" />

      <Kast x={110} y={156} w={200} h={40} tone="question" lines={[...J.kysimus2]} />
      <Silt x={cx + 6} y={208} text={J.jah} anchor="start" size={11} weight={600} />
      <Joon marker={marker} d={`M${cx},196 V212`} nool />
      <Silt x={330} y={170} text={J.ei} size={11} weight={600} />
      {/* both „ei“ branches go back up to „next partner“ */}
      <Joon marker={marker} d="M310,176 H370 V65 H340" nool />
      <Silt x={384} y={120} text={J.tagasi} size={10} rotate={-90} />

      <Kast x={90} y={212} w={240} h={36} tone="ok" lines={[{ t: J.tulemus[0], weight: 650 }, { t: J.tulemus[1] }]} />

      {/* the ranking is exhausted */}
      <Joon marker={marker} d="M80,65 H30 V288 H40" nool dashed />
      <Silt x={18} y={176} text={J.otsas} size={10} rotate={-90} />
      <Kast x={40} y={270} w={340} h={36} tone="neutral" lines={[{ t: J.jaak[0], size: 10.5 }, { t: J.jaak[1], size: 10.5 }]} />
    </Joonis>
  );
}
