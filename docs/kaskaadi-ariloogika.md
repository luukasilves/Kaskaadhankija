# Kaskaadhankija — kaskaadi äriloogika

**Versioon:** 2.1 · **Kuupäev:** 03.09.2026 · **Mudel:** paralleelne kaskaad
**Staatus:** kokku lepitud tellija tiimiga. Õiguslikku või erialast ülevaatust ootavad punktid: **L-01, L-05, L-07, L-10**.
Versioon 2.1 lisab tõlgendused, mille veebirakenduse ehitamine nõudis (L-11…L-16 ja märkused J-01, V-04, E-03, N-08, T-05 juurde). Ükski reegel ei muutunud — täpsustati.

---

## Kuidas seda dokumenti kasutada

See dokument on Kaskaadhankija käitumise **alusdokument**. Iga reegel kannab püsivat tunnust, näiteks **[J-04]**. Lähtekood, automaattestid ja kasutajaliidese tekstid viitavad reeglitele nende tunnuste kaudu (näiteks test `describe('[J-04] range järjestus', …)`).

Kui protsessi tuleb muuta, muudetakse **esmalt seda dokumenti** ja seejärel viiakse muudatus koodi. Dokumendi muutmine on rakenduse käitumise muutmise leping — mitte vastupidi.

Kokkulepped dokumendi pidamiseks:

- Reegleid **ei nummerdata ümber**. Kehtetuks muutunud reegel märgitakse *[tühistatud]* koos põhjusega; uus reegel saab jaotise järgmise vaba numbri.
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
| **Raamleping** | Raamleping „Eesti.ai koolitajate tellimine“, RHR 10567384, kehtib 31.12.2027. |
| **Hankeosa** | Raamlepingu osa (nt koolitused ruumirendiga, ruumirendita, veebikoolitused, suursündmused). Igal hankeosal on **oma partnerite järjestus**. |
| **Partner** | Ettevõte, kellega on hankeosas sõlmitud raamleping. Partneri nimel tegutseb tema **kontaktisik**. |
| **Järjestus, koht** | Partneri positsioon hankeosas hanke hindamistulemuste alusel. Koht 1 = kõrgeim eesõigus. Kohad on hankeosa piires unikaalsed. |
| **Koolitus** | Üks tellitav ühik: töötuba või sündmus kindla kuupäeva, asukoha, formaadi, osalejate arvu, keele ja raamlepingu ühikhinnaga. |
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
| **Tellija** | Riigikantselei / RTK tellimismeeskond. |
| **Auditijälg** | Muutmatu (ainult lisatav) sündmuste logi, kuhu kirjutatakse iga protsessi sündmus. |

---

## R — Rollid

- **[R-01] Tellija.** Tellimismeeskonna kasutajad (rollid *admin* ja *liige*). Loovad ja avaldavad voorud, näevad vooru kohta **kõike**, vaatavad jaotusettepaneku üle ja kinnitavad lõpliku jaotuse.
- **[R-02] Partneri kontaktisik.** Näeb ainult oma hankeosa voorusid, oma märkeid ja kinnitusi ning (dünaamilises režiimis) kõrgema kohaga partnerite märgete **mõju** — mitte nende identiteeti. Tegutseb MVP-s isikliku tokeniga lingi kaudu; hiljem võimalik kasutajakonto (L-08).
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
- **[K-06] Piirmäär.** Partner võib vooru kohta määrata ülempiiri „võtan vastu kuni N koolitust“. Vaikimisi piirmäära ei ole (= kõik kinnitatud märked). Piirmäära sees jaotatakse koolitused **toimumiskuupäeva järjekorras** (varasem enne), võrdsete kuupäevade puhul koolituse tunnuse järjekorras. *Alternatiiv — vt L-03.*
- **[K-07] Sõnaselge loobumine.** „Loobun kõigist selle vooru koolitustest“ salvestatakse **loobumisteatena**, mis erineb vaikimisest. Loobumist saab kuni tähtajani muuta nagu iga kinnitust (K-04).
- **[K-08] Vastamata jätmine.** Partner, kellel tähtaja hetkel ei ole ühtegi kinnitust, saab oleku **„ei vastanud“** (loobumine vaikimisi). Ta ei saa selles voorus midagi. Olek salvestatakse eraldi sõnaselgest loobumisest.
- **[K-09] Auditijälg.** Iga märke lisamine ja eemaldamine, piirmäära muutmine, kinnitus ja loobumine kirjutatakse auditijälge ajatempli ja tegutseva kontaktisiku andmetega.

---

## N — Nähtavus (kaskaadi kuvamine)

- **[N-01] Tellija näeb kõike reaalajas.** Järjestuse alusel sorteeritud maatriks (koolitused × partnerid) kinnitatud märgetest; kinnitamata mustandid eraldi tähistatuna; piirmäärad; kinnituste ajad; jooksev prognoositud jaotus; märkimata koolitused; vastamata partnerid; iga partneri muudatuste ajalugu.
- **[N-02] Partner näeb alati:** vooru kõik koolitused täisandmetega; oma märked, piirmäära, kinnituse oleku ja ajaloo; oma koha hankeosas („koht 3/12“); tähtaja ja loenduri; oma prognoosi; hoiatuse, kui tema jooksev töömaht on hankeosa piiril või üle selle („tellijal on õigus jaotust piirata“, vt T-02).
- **[N-03] Dünaamiline režiim (vaikimisi).** Iga koolituse juures kuvatakse partnerile üks neljast olekust, arvutatuna jaotusalgoritmiga (J) **kõrgema kohaga partnerite kinnitatud** märgete põhjal:

  | # | Olukord | Soovituslik silt |
  |---|---|---|
  | 1 | Märkimata; ükski eesõigusega partner ei ole kinnitanud | **Saadaval** |
  | 2 | Märkimata; eesõigusega partner on kinnitanud | **Eesõigusega partner on märkinud** |
  | 3 | Märgitud; prognoosi järgi läheb sinule (piirmäära sees) | **Prognoosis sinule** |
  | 4 | Märgitud; prognoosi järgi ei lähe sinule — eesõigusega partner saab selle **või** see ületab sinu piirmäära | **Märgitud, prognoosis ei ole** (koos põhjusega: *eesõigusega partner* / *üle sinu piirmäära*) |

  Prognoosi koond: „Prognoosis sinule: X koolitust“.
- **[N-04] Partnerile ei kuvata kunagi:** ühegi teise partneri identiteeti; midagi madalama kohaga partnerite kohta; kas või millal teised on vastanud; eesõigusega märkijate arvu (*L-04*); kellegi kinnitamata mustandeid. Ainult **kinnitused** liigutavad kuva.
- **[N-05] Kõik on vastamisakna ajal esialgne — ja sildistatud sellisena.** Kuna kõrgema kohaga partnerid võivad märkeid muuta (K-04), võib koolitus kuni tähtajani liikuda oleku 1 ja 2 (või 3 ja 4) vahel. See on **oodatav käitumine**, mida selgitatakse nii kasutajaliideses („esialgne“, „prognoos“, „võib muutuda kuni tähtajani“) kui ka vooru avaldamise teates.
- **[N-06] Suletud režiim** (vooru kohta sisselülitatav, vaikimisi väljas). Reeglis N-03 kirjeldatud olekud on peidetud; prognoos kuvatakse kui „selgub pärast tähtaega“. Sama algoritm, sama jaotus. Režiim on olemas selleks, et Riina tõstatatud küsimuse — kas dünaamiline nähtavus on kooskõlas raamlepingus öelduga — saaks lahendada **ilma koodi muutmata**.
- **[N-07] Pärast tähtaega, enne tellija kinnitust** näevad partnerid teadet „tähtaeg möödus, tellija kinnitab jaotust“ — mitte jaotusettepanekut.
- **[N-08] Pärast tellija kinnitust** näeb iga partner oma lõplikke koolitusi (tellimust) ning neutraalset loendit oma märgitud koolitustest, mis **„määrati teisele partnerile“** — identiteeti ega põhjust ei avaldata. Jaotamata jäänud koolitusi partneritele ei kuvata; nende edasise käigu otsustab tellija (T-06).
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
      võta     := soovitud esimesed min(|soovitud|, p piirmäär, tellija piir p-le) tk
      määra võta → p ; jaotamata := jaotamata − võta
  jääk := jaotamata
  ```
- **[J-03] Determineeritus.** Samad sisendid annavad alati sama tulemuse. Iga jaotusettepaneku ja lõpliku jaotusega salvestatakse sisendite hetktõmmis, et tulemust saaks hiljem taasarvutada ja kontrollida.
- **[J-04] Range järjestus.** Madalama kohaga partner saab koolituse ainult siis, kui iga kõrgema kohaga partner kas ei kinnitanud sellele märget, oli oma piirmäära täis või jäeti tellija poolt vahele või piirati (T-02). **Vastamise kiirus ei loe kunagi.** Rotatsiooni (väiksema koormusega partneri eelistamist) paralleelses režiimis ei kasutata — vt L-06.
- **[J-05] Üks protseduur, kolm lõikehetke.** **Prognoos** — lõikehetk on „praegu“, tellija kohandusi ei ole (kuvatakse akna ajal). **Jaotusettepanek** — lõikehetk on tähtaeg, kohandusi ei ole (külmutatakse V-06 järgi). **Lõplik jaotus** — lõikehetk on tähtaeg, tellija kohandused rakendatud (T-04). Kuva ei näita kunagi midagi, mida algoritm ei ole arvutanud.
- **[J-06] Jääk.** Koolitus, millele ühelgi partneril ei ole sobivat kinnitatud märget, jääb **jaotamata** ja liigub tellija otsusele (T-06).
- **[J-07] Invariandid.** Koolitus määratakse maksimaalselt ühele partnerile. Partneri jaotus ühest voorust ei ületa kunagi tema piirmäära ega tellija määratud piiri.

---

## T — Tellija ülevaatus ja jaotuse kinnitamine

- **[T-01] Ülevaatuse vaade.** Pärast vooru sulgumist näeb tellija jaotusettepanekut partnerite kaupa: selles voorus määratud koolituste arv ja maksumus, partneri **jooksev töömaht** (*määratlus — L-07*) ning **töömahu hoiatus**, kui töömaht ≥ hankeosa piir.
- **[T-02] Lubatud kohandused.** Igaüks **kohustusliku põhjendusega**, auditijälge kirjutatuna: **(a) vahelejätmine** — partner jäetakse selles voorus vahele, tema märked liiguvad järjestuses allapoole; **(b) piiramine** — partnerile määratakse selles voorus maksimaalselt N koolitust. **Muid kohandusi ei ole**: koolitust ei saa määrata valitud partnerile järjestust eirates ega järjestust ümber tõsta. (Alus: „õigus liikuda ränkingus järgmise pakkuja juurde … mitte kohustus“.)
- **[T-03] Töömahu piir on ainult hoiatustase.** Vaikimisi 25, seadistatav hankeosa kohta. Piir ei tee kunagi iseseisvalt midagi — otsus on alati tellija oma. *Kas kohandusi lubatakse ka hoiatuseta partnerite puhul — vt L-05.*
- **[T-04] Kinnitamine.** Pärast kohandusi arvutatakse lõplik jaotus uuesti ja kuvatakse. „**Kinnita jaotus**“ on vooru osas pöördumatu; hilisemad parandused tehakse tellimuste kaupa (E-07) või uue vooruga.
- **[T-05] Tellimus.** Kinnitamisel luuakse iga vähemalt ühe koolitusega partneri kohta **tellimus**: koolituste loend, viide raamlepingule ja voorule, partneri siduva kinnituse aeg ja tellija kinnituse aeg. Tellimus on hankeleping raamlepingu alusel („tellimus ongi käsitletav hankelepinguna“) ning peab olema väljatrükitav ja säilitatav.
  *Täpsustus (v2.1):* tellimus koostatakse kinnitamise hetkel külmutatud hetktõmmisest ja on prinditav HTML-leht (vt L-15); tellija ja partner näevad ja prindivad sama dokumendi.
- **[T-06] Jääk.** Iga jaotamata koolituse kohta valib tellija: **(a)** uus voor kõigile partneritele (vaikimisi soovitus; kuna midagi ei määratud, võib koolituse andmeid enne muuta); **(b)** käsitsi määramine konkreetsele partnerile põhjendusega (ainult raamlepinguga lubatud juhtudel, nt telefoni teel sündinud kokkulepe); **(c)** koolituse tühistamine. Kõik logitakse.
- **[T-07] Ülevaatuse aeg.** Süsteem ei jõusta tellijale tähtaega, kuid töölaud märgib voorud, mis on oodanud kinnitust üle 1 tööpäeva. Partneritele öeldakse vooru teates, millal kinnitust oodata (seadistatav; vaikimisi 2 tööpäeva pärast tähtaega; *L-09*).

---

## D — Teavitused ja kirjalik jälg

- **[D-01] Avaldamine.** Kõigile partneritele ühel hetkel: koolituste loend, tähtaeg, nähtavusrežiim, link vastamiseks, selgitus esialgsuse kohta (N-05). Koopia tellimismeeskonnale.
- **[D-02] Kinnituse kviitung.** Iga kinnitus → partnerile kviitung märgete hetktõmmise, piirmäära ja ajatempliga.
- **[D-03] Loobumise kviitung.** Iga sõnaselge loobumine → partnerile kviitung ajatempliga.
- **[D-04] Prognoosi muutus** (ainult dünaamilises režiimis). Kui partneri prognoositud koolituste arv muutub, saadetakse teade — piiratud sagedusega (vaikimisi kuni 1 teade 4 tunni kohta partneri ja vooru kohta), viimase 24 tunni jooksul ainult D-05 meeldetuletus.
- **[D-05] Meeldetuletus 24 h enne tähtaega.** Igale partnerile: kinnituse olek (kinnitatud / kinnitamata / kinnitamata muudatused ootel) ja hetkeprognoos.
- **[D-06] Vooru muudatused.** Tähtaja pikendamine, koolituse eemaldamine, vooru tühistamine → kõigile partneritele koos põhjendusega.
- **[D-07] Kinnitatud jaotus.** Igale määratud partnerile tellimuse dokument (T-05); igale partnerile, kelle märgitud koolitus läks teisele, neutraalne teade (N-08); tellimismeeskonnale koond ja jääk.
- **[D-08] Auditijälg on ainult lisatav.** Iga peatükkide V–T sündmus salvestatakse ajatempli, tegutseja, vooru, koolituse ning enne/pärast seisuga. Andmebaas keelab kirjete muutmise ja kustutamise. Auditijälg on **esmane tõend**; tellimuse dokumendid tuletatakse sellest.
- **[D-09] Partneri toimingute tuvastamine.** Salvestatakse tegutsev kontaktisik (nimi, e-post hankeosa partneri andmetest) ning IP-aadress ja brauseri tunnus — ainult hanke tõendina, mitte muuks otstarbeks.

---

## E — Servajuhud

- **[E-01] Partner deaktiveeritakse avatud vooru ajal.** Partner jäetakse jaotusest välja, tema märkeid ei arvestata, partnerit ja tellijat teavitatakse, auditijälge lisatakse märkus.
- **[E-02] Ükski partner ei kinnita.** Kõik koolitused jäävad jääki → T-06.
- **[E-03] Tühja märgete komplekti kinnitamine** = loobumine (K-07).
  *Täpsustus (v2.1):* liides küsib enne kinnitamist üle („Ühtegi koolitust ei ole märgitud. Kinnitada loobumine kõigist vooru koolitustest?“) ja salvestab kande liigiga *loobumine*, mitte tühja kinnitusena — nii on loobumine hiljem eristatav vastamata jätmisest (K-08).
- **[E-04] Piirmäär on märgetest väiksem.** Jaotatakse piirmäära sees kuupäeva järjekorras; piirmäära ületavad märked loetakse madalama kohaga partnerite suhtes märkimata koolitusteks (need „voolavad alla“).
- **[E-05] Toiming pärast tähtaega.** Lükatakse tagasi selge teatega ja logitakse.
- **[E-06] Aeg.** Kõik tähtajad Tallinna aja järgi; tööpäevad Eesti riigipühade alusel (kasutatakse sama arvutust kui v1-s: `src/domain/working-days.ts`). *Kalendri- või tööpäevad — vt L-10.*
- **[E-07] Tellimuse muutmine pärast kinnitamist.** Tellija võib määratud koolituse tühistada põhjusega (partnerit teavitatakse; koolitus võib minna uude vooru). Kui partner loobub pärast kinnitamist, salvestatakse see eraldi sündmusena („partner loobus pärast kinnitamist“) ja märgitakse lepingulise järelmenetluse jaoks — menetlus ise toimub väljaspool rakendust.
- **[E-08] Võrdsed kohad.** Kohad on hankeosa piires unikaalsed, seega viike ei teki.
- **[E-09] Koolitus on korraga maksimaalselt ühes avatud voorus.** Uude vooru viidud jääk säilitab oma tunnuse ja ajaloo.
- **[E-10] Samaaegsed toimingud.** Server järjestab kirjutamised; kehtib viimane kinnitus; partneri vaade värskendab prognoosi iga salvestuse järel.

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
  **Märkus:** koha 2 partner näeb paratamatult koha 1 partneri kinnitatud märgete mõju üheselt. Hind on raamlepingus fikseeritud, seega see teave ei võimalda „üle pakkuda“, vaid ainult planeerida.
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

- **[L-08] Partneri autentimine.**
  **Valik MVP-s:** isiklik tokeniga link (nagu v1-s). **Hiljem:** kasutajakonto.
  **Seis:** otsustatakse veebi-MVP planeerimisel.

- **[L-09] Tellija ülevaatuse aeg.**
  **Valik:** vaikimisi 2 tööpäeva pärast tähtaega (T-07). Raamlepingus alust ei tuvastatud.
  **Seis:** kinnitada.

- **[L-10] „3 päeva“ — töö- või kalendripäevad?**
  **Ettepanek:** tööpäevad Eesti tava kohaselt (E-06).
  **Seis:** **kinnitada spetsialistidega.**

- **[L-11] Mida partneri olekuveerg järgib — mustandit või kinnitust?**
  **Valik:** neli olekut (N-03) arvutatakse partneri **mustandi** järgi, sest märke mõju peab olema näha enne kinnitamist (E-10). Kui mustand erineb viimasest kinnitusest, kuvatakse silmatorkav hoiatus (K-03) ja mõlemad arvud: „Prognoosis sinule (esialgne) X · kinnitatud seisuga Y“.
  **Alternatiiv:** olekud ainult kinnitatud märgete järgi — üheselt tõene, kuid partner ei näe oma kavandatava valiku mõju enne, kui on end sellega sidunud.
  **Seis:** otsustatud; hoiatus on selle valiku hind ja peab jääma nähtavaks.

- **[L-12] Suletud vooru tühistamine.**
  **Valik:** V-02 ei sisalda üleminekut `suletud → tühistatud`. Suletud voor lõpetatakse kinnitamisega; kui midagi ei tohi määrata, jäetakse ülevaatusel kõik partnerid vahele (T-02), kõik koolitused muutuvad jäägiks ja neid käsitletakse T-06 alusel.
  **Alternatiiv:** lubada suletud vooru tühistamine põhjendusega — lühem tee, kuid jätab partnerite kinnitused ilma nähtava tulemuseta.
  **Seis:** **vajab spetsialistide seisukohta** — kas jäägi tee on piisav.

- **[L-13] Kes saab prognoosi muutuse teate (D-04)?**
  **Valik:** teade läheb neile partneritele, kelle prognoos muutus **kellegi teise** kinnituse tõttu. Kinnitanud partner ise selle teate ei saa — tema kinnituse kviitung (D-02) juba sisaldab tema uut prognoosi, ja kaks teadet ühe toimingu kohta õpetab mõlemat ignoreerima.
  **Alternatiiv:** teade ka kinnitajale, D-04 sõnastuse järgi tähttäheliselt.
  **Seis:** otsustatud; sagedusepiirang (4 h) ja viimase 24 tunni vaikus jäävad D-04 järgi kehtima.

- **[L-14] Töömahu hoiatuse künnise näidisväärtus.**
  **Valik:** näidiskeskkonnas on hankeosa OSA-2 künnis **4** koolitust, mitte 25, et T-01 hoiatus oleks testimisel üldse saavutatav. Ekraanil on see märgitud testväärtusena.
  **Seis:** näidisandmete otsus; päris keskkonnas tuleb künnis L-07 vastuse alusel seadistada.

- **[L-15] Loobumise ja tellimuse dokumendi keel.**
  **Valik:** tellimuse dokument (T-05) on prinditav HTML-leht, mis koostatakse kinnitamise hetkel külmutatud hetktõmmisest — mitte päringutest, sest leping peab hiljem ütlema sedasama, mida kinnitamise hetkel.
  **Alternatiiv:** PDF-eksport serveris.
  **Seis:** otsustatud MVP jaoks; PDF lisatav hiljem.

- **[L-16] Näidisandmete ausus.**
  **Valik:** näidisstsenaariumid koostatakse **päris mootorikutsetega tagasikeritud virtuaalkellal**, mitte käsitsi kirjutatud ridadena, ja koolitus märgitakse läbiviiduks ainult siis, kui selle toimumiskuupäev on möödas.
  **Põhjendus:** auditijälg, teavituste logi ja külmutatud hetktõmmised peavad olema tõesed ka näidiskeskkonnas — vastasel juhul näidatakse spetsialistidele midagi, mida süsteem tegelikult ei tee.
  **Seis:** otsustatud.

---

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
| K1 | prognoosis sinule | eesõigusega partner on märkinud | märgitud, prognoosis ei ole (eesõigusega partner) |
| K2 | prognoosis sinule | märgitud, prognoosis ei ole (eesõigusega partner) | eesõigusega partner on märkinud |
| K3 | märgitud, prognoosis ei ole (üle piirmäära) | prognoosis sinule | märgitud, prognoosis ei ole (eesõigusega partner) |
| K4 | saadaval | prognoosis sinule | märgitud, prognoosis ei ole (eesõigusega partner) |
| K5 | märgitud, prognoosis ei ole (üle piirmäära) | saadaval | prognoosis sinule |
| K6 | saadaval | prognoosis sinule | märgitud, prognoosis ei ole (eesõigusega partner) |
| **Prognoos** | **2** | **3** | **1** |

Ükski partner ei näe, *kes* on eesõigusega märkija (N-04). Tellija näeb kogu maatriksit (N-01).

### B.3 Muudatus akna ajal (K-04, N-05)

A eemaldab märke K2 ja kinnitab uuesti. Nüüd A soovitud = K1, K3, K5 → piirmäär 2 → **K1, K3**.
B jaoks liigub K2 olekusse „prognoosis sinule“ ja K3 olekusse „märgitud, prognoosis ei ole“; B prognoos jääb 3 (K2, K4, K6). C prognoos jääb 1 (K5). Just seda kõikumist tähistab silt „esialgne“.

### B.4 Tellija ülevaatus kohandusega (T-02)

B jooksev töömaht on 26 ≥ piir 25 → hoiatus (T-01). Tellija otsustab **piirata** B-d selles voorus 1 koolitusega, põhjendus: „B-l on käimas 26 koolitust, teiste koolituste kvaliteet võib kannatada“.

Lõplik jaotus (B.1 märgetega): A: **K1, K2** · B: **K3** · C: **K4, K5, K6** · jääk: puudub.

Kinnitamisel (T-04) luuakse kolm tellimust (T-05), C saab teate oma kolmest koolitusest, B saab tellimuse ühe koolitusega ning neutraalse teate, et K4 ja K6 „määrati … teisele partnerile“ — sõnastus ei avalda, et põhjus oli tellija kohandus (N-08). Kohandus ja põhjendus on auditijälg (D-08).

---

## Muudatuste logi

| Versioon | Kuupäev | Muudatus |
|---|---|---|
| 2.0 (mustand) | 27.08.2026 | Esimene paralleelse kaskaadi äriloogika versioon spetsialistide koosoleku ja tellija tiimi otsuste alusel. Asendab v1 järjestikuse kaskaadi kui põhimudeli; järjestikune režiim jääb alles (V-08). |
| 2.1 | 03.09.2026 | Veebirakenduse ehitamisel tehtud tõlgendused kirja pandud: uued **L-11** (olekuveerg järgib mustandit), **L-12** (suletud vooru ei tühistata), **L-13** (prognoosi muutuse teate saajad), **L-14** (näidiskünnis 4), **L-15** (tellimus on prinditav HTML), **L-16** (näidisandmed koostatakse päris mootorikutsetega); täpsustused **J-01** (kaasav tähtaja hetk), **V-04** (märked jäetakse välja sisendi koostamisel, kinnitusi ei muudeta), **E-03** (üleküsimine ja kande liik), **N-08** (neutraalne sõnastus ilma „eesõiguse alusel“), **T-05** (prinditav HTML). Reeglid ise ei muutunud. |
