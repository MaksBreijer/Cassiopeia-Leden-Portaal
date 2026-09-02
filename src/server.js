const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const express = require("express");
const session = require("express-session");
const { db, initializeDatabase, ensureYearAgendaItems } = require("./db");
const { createCalendarFeed, googleCalendarLinkFromIcsUrl, parseGoogleCalendarFeed, visibleCalendarItems } = require("./calendar-feed");
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
const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const INDEX_HTML_PATH = path.join(__dirname, "..", "public", "index.html");
const ACTIVITY_SHARE_IMAGE_URL = "https://www.dispuutcassiopeia.nl/assets/cassiopeia-activity-share.png?v=20260902-rsvp";
const loginAttempts = new Map();
const confessionAttempts = new Map();
let googleCalendarCache = { url: "", feed: "", items: [], expiresAt: 0 };

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

function sendActivitySharePage(activityId, res, next) {
  if (!/^\d+$/.test(activityId)) return next();
  const activityExists = db.prepare("SELECT 1 FROM activities WHERE id = ?").get(activityId);
  if (!activityExists) return next();

  const shareUrl = `https://www.dispuutcassiopeia.nl/activity/${activityId}`;
  const html = fs.readFileSync(INDEX_HTML_PATH, "utf8")
    .replace('<meta property="og:title" content="Dameschdispuut Cassiopeia · Lustrum III" />', '<meta property="og:title" content="Activiteit · Dameschdispuut Cassiopeia" />')
    .replace('<meta property="og:description" content="Het besloten ledenportaal voor activiteiten, jaarplanning en leden." />', '<meta property="og:description" content="Log in en schrijf je in voor deze activiteit." />')
    .replace(/<meta property="og:image" content="[^"]+" \/>/, `<meta property="og:image" content="${ACTIVITY_SHARE_IMAGE_URL}" />`)
    .replace('<meta property="og:image:alt" content="Logo van Dameschdispuut Cassiopeia" />', '<meta property="og:image:alt" content="Schrijf je nu in voor een activiteit van Dameschdispuut Cassiopeia" />')
    .replace('<meta property="og:url" content="https://www.dispuutcassiopeia.nl/" />', `<meta property="og:url" content="${shareUrl}" />`)
    .replace('<meta name="twitter:title" content="Dameschdispuut Cassiopeia · Lustrum III" />', '<meta name="twitter:title" content="Activiteit · Dameschdispuut Cassiopeia" />')
    .replace('<meta name="twitter:description" content="Het besloten ledenportaal voor activiteiten, jaarplanning en leden." />', '<meta name="twitter:description" content="Log in en schrijf je in voor deze activiteit." />')
    .replace(/<meta name="twitter:image" content="[^"]+" \/>/, `<meta name="twitter:image" content="${ACTIVITY_SHARE_IMAGE_URL}" />`)
    .replace('<meta name="twitter:image:alt" content="Logo van Dameschdispuut Cassiopeia" />', '<meta name="twitter:image:alt" content="Schrijf je nu in voor een activiteit van Dameschdispuut Cassiopeia" />');

  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(html);
}

app.get("/", (req, res, next) => {
  sendActivitySharePage(String(req.query.activity || "").trim(), res, next);
});

app.get("/activity/:activityId", (req, res, next) => {
  sendActivitySharePage(String(req.params.activityId || "").trim(), res, next);
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

function hasCoordinates(latitude, longitude) {
  return latitude !== null && latitude !== undefined && latitude !== "" &&
    longitude !== null && longitude !== undefined && longitude !== "" &&
    Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    yearLayer: user.year_layer,
    roleTitle: user.role_title,
    phone: user.phone,
    birthday: user.birthday || "",
    address: user.address,
    // Round positions before returning them so the map never exposes an exact home address.
    latitude: hasCoordinates(user.latitude, user.longitude) ? Number(Number(user.latitude).toFixed(3)) : null,
    longitude: hasCoordinates(user.latitude, user.longitude) ? Number(Number(user.longitude).toFixed(3)) : null,
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

function birthdayFromBody(body, existingValue = "") {
  const birthday = valueFromBody(body, "birthday", existingValue);
  if (!birthday) return "";
  const match = birthday.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("Vul een geldige verjaardag in.");
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) {
    throw new Error("Vul een geldige verjaardag in.");
  }
  return birthday;
}

async function geocodeAddress(address) {
  const query = String(address || "").trim();
  if (!query || typeof fetch !== "function") return null;

  // PDOK gebruikt de Nederlandse BAG en herkent ook kleine typefouten in straatnamen.
  const pdokController = new AbortController();
  const pdokTimeout = setTimeout(() => pdokController.abort(), 4500);
  try {
    const params = new URLSearchParams({ q: query, rows: "1", fq: "type:adres" });
    const response = await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?${params}`, {
      headers: { "User-Agent": "Cassiopeia-Leden-Portaal/1.0 (contact@dispuutcassiopeia.nl)" },
      signal: pdokController.signal
    });
    if (response.ok) {
      const result = (await response.json())?.response?.docs?.[0];
      const point = String(result?.centroide_ll || "").match(/^POINT\(([-\d.]+)\s+([-\d.]+)\)$/);
      const longitude = Number(point?.[1]);
      const latitude = Number(point?.[2]);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude };
    }
  } catch (error) {
    // OpenStreetMap hieronder blijft beschikbaar als PDOK tijdelijk niet reageert.
  } finally {
    clearTimeout(pdokTimeout);
  }

  const postalCode = query.match(/\b\d{4}\s?[A-Za-z]{2}\b/)?.[0];
  const fallbackQuery = postalCode ? postalCode.toUpperCase().replace(/(\d{4})([A-Z]{2})/, "$1 $2") : "";
  const queries = [...new Set([query, fallbackQuery].filter(Boolean))];

  for (const [index, candidate] of queries.entries()) {
    if (index) await new Promise((resolve) => setTimeout(resolve, 1100));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=nl&q=${encodeURIComponent(`${candidate}, Nederland`)}`, {
        headers: { "User-Agent": "Cassiopeia-Leden-Portaal/1.0 (contact@dispuutcassiopeia.nl)" },
        signal: controller.signal
      });
      if (!response.ok) continue;
      const results = await response.json();
      const result = Array.isArray(results) ? results[0] : null;
      const latitude = Number(result?.lat);
      const longitude = Number(result?.lon);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude };
    } catch (error) {
      // Probeer bij een onbekend volledig adres nog de postcode als globale locatie.
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

async function coordinatesForAddress(address, existing = {}) {
  const cleanAddress = String(address || "").trim();
  if (!cleanAddress) return { latitude: null, longitude: null, location_updated_at: null };
  const existingAddress = String(existing.address || "").trim();
  if (cleanAddress === existingAddress && hasCoordinates(existing.latitude, existing.longitude)) {
    return { latitude: existing.latitude, longitude: existing.longitude, location_updated_at: existing.location_updated_at || null };
  }
  const coordinates = await geocodeAddress(cleanAddress);
  return coordinates
    ? { ...coordinates, location_updated_at: new Date().toISOString() }
    : { latitude: null, longitude: null, location_updated_at: null };
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
    birthday: birthdayFromBody(body, existing.birthday),
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

function uploadedFileFromBody(body, { required = true, allowedMime = [] } = {}) {
  const fileName = path.basename(String(body.fileName || body.name || "").trim());
  const mimeType = String(body.mimeType || body.type || "").trim().toLowerCase();
  const encoded = String(body.data || "").trim();
  if (!fileName || !mimeType || !encoded) {
    if (!required) return null;
    throw new Error("Kies een bestand.");
  }
  if (allowedMime.length && !allowedMime.includes(mimeType)) throw new Error("Dit bestandstype wordt niet ondersteund.");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error("Het bestand kon niet worden gelezen.");
  const size = Buffer.byteLength(encoded, "base64");
  if (!size || size > UPLOAD_MAX_BYTES) throw new Error("Een bestand mag maximaal 5 MB zijn.");
  return { fileName, mimeType, data: encoded };
}

function publicDocument(row) {
  return { id: row.id, title: row.title, category: row.category, fileName: row.file_name, mimeType: row.mime_type, createdAt: row.created_at };
}

function publicActivityFile(row) {
  return { id: row.id, activityId: row.activity_id, fileName: row.file_name, mimeType: row.mime_type, createdAt: row.created_at };
}

function registrationDeadline(startsAt) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getFullYear(), start.getMonth(), 1);
}

function isRegistrationOpen(startsAt, registrationOverride = "automatic") {
  if (registrationOverride === "open") return true;
  if (registrationOverride === "closed") return false;
  const deadline = registrationDeadline(startsAt);
  return Boolean(deadline && Date.now() < deadline.getTime());
}

function isLateCancellation(startsAt) {
  const deadline = registrationDeadline(startsAt);
  return Boolean(deadline && Date.now() >= deadline.getTime());
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
  let birthday;
  try {
    avatar = profileAvatarFromBody(req.body.avatar, existing.avatar);
    birthday = birthdayFromBody(req.body, existing.birthday);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");
  const address = req.body.address === undefined ? existing.address || "" : String(req.body.address || "").trim();
  const coordinates = await coordinatesForAddress(address, existing);

  if (newPassword) {
    const validationError = passwordError(newPassword, existing.email);
    if (validationError) return res.status(400).json({ error: validationError });
    if (!(await bcrypt.compare(currentPassword, existing.password_hash))) {
      return res.status(401).json({ error: "Je huidige wachtwoord klopt niet." });
    }
    const password_hash = await bcrypt.hash(newPassword, 12);
    db.prepare("UPDATE users SET address = ?, latitude = ?, longitude = ?, location_updated_at = ?, avatar = ?, birthday = ?, password_hash = ?, password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(address, coordinates.latitude, coordinates.longitude, coordinates.location_updated_at, avatar, birthday, password_hash, req.session.userId);
    destroyUserSessions(req.session.userId, req.sessionID);
  } else {
    db.prepare("UPDATE users SET address = ?, latitude = ?, longitude = ?, location_updated_at = ?, avatar = ?, birthday = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(address, coordinates.latitude, coordinates.longitude, coordinates.location_updated_at, avatar, birthday, req.session.userId);
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

app.get("/api/map-members", requireAuth, async (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM users
    WHERE account_status = 'active' AND TRIM(address) <> ''
    ORDER BY name ASC
  `).all();
  const missing = rows.filter((row) => !hasCoordinates(row.latitude, row.longitude)).slice(0, 12);

  // Existing addresses are geocoded lazily the first time the map is opened.
  // New or changed addresses are geocoded when the profile is saved.
  for (const member of missing) {
    const coordinates = await coordinatesForAddress(member.address, { address: "" });
    if (!coordinates.location_updated_at) continue;
    db.prepare("UPDATE users SET latitude = ?, longitude = ?, location_updated_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(coordinates.latitude, coordinates.longitude, coordinates.location_updated_at, member.id);
    member.latitude = coordinates.latitude;
    member.longitude = coordinates.longitude;
    member.location_updated_at = coordinates.location_updated_at;
  }

  const members = db.prepare(`
    SELECT * FROM users
    WHERE account_status = 'active' AND TRIM(address) <> ''
    ORDER BY name ASC
  `).all();
  res.json({ members: members.map(publicUser) });
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
  let member;
  try {
    member = memberFromBody(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  if (!member.name || !member.email || !member.year_layer) {
    return res.status(400).json({ error: "Naam, e-mail en jaarlaag zijn verplicht." });
  }

  const coordinates = await coordinatesForAddress(member.address);
  const password_hash = await bcrypt.hash(crypto.randomBytes(48).toString("base64url"), 12);
  try {
    const result = db
      .prepare(`
        INSERT INTO users (name, email, password_hash, year_layer, role_title, phone, birthday, address, latitude, longitude, location_updated_at, bio, avatar, member_status, committee, is_admin, account_status)
        VALUES (@name, @email, @password_hash, @year_layer, @role_title, @phone, @birthday, @address, @latitude, @longitude, @location_updated_at, @bio, @avatar, @member_status, @committee, @is_admin, @account_status)
      `)
      .run({ ...member, ...coordinates, password_hash, account_status: "pending" });
    const created = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
    const invitation = createAccountToken(created.id, "invite", req.session.userId);
    res.status(201).json({ member: publicUser(created), invitation });
  } catch (error) {
    res.status(409).json({ error: "Er bestaat al een lid met dit e-mailadres." });
  }
});

app.post("/api/members/bulk-delete", requireAuth, requireAdmin, (req, res) => {
  const rawIds = Array.isArray(req.body.ids) ? req.body.ids : [];
  const ids = [...new Set(rawIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return res.status(400).json({ error: "Selecteer minimaal één lid." });
  if (ids.length > MAX_IMPORT_ROWS) return res.status(400).json({ error: `Verwijder maximaal ${MAX_IMPORT_ROWS} leden tegelijk.` });
  if (ids.includes(Number(req.session.userId))) {
    return res.status(400).json({ error: "Je kunt je eigen adminaccount niet verwijderen." });
  }

  const placeholders = ids.map(() => "?").join(",");
  const targets = db.prepare(`SELECT id, is_admin FROM users WHERE id IN (${placeholders})`).all(...ids);
  if (targets.length !== ids.length) {
    return res.status(409).json({ error: "De ledenlijst is gewijzigd. Vernieuw de pagina en probeer opnieuw." });
  }
  if (targets.some((target) => target.is_admin)) {
    return res.status(403).json({ error: "Adminaccounts kunnen niet bulk worden verwijderd." });
  }

  const targetIds = targets.map((target) => Number(target.id));
  const deleteUsers = db.prepare(`DELETE FROM users WHERE id IN (${targetIds.map(() => "?").join(",")}) AND is_admin = 0`);
  const deleted = db.transaction(() => {
    const deleteSession = db.prepare("DELETE FROM sessions WHERE sid = ?");
    const targetSet = new Set(targetIds);
    db.prepare("SELECT sid, sess FROM sessions").all().forEach((session) => {
      try {
        if (targetSet.has(Number(JSON.parse(session.sess).userId))) deleteSession.run(session.sid);
      } catch {
        // Leave malformed sessions untouched; deleting users still invalidates their account data.
      }
    });
    return deleteUsers.run(...targetIds).changes;
  })();

  res.json({ deleted });
});

app.put("/api/members/:id", requireAuth, requireAdmin, async (req, res) => {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Lid niet gevonden." });

  let member;
  try {
    member = memberFromBody(req.body, existing);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
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

  const coordinates = await coordinatesForAddress(member.address, existing);
  try {
    db.prepare(`
      UPDATE users
      SET name = @name, email = @email, year_layer = @year_layer, role_title = @role_title,
          phone = @phone, birthday = @birthday, address = @address, latitude = @latitude, longitude = @longitude,
          location_updated_at = @location_updated_at, bio = @bio, avatar = @avatar,
          member_status = @member_status, committee = @committee, is_admin = @is_admin,
          account_status = @account_status, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ ...member, ...coordinates, id: req.params.id });

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
  const requestedOverride = String(body.registrationOverride ?? existing.registration_override ?? "automatic").trim();
  const registrationOverride = ["automatic", "open", "closed"].includes(requestedOverride) ? requestedOverride : "automatic";
  const requestedResponseMode = String(body.responseMode ?? existing.response_mode ?? "signup").trim();
  const responseMode = ["signup", "optout"].includes(requestedResponseMode) ? requestedResponseMode : "signup";
  return {
    title: String(body.title || existing.title || "").trim(),
    description: String(body.description || existing.description || "").trim(),
    location: String(body.location || existing.location || "").trim(),
    starts_at: String(body.startsAt || existing.starts_at || "").trim(),
    capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : null,
    response_mode: responseMode,
    registration_override: registrationOverride
  };
}

function activityRows(userId) {
  const canParticipate = !Boolean(db.prepare("SELECT is_admin FROM users WHERE id = ?").get(userId)?.is_admin);
  const rows = db
    .prepare(`
      SELECT a.*,
        EXISTS(SELECT 1 FROM registrations mine WHERE mine.activity_id = a.id AND mine.user_id = ? AND mine.cancelled_at IS NULL) AS is_registered,
        EXISTS(SELECT 1 FROM registrations cancelled WHERE cancelled.activity_id = a.id AND cancelled.user_id = ? AND cancelled.cancelled_at IS NOT NULL) AS was_cancelled,
        COALESCE((SELECT late_cancelled FROM registrations latest WHERE latest.activity_id = a.id AND latest.user_id = ?), 0) AS late_cancelled,
        COALESCE((SELECT cancellation_reason FROM registrations latest WHERE latest.activity_id = a.id AND latest.user_id = ?), '') AS cancellation_reason
      FROM activities a
      ORDER BY datetime(a.starts_at) ASC
    `)
    .all(userId, userId, userId, userId);
  const participantsByActivity = new Map();
  const filesByActivity = new Map();
  const participants = db
    .prepare(`
      SELECT r.activity_id, u.id, u.name, u.avatar
      FROM registrations r
      JOIN users u ON u.id = r.user_id
      JOIN activities a ON a.id = r.activity_id
      WHERE r.cancelled_at IS NULL AND u.account_status = 'active' AND u.is_admin = 0 AND a.response_mode = 'signup'
      UNION ALL
      SELECT a.id AS activity_id, u.id, u.name, u.avatar
      FROM activities a
      CROSS JOIN users u
      WHERE a.response_mode = 'optout' AND u.account_status = 'active' AND u.is_admin = 0
        AND NOT EXISTS (
          SELECT 1 FROM registrations cancelled
          WHERE cancelled.activity_id = a.id AND cancelled.user_id = u.id AND cancelled.cancelled_at IS NOT NULL
        )
      ORDER BY activity_id ASC, name ASC
    `)
    .all();

  participants.forEach((participant) => {
    const activityParticipants = participantsByActivity.get(participant.activity_id) || [];
    activityParticipants.push(publicUser(participant));
    participantsByActivity.set(participant.activity_id, activityParticipants);
  });

  db.prepare("SELECT * FROM activity_files ORDER BY created_at ASC, id ASC").all().forEach((file) => {
    const files = filesByActivity.get(file.activity_id) || [];
    files.push(publicActivityFile(file));
    filesByActivity.set(file.activity_id, files);
  });

  return rows.map((row) => {
    const deadline = registrationDeadline(row.starts_at);
    const responseMode = row.response_mode || "signup";
    const participants = participantsByActivity.get(row.id) || [];
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      location: row.location,
      startsAt: row.starts_at,
      capacity: row.capacity,
      responseMode,
      registrationCount: participants.length,
      registrationDeadline: deadline?.toISOString() || null,
      registrationOverride: row.registration_override || "automatic",
      registrationOpen: isRegistrationOpen(row.starts_at, row.registration_override),
      isRegistered: canParticipate && (responseMode === "optout" ? !Boolean(row.was_cancelled) : Boolean(row.is_registered)),
      wasCancelled: canParticipate && Boolean(row.was_cancelled),
      lateCancelled: canParticipate && Boolean(row.late_cancelled),
      cancellationReason: canParticipate ? row.cancellation_reason || "" : "",
      files: filesByActivity.get(row.id) || [],
      participants
    };
  });
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

function googleCalendarIcsUrl() {
  return db.prepare("SELECT value FROM app_settings WHERE key = ?").get("google_calendar_ical_url")?.value || "";
}

function validateGoogleCalendarIcsUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch (error) {
    throw new Error("Vul een geldig Google Agenda iCal-adres in.");
  }
  if (url.protocol !== "https:" || url.hostname !== "calendar.google.com" || !url.pathname.endsWith(".ics")) {
    throw new Error("Gebruik het geheime of openbare iCal-adres uit Google Agenda.");
  }
  url.username = "";
  url.password = "";
  url.hash = "";
  return url.toString();
}

async function loadGoogleCalendar(url, { force = false } = {}) {
  if (!force && googleCalendarCache.url === url && googleCalendarCache.expiresAt > Date.now()) return googleCalendarCache;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/calendar", "User-Agent": "Cassiopeia-Leden-Portaal/1.0" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Google Agenda antwoordde met status ${response.status}.`);
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > 2 * 1024 * 1024) throw new Error("De Google Agenda is te groot om te koppelen.");
    const feed = await response.text();
    if (Buffer.byteLength(feed, "utf8") > 2 * 1024 * 1024 || !feed.includes("BEGIN:VCALENDAR")) {
      throw new Error("Google gaf geen geldig iCal-bestand terug.");
    }
    googleCalendarCache = { url, feed, items: parseGoogleCalendarFeed(feed), expiresAt: Date.now() + 5 * 60 * 1000 };
    return googleCalendarCache;
  } catch (error) {
    if (googleCalendarCache.url === url && googleCalendarCache.feed) return googleCalendarCache;
    if (error.name === "AbortError") throw new Error("Google Agenda reageerde niet op tijd.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function calendarSubscriptionUrls(req, token) {
  const httpsUrl = `${req.protocol}://${req.get("host")}/api/calendar/${token}.ics`;
  return { httpsUrl, webcalUrl: httpsUrl.replace(/^https?:\/\//, "webcal://") };
}

function localYearAgendaRows() {
  ensureYearAgendaItems();
  return db.prepare(`
    SELECT * FROM year_agenda_items
    ORDER BY month_index ASC, sort_order ASC, id ASC
  `).all();
}

app.get("/api/activities", requireAuth, (req, res) => {
  res.json({ activities: activityRows(req.session.userId) });
});

app.get("/api/year-agenda", requireAuth, async (req, res) => {
  const calendarUrl = googleCalendarIcsUrl();
  if (calendarUrl) {
    try {
      const calendar = await loadGoogleCalendar(calendarUrl);
      const items = visibleCalendarItems(calendar.items);
      return res.json({
        items,
        summary: "Automatisch bijgewerkt vanuit de Cassio Google Agenda",
        source: { type: "google", label: "Cassio Google Agenda", googleCalendarUrl: googleCalendarLinkFromIcsUrl(calendarUrl) }
      });
    } catch (error) {
      const rows = localYearAgendaRows();
      return res.json({
        items: rows.map(yearAgendaItemFromRow),
        summary: db.prepare("SELECT value FROM app_settings WHERE key = ?").get("year_agenda_summary")?.value || "",
        source: { type: "local", label: "Cassiopeia", warning: "De Google Agenda is tijdelijk niet bereikbaar." }
      });
    }
  }
  const rows = localYearAgendaRows();
  const summary = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("year_agenda_summary")?.value || "";
  res.json({ items: rows.map(yearAgendaItemFromRow), summary, source: { type: "local", label: "Cassiopeia" } });
});

app.get("/api/calendar-integration", requireAuth, (req, res) => {
  const calendarUrl = googleCalendarIcsUrl();
  res.json({
    connected: Boolean(calendarUrl),
    sourceLabel: calendarUrl ? "Cassio Google Agenda" : "Cassiopeia jaarplanning",
    googleCalendarUrl: calendarUrl ? googleCalendarLinkFromIcsUrl(calendarUrl) : "",
    canConfigure: Boolean(getCurrentUser(req)?.is_admin)
  });
});

app.put("/api/calendar-integration", requireAuth, requireAdmin, async (req, res) => {
  try {
    const calendarUrl = validateGoogleCalendarIcsUrl(req.body.calendarUrl);
    const calendar = await loadGoogleCalendar(calendarUrl, { force: true });
    const visibleItems = visibleCalendarItems(calendar.items);
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('google_calendar_ical_url', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(calendarUrl);
    res.json({
      connected: true,
      sourceLabel: "Cassio Google Agenda",
      googleCalendarUrl: googleCalendarLinkFromIcsUrl(calendarUrl),
      itemCount: visibleItems.length
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "De Google Agenda kon niet worden gekoppeld." });
  }
});

app.post("/api/calendar-subscription", requireAuth, (req, res) => {
  let subscription = db.prepare("SELECT token FROM calendar_subscriptions WHERE user_id = ?").get(req.session.userId);
  if (!subscription) {
    const token = crypto.randomBytes(32).toString("hex");
    db.prepare("INSERT INTO calendar_subscriptions (user_id, token) VALUES (?, ?)").run(req.session.userId, token);
    subscription = { token };
  }
  const calendarUrl = googleCalendarIcsUrl();
  res.json({
    ...calendarSubscriptionUrls(req, subscription.token),
    sourceLabel: calendarUrl ? "Cassio Google Agenda" : "Cassiopeia jaarplanning",
    googleCalendarUrl: calendarUrl ? googleCalendarLinkFromIcsUrl(calendarUrl) : ""
  });
});

app.get("/api/calendar/:token.ics", async (req, res) => {
  const token = String(req.params.token || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(404).send("Agenda niet gevonden.");
  const subscription = db.prepare(`
    SELECT calendar_subscriptions.user_id
    FROM calendar_subscriptions
    JOIN users ON users.id = calendar_subscriptions.user_id
    WHERE calendar_subscriptions.token = ? AND users.account_status = 'active'
  `).get(token);
  if (!subscription) return res.status(404).send("Agenda niet gevonden.");

  try {
    const calendarUrl = googleCalendarIcsUrl();
    const feed = calendarUrl
      ? (await loadGoogleCalendar(calendarUrl)).feed
      : createCalendarFeed(localYearAgendaRows(), { sourceUrl: `${req.protocol}://${req.get("host")}/#home` });
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="cassiopeia-jaarplanning.ics"');
    res.setHeader("Cache-Control", "private, no-cache, max-age=0");
    res.send(feed);
  } catch (error) {
    res.status(502).send("De agenda is tijdelijk niet bereikbaar.");
  }
});

app.get("/api/documents", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM documents ORDER BY category ASC, title ASC, id DESC").all();
  res.json({ documents: rows.map(publicDocument) });
});

app.get("/api/documents/:id/download", requireAuth, (req, res) => {
  const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Document niet gevonden." });
  res.json({ document: publicDocument(row), data: row.data });
});

app.get("/api/site-assets", (req, res) => {
  const assets = {};
  db.prepare("SELECT key, mime_type, data FROM site_assets").all().forEach((asset) => {
    assets[asset.key] = `data:${asset.mime_type};base64,${asset.data}`;
  });
  res.json({ assets });
});

app.put("/api/site-assets/:key", requireAuth, requireAdmin, (req, res) => {
  const key = String(req.params.key || "").trim().toLowerCase();
  if (!["logo", "hero", "herobackground"].includes(key)) return res.status(400).json({ error: "Onbekend websitebeeld." });
  try {
    const file = uploadedFileFromBody(req.body, { allowedMime: ["image/png", "image/jpeg", "image/webp"] });
    db.prepare(`
      INSERT INTO site_assets (key, file_name, mime_type, data, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET file_name = excluded.file_name, mime_type = excluded.mime_type,
        data = excluded.data, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
    `).run(key, file.fileName, file.mimeType, file.data, req.session.userId);
    res.json({ key, src: `data:${file.mimeType};base64,${file.data}` });
  } catch (error) {
    res.status(400).json({ error: error.message || "De afbeelding kon niet worden opgeslagen." });
  }
});

app.delete("/api/site-assets/:key", requireAuth, requireAdmin, (req, res) => {
  const key = String(req.params.key || "").trim().toLowerCase();
  const result = db.prepare("DELETE FROM site_assets WHERE key = ?").run(key);
  if (!result.changes) return res.status(404).json({ error: "Afbeelding niet gevonden." });
  res.json({ ok: true });
});

app.get("/api/confessions", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT id, body, created_at FROM confessions ORDER BY created_at DESC, id DESC").all();
  res.json({ confessions: rows.map((row) => ({ id: row.id, body: row.body, createdAt: row.created_at })) });
});

app.post("/api/confessions", requireAuth, (req, res) => {
  const body = String(req.body.body || "").trim();
  if (!body) return res.status(400).json({ error: "Schrijf eerst een bericht." });
  if (body.length > 2000) return res.status(400).json({ error: "Een bericht mag maximaal 2000 tekens zijn." });
  const key = String(req.ip || "unknown");
  const current = confessionAttempts.get(key) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
  if (current.resetAt <= Date.now()) {
    current.count = 0;
    current.resetAt = Date.now() + 15 * 60 * 1000;
  }
  if (current.count >= 5) return res.status(429).json({ error: "Je kunt tijdelijk geen nieuwe biecht plaatsen." });
  current.count += 1;
  confessionAttempts.set(key, current);
  const result = db.prepare("INSERT INTO confessions (body) VALUES (?)").run(body);
  const row = db.prepare("SELECT id, body, created_at FROM confessions WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json({ confession: { id: row.id, body: row.body, createdAt: row.created_at } });
});

app.delete("/api/confessions/:id", requireAuth, requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM confessions WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Biecht niet gevonden." });
  res.json({ ok: true });
});

app.post("/api/documents", requireAuth, requireAdmin, (req, res) => {
  const title = String(req.body.title || "").trim();
  const category = ["statuten", "hr", "overig"].includes(String(req.body.category || "").trim().toLowerCase())
    ? String(req.body.category).trim().toLowerCase()
    : "overig";
  if (!title) return res.status(400).json({ error: "Geef het document een naam." });
  try {
    const file = uploadedFileFromBody(req.body, { allowedMime: ["application/pdf"] });
    const result = db.prepare(`
      INSERT INTO documents (title, category, file_name, mime_type, data, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(title, category, file.fileName, file.mimeType, file.data, req.session.userId);
    const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json({ document: publicDocument(row) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Het document kon niet worden opgeslagen." });
  }
});

app.delete("/api/documents/:id", requireAuth, requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM documents WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Document niet gevonden." });
  res.json({ ok: true });
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
    .prepare("INSERT INTO activities (title, description, location, starts_at, capacity, response_mode, registration_override, created_by) VALUES (@title, @description, @location, @starts_at, @capacity, @response_mode, @registration_override, @created_by)")
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
        starts_at = @starts_at, capacity = @capacity, response_mode = @response_mode,
        registration_override = @registration_override,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ ...activity, id: req.params.id });

  res.json({ activity: activityRows(req.session.userId).find((item) => item.id === Number(req.params.id)) });
});

app.delete("/api/activities/:id", requireAuth, requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM activities WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Activiteit niet gevonden." });
  res.json({ ok: true });
});

app.get("/api/activities/:id/files/:fileId/download", requireAuth, (req, res) => {
  const file = db.prepare("SELECT * FROM activity_files WHERE id = ? AND activity_id = ?").get(req.params.fileId, req.params.id);
  if (!file) return res.status(404).json({ error: "Bestand niet gevonden." });
  res.json({ file: publicActivityFile(file), data: file.data });
});

app.post("/api/activities/:id/files", requireAuth, requireAdmin, (req, res) => {
  const activity = db.prepare("SELECT id FROM activities WHERE id = ?").get(req.params.id);
  if (!activity) return res.status(404).json({ error: "Activiteit niet gevonden." });
  try {
    const file = uploadedFileFromBody(req.body, {
      allowedMime: ["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
    });
    const result = db.prepare(`
      INSERT INTO activity_files (activity_id, file_name, mime_type, data, uploaded_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.params.id, file.fileName, file.mimeType, file.data, req.session.userId);
    const row = db.prepare("SELECT * FROM activity_files WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json({ file: publicActivityFile(row) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Het bestand kon niet worden opgeslagen." });
  }
});

app.delete("/api/activities/:id/files/:fileId", requireAuth, requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM activity_files WHERE id = ? AND activity_id = ?").run(req.params.fileId, req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Bestand niet gevonden." });
  res.json({ ok: true });
});

app.post("/api/activities/:id/register", requireAuth, (req, res) => {
  const user = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(req.session.userId);
  if (user?.is_admin) return res.status(403).json({ error: "Beheeraccounts nemen niet deel aan activiteiten." });
  const activity = db.prepare("SELECT * FROM activities WHERE id = ?").get(req.params.id);
  if (!activity) return res.status(404).json({ error: "Activiteit niet gevonden." });
  const responseMode = activity.response_mode || "signup";
  if (responseMode === "signup" && !isRegistrationOpen(activity.starts_at, activity.registration_override)) {
    return res.status(400).json({ error: "De inschrijving is gesloten. De deadline was de eerste van de maand." });
  }

  if (responseMode === "signup" && activity.capacity) {
    const count = db.prepare("SELECT COUNT(*) AS count FROM registrations WHERE activity_id = ? AND cancelled_at IS NULL").get(req.params.id).count;
    if (count >= activity.capacity) return res.status(400).json({ error: "Deze activiteit is vol." });
  }

  db.prepare(`
    INSERT INTO registrations (activity_id, user_id, cancelled_at, late_cancelled, cancellation_reason)
    VALUES (?, ?, NULL, 0, '')
    ON CONFLICT(activity_id, user_id) DO UPDATE SET cancelled_at = NULL, late_cancelled = 0, cancellation_reason = ''
  `).run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

app.delete("/api/activities/:id/register", requireAuth, (req, res) => {
  const user = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(req.session.userId);
  if (user?.is_admin) return res.status(403).json({ error: "Beheeraccounts nemen niet deel aan activiteiten." });
  const activity = db.prepare("SELECT starts_at, response_mode FROM activities WHERE id = ?").get(req.params.id);
  if (!activity) return res.status(404).json({ error: "Activiteit niet gevonden." });
  const reason = String(req.body?.reason || "").trim();
  if (reason.length > 500) return res.status(400).json({ error: "De reden mag maximaal 500 tekens bevatten." });
  const lateCancelled = isLateCancellation(activity.starts_at);
  const result = db.prepare(`
    INSERT INTO registrations (activity_id, user_id, cancelled_at, late_cancelled, cancellation_reason)
    VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)
    ON CONFLICT(activity_id, user_id) DO UPDATE SET
      cancelled_at = CURRENT_TIMESTAMP, late_cancelled = excluded.late_cancelled,
      cancellation_reason = excluded.cancellation_reason
  `).run(req.params.id, req.session.userId, lateCancelled ? 1 : 0, reason);
  res.json({ ok: true, lateCancelled, changed: result.changes });
});

app.get("/api/activities/:id/registrations", requireAuth, requireAdmin, (req, res) => {
  const activity = db.prepare("SELECT response_mode FROM activities WHERE id = ?").get(req.params.id);
  if (!activity) return res.status(404).json({ error: "Activiteit niet gevonden." });
  const responseMode = activity.response_mode || "signup";
  const rows = responseMode === "optout"
    ? db.prepare(`
        SELECT u.*, r.created_at AS registration_created_at, r.cancelled_at, r.late_cancelled, r.cancellation_reason
        FROM users u
        LEFT JOIN registrations r ON r.activity_id = ? AND r.user_id = u.id
        WHERE u.account_status = 'active' AND u.is_admin = 0
        ORDER BY r.cancelled_at IS NOT NULL ASC, u.name ASC
      `).all(req.params.id)
    : db.prepare(`
        SELECT u.*, r.created_at AS registration_created_at, r.cancelled_at, r.late_cancelled, r.cancellation_reason
        FROM registrations r
        JOIN users u ON u.id = r.user_id
        WHERE r.activity_id = ? AND u.is_admin = 0
        ORDER BY r.created_at ASC
      `).all(req.params.id);
  res.json({
    responseMode,
    registrations: rows.map((row) => ({
      ...publicUser(row),
      registeredAt: row.registration_created_at,
      cancelledAt: row.cancelled_at,
      lateCancelled: Boolean(row.late_cancelled),
      cancellationReason: row.cancellation_reason || ""
    }))
  });
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`Cassiopeia draait op http://${HOST}:${PORT}`);
});
