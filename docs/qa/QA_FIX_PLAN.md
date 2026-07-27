# QA fix plan – fase 4

Dato: 2026-07-23  
Status: implementert i fase 4 og verifisert lokalt; ikke deployet.

## Implementeringsstatus

| Batch | QA-ID-er | Status |
|---|---|---|
| A — Security/auth | QA-001, QA-007, QA-015, QA-016, QA-017 | COMPLETE — CODE/HARNESS VERIFIED |
| B — Concurrency/data integrity | QA-006–QA-013 | COMPLETE — DETERMINISTIC VERIFIED |
| C — Durable Discord outbox | QA-014 | COMPLETE — DETERMINISTIC MOCK VERIFIED |
| D — Parser/setup/a11y | QA-002, QA-003, QA-004 | COMPLETE — PARSER VERIFIED, UI STATIC VERIFIED |

Deployment er fortsatt sperret frem til migrasjons- og ekstern runtime-gatene i
`QA_FINAL_REPORT.md` er gjennomført.

## Mål og prinsipper

Fase 4 skal gjenopprette invariantene i `QA_FINDINGS.md` uten å lappe hvert
symptom separat. Rekkefølgen er styrt av blast radius: credentialtransport og
serveridentitet først, deretter canonical transitions/økonomi, så eksterne
sideeffekter og til slutt parser/UX.

Felles krav:

- Alle mutasjoner får en servergenerert/validert actor og en stabil
  `operationId`/`requestId`.
- Canonical precondition leses og valideres inne i samme korte script lock som
  write-reservasjonen.
- Lang ekstern I/O skal ikke holdes inne i lock; den drives fra durable outbox.
- Delvise operasjoner skal kunne resumes/reconciles deterministisk.
- Audit skrives fra serveren etter fullført operasjon med samme operationId.
- Fase-3-testene beholdes som før-tester: de skal først vise at gammel atferd
  reproduseres, og så erstattes/suppleres med forventet sikker atferd.

## Batch A — Secrets, identity og authorization boundary

### A1. Fjern credentials fra URL (QA-001)

- **Rotårsak:** `call()` legger `key`/`admin` i alle URL-er og bruker
  credential-bærende GET/JSONP-fallback.
- **Kodeflate:** frontend `call()`/`jsonpCall()`, backend `getInput_()`,
  `validateAccess_()`, `requireAdmin_()`.
- **Datastruktur:** ny kortlevd session-/capability-tokenmekanisme i
  Script Properties/Cache eller godkjent identity-provider; aldri i Sheet.
- **Migrasjon:** støtt gammel transport kun i en kort, logget og
  ratebegrenset overgang dersom deploy må rulles trinnvis; roter eksisterende
  access/admin secrets etter full overgang.
- **Rollback:** server kan midlertidig akseptere gammel body-form, men ikke
  reintrodusere URL-query; behold forrige frontendartefakt kun med roterte
  canary/testcredentials.
- **Observability:** tell avviste legacy-querykall uten å logge verdi; logg
  auth-metode og request correlation ID.
- **Tester:** request/redirect/history/referrer/logg-canary, GET/JSONP skal
  avvises for mutasjoner, CORS/preflight/network failure.
- **Akseptanse:** ingen credential/canary i noen URL eller diagnostic; alle
  autoriserte flows fungerer via sikker transport.

### A2. Innfør serververifisert employee identity og owner-guards (QA-007)

- **Rotårsak:** felles access code og klientstyrt `employee` brukes som actor.
- **Kodeflate:** request authentication, `claimTarget_`, `unclaimTarget_`,
  `submitSpy_`, `addAudit_`.
- **Datastruktur:** stabil employee ID/session principal; displaynavn er bare
  presentasjon. `claimedById` bør være canonical; migrer eksisterende
  `claimedBy` kontrollert.
- **Migrasjon:** map eksisterende ansatte/navn; uentydige navn settes til
  «requires manager review», ikke gjett.
- **Rollback:** dual-read av gammelt navn og nytt ID i overgang; writes skal
  kun bruke ny ID etter cutover.
- **Observability:** auth/owner conflict count, actorId og operationId uten
  secrets.
- **Tester:** owner/non-owner, navnespoof, expired session, manageroverride og
  alle statekombinasjoner.
- **Akseptanse:** non-owner kan ikke unclaime/submitte; actor kan ikke velges av
  klient.

### A3. Skill autoritativ audit fra klienttelemetri (QA-015)

- **Rotårsak:** generisk `audit` skriver vilkårlig actor/action til AuditLog.
- **Kodeflate:** `dispatch_`, `addAudit_`, frontend `addAuditLog()`.
- **Datastruktur:** canonical `AuditLog` får operationId/actorId/source;
  eventuell client telemetry flyttes til separat ark med allowlistet eventtype.
- **Migrasjon:** ingen historiske rader omskrives; merk cutover-tidspunkt og
  kildeversjon.
- **Rollback:** telemetry kan deaktiveres uten å påvirke canonical mutasjoner.
- **Observability/tester:** avviste reserverte actions; audit count må matche
  completed operations.
- **Akseptanse:** employee-input kan aldri lage manager/system success-event.

### A4. Sheet- og Discord-inputpolicy (QA-016, QA-017)

- **Rotårsak:** ubetrodd tekst går uendret til Sheet- og Discord-sinks.
- **Kodeflate:** alle Sheet writers, meldingsbyggere og `postDiscord_`.
- **Datastruktur:** sentralt felt-schema med `text/number/date/id`; Discord
  payload inkluderer alltid tom `allowed_mentions`.
- **Migrasjon:** skann eksisterende tekstceller for formler i read-only modus;
  remediation krever egen godkjenning og backup.
- **Rollback:** feature flag per sink; aldri konverter eksisterende data uten
  eksport/restore-plan.
- **Observability:** tell avvist/escaped input uten å logge sensitiv tekst.
- **Tester:** ekte test-Sheet `getFormula()==''`, round-trip, alle mentiontyper
  mot testwebhook.
- **Akseptanse:** ingen ubetrodd formel evalueres og ingen mention trigges.

## Batch B — Canonical concurrency, idempotency og recovery

### B1. Felles transition primitive for Target/Review (QA-006, QA-007, QA-009)

- **Rotårsak:** per-cell read-modify-write uten lock, expected state eller
  versjon.
- **Kodeflate:** `updateTarget_`, claim/unclaim/submit/review/assign.
- **Datastruktur:** `version` (monotont heltall), `lastOperationId`;
  review knyttes eksplisitt til `submissionId`.
- **Algoritme:** kort `LockService`-lock → canonical re-read → authorization +
  expectedVersion/state → samlet row write → operation/audit completion.
- **Migrasjon:** initier version=1 ved første ny write; tom versjon tolkes som
  legacy v0 kun én gang.
- **Rollback:** ny kode kan lese legacy rows; ikke fjern nye kolonner ved
  rollback.
- **Observability:** conflict-rate per action, lock-wait, duplicate replay.
- **Tester:** A/B-barrierer ×50, stale version, ugyldige transitions,
  owneroverride og audit cardinality.
- **Akseptanse:** én claim-success, stale review gir conflict og nyere payload
  bevares.

### B2. Submission operation ledger (QA-008)

- **Rotårsak:** append-before-update uten requestId/recovery.
- **Kodeflate:** frontend submit-ID-generering, `submitSpy_`,
  `latestPayloadForTarget_`.
- **Datastruktur:** `Operations` eller `SubmissionRequests` med requestId,
  actorId, targetRowId, payloadHash, status, submissionId, timestamps/error.
- **Migrasjon:** eksisterende submissions beholdes; nye requests bruker
  ledger. Identiske historiske rader dedupliseres ikke automatisk.
- **Rollback:** ledger er append-only; gammel lesing kan fortsatt bruke
  Submissions, men nye writes må stoppes ved rollback for å unngå dobbelspor.
- **Observability:** processing-age, failed/reconciled count.
- **Tester:** dobbeltklikk, parallel samme ID, payloadHash-conflict og feil ved
  hver write-posisjon.
- **Akseptanse:** samme request returnerer samme submissionId; ingen orphan
  target/submission etter reconcile.

### B3. Payment og payout som idempotente operasjoner (QA-010, QA-011)

- **Rotårsak:** requestId check-then-append og tidlig duplicate-return før
  avledet recovery.
- **Kodeflate:** record/void/recalculate/confirm for begge ledgers.
- **Datastruktur:** operation status + payloadHash; unik logisk payout-key per
  submission/work unit; eksplisitt partial-policy.
- **Migrasjon:** read-only preflight for dupliserte requestIds/work keys og
  ledger/order/target-drift; avvik må gjennom managergodkjenning.
- **Rollback:** behold nye kolonner/ledger; aldri slett finansrader. Deaktiver
  writes og kjør reconciliation før kode-rollback.
- **Observability:** duplicate/replay/conflict, ledger-vs-mirror drift,
  overpayment, stuck processing.
- **Tester:** parallel ×50, samme/ulik requestId, ukjent resultat ved hvert
  write, void, partial/full, overpayment og restart.
- **Akseptanse:** én aktiv økonomisk effekt per logisk nøkkel; mirrors kan
  alltid regenereres fra ledger og retry fullfører recovery.

### B4. Ordre-ID, add/upsert og multi-write recovery (QA-012, QA-013)

- **Rotårsak:** `max+1`, append og upsert er separate, ulåste operasjoner.
- **Kodeflate:** next/resolve ID, add/bulkAdd, upsert, setOrderPrice og
  generelle writers.
- **Datastruktur:** UUID eller låst sekvens; operation journal og
  `order.version`; customer binding valideres.
- **Migrasjon:** kartlegg duplicate orderIds og kundekollisjoner før cutover;
  ingen automatisk merge/splitt.
- **Rollback:** nye IDs forblir gyldige strings; journal beholdes for recovery.
- **Observability:** duplicate ID, orphan target/order, count/price drift,
  journal age.
- **Tester:** parallel add/bulk, failure ved hver write, price N-rader,
  reconcile gjentatt to ganger.
- **Akseptanse:** unike IDs, én riktig kunde per ordre, counts/priser matcher
  targets, og audit finnes bare for completed operation.

## Batch C — Durable side effects og reconciliation

### C1. Discord outbox for new/completion/delivery (QA-014)

- **Rotårsak:** check–send–mark og send-before-delivered-write.
- **Kodeflate:** alle Discord send-/auto-funksjoner og triggers.
- **Datastruktur:** `Outbox` med unik eventId/type/entity/version,
  payloadHash, status (`pending`, `sending`, `sent`, `unknown`, `failed`),
  attempts, lease, timestamps og provider response metadata uten secrets.
- **Migrasjon:** opprett events bare for klart usendte canonical states; ikke
  resende historiske `unknown` automatisk.
- **Rollback:** stopp worker først; behold outbox. Manuell replay krever
  eventvisning og eksplisitt beslutning for `unknown`.
- **Observability:** queue age/depth, attempts, unknown/failure, duplicate
  event constraint og dead-letter.
- **Tester:** parallel workers, lease expiry, 2xx→mark-failure, timeout, 429,
  restart og replay. Mock-webhook teller requests.
- **Akseptanse:** én outbox-event per entity/version; ingen automatisk blind
  resend av unknown-result; canonical delivery har sporbar eventId.

### C2. Reconciliation og operator recovery

- **Kodeflate:** ny idempotent reconcile for operations, ledger mirrors,
  order aggregates og outbox.
- **Datastruktur:** `ReconciliationLog` eller structured audit med run ID,
  detected/fixed/manual counts.
- **Migrasjon/rollback:** alltid dry-run før apply; snapshot/export av berørte
  rader; apply begrenses til deterministisk avledede felt.
- **Observability/tester:** to påfølgende runs skal gi null nye endringer;
  failure midt i run skal kunne resumes.
- **Akseptanse:** alle syntetiske fase-3 partial states repareres uten nye
  duplikater; tvetydig finans/ekstern effekt flagges manuelt.

## Batch D — Parser, setup og tilgjengelighet

### D1. Eksplisitt tallgrammar og parserwarnings (QA-003)

- **Kodeflate:** `parseNumberToken`, `parseStats`, preview/submit validation.
- **Datastruktur:** ingen Sheet-migrasjon; eventuelt parserVersion på nye
  submissions for sporbarhet.
- **Beslutning før kode:** dokumenter støttede formater (anbefalt: Torn/US
  grouping + decimal suffix; EU enten eksplisitt støttet eller tydelig avvist).
- **Rollback:** behold parserVersion og gammel funksjon bak midlertidig flagg
  kun for sammenligning, ikke stille fallback.
- **Observability:** warning/error-type og parserVersion, ikke rawText.
- **Tester:** hele fase-3-korpuset + anonymiserte representative samples,
  boundary/fuzz og safe integer.
- **Akseptanse:** alle godkjente formater har eksakt verdi; tvetydig/malformed
  kan ikke submitte uten eksplisitt managerhåndtering.

### D2. Verifisert setup-state og recovery (QA-002)

- **Kodeflate:** save/refresh/updateSetupState og storage lifecycle.
- **Datastruktur:** `accessVerified`, verifiedAt/session expiry; ingen plaintext
  langtidslagring hvis sessionmekanismen fra A1 erstatter den.
- **Rollback:** alltid synlig Forget/Edit.
- **Observability/tester:** auth outcome uten credential; invalid, expired,
  offline, reload og tab lifecycle.
- **Akseptanse:** ugyldig access viser korrigerbart felt; bare verifisert
  session viser configured.

### D3. Live-region og browser QA (QA-004)

- **Kodeflate:** statusmarkup og `setStatus`.
- **Migrasjon/rollback:** ingen.
- **Tester:** keyboard, skjermleser, lys/mørk og ingen dobbelannonsering.
- **Akseptanse:** kritiske async feil annonseres én gang og synlig state
  beholdes.

## Fase-4 verifikasjonsmatrise

For hvert tiltak skal følgende dokumenteres før merge:

| Testtype | Krav |
|---|---|
| Før-test | Reproduser relevant fase-3-brudd mot gammel kode |
| Etter-test | Ny forventet invariant passerer mot rettet kode |
| Regresjon | Normal happy path og eksisterende parser/payment/payout-safeguards |
| Concurrency | Barrierebasert minst 50 interleavings for delte canonical writes |
| Failure recovery | Feil injiseres før/etter hver varig write og ekstern send |
| Reconcile | Første run reparerer deterministisk; andre run er no-op |
| External runtime | Isolert Apps Script, Sheet-copy og testwebhooks |
| Security | Ingen credential i URL/logg; actor serververifisert; sinks er safe |

## Anbefalt fix order

1. A1 credentialtransport og A2 serveridentity.
2. B1 transition primitive og owner/state/version guards.
3. B2 submission ledger.
4. B3 payment/payout ledger og recovery.
5. B4 order-ID/multi-write journal.
6. A3 canonical audit og A4 input sinks.
7. C1 outbox og C2 reconciliation.
8. D1 parser, D2 setup recovery og D3 accessibility.

Fase 4 skal ikke starte med UI-polish mens P0/P1 canonical-invariants fortsatt
kan brytes. Produksjonsdata-migrasjon, secret rotation og webhook replay krever
egen eksplisitt godkjenning og backup/runbook.
