/**
 * Health check for the container platform.
 *
 * Answers whether the database responds, which base URL the machine was given,
 * how mail leaves, and how much framework data is loaded — no session, no jobs:
 * Fly calls it every 30 seconds. It does await the boot, because a container
 * whose migrations have not been applied is not healthy yet, and the platform
 * should keep the old machine serving until they have.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { lots, partners, users } from '@/db/schema';
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
    // Counts, because the front door is now the sign-in: a deploy can no
    // longer tell from the opening page whether the framework data is loaded.
    const db = getDb();
    const count = (rows: unknown[]) => rows.length;
    return Response.json({
      ok: true,
      baseUrl: env.APP_BASE_URL,
      mail: mailMode(),
      data: {
        lots: count(db.select({ id: lots.id }).from(lots).all()),
        partners: count(db.select({ id: partners.id }).from(partners).all()),
        buyers: count(db.select({ id: users.id }).from(users).all()),
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'unknown' },
      { status: 503 },
    );
  }
}
