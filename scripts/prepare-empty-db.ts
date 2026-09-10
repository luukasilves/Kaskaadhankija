/**
 * A migrated but deliberately empty database.
 *
 * The boot sequence seeds any database whose seed version is behind [L-23], so
 * a suite that wants to prove an admin can set up an environment by hand has to
 * stamp the seed as already done. That is exactly the state a real deployment
 * reaches after its first boot, minus the sample data — which is what a live
 * environment looks like once the real framework workbook replaces it.
 *
 * `DATABASE_PATH=… npx tsx scripts/prepare-empty-db.ts`
 */

import { getDb } from '@/db';
import { runMigrations } from '@/db/migrate';
import { SEED_VERSION } from '@/db/seed';
import { ensureAppState, writeSeedVersion } from '@/server/clock';

runMigrations();
const db = getDb();
ensureAppState(db);
writeSeedVersion(db, SEED_VERSION, Date.now());
console.log(`Tühi andmebaas ette valmistatud (seemne versioon ${SEED_VERSION}, andmeid ei laaditud).`);
