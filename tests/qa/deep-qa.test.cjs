const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./gas-harness.cjs');

function target(overrides = {}) {
  return {
    id: 'target-1', targetName: 'QA Target', targetId: '100001', level: 10,
    notes: '', priority: 'normal', status: 'open', claimedBy: '', claimedAt: '',
    submittedAt: '', reviewStatus: '', assignedTo: '', assignedAt: '', orderId: '',
    customer: '', pricePerSpy: 100, employeeRate: 100,
    customerPaymentStatus: 'unpaid', employeePayoutStatus: 'unpaid',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    version: 1, lastOperationId: '', ...overrides,
  };
}

function order(overrides = {}) {
  return {
    orderId: '100', customer: 'QA Customer', requestedBy: '',
    orderedAt: '2026-01-01T00:00:00.000Z', targetCount: 1, pricePerSpy: 100,
    totalPrice: 100, paymentStatus: 'unpaid', employeePayoutStatus: 'unpaid',
    newOrderNotifiedAt: '', newOrderNotificationStatus: '', completedAt: '',
    completionNotifiedAt: '', completionNotificationStatus: '',
    orderStatus: 'ready_for_work', paymentRequired: '', paymentConfirmedAt: '',
    paymentConfirmedBy: '', paymentType: 'money', deliveryMode: 'manual',
    autoDeliver: '', customerDeliveryConfigured: '', deliveredAt: '',
    deliveryStatus: '', deliveryError: '', notes: '',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function submissionInput(overrides = {}) {
  return {
    action: 'submit', key: 'employee-key', id: 'target-1', employee: 'spoof ignored',
    name: 'QA Target', targetId: '100001', requestId: 'submission-request-1',
    payload: {
      name: 'QA Target', targetId: '100001', level: 10, strength: 100, speed: 200,
      dexterity: 300, defense: 400, total: 1000, rawText: 'qa result',
      formatted: 'QA formatted',
    },
    ...overrides,
  };
}

function paymentInput(overrides = {}) {
  return {
    admin: 'admin-key', orderId: '100', customer: 'QA Customer', amount: 60,
    status: 'partial', requestId: 'payment-request-1', employee: 'spoof ignored',
    ...overrides,
  };
}

function payoutInput(overrides = {}) {
  return {
    admin: 'admin-key', targetRowId: 'target-1', targetId: '100001',
    submissionId: 'sub-1', employeeName: 'Employee A', amount: 60, status: 'paid',
    requestId: 'payout-request-1', employee: 'spoof ignored', ...overrides,
  };
}

test('claim race yields one success, one conflict, one owner and one audit', () => {
  const h = createHarness();
  h.append('Targets', target());
  let b;
  let interleaved = false;
  h.setHook(event => {
    if (!interleaved && event.op === 'getValues' && event.sheet === 'Targets' &&
        event.phase === 'afterSnapshot' && event.row === 2 && event.numColumns > 1) {
      interleaved = true;
      b = h.request({ action:'claim', key:'employee-b-key', id:'target-1', employee:'Employee A', requestId:'claim-b' });
    }
  });
  const a = h.request({ action:'claim', key:'employee-key', id:'target-1', employee:'Employee B', requestId:'claim-a' });
  h.clearHook();
  assert.equal(a.ok, true);
  assert.equal(b.ok, false);
  assert.match(b.error, /Conflict/);
  assert.equal(h.rows('Targets')[0].claimedBy, 'Employee A');
  assert.equal(h.rows('AuditLog').filter(row => row.action === 'target_claimed').length, 1);
});

test('owner can unclaim while another employee cannot spoof ownership', () => {
  const h = createHarness();
  h.append('Targets', target({ status:'claimed', claimedBy:'Employee A' }));
  const denied = h.request({ action:'unclaim', key:'employee-b-key', id:'target-1', employee:'Employee A', requestId:'unclaim-b' });
  assert.equal(denied.ok, false);
  assert.equal(h.rows('AuditLog').length, 0);
  const allowed = h.request({ action:'unclaim', key:'employee-key', id:'target-1', employee:'Employee B', requestId:'unclaim-a' });
  assert.equal(allowed.ok, true);
  assert.equal(h.rows('Targets')[0].status, 'open');
});

test('non-owner submit is forbidden without submission or audit side effects', () => {
  const h = createHarness();
  h.append('Targets', target({ status:'claimed', claimedBy:'Employee B' }));
  const response = h.request(submissionInput());
  assert.equal(response.ok, false);
  assert.match(response.error, /Forbidden/);
  assert.equal(h.rows('Submissions').length, 0);
  assert.equal(h.rows('AuditLog').length, 0);
});

test('sequential submission retry returns the same canonical submission', () => {
  const h = createHarness();
  h.append('Targets', target({ status:'claimed', claimedBy:'Employee A' }));
  const first = h.request(submissionInput());
  const second = h.request(submissionInput());
  assert.equal(first.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(second.submissionId, first.submissionId);
  assert.equal(h.rows('Submissions').length, 1);
  assert.equal(h.rows('AuditLog').filter(row => row.action === 'spy_submitted').length, 1);
});

test('reusing a submission request ID with changed payload is a conflict', () => {
  const h = createHarness();
  h.append('Targets', target({ status:'claimed', claimedBy:'Employee A' }));
  h.request(submissionInput());
  const changed = h.request(submissionInput({
    payload:{ ...submissionInput().payload, strength:999 },
  }));
  assert.equal(changed.ok, false);
  assert.match(changed.error, /Conflict/);
  assert.equal(h.rows('Submissions').length, 1);
});

test('parallel submission retry conflicts while locked and then replays safely', () => {
  const h = createHarness();
  h.append('Targets', target({ status:'claimed', claimedBy:'Employee A' }));
  let b;
  let interleaved = false;
  h.setHook(event => {
    if (!interleaved && event.op === 'getValues' && event.sheet === 'Targets' &&
        event.row === 2 && event.numColumns > 1) {
      interleaved = true;
      b = h.request(submissionInput());
    }
  });
  const a = h.request(submissionInput());
  h.clearHook();
  assert.equal(a.ok, true);
  assert.equal(b.ok, false);
  assert.match(b.error, /Conflict/);
  const replay = h.request(submissionInput());
  assert.equal(replay.duplicate, true);
  assert.equal(h.rows('Submissions').length, 1);
});

test('submission append failure is reconciled by same-request retry', () => {
  const h = createHarness();
  h.append('Targets', target({ status:'claimed', claimedBy:'Employee A' }));
  let appended = false;
  let failed = false;
  h.setHook(event => {
    if (event.op === 'appendRow' && event.phase === 'after' && event.sheet === 'Submissions') appended = true;
    if (appended && !failed && event.op === 'setValues' && event.sheet === 'Targets') {
      failed = true;
      throw new Error('Injected target failure');
    }
  });
  const first = h.request(submissionInput());
  h.clearHook();
  assert.equal(first.ok, false);
  assert.equal(h.rows('Submissions').length, 1);
  const retry = h.request(submissionInput());
  assert.equal(retry.duplicate, true);
  assert.equal(h.rows('Submissions').length, 1);
  assert.equal(h.rows('Targets')[0].status, 'submitted');
  assert.equal(h.rows('AuditLog').filter(row => row.action === 'spy_submitted').length, 1);
});

test('stale review version conflicts and preserves newer status and payload', () => {
  const h = createHarness();
  h.append('Targets', target({ status:'submitted', reviewStatus:'pending_review' }));
  h.append('Submissions', {
    id:'sub-1', targetRowId:'target-1', targetName:'QA Target', targetId:'100001',
    submittedBy:'Employee A', submittedAt:'2026-01-01T00:00:00.000Z', rawText:'original',
    strength:100, speed:200, dexterity:300, defense:400, total:1000,
    formatted:'original', reviewStatus:'pending_review', updatedAt:'2026-01-01T00:00:00.000Z',
    requestId:'submit-1', version:1,
  });
  const approved = h.context.reviewSubmission_({
    admin:'admin-key', targetRowId:'target-1', submissionId:'sub-1', expectedVersion:1,
    requestId:'review-approved-v1', status:'approved', payload:{ strength:111, formatted:'newer' },
  });
  assert.equal(approved.version, 2);
  assert.throws(() => h.context.reviewSubmission_({
    admin:'admin-key', targetRowId:'target-1', submissionId:'sub-1', expectedVersion:1,
    requestId:'review-stale-v1', status:'pending_review', payload:{ strength:99, formatted:'stale' },
  }), /Conflict/);
  assert.equal(h.rows('Submissions')[0].reviewStatus, 'approved');
  assert.equal(h.rows('Submissions')[0].strength, 111);
});

test('review retry reconciles target after submission-write success and target-write failure', () => {
  const h = createHarness();
  h.append('Targets', target({ status:'submitted', reviewStatus:'pending_review' }));
  h.append('Submissions', {
    id:'sub-1', targetRowId:'target-1', targetName:'QA Target', targetId:'100001',
    submittedBy:'Employee A', submittedAt:'2026-01-01T00:00:00.000Z',
    reviewStatus:'pending_review', requestId:'submit-1', version:1,
  });
  const input = {
    admin:'admin-key', targetRowId:'target-1', submissionId:'sub-1',
    expectedVersion:1, requestId:'review-recovery', status:'approved',
  };
  let reviewWritten = false;
  let failed = false;
  h.setHook(event => {
    if (event.op === 'setValue' && event.phase === 'after' && event.sheet === 'Submissions' &&
        event.header === 'reviewOperationId') reviewWritten = true;
    if (reviewWritten && !failed && event.op === 'setValues' && event.sheet === 'Targets') {
      failed = true;
      throw new Error('Injected review target failure');
    }
  });
  assert.throws(() => h.context.reviewSubmission_(input), /Injected/);
  h.clearHook();
  const retry = h.context.reviewSubmission_(input);
  assert.equal(retry.duplicate, true);
  assert.equal(h.rows('Targets')[0].reviewStatus, 'approved');
  assert.equal(h.rows('AuditLog').filter(row => row.operationId === 'review-recovery').length, 1);
});

test('customer payment same request is sequentially idempotent', () => {
  const h = createHarness();
  h.append('Orders', order());
  const first = h.context.recordCustomerPayment_(paymentInput());
  const second = h.context.recordCustomerPayment_(paymentInput());
  assert.equal(first.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(h.rows('CustomerPayments').length, 1);
});

test('parallel payment conflicts while locked and retry cannot double totals', () => {
  const h = createHarness();
  h.append('Orders', order());
  let bError;
  let interleaved = false;
  h.setHook(event => {
    if (!interleaved && event.op === 'getValues' && event.sheet === 'CustomerPayments') {
      interleaved = true;
      try { h.context.recordCustomerPayment_(paymentInput()); } catch (error) { bError = error; }
    }
  });
  h.context.recordCustomerPayment_(paymentInput());
  h.clearHook();
  assert.match(String(bError && bError.message), /Conflict/);
  const replay = h.context.recordCustomerPayment_(paymentInput());
  assert.equal(replay.duplicate, true);
  assert.equal(h.rows('CustomerPayments').length, 1);
  assert.equal(h.rows('Orders')[0].paymentStatus, 'partial');
});

test('payment retry reconciles order and audit after append-before-recalc failure', () => {
  const h = createHarness();
  h.append('Orders', order());
  const input = paymentInput({ amount:100, status:'paid', requestId:'payment-recovery' });
  let failed = false;
  h.setHook(event => {
    if (!failed && event.op === 'setValue' && event.sheet === 'Orders') {
      failed = true;
      throw new Error('Injected order failure');
    }
  });
  assert.throws(() => h.context.recordCustomerPayment_(input), /Injected/);
  h.clearHook();
  const retry = h.context.recordCustomerPayment_(input);
  assert.equal(retry.duplicate, true);
  assert.equal(h.rows('Orders')[0].paymentStatus, 'paid');
  assert.equal(h.rows('AuditLog').filter(row => row.operationId === 'payment-recovery').length, 1);
});

test('customer overpayment is rejected without a ledger write', () => {
  const h = createHarness();
  h.append('Orders', order());
  assert.throws(() => h.context.recordCustomerPayment_(paymentInput({ amount:101 })), /exceed/);
  assert.equal(h.rows('CustomerPayments').length, 0);
});

test('payout retries reconcile target mirror and do not duplicate', () => {
  const h = createHarness();
  h.append('Targets', target({ employeeRate:100 }));
  const input = payoutInput({ amount:100, requestId:'payout-recovery' });
  let appended = false;
  let failed = false;
  h.setHook(event => {
    if (event.op === 'appendRow' && event.phase === 'after' && event.sheet === 'EmployeePayouts') appended = true;
    if (appended && !failed && event.op === 'setValues' && event.sheet === 'Targets') {
      failed = true;
      throw new Error('Injected payout mirror failure');
    }
  });
  assert.throws(() => h.context.recordEmployeePayout_(input), /Injected/);
  h.clearHook();
  const retry = h.context.recordEmployeePayout_(input);
  assert.equal(retry.duplicate, true);
  assert.equal(h.rows('EmployeePayouts').length, 1);
  assert.equal(h.rows('Targets')[0].employeePayoutStatus, 'paid');
  assert.equal(h.rows('AuditLog').filter(row => row.operationId === 'payout-recovery').length, 1);
});

test('same work cannot be overpaid using a different payout request ID', () => {
  const h = createHarness();
  h.append('Targets', target({ employeeRate:100 }));
  h.context.recordEmployeePayout_(payoutInput({ amount:60, requestId:'payout-a' }));
  assert.throws(() => h.context.recordEmployeePayout_(payoutInput({ amount:60, requestId:'payout-b' })), /exceed/);
  assert.equal(h.rows('EmployeePayouts').length, 1);
});

test('parallel payout request conflicts while locked and replays as one payout', () => {
  const h = createHarness();
  h.append('Targets', target({ employeeRate:100 }));
  let bError;
  let interleaved = false;
  h.setHook(event => {
    if (!interleaved && event.op === 'getValues' && event.sheet === 'EmployeePayouts') {
      interleaved = true;
      try { h.context.recordEmployeePayout_(payoutInput()); } catch (error) { bError = error; }
    }
  });
  h.context.recordEmployeePayout_(payoutInput());
  h.clearHook();
  assert.match(String(bError && bError.message), /Conflict/);
  const retry = h.context.recordEmployeePayout_(payoutInput());
  assert.equal(retry.duplicate, true);
  assert.equal(h.rows('EmployeePayouts').length, 1);
});

test('parallel order allocation conflicts then retry allocates a unique ID', () => {
  const h = createHarness();
  h.append('Orders', order({ orderId:'2' }));
  let bError;
  let interleaved = false;
  const aInput = { admin:'admin-key', requestId:'add-a', targetName:'A', targetId:'1', customer:'A' };
  const bInput = { admin:'admin-key', requestId:'add-b', targetName:'B', targetId:'2', customer:'B' };
  h.setHook(event => {
    if (!interleaved && event.op === 'getValues' && event.sheet === 'Orders') {
      interleaved = true;
      try { h.context.addTarget_(bInput); } catch (error) { bError = error; }
    }
  });
  const a = h.context.addTarget_(aInput);
  h.clearHook();
  assert.match(String(bError && bError.message), /Conflict/);
  const b = h.context.addTarget_(bInput);
  assert.notEqual(a.orderId, b.orderId);
  assert.deepEqual(h.rows('Targets').map(row => row.customer).sort(), ['A','B']);
});

test('add retry repairs append-before-order failure without duplicate target', () => {
  const h = createHarness();
  const input = { admin:'admin-key', requestId:'add-recovery', targetName:'A', targetId:'1', customer:'A' };
  let failed = false;
  h.setHook(event => {
    if (!failed && event.op === 'appendRow' && event.phase === 'before' && event.sheet === 'Orders') {
      failed = true;
      throw new Error('Injected order append failure');
    }
  });
  assert.throws(() => h.context.addTarget_(input), /Injected/);
  h.clearHook();
  const retry = h.context.addTarget_(input);
  assert.equal(retry.duplicate, true);
  assert.equal(h.rows('Targets').length, 1);
  assert.equal(h.rows('Orders').length, 1);
  assert.equal(h.rows('AuditLog').filter(row => row.operationId === 'add-recovery').length, 1);
});

test('price retry converges all target rows after partial failure', () => {
  const h = createHarness();
  h.append('Orders', order());
  h.append('Targets', target({ id:'target-1', orderId:'100', pricePerSpy:10 }));
  h.append('Targets', target({ id:'target-2', targetId:'100002', orderId:'100', pricePerSpy:10 }));
  let writes = 0;
  h.setHook(event => {
    if (event.op === 'setValue' && event.phase === 'before' && event.sheet === 'Targets' &&
        event.header === 'pricePerSpy' && ++writes === 2) throw new Error('Injected second target failure');
  });
  const input = { admin:'admin-key', orderId:'100', amount:50, mode:'perSpy', requestId:'price-recovery' };
  assert.throws(() => h.context.setOrderPrice_(input), /Injected/);
  h.clearHook();
  h.context.setOrderPrice_(input);
  assert.deepEqual(h.rows('Targets').map(row => row.pricePerSpy), [50,50]);
  assert.equal(h.rows('Orders')[0].totalPrice, 100);
});

test('failed target write does not produce claim success audit', () => {
  const h = createHarness();
  h.append('Targets', target());
  h.setHook(event => {
    if (event.op === 'setValues' && event.phase === 'before' && event.sheet === 'Targets') {
      throw new Error('Injected target write failure');
    }
  });
  const response = h.request({ action:'claim', key:'employee-key', id:'target-1', requestId:'claim-failure' });
  h.clearHook();
  assert.equal(response.ok, false);
  assert.equal(h.rows('AuditLog').length, 0);
});

test('claim retry repairs audit after canonical target commit', () => {
  const h = createHarness();
  h.append('Targets', target());
  let targetCommitted = false;
  let failed = false;
  h.setHook(event => {
    if (event.op === 'setValues' && event.phase === 'after' && event.sheet === 'Targets') {
      targetCommitted = true;
    }
    if (targetCommitted && !failed && event.op === 'appendRow' &&
        event.phase === 'before' && event.sheet === 'AuditLog') {
      failed = true;
      throw new Error('Injected audit failure');
    }
  });
  const input = { action:'claim', key:'employee-key', id:'target-1', requestId:'claim-recovery' };
  const first = h.request(input);
  h.clearHook();
  assert.equal(first.ok, false);
  assert.equal(h.rows('Targets')[0].claimedBy, 'Employee A');
  const retry = h.request(input);
  assert.equal(retry.duplicate, true);
  assert.equal(h.rows('AuditLog').filter(row => row.operationId === 'claim-recovery').length, 1);
});

test('parallel new-order notifications create one outbox event and one send', () => {
  const h = createHarness({ properties:{ EMPLOYEE_DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/test/token' } });
  h.append('Orders', order());
  h.append('Targets', target({ orderId:'100', customer:'QA Customer' }));
  let b;
  let interleaved = false;
  h.setHook(event => {
    if (!interleaved && event.op === 'urlFetch' && event.phase === 'before') {
      interleaved = true;
      b = h.context.sendNewOrderNotification_({ admin:'admin-key', orderId:'100' });
    }
  });
  const a = h.context.sendNewOrderNotification_({ admin:'admin-key', orderId:'100' });
  h.clearHook();
  assert.equal(a.notified, true);
  assert.equal(b.notified, false);
  assert.equal(b.status, 'sending');
  assert.equal(h.env.sends.length, 1);
  assert.equal(h.rows('Outbox').length, 1);
  assert.equal(h.rows('Outbox')[0].status, 'sent');
});

test('delivery send success plus order mark failure retries without resending', () => {
  const h = createHarness({ properties:{ CUSTOMER_DISCORD_WEBHOOK_URL_100:'https://discord.com/api/webhooks/test/customer' } });
  h.append('Orders', order({ completedAt:'2026-01-01T00:00:00.000Z', orderStatus:'ready_to_deliver' }));
  h.append('Targets', target({ orderId:'100', customer:'QA Customer', status:'submitted', reviewStatus:'approved' }));
  h.append('Submissions', {
    id:'sub-1', targetRowId:'target-1', targetName:'QA Target', targetId:'100001',
    submittedBy:'Employee A', submittedAt:'2026-01-01T00:00:00.000Z',
    formatted:'QA formatted', reviewStatus:'approved', requestId:'submit-1', version:2,
  });
  let sent = false;
  let failed = false;
  h.setHook(event => {
    if (event.op === 'urlFetch' && event.phase === 'after') sent = true;
    if (sent && !failed && event.op === 'setValue' && event.sheet === 'Orders' && event.header === 'orderStatus') {
      failed = true;
      throw new Error('Injected delivered mark failure');
    }
  });
  assert.throws(() => h.context.sendCustomerDelivery_({ admin:'admin-key', orderId:'100' }), /Injected/);
  h.clearHook();
  const retry = h.context.sendCustomerDelivery_({ admin:'admin-key', orderId:'100' });
  assert.equal(retry.delivered, true);
  assert.equal(h.env.sends.length, 1);
  assert.equal(h.rows('Orders')[0].orderStatus, 'delivered');
});

test('ambiguous provider failure is durable unknown and is not blindly retried', () => {
  let attempts = 0;
  const h = createHarness({
    properties:{ EMPLOYEE_DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/test/token' },
    urlFetchResponse() {
      attempts += 1;
      throw new Error('provider timeout');
    },
  });
  h.append('Orders', order());
  h.append('Targets', target({ orderId:'100', customer:'QA Customer' }));
  assert.throws(() => h.context.sendNewOrderNotification_({ admin:'admin-key', orderId:'100' }), /timeout/);
  const retry = h.context.sendNewOrderNotification_({ admin:'admin-key', orderId:'100' });
  assert.equal(retry.status, 'unknown');
  assert.equal(attempts, 1);
  assert.equal(h.rows('Outbox')[0].status, 'unknown');
});

test('unknown outbox event requires explicit operator confirmation before retry', () => {
  let fail = true;
  const h = createHarness({
    properties:{ EMPLOYEE_DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/test/token' },
    urlFetchResponse() {
      if (fail) throw new Error('provider timeout');
      return { code:204, body:'', headers:{} };
    },
  });
  h.append('Orders', order());
  h.append('Targets', target({ orderId:'100', customer:'QA Customer' }));
  assert.throws(() => h.context.sendNewOrderNotification_({ admin:'admin-key', orderId:'100' }), /timeout/);
  assert.throws(() => h.context.retryOutboxEvent_({
    admin:'admin-key', eventId:'new_order:100',
  }), /confirmUnknown/);
  fail = false;
  const retried = h.context.retryOutboxEvent_({
    admin:'admin-key', eventId:'new_order:100', confirmUnknown:true,
  });
  assert.equal(retried.sent, true);
  assert.equal(h.rows('Outbox')[0].status, 'sent');
  assert.equal(h.rows('Orders')[0].newOrderNotificationStatus, 'sent');
});

test('manager completion notification uses one durable outbox event', () => {
  const h = createHarness({
    properties:{ MANAGER_DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/test/manager' },
  });
  h.append('Orders', order({ completedAt:'2026-01-01T00:00:00.000Z', orderStatus:'ready_to_deliver' }));
  h.append('Targets', target({
    orderId:'100', customer:'QA Customer', status:'submitted', reviewStatus:'approved',
  }));
  const first = h.context.sendOrderCompleteNotification_({ admin:'admin-key', orderId:'100' });
  const second = h.context.sendOrderCompleteNotification_({ admin:'admin-key', orderId:'100' });
  assert.equal(first.notified, true);
  assert.equal(second.skipped, true);
  assert.equal(h.env.sends.length, 1);
  assert.equal(h.rows('Outbox').filter(row => row.eventType === 'order_completion').length, 1);
});

test('formula-like values are neutralized and Discord mentions are disabled', () => {
  const h = createHarness();
  h.append('Targets', target({ targetName:'=1+1', notes:'+1', customer:'@everyone' }));
  assert.equal(h.rows('Targets')[0].targetName, "'=1+1");
  h.context.postDiscord_('https://discord.com/api/webhooks/test/token', '@everyone <@123>');
  const payload = JSON.parse(h.env.sends[0].request.payload);
  assert.deepEqual(JSON.parse(JSON.stringify(payload.allowed_mentions)), { parse:[], users:[], roles:[] });
});
