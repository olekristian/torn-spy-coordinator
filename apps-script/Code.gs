function _props(){ return PropertiesService.getScriptProperties(); }
function _apiKey(){ return _props().getProperty('API_KEY') || ''; }
function _adminKey(){ return _props().getProperty('ADMIN_KEY') || ''; }
function _employeeAccessMap_(){
  const raw = _props().getProperty('EMPLOYEE_ACCESS_MAP') || '';
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    throw new Error('EMPLOYEE_ACCESS_MAP is not valid JSON.');
  }
}
const BACKEND_VERSION = '2026-08-05-admin-overview-v1';
const MANAGER_WEBHOOK_KEYS = ['MANAGER_DISCORD_WEBHOOK_URL','DISCORD_MANAGER_WEBHOOK_URL','MANAGER_WEBHOOK_URL','DISCORD_WEBHOOK_URL'];
const EMPLOYEE_WEBHOOK_KEYS = ['EMPLOYEE_DISCORD_WEBHOOK_URL','DISCORD_EMPLOYEE_WEBHOOK_URL','EMPLOYEE_WEBHOOK_URL','DISCORD_WEBHOOK_URL'];
const CUSTOMER_WEBHOOK_PREFIX = 'CUSTOMER_DISCORD_WEBHOOK_URL_';
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
  outbox: 'Outbox',
};

const HEADERS = {
  Targets: ['id','targetName','targetId','level','notes','priority','status','claimedBy','claimedAt','submittedAt','reviewStatus','assignedTo','assignedAt','orderId','customer','pricePerSpy','employeeRate','customerPaymentStatus','employeePayoutStatus','createdAt','updatedAt','version','lastOperationId'],
  Submissions: ['id','targetRowId','targetName','targetId','submittedBy','submittedAt','rawText','level','strength','speed','dexterity','defense','total','formatted','reviewStatus','reviewedBy','reviewedAt','warnings','updatedAt','requestId','version','reviewOperationId'],
  Orders: ['orderId','customer','requestedBy','orderedAt','targetCount','pricePerSpy','totalPrice','paymentStatus','employeePayoutStatus','newOrderNotifiedAt','newOrderNotificationStatus','completedAt','completionNotifiedAt','completionNotificationStatus','orderStatus','paymentRequired','paymentConfirmedAt','paymentConfirmedBy','paymentType','deliveryMode','autoDeliver','customerDeliveryConfigured','deliveredAt','deliveryStatus','deliveryError','notes','createdAt','updatedAt','cancelledAt','cancelledBy','cancelReason','cancelOperationId'],
  Customers: ['customer','contact','notes','createdAt','updatedAt'],
  Employees: ['displayName','payoutHandle','defaultRate','notes','createdAt','updatedAt'],
  CustomerPayments: ['id','orderId','customer','amount','status','reference','note','recordedBy','recordedAt','requestId','voidedAt','voidedBy','voidReason'],
  EmployeePayouts: ['id','submissionId','targetRowId','employee','targetId','amount','status','reference','note','recordedBy','recordedAt','requestId','voidedAt','voidedBy','voidReason'],
  AuditLog: ['timestamp','actor','action','targetId','details','operationId'],
  DeliveryHistory: ['id','orderId','customer','targetName','targetId','deliveredBy','submittedAt','reviewStatus','level','formatted','rawText','archivedBy','archivedAt','notes'],
  Outbox: ['eventId','eventType','entityId','status','attempts','payload','createdAt','updatedAt','sentAt','lastError'],
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
    validateAccess_(input, method);
    const action = input.action || (e.parameter && e.parameter.action) || 'list';
    const result = dispatch_(action, input);
    return json_(result, input);
  } catch (err) {
    return json_({ ok:false, error:String(err && err.message || err) }, input);
  }
}

function dispatch_(action, input) {
  if (action === 'version') return version_();
  if (action === 'list') return list_(input);
  if (action === 'add') return addTarget_(input);
  if (action === 'bulkAdd') return bulkAddTargets_(input);
  if (action === 'claim') return claimTarget_(input);
  if (action === 'unclaim') return unclaimTarget_(input);
  if (action === 'submit') return submitSpy_(input);
  if (action === 'review') return reviewSubmission_(input);
  if (action === 'assign') return assignTarget_(input);
  if (action === 'customerPayment') return recordCustomerPayment_(input);
  if (action === 'voidCustomerPayment') return voidCustomerPayment_(input);
  if (action === 'employeePayout') return recordEmployeePayout_(input);
  if (action === 'voidEmployeePayout') return voidEmployeePayout_(input);
  if (action === 'history') return archiveHistory_(input);
  if (action === 'verifyAdmin') return verifyAdmin_(input);
  if (action === 'webhookDebug') return webhookDebug_(input);
  if (action === 'testDiscordWebhook') return testDiscordWebhook_(input);
  if (action === 'setOrderPrice') return setOrderPrice_(input);
  if (action === 'sendNewOrderNotification') return sendNewOrderNotification_(input);
  if (action === 'sendOrderCompleteNotification') return sendOrderCompleteNotification_(input);
  if (action === 'setOrderAutomation') return setOrderAutomation_(input);
  if (action === 'recordTornMoneyPayment') return recordTornMoneyPayment_(input);
  if (action === 'sendCustomerDelivery') return sendCustomerDelivery_(input);
  if (action === 'markOrderDelivered') return markOrderDelivered_(input);
  if (action === 'cancelOrder') return cancelOrder_(input);
  if (action === 'getAutomationDiagnostics') return getAutomationDiagnostics_(input);
  if (action === 'reconcileOutbox') return reconcileOutbox_(input);
  if (action === 'retryOutboxEvent') return retryOutboxEvent_(input);
  if (action === 'audit') throw new Error('Canonical audit events cannot be written directly.');
  throw new Error('Unknown action: ' + action);
}

function version_() {
  return {
    ok: true,
    version: BACKEND_VERSION,
    checkedAt: now_(),
    actions: ['version','list','customerPayment','voidCustomerPayment','employeePayout','voidEmployeePayout','setOrderPrice','webhookDebug','testDiscordWebhook','sendNewOrderNotification','sendOrderCompleteNotification','setOrderAutomation','recordTornMoneyPayment','sendCustomerDelivery','markOrderDelivered','cancelOrder','getAutomationDiagnostics','reconcileOutbox','retryOutboxEvent']
  };
}

function list_(input) {
  syncAllOrderCompletion_();
  const adminOk = isAdminInput_(input);
  const orders = readObjects_(SHEETS.orders);
  const orderById = {};
  const orderStatusById = {};
  orders.forEach(order => {
    if (!order.orderId) return;
    const orderId = String(order.orderId);
    orderById[orderId] = order;
    orderStatusById[orderId] = normalizeOrderStatus_(order);
  });
  const targets = readObjects_(SHEETS.targets)
  .filter(row => {
    const orderId = String(row.orderId || '');
    const order = orderById[orderId];
    const orderStatus = orderStatusById[orderId];
    if (String(row.status || '') === 'cancelled') return false;
    if (orderStatus === 'cancelled') return false;
    return adminOk || !order || ['ready_for_work','in_progress','pending_review','ready_to_deliver'].indexOf(orderStatus) !== -1;
  })
  .map(row => {
    const base = {
    id: row.id,
    targetName: row.targetName,
    targetId: row.targetId,
    level: numOrBlank_(row.level),
    notes: row.notes,
    priority: row.priority || 'normal',
    status: row.status || 'open',
    claimedBy: row.claimedBy,
    claimedAt: row.claimedAt,
    submittedAt: row.submittedAt,
    reviewStatus: row.reviewStatus || 'pending_review',
    assignedTo: row.assignedTo,
    assignedAt: row.assignedAt,
    payload: latestPayloadForTarget_(row.id),
    version: num_(row.version) || 1,
    };
    if (adminOk) {
      base.orderId = row.orderId;
      base.customer = row.customer;
      base.pricePerSpy = num_(row.pricePerSpy);
      base.employeeRate = num_(row.employeeRate);
      base.customerPaymentStatus = row.customerPaymentStatus || 'unpaid';
      base.employeePayoutStatus = row.employeePayoutStatus || 'unpaid';
    }
    return base;
  });
  return {
    ok: true,
    tasks: targets,
    orders: adminOk ? orders.map(sanitizeOrderForClient_) : [],
    customerPayments: adminOk ? readObjects_(SHEETS.customerPayments) : [],
    employeePayouts: adminOk ? readObjects_(SHEETS.employeePayouts) : [],
    deliveryHistory: adminOk ? readObjects_(SHEETS.deliveryHistory) : [],
  };
}

function isAdminInput_(input) {
  const expected = _adminKey();
  return !!expected && String(input && input.admin || '') === expected;
}

function sanitizeOrderForClient_(order) {
  const copy = Object.assign({}, order || {});
  delete copy.customerDeliveryWebhookUrl;
  copy.customerDeliveryConfigured = bool_(copy.customerDeliveryConfigured) || !!customerWebhookForOrder_(copy.orderId, copy.customer);
  copy.orderStatus = normalizeOrderStatus_(copy);
  return copy;
}

function addTarget_(input) {
  requireAdmin_(input);
  if (!String(input.requestId || '').trim()) throw new Error('requestId is required for adding a target.');
  return withScriptLock_(() => addTargetUnlocked_(input));
}

function addTargetUnlocked_(input) {
  const requestId = String(input.requestId || '').trim();
  const existing = readObjects_(SHEETS.targets).find(row => String(row.lastOperationId || '') === requestId);
  if (existing) {
    if (!sameText_(existing.targetName, input.targetName || input.name) ||
        !sameText_(existing.targetId, input.targetId) ||
        !sameText_(existing.customer, input.customer)) {
      throw new Error('Conflict: requestId was already used for another target.');
    }
    upsertOrderFromTarget_(existing);
    ensureAuditOnce_(requestId, String(_props().getProperty('ADMIN_ACTOR') || 'manager'), 'target_added', existing.targetId, existing.targetName);
    return { ok:true, duplicate:true, id:existing.id, orderId:existing.orderId || '' };
  }
  const orderId = resolveOrderIdForNewTarget_(input.orderId, input.requireExistingOrder);
  const id = uid_('target');
  const now = now_();
  const row = {
    id,
    targetName: input.targetName || input.name || '',
    targetId: input.targetId || '',
    level: numOrBlank_(input.level),
    notes: input.notes || '',
    priority: input.priority || 'normal',
    status: 'open',
    claimedBy: '',
    claimedAt: '',
    submittedAt: '',
    reviewStatus: '',
    assignedTo: input.assignedTo || '',
    assignedAt: input.assignedTo ? now : '',
    orderId: orderId,
    customer: input.customer || '',
    pricePerSpy: input.pricePerSpy || '',
    employeeRate: input.employeeRate || '',
    customerPaymentStatus: input.customerPaymentStatus || 'unpaid',
    employeePayoutStatus: input.employeePayoutStatus || 'unpaid',
    paymentRequired: bool_(input.paymentRequired),
    paymentType: input.paymentType || 'money',
    deliveryMode: input.deliveryMode || 'manual',
    autoDeliver: bool_(input.autoDeliver),
    createdAt: now,
    updatedAt: now,
    version: 1,
    lastOperationId: requestId,
  };
  appendObject_(SHEETS.targets, row);
  upsertOrderFromTarget_(row);
  addAudit_(String(_props().getProperty('ADMIN_ACTOR') || 'manager'), 'target_added', row.targetId, row.targetName, requestId);
  return { ok:true, id, orderId: row.orderId || '' };
}

function bulkAddTargets_(input) {
  requireAdmin_(input);
  if (!String(input.requestId || '').trim()) throw new Error('requestId is required for bulk add.');
  return withScriptLock_(() => bulkAddTargetsUnlocked_(input));
}

function bulkAddTargetsUnlocked_(input) {
  const items = Array.isArray(input.targets) ? input.targets : [];
  if (!items.length) return { ok:true, added:0, ids:[] };
  const requestId = String(input.requestId || '').trim();
  const existing = readObjects_(SHEETS.targets).filter(row => String(row.lastOperationId || '').indexOf(requestId + ':') === 0);
  if (existing.length) {
    existing.forEach(row => {
      upsertOrderFromTarget_(row);
      ensureAuditOnce_(row.lastOperationId, String(_props().getProperty('ADMIN_ACTOR') || 'manager'), 'target_added', row.targetId, row.targetName);
    });
    return {
      ok:true,
      duplicate:true,
      added:existing.length,
      ids:existing.map(row => row.id),
      orderIds:Array.from(new Set(existing.map(row => String(row.orderId || '')).filter(Boolean))),
    };
  }
  const hasBlankOrder = items.some(item => !String(item && item.orderId || '').trim());
  const sharedGeneratedOrderId = hasBlankOrder ? resolveOrderIdForNewTarget_('', input.requireExistingOrder) : '';
  const now = now_();
  const ids = [];
  const rows = items.map((item, itemIndex) => {
    const rowOrderId = String(item && item.orderId || '').trim()
      ? resolveOrderIdForNewTarget_(item.orderId, input.requireExistingOrder)
      : sharedGeneratedOrderId;
    const id = uid_('target');
    ids.push(id);
    return {
      id,
      targetName: item.targetName || item.name || '',
      targetId: item.targetId || '',
      level: numOrBlank_(item.level),
      notes: item.notes || '',
      priority: item.priority || 'normal',
      status: 'open',
      claimedBy: '',
      claimedAt: '',
      submittedAt: '',
      reviewStatus: '',
      assignedTo: item.assignedTo || '',
      assignedAt: item.assignedTo ? now : '',
      orderId: rowOrderId,
      customer: item.customer || '',
      pricePerSpy: item.pricePerSpy || '',
      employeeRate: item.employeeRate || '',
      customerPaymentStatus: item.customerPaymentStatus || 'unpaid',
      employeePayoutStatus: item.employeePayoutStatus || 'unpaid',
      paymentRequired: bool_(item.paymentRequired) || bool_(input.paymentRequired),
      paymentType: item.paymentType || input.paymentType || 'money',
      deliveryMode: item.deliveryMode || input.deliveryMode || 'manual',
      autoDeliver: bool_(item.autoDeliver) || bool_(input.autoDeliver),
      createdAt: now,
      updatedAt: now,
      version: 1,
      lastOperationId: requestId + ':' + itemIndex,
    };
  });
  appendObjects_(SHEETS.targets, rows);
  rows.forEach(row => {
    upsertOrderFromTarget_(row);
    addAudit_(String(_props().getProperty('ADMIN_ACTOR') || 'manager'), 'target_added', row.targetId, row.targetName, row.lastOperationId);
  });
  const orderIds = Array.from(new Set(rows.map(r => String(r.orderId || '')).filter(Boolean)));
  return { ok:true, added:rows.length, ids, orderIds };
}

function resolveOrderIdForNewTarget_(requestedOrderId, requireExistingOrder) {
  const clean = String(requestedOrderId || '').trim();
  if (clean) {
    if (requireExistingOrder && !orderExists_(clean)) throw new Error('Order does not exist. Pick an ongoing order.');
    const order = readObjects_(SHEETS.orders).find(row => String(row.orderId || '') === clean);
    if (order && normalizeOrderStatus_(order) === 'cancelled') throw new Error('Order is cancelled and cannot receive new targets.');
    return clean;
  }
  if (requireExistingOrder) throw new Error('Order ID is required when only ongoing orders are allowed.');
  return nextOrderId_();
}

function orderExists_(orderId) {
  if (!orderId) return false;
  return readObjects_(SHEETS.orders).some(row => String(row.orderId || '') === String(orderId || ''));
}

function nextOrderId_() {
  const minStart = 3;
  const numericIds = readObjects_(SHEETS.orders)
    .map(row => String(row.orderId || '').trim())
    .filter(value => /^\d+$/.test(value))
    .map(value => Number(value));
  if (!numericIds.length) return String(minStart);
  return String(Math.max(minStart - 1, Math.max.apply(null, numericIds)) + 1);
}

function claimTarget_(input) {
  const actor = canonicalActor_(input);
  const requestId = String(input.requestId || '').trim();
  if (!requestId) throw new Error('requestId is required for claim.');
  return withScriptLock_(() => {
    const current = getTargetById_(input.id);
    if (String(current.lastOperationId || '') === requestId &&
        String(current.status || '') === 'claimed' && String(current.claimedBy || '') === actor) {
      ensureAuditOnce_(requestId, actor, 'target_claimed', current.targetId, current.targetName);
      return { ok:true, duplicate:true, claimedBy:actor, version:num_(current.version) || 1 };
    }
    const updated = updateTarget_(input.id, row => {
      if (String(row.status || 'open') !== 'open') throw new Error('Conflict: target is already claimed or submitted.');
      row.status = 'claimed';
      row.claimedBy = actor;
      row.claimedAt = now_();
      row.assignedTo = '';
      row.assignedAt = '';
      row.updatedAt = now_();
      row.lastOperationId = requestId;
      return row;
    });
    addAudit_(actor, 'target_claimed', updated.targetId, updated.targetName, requestId);
    return { ok:true, claimedBy:actor, version:updated.version };
  });
}

function unclaimTarget_(input) {
  const managerOverride = isAdminInput_(input);
  const actor = managerOverride
    ? String(_props().getProperty('ADMIN_ACTOR') || 'manager')
    : canonicalActor_(input);
  const requestId = String(input.requestId || '').trim();
  if (!requestId) throw new Error('requestId is required for unclaim.');
  return withScriptLock_(() => {
    const current = getTargetById_(input.id);
    if (String(current.lastOperationId || '') === requestId && String(current.status || '') === 'open') {
      ensureAuditOnce_(requestId, actor, managerOverride ? 'manager_released_target' : 'target_released', current.targetId, current.targetName);
      return { ok:true, duplicate:true, version:num_(current.version) || 1 };
    }
    const updated = updateTarget_(input.id, row => {
      if (String(row.status || '') !== 'claimed') throw new Error('Conflict: target is not currently claimed.');
      if (!managerOverride && String(row.claimedBy || '') !== actor) {
        throw new Error('Forbidden: target is claimed by another employee.');
      }
      row.status = 'open';
      row.claimedBy = '';
      row.claimedAt = '';
      row.updatedAt = now_();
      row.lastOperationId = requestId;
      return row;
    });
    addAudit_(actor, managerOverride ? 'manager_released_target' : 'target_released', updated.targetId, updated.targetName, requestId);
    return { ok:true, version:updated.version };
  });
}

function submitSpy_(input) {
  const actor = canonicalActor_(input);
  const payload = input.payload || {};
  const warnings = Array.isArray(payload.warnings) ? payload.warnings.join(' | ') : (payload.warnings || '');
  const requestId = String(input.requestId || '').trim();
  if (!requestId) throw new Error('requestId is required for submissions.');
  let targetOrderId = '';
  const result = withScriptLock_(() => {
    const existing = readObjects_(SHEETS.submissions).find(row => String(row.requestId || '') === requestId);
    if (existing) {
      if (String(existing.targetRowId || '') !== String(input.id || '') ||
          String(existing.submittedBy || '') !== actor ||
          !submissionMatchesInput_(existing, input, payload)) {
        throw new Error('Conflict: requestId was already used for another submission.');
      }
      const repaired = updateTarget_(input.id, row => {
        row.status = 'submitted';
        row.submittedAt = existing.submittedAt || row.submittedAt || now_();
        row.reviewStatus = existing.reviewStatus || 'pending_review';
        row.lastOperationId = requestId;
        row.updatedAt = now_();
        targetOrderId = row.orderId || '';
        return row;
      });
      ensureAuditOnce_(requestId, actor, 'spy_submitted', repaired.targetId, repaired.targetName);
      return { ok:true, duplicate:true, submissionId:existing.id };
    }
    const now = now_();
    const target = getTargetById_(input.id);
    if (String(target.status || '') !== 'claimed') throw new Error('Conflict: target is not currently claimed.');
    if (String(target.claimedBy || '') !== actor) throw new Error('Forbidden: target is claimed by another employee.');
    const submissionId = uid_('sub');
    appendObject_(SHEETS.submissions, {
      id: submissionId,
      targetRowId: input.id,
      targetName: input.name || target.targetName || payload.name || '',
      targetId: input.targetId || target.targetId || payload.targetId || '',
      submittedBy: actor,
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
      requestId: requestId,
      version: 1,
    });
    const updated = updateTarget_(input.id, row => {
      row.status = 'submitted';
      row.submittedAt = now;
      row.reviewStatus = 'pending_review';
      row.lastOperationId = requestId;
      row.updatedAt = now;
      return row;
    });
    targetOrderId = target.orderId || '';
    addAudit_(actor, 'spy_submitted', updated.targetId, updated.targetName, requestId);
    return { ok:true, submissionId };
  });
  autoSendOrderCompletionIfReady_(targetOrderId, actor);
  return result;
}

function ensureAuditOnce_(operationId, actor, action, targetId, details) {
  const exists = readObjects_(SHEETS.auditLog).some(row => String(row.operationId || '') === String(operationId || ''));
  if (!exists) addAudit_(actor, action, targetId, details, operationId);
}

function submissionMatchesInput_(row, input, payload) {
  const expected = {
    targetName:input.name || payload.name || '',
    targetId:input.targetId || payload.targetId || '',
    rawText:payload.rawText || input.rawText || '',
    level:payload.level || '',
    strength:payload.strength || '',
    speed:payload.speed || '',
    dexterity:payload.dexterity || '',
    defense:payload.defense || '',
    total:payload.total || '',
    formatted:payload.formatted || '',
  };
  return Object.keys(expected).every(key => sameText_(row[key], expected[key]));
}

function reviewSubmission_(input) {
  requireAdmin_(input);
  const status = input.status || 'pending_review';
  const submissionId = String(input.submissionId || '').trim();
  const requestId = String(input.requestId || '').trim();
  const expectedVersion = Number(input.expectedVersion);
  if (!submissionId || !requestId || !Number.isFinite(expectedVersion)) {
    throw new Error('submissionId, expectedVersion and requestId are required for review.');
  }
  const actor = String(_props().getProperty('ADMIN_ACTOR') || 'manager');
  let orderId = '';
  const result = withScriptLock_(() => {
    const target = getTargetById_(input.targetRowId || input.id);
    assertOrderNotCancelled_(target.orderId);
    const submissions = sheet_(SHEETS.submissions);
    const row = readObjectsWithRows_(SHEETS.submissions).find(r => String(r.id || '') === submissionId);
    if (!row || String(row.targetRowId || '') !== String(target.id)) throw new Error('Submission not found for target.');
    if (String(row.reviewOperationId || '') === requestId) {
      if (String(row.reviewStatus || '') !== String(status || '') ||
          (input.payload && ['level','strength','speed','dexterity','defense','total','formatted']
            .some(key => input.payload[key] != null && !sameText_(row[key], input.payload[key])))) {
        throw new Error('Conflict: requestId was already used for another review payload.');
      }
      updateTarget_(target.id, t => {
        t.reviewStatus = row.reviewStatus || status;
        t.lastOperationId = requestId;
        t.updatedAt = now_();
        return t;
      });
      ensureAuditOnce_(requestId, actor, 'manager_' + (row.reviewStatus || status), target.targetId, target.targetName);
      orderId = target.orderId || '';
      return { ok:true, duplicate:true, submissionId:submissionId, version:num_(row.version) || 1 };
    }
    const currentVersion = num_(row.version) || 1;
    if (currentVersion !== expectedVersion) throw new Error('Conflict: submission has changed; refresh before reviewing.');
    const updates = {
      reviewStatus: status,
      reviewedBy: actor,
      reviewedAt: now_(),
      updatedAt: now_(),
      version: currentVersion + 1,
      reviewOperationId: requestId,
    };
    if (input.payload) {
      ['level','strength','speed','dexterity','defense','total','formatted'].forEach(k => {
        if (input.payload[k] != null) updates[k] = input.payload[k];
      });
    }
    writeObjectAtRow_(submissions, row._row, updates);
    updateTarget_(target.id, t => {
      t.reviewStatus = status;
      t.lastOperationId = requestId;
      t.updatedAt = now_();
      return t;
    });
    addAudit_(actor, 'manager_' + status, target.targetId, target.targetName, requestId);
    orderId = target.orderId || '';
    return { ok:true, submissionId:submissionId, version:currentVersion + 1 };
  });
  if (status === 'approved') autoSendOrderCompletionIfReady_(orderId, actor);
  return result;
}

function assignTarget_(input) {
  requireAdmin_(input);
  const actor = String(_props().getProperty('ADMIN_ACTOR') || 'manager');
  return withScriptLock_(() => {
    const updated = updateTarget_(input.id, row => {
      assertOrderNotCancelled_(row.orderId);
      row.assignedTo = input.assignedTo || input.employeeName || '';
      row.assignedAt = now_();
      row.updatedAt = now_();
      return row;
    });
    addAudit_(actor, 'manager_assigned_target', updated.targetId, updated.assignedTo);
    return { ok:true, version:updated.version };
  });
}

function recordCustomerPayment_(input) {
  requireAdmin_(input);
  const requestId = String(input.requestId || '').trim();
  if (!requestId) throw new Error('requestId is required for customer payments.');
  const amount = num_(input.amount);
  if (!amount || amount < 0) throw new Error('A positive customer payment amount is required.');
  const actor = String(_props().getProperty('ADMIN_ACTOR') || 'manager');
  const result = withScriptLock_(() => {
    const existing = readObjects_(SHEETS.customerPayments).find(row => String(row.requestId || '') === requestId);
    if (existing) {
      if (String(existing.orderId || '') !== String(input.orderId || '') ||
          num_(existing.amount) !== amount ||
          !sameText_(existing.status, input.status || 'paid') ||
          (input.customer && !sameText_(existing.customer, input.customer))) {
        throw new Error('Conflict: requestId was already used for another payment.');
      }
      recalculateOrderPaymentFromPayments_(input.orderId);
      confirmOrderPaymentIfPaid_(input.orderId, actor, true);
      ensureAuditOnce_(requestId, actor, 'customer_payment_' + (existing.status || 'paid'), input.orderId || '', existing.customer || '');
      return { ok:true, duplicate:true, paymentId:existing.id, amount:num_(existing.amount) };
    }
    const order = ensureOrderRow_(input.orderId);
    if (!order) throw new Error('Order not found.');
    assertOrderNotCancelled_(order);
    const paid = readObjects_(SHEETS.customerPayments)
      .filter(row => String(row.orderId || '') === String(input.orderId || '') && String(row.status || '') !== 'voided')
      .reduce((sum, row) => sum + num_(row.amount), 0);
    const total = num_(order.totalPrice);
    if (total > 0 && paid + amount > total) throw new Error('Payment would exceed the order total.');
    const paymentId = uid_('custpay');
    appendObject_(SHEETS.customerPayments, {
      id: paymentId,
      orderId: input.orderId || '',
      customer: input.customer || order.customer || '',
      amount: amount,
      status: input.status || 'paid',
      reference: input.reference || '',
      note: input.note || '',
      recordedBy: actor,
      recordedAt: now_(),
      requestId: requestId,
      voidedAt: '',
      voidedBy: '',
      voidReason: '',
    });
    recalculateOrderPaymentFromPayments_(input.orderId);
    confirmOrderPaymentIfPaid_(input.orderId, actor, true);
    addAudit_(actor, 'customer_payment_' + (input.status || 'paid'), input.orderId || '', input.customer || order.customer || '', requestId);
    return { ok:true, paymentId:paymentId, amount:amount };
  });
  maybeSendNewOrderNotification_(input.orderId, actor);
  return result;
}

function recordTornMoneyPayment_(input) {
  requireAdmin_(input);
  const payload = Object.assign({}, input, {
    status: input.status || 'paid',
    reference: input.reference || input.tornReference || 'Torn money',
    note: input.note || 'Manual Torn-money payment confirmation'
  });
  const result = recordCustomerPayment_(payload);
  if (!result.duplicate) addAudit_(adminActor_(), 'torn_money_payment_confirmed', input.orderId || '', result.amount || '');
  return Object.assign({}, result, { paymentType:'money' });
}

function voidCustomerPayment_(input) {
  requireAdmin_(input);
  const paymentId = String(input.paymentId || '').trim();
  if (!paymentId) throw new Error('paymentId is required.');
  const row = readObjectsWithRows_(SHEETS.customerPayments).find(r => String(r.id || '') === paymentId);
  if (!row) throw new Error('Customer payment not found.');
  const actor = adminActor_();
  const reason = input.reason || 'voided by manager';
  writeObjectAtRow_(sheet_(SHEETS.customerPayments), row._row, {
    status: 'voided',
    voidedAt: now_(),
    voidedBy: actor,
    voidReason: reason,
  });
  addAudit_(actor, 'customer_payment_voided', row.orderId || '', paymentId + ' | ' + reason);
  recalculateOrderPaymentFromPayments_(row.orderId);
  return { ok:true, paymentId:paymentId, status:'voided' };
}

function recordEmployeePayout_(input) {
  requireAdmin_(input);
  const requestId = String(input.requestId || '').trim();
  if (!requestId) throw new Error('requestId is required for employee payouts.');
  const amount = num_(input.amount);
  if (!amount || amount < 0) throw new Error('A positive employee payout amount is required.');
  const actor = String(_props().getProperty('ADMIN_ACTOR') || 'manager');
  return withScriptLock_(() => {
    const existing = readObjects_(SHEETS.employeePayouts).find(row => String(row.requestId || '') === requestId);
    if (existing) {
      if (String(existing.submissionId || '') !== String(input.submissionId || '') ||
          num_(existing.amount) !== amount ||
          !sameText_(existing.status, input.status || 'paid') ||
          !sameText_(existing.targetRowId, input.targetRowId)) {
        throw new Error('Conflict: requestId was already used for another payout.');
      }
      reconcileTargetPayout_(existing.targetRowId);
      ensureAuditOnce_(requestId, actor, 'employee_payout_' + (existing.status || 'paid'), existing.targetId || '', existing.employee || '');
      return { ok:true, duplicate:true, payoutId:existing.id, amount:num_(existing.amount) };
    }
    const target = input.targetRowId ? getTargetById_(input.targetRowId) : null;
    if (target) assertOrderNotCancelled_(target.orderId);
    const activeForWork = readObjects_(SHEETS.employeePayouts)
      .filter(row => String(row.submissionId || '') === String(input.submissionId || '') && String(row.status || '') !== 'voided');
    const alreadyPaid = activeForWork.reduce((sum, row) => sum + num_(row.amount), 0);
    const due = target ? num_(target.employeeRate) : 0;
    if (due > 0 && alreadyPaid + amount > due) throw new Error('Payout would exceed the amount due for this work.');
    const payoutId = uid_('emppay');
    appendObject_(SHEETS.employeePayouts, {
      id: payoutId,
      submissionId: input.submissionId || '',
      targetRowId: input.targetRowId || '',
      employee: input.employeeName || '',
      targetId: input.targetId || '',
      amount: amount,
      status: input.status || 'paid',
      reference: input.reference || '',
      note: input.note || '',
      recordedBy: actor,
      recordedAt: now_(),
      requestId: requestId,
      voidedAt: '',
      voidedBy: '',
      voidReason: '',
    });
    reconcileTargetPayout_(input.targetRowId);
    addAudit_(actor, 'employee_payout_' + (input.status || 'paid'), input.targetId || '', input.employeeName || '', requestId);
    return { ok:true, payoutId:payoutId, amount:amount };
  });
}

function reconcileTargetPayout_(targetRowId) {
  if (!targetRowId) return;
  updateTarget_(targetRowId, row => {
    row.employeePayoutStatus = calculateTargetEmployeePayoutStatus_(targetRowId);
    row.updatedAt = now_();
    return row;
  });
}

function voidEmployeePayout_(input) {
  requireAdmin_(input);
  const payoutId = String(input.payoutId || '').trim();
  if (!payoutId) throw new Error('payoutId is required.');
  const row = readObjectsWithRows_(SHEETS.employeePayouts).find(r => String(r.id || '') === payoutId);
  if (!row) throw new Error('Employee payout not found.');
  const actor = adminActor_();
  const reason = input.reason || 'voided by manager';
  writeObjectAtRow_(sheet_(SHEETS.employeePayouts), row._row, {
    status: 'voided',
    voidedAt: now_(),
    voidedBy: actor,
    voidReason: reason,
  });
  if (row.targetRowId) {
    updateTarget_(row.targetRowId, target => {
      target.employeePayoutStatus = calculateTargetEmployeePayoutStatus_(row.targetRowId);
      target.updatedAt = now_();
      return target;
    });
  }
  addAudit_(actor, 'employee_payout_voided', row.targetId || '', payoutId + ' | ' + reason);
  return { ok:true, payoutId:payoutId, status:'voided' };
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
    archivedBy: adminActor_(),
    archivedAt: now_(),
    notes: entry.notes || '',
  });
  addAudit_(adminActor_(), 'delivery_archived', entry.targetId || '', entry.customer || '');
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

function testDiscordWebhook_(input) {
  requireAdmin_(input);
  const kind = String(input.kind || '').toLowerCase() === 'employee' ? 'employee' : 'manager';
  const keys = kind === 'employee' ? EMPLOYEE_WEBHOOK_KEYS : MANAGER_WEBHOOK_KEYS;
  const webhookUrl = kind === 'employee' ? _employeeDiscordWebhookUrl() : _managerDiscordWebhookUrl();
  const actor = adminActor_();
  if (!webhookUrl) {
    addAudit_(actor, kind + '_webhook_test_missing', '', 'Checked: ' + keys.join(', '));
    return {
      ok:true,
      notified:false,
      status:'webhook_missing',
      checkedKeys: keys,
      foundKeys: _existingWebhookKeys_(keys),
      debug: webhookDebug_(input),
    };
  }
  postDiscord_(webhookUrl, 'Torn Spy Coordinator test: ' + kind + ' Discord webhook is configured.');
  addAudit_(actor, kind + '_webhook_test_sent', '', 'Webhook test sent');
  return {
    ok:true,
    notified:true,
    status:'sent',
    checkedKeys: keys,
    foundKeys: _existingWebhookKeys_(keys),
    debug: webhookDebug_(input),
  };
}

function setOrderPrice_(input) {
  requireAdmin_(input);
  if (!String(input.requestId || '').trim()) throw new Error('requestId is required for setting order price.');
  return withScriptLock_(() => setOrderPriceUnlocked_(input));
}

function setOrderPriceUnlocked_(input) {
  requireAdmin_(input);
  const orderId = String(input.orderId || '').trim();
  const requestId = String(input.requestId || '').trim();
  if (!orderId) throw new Error('orderId is required.');
  assertOrderNotCancelled_(orderId);
  const amount = num_(input.amount);
  if (!amount || amount < 0) throw new Error('A positive price amount is required.');
  const targets = readObjectsWithRows_(SHEETS.targets).filter(r => String(r.orderId || '') === orderId);
  if (!targets.length) throw new Error('Order has no targets.');
  const mode = String(input.mode || 'perSpy').toLowerCase() === 'total' ? 'total' : 'perSpy';
  const pricePerSpy = mode === 'total' ? amount / targets.length : amount;
  const totalPrice = mode === 'total' ? amount : pricePerSpy * targets.length;
  const now = now_();
  const targetSheet = sheet_(SHEETS.targets);
  targets.forEach(target => {
    writeObjectAtRow_(targetSheet, target._row, {
      pricePerSpy: pricePerSpy,
      lastOperationId: requestId,
      updatedAt: now,
    });
  });
  const row = ensureOrderRow_(orderId);
  if (row) {
    writeObjectAtRow_(sheet_(SHEETS.orders), row._row, {
      targetCount: targets.length,
      pricePerSpy: pricePerSpy,
      totalPrice: totalPrice,
      updatedAt: now,
    });
  }
  recalculateOrderPaymentFromPayments_(orderId);
  ensureAuditOnce_(requestId, adminActor_(), 'order_price_set', orderId, mode + ': ' + amount);
  return { ok:true, orderId:orderId, mode:mode, pricePerSpy:pricePerSpy, totalPrice:totalPrice, targetCount:targets.length };
}

function latestPayloadForTarget_(targetRowId) {
  const rows = readObjects_(SHEETS.submissions).filter(r => String(r.targetRowId) === String(targetRowId));
  if (!rows.length) return null;
  const r = rows[rows.length - 1];
  return {
    submissionId: r.id,
    version: num_(r.version) || 1,
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
  const paymentRequired = bool_(target.paymentRequired);
  const baseStatus = paymentRequired ? 'awaiting_payment' : 'ready_for_work';
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
      orderStatus: baseStatus,
      paymentRequired: paymentRequired ? 'true' : '',
      paymentConfirmedAt: '',
      paymentConfirmedBy: '',
      paymentType: target.paymentType || 'money',
      deliveryMode: target.deliveryMode || 'manual',
      autoDeliver: bool_(target.autoDeliver) ? 'true' : '',
      customerDeliveryConfigured: customerWebhookForOrder_(target.orderId, target.customer) ? 'true' : '',
      deliveredAt: '',
      deliveryStatus: '',
      deliveryError: '',
      notes: '',
      createdAt: now,
      updatedAt: now,
    });
    return;
  }
  const targets = readObjects_(SHEETS.targets).filter(r => String(r.orderId) === String(target.orderId));
  const updates = {
    targetCount: targets.length,
    totalPrice: targets.reduce((sum, row) => sum + num_(row.pricePerSpy), 0),
    updatedAt: now,
  };
  if (paymentRequired && !bool_(existing.paymentRequired)) updates.paymentRequired = 'true';
  if (!existing.orderStatus) updates.orderStatus = normalizeOrderStatus_(Object.assign({}, existing, updates));
  if (!existing.customerDeliveryConfigured && customerWebhookForOrder_(target.orderId, target.customer)) updates.customerDeliveryConfigured = 'true';
  writeObjectAtRow_(sheet_(SHEETS.orders), existing._row, updates);
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

function normalizeOrderStatus_(order) {
  const status = String(order && order.orderStatus || '').trim();
  if (['closed','cancelled','delivered'].indexOf(status) !== -1) return status;
  if (bool_(order && order.paymentRequired) && String(order && order.paymentStatus || 'unpaid') !== 'paid') return 'awaiting_payment';
  if (order && order.deliveredAt) return 'delivered';
  if (order && order.completedAt) return 'ready_to_deliver';
  const orderId = order && order.orderId;
  if (orderId) {
    const targets = getOrderTargets_(orderId);
    if (targets.some(t => String(t.status || '') === 'submitted' && String(t.reviewStatus || 'pending_review') === 'pending_review')) return 'pending_review';
    if (targets.some(t => ['claimed','assigned'].indexOf(String(t.status || '')) !== -1 || String(t.claimedBy || '').trim())) return 'in_progress';
    if (targets.length) return 'ready_for_work';
  }
  return status || 'intake';
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
    orderStatus: first.customerPaymentStatus === 'paid' ? 'ready_for_work' : 'ready_for_work',
    paymentRequired: '',
    paymentConfirmedAt: '',
    paymentConfirmedBy: '',
    paymentType: 'money',
    deliveryMode: 'manual',
    autoDeliver: '',
    customerDeliveryConfigured: customerWebhookForOrder_(orderId, first.customer) ? 'true' : '',
    deliveredAt: '',
    deliveryStatus: '',
    deliveryError: '',
    notes: '',
    createdAt: now,
    updatedAt: now,
  });
  return readObjectsWithRows_(SHEETS.orders).find(r => String(r.orderId || '') === String(orderId || '')) || null;
}

function getOrderRow_(orderId) {
  return readObjectsWithRows_(SHEETS.orders)
    .find(row => String(row.orderId || '') === String(orderId || '')) || null;
}

function assertOrderNotCancelled_(orderOrId) {
  if (!orderOrId) return;
  const order = typeof orderOrId === 'object' ? orderOrId : getOrderRow_(orderOrId);
  if (order && normalizeOrderStatus_(order) === 'cancelled') {
    throw new Error('Order is cancelled. No further order activity is allowed.');
  }
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
  updates.customerDeliveryConfigured = customerWebhookForOrder_(orderId, completion.customer || order.customer) ? 'true' : '';
  updates.orderStatus = normalizeOrderStatus_(Object.assign({}, order, updates));
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
  const delivery = postDiscordEvent_('order_completion:' + orderId + ':' + String(synced.completedAt || row.completedAt || ''), 'order_completion', orderId, webhookUrl, content);
  if (!delivery.sent) return { ok:true, notified:false, status:delivery.status, eventId:delivery.eventId };
  writeObjectAtRow_(sheet_(SHEETS.orders), row._row, updates);
  ensureAuditOnce_(delivery.eventId, actor || 'system', 'order_completion_notified_auto', orderId, synced.customer || '');
  try {
    maybeAutoDeliverOrder_(orderId, actor || 'system');
  } catch (err) {
    addAudit_(actor || 'system', 'order_auto_delivery_failed', orderId, String(err && err.message || err));
  }
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
  assertOrderNotCancelled_(row);
  const actor = adminActor_();
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
    const delivery = postDiscordEvent_('order_completion:' + orderId + ':' + String(synced.completedAt || row.completedAt || ''), 'order_completion', orderId, webhookUrl, content);
    if (!delivery.sent) return { ok:true, notified:false, status:delivery.status, eventId:delivery.eventId };
    updates._eventId = delivery.eventId;
  }

  writeObjectAtRow_(sheet_(SHEETS.orders), row._row, updates);
  const completionOperationId = updates._eventId || '';
  delete updates._eventId;
  if (completionOperationId) ensureAuditOnce_(completionOperationId, actor, 'order_completion_notified', orderId, synced.customer || '');
  else addAudit_(actor, 'order_completion_marked_sent', orderId, synced.customer || '');
  if (!statusOnly) {
    try {
      maybeAutoDeliverOrder_(orderId, actor);
    } catch (err) {
      addAudit_(actor, 'order_auto_delivery_failed', orderId, String(err && err.message || err));
    }
  }
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
  assertOrderNotCancelled_(row);
  const actor = adminActor_();
  const orderStatus = normalizeOrderStatus_(row);
  if (orderStatus === 'awaiting_payment' || orderStatus === 'intake') {
    return { ok:true, notified:false, status:orderStatus };
  }
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
  const delivery = postDiscordEvent_('new_order:' + orderId, 'new_order', orderId, webhookUrl, content);
  if (!delivery.sent) return { ok:true, notified:false, status:delivery.status, eventId:delivery.eventId };
  writeObjectAtRow_(sheet_(SHEETS.orders), row._row, updates);
  ensureAuditOnce_(delivery.eventId, actor, 'new_order_notified', orderId, synced.customer || row.customer || '');
  return { ok:true, notified:true, status:'sent', eventId:delivery.eventId };
}

function setOrderAutomation_(input) {
  requireAdmin_(input);
  const orderId = String(input.orderId || '').trim();
  if (!orderId) throw new Error('orderId is required.');
  const row = ensureOrderRow_(orderId);
  if (!row) throw new Error('Order not found.');
  assertOrderNotCancelled_(row);
  const submittedWebhook = String(input.customerWebhookUrl || '').trim();
  if (submittedWebhook) {
    if (!/^https:\/\/discord\.com\/api\/webhooks\//i.test(submittedWebhook)) throw new Error('Customer webhook must be a Discord webhook URL.');
    _props().setProperty(CUSTOMER_WEBHOOK_PREFIX + normalizePropertyKey_(orderId), submittedWebhook);
  }
  const updates = {
    paymentRequired: bool_(input.paymentRequired) ? 'true' : '',
    paymentType: input.paymentType || row.paymentType || 'money',
    deliveryMode: input.deliveryMode || row.deliveryMode || 'manual',
    autoDeliver: bool_(input.autoDeliver) ? 'true' : '',
    customerDeliveryConfigured: customerWebhookForOrder_(orderId, row.customer) ? 'true' : '',
    updatedAt: now_(),
  };
  updates.orderStatus = normalizeOrderStatus_(Object.assign({}, row, updates));
  writeObjectAtRow_(sheet_(SHEETS.orders), row._row, updates);
  addAudit_(adminActor_(), 'order_automation_set', orderId, JSON.stringify({
    paymentRequired: !!updates.paymentRequired,
    paymentType: updates.paymentType,
    deliveryMode: updates.deliveryMode,
    autoDeliver: !!updates.autoDeliver,
    customerWebhookUpdated: !!submittedWebhook
  }));
  if (updates.orderStatus === 'ready_for_work') maybeSendNewOrderNotification_(orderId, adminActor_());
  return { ok:true, orderId:orderId, orderStatus:updates.orderStatus };
}

function confirmOrderPaymentIfPaid_(orderId, actor, skipNotification) {
  if (!orderId) return;
  const row = ensureOrderRow_(orderId);
  if (!row) return;
  const latest = readObjectsWithRows_(SHEETS.orders).find(r => String(r.orderId || '') === String(orderId || '')) || row;
  if (String(latest.paymentStatus || '') !== 'paid') return;
  const newlyConfirmed = !latest.paymentConfirmedAt;
  const updates = {
    paymentConfirmedAt: latest.paymentConfirmedAt || now_(),
    paymentConfirmedBy: latest.paymentConfirmedBy || actor || 'manager',
    orderStatus: normalizeOrderStatus_(latest),
    updatedAt: now_(),
  };
  writeObjectAtRow_(sheet_(SHEETS.orders), latest._row, updates);
  if (newlyConfirmed) addAudit_(actor || 'manager', 'order_payment_confirmed', orderId, latest.paymentStatus || 'paid');
  if (newlyConfirmed && !skipNotification) maybeSendNewOrderNotification_(orderId, actor || 'manager');
}

function maybeSendNewOrderNotification_(orderId, actor) {
  const row = ensureOrderRow_(orderId);
  if (!row) return { ok:true, skipped:true, status:'order_missing' };
  const normalized = normalizeOrderStatus_(row);
  if (normalized === 'awaiting_payment' || normalized === 'intake') return { ok:true, skipped:true, status:normalized };
  if (row.newOrderNotifiedAt && row.newOrderNotificationStatus === 'sent') return { ok:true, skipped:true, status:'already_sent' };
  try {
    return sendNewOrderNotification_({ orderId:orderId, admin:_adminKey(), actor:actor || 'system' });
  } catch (err) {
    addAudit_(actor || 'system', 'new_order_auto_notify_failed', orderId, String(err && err.message || err));
    return { ok:false, status:'failed', error:String(err && err.message || err) };
  }
}

function sendCustomerDelivery_(input) {
  requireAdmin_(input);
  const orderId = String(input.orderId || '').trim();
  if (!orderId) throw new Error('orderId is required.');
  const synced = syncOrderCompletion_(orderId);
  if (!synced || !synced.complete) throw new Error('Order is not ready to deliver.');
  const actor = adminActor_();
  const row = ensureOrderRow_(orderId);
  assertOrderNotCancelled_(row);
  const webhookUrl = customerWebhookForOrder_(orderId, synced.customer || row.customer);
  if (!webhookUrl) {
    markDeliveryFailed_(row, 'customer_webhook_missing', actor);
    return { ok:true, delivered:false, status:'customer_webhook_missing' };
  }
  const message = buildCustomerDeliveryMessage_(orderId);
  try {
    const delivery = postDiscordEvent_('customer_delivery:' + orderId, 'customer_delivery', orderId, webhookUrl, message);
    if (!delivery.sent) return { ok:true, delivered:false, status:delivery.status, eventId:delivery.eventId };
    markOrderDeliveredInternal_(orderId, actor, 'discord_webhook');
    return { ok:true, delivered:true, status:'sent', eventId:delivery.eventId };
  } catch (err) {
    markDeliveryFailed_(row, String(err && err.message || err), actor);
    throw err;
  }
}

function markOrderDelivered_(input) {
  requireAdmin_(input);
  const orderId = String(input.orderId || '').trim();
  if (!orderId) throw new Error('orderId is required.');
  markOrderDeliveredInternal_(orderId, adminActor_(), input.deliveryMode || 'manual');
  return { ok:true, orderId:orderId, status:'delivered' };
}

function cancelOrder_(input) {
  requireAdmin_(input);
  const orderId = String(input.orderId || '').trim();
  const reason = String(input.reason || '').trim();
  const requestId = String(input.requestId || '').trim();
  if (!orderId) throw new Error('orderId is required.');
  if (!reason) throw new Error('A cancellation reason is required.');
  if (!requestId) throw new Error('requestId is required for cancelling an order.');
  const actor = adminActor_();

  return withScriptLock_(() => {
    const order = getOrderRow_(orderId) || ensureOrderRow_(orderId);
    if (!order) throw new Error('Order not found.');
    const currentStatus = normalizeOrderStatus_(order);
    const sameOperation = String(order.cancelOperationId || '') === requestId;
    if (currentStatus === 'delivered' || currentStatus === 'closed') {
      throw new Error('Delivered or closed orders cannot be cancelled.');
    }
    if (currentStatus === 'cancelled' && !sameOperation) {
      throw new Error('Conflict: order is already cancelled.');
    }
    if (sameOperation && !sameText_(order.cancelReason, reason)) {
      throw new Error('Conflict: requestId was already used with another cancellation reason.');
    }

    const timestamp = order.cancelledAt || now_();
    if (currentStatus !== 'cancelled') {
      writeObjectAtRow_(sheet_(SHEETS.orders), order._row, {
        orderStatus:'cancelled',
        cancelledAt:timestamp,
        cancelledBy:actor,
        cancelReason:reason,
        cancelOperationId:requestId,
        autoDeliver:'',
        updatedAt:timestamp,
      });
    }

    const targetSheet = sheet_(SHEETS.targets);
    const targets = readObjectsWithRows_(SHEETS.targets)
      .filter(row => String(row.orderId || '') === orderId);
    let cancelledTargets = 0;
    targets.forEach(target => {
      if (String(target.status || '') === 'cancelled' && String(target.lastOperationId || '') === requestId) return;
      writeObjectAtRow_(targetSheet, target._row, {
        status:'cancelled',
        claimedBy:'',
        claimedAt:'',
        assignedTo:'',
        assignedAt:'',
        lastOperationId:requestId,
        version:(num_(target.version) || 1) + 1,
        updatedAt:timestamp,
      });
      cancelledTargets += 1;
    });

    const outboxSheet = sheet_(SHEETS.outbox);
    const outbox = readObjectsWithRows_(SHEETS.outbox)
      .filter(row => String(row.entityId || '') === orderId);
    let stoppedEvents = 0;
    let ambiguousEvents = 0;
    outbox.forEach(event => {
      const status = String(event.status || '');
      if (status === 'sent' || status === 'cancelled') return;
      if (status === 'sending' || status === 'unknown') {
        writeObjectAtRow_(outboxSheet, event._row, {
          status:'unknown',
          updatedAt:timestamp,
          lastError:'Order cancelled while provider outcome may be ambiguous; reconcile manually.',
        });
        ambiguousEvents += 1;
        return;
      }
      writeObjectAtRow_(outboxSheet, event._row, {
        status:'cancelled',
        updatedAt:timestamp,
        lastError:'Order cancelled before delivery.',
      });
      stoppedEvents += 1;
    });

    const activeCustomerPayments = readObjects_(SHEETS.customerPayments)
      .filter(row => String(row.orderId || '') === orderId && String(row.status || '') !== 'voided').length;
    const targetIds = new Set(targets.map(row => String(row.id || '')));
    const activeEmployeePayouts = readObjects_(SHEETS.employeePayouts)
      .filter(row => targetIds.has(String(row.targetRowId || '')) && String(row.status || '') !== 'voided').length;
    ensureAuditOnce_(requestId, actor, 'order_cancelled', orderId, JSON.stringify({
      reason:reason,
      targets:targets.length,
      activeCustomerPayments:activeCustomerPayments,
      activeEmployeePayouts:activeEmployeePayouts,
      stoppedOutboxEvents:stoppedEvents,
      ambiguousOutboxEvents:ambiguousEvents,
    }));
    return {
      ok:true,
      duplicate:currentStatus === 'cancelled',
      orderId:orderId,
      status:'cancelled',
      targetCount:targets.length,
      cancelledTargets:cancelledTargets,
      activeCustomerPayments:activeCustomerPayments,
      activeEmployeePayouts:activeEmployeePayouts,
      stoppedOutboxEvents:stoppedEvents,
      ambiguousOutboxEvents:ambiguousEvents,
    };
  });
}

function getAutomationDiagnostics_(input) {
  requireAdmin_(input);
  syncAllOrderCompletion_();
  const orders = readObjects_(SHEETS.orders).map(sanitizeOrderForClient_);
  return {
    ok:true,
    checkedAt: now_(),
    counts: {
      needsPayment: orders.filter(o => normalizeOrderStatus_(o) === 'awaiting_payment').length,
      readyForWork: orders.filter(o => normalizeOrderStatus_(o) === 'ready_for_work').length,
      readyToDeliver: orders.filter(o => normalizeOrderStatus_(o) === 'ready_to_deliver').length,
      deliveryFailed: orders.filter(o => String(o.deliveryStatus || '') === 'failed').length
    },
    customerWebhookConfigured: orders.filter(o => bool_(o.customerDeliveryConfigured)).length
  };
}

function maybeAutoDeliverOrder_(orderId, actor) {
  const row = ensureOrderRow_(orderId);
  if (!row || !bool_(row.autoDeliver)) return { ok:true, skipped:true, status:'manual_delivery' };
  return sendCustomerDelivery_({ orderId:orderId, admin:_adminKey(), actor:actor || 'system' });
}

function markOrderDeliveredInternal_(orderId, actor, mode) {
  const row = ensureOrderRow_(orderId);
  if (!row) throw new Error('Order not found.');
  assertOrderNotCancelled_(row);
  writeObjectAtRow_(sheet_(SHEETS.orders), row._row, {
    orderStatus: 'delivered',
    deliveredAt: now_(),
    deliveryStatus: 'sent',
    deliveryError: '',
    deliveryMode: mode || row.deliveryMode || 'manual',
    updatedAt: now_(),
  });
  addAudit_(actor || 'manager', 'order_delivered', orderId, mode || 'manual');
}

function markDeliveryFailed_(row, error, actor) {
  if (!row) return;
  writeObjectAtRow_(sheet_(SHEETS.orders), row._row, {
    deliveryStatus: 'failed',
    deliveryError: error || 'Unknown delivery error',
    updatedAt: now_(),
  });
  addAudit_(actor || 'manager', 'order_delivery_failed', row.orderId || '', error || '');
}

function customerWebhookForOrder_(orderId, customer) {
  const props = _props();
  const candidates = [
    CUSTOMER_WEBHOOK_PREFIX + normalizePropertyKey_(orderId),
    CUSTOMER_WEBHOOK_PREFIX + normalizePropertyKey_(customer)
  ].filter(key => key && key !== CUSTOMER_WEBHOOK_PREFIX);
  for (const key of candidates) {
    const value = props.getProperty(key);
    if (value) return value;
  }
  return '';
}

function normalizePropertyKey_(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function buildCustomerDeliveryMessage_(orderId) {
  const synced = calculateOrderCompletion_(orderId);
  const row = ensureOrderRow_(orderId) || {};
  const targets = getOrderTargets_(orderId);
  const approved = targets.filter(t => String(t.status || '') === 'submitted' && String(t.reviewStatus || '') === 'approved');
  if (!approved.length) throw new Error('No approved results in this order.');
  const results = approved.map(t => {
    const payload = latestPayloadForTarget_(t.id) || {};
    return payload.formatted || formatPayloadForDelivery_(t, payload);
  }).join('\n\n');
  const lines = [
    'Hi ' + (synced.customer || row.customer || 'there') + ',',
    '',
    'Your order ' + orderId + ' is complete.',
    '',
    'Delivered spies: ' + approved.length,
    'Total: ' + targets.length + ' spies'
  ];
  if (synced.totalPrice) lines.push('Price total: ' + Number(synced.totalPrice).toLocaleString());
  lines.push('', 'Results:', '', results);
  return lines.join('\n');
}

function formatPayloadForDelivery_(target, payload) {
  const fmt = function(value){ return value === '' || value == null ? 'N/A' : Number(value).toLocaleString(); };
  const name = payload.name || target.targetName || 'Unknown';
  const id = payload.targetId || target.targetId || '';
  return [
    'Name:' + name + (id ? ' [' + id + ']' : ''),
    '',
    'Level:' + (payload.level || target.level || '?'),
    '',
    'You managed to get the following results:',
    '',
    'Strength: ' + fmt(payload.strength),
    '',
    'Speed: ' + fmt(payload.speed),
    '',
    'Dexterity: ' + fmt(payload.dexterity),
    '',
    'Defense: ' + fmt(payload.defense),
    '',
    'Total: ' + fmt(payload.total)
  ].join('\n');
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
      payload: JSON.stringify({
        content: String(content || ''),
        allowed_mentions: { parse: [], users: [], roles: [] },
      }),
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

function postDiscordEvent_(eventId, eventType, entityId, webhookUrl, content) {
  const reservation = withScriptLock_(() => {
    const rows = readObjectsWithRows_(SHEETS.outbox);
    const existing = rows.find(row => String(row.eventId || '') === String(eventId));
    if (existing && String(existing.status || '') === 'sent') {
      return { send:false, sent:true, status:'sent', eventId:eventId };
    }
    if (existing && String(existing.status || '') === 'cancelled') {
      return { send:false, sent:false, status:'cancelled', eventId:eventId };
    }
    if (existing && (String(existing.status || '') === 'sending' || String(existing.status || '') === 'unknown')) {
      return { send:false, sent:false, status:String(existing.status), eventId:eventId };
    }
    if (existing) {
      writeObjectAtRow_(sheet_(SHEETS.outbox), existing._row, {
        status:'sending',
        attempts:num_(existing.attempts) + 1,
        updatedAt:now_(),
        lastError:'',
      });
    } else {
      appendObject_(SHEETS.outbox, {
        eventId:eventId,
        eventType:eventType,
        entityId:entityId,
        status:'sending',
        attempts:1,
        payload:content,
        createdAt:now_(),
        updatedAt:now_(),
        sentAt:'',
        lastError:'',
      });
    }
    return { send:true, sent:false, status:'sending', eventId:eventId };
  });
  if (!reservation.send) return reservation;
  try {
    postDiscord_(webhookUrl, content);
    withScriptLock_(() => updateOutboxEvent_(eventId, {
      status:'sent',
      sentAt:now_(),
      updatedAt:now_(),
      lastError:'',
    }));
    return { sent:true, status:'sent', eventId:eventId };
  } catch (err) {
    const message = String(err && err.message || err);
    const definiteFailure = /HTTP\s+\d+/i.test(message);
    withScriptLock_(() => updateOutboxEvent_(eventId, {
      status:definiteFailure ? 'failed' : 'unknown',
      updatedAt:now_(),
      lastError:message,
    }));
    throw err;
  }
}

function updateOutboxEvent_(eventId, updates) {
  const row = readObjectsWithRows_(SHEETS.outbox).find(item => String(item.eventId || '') === String(eventId));
  if (!row) throw new Error('Outbox event not found.');
  if (String(row.status || '') === 'cancelled') {
    throw new Error('Outbox event belongs to a cancelled order and cannot be retried.');
  }
  writeObjectAtRow_(sheet_(SHEETS.outbox), row._row, updates);
}

function reconcileOutbox_(input) {
  requireAdmin_(input);
  const staleMs = Math.max(60000, num_(input.staleMs) || 15 * 60 * 1000);
  const cutoff = Date.now() - staleMs;
  let markedUnknown = 0;
  withScriptLock_(() => {
    readObjectsWithRows_(SHEETS.outbox).forEach(row => {
      const updatedAt = new Date(row.updatedAt || row.createdAt || 0).getTime();
      if (String(row.status || '') === 'sending' && (!updatedAt || updatedAt <= cutoff)) {
        writeObjectAtRow_(sheet_(SHEETS.outbox), row._row, {
          status:'unknown',
          updatedAt:now_(),
          lastError:'Stale sending lease; provider result requires operator reconciliation.',
        });
        markedUnknown += 1;
      }
    });
  });
  return { ok:true, markedUnknown:markedUnknown };
}

function retryOutboxEvent_(input) {
  requireAdmin_(input);
  const eventId = String(input.eventId || '').trim();
  if (!eventId) throw new Error('eventId is required.');
  const row = readObjects_(SHEETS.outbox).find(item => String(item.eventId || '') === eventId);
  if (!row) throw new Error('Outbox event not found.');
  if (String(row.status || '') === 'sent') {
    reconcileOutboxEntity_(row);
    return { ok:true, skipped:true, status:'sent', eventId:eventId };
  }
  const order = getOrderRow_(row.entityId);
  if (order && normalizeOrderStatus_(order) === 'cancelled') {
    throw new Error('Outbox event belongs to a cancelled order and cannot be retried.');
  }
  if (String(row.status || '') === 'unknown' && !bool_(input.confirmUnknown)) {
    throw new Error('Unknown provider result requires explicit confirmUnknown before retry.');
  }
  const webhookUrl = webhookForOutboxEvent_(row);
  if (!webhookUrl) throw new Error('Webhook is not configured for this outbox event.');
  withScriptLock_(() => updateOutboxEvent_(eventId, { status:'failed', updatedAt:now_() }));
  const result = postDiscordEvent_(eventId, row.eventType, row.entityId, webhookUrl, row.payload || '');
  if (result.sent) reconcileOutboxEntity_(Object.assign({}, row, { status:'sent' }));
  return Object.assign({ ok:true }, result);
}

function webhookForOutboxEvent_(row) {
  if (String(row.eventType || '') === 'new_order') return _employeeDiscordWebhookUrl();
  if (String(row.eventType || '') === 'order_completion') return _managerDiscordWebhookUrl();
  if (String(row.eventType || '') === 'customer_delivery') {
    const order = ensureOrderRow_(row.entityId);
    return customerWebhookForOrder_(row.entityId, order && order.customer);
  }
  return '';
}

function reconcileOutboxEntity_(event) {
  const eventType = String(event.eventType || '');
  const entityId = String(event.entityId || '');
  const row = readObjectsWithRows_(SHEETS.orders).find(item => String(item.orderId || '') === entityId);
  if (!row) return;
  if (normalizeOrderStatus_(row) === 'cancelled') return;
  const actor = adminActor_();
  if (eventType === 'new_order') {
    writeObjectAtRow_(sheet_(SHEETS.orders), row._row, {
      newOrderNotifiedAt:row.newOrderNotifiedAt || now_(),
      newOrderNotificationStatus:'sent',
      updatedAt:now_(),
    });
    ensureAuditOnce_(event.eventId, actor, 'new_order_notified', entityId, row.customer || '');
  } else if (eventType === 'order_completion') {
    writeObjectAtRow_(sheet_(SHEETS.orders), row._row, {
      completedAt:row.completedAt || now_(),
      completionNotifiedAt:row.completionNotifiedAt || now_(),
      completionNotificationStatus:'sent',
      updatedAt:now_(),
    });
    ensureAuditOnce_(event.eventId, actor, 'order_completion_notified', entityId, row.customer || '');
  } else if (eventType === 'customer_delivery') {
    writeObjectAtRow_(sheet_(SHEETS.orders), row._row, {
      orderStatus:'delivered',
      deliveredAt:row.deliveredAt || now_(),
      deliveryStatus:'sent',
      deliveryError:'',
      updatedAt:now_(),
    });
    ensureAuditOnce_(event.eventId, actor, 'order_delivered', entityId, 'discord_webhook');
  }
}

function updateOrderPayment_(orderId, status) {
  if (!orderId) return;
  const row = readObjectsWithRows_(SHEETS.orders).find(r => String(r.orderId) === String(orderId));
  if (row) writeObjectAtRow_(sheet_(SHEETS.orders), row._row, { paymentStatus: status, updatedAt: now_() });
}

function recalculateOrderPaymentFromPayments_(orderId) {
  if (!orderId) return;
  const row = readObjectsWithRows_(SHEETS.orders).find(r => String(r.orderId) === String(orderId));
  if (!row) return;
  const active = readObjects_(SHEETS.customerPayments)
    .filter(payment => String(payment.orderId || '') === String(orderId))
    .filter(payment => ['paid','partial'].indexOf(String(payment.status || '').toLowerCase()) !== -1);
  const paidAmount = active.reduce((sum, payment) => sum + num_(payment.amount), 0);
  const totalPrice = num_(row.totalPrice);
  const explicitPaid = active.some(payment => String(payment.status || '').toLowerCase() === 'paid');
  let status = 'unpaid';
  if (paidAmount > 0 && totalPrice > 0 && paidAmount >= totalPrice) status = 'paid';
  else if (paidAmount > 0 && !totalPrice && explicitPaid) status = 'paid';
  else if (paidAmount > 0) status = 'partial';
  const updates = { paymentStatus: status, updatedAt: now_() };
  if (status === 'paid') {
    updates.paymentConfirmedAt = row.paymentConfirmedAt || now_();
    updates.orderStatus = normalizeOrderStatus_(Object.assign({}, row, updates));
  }
  writeObjectAtRow_(sheet_(SHEETS.orders), row._row, updates);
}

function calculateTargetEmployeePayoutStatus_(targetRowId) {
  if (!targetRowId) return 'unpaid';
  const target = readObjects_(SHEETS.targets).find(row => String(row.id || '') === String(targetRowId));
  const owed = num_(target && target.employeeRate);
  const active = readObjects_(SHEETS.employeePayouts)
    .filter(payout => String(payout.targetRowId || '') === String(targetRowId));
  const paidAmount = active
    .filter(payout => String(payout.status || '').toLowerCase() === 'paid')
    .reduce((sum, payout) => sum + num_(payout.amount), 0);
  const queuedAmount = active
    .filter(payout => String(payout.status || '').toLowerCase() === 'queued')
    .reduce((sum, payout) => sum + num_(payout.amount), 0);
  if (owed > 0 && paidAmount >= owed) return 'paid';
  if (owed <= 0 && paidAmount > 0) return 'paid';
  if (paidAmount > 0 || queuedAmount > 0) return 'queued';
  return 'unpaid';
}

function updateTarget_(id, updater) {
  // Only read the header and the id column to find the row number, then update just that row.
  const sheet = sheet_(SHEETS.targets);
  const headers = sheetHeaders_(sheet);
  const idCol = headers.indexOf('id') + 1;
  if (!idCol) throw new Error('Targets sheet is missing the id header.');
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
  const rowValues = sheet.getRange(foundRow, 1, 1, headers.length).getValues()[0];
  const rowObj = { _row: foundRow };
  headers.forEach((h, idx) => rowObj[h] = rowValues[idx]);
  const next = updater(Object.assign({}, rowObj));
  const merged = Object.assign({}, rowObj, next);
  merged.version = (num_(rowObj.version) || 1) + 1;
  sheet.getRange(foundRow, 1, 1, headers.length)
    .setValues([headers.map(h => sheetCellValue_(SHEETS.targets, h, merged[h]))]);
  SpreadsheetApp.flush();
  return merged;
}

function getTargetById_(id) {
  const row = readObjectsWithRows_(SHEETS.targets).find(r => String(r.id) === String(id));
  if (!row) throw new Error('Target not found.');
  return row;
}

function addAudit_(actor, action, targetId, details, operationId) {
  appendObject_(SHEETS.auditLog, {
    timestamp: now_(),
    actor: actor || '',
    action: action || '',
    targetId: targetId || '',
    details: details || '',
    operationId: operationId || '',
  });
  return { ok:true };
}

function withScriptLock_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Conflict: another operation is in progress.');
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
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
  const current = sheetHeaders_(sheet);
  const populated = current.filter(String);
  const duplicates = populated.filter((header, index) => populated.indexOf(header) !== index);
  if (duplicates.length) {
    throw new Error('Duplicate headers in ' + sheet.getName() + ': ' +
      Array.from(new Set(duplicates)).join(', '));
  }
  const missing = expectedHeaders.filter(h => current.indexOf(h) === -1);
  if (!missing.length) return;
  sheet.getRange(1, lastColumn + 1, 1, missing.length).setValues([missing]);
}

function sheetHeaders_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map(value => String(value || '').trim());
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
  const headers = sheetHeaders_(s);
  s.appendRow(headers.map(h => sheetCellValue_(name, h, obj[h])));
}

function appendObjects_(name, objects) {
  if (!objects.length) return;
  const s = sheet_(name);
  const headers = sheetHeaders_(s);
  const values = objects.map(obj => headers.map(h => sheetCellValue_(name, h, obj[h])));
  s.getRange(s.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
}

function writeObjectAtRow_(sheet, rowNumber, obj) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  headers.forEach((h, i) => {
    if (Object.prototype.hasOwnProperty.call(obj, h)) {
      sheet.getRange(rowNumber, i + 1).setValue(sheetCellValue_(sheet.getName(), h, obj[h]));
    }
  });
}

const NUMERIC_SHEET_FIELDS = {
  Targets: ['level','pricePerSpy','employeeRate'],
  Submissions: ['level','strength','speed','dexterity','defense','total'],
  Orders: ['targetCount','pricePerSpy','totalPrice'],
  Employees: ['defaultRate'],
  CustomerPayments: ['amount'],
  EmployeePayouts: ['amount'],
  DeliveryHistory: ['level'],
};

function sanitizeSheetText_(value) {
  if (value == null) return '';
  const text = String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function sheetCellValue_(sheetName, header, value) {
  if (value == null) return '';
  const numeric = NUMERIC_SHEET_FIELDS[sheetName] || [];
  if (numeric.indexOf(header) < 0) return sanitizeSheetText_(value);
  if (value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value).trim();
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  return sanitizeSheetText_(value);
}

function getInput_(e, method) {
  let input = {};
  if (method === 'POST' && e.postData && e.postData.contents) {
    try { input = JSON.parse(e.postData.contents); } catch (_) {}
  }
  if (e.parameter && e.parameter.payload) throw new Error('Query payloads are not supported.');
  Object.keys(e.parameter || {}).forEach(k => {
    if (k !== 'payload' && k !== 'key' && k !== 'admin') input[k] = e.parameter[k];
  });
  if ((e.parameter || {}).key || (e.parameter || {}).admin) {
    throw new Error('Credentials must be sent in the POST body.');
  }
  return input;
}

function validateAccess_(input, method) {
  if (method !== 'POST') throw new Error('Authenticated requests require POST.');
  const key = String(input.key || '');
  const accessMap = _employeeAccessMap_();
  if (Object.prototype.hasOwnProperty.call(accessMap, key)) {
    input._actor = String(accessMap[key] || '').trim();
    if (!input._actor) throw new Error('Employee identity is not configured for this access code.');
    return;
  }
  const expected = _apiKey();
  if (expected && key === expected) {
    input._legacyAccess = true;
    return;
  }
  throw new Error('Invalid access code.');
}

function requireAdmin_(input) {
  const expected = _adminKey();
  if (!expected) throw new Error('Admin key is not configured server-side.');
  if (String(input.admin || '') !== expected) throw new Error('Admin key required.');
}

function adminActor_() {
  return String(_props().getProperty('ADMIN_ACTOR') || 'manager');
}

function canonicalActor_(input, options) {
  options = options || {};
  if (input && input._actor) return String(input._actor);
  if (input && String(input.admin || '') === _adminKey() && _adminKey()) {
    return adminActor_();
  }
  if (options.allowLegacy && input && input._legacyAccess) {
    return String(input.employee || '').trim();
  }
  throw new Error('Individual employee access is required for this action.');
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

function bool_(value) {
  if (value === true) return true;
  const text = String(value || '').trim().toLowerCase();
  return ['true','1','yes','y','on','paid','enabled'].indexOf(text) !== -1;
}

function sameText_(left, right) {
  return String(left == null ? '' : left) === String(right == null ? '' : right);
}
