const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const express = require("express");
const session = require("express-session");
const { db, initializeDatabase, ensureYearAgendaItems } = require("./db");
const { MAX_IMPORT_ROWS, parseMemberImport, validateRecords } = require("./member-import");
const { createSqliteSessionStore } = require("./session-store");

initializeDatabase();
const SQLiteSessionStore = createSqliteSessionStore(session, db);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const SESSION_SECRET = process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? null : "cassiopeia-local-development-secret");
const SESSION_COOKIE = "cassiopeia.sid";
const PASSWORD_MIN_LENGTH = 12;
const ACCOUNT_TOKEN_LIFETIME_MS = 1000 * 60 * 60 * 48;
const LOGIN_WINDOW_MS = 1000 * 60 * 15;
const LOGIN_MAX_ATTEMPTS = 5;
const MEMBER_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const loginAttempts = new Map();

if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET is verplicht in productie.");
}

if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use((req, res, next) => {
  const connectSources = process.env.NODE_ENV === "production"
    ? "'self'"
    : "'self' http://127.0.0.1:3000 http://localhost:3000";
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src ${connectSources}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`
  );
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isLocalDevOrigin = process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || "");
  if (isLocalDevOrigin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);

  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && origin && !isLocalDevOrigin) {
    try {
      const requestOrigin = new URL(origin);
      if (requestOrigin.host !== req.get("host")) return res.status(403).json({ error: "Ongeldige aanvraagbron." });
    } catch (error) {
      return res.status(403).json({ error: "Ongeldige aanvraagbron." });
    }
  }
  next();
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(
  session({
    name: SESSION_COOKIE,
    store: new SQLiteSessionStore(),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.use(
  express.static(path.join(__dirname, "..", "public"), {
    setHeaders(res, filePath) {
      if (/\.(html|js|css)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "no-store");
      }
    }
  })
);

app.use((error, req, res, next) => {
  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Het bestand is te groot." });
  }
  next(error);
});

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
    memberStatus: user.member_status || "actief",
    committee: user.committee || "",
    isAdmin: Boolean(user.is_admin),
    accountStatus: user.account_status || "active"
  };
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Je moet ingelogd zijn." });
  const user = db.prepare("SELECT account_status FROM users WHERE id = ?").get(req.session.userId);
  if (!user || user.account_status !== "active") {
    return req.session.destroy(() => res.status(401).json({ error: "Je account is niet actief." }));
  }
  next();
}

function requireAdmin(req, res, next) {
  const user = db.prepare("SELECT is_admin, account_status FROM users WHERE id = ?").get(req.session.userId);
  if (!user || user.account_status !== "active" || !user.is_admin) {
    return res.status(403).json({ error: "Alleen actieve admins mogen dit doen." });
  }
  next();
}

function getCurrentUser(req) {
  if (!req.session.userId) return null;
  return db.prepare("SELECT * FROM users WHERE id = ? AND account_status = 'active'").get(req.session.userId);
}

function valueFromBody(body, key, existingValue = "") {
  return Object.prototype.hasOwnProperty.call(body, key) ? String(body[key] || "").trim() : existingValue || "";
}

function memberFromBody(body, existing = {}) {
  const avatarInput = String(body.avatar || "").trim();
  const memberStatus = String(body.memberStatus || existing.member_status || "actief");
  const accountStatus = String(body.accountStatus || existing.account_status || "active");
  return {
    name: valueFromBody(body, "name", existing.name),
    email: valueFromBody(body, "email", existing.email).toLowerCase(),
    year_layer: valueFromBody(body, "yearLayer", existing.year_layer),
    role_title: valueFromBody(body, "roleTitle", existing.role_title),
    phone: valueFromBody(body, "phone", existing.phone),
    address: valueFromBody(body, "address", existing.address),
    bio: valueFromBody(body, "bio", existing.bio),
    avatar: avatarInput && avatarInput.length <= 2 ? avatarInput.toUpperCase() : existing.avatar || "",
    member_status: ["actief", "oud"].includes(memberStatus) ? memberStatus : "actief",
    committee: valueFromBody(body, "committee", existing.committee),
    is_admin: body.isAdmin ? 1 : 0,
    account_status: ["pending", "active", "disabled"].includes(accountStatus) ? accountStatus : "active"
  };
}

function importBufferFromBody(body) {
  const fileName = path.basename(String(body.fileName || "").trim());
  const encoded = String(body.data || "").trim();
  if (!fileName || !encoded) throw new Error("Kies een CSV- of PDF-bestand.");
  if (encoded.length > Math.ceil(MEMBER_IMPORT_MAX_BYTES * 4 / 3) + 16) {
    throw new Error("Het importbestand mag maximaal 5 MB zijn.");
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error("Het importbestand kon niet worden gelezen.");
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > MEMBER_IMPORT_MAX_BYTES) {
    throw new Error("Het importbestand mag maximaal 5 MB zijn.");
  }
  return { buffer, fileName };
}

function importRecordFromBody(body) {
  const member = memberFromBody({ ...body, isAdmin: false, accountStatus: "pending" });
  return {
    sourceRow: Number(body.sourceRow) || 0,
    name: member.name,
    email: member.email,
    yearLayer: member.year_layer,
    roleTitle: member.role_title,
    phone: member.phone,
    address: member.address,
    bio: member.bio,
    memberStatus: member.member_status,
    committee: member.committee
  };
}

function passwordError(password, email = "") {
  if (password.length < PASSWORD_MIN_LENGTH) return `Je wachtwoord moet minimaal ${PASSWORD_MIN_LENGTH} tekens zijn.`;
  if (password.length > 200) return "Je wachtwoord is te lang.";
  const normalized = password.toLowerCase();
  if (["cassio2026!", "welkom2026!", "wachtwoord123!"].includes(normalized)) return "Kies een uniek wachtwoord.";
  if (email && normalized.includes(String(email).toLowerCase().split("@")[0])) return "Gebruik je e-mailadres niet in je wachtwoord.";
  return "";
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function destroyUserSessions(userId, exceptSid = "") {
  const deleteSession = db.prepare("DELETE FROM sessions WHERE sid = ?");
  db.prepare("SELECT sid, sess FROM sessions").all().forEach((row) => {
    if (row.sid === exceptSid) return;
    try {
      if (Number(JSON.parse(row.sess).userId) === Number(userId)) deleteSession.run(row.sid);
    } catch (error) {
      deleteSession.run(row.sid);
    }
  });
}

function isLastActiveAdmin(userId) {
  const target = db.prepare("SELECT is_admin, account_status FROM users WHERE id = ?").get(userId);
  if (!target || !target.is_admin || target.account_status !== "active") return false;
  return db.prepare("SELECT COUNT(*) AS count FROM users WHERE is_admin = 1 AND account_status = 'active'").get().count <= 1;
}

function createAccountToken(userId, purpose, createdBy) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + ACCOUNT_TOKEN_LIFETIME_MS;
  db.transaction(() => {
    db.prepare("UPDATE account_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL").run(userId);
    db.prepare(`
      INSERT INTO account_tokens (user_id, token_hash, purpose, expires_at, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, tokenHash(token), purpose, expiresAt, createdBy);
  })();
  return { invitePath: `/#activate=${encodeURIComponent(token)}`, expiresAt: new Date(expiresAt).toISOString(), purpose };
}

function loginAttemptKey(req, email) {
  return `${req.ip}:${email}`;
}

function activeLoginAttempt(key) {
  const attempt = loginAttempts.get(key);
  if (!attempt || attempt.resetAt <= Date.now()) {
    loginAttempts.delete(key);
    return null;
  }
  return attempt;
}

function recordFailedLogin(key) {
  if (loginAttempts.size > 5000) {
    loginAttempts.forEach((attempt, attemptKey) => {
      if (attempt.resetAt <= Date.now()) loginAttempts.delete(attemptKey);
    });
    if (loginAttempts.size > 10000) loginAttempts.clear();
  }
  const current = activeLoginAttempt(key) || { count: 0, resetAt: Date.now() + LOGIN_WINDOW_MS };
  current.count += 1;
  loginAttempts.set(key, current);
  return current;
}

function createAuthenticatedSession(req, res, user, status = 200) {
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: "Inloggen is tijdelijk niet mogelijk." });
    req.session.userId = user.id;
    req.session.save((saveError) => {
      if (saveError) return res.status(500).json({ error: "Inloggen is tijdelijk niet mogelijk." });
      res.status(status).json({ user: publicUser(user) });
    });
  });
}

function profileAvatarFromBody(value, existingAvatar) {
  const avatar = String(value || "").trim();
  if (!avatar) return existingAvatar || "";
  const imageMatch = avatar.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  if (imageMatch) {
    const imageSize = Buffer.byteLength(imageMatch[2], "base64");
    if (imageSize <= 5 * 1024 * 1024) return avatar;
  }
  if (/^https?:\/\/.+/i.test(avatar) && avatar.length <= 500) return avatar;
  if (avatar.length <= 2) return avatar.toUpperCase();
  throw new Error("Gebruik een afbeelding van maximaal 5 MB.");
}

app.get("/api/session", (req, res) => {
  res.json({ user: publicUser(getCurrentUser(req)) });
});

app.post("/api/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!email || !password) {
    return res.status(400).json({ error: "Vul je e-mailadres en wachtwoord in." });
  }
  const attemptKey = loginAttemptKey(req, email);
  const attempt = activeLoginAttempt(attemptKey);
  if (attempt?.count >= LOGIN_MAX_ATTEMPTS) {
    const retryAfter = Math.max(1, Math.ceil((attempt.resetAt - Date.now()) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({ error: "Te veel mislukte pogingen. Probeer het over 15 minuten opnieuw." });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    recordFailedLogin(attemptKey);
    return res.status(401).json({ error: "E-mail of wachtwoord klopt niet." });
  }
  if (user.account_status === "pending") {
    return res.status(403).json({ error: "Gebruik eerst je persoonlijke uitnodigingslink om een wachtwoord in te stellen." });
  }
  if (user.account_status !== "active") {
    return res.status(403).json({ error: "Dit account is uitgeschakeld. Neem contact op met een beheerder." });
  }

  loginAttempts.delete(attemptKey);
  db.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
  createAuthenticatedSession(req, res, db.prepare("SELECT * FROM users WHERE id = ?").get(user.id));
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
    res.json({ ok: true });
  });
});

app.post("/api/account-token/inspect", (req, res) => {
  const token = String(req.body.token || "");
  if (token.length < 32 || token.length > 200) return res.status(400).json({ error: "Deze link is ongeldig." });
  const row = db.prepare(`
    SELECT t.purpose, t.expires_at, u.name, u.email
    FROM account_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > ?
  `).get(tokenHash(token), Date.now());
  if (!row) return res.status(400).json({ error: "Deze link is ongeldig, verlopen of al gebruikt." });
  res.json({
    name: row.name,
    email: row.email,
    purpose: row.purpose,
    expiresAt: new Date(row.expires_at).toISOString()
  });
});

app.post("/api/account/activate", async (req, res) => {
  const token = String(req.body.token || "");
  const password = String(req.body.password || "");
  const tokenRow = db.prepare(`
    SELECT t.id, t.user_id, t.purpose, t.expires_at, u.email
    FROM account_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > ?
  `).get(tokenHash(token), Date.now());
  if (!tokenRow) return res.status(400).json({ error: "Deze link is ongeldig, verlopen of al gebruikt." });

  const validationError = passwordError(password, tokenRow.email);
  if (validationError) return res.status(400).json({ error: validationError });
  const passwordHash = await bcrypt.hash(password, 12);

  const activated = db.transaction(() => {
    const currentUser = db.prepare("SELECT account_status FROM users WHERE id = ?").get(tokenRow.user_id);
    if (!currentUser || currentUser.account_status === "disabled") return false;
    const consumed = db.prepare(`
      UPDATE account_tokens
      SET used_at = CURRENT_TIMESTAMP
      WHERE id = ? AND used_at IS NULL AND expires_at > ?
    `).run(tokenRow.id, Date.now());
    if (!consumed.changes) return false;
    db.prepare(`
      UPDATE users
      SET password_hash = ?, account_status = 'active', password_changed_at = CURRENT_TIMESTAMP,
          last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(passwordHash, tokenRow.user_id);
    db.prepare("UPDATE account_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL").run(tokenRow.user_id);
    destroyUserSessions(tokenRow.user_id);
    return true;
  })();
  if (!activated) return res.status(400).json({ error: "Deze link is ongeldig, verlopen of al gebruikt." });

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(tokenRow.user_id);
  createAuthenticatedSession(req, res, user);
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
    const validationError = passwordError(newPassword, existing.email);
    if (validationError) return res.status(400).json({ error: validationError });
    if (!(await bcrypt.compare(currentPassword, existing.password_hash))) {
      return res.status(401).json({ error: "Je huidige wachtwoord klopt niet." });
    }
    const password_hash = await bcrypt.hash(newPassword, 12);
    db.prepare("UPDATE users SET address = ?, avatar = ?, password_hash = ?, password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(address, avatar, password_hash, req.session.userId);
    destroyUserSessions(req.session.userId, req.sessionID);
  } else {
    db.prepare("UPDATE users SET address = ?, avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(address, avatar, req.session.userId);
  }

  res.json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId)) });
});

app.get("/api/members", requireAuth, (req, res) => {
  const q = `%${String(req.query.q || "").trim()}%`;
  const currentUser = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(req.session.userId);
  const rows = db
    .prepare(`
      SELECT * FROM users
      WHERE (name LIKE ? OR year_layer LIKE ?)
        AND (account_status = 'active' OR ? = 1)
      ORDER BY year_layer DESC, name ASC
    `)
    .all(q, q, currentUser?.is_admin ? 1 : 0);
  res.json({ members: rows.map(publicUser) });
});

app.get("/api/members/:id", requireAuth, (req, res) => {
  const member = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!member) return res.status(404).json({ error: "Lid niet gevonden." });
  const currentUser = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(req.session.userId);
  if (member.account_status !== "active" && !currentUser?.is_admin) {
    return res.status(404).json({ error: "Lid niet gevonden." });
  }
  res.json({ member: publicUser(member) });
});

app.post("/api/members/import/preview", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { buffer, fileName } = importBufferFromBody(req.body);
    const defaultYear = String(req.body.defaultYear || "").trim();
    const parsed = await parseMemberImport({ buffer, fileName, defaultYear });
    const existingEmails = new Set(db.prepare("SELECT email FROM users").all().map((row) => row.email.toLowerCase()));
    const records = parsed.map((record) => {
      const duplicate = Boolean(record.email && existingEmails.has(record.email));
      return {
        ...record,
        duplicate,
        ready: !record.errors.length && !duplicate
      };
    });
    res.json({
      fileName,
      records,
      summary: {
        total: records.length,
        ready: records.filter((record) => record.ready).length,
        duplicates: records.filter((record) => record.duplicate).length,
        invalid: records.filter((record) => record.errors.length).length
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Het importbestand kon niet worden gelezen." });
  }
});

app.post("/api/members/import", requireAuth, requireAdmin, (req, res) => {
  const inputRecords = Array.isArray(req.body.records) ? req.body.records : [];
  if (!inputRecords.length) return res.status(400).json({ error: "Er zijn geen leden geselecteerd om te importeren." });
  if (inputRecords.length > MAX_IMPORT_ROWS) {
    return res.status(400).json({ error: `Importeer maximaal ${MAX_IMPORT_ROWS} leden tegelijk.` });
  }

  const records = validateRecords(inputRecords.map(importRecordFromBody));
  const invalid = records.filter((record) => record.errors.length);
  if (invalid.length) {
    return res.status(400).json({ error: "Controleer de ongeldige rijen en maak opnieuw een voorbeeld." });
  }

  const existingEmails = new Set(db.prepare("SELECT email FROM users").all().map((row) => row.email.toLowerCase()));
  if (records.some((record) => existingEmails.has(record.email))) {
    return res.status(409).json({ error: "Minimaal één e-mailadres bestaat al. Maak opnieuw een voorbeeld." });
  }

  const expiresAt = Date.now() + ACCOUNT_TOKEN_LIFETIME_MS;
  const prepared = records.map((record) => ({
    member: memberFromBody({ ...record, isAdmin: false, accountStatus: "pending" }),
    passwordHash: bcrypt.hashSync(crypto.randomBytes(48).toString("base64url"), 6),
    token: crypto.randomBytes(32).toString("base64url")
  }));

  try {
    const created = db.transaction(() => {
      const insertMember = db.prepare(`
        INSERT INTO users (name, email, password_hash, year_layer, role_title, phone, address, bio, avatar, member_status, committee, is_admin, account_status)
        VALUES (@name, @email, @password_hash, @year_layer, @role_title, @phone, @address, @bio, @avatar, @member_status, @committee, 0, 'pending')
      `);
      const insertToken = db.prepare(`
        INSERT INTO account_tokens (user_id, token_hash, purpose, expires_at, created_by)
        VALUES (?, ?, 'invite', ?, ?)
      `);

      return prepared.map(({ member, passwordHash, token }) => {
        const result = insertMember.run({ ...member, password_hash: passwordHash });
        insertToken.run(result.lastInsertRowid, tokenHash(token), expiresAt, req.session.userId);
        const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
        return {
          member: publicUser(user),
          invitation: {
            invitePath: `/#activate=${encodeURIComponent(token)}`,
            expiresAt: new Date(expiresAt).toISOString(),
            purpose: "invite"
          }
        };
      });
    })();
    res.status(201).json({ created });
  } catch (error) {
    res.status(409).json({ error: "De import kon niet worden opgeslagen. Controleer of e-mailadressen uniek zijn." });
  }
});

app.post("/api/members", requireAuth, requireAdmin, async (req, res) => {
  const member = memberFromBody(req.body);
  if (!member.name || !member.email || !member.year_layer) {
    return res.status(400).json({ error: "Naam, e-mail en jaarlaag zijn verplicht." });
  }

  const password_hash = await bcrypt.hash(crypto.randomBytes(48).toString("base64url"), 12);
  try {
    const result = db
      .prepare(`
        INSERT INTO users (name, email, password_hash, year_layer, role_title, phone, address, bio, avatar, member_status, committee, is_admin, account_status)
        VALUES (@name, @email, @password_hash, @year_layer, @role_title, @phone, @address, @bio, @avatar, @member_status, @committee, @is_admin, @account_status)
      `)
      .run({ ...member, password_hash, account_status: "pending" });
    const created = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
    const invitation = createAccountToken(created.id, "invite", req.session.userId);
    res.status(201).json({ member: publicUser(created), invitation });
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
  const targetId = Number(req.params.id);
  if (targetId === Number(req.session.userId) && (!member.is_admin || member.account_status !== "active")) {
    return res.status(400).json({ error: "Je kunt je eigen adminaccount niet uitschakelen of demoveren." });
  }
  if (isLastActiveAdmin(targetId) && (!member.is_admin || member.account_status !== "active")) {
    return res.status(400).json({ error: "Er moet minimaal één actieve admin blijven." });
  }
  if (existing.account_status === "pending" && member.account_status === "active" && !existing.password_changed_at) {
    return res.status(400).json({ error: "Activeer dit account via de persoonlijke uitnodigingslink." });
  }

  try {
    db.prepare(`
      UPDATE users
      SET name = @name, email = @email, year_layer = @year_layer, role_title = @role_title,
          phone = @phone, address = @address, bio = @bio, avatar = @avatar,
          member_status = @member_status, committee = @committee, is_admin = @is_admin,
          account_status = @account_status, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ ...member, id: req.params.id });

    if (member.account_status !== "active" || member.email !== existing.email) {
      db.prepare("UPDATE account_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL").run(targetId);
      destroyUserSessions(targetId);
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
  if (isLastActiveAdmin(req.params.id)) {
    return res.status(400).json({ error: "Er moet minimaal één actieve admin blijven." });
  }
  destroyUserSessions(req.params.id);
  const result = db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Lid niet gevonden." });
  res.json({ ok: true });
});

app.post("/api/members/:id/invitations", requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "Lid niet gevonden." });
  if (user.account_status === "disabled") {
    return res.status(400).json({ error: "Zet het account eerst op actief voordat je een wachtwoordlink maakt." });
  }
  const purpose = user.account_status === "pending" ? "invite" : "reset";
  const invitation = createAccountToken(user.id, purpose, req.session.userId);
  res.status(201).json({ invitation, member: publicUser(user) });
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
  const rows = db
    .prepare(`
      SELECT a.*,
        COUNT(r.id) AS registration_count,
        EXISTS(SELECT 1 FROM registrations mine WHERE mine.activity_id = a.id AND mine.user_id = ?) AS is_registered
      FROM activities a
      LEFT JOIN registrations r ON r.activity_id = a.id
      GROUP BY a.id
      ORDER BY datetime(a.starts_at) ASC
    `)
    .all(userId);
  const participantsByActivity = new Map();
  const participants = db
    .prepare(`
      SELECT r.activity_id, u.id, u.name, u.avatar
      FROM registrations r
      JOIN users u ON u.id = r.user_id
      ORDER BY r.created_at ASC
    `)
    .all();

  participants.forEach((participant) => {
    const activityParticipants = participantsByActivity.get(participant.activity_id) || [];
    activityParticipants.push(publicUser(participant));
    participantsByActivity.set(participant.activity_id, activityParticipants);
  });

  return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      location: row.location,
      startsAt: row.starts_at,
      capacity: row.capacity,
      registrationCount: row.registration_count,
      isRegistered: Boolean(row.is_registered),
      participants: participantsByActivity.get(row.id) || []
    }));
}

function yearAgendaItemFromRow(row) {
  return {
    id: row.id,
    monthLabel: row.month_label,
    monthIndex: row.month_index,
    dayLabel: row.day_label,
    title: row.title,
    sortOrder: row.sort_order
  };
}

function yearAgendaItemFromBody(body, existing = {}) {
  const monthIndex = Number(body.monthIndex ?? existing.month_index);
  const sortOrder = Number(body.sortOrder ?? existing.sort_order ?? 0);
  return {
    month_label: String(body.monthLabel || existing.month_label || "").trim(),
    month_index: Number.isFinite(monthIndex) && monthIndex > 0 ? monthIndex : existing.month_index || 1,
    day_label: String(body.dayLabel || existing.day_label || "").trim(),
    title: String(body.title || existing.title || "").trim(),
    sort_order: Number.isFinite(sortOrder) ? sortOrder : existing.sort_order || 0
  };
}

app.get("/api/activities", requireAuth, (req, res) => {
  res.json({ activities: activityRows(req.session.userId) });
});

app.get("/api/year-agenda", requireAuth, (req, res) => {
  ensureYearAgendaItems();
  const rows = db
    .prepare(`
      SELECT * FROM year_agenda_items
      ORDER BY month_index ASC, sort_order ASC, id ASC
    `)
    .all();
  const summary = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("year_agenda_summary")?.value || "";
  res.json({ items: rows.map(yearAgendaItemFromRow), summary });
});

app.put("/api/year-agenda-summary", requireAuth, requireAdmin, (req, res) => {
  const summary = String(req.body.summary || "").trim();
  if (!summary) return res.status(400).json({ error: "Overzichtstekst is verplicht." });
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('year_agenda_summary', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(summary);
  res.json({ summary });
});

app.post("/api/year-agenda", requireAuth, requireAdmin, (req, res) => {
  const item = yearAgendaItemFromBody(req.body);
  if (!item.month_label || !item.day_label || !item.title) {
    return res.status(400).json({ error: "Maand, datum en titel zijn verplicht." });
  }

  const result = db
    .prepare(`
      INSERT INTO year_agenda_items (month_label, month_index, day_label, title, sort_order)
      VALUES (@month_label, @month_index, @day_label, @title, @sort_order)
    `)
    .run(item);
  const created = db.prepare("SELECT * FROM year_agenda_items WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json({ item: yearAgendaItemFromRow(created) });
});

app.put("/api/year-agenda/:id", requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare("SELECT * FROM year_agenda_items WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Agendapunt niet gevonden." });

  const item = yearAgendaItemFromBody(req.body, existing);
  if (!item.month_label || !item.day_label || !item.title) {
    return res.status(400).json({ error: "Maand, datum en titel zijn verplicht." });
  }

  db.prepare(`
    UPDATE year_agenda_items
    SET month_label = @month_label, month_index = @month_index, day_label = @day_label,
        title = @title, sort_order = @sort_order, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ ...item, id: req.params.id });

  const updated = db.prepare("SELECT * FROM year_agenda_items WHERE id = ?").get(req.params.id);
  res.json({ item: yearAgendaItemFromRow(updated) });
});

app.delete("/api/year-agenda/:id", requireAuth, requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM year_agenda_items WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Agendapunt niet gevonden." });
  res.json({ ok: true });
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
  const result = db.prepare("DELETE FROM activities WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Activiteit niet gevonden." });
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
