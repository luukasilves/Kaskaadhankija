/**
 * Health check for the container platform.
 *
 * Deliberately does not touch persona, clock or migration logic: it must answer
 * while the app is otherwise mid-boot, and Fly's check calls it every 30s.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    getDb().get(sql`select 1`);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'unknown' },
      { status: 503 },
    );
  }
}
