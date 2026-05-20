function _props(){ return PropertiesService.getScriptProperties(); }
function _apiKey(){ return _props().getProperty('API_KEY') || ''; }
function _adminKey(){ return _props().getProperty('ADMIN_KEY') || ''; }
const MANAGER_WEBHOOK_KEYS = ['MANAGER_DISCORD_WEBHOOK_URL','DISCORD_MANAGER_WEBHOOK_URL','MANAGER_WEBHOOK_URL','DISCORD_WEBHOOK_URL'];
const EMPLOYEE_WEBHOOK_KEYS = ['EMPLOYEE_DISCORD_WEBHOOK_URL','DISCORD_EMPLOYEE_WEBHOOK_URL','EMPLOYEE_WEBHOOK_URL','DISCORD_WEBHOOK_URL'];
function _firstProperty_(keys){ for (const key of keys){ const value = _props().getProperty(key); if (value) return value; } return ''; }
function _managerDiscordWebhookUrl(){ return _firstProperty_(MANAGER_WEBHOOK_KEYS); }
function _employeeDiscordWebhookUrl(){ return _firstProperty_(EMPLOYEE_WEBHOOK_KEYS); }
function _existingWebhookKeys_(keys){ return keys.filter(key => !!_props().getProperty(key)); }

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
  Orders: ['orderId','customer','requestedBy','orderedAt','targetCount','pricePerSpy','totalPrice','paymentStatus','employeePayoutStatus','newOrderNotifiedAt','newOrderNotificationStatus','completedAt','completionNotifiedAt','completionNotificationStatus','notes','createdAt','updatedAt'],
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
  if (action === 'verifyAdmin') return verifyAdmin_(input);
  if (action === 'webhookDebug') return webhookDebug_(input);
  if (action === 'sendNewOrderNotification') return sendNewOrderNotification_(input);
  if (action === 'sendOrderCompleteNotification') return sendOrderCompleteNotification_(input);
  if (action === 'audit') return addAudit_(input.actor || input.employee || 'system', input.auditAction || 'audit', input.targetId || '', input.details || '');
  throw new Error('Unknown action: ' + action);
}

function list_() {
  syncAllOrderCompletion_();
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
  const warnings = Array.isArray(payload.warnings) ? payload.warnings.join(' | ') : (payload.warnings || '');
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
    warnings: warnings,
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
  autoSendOrderCompletionIfReady_(target.orderId, input.employee || input.actor || 'system');
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
  if (status === 'approved') autoSendOrderCompletionIfReady_(target.orderId, input.employee || input.actor || 'manager');
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

function verifyAdmin_(input) {
  requireAdmin_(input);
  return { ok:true, admin:true };
}

function webhookDebug_(input) {
  requireAdmin_(input);
  return {
    ok:true,
    managerConfigured: !!_managerDiscordWebhookUrl(),
    employeeConfigured: !!_employeeDiscordWebhookUrl(),
    managerKeysFound: _existingWebhookKeys_(MANAGER_WEBHOOK_KEYS),
    employeeKeysFound: _existingWebhookKeys_(EMPLOYEE_WEBHOOK_KEYS),
    managerKeysChecked: MANAGER_WEBHOOK_KEYS,
    employeeKeysChecked: EMPLOYEE_WEBHOOK_KEYS,
  };
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
      newOrderNotifiedAt: '',
      newOrderNotificationStatus: '',
      completedAt: '',
      completionNotifiedAt: '',
      completionNotificationStatus: '',
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

function getOrderTargets_(orderId) {
  return readObjects_(SHEETS.targets).filter(r => String(r.orderId || '') === String(orderId || ''));
}

function calculateOrderCompletion_(orderId) {
  const targets = getOrderTargets_(orderId);
  const total = targets.length;
  const approved = targets.filter(t => String(t.status || '') === 'submitted' && String(t.reviewStatus || '') === 'approved').length;
  const complete = total > 0 && approved === total;
  const totalPrice = targets.reduce((sum, row) => sum + num_(row.pricePerSpy), 0);
  const customer = (targets.find(t => t.customer) || {}).customer || '';
  return { orderId, customer, total, approved, complete, totalPrice };
}

function ensureOrderRow_(orderId) {
  if (!orderId) return null;
  const existing = readObjectsWithRows_(SHEETS.orders).find(r => String(r.orderId || '') === String(orderId || ''));
  if (existing) return existing;
  const targets = getOrderTargets_(orderId);
  if (!targets.length) return null;
  const now = now_();
  const totalPrice = targets.reduce((sum, row) => sum + num_(row.pricePerSpy), 0);
  const first = targets[0] || {};
  appendObject_(SHEETS.orders, {
    orderId: orderId,
    customer: first.customer || '',
    requestedBy: '',
    orderedAt: now,
    targetCount: targets.length,
    pricePerSpy: first.pricePerSpy || '',
    totalPrice: totalPrice,
    paymentStatus: first.customerPaymentStatus || 'unpaid',
    employeePayoutStatus: first.employeePayoutStatus || 'unpaid',
    newOrderNotifiedAt: '',
    newOrderNotificationStatus: '',
    completedAt: '',
    completionNotifiedAt: '',
    completionNotificationStatus: '',
    notes: '',
    createdAt: now,
    updatedAt: now,
  });
  return readObjectsWithRows_(SHEETS.orders).find(r => String(r.orderId || '') === String(orderId || '')) || null;
}

function syncOrderCompletion_(orderId) {
  if (!orderId) return null;
  const order = ensureOrderRow_(orderId);
  if (!order) return null;
  const completion = calculateOrderCompletion_(orderId);
  const updates = {
    targetCount: completion.total,
    totalPrice: completion.totalPrice,
    updatedAt: now_(),
  };
  if (completion.customer && !order.customer) updates.customer = completion.customer;
  if (completion.complete && !order.completedAt) updates.completedAt = now_();
  if (!completion.complete && order.completedAt) {
    updates.completedAt = '';
    updates.completionNotifiedAt = '';
    updates.completionNotificationStatus = '';
  }
  writeObjectAtRow_(sheet_(SHEETS.orders), order._row, updates);
  return Object.assign({}, order, updates, completion);
}

function autoSendOrderCompletionIfReady_(orderId, actor) {
  if (!orderId) return { ok:true, skipped:true, status:'no_order' };
  const synced = syncOrderCompletion_(orderId);
  if (!synced) return { ok:true, skipped:true, status:'order_missing' };
  if (!synced.complete) return { ok:true, skipped:true, status:'not_complete' };

  const row = ensureOrderRow_(orderId);
  if (!row) return { ok:true, skipped:true, status:'order_missing' };
  const alreadySent = row.completionNotifiedAt && row.completionNotificationStatus === 'sent';
  if (alreadySent) return { ok:true, skipped:true, status:'already_sent' };

  const updates = {
    completedAt: row.completedAt || now_(),
    completionNotifiedAt: now_(),
    completionNotificationStatus: 'sent',
    updatedAt: now_(),
  };

  const webhookUrl = _managerDiscordWebhookUrl();
  if (!webhookUrl) {
    updates.completionNotificationStatus = 'webhook_missing';
    writeObjectAtRow_(sheet_(SHEETS.orders), row._row, updates);
    const details = 'Checked: ' + MANAGER_WEBHOOK_KEYS.join(', ');
    addAudit_(actor || 'system', 'order_completion_webhook_missing', orderId, details);
    return { ok:true, notified:false, status:'webhook_missing', checkedKeys:MANAGER_WEBHOOK_KEYS, foundKeys:_existingWebhookKeys_(MANAGER_WEBHOOK_KEYS) };
  }

  const priceLine = synced.totalPrice ? '\nPrice total: ' + Number(synced.totalPrice).toLocaleString() : '';
  const content = [
    'Order complete: ' + orderId,
    'Customer: ' + (synced.customer || row.customer || '-'),
    'Delivered: ' + synced.approved + ' / ' + synced.total + ' approved',
    'Total: ' + synced.total + ' spies' + priceLine,
    'Ready to copy and send to customer.'
  ].join('\n');
  postDiscord_(webhookUrl, content);
  writeObjectAtRow_(sheet_(SHEETS.orders), row._row, updates);
  addAudit_(actor || 'system', 'order_completion_notified_auto', orderId, synced.customer || '');
  return { ok:true, notified:true, status:updates.completionNotificationStatus };
}

function syncAllOrderCompletion_() {
  readObjects_(SHEETS.orders).forEach(order => syncOrderCompletion_(order.orderId));
}

function sendOrderCompleteNotification_(input) {
  requireAdmin_(input);
  const orderId = input.orderId || '';
  if (!orderId) throw new Error('orderId is required.');
  const synced = syncOrderCompletion_(orderId);
  if (!synced) throw new Error('Order not found.');
  if (!synced.complete) throw new Error('Order is not complete yet.');

  const row = ensureOrderRow_(orderId);
  if (!row) throw new Error('Order not found.');
  const actor = input.actor || input.employee || 'manager';
  const statusOnly = input.markOnly === true || String(input.markOnly || '') === 'true';
  const alreadySent = row.completionNotifiedAt && row.completionNotificationStatus === 'sent';
  if (alreadySent && !statusOnly) return { ok:true, skipped:true, status:'already_sent' };

  const updates = {
    completedAt: row.completedAt || now_(),
    completionNotifiedAt: now_(),
    completionNotificationStatus: statusOnly ? 'manually_marked' : 'sent',
    updatedAt: now_(),
  };

  if (!statusOnly) {
    const webhookUrl = _managerDiscordWebhookUrl();
    if (!webhookUrl) {
      updates.completionNotificationStatus = 'webhook_missing';
      writeObjectAtRow_(sheet_(SHEETS.orders), row._row, updates);
      const details = 'Checked: ' + MANAGER_WEBHOOK_KEYS.join(', ');
      addAudit_(actor, 'order_completion_webhook_missing', orderId, details);
      return { ok:true, notified:false, status:'webhook_missing', checkedKeys:MANAGER_WEBHOOK_KEYS, foundKeys:_existingWebhookKeys_(MANAGER_WEBHOOK_KEYS) };
    }
    const priceLine = synced.totalPrice ? '\nPrice total: ' + Number(synced.totalPrice).toLocaleString() : '';
    const content = [
      'Order complete: ' + orderId,
      'Customer: ' + (synced.customer || row.customer || '-'),
      'Delivered: ' + synced.approved + ' / ' + synced.total + ' approved',
      'Total: ' + synced.total + ' spies' + priceLine,
      'Ready to copy and send to customer.'
    ].join('\n');
    postDiscord_(webhookUrl, content);
  }

  writeObjectAtRow_(sheet_(SHEETS.orders), row._row, updates);
  addAudit_(actor, statusOnly ? 'order_completion_marked_sent' : 'order_completion_notified', orderId, synced.customer || '');
  return { ok:true, notified:!statusOnly, status:updates.completionNotificationStatus };
}

function sendNewOrderNotification_(input) {
  requireAdmin_(input);
  const orderId = input.orderId || '';
  if (!orderId) throw new Error('orderId is required.');
  const synced = syncOrderCompletion_(orderId);
  if (!synced) throw new Error('Order not found.');
  const row = ensureOrderRow_(orderId);
  if (!row) throw new Error('Order not found.');
  const actor = input.actor || input.employee || 'manager';
  const alreadySent = row.newOrderNotifiedAt && row.newOrderNotificationStatus === 'sent';
  if (alreadySent) return { ok:true, skipped:true, status:'already_sent' };

  const updates = {
    newOrderNotifiedAt: now_(),
    newOrderNotificationStatus: 'sent',
    updatedAt: now_(),
  };
  const webhookUrl = _employeeDiscordWebhookUrl();
  if (!webhookUrl) {
    updates.newOrderNotificationStatus = 'webhook_missing';
    writeObjectAtRow_(sheet_(SHEETS.orders), row._row, updates);
    const details = 'Checked: ' + EMPLOYEE_WEBHOOK_KEYS.join(', ');
    addAudit_(actor, 'new_order_webhook_missing', orderId, details);
    return { ok:true, notified:false, status:'webhook_missing', checkedKeys:EMPLOYEE_WEBHOOK_KEYS, foundKeys:_existingWebhookKeys_(EMPLOYEE_WEBHOOK_KEYS) };
  }

  const priceLine = synced.totalPrice ? '\nPrice total: ' + Number(synced.totalPrice).toLocaleString() : '';
  const content = [
    'New spy order: ' + orderId,
    'Customer: ' + (synced.customer || row.customer || '-'),
    'Targets: ' + synced.total,
    'Payment: ' + (row.paymentStatus || 'unpaid') + priceLine,
    'Ready for claiming.'
  ].join('\n');
  postDiscord_(webhookUrl, content);
  writeObjectAtRow_(sheet_(SHEETS.orders), row._row, updates);
  addAudit_(actor, 'new_order_notified', orderId, synced.customer || row.customer || '');
  return { ok:true, notified:true, status:'sent' };
}

function ensureExternalRequestAuthorized_() {
  const auth = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL, [
    'https://www.googleapis.com/auth/script.external_request'
  ]);
  if (auth.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.NOT_REQUIRED) return;
  let message = 'Discord webhook sending requires Apps Script external request authorization. Open the Apps Script editor, run any function once, accept the new permissions, then redeploy the web app.';
  const authorizationUrl = auth.getAuthorizationUrl();
  if (authorizationUrl) message += ' Authorization URL: ' + authorizationUrl;
  throw new Error(message);
}

function discordRetryDelayMs_(response, attemptIndex) {
  const headers = response && response.getAllHeaders ? response.getAllHeaders() : {};
  const retryAfterRaw = headers['Retry-After'] || headers['retry-after'] || '';
  const retryAfterSeconds = Number(retryAfterRaw);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(15000, Math.max(500, Math.round(retryAfterSeconds * 1000)));
  }

  const body = String(response && response.getContentText ? response.getContentText() : '');
  const retryAfterMatch = body.match(/"retry_after"\s*:\s*([0-9.]+)/i);
  if (retryAfterMatch) {
    const retryAfterValue = Number(retryAfterMatch[1]);
    if (Number.isFinite(retryAfterValue) && retryAfterValue > 0) {
      // Discord may return retry_after in seconds (API) or milliseconds in some contexts.
      const guessMs = retryAfterValue > 100 ? retryAfterValue : retryAfterValue * 1000;
      return Math.min(15000, Math.max(500, Math.round(guessMs)));
    }
  }

  return Math.min(15000, 1000 * Math.pow(2, Math.max(0, attemptIndex)));
}

function postDiscord_(webhookUrl, content) {
  ensureExternalRequestAuthorized_();
  const url = String(webhookUrl || '').trim();
  const maxAttempts = 3;
  let lastCode = 0;
  let lastBody = '';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ content }),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    const body = String(res.getContentText() || '');
    lastCode = code;
    lastBody = body;

    if (code >= 200 && code < 300) return;

    const looksRateLimited = code === 429 || /\b1015\b|rate\s*limit/i.test(body);
    const canRetry = looksRateLimited && attempt < (maxAttempts - 1);
    if (canRetry) {
      Utilities.sleep(discordRetryDelayMs_(res, attempt));
      continue;
    }

    if (looksRateLimited) {
      throw new Error('Discord webhook rate-limited (HTTP ' + code + '). Please retry in a moment. Details: ' + body);
    }
    throw new Error('Discord webhook failed with HTTP ' + code + ': ' + body);
  }

  throw new Error('Discord webhook failed after retries with HTTP ' + lastCode + ': ' + lastBody);
}

function updateOrderPayment_(orderId, status) {
  if (!orderId) return;
  const row = readObjectsWithRows_(SHEETS.orders).find(r => String(r.orderId) === String(orderId));
  if (row) writeObjectAtRow_(sheet_(SHEETS.orders), row._row, { paymentStatus: status, updatedAt: now_() });
}

function updateTarget_(id, updater) {
  // Only read the header and the id column to find the row number, then update just that row.
  const sheet = sheet_(SHEETS.targets);
  const idCol = HEADERS.Targets.indexOf('id') + 1;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('No targets in sheet.');
  const idValues = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  let foundRow = null;
  for (let i = 0; i < idValues.length; ++i) {
    if (String(idValues[i][0]) === String(id)) {
      foundRow = i + 2;
      break;
    }
  }
  if (!foundRow) throw new Error('Target not found.');
  // Read the full row
  const headers = HEADERS.Targets;
  const rowValues = sheet.getRange(foundRow, 1, 1, headers.length).getValues()[0];
  const rowObj = { _row: foundRow };
  headers.forEach((h, idx) => rowObj[h] = rowValues[idx]);
  const next = updater(Object.assign({}, rowObj));
  // Write only the updated row
  headers.forEach((h, idx) => {
    if (Object.prototype.hasOwnProperty.call(next, h))
      sheet.getRange(foundRow, idx + 1).setValue(next[h] == null ? '' : next[h]);
  });
  SpreadsheetApp.flush();
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
    else ensureHeaders_(s, HEADERS[name]);
  });
}

function ensureHeaders_(sheet, expectedHeaders) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].filter(String);
  const missing = expectedHeaders.filter(h => current.indexOf(h) === -1);
  if (!missing.length) return;
  sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
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
  if (!expected) throw new Error('Admin key is not configured server-side.');
  if (String(input.admin || '') !== expected) throw new Error('Admin key required.');
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
