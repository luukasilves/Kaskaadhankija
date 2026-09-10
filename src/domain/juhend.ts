/**
 * „Juhend koolitajale“ — the public guide for the framework agreement's
 * partners, at `/juhend`.
 *
 * Content lives here rather than in the page for the same reason
 * `round-templates.ts` does: this is Estonian prose that goes to real framework
 * partners, so it has to be reviewable in a diff and testable. `src/app/juhend`
 * holds only layout and the images.
 *
 * Three rules the content obeys, all enforced by `juhend.test.ts`:
 *
 *  1. **Labels are imported, never retyped.** Every word the reader must find
 *     on screen comes from the same constant the screen renders, so the guide
 *     cannot drift from the interface by a rename.
 *  2. **Every procedural claim names the rule it implements.** There is no
 *     English source to back-translate against, so fidelity is checked against
 *     `docs/kaskaadi-ariloogika.md`: `rules` on each section is the trace, and
 *     the test asserts each tag still exists in the spec.
 *  3. **Only two numbers may be stated** — the code's lifetime and the
 *     session's, because they are constants the test pins to the code. Response
 *     windows, workload thresholds and the buyer's decision time are per-lot
 *     data or open questions [L-09][L-10], and printing one would turn it into
 *     a promise this document has no right to make.
 *
 * Register: `teie` throughout, semi-formal, instructional. The anchors are
 * `docs/juhend/glossary/style_exemplars.md`; the decisions are
 * `docs/juhend/glossary/locked_decisions.txt`.
 */

import {
  capLabel,
  RESPONSE_STATE_LABELS,
  ROUND_STATUS_LABELS,
  TRAINING_VIEW_STATE_LABELS as OLEK,
  viewStateLabel,
} from './round-statuses';

/* ------------------------------------------------------------------ *
 * shape
 * ------------------------------------------------------------------ */

/** The figures, in the order the generator produces them. */
export const FIGURE_IDS = [
  'test-riba',
  'sisene-vorm',
  'sisene-viga',
  'voorude-loend',
  'vastamata',
  'neli-olekut',
  'kinnitamata',
  'kinnitamine',
  'maarati-teisele',
  'tellimus',
  'teavitused',
] as const;

export type FigureId = (typeof FIGURE_IDS)[number];

export type Block =
  | { kind: 'para'; text: string }
  | { kind: 'list'; items: readonly string[] }
  | { kind: 'steps'; items: readonly string[] }
  /** A boxed aside. `warning` is for the two things that cost a partner work. */
  | { kind: 'note'; tone: 'warning' | 'info'; title: string; text: string }
  | { kind: 'figure'; id: FigureId; caption: string }
  | { kind: 'diagram'; id: 'kaskaad' | 'ajatelg' };

export interface Section {
  /** the anchor, and the contents-list key */
  id: string;
  title: string;
  /** rule tags from `docs/kaskaadi-ariloogika.md` that this section restates */
  rules: readonly string[];
  /**
   * Shown only in the test environment. These passages describe the pilot and
   * must be **deleted** at go-live rather than left to the env gate — see
   * README, „Before go-live“.
   */
  pilotOnly?: true;
  blocks: readonly Block[];
}

/* ------------------------------------------------------------------ *
 * the two numbers that may be stated [L-08]
 * ------------------------------------------------------------------ */

/** `CODE_TTL_MS` in minutes. Pinned to the code by `juhend.test.ts`. */
export const KOODI_KEHTIVUS_MIN = 10;
/** `SESSION_TTL_MS` in days. Pinned to the code by `juhend.test.ts`. */
export const SESSIOONI_KEHTIVUS_PAEVI = 30;

/* ------------------------------------------------------------------ *
 * quoted on-screen strings [see rule 1 above]
 * ------------------------------------------------------------------ *
 *
 * Strings the guide reproduces that are **not** available as a constant —
 * button labels and banner headings written inline in the JSX. The test asserts
 * each one still occurs in the file it was taken from, so a rename in the
 * interface fails the suite instead of quietly making the guide wrong.
 */

const PARTNER_VOOR = 'src/app/partner/voorud/[id]/page.tsx';
const MARKING_FORM = 'src/app/partner/voorud/[id]/marking-form.tsx';
const VOORUD = 'src/app/partner/voorud/page.tsx';
const SISENE = 'src/components/sign-in.tsx';
const TELLIMUS = 'src/app/partner/tellimused/[id]/page.tsx';

export const QUOTED: readonly { tekst: string; fail: string }[] = [
  { tekst: 'Saada kood', fail: SISENE },
  { tekst: 'Sisesta kood', fail: SISENE },
  { tekst: 'Küsi uus kood', fail: SISENE },
  { tekst: 'Ootavad vastust', fail: VOORUD },
  { tekst: 'Ootavad tellija otsust', fail: VOORUD },
  { tekst: 'Lõpetatud voorud', fail: VOORUD },
  { tekst: 'Ava ja märgi koolitused', fail: VOORUD },
  { tekst: 'Te ei ole veel vastanud', fail: PARTNER_VOOR },
  { tekst: 'Vastamistähtaeg on möödunud', fail: PARTNER_VOOR },
  { tekst: 'Teie kinnituste ajalugu', fail: PARTNER_VOOR },
  { tekst: 'Prognoosis sinule (esialgne)', fail: PARTNER_VOOR },
  { tekst: 'Vooru koolitused', fail: MARKING_FORM },
  { tekst: 'Kinnita oma valik', fail: MARKING_FORM },
  { tekst: 'Kinnitamata muudatused', fail: MARKING_FORM },
  { tekst: 'Salvesta mustand', fail: MARKING_FORM },
  { tekst: 'Loobun kõigist', fail: MARKING_FORM },
  { tekst: 'Määratud teile', fail: MARKING_FORM },
  { tekst: 'Määrati teisele partnerile', fail: MARKING_FORM },
  { tekst: 'Ülempiir', fail: MARKING_FORM },
  { tekst: 'piirmäära ei ole', fail: MARKING_FORM },
  { tekst: 'Täitja', fail: TELLIMUS },
  { tekst: 'kasutage brauseri prindifunktsiooni', fail: TELLIMUS },
] as const;

/* ------------------------------------------------------------------ *
 * diagram 1 — the cascade, as Lisa B of the spec
 * ------------------------------------------------------------------ *
 *
 * The worked example rather than an invented one, so the picture and the
 * specification cannot disagree — `juhend.test.ts` compares every cell against
 * `LISA_B2_EXPECTED`, the fixture the allocation's own tests use.
 *
 * Ranks are „koht 1/2/3“ and never company names: a partner never learns who
 * the others are [N-04], and a diagram with names invites the reader to take it
 * for real data.
 */

export interface KaskaadRida {
  /** the training's own code, as it appears on screen */
  kood: string;
  toimub: string;
  /** did this rank mark it — and what does that rank then see [N-03] */
  kohad: readonly {
    koht: 1 | 2 | 3;
    margitud: boolean;
    /** the display state's key, so the label comes from the constant */
    olek: keyof typeof OLEK;
    /** the reason suffix, where the state carries one */
    pohjus?: 'higher_partner' | 'over_cap';
    /** did this rank end up with the training */
    sai: boolean;
  }[];
}

/** The four display states' labels, for the diagram's legend [N-03]. */
export const OLEKU_SILDID = OLEK;

export const KASKAAD_PIIRMAAR = { koht: 1, vaartus: 2 } as const;

export const KASKAAD: readonly KaskaadRida[] = [
  {
    kood: 'KK-2026-201',
    toimub: '05.10',
    kohad: [
      { koht: 1, margitud: true, olek: 'projected_to_you', sai: true },
      { koht: 2, margitud: false, olek: 'marked_by_higher', sai: false },
      { koht: 3, margitud: true, olek: 'marked_not_projected', pohjus: 'higher_partner', sai: false },
    ],
  },
  {
    kood: 'KK-2026-202',
    toimub: '07.10',
    kohad: [
      { koht: 1, margitud: true, olek: 'projected_to_you', sai: true },
      { koht: 2, margitud: true, olek: 'marked_not_projected', pohjus: 'higher_partner', sai: false },
      { koht: 3, margitud: false, olek: 'marked_by_higher', sai: false },
    ],
  },
  {
    kood: 'KK-2026-203',
    toimub: '12.10',
    kohad: [
      { koht: 1, margitud: true, olek: 'marked_not_projected', pohjus: 'over_cap', sai: false },
      { koht: 2, margitud: true, olek: 'projected_to_you', sai: true },
      { koht: 3, margitud: true, olek: 'marked_not_projected', pohjus: 'higher_partner', sai: false },
    ],
  },
  {
    kood: 'KK-2026-204',
    toimub: '14.10',
    kohad: [
      { koht: 1, margitud: false, olek: 'available', sai: false },
      { koht: 2, margitud: true, olek: 'projected_to_you', sai: true },
      { koht: 3, margitud: true, olek: 'marked_not_projected', pohjus: 'higher_partner', sai: false },
    ],
  },
  {
    kood: 'KK-2026-205',
    toimub: '19.10',
    kohad: [
      { koht: 1, margitud: true, olek: 'marked_not_projected', pohjus: 'over_cap', sai: false },
      { koht: 2, margitud: false, olek: 'available', sai: false },
      { koht: 3, margitud: true, olek: 'projected_to_you', sai: true },
    ],
  },
  {
    kood: 'KK-2026-206',
    toimub: '21.10',
    kohad: [
      { koht: 1, margitud: false, olek: 'available', sai: false },
      { koht: 2, margitud: true, olek: 'projected_to_you', sai: true },
      { koht: 3, margitud: true, olek: 'marked_not_projected', pohjus: 'higher_partner', sai: false },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * diagram 2 — one round's course
 * ------------------------------------------------------------------ */

export const AJATELG: readonly { samm: string; kes: 'tellija' | 'teie' | 'susteem'; tekst: string }[] = [
  { samm: 'Avaldamine', kes: 'tellija', tekst: 'Voor läheb korraga kõigile hankeosa partneritele. Te saate teate.' },
  { samm: 'Vastamisaeg', kes: 'teie', tekst: 'Märgite koolitused, valite soovi korral ülempiiri ja kinnitate. Muuta saab kuni tähtajani.' },
  { samm: 'Tähtaeg', kes: 'susteem', tekst: 'Voor sulgub ise. Kehtib teie viimane kinnitus enne tähtaega.' },
  { samm: 'Ülevaatus', kes: 'tellija', tekst: 'Tellija vaatab jaotusettepaneku üle.' },
  { samm: 'Kinnitamine', kes: 'tellija', tekst: 'Jaotus kinnitatakse. Pärast seda voor ei muutu.' },
  { samm: 'Tellimus', kes: 'teie', tekst: 'Teile määratud koolitused tulevad tellimusena, mille leiate menüüst.' },
];

/* ------------------------------------------------------------------ *
 * the guide
 * ------------------------------------------------------------------ */

export const PEALKIRI = 'Juhend koolitajale';

export const SISSEJUHATUS =
  'Kuidas vastata koolitustellimuste voorule raamlepingu „Eesti.ai koolitajate tellimine“ (RHR 10567384) alusel.';

export const SECTIONS: readonly Section[] = [
  {
    id: 'ulevaade',
    title: 'Millest see juhend räägib',
    rules: ['R-02'],
    blocks: [
      {
        kind: 'para',
        text:
          'Olete raamlepingu „Eesti.ai koolitajate tellimine“ partner. Tellija esitab raamlepingu alusel koolitustellimusi **voorudena**: iga voor läheb korraga kõigile selle hankeosa partneritele, teie märgite, milliseid koolitusi olete valmis läbi viima, ja koolitused jaotatakse rangelt raamlepingu järjestuse alusel.',
      },
      {
        kind: 'para',
        text:
          'See juhend selgitab, mida te ekraanil näete ja mida seal teha tuleb. **Siduvad on raamleping ja selle alusel esitatud teated, mitte see juhend** — kui midagi on siin ebaselgelt või teisiti kirjas, kehtib raamleping.',
      },
      {
        kind: 'para',
        text:
          'Juhend on mõeldud inimesele, kes teie ettevõttes voorudele vastab: raamlepingu kontaktisikule või esindajale, kelle aadress on tellija juures kirjas.',
      },
    ],
  },

  {
    id: 'katsekeskkond',
    title: 'Katsekeskkond',
    rules: ['L-19', 'L-23'],
    pilotOnly: true,
    blocks: [
      {
        kind: 'note',
        tone: 'warning',
        title: 'See on katsekeskkond',
        text:
          'Ükski märge ega kinnitus, mille te siin teete, **ei ole raamlepingu järgne tellimus** ega loo kohustust koolitust läbi viia. Katsetame keskkonda enne päris kasutust, et vead tuleksid välja siin ja mitte päris voorus.',
      },
      {
        kind: 'para',
        text:
          'Keskkond on ära tuntav: lehe ülaosas on märgis **TESTKESKKOND** ja sisselogimislehel sama märge. Andmed on päris kujul (päris hankeosad, päris järjestus), aga koolitused ja voorud on näidised.',
      },
      { kind: 'figure', id: 'test-riba', caption: 'Riba, mis on katsekeskkonnas iga lehe ülaosas.' },
      {
        kind: 'para',
        text:
          'E-kirju saadetakse ainult aadressidele, mis on **raamlepingu andmetes** — hankeosa kontaktisikutele ja üleslaaditud esindajatele. **See puudutab ka sisenemiskoode.** Kui te koodi ei saa, ei ole see tõrge teie postkastis: tõenäoliselt ei ole teie aadress esindajate loendis. Selle parandab tellija raamlepingu andmetes, ja pärast seda töötab nii sisselogimine kui teated.',
      },
      {
        kind: 'para',
        text:
          'Kõik muu selles juhendis kehtib täpselt samamoodi nagu päris voorus. Kui katsetamise ajal midagi arusaamatuks jääb, on see kõige kasulikum asi, mida te tellijale öelda saate.',
      },
    ],
  },

  {
    id: 'teade',
    title: 'Kuidas voor teieni jõuab',
    rules: ['D-01', 'D-10'],
    blocks: [
      {
        kind: 'para',
        text:
          'Uue vooru avaldamisel saadab süsteem teate e-postiga. Teates on hankeosa, kõigi vooru koolituste loend, **vastamistähtaeg** ja nupp, mis viib otse vooru juurde.',
      },
      {
        kind: 'para',
        text:
          'Teate saavad **kõik teie ettevõtte aktiivsed esindajad** korraga, mitte ainult üks inimene. Kui esindajate loendis kedagi ei ole, läheb teade raamlepingu kontaktisikule. Sama kehtib kõigi hilisemate teadete kohta: kinnituste kviitungid, meeldetuletus, tellimus.',
      },
      {
        kind: 'para',
        text:
          'Kõik teile koostatud teated on ka keskkonnas endas alles, menüüs **Teavitused**. Kui kiri kaob või jõuab rämpsposti, leiate sama teksti sealt.',
      },
    ],
  },

  {
    id: 'sisselogimine',
    title: 'Sisselogimine',
    rules: ['L-08', 'L-18'],
    blocks: [
      {
        kind: 'para',
        text:
          'Paroole ei ole. Te logite sisse **ühekordse koodiga**, mille süsteem saadab teie e-posti aadressile.',
      },
      {
        kind: 'steps',
        items: [
          'Avage sisselogimisleht ja sisestage oma e-posti aadress — sama, mis on tellija juures esindajate loendis. Vajutage „Saada kood“.',
          `Vaadake postkasti. Kiri „Sisenemiskood“ sisaldab kuuekohalist arvu. Kood kehtib **${KOODI_KEHTIVUS_MIN} minutit ja ainult ühe korra**.`,
          'Sisestage kood lehel „Sisesta kood“ ja vajutage „Logi sisse“. Jõuate otse oma voorude juurde.',
        ],
      },
      { kind: 'figure', id: 'sisene-vorm', caption: 'Sisselogimine algab e-posti aadressist.' },
      {
        kind: 'para',
        text: `Sisselogimine kehtib **${SESSIOONI_KEHTIVUS_PAEVI} päeva**, nii et iga kord uut koodi küsima ei pea. Välja logides lõpeb see kohe.`,
      },
      {
        kind: 'para',
        text:
          'Kui kood ei sobi või on aegunud, ütleb leht seda ja saate uue küsida — nupp „Küsi uus kood“. Viie vale katse järel lõpetab kood kehtivuse ja tuleb küsida uus. Turvalisuse huvides ei ütle leht kunagi, kas mingi aadress on loendis või ei ole: vastus on mõlemal juhul ühesugune.',
      },
      { kind: 'figure', id: 'sisene-viga', caption: 'Vale või aegunud kood — küsige uus.' },
      {
        kind: 'note',
        tone: 'info',
        title: 'Sisenemiskoodi ei ole kusagil mujal',
        text:
          'Kood on ainult teie kirjas. Seda ei ole teavituste logis ega kusagil, kust tellija seda näeks — nii ei saa keegi teie nimel sisse logida. Kui te koodi ei küsinud, jätke kiri tähelepanuta.',
      },
    ],
  },

  {
    id: 'voorud',
    title: 'Teie voorud',
    rules: ['N-02'],
    blocks: [
      {
        kind: 'para',
        text:
          'Menüü **Voorud** näitab ainult teie hankeosade voore ja alles avaldamise hetkest: vooru, mida tellija veel ette valmistab, te ei näe. Voorud on kolmes rühmas.',
      },
      {
        kind: 'list',
        items: [
          '**„Ootavad vastust“** — avatud voorud, kus tähtaeg ei ole veel möödunud. Ainult nende puhul saate veel midagi muuta.',
          '**„Ootavad tellija otsust“** — tähtaeg on möödunud, jaotust kinnitatakse.',
          '**„Lõpetatud voorud“** — jaotus on kinnitatud.',
        ],
      },
      {
        kind: 'para',
        text: `Iga vooru juures on teie koht selle hankeosa järjestuses, vastamistähtaeg ja aeg, mis on jäänud. Kui te ei ole veel vastanud, seisab seal olek „${RESPONSE_STATE_LABELS.none}“ ja hoiatus; kui olete midagi märkinud, aga kinnitamata jätnud, siis „${RESPONSE_STATE_LABELS.unconfirmed_changes}“.`,
      },
      {
        kind: 'para',
        text:
          'Vooru avab nupp **„Ava ja märgi koolitused“** — või „Ava voor“, kui olete juba vastanud. Samasse kohta viib ka avaldamise teate nupp.',
      },
      { kind: 'figure', id: 'voorude-loend', caption: 'Vastust ootav voor. Kaart ütleb, mis seis on ja palju aega jäänud.' },
      { kind: 'diagram', id: 'ajatelg' },
    ],
  },

  {
    id: 'markimine',
    title: 'Koolituste märkimine',
    rules: ['K-01', 'N-03', 'N-04', 'N-05'],
    blocks: [
      {
        kind: 'para',
        text:
          'Vooru avades näete tabelit **„Vooru koolitused“**: koodi, nimetuse, toimumisaja, asukoha, osalejate arvu, keele ja maksumuse. Märkige linnukesega need, mida olete valmis läbi viima.',
      },
      {
        kind: 'para',
        text:
          '**Märkida saab iga koolitust, sõltumata sellest, mida veerg „Olek“ ütleb.** Olek on teave, mitte piirang: märge ilma prognoosita on varuvariant, mis hakkab kehtima, kui eesõigusega partner loobub või oma valikut muudab.',
      },
      {
        kind: 'para',
        text: `Veerg „Olek“ näitab iga koolituse juures üht neljast seisust. Need arvutatakse teist **eespool** olevate partnerite kinnitatud märgete põhjal:`,
      },
      {
        kind: 'list',
        items: [
          `**„${OLEK.available}“** — keegi teist eespool ei ole seda märkinud. Kui te selle märgite, on see praeguse seisuga teie.`,
          `**„${OLEK.projected_to_you}“** — olete märkinud ja praeguse seisuga saaksite selle.`,
          `**„${OLEK.marked_by_higher}“** — keegi teist eespool on selle märkinud. Teie ei ole seda märkinud.`,
          `**„${viewStateLabel('marked_not_projected', 'higher_partner')}“** — olete märkinud, aga praeguse seisuga läheb see teist eespool olevale partnerile.`,
          `**„${viewStateLabel('marked_not_projected', 'over_cap')}“** — olete märkinud, aga see jääb teie enda ülempiirist välja.`,
        ],
      },
      { kind: 'figure', id: 'neli-olekut', caption: 'Veerg „Olek“ ütleb iga koolituse kohta, kuidas praegu seis on.' },
      {
        kind: 'note',
        tone: 'info',
        title: 'Mida te teiste kohta ei näe — ja miks',
        text:
          'Te näete eespool olevate partnerite märgete **mõju**, mitte kunagi seda, **kes** nad on, kui palju neid on ega kas keegi on üldse vastanud. Nii on see meelega: hinnad on raamlepingus fikseeritud, järjestus on teada ja kiirus eelist ei anna, nii et rohkem teadmist ei annaks teile midagi peale võimaluse teisi mõjutada. Vaadet liigutavad ainult kinnitused, mitte kellegi kinnitamata mustandid.',
      },
      {
        kind: 'para',
        text:
          'Ülal on ka number **„Prognoosis sinule (esialgne)“** — mitu koolitust te praeguse seisuga saaksite. Prognoos on esialgne ja võib muutuda kuni tähtajani, sest eesõigusega partnerid võivad oma valikut veel muuta. Koolitused jaotatakse rangelt raamlepingu järjestuse alusel — vastamise kiirus ei anna eelist.',
      },
      { kind: 'diagram', id: 'kaskaad' },
    ],
  },

  {
    id: 'ulempiir',
    title: 'Ülempiir, kui te seda soovite',
    rules: ['K-06', 'E-04'],
    blocks: [
      {
        kind: 'para',
        text:
          'Kinnitatud märge on siduv, nii et märkida tasub ainult seda, mida te tegelikult teha saate. Kui tahate mitut koolitust märkida, aga kõiki korraga vastu võtta ei jõua, määrake **ülempiir**: nii jäävad ülejäänud märked varuvariandiks.',
      },
      {
        kind: 'para',
        text: `Tellija otsustab iga vooru juures, kas ülempiiri saab märkida ja mille kaupa: **koolituste arvuna** („võtan vastu kuni ${capLabel(3, 'trainings')}“) või **osalejate arvuna kokku** („võtan vastu koolitusi kokku kuni 120 osalejale“). Mõnes voorus saate ise liigi valida, mõnes ülempiiri ei kasutata. Väli „Ülempiir“ näitab, mis selles voorus võimalik on; tühja välja tähendus on „piirmäära ei ole“.`,
      },
      {
        kind: 'list',
        items: [
          '**Piirmäära sees** jaotatakse teile koolitused toimumiskuupäeva järjekorras — varasem enne.',
          '**Piirmäärast välja jäävad märked** ei kao: need liiguvad järjestuses allapoole, nagu poleks te neid märkinud. Kui keegi teist tagapool need saab, on see ülempiiri tavaline tagajärg.',
          '**Osalejate arvu puhul** jäetakse koolitus, mis järelejäänud arvu sisse ei mahu, vahele ja järgmisi proovitakse edasi.',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        title: 'Ülempiir kaitseb teid, mitte tellijat',
        text:
          'Ülempiiri märkimine ei mõjuta teie kohta raamlepingu järjestuses ega järgmisi voore. See on ainus viis öelda „olen valmis, aga mitte piiramatus mahus“ nii, et süsteem sellega arvestab.',
      },
    ],
  },

  {
    id: 'kinnitamine',
    title: 'Mustand ei ole kinnitus',
    rules: ['K-02', 'K-03', 'K-04', 'K-05'],
    blocks: [
      {
        kind: 'note',
        tone: 'warning',
        title: 'Kõige tähtsam selles juhendis',
        text:
          'Linnukesed ja ülempiir on **mustand**, kuni te vajutate „Kinnita valik“. **Tähtajal loevad ainult kinnitatud märked.** Kinnitamata mustand ei anna teile mitte midagi — ja ekraan näeb välja peaaegu samamoodi nagu kinnitatult.',
      },
      {
        kind: 'para',
        text:
          'Osas „Kinnita oma valik“ on kolm nuppu. Need teevad kolme eri asja:',
      },
      {
        kind: 'list',
        items: [
          '**„Kinnita valik“** — teie vastus läheb kirja. Ainult see loeb.',
          '**„Salvesta mustand“** — märked jäävad teile alles, aga **vastust ei ole**. Kasulik siis, kui tahate enne kolleegiga rääkida.',
          '**„Loobun kõigist“** — ütlete selle vooru kohta ei. Vaadake järgmist osa.',
        ],
      },
      { kind: 'figure', id: 'kinnitamine', caption: 'Kinnitamise osa: ülempiir ja kolm nuppu.' },
      {
        kind: 'para',
        text:
          'Kui teie praegune valik erineb sellest, mille te viimati kinnitasite, on lehe ülaosas kollane hoiatus **„Kinnitamata muudatused“**, ja iga muudetud koolituse koodi kõrval sõna „muudetud“. Hoiatus ütleb ka, mis kehtima jääks, kui te midagi ei tee.',
      },
      { kind: 'figure', id: 'kinnitamata', caption: 'Kinnitamata muudatuste hoiatus. Seda ei tohi tähelepanuta jätta.' },
      {
        kind: 'para',
        text:
          'Kinnitada võite **nii mitu korda kui vaja** kuni tähtajani: iga kinnitus on eraldi kanne ja siduv on **viimane kinnitus enne tähtaega**. Kõik kanded on lehe all osas „Teie kinnituste ajalugu“, kus viimase juures seisab „Kehtib“. Nii saate valikut julgelt täpsustada, kui prognoos muutub.',
      },
      {
        kind: 'note',
        tone: 'warning',
        title: 'Kinnitatud märge on siduv',
        text:
          'Kui koolitus teile määratakse, olete kohustatud selle raamlepingu tingimustel läbi viima. Teist vastuvõtusammu ei ole — kinnitust ei küsita üle. Seepärast tasub enne kinnitamist ülempiiri üle vaadata.',
      },
      {
        kind: 'para',
        text:
          'Iga kinnituse kohta saadab süsteem teile kviitungi e-postiga: mida te märkisite, mis ülempiiriga ja mis kell. See on teie kirjalik jälg.',
      },
    ],
  },

  {
    id: 'loobumine',
    title: 'Kui ükski koolitus ei sobi',
    rules: ['K-07', 'K-08', 'E-03'],
    blocks: [
      {
        kind: 'para',
        text:
          'Loobuda võib kahel viisil ja mõlemad on võrdselt korrektsed: vajutage **„Loobun kõigist“**, või kinnitage valik, milles ei ole ühtki linnukest — süsteem küsib siis üle ja registreerib selle loobumisena.',
      },
      {
        kind: 'para',
        text:
          '**Loobumine ei mõjuta teie kohta raamlepingu järjestuses** ega teie võimalusi järgmistes voorudes. Otsust saab muuta kuni tähtajani nagu iga teist kinnitust.',
      },
      {
        kind: 'note',
        tone: 'warning',
        title: 'Vastamata jätmine on samuti loobumine',
        text:
          'Kui te tähtajaks ei kinnita, loetakse see loobumiseks kõigist selle vooru koolitustest. Vahe on ainult selles, et vaikimine läheb kirja eraldi „ei vastanud“ märkena. Kui te tegelikult tahtsite osaleda, ei ole pärast tähtaega enam midagi teha — seepärast tasub kinnitada varem kui viimasel tunnil.',
      },
      {
        kind: 'para',
        text:
          'Kuni te ei ole vastanud, on vooru lehe ülaosas kollane plokk **„Te ei ole veel vastanud“**. See kaob niipea, kui olete kinnitanud või loobunud.',
      },
      { kind: 'figure', id: 'vastamata', caption: 'Nii ütleb leht siis, kui vastust veel ei ole.' },
      {
        kind: 'para',
        text:
          '24 tundi enne tähtaega saadab süsteem meeldetuletuse, milles on kirjas, mis teie seis on: kas olete kinnitanud, loobunud või vastamata jätnud.',
      },
    ],
  },

  {
    id: 'parast-tahtaega',
    title: 'Pärast vastamistähtaega',
    rules: ['N-07', 'E-05', 'T-07'],
    blocks: [
      {
        kind: 'para',
        text:
          'Voor sulgub tähtajal ise. Pärast seda ei saa märkeid enam muuta — kui te proovite, ütleb leht, et tähtaeg on möödunud, ja katse läheb logisse. Lehe ülaosas seisab **„Vastamistähtaeg on möödunud“**.',
      },
      {
        kind: 'para',
        text: `Nüüd on kord tellijal: ta vaatab jaotusettepaneku üle ja kinnitab jaotuse. **Jaotusettepanekut te ei näe** — enne kinnitamist ei ole veel midagi otsustatud. Millal otsust oodata, on kirjas vooru lehel ja avaldamise teates. Vooru olek on seni „${ROUND_STATUS_LABELS.closed}“.`,
      },
      {
        kind: 'para',
        text:
          'Kinnitamise järel on jaotus lõplik ja voor ei muutu enam. Te saate teate ja näete tulemust vooru lehel.',
      },
    ],
  },

  {
    id: 'tellimus',
    title: 'Tellimus',
    rules: ['T-05', 'L-15'],
    blocks: [
      {
        kind: 'para',
        text:
          'Iga partneri kohta, kellele vähemalt üks koolitus määrati, koostab süsteem **tellimuse**. Raamlepingu järgi on tellimus käsitletav hankelepinguna: see on dokument, mille alusel te koolitused läbi viite.',
      },
      {
        kind: 'para',
        text:
          'Tellimused on menüüs **Tellimused**. Tellimuse lehel on osa **„Täitja“** teie ettevõtte andmetega, kinnituste ajad, kõik määratud koolitused ühikhinnaga ja kogumaksumus. Sisu on **kinnitamise hetkel külmutatud**: dokument ütleb hiljem sedasama, mida ta kokkuleppimise hetkel ütles, ja tellija näeb täpselt sama paberit.',
      },
      { kind: 'figure', id: 'tellimus', caption: 'Tellimus — sama dokument, mida näeb tellija.' },
      {
        kind: 'para',
        text: 'Eraldi failina tellimust ei saadeta. Trükkimiseks või salvestamiseks kasutage brauseri prindifunktsiooni (Ctrl/Cmd + P).',
      },
      {
        kind: 'note',
        tone: 'warning',
        title: 'Kui koolitus jääb ära',
        text:
          'Koolituse ärajäämisest või muust takistusest tuleb tellijale teatada **esimesel võimalusel**. Süsteem seda ise ei registreeri: tellimuses olev koolitus jääb sinna, kuni tellija selle tühistab.',
      },
    ],
  },

  {
    id: 'teisele',
    title: 'Kui koolitus läks teisele partnerile',
    rules: ['N-08'],
    blocks: [
      {
        kind: 'para',
        text:
          'Jaotuse kinnitamise järel tekib vooru koolituste tabelisse veerg **„Tulemus“**. Teile määratud koolituse juures seisab „Määratud teile“; koolituse juures, mille te märkisite, aga mis läks kellelegi teisele, seisab **„Määrati teisele partnerile“**. Märkimata koolituste juures ei ole midagi.',
      },
      { kind: 'figure', id: 'maarati-teisele', caption: 'Veerg „Tulemus“ pärast jaotuse kinnitamist.' },
      {
        kind: 'para',
        text:
          'Sõnastus on meelega neutraalne: **partneri nime ega põhjust ei öelda**. Selleks on kaks põhjust. Esiteks ei saa te kunagi teada teisi partnereid ega nende valikuid. Teiseks ei ole põhjus alati järjestus — tellijal on raamlepingu alusel õigus jaotust piirata, näiteks kui ühel partneril on juba palju käimasolevaid koolitusi, ja seda otsust ei avaldata samuti.',
      },
      {
        kind: 'para',
        text:
          'Sellest, et mõni koolitus läks teisele, ei järeldu midagi teie koha ega järgmiste voorude kohta. Järgmises voorus saate uuesti märkida täpselt samadel tingimustel.',
      },
    ],
  },

  {
    id: 'teavitused',
    title: 'Teated ja kes neid saab',
    rules: ['D-02', 'D-03', 'D-04', 'D-05', 'D-07', 'D-10'],
    blocks: [
      {
        kind: 'para',
        text: 'Ühe vooru jooksul koostab süsteem teile mitu teadet. Kõik need on menüüs **Teavitused** ka siis, kui kiri kohale ei jõua.',
      },
      {
        kind: 'list',
        items: [
          '**Vooru avaldamine** — koolituste loend ja vastamistähtaeg.',
          '**Kinnituse või loobumise kviitung** — iga kinnituse kohta eraldi.',
          '**Prognoosi muutus** — kui teist eespool olev partner muudab oma valikut nii, et teie prognoos muutub. Neid ei saadeta tihedamalt kui kord nelja tunni jooksul ja viimasel ööpäeval enam mitte.',
          '**Meeldetuletus** — 24 tundi enne tähtaega.',
          '**Vooru muudatus või tühistamine** — koos põhjendusega.',
          '**Tellimus** — kui teile midagi määrati.',
        ],
      },
      { kind: 'figure', id: 'teavitused', caption: 'Teavituste logi. Iga teate juures on ka see, mis e-kirjaga juhtus.' },
      {
        kind: 'para',
        text:
          'Teated lähevad **kõigile teie ettevõtte aktiivsetele esindajatele**. Iga saaja kohta on kirjas, kas kiri saadeti, ei saadetud või ebaõnnestus. Kui aadressid muutuvad — inimene vahetub, kellegi postkast suletakse —, teatage sellest tellijale: esindajate loendit haldab tema, ja loendist puuduv inimene ei saa ei teateid ega sisenemiskoodi.',
      },
    ],
  },

  {
    id: 'tore',
    title: 'Kui midagi läheb valesti',
    rules: ['L-08', 'L-18', 'E-07'],
    blocks: [
      {
        kind: 'list',
        items: [
          '**Sisenemiskood ei tule.** Kontrollige rämpsposti. Kui koodi ikka ei ole, ei pruugi teie aadress esindajate loendis olla — võtke ühendust tellijaga. Uut koodi saab küsida kolm korda veerand tunni jooksul.',
          '**Kood ei sobi.** Kood kehtib ainult ühe korra ja ainult selle aadressi jaoks, millega te seda küsisite. Vajutage „Küsi uus kood“.',
          '**Inimene või e-posti aadress vahetus.** Teatage tellijale. Aadress ongi teie sisselogimine: muidu pääseks vana aadressi omanik endiselt ligi, uus inimene aga üldse mitte.',
          '**Märkisin vale koolituse.** Kuni tähtajani muutke linnukesi ja **kinnitage uuesti** — kehtib viimane kinnitus.',
          '**Kinnitasin, aga ei saa koolitust läbi viia.** Teatage tellijale kohe. Pärast jaotuse kinnitamist on tegu tellimuse muutmisega ja seda ei saa süsteemis ise teha.',
          '**Voor kadus loendist.** Kinnitatud voorud on rühmas „Lõpetatud voorud“. Kui tellija vooru tühistas, saite selle kohta teate koos põhjendusega.',
        ],
      },
    ],
  },

  {
    id: 'reeglid',
    title: 'Kus reeglid kirjas on',
    rules: [],
    blocks: [
      {
        kind: 'para',
        text:
          'Siduvad on **raamleping „Eesti.ai koolitajate tellimine“ (RHR 10567384)** ja selle alusel esitatud teated. Käesolev juhend selgitab keskkonda, kuid ei muuda raamlepingu tingimusi.',
      },
      {
        kind: 'para',
        text:
          'Vooru korralduslikes küsimustes on kontaktisik kirjas vooru avaldamise teates ja tellimusel. Kui midagi selles juhendis on eksitav või puudu, öelge seda tellijale — juhend on selleks, et seda parandataks.',
      },
    ],
  },
];
