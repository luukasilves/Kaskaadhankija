# Kaskaadhankija — kaskaadi äriloogika

**Versioon:** 2.7 · **Kuupäev:** 13.09.2026 · **Mudel:** paralleelne kaskaad
**Staatus:** kokku lepitud tellija tiimiga. Õiguslikku või erialast ülevaatust ootavad punktid: **L-01, L-05, L-07, L-10, L-12**.
Versioon 2.7 koondab piloodi ajal tehtavad muudatused: esindaja võib teabekirjad (kviitungid, prognoosi muutus, lõppkokkuvõte) e-postist enda jaoks välja lülitada, formaalsed teated tulevad alati (D-10, L-27); nähtavuse sildid on teie-vormis (N-03) ja keskkonna nimi on „testkeskkond“; ühest töövihikust saab luua mustandi igale hankeosale, mida selle koolitused puudutavad (L-20); partneril on oma kalender ja märkimistabel hoiatab samal päeval juba olevast koolitusest (N-02). Versioon 2.6 võtab arvesse tellija tiimi esimese läbimängu (11.09.2026) tagasiside: e-kirjas on koolituste loend ühe koolituse kaupa (D-01); otsus ja tellimus vormistatakse praegu väljaspool rakendust — partner saab vooru sulgumisel kokkuvõtte esialgsest tulemusest (D-12, L-25); ühikuhind on hind ühe osaleja kohta ja partner näeb ainult oma hinda (T-08, L-26); kontaktisiku vahetus lõpetab endise kontaktisiku esinduse ja sisselogimise (L-21, L-18); kinnitanud partner saab kaks tundi enne tähtaega isikliku lõppkokkuvõtte (D-11, L-24). Versioon 2.5 võtab lubatud e-kirja saajad raamlepingu andmetest, mitte seadistatud loendist (L-19). Versioon 2.4 jagab tellija rolli kaheks (R-01): **hankija** teeb minihankeid algusest lõpuni ja näeb kõike, **admin** haldab lisaks raamhanke andmeid ja meeskonda; adminõiguse annab ainult nimeline loend (L-08), mitte terve e-posti domeen. Versioon 2.3 teeb sisselogimisest välisukse (L-08), piirab muutmise adminile (R-01), toob raamhanke andmed rakendusse (L-21), annab igale lõppenud voorule allkirjastatava protokolli (L-22) ja kaotab virtuaalkella ning näidisandmete lähtestamise (L-23). Versioon 2.1 lisas tõlgendused, mille veebirakenduse ehitamine nõudis (L-11…L-16 ja märkused J-01, V-04, E-03, N-08, T-05 juurde); ükski reegel ei muutunud — täpsustati.

---

## Kuidas seda dokumenti kasutada

See dokument on Kaskaadhankija käitumise **alusdokument**. Iga reegel kannab püsivat tunnust, näiteks **[J-04]**. Lähtekood, automaattestid ja kasutajaliidese tekstid viitavad reeglitele nende tunnuste kaudu (näiteks test `describe('[J-04] range järjestus', …)`).

Kui protsessi tuleb muuta, muudetakse **esmalt seda dokumenti** ja seejärel viiakse muudatus koodi. Dokumendi muutmine on rakenduse käitumise muutmise leping — mitte vastupidi.

Kokkulepped dokumendi pidamiseks:

- Reegleid **ei nummerdata ümber**. Kehtetuks muutunud reegel märgitakse *[tühistatud]* koos põhjusega; ajutiselt mittekehtiv reegel, mille tagasitulek on ette nähtud, märgitakse *[peatatud]* koos põhjuse ja taastamise tingimusega; uus reegel saab jaotise järgmise vaba numbri.
- Kui otsus on tehtud, aga võiks olla tehtud ka teisiti, kirjeldatakse valik **ja** alternatiivid peatükis L. Nii jääb hilisematele muutjatele arusaadav, *miks* nii otsustati.
- Iga muudatus lisatakse dokumendi lõpus olevasse muudatuste logisse.

Peatükid: **M** mõisted · **R** rollid · **V** voor · **K** märkimine ja kinnitamine · **N** nähtavus · **J** jaotusalgoritm · **T** tellija ülevaatus · **D** teavitused ja kirjalik jälg · **E** servajuhud · **L** lahtised küsimused ja alternatiivid · **Lisa A** seosed koosoleku aruteluga · **Lisa B** näide.

---

## Taust

Riigikantselei tellib Eesti.ai programmi koolitusi raamlepingu **„Eesti.ai koolitajate tellimine“** (riigihanke viitenumber 10567384) alusel. Raamlepingu partnerid on iga hankeosa piires **järjestatud** hanke hindamistulemuste alusel; esimesel kohal oleval partneril on eesõigus.

Raamleping lubab konkreetsete koolitustellimuste jagamiseks **kaht** mudelit:

1. **Klassikaline kaskaad** — tellimus esitatakse partneritele ühekaupa järjestuse alusel; kui esimene loobub või tähtajaks ei kinnita, liigutakse järgmise juurde.
2. **Korraga kõigile** — tellimuse kinnitust küsitakse kõigilt hankeosa partneritelt ühel ajal; tulemus otsustatakse järjestuse alusel. See variant lisati raamlepingusse infopäeva järel pakkujate tagasiside põhjal, et vältida „tohutut halduskoormust ja ajakulu“.

Vahepealseid mudeleid — näiteks pöördumist esmalt kümne partneri poole ja seejärel järgmise kümne poole — raamleping **ei kirjelda ja neid kasutada ei saa** („selliseid osalisi pöördumisi ei saa teha“; „kas ühe või kõigi?“).

Rakenduse **põhimudel on variant 2**, mida siin nimetatakse **paralleelseks kaskaadiks**: kõik hankeosa partnerid saavad sama koolituste komplekti ühel hetkel, märgivad vastamisakna jooksul koolitused, mida nad on valmis läbi viima, ja tulemus jaotatakse pärast tähtaega **rangelt järjestuse alusel**. Variant 1 jääb rakenduses kättesaadavaks üksiku kiireloomulise koolituse jaoks (vt V-08).

Koosolekult tulenevad siduvad piirangud, mida iga reegel allpool järgib:

- **Järjestus otsustab, mitte kiirus.** „Kes platseerus 1. või 3., peab saama neid märkida, sest temal on eelisõigus.“ Esimesena vastanud partner ei saa sellest eelist.
- **Partneril on õigus loobuda.** Raamleping jagab võimalusi, mitte kohustusi.
- **Töömahu piir (~25 koolitust) on tellija õigus, mitte kohustus.** Süsteem ei rakenda seda kunagi automaatselt.
- **Kirjalik jälg peab jääma.** Kinnitatud tellimus **on** hankeleping („tellimus ongi käsitletav hankelepinguna“).
- **Märgete muutmine vastamisakna jooksul** arutati läbi, keeldu ei tuvastatud, lõplikku otsust ei tehtud („jätaks lahti“; „oleneb prototüübist“). Seetõttu on nähtavus **seadistatav režiim**, mitte kõva eeldus.

---

## M — Mõisted

| Mõiste | Tähendus |
|---|---|
| **Raamleping** | Raamleping „Eesti.ai koolitajate tellimine“, RHR 10567384, kehtib 31.12.2027. Andmed on rakenduses muudetavad (L-21), mitte koodis. |
| **Hankeosa** | Raamlepingu osa (nt koolitused ruumirendiga, ruumirendita, veebikoolitused, suursündmused). Igal hankeosal on **oma partnerite järjestus**. |
| **Partner** | Ettevõte, kellega on hankeosas sõlmitud raamleping. Partneri nimel tegutseb tema **kontaktisik**. |
| **Järjestus, koht** | Partneri positsioon hankeosas hanke hindamistulemuste alusel. Koht 1 = kõrgeim eesõigus. Kohad on hankeosa piires unikaalsed. |
| **Koolitus** | Üks tellitav ühik: töötuba või sündmus kindla kuupäeva, asukoha, formaadi, **maksimaalse** osalejate arvu ja keelega; hind tuleneb partneri raamlepingu ühikuhinnast osaleja kohta (T-08). |
| **Ühikuhind** | Partneri raamlepingu hind **ühe osaleja kohta** ühes hankeosas; ekraanil „Hind osaleja kohta“. Igal partneril igas hankeosas oma. |
| **Hind rühma täitumisel** | Koolituse maksimaalne hind ühe partneri puhul: max osalejaid × selle partneri ühikuhind. Jaotuse summa on **hind max osalejate korral** (T-08). |
| **Voor** | Üks paralleelne kaskaad: ühe hankeosa koolituste komplekt, mis avaldatakse **kõigile** selle hankeosa aktiivsetele partneritele ühel hetkel ühe vastamistähtajaga. |
| **Vastamisaken** | Ajavahemik vooru avaldamisest tähtajani. Vaikimisi 3 tööpäeva (vt L-10). |
| **Märkimine, märge** | Partneri tahteavaldus, et ta on valmis konkreetse koolituse läbi viima. Märge on mustand, kuni see on kinnitatud. |
| **Kinnitus** | Partneri toiming, millega ta esitab oma hetkel kehtivad märked (ja piirmäära) oma siduva vastusena — raamlepingu mõistes *tellimuse täitmise kinnitus*. |
| **Loobumine** | Partneri sõnaselge teade, et ta ei võta vooru koolitusi vastu — raamlepingu mõistes *tellimuse täitmisest loobumise teade*. |
| **Piirmäär** | Partneri vabatahtlik ülempiir: „võtan vastu kuni N koolitust“ selles voorus. |
| **Prognoos** | Mida partner saaks, kui voor lõppeks praegu ja tellija midagi ei muudaks. Arvutatakse jaotusalgoritmiga hetkeseisu põhjal. |
| **Jaotus** | Jaotusalgoritmi tulemus. **Jaotusettepanek** — tähtaja hetkel külmutatud tulemus. **Lõplik jaotus** — tulemus pärast tellija lubatud kohandusi ja kinnitust. |
| **Töömahu piir** | Hankeosa seadistatav hoiatustase (vaikimisi 25 koolitust), millest alates tellijal on **õigus** partner vahele jätta või tema jaotust piirata. |
| **Tellimus** | Ühe partneri kinnitatud jaotus ühest voorust: koolituste loend koos ajatemplitega. Tellimus **on** hankeleping raamlepingu alusel. |
| **Vooru protokoll** | Lõppenud vooru terviklik kirjeldus ühe kandena: tingimused, kõik kinnitused ajatemplitega, kohandused, jaotus, tellimused, teated ja auditijälg. Koostatakse automaatselt vooru lõppedes ja kannab oma andmete SHA-256 räsi; allkirjastatakse väljaspool rakendust (L-22). |
| **Tellija** | Riigikantselei / RTK tellimismeeskond. |
| **Auditijälg** | Muutmatu (ainult lisatav) sündmuste logi, kuhu kirjutatakse iga protsessi sündmus. |

---

## R — Rollid

- **[R-01] Tellija.** Tellimismeeskonna kasutajad (rollid **admin** ja **hankija**). Loovad ja avaldavad voorud, näevad vooru kohta **kõike**, vaatavad jaotusettepaneku üle ja kinnitavad lõpliku jaotuse.
  *Täpsustus (v2.4):* mõlemad rollid **teevad minihankeid algusest lõpuni** — koolituskalendri import, vooru loomine ja skeemifailist import, avaldamine, ülevaatus, kohandused [T-02], jaotuse kinnitamine [T-04], protokoll [L-22] ja tellimuste haldus. **Admini õigus** on lisaks: raamhanke andmete muutmine [L-21] (identiteet, hankeosad, järjestus, kontaktisikud, esindajad — nii töövihikuna kui väljahaaval), tellimismeeskonna haldus (kasutaja lisamine, rolli muutmine, deaktiveerimine) ja testkeskkonnas teise osalejana tegutsemine [L-08]. **Hankija näeb kõiki neid ekraane täies mahus** — raamhange, hankeosad, partnerid, esindajad, meeskond — vormi asemel on kirjas, et muutmine on admini õigus ja mida hankija ise teha saab. Piirang on kahes kohas (iga tellija kirjutamine käib kas hanke- või adminväravast läbi), mitte iga nupu juures eraldi.
  Rollimuutus on tavaline haldustoiming: admin muudab rolli meeskonnaekraanil, muudatus läheb auditisse enne/pärast kujul, ja **viimase aktiivse admini** rolli ei saa alandada ega teda deaktiveerida — muidu jääks meeskond ilma õiguseta, millega keegi rolle tagasi anda saaks.
- **[R-02] Partneri kontaktisik.** Näeb ainult oma hankeosa voorusid, oma märkeid ja kinnitusi ning (dünaamilises režiimis) kõrgema kohaga partnerite märgete **mõju** — mitte nende identiteeti. Logib sisse oma e-posti aadressiga (ühekordne kood), kui see aadress on tellija üleslaaditud esindajate loendis (L-08, L-18). Esindajad ja asendajad kuuluvad partnerile (ettevõttele), mitte hankeosale.
- **[R-03] Süsteem.** Arvutab prognoosid ja jaotusettepaneku, jõustab tähtaja, saadab teavitused, kirjutab auditijälge. Süsteem ei tee kunagi kaalutlusotsuseid tellija asemel.

---

## V — Voor

- **[V-01] Üks hankeosa, kõik partnerid.** Voor kuulub täpselt ühte hankeossa ja avaldatakse **kõigile** selle hankeosa aktiivsetele partneritele ühel hetkel, identse sisuga. Rakenduses **ei ole ühtegi võimalust** valida partnerite alamhulka — see on raamlepingus kirjeldamata ja seetõttu keelatud.
- **[V-02] Olekud.** `mustand → avatud → suletud → kinnitatud`; lisaks `tühistatud`, kuhu saab liikuda olekust *mustand* või *avatud*. Kinnitatud vooru ei saa tühistada — selle tellimusi käsitletakse ükshaaval (E-07).
- **[V-03] Vooru sisu.** Hankeosa; vähemalt üks koolitus; vastamistähtaeg (vaikimisi hankeosa seadistuse järgi N tööpäeva avaldamisest kell HH:MM Tallinna aja järgi; tellija võib määrata hilisema tähtaja, mitte kunagi varasema); nähtavusrežiim (dünaamiline või suletud, vt N-03 ja N-06); töömahu piiri hetkeväärtus; **järjestuse hetktõmmis** — partnerite järjestus külmutatakse avaldamise hetkel.
- **[V-04] Muudatused avatud vooru ajal.** Tellija võib **pikendada** tähtaega (mitte kunagi lühendada) ja **eemaldada** koolitusi (ainult vähendada; eemaldatud koolituse märked tühistuvad). Mõlemad nõuavad põhjendust ja kõigile partneritele saadetakse teade. Koolitusi **lisada või muuta ei saa** — kinnitanud partnerid on tuginenud avaldatud tingimustele. Vajadusel tühistatakse voor ja avaldatakse uus.
  *Täpsustus (v2.1):* „märked tühistuvad“ tähendab, et eemaldatud koolitus jäetakse **jaotuse sisendi koostamisel** välja; partnerite kinnitusi ei muudeta kunagi tagantjärele, sest kinnitus on tõend (D-08). Sama koolituse hilisem uude vooru andmine (E-09) kasutab sama kirjet, nii et selle ajalugu jääb terveks.
- **[V-05] Tühistamine.** Avatud vooru tühistamisel tühistuvad kõik märked, kõiki partnereid teavitatakse põhjusega, sündmus kirjutatakse auditijälge.
- **[V-06] Tähtaeg.** Tähtaja hetkel külmutab süsteem **jaotusettepaneku** (J-05). Hilisemad partnerite toimingud lükatakse tagasi selge teatega ja logitakse. Voor liigub olekusse *suletud*.
- **[V-07] Järjestuse hetktõmmis.** Hankeosa halduses tehtud järjestuse muudatused ei mõjuta avatud vooru — voor kasutab avaldamisel külmutatud järjestust.
- **[V-08] Ühekaupa režiim.** Üksiku kiireloomulise koolituse puhul võib tellija vooru asemel kasutada klassikalist kaskaadi (tellimus ühele partnerile korraga, järjestuse alusel). Valik tehakse vooru kohta ja jääb auditijälge. Vahepealseid mudeleid „ühe“ ja „kõigi“ vahel ei ole.

---

## K — Märkimine ja kinnitamine

- **[K-01] Iga partner võib märkida iga koolituse**, sõltumata sellest, mida kuvab nähtavus. *Nähtavus informeerib, kuid ei piira.* See on ühtlasi kaitse mängurluse vastu: kui kõrgema kohaga partner märgiks alguses kõik ja loobuks viimasel hetkel, saavad madalama kohaga partnerid ikkagi oma varumärked teha, sest neid ei takistatud.
- **[K-02] Märge on mustand kuni kinnitamiseni.** Kinnitus salvestab ajatempliga **hetktõmmise** partneri kogu märgete komplektist ja piirmäärast.
- **[K-03] Ainult kinnitatud märked loevad.** Tähtaja hetkel kinnitamata mustandimuudatused jäetakse kõrvale; kehtib viimane kinnitus. Kasutajaliides peab kinnitamata muudatuste seisu kuvama **väga nähtavalt** („kinnitamata muudatused“) ja 24 tunni meeldetuletus (D-05) kordab seda.
- **[K-04] Märkeid võib muuta ja uuesti kinnitada piiramatult kuni tähtajani.** Siduv on **viimane kinnitus enne tähtaega**. *See on otsus, millel on alternatiivid — vt L-01.* Iga uus kinnitus muudab dünaamilises režiimis seda, mida madalama kohaga partnerid näevad **potentsiaalselt** saadavalolevana (N-05).
- **[K-05] Kinnitatud märge on siduv vastuvõtt.** Kui jaotusalgoritm määrab koolituse partnerile, on partner kohustatud selle raamlepingu tingimustel läbi viima. Teist vastuvõtusammu ei ole. *Alternatiiv — vt L-02.*
- **[K-06] Piirmäär.** Partner võib vooru kohta määrata ülempiiri. Tellija valib vooru loomisel (vaikimisi hankeosa seadistusest), millised piirmäära **liigid** on voorus lubatud: **koolituste arv** („võtan vastu kuni N koolitust“), **osalejate arv kokku** („võtan vastu kuni N osalejat“ — määratavate koolituste osalejate arvude summa), mõlemad (partner valib ühe) või mitte ükski. Vaikimisi piirmäära ei ole (= kõik kinnitatud märked). Piirmäära sees jaotatakse koolitused **toimumiskuupäeva järjekorras** (varasem enne), võrdsete kuupäevade puhul koolituse tunnuse järjekorras. Osalejate arvu piirmäära puhul jäetakse koolitus, mis järelejäänud eelarvesse ei mahu, **vahele ja järgmisi proovitakse edasi**. Üksiku töötoa osalejate ülempiir (raamlepingus 75) on koolituse enda omadus, mida rakendus ei kontrolli. *Alternatiivid — vt L-03, L-17.*
  *Täpsustus (v2.6):* märkimisvormil on piirmäär **sõnaselge valik** — „Piirmäära ei ole“ (vaikimisi; kõik kinnitatud märked) või „Kuni N“ koos liigiga, kui voor lubab mitut. Läbimängul jäi tühja arvuvälja tähendus arusaamatuks („panen piirmääraga vä?“). Märkimise kiirendamiseks on tabeli kohal „Märgi kõik saadaval“ (koolitused, mida eesõigusega partner ei ole kinnitanud), „Märgi kõik“ ja „Tühjenda“; K-01 kehtib endiselt — iga koolitust saab märkida ükshaaval.
- **[K-07] Sõnaselge loobumine.** „Loobun kõigist selle vooru koolitustest“ salvestatakse **loobumisteatena**, mis erineb vaikimisest. Loobumist saab kuni tähtajani muuta nagu iga kinnitust (K-04).
- **[K-08] Vastamata jätmine.** Partner, kellel tähtaja hetkel ei ole ühtegi kinnitust, saab oleku **„ei vastanud“** (loobumine vaikimisi). Ta ei saa selles voorus midagi. Olek salvestatakse eraldi sõnaselgest loobumisest.
- **[K-09] Auditijälg.** Iga märke lisamine ja eemaldamine, piirmäära muutmine, kinnitus ja loobumine kirjutatakse auditijälge ajatempli ja tegutseva kontaktisiku andmetega.

---

## N — Nähtavus (kaskaadi kuvamine)

- **[N-01] Tellija näeb kõike reaalajas.** Järjestuse alusel sorteeritud maatriks (koolitused × partnerid) kinnitatud märgetest; kinnitamata mustandid eraldi tähistatuna; piirmäärad; kinnituste ajad; jooksev prognoositud jaotus; märkimata koolitused; vastamata partnerid; iga partneri muudatuste ajalugu.
  *Täpsustus (v2.6):* „reaalajas“ tähendab, et avatud vooru leht värskendab maatriksit ja prognoosi ise umbes kord minutis, kuni aken on nähtaval, ja märgib seisu aja („Seis HH:MM“); vahepeal näidatav seis on viimase laadimise seis.
- **[N-02] Partner näeb alati:** vooru kõik koolitused täisandmetega; oma märked, piirmäära, kinnituse oleku ja ajaloo; oma koha hankeosas („koht 3/12“); tähtaja ja loenduri; oma prognoosi; hoiatuse, kui tema jooksev töömaht on hankeosa piiril või üle selle („tellijal on õigus jaotust piirata“, vt T-02).
  *Täpsustus (v2.7):* partner näeb ka **oma kalendrit** — talle määratud ja tema kinnitatud (otsus ootel) koolitused kõigist voorudest kuude kaupa —, ja märkimistabelis on koolituse kuupäeva juures hoiatus „Samal päeval: …“, kui tal on sel päeval juba määratud või teises voorus kinnitatud koolitus. Läbimängul kinnitas partner veebikoolitused ja alustas siis kohapealse vooruga, nägemata, mis aeg tal juba lubatud on. Kinnitatud märge ei ole tellimus (L-25) ja kalender ütleb seda. Teiste partnerite kalendrit partner ei näe (N-04); üldine kõigile nähtav kalender ootab nähtavuse otsust.
- **[N-03] Dünaamiline režiim (vaikimisi).** Iga koolituse juures kuvatakse partnerile üks neljast olekust, arvutatuna jaotusalgoritmiga (J) **kõrgema kohaga partnerite kinnitatud** märgete põhjal:

  | # | Olukord | Soovituslik silt |
  |---|---|---|
  | 1 | Märkimata; ükski eesõigusega partner ei ole kinnitanud | **Saadaval** |
  | 2 | Märkimata; eesõigusega partner on kinnitanud | **Eesõigusega partner on märkinud** |
  | 3 | Märgitud; prognoosi järgi läheb teile (piirmäära sees) | **Prognoosis teile** |
  | 4 | Märgitud; prognoosi järgi ei lähe teile — eesõigusega partner saab selle **või** see ületab teie piirmäära | **Märgitud, prognoosis ei ole** (koos põhjusega: *eesõigusega partner* / *üle teie piirmäära*) |

  Prognoosi koond: „Prognoosis teile: X koolitust“. *Täpsustus (v2.7):* sildid on teie-vormis nagu kogu ülejäänud rakendus ja juhend; kuni v2.6 oli „Prognoosis sinule“ ja „üle sinu piirmäära“.
- **[N-04] Partnerile ei kuvata kunagi:** ühegi teise partneri identiteeti; midagi madalama kohaga partnerite kohta; kas või millal teised on vastanud; eesõigusega märkijate arvu (*L-04*); kellegi kinnitamata mustandeid. Ainult **kinnitused** liigutavad kuva.
- **[N-05] Kõik on vastamisakna ajal esialgne — ja sildistatud sellisena.** Kuna kõrgema kohaga partnerid võivad märkeid muuta (K-04), võib koolitus kuni tähtajani liikuda oleku 1 ja 2 (või 3 ja 4) vahel. See on **oodatav käitumine**, mida selgitatakse nii kasutajaliideses („esialgne“, „prognoos“, „võib muutuda kuni tähtajani“) kui ka vooru avaldamise teates.
- **[N-06] Suletud režiim** (vooru kohta sisselülitatav, vaikimisi väljas). Reeglis N-03 kirjeldatud olekud on peidetud; prognoos kuvatakse kui „selgub pärast tähtaega“. Sama algoritm, sama jaotus. Režiim on olemas selleks, et Riina tõstatatud küsimuse — kas dünaamiline nähtavus on kooskõlas raamlepingus öelduga — saaks lahendada **ilma koodi muutmata**.
- **[N-07] Pärast tähtaega, enne tellija kinnitust** näevad partnerid teadet „tähtaeg möödus, tellija kinnitab jaotust“ — mitte jaotusettepanekut.
- **[N-08]** *[peatatud v2.6 — teadet „määrati teisele partnerile“ ei saadeta, kuni tellimus vormistatakse väljaspool rakendust (L-25); vooru lehe veerg „Tulemus“ jääb.]* **Pärast tellija kinnitust** näeb iga partner oma lõplikke koolitusi (tellimust) ning neutraalset loendit oma märgitud koolitustest, mis **„määrati teisele partnerile“** — identiteeti ega põhjust ei avaldata. Jaotamata jäänud koolitusi partneritele ei kuvata; nende edasise käigu otsustab tellija (T-06).
  *Täpsustus (v2.1):* sõnastusest jäeti välja „eesõiguse alusel“, sest see ei ole alati tõsi — pärast tellija kohandust (T-02) võib koolitus minna madalama kohaga partnerile, ja Lisa B.4 ise ütleb, et kohanduse põhjust partnerile ei avaldata. Neutraalne sõnastus kehtib kõigis kanalites: ekraanil, teavituses ja e-kirjas.
- **[N-09] Prognoos ei arvesta kunagi tellija kaalutlusõigusega kohandusi** (T-02). Prognoos peegeldab ainult automaatset algoritmi; tellija otsused tehakse pärast tähtaega.

---

## J — Jaotusalgoritm

- **[J-01] Sisendid.** Vooru koolitused (v.a eemaldatud); partnerid hetktõmmise järjestuses; iga partneri **viimane kinnitus enne lõikehetke** (märked + piirmäär); tellija kohandused (prognoosi ja jaotusettepaneku puhul tühi).
  *Täpsustus (v2.1):* „enne lõikehetke“ on **kaasav** — täpselt tähtaja hetkel antud kinnitus loeb (`kinnitatud ≤ lõikehetk`). Sama millisekundi sisse jäävad kinnitused järjestatakse kande numbri järgi, seega siduv on alati hilisem kanne.
- **[J-02] Protseduur.**

  ```
  jaotamata := vooru kõik koolitused
  iga partneri p kohta järjestuses 1..N:
      kui tellija on p selles voorus vahele jätnud: jätka järgmisega
      soovitud := p kinnitatud märked ∩ jaotamata, sorteeritud (toimumiskuupäev, tunnus)
      võta     := tühi ; eelarve := p osalejate piirmäär (kui liik on osalejate arv, muidu ∞)
      iga koolituse k kohta soovitud järjekorras:
          kui |võta| ≥ min(p koolituste piirmäär, tellija piir p-le): lõpeta
          kui k osalejate arv > eelarve: jäta k vahele, jätka järgmisega
          võta := võta + k ; eelarve := eelarve − k osalejate arv
      määra võta → p ; jaotamata := jaotamata − võta
  jääk := jaotamata
  ```
  *Täpsustus (v2.2):* koolituste arvu piir lõpetab läbikäimise; osalejate eelarve jätab mittemahtuva koolituse vahele ja jätkab (K-06, L-17). Tellija piir (T-02) on alati koolituste arv ja kehtib koos partneri piirmääraga, olgu selle liik milline tahes.
- **[J-03] Determineeritus.** Samad sisendid annavad alati sama tulemuse. Iga jaotusettepaneku ja lõpliku jaotusega salvestatakse sisendite hetktõmmis, et tulemust saaks hiljem taasarvutada ja kontrollida.
- **[J-04] Range järjestus.** Madalama kohaga partner saab koolituse ainult siis, kui iga kõrgema kohaga partner kas ei kinnitanud sellele märget, oli oma piirmäära täis või jäeti tellija poolt vahele või piirati (T-02). **Vastamise kiirus ei loe kunagi.** Rotatsiooni (väiksema koormusega partneri eelistamist) paralleelses režiimis ei kasutata — vt L-06.
- **[J-05] Üks protseduur, kolm lõikehetke.** **Prognoos** — lõikehetk on „praegu“, tellija kohandusi ei ole (kuvatakse akna ajal). **Jaotusettepanek** — lõikehetk on tähtaeg, kohandusi ei ole (külmutatakse V-06 järgi). **Lõplik jaotus** — lõikehetk on tähtaeg, tellija kohandused rakendatud (T-04). Kuva ei näita kunagi midagi, mida algoritm ei ole arvutanud.
- **[J-06] Jääk.** Koolitus, millele ühelgi partneril ei ole sobivat kinnitatud märget, jääb **jaotamata** ja liigub tellija otsusele (T-06).
- **[J-07] Invariandid.** Koolitus määratakse maksimaalselt ühele partnerile. Partneri jaotus ühest voorust ei ületa kunagi tema piirmäära — koolituste arvuna ega osalejate arvuna — ega tellija määratud piiri.

---

## T — Tellija ülevaatus ja jaotuse kinnitamine

- **[T-01] Ülevaatuse vaade.** Pärast vooru sulgumist näeb tellija jaotusettepanekut partnerite kaupa: selles voorus määratud koolituste arv ja **hind max osalejate korral** (T-08 — partneri enda ühikuhinnaga, mitte tellija hinnanguga), partneri **jooksev töömaht** (*määratlus — L-07*) ning **töömahu hoiatus**, kui töömaht ≥ hankeosa piir.
- **[T-02] Lubatud kohandused.** Igaüks **kohustusliku põhjendusega**, auditijälge kirjutatuna: **(a) vahelejätmine** — partner jäetakse selles voorus vahele, tema märked liiguvad järjestuses allapoole; **(b) piiramine** — partnerile määratakse selles voorus maksimaalselt N koolitust. **Muid kohandusi ei ole**: koolitust ei saa määrata valitud partnerile järjestust eirates ega järjestust ümber tõsta. (Alus: „õigus liikuda ränkingus järgmise pakkuja juurde … mitte kohustus“.)
- **[T-03] Töömahu piir on ainult hoiatustase.** Vaikimisi 25, seadistatav hankeosa kohta. Piir ei tee kunagi iseseisvalt midagi — otsus on alati tellija oma. *Kas kohandusi lubatakse ka hoiatuseta partnerite puhul — vt L-05.*
- **[T-04] Kinnitamine.** Pärast kohandusi arvutatakse lõplik jaotus uuesti ja kuvatakse. „**Kinnita jaotus**“ on vooru osas pöördumatu; hilisemad parandused tehakse tellimuste kaupa (E-07) või uue vooruga.
  *Täpsustus (v2.6):* kinnitamine külmutab lõpliku jaotuse, märgib koolitused määratuks ja koostab samas tehingus vooru protokolli (L-22). **Partneritele kinnitamisest teadet ei saadeta ja tellimusi ei koostata** — otsus ja tellimus vormistatakse väljaspool rakendust (L-25); partner sai vooru sulgumisel kokkuvõtte oma esialgsest tulemusest (D-12) ja näeb vooru lehel, mis on talle ette nähtud.
  *Täpsustus (v2.3):* kinnitamine koostab samas tehingus **vooru protokolli** (L-22) — allkirjastatava dokumendi kõige kohta, mida selles voorus küsiti, vastati ja otsustati. Sama juhtub avaldatud vooru tühistamisel. Kinnitatud vooru ilma protokollita ei ole.
- **[T-05] Tellimus.** *[peatatud v2.6 — rakendus ei koosta tellimusi, kuni tellija otsustab tellimuse rakenduses vormistada (L-25); masinavärk on koodis alles (`issueOrders`) ja testitud.]* Kinnitamisel luuakse iga vähemalt ühe koolitusega partneri kohta **tellimus**: koolituste loend, viide raamlepingule ja voorule, partneri siduva kinnituse aeg ja tellija kinnituse aeg. Tellimus on hankeleping raamlepingu alusel („tellimus ongi käsitletav hankelepinguna“) ning peab olema väljatrükitav ja säilitatav.
  *Täpsustus (v2.1):* tellimus koostatakse kinnitamise hetkel külmutatud hetktõmmisest ja on prinditav HTML-leht (vt L-15); tellija ja partner näevad ja prindivad sama dokumendi.
- **[T-06] Jääk.** Iga jaotamata koolituse kohta valib tellija: **(a)** uus voor kõigile partneritele (vaikimisi soovitus; kuna midagi ei määratud, võib koolituse andmeid enne muuta); **(b)** käsitsi määramine konkreetsele partnerile põhjendusega (ainult raamlepinguga lubatud juhtudel, nt telefoni teel sündinud kokkulepe); **(c)** koolituse tühistamine. Kõik logitakse.
- **[T-08] Ühikuhind ja hind max osalejate korral.** Raamlepingu **ühikuhind on hind ühe osaleja kohta** ja see on igal partneril igas hankeosas oma (L-21: veerg `uhikuhind`, ekraanil „Hind osaleja kohta“). Koolituse **osalejate arv on ülempiir** („Max osalejaid“), mitte lubadus; koolituse **hind rühma täitumisel** on max osalejaid × partneri ühikuhind ja jaotuse **hind max osalejate korral** on selle summa üle partnerile määratud koolituste. Rakendus ei arvuta ega kuva kunagi „maksumust“ — mida partnerile lõpuks makstakse, selgub raamlepingu tingimuste ja tegeliku osalejate arvu järgi väljaspool rakendust —, vaid ainult **hinda**: partnerile tema enda hinda, tellijale iga partneri hinda. Partner näeb vooru lehel oma ühikuhinda üks kord (see on hankeosas konstant) ja iga koolituse juures hinda rühma täitumisel; teiste partnerite hindu ega tellija hinnangut ta ei näe (N-04). Protokolli (L-22) külmutatakse iga partneri hind osaleja kohta ja hind max osalejate korral. Tellija koolituskalendri veerg `hinnanguline_maksumus` on tellija sisemine hinnang (L-26).
- **[T-07] Ülevaatuse aeg.** Süsteem ei jõusta tellijale tähtaega, kuid töölaud märgib voorud, mis on oodanud kinnitust üle 1 tööpäeva. Partneritele öeldakse vooru teates, millal kinnitust oodata (seadistatav; vaikimisi 2 tööpäeva pärast tähtaega; *L-09*).

---

## D — Teavitused ja kirjalik jälg

- **[D-01] Avaldamine.** Kõigile partneritele ühel hetkel: koolituste loend, tähtaeg, nähtavusrežiim, link vastamiseks, selgitus esialgsuse kohta (N-05). Koopia tellimismeeskonnale.
  *Täpsustus (v2.6):* koolituste loend esitatakse igas teates — e-kirjas ja rakenduse logis — **ühe koolituse kaupa omal real** (kood, nimetus, kuupäev, formaat, asukoht, osalejate arv). Läbimängul jooksid read e-kirjas kokku üheks lõiguks.
- **[D-02] Kinnituse kviitung.** Iga kinnitus → partnerile kviitung märgete hetktõmmise, piirmäära ja ajatempliga.
- **[D-03] Loobumise kviitung.** Iga sõnaselge loobumine → partnerile kviitung ajatempliga.
- **[D-04] Prognoosi muutus** (ainult dünaamilises režiimis). Kui partneri prognoositud koolituste arv muutub, saadetakse teade — piiratud sagedusega (vaikimisi kuni 1 teade 4 tunni kohta partneri ja vooru kohta), viimase 24 tunni jooksul prognoosi muutuse teadet ei saadeta — seisu kannavad D-05 meeldetuletus ja D-11 lõppkokkuvõte.
- **[D-05] Meeldetuletus 24 h enne tähtaega.** Igale partnerile: kinnituse olek (kinnitatud / kinnitamata / kinnitamata muudatused ootel) ja hetkeprognoos.
- **[D-06] Vooru muudatused.** Tähtaja pikendamine, koolituse eemaldamine, vooru tühistamine → kõigile partneritele koos põhjendusega.
- **[D-07] Kinnitatud jaotus.** *[peatatud v2.6 — partneritele kinnitamisest teadet ei saadeta (L-25); tellimismeeskonna koondteade koos protokolli viitega jääb.]* Igale määratud partnerile tellimuse dokument (T-05); igale partnerile, kelle märgitud koolitus läks teisele, neutraalne teade (N-08); tellimismeeskonnale koond ja jääk. *Täpsustus (v2.3):* meeskonna koondteates on ka viide **vooru protokollile** (L-22). Protokoll ise on ainult tellija poolel ja seda ei saadeta kunagi partnerile.
- **[D-08] Auditijälg on ainult lisatav.** Iga peatükkide V–T sündmus salvestatakse ajatempli, tegutseja, vooru, koolituse ning enne/pärast seisuga. Andmebaas keelab kirjete muutmise ja kustutamise. Auditijälg on **esmane tõend**; tellimuse dokumendid tuletatakse sellest.
- **[D-09] Partneri toimingute tuvastamine.** Salvestatakse tegutsev isik — sisse loginud esindaja nimi ja e-post; kui testkeskkonnas vastas partneri ekraanil tellija admin, lisandub kinnitusele ka tema nimi („testkeskkonnas tegutses: …“) ja auditijälge tema kasutajaviide — ning IP-aadress ja brauseri tunnus — ainult hanke tõendina, mitte muuks otstarbeks.
- **[D-10] Teavituste saajad ja kättetoimetamise tõend.** Partneri formaalsed teated (D-01…D-07) saadetakse e-postiga **kõigile partneri aktiivsetele esindajatele** (L-18); esindajate puudumisel hankeosa kontaktisikule. Tellimismeeskonna koopiad lähevad meeskonna postkasti või aktiivsetele adminidele. Iga saaja kohta salvestatakse eraldi kättetoimetamise kirje — saadetud, ebaõnnestus, testkeskkonnas maha surutud (L-19) või saatmata transpordi puudumisel —, ebaõnnestunud saatmist korratakse automaatselt (5 ja 30 minuti pärast, kokku kolm katset) ja tellija võib kirja logist käsitsi uuesti saata. Rakendusesisene logi jääb esmaseks kanaliks ja teate sisu tõendiks. Sisenemiskoodid (L-08) ei ole teavitused ja neid ei kirjutata ühtegi logisse.
  *Täpsustus (v2.7):* teated jagunevad kaheks. **Formaalsed** (D-01 avaldamine, D-05 meeldetuletus, D-06 muudatused ja tühistamine, D-12 vooru lõppemine, E-01 väljaarvamine) saadetakse e-postiga alati kõigile aktiivsetele esindajatele. **Teabekirjad** (D-02 ja D-03 kviitungid, D-04 prognoosi muutus, D-11 lõppkokkuvõte) saadetakse e-postiga ainult neile esindajatele, kes ei ole neid enda jaoks välja lülitanud (L-27); kui kõik esindajad on välja lülitanud, jääb teabekiri ainult rakenduse logisse — hankeosa kontaktisik ei ole sel juhul varusaaja, sest asjaosalised ise loobusid kirjast. Iga teateliik on ühte kahest kategooriast määratud koodis nii, et uut liiki ei saa lisada seda määramata.
- **[D-11] Lõppkokkuvõte kaks tundi enne tähtaega** *(v2.6)*. Dünaamilises režiimis saab iga partner, kes on vooru **kinnitanud** (mitte loobunud ega vastamata jätnud), **kaks tundi enne tähtaega** ühe isikliku kokkuvõtte: mida ta kinnitas (koolituste arv, piirmäär, kinnitamise aeg), millised koolitused talle praeguse seisuga prognoositakse (loend ühe koolituse kaupa, D-01), millised tema märgitud koolitused läheksid praeguse seisuga mujale — iga koolituse juures N-03 põhjus (*eesõigusega partner saab selle* / *ületab teie piirmäära*) — ning et prognoos on esialgne kuni tähtajani ja muuta saab ainult kinnitades. Kokkuvõtet **ei saadeta**, kui partneri viimane kinnitus on juba kahetunnise akna sees: tema kviitung (D-02) kannab sama seisu ja kaks kirja ühe seisu kohta õpetavad mõlemat ignoreerima. Loobunu tulemus on selge ja vastamata jätnule ütles D-05, et vaikimine loetakse loobumiseks — nemad kokkuvõtet ei saa. Teiste partnerite identiteeti ega arvu ei avaldata (N-04); suletud režiimis (N-06) kokkuvõtet ei ole. Saadetakse üks kord vooru ja partneri kohta; aeg on kõigile hankeosadele sama konstant (L-24). **Põhjus:** läbimängul soovis tellija tiim, et partner saaks „paar tundi enne lõpptähtaega“ teada, mis tal veel alles on — et tulemus tähtajal ei oleks emotsionaalne üllatus.
- **[D-12] Vooru lõppemise teade partnerile.** Vooru sulgumisel tähtajal saab iga partner, keda voorust välja ei arvatud — ka vastamata jätnud —, teate: vastamisaeg lõppes, tema kinnitatud valik (või et ta ei vastanud / loobus), ja **esialgse jaotuse järgi** talle minevate koolituste loend ühe koolituse kaupa (või et ühtegi ei lähe). Teade ütleb sõnaselgelt, et see on esialgne tulemus, **mitte tellimus**, ning et tellija vaatab jaotuse üle ja võtab tulemuse kinnitamiseks partneriga eraldi ühendust (L-25). Teiste partnerite identiteeti ega arvu ei avaldata (N-04). See on vooru kohta viimane teade, mille partner rakendusest saab: kinnitamisest (T-04) partnerile teadet ei lähe.

---

## E — Servajuhud

- **[E-01] Partner deaktiveeritakse avatud vooru ajal.** Partner jäetakse jaotusest välja, tema märkeid ei arvestata, partnerit ja tellijat teavitatakse, auditijälge lisatakse märkus.
- **[E-02] Ükski partner ei kinnita.** Kõik koolitused jäävad jääki → T-06.
- **[E-03] Tühja märgete komplekti kinnitamine** = loobumine (K-07).
  *Täpsustus (v2.1):* liides küsib enne kinnitamist üle („Ühtegi koolitust ei ole märgitud. Kinnitada loobumine kõigist vooru koolitustest?“) ja salvestab kande liigiga *loobumine*, mitte tühja kinnitusena — nii on loobumine hiljem eristatav vastamata jätmisest (K-08).
- **[E-04] Piirmäär on märgetest väiksem.** Jaotatakse piirmäära sees kuupäeva järjekorras; piirmäära ületavad märked — koolituste arvu puhul järjekorras järgmised, osalejate arvu puhul need, mis eelarvesse ei mahtunud — loetakse madalama kohaga partnerite suhtes märkimata koolitusteks (need „voolavad alla“).
- **[E-05] Toiming pärast tähtaega.** Lükatakse tagasi selge teatega ja logitakse.
- **[E-06] Aeg.** Kõik tähtajad Tallinna aja järgi; tööpäevad Eesti riigipühade alusel (kasutatakse sama arvutust kui v1-s: `src/domain/working-days.ts`). *Kalendri- või tööpäevad — vt L-10.*
- **[E-07] Tellimuse muutmine pärast kinnitamist.** Tellija võib määratud koolituse tühistada põhjusega (partnerit teavitatakse; koolitus võib minna uude vooru). Kui partner loobub pärast kinnitamist, salvestatakse see eraldi sündmusena („partner loobus pärast kinnitamist“) ja märgitakse lepingulise järelmenetluse jaoks — menetlus ise toimub väljaspool rakendust.
- **[E-08] Võrdsed kohad.** Kohad on hankeosa piires unikaalsed, seega viike ei teki.
- **[E-09] Koolitus on korraga maksimaalselt ühes avatud voorus.** Uude vooru viidud jääk säilitab oma tunnuse ja ajaloo.
- **[E-10] Samaaegsed toimingud.** Server järjestab kirjutamised; kehtib viimane kinnitus; partneri vaade värskendab prognoosi iga salvestuse järel **ja vähemalt kord minutis, kuni voor on avatud** (v2.6: leht laeb seisu ise uuesti, kui aken on nähtaval, ja ütleb prognoosi kõrval „Seis HH:MM“; partneri salvestamata valik jääb alles).
  *Täpsustus (v2.6):* kinnitus, mis on partneri viimase kehtiva kinnitusega sisult identne — sama märgete hulk, sama piirmäär ja selle liik ning sama liik (kinnitus või loobumine) —, ei loo uut kinnituse kannet ega uut kviitungit (D-02, D-03). Partnerile öeldakse, et valik oli juba samal kujul kinnitatud ja kehtib varasem kinnitus koos selle ajatempliga; korduskatse kirjutatakse auditijälge (K-09), kuid siduv kinnitus ja selle aeg ei muutu. Nii ei tekita topeltvajutus ega aeglane ühendus topeltkviitungeid. Kinnitamise tulemus kuvatakse vooru lehe ülaosas, mitte nupu all — telefonil jäi see tabeli taha varju ja partner vajutas uuesti.

---

## L — Lahtised küsimused ja dokumenteeritud alternatiivid

Iga punkt kirjeldab **tehtud valiku**, **alternatiive** ja **seisu**. Muudatus tehakse siin ja viiakse siis vastavatesse reeglitesse.

- **[L-01] Märgete muutmine vastamisakna jooksul.**
  **Valik:** aken on lahti kuni tähtajani, viimane kinnitus on siduv (K-04); iga muudatus värskendab dünaamiliselt madalamate kohtade jaoks *potentsiaalselt* saadaval olevat (N-05).
  **Alternatiivid:** (a) lukustamine esimese kinnituse järel; (b) ainult lisamine lubatud, eemaldamine mitte — vähendab kõikumist ja blokeerimismängu, säilitab paindlikkuse.
  **Koosoleku seis:** Kirke küsis, kas partner võib sama päringu raames 3 päeva jooksul oma valikuid muuta ja juurde panna. Riina: „see 3 päeva on neil seal aega toimetada … ma jätaks selle ikkagi lahti“. Kadri: „see oleneb prototüübist“ — tehniline, mitte õiguslik vastus. Lõplikku otsust ei tehtud, keeldu ei tuvastatud. Riina varasem küsimus puudutas kooskõla raamlepingus öelduga, mitte riigihankeõiguse keeldu.
  **Seis:** vajab õiguslikku kinnitust raamlepingu sõnastusega kooskõla osas.

- **[L-02] Märgete siduvus ja piirmäär.**
  **Valik:** kinnitatud märge on siduv vastuvõtt; kaitseks vabatahtlik piirmäär (K-05, K-06).
  **Alternatiiv:** kaheastmeline — märked on huviavaldus, pärast jaotust kinnitab või loobub iga määratud partner oma komplektist, loobutu läheb uude vooru. Ükski partner ei ole varumärkega seotud, kuid protsess pikeneb päevade võrra ja tekib teine loobumisvõimalus.
  **Seis:** otsustatud tellija tiimiga; võib ümber vaadata, kui partnerite tagasiside seda nõuab.

- **[L-03] Järjekord piirmäära sees.**
  **Valik:** toimumiskuupäeva järjekorras (K-06). Deterministlik, ei vaja liidest.
  **Alternatiiv:** partneri enda määratud eelistusjärjekord (lohistatav loend).
  **Seis:** otsustatud; alternatiiv on lisatav hiljem.

- **[L-04] Dünaamilise kuva sisu.**
  **Valik:** neli olekut (N-03), ilma arvude ja identiteedita.
  **Alternatiivid:** (a) kuvada ka eesõigusega märkijate arv; (b) ainult suletud režiim.
  **Märkus:** koha 2 partner näeb paratamatult koha 1 partneri kinnitatud märgete mõju üheselt. Hind osaleja kohta on raamlepingus fikseeritud, seega see teave ei võimalda „üle pakkuda“, vaid ainult planeerida.
  **Seis:** otsustatud; kuulub L-01 õigusliku ülevaatuse juurde.

- **[L-05] Tellija kohanduste ulatus.**
  **Valik:** vahelejätmine ja piiramine on lubatud iga partneri puhul kohustusliku põhjendusega; töömahu piir annab hoiatuse (T-02, T-03).
  **Alternatiiv:** kohandused lubatud ainult hoiatusega partnerite puhul.
  **Seis:** vajab kinnitust — raamlepingu õigus on seotud suure töömahuga; kas rakendus peab seda tehniliselt piirama või piisab põhjendusest.

- **[L-06] Rotatsioon.**
  **Valik:** paralleelses režiimis ei kasutata; ainult range järjestus (J-04). Raamlepingu tasakaalustusmehhanism on tellija kaalutlusõigusel põhinev vahelejätmine, mitte automaatne rotatsioon.
  **Seis:** otsustatud.

- **[L-07] „Töömahu“ määratlus töömahu piiri arvutamisel.**
  **Ettepanek:** partnerile selles hankeosas määratud, veel lõpetamata koolituste arv.
  **Alternatiivid:** kõigi hankeosade peale kokku; kalendrikuu kohta; kindla perioodi kohta.
  **Seis:** **vajab erialast sisendit** — „25“ millise perioodi ja ulatuse kohta?

- **[L-08] Autentimine.**
  **Valik:** sisselogimine e-posti aadressile saadetava ühekordse kuuekohalise koodiga; aadress peab kuuluma tellimismeeskonna kasutajale või partneri aktiivsele esindajale (L-18). Sessioon kestab 30 päeva; kood kehtib 10 minutit ja ühe korra, viies vale katse kustutab koodi, päringute sagedus aadressi ja IP kohta on piiratud; salvestatakse ainult koodi võtmega räsi (HMAC) ja sessioonitunnuse räsi. Vastus koodipäringule on sama olenemata sellest, kas aadress on loendis.
  **Sisselogimine on välisuks mõlemas keskkonnas** (v2.3): ilma sessioonita ei näe keegi ühtki osaleja vaadet. Näidiskeskkonnas maandub tellimismeeskonna **admin** pärast igat sisselogimist valikulehel „Kellena tegutseda“ ja võib valida osaleja, kelle vaates keskkonda vaadata; **sessioon jääb kehtima**, osaleja vahetamine seda ei lõpeta ja välja logimine tühistab mõlemad. Hankija ja partneri esindaja valikut ei näe ning maanduvad otse oma alale. Osaleja kaudu tehtud toiming salvestatakse selle osaleja nimel, kuid auditijälg kannab lisaks sisse loginud admini nime ja kinnituse tõend (D-09) lisandit „testkeskkonnas tegutses: …“. Väljaspool näidiskeskkonda valikulehte ei ole.
  **Nimeline loend (v2.4, valitud).** `AUTO_ADMIN_ALLOWLIST` ütleb, kes saab sisse logida **adminina** ilma et keegi ta enne loendisse lisaks. Kirje, milles on kasutajanimi (`luukas.ilves@riigikantselei.ee`), tähendab **üht inimest**; kirje, milles on ainult domeen (`@naidis.ee`), tähendab kõiki selle domeeni postkastide valdajaid. Testkeskkonnas on loendis **üks nimeline aadress**; terve domeeni kirje jääb ainult ühekordsetele testkeskkondadele, kus loendi pidamine ei ole mõttekas. Kasutajakirje tekib ainult **koodi kinnitamisel**, mitte koodi küsimisel — nii ei saa väljamõeldud kolleegide aadressidega meeskonda täita. Deaktiveeritud kasutajat loend tagasi ei too: väljalülitamine on tahtlik otsus. Kui aadress on juba loendis (tellija kasutaja või partneri esindaja), kehtib see identiteet, mitte loend — loend loob admini, aga ei tõsta kunagi olemasolevat hankijat adminiks.
  **Kõik ülejäänud lisab admin ise** meeskonnaekraanil, ja lisatav inimene algab **hankijana** [R-01]: voore saab teha kohe, raamlepingu andmeid ja meeskonda muudab admin. Sama kehtib seadistusest seemendatud meeskonnaliikmele (`SEED_TEAM`) — admini rolli tuleb kirjes nimeliselt küsida.
  **Jääkrisk:** esimene admin pääseb ligi ühe postkasti kaudu, nii et selle postkasti turvalisus on ligipääsu turvalisus; loendist kustutatud aadressi kasutaja jääb alles seni, kuni admin ta deaktiveerib. Sisselogimislehel on kirjas, **mitu** kirjet loendis on (mitte kelle aadress see on) — see on ka ainus asi, mille põhjal juurutus tuvastab, et seadistus jõudis masinasse. „Meeskond“ näitab loendi kuju ja ütleb, et terve domeeni kirje annaks adminiõiguse igale selle postkasti valdajale.
  **Alternatiivid:** (a) isiklik tokeniga link (v1); (b) kasutajakonto parooliga; (c) riiklik autentimine (TARA / Smart-ID / Mobiil-ID); (d) ~~ainult nimeline loend, ilma domeenireeglita~~ — **valitud v2.4-s**; varem kehtis ajutine domeenireegel (`AUTO_ADMIN_EMAIL_DOMAINS`), mille alusel sai iga `@riigikantselei.ee` postkasti valdaja adminiks; see oli testimise mugavusotsus ja on nüüd asendatud.
  **Märkus:** e-posti kood tuvastab postkasti, mitte kvalifitseeritud allkirjaõigust. Kui õiguslik hinnang nõuab tugevamat tuvastamist, on koodis selleks üks liides — `sessionActor()` —, mida vahetada; ülejäänud rakendus küsib ainult „kes tegutseb“.
  **Seis:** otsustatud tellija tiimiga (september 2026); tugevama tuvastamise vajadus jääb õigusliku ülevaatuse küsimuseks.

- **[L-09] Tellija ülevaatuse aeg.**
  **Valik:** vaikimisi 2 tööpäeva pärast tähtaega (T-07). Raamlepingus alust ei tuvastatud.
  **Seis:** kinnitada.

- **[L-10] „3 päeva“ — töö- või kalendripäevad?**
  **Ettepanek:** tööpäevad Eesti tava kohaselt (E-06).
  **Seis:** **kinnitada spetsialistidega.**

- **[L-11] Mida partneri olekuveerg järgib — mustandit või kinnitust?**
  **Valik:** neli olekut (N-03) arvutatakse partneri **mustandi** järgi, sest märke mõju peab olema näha enne kinnitamist (E-10). Kui mustand erineb viimasest kinnitusest, kuvatakse silmatorkav hoiatus (K-03) ja mõlemad arvud: „Prognoosis teile (esialgne) X · kinnitatud seisuga Y“.
  **Alternatiiv:** olekud ainult kinnitatud märgete järgi — üheselt tõene, kuid partner ei näe oma kavandatava valiku mõju enne, kui on end sellega sidunud.
  **Seis:** otsustatud; hoiatus on selle valiku hind ja peab jääma nähtavaks.

- **[L-12] Suletud vooru tühistamine.**
  **Valik:** V-02 ei sisalda üleminekut `suletud → tühistatud`. Suletud voor lõpetatakse kinnitamisega; kui midagi ei tohi määrata, jäetakse ülevaatusel kõik partnerid vahele (T-02), kõik koolitused muutuvad jäägiks ja neid käsitletakse T-06 alusel.
  **Alternatiiv:** lubada suletud vooru tühistamine põhjendusega — lühem tee, kuid jätab partnerite kinnitused ilma nähtava tulemuseta.
  **Seis:** **vajab spetsialistide seisukohta** — kas jäägi tee on piisav.

- **[L-13] Kes saab prognoosi muutuse teate (D-04)?**
  **Valik:** teade läheb neile partneritele, kelle prognoos muutus **kellegi teise** kinnituse tõttu. Kinnitanud partner ise selle teate ei saa — tema kinnituse kviitung (D-02) juba sisaldab tema uut prognoosi, ja kaks teadet ühe toimingu kohta õpetab mõlemat ignoreerima.
  **Alternatiiv:** teade ka kinnitajale, D-04 sõnastuse järgi tähttäheliselt.
  **Seis:** otsustatud; sagedusepiirang (4 h) ja viimase 24 tunni vaikus jäävad D-04 järgi kehtima. *Täpsustus (v2.6):* viimase ööpäeva seisu kannavad D-05 meeldetuletus ja D-11 lõppkokkuvõte, mis läheb ainult kinnitanud partneritele.

- **[L-14] Töömahu hoiatuse künnise näidisväärtus.**
  **Valik:** näidiskeskkonnas on hankeosa OSA-2 künnis **4** koolitust, mitte 25, et T-01 hoiatus oleks testimisel üldse saavutatav. Ekraanil on see märgitud testväärtusena.
  **Seis:** näidisandmete otsus; päris keskkonnas tuleb künnis L-07 vastuse alusel seadistada. *Täpsustus (v2.3):* väärtus tuleb üleslaaditud raamhanke andmetest (L-21), mitte koodis olevast näidisloendist.

- **[L-15] Loobumise ja tellimuse dokumendi keel.**
  **Valik:** tellimuse dokument (T-05) on prinditav HTML-leht, mis koostatakse kinnitamise hetkel külmutatud hetktõmmisest — mitte päringutest, sest leping peab hiljem ütlema sedasama, mida kinnitamise hetkel.
  **Alternatiiv:** PDF-eksport serveris.
  **Seis:** otsustatud MVP jaoks; PDF lisatav hiljem. *Täpsustus (v2.3):* PDF on serveris olemas, aga **vooru protokolli** jaoks (L-22), kus dokument allkirjastatakse ja peab kandma sõrmejälge. Tellimus jääb prinditavaks HTML-leheks: seda vaatab ja prindib ka partner, ja seal on ekraanil olev dokument sama, mis paberil.

- **[L-16] Näidisandmete ausus.**
  **Valik:** näidisstsenaariumid koostatakse **päris mootorikutsetega**, mitte käsitsi kirjutatud ridadena, ja koolitus märgitakse läbiviiduks ainult siis, kui selle toimumiskuupäev on möödas.
  **Põhjendus:** auditijälg, teavituste logi ja külmutatud hetktõmmised peavad olema tõesed ka näidiskeskkonnas — vastasel juhul näidatakse spetsialistidele midagi, mida süsteem tegelikult ei tee.
  **Seis:** otsustatud. *Täpsustus (v2.3):* virtuaalkell on kaotatud (L-23), seega ei kerita stsenaariumide koostamisel kella tagasi, vaid iga samm saab oma **tagasiarvutatud hetke** (avaldamine 15 tööpäeva tagasi jne). Põhimõte ise ei muutunud.

- **[L-17] Piirmäära liik: koolituste või osalejate arv.**
  **Valik:** tellija määrab vooru kohta (vaikimisi hankeosa seadistusest), millised piirmäära liigid on partneritele lubatud — koolituste arv, osalejate arv kokku, mõlemad või mitte ükski; partner valib kinnitamisel ühe liigi ja väärtuse (K-06). Osalejate eelarve puhul jäetakse mittemahtuv koolitus vahele ja proovitakse järgmisi — deterministlik ja kasutab eelarvet paremini kui peatumine.
  **Alternatiivid:** (a) partner võib kasutada mõlemat liiki korraga („kuni N koolitust ja kuni M osalejat“); (b) osalejate eelarve puhul peatuda esimese mittemahtuva koolituse juures — lihtsam sõnastada, aga jätab eelarvet kasutamata; (c) tellija ülevaatuse piirang (T-02) ka osalejate arvuna — praegu ainult koolituste arv.
  **Märkus:** üksiku töötoa osalejate ülempiir (raamlepingus 75) on koolituse enda omadus ja rakendus seda ei kontrolli. Enne v2.2 külmutatud hetktõmmised ei sisalda koolituste osalejate arve; need täiendatakse lugemisel koolituse andmetest, mis jaotust ei muuda, sest neis voorudes osalejate piirmäära ei olnud.
  **Seis:** otsustatud tellija tiimiga (september 2026).

- **[L-18] Partneri esindajate loend.**
  **Valik:** tellija laadib üles partnerite lepinguliste esindajate ja asendajate loendi (registrikood, nimi, e-post, roll, telefon). Identiteet on (partner, e-post): uuesti laadimine uuendab, mitte ei dubleeri. Aadress võib olla aktiivne ainult ühe partneri esindajana ega tohi kattuda tellimismeeskonna kasutaja aadressiga. Esindajad on ühtaegu teadete saajad (D-10) ja sisselogijad (L-08). Hankeosa kontaktisik raamlepingu andmetes jääb tõendiks ja varusaajaks.
  **Alternatiiv:** esindajad hankeosa kohta — täpsem, aga sama inimene esindab ettevõtet tavaliselt kõigis hankeosades.
  **Seis:** otsustatud tellija tiimiga (september 2026). *Täpsustus (v2.3):* loend on raamhanke andmete töövihiku leht „Esindajad“ (L-21) ja sinna käivad **lisainimesed peale raamlepingu kontaktisiku** — kontaktisik ise tekib järjestusest automaatselt. Iga kirje kannab päritolu (`raamleping` / `üleslaaditud` / `käsitsi`). *Täpsustus (v2.6):* päritolu on **ainult teave**, mitte otsuse alus — v2.3 reegel „kirje omanik on see, kes ta viimati aktiveeris“ jättis kontaktisiku vahetusel endise kontaktisiku aktiivseks, kui ta oli kordki esindajate lehel nimetatud (nii oli see igas näidisandmestikus). Esinduse aktiivsuse otsustavad **kaks teineteisest sõltumatut alust** (L-21): isik on kas mõne aktiivse osaluse **praegune kontaktisik** või on tellija ta **eraldi nimetanud** (leht „Esindajad“ või vorm „Lisa esindaja“) ajal, mil ta kontaktisik ei olnud. Esindajate lehe „lõpeta puuduvad“ ja ekraani lüliti puudutavad ainult eraldi nimetamist; praegust kontaktisikut ei saa kummagi kaudu välja lülitada — tema esindus lõpeb kontaktisiku vahetusega järjestuses.

- **[L-19] Lubatud saajad.**
  **Valik:** e-kirja saadetakse ainult siis, kui saaja aadress on **lubatud saajate hulgas**. Hulk koosneb kahest osast:
  1. **raamlepingu andmetest tuletatud aadressid** — iga aktiivne partneri esindaja (L-18) ja iga aktiivse hankeosa osaluse kontaktisik. Neid ei seadistata kusagil: need tekivad koos raamhanke andmete üleslaadimisega ja kaovad koos esindaja või osaluse deaktiveerimisega;
  2. **seadistatud loend** (`EMAIL_ALLOWED_RECIPIENTS`) — aadressid ja terved domeenid, mis **ei ole** raamlepingus: tellimismeeskond, meeskonna postkast, katsetajad.

  Iga muu saaja kohta salvestatakse kättetoimetamise kirje „maha surutud“ ja kirja ei üritatagi saata. Kui mõlemad osad on tühjad — raamlepingu andmeid ei ole ja loendit ei ole —, ei saadeta näidiskeskkonnas midagi. `*` avab loendi kõigile, see on eraldi teadlik valik.

  **Tuletatud hulk ei tohi olla kitsam kui sisselogimisõigus (L-08):** kui aadress saab koodi küsida, peab ta selle ka kätte saama. Seepärast loeb esindaja puhul ainult esindaja enda aktiivsus, mitte ettevõtte oma.
  **Põhjendus:** kirju tuleb saata neile, kellega raamleping on sõlmitud, ja mitte kellelegi teisele. Varem tuli iga pakkuja domeen käsitsi loendisse lisada — see oli tegevus, mis jäi tegemata, ja tulemus oli, et päris partner ei saanud ei vooruteadet ega sisenemiskoodi. Loend, mida tellija juba peab (raamhanke andmed), on õigem allikas kui loend, mida keegi peaks eraldi pidama.
  **Jääkrisk:** üleslaaditud kontaktaadressi kirjaviga jõuab nüüd päris postkasti, mitte ei jää maha surutuks. Absoluutsed peatajad on endised: `EMAIL_DEV_MODE=1` kirjutab kirjad logisse, ja ilma SMTP seadistuseta ei saadeta midagi.
  **Seis:** otsustatud (v2.5).

- **[L-20] Vooru skeemi üleslaadimine tabelina.**
  **Valik:** tellija võib ühe kaskaadivooru kirjeldada Exceli töövihikuna (leht „Voor“ — hankeosa, nähtavus, piirmäära liigid, lisatööpäevad, märkus; leht „Koolitused“ — koolituskalendri impordi veerud). Üleslaadimine loob **mustandi**: koolitused luuakse või uuendatakse sama koodi kaudu, mida kasutab koolituskalendri import, ja voor luuakse nende peale. **Avaldamine on eraldi, auditeeritav toiming rakenduses** — avaldamise hetk, tähtaeg ja partnerite järjestuse külmutamine ei ole kunagi failis. Import on kõik-või-midagi: ühegi veaga rea, teise hankeosa koolituse või juba voorus oleva koolituse puhul vooru ei looda.
  **Alternatiivid:** (a) lubada osaline import (korras read vooru, vigased välja) — kiirem, aga tekitab vooru, mis ei vasta skeemile; (b) lubada failis avaldamise kuupäeva — võtaks tellijalt ära hetke, mil ta vaatab mustandi üle.
  *Täpsustus (v2.3):* fail võib kanda **kavandatud akent** — väljad `avaldamine` ja `vastamistahtaeg` (kuupäev ja kellaaeg; ainult kuupäeva puhul kehtib hankeosa kellaaeg). See on **plaan, mitte fakt**: mustandi lehel on see kirjas, avaldamisvorm pakub tähtaega ette, ja päris hetked määrab avaldamine. Mootor jõustab endiselt hankeosa alampiiri **avaldamise tegelikust hetkest** — libisenud plaani puhul pakutakse alampiiri, tähtaega lühemaks ei tehta (V-04). `vastamistahtaeg` ja `lisatoopaevad` on alternatiivid, mõlemad korraga on viga.
  *Täpsustus (v2.7):* leht „Voor“ võib jätta **hankeosa tühjaks** — siis rühmitatakse lehe „Koolitused“ read hankeosa kaupa ja ühe impordiga luuakse **iga hankeosa kohta oma mustand**. Voor jääb ühe hankeosa vooruks (J-04: järjestus, vastamisaeg ja kaskaadi järjekord tulevad hankeosast); mitut hankeosa võib kirjeldada fail, mitte voor. Kõik-või-midagi kehtib faili kohta tervikuna: ühe veaga rea puhul ei looda ühtki mustandit. Kui hankeosa on täidetud, peavad kõik read olema selles hankeosas nagu seni. Ainult kuupäevaga vastamistähtaeg võtab iga hankeosa oma kellaaja. Tellija tiim küsis kahel korral, kas nelja hankeosa koolitused ei võiks olla ühes failis — võivad.
  **Seis:** otsustatud tellija tiimiga (september 2026). Mall laaditakse alla rakendusest, eeltäidetud hankeosa jaotamata koolitustega.

- **[L-21] Raamhanke andmete haldus.**
  **Valik:** raamhange ise on **andmed rakenduses**, mitte kood. Ühel ekraanil („Raamhange“, ainult admin) on raamlepingu identiteet (nimetus, riigihanke viitenumber, raamlepingu number, tellija, kehtivus), hankeosad koos kaskaadiseadetega, iga hankeosa partnerite järjestus koos raamlepingu kontaktisikutega ja esindajad. Kõike saab muuta **kahel teel: töövihikuna üles laadides või välja haaval ekraanil** — mõlemad kutsuvad samu funktsioone, nii et teed ei saa lahku minna. Töövihikul on lehed **Raamleping**, **Hankeosad**, **Partnerid** ja **Esindajad**; kolm esimest peale „Partnerid“ on vabatahtlikud (puuduv leht tähendab „jäta muutmata“) ja **tühi lahter tähendab „jäta muutmata“**, mis teeb alla laadida → muuda → laadi tagasi ohutuks. Import on kõik-või-midagi (nagu L-20) ja eelvaade ütleb ette, mis muutuks — sh kes kaotaks koha ja kes ei saaks enam sisse logida. Hankeosa koodi järgi tehakse uus või uuendatakse olemasolev; failist puuduvat hankeosa ei kustutata kunagi ja arvatakse välja ainult valikuga „lõpeta puuduvad“ ning ainult siis, kui tal ei ole mustandit, avatud ega ootel vooru.
  **Kontaktisik on sisselogimine.** Hankeosa raamlepingu kontaktisiku aadress peegeldatakse esindajate loendisse, seega talle lähevad formaalsed teated (D-10) ja tema saab sisse logida (L-08) — üks aadress esindab ühte ettevõtet, ja aadress, mis ei saa olla sisselogimine (tellimismeeskonna kasutaja või teise partneri aktiivne esindaja), lükatakse eelvaates tagasi.
  **Kontaktisiku vahetus lõpetab endise kontaktisiku esinduse** *(v2.6)*. Esindaja kirje on aktiivne siis ja ainult siis, kui kehtib vähemalt üks kahest alusest: (1) ta on mõne partneri aktiivse osaluse **praegune kontaktisik** — see tuletatakse järjestusest igal muudatusel, seda ei salvestata eraldi; (2) tellija on ta **eraldi nimetanud** (töövihiku leht „Esindajad“, vorm „Lisa esindaja“ või ekraanil taastamine) ajal, mil ta ei olnud kontaktisik — see salvestatakse kirjel. Kui kontaktisik vahetub ja endine ei ole eraldi nimetatud ega ühegi teise osaluse kontaktisik, lõpetatakse tema esindus samas tehingus: ta ei saa enam teateid ega sisse logida, ja tema kehtiv sessioon lõpeb järgmisel päringul. **Praeguse kontaktisiku nimetamine esindajate lehel ei tee temast eraldi esindajat** — see uuendab ainult rolli ja telefoni —, muidu jääks iga kordki nimetatud kontaktisik pärast vahetust alles. Et endine kontaktisik jääks esindajaks, nimetatakse ta pärast vahetust: samas töövihikus lehel „Esindajad“ (järjestus rakendatakse enne esindajaid), vormi valikuga „Jäta endine kontaktisik esindajaks“ või hiljem „Lisa esindaja“ kaudu. Sama inimene mitme hankeosa kontaktisikuna: vorm pakub vahetust kõigis neis hankeosades korraga (vaikimisi valitud, sest kontaktisiku vahetus tähendab enamasti inimese lahkumist); ainult ühes hankeosas vahetatud kontaktisik jääb teiste kaudu esindajaks ja vorm ütleb seda. **Allalaaditud töövihik on terviklik:** rakenduse enda koostatud fail kannab märgist ja tema tagasilaadimisel on „lõpeta failist puuduvad“ eelvaates vaikimisi valitud — failist puuduv osalus, hankeosa või eraldi nimetatud esindaja lõpetatakse; eelvaade loetleb enne kinnitamist, kes kaotab ja kes saab sisselogimise ning kes jääb kontaktisikuks mujal. Muu päritoluga faili puhul on valik vaikimisi maas.
  **Iga muudatus on logitud.** Nii failist kui käsitsi tehtud muudatus kirjutab auditijälge enne/pärast oleku; sama logi on kokkuvõttena ekraani lõpus („Muudatuste logi“), sest järjestus ja kontaktaadressid otsustavad, kellele tööd pakutakse ja kes sisse saab.
  **Põhjendus:** hanke tulemus saabub tabelina, seega on tabel ka õige tee sisse — aga ühe kirjavea parandamiseks ei tohi olla vaja Excelit avada. Identiteedi andmeks tegemine oli ühtlasi eeldus vooru protokollile (L-22), mis peab selle välja trükkima.
  **Alternatiivid:** (a) ainult import — lihtsam, aga iga parandus nõuab faili; (b) ainult ekraan — järjestuse esmakordne sisestamine käsitsi on 17 rida käsitööd ja veakindel ei ole; (c) hankeosade loomine ainult seemnest nagu v2 — tähendab, et päris raamhankega alustamine nõuab koodimuudatust.
  **Seis:** otsustatud tellija tiimiga (september 2026).

- **[L-22] Vooru protokoll.**
  **Valik:** iga lõppenud voor saab **protokolli** — ühe kande, mis koostatakse automaatselt vooru lõpetavas tehingus: jaotuse kinnitamisel (T-04) ja avaldatud vooru tühistamisel. Mustandit, mida ükski partner ei näinud, ei protokollita. Protokoll sisaldab vooru tingimusi (nähtavus, piirmäära liigid, koormuse künnis ja vastamisaeg avaldamise seisuga, kavandatud ja tegelik aken, tähtaja pikendamised põhjendustega, lõikehetk), koolitusi koos voorust tagasi võetutega, osalejaid **külmutatud järjestuses**, **kõiki kinnitusi saabumise järjekorras** koos ajatempli, märgete, piirmäära ja kinnitaja nimega (siduv on tähistatud), tellija kohandusi põhjendustega, jaotusettepanekut kõrvuti lõpliku jaotusega, kaskaadi käiku, tellimusi, saadetud teateid ja vooru auditijälge.
  **Ainult salvestatud andmetest.** Midagi ei arvutata protokolli koostamise hetkel uuesti: jaotuse hetktõmmised kopeeritakse nii, nagu voor need salvestas, tähtaja lugu loetakse seda muutnud auditikannetest, kontaktisikud tulevad avaldamise hetktõmmisest. Muidu ütleks eile tehtud otsuse protokoll seda, mida tänane seadistus arvutab.
  **Üks kanne, üks räsi.** Salvestatakse **kanooniline JSON** ja täpselt selle teksti SHA-256; sama räsi kirjutatakse auditijälge (`protocol.generated`). PDF ja .xlsx lisa **renderdatakse sellest kandest nõudmisel**, seega paberil olev sõrmejälg (räsi esimesed 16 märki) nimetab alati andmeid, mitte joonistajat. Kui salvestatud tekst ei vasta enam oma räsile, dokumenti ei väljastata.
  **Mis kummas.** PDF on allkirjastatav dokument. .xlsx lisa kannab sama sisu tabelitena ning **ainult seal** on kinnituste tehnilised tõendid (IP-aadress, brauseri tunnus) — need on hanke tõend (D-09), mitte trükise osa. E-kirjade kättetoimetamise seisud ei ole protokollis: kirjad väljuvad pärast kande salvestamist ja nende lugu on teavituste logis (D-10). Protokoll on **ainult tellija poolel**: see nimetab iga partneri pakkumise, mida ükski partner näha ei tohi (N-08).
  **Kinnitamine on väljaspool.** Protokolli kinnitab tellija oma korra järgi väljaspool rakendust; rakendus kinnitust tagasi ei kanna, sest allkirja hoidmine tähendaks tõendit, mille kohta rakendus ei saa midagi lubada.
  *Täpsustus (v2.6):* kuna tellimusi rakenduses ei koostata (L-25), on kinnitatud vooru protokollis tellimuste jaotis tühi; jaotus ise — iga koolituse lõplik täitja — on protokollis ja see on dokument, mille alusel tellija otsuse ja tellimuse väljaspool vormistab. Läbimängu järel sai protokoll jaotise **„Lõplik jaotus täitjate kaupa“** — iga täitja koolitused koodi, nimetuse, kuupäeva, formaadi, asukoha, sihtrühma ja osalejate arvuga, nii PDF-is kui .xlsx lisas (leht „Täitjate kaupa“) —, jaotustabel näitab koolituse nimetust, kuupäeva ja formaati, koolituste tabel sihtrühma; andmestruktuur on versioon 2 (varasemad kanded jäävad muutmata). Protokoll on tellijale vooru lehel kaardina alates vooru lõppemisest, sest läbimängul ei leitud seda üles.
  **Vanad voorud.** Enne protokollide kasutuselevõttu lõppenud vooru kohta saab admin protokolli koostada käsitsi — sama koostaja, samad salvestatud andmed; koostamise hetk on dokumendil. Kui protokoll on juba olemas, ei asendata seda kunagi.
  **Põhjendus:** vooru tulemuse formaalne kinnitamine käib hankekorra järgi paberil, ja selleks peab olema üks dokument, mis ütleb kõik: mida küsiti, kes mida vastas ja millal, mida tellija muutis ja mis sellest sai. Räsi teeb dokumendist tõendi, mille muutmine on tuvastatav, ilma et rakendus peaks pidama allkirjaregistrit.
  **Alternatiivid:** (a) salvestada renderdatud PDF blob'ina — siis on dokument tõend, aga vormi parandamine nõuab uut allkirja ja andmeid ei saa hiljem teisiti kuvada; (b) prinditav HTML nagu tellimusel (L-15) — brauseri prindivaade ei anna korduvat baiti ega lehekülgede jalust; (c) panna kättetoimetamise tõendid protokolli — need selguvad alles pärast kannet, seega oleks protokoll kas hiljem või mittetäielik.
  **Seis:** otsustatud tellija tiimiga (september 2026).

- **[L-23] Testkeskkonna aeg ja näidismasinavärk.**
  **Valik:** aeg on **päris aeg**. Virtuaalkell (mida sai testimiseks edasi kerida), näidisandmete lähtestamise nupp ja näidiskalendri laadimise nupp on kaotatud. Katsetusvooru vastamisaken pannakse lühikeseks **vooru enda skeemifailis**, nii et kaskaad käib läbi ühe pärastlõunaga; testkeskkonnas on tähtaja alampiiriks 5 minutit tulevikus, päriskeskkonnas kehtib hankeosa tööpäevade nõue muutmatult (V-04: tähtaega saab ainult pikendada).
  **Põhjendus:** kolm asja korraga. Kellakerimine mõjus kõigile korraga ühises andmebaasis ja tegi ühe testija katsetusest teise segaduse; kirjades ja protokollis olid ajatemplid, mida päriselt ei juhtunud. Lähtestamise nupp oli ohutu ainult seni, kuni kõik andmed olid väljamõeldud — hetkest, mil admin laadib üles päris raamhanke andmed, on üks vajutus nende kustutamine. Ja mõlemad olid masinavärk, mida päris kasutuses ei ole, seega ei näidanud demo enam seda, mida päriselt kasutatakse.
  **Tagajärg:** puhta seisu taastamine on halduri toiming (uus andmemaht), mitte nupp rakenduses. Näidisandmed laaditakse esimesel käivitusel tühja andmebaasi — sama impordi kaudu, mida admin ise kasutab (L-21).
  **Alternatiivid:** (a) jätta kell alles ainult DEMO_MODE-s — sama probleem ühises andmebaasis; (b) kellakerimine sessioonipõhiseks — nõuab virtuaalset aega igas päringus ja teeb auditijälje mitmetimõistetavaks; (c) jätta lähtestamine alles, aga küsida kinnitust — kinnitusdialoog ei tee pöördumatut kustutamist vähem pöördumatuks.
  **Seis:** otsustatud tellija tiimiga (september 2026).

---

- **[L-24] Lõppkokkuvõtte aeg.**
  **Valik:** lõppkokkuvõte (D-11) saadetakse **kaks tundi enne tähtaega**, kõigile hankeosadele sama konstant koodis, mille juhend trükib ja test kinnitab.
  **Alternatiivid:** (a) hankeosa seadistus nagu vastamisaken — lisab välja, mida keegi ei ole küsinud, ja nelja hankeosa jaoks ühel raamlepingul ei ole põhjust erinevusteks; (b) saata kokkuvõte kõigile, ka vastamata jätnutele — nende jaoks on D-05 juba öelnud, et vaikimine on loobumine, ja teine kiri sama asja kohta õpetab mõlemat ignoreerima; (c) siduda kokkuvõte iga prognoosi muutusega viimasel ööpäeval — see oleks D-04 tagasitoomine hetkel, mil kõik korraga otsustavad.
  **Märkus testkeskkonna kohta:** viieminutilise alampiiriga katsetusvoorus on iga kinnitus akna sees, seega kokkuvõtet ei saadeta; selle nägemiseks peab katsetusvoor kestma üle kahe tunni.
  **Seis:** otsustatud tellija tiimiga (september 2026).

- **[L-25] Otsus ja tellimus väljaspool rakendust.**
  **Valik:** vooru tulemuse formaalne otsus ja tellimuse vormistamine toimuvad **praegu väljaspool rakendust**. Rakendus teeb kolm asja: sulgeb vooru tähtajal ja saadab igale partnerile kokkuvõtte tema esialgsest tulemusest (D-12); laseb tellijal jaotust kohandada ja kinnitada (T-02, T-04); koostab kinnitamisel protokolli (L-22), mis on tellija otsuse alusdokument. Tellimusi ei koostata (T-05 peatatud), partneritele kinnitamisest teadet ei saadeta (D-07, N-08 peatatud) ja partneri menüüs „Tellimused“ on ainult neil, kellel on varasemast tellimus.
  **Põhjendus:** läbimängul läks tellimuse teade partnerile hetkel, mil tellija veel ainult tulemust vaatas — enne kui formaalne otsus oli olemas („ma kardan, et kui ma praegu hakkaks … vaatama, siis ta juba saaks selle kinnituse“ — „Tuli.“). Hankekord nõuab otsust enne tellimust ja otsuse teatis osalistele käib dokumendihalduse kaudu; rakendus ei peaks seda enne kokkuleppimist ette kirjutama.
  **Alternatiivid:** (a) üks samm nagu v2.5 — tellimus läheb välja kinnitamisel, enne otsust; (b) kaks sammu rakenduses — „Kinnita jaotus“ valmistab tellimused väljastamata kujul ja käskkirja mustandi (DOCX) protokolli andmetest, „Väljasta tellimused“ saadab D-07 teated; disainitud 13.09.2026 (`orders.issuedAt`, `rounds.ordersIssuedAt`, partneri lugemine ainult väljastatud tellimustest), kõrvale pandud, mitte tagasi lükatud; (c) valitud: kokkuvõte sulgumisel, protokoll kinnitamisel, ülejäänu väljaspool.
  **Seis:** otsustatud tellija tiimiga (13.09.2026); üle vaadata pärast pilooti — tellimuse rakendusse tagasi toomine on `confirmAllocation` juurest üks kutse (`issueOrders`).

- **[L-26] Tellija hinnang koolituskalendris.**
  **Valik:** koolituskalendri veerg `hinnanguline_maksumus` jääb **vabatahtlikuks tellija sisemiseks planeerimisarvuks** („Tellija hinnang“): seda näeb ainult tellija kalendris, vooru koostamisel ja jäägi juures; partneri vaates, teadetes ega protokollis seda ei ole — seal on ainult raamlepingu hind (T-08). Enne v2.6 kuvati sama arvu partneri märkimistabelis pealkirjaga „Maksumus“ ja tellimus korrutas ühikuhinna koolituste arvuga; kuna hinnang oli igale partnerile sama ja näidisandmetes võrdne koha 1 ühikuhinnaga, loeti seda läbimängul „pakkuja 1 hinnaks“ — see oli eksitav ja andis kaudselt teada eesõigusega partneri hinna (N-04).
  **Alternatiivid:** (a) veerg kaotada — lihtsam, aga tellija kalendris on eelarvearv päriselt olemas; (b) arvutada hinnang automaatselt koha 1 hinnast — paneks tellijale suhu numbri, mida ta ise ei pannud, ja partnerile ei annaks midagi juurde.
  **Seis:** otsustatud tellija tiimiga (13.09.2026). Kas ja kuidas makstakse tegeliku osalejate arvu järgi, on raamlepingu küsimus väljaspool rakendust.

- **[L-27] Teavituste seaded.**
  **Valik:** üks isiklik lüliti esindaja kohta — **teabekirjad e-postiga sisse või välja** (vaikimisi sisse). Teabekirjad on kviitungid, prognoosi muutused ja lõppkokkuvõte; formaalsed teated (D-10 täpsustus) lülitile ei allu. Lüliti on lehel „Teavitused“ plokis „Teavituste seaded“; teise osalejana tegutsev admin (L-08) seda ei muuda, sest seadistus kuulub inimesele, mitte ettevõttele. Muutmine kirjutatakse auditijälge.
  **Põhjendus:** läbimängul tuli ühe vooru kohta „10 meili“ ja tiim soovis, et partner saaks teavitusi maha keerata. Formaalsed teated peavad jõudma ka partnerini, kes rakendust ei ava; kviitung ja prognoosi muutus on sama teave, mis on lehel niikuinii.
  **Alternatiivid:** (a) lüliti iga teateliigi kohta eraldi — täpsem, aga seitse lülitit ühe küsimuse jaoks; (b) päevakoond ühe kirjana — vähem kirju, aga hilisem teave hetkel, mil kõik korraga otsustavad; (c) prognoosi muutuse teade vaikimisi väljas — tellija tiimi otsus, üherealine vaikeväärtuse muutus, kui soovitakse.
  **Seis:** otsustatud (v2.7); vaikeväärtus üle vaadata pärast pilooti.

## Lisa A — Seosed koosoleku aruteluga

| Koosoleku tsitaat | Reegel(id) |
|---|---|
| „seal oli siis 2 varianti, et kas te lähetegi kaskaadi pidi … või … me võime küsida ka seda koolitustellimuse kinnitust kõigilt korraga“ | Taust, V-01, V-08 |
| „Selliseid osa osalisi pöördumisi ei saa teha. Seda meile ei ole kirja pandud ja seda ei saa.“ | V-01 |
| „kelle poole pöörduda on? Kas ühe või kõigi?“ | V-01, V-08 |
| „infopäeva järgselt me tegimegi muudatuse sinna … et me võime kõigile korraga saata“ | Taust |
| „neil on ju õigus loobuda tellimuse vastuvõtmisest“ | K-07, K-08 |
| „kui näiteks see 1., 2. ja 3. ei kinnita teie koolitust, siis teil on õigus tellida seda näiteks kohe 4. käest“ | J-04, J-06 |
| „siis ikkagi tegelikult peab ju see, kes platseerus 1. või 3. saama neid ka märkida, sest temal on eelisõigus“ | J-04, K-01 |
| „siis nendele kaskaadi alusel on ju eesõigused“ | J-04 |
| „näha igal hetkel enda positsiooni arvestades … mis on hetkel saldo? Mis on jääk“ | N-02, N-03 |
| „kas ta läheb kokku sellega, mis me oleme öelnud raamlepingus“ | N-06, L-01, L-04 |
| „Kas ma võin ise laivis muuta?“ … „see 3 päeva on neil seal aega toimetada … ma jätaks selle lahti“ … „See oleneb prototüübist.“ | K-04, L-01 |
| „25 on ka ees, aga see on jälle meie õigus … me ei pea seda rakendama“ | T-02, T-03 |
| „neil on juba töömaht nii suur, et teised koolitused võivad hakata kannatama, siis meil on õigus liikuda ränkingus järgmise pakkuja juurde … mitte kohustus“ | T-02, T-03, L-07 |
| „mingi kirjalik jälg peaks ja jääma ka teavitusena“ | D-02, D-07, D-08 |
| „Tellimuse alusel olete kinnitanud, et need … ja määratud täitjana nende koolituste läbiviimisele“ | T-05, D-07 |
| „hankelepingut ei olnud. Et see tellimus ongi siis käsitletav hankelepinguna.“ | T-05 |
| „tellimuse täitmise kinnitus“ / „tellimuse täitmisest loobumise teade“ | M (kinnitus, loobumine), K-02, K-07 |
| „oktoober on kõik ainult need pakkujad, kes suudavad ruumi korraldada“ / „veebiga tellida kohe“ | V-01 (voor on ühe hankeosa kohta; eri vood eri hankeosadele) |

---

## Lisa B — Näide

**Hankeosa** OSA-2, partnerid järjestuses: **A** (koht 1), **B** (koht 2), **C** (koht 3).
**Koolitused** toimumiskuupäeva järjekorras: K1 (05.10), K2 (07.10), K3 (12.10), K4 (14.10), K5 (19.10), K6 (21.10).

**Kinnitatud märked vastamisakna lõpus:**

| Partner | Märgitud | Piirmäär |
|---|---|---|
| A (1) | K1, K2, K3, K5 | 2 |
| B (2) | K2, K3, K4, K6 | — |
| C (3) | K1, K3, K4, K5, K6 | — |

### B.1 Jaotusettepanek (J-02, tellija kohandusi ei ole)

1. **A**: soovitud = K1, K2, K3, K5 → piirmäär 2 → võtab **K1, K2**. Jaotamata: K3, K4, K5, K6.
2. **B**: soovitud ∩ jaotamata = K3, K4, K6 → võtab **K3, K4, K6**. Jaotamata: K5.
3. **C**: soovitud ∩ jaotamata = K5 → võtab **K5**. Jaotamata: —.

**Ettepanek:** A: K1, K2 · B: K3, K4, K6 · C: K5 · jääk: puudub.

Tähelepanu: A märkis K3 ja K5, kuid piirmäära tõttu **voolavad need alla** (E-04). Seetõttu näeb B koolitust K5 „saadavalolevana“, kuigi A on selle märkinud — kuva järgib algoritmi, mitte toormärkeid.

### B.2 Mida iga partner näeb dünaamilises režiimis (N-03), sama seisu juures

| Koolitus | A (koht 1) | B (koht 2) | C (koht 3) |
|---|---|---|---|
| K1 | prognoosis teile | eesõigusega partner on märkinud | märgitud, prognoosis ei ole (eesõigusega partner) |
| K2 | prognoosis teile | märgitud, prognoosis ei ole (eesõigusega partner) | eesõigusega partner on märkinud |
| K3 | märgitud, prognoosis ei ole (üle piirmäära) | prognoosis teile | märgitud, prognoosis ei ole (eesõigusega partner) |
| K4 | saadaval | prognoosis teile | märgitud, prognoosis ei ole (eesõigusega partner) |
| K5 | märgitud, prognoosis ei ole (üle piirmäära) | saadaval | prognoosis teile |
| K6 | saadaval | prognoosis teile | märgitud, prognoosis ei ole (eesõigusega partner) |
| **Prognoos** | **2** | **3** | **1** |

Ükski partner ei näe, *kes* on eesõigusega märkija (N-04). Tellija näeb kogu maatriksit (N-01).

### B.3 Muudatus akna ajal (K-04, N-05)

A eemaldab märke K2 ja kinnitab uuesti. Nüüd A soovitud = K1, K3, K5 → piirmäär 2 → **K1, K3**.
B jaoks liigub K2 olekusse „prognoosis teile“ ja K3 olekusse „märgitud, prognoosis ei ole“; B prognoos jääb 3 (K2, K4, K6). C prognoos jääb 1 (K5). Just seda kõikumist tähistab silt „esialgne“.

### B.4 Tellija ülevaatus kohandusega (T-02)

B jooksev töömaht on 26 ≥ piir 25 → hoiatus (T-01). Tellija otsustab **piirata** B-d selles voorus 1 koolitusega, põhjendus: „B-l on käimas 26 koolitust, teiste koolituste kvaliteet võib kannatada“.

Lõplik jaotus (B.1 märgetega): A: **K1, K2** · B: **K3** · C: **K4, K5, K6** · jääk: puudub.

Kinnitamisel (T-04) luuakse kolm tellimust (T-05), C saab teate oma kolmest koolitusest, B saab tellimuse ühe koolitusega ning neutraalse teate, et K4 ja K6 „määrati … teisele partnerile“ — sõnastus ei avalda, et põhjus oli tellija kohandus (N-08). Kohandus ja põhjendus on auditijälg (D-08).

---

## Muudatuste logi

| Versioon | Kuupäev | Muudatus |
|---|---|---|
| 2.0 (mustand) | 27.08.2026 | Esimene paralleelse kaskaadi äriloogika versioon spetsialistide koosoleku ja tellija tiimi otsuste alusel. Asendab v1 järjestikuse kaskaadi kui põhimudeli; järjestikune režiim jääb alles (V-08). |
| **2.7** | **13.09.2026** | Piloodi ajal tehtavad muudatused. Täpsustus **D-10** juurde: teated jagunevad formaalseteks (alati e-postiga) ja teabekirjadeks (kviitungid, prognoosi muutus, lõppkokkuvõte), mille esindaja võib enda jaoks e-postist välja lülitada; uus **L-27** (üks isiklik lüliti, vaikimisi sisse; alternatiivid liigiti, päevakoond, prognoosi muutus vaikimisi väljas). Läbimängul oli ühe vooru kohta „10 meili“. Täpsustus **N-03** juurde: sildid teie-vormis („Prognoosis teile“, „üle teie piirmäära“), ka Lisa B tabelites; keskkonna üks nimi on „testkeskkond“. Raamhanke töövihiku Selgitus (L-21) ütleb, et lehel „Partnerid“ on üks rida ettevõtte ja hankeosa kohta (kolmes hankeosas olev ettevõte on kolmel real), et „Esindajad“ on lisainimesed ja kontaktisik on esindaja automaatselt, ning et hankeosa kirjeldus tuleb raamlepingu sõnastusega kontrollida — läbimängul tekitasid kõik kolm segadust. Täpsustus **L-20** juurde: tühja hankeosaga „Voor“ leht loob ühe impordiga iga hankeosa kohta oma mustandi; voor jääb ühe hankeosa vooruks. Täpsustus **N-02** juurde: partneri kalender („Minu kalender“ — määratud ja kinnitatud koolitused kuude kaupa) ja märkimistabeli hoiatus „Samal päeval: …“. |
| **2.6** | **13.09.2026** | Esimese läbimängu (11.09.2026) tagasiside. Täpsustus **D-01** juurde: koolituste loend on igas teates ühe koolituse kaupa omal real, ka e-kirja HTML-kujul. Täpsustus **E-10** juurde: sisult identne korduskinnitus ei loo uut kannet ega kviitungit, korduskatse kirjutatakse auditijälge; kinnitamise tulemus kuvatakse vooru lehe ülaosas. Otsus ja tellimus väljaspool rakendust: uus **L-25**, uus **D-12** (vooru lõppemise teade partnerile esialgse tulemusega), täpsustus **T-04** juurde (kinnitamine külmutab jaotuse ja koostab protokolli, partnerile teadet ei lähe), **T-05**, **D-07** ja **N-08** *[peatatud]*, täpsustus **L-22** juurde (tellimuste jaotis tühi; uus jaotis „Lõplik jaotus täitjate kaupa“ ja koolituse andmed jaotustabelis, andmestruktuur v2; protokoll vooru lehel kaardina); uus märgend *[peatatud]* dokumendi pidamise kokkulepetes. Ühikuhind on hind osaleja kohta: uus **T-08** — partneri raamlepingu ühikuhind on hind **ühe osaleja kohta** ja igas hankeosas oma; koolituse osalejate arv on ülempiir („Max osalejaid“), koolituse hind rühma täitumisel on max osalejaid × partneri ühikuhind ja jaotuse hind max osalejate korral on nende summa; rakendus kuvab hinda, mitte „maksumust“, ja partnerile ainult tema enda hinda (**N-04**) — varem näitas partneri tabel tellija hinnangut pealkirjaga „Maksumus“, mis oli igale partnerile sama. Täpsustused mõiste **Koolitus** juurde (uued mõisted **Ühikuhind**, **Hind rühma täitumisel**), **T-01** ja **L-04**; uus **L-26** (tellija hinnang `hinnanguline_maksumus` jääb vabatahtlikuks sisemiseks arvuks). Kontaktisiku vahetus lõpetab endise kontaktisiku esinduse: täpsustus **L-21** juurde (esindus on aktiivne kahel sõltumatul alusel — praegune kontaktisik või eraldi nimetatud; kontaktisiku nimetamine esindajate lehel ei tee temast eraldi esindajat; mitme hankeosa kontaktisiku vahetus korraga; allalaaditud töövihik on terviklik ja „lõpeta puuduvad“ on selle tagasilaadimisel vaikimisi valitud) ja **L-18** juurde (päritolu on ainult teave; v2.3 „omaniku“ reegel jättis endise kontaktisiku aktiivseks) — läbimängul jäid vahetatud kontaktisikud alles ja said edasi sisse logida. Parandusmigratsioon märgib olemasolevad aktiivsed esindajad, kes ei ole praegused kontaktisikud, eraldi nimetatuks; nende hulgas võib olla vea tõttu alles jäänud endine kontaktisik, keda ei saa õigest asendajast eristada — ta on ekraanil „Esindajad“ lülitiga lõpetatav. Uus **D-11** (isiklik lõppkokkuvõte kaks tundi enne tähtaega kinnitanud partneritele: kinnitatud valik, praegu prognoositud koolitused, mujale minevad märked koos põhjusega; akna sees kinnitanule ei saadeta), uus **L-24** (aeg on konstant), täpsustused **D-04** ja **L-13** juurde (viimase ööpäeva seisu kannavad D-05 ja D-11). Täpsustus **K-06** juurde: piirmäär on vormil sõnaselge valik („Piirmäära ei ole“ / „Kuni N“) ja tabeli kohal on hulgimärkimise nupud. Täpsustused **E-10** ja **N-01** juurde: avatud vooru leht värskendab prognoosi ja maatriksit ise kord minutis ja ütleb seisu aja — läbimängul küsiti, kas saldo uueneb reaalajas; varem muutus partneri arv ainult tema enda salvestuse või lehe laadimisega. Töövihiku lugemine (L-21) talub teise programmi salvestatud nimeruumi eesliidet — läbimängul ei õnnestunud muus programmis muudetud raamhanke töövihikut üles laadida. Õigekiri: *ühikuhind*, mitte „ühikhind“; töövihiku veerg on `uhikuhind`, vana nimi võetakse vastu. Näidisandmete hinnad on nüüd osaleja kohta. |
| **2.5** | **10.09.2026** | Lubatud saajad tulevad raamlepingu andmetest: **[L-19]** — e-kirja saaja peab olema kas raamlepingu andmetest tuletatud aadress (aktiivne esindaja või aktiivse osaluse kontaktisik) või seadistatud loendis (`EMAIL_ALLOWED_RECIPIENTS`), mis jääb nüüd nende jaoks, keda raamlepingus ei ole (tellimismeeskond, katsetajad). Varem oli ainus allikas seadistatud loend ja iga pakkuja domeen tuli sinna käsitsi lisada, mistõttu päris partner ei saanud ei vooruteadet ega sisenemiskoodi. Tuletatud hulk ei tohi olla kitsam kui **L-08** sisselogimisõigus. Juba maha surutud kirjed jäävad maha surutuks — neid saab tellija logist käsitsi uuesti saata (**D-10**). |
| **2.4** | **10.09.2026** | Kaks tellija rolli ja nimeline adminloend: **R-01** — *liige* asendub **hankijaga**, kes teeb minihankeid algusest lõpuni (import, vooru loomine, avaldamine, ülevaatus, kohandused, kinnitamine, protokoll, tellimused) ja näeb kõiki adminekraane täies mahus, kuid ei muuda raamhanke andmeid ega meeskonda ega tegutse teise osalejana; rolli muutmine on meeskonnaekraanil auditeeritud toiming ja viimase aktiivse admini rolli ei saa alandada. **L-08** — ajutine domeenireegel (`AUTO_ADMIN_EMAIL_DOMAINS`) asendub nimelise loendiga (`AUTO_ADMIN_ALLOWLIST`, alternatiiv (d)): kirje kas üks aadress või terve domeen, testkeskkonnas üks nimeline aadress; sisselogimisleht avaldab loendi **suuruse**, mitte aadresse; meeskonda lisatav inimene ja seadistusest seemendatud liige algavad hankijana. |
| **2.3** | **10.09.2026** | Testkeskkond päris kasutuse kujul: **L-08** — sisselogimine on välisuks mõlemas keskkonnas, admin maandub valikulehel „Kellena tegutseda“ ja tegutseb osalejana ilma oma sessiooni lõpetamata (auditijälg ja **D-09** kannavad mõlemat nime); **R-01** — muutmine on admini õigus, liige on vaatleja; uus **L-23** — päris aeg, virtuaalkell ja näidisandmete lähtestamine kaotatud, katsetusvooru vastamisaken tuleb vooru skeemifailist; täpsustused **L-14** ja **L-16** juurde; uus **L-21** (raamhanke andmed rakenduses: identiteet, hankeosad, järjestus ja kontaktisikud ühel ekraanil, muudetavad nii töövihikuna kui väljahaaval, iga muudatus logitud; kontaktisiku aadress on partneri sisselogimine), täpsustused **L-18** ja **L-20** (kavandatud vastamisaken skeemifailis) juurde; uus **L-22** (vooru protokoll: automaatne kanne vooru lõpetavas tehingus, ainult salvestatud andmetest, kanooniline JSON + SHA-256, PDF allkirjastamiseks ja .xlsx lisa tõenditega), täpsustused **T-04**, **D-07** ja **L-15** juurde. |
| 2.2 | 09.09.2026 | Sisselogimine, esindajad, e-post ja piirmäära liigid: **K-06** (piirmäära liigid — koolituste või osalejate arv, tellija valik vooru kohta, osalejate eelarve puhul vahelejätmine), **E-04**, **J-02** (protseduur täiendatud), **J-07**; **R-02** ja **D-09** (tegutseb sisse loginud esindaja); uus **D-10** (teavituste saajad on esindajad; kättetoimetamise kirje iga saaja kohta, kordused, käsitsi uuesti saatmine); **L-08** lahendatud (e-posti ühekordne kood, sessioon; tugevama tuvastamise märkus); uued **L-17** (piirmäära liik), **L-18** (esindajate loend), **L-19** (testkeskkonna lubatud saajad), **L-20** (vooru skeem tabelina loob mustandi). **L-08** täiendatud ajutise domeenireegliga (`@riigikantselei.ee` aadress logib sisse adminina) ja selle riski kirjeldusega. |
| 2.1 | 03.09.2026 | Veebirakenduse ehitamisel tehtud tõlgendused kirja pandud: uued **L-11** (olekuveerg järgib mustandit), **L-12** (suletud vooru ei tühistata), **L-13** (prognoosi muutuse teate saajad), **L-14** (näidiskünnis 4), **L-15** (tellimus on prinditav HTML), **L-16** (näidisandmed koostatakse päris mootorikutsetega); täpsustused **J-01** (kaasav tähtaja hetk), **V-04** (märked jäetakse välja sisendi koostamisel, kinnitusi ei muudeta), **E-03** (üleküsimine ja kande liik), **N-08** (neutraalne sõnastus ilma „eesõiguse alusel“), **T-05** (prinditav HTML). Reeglid ise ei muutunud. |
