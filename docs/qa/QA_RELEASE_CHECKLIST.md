# Torn Spy Coordinator — release checklist

Dato: __________  
Release: `2026-08-06-draft-continuity-v1`
Operatør: __________  
Godkjenner: __________

Tillatte statuser: **PASS**, **FAIL**, **BLOCKED**.  
Produksjon kan ikke åpnes dersom ett kritisk punkt er FAIL eller BLOCKED.

## Miljø og evidens

| Felt | Verdi |
|---|---|
| Staging Sheet | [Phase 5 stagingkopi](https://docs.google.com/spreadsheets/d/1sG8sFEROsTqBECSMYYUHcu1a3d16v-s26P1-9Iw1WbE/edit) |
| Staging Apps Script project/deployment ID | __________ |
| Staging Web App URL | __________ |
| Frontend staging URL | __________ |
| Backend version-respons | __________ |
| Employee A canonical navn | __________ |
| Employee B canonical navn | __________ |
| Manager canonical navn | __________ |
| Discord testkanal(er) | __________ |
| Sheet backup/export | __________ |
| Header/radantall før | __________ |
| Header/radantall etter | __________ |
| Maskert network-evidens | __________ |
| Browser/console-evidens | __________ |

Ikke skriv faktiske access codes, admin keys eller webhooktokens i sjekklisten.

## Hard stop før staging

| Status | Kontroll | Evidens |
|---|---|---|
| BLOCKED | Apps Script stagingdeploy er separat fra produksjon | Ingen deploy tilgjengelig 2026-07-23 |
| PASS | Sheet staging-ID er ulik original-ID | Staging: `1sG8...1WbE`; original-ID dokumentert separat |
| PASS | Stagingkopien er ikke delt | Drive metadata: `shared=false` |
| BLOCKED | To employee-testkoder er konfigurert | Ikke satt |
| BLOCKED | Separat admin testkey og `ADMIN_ACTOR` er konfigurert | Ikke satt |
| BLOCKED | Kun testwebhooks er konfigurert | Ingen testwebhooks tilgjengelige |
| PASS | Frontend/backend kildeversjon er lik | `2026-08-06-draft-continuity-v1`; lokal test |
| PASS | Lokal regression er grønn | 51/51 |

## Gate 1 — Apps Script transport og auth

| Status | Kontroll | Evidens |
|---|---|---|
| BLOCKED | Employee credential finnes bare i POST-body | Lokal harness PASS; faktisk Network mangler |
| BLOCKED | Admin credential finnes bare i POST-body | Lokal harness PASS; faktisk Network mangler |
| BLOCKED | Ingen credential i URL, redirect, history, referrer eller logg | Maskert canary-søk mangler |
| BLOCKED | GET/query/JSONP credential-forsøk avvises | Lokal harness PASS; staging runtime mangler |
| BLOCKED | Valid employee A/B fungerer | Testproperties/deploy mangler |
| BLOCKED | Invalid employee avvises uten data | Testproperties/deploy mangler |
| BLOCKED | Canonical employee kommer fra backend mapping | Lokal harness PASS; runtime mangler |
| BLOCKED | Spoofet display name endrer ikke actor | Lokal harness PASS; runtime mangler |
| BLOCKED | Manager auth fungerer | Testproperties/deploy mangler |
| BLOCKED | Unauthorized manager-action avvises backend-side | Runtime negative matrix mangler |

Gate 1 samlet status: **BLOCKED**  
Godkjent av/evidens: ________________________________________________

## Gate 2 — Schema migration

Før kjøring: eksporter Sheet, registrer faner, headers, radantall, ID-hash og
tre representative legacy-rader per berørt ark.

| Status | Kontroll | Evidens |
|---|---|---|
| BLOCKED | `Targets`: `version`, `lastOperationId` lagt til | Ikke kjørt i Apps Script runtime |
| BLOCKED | `Submissions`: `requestId`, `version`, `reviewOperationId` lagt til | Ikke kjørt i Apps Script runtime |
| BLOCKED | `AuditLog`: `operationId` lagt til | Ikke kjørt i Apps Script runtime |
| BLOCKED | `Outbox` opprettet med korrekt schema | Ikke kjørt i Apps Script runtime |
| BLOCKED | Faktisk historisk headerrekkefølge beholdt | Lokal QA-018 regression PASS; live post-migration mangler |
| BLOCKED | Eksisterende rader og IDs er identiske | Før/etter-diff mangler |
| BLOCKED | Legacy-rader uten nye values leses/oppdateres korrekt | Lokal regression PASS; runtime mangler |
| BLOCKED | Andre ensure-kjøring gir null diff | Lokal regression PASS; runtime mangler |
| BLOCKED | Ingen duplikate/tomme konfliktheaders | Lokal duplicate guard PASS; live kontroll mangler |
| BLOCKED | Representative add/claim/submit/review/payment/payout flows passerer | Runtime mangler |

Gate 2 samlet status: **BLOCKED**  
Godkjent av/evidens: ________________________________________________

## Gate 3 — Google Sheets formula semantics

Kjør via produktets faktiske backend-write-path, ikke direkte celleinnliming.

| Status | Felt/input | Forventet og evidens |
|---|---|---|
| BLOCKED | `=1+1` i alle relevante tekstfelt | Tekst round-trip; ingen `formulaValue` |
| BLOCKED | `+1` i alle relevante tekstfelt | Tekst round-trip; ingen `formulaValue` |
| BLOCKED | `-1+2` i alle relevante tekstfelt | Tekst round-trip; ingen `formulaValue` |
| BLOCKED | `@test` i alle relevante tekstfelt | Tekst round-trip; ingen evaluering/chip |
| BLOCKED | Ekte level/stat/pris/payment/payout-tall | `numberValue`, ikke tekst |

Gate 3 samlet status: **BLOCKED**  
Godkjent av/evidens: ________________________________________________

## Gate 4 — Discord Outbox og mentions

| Status | Kontroll | Evidens |
|---|---|---|
| BLOCKED | Normal send: `pending → sending → sent` | Testwebhook mangler |
| BLOCKED | To workers gir én logical event | Lokal harness PASS; kanal/Sheet runtime mangler |
| BLOCKED | HTTP 400 gir kontrollert `failed` | Testwebhook/mock mangler |
| BLOCKED | HTTP 429 håndteres uten blind duplikat | Testwebhook/mock mangler |
| BLOCKED | HTTP 500/mock gir kontrollert `failed` | Testwebhook/mock mangler |
| BLOCKED | Timeout/mock gir `unknown` | Lokal harness PASS; runtime mangler |
| BLOCKED | `unknown` retrys ikke automatisk | Lokal harness PASS; runtime mangler |
| BLOCKED | Operator retry krever `confirmUnknown=true` | Lokal harness PASS; runtime mangler |
| BLOCKED | `@everyone`, `@here`, `<@user>`, `<@&role>` pinger ikke | `allowed_mentions` lokal PASS; kanalbevis mangler |
| PASS | Leveringsgaranti dokumentert | Logical dedupe internt; ekstern at-least-once, ikke exactly-once |

Gate 4 samlet status: **BLOCKED**  
Godkjent av/evidens: ________________________________________________

## Gate 5 — Authenticated browser regression

### Employee

| Status | Kontroll | Evidens |
|---|---|---|
| BLOCKED | Valid/invalid login, Edit access og reload | __________ |
| BLOCKED | Claim og second-employee conflict | __________ |
| BLOCKED | Ownership guard, unauthorized unclaim, owner unclaim | __________ |
| BLOCKED | Submit og samme-request retry | __________ |

### Manager

| Status | Kontroll | Evidens |
|---|---|---|
| BLOCKED | Login og unauthorized manager negative test | __________ |
| BLOCKED | Review og stale review conflict | __________ |
| BLOCKED | Parallel order creation gir unike IDs | __________ |
| BLOCKED | Payment og duplicate payment | __________ |
| BLOCKED | Payout og duplicate payout | __________ |
| BLOCKED | Audit viser canonical actor/operationId én gang | __________ |

### Parser, responsive, accessibility og diagnostics

| Status | Kontroll | Evidens |
|---|---|---|
| BLOCKED | UI-preview parserkorpus, rejects, suffixes og totals | Lokal parser PASS; UI runtime mangler |
| BLOCKED | Desktop/laptop/tablet/390 px authenticated views | __________ |
| BLOCKED | Keyboard, focus, dialog/modal og setup recovery | Lokal contracts PASS; runtime mangler |
| BLOCKED | Live status annonseres korrekt | Lokal ARIA contract PASS; assistive runtime mangler |
| BLOCKED | Ingen uncaught errors eller uhåndterte requestfeil | __________ |
| BLOCKED | Ingen secrets i URL, responses eller logging | __________ |
| BLOCKED | Frontend/backend viser `2026-08-06-draft-continuity-v1` | Lokal parity PASS; runtime mangler |

Gate 5 samlet status: **BLOCKED**  
Godkjent av/evidens: ________________________________________________

## Concurrency runtime spot-check

Etter hver test: registrer begge responser og sammenlign faktisk Sheet-state,
radantall, IDs, versions, operation IDs og audit.

| Status | To-klient scenario | Forventet canonical state |
|---|---|---|
| BLOCKED | Same target claim race | Én owner, én success-audit, én conflict |
| BLOCKED | Unauthorized unclaim | Ingen endring/audit |
| BLOCKED | Duplicate submission, samme requestId | Én submission og stabil ID |
| BLOCKED | Stale review | Conflict; nyere review/payload beholdes |
| BLOCKED | Parallel order creation | Unike order IDs, ingen kundesammenslåing |
| BLOCKED | Duplicate payment | Én paymentrad og korrekt total |
| BLOCKED | Duplicate payout | Én payout/work-effekt og korrekt mirror |

## Produksjonsdeploy

Ikke start før Gate 1–5 alle er PASS.

| Status | Trinn | Evidens/operatør |
|---|---|---|
| BLOCKED | 1. Frys mutasjoner og Outbox-retries | __________ |
| BLOCKED | 2. Backup/export alle relevante Sheets | __________ |
| BLOCKED | 3. Snapshot headers, radantall, IDs og Outbox | __________ |
| BLOCKED | 4. Sett og dobbeltkontroller properties | __________ |
| BLOCKED | 5. Valider `TORN_COMPANY_ID`; test Torn-innlogging med to ansatte | __________ |
| BLOCKED | 6. Kjør schema ensure + diff + ensure på nytt | __________ |
| BLOCKED | 7. Deploy backend immutable version | __________ |
| BLOCKED | 8. Deploy frontend umiddelbart i vedlikeholdsvindu | __________ |
| BLOCKED | 9. Immediate smoke og version match | __________ |
| BLOCKED | 10. Authenticated employee test | __________ |
| BLOCKED | 11. Manager test og auditinspeksjon | __________ |
| BLOCKED | 12. Én kontrollert Outbox/Discord-test | __________ |
| BLOCKED | 13. Åpne trafikk | __________ |

## Properties — fire-eyes check

| Status | Property | Verifisering |
|---|---|---|
| BLOCKED | `TORN_COMPANY_ID` | Numerisk ID for riktig Torn-company |
| BLOCKED | `ADMIN_KEY` | Sterk, ulik employee-koder |
| BLOCKED | `SESSION_SECRET` | Autogenerert eller eksplisitt lang tilfeldig verdi; aldri eksponert |
| BLOCKED | `ADMIN_ACTOR` | Canonical manageridentitet |
| BLOCKED | `MANAGER_DISCORD_WEBHOOK_URL` | Riktig kanal og miljø |
| BLOCKED | `EMPLOYEE_DISCORD_WEBHOOK_URL` | Riktig kanal og miljø |
| BLOCKED | `CUSTOMER_DISCORD_WEBHOOK_URL_<KEY>` ved behov | Kun eksplisitt test/prod-kunde |

## Rollback decision card

Rollback straks ved credential leak, auth bypass, data-/kolonnemismatch,
ID-/radendring, duplisert økonomisk write, ukontrollert Discord-event,
versjonsmismatch eller kritisk uncaught error.

1. Stopp trafikk og Outbox-retries.
2. Snapshot Sheet og Outbox.
3. Rull frontend tilbake til forrige artifact.
4. Aktiver forrige immutable Apps Script-deployment.
5. Behold additive headers og Outbox.
6. Ikke resend `sent`.
7. Frys `pending`, `sending`, `failed`, `unknown`; stale `sending` blir
   `unknown`.
8. Sjekk kanal manuelt før eksplisitt retry av `unknown`.
9. Dokumenter event-ID og beslutning.
10. Kjør rollback smoke før trafikk åpnes.

Rollback utført av: __________  
Tidspunkt: __________  
Årsak/evidens: ______________________________________________________

## Final release decision

| Gate | Status |
|---|---|
| Gate 1 | BLOCKED |
| Gate 2 | BLOCKED |
| Gate 3 | BLOCKED |
| Gate 4 | BLOCKED |
| Gate 5 | BLOCKED |

Beslutning: **NO-GO**  
Besluttet av: __________  
Tidspunkt: __________  
Kommentar: Fem eksterne runtime-gates mangler PASS.
