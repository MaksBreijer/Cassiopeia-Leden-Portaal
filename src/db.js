const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "cassiopeia.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      year_layer TEXT NOT NULL,
      role_title TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      birthday TEXT DEFAULT '',
      address TEXT DEFAULT '',
      latitude REAL,
      longitude REAL,
      location_updated_at TEXT,
      bio TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      member_status TEXT DEFAULT 'actief',
      committee TEXT DEFAULT '',
      is_admin INTEGER DEFAULT 0,
      account_status TEXT NOT NULL DEFAULT 'active',
      password_changed_at TEXT,
      last_login_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      location TEXT DEFAULT '',
      starts_at TEXT NOT NULL,
      capacity INTEGER,
      response_mode TEXT NOT NULL DEFAULT 'signup',
      registration_override TEXT NOT NULL DEFAULT 'automatic',
      created_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      cancelled_at TEXT,
      late_cancelled INTEGER NOT NULL DEFAULT 0,
      cancellation_reason TEXT DEFAULT '',
      UNIQUE(activity_id, user_id),
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS year_agenda_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month_label TEXT NOT NULL,
      month_index INTEGER NOT NULL,
      day_label TEXT NOT NULL,
      title TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      purpose TEXT NOT NULL CHECK (purpose IN ('invite', 'reset')),
      expires_at INTEGER NOT NULL,
      used_at TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS calendar_subscriptions (
      user_id INTEGER PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'overig',
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data TEXT NOT NULL,
      uploaded_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS activity_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data TEXT NOT NULL,
      uploaded_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS activity_images (
      activity_id INTEGER PRIMARY KEY,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data TEXT NOT NULL,
      uploaded_by INTEGER,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS confessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      body TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS site_assets (
      key TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_by INTEGER,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS account_tokens_lookup
    ON account_tokens(token_hash, expires_at, used_at);

    CREATE UNIQUE INDEX IF NOT EXISTS calendar_subscriptions_token
    ON calendar_subscriptions(token);
  `);

  ensureColumn("users", "address", "TEXT DEFAULT ''");
  ensureColumn("users", "birthday", "TEXT DEFAULT ''");
  ensureColumn("users", "latitude", "REAL");
  ensureColumn("users", "longitude", "REAL");
  ensureColumn("users", "location_updated_at", "TEXT");
  ensureColumn("users", "member_status", "TEXT DEFAULT 'actief'");
  ensureColumn("users", "committee", "TEXT DEFAULT ''");
  ensureColumn("users", "account_status", "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn("users", "password_changed_at", "TEXT");
  ensureColumn("users", "last_login_at", "TEXT");
  ensureColumn("registrations", "cancelled_at", "TEXT");
  ensureColumn("registrations", "late_cancelled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("registrations", "cancellation_reason", "TEXT DEFAULT ''");
  ensureColumn("activities", "response_mode", "TEXT NOT NULL DEFAULT 'signup'");
  ensureColumn("activities", "registration_override", "TEXT NOT NULL DEFAULT 'automatic'");
  revokeExposedCredentials();
  bootstrapAdmin();
  purgeExistingNonAdminMembers();
  seedYearAgenda();
  syncCsvYearAgendaData();
  installOfficialLogoAssets();
  connectOfficialGoogleCalendar();
}

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

function installOfficialLogoAssets() {
  const migrationKey = "official_transparent_logo_2026_08_31_v1";
  if (db.prepare("SELECT 1 FROM app_settings WHERE key = ?").get(migrationKey)) return;

  const logoPath = path.join(__dirname, "..", "public", "assets", "cassiopeia-embleem.png");
  const logoData = fs.readFileSync(logoPath).toString("base64");
  db.transaction(() => {
    const saveAsset = db.prepare(`
      INSERT INTO site_assets (key, file_name, mime_type, data, updated_by, updated_at)
      VALUES (?, 'cassiopeia-embleem.png', 'image/png', ?, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET file_name = excluded.file_name, mime_type = excluded.mime_type,
        data = excluded.data, updated_by = NULL, updated_at = CURRENT_TIMESTAMP
    `);
    saveAsset.run("logo", logoData);
    saveAsset.run("hero", logoData);
    db.prepare("INSERT INTO app_settings (key, value) VALUES (?, 'complete')").run(migrationKey);
  })();
}

function connectOfficialGoogleCalendar() {
  if (process.env.NODE_ENV !== "production") return;
  const migrationKey = "connect_public_cassio_google_calendar_2026_09_01_v1";
  if (db.prepare("SELECT 1 FROM app_settings WHERE key = ?").get(migrationKey)) return;
  const calendarUrl = "https://calendar.google.com/calendar/ical/abactis%40dispuutcassiopeia.nl/public/basic.ics";
  db.transaction(() => {
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('google_calendar_ical_url', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(calendarUrl);
    db.prepare("INSERT INTO app_settings (key, value) VALUES (?, 'complete')").run(migrationKey);
  })();
}

function bootstrapAdmin() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || "");
  const name = String(process.env.BOOTSTRAP_ADMIN_NAME || "Cassiopeia beheerder").trim();

  if (!email && !password) {
    if (!count && process.env.NODE_ENV === "production") {
      throw new Error("Stel BOOTSTRAP_ADMIN_EMAIL en BOOTSTRAP_ADMIN_PASSWORD in voor de eerste beheerder.");
    }
    return;
  }
  if (!email || !password) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL en BOOTSTRAP_ADMIN_PASSWORD moeten samen worden ingesteld.");
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL is geen geldig e-mailadres.");
  }
  if (password.length < 12 || ["Cassio2026!", "Welkom2026!"].includes(password)) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD moet uniek zijn en minimaal 12 tekens bevatten.");
  }

  const bootstrapKey = `bootstrap_admin_v1:${email}`;
  if (db.prepare("SELECT 1 FROM app_settings WHERE key = ?").get(bootstrapKey)) return;

  db.transaction(() => {
    const passwordHash = bcrypt.hashSync(password, 12);
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      db.prepare(`
        UPDATE users
        SET password_hash = ?, is_admin = 1, account_status = 'active',
            password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(passwordHash, existing.id);
    } else {
      db.prepare(`
        INSERT INTO users (name, email, password_hash, year_layer, role_title, avatar, member_status, committee, is_admin)
        VALUES (?, ?, ?, ?, 'Admin', 'C', 'actief', 'Bestuur', 1)
      `).run(name, email, passwordHash, String(new Date().getFullYear()));
    }
    db.prepare("INSERT INTO app_settings (key, value) VALUES (?, 'complete')").run(bootstrapKey);
  })();
}

function revokeExposedCredentials() {
  const migrationKey = "security_revoke_exposed_seed_credentials_v1";
  if (db.prepare("SELECT 1 FROM app_settings WHERE key = ?").get(migrationKey)) return;

  const exposedPasswords = ["Cassio2026!", "Welkom2026!"];
  const compromisedUsers = db
    .prepare("SELECT id, password_hash FROM users WHERE email LIKE '%@cassiopeia.local' OR is_admin = 1")
    .all()
    .filter((user) => exposedPasswords.some((password) => bcrypt.compareSync(password, user.password_hash)));

  db.transaction(() => {
    const revokeUser = db.prepare(`
      UPDATE users
      SET password_hash = ?, is_admin = 0, account_status = 'disabled', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    compromisedUsers.forEach((user) => {
      const unknownPassword = crypto.randomBytes(48).toString("base64url");
      revokeUser.run(bcrypt.hashSync(unknownPassword, 12), user.id);
    });

    db.prepare("DELETE FROM sessions").run();
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(migrationKey, JSON.stringify({ revokedUsers: compromisedUsers.length }));
  })();
}

function purgeExistingNonAdminMembers() {
  if (process.env.NODE_ENV !== "production") return;
  const migrationKey = "purge_existing_non_admin_members_2026_08_29_v1";
  if (db.prepare("SELECT 1 FROM app_settings WHERE key = ?").get(migrationKey)) return;

  const memberIds = new Set(db.prepare("SELECT id FROM users WHERE is_admin = 0").all().map((row) => Number(row.id)));
  db.transaction(() => {
    const deleteSession = db.prepare("DELETE FROM sessions WHERE sid = ?");
    db.prepare("SELECT sid, sess FROM sessions").all().forEach((row) => {
      try {
        if (memberIds.has(Number(JSON.parse(row.sess).userId))) deleteSession.run(row.sid);
      } catch (error) {
        deleteSession.run(row.sid);
      }
    });

    const result = db.prepare("DELETE FROM users WHERE is_admin = 0").run();
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(migrationKey, JSON.stringify({ removedMembers: result.changes }));
  })();
}

const defaultYearAgendaItems = [
  ["Oktober 2025", 1, "2", "DispuBo"],
  ["Oktober 2025", 1, "3-5", "Dispuutsweekend"],
  ["Oktober 2025", 1, "15", "Rendez-vous"],
  ["Oktober 2025", 1, "18", "Inauguratie 2.0"],
  ["Oktober 2025", 1, "31", "Kaas-wijn proeverij"],
  ["November 2025", 2, "6", "DispuBo (o.a. door EscalaCie)"],
  ["November 2025", 2, "8", "Opening lustrum"],
  ["November 2025", 2, "9", "DIS ALV"],
  ["November 2025", 2, "28", "VrijMiBo"],
  ["December 2025", 3, "4", "DispuBo"],
  ["December 2025", 3, "13", "Lustrum activiteit"],
  ["December 2025", 3, "31", "Nieuwjaarsdiner i.p.v. VrijMiBo"],
  ["Januari 2026", 4, "8", "DispuBo"],
  ["Januari 2026", 4, "10", "Lustrum activiteit"],
  ["Januari 2026", 4, "16", "Rendez-vous"],
  ["Januari 2026", 4, "24", "VrijMiBo"],
  ["Februari 2026", 5, "5", "DispuBo"],
  ["Februari 2026", 5, "15", "Rendez-vous"],
  ["Februari 2026", 5, "27", "VrijMiBo"],
  ["Maart 2026", 6, "5", "DispuBo"],
  ["Maart 2026", 6, "15", "Rendez-vous"],
  ["Maart 2026", 6, "27", "VrijMiBo"],
  ["April 2026", 7, "2", "DispuBo"],
  ["April 2026", 7, "9", "Borrel met RemeX"],
  ["April 2026", 7, "4", "Lustrum activiteit"],
  ["April 2026", 7, "15", "Rendez-vous"],
  ["April 2026", 7, "26", "KoNaBo i.p.v. VrijMiBo"],
  ["Mei 2026", 8, "7", "DispuBo"],
  ["Mei 2026", 8, "13", "Kennismakingsborrel"],
  ["Mei 2026", 8, "23-24", "Lustrumactiviteit"],
  ["Mei 2026", 8, "29", "VrijMiBo"],
  ["Juni 2026", 9, "4", "DispuBo"],
  ["Juni 2026", 9, "6-7", "HOCT en cantus"],
  ["Juni 2026", 9, "26", "VrijMiBo"],
  ["Juli 2026", 10, "2", "DispuBo"],
  ["Juli 2026", 10, "11", "Zomer ALV + Kennismakingsborrel"],
  ["Juli 2026", 10, "30", "LustrumCassiopeia! (t/m 6 augustus)"],
  ["Augustus 2026", 11, "24", "Eten Kennismakingsweek"],
  ["Augustus 2026", 11, "27", "Adviesnia + pullen vullen"],
  ["Augustus 2026", 11, "31", "Start feutenperiode"],
  ["September 2026", 12, "?", "DispuBo"],
  ["September 2026", 12, "18", "Avond met RemeX"],
  ["September 2026", 12, "25", "VrijMiBo"],
  ["September 2026", 12, "?", "Elke donderdag feutenmoment"],
  ["September 2026", 12, "?", "Zandvoort"],
  ["September 2026", 12, "?", "Groningen"],
  ["Oktober 2026", 13, "2", "DispuBo"],
  ["Oktober 2026", 13, "2-4", "Dispuutsweekend"],
  ["Oktober 2026", 13, "24-25", "Lustrumgala met RemeX"]
];

function seedYearAgenda() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM year_agenda_items").get().count;
  if (count > 0) return;

  insertDefaultYearAgendaItems();
}

function insertDefaultYearAgendaItems() {
  const insertYearAgendaItem = db.prepare(`
    INSERT INTO year_agenda_items (month_label, month_index, day_label, title, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);

  defaultYearAgendaItems.forEach(([monthLabel, monthIndex, dayLabel, title], index) => {
    insertYearAgendaItem.run(monthLabel, monthIndex, dayLabel, title, index + 1);
  });
}

function syncCsvYearAgendaData() {
  const versionKey = "year_agenda_data_version";
  const csvVersion = "cassiopeia_jaarplanning_2025_2026_csv_v1";
  const currentVersion = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(versionKey)?.value;
  if (currentVersion === csvVersion) return;

  const rows = db
    .prepare("SELECT id FROM year_agenda_items ORDER BY month_index ASC, sort_order ASC, id ASC")
    .all();

  if (!rows.length) {
    insertDefaultYearAgendaItems();
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(versionKey, csvVersion);
    return;
  }

  if (rows.length !== defaultYearAgendaItems.length) return;

  const updateItem = db.prepare(`
      UPDATE year_agenda_items
      SET month_label = ?, month_index = ?, day_label = ?, title = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
  `);

  rows.forEach((row, index) => {
    const [monthLabel, monthIndex, dayLabel, title] = defaultYearAgendaItems[index];
    updateItem.run(monthLabel, monthIndex, dayLabel, title, index + 1, row.id);
  });

  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(versionKey, csvVersion);
}

function ensureYearAgendaItems() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM year_agenda_items").get().count;
  if (count > 0) return;
  insertDefaultYearAgendaItems();
}

module.exports = { db, initializeDatabase, ensureYearAgendaItems };
