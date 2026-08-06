const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
