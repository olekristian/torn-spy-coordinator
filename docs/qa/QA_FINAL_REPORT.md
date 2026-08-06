# QA final report — fase 5

Dato: 2026-07-23  
Scope: staging, migrasjonsverifisering og release-gates.  
Produksjonsdeploy/push/merge: ikke utført.

## Executive summary

En privat, isolert kopi av den operative Google Sheet-ledgeren ble opprettet:
[Tasks — Torn Spy Coordinator Phase 5 Staging 2026-07-23](https://docs.google.com/spreadsheets/d/1sG8sFEROsTqBECSMYYUHcu1a3d16v-s26P1-9Iw1WbE/edit).
Originalarket ble bare lest; stagingkopien er ikke delt.

Live headerinspeksjon av kopien avdekket en kritisk kompatibilitetsfeil før
migrasjon: eksisterende `Targets` og `Orders` har en annen kolonnerekkefølge
enn `HEADERS` i backend. Append- og target-update-rutinene brukte kodekonstantens
rekkefølge og ville derfor skrevet verdier under feil headers. Dette er rettet
lokalt ved å bruke arkets faktiske headerrekke for alle reads/writes, legge nye
headers etter faktisk siste kolonne, avvise dupliserte headers og behandle tom
legacy-versjon som versjon 1.

Frontend/backend-versjonsmarkørene var også ulike og er samkjørt. Etter den
ikke-deployede kanselleringsfunksjonen 2026-08-04 er gjeldende kandidat
`2026-08-06-torn-session-v1`.

Den komplette lokale pakken passerer nå **51/51 tester**. De fem eksterne
runtime-gatene er likevel ikke PASS: det finnes ingen staging Apps
Script-deploy eller staging-URL, nettleserprofilen er ikke Google-innlogget,
test-properties er ikke satt og ingen Discord-testwebhooks er tilgjengelige.

Produksjonsanbefaling: **NO-GO**.

## Gates

| Gate | Status | Evidens | Hva mangler for PASS |
|---|---|---|---|
| 1 — Apps Script transport og auth | **BLOCKED** | Lokal POST/body-, query-reject-, canonical actor- og authorization-harness passerer. Ingen stagingdeploy eller autentisert Apps Script-runtime var tilgjengelig. | Deploy `phase5-rc1` bundet til stagingkopien, sett test-properties og ta maskert browser/network-evidens. |
| 2 — Schema migration mot ekte Sheet-copy | **BLOCKED** | Ekte privat Sheet-kopi opprettet og headers lest. Kritisk live-layoutfeil funnet og rettet lokalt. Tre migrasjonsregresjoner passerer, inkludert dobbel ensure og faktisk legacy-headerrekkefølge. Ingen kodebasert `ensureSheets_()` ble kjørt i Google-runtime. | Kjør ny backend mot kopien to ganger, sammenlign alle headers, IDs, radantall og representative flows før/etter. |
| 3 — Google Sheets formula semantics | **BLOCKED** | Lokal typed-sink-test for `=1+1`, `+1`, `-1+2`, `@test` passerer. | Kjør verdiene gjennom den deployede backendens faktiske write-path og bekreft `userEnteredValue`, ingen formel/evaluering og numeriske felt som tall. |
| 4 — Discord outbox og mentions | **BLOCKED** | Lokale mocks verifiserer logical dedupe, `pending/sending/sent/failed/unknown`, eksplisitt `confirmUnknown` og tom `allowed_mentions`. | Dedikerte manager/employee/customer-testwebhooks og kanalbevis for 2xx, 400, 429 hvis mulig, 500/mock, timeout/mock og mentions. |
| 5 — Authenticated browser regression | **BLOCKED** | Browser åpnet kun Google-innlogging; ingen stagingapp eller testcredentials. Lokal parser-, frontend- og accessibility-kontrakt passerer. | Google-innlogget stagingoppsett, staging-URL, to employee-koder, admin-key og fixtures for full employee/manager/concurrency/responsive/a11y-kjøring. |

Ingen gate er merket PASS uten den faktiske runtime-evidensen fase 5 krever.

## Nye faktiske funn i fase 5

### QA-018 — Live Sheet-headerrekkefølge ville korrumpert nye writes

- **Før-status:** P0 / CONFIRMED mot faktisk struktur i Sheet-kopien og
  deterministisk reproduksjon.
- **Live evidens:** `Targets` har historisk `level` etter `updatedAt`, mens
  backendkonstanten har `level` som kolonne 4. `Orders` har også historisk
  rekkefølge for `notes`/timestamps før automasjonsfeltene.
- **Rotårsak:** `appendObject_()`, `appendObjects_()` og `updateTarget_()` brukte
  `HEADERS`-rekkefølgen i stedet for levende headerposisjoner.
- **Konsekvens:** nye rader eller target-updates etter migrasjon kunne plassere
  level, notes, state, pris, timestamps og automasjonsfelt i feil kolonner.
- **Lokal fix:** levende headers styrer reads/writes; manglende headers appenderes
  etter faktisk siste kolonne; duplikate headers gir tydelig stopp.
- **Nåstatus:** FIXED — LOCAL/HARNESS VERIFIED ONLY. Må kjøres mot stagingkopien.

### QA-019 — Frontend/backend deploydiagnostikk hadde permanent mismatch

- **Før-status:** P1 / CONFIRMED i faktisk kildekode.
- **Rotårsak:** frontend annonserte `2026-06-13-automation-v1`, backend
  `2026-07-23-phase4-v1`.
- **Lokal fix:** begge annonserer samme kandidat, nå
  `2026-08-06-torn-session-v1`, med regresjonstest.
- **Nåstatus:** FIXED — STATIC VERIFIED ONLY. Må bekreftes via staging `version`.

## Lokal regression

- Automated: **51 passed, 0 failed**.
- Migrasjon: 3 nye tester for additive headers, dobbel ensure, legacy-rad,
  faktisk `Targets`/`Orders`-rekkefølge og write round-trip.
- Deployversjon: frontend/backend-paritet er nå testet.
- Diff whitespace: PASS.
- Ekstern runtime: 5 gates BLOCKED.

## Migration result

Utført:

- Privat stagingkopi opprettet med separat spreadsheet-ID.
- Faner og kritiske headers lest fra kopien.
- Kopien har eksisterende data/IDs og mangler `Outbox`.
- Lokal migration rehearsal kjører `ensureSheets_()` to ganger uten reset eller
  duplikate nye headers mot representativ legacy-struktur.
- Faktisk historisk headerrekkefølge er lagt inn som regresjonsfixture.

Ikke utført:

- `ensureSheets_()` er ikke kjørt inne i Google Apps Script mot kopien.
- Ingen headers eller data i stagingkopien er mutert etter kopieringen.
- Ingen faktiske flows er kjørt mot kopien.

Dermed er Gate 2 fortsatt BLOCKED.

## Formula semantics result

Ingen formula-corpus ble skrevet til Google Sheet fordi den faktiske
backend-write-pathen ikke kunne deployes. Direkte Sheets API-skriving ville ikke
verifisert produktets sink og ble derfor ikke brukt som erstatning.

## Discord result

Ingen Discord-kall ble sendt. Det finnes ingen testwebhook/testkanal i miljøet.

Den implementerte garantien er:

- én intern logical event per stabil `eventId`;
- to lokale workers kan ikke reservere samme pending event samtidig;
- `sent` resendes ikke;
- HTTP-feil blir `failed`;
- timeout/ambiguous resultat blir `unknown`;
- `unknown` retrys ikke automatisk og krever eksplisitt
  `confirmUnknown=true`;
- ekstern leveranse er **at-least-once**, ikke exactly-once, ved ambiguous
  provider outcome.

## Authenticated browser result

- Employee: BLOCKED — ingen staging-URL eller testcredentials.
- Manager: BLOCKED — ingen staging-URL eller admin testcredential.
- Network/credential scan: BLOCKED — ingen stagingdeploy.
- Responsive/a11y authenticated: BLOCKED.
- Google-nettleseren stoppet ved innlogging; ingen credential ble skrevet inn.

## Compatibility window

| Kombinasjon | Støttet? | Begrunnelse |
|---|---|---|
| Gammel frontend + ny backend | **Nei** | Gammel frontend bruker credential-bearing GET/JSONP/query og mangler stabile request IDs/preconditions som ny backend avviser. |
| Ny frontend + gammel backend | **Ikke godkjent** | Transport kan delvis fungere, men gammel backend mangler canonical employee identity, locks, idempotency, version guards, typed sinks og Outbox. Sikkerhets-/ledgergarantiene gjelder ikke. |

Bruk et kontrollert vedlikeholdsvindu. Hold brukertrafikk av appen, migrer og
deploy backend, deploy frontend umiddelbart etterpå, og åpne først etter smoke,
employee-, manager- og Outbox-test.

## Produksjonsrekkefølge når alle gates er PASS

1. Frys mutasjoner og Outbox-operatørretry.
2. Eksporter/backup alle relevante Sheets og registrer radantall/headerhash.
3. Verifiser properties og secretscan; valider `TORN_COMPANY_ID` og Torn-innlogging.
4. Kjør `ensureSheets_()` og før/etter-diff; kjør den på nytt for idempotens.
5. Deploy immutable Apps Script-versjon `2026-08-06-torn-session-v1`.
6. Deploy frontend med samme versjon i det avtalte vedlikeholdsvinduet.
7. Kjør credential-fri og maskert immediate smoke/network-test.
8. Kjør autentisert employee-test med avgrenset fixture.
9. Kjør manager-test og auditinspeksjon.
10. Kjør én dedikert test-Outbox/Discord-event og verifiser Sheet + kanal.
11. Åpne trafikk bare hvis alle sjekklistelinjer er PASS.

## Rollback plan

Rollback-kriterier:

- credential i URL/logg/respons;
- auth/ownership bypass;
- feil kolonnemapping, ID-endring eller datatap;
- duplisert økonomisk mutasjon;
- ukontrollert Discord-resend/ping;
- frontend/backend-versjonsmismatch eller kritiske uncaught errors.

Handling:

1. Stopp trafikk og alle Outbox-retries.
2. Ta ny snapshot av Sheet og Outbox før rollback.
3. Rull frontend tilbake til forrige statiske artifact.
4. Pek Apps Script-webappen tilbake til forrige immutable deploymentversjon.
5. Behold additive headers og `Outbox`; ikke slett migrerte kolonner som første
   tiltak.
6. Behold `sent` urørt. Frys `pending`, `sending`, `failed` og `unknown`.
7. Reconcile `sending` til `unknown` etter lease, kontroller test-/Discordkanal
   manuelt og retry aldri `unknown` uten eksplisitt operatørbeslutning.
8. Registrer event-ID, kanalobservasjon og beslutning før eventuell resend for å
   unngå doble Discord-events.
9. Gjenåpne bare etter rollback-smoke og ledgerdiff.

## Remaining manual configuration

På staging først, deretter produksjon etter godkjente gates:

- `TORN_COMPANY_ID`: numerisk company-ID for stagingmiljøet.
- `ADMIN_KEY`: separat sterk staging manager-key.
- `SESSION_SECRET`: autogenerert eller eksplisitt lang tilfeldig verdi; legacy `EMPLOYEE_ACCESS_MAP` kan fortsatt brukes med minst to unike koder og
  canonical navn, eksempel
  `{"<unik-kode-a>":"QA Employee A","<unik-kode-b>":"QA Employee B"}`.
- `ADMIN_ACTOR`: canonical managernavn, eksempel `QA Manager`.
- `MANAGER_DISCORD_WEBHOOK_URL`: kun manager-testkanal.
- `EMPLOYEE_DISCORD_WEBHOOK_URL`: kun employee/new-order-testkanal.
- Eventuelle kundewebhooks:
  `CUSTOMER_DISCORD_WEBHOOK_URL_<NORMALISERT_ORDER_ID>` eller
  `CUSTOMER_DISCORD_WEBHOOK_URL_<NORMALISERT_CUSTOMER>`, kun test.
- Apps Script web app: execute as owner, eksplisitt tillatt målgruppe,
  immutable stagingversjon og separat URL.
- Frontend staging: `DEFAULT_API` må peke på stagingdeployen og aldri
  produksjonsdeployen.

Aliasene `DISCORD_MANAGER_WEBHOOK_URL`, `MANAGER_WEBHOOK_URL`,
`DISCORD_EMPLOYEE_WEBHOOK_URL`, `EMPLOYEE_WEBHOOK_URL` og
`DISCORD_WEBHOOK_URL` støttes, men én eksplisitt property per rolle anbefales
for å unngå feil kanal.

## Production recommendation

**NO-GO**

Begrunnelse: fem av fem obligatoriske eksterne runtime-gates er BLOCKED.
I tillegg ble en P0 live-schema-kompatibilitetsfeil rettet etter inspeksjon av
stagingkopien og må derfor runtimeverifiseres før release.

## Production impact

Faktisk produksjon ble ikke deployet, mutert, pushet eller merget. Det
operative originalarket ble kun lest for metadata/headerverifisering og
kopiert. Alle videre undersøkelser var mot den private stagingkopien eller
lokal harness.
