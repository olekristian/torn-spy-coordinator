const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const backend = fs.readFileSync(path.resolve(__dirname, '../../apps-script/Code.gs'), 'utf8');

test('frontend and backend advertise the same release version', () => {
  const frontendVersion = html.match(/APP_FRONTEND_VERSION\s*=\s*["']([^"']+)/)?.[1];
  const backendVersion = backend.match(/BACKEND_VERSION\s*=\s*["']([^"']+)/)?.[1];
  assert.ok(frontendVersion);
  assert.equal(frontendVersion, backendVersion);
});

test('status element exposes polite live-region semantics', () => {
  assert.match(
    html,
    /<div id="err"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/,
  );
});

test('setup configured state requires verified backend access', () => {
  assert.match(html, /hasCode && state\.accessVerified/);
  assert.match(html, /state\.accessVerified = true/);
  assert.match(html, /state\.accessVerified = false/);
  assert.match(html, /localStorage\.removeItem\('torn_api_key'\)/);
  assert.match(html, /id="edit-access"/);
  assert.match(html, /function editAccess\(/);
});

test('logical request IDs persist across unknown-result retries', () => {
  assert.match(html, /getOrCreateSubmissionRequestId/);
  assert.match(html, /getOrCreateOperationRequestId\('custpay'/);
  assert.match(html, /getOrCreateOperationRequestId\('emppay'/);
  assert.match(html, /getOrCreateOperationRequestId\('bulkadd'/);
  assert.match(html, /getOrCreateOperationRequestId\('add'/);
});

test('manager review sends explicit submission version and stable operation ID', () => {
  assert.match(html, /submissionId:task\.payload && task\.payload\.submissionId/);
  assert.match(html, /expectedVersion:task\.payload && task\.payload\.version/);
  assert.match(html, /requestId:'review:'/);
  const reconcileStart = html.indexOf('async function reconcileLocalReviewsToServer_');
  const reconcileEnd = html.indexOf('async function claim(', reconcileStart);
  assert.doesNotMatch(html.slice(reconcileStart, reconcileEnd), /await call\(/);
});

test('clean spy submissions auto-approve while suspicious submissions show reasons', () => {
  assert.match(backend, /const reviewStatus = reviewWarnings\.length \? 'pending_review' : 'approved'/);
  assert.match(backend, /function submissionReviewWarnings_/);
  assert.match(backend, /function reportedTotalFromRaw_/);
  assert.match(html, /Reason for Manual Review:/);
  assert.match(html, /function getReportedTotal\(/);
  assert.match(html, /id="approve-all-clean"/);
  assert.match(html, /function approveAllCleanSubmissions\(/);
});

test('employee payouts can settle an employee per order without manual target IDs', () => {
  assert.match(html, /id="ledger-payout-order"/);
  assert.match(html, /id="pay-employee-order-full"/);
  assert.match(html, /function payEmployeeOrderInFull\(/);
  assert.match(html, /action['"],?\s*['"]employeeOrderPayout|syncLedgerAction\('employeeOrderPayout'/);
  assert.match(backend, /function recordEmployeeOrderPayout_/);
  assert.match(backend, /sameActorName_\(target\.claimedBy, employeeName\)/);
  assert.match(html, /function standardPayoutReference\(/);
  assert.match(backend, /function standardPayoutReference_\(/);
});

test('manager can cancel an order with a stable request ID and explicit warning', () => {
  assert.match(html, /async function cancelOrder\(orderId\)/);
  assert.match(html, /action:'cancelOrder'/);
  assert.match(html, /getOrCreateOperationRequestId\('cancelorder'/);
  assert.match(html, /Targets will disappear from active spy views/);
  assert.match(html, /Ledger rows, submissions, payments and audit history will be preserved/);
  assert.match(html, /'Cancel order', \(\) => cancelOrder\(order\.orderId\)/);
  assert.match(html, /button\.danger/);
  assert.match(html, /state\.tasks = state\.tasks\.filter\(task => String\(task\.orderId/);
  assert.match(html, /was cancelled, but refresh failed/);
  assert.match(html, /Unknown action:\\s\*cancelOrder/);
  assert.match(html, /Apps Script backend is older than this webpage/);
});

test('admin opens on a compact attention overview with details collapsed', () => {
  assert.match(html, /id="manager-attention"/);
  assert.match(html, /What needs attention right now/);
  assert.match(html, /data-manager-section="orders-section"/);
  assert.match(html, /function openManagerSection\(sectionId\)/);
  assert.doesNotMatch(html, /<details class="manager-accordion"[^>]*\sopen[\s>]/);
});

test('admin hides finished orders and empty automation queues by default', () => {
  assert.match(html, /managerOrders:"active"/);
  assert.match(html, /All, including finished/);
  assert.match(html, /\['cancelled','delivered','closed'\]\.includes\(getOrderStatus\(orderId\)\)/);
  assert.match(html, /visibleGroups\.length \? visibleGroups\.map/);
  assert.match(html, /No automation queues need attention/);
});

test('mobile setup controls do not overlay the spy submission form', () => {
  const mobileCss = html.match(/@media \(max-width: 760px\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(mobileCss, /\.top-controls\s*\{[^}]*position:\s*static/);
  assert.match(mobileCss, /backdrop-filter:\s*none/);
});

test('shared read-only access directs employees to Torn sign-in or legacy access', () => {
  assert.match(html, /Individual employee access is required/);
  assert.match(html, /This access is read-only/);
  assert.match(html, /Sign in with your Torn API key/);
  assert.match(html, /Claim failed: '\+friendlyErrorMessage\(e\)/);
  assert.match(html, /Submit failed: ' \+ friendlyErrorMessage\(e\)/);
});

test('Torn employee sign-in preserves its session and only remembers the raw key by explicit opt-in', () => {
  assert.match(html, /action:'authenticateTorn', tornApiKey/);
  assert.match(html, /sessionStorage\.setItem\(TORN_EMPLOYEE_SESSION_TOKEN/);
  assert.match(html, /localStorage\.setItem\(TORN_EMPLOYEE_PERSISTED_SESSION_TOKEN/);
  assert.match(html, /localStorage\.getItem\(TORN_EMPLOYEE_PERSISTED_SESSION_TOKEN/);
  assert.match(html, /sessionStorage\.setItem\(TORN_EMPLOYEE_API_KEY/);
  assert.match(html, /id="remember-torn-key" type="checkbox"/);
  assert.match(html, /Do not use this on a public or shared computer/);
  assert.match(html, /localStorage\.getItem\(TORN_EMPLOYEE_REMEMBERED_API_KEY\)/);
  assert.match(html, /remember-torn-key'\)\?\.checked\) localStorage\.setItem\(TORN_EMPLOYEE_REMEMBERED_API_KEY, tornApiKey\)/);
  assert.match(html, /localStorage\.removeItem\(TORN_EMPLOYEE_REMEMBERED_API_KEY\)/);
  assert.match(html, /Invalid employee session\|Employee session expired\|Employee session is no longer valid for this company/);
  assert.doesNotMatch(html, /if \(\/session\|sign in with Torn\/i/);
  assert.match(html, /payload\.sessionToken = state\.sessionToken/);
  assert.match(html, /function isOwnedByCurrentEmployee/);
  assert.match(html, /claimedByTornId/);
  assert.match(html, /key=info&user=reports,profile/);
  assert.match(html, /key → info/);
  assert.match(html, /user → profile/);
  assert.match(html, />Create Torn API key</);
  assert.match(html, /deployed Apps Script backend is out of date/);
});

test('direct Torn report requests use the Authorization header, not URL credentials', () => {
  const start = html.indexOf('async function fetchTornEndpoint');
  const end = html.indexOf('async function verifyTornKey', start);
  const source = html.slice(start, end);
  assert.match(source, /Authorization:'ApiKey ' \+ key/);
  assert.doesNotMatch(source, /searchParams\.set\('key'/);
});

test('queue refresh uses authenticated POST requests', () => {
  const start = html.indexOf('async function refresh(options)');
  const end = html.indexOf('\nfunction editAccess()', start);
  const source = html.slice(start, end);
  assert.match(source, /call\('', 'POST', \{ action:'list' \}\)/);
  assert.doesNotMatch(source, /call\([^)]*,\s*'GET'/);
  assert.match(html, /async function call\(path, method='POST', body\)/);
});

test('Torn key verification uses the v2 key-info endpoint and checks required selections', () => {
  const start = html.indexOf('async function verifyTornKey');
  const end = html.indexOf('function forgetTornKey', start);
  const source = html.slice(start, end);
  assert.match(source, /fetchTornEndpoint\('\/v2\/key\/info'\)/);
  assert.match(source, /keySelections\.includes\('info'\)/);
  assert.match(source, /userSelections\.includes\('reports'\)/);
  assert.match(source, /userSelections\.includes\('profile'\)/);
  assert.doesNotMatch(source, /fetchTornEndpoint\('\/key\/'/);
});

test('found spy reports resolve the target username and level through the Torn profile', () => {
  const start = html.indexOf('async function findSpyFromLogs');
  const end = html.indexOf('\n\nfunction extractImportTargets', start);
  const source = html.slice(start, end);
  assert.match(source, /!match\.parsed\.targetName \|\| match\.parsed\.level == null/);
  assert.match(source, /fetchTornProfileIdentity\(match\.parsed\.targetId \|\| task\.targetId\)/);
  assert.match(source, /match\.parsed\.targetName = profile\.name/);
  assert.match(html, /function normalizeTornProfileIdentity\(data\)/);
  assert.match(html, /candidate\.name \|\| candidate\.username/);

  const helperStart = html.indexOf('function normalizeTornProfileIdentity');
  const helperEnd = html.indexOf('\n\nasync function fetchTornProfileIdentity', helperStart);
  const context = {
    parseNumberToken(value) {
      const number = Number(value);
      return Number.isSafeInteger(number) ? number : null;
    },
  };
  vm.createContext(context);
  vm.runInContext(html.slice(helperStart, helperEnd), context);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.normalizeTornProfileIdentity({ name:'Eustaquio', level:100 }))),
    { name:'Eustaquio', level:100 },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.normalizeTornProfileIdentity({ profile:{ username:'NestedName', level:94 } }))),
    { name:'NestedName', level:94 },
  );
});

test('copying an old order resolves missing names and preserves submission name fallbacks', () => {
  const formatStart = html.indexOf('function formatSubmittedList');
  const formatEnd = html.indexOf('\n\nfunction getVisibleSubmitted', formatStart);
  const formatSource = html.slice(formatStart, formatEnd);
  assert.match(formatSource, /name: t\.targetName \|\| \(t\.payload && t\.payload\.name\) \|\| ''/);

  const copyStart = html.indexOf('function usableOrderTargetName');
  const copyEnd = html.indexOf('\n\nasync function setOrderPriceFromCard', copyStart);
  const copySource = html.slice(copyStart, copyEnd);
  assert.match(copySource, /async function resolveHistoricalOrderTargetNames\(orderId\)/);
  assert.match(copySource, /fetchTornProfileIdentity\(targetId\)/);
  assert.match(copySource, /task\.targetName = name/);
  assert.match(copySource, /await resolveHistoricalOrderTargetNames\(orderId\)/);
  assert.match(copySource, /navigator\.clipboard\.writeText\(formatCustomerOrderMessage\(orderId\)\)/);
});

test('employee spy drafts survive redraws and same-tab mobile reloads', () => {
  assert.match(html, /EMPLOYEE_DRAFTS_KEY\s*=\s*"torn_employee_spy_drafts_session"/);
  assert.match(html, /sessionStorage\.setItem\(EMPLOYEE_DRAFTS_KEY/);
  assert.match(html, /function loadTaskDrafts\(/);
  assert.match(html, /loadTaskDrafts\(\)/);
  assert.match(html, /saveTaskDraft\(t\.id, ta\.value \|\| '', t\)/);
  assert.match(html, /ta\.value = state\.pastes\[String\(t\.id\)\] \|\| ''/);
  const saveStart = html.indexOf('function savePastes()');
  const saveEnd = html.indexOf('function loadTaskDrafts()', saveStart);
  assert.doesNotMatch(html.slice(saveStart, saveEnd), /state\.pastes\s*=\s*\{\}/);
});

test('manager-assisted submission records performer separately from entering manager', () => {
  assert.match(html, /Submit on behalf of a company member/);
  assert.match(html, /action:managerAssisted \? 'managerSubmit' : 'submit'/);
  assert.match(html, /performedBy:managerAssisted \? employeeName : ''/);
  assert.match(html, /Entered by:/);
  assert.match(backend, /submissionMode:\s*managerAssisted \? 'manager_assisted' : 'employee'/);
  assert.match(backend, /manager_submitted_for_employee/);
  assert.match(backend, /requireAdmin_\(input\)/);
});

test('confirmed submission leaves active claims even when refresh fails', () => {
  const start = html.indexOf('async function submitSpy(id, options)');
  const end = html.indexOf('\n\nfunction parseImportTarget', start);
  const source = html.slice(start, end);
  assert.match(source, /submissionConfirmed = true/);
  assert.match(source, /clearTaskDraft\(id\)/);
  assert.match(source, /task\.status = 'submitted'/);
  assert.match(source, /const refreshSucceeded = await refresh\(\)/);
  assert.match(source, /Result submitted, but the latest queue could not be refreshed/);
  assert.match(source, /if \(submissionConfirmed\)/);
});

test('employees can recover orphaned drafts and see their recent submissions', () => {
  assert.match(html, /function renderEmployeeContinuity\(/);
  assert.match(html, /Recovered draft:/);
  assert.match(html, /Copy draft/);
  assert.match(html, /Delete draft/);
  assert.match(html, /function getEmployeeRecentSubmissions\(/);
  assert.match(html, /Your recent activity/);
  assert.match(html, /Submitted:/);
});
