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
  assert.match(source, /payload\.sessionToken\s*=\s*state\.sessionToken/);
  assert.match(source, /payload\.key\s*=\s*state\.key/);
  assert.doesNotMatch(source, /key=.*encodeURIComponent/);
  assert.doesNotMatch(source, /admin=.*encodeURIComponent/);
  assert.doesNotMatch(source, /jsonpCall|payload=.*encodeURIComponent/);
});

test('Torn sign-in verifies identity and company membership without persisting the raw key', () => {
  const rawKey = 'torn-secret-key';
  const h = createHarness({
    urlFetchResponse(url, request) {
      assert.equal(request.headers.Authorization, 'ApiKey ' + rawKey);
      assert.doesNotMatch(url, /torn-secret-key|[?&]key=/);
      if (url.endsWith('/key/info')) {
        return { code:200, body:JSON.stringify({ info:{ user:{ id:9001, company_id:12345 } } }) };
      }
      if (url.endsWith('/user/profile')) {
        return { code:200, body:JSON.stringify({ profile:{ id:9001, name:'Kattemannen' } }) };
      }
      throw new Error('Unexpected URL: ' + url);
    },
  });

  const signedIn = h.request({ action:'authenticateTorn', tornApiKey:rawKey });
  assert.equal(signedIn.ok, true);
  assert.equal(signedIn.identity.name, 'Kattemannen');
  assert.equal(signedIn.identity.tornId, '9001');
  assert.ok(signedIn.sessionToken);
  assert.equal([...h.env.properties.values()].some(value => String(value).includes(rawKey)), false);

  h.append('Targets', target({ id:'target-torn', status:'open', claimedBy:'' }));
  const claimed = h.request({ action:'claim', sessionToken:signedIn.sessionToken, id:'target-torn', requestId:'claim-torn' });
  assert.equal(claimed.ok, true);
  assert.equal(h.rows('Targets')[0].claimedBy, 'Kattemannen');
  assert.equal(String(h.rows('Targets')[0].claimedByTornId), '9001');
});

test('Torn sign-in explains missing Custom key selections', () => {
  const missingProfile = createHarness({
    urlFetchResponse(url) {
      if (url.endsWith('/key/info')) {
        return { code:200, body:JSON.stringify({ info:{ user:{ id:9001, company_id:12345 } } }) };
      }
      return { code:403, body:JSON.stringify({ error:{ code:16, error:'Access level of this key is not high enough' } }) };
    },
  }).request({ action:'authenticateTorn', tornApiKey:'custom-key' });
  assert.equal(missingProfile.ok, false);
  assert.match(missingProfile.error, /missing user → profile access/);
});

test('Torn sign-in accepts company ID from the alternate key-info access shape', () => {
  const h = createHarness({
    urlFetchResponse(url) {
      if (url.endsWith('/key/info')) {
        return { code:200, body:JSON.stringify({ info:{ user:{ id:9001 }, access:{ company_id:12345 } } }) };
      }
      if (url.endsWith('/user/profile')) {
        return { code:200, body:JSON.stringify({ profile:{ id:9001, name:'Kattemannen' } }) };
      }
      throw new Error('Unexpected URL: ' + url);
    },
  });
  const signedIn = h.request({ action:'authenticateTorn', tornApiKey:'custom-key' });
  assert.equal(signedIn.ok, true);
  assert.equal(signedIn.identity.tornId, '9001');
});

test('tampered Torn sessions and non-company Torn users are rejected', () => {
  const h = createHarness({
    urlFetchResponse(url) {
      if (url.endsWith('/key/info')) return { code:200, body:JSON.stringify({ info:{ user:{ id:9002, company_id:99999 } } }) };
      throw new Error('Profile should not be requested for an outsider.');
    },
  });
  const denied = h.request({ action:'authenticateTorn', tornApiKey:'outsider-key' });
  assert.equal(denied.ok, false);
  assert.match(denied.error, /Torn reports this account in company 99999/);
  assert.match(denied.error, /TORN_COMPANY_ID is 12345/);

  const valid = h.context.issueSessionToken_({ v:1, sub:'9001', name:'Kattemannen', companyId:'12345', exp:Date.now() + 60000 });
  const tampered = valid.slice(0, -1) + (valid.endsWith('A') ? 'B' : 'A');
  const response = h.request({ action:'list', sessionToken:tampered });
  assert.equal(response.ok, false);
  assert.match(response.error, /Invalid employee session/);
});

test('Torn ID, not a matching display name, controls target ownership', () => {
  const h = createHarness();
  h.append('Targets', target({ claimedBy:'Same Name', claimedByTornId:'9001' }));
  const otherEmployeeToken = h.context.issueSessionToken_({ v:1, sub:'9002', name:'Same Name', companyId:'12345', exp:Date.now() + 60000 });
  const denied = h.request({ action:'unclaim', sessionToken:otherEmployeeToken, id:'target-1', requestId:'unclaim-other-id' });
  assert.equal(denied.ok, false);
  assert.match(denied.error, /Forbidden/);
});

test('manager-assisted submission separates performer from entering manager', () => {
  const h = createHarness({ properties:{ ADMIN_ACTOR:'Manager A' } });
  h.append('Targets', target({ status:'open', claimedBy:'', claimedByTornId:'', assignedTo:'Employee B' }));
  const payload = {
    name:'QA Target', targetId:'100001', rawText:'spy data', level:10,
    strength:1, speed:2, dexterity:3, defense:4, total:10, formatted:'formatted', warnings:[],
  };
  const submitted = h.request({
    action:'managerSubmit', key:'employee-key', admin:'admin-key', id:'target-1',
    performedBy:'Employee B', payload, requestId:'manager-submit-1',
  });
  assert.equal(submitted.ok, true);
  assert.equal(submitted.performedBy, 'Employee B');
  assert.equal(submitted.enteredBy, 'Employee A');
  assert.equal(h.rows('Targets')[0].claimedBy, 'Employee B');
  assert.equal(h.rows('Targets')[0].status, 'submitted');
  const submission = h.rows('Submissions')[0];
  assert.equal(submission.submittedBy, 'Employee B');
  assert.equal(submission.enteredBy, 'Employee A');
  assert.equal(submission.submissionMode, 'manager_assisted');
  assert.equal(h.rows('AuditLog').some(row => row.action === 'manager_submitted_for_employee' && row.actor === 'Employee A'), true);
  const retried = h.request({
    action:'managerSubmit', key:'employee-key', admin:'admin-key', id:'target-1',
    performedBy:'Employee B', payload, requestId:'manager-submit-1',
  });
  assert.equal(retried.ok, true);
  assert.equal(retried.duplicate, true);
  assert.equal(h.rows('Submissions').length, 1);
  assert.equal(h.rows('AuditLog').filter(row => row.operationId === 'manager-submit-1').length, 1);
});

test('manager-assisted submission requires admin access and respects assignment', () => {
  const payload = { name:'QA Target', targetId:'100001', rawText:'spy data', formatted:'formatted' };
  const unauthorized = createHarness();
  unauthorized.append('Targets', target({ status:'open', claimedBy:'', assignedTo:'Employee B' }));
  const denied = unauthorized.request({
    action:'managerSubmit', key:'employee-key', id:'target-1', performedBy:'Employee B', payload, requestId:'manager-submit-denied',
  });
  assert.equal(denied.ok, false);
  assert.match(denied.error, /Admin key required/);
  assert.equal(unauthorized.rows('Submissions').length, 0);

  const mismatch = createHarness();
  mismatch.append('Targets', target({ status:'open', claimedBy:'', assignedTo:'Employee B' }));
  const conflicted = mismatch.request({
    action:'managerSubmit', key:'employee-key', admin:'admin-key', id:'target-1',
    performedBy:'Employee C', payload, requestId:'manager-submit-conflict',
  });
  assert.equal(conflicted.ok, false);
  assert.match(conflicted.error, /assigned to Employee B/);
  assert.equal(mismatch.rows('Submissions').length, 0);
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
