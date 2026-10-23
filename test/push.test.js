const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.join(__dirname, "..");
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cassiopeia-push-"));

const sent = [];
const webpush = require("web-push");
webpush.sendNotification = async (subscription, body) => {
  sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(body) });
};

const { db, initializeDatabase } = require(path.join(projectRoot, "src", "db"));
initializeDatabase();
const push = require(path.join(projectRoot, "src", "push"));
push.setupPush();

function addUser(name, email, birthday = "") {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (name, email, password_hash, year_layer, birthday, account_status) VALUES (?, ?, 'x', '2024', ?, 'active')")
    .run(name, email, birthday);
  push.saveSubscription(lastInsertRowid, { endpoint: `https://push.example/${email}`, keys: { p256dh: "p", auth: "a" } });
  return Number(lastInsertRowid);
}

const anna = addUser("Anna de Vries", "anna@cassio.test", "2001-03-15");
const sophie = addUser("Sophie Jansen", "sophie@cassio.test");
const lotte = addUser("Lotte Bakker", "lotte@cassio.test");

test("nieuwe activiteit gaat naar iedereen behalve de maker", async () => {
  sent.length = 0;
  await push.notifyNewActivity({ id: 99, title: "Lustrumgala", starts_at: "2030-04-12T19:00" }, anna);
  assert.deepEqual(sent.map((item) => item.endpoint).sort(), ["https://push.example/lotte@cassio.test", "https://push.example/sophie@cassio.test"]);
  assert.equal(sent[0].payload.title, "Nieuwe activiteit gepland");
  assert.equal(sent[0].payload.url, "/#activiteit-99");
});

test("deadlinemelding de dag voor sluiten, alleen voor wie nog niet reageerde, en maar één keer", async () => {
  const { lastInsertRowid } = db.prepare("INSERT INTO activities (title, starts_at) VALUES ('Cantus', '2030-05-20T20:00')").run();
  db.prepare("INSERT INTO registrations (activity_id, user_id) VALUES (?, ?)").run(lastInsertRowid, sophie);
  sent.length = 0;
  const lastDayOfApril = new Date("2030-04-30T09:00:00Z"); // 11:00 in Amsterdam
  await push.runDailyNotifications(lastDayOfApril);
  const deadline = sent.filter((item) => item.payload.title.includes("Cantus"));
  assert.deepEqual(deadline.map((item) => item.endpoint).sort(), ["https://push.example/anna@cassio.test", "https://push.example/lotte@cassio.test"]);
  assert.equal(deadline[0].payload.title, "Inschrijving voor Cantus sluit morgen");

  sent.length = 0;
  await push.runDailyNotifications(lastDayOfApril);
  assert.equal(sent.length, 0);
});

test("verjaardag om 10 uur naar de anderen, niet voor 10 uur", async () => {
  sent.length = 0;
  await push.runDailyNotifications(new Date("2030-03-15T07:00:00Z")); // 08:00 in Amsterdam
  assert.equal(sent.length, 0);
  await push.runDailyNotifications(new Date("2030-03-15T10:00:00Z"));
  assert.deepEqual(sent.map((item) => item.endpoint).sort(), ["https://push.example/lotte@cassio.test", "https://push.example/sophie@cassio.test"]);
  assert.equal(sent[0].payload.title, "Vandaag jarig: Anna 🎉");
});

test("gala-teaser gaat één keer naar iedereen, alleen op 23 oktober tussen 20:00 en 21:00", async () => {
  const teaser = () => sent.filter((item) => item.payload.tag === "gala-teaser");
  sent.length = 0;
  await push.runDailyNotifications(new Date("2026-10-23T16:59:00Z")); // 18:59 in Amsterdam
  await push.runDailyNotifications(new Date("2026-10-22T18:30:00Z")); // een dag te vroeg
  await push.runDailyNotifications(new Date("2026-10-24T18:30:00Z")); // een dag te laat
  await push.runDailyNotifications(new Date("2026-10-23T19:30:00Z")); // 21:30 in Amsterdam
  assert.equal(teaser().length, 0);

  await push.runDailyNotifications(new Date("2026-10-23T18:05:00Z")); // 20:05 in Amsterdam
  assert.deepEqual(teaser().map((item) => item.endpoint).sort(), [
    "https://push.example/anna@cassio.test",
    "https://push.example/lotte@cassio.test",
    "https://push.example/sophie@cassio.test",
  ]);
  assert.equal(teaser()[0].payload.title, "Morgen is het Gala ✨");
  assert.equal(teaser()[0].payload.url, "/gala.html");

  sent.length = 0;
  await push.runDailyNotifications(new Date("2026-10-23T18:20:00Z"));
  assert.equal(teaser().length, 0);
});
