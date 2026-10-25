const webpush = require("web-push");
const { db } = require("./db");

const TIME_ZONE = "Europe/Amsterdam";
const DAILY_HOUR = 10;
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

function initializePushTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS push_log (
      key TEXT PRIMARY KEY,
      sent_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// VAPID-sleutels komen uit de omgeving, of worden eenmalig gemaakt en in de database bewaard.
function vapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const stored = db.prepare("SELECT value FROM app_settings WHERE key = 'vapid_keys'").get();
  if (stored) return JSON.parse(stored.value);
  const keys = webpush.generateVAPIDKeys();
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('vapid_keys', ?)").run(JSON.stringify(keys));
  return keys;
}

let publicKey = "";

function setupPush() {
  initializePushTables();
  const keys = vapidKeys();
  publicKey = keys.publicKey;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:bestuur@dispuutcassiopeia.nl", keys.publicKey, keys.privateKey);
  runDailyNotifications();
  setInterval(() => runDailyNotifications(), CHECK_INTERVAL_MS).unref();
}

function getPublicKey() {
  return publicKey;
}

function saveSubscription(userId, subscription) {
  const endpoint = String(subscription?.endpoint || "");
  const p256dh = String(subscription?.keys?.p256dh || "");
  const auth = String(subscription?.keys?.auth || "");
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) throw new Error("Ongeldig abonnement.");
  db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
  `).run(userId, endpoint, p256dh, auth);
}

function removeSubscription(userId, endpoint) {
  db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").run(userId, String(endpoint || ""));
}

async function sendToUsers(userIds, payload) {
  if (!userIds.length) return 0;
  const placeholders = userIds.map(() => "?").join(",");
  const subscriptions = db.prepare(`SELECT * FROM push_subscriptions WHERE user_id IN (${placeholders})`).all(...userIds);
  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(subscriptions.map(async (row) => {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, body, { TTL: 60 * 60 * 24 });
      sent += 1;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(row.id);
      } else {
        console.error("Pushmelding mislukt:", error.statusCode || error.message);
      }
    }
  }));
  return sent;
}

function activeMemberIds({ exceptUserId = null, participantsOnly = false } = {}) {
  return db
    .prepare(`SELECT id FROM users WHERE account_status = 'active' ${participantsOnly ? "AND takes_part = 1" : ""}`)
    .all()
    .map((row) => row.id)
    .filter((id) => id !== exceptUserId);
}

// Stuurt elke melding hooguit één keer, ook na een herstart.
async function sendOnce(key, userIds, payload) {
  const claimed = db.prepare("INSERT OR IGNORE INTO push_log (key) VALUES (?)").run(key);
  if (!claimed.changes) return 0;
  return sendToUsers(userIds, payload);
}

function notifyNewActivity(activity, createdBy) {
  const when = new Date(activity.starts_at).toLocaleDateString("nl-NL", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" });
  return sendOnce(`activity-new:${activity.id}`, activeMemberIds({ exceptUserId: createdBy, participantsOnly: true }), {
    title: "Nieuwe activiteit gepland",
    body: `${activity.title} · ${when}`,
    url: `/#activiteit-${activity.id}`,
    tag: `activity-${activity.id}`,
  }).catch((error) => console.error("Pushmelding nieuwe activiteit mislukt:", error.message));
}

// Pushdiensten accepteren maar een paar kB; lange biechten worden ingekort.
const CONFESSION_PREVIEW_LENGTH = 240;

// Biechten zijn anoniem: de melding noemt geen naam, alleen de tekst.
function notifyNewConfession(confession, createdBy) {
  const text = String(confession.body || "").replace(/\s+/g, " ").trim();
  const chars = Array.from(text);
  const body = chars.length > CONFESSION_PREVIEW_LENGTH ? `${chars.slice(0, CONFESSION_PREVIEW_LENGTH - 1).join("").trimEnd()}…` : text;
  return sendOnce(`confession-new:${confession.id}`, activeMemberIds({ exceptUserId: createdBy }), {
    title: "Nieuwe biecht ✉",
    body,
    url: "/#biechten",
    tag: `confession-${confession.id}`,
  }).catch((error) => console.error("Pushmelding nieuwe biecht mislukt:", error.message));
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Inhaalronde: biechten van vóór de biechtmelding krijgen alsnog elk hun eigen melding, oudste eerst,
// met tien seconden ertussen. Wat al verstuurd is wordt overgeslagen, dus na een herstart gaat er niets dubbel.
async function notifyExistingConfessions({ delayMs = 10 * 1000 } = {}) {
  const ids = db.prepare("SELECT id FROM confessions ORDER BY created_at ASC, id ASC").all().map((row) => row.id);
  let first = true;
  for (const id of ids) {
    if (db.prepare("SELECT 1 FROM push_log WHERE key = ?").get(`confession-new:${id}`)) continue;
    if (!first) await wait(delayMs);
    first = false;
    const confession = db.prepare("SELECT id, body FROM confessions WHERE id = ?").get(id);
    if (confession) await notifyNewConfession(confession, null);
  }
}

function amsterdamParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, month: parts.month, day: parts.day, hour: Number(parts.hour) };
}

async function notifyDeadlinesTomorrow(today, now) {
  const tomorrow = amsterdamParts(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  // De inschrijving sluit op de eerste van de maand van de activiteit.
  if (tomorrow.day !== "01") return;
  const monthPrefix = tomorrow.date.slice(0, 7);
  const activities = db
    .prepare("SELECT * FROM activities WHERE substr(starts_at, 1, 7) = ? AND response_mode = 'signup' AND registration_override = 'automatic'")
    .all(monthPrefix);
  for (const activity of activities) {
    const responded = new Set(db.prepare("SELECT user_id FROM registrations WHERE activity_id = ?").all(activity.id).map((row) => row.user_id));
    const recipients = activeMemberIds({ participantsOnly: true }).filter((id) => !responded.has(id));
    await sendOnce(`deadline:${activity.id}:${today.date}`, recipients, {
      title: `Inschrijving voor ${activity.title} sluit morgen`,
      body: "Laat nog even weten of je erbij bent.",
      url: `/#activiteit-${activity.id}`,
      tag: `deadline-${activity.id}`,
    });
  }
}

async function notifyBirthdays(today) {
  const birthdayPeople = db
    .prepare("SELECT id, name FROM users WHERE account_status = 'active' AND substr(birthday, 6, 5) = ?")
    .all(`${today.month}-${today.day}`);
  for (const person of birthdayPeople) {
    const firstName = String(person.name).split(" ")[0];
    await sendOnce(`birthday:${person.id}:${today.date}`, activeMemberIds({ exceptUserId: person.id }), {
      title: `Vandaag jarig: ${firstName} 🎉`,
      body: `Vergeet ${firstName} niet te feliciteren!`,
      url: "/#home",
      tag: `birthday-${person.id}`,
    });
  }
}

// Eenmalige aankondiging: gala-teaser op 23 oktober 2026 tussen 20:00 en 21:00 (Amsterdam) naar alle actieve leden.
const GALA_TEASER_DATE = "2026-10-23";
const GALA_TEASER_HOUR = 20;

async function notifyGalaTeaser(today) {
  if (today.date !== GALA_TEASER_DATE || today.hour !== GALA_TEASER_HOUR) return;
  await sendOnce(`gala-teaser:${GALA_TEASER_DATE}`, activeMemberIds(), {
    title: "Morgen is het Gala ✨",
    body: "Het Cassiopeia Gala is morgen! Tik om de teaser te zien.",
    url: "/gala.html",
    tag: "gala-teaser",
  });
}

let running = false;

async function runDailyNotifications(now = new Date()) {
  if (running) return;
  const today = amsterdamParts(now);
  if (today.hour < DAILY_HOUR) return;
  running = true;
  try {
    await notifyDeadlinesTomorrow(today, now);
    await notifyBirthdays(today);
    await notifyGalaTeaser(today);
  } catch (error) {
    console.error("Dagelijkse pushmeldingen mislukt:", error.message);
  } finally {
    running = false;
  }
}

module.exports = { runDailyNotifications, setupPush, getPublicKey, saveSubscription, removeSubscription, notifyNewActivity, notifyNewConfession, notifyExistingConfessions, sendToUsers };
