# QA-funn – fase 3 deep QA og fase 4-verifisering

Dato: 2026-07-23  
Omfang: lokal, deterministisk kjøring av faktisk `apps-script/Code.gs` og
parserkoden fra faktisk `index.html`.  
Produksjonsmutasjoner: ingen.

## Gjeldende fase-4-status

Tabellen under er autoritativ nåstatus. De detaljerte `Severity/status`-linjene
lenger ned beskriver før-statusen fra fase 3 og beholdes som rotårsaks- og
reproduksjonshistorikk.

| QA-ID | Før | Nåstatus | Verifikasjon |
|---|---|---|---|
| QA-001 | P0 CONFIRMED | FIXED — CODE/HARNESS VERIFIED ONLY | Frontend genererer kun POST/body; backend avviser direkte og kodet query-payload |
| QA-002 | P1 CONFIRMED | FIXED — CODE/STATIC VERIFIED ONLY | Configured krever verifisert backendrespons; invalid state fjernes og Edit access finnes |
| QA-003 | P1 CONFIRMED | FIXED — DETERMINISTIC VERIFIED | Hele parserkorpuset passerer eksplisitte regler |
| QA-004 | P3 CONFIRMED | FIXED — CODE/STATIC VERIFIED ONLY | `role=status`, polite live-region og atomic semantics |
| QA-006 | P1 CONFIRMED | FIXED — DETERMINISTIC VERIFIED | Lock, canonical re-read, state guard og én audit |
| QA-007 | P1 CONFIRMED | FIXED — DETERMINISTIC VERIFIED | `EMPLOYEE_ACCESS_MAP` utleder canonical actor; owner/managerguard |
| QA-008 | P1 CONFIRMED | FIXED — DETERMINISTIC VERIFIED | Stabil requestId, lock, replay og partial-write reconciliation |
| QA-009 | P1 CONFIRMED | FIXED — DETERMINISTIC VERIFIED | submissionId/version/precondition og idempotent review recovery |
| QA-010 | P1 CONFIRMED | FIXED — DETERMINISTIC VERIFIED | Atomisk requestId-dedupe, totals, overpayment guard og recovery |
| QA-011 | P1 CONFIRMED | FIXED — DETERMINISTIC VERIFIED | Request- og work-unit-vern, mirror recovery og overpayment guard |
| QA-012 | P1 CONFIRMED | FIXED — DETERMINISTIC VERIFIED | ID-allokering og create/upsert skjer under samme script lock |
| QA-013 | P1 CONFIRMED | FIXED — DETERMINISTIC VERIFIED | Idempotente operation IDs, ordered commit, retry/reconcile og audit etter commit |
| QA-014 | P1 CONFIRMED | FIXED — DETERMINISTIC MOCK VERIFIED | Durable Outbox, event-ID, sending/sent/failed/unknown og eksplisitt reconciliation |
| QA-015 | P2 CONFIRMED | FIXED — DETERMINISTIC VERIFIED | Direkte canonical audit-action avvises; manager actor er serverstyrt |
| QA-016 | P1 SUPPORTED | FIXED — CODE/HARNESS VERIFIED ONLY | Sentralt typed Sheet-sinkvern; ekte Sheets-formelsemantikk må runtimeverifiseres |
| QA-017 | P2 SUPPORTED | FIXED — CODE/HARNESS VERIFIED ONLY | Alle Discord-payloads har tom `allowed_mentions`; ekte webhooktest gjenstår |

Automatisert fase-4-resultat: **42 passed, 0 failed**. Lokal browserkontroll
ble forsøkt, men `file:`-navigasjon ble blokkert av browserens URL-policy.
Ingen produksjonsruntime ble brukt som omvei.

## Metode og evidensstyrke

Harnessen emulerer Sheets, properties, HTTP-respons og Discord-kall og kan
pause etter read-snapshot eller kaste ved valgte writes. Den kjører
produksjonsfunksjonene uendret; den er ikke en omskriving av forretningslogikken.
27 tester passerer som beskrivelser/reproduksjoner av dagens atferd.

Status betyr:

- `CONFIRMED`: bruddet ble deterministisk reprodusert i faktisk funksjonskode.
- `SUPPORTED BY DETERMINISTIC CODE PATH`: input når en farlig sink uendret, men
  endelig ekstern effekt krever ekte Google Sheet eller Discord.
- `BLOCKED`: kan ikke avgjøres uten isolert ekstern runtime.

## Høyest-risiko invariants

1. En canonical overgang må være autorisert, state-validert og atomisk.
2. Én logisk betaling, payout, submission, ordre eller notifikasjon skal gi
   nøyaktig én canonical effekt.
3. Retry etter ukjent resultat skal enten fullføre/reconcile samme operasjon
   eller returnere samme resultat, aldri duplisere eller låse inn delvis state.
4. Audit-success må først oppstå etter fullført canonical mutasjon og actor må
   komme fra autentisert serveridentitet.
5. Eksterne sideeffekter må ha varig event-ID/outbox og trygg retry.
6. Ubetrodd tekst skal lagres/sendes som tekst uten Sheet-formler eller
   Discord-mentions.
7. Credentials skal ikke forekomme i URL-er.

## Severity summary

| Severity | Antall | Funn |
|---|---:|---|
| P0 | 1 | QA-001 |
| P1 | 12 | QA-002, QA-003, QA-006–QA-014, QA-016 |
| P2 | 2 | QA-015, QA-017 |
| P3 | 1 | QA-004 |

QA-005 var fase-2-blockeren for autentisert runtime. Den er ikke et
produktdefektfunn og er erstattet av den lokale harnessen.

## QA-001 — Credentials legges i request-URL

**Severity/status:** P0 / CONFIRMED  
**Rotårsak:** `index.html:935-990`, `call()` bygger alle URL-er med `key` og
`admin`; POST-fallback flytter i tillegg payload til GET-query og JSONP bruker
samme credential-bærende URL. Backend `getInput_()` aksepterer query-parametrene.
**Berørt:** alle actions; browser, Google redirect-/execution-/proxyflater.  
**Brutt invariant:** credentials skal ikke forekomme i URL/loggflater.  
**Interleaving:** ikke relevant.  
**Konsekvens:** credential-eksponering via URL-baserte observabilityflater;
konkret loggforekomst er ikke bevist.  
**Minimal robust fix:** body-basert POST for autentiserte kall, fjern
credential-bærende GET/JSONP-fallback, kortlevd serverutstedt sessiontoken og
redigering i feil/telemetri.  
**Regresjon:** canary-secret må være fraværende i request URL, redirect,
history, referrer, execution logs, feil og export.

## QA-002 — Ugyldig access låser UI i «saved»-state

**Severity/status:** P1 / CONFIRMED  
**Rotårsak:** `saveSettings()` persisterer input før verifisering
(`index.html:918-932`); `updateSetupState()` anser enhver ikke-tom key som
konfigurert (`723-731`); catch-pathen (`2114-2118`) nullstiller ikke eller
tilbyr recovery.  
**Berørt:** localStorage, setup/refresh UI; ingen Sheet.  
**Brutt invariant:** synlig credential-state skal reflektere verifisert
serverstate.  
**Interleaving:** ikke relevant.  
**Konsekvens:** bruker blir låst i feil state og kan ikke korrigere credential.  
**Minimal robust fix:** egen `accessVerified`-state, persister først etter
verifisering eller behold alltid Edit/Forget; ugyldig access må fail-open for
recovery, ikke for data.  
**Regresjon:** invalid/expired/network-error/reload/ny fane og vellykket
recovery.

## QA-003 — Parser gir plausible feilverdier uten varsel

**Severity/status:** P1 / CONFIRMED  
**Rotårsak:** i `parseStats()` (`index.html:1148-1164`) står det brede tokenet
`\d[\d., ]*` før suffix-tokenet, slik at `1.5k` avkortes. `parseNumberToken()`
(`1082-1095`) fjerner komma blindt og regexen krever ikke boundary etter den
fangede verdien.  
**Berørt:** client-parser; ved submit: `Submissions` og senere kundeleveranse.  
**Brutt invariant:** parser skal ikke produsere plausible, feil stats uten
advarsel.  
**Interleaving:** ikke relevant.  
**Konsekvens:** dramatisk feil canonical stats og kundeoutput.  
**Minimal robust fix:** én eksplisitt, full-token grammar; avgjør støttede
localeformater; suffix før plain token; boundary/full-line; avvis tvetydig og
trailing tekst; safe-integer/rangekontroll.  
**Regresjon:** korpuset i `tests/qa/parser-corpus.test.cjs`, inkludert normal,
US/EU-separatorer, whitespace, k/m/b/t i begge case, malformed, blandede
separatorer, invalid, zero, store tall og 3-av-4-inferens.

## QA-004 — Async status annonseres ikke semantisk

**Severity/status:** P3 / CONFIRMED (nedgradert fra P2 etter fase-3-kriteriene)  
**Rotårsak:** `#err` oppdateres av `setStatus()` uten `role`/`aria-live`.  
**Berørt:** frontendstatus; ingen Sheet.  
**Brutt invariant:** kritiske feil skal være programmatisk annonserbare.  
**Konsekvens:** skjermleserbrukere kan gå glipp av feil.  
**Minimal robust fix/regresjon:** riktig live-region/rolle, browser- og
skjermlesertest uten dobbelannonsering.

## QA-006 — Claim er en lost-update race

**Severity/status:** P1 / CONFIRMED  
**Rotårsak:** `claimTarget_()` → `updateTarget_()` (`Code.gs:274-285`,
`1243-1270`) gjør read-modify-write uten `LockService`, forventet state eller
versjon. Den validerer heller ikke at target er `open`.  
**Berørt:** `Targets`, `AuditLog`; `claimTarget_`, `updateTarget_`.  
**Brutt invariant:** høyest én claimant og høyest én success per open target.  
**Interleaving:** A leser open; B leser open; B skriver owner B/success/audit;
A skriver owner A/success/audit. Begge lykkes, siste write vinner.  
**Konsekvens:** dobbeltarbeid, falsk audit og uklar eier.  
**Minimal robust fix:** script lock rundt canonical re-read + transition guard
`open → claimed`; returner conflict med canonical owner; versjonsfelt for
klientkonflikt.  
**Regresjon:** barrierebasert A/B ×50: nøyaktig én success, én owner, én audit.

## QA-007 — Claim-eierskap håndheves ikke ved unclaim/submit

**Severity/status:** P1 / CONFIRMED  
**Rotårsak:** `unclaimTarget_()` (`288-298`) og `submitSpy_()` (`300-336`)
sammenligner aldri autentisert actor med `claimedBy`; `employee` er
klientstyrt tekst og access code er felles.  
**Berørt:** `Targets`, `Submissions`, `AuditLog`; dispatch/accessvalidering.  
**Brutt invariant:** bare canonical owner eller eksplisitt manageroverride kan
frigi eller submitte.  
**Interleaving:** ikke nødvendig; A sender target eid av B og får success.  
**Konsekvens:** uautorisert stateendring, feil arbeid/attribution og
datakorrupsjon.  
**Minimal robust fix:** serververifisert identitet, owner/state-guard inne i
samme lock som write; separat auditert manageroverride.  
**Regresjon:** owner/non-owner/spoofed display/admin override mot alle states.

## QA-008 — Submission mangler idempotens og recovery

**Severity/status:** P1 / CONFIRMED  
**Rotårsak:** `submitSpy_()` lager alltid ny `uid_` og append til `Submissions`
før target-update; ingen requestId, unik nøkkel eller reconcile (`300-336`).  
**Berørt:** `Submissions`, `Targets`, `AuditLog`, order-completion.  
**Brutt invariant:** én logisk submit gir én submission og én konsistent target.  
**Interleaving/failure:** identisk sekvensiell retry gir to rader. Parallelle A
og B leser samme target før noen append og begge lykkes med hver sin rad. Ved
feil etter append står én submission med target fortsatt `claimed`; retry lager
rad 2.  
**Konsekvens:** duplikater, feil «latest» payload og mulig feil review/delivery.  
**Minimal robust fix:** obligatorisk stabil requestId, lock + lookup/append,
operasjonsstatus og resume/reconcile før duplicate-return.  
**Regresjon:** dobbeltklikk, parallell samme ID, timeout etter hvert write,
samme og ulik payload under samme ID.

## QA-009 — Stale review overskriver nyere canonical review

**Severity/status:** P1 / CONFIRMED  
**Rotårsak:** `reviewSubmission_()` (`339-366`) velger siste submission for
target, men krever verken submissionId, expected status, `updatedAt` eller
versjon. Frontend kan resynce localStorage-review.  
**Berørt:** `Submissions`, `Targets`, `AuditLog`, order completion.  
**Brutt invariant:** stale klient må ikke overskrive nyere review/payload.  
**Interleaving:** B godkjenner og redigerer; gammel A sender
`pending_review`/gammel payload; A overskriver begge rader.  
**Konsekvens:** tapt godkjenning, feil stats, ordre trekkes tilbake/endres.  
**Minimal robust fix:** submissionId + expectedVersion/ETag, lock og 409 conflict;
reviewhistorikk som append-only.  
**Regresjon:** approve/reject/edit i begge rekkefølger, ny submission mens gammel
review er åpen, refresh/resync.

## QA-010 — Customer payment-idempotens er ikke atomisk og kan låse delvis state

**Severity/status:** P1 / CONFIRMED  
**Rotårsak:** `recordCustomerPayment_()` (`381-409`) gjør
read-by-requestId→append→recalculate→confirm→audit uten lock/transaksjon.
Duplicate-path returnerer før recovery.  
**Berørt:** `CustomerPayments`, `Orders`, `AuditLog`, Discord new-order.  
**Brutt invariant:** samme requestId gir én betaling og all avledet state
reconciles.  
**Interleaving/failure:** A/B ser ingen rad, begge appender 60 og ordre på 100
blir `paid`. Separat: append lykkes, order-write feiler; retry ser duplicate og
returnerer mens ordre forblir `unpaid` uten success-audit.  
**Konsekvens:** falsk betaling/fullføring eller permanent ledger/order-drift.  
**Minimal robust fix:** lock + request ledger med `processing/completed`,
canonical recalculation/reconcile før replay-response; unik logisk nøkkel og
beløps-/statusvalidering.  
**Regresjon:** parallelle retries, ukjent resultat ved hvert write, void/retry,
overpayment og recovery-jobb.

## QA-011 — Payout-idempotens og work-linkage er ikke atomisk

**Severity/status:** P1 / CONFIRMED  
**Rotårsak:** `recordEmployeePayout_()` (`443-478`) har samme
check-then-append-race; den tillater også ny requestId for samme submission.  
**Berørt:** `EmployeePayouts`, `Targets`, `AuditLog`.  
**Brutt invariant:** én work unit kan ikke betales mer enn én gang og mirror
skal være konsistent.  
**Interleaving/failure:** A/B ser ingen requestId, begge appender 60; target
mirror blir `paid`. To ulike requestIds for samme submission gir også to
payouts. Ved append→target-mirror-feil returnerer retry `duplicate` uten å
reparere mirror eller audit.  
**Konsekvens:** dobbeltutbetaling og misvisende payoutstatus.  
**Minimal robust fix:** lock, request ledger, unik payout-key per
submission/work-unit, eksplisitt partial-policy og reconcile.  
**Regresjon:** samme requestId sekvensielt/parallelt, ulike IDs samme work,
partial/full/void og feil etter hvert write.

## QA-012 — Parallel `max+1` slår sammen separate ordrer

**Severity/status:** P1 / CONFIRMED  
**Rotårsak:** `nextOrderId_()` (`264-271`) beregner `max+1` uten lock; add
appender target før ikke-atomisk order-upsert (`162-196`, `627-676`).  
**Berørt:** `Targets`, `Orders`, `AuditLog`; add/bulkAdd.  
**Brutt invariant:** separate ordre får unike ID-er og én konsistent orderrad.  
**Interleaving:** A og B leser max=2 og velger 3; begge targets ender i ordre 3,
med kundedata fra første opprettelse.  
**Konsekvens:** kundeblanding, feil pris/leveranse og personvernbrudd.  
**Minimal robust fix:** lock rundt ID-allokering og hele add/upsert, eller
UUID/sekvensregister; valider customer/order-binding.  
**Regresjon:** parallel add/bulkAdd med blank ID og forskjellige kunder ×50.

## QA-013 — Multi-row writes er ikke atomiske eller sikkert gjenopprettbare

**Severity/status:** P1 / CONFIRMED  
**Rotårsak:** add, submit, price, payment og audit består av uavhengige
per-cell/per-row writes (`appendObject_`, `writeObjectAtRow_`,
`updateTarget_`) uten operation journal/rollback. Claim skriver audit inne i
updater før target-write.  
**Berørt:** særlig `Targets`, `Orders`, `Submissions`, `CustomerPayments`,
`EmployeePayouts`, `AuditLog`.  
**Brutt invariant:** success, audit og avledet state må beskrive samme fullførte
operasjon.  
**Failure sequence:** target append→order-upsertfeil etterlater orphan; retry
lager target 2 mens order count blir 1. Price-loop feiler etter target 1.
Claim-audit appender success før target-write og kan derfor lyve.  
**Konsekvens:** orphan/partial data, feil summer og upålitelig audit.  
**Minimal robust fix:** kort lock, bulk range writes der mulig, operation
journal/outbox med `pending/completed`, idempotent reconcile; audit til slutt
med samme operationId.  
**Regresjon:** failure injection ved hver write-posisjon + retry/reconcile og
invariantdiff av alle ark.

## QA-014 — Discord check–send–mark kan sende samme event flere ganger

**Severity/status:** P1 / CONFIRMED  
**Rotårsak:** `sendNewOrderNotification_()` og completionvariantene sjekker
markør, sender, og skriver markør etterpå (`878-917`, `774-817`, `824-875`).
`sendCustomerDelivery_()` sender før delivered-write (`985-1006`) og avviser
ikke allerede levert ordre.  
**Berørt:** `Orders`, `AuditLog`, employee/manager/customer webhooks.  
**Brutt invariant:** én varig ekstern sideeffekt per logisk event.  
**Interleaving/failure:** A/B sjekker unsent, begge poster, begge markerer.
Ved leveranse lykkes post, markering feiler; retry poster på nytt.  
**Konsekvens:** spam og potensielt dobbel kundeleveranse.  
**Minimal robust fix:** durable outbox/eventId, lock ved eventopprettelse,
`pending/sent/unknown`, sender-worker og leverandør-/proxy-idempotens der mulig;
ukjent resultat skal kreve reconcile, ikke blind resend.  
**Regresjon:** parallelle kall, 2xx→write-failure, timeout, 429, restart og
outbox replay med request counter.

## QA-015 — Employee kan fabrikere canonical audit

**Severity/status:** P2 / CONFIRMED  
**Rotårsak:** dispatch `audit` (`Code.gs:85`) krever bare felles access via
`validateAccess_()` og sender klientstyrt `actor`, `auditAction`, target og
details direkte til `addAudit_()`.  
**Berørt:** `AuditLog`.  
**Brutt invariant:** actor/action for autoritative hendelser kommer fra
serververifisert operasjon/identitet.  
**Interleaving:** ikke nødvendig; employee skriver actor=`Manager`,
action=`order_delivered`.  
**Konsekvens:** forfalsket sporbarhet. Nedgradert til P2 fordi AuditLog ikke
observeres brukt som authorization/source-of-truth i denne koden.  
**Minimal robust fix:** fjern generisk canonical audit-action; allowlist
ikke-autoritativ client telemetry i separat ark og utled actor server-side.  
**Regresjon:** alle reserverte manager/system-actions, actorspoof og fri tekst.

## QA-016 — Sheet-formelinjeksjon når write-sink uendret

**Severity/status:** P1 / SUPPORTED BY DETERMINISTIC CODE PATH  
**Rotårsak:** `appendObject_()`, `appendObjects_()` og
`writeObjectAtRow_()` sender ubetrodd tekst direkte til `appendRow`,
`setValues` og `setValue` uten tekstbinding/prefixpolicy.  
**Berørt:** alle tekstkolonner i alle ark, særlig customer/name/notes/rawText,
reference, details.  
**Brutt invariant:** ubetrodd input skal lagres som tekst, aldri evalueres.  
**Interleaving:** ikke relevant.  
**Konsekvens:** mulig formelkjøring, dataeksfiltrasjon eller ark-korrupsjon.
Harnessen bekrefter uendret sink-path; faktisk Google Sheets-evaluering er
`BLOCKED` uten isolert Sheet.  
**Minimal robust fix:** sentral `asSheetText_()` for alle ubetrodde tekstfelt,
eksplisitt typed schema og `setNumberFormat('@')`/apostrofstrategi verifisert
mot Sheets API-semantikk; ikke blind-sanitiser numeriske felter.  
**Regresjon:** `=`, `+`, `-`, `@`, whitespace/control chars og alle writers i
ekte test-Sheet; assert `getFormula()==''` og round-trip tekst.

## QA-017 — Discord-payload tillater mentions

**Severity/status:** P2 / SUPPORTED BY DETERMINISTIC CODE PATH  
**Rotårsak:** meldingsbyggere interpolerer customer/name/details og
`postDiscord_()` sender bare `{content}` (`Code.gs:1160-1173`), uten
`allowed_mentions`.  
**Berørt:** employee/manager/customer Discord-webhooks.  
**Brutt invariant:** ubetrodd tekst skal ikke trigge Discord-mentions.  
**Interleaving:** ikke relevant.  
**Konsekvens:** `@everyone`, `@here`, bruker-/rollemention kan varsle uønsket.
Payloaden er bekreftet; faktisk ping er ikke sendt.  
**Minimal robust fix:** alltid `allowed_mentions:{parse:[],users:[],roles:[]}`
og eventuelt escape/avgrensning av ubetrodd tekst.  
**Regresjon:** alle meldingstyper og mentionformer mot dedikert webhook uten
faktiske massementions.

## Failure matrix for multi-write-operasjoner

| Operasjon | Varig sekvens | Injisert failure window | Liggende state | Retry i dag |
|---|---|---|---|---|
| Claim | audit → targetcelle(r) | Etter audit, før første target-write | Falsk `target_claimed`, target fortsatt open | Ny audit og nytt forsøk |
| Submit | submission append → target → audit → completion/send | Etter append, før target | Orphan submission, target claimed, ingen audit | Ny submission appendes |
| Add target | target append → order upsert → audit | Etter target append | Target uten korrekt Orders-rad | Ny target; count kan fortsatt være feil |
| Set price | target 1…N → order → recalc → audit | Etter target 1 | Ulike priser innen samme ordre | Skriver på nytt; ingen operation/recovery-status |
| Customer payment | payment append → order recalc → confirm/send → audit | Etter append, før order | Ledger har betaling, ordre unpaid, ingen audit | Duplicate-return; ingen recovery |
| Employee payout | payout append → target mirror → audit | Etter append, før target | Ledger har payout, target unpaid, ingen audit | Duplicate-return; ingen recovery |
| New/completion notification | check → Discord → Orders mark → audit | Etter 2xx, før mark | Ekstern effekt finnes, canonical unsent | Sender på nytt |
| Customer delivery | completion check → Discord → delivered mark/audit | Etter 2xx, før mark | Kunden kan ha mottatt, ordre ikke delivered | Sender på nytt |

Ingen av disse operasjonene har operation journal, rollback eller en eksplisitt
`unknown/reconcile`-state. Harnessen dekker representative write-posisjoner;
uttømmende «kast etter hver cellewrite» er del av fase-4-planen.

## Avkreftede delhypoteser

- Sekvensiell retry med identisk `requestId` gir én customer-payment-rad.
- Sekvensiell retry med identisk `requestId` gir én employee-payout-rad.
- Normal fire-stat total summeres korrekt; 3-av-4 + total infererer den
  manglende stat korrekt i det testede normalformatet.

Disse smale safeguardene avkrefter ikke de parallelle og
failure-recovery-baserte funnene over. Ingen av de høy-risiko fase-1-risikoene
ble fullstendig `DISPROVED`.

## Fortsatt blocked

- Faktisk URL-forekomst i Apps Script/proxylogger krever canary i isolert deploy.
- Faktisk Sheet-formelevaluering krever isolert Google Sheet.
- Faktisk Discord mention-adferd og leverandør-idempotens krever testwebhook.
- Reell Apps Script scheduler/LockService-belastning og multi-instance timing
  krever isolert deploy.
- Ekte browser recovery/skjermleser og full authenticated end-to-end krever
  testidentiteter og testdata.
