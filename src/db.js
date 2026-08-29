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
      address TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      member_status TEXT DEFAULT 'actief',
      committee TEXT DEFAULT '',
      is_admin INTEGER DEFAULT 0,
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
  `);

  ensureColumn("users", "address", "TEXT DEFAULT ''");
  ensureColumn("users", "member_status", "TEXT DEFAULT 'actief'");
  ensureColumn("users", "committee", "TEXT DEFAULT ''");
  revokeExposedCredentials();
  bootstrapAdmin();
  seedYearAgenda();
  syncCsvYearAgendaData();
}

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
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
        SET password_hash = ?, is_admin = 1, updated_at = CURRENT_TIMESTAMP
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
      SET password_hash = ?, is_admin = 0, updated_at = CURRENT_TIMESTAMP
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
