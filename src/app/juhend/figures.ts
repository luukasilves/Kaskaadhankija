/**
 * The guide's figures, as static imports.
 *
 * Deliberately **not** `public/`: Next emits a static import to
 * `.next/static/media/…`, which `Dockerfile:61` already copies, so the figures
 * ship with no change to the container. Two consequences worth having:
 *
 *  - a **missing figure fails `pnpm build`**, which is already a CI gate — the
 *    loudest possible alarm for a guide whose pictures have gone stale;
 *  - the filenames are content-hashed, so a regenerated figure busts the
 *    browser cache. A `public/` URL would have served a bidder the old one.
 *
 * Kept out of `src/domain/` so vitest never has to resolve a PNG.
 *
 * Regenerate with `node scripts/make-juhend-shots.mjs` after `pnpm build`.
 */

import type { StaticImageData } from 'next/image';
import type { FigureId } from '@/domain/juhend';
import kinnitamata from './pildid/kinnitamata.png';
import kinnitamine from './pildid/kinnitamine.png';
import maaratiTeisele from './pildid/maarati-teisele.png';
import neliOlekut from './pildid/neli-olekut.png';
import siseneViga from './pildid/sisene-viga.png';
import siseneVorm from './pildid/sisene-vorm.png';
import teavitused from './pildid/teavitused.png';
import tellimus from './pildid/tellimus.png';
import testRiba from './pildid/test-riba.png';
import vastamata from './pildid/vastamata.png';
import voorudeLoend from './pildid/voorude-loend.png';

export const FIGURES: Record<FigureId, StaticImageData> = {
  'test-riba': testRiba,
  'sisene-vorm': siseneVorm,
  'sisene-viga': siseneViga,
  'voorude-loend': voorudeLoend,
  vastamata,
  'neli-olekut': neliOlekut,
  kinnitamata,
  kinnitamine,
  'maarati-teisele': maaratiTeisele,
  tellimus,
  teavitused,
};
