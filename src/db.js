const fs = require("fs");
const path = require("path");
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
  `);

  ensureColumn("users", "address", "TEXT DEFAULT ''");
  ensureColumn("users", "member_status", "TEXT DEFAULT 'actief'");
  ensureColumn("users", "committee", "TEXT DEFAULT ''");
  renameSeedAdmin();
  seedDatabase();
  seedYearAgenda();
}

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

function seedDatabase() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (count > 0) return;

  const hash = bcrypt.hashSync("Cassio2026!", 12);
  const memberHash = bcrypt.hashSync("Welkom2026!", 12);

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, year_layer, role_title, phone, address, bio, avatar, member_status, committee, is_admin)
    VALUES (@name, @email, @password_hash, @year_layer, @role_title, @phone, @address, @bio, @avatar, @member_status, @committee, @is_admin)
  `);

  insertUser.run({
    name: "AdminCassio",
    email: "admin@cassiopeia.local",
    password_hash: hash,
    year_layer: "2020",
    role_title: "Admin",
    phone: "+31 6 00000000",
    address: "",
    bio: "Beheert het ledenbestand en bewaakt de Cassiopeia-tradities.",
    avatar: "C",
    member_status: "actief",
    committee: "Bestuur",
    is_admin: 1
  });

  [
    ["Lotte de Vries", "lotte@cassiopeia.local", "2021", "Abactis", "L"],
    ["Noor Jansen", "noor@cassiopeia.local", "2022", "Quaestor", "N"],
    ["Sofie Bakker", "sofie@cassiopeia.local", "2023", "Activiteitencommissie", "S"],
    ["Emma Visser", "emma@cassiopeia.local", "2024", "Lid", "E"]
  ].forEach(([name, email, year_layer, role_title, avatar]) => {
    insertUser.run({
      name,
      email,
      password_hash: memberHash,
      year_layer,
      role_title,
      phone: "",
      address: "",
      bio: "Cassiopeia-lid met liefde voor borrels, tradities en sterke plannen.",
      avatar,
      member_status: "actief",
      committee: role_title === "Lid" ? "" : role_title,
      is_admin: 0
    });
  });

  const insertActivity = db.prepare(`
    INSERT INTO activities (title, description, location, starts_at, capacity, created_by)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  insertActivity.run(
    "Zomerborrel",
    "Een elegante avond om het verenigingsjaar samen af te sluiten.",
    "Sociëteit",
    "2026-06-21T20:00",
    40
  );
  insertActivity.run(
    "Jaarlaagdiner",
    "Diner voor alle jaarlagen met tafelmomenten en speeches.",
    "De Salon",
    "2026-07-04T19:00",
    28
  );
}

function seedYearAgenda() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM year_agenda_items").get().count;
  if (count > 0) return;

  const insertYearAgendaItem = db.prepare(`
    INSERT INTO year_agenda_items (month_label, month_index, day_label, title, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);

  [
    ["Oktober", 1, "2", "DispuBo"],
    ["Oktober", 1, "3-5", "Dispuutsweekend"],
    ["Oktober", 1, "15", "Rendez-vous"],
    ["Oktober", 1, "18", "Inauguratie 2.0"],
    ["Oktober", 1, "31", "Kaas-wijn proeverij"],
    ["November", 2, "6", "DispuBo (orga door EscalaCie)"],
    ["November", 2, "8", "Opening lustrum"],
    ["November", 2, "9", "DIES AIV"],
    ["November", 2, "28", "VrijMiBo"],
    ["December", 3, "4", "DispuBo"],
    ["December", 3, "13", "Lustrum activiteit"],
    ["December", 3, "31", "Nieuwjaarsdiner ipv VrijMiBo"],
    ["Januari", 4, "8", "DispuBo"],
    ["Januari", 4, "10", "Lustrum activiteit"],
    ["Januari", 4, "16", "Rendez-vous"],
    ["Januari", 4, "24", "VrijMiBo"],
    ["Februari", 5, "5", "DispuBo"],
    ["Februari", 5, "15", "Rendez-vous"],
    ["Februari", 5, "27", "VrijMiBo"],
    ["Maart", 6, "5", "DispuBo"],
    ["Maart", 6, "15", "Rendez-vous"],
    ["Maart", 6, "27", "VrijMiBo"],
    ["April", 7, "2", "DispuBo"],
    ["April", 7, "4", "Lustrum activiteit"],
    ["April", 7, "9", "Borrel met Remex"],
    ["April", 7, "15", "Rendez-vous"],
    ["April", 7, "26", "KoNaBo ipv VrijMiBo"],
    ["Mei", 8, "7", "DispuBo"],
    ["Mei", 8, "13", "Kennismakingsborrel"],
    ["Mei", 8, "23-24", "Lustrumactiviteit"],
    ["Mei", 8, "29", "VrijMiBo"],
    ["Juni", 9, "4", "DispuBo"],
    ["Juni", 9, "6-7", "HOCT en cantus"],
    ["Juni", 9, "26", "VrijMiBo"],
    ["Juli", 10, "2", "DispuBo"],
    ["Juli", 10, "11", "Zomer ALV + Kennismakingsborrel"],
    ["Juli", 10, "30", "LustrumCassiopeitos! (t/m 6 augustus)"],
    ["Augustus", 11, "24", "Eten Kennismakingsweek"],
    ["Augustus", 11, "27", "Abessinia + pullen vullen"],
    ["Augustus", 11, "31", "Start feutenperiode"],
    ["September", 12, "?", "DispuBo"],
    ["September", 12, "18", "Avond met Remex"],
    ["September", 12, "25", "VrijMiBo"],
    ["September", 12, "?", "Elke donderdag feutenmoment"],
    ["September", 12, "?", "Zandvoort"],
    ["September", 12, "?", "Groningen"],
    ["Oktober", 13, "2", "DispuBo"],
    ["Oktober", 13, "2-4", "Dispuutsweekend"],
    ["Oktober", 13, "24-25", "Lustrumgala met Remex"]
  ].forEach(([monthLabel, monthIndex, dayLabel, title], index) => {
    insertYearAgendaItem.run(monthLabel, monthIndex, dayLabel, title, index + 1);
  });
}

function renameSeedAdmin() {
  db.prepare(`
    UPDATE users
    SET name = 'AdminCassio', role_title = 'Admin', avatar = 'C', updated_at = CURRENT_TIMESTAMP
    WHERE email = 'admin@cassiopeia.local'
  `).run();
}

module.exports = { db, initializeDatabase };
