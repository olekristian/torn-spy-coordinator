# QA-testmatrise – fase 2 og fase 3

«Produksjon» betyr dagens faktiske frontend, Apps Script-deploy, Sheet,
Torn-konto eller Discord-kanal. Scenarioer merket «nei» skal bruke isolert
testdeploy, test-Sheet, syntetiske identiteter og testwebhooks.

Fase 2 ble kjørt 2026-07-23. Statusene under er oppdatert etter faktisk
execution. `BLOCKED` betyr at testen krever gyldige credentials, canonical
testdata, isolert Sheet/deploy, testwebhook eller failure/concurrency-harness.
Ingen autentisert eller muterende produksjonstest ble forsøkt.

Fase 3 ble kjørt samme dato i en lokal deterministisk harness som laster faktisk
`apps-script/Code.gs` og parserblokken fra faktisk `index.html`. Den emulerer
eksterne avhengigheter og muterer ikke produksjon. `FAIL (LOCAL)` betyr at
invarianten ble brutt i faktisk funksjonskode under kontrollert interleaving
eller failure injection; endelig Google Sheet-/Discord-effekt kan fortsatt være
`BLOCKED`.

## Fase 4 — sluttstatus

| Verifikasjonsgruppe | Passed | Failed | Blocked | Kommentar |
|---|---:|---:|---:|---|
| Deterministisk backend/concurrency/failure recovery | 27 | 0 | 0 | Faktisk `Code.gs` kjørt i fake Sheets/Lock/UrlFetch runtime |
| Parser | 4 | 0 | 0 | Faktisk parserblokk fra `index.html` |
| Security/transport/sinks | 7 | 0 | 0 | Body-only transport, query-reject, identity, audit og injection |
| Frontend static/DOM contracts | 4 | 0 | 0 | Setup-state, live-region, request IDs og review preconditions |
| Ekstern runtime/browser | 0 | 0 | 5 | Apps Script deploy, ekte Sheet-formel, ekte Discord, valid-auth E2E og browser UI |
| **Totalt automatisert** | **42** | **0** | **0** | Inline frontend-script syntax: PASS |

De fem blocked radene er verifikasjonsområder, ikke automatiserte testfeil.
Produksjonsdata, webhooks og deploy ble ikke brukt.

## Runtime-resultater fra fase 2

| ID | Status | Utført | Resultat/evidens |
|---|---|---|---|
| RUN-001 | PASS | Produksjons-HTML mot lokal `index.html` | 4212/4212 linjer identiske etter normalisering av CRLF/LF; frontendversjon `2026-06-13-automation-v1` og Apps Script-endepunkt matcher |
| RUN-002 | PASS | Initial load, reload, hard reload og ny fane | `document.readyState=complete`, korrekt tom state og ingen console errors |
| RUN-003 | PASS | Credential-fri og syntetisk ugyldig access | Backend svarte HTTP 200 JSON med kontrollert `Invalid access code`; ingen authenticated data ble returnert |
| RUN-004 | PASS | Offentlig responsive smoke ved 1920, 1366, 1024, 768 og 390 px | Ingen horisontal overflow eller controls utenfor viewport på setup, tom Claim Board og Tutorial |
| RUN-005 | PASS | Light/dark toggle og reload | Theme skiftet og persisterte over reload |
| RUN-006 | FAIL | Ugyldig access code og recovery | UI viste «Access code saved», skjulte access-feltet og tilbød ingen edit/logout/reset etter backend-avvisning; QA-002 |
| RUN-007 | FAIL | Parserkorpus utført mot eksakt deployed parserkilde | Normal/whitespace/zero bestod; suffix, europeisk format og malformed suffix ga plausible feilverdier; QA-003 |
| RUN-008 | FAIL | Runtime accessibility metadata | Alle inputs hadde label/aria-label, men async statusfeltet manglet både `role` og `aria-live`; QA-004 |

## Deterministiske resultater fra fase 3

| Matrix-ID | Status | Resultat |
|---|---|---|
| CON-001 | FAIL (LOCAL) | To claim-kall lykkes; siste writer vinner og to success-audits oppstår |
| SEC-004 | FAIL (LOCAL) | Employee A unclaimer og submitter target eid av B |
| CON-003 | FAIL (LOCAL) | Sekvensiell retry og append→failure→retry gir to submissions |
| TGT-005 | FAIL (LOCAL) | Stale review overskriver nyere status og payload |
| CON-004 | FAIL (LOCAL) | Parallel samme requestId gir to payments og kan markere ordre paid |
| CON-005 | FAIL (LOCAL) | Parallel samme requestId gir to payouts; ulik ID kan betale samme work to ganger |
| CON-006 | FAIL (LOCAL) | Parallel `max+1` gir samme orderId og kundesammenslåing |
| CON-009 / OBS-001 | FAIL (LOCAL) | Add/price/claim/payment kan etterlate partial state eller falsk success-audit |
| CON-010 / CON-011 | FAIL (LOCAL) | Check–send–mark og send→mark-failure gir doble Discord-kall |
| SEC-005 | FAIL (LOCAL) | Employee kan skrive manager/system-lignende canonical audit |
| INP-001 | SUPPORTED (LOCAL) | Formel-lignende tekst når Sheet-write uendret; ekte formelevaluering fortsatt BLOCKED |
| INP-003 | SUPPORTED (LOCAL) | Discord-payload har mentiontekst og mangler `allowed_mentions`; ekte ping fortsatt BLOCKED |
| INP-005 / TGT-007 | FAIL (LOCAL) | Fast parserkorpus bekrefter suffix-/locale-/malformed-feil |

Smale safeguards som bestod: sekvensiell payment- og payout-retry med identisk
`requestId`, normal fire-stat sum og normal 3-av-4-inferens. Totalt resultat:
27/27 harness-tester passerer som reproduksjoner av dokumentert nåværende
atferd.

## Felles blockere

| Scenariofamilie | Konkret blocker |
|---|---|
| SEC/CON/TGT/ORD/PAY authenticated eller muterende | Ingen gyldig employee/admin credential, ingen avgrensede QA-targets/orders og ingen isolert test-Sheet |
| AUT/Discord | Ingen dedikerte testwebhooks; reelle kanaler skulle ikke varsles |
| Torn | Ingen QA-Torn-key; brute force eller bruk av ukjent brukercredential er forbudt |
| Failure/retry/concurrency | Ingen isolert deploy, controllable mock eller failure-injection-harness |
| Formula injection | Kun produksjons-Sheet er kjent; selv ufarlig markør ville forurenset canonical data |
| Full network/storage DevTools | Browseroverflaten eksponerte console og DOM, men ikke raw Network-panel eller direkte storage-enumerering; transport ble verifisert med syntetiske markører og HTTP-observasjon |

| ID | Pri | Område | Scenario | Preconditions | Testmetode | Forventet resultat | Risiko | Prod | Status |
|---|---|---|---|---|---|---|---|---|---|
| SEC-001 | P0 | Auth | Ansatt kaller hver admin-action direkte uten admin key | Testdeploy, access code, fixtures for alle actions | API negative matrix over POST/GET/JSONP | Alle avvises; ingen writes, sends eller audit-success | Sikkerhetsbrudd | Nei | BLOCKED |
| SEC-002 | P0 | Auth | Ugyldig/manglende access code når API_KEY finnes | Testdeploy | GET/POST mot alle actionklasser | Avvises før data leses/muteres | Uautorisert tilgang | Nei | BLOCKED |
| SEC-003 | P0 | Auth config | API_KEY mangler i properties | Isolert deploy uten API_KEY | Kall `list`, `claim`, `audit` uten key | Systemet skal fail-closed iht. godkjent policy | Full åpen backend | Nei | BLOCKED |
| SEC-004 | P0 | Ownership | Ansatt B unclaimer/submitter target claimed av A | To klienter og ett target | Direkte API + UI-verifikasjon | Request avvises; canonical target/submission uendret | Datakorrupsjon | Nei | BLOCKED |
| SEC-005 | P0 | Audit | Ansatt sender vilkårlig actor/action via `audit` | Testdeploy | Direkte request og Sheet-inspeksjon | Uautorisert autoritativ audit avvises eller tydelig merkes som klientlogg | Auditforfalskning | Nei | BLOCKED |
| SEC-006 | P0 | Secrets | Access/admin key i URL, browser og execution logs | Testcredentials/loggtilgang | DevTools, history, referrer og Apps Script-logginspeksjon | Secrets finnes ikke i URL/logg; body/header-basert transport | Credential leak | Nei | FAIL |
| SEC-007 | P0 | Secrets | Secrets i diagnostics/errors/Sheet/export | Testsecrets med canary-verdier | Tving errors; søk alle outputs uten å vise verdier | Ingen canary finnes utenfor godkjent secret store | Credential leak | Nei | BLOCKED |
| SEC-008 | P1 | Data visibility | Ikke-admin `list` skjuler managerdata | Testorder med kunde/pris/payment/webhook | Sammenlign admin/non-admin JSON | Kun tillatte targetfelt og work-ready orders eksponeres | Personvern/forretning | Nei | BLOCKED |
| SEC-009 | P1 | JSONP | Ugyldig callback og muterende GET/JSONP | Testdeploy | Payload-korpus og cross-origin side | Callback er allowlistet; mutasjoner krever sikker metode/CSRF-vern | Script injection/CSRF | Nei | BLOCKED |
| CON-001 | P0 | Claim | To ansatte claimer samme open target samtidig | Testdeploy, to klienter, ett target | Synkroniser parallelle requests ×50 | Nøyaktig én success og én canonical owner | Dobbeltarbeid | Nei | BLOCKED |
| CON-002 | P0 | Stale state | Gammel klient claimer/unclaimer etter nyere canonical endring | To klienter, versjonert fixture | Hold gammel state, muter med B, send fra A | Conflict; nyere state bevares | Lost update | Nei | BLOCKED |
| CON-003 | P0 | Submission | Dobbeltklikk, timeout og identisk retry | Ett claimed target | Parallelle/sekvensielle submits med samme logiske request | Én submission, stabil ID, duplicate-respons | Dobbeltregistrering | Nei | BLOCKED |
| CON-004 | P0 | Payment | Parallelle customer payments med samme requestId | Testorder | Samme request ×20 parallelt | Én aktiv payment-rad og korrekt order total/state | Dobbeltbetaling | Nei | BLOCKED |
| CON-005 | P0 | Payout | Parallelle payouts med samme requestId | Approved target | Samme request ×20 parallelt | Én payout-rad og korrekt target mirror | Dobbeltutbetaling | Nei | BLOCKED |
| CON-006 | P1 | Order ID | Parallelle nye ordrer uten orderId | Tom/definert test-Sheet | Parallelle `add`/`bulkAdd` | Unike orderIds og én Orders-rad per ordre | Ordresammenslåing | Nei | BLOCKED |
| CON-007 | P1 | Order upsert | Parallelle targets til samme ordre | Eksisterende ordre | Parallelle adds og Sheet-asserts | Én order-rad; count/total matcher targets | Lost update/duplikat | Nei | BLOCKED |
| CON-008 | P1 | Review | Submit og review overlapper | Claimed target | Barrierestyrte requests | Review knyttes til korrekt submission-versjon | Feil godkjenning | Nei | BLOCKED |
| CON-009 | P1 | Multi-write | Feil midt i add/submit/payment/price | Mock/failure injection | Kast ved hver write-posisjon; inspeksjon/retry | Atomisk eller sikkert gjenopprettbar state; korrekt audit | Delvis korrupsjon | Nei | BLOCKED |
| CON-010 | P1 | Notification | Parallel completion/new-order calls | Testwebhook med request counter | Samtidige requests ×20 | Nøyaktig én Discord-post per logisk event | Spam/duplikat | Nei | BLOCKED |
| CON-011 | P1 | Delivery | Webhook success etterfulgt av Sheet-write failure | Mock webhook og failure injection | Feil etter send, deretter retry | Ingen dobbel kundeleveranse; tilstand kan reconciles | Dobbeltleveranse | Nei | BLOCKED |
| TGT-001 | P1 | Target state | Gyldig open→claimed→submitted | Testtarget/ansatt | UI + API + Sheet asserts | Eier/timestamps/status/submission/audit konsistente | Kritisk workflow | Nei | BLOCKED |
| TGT-002 | P1 | Target state | Claimed→open via eier-unclaim | Testtarget | UI + API | Claimfelter ryddes; øvrige data bevares | Kritisk workflow | Nei | BLOCKED |
| TGT-003 | P1 | State guards | Claim/submit/unclaim fra hver ugyldig state | Fixtures per state | API transition matrix | Ugyldige transitions avvises uten write | State corruption | Nei | BLOCKED |
| TGT-004 | P1 | Rejection | pending→rejected→korrigert resubmit→approved | Manager og ansatt, testdata | Full UI-flyt | Rejected blir tilgjengelig for riktig resubmit; historikk bevares | Blokkert arbeid | Nei | BLOCKED |
| TGT-005 | P1 | Review | Gammel localStorage-review møter nyere remote review | To managerprofiler | Approve A, gammel reject B, refresh B | Nyere canonical state overskrives ikke uten konfliktvalg | Lost update | Nei | BLOCKED |
| TGT-006 | P1 | Assignment | Backend assignment og annen browser | Manager + ansattprofiler | Assign, ny klient, claim | Canonical assignment vises og håndheves likt | Feil tildeling | Nei | BLOCKED |
| TGT-007 | P2 | Partial spy | Manglende stats, mismatch ID og total | Parserkorpus | UI submit/review | Klare warnings; ingen feil targetbinding; canonical total korrekt | Feil resultat | Nei | FAIL |
| ORD-001 | P0 | Completion | Forsøk completion/delivery med 0 eller ikke-approved targets | Orders i hver state | Direkte actions | Ingen completedAt/send/delivery før alle kriterier | Prematur levering | Nei | BLOCKED |
| ORD-002 | P1 | Completion | Siste target approved | Komplett minus ett target | Review og observer order/webhook | completedAt én gang, ready_to_deliver, korrekt count/price | Kritisk workflow | Nei | BLOCKED |
| ORD-003 | P1 | Regression | Approved target endres til rejected etter completion | Completed testorder | Review til rejected + list | Completionfelter ryddes konsistent; delivered policy eksplisitt | Inkonsekvent ordre | Nei | BLOCKED |
| ORD-004 | P1 | Payment gate | paymentRequired unpaid→partial→paid | Prissatt ordre | Payments i trinn | awaiting_payment til paid; først da ansattvarsel/work visibility | Prematur oppstart | Nei | BLOCKED |
| ORD-005 | P1 | Manual delivery | `markOrderDelivered` før completion | Ufullstendig order | Direkte managerrequest | Avvises eller krever eksplisitt godkjent override med audit | Prematur levering | Nei | BLOCKED |
| ORD-006 | P2 | Derived state | Full order status-prioritetsmatrise | Fixtures for alle feltkombinasjoner | Unit/integration parameterized | Deterministisk forventet status | Feil kø | Nei | BLOCKED |
| PAY-001 | P1 | Payment | Summer partials til total | Prissatt ordre | Flere betalinger | unpaid→partial→paid; summer og metadata korrekt | Ledgerfeil | Nei | BLOCKED |
| PAY-002 | P1 | Payment void | Void paid tilbake til partial/unpaid | Betalt ordre | Void én rad | Status og notification/work policy konsistent | Ledger/workflow | Nei | BLOCKED |
| PAY-003 | P1 | Confirmation | Void siste payment etter paid | Betalt ordre | Void og inspiser confirmation fields | Ingen misvisende «confirmed paid»-metadata | Audit/ledgerfeil | Nei | BLOCKED |
| PAY-004 | P1 | Payout | queued/partial paid/full paid/void | Target med rate | Payoutsekvens | Target mirror og summer er korrekte | Utbetalingsfeil | Nei | BLOCKED |
| PAY-005 | P1 | Validation | Negative, zero, NaN, enorme tall og fri status | Testorder | API boundary-korpus | Kun tillatt beløpsområde/status aksepteres | Finanskorrupt data | Nei | BLOCKED |
| PAY-006 | P2 | Linkage | Payout uten/feil targetRowId eller duplisert targetId | Flere like IDs | UI/API | Entydig binding eller avvisning | Feil ansatt/target | Nei | BLOCKED |
| AUT-001 | P1 | Automation | New-order notification retry/failure | Testwebhook: 2xx/4xx/429/timeout | Mock/responder | Korrekt retry, status og audit; ingen falsk success | Varslingssvikt | Nei | BLOCKED |
| AUT-002 | P1 | Automation | Completion notification retry/failure | Komplett order, testwebhook | Som over | Som over; completedAt forblir canonical | Varslingssvikt | Nei | BLOCKED |
| AUT-003 | P1 | Automation | Auto-delivery success/failure/retry | Komplett order, customer testwebhook | Full flyt | Resultater én gang, sent/failed korrekt, safe retry | Kundefeil | Nei | BLOCKED |
| AUT-004 | P2 | Triggers | Inventer installerte Apps Script-triggers | Prosjekttilgang | Apps Script trigger-inspeksjon | Faktiske triggere dokumentert; ingen skjult jobb antas | Observability gap | Ja | BLOCKED |
| AUT-005 | P2 | Diagnostics | `list`/diagnostics skriver bare avledet korrekt state | Snapshot av test-Sheet | Før/etter diff | Ingen uventede writes; idempotent ved gjentakelse | Skjult mutasjon | Nei | BLOCKED |
| INP-001 | P0 | Sheets injection | Alle fritekstfelt med `=`, `+`, `-`, `@` og canary-formler | Isolert Sheet | Input-korpus via alle writers | Lagres som tekst; ingen formel kjøres | Data exfiltration/korrupsjon | Nei | BLOCKED |
| INP-002 | P0 | XSS | Payload-korpus i alle felter som vises via innerHTML | Lokal UI + testbackend | DOM/browser automation; CSP-observasjon | Ingen script/event/URL kjører | Session/credential theft | Nei | BLOCKED |
| INP-003 | P1 | Discord injection | Navn/notat/resultat med mentions og markdown | Testwebhooks | Send alle meldingstyper | Ingen utilsiktede mentions; innhold avgrenses | Discord-spam | Nei | BLOCKED |
| INP-004 | P1 | JSON/export | RawText med kontrolltegn, stor payload og secrets-canary | Testdata | Archive/export/clipboard og søk | Gyldig JSON; ingen secret; størrelse håndteres | Lekkasjer/databrudd | Nei | BLOCKED |
| INP-005 | P2 | Number parsing | Localekomma, separatorer, exponent, Infinity, blank | Unit-korpus frontend/backend | Parameterized parser tests | Dokumentert og konsistent normalisering/avvisning | Feil stats/pris | Nei | FAIL |
| INP-006 | P2 | Timezone | DST, UTC-midnatt, Sheet Date vs ISO string | Test-Sheet med Oslo/UTC fixtures | UI og backend asserts | Samme instant/status/alder; ingen dagsforskyvning | Feil stale/recent | Nei | BLOCKED |
| DAT-001 | P1 | Schema | Headers mangler, er omordnet eller duplisert | Kopier av test-Sheet | Kjør init/list/writes | Trygg migrering eller tydelig avvisning; ingen feil kolonne | Masseskade | Nei | BLOCKED |
| DAT-002 | P1 | Orphans | Submission/payment/payout med manglende parent | Syntetiske orphan-rader | list/recalc/review | Feil rapporteres; ingen feil parent muteres | Ledgerkorrupsjon | Nei | BLOCKED |
| DAT-003 | P1 | Duplicate IDs | Dupliserte target/order/payment IDs | Test-Sheet | Alle lookup/update-actions | Konflikt oppdages; ikke «første rad vinner» stille | Feil rad oppdatert | Nei | BLOCKED |
| DAT-004 | P2 | Target schema | Automationfelt på target overlever/rebygges | Add + slett/rebygg order fixture | Inspect Targets, run ensure/sync | Godkjent source-of-truth bevarer config | Configtap | Nei | BLOCKED |
| DAT-005 | P2 | Customers/Employees | Verifiser om ubrukte tabeller er tilsiktet | Produkteier + Sheet | Kravspor og runtime observation | Tabellansvar/status eksplisitt dokumentert | Feil antakelse | Ja | BLOCKED |
| OBS-001 | P1 | Audit | Feil ved hvert mutasjonstrinn | Failure-injection harness | Sammenlign response, data og audit | Ingen success-audit uten fullført mutasjon | Falsk sporbarhet | Nei | BLOCKED |
| OBS-002 | P2 | Local/server drift | Lokal audit/history/assignment mot ny browser | To profiler | Utfør, reload, bytt profil | UI skiller tydelig lokal og canonical data | Operatørfeil | Nei | BLOCKED |
| OBS-003 | P2 | Version | Frontend/backend revision match | Live side uten mutasjon | Last frontend, kall `version` | Eksakte versjoner matcher og deploy kan spores til commit | Feil deploy | Ja | BLOCKED |
| UX-001 | P2 | Refresh | Nettverksfeil, JSONP fallback og timeout | Lokal mock/testdeploy | Browser network fault injection | Ingen skjult dobbelmutasjon; tydelig status og safe retry | Duplikater/forvirring | Nei | BLOCKED |
| UX-002 | P3 | Browser | Mobil/desktop, lys/mørk, keyboard/a11y | Lokal server | Browser matrix og accessibility scan | Kritiske flows lesbare og tastaturstyrte | UX | Ja, kun visuell | FAIL |

## Foreslått kjørerekkefølge

1. Opprett isolert Apps Script-deploy, kopi av Sheet og dedikerte Discord-
   testwebhooks; registrer deployinnstillinger, properties, locale og timezone.
2. Bygg deterministic API-harness og fixtures for auth/state/datastore.
3. Kjør P0 auth, ownership, idempotency, concurrency og injection først.
4. Kjør P1 end-to-end target/order/payment/automation med failure injection.
5. Kjør P2/P3 parser-, observability-, browser- og UX-matrisen.
