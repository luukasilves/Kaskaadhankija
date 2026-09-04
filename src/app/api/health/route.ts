/**
 * Health check for the container platform.
 *
 * Answers only whether the database responds — no persona, no clock, no jobs:
 * Fly calls it every 30 seconds. It does await the boot, because a container
 * whose migrations have not been applied is not healthy yet, and the platform
 * should keep the old machine serving until they have.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { bootOnce } from '@/server/boot';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await bootOnce();
    getDb().get(sql`select 1`);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'unknown' },
      { status: 503 },
    );
  }
}
