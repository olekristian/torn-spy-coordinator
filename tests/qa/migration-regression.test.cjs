const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./gas-harness.cjs');

const LEGACY_HEADERS = {
  Targets: [
    'id','targetName','targetId','level','notes','priority','status','claimedBy',
    'claimedAt','submittedAt','reviewStatus','assignedTo','assignedAt','orderId',
    'customer','pricePerSpy','employeeRate','customerPaymentStatus',
    'employeePayoutStatus','createdAt','updatedAt',
  ],
  Submissions: [
    'id','targetRowId','targetName','targetId','submittedBy','submittedAt',
    'rawText','level','strength','speed','dexterity','defense','total','formatted',
    'reviewStatus','reviewedBy','reviewedAt','warnings','updatedAt',
  ],
  AuditLog: ['timestamp','actor','action','targetId','details'],
};

function seedLegacySheet(harness, name, object) {
  const sheet = harness.spreadsheet.getSheetByName(name);
  const headers = LEGACY_HEADERS[name];
  sheet.data = [
    headers.slice(),
    headers.map(header => object[header] ?? ''),
  ];
}

test('schema ensure is additive and idempotent for representative legacy rows', () => {
  const h = createHarness();
  seedLegacySheet(h, 'Targets', {
    id: 'legacy-target',
    targetName: 'Legacy Target',
    targetId: '123456',
    status: 'open',
    priority: 'normal',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  });
  seedLegacySheet(h, 'Submissions', {
    id: 'legacy-submission',
    targetRowId: 'legacy-target',
    targetName: 'Legacy Target',
    targetId: '123456',
    submittedBy: 'Legacy Employee',
    submittedAt: '2025-01-02T00:00:00.000Z',
    rawText: 'legacy payload',
    reviewStatus: 'pending_review',
    updatedAt: '2025-01-02T00:00:00.000Z',
  });
  seedLegacySheet(h, 'AuditLog', {
    timestamp: '2025-01-03T00:00:00.000Z',
    actor: 'Legacy Employee',
    action: 'legacy_action',
    targetId: '123456',
    details: 'legacy details',
  });
  h.spreadsheet.sheets.delete('Outbox');

  const before = {
    Targets: h.spreadsheet.getSheetByName('Targets').data[1].slice(),
    Submissions: h.spreadsheet.getSheetByName('Submissions').data[1].slice(),
    AuditLog: h.spreadsheet.getSheetByName('AuditLog').data[1].slice(),
  };

  h.context.ensureSheets_();
  h.context.ensureSheets_();

  for (const [name, added] of Object.entries({
    Targets: ['claimedByTornId', 'version', 'lastOperationId'],
    Submissions: ['submittedByTornId', 'enteredBy', 'enteredByTornId', 'submissionMode', 'requestId', 'version', 'reviewOperationId'],
    AuditLog: ['operationId'],
  })) {
    const sheet = h.spreadsheet.getSheetByName(name);
    const headers = sheet.data[0];
    assert.deepEqual(headers.slice(0, LEGACY_HEADERS[name].length), LEGACY_HEADERS[name]);
    assert.deepEqual(headers.slice(LEGACY_HEADERS[name].length), added);
    assert.deepEqual(sheet.data[1].slice(0, before[name].length), before[name]);
    for (const header of added) {
      assert.equal(headers.filter(value => value === header).length, 1);
    }
  }

  const outbox = h.spreadsheet.getSheetByName('Outbox');
  assert.deepEqual(Array.from(outbox.data[0]), [
    'eventId','eventType','entityId','status','attempts','payload',
    'createdAt','updatedAt','sentAt','lastError',
  ]);
  assert.equal(outbox.data.length, 1);
});

test('legacy target without version remains usable after migration', () => {
  const h = createHarness();
  seedLegacySheet(h, 'Targets', {
    id: 'legacy-target',
    targetName: 'Legacy Target',
    targetId: '123456',
    status: 'open',
    priority: 'normal',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  });
  h.context.ensureSheets_();

  const claimed = h.request({
    action: 'claim',
    key: 'employee-key',
    id: 'legacy-target',
    requestId: 'phase5-legacy-claim',
  });

  assert.equal(claimed.ok, true);
  assert.equal(claimed.version, 2);
  const target = h.rows('Targets')[0];
  assert.equal(target.id, 'legacy-target');
  assert.equal(target.status, 'claimed');
  assert.equal(target.claimedBy, 'Employee A');
  assert.equal(target.lastOperationId, 'phase5-legacy-claim');
});

test('appends follow live header order after migration of the real legacy layout', () => {
  const h = createHarness();
  const actualLegacyTargetHeaders = [
    'id','targetName','targetId','notes','priority','status','claimedBy',
    'claimedAt','submittedAt','reviewStatus','assignedTo','assignedAt','orderId',
    'customer','pricePerSpy','employeeRate','customerPaymentStatus',
    'employeePayoutStatus','createdAt','updatedAt','level',
  ];
  const actualLegacyOrderHeaders = [
    'orderId','customer','requestedBy','orderedAt','targetCount','pricePerSpy',
    'totalPrice','paymentStatus','employeePayoutStatus','notes','createdAt',
    'updatedAt','newOrderNotifiedAt','newOrderNotificationStatus','completedAt',
    'completionNotifiedAt','completionNotificationStatus','orderStatus',
    'paymentRequired','paymentConfirmedAt','paymentConfirmedBy','paymentType',
    'deliveryMode','autoDeliver','customerDeliveryConfigured','deliveredAt',
    'deliveryStatus','deliveryError',
  ];
  h.spreadsheet.getSheetByName('Targets').data = [actualLegacyTargetHeaders.slice()];
  h.spreadsheet.getSheetByName('Orders').data = [actualLegacyOrderHeaders.slice()];
  h.context.ensureSheets_();

  assert.deepEqual(
    h.spreadsheet.getSheetByName('Orders').data[0].slice(-4),
    ['cancelledAt', 'cancelledBy', 'cancelReason', 'cancelOperationId'],
  );

  h.context.appendObject_('Targets', {
    id: 'phase5-target',
    targetName: 'Phase 5 Target',
    targetId: '987654',
    level: 77,
    notes: 'preserved notes',
    priority: 'high',
    status: 'open',
    orderId: '500',
    customer: 'Phase 5 Customer',
    pricePerSpy: 123,
    employeeRate: 45,
    createdAt: '2026-07-23T00:00:00.000Z',
    updatedAt: '2026-07-23T00:00:00.000Z',
    version: 1,
    lastOperationId: 'phase5-add',
  });
  h.context.appendObject_('Orders', {
    orderId: '500',
    customer: 'Phase 5 Customer',
    requestedBy: 'Phase 5 Manager',
    orderedAt: '2026-07-23T00:00:00.000Z',
    targetCount: 1,
    pricePerSpy: 123,
    totalPrice: 123,
    paymentStatus: 'unpaid',
    employeePayoutStatus: 'unpaid',
    notes: 'order notes',
    createdAt: '2026-07-23T00:00:00.000Z',
    updatedAt: '2026-07-23T00:00:00.000Z',
    orderStatus: 'awaiting_payment',
  });

  const target = h.rows('Targets')[0];
  assert.equal(target.level, 77);
  assert.equal(target.notes, 'preserved notes');
  assert.equal(target.priority, 'high');
  assert.equal(target.orderId, '500');
  assert.equal(String(target.version), '1');
  assert.equal(target.lastOperationId, 'phase5-add');

  const order = h.rows('Orders')[0];
  assert.equal(order.notes, 'order notes');
  assert.equal(order.createdAt, '2026-07-23T00:00:00.000Z');
  assert.equal(order.newOrderNotifiedAt, '');
  assert.equal(order.orderStatus, 'awaiting_payment');
});
