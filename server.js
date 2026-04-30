const path = require("path");
const express = require("express");
const cors = require("cors");
const { createId, now, openDb } = require("./src/db");
const { hashPassword, signToken, verifyPassword, verifyToken } = require("./src/auth");

const app = express();
const db = openDb();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token." });
  }
  try {
    const decoded = verifyToken(token);
    const user = db.prepare("SELECT id, name, email, created_at FROM users WHERE id = ?").get(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: "User not found." });
    }
    const memberships = db.prepare("SELECT * FROM memberships WHERE user_id = ? AND status = 'active'").all(user.id);
    req.auth = { user, memberships };
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token." });
  }
}

function primaryMembership(userId) {
  return db.prepare("SELECT * FROM memberships WHERE user_id = ? AND status = 'active' ORDER BY created_at LIMIT 1").get(userId);
}

function currentRole(req) {
  return req.auth.memberships[0] ? req.auth.memberships[0].role : "";
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!roles.includes(currentRole(req))) {
      return res.status(403).json({ error: "Forbidden." });
    }
    next();
  };
}

function sellerProfile(userId) {
  return db.prepare("SELECT * FROM seller_profiles WHERE user_id = ?").get(userId);
}

function canClaim(userId) {
  const membership = primaryMembership(userId);
  if (!membership) return false;
  if (["super_admin", "coordinator"].includes(membership.role)) return true;
  if (membership.role !== "spy_seller") return false;
  const profile = sellerProfile(userId);
  return !!profile && profile.status === "approved";
}

function visibleOrderWhere(userId) {
  const membership = primaryMembership(userId);
  if (!membership) return { sql: "1 = 0", params: [] };
  if (["super_admin", "coordinator", "spy_seller"].includes(membership.role)) {
    return { sql: "1 = 1", params: [] };
  }
  return { sql: "client_firm_id = ?", params: [membership.firm_id] };
}

function parseTargetLines(input) {
  const seen = new Set();
  const targets = [];
  String(input || "").split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
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
      const cols = line.split(/\t|,|\|/).map((part) => part.trim()).filter(Boolean);
      if (cols[0]) name = cols[0];
      if (cols[1]) targetId = cols[1].replace(/\D/g, "");
    }
    if (!name) return;
    const key = `${name.toLowerCase()}::${targetId}`;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({ name, targetId });
  });
  return targets;
}

function bootstrapPayload(userId) {
  const visibility = visibleOrderWhere(userId);
  const user = db.prepare("SELECT id, name, email, created_at FROM users WHERE id = ?").get(userId);
  const memberships = db.prepare("SELECT * FROM memberships WHERE user_id = ? AND status = 'active'").all(userId);
  const firms = db.prepare("SELECT * FROM firms").all();
  const sellers = db.prepare("SELECT * FROM seller_profiles").all();
  const orders = db.prepare(`SELECT * FROM orders WHERE ${visibility.sql} ORDER BY created_at DESC`).all(...visibility.params);
  const items = db.prepare(`SELECT oi.* FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE ${visibility.sql} ORDER BY oi.created_at DESC`).all(...visibility.params);
  const payments = db.prepare(`SELECT p.* FROM payments p JOIN orders o ON o.id = p.order_id WHERE ${visibility.sql} ORDER BY p.created_at DESC`).all(...visibility.params);
  const payouts = db.prepare(`SELECT po.* FROM payouts po JOIN order_items oi ON oi.id = po.item_id JOIN orders o ON o.id = oi.order_id WHERE ${visibility.sql} ORDER BY po.created_at DESC`).all(...visibility.params);
  const notifications = db.prepare(`SELECT n.* FROM notifications n LEFT JOIN orders o ON o.id = n.order_id WHERE ${visibility.sql.replace("client_firm_id", "o.client_firm_id")} ORDER BY n.created_at DESC LIMIT 25`).all(...visibility.params);
  const invitations = currentRole({ auth: { memberships } }) === "super_admin"
    ? db.prepare("SELECT * FROM invitations ORDER BY created_at DESC").all()
    : memberships[0]
      ? db.prepare("SELECT * FROM invitations WHERE firm_id = ? ORDER BY created_at DESC").all(memberships[0].firm_id)
      : [];
  const userIds = new Set([user.id]);
  memberships.forEach((membership) => userIds.add(membership.user_id));
  orders.forEach((order) => {
    userIds.add(order.requested_by_user_id);
    userIds.add(order.created_by_user_id);
  });
  items.forEach((item) => {
    if (item.claimed_by_user_id) userIds.add(item.claimed_by_user_id);
    if (item.completed_by_user_id) userIds.add(item.completed_by_user_id);
    if (item.submitted_by_user_id) userIds.add(item.submitted_by_user_id);
  });
  payouts.forEach((payout) => userIds.add(payout.user_id));
  sellers.forEach((seller) => userIds.add(seller.user_id));
  invitations.forEach((invite) => {
    userIds.add(invite.invited_by_user_id);
    if (invite.accepted_by_user_id) userIds.add(invite.accepted_by_user_id);
  });
  const placeholders = Array.from(userIds).map(() => "?").join(", ");
  const users = db.prepare(`SELECT id, name, email, created_at FROM users WHERE id IN (${placeholders})`).all(...Array.from(userIds));
  const apiConsents = db.prepare("SELECT * FROM api_consents WHERE user_id = ? ORDER BY consented_at DESC").all(userId);
  return { user, users, memberships, firms, sellerProfiles: sellers, orders, orderItems: items, payments, payouts, notifications, invitations, apiConsents };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, dbPath: path.join("data", "portal.db") });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  const token = signToken({ userId: user.id });
  res.json({ token, bootstrap: bootstrapPayload(user.id) });
});

app.post("/api/register/seller", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const name = String(req.body.name || "").trim();
  const password = String(req.body.password || "");
  if (!email || !name || !password) {
    return res.status(400).json({ error: "Name, email and password are required." });
  }
  const exists = db.prepare("SELECT 1 FROM users WHERE email = ?").get(email);
  if (exists) {
    return res.status(409).json({ error: "Email already exists." });
  }
  const serviceFirm = db.prepare("SELECT * FROM firms WHERE type = 'service' ORDER BY created_at LIMIT 1").get();
  const userId = createId("user");
  db.prepare("INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(
    userId, name, email, hashPassword(password), now()
  );
  db.prepare("INSERT INTO memberships (id, user_id, firm_id, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    createId("mem"), userId, serviceFirm.id, "spy_seller", "active", now()
  );
  db.prepare("INSERT INTO seller_profiles (id, user_id, status, manual_capable, api_connected, payout_handle, notes, rate_card, specialties, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    createId("seller"), userId, "pending", 1, 0, String(req.body.payoutHandle || ""), String(req.body.notes || ""), String(req.body.rateCard || ""), String(req.body.specialties || ""), now()
  );
  res.status(201).json({ ok: true });
});

app.post("/api/register/client", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const name = String(req.body.name || "").trim();
  const password = String(req.body.password || "");
  const firmName = String(req.body.firmName || "").trim();
  if (!email || !name || !password || !firmName) {
    return res.status(400).json({ error: "Firm name, contact name, email and password are required." });
  }
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    return res.status(409).json({ error: "Email already exists." });
  }
  const firmId = createId("firm");
  const userId = createId("user");
  db.prepare("INSERT INTO firms (id, name, type, discord_webhook, created_at) VALUES (?, ?, ?, ?, ?)").run(firmId, firmName, "client", "", now());
  db.prepare("INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(userId, name, email, hashPassword(password), now());
  db.prepare("INSERT INTO memberships (id, user_id, firm_id, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(createId("mem"), userId, firmId, "lawfirm_admin", "active", now());
  res.status(201).json({ ok: true });
});

app.post("/api/invites/accept", (req, res) => {
  const token = String(req.body.token || "").trim();
  const invite = db.prepare("SELECT * FROM invitations WHERE token = ?").get(token);
  if (!invite || invite.status !== "pending") {
    return res.status(404).json({ error: "Invite not found or inactive." });
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    db.prepare("UPDATE invitations SET status = 'expired' WHERE id = ?").run(invite.id);
    return res.status(400).json({ error: "Invite has expired." });
  }
  const name = String(req.body.name || "").trim();
  const password = String(req.body.password || "");
  if (!name || !password) {
    return res.status(400).json({ error: "Name and password are required." });
  }
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(invite.email.toLowerCase())) {
    return res.status(409).json({ error: "Email already exists." });
  }
  const userId = createId("user");
  db.prepare("INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(
    userId, name, invite.email.toLowerCase(), hashPassword(password), now()
  );
  db.prepare("INSERT INTO memberships (id, user_id, firm_id, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    createId("mem"), userId, invite.firm_id, invite.role, "active", now()
  );
  if (invite.role === "spy_seller") {
    db.prepare("INSERT INTO seller_profiles (id, user_id, status, manual_capable, api_connected, payout_handle, notes, rate_card, specialties, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      createId("seller"), userId, "approved", 1, 0, String(req.body.payoutHandle || ""), String(req.body.notes || ""), String(req.body.rateCard || ""), "", now()
    );
  }
  db.prepare("UPDATE invitations SET status = 'accepted', accepted_by_user_id = ?, accepted_at = ? WHERE id = ?").run(userId, now(), invite.id);
  const tokenValue = signToken({ userId });
  res.json({ token: tokenValue, bootstrap: bootstrapPayload(userId) });
});

app.get("/api/bootstrap", authRequired, (req, res) => {
  res.json(bootstrapPayload(req.auth.user.id));
});

app.post("/api/api-consents", authRequired, (req, res) => {
  db.prepare("UPDATE api_consents SET status = 'replaced' WHERE user_id = ? AND status = 'active'").run(req.auth.user.id);
  db.prepare("INSERT INTO api_consents (id, user_id, masked_key, scope, note, status, consented_at, revoked_at) VALUES (?, ?, ?, ?, ?, 'active', ?, '')").run(
    createId("consent"),
    req.auth.user.id,
    String(req.body.maskedKey || ""),
    String(req.body.scope || ""),
    String(req.body.note || ""),
    now()
  );
  res.status(201).json({ ok: true });
});

app.delete("/api/api-consents/active", authRequired, (req, res) => {
  db.prepare("UPDATE api_consents SET status = 'revoked', revoked_at = ? WHERE user_id = ? AND status = 'active'").run(now(), req.auth.user.id);
  res.json({ ok: true });
});

app.post("/api/members", authRequired, requireRole(["super_admin", "lawfirm_admin", "coordinator"]), (req, res) => {
  const membership = primaryMembership(req.auth.user.id);
  const email = String(req.body.email || "").trim().toLowerCase();
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    return res.status(409).json({ error: "Email already exists." });
  }
  const userId = createId("user");
  db.prepare("INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(
    userId, String(req.body.name || "").trim(), email, hashPassword(String(req.body.password || "")), now()
  );
  db.prepare("INSERT INTO memberships (id, user_id, firm_id, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    createId("mem"), userId, membership.firm_id, String(req.body.role || "client_requester"), "active", now()
  );
  if (req.body.role === "spy_seller") {
    db.prepare("INSERT INTO seller_profiles (id, user_id, status, manual_capable, api_connected, payout_handle, notes, rate_card, specialties, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      createId("seller"), userId, "approved", 1, 0, String(req.body.payoutHandle || ""), String(req.body.notes || ""), String(req.body.rateCard || ""), "", now()
    );
  }
  res.status(201).json({ ok: true });
});

app.post("/api/invites", authRequired, requireRole(["super_admin", "lawfirm_admin", "coordinator"]), (req, res) => {
  const membership = primaryMembership(req.auth.user.id);
  const token = `${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  db.prepare("INSERT INTO invitations (id, token, email, role, firm_id, invited_by_user_id, note, status, expires_at, created_at, accepted_by_user_id, accepted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '')").run(
    createId("invite"),
    token,
    String(req.body.email || "").trim().toLowerCase(),
    String(req.body.role || "client_requester"),
    membership.firm_id,
    req.auth.user.id,
    String(req.body.note || ""),
    "pending",
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    now()
  );
  res.status(201).json({ token });
});

app.post("/api/orders", authRequired, requireRole(["super_admin", "coordinator", "lawfirm_admin", "client_requester"]), (req, res) => {
  const userMembership = primaryMembership(req.auth.user.id);
  const targets = parseTargetLines(req.body.targets);
  if (!targets.length) {
    return res.status(400).json({ error: "No valid targets detected." });
  }
  const orderId = createId("order");
  const clientFirmId = String(req.body.clientFirmId || userMembership.firm_id);
  db.prepare("INSERT INTO orders (id, client_firm_id, requested_by_user_id, created_by_user_id, title, due_date, agreed_price, notes, status, payment_status, completed_at, notification_sent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?)").run(
    orderId, clientFirmId, req.auth.user.id, req.auth.user.id, String(req.body.title || "").trim(), String(req.body.dueDate || ""), Number(req.body.agreedPrice || 0), String(req.body.notes || ""), "open", "unpaid", now()
  );
  const stmt = db.prepare("INSERT INTO order_items (id, order_id, target_name, target_id, notes, status, claimed_by_user_id, completed_by_user_id, submitted_by_user_id, payout_status, payout_amount, created_at, completed_at) VALUES (?, ?, ?, ?, '', 'open', '', '', '', 'unpaid', ?, ?, '')");
  for (const target of targets) {
    stmt.run(createId("item"), orderId, target.name, target.targetId, Number(req.body.defaultPayout || 0), now());
  }
  res.status(201).json({ orderId });
});

app.patch("/api/orders/:orderId/status", authRequired, requireRole(["super_admin", "coordinator", "lawfirm_admin"]), (req, res) => {
  db.prepare("UPDATE orders SET status = ?, completed_at = CASE WHEN ? IN ('closed','delivered') THEN COALESCE(NULLIF(completed_at,''), ?) ELSE completed_at END WHERE id = ?").run(
    String(req.body.status || "open"), String(req.body.status || "open"), now(), req.params.orderId
  );
  res.json({ ok: true });
});

app.post("/api/items/:itemId/claim", authRequired, (req, res) => {
  if (!canClaim(req.auth.user.id)) {
    return res.status(403).json({ error: "Only approved sellers or coordinators can claim." });
  }
  db.prepare("UPDATE order_items SET claimed_by_user_id = ?, status = 'claimed' WHERE id = ?").run(req.auth.user.id, req.params.itemId);
  res.json({ ok: true });
});

app.post("/api/items/:itemId/unclaim", authRequired, (req, res) => {
  db.prepare("UPDATE order_items SET claimed_by_user_id = '', status = 'open' WHERE id = ?").run(req.params.itemId);
  res.json({ ok: true });
});

app.post("/api/items/:itemId/submit", authRequired, (req, res) => {
  const item = db.prepare("SELECT * FROM order_items WHERE id = ?").get(req.params.itemId);
  if (!item) {
    return res.status(404).json({ error: "Item not found." });
  }
  const completedByUserId = String(req.body.completedByUserId || req.auth.user.id);
  db.prepare("UPDATE order_items SET status = 'submitted', completed_by_user_id = ?, submitted_by_user_id = ?, completed_at = ? WHERE id = ?").run(
    completedByUserId, req.auth.user.id, now(), item.id
  );
  db.prepare("INSERT INTO submissions (id, item_id, raw_spy, parsed_name, target_id, level, strength, speed, dexterity, defense, total, missing_stats, created_by_user_id, completed_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    createId("sub"), item.id, String(req.body.rawSpy || ""), String(req.body.parsedName || item.target_name), String(req.body.targetId || item.target_id || ""), req.body.level ?? null,
    req.body.stats?.strength ?? null, req.body.stats?.speed ?? null, req.body.stats?.dexterity ?? null, req.body.stats?.defense ?? null, req.body.stats?.total ?? null,
    Array.isArray(req.body.missingStats) ? req.body.missingStats.join(",") : "", req.auth.user.id, completedByUserId, now()
  );
  db.prepare("INSERT INTO payouts (id, item_id, user_id, amount, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, '')").run(
    createId("payout"), item.id, completedByUserId, Number(req.body.payoutAmount || item.payout_amount || 0), String(req.body.payoutStatus || "queued"), String(req.body.payoutNotes || ""), now()
  );
  res.json({ ok: true });
});

app.post("/api/payments", authRequired, requireRole(["super_admin", "coordinator", "lawfirm_admin"]), (req, res) => {
  db.prepare("INSERT INTO payments (id, order_id, amount, status, note, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    createId("pay"), String(req.body.orderId || ""), Number(req.body.amount || 0), String(req.body.status || "unpaid"), String(req.body.note || ""), req.auth.user.id, now()
  );
  res.status(201).json({ ok: true });
});

app.patch("/api/payouts/:payoutId/status", authRequired, requireRole(["super_admin", "coordinator"]), (req, res) => {
  db.prepare("UPDATE payouts SET status = ?, updated_at = ? WHERE id = ?").run(String(req.body.status || "queued"), now(), req.params.payoutId);
  res.json({ ok: true });
});

app.patch("/api/sellers/:userId/status", authRequired, requireRole(["super_admin", "coordinator", "lawfirm_admin"]), (req, res) => {
  db.prepare("UPDATE seller_profiles SET status = ? WHERE user_id = ?").run(String(req.body.status || "pending"), req.params.userId);
  res.json({ ok: true });
});

app.patch("/api/firms/:firmId", authRequired, requireRole(["super_admin", "lawfirm_admin", "coordinator"]), (req, res) => {
  db.prepare("UPDATE firms SET name = ?, discord_webhook = ? WHERE id = ?").run(String(req.body.name || ""), String(req.body.discordWebhook || ""), req.params.firmId);
  res.json({ ok: true });
});

app.use(express.static(__dirname));

let serverInstance = null;

function startServer(port = PORT) {
  if (serverInstance) {
    return serverInstance;
  }
  serverInstance = app.listen(port, () => {
    console.log(`Spy portal backend listening on http://localhost:${port}`);
  });
  return serverInstance;
}

if (require.main === module) {
  startServer(PORT);
}

module.exports = {
  app,
  db,
  startServer,
};
