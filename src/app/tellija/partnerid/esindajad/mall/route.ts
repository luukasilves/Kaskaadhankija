/**
 * The representatives template, prefilled with what the system already knows:
 * one row per active partner with its framework-agreement contact, so the team
 * corrects and extends rather than starting from a blank sheet.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { lotPartners, partners } from '@/db/schema';
import { REPRESENTATIVE_COLUMNS, REPRESENTATIVE_OPTIONAL_COLUMNS } from '@/domain/import-rows';
import { requireBuyer } from '@/server/auth/actor';
import { buildWorkbook } from '@/server/import/xlsx';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  await requireBuyer();
  const db = getDb();

  const companies = db
    .select()
    .from(partners)
    .where(eq(partners.isActive, true))
    .all()
    .sort((a, b) => a.name.localeCompare(b.name));
  const contacts = db
    .select({
      partnerId: lotPartners.partnerId,
      contactName: lotPartners.contactName,
      contactEmail: lotPartners.contactEmail,
      isActive: lotPartners.isActive,
    })
    .from(lotPartners)
    .all();

  const headers = ['partner', ...REPRESENTATIVE_COLUMNS, ...REPRESENTATIVE_OPTIONAL_COLUMNS];
  const rows = companies.map((company) => {
    const contact =
      contacts.find((c) => c.partnerId === company.id && c.isActive) ??
      contacts.find((c) => c.partnerId === company.id);
    return {
      partner: company.name,
      registrikood: company.regCode,
      esindaja: contact?.contactName ?? '',
      e_post: contact?.contactEmail ?? '',
      roll: 'esindaja',
      telefon: '',
    };
  });

  const buffer = await buildWorkbook([
    { name: 'Esindajad', headers, rows },
    {
      name: 'Selgitus',
      headers: ['Veerg', 'Väärtus'],
      rows: [
        { Veerg: 'partner', Väärtus: 'Abiveerg: partneri nimi. Importimisel ei kasutata.' },
        { Veerg: 'registrikood', Väärtus: 'Partneri registrikood, täpselt 8 numbrit. Partner peab olema järjestuses.' },
        { Veerg: 'esindaja', Väärtus: 'Isiku nimi, 2–80 tähemärki.' },
        { Veerg: 'e_post', Väärtus: 'Isiklik e-posti aadress. Sellega logitakse sisse ja sellele lähevad vooru teated.' },
        { Veerg: 'roll', Väärtus: 'esindaja (lepinguline esindaja, vaikimisi) või asendaja.' },
        { Veerg: 'telefon', Väärtus: 'Valikuline.' },
        { Veerg: '', Väärtus: '' },
        { Veerg: 'Reegel', Väärtus: 'Sama aadress võib olla aktiivne ainult ühe partneri esindajana.' },
        { Veerg: 'Reegel', Väärtus: 'Tellimismeeskonna kasutaja aadress ei saa olla partneri esindaja.' },
        { Veerg: 'Reegel', Väärtus: 'Uuesti laadimine uuendab sama (partner, e-post) paari; lisa ridu vabalt, ühe partneri kohta mitu.' },
      ],
    },
  ]);

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="esindajad-mall.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
