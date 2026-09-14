/**
 * Cluster rows against the database [L-28].
 *
 * A cluster row in a file describes G groups. For a new cluster that is simply
 * groups 1…G. For a cluster that already exists, the row describes its **free**
 * groups — the ones still importable — so the round template's collapsed row
 * (which writes exactly the free groups) round-trips, and a cluster that is
 * partly allocated can still be re-issued from a file without touching the
 * groups a partner already holds. The group count itself is never changed
 * through a file: a cluster that needs more groups is a new cluster.
 *
 * Shared by the calendar import and the round import, so the two cannot read
 * the same row differently.
 */

import { inArray } from 'drizzle-orm';
import { trainings } from '@/db/schema';
import { groupIndexRange } from '@/domain/clusters';
import { expandTrainingRows, isClusterHeadRow, type ParsedRow, type TrainingRow } from '@/domain/import-rows';
import { isTrainingImportable } from '@/domain/round-statuses';
import type { Ctx } from '../context';

/**
 * Check every cluster row against its stored groups, then expand the rows: a
 * head row with a problem gets the error and no value; the others become their
 * group rows, each carrying the file's row number.
 */
export function reconcileClusterRows(ctx: Ctx, rows: ParsedRow<TrainingRow>[]): ParsedRow<TrainingRow>[] {
  const heads = rows.filter((row) => row.value !== null && isClusterHeadRow(row.value));
  if (heads.length === 0) return expandTrainingRows(rows);

  const codes = heads.map((row) => row.value!.code);
  const existing = ctx.tx
    .select({
      clusterCode: trainings.clusterCode,
      groupIndex: trainings.groupIndex,
      status: trainings.status,
    })
    .from(trainings)
    .where(inArray(trainings.clusterCode, codes))
    .all();

  const indicesByCluster = new Map<string, number[]>();
  for (const row of heads) {
    const value = row.value!;
    const groups = existing
      .filter((g) => g.clusterCode === value.code && g.groupIndex !== null)
      .sort((a, b) => a.groupIndex! - b.groupIndex!);
    const wanted = value.groupCount ?? 0;

    if (groups.length === 0) {
      indicesByCluster.set(value.code, Array.from({ length: wanted }, (_, i) => i + 1));
      continue;
    }

    const free = groups.filter((g) => isTrainingImportable(g.status));
    const locked = groups.filter((g) => !isTrainingImportable(g.status));
    if (locked.length === 0) {
      if (wanted !== groups.length) {
        row.errors.push({
          field: 'ruhmi',
          message: `klastril ${value.code} on juba ${groups.length} rühma; rühmade arvu ei saa faili kaudu muuta (failis ${wanted}) — teise mahu jaoks tee uus klaster`,
        });
        row.value = null;
        continue;
      }
      indicesByCluster.set(value.code, groups.map((g) => g.groupIndex!));
      continue;
    }

    if (wanted !== free.length) {
      row.errors.push({
        field: 'ruhmi',
        message:
          free.length === 0
            ? `klastri ${value.code} kõik ${groups.length} rühma on juba voorus või määratud — rida ei saa midagi muuta`
            : `klastril ${value.code} on ${groups.length} rühma, neist vabu ${free.length} (${groupIndexRange(free.map((g) => g.groupIndex!))}); failis ${wanted} — rida peab kirjeldama vabu rühmi`,
      });
      row.value = null;
      continue;
    }
    row.warnings.push({
      field: 'kood',
      message: `klastri ${value.code} rühmad ${groupIndexRange(locked.map((g) => g.groupIndex!))} on juba voorus või määratud — neid ei muudeta; rida puudutab vabu rühmi ${groupIndexRange(free.map((g) => g.groupIndex!))}`,
    });
    indicesByCluster.set(value.code, free.map((g) => g.groupIndex!));
  }

  return expandTrainingRows(rows, (value) => indicesByCluster.get(value.code) ?? Array.from({ length: value.groupCount ?? 0 }, (_, i) => i + 1));
}
