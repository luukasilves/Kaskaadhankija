/**
 * Health check for the container platform.
 *
 * Answers whether the database responds, and which base URL the machine was
 * given — no persona, no clock, no jobs: Fly calls it every 30 seconds. It does await the boot, because a container
 * whose migrations have not been applied is not healthy yet, and the platform
 * should keep the old machine serving until they have.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { env, mailMode } from '@/lib/env';
import { bootOnce } from '@/server/boot';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await bootOnce();
    getDb().get(sql`select 1`);
    // `baseUrl` is what every notification link is built from. Reporting it
    // lets a deploy prove the machine points at its own hostname, which matters
    // once two environments run from one fly.toml.
    return Response.json({ ok: true, baseUrl: env.APP_BASE_URL, mail: mailMode() });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'unknown' },
      { status: 503 },
    );
  }
}
