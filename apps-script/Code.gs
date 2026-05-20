function _props(){ return PropertiesService.getScriptProperties(); }
function _apiKey(){ return _props().getProperty('API_KEY') || ''; }
function _adminKey(){ return _props().getProperty('ADMIN_KEY') || ''; }

const SHEETS = {
  targets: 'Targets',
  submissions: 'Submissions',
  orders: 'Orders',
  customers: 'Customers',
  employees: 'Employees',
  customerPayments: 'CustomerPayments',
  employeePayouts: 'EmployeePayouts',
  auditLog: 'AuditLog',
  deliveryHistory: 'DeliveryHistory',
};

const HEADERS = {
  Targets: ['id','targetName','targetId','notes','priority','status','claimedBy','claimedAt','submittedAt','reviewStatus','assignedTo','assignedAt','orderId','customer','pricePerSpy','employeeRate','customerPaymentStatus','employeePayoutStatus','createdAt','updatedAt'],
  Submissions: ['id','targetRowId','targetName','targetId','submittedBy','submittedAt','rawText','level','strength','speed','dexterity','defense','total','formatted','reviewStatus','reviewedBy','reviewedAt','warnings','updatedAt'],
  Orders: ['orderId','customer','requestedBy','orderedAt','targetCount','pricePerSpy','totalPrice','paymentStatus','employeePayoutStatus','notes','createdAt','updatedAt'],
  Customers: ['customer','contact','notes','createdAt','updatedAt'],
  Employees: ['displayName','payoutHandle','defaultRate','notes','createdAt','updatedAt'],
  CustomerPayments: ['id','orderId','customer','amount','status','reference','note','recordedBy','recordedAt'],
  EmployeePayouts: ['id','submissionId','targetRowId','employee','targetId','amount','status','reference','note','recordedBy','recordedAt'],
  AuditLog: ['timestamp','actor','action','targetId','details'],
  DeliveryHistory: ['id','orderId','customer','targetName','targetId','deliveredBy','submittedAt','reviewStatus','level','formatted','rawText','archivedBy','archivedAt','notes'],
};

function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function handleRequest(e, method) {
  let input = {};
  try {
    ensureSheets_();
    input = getInput_(e, method);
    validateAccess_(input);
    const action = input.action || (e.parameter && e.parameter.action) || 'list';
    const result = dispatch_(action, input);
    return json_(result, input);
  } catch (err) {
    return json_({ ok:false, error:String(err && err.message || err) }, input);
  }
}

function dispatch_(action, input) {
  if (action === 'list') return list_();
  if (action === 'add') return addTarget_(input);
  if (action === 'bulkAdd') return bulkAddTargets_(input);
  if (action === 'claim') return claimTarget_(input);
  if (action === 'unclaim') return unclaimTarget_(input);
  if (action === 'submit') return submitSpy_(input);
  if (action === 'review') return reviewSubmission_(input);
  if (action === 'assign') return assignTarget_(input);
  if (action === 'customerPayment') return recordCustomerPayment_(input);
  if (action === 'employeePayout') return recordEmployeePayout_(input);
  if (action === 'history') return archiveHistory_(input);
  if (action === 'audit') return addAudit_(input.actor || input.employee || 'system', input.auditAction || 'audit', input.targetId || '', input.details || '');
  throw new Error('Unknown action: ' + action);
}

function list_() {
  const targets = readObjects_(SHEETS.targets).map(row => ({
    id: row.id,
    targetName: row.targetName,
    targetId: row.targetId,
    notes: row.notes,
    priority: row.priority || 'normal',
    status: row.status || 'open',
    claimedBy: row.claimedBy,
    claimedAt: row.claimedAt,
    submittedAt: row.submittedAt,
    reviewStatus: row.reviewStatus || 'pending_review',
    assignedTo: row.assignedTo,
    assignedAt: row.assignedAt,
    orderId: row.orderId,
    customer: row.customer,
    pricePerSpy: num_(row.pricePerSpy),
    employeeRate: num_(row.employeeRate),
    customerPaymentStatus: row.customerPaymentStatus || 'unpaid',
    employeePayoutStatus: row.employeePayoutStatus || 'unpaid',
    payload: latestPayloadForTarget_(row.id),
  }));
  return {
    ok: true,
    tasks: targets,
    orders: readObjects_(SHEETS.orders),
    customerPayments: readObjects_(SHEETS.customerPayments),
    employeePayouts: readObjects_(SHEETS.employeePayouts),
    deliveryHistory: readObjects_(SHEETS.deliveryHistory),
  };
}

function addTarget_(input) {
  const id = uid_('target');
  const now = now_();
  const row = {
    id,
    targetName: input.targetName || input.name || '',
    targetId: input.targetId || '',
    notes: input.notes || '',
    priority: input.priority || 'normal',
    status: 'open',
    claimedBy: '',
    claimedAt: '',
    submittedAt: '',
    reviewStatus: '',
    assignedTo: input.assignedTo || '',
    assignedAt: input.assignedTo ? now : '',
    orderId: input.orderId || '',
    customer: input.customer || '',
    pricePerSpy: input.pricePerSpy || '',
    employeeRate: input.employeeRate || '',
    customerPaymentStatus: input.customerPaymentStatus || 'unpaid',
    employeePayoutStatus: input.employeePayoutStatus || 'unpaid',
    createdAt: now,
    updatedAt: now,
  };
  appendObject_(SHEETS.targets, row);
  upsertOrderFromTarget_(row);
  addAudit_(input.employee || input.actor || '', 'target_added', row.targetId, row.targetName);
  return { ok:true, id };
}

function bulkAddTargets_(input) {
  const items = Array.isArray(input.targets) ? input.targets : [];
  if (!items.length) return { ok:true, added:0, ids:[] };
  const now = now_();
  const ids = [];
  const rows = items.map(item => {
    const id = uid_('target');
    ids.push(id);
    return {
      id,
      targetName: item.targetName || item.name || '',
      targetId: item.targetId || '',
      notes: item.notes || '',
      priority: item.priority || 'normal',
      status: 'open',
      claimedBy: '',
      claimedAt: '',
      submittedAt: '',
      reviewStatus: '',
      assignedTo: item.assignedTo || '',
      assignedAt: item.assignedTo ? now : '',
      orderId: item.orderId || '',
      customer: item.customer || '',
      pricePerSpy: item.pricePerSpy || '',
      employeeRate: item.employeeRate || '',
      customerPaymentStatus: item.customerPaymentStatus || 'unpaid',
      employeePayoutStatus: item.employeePayoutStatus || 'unpaid',
      createdAt: now,
      updatedAt: now,
    };
  });
  appendObjects_(SHEETS.targets, rows);
  rows.forEach(row => {
    upsertOrderFromTarget_(row);
    addAudit_(input.employee || input.actor || '', 'target_added', row.targetId, row.targetName);
  });
  return { ok:true, added:rows.length, ids };
}

function claimTarget_(input) {
  updateTarget_(input.id, row => {
    row.status = 'claimed';
    row.claimedBy = input.employee || '';
    row.claimedAt = now_();
    row.assignedTo = '';
    row.assignedAt = '';
    row.updatedAt = now_();
    addAudit_(input.employee || '', 'target_claimed', row.targetId, row.targetName);
    return row;
  });
  return { ok:true };
}

function unclaimTarget_(input) {
  updateTarget_(input.id, row => {
    row.status = 'open';
    row.claimedBy = '';
    row.claimedAt = '';
    row.updatedAt = now_();
    addAudit_(input.employee || '', 'target_released', row.targetId, row.targetName);
    return row;
  });
  return { ok:true };
}

function submitSpy_(input) {
  const payload = input.payload || {};
  const now = now_();
  const target = getTargetById_(input.id);
  const submissionId = uid_('sub');
  appendObject_(SHEETS.submissions, {
    id: submissionId,
    targetRowId: input.id,
    targetName: input.name || target.targetName || payload.name || '',
    targetId: input.targetId || target.targetId || payload.targetId || '',
    submittedBy: input.employee || '',
    submittedAt: now,
    rawText: payload.rawText || input.rawText || '',
    level: payload.level || '',
    strength: payload.strength || '',
    speed: payload.speed || '',
    dexterity: payload.dexterity || '',
    defense: payload.defense || '',
    total: payload.total || '',
    formatted: payload.formatted || '',
    reviewStatus: 'pending_review',
    reviewedBy: '',
    reviewedAt: '',
    warnings: (payload.warnings || []).join ? payload.warnings.join(' | ') : (payload.warnings || ''),
    updatedAt: now,
  });
  updateTarget_(input.id, row => {
    row.status = 'submitted';
    row.submittedAt = now;
    row.reviewStatus = 'pending_review';
    row.updatedAt = now;
    return row;
  });
  addAudit_(input.employee || '', 'spy_submitted', input.targetId || target.targetId || '', input.name || target.targetName || '');
  return { ok:true, submissionId };
}

function reviewSubmission_(input) {
  requireAdmin_(input);
  const status = input.status || 'pending_review';
  const target = getTargetById_(input.targetRowId || input.id);
  const submissions = sheet_(SHEETS.submissions);
  const rows = readObjectsWithRows_(SHEETS.submissions);
  const row = rows.reverse().find(r => String(r.targetRowId) === String(target.id));
  if (!row) throw new Error('Submission not found for target.');
  const updates = {
    reviewStatus: status,
    reviewedBy: input.employee || input.actor || 'manager',
    reviewedAt: now_(),
    updatedAt: now_(),
  };
  if (input.payload) {
    ['level','strength','speed','dexterity','defense','total','formatted'].forEach(k => {
      if (input.payload[k] != null) updates[k] = input.payload[k];
    });
  }
  writeObjectAtRow_(submissions, row._row, updates);
  updateTarget_(target.id, t => {
    t.reviewStatus = status;
    t.updatedAt = now_();
    return t;
  });
  addAudit_(input.employee || 'manager', 'manager_' + status, target.targetId, target.targetName);
  return { ok:true };
}

function assignTarget_(input) {
  requireAdmin_(input);
  updateTarget_(input.id, row => {
    row.assignedTo = input.assignedTo || input.employeeName || '';
    row.assignedAt = now_();
    row.updatedAt = now_();
    addAudit_(input.employee || 'manager', 'manager_assigned_target', row.targetId, row.assignedTo);
    return row;
  });
  return { ok:true };
}

function recordCustomerPayment_(input) {
  requireAdmin_(input);
  appendObject_(SHEETS.customerPayments, {
    id: uid_('custpay'),
    orderId: input.orderId || '',
    customer: input.customer || '',
    amount: input.amount || '',
    status: input.status || 'paid',
    reference: input.reference || '',
    note: input.note || '',
    recordedBy: input.employee || 'manager',
    recordedAt: now_(),
  });
  updateOrderPayment_(input.orderId, input.status || 'paid');
  addAudit_(input.employee || 'manager', 'customer_payment_' + (input.status || 'paid'), input.orderId || '', input.customer || '');
  return { ok:true };
}

function recordEmployeePayout_(input) {
  requireAdmin_(input);
  appendObject_(SHEETS.employeePayouts, {
    id: uid_('emppay'),
    submissionId: input.submissionId || '',
    targetRowId: input.targetRowId || '',
    employee: input.employeeName || input.employee || '',
    targetId: input.targetId || '',
    amount: input.amount || '',
    status: input.status || 'paid',
    reference: input.reference || '',
    note: input.note || '',
    recordedBy: input.recordedBy || input.employee || 'manager',
    recordedAt: now_(),
  });
  if (input.targetRowId) {
    updateTarget_(input.targetRowId, row => {
      row.employeePayoutStatus = input.status || 'paid';
      row.updatedAt = now_();
      return row;
    });
  }
  addAudit_(input.employee || 'manager', 'employee_payout_' + (input.status || 'paid'), input.targetId || '', input.employeeName || '');
  return { ok:true };
}

function archiveHistory_(input) {
  requireAdmin_(input);
  const entry = input.entry || input;
  appendObject_(SHEETS.deliveryHistory, {
    id: entry.id || uid_('history'),
    orderId: entry.order || entry.orderId || '',
    customer: entry.customer || '',
    targetName: entry.targetName || '',
    targetId: entry.targetId || '',
    deliveredBy: entry.deliveredBy || '',
    submittedAt: entry.submittedAt || '',
    reviewStatus: entry.reviewStatus || '',
    level: entry.level || '',
    formatted: entry.formatted || '',
    rawText: entry.rawText || '',
    archivedBy: input.employee || entry.archivedBy || 'manager',
    archivedAt: now_(),
    notes: entry.notes || '',
  });
  addAudit_(input.employee || 'manager', 'delivery_archived', entry.targetId || '', entry.customer || '');
  return { ok:true };
}

function latestPayloadForTarget_(targetRowId) {
  const rows = readObjects_(SHEETS.submissions).filter(r => String(r.targetRowId) === String(targetRowId));
  if (!rows.length) return null;
  const r = rows[rows.length - 1];
  return {
    name: r.targetName,
    targetId: r.targetId,
    level: numOrBlank_(r.level),
    strength: numOrBlank_(r.strength),
    speed: numOrBlank_(r.speed),
    dexterity: numOrBlank_(r.dexterity),
    defense: numOrBlank_(r.defense),
    total: numOrBlank_(r.total),
    rawText: r.rawText,
    formatted: r.formatted,
  };
}

function upsertOrderFromTarget_(target) {
  if (!target.orderId) return;
  const rows = readObjectsWithRows_(SHEETS.orders);
  const existing = rows.find(r => String(r.orderId) === String(target.orderId));
  const now = now_();
  if (!existing) {
    appendObject_(SHEETS.orders, {
      orderId: target.orderId,
      customer: target.customer || '',
      requestedBy: '',
      orderedAt: now,
      targetCount: 1,
      pricePerSpy: target.pricePerSpy || '',
      totalPrice: target.pricePerSpy || '',
      paymentStatus: target.customerPaymentStatus || 'unpaid',
      employeePayoutStatus: target.employeePayoutStatus || 'unpaid',
      notes: '',
      createdAt: now,
      updatedAt: now,
    });
    return;
  }
  const targets = readObjects_(SHEETS.targets).filter(r => String(r.orderId) === String(target.orderId));
  writeObjectAtRow_(sheet_(SHEETS.orders), existing._row, {
    targetCount: targets.length,
    totalPrice: targets.reduce((sum, row) => sum + num_(row.pricePerSpy), 0),
    updatedAt: now,
  });
}

function updateOrderPayment_(orderId, status) {
  if (!orderId) return;
  const row = readObjectsWithRows_(SHEETS.orders).find(r => String(r.orderId) === String(orderId));
  if (row) writeObjectAtRow_(sheet_(SHEETS.orders), row._row, { paymentStatus: status, updatedAt: now_() });
}

function updateTarget_(id, updater) {
  const rows = readObjectsWithRows_(SHEETS.targets);
  const found = rows.find(r => String(r.id) === String(id));
  if (!found) throw new Error('Target not found.');
  const next = updater(Object.assign({}, found));
  writeObjectAtRow_(sheet_(SHEETS.targets), found._row, next);
}

function getTargetById_(id) {
  const row = readObjectsWithRows_(SHEETS.targets).find(r => String(r.id) === String(id));
  if (!row) throw new Error('Target not found.');
  return row;
}

function addAudit_(actor, action, targetId, details) {
  appendObject_(SHEETS.auditLog, {
    timestamp: now_(),
    actor: actor || '',
    action: action || '',
    targetId: targetId || '',
    details: details || '',
  });
  return { ok:true };
}

function ensureSheets_() {
  Object.keys(HEADERS).forEach(name => {
    const s = sheet_(name);
    if (s.getLastRow() === 0) s.appendRow(HEADERS[name]);
  });
}

function sheet_(name) {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function readObjects_(name) {
  return readObjectsWithRows_(name).map(row => {
    delete row._row;
    return row;
  });
}

function readObjectsWithRows_(name) {
  const s = sheet_(name);
  const values = s.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter(row => row.some(v => v !== '')).map((row, i) => {
    const obj = { _row: i + 2 };
    headers.forEach((h, idx) => obj[h] = row[idx]);
    return obj;
  });
}

function appendObject_(name, obj) {
  const s = sheet_(name);
  const headers = HEADERS[name] || s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
  s.appendRow(headers.map(h => obj[h] == null ? '' : obj[h]));
}

function appendObjects_(name, objects) {
  if (!objects.length) return;
  const s = sheet_(name);
  const headers = HEADERS[name] || s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
  const values = objects.map(obj => headers.map(h => obj[h] == null ? '' : obj[h]));
  s.getRange(s.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
}

function writeObjectAtRow_(sheet, rowNumber, obj) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  headers.forEach((h, i) => {
    if (Object.prototype.hasOwnProperty.call(obj, h)) sheet.getRange(rowNumber, i + 1).setValue(obj[h] == null ? '' : obj[h]);
  });
}

function getInput_(e, method) {
  let input = {};
  if (method === 'POST' && e.postData && e.postData.contents) {
    try { input = JSON.parse(e.postData.contents); } catch (_) {}
  }
  if (e.parameter && e.parameter.payload) {
    try { input = Object.assign(input, JSON.parse(decodeURIComponent(e.parameter.payload))); } catch (_) {}
  }
  Object.keys(e.parameter || {}).forEach(k => {
    if (k !== 'payload') input[k] = e.parameter[k];
  });
  return input;
}

function validateAccess_(input) {
  const expected = _apiKey();
  if (expected && String(input.key || '') !== expected) throw new Error('Invalid access code.');
}

function requireAdmin_(input) {
  const expected = _adminKey();
  if (expected && String(input.admin || '') !== expected) throw new Error('Admin key required.');
}

function json_(obj, input) {
  const json = JSON.stringify(obj);
  if (input && input.callback) {
    return ContentService
      .createTextOutput(String(input.callback) + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function uid_(prefix) {
  return prefix + '_' + Utilities.getUuid().slice(0, 8);
}

function now_() {
  return new Date().toISOString();
}

function num_(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function numOrBlank_(value) {
  if (value === '' || value == null) return '';
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}
