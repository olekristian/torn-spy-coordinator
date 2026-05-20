const TABLES = {
  firms: ["id", "name", "type", "discord_webhook", "created_at"],
  users: ["id", "name", "email", "password_hash", "created_at"],
  memberships: ["id", "user_id", "firm_id", "role", "status", "created_at"],
  seller_profiles: ["id", "user_id", "status", "manual_capable", "api_connected", "payout_handle", "notes", "rate_card", "specialties", "created_at"],
  orders: ["id", "order_number", "client_firm_id", "requested_by_user_id", "created_by_user_id", "title", "due_date", "agreed_price", "notes", "status", "payment_status", "completed_at", "notification_sent_at", "created_at"],
  order_items: ["id", "order_id", "target_name", "target_id", "notes", "status", "claimed_by_user_id", "completed_by_user_id", "submitted_by_user_id", "payout_status", "payout_amount", "created_at", "completed_at"],
  submissions: ["id", "item_id", "raw_spy", "parsed_name", "target_id", "level", "strength", "speed", "dexterity", "defense", "total", "missing_stats", "created_by_user_id", "completed_by_user_id", "created_at"],
  payments: ["id", "order_id", "amount", "status", "note", "created_by_user_id", "created_at"],
  payouts: ["id", "item_id", "user_id", "amount", "status", "notes", "created_at", "updated_at"],
  notifications: ["id", "type", "order_id", "target", "status", "message", "created_at"],
  api_consents: ["id", "user_id", "masked_key", "scope", "note", "status", "consented_at", "revoked_at"],
  invitations: ["id", "token", "email", "role", "firm_id", "invited_by_user_id", "note", "status", "expires_at", "created_at", "accepted_by_user_id", "accepted_at"],
  sessions: ["token", "user_id", "created_at"]
};

function doGet() {
  return jsonResponse(true, { ok: true, backend: "google-sheets" });
}

function doPost(e) {
  try {
    ensureSchema();
    seedDatabase();
    const request = JSON.parse((e.postData && e.postData.contents) || "{}");
    const route = String(request.route || "");
    const body = request.body || {};
    const auth = publicRoute(route) ? null : authFromToken(request.token);
    const data = dispatch(route, body, auth);
    return jsonResponse(true, data);
  } catch (error) {
    return jsonResponse(false, null, String(error && error.message ? error.message : error));
  }
}

function dispatch(route, body, auth) {
  if (route === "/auth/login") return login(body);
  if (route === "/register/seller") return registerSeller(body);
  if (route === "/register/client") return registerClient(body);
  if (route === "/invites/accept") return acceptInvite(body);
  if (route === "/bootstrap") return bootstrapPayload(auth.user.id);
  if (route === "/api-consents") return saveApiConsent(body, auth);
  if (route === "/api-consents/active") return revokeApiConsent(auth);
  if (route === "/members") return createMember(body, auth);
  if (route === "/invites") return createInvite(body, auth);
  if (route === "/orders") return createOrder(body, auth);
  if (/^\/orders\/[^/]+\/items$/.test(route)) return addOrderItems(route.split("/")[2], body, auth);
  if (/^\/orders\/[^/]+\/status$/.test(route)) return updateOrderStatus(route.split("/")[2], body, auth);
  if (/^\/orders\/[^/]+\/details$/.test(route)) return updateOrderDetails(route.split("/")[2], body, auth);
  if (/^\/items\/[^/]+\/claim$/.test(route)) return claimItem(route.split("/")[2], auth);
  if (/^\/items\/[^/]+\/unclaim$/.test(route)) return unclaimItem(route.split("/")[2], auth);
  if (/^\/items\/[^/]+\/submit$/.test(route)) return submitItem(route.split("/")[2], body, auth);
  if (route === "/payments") return addPayment(body, auth);
  if (/^\/payouts\/[^/]+\/status$/.test(route)) return updatePayoutStatus(route.split("/")[2], body, auth);
  if (/^\/sellers\/[^/]+\/status$/.test(route)) return updateSellerStatus(route.split("/")[2], body, auth);
  if (/^\/firms\/[^/]+$/.test(route)) return updateFirm(route.split("/")[2], body, auth);
  throw new Error("Unknown route: " + route);
}

function publicRoute(route) {
  return ["/auth/login", "/register/seller", "/register/client", "/invites/accept"].indexOf(route) !== -1;
}

function spreadsheet() {
  const configured = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (configured) return SpreadsheetApp.openById(configured);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const created = SpreadsheetApp.create("Torn Spy Portal Data");
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", created.getId());
  return created;
}

function ensureSchema() {
  const ss = spreadsheet();
  Object.keys(TABLES).forEach(function(name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = TABLES[name];
    const existing = sh.getRange(1, 1, 1, Math.max(headers.length, sh.getLastColumn() || 1)).getValues()[0].filter(String);
    if (existing.join("|") !== headers.join("|")) {
      sh.clear();
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    }
  });
}

function rows(table) {
  const sh = spreadsheet().getSheetByName(table);
  const headers = TABLES[table];
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, headers.length).getValues().map(function(values, index) {
    const row = { _rowNumber: index + 2 };
    headers.forEach(function(header, i) { row[header] = values[i]; });
    return row;
  });
}

function insertRow(table, row) {
  const headers = TABLES[table];
  spreadsheet().getSheetByName(table).appendRow(headers.map(function(header) {
    return row[header] == null ? "" : row[header];
  }));
}

function updateRow(table, idColumn, idValue, updates) {
  const sh = spreadsheet().getSheetByName(table);
  const headers = TABLES[table];
  const row = rows(table).find(function(entry) { return String(entry[idColumn]) === String(idValue); });
  if (!row) throw new Error(table + " row not found.");
  Object.keys(updates).forEach(function(key) {
    const col = headers.indexOf(key);
    if (col >= 0) sh.getRange(row._rowNumber, col + 1).setValue(updates[key]);
  });
}

function createId(prefix) {
  return prefix + "_" + Utilities.getUuid().slice(0, 8);
}

function now() {
  return new Date().toISOString();
}

function hashPassword(password) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password || ""), Utilities.Charset.UTF_8);
  return bytes.map(function(byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ("0" + value.toString(16)).slice(-2);
  }).join("");
}

function jsonResponse(ok, data, error) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: ok, data: data || null, error: error || "" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function seedDatabase() {
  if (rows("users").length) return;
  const serviceFirmId = createId("firm");
  const clientFirmId = createId("firm");
  const adminId = createId("user");
  const coordinatorId = createId("user");
  const requesterId = createId("user");
  const orderId = createId("order");
  insertRow("firms", { id: serviceFirmId, name: "Bring Em Closer", type: "service", discord_webhook: "", created_at: now() });
  insertRow("firms", { id: clientFirmId, name: "Helsing Legal", type: "client", discord_webhook: "", created_at: now() });
  insertRow("users", { id: adminId, name: "Portal Admin", email: "admin@spyportal.local", password_hash: hashPassword("admin123"), created_at: now() });
  insertRow("users", { id: coordinatorId, name: "Case Coordinator", email: "coord@spyportal.local", password_hash: hashPassword("coord123"), created_at: now() });
  insertRow("users", { id: requesterId, name: "Client Contact", email: "client@helsing.local", password_hash: hashPassword("client123"), created_at: now() });
  insertRow("memberships", { id: createId("mem"), user_id: adminId, firm_id: serviceFirmId, role: "super_admin", status: "active", created_at: now() });
  insertRow("memberships", { id: createId("mem"), user_id: coordinatorId, firm_id: serviceFirmId, role: "coordinator", status: "active", created_at: now() });
  insertRow("memberships", { id: createId("mem"), user_id: requesterId, firm_id: clientFirmId, role: "lawfirm_admin", status: "active", created_at: now() });
  insertRow("orders", { id: orderId, order_number: "ORD-0001", client_firm_id: clientFirmId, requested_by_user_id: requesterId, created_by_user_id: coordinatorId, title: "Opening order", due_date: "", agreed_price: 0, notes: "Seeded Google Sheets order.", status: "open", payment_status: "unpaid", completed_at: "", notification_sent_at: "", created_at: now() });
  insertRow("order_items", { id: createId("item"), order_id: orderId, target_name: "TargetOne", target_id: "1111111", notes: "", status: "open", claimed_by_user_id: "", completed_by_user_id: "", submitted_by_user_id: "", payout_status: "unpaid", payout_amount: 3500000, created_at: now(), completed_at: "" });
  insertRow("order_items", { id: createId("item"), order_id: orderId, target_name: "TargetTwo", target_id: "2222222", notes: "", status: "open", claimed_by_user_id: "", completed_by_user_id: "", submitted_by_user_id: "", payout_status: "unpaid", payout_amount: 3500000, created_at: now(), completed_at: "" });
}

function login(body) {
  const email = String(body.email || "").trim().toLowerCase();
  const user = rows("users").find(function(entry) { return String(entry.email).toLowerCase() === email; });
  if (!user || user.password_hash !== hashPassword(body.password || "")) throw new Error("Invalid email or password.");
  const token = createId("sess") + "_" + Utilities.getUuid();
  insertRow("sessions", { token: token, user_id: user.id, created_at: now() });
  return { token: token, bootstrap: bootstrapPayload(user.id) };
}

function authFromToken(token) {
  const session = rows("sessions").find(function(entry) { return entry.token === token; });
  if (!session) throw new Error("Invalid token.");
  const user = rows("users").find(function(entry) { return entry.id === session.user_id; });
  if (!user) throw new Error("User not found.");
  return { user: publicUser(user), memberships: activeMemberships(user.id) };
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, created_at: user.created_at };
}

function activeMemberships(userId) {
  return rows("memberships").filter(function(entry) { return entry.user_id === userId && entry.status === "active"; });
}

function primaryMembership(userId) {
  return activeMemberships(userId)[0] || null;
}

function currentRole(auth) {
  return auth && auth.memberships[0] ? auth.memberships[0].role : "";
}

function requireRole(auth, allowed) {
  if (allowed.indexOf(currentRole(auth)) === -1) throw new Error("Forbidden.");
}

function visibleOrders(userId) {
  const membership = primaryMembership(userId);
  if (!membership) return [];
  if (["super_admin", "coordinator", "spy_seller"].indexOf(membership.role) !== -1) return rows("orders");
  return rows("orders").filter(function(order) { return order.client_firm_id === membership.firm_id; });
}

function bootstrapPayload(userId) {
  const orderList = visibleOrders(userId);
  const orderIds = {};
  orderList.forEach(function(order) { orderIds[order.id] = true; });
  const itemList = rows("order_items").filter(function(item) { return orderIds[item.order_id]; });
  const itemIds = {};
  itemList.forEach(function(item) { itemIds[item.id] = true; });
  const allUsers = rows("users").map(publicUser);
  return {
    user: publicUser(rows("users").find(function(user) { return user.id === userId; })),
    users: allUsers,
    memberships: activeMemberships(userId),
    firms: rows("firms"),
    sellerProfiles: rows("seller_profiles"),
    orders: orderList.sort(desc("created_at")),
    orderItems: itemList.sort(desc("created_at")),
    submissions: rows("submissions").filter(function(sub) { return itemIds[sub.item_id]; }).sort(desc("created_at")),
    payments: rows("payments").filter(function(payment) { return orderIds[payment.order_id]; }).sort(desc("created_at")),
    payouts: rows("payouts").filter(function(payout) { return itemIds[payout.item_id]; }).sort(desc("created_at")),
    notifications: rows("notifications").filter(function(note) { return !note.order_id || orderIds[note.order_id]; }).sort(desc("created_at")).slice(0, 25),
    invitations: rows("invitations"),
    apiConsents: rows("api_consents").filter(function(entry) { return entry.user_id === userId; }).sort(desc("consented_at"))
  };
}

function desc(field) {
  return function(a, b) { return String(b[field] || "").localeCompare(String(a[field] || "")); };
}

function parseTargetLines(input) {
  const seen = {};
  return String(input || "").split(/\r?\n/).map(function(rawLine) {
    const line = rawLine.trim();
    if (!line) return null;
    let name = "";
    let targetId = "";
    const bracket = line.match(/^(.+?)\s*[\[(]([0-9]{3,})[\])]/);
    const same = line.match(/(.+?)https?:\/\/www\.torn\.com\/profiles\.php\?XID=([0-9]{3,})/i);
    if (bracket) {
      name = bracket[1].trim();
      targetId = bracket[2];
    } else if (same) {
      name = same[1].trim();
      targetId = same[2];
    } else {
      const cols = line.split(/\t|,|\|/).map(function(part) { return part.trim(); }).filter(Boolean);
      name = cols[0] || "";
      targetId = cols[1] ? cols[1].replace(/\D/g, "") : "";
    }
    const key = name.toLowerCase() + "::" + targetId;
    if (!name || seen[key]) return null;
    seen[key] = true;
    return { name: name, targetId: targetId };
  }).filter(Boolean);
}

function createOrder(body, auth) {
  requireRole(auth, ["super_admin", "coordinator", "lawfirm_admin", "client_requester"]);
  const targets = parseTargetLines(body.targets);
  if (!targets.length) throw new Error("No valid targets detected.");
  const membership = primaryMembership(auth.user.id);
  const orderId = createId("order");
  insertRow("orders", { id: orderId, order_number: String(body.orderNumber || "").trim(), client_firm_id: String(body.clientFirmId || membership.firm_id), requested_by_user_id: auth.user.id, created_by_user_id: auth.user.id, title: String(body.title || "").trim(), due_date: String(body.dueDate || ""), agreed_price: Number(body.agreedPrice || 0), notes: String(body.notes || ""), status: "open", payment_status: "unpaid", completed_at: "", notification_sent_at: "", created_at: now() });
  targets.forEach(function(target) { insertOrderItem(orderId, target, Number(body.defaultPayout || 0)); });
  return { orderId: orderId };
}

function insertOrderItem(orderId, target, payoutAmount) {
  insertRow("order_items", { id: createId("item"), order_id: orderId, target_name: target.name, target_id: target.targetId, notes: "", status: "open", claimed_by_user_id: "", completed_by_user_id: "", submitted_by_user_id: "", payout_status: "unpaid", payout_amount: payoutAmount, created_at: now(), completed_at: "" });
}

function addOrderItems(orderId, body, auth) {
  requireRole(auth, ["super_admin", "coordinator", "lawfirm_admin", "client_requester"]);
  const order = visibleOrders(auth.user.id).find(function(entry) { return entry.id === orderId; });
  if (!order) throw new Error("Order not found.");
  const targets = parseTargetLines(body.targets);
  if (!targets.length) throw new Error("No valid targets detected.");
  targets.forEach(function(target) { insertOrderItem(orderId, target, Number(body.defaultPayout || 0)); });
  if (["completed", "delivered", "closed"].indexOf(order.status) !== -1) updateRow("orders", "id", orderId, { status: "open", completed_at: "" });
  return { ok: true, added: targets.length };
}

function updateOrderStatus(orderId, body, auth) {
  requireRole(auth, ["super_admin", "coordinator", "lawfirm_admin"]);
  const status = String(body.status || "open");
  updateRow("orders", "id", orderId, { status: status, completed_at: ["closed", "delivered"].indexOf(status) !== -1 ? now() : "" });
  return { ok: true };
}

function updateOrderDetails(orderId, body, auth) {
  requireRole(auth, ["super_admin", "coordinator", "lawfirm_admin", "client_requester"]);
  updateRow("orders", "id", orderId, { order_number: String(body.orderNumber || "").trim() });
  return { ok: true };
}

function claimItem(itemId, auth) {
  updateRow("order_items", "id", itemId, { claimed_by_user_id: auth.user.id, status: "claimed" });
  return { ok: true };
}

function unclaimItem(itemId) {
  updateRow("order_items", "id", itemId, { claimed_by_user_id: "", status: "open" });
  return { ok: true };
}

function submitItem(itemId, body, auth) {
  const item = rows("order_items").find(function(entry) { return entry.id === itemId; });
  if (!item) throw new Error("Item not found.");
  const completedByUserId = String(body.completedByUserId || auth.user.id);
  updateRow("order_items", "id", itemId, { status: "submitted", completed_by_user_id: completedByUserId, submitted_by_user_id: auth.user.id, completed_at: now() });
  const stats = body.stats || {};
  insertRow("submissions", { id: createId("sub"), item_id: itemId, raw_spy: String(body.rawSpy || ""), parsed_name: String(body.parsedName || item.target_name), target_id: String(body.targetId || item.target_id || ""), level: body.level || "", strength: stats.strength == null ? "" : stats.strength, speed: stats.speed == null ? "" : stats.speed, dexterity: stats.dexterity == null ? "" : stats.dexterity, defense: stats.defense == null ? "" : stats.defense, total: stats.total == null ? "" : stats.total, missing_stats: Array.isArray(body.missingStats) ? body.missingStats.join(",") : "", created_by_user_id: auth.user.id, completed_by_user_id: completedByUserId, created_at: now() });
  insertRow("payouts", { id: createId("payout"), item_id: itemId, user_id: completedByUserId, amount: Number(body.payoutAmount || item.payout_amount || 0), status: String(body.payoutStatus || "queued"), notes: String(body.payoutNotes || ""), created_at: now(), updated_at: "" });
  return { ok: true };
}

function addPayment(body, auth) {
  requireRole(auth, ["super_admin", "coordinator", "lawfirm_admin"]);
  insertRow("payments", { id: createId("pay"), order_id: String(body.orderId || ""), amount: Number(body.amount || 0), status: String(body.status || "unpaid"), note: String(body.note || ""), created_by_user_id: auth.user.id, created_at: now() });
  return { ok: true };
}

function updatePayoutStatus(payoutId, body, auth) {
  requireRole(auth, ["super_admin", "coordinator"]);
  updateRow("payouts", "id", payoutId, { status: String(body.status || "queued"), updated_at: now() });
  return { ok: true };
}

function updateSellerStatus(userId, body, auth) {
  requireRole(auth, ["super_admin", "coordinator", "lawfirm_admin"]);
  updateRow("seller_profiles", "user_id", userId, { status: String(body.status || "pending") });
  return { ok: true };
}

function updateFirm(firmId, body, auth) {
  requireRole(auth, ["super_admin", "lawfirm_admin", "coordinator"]);
  updateRow("firms", "id", firmId, { name: String(body.name || ""), discord_webhook: String(body.discordWebhook || "") });
  return { ok: true };
}

function saveApiConsent(body, auth) {
  rows("api_consents").filter(function(entry) { return entry.user_id === auth.user.id && entry.status === "active"; }).forEach(function(entry) {
    updateRow("api_consents", "id", entry.id, { status: "replaced" });
  });
  insertRow("api_consents", { id: createId("consent"), user_id: auth.user.id, masked_key: String(body.maskedKey || ""), scope: String(body.scope || ""), note: String(body.note || ""), status: "active", consented_at: now(), revoked_at: "" });
  return { ok: true };
}

function revokeApiConsent(auth) {
  rows("api_consents").filter(function(entry) { return entry.user_id === auth.user.id && entry.status === "active"; }).forEach(function(entry) {
    updateRow("api_consents", "id", entry.id, { status: "revoked", revoked_at: now() });
  });
  return { ok: true };
}

function registerSeller(body) {
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !body.name || !body.password) throw new Error("Name, email and password are required.");
  if (rows("users").some(function(user) { return String(user.email).toLowerCase() === email; })) throw new Error("Email already exists.");
  const serviceFirm = rows("firms").find(function(firm) { return firm.type === "service"; });
  const userId = createId("user");
  insertRow("users", { id: userId, name: String(body.name || "").trim(), email: email, password_hash: hashPassword(body.password || ""), created_at: now() });
  insertRow("memberships", { id: createId("mem"), user_id: userId, firm_id: serviceFirm.id, role: "spy_seller", status: "active", created_at: now() });
  insertRow("seller_profiles", { id: createId("seller"), user_id: userId, status: "pending", manual_capable: 1, api_connected: 0, payout_handle: String(body.payoutHandle || ""), notes: String(body.notes || ""), rate_card: String(body.rateCard || ""), specialties: "", created_at: now() });
  return { ok: true };
}

function registerClient(body) {
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !body.name || !body.password || !body.firmName) throw new Error("Firm name, contact name, email and password are required.");
  if (rows("users").some(function(user) { return String(user.email).toLowerCase() === email; })) throw new Error("Email already exists.");
  const firmId = createId("firm");
  const userId = createId("user");
  insertRow("firms", { id: firmId, name: String(body.firmName || "").trim(), type: "client", discord_webhook: "", created_at: now() });
  insertRow("users", { id: userId, name: String(body.name || "").trim(), email: email, password_hash: hashPassword(body.password || ""), created_at: now() });
  insertRow("memberships", { id: createId("mem"), user_id: userId, firm_id: firmId, role: "lawfirm_admin", status: "active", created_at: now() });
  return { ok: true };
}

function createMember(body, auth) {
  requireRole(auth, ["super_admin", "lawfirm_admin", "coordinator"]);
  const membership = primaryMembership(auth.user.id);
  const userId = createId("user");
  insertRow("users", { id: userId, name: String(body.name || "").trim(), email: String(body.email || "").trim().toLowerCase(), password_hash: hashPassword(body.password || ""), created_at: now() });
  insertRow("memberships", { id: createId("mem"), user_id: userId, firm_id: membership.firm_id, role: String(body.role || "client_requester"), status: "active", created_at: now() });
  if (body.role === "spy_seller") {
    insertRow("seller_profiles", { id: createId("seller"), user_id: userId, status: "approved", manual_capable: 1, api_connected: 0, payout_handle: String(body.payoutHandle || ""), notes: String(body.notes || ""), rate_card: String(body.rateCard || ""), specialties: "", created_at: now() });
  }
  return { ok: true };
}

function createInvite(body, auth) {
  requireRole(auth, ["super_admin", "lawfirm_admin", "coordinator"]);
  const membership = primaryMembership(auth.user.id);
  const token = Math.random().toString(36).slice(2, 8).toUpperCase() + "-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  insertRow("invitations", { id: createId("invite"), token: token, email: String(body.email || "").trim().toLowerCase(), role: String(body.role || "client_requester"), firm_id: membership.firm_id, invited_by_user_id: auth.user.id, note: String(body.note || ""), status: "pending", expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), created_at: now(), accepted_by_user_id: "", accepted_at: "" });
  return { token: token };
}

function acceptInvite(body) {
  const invite = rows("invitations").find(function(entry) { return entry.token === String(body.token || "").trim(); });
  if (!invite || invite.status !== "pending") throw new Error("Invite not found or inactive.");
  const userId = createId("user");
  insertRow("users", { id: userId, name: String(body.name || "").trim(), email: String(invite.email || "").toLowerCase(), password_hash: hashPassword(body.password || ""), created_at: now() });
  insertRow("memberships", { id: createId("mem"), user_id: userId, firm_id: invite.firm_id, role: invite.role, status: "active", created_at: now() });
  if (invite.role === "spy_seller") {
    insertRow("seller_profiles", { id: createId("seller"), user_id: userId, status: "approved", manual_capable: 1, api_connected: 0, payout_handle: String(body.payoutHandle || ""), notes: String(body.notes || ""), rate_card: String(body.rateCard || ""), specialties: "", created_at: now() });
  }
  updateRow("invitations", "id", invite.id, { status: "accepted", accepted_by_user_id: userId, accepted_at: now() });
  const token = createId("sess") + "_" + Utilities.getUuid();
  insertRow("sessions", { token: token, user_id: userId, created_at: now() });
  return { token: token, bootstrap: bootstrapPayload(userId) };
}
