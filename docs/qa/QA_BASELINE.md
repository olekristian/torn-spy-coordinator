# QA-baseline – fase 1

Dato: 2026-07-23  
Omfang: statisk gjennomgang av `README.md`, `index.html`, `apps-script/Code.gs`,
`apps-script/appsscript.json` og relevant git-historikk. Det finnes ingen
repo-instruksjoner, tester, pakkefiler eller annen dokumentasjon i denne
revisjonen.

## Klassifisering

- **Bekreftet kodeatferd** betyr at forholdet kan leses direkte ut av denne
  revisjonen. Det betyr ikke nødvendigvis at produksjonsdeployet kjører samme
  revisjon.
- **Bekreftet feil** krever at kodeatferden bryter en uttrykt invariant eller
  at feilen er reprodusert. Ingen dynamiske produksjonstester er kjørt i fase 1.
- **Potensiell risiko** har en konkret kodevei, men konsekvens eller
  utnyttbarhet må bekreftes i et kontrollert testmiljø.
- **Ukjent / ikke testet** krever deploykonfigurasjon, credentials, testdata
  eller observasjon av eksterne tjenester.
- **Forventet design** beskriver tilsiktet arbeidsflyt slik den er implementert,
  uten å anbefale redesign.

## Systemarkitektur og dataflyt

```text
Nettleser
  └─ statisk index.html fra GitHub Pages (forventet hosting; ikke verifisert)
       ├─ localStorage/sessionStorage
       ├─ direkte GET mot Torn API med ansattens Torn-nøkkel
       └─ fetch, GET-fallback eller JSONP mot Google Apps Script Web App
             ├─ Script Properties: felles access code, admin key, webhooks
             ├─ aktiv Google Spreadsheet: operativ ledger
             └─ UrlFetchApp → Discord-webhooks
```

Frontend er én selvstendig HTML-fil med innebygd CSS og JavaScript. Den
hardkoder URL-en til et Apps Script-deploy og har ingen build-prosess. Apps
Script har ett fysisk GET-endepunkt (`doGet`) og ett POST-endepunkt (`doPost`);
feltet `action` ruter begge til samme dispatcher. Alle forespørsler kaller
`ensureSheets_()` før autentisering og dispatch.

`appsscript.json` bruker V8, UTC og scopes for regneark, ScriptApp og eksterne
HTTP-kall. Apps Script bruker det aktive regnearket; spreadsheet-ID og
web-app-tilgangsnivå finnes ikke i repoet og er derfor ukjent.

### Persistens og ansvar

| Område | Plassering | Kommentar |
|---|---|---|
| Visning, parser, optimistic UI, filtre | Kun klient | Forsvinner ved reload, med unntakene under |
| Ansattnavn og felles access code | `localStorage` | Nøkler `torn_employee`, `torn_api_key` |
| Tema | `localStorage` | `torn_theme` |
| Lokal audit, review-overrides, assignments, historikk | `localStorage` | Per nettleserprofil, ikke canonical |
| Admin key | `sessionStorage` | `torn_admin_key`; eldre localStorage-verdi slettes |
| Torn API key og personvernsamtykke | `sessionStorage` | Nøkkel sendes direkte til Torn API |
| Targets, submissions, orders, betalinger, payouts, audit og delivery history | Google Sheets | Canonical backenddata |
| Kunder og ansatte | Google Sheets-tabeller | Opprettes, men leses eller muteres ikke av nåværende actions |
| Access/admin key og Discord-webhooks | Apps Script Properties | Server-side secrets |

Backendens `list` returnerer targets til alle med access code. For ikke-admin
filtreres targets etter ordrestatuser som er synlige for ansatte, og feltene
ordre, kunde, pris og betalingsstatus utelates. Admin får i tillegg alle orders,
customer payments, employee payouts og delivery history. Backendens `AuditLog`
returneres aldri; auditvisningen i frontend er bare nettleserens lokale logg.

## Backend-actionmatrise

Alle actions går gjennom `validateAccess_`: dersom `API_KEY` er konfigurert må
`key` være identisk; dersom property mangler er dette laget fail-open. «Admin»
betyr i tillegg eksakt samsvar med `ADMIN_KEY`. Ansattidentitet er et
klientoppgitt displaynavn og autentiseres ikke.

| Action | Rolle / backend-auth | Viktig input | Leser | Muterer | Sideeffekter | Audit | Concurrency / idempotency |
|---|---|---|---|---|---|---|---|
| `version` | Access | – | properties/konstant | Ingen, bortsett fra `ensureSheets_` | Kan opprette tabs/headers | Nei | Ingen |
| `list` | Access; admin gir utvidet resultat | `admin` | alle operative tabeller | `Orders` via full completion-sync | Ingen ekstern | Nei | Ingen lock; «read» kan skrive |
| `add` | Access | target/order/økonomi | Orders | Targets, Orders | – | `target_added` | UUID target; order-ID og order-upsert uten lock |
| `bulkAdd` | Access | `targets[]` | Orders/Targets | Targets, Orders | – | én per target | Batch append, deretter ikke-atomiske order/audit-writes |
| `claim` | Access | `id`, `employee` | target-rad | Targets | – | `target_claimed` | Ingen precondition eller lock |
| `unclaim` | Access | `id`, `employee` | target-rad | Targets | – | `target_released` | Ingen eier-/statuskontroll eller lock |
| `submit` | Access | target-id, identity, payload | Targets | Submissions, Targets, Orders | Kan auto-varsle manager og auto-levere | `spy_submitted` m.fl. | Ny UUID hver gang; ingen request-ID/statusguard/lock |
| `review` | Admin | target, status, payload | Targets/Submissions | siste Submission for target, Target, Orders | Kan completion-varsle/levere | `manager_<status>` | Status er fri tekst; ingen version/precondition/lock |
| `assign` | Admin | target, navn | Target | assigned-felter i Target | – | `manager_assigned_target` | Ingen lock; endrer ikke `status` |
| `customerPayment` | Admin | ordre, beløp, status, requestId | Payments/Orders | CustomerPayments, Orders | Kan varsle ansatte | betaling + payment confirmation | Request-ID check-then-append uten lock |
| `recordTornMoneyPayment` | Admin | som betaling | Som over | Som over | Som over | to auditposter ved ny post | Samme vern som `customerPayment` |
| `voidCustomerPayment` | Admin | paymentId, reason | Payments/Orders | payment-rad, Orders | – | `customer_payment_voided` | Kan voides gjentatte ganger; ingen lock |
| `employeePayout` | Admin | target/ansatt/beløp/status/requestId | Payouts/Target | EmployeePayouts, Target | – | payout-status | Request-ID check-then-append uten lock |
| `voidEmployeePayout` | Admin | payoutId, reason | Payouts/Target | payout-rad, Target | – | `employee_payout_voided` | Kan voides gjentatte ganger; ingen lock |
| `history` | Admin | fri `entry` | – | DeliveryHistory | – | `delivery_archived` | Ingen deduplisering/lock |
| `verifyAdmin` | Admin | – | property | Ingen utover sheet-init | – | Nei | Ingen |
| `webhookDebug` | Admin | – | property-navn/tilstedeværelse | Ingen utover sheet-init | – | Nei | Returnerer navn, aldri URL |
| `testDiscordWebhook` | Admin | kind | properties | AuditLog | Sender test til Discord | success/missing | Kan sende dobbelt; ingen idempotency |
| `setOrderPrice` | Admin | orderId, mode, amount | Targets/Orders/Payments | mange Targets + Order | – | `order_price_set` | Fler-radswrite ikke atomisk |
| `sendNewOrderNotification` | Admin | orderId | Orders/Targets/properties | Orders | Discord til ansatte | sent/missing | Check-send-mark uten lock |
| `sendOrderCompleteNotification` | Admin | orderId, markOnly | Orders/Targets/properties | Orders | Discord til manager; ev. auto-delivery | sent/marked/missing | Check-send-mark uten lock |
| `setOrderAutomation` | Admin | payment/delivery/webhook | Order/properties | Order og ev. Script Property | Kan varsle ansatte | redigert config uten URL | Property-write og row-write ikke atomisk |
| `sendCustomerDelivery` | Admin | orderId | Targets/Submissions/Order/property | Order | Discord til kunde | sent/failed | Send-deretter-mark; ingen idempotency key/lock |
| `markOrderDelivered` | Admin | orderId/mode | Order | Order | – | `order_delivered` | Verifiserer ikke completion før markering |
| `getAutomationDiagnostics` | Admin | – | Orders/Targets/properties | Orders via full sync | – | Nei | Diagnostikk kan skrive |
| `audit` | Access | actor/action/id/details | – | AuditLog | – | Selve handlingen | Klient kan skrive vilkårlige auditpåstander |

`LockService` brukes ikke noe sted. Dette er ikke i seg selv en feil, men gjør
de konkrete check-then-write- og read-modify-write-operasjonene i tabellen
utsatt ved overlappende requests.

## Datastore

Alle tabeller har headernavn som skjema. `ensureHeaders_` legger manglende
headers til høyre, men validerer ikke rekkefølge, duplikater eller typer.
`appendObject_` bruker den hardkodede headerlisten; ukjente felt droppes.
Oppdateringer skjer én celle av gangen og flushes bare eksplisitt i
`updateTarget_`.

Tid genereres som ISO-8601 UTC via `new Date().toISOString()`. Manifestet er
også UTC. Eksisterende Sheet-celler kan likevel være Date-objekter eller
formaterte strenger; faktisk spreadsheet-locale/timezone er ikke verifisert.

| Tabell | Logisk ID / generering | Relasjoner og bruk | Oppdatering / row lookup | State og typer |
|---|---|---|---|---|
| `Targets` | `target_<8 UUID-tegn>` | `orderId→Orders`; `id←Submissions.targetRowId`, payouts | `updateTarget_` finner første match i ID-kolonnen og skriver celler i raden | `status`: open/claimed/submitted; `reviewStatus`; betalingsspeil. Tall normaliseres bare ved lesing |
| `Submissions` | `sub_<8 UUID-tegn>` | `targetRowId→Targets.id` | Review velger siste fysiske match etter reversering og skriver row number | pending_review/approved/rejected eller fri input; råtekst og formattert resultat |
| `Orders` | Bruker-ID eller neste numeriske maks+1, minst `3` | `orderId←Targets/Payments/History` | Flere søk etter første row med orderId, senere row-number writes | Avledet order state, betaling, notification og delivery-felter |
| `Customers` | `customer` (antatt logisk nøkkel) | Kun schema | Ingen nåværende leser/writer | Fri tekst; ubrukt |
| `Employees` | `displayName` (antatt logisk nøkkel) | Kun schema | Ingen nåværende leser/writer | Fri tekst/tall; ubrukt |
| `CustomerPayments` | `custpay_<8 UUID-tegn>`; requestId fra klient | `orderId→Orders` | Void finner første ID og skriver row number | status godtar fri input; beregning teller paid/partial, ignorerer voided |
| `EmployeePayouts` | `emppay_<8 UUID-tegn>`; requestId fra klient | `targetRowId→Targets.id`, valgfri submissionId | Void finner første ID og skriver row number | beregning teller paid/queued; voided ignoreres |
| `AuditLog` | Ingen ID | Løs `targetId`, som også brukes til orderId | Append-only | timestamp/actor/action/details er fri tekst |
| `DeliveryHistory` | Klient-ID eller `history_<8 UUID-tegn>` | order/target som tekst | Append-only | Snapshot av levert resultat |

### Skjemadetalj

`add` og `bulkAdd` lager feltene `paymentRequired`, `paymentType`,
`deliveryMode` og `autoDeliver` i target-objektet, men disse finnes ikke i
`HEADERS.Targets` og persisteres derfor ikke på target-raden. De brukes
umiddelbart til order-upsert i samme request. Ved senere rekonstruksjon fra
bare Targets er de borte. Dette er bekreftet kodeatferd; om det gir feil i
produksjonsdata er ikke testet.

### Konkrete concurrency-punkter

1. To claims kan lese/skrive samme target; siste writer vinner og begge kan få
   `{ok:true}`. Ingen canonical precondition sjekker `open`.
2. Submit appendes før target oppdateres. Retry/dobbeltklikk kan lage flere
   submissions; en feil etter append kan gi klientfeil selv om data ble lagret.
3. Review finner en fysisk submission-rad og oppdaterer denne før target-raden.
   Samtidig submit/review kan gjøre «siste submission» tvetydig.
4. `nextOrderId_` er maks+1 uten lock. Parallelle nye ordrer kan få samme ID.
5. Order-upsert er find-then-append/update uten lock; parallelle targets kan
   opprette dupliserte order-rader eller miste count/total-oppdateringer.
6. Payment/payout-idempotency er find-by-requestId-then-append uten lock.
   Parallelle identiske requests kan begge passere sjekken.
7. Prisoppdatering, bulk import, payment recalculation og completion sync gjør
   flere relaterte writes uten transaksjon.
8. Discordflytene er check-send-mark. Parallelle kjøringer kan sende samme
   varsel flere ganger. Ved vellykket send og mislykket markering vil retry
   også kunne duplisere utsending.
9. Audit skrives i enkelte target-updaters før selve target-raden er ferdig
   skrevet. En senere Sheet-feil kan etterlate audit uten fullført mutasjon.

## Faktiske state machines

### Targets og submissions

```text
Target:
open ──claim──> claimed ──unclaim──> open
  │                │
  └──── direct submit/claim er backend-tillatt fra enhver state ────┐
                                                                   v
                                                               submitted

Submission review:
pending_review ──admin review──> approved
       └─────────admin review──> rejected
       └─────────admin review tillater også vilkårlig statusstreng
```

Frontend viser submit bare til den ansatte som nettleseren mener eier et
claimed target. Backend håndhever verken eier, nåværende state eller forventet
versjon. Reject endrer bare reviewStatus; target forblir `submitted` og skjules
fra ansattkøen. Backend tillater ny submit direkte, men vanlig UI tilbyr ingen
resubmit av rejected target. Assignment lagres i `assignedTo/assignedAt`;
backend setter aldri target-status `assigned`. Frontend har i tillegg en lokal
assignment-cache som kan avvike fra backend.

### Orders

Normalisert prioritet i `normalizeOrderStatus_`:

1. eksplisitt `closed`, `cancelled` eller `delivered` bevares;
2. `paymentRequired` og ikke paid → `awaiting_payment`;
3. `deliveredAt` → `delivered`;
4. `completedAt` → `ready_to_deliver`;
5. minst én pending submission → `pending_review`;
6. minst én claimed/assigned target → `in_progress`;
7. targets finnes → `ready_for_work`;
8. ellers eksplisitt status eller `intake`.

Completion betyr at ordren har minst ett target og samtlige targets både har
`status=submitted` og `reviewStatus=approved`. Sync setter eller fjerner
`completedAt` og completion notification-feltene basert på denne beregningen.
`markOrderDelivered` kan derimot sette `delivered` uten å kjøre completion-
kontrollen; dette er en eksplisitt managerhandling i nåværende design.
Det finnes ingen actions som setter `closed` eller `cancelled`.

### Betaling

Customer payment-rader kan ha vilkårlig status fra request. Recalculation teller
bare `paid` og `partial`: null sum → `unpaid`; positiv sum under total eller
uten eksplisitt paid → `partial`; sum minst total, eller eksplisitt paid uten
kjent total → `paid`. Void setter raden til `voided` og recalculerer. Når en
ordre først er paid settes confirmation-tid/aktør, men disse feltene tømmes ikke
ved senere void/recalculation til unpaid/partial.

### Payout

Payout-rader kan ha vilkårlig status. Target-speilet er `paid` når paid sum
dekker rate (eller paid sum er positiv og rate mangler), `queued` når paid eller
queued sum er positiv, ellers `unpaid`. Void setter `voided` og regner target
på nytt. Order-feltet `employeePayoutStatus` recalculeres ikke.

### Automation

Det finnes ingen installert tids- eller event-trigger i repoet. Automatisering
er requestdrevet:

- target review/submit synkroniserer completion og kan varsle manager;
- betaling/config kan varsle ansatte når order blir work-ready;
- completion-varsel kan starte customer auto-delivery;
- `list` og diagnostics synkroniserer alle order-rader.

Pending arbeid identifiseres med status/timestamps i Orders. Success markeres
etter vellykket Discord-kall. `postDiscord_` prøver inntil tre ganger bare ved
rate limit. Andre feil markeres som delivery failure eller audit-feil av
caller. Det finnes ingen job-ID, kø, lease, neste retry-tid eller dead-letter
state. Ny manuell/requestdrevet kjøring er retry-mekanismen.

## Auth- og sikkerhetsgrenser

### Hemmeligheter og credentials

| Credential | Browser | Transport | Server/persistens | Eksponeringsflate |
|---|---|---|---|---|
| Felles access code | localStorage og runtime | Alltid URL-query til Apps Script; også JSONP | Script Property `API_KEY` | browser storage/history, URL-/proxy-/Apps Script-logger |
| Admin key | sessionStorage og runtime | Alltid URL-query; i tillegg body/payload | Script Property `ADMIN_KEY` | samme URL-flater; JSONP/GET-fallback inkluderer også payload |
| Torn API key | sessionStorage og runtime | Query `key` direkte til Torn API | Ikke sendt til Apps Script/Sheets av nåværende kode | browser session, network/devtools og Torn request logs |
| Discord webhook URLs | Ikke returnert til browser | Server-side UrlFetchApp | Script Properties | Apps Script property access; feiltekst kan inneholde Discord response body, ikke URL i normal kode |
| Customer webhook | Skrives inn av manager i browser | Apps Script request | Dynamisk Script Property per order/customer | browserfelt/request; diagnostikk viser kun configured |

Ingen reelle secretverdier ble skrevet ut eller kopiert i denne gjennomgangen.
Den hardkodede Apps Script deployment-URL-en er et endepunkt, ikke behandlet
som en autentiseringshemmelighet.

### Backend-autorisasjon

Admin verifiseres på backend for review, assign, alle ledger-/void-actions,
history, webhook-/automation-/delivery-actions og diagnostics. Manager-UI alene
er dermed ikke sikkerhetsgrensen for disse.

`add`, `bulkAdd`, `claim`, `unclaim`, `submit` og `audit` krever bare den felles
access code og kan kalles direkte uten UI. Ansattidentitet og actor er
selvrapportert. Backend håndhever ikke claim ownership. Dette er bekreftet
kodeatferd og må testes som P0/P1 etter fase 1.

### JSONP og query transport

Frontend faller tilbake til JSONP ved nettverksfeil og backend reflekterer
`callback` direkte inn i JavaScript-respons uten å validere callbackformat.
Alle actions kan også sendes via GET. Dette øker risikoen for credentials og
muterende payload i URL-logger og gjør CSRF-/script-transportgrensen avhengig av
secretets konfidensialitet. Konkrete utnyttelser er ikke testet.

## Input/output review

| Input | Senere sinks | Eksisterende vern | Risiko / status |
|---|---|---|---|
| Target/customer/order/notes/employee/actor | `innerHTML`, Sheets, audit, Discord, clipboard/export | De fleste HTML-sinks bruker `escapeHtml`; enkelte verdier settes via `textContent` | HTML-sinkene som ble gjennomgått er escaped; dynamiske CSS-statusklasser er ikke konsekvent allowlistet |
| Spy raw/formatted payload | Sheets, manager UI, Discord delivery, clipboard/history JSON | UI bruker hovedsakelig `textContent`/escape | Potensiell spreadsheet formula injection ved celler som starter med `=`; Discord-format/mentions ikke nøytralisert |
| Payment/payout reference/note | Sheets og HTML | HTML escaped | Formula injection mulig; status er ikke backend-allowlistet |
| Customer/target/ordre i Discord | Discord message content | Ingen `allowed_mentions` eller mention escaping | Potensiell `@everyone`/role/user mention injection |
| Tall | `Number`, `num_`, `parseNumberToken` | Finite-check noen steder | `num_` gjør malformed/NaN til `0`; fri status og uensartet blank/0 kan skjule ugyldig input |
| Timestamps | ISO UTC og browser locale | Backend UTC | Browser parsing av Sheet Date/string og spreadsheet locale er ikke testet |
| Delivery history | localStorage, Sheets, JSON-export, clipboard | JSON-serialisering | Kan inneholde raw spy-resultater; secrets er ikke tilsiktet inkludert, men fri rawText må testes |
| Feil | UI, AuditLog, `deliveryError` | Ingen sentral redaction | Potensiell lekkasje av sensitive response-/inputdetaljer; reelle secretlekkasjer ikke observert |

`escapeHtml` escaper `&`, `<`, `>`, `"`, men ikke `'`. Gjennomgåtte
attributtverdier er satt i doble anførselstegn. Dette er ikke klassifisert som
bekreftet XSS. En målrettet DOM-test med payload-korpus er nødvendig.

## Kritiske invariants for senere QA

1. Ett target kan ikke være aktivt claimed av to ansatte samtidig.
2. Bare claim-eier eller eksplisitt autorisert manager kan unclaim/submitte.
3. En request må avvises når forventet target-/submission-versjon eller state er
   eldre enn canonical state; en gammel klient kan ikke overskrive nyere data.
4. En submission registreres høyst én gang ved retry, timeout eller dobbeltklikk.
5. Review må gjelde den tilsiktede submission-versjonen og bare tillate
   definerte statuser.
6. En ordre får ikke `completedAt`, completion-notification eller delivery før
   alle canonical targets er submitted og approved.
7. En ansatt med bare access code kan ikke utføre manageractions eller forfalske
   en autoritativ auditpost.
8. Kundeinnbetaling og employee payout registreres høyst én gang per logisk
   request, også under parallelle identiske requests.
9. Void/recalculation må gi konsistent payment/payout/order/confirmation-state.
10. Automatisk eller manuell retry må ikke sende samme Discord-varsel eller
    kundeleveranse flere ganger.
11. Relaterte target/order/submission/payment/audit-writes må enten fullføres
    konsistent eller være observerbart gjenopprettbare.
12. Audit må ikke hevde success dersom canonical mutasjon feilet, og actor kan
    ikke være vilkårlig på en autoritativ logg.
13. Secrets skal ikke finnes i frontendkilde, localStorage (utover uttrykkelig
    valgt access-code-design), URL-/feillogger, Sheets, exports eller diagnostics.
14. Ubetrodd tekst må ikke kjøre HTML/JavaScript, Sheets-formler eller Discord-
    mentions.
15. Parallell opprettelse må ikke gi duplisert `orderId`; logiske IDs og
    requestIds må forbli entydige.
16. Ansatte skal bare motta targets fra ordrestater som faktisk er work-ready,
    og managerfelter må ikke lekke i ikke-admin `list`.

## Risikoregister

| Prioritet | Klassifisering | Risiko |
|---|---|---|
| P0 | Potensiell risiko, konkret kodevei | Claim er last-write-wins uten stateguard/lock; to ansatte kan begge få success |
| P0 | Bekreftet kodeatferd | Backend mangler eier-/statekontroll for unclaim og submit; direct requests omgår UI-reglene |
| P0 | Potensiell risiko, konkret kodevei | Submit og finansielle request-ID-sjekker er ikke atomiske/idempotente under retry/concurrency |
| P0 | Potensiell risiko, konkret kodevei | Access/admin keys sendes i URL-query og kan havne i logger/history |
| P0 | Bekreftet kodeatferd | `audit` er tilgjengelig med access code og godtar fri actor/action/details; kan ikke behandles som autoritativ |
| P1 | Potensiell risiko | Gammel lokal review-cache resynkes over ulik remote review uten versjonskontroll |
| P1 | Potensiell risiko | Order-ID maks+1, order-upsert og fler-radswrites mangler lock/transaksjon |
| P1 | Potensiell risiko | Discord check-send-mark kan gi doble varsler/leveranser ved parallelitet eller delvis feil |
| P1 | Bekreftet kodeatferd | Rejected target forblir submitted; resubmit finnes direkte på backend, men ikke i vanlig ansatt-UI |
| P1 | Bekreftet kodeatferd | `markOrderDelivered` håndhever ikke completion-invarianten |
| P1 | Potensiell risiko | Audit kan bli skrevet før canonical target-write fullfører |
| P1 | Potensiell risiko | Sheets-formler og Discord-mentions nøytraliseres ikke |
| P2 | Bekreftet kodeatferd | Customers/Employees-tabellene er ubrukt; lokal audit/assignment/history kan avvike fra server |
| P2 | Bekreftet kodeatferd | `list`/diagnostics er ikke read-only, men synkroniserer alle Orders |
| P2 | Potensiell risiko | Betalingsstatus er fri tekst; confirmation metadata blir stående etter void til unpaid |

Ingen av punktene over er dynamisk bekreftet mot produksjonsdata. «Bekreftet
kodeatferd» kan løftes til bekreftet produksjonsfeil først når deployversjon og
forventning er validert.

## Testbarhet og observability

### Tilgjengelig lokalt

- statisk kildeinspeksjon, git history/blame og syntax-check;
- lokal statisk webserver og nettleserautomatisering/DevTools/network-inspeksjon;
- browser storage, clipboard og DOM kan inspiseres;
- Apps Script-koden kan syntax-checkes, men Apps Script-tjenestene finnes ikke
  lokalt uten mocks;
- rene parser-/formatteringsfunksjoner kan isoleres og unit-testes etter at et
  testharness opprettes.

Det finnes ingen eksisterende unit-/integration-/E2E-tester, lint, typecheck,
package manager, CI, mocks eller clasp-konfigurasjon. Det finnes heller ingen
test-Sheet, test-deploy, test-webhooks eller testcredentials i repoet.

### Produksjonssikkerhet

Trygge read-only kandidater etter eksplisitt tillatelse er frontendlasting,
lokal DOM/storage-inspeksjon og backend `version`. Selv `list` og automation
diagnostics kan skrive order-sync og bør derfor ikke regnes som strengt
read-only. Webhook-debug leser properties, men krever ekte credentials.

Alle muterende actions, Torn-oppslag med ekte nøkkel, webhook-tester,
concurrency/retry, formula-/mention-korpus og failure injection bør kjøres mot
isolert Apps Script-deploy, test-Sheet og test-webhooks. Produksjonskjøring er
markert per scenario i `QA_TEST_MATRIX.md`.

### Blokkeringer i fase 1

- Faktisk GitHub Pages-konfigurasjon og live frontend-revisjon er ikke verifisert.
- Apps Script deployment-versjon, «execute as» og tilgangsnivå er ukjent.
- Ingen test-Sheet eller credentials er levert.
- Script Properties og installerte Apps Script triggers kan ikke inspiseres fra
  repoet.
- Torn API-responser/CORS/rate limits og scopes krever testnøkkel.
- Discord success/failure/rate-limit og kundeleveranse krever testwebhooks.
- Race, retry, partial write og idempotency krever kontrollert parallellitet og
  failure injection.
- Stackdriver/Apps Script execution logs, Sheet revision history og faktisk
  spreadsheet timezone/locale er ikke tilgjengelig.

