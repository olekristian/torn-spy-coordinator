const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const DB_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DB_DIR, "portal.db");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function now() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function openDb() {
  ensureDir(DB_DIR);
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  initializeSchema(db);
  seedDatabase(db);
  return db;
}

function initializeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS firms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      discord_webhook TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memberships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      firm_id TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS seller_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      manual_capable INTEGER NOT NULL DEFAULT 1,
      api_connected INTEGER NOT NULL DEFAULT 0,
      payout_handle TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      rate_card TEXT NOT NULL DEFAULT '',
      specialties TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      client_firm_id TEXT NOT NULL,
      requested_by_user_id TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      due_date TEXT NOT NULL DEFAULT '',
      agreed_price INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT '',
      notification_sent_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      target_name TEXT NOT NULL,
      target_id TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      claimed_by_user_id TEXT NOT NULL DEFAULT '',
      completed_by_user_id TEXT NOT NULL DEFAULT '',
      submitted_by_user_id TEXT NOT NULL DEFAULT '',
      payout_status TEXT NOT NULL DEFAULT 'unpaid',
      payout_amount INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      raw_spy TEXT NOT NULL,
      parsed_name TEXT NOT NULL DEFAULT '',
      target_id TEXT NOT NULL DEFAULT '',
      level INTEGER,
      strength INTEGER,
      speed INTEGER,
      dexterity INTEGER,
      defense INTEGER,
      total INTEGER,
      missing_stats TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT NOT NULL,
      completed_by_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payouts (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      order_id TEXT NOT NULL DEFAULT '',
      target TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_consents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      masked_key TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      consented_at TEXT NOT NULL,
      revoked_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      firm_id TEXT NOT NULL,
      invited_by_user_id TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      accepted_by_user_id TEXT NOT NULL DEFAULT '',
      accepted_at TEXT NOT NULL DEFAULT ''
    );
  `);
}

function insert(db, table, row) {
  const columns = Object.keys(row);
  const placeholders = columns.map((column) => `@${column}`).join(", ");
  db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`).run(row);
}

function seedDatabase(db) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (count > 0) {
    return;
  }

  const serviceFirmId = createId("firm");
  const clientFirmId = createId("firm");
  const adminId = createId("user");
  const coordinatorId = createId("user");
  const requesterId = createId("user");
  const orderId = createId("order");

  insert(db, "firms", {
    id: serviceFirmId,
    name: "Bring Em Closer",
    type: "service",
    discord_webhook: "",
    created_at: now(),
  });
  insert(db, "firms", {
    id: clientFirmId,
    name: "Helsing Legal",
    type: "client",
    discord_webhook: "",
    created_at: now(),
  });

  insert(db, "users", {
    id: adminId,
    name: "Portal Admin",
    email: "admin@spyportal.local",
    password_hash: bcrypt.hashSync("admin123", 10),
    created_at: now(),
  });
  insert(db, "users", {
    id: coordinatorId,
    name: "Case Coordinator",
    email: "coord@spyportal.local",
    password_hash: bcrypt.hashSync("coord123", 10),
    created_at: now(),
  });
  insert(db, "users", {
    id: requesterId,
    name: "Client Contact",
    email: "client@helsing.local",
    password_hash: bcrypt.hashSync("client123", 10),
    created_at: now(),
  });

  insert(db, "memberships", {
    id: createId("mem"),
    user_id: adminId,
    firm_id: serviceFirmId,
    role: "super_admin",
    status: "active",
    created_at: now(),
  });
  insert(db, "memberships", {
    id: createId("mem"),
    user_id: coordinatorId,
    firm_id: serviceFirmId,
    role: "coordinator",
    status: "active",
    created_at: now(),
  });
  insert(db, "memberships", {
    id: createId("mem"),
    user_id: requesterId,
    firm_id: clientFirmId,
    role: "lawfirm_admin",
    status: "active",
    created_at: now(),
  });

  insert(db, "orders", {
    id: orderId,
    client_firm_id: clientFirmId,
    requested_by_user_id: requesterId,
    created_by_user_id: coordinatorId,
    title: "Opening order",
    due_date: "",
    agreed_price: 0,
    notes: "Seeded backend order.",
    status: "open",
    payment_status: "unpaid",
    completed_at: "",
    notification_sent_at: "",
    created_at: now(),
  });

  ["TargetOne", "TargetTwo"].forEach((name, index) => {
    insert(db, "order_items", {
      id: createId("item"),
      order_id: orderId,
      target_name: name,
      target_id: String(1111111 + index * 1111111),
      notes: "",
      status: "open",
      claimed_by_user_id: "",
      completed_by_user_id: "",
      submitted_by_user_id: "",
      payout_status: "unpaid",
      payout_amount: 3500000,
      created_at: now(),
      completed_at: "",
    });
  });
}

module.exports = {
  DB_PATH,
  createId,
  now,
  openDb,
};
