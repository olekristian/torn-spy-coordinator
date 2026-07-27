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
