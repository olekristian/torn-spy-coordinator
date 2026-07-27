const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHarness } = require('./gas-harness.cjs');

const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

function target(overrides = {}) {
  return {
    id: 'target-1',
    targetName: 'QA Target',
    targetId: '100001',
    status: 'claimed',
    claimedBy: 'Employee A',
    orderId: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('frontend transports credentials only in POST body', () => {
  const callStart = html.indexOf('async function call(');
  const callEnd = html.indexOf('async function verifyAdminKey', callStart);
  const source = html.slice(callStart, callEnd);

  assert.match(source, /method:\s*'POST'/);
  assert.match(source, /payload\.key\s*=\s*state\.key/);
  assert.doesNotMatch(source, /key=.*encodeURIComponent/);
  assert.doesNotMatch(source, /admin=.*encodeURIComponent/);
  assert.doesNotMatch(source, /jsonpCall|payload=.*encodeURIComponent/);
});

test('backend rejects credentials supplied in URL query', () => {
  const h = createHarness();
  const response = h.request({ action: 'list', key: 'employee-key' }, 'GET');
  assert.equal(response.ok, false);
  assert.match(response.error, /POST|Credentials/);
});

test('backend rejects credential-bearing encoded query payloads', () => {
  const h = createHarness();
  const output = h.context.handleRequest({
    parameter: {
      action: 'list',
      payload: encodeURIComponent(JSON.stringify({ key:'employee-key', admin:'admin-key' })),
    },
  }, 'GET');
  const response = JSON.parse(output.getContent());
  assert.equal(response.ok, false);
  assert.match(response.error, /Query payloads/);
});

test('canonical employee identity prevents ownership spoofing', () => {
  const h = createHarness();
  h.append('Targets', target());
  const denied = h.request({
    action: 'unclaim',
    key: 'employee-b-key',
    employee: 'Employee A',
    id: 'target-1',
    requestId: 'unclaim-b',
  });
  assert.equal(denied.ok, false);
  assert.match(denied.error, /Forbidden/);
  assert.equal(h.rows('Targets')[0].claimedBy, 'Employee A');
  assert.equal(h.rows('AuditLog').length, 0);

  const allowed = h.request({
    action: 'unclaim',
    key: 'employee-key',
    employee: 'Spoofed Name',
    id: 'target-1',
    requestId: 'unclaim-a',
  });
  assert.equal(allowed.ok, true);
  assert.equal(h.rows('AuditLog')[0].actor, 'Employee A');
});

test('employee cannot append arbitrary canonical audit events', () => {
  const h = createHarness();
  const response = h.request({
    action: 'audit',
    key: 'employee-key',
    actor: 'Manager',
    auditAction: 'order_delivered',
    details: 'fabricated',
  });
  assert.equal(response.ok, false);
  assert.equal(h.rows('AuditLog').length, 0);
});

test('text fields are neutralized before all central Sheet write paths', () => {
  const h = createHarness();
  for (const [index, value] of ['=1+1', '+1', '-1+2', '@test'].entries()) {
    h.append('Targets', target({
      id: `target-${index}`,
      targetName: value,
      notes: value,
      customer: value,
      pricePerSpy: value,
    }));
  }
  for (const row of h.rows('Targets')) {
    assert.match(row.targetName, /^'/);
    assert.match(row.notes, /^'/);
    assert.match(row.customer, /^'/);
    assert.match(String(row.pricePerSpy), /^'/);
  }
});

test('Discord payload disables all mentions while preserving visible content', () => {
  const h = createHarness();
  h.context.postDiscord_('https://discord.com/api/webhooks/test/token', '@everyone @here <@123>');
  const payload = JSON.parse(h.env.sends[0].request.payload);
  assert.equal(payload.content, '@everyone @here <@123>');
  assert.deepEqual(JSON.parse(JSON.stringify(payload.allowed_mentions)), {
    parse: [],
    users: [],
    roles: [],
  });
});
