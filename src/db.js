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
  `);

  ensureColumn("users", "address", "TEXT DEFAULT ''");
  renameSeedAdmin();
  seedDatabase();
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
    INSERT INTO users (name, email, password_hash, year_layer, role_title, phone, address, bio, avatar, is_admin)
    VALUES (@name, @email, @password_hash, @year_layer, @role_title, @phone, @address, @bio, @avatar, @is_admin)
  `);

  insertUser.run({
    name: "cassioadmin",
    email: "admin@cassiopeia.local",
    password_hash: hash,
    year_layer: "2020",
    role_title: "Admin",
    phone: "+31 6 00000000",
    address: "",
    bio: "Beheert het ledenbestand en bewaakt de Cassiopeia-tradities.",
    avatar: "C",
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

function renameSeedAdmin() {
  db.prepare(`
    UPDATE users
    SET name = 'cassioadmin', role_title = 'Admin', avatar = 'C', updated_at = CURRENT_TIMESTAMP
    WHERE email = 'admin@cassiopeia.local'
      AND name = 'Aurora van Cassiopeia'
  `).run();
}

module.exports = { db, initializeDatabase };
