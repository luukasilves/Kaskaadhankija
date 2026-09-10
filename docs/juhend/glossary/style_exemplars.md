# Register exemplars — authentic Estonian from this project

Two passages the guide should **match**, not copy. Both are already addressed to
the framework's partners, both are *teie*, and the first was reviewed by the
procurement team (`src/domain/round-templates.ts:10-11` says so in its header).

What to take from them: short declarative sentences; the em-dash clause that
carries the reason; `saate` / `olete kohustatud` / `palume` rather than a bare
imperative; no hedging and no apology; and the habit of stating the rule and its
consequence in the same sentence.

## (a) `src/domain/round-templates.ts:92-105` — `renderRoundPublished`

> Lugupeetud Jaan Kask
>
> Riigikantselei esitab raamlepingu „Eesti.ai koolitajate tellimine“ (RHR
> 10567384) alusel, hankeosas OSA-2 — Koolitused ruumirendita, ettevõttele
> Tehisaru Koolitus OÜ järgmised koolitused (6).
>
> Palume märkida koolitused, mida olete valmis läbi viima, ja oma valik
> kinnitada hiljemalt 14.10.2026 17:00.
>
> Voor on avatud kõigile hankeosa partneritele korraga. Kuni tähtajani näete oma
> valiku juures esialgset prognoosi: kas koolitus on saadaval, kas selle on
> märkinud eesõigusega partner ja mida te praeguse seisuga saaksite. Prognoos on
> esialgne ja võib muutuda kuni tähtajani.
>
> Koolitused jaotatakse rangelt raamlepingu järjestuse alusel — vastamise kiirus
> ei anna eelist. Kui te tähtajaks ei kinnita, loetakse see loobumiseks. Jaotuse
> kinnitame eeldatavasti 16.10.2026.

## (b) `src/app/partner/voorud/[id]/marking-form.tsx:281-288` — the confirm panel

> Kinnitatud märge on siduv: kui koolitus teile määratakse, olete kohustatud
> selle raamlepingu tingimustel läbi viima. Ülempiir kaitseb teid liigse mahu
> eest — piirmäära sees jaotatakse koolitused toimumiskuupäeva järjekorras.
> Valikut saab muuta ja uuesti kinnitada kuni 14.10.2026 17:00.

## Where the guide must differ

Both exemplars **notify**. The guide **instructs**, so it may use the teie
imperative the notices avoid (`märkige`, `vajutage`, `avage`) and may explain a
mechanism at more length than a notice would. What it must not do is drift up
into the spec's normative register (`kasutajaliides peab kuvama`) — that voice
addresses the people building the tool, not the people using it.
