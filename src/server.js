const path = require("path");
const bcrypt = require("bcryptjs");
const express = require("express");
const session = require("express-session");
const { db, initializeDatabase } = require("./db");
const { createSqliteSessionStore } = require("./session-store");

initializeDatabase();
const SQLiteSessionStore = createSqliteSessionStore(session, db);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const SESSION_SECRET = process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? null : "cassiopeia-local-development-secret");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");

if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET is verplicht in productie.");
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isLocalDevOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || "");
  if (isLocalDevOrigin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    store: new SQLiteSessionStore(),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

app.use(express.static(path.join(__dirname, "..", "public")));

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    yearLayer: user.year_layer,
    roleTitle: user.role_title,
    phone: user.phone,
    address: user.address,
    bio: user.bio,
    avatar: user.avatar || user.name.charAt(0).toUpperCase(),
    isAdmin: Boolean(user.is_admin)
  };
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Je moet ingelogd zijn." });
  next();
}

function requireAdmin(req, res, next) {
  const user = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(req.session.userId);
  if (!user || !user.is_admin) return res.status(403).json({ error: "Alleen admins mogen dit doen." });
  next();
}

function getCurrentUser(req) {
  if (!req.session.userId) return null;
  return db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId);
}

function memberFromBody(body, existing = {}) {
  const avatarInput = String(body.avatar || "").trim();
  return {
    name: String(body.name || existing.name || "").trim(),
    email: String(body.email || existing.email || "").trim().toLowerCase(),
    year_layer: String(body.yearLayer || existing.year_layer || "").trim(),
    role_title: String(body.roleTitle || existing.role_title || "").trim(),
    phone: String(body.phone || existing.phone || "").trim(),
    address: body.address === undefined ? existing.address || "" : String(body.address || "").trim(),
    bio: String(body.bio || existing.bio || "").trim(),
    avatar: avatarInput ? avatarInput.slice(0, 2).toUpperCase() : existing.avatar || "",
    is_admin: body.isAdmin ? 1 : 0
  };
}

function profileAvatarFromBody(value, existingAvatar) {
  const avatar = String(value || "").trim();
  if (!avatar) return existingAvatar || "";
  const imageMatch = avatar.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  if (imageMatch) {
    const imageSize = Buffer.byteLength(imageMatch[2], "base64");
    if (imageSize <= 2 * 1024 * 1024) return avatar;
  }
  if (/^https?:\/\/.+/i.test(avatar) && avatar.length <= 500) return avatar;
  if (avatar.length <= 2) return avatar.toUpperCase();
  throw new Error("Gebruik een afbeelding van maximaal 2 MB.");
}

app.get("/api/session", (req, res) => {
  res.json({ user: publicUser(getCurrentUser(req)) });
});

app.post("/api/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "E-mail of wachtwoord klopt niet." });
  }

  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

app.put("/api/me", requireAuth, async (req, res) => {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId);
  if (!existing) return res.status(404).json({ error: "Account niet gevonden." });

  let avatar;
  try {
    avatar = profileAvatarFromBody(req.body.avatar, existing.avatar);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");
  const address = req.body.address === undefined ? existing.address || "" : String(req.body.address || "").trim();

  if (newPassword) {
    if (newPassword.length < 8) return res.status(400).json({ error: "Je nieuwe wachtwoord moet minimaal 8 tekens zijn." });
    if (!(await bcrypt.compare(currentPassword, existing.password_hash))) {
      return res.status(401).json({ error: "Je huidige wachtwoord klopt niet." });
    }
    const password_hash = await bcrypt.hash(newPassword, 12);
    db.prepare("UPDATE users SET address = ?, avatar = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(address, avatar, password_hash, req.session.userId);
  } else {
    db.prepare("UPDATE users SET address = ?, avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(address, avatar, req.session.userId);
  }

  res.json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId)) });
});

app.get("/api/members", requireAuth, (req, res) => {
  const q = `%${String(req.query.q || "").trim()}%`;
  const rows = db
    .prepare(`
      SELECT * FROM users
      WHERE name LIKE ? OR year_layer LIKE ? OR role_title LIKE ? OR address LIKE ?
      ORDER BY year_layer DESC, name ASC
    `)
    .all(q, q, q, q);
  res.json({ members: rows.map(publicUser) });
});

app.get("/api/members/:id", requireAuth, (req, res) => {
  const member = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!member) return res.status(404).json({ error: "Lid niet gevonden." });
  res.json({ member: publicUser(member) });
});

app.post("/api/members", requireAuth, requireAdmin, async (req, res) => {
  const member = memberFromBody(req.body);
  const password = String(req.body.password || "");
  if (!member.name || !member.email || !member.year_layer || password.length < 8) {
    return res.status(400).json({ error: "Naam, e-mail, jaarlaag en wachtwoord van minimaal 8 tekens zijn verplicht." });
  }

  const password_hash = await bcrypt.hash(password, 12);
  try {
    const result = db
      .prepare(`
        INSERT INTO users (name, email, password_hash, year_layer, role_title, phone, address, bio, avatar, is_admin)
        VALUES (@name, @email, @password_hash, @year_layer, @role_title, @phone, @address, @bio, @avatar, @is_admin)
      `)
      .run({ ...member, password_hash });
    res.status(201).json({ member: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid)) });
  } catch (error) {
    res.status(409).json({ error: "Er bestaat al een lid met dit e-mailadres." });
  }
});

app.put("/api/members/:id", requireAuth, requireAdmin, async (req, res) => {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Lid niet gevonden." });

  const member = memberFromBody(req.body, existing);
  if (!member.name || !member.email || !member.year_layer) {
    return res.status(400).json({ error: "Naam, e-mail en jaarlaag zijn verplicht." });
  }

  try {
    db.prepare(`
      UPDATE users
      SET name = @name, email = @email, year_layer = @year_layer, role_title = @role_title,
          phone = @phone, address = @address, bio = @bio, avatar = @avatar, is_admin = @is_admin, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ ...member, id: req.params.id });

    if (req.body.password) {
      const password_hash = await bcrypt.hash(String(req.body.password), 12);
      db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(password_hash, req.params.id);
    }

    res.json({ member: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id)) });
  } catch (error) {
    res.status(409).json({ error: "Er bestaat al een lid met dit e-mailadres." });
  }
});

app.delete("/api/members/:id", requireAuth, requireAdmin, (req, res) => {
  if (Number(req.params.id) === Number(req.session.userId)) {
    return res.status(400).json({ error: "Je kunt je eigen account niet verwijderen." });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

function activityFromBody(body, existing = {}) {
  const capacity = body.capacity === "" || body.capacity === null || body.capacity === undefined ? null : Number(body.capacity);
  return {
    title: String(body.title || existing.title || "").trim(),
    description: String(body.description || existing.description || "").trim(),
    location: String(body.location || existing.location || "").trim(),
    starts_at: String(body.startsAt || existing.starts_at || "").trim(),
    capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : null
  };
}

function activityRows(userId) {
  return db
    .prepare(`
      SELECT a.*,
        COUNT(r.id) AS registration_count,
        EXISTS(SELECT 1 FROM registrations mine WHERE mine.activity_id = a.id AND mine.user_id = ?) AS is_registered
      FROM activities a
      LEFT JOIN registrations r ON r.activity_id = a.id
      GROUP BY a.id
      ORDER BY datetime(a.starts_at) ASC
    `)
    .all(userId)
    .map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      location: row.location,
      startsAt: row.starts_at,
      capacity: row.capacity,
      registrationCount: row.registration_count,
      isRegistered: Boolean(row.is_registered)
    }));
}

app.get("/api/activities", requireAuth, (req, res) => {
  res.json({ activities: activityRows(req.session.userId) });
});

app.post("/api/activities", requireAuth, requireAdmin, (req, res) => {
  const activity = activityFromBody(req.body);
  if (!activity.title || !activity.starts_at) {
    return res.status(400).json({ error: "Titel en datum zijn verplicht." });
  }

  const result = db
    .prepare("INSERT INTO activities (title, description, location, starts_at, capacity, created_by) VALUES (@title, @description, @location, @starts_at, @capacity, @created_by)")
    .run({ ...activity, created_by: req.session.userId });
  res.status(201).json({ activity: activityRows(req.session.userId).find((item) => item.id === result.lastInsertRowid) });
});

app.put("/api/activities/:id", requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare("SELECT * FROM activities WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Activiteit niet gevonden." });

  const activity = activityFromBody(req.body, existing);
  if (!activity.title || !activity.starts_at) {
    return res.status(400).json({ error: "Titel en datum zijn verplicht." });
  }

  db.prepare(`
    UPDATE activities
    SET title = @title, description = @description, location = @location,
        starts_at = @starts_at, capacity = @capacity, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ ...activity, id: req.params.id });

  res.json({ activity: activityRows(req.session.userId).find((item) => item.id === Number(req.params.id)) });
});

app.delete("/api/activities/:id", requireAuth, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM activities WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.post("/api/activities/:id/register", requireAuth, (req, res) => {
  const activity = db.prepare("SELECT * FROM activities WHERE id = ?").get(req.params.id);
  if (!activity) return res.status(404).json({ error: "Activiteit niet gevonden." });

  if (activity.capacity) {
    const count = db.prepare("SELECT COUNT(*) AS count FROM registrations WHERE activity_id = ?").get(req.params.id).count;
    if (count >= activity.capacity) return res.status(400).json({ error: "Deze activiteit is vol." });
  }

  db.prepare("INSERT OR IGNORE INTO registrations (activity_id, user_id) VALUES (?, ?)").run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

app.delete("/api/activities/:id/register", requireAuth, (req, res) => {
  db.prepare("DELETE FROM registrations WHERE activity_id = ? AND user_id = ?").run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

app.get("/api/activities/:id/registrations", requireAuth, requireAdmin, (req, res) => {
  const rows = db
    .prepare(`
      SELECT u.id, u.name, u.email, u.year_layer, u.role_title, r.created_at
      FROM registrations r
      JOIN users u ON u.id = r.user_id
      WHERE r.activity_id = ?
      ORDER BY r.created_at ASC
    `)
    .all(req.params.id);
  res.json({ registrations: rows.map((row) => ({ ...publicUser(row), registeredAt: row.created_at })) });
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`Cassiopeia draait op http://${HOST}:${PORT}`);
});
