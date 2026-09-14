# Muudatused 13.09.2026 — äriloogika v2.5 → v2.7

**Mida läbimängul katsetati:** versioon 2.5 (seis 10.09.2026).
**Mis on nüüd üleval:** versioon 2.7 testkeskkonnas **https://kaskaadhankija-v3.fly.dev** (juurutatud 13.09.2026 õhtul; haru `claude/cascade-miniprocurement-mvp-plan-re21yp`, 16 kommitit `6e4b350…ba49556`).
**Kus reeglid on:** `docs/kaskaadi-ariloogika.md`, muudatuste logi read **2.6** ja **2.7** — iga allolev rida viitab sealsele reeglile. Partneri juhend `/juhend` on värskendatud; selle osa „Mis on uuenenud“ on nähtav ainult testkeskkonnas.

## Muudatused

| Ala | Muudatus | Kus näha | Reegel |
|---|---|---|---|
| **Partneri vaade** | Hind on hind **osaleja kohta**: tabelis veerud „Max osalejaid“ ja „Hind rühma täitumisel“, päises partneri enda „Hind osaleja kohta“. Tellija hinnangut partner enam ei näe (varem oli see igale partnerile sama „Maksumus“). | Partner → voor → tabel | T-08, L-26 |
| | Kinnitamise tulemus on lehe ülaosas plokis „Teie vastus“. Sama valiku korduskinnitus ei loo uut kannet ega kviitungit. Telefonis püsivad nupud ekraani allservas. | Partner → voor | E-10 |
| | Avatud vooru leht värskendab prognoosi ise kord minutis ja näitab seisu aega („Seis HH:MM“); sama teeb tellija maatriks. | Partner → voor; Tellija → voor | E-10, N-01 |
| | Hulgimärkimine „Märgi kõik saadaval“ / „Märgi kõik“ / „Tühjenda“. Ülempiir on sõnaselge valik: „Piirmäära ei ole“ või „Kuni N“. | Partner → voor | K-06 |
| | „Minu kalender“ — määratud ja kinnitatud koolitused kuude kaupa; märkimistabel hoiatab „Samal päeval: …“. | Partner → Kalender | N-02 |
| | Olekute sildid teie-vormis („Prognoosis teile“, „üle teie piirmäära“). | Partner → voor | N-03 |
| **Teated** | Koolituste loend on igas kirjas ühe koolituse kaupa omal real, ka HTML-kujul. | E-kiri; Teavitused | D-01 |
| | Lõppkokkuvõte **2 tundi enne tähtaega** kinnitanud partnerile: mis on prognoosis, millised märked läheksid mujale ja miks. | E-kiri; Teavitused | D-11, L-24 |
| | Vooru sulgumisel kiri „Voor on lõppenud — täname vastamast“ esialgse tulemusega. See ei ole tellimus. | E-kiri; Teavitused | D-12 |
| | Esindaja saab teabekirjad (kviitungid, prognoosi muutus, lõppkokkuvõte) enda jaoks e-postist välja lülitada; formaalsed teated tulevad alati. | Partner → Teavitused → „Teavituste seaded“ | D-10, L-27 |
| **Otsus ja protokoll** | Rakendus **ei koosta tellimusi** ega saada jaotuse kinnitamisel partnerile teateid — otsus ja tellimus vormistatakse väljaspool rakendust. Partneri menüüs „Tellimused“ on ainult neil, kel on varasem tellimus. | Tellija → voor → ülevaatus | L-25, T-04 (T-05, D-07, N-08 peatatud) |
| | Protokollis uus jaotis „Lõplik jaotus täitjate kaupa“ (kood, nimetus, kuupäev, formaat, asukoht, sihtrühm, osalejaid, hind osaleja kohta, hind max osalejate korral); jaotustabelis koolituse andmed; protokoll on vooru lehel kaardina ja voorude loendis veeruna. | Tellija → voor → „Protokoll“ | L-22 |
| **Mahuline tellimine** | **Klaster**: koolituskalendri või vooru töövihiku rida `KL-2026-001` perioodiga (`periood_algus`, `periood_lopp`, `ruhma_suurus` või `ruhmi`) jaguneb G vahetatavaks rühmaks; partner kinnitab rühmade **arvu**; jaotus käib klastri kaupa esimeste veel vabade rühmadena (koht 1 kinnitab 4, koht 2 kinnitab 6 → 01–04 ja 05–10). Voor on ühte liiki: kindla kuupäevaga koolitused või klastrid. | Tellija → Koolitused, Uus voor; Partner → klastrivoor | V-09, K-10, L-28, J-02 |
| | Hankeosal on rühma osalejate ülempiir (`max_osalejaid_ruhmas`; näidisandmetes 75 hankeosades OSA-1 ja OSA-2): kindla kuupäevaga real hoiatus, klastri rühmal keeldumine. | Tellija → Hankeosad; impordi eelvaade | K-06, L-21 |
| | Protokollis „Klastrite kokkuvõte“: iga klastri kohta iga täitja rühmade arv, numbrid ja osalejaid kokku. | Protokolli PDF ja .xlsx | L-22 |
| **Tellija tööriistad** | Ühest vooru töövihikust mustand **igale hankeosale**, mida selle koolitused puudutavad (leht „Voor“ hankeosa tühjaks). | Voorud → Uus voor → Laadi skeem üles | L-20 |
| | Raamhanke töövihiku „Selgitus“ ütleb, et „Partnerid“ on üks rida ettevõtte ja hankeosa kohta ning „Esindajad“ on lisainimesed (kontaktisik on esindaja automaatselt). | Raamhange → töövihiku mall | L-21 |
| | Teises programmis salvestatud töövihik (nimeruumi eesliidega XML) loetakse sisse. | Kõik impordid | L-21 |
| **Andmed ja sisselogimine** | Kontaktisiku vahetus **lõpetab endise kontaktisiku** esinduse: teated ja sisselogimine lõpevad samas tehingus, kui ta ei ole eraldi nimetatud ega teise hankeosa kontaktisik. Impordi eelvaade näitab, kes kaotab ja kes saab sisselogimise. | Raamhange → import või vorm | L-21, L-18 |
| | Keskkonna üks nimi on „testkeskkond“. | Riba, sisselogimisleht, juhend | — |

## Enne järgmist läbimängu

- **Kontrollige partneri vaates veergu „Hind rühma täitumisel“.** Kui seal on kümneid tuhandeid eurosid, kannab testkeskkonna andmemaht veel vanu koolituse-põhiseid hindu. Parandus: Raamhange → laadige töövihik alla → lehel „Partnerid“ kirjutage veergu `uhikuhind` hind osaleja kohta → laadige tagasi. Teine tee on värske andmemaht (halduri toiming).
- Lõppkokkuvõte tuleb ainult voorus, mis kestab **üle kahe tunni**; viieminutilises katsetusvoorus on iga kinnitus juba akna sees ja kokkuvõtet ei saadeta.
- **Klastrivoor** on valmis katsetamiseks: mustand `KL-2026-001` (OSA-2, 10 rühma × kuni 50 osalejat, okt–dets 2026) on voorude loendis; töövihik `klaster-osa2-talv-2027.xlsx` (OSA-2, 500 osalejat, jaan–märts 2027) laaditakse üles Uus voor → Laadi skeem üles.
- Partneri juhend `/juhend` on värskendatud ja tasub enne pilooti partneritele saata.

## Otsustada (tiimi ja hankespetsialistide otsused, mida rakendus ei tee)

- Kas partner näeb oma kohta järjestuses ja kas järjestus või hinnad on pakkujatele avalikud — praegu näeb partner ainult oma kohta, teisi mitte (N-04).
- Kas kõigile partneritele ühine koolituskalender (ainult olekud, ilma täitjate ja hindadeta) on soovitav.
- Lahtised punktid **L-01, L-05, L-07, L-10, L-12**: märgete muutmine akna sees, tellija kohanduste ulatus, „töömahu“ määratlus, töö- või kalendripäevad, suletud vooru tühistamine.
- Protokolli näidis hankespetsialistile: mida raport peab sisaldama (protokolli PDF ja .xlsx saab alla laadida igalt lõppenud voorult).
- Kas prognoosi muutuse teade jääb e-postis vaikimisi sisse (L-27; üherealine vaikeväärtuse muudatus).
