/**
 * The representatives template, prefilled with what the system already knows:
 * every person the buyer has listed in their own right, and a row with just the
 * company for anyone not yet represented beyond the lot contact — so the team
 * corrects and extends rather than starting from a blank sheet.
 *
 * The lot contacts are deliberately not prefilled [L-21]: they represent the
 * company by the ranking, and naming them here changes only role and phone.
 */

import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { partnerRepresentatives, partners } from '@/db/schema';
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
  const listed = db
    .select()
    .from(partnerRepresentatives)
    .where(and(eq(partnerRepresentatives.isActive, true), eq(partnerRepresentatives.isListed, true)))
    .all()
    .sort((a, b) => a.name.localeCompare(b.name));

  const headers = ['partner', ...REPRESENTATIVE_COLUMNS, ...REPRESENTATIVE_OPTIONAL_COLUMNS];
  const rows = companies.flatMap((company) => {
    const mine = listed.filter((rep) => rep.partnerId === company.id);
    if (mine.length === 0) {
      return [{ partner: company.name, registrikood: company.regCode, esindaja: '', e_post: '', roll: 'esindaja', telefon: '' }];
    }
    return mine.map((rep) => ({
      partner: company.name,
      registrikood: company.regCode,
      esindaja: rep.name,
      e_post: rep.email,
      roll: rep.role,
      telefon: rep.phone,
    }));
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
        { Veerg: 'Reegel', Väärtus: 'Raamlepingu kontaktisikut siia lisama ei pea — tema esindus tuleb järjestusest ja lõpeb kontaktisiku vahetusega. Siin nimetatud inimene jääb esindajaks ka pärast kontaktisiku vahetust.' },
        { Veerg: 'Reegel', Väärtus: 'Tühjade lahtritega rida (ainult partner ja registrikood) on abiks: täida või kustuta.' },
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
