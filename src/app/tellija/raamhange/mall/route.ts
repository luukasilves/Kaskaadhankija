/**
 * The framework workbook, filled in with the current state [L-21].
 *
 * Not a blank template: this is the round trip. Download, change the cell you
 * came to change, drop the file back. Generated in memory and streamed — no
 * temporary file, nothing on disk.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { lotPartners, lots, partnerRepresentatives, partners } from '@/db/schema';
import { tallinnIsoDay } from '@/domain/format';
import type { LotRow } from '@/domain/framework-definition';
import { currentTimeMs } from '@/server/clock';
import { requireBuyer } from '@/server/auth/actor';
import { frameworkIdentity } from '@/server/framework';
import { buildFrameworkWorkbook } from '@/server/import/framework-template';

export const dynamic = 'force-dynamic';

export async function GET() {
  await requireBuyer();
  const db = getDb();

  const lotRows: LotRow[] = db
    .select()
    .from(lots)
    .where(eq(lots.isActive, true))
    .all()
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((lot) => ({
      code: lot.code,
      name: lot.name,
      description: lot.description,
      responseDeadlineWorkingDays: lot.responseDeadlineWorkingDays,
      deadlineLocalTime: lot.deadlineLocalTime,
      reviewWorkingDays: lot.reviewWorkingDays,
      workloadThreshold: lot.workloadThreshold,
      defaultVisibilityMode: lot.defaultVisibilityMode,
      defaultCapOptions: lot.defaultCapOptions,
      thresholdNote: lot.thresholdNote,
    }));

  const memberships = db
    .select({
      partnerName: partners.name,
      regCode: partners.regCode,
      lotCode: lots.code,
      rank: lotPartners.rank,
      contactName: lotPartners.contactName,
      contactEmail: lotPartners.contactEmail,
      unitPriceEur: lotPartners.unitPriceEur,
    })
    .from(lotPartners)
    .innerJoin(partners, eq(partners.id, lotPartners.partnerId))
    .innerJoin(lots, eq(lots.id, lotPartners.lotId))
    .where(eq(lotPartners.isActive, true))
    .all()
    .sort((a, b) => a.lotCode.localeCompare(b.lotCode) || a.rank - b.rank);

  // Only the people the ranking does not already carry: a lot's official
  // contact belongs on the Partnerid sheet, and repeating them here would make
  // this sheet take ownership of rows the framework data maintains.
  const contactKeys = new Set(
    memberships.map((m) => `${m.regCode}#${m.contactEmail.trim().toLowerCase()}`),
  );
  const extras = db
    .select({
      regCode: partners.regCode,
      name: partnerRepresentatives.name,
      email: partnerRepresentatives.email,
      role: partnerRepresentatives.role,
      phone: partnerRepresentatives.phone,
      source: partnerRepresentatives.source,
    })
    .from(partnerRepresentatives)
    .innerJoin(partners, eq(partners.id, partnerRepresentatives.partnerId))
    .where(eq(partnerRepresentatives.isActive, true))
    .all()
    .filter((row) => row.source !== 'framework' && !contactKeys.has(`${row.regCode}#${row.email}`));

  const buffer = await buildFrameworkWorkbook({
    framework: frameworkIdentity(db),
    lots: lotRows,
    partnerRows: memberships.map((m) => ({
      partner: m.partnerName,
      registrikood: m.regCode,
      hankeosa: m.lotCode,
      koht: String(m.rank),
      kontaktisik: m.contactName,
      e_post: m.contactEmail,
      uhikhind: String(m.unitPriceEur),
    })),
    representativeRows: extras.map((row) => ({
      registrikood: row.regCode,
      esindaja: row.name,
      e_post: row.email,
      roll: row.role,
      telefon: row.phone,
    })),
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="raamhanke-andmed-${tallinnIsoDay(currentTimeMs())}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
