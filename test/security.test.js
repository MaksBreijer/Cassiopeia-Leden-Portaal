const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { once } = require("node:events");
const { spawn, spawnSync } = require("node:child_process");
const test = require("node:test");

const projectRoot = path.join(__dirname, "..");
const { parseCsvText, parseMemberImport } = require(path.join(projectRoot, "src", "member-import"));

function simpleTextPdf(lines) {
  const escapedLines = lines.map((line) => String(line).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)"));
  const content = [
    "BT",
    "/F1 12 Tf",
    "50 780 Td",
    ...escapedLines.flatMap((line, index) => [index ? "0 -24 Td" : "", `(${line}) Tj`]).filter(Boolean),
    "ET"
  ].join("\n");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream\nendobj\n`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += object;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

function runDatabaseScript(dataDir, script, extraEnv = {}) {
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: projectRoot,
    env: { ...process.env, DATA_DIR: dataDir, ...extraEnv },
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(baseUrl, child, stderr) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server stopte voortijdig: ${stderr()}`);
    try {
      const response = await fetch(`${baseUrl}/api/session`);
      if (response.ok) return;
    } catch (error) {
      // De server is nog aan het starten.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Server startte niet op tijd: ${stderr()}`);
}

async function jsonRequest(baseUrl, pathName, { method = "GET", body, cookie, origin } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  const response = await fetch(`${baseUrl}${pathName}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  const setCookie = response.headers.get("set-cookie");
  return { response, data, cookie: setCookie?.split(";")[0] || "" };
}

test("the login form does not publish credentials", () => {
  const html = fs.readFileSync(path.join(projectRoot, "public", "index.html"), "utf8");
  const loginForm = html.match(/<form id="loginForm"[\s\S]*?<\/form>/)?.[0] || "";
  assert.doesNotMatch(html, /admin@cassiopeia\.local/);
  assert.doesNotMatch(loginForm, /value=["'][^"']+["']/);
  assert.doesNotMatch(html, /top-marquee/);
  assert.match(loginForm, /LUSTRUM|Cassiopeia/);
  assert.match(html, /assets\/og\.png/);
});

test("member import parses Dutch CSV and text PDFs", async () => {
  const csv = [
    "naam;e-mail;lichting;functie;status;commissie",
    '"Anna van Test";anna@example.nl;\'26;Ab-actis;actief;Lustrumcommissie',
    '"Dubbel Lid";anna@example.nl;2026;;;',
    '"Geen Lichting";zonderjaar@example.nl;;;;'
  ].join("\n");
  const csvRecords = parseCsvText(csv);
  assert.equal(csvRecords[0].name, "Anna van Test");
  assert.equal(csvRecords[0].roleTitle, "Ab-actis");
  assert.deepEqual(csvRecords[0].errors, []);
  assert.match(csvRecords[1].errors.join(" "), /Dubbel/);
  assert.match(csvRecords[2].errors.join(" "), /Lichting/);

  const pdfRecords = await parseMemberImport({
    buffer: simpleTextPdf(["naam;e-mail;lichting", "PDF Lid;pdf@example.nl;2025"]),
    fileName: "leden.pdf"
  });
  assert.equal(pdfRecords.length, 1);
  assert.deepEqual(
    { name: pdfRecords[0].name, email: pdfRecords[0].email, yearLayer: pdfRecords[0].yearLayer, errors: pdfRecords[0].errors },
    { name: "PDF Lid", email: "pdf@example.nl", yearLayer: "2025", errors: [] }
  );
});

test("an empty non-production database does not get demo users", (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cassiopeia-empty-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

  const output = runDatabaseScript(
    dataDir,
    'const { db, initializeDatabase } = require("./src/db"); initializeDatabase(); process.stdout.write(String(db.prepare("SELECT COUNT(*) count FROM users").get().count));',
    { NODE_ENV: "test", BOOTSTRAP_ADMIN_EMAIL: "", BOOTSTRAP_ADMIN_PASSWORD: "" }
  );
  assert.equal(output, "0");
});

test("bootstrap credentials create one admin and only run once", (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cassiopeia-bootstrap-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const env = {
    NODE_ENV: "test",
    BOOTSTRAP_ADMIN_EMAIL: "beheerder@example.nl",
    BOOTSTRAP_ADMIN_PASSWORD: "een-uniek-veilig-wachtwoord"
  };
  const script = `
    const { db, initializeDatabase } = require("./src/db");
    initializeDatabase();
    const user = db.prepare("SELECT email, is_admin FROM users").get();
    process.stdout.write(JSON.stringify({ count: db.prepare("SELECT COUNT(*) count FROM users").get().count, user }));
  `;

  assert.deepEqual(JSON.parse(runDatabaseScript(dataDir, script, env)), {
    count: 1,
    user: { email: "beheerder@example.nl", is_admin: 1 }
  });
  assert.equal(JSON.parse(runDatabaseScript(dataDir, script, env)).count, 1);
});

test("bootstrap credentials can recover an existing account", (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cassiopeia-recovery-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

  runDatabaseScript(
    dataDir,
    `
      const bcrypt = require("bcryptjs");
      const { db, initializeDatabase } = require("./src/db");
      initializeDatabase();
      db.prepare("INSERT INTO users (name, email, password_hash, year_layer, is_admin) VALUES ('Bestaand lid', 'lid@example.nl', ?, '2024', 0)")
        .run(bcrypt.hashSync("oud-maar-veilig-wachtwoord", 4));
    `,
    { NODE_ENV: "test" }
  );

  const output = runDatabaseScript(
    dataDir,
    `
      const bcrypt = require("bcryptjs");
      const { db, initializeDatabase } = require("./src/db");
      initializeDatabase();
      const user = db.prepare("SELECT password_hash, is_admin FROM users WHERE email = 'lid@example.nl'").get();
      process.stdout.write(JSON.stringify({ isAdmin: user.is_admin, passwordWorks: bcrypt.compareSync("nieuw-uniek-veilig-wachtwoord", user.password_hash) }));
    `,
    {
      NODE_ENV: "test",
      BOOTSTRAP_ADMIN_EMAIL: "lid@example.nl",
      BOOTSTRAP_ADMIN_PASSWORD: "nieuw-uniek-veilig-wachtwoord"
    }
  );

  assert.deepEqual(JSON.parse(output), { isAdmin: 1, passwordWorks: true });
});

test("previously exposed passwords and sessions are revoked once", (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cassiopeia-migration-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

  const output = runDatabaseScript(
    dataDir,
    `
      const bcrypt = require("bcryptjs");
      const { db, initializeDatabase } = require("./src/db");
      initializeDatabase();
      db.prepare("DELETE FROM app_settings WHERE key = 'security_revoke_exposed_seed_credentials_v1'").run();
      const insert = db.prepare("INSERT INTO users (name, email, password_hash, year_layer, is_admin) VALUES (?, ?, ?, '2020', ?)");
      insert.run("Legacy admin", "legacy@example.nl", bcrypt.hashSync("Cassio2026!", 4), 1);
      insert.run("Veilig lid", "veilig@example.nl", bcrypt.hashSync("echt-uniek-en-veilig", 4), 0);
      db.prepare("INSERT INTO sessions (sid, sess, expires) VALUES ('old', '{}', ?)").run(Date.now() + 60000);
      initializeDatabase();
      const legacy = db.prepare("SELECT password_hash, is_admin FROM users WHERE email = 'legacy@example.nl'").get();
      const safe = db.prepare("SELECT password_hash FROM users WHERE email = 'veilig@example.nl'").get();
      process.stdout.write(JSON.stringify({
        legacyPasswordStillWorks: bcrypt.compareSync("Cassio2026!", legacy.password_hash),
        legacyIsAdmin: legacy.is_admin,
        safePasswordStillWorks: bcrypt.compareSync("echt-uniek-en-veilig", safe.password_hash),
        sessions: db.prepare("SELECT COUNT(*) count FROM sessions").get().count
      }));
    `,
    { NODE_ENV: "test" }
  );

  assert.deepEqual(JSON.parse(output), {
    legacyPasswordStillWorks: false,
    legacyIsAdmin: 0,
    safePasswordStillWorks: true,
    sessions: 0
  });
});

test("the production cleanup removes members but preserves admin access", (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cassiopeia-member-cleanup-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

  runDatabaseScript(
    dataDir,
    `
      const bcrypt = require("bcryptjs");
      const { db, initializeDatabase } = require("./src/db");
      initializeDatabase();
      const insert = db.prepare("INSERT INTO users (name, email, password_hash, year_layer, is_admin) VALUES (?, ?, ?, '2026', ?)");
      const admin = insert.run("Beheerder", "beheerder@example.nl", bcrypt.hashSync("veilig-admin-wachtwoord", 4), 1);
      const member = insert.run("Oud lid", "oud-lid@example.nl", bcrypt.hashSync("veilig-leden-wachtwoord", 4), 0);
      db.prepare("INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)").run("admin-session", JSON.stringify({ userId: admin.lastInsertRowid }), Date.now() + 60000);
      db.prepare("INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)").run("member-session", JSON.stringify({ userId: member.lastInsertRowid }), Date.now() + 60000);
    `,
    { NODE_ENV: "test" }
  );

  const output = runDatabaseScript(
    dataDir,
    `
      const { db, initializeDatabase } = require("./src/db");
      initializeDatabase();
      process.stdout.write(JSON.stringify({
        users: db.prepare("SELECT email, is_admin FROM users ORDER BY id").all(),
        sessions: db.prepare("SELECT sid FROM sessions ORDER BY sid").all(),
        cleanup: JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key = 'purge_existing_non_admin_members_2026_08_29_v1'").get().value)
      }));
    `,
    { NODE_ENV: "production", SESSION_SECRET: "een-lange-productie-test-session-secret" }
  );

  assert.deepEqual(JSON.parse(output), {
    users: [{ email: "beheerder@example.nl", is_admin: 1 }],
    sessions: [{ sid: "admin-session" }],
    cleanup: { removedMembers: 1 }
  });
});

test("admins invite members who set and reset their own password", async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cassiopeia-http-test-"));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let serverError = "";
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATA_DIR: dataDir,
      PORT: String(port),
      BOOTSTRAP_ADMIN_EMAIL: "beheerder@example.nl",
      BOOTSTRAP_ADMIN_PASSWORD: "een-uniek-veilig-wachtwoord"
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  child.stderr.on("data", (chunk) => {
    serverError += chunk;
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child, () => serverError);

  const adminLogin = await jsonRequest(baseUrl, "/api/login", {
    method: "POST",
    body: { email: "beheerder@example.nl", password: "een-uniek-veilig-wachtwoord" }
  });
  assert.equal(adminLogin.response.status, 200);
  assert.match(adminLogin.cookie, /^cassiopeia\.sid=/);
  assert.equal(adminLogin.response.headers.get("x-frame-options"), "DENY");

  const futureStart = new Date();
  futureStart.setMonth(futureStart.getMonth() + 2, 20);
  futureStart.setHours(19, 0, 0, 0);
  const activity = await jsonRequest(baseUrl, "/api/activities", {
    method: "POST",
    cookie: adminLogin.cookie,
    body: { title: "Testactiviteit", startsAt: futureStart.toISOString(), location: "Utrecht" }
  });
  assert.equal(activity.response.status, 201);
  assert.equal(activity.data.activity.registrationOpen, true);
  const registration = await jsonRequest(baseUrl, `/api/activities/${activity.data.activity.id}/register`, {
    method: "POST",
    cookie: adminLogin.cookie
  });
  assert.equal(registration.response.status, 200);
  const cancellation = await jsonRequest(baseUrl, `/api/activities/${activity.data.activity.id}/register`, {
    method: "DELETE",
    cookie: adminLogin.cookie
  });
  assert.equal(cancellation.response.status, 200);
  assert.equal(cancellation.data.lateCancelled, false);
  const registrations = await jsonRequest(baseUrl, `/api/activities/${activity.data.activity.id}/registrations`, { cookie: adminLogin.cookie });
  assert.equal(registrations.response.status, 200);
  assert.equal(registrations.data.registrations[0].lateCancelled, false);

  const closedStart = new Date();
  closedStart.setDate(Math.min(28, closedStart.getDate()));
  closedStart.setHours(19, 0, 0, 0);
  const closedActivity = await jsonRequest(baseUrl, "/api/activities", {
    method: "POST",
    cookie: adminLogin.cookie,
    body: { title: "Gesloten activiteit", startsAt: closedStart.toISOString(), location: "Amsterdam" }
  });
  assert.equal(closedActivity.response.status, 201);
  assert.equal(closedActivity.data.activity.registrationOpen, false);
  const closedRegistration = await jsonRequest(baseUrl, `/api/activities/${closedActivity.data.activity.id}/register`, {
    method: "POST",
    cookie: adminLogin.cookie
  });
  assert.equal(closedRegistration.response.status, 400);
  assert.match(closedRegistration.data.error, /gesloten/i);
  const reopenedActivity = await jsonRequest(baseUrl, `/api/activities/${closedActivity.data.activity.id}`, {
    method: "PUT",
    cookie: adminLogin.cookie,
    body: { title: "Gesloten activiteit", startsAt: closedStart.toISOString(), location: "Amsterdam", registrationOverride: "open" }
  });
  assert.equal(reopenedActivity.response.status, 200);
  assert.equal(reopenedActivity.data.activity.registrationOverride, "open");
  assert.equal(reopenedActivity.data.activity.registrationOpen, true);
  const reopenedRegistration = await jsonRequest(baseUrl, `/api/activities/${closedActivity.data.activity.id}/register`, {
    method: "POST",
    cookie: adminLogin.cookie
  });
  assert.equal(reopenedRegistration.response.status, 200);

  const document = await jsonRequest(baseUrl, "/api/documents", {
    method: "POST",
    cookie: adminLogin.cookie,
    body: { title: "Statuten test", category: "statuten", fileName: "statuten.pdf", mimeType: "application/pdf", data: Buffer.from("pdf-test").toString("base64") }
  });
  assert.equal(document.response.status, 201);
  const confession = await jsonRequest(baseUrl, "/api/confessions", {
    method: "POST",
    cookie: adminLogin.cookie,
    body: { body: "Anonieme testbiecht" }
  });
  assert.equal(confession.response.status, 201);

  const forgedRequest = await jsonRequest(baseUrl, "/api/members", {
    method: "POST",
    cookie: adminLogin.cookie,
    origin: "https://aanvaller.example",
    body: { name: "Aanvaller", email: "aanvaller@example.nl", yearLayer: "2026" }
  });
  assert.equal(forgedRequest.response.status, 403);

  const importCsv = [
    "naam;e-mail;lichting;status",
    "Bulk Lid;bulk@example.nl;2026;actief",
    "Bestaand;beheerder@example.nl;2020;actief",
    "Mist Lichting;mist@example.nl;;actief"
  ].join("\n");
  const importPreview = await jsonRequest(baseUrl, "/api/members/import/preview", {
    method: "POST",
    cookie: adminLogin.cookie,
    body: { fileName: "leden.csv", data: Buffer.from(importCsv).toString("base64") }
  });
  assert.equal(importPreview.response.status, 200);
  assert.deepEqual(importPreview.data.summary, { total: 3, ready: 1, duplicates: 1, invalid: 1 });

  const bulkCreated = await jsonRequest(baseUrl, "/api/members/import", {
    method: "POST",
    cookie: adminLogin.cookie,
    body: { records: importPreview.data.records.filter((record) => record.ready) }
  });
  assert.equal(bulkCreated.response.status, 201);
  assert.equal(bulkCreated.data.created.length, 1);
  assert.equal(bulkCreated.data.created[0].member.email, "bulk@example.nl");
  assert.equal(bulkCreated.data.created[0].member.accountStatus, "pending");
  const bulkInviteToken = bulkCreated.data.created[0].invitation.invitePath.split("#activate=")[1];
  const bulkInvite = await jsonRequest(baseUrl, "/api/account-token/inspect", {
    method: "POST",
    body: { token: bulkInviteToken }
  });
  assert.equal(bulkInvite.response.status, 200);
  assert.equal(bulkInvite.data.email, "bulk@example.nl");

  const duplicateBulkImport = await jsonRequest(baseUrl, "/api/members/import", {
    method: "POST",
    cookie: adminLogin.cookie,
    body: { records: importPreview.data.records.filter((record) => record.ready) }
  });
  assert.equal(duplicateBulkImport.response.status, 409);

  const bulkDeleteCandidates = await Promise.all([
    jsonRequest(baseUrl, "/api/members", {
      method: "POST",
      cookie: adminLogin.cookie,
      body: { name: "Bulk Verwijder Een", email: "bulk-delete-one@example.nl", yearLayer: "2026" }
    }),
    jsonRequest(baseUrl, "/api/members", {
      method: "POST",
      cookie: adminLogin.cookie,
      body: { name: "Bulk Verwijder Twee", email: "bulk-delete-two@example.nl", yearLayer: "2025" }
    })
  ]);
  assert.deepEqual(bulkDeleteCandidates.map((candidate) => candidate.response.status).sort(), [201, 201]);
  const bulkDelete = await jsonRequest(baseUrl, "/api/members/bulk-delete", {
    method: "POST",
    cookie: adminLogin.cookie,
    body: { ids: bulkDeleteCandidates.map((candidate) => candidate.data.member.id) }
  });
  assert.equal(bulkDelete.response.status, 200);
  assert.equal(bulkDelete.data.deleted, 2);
  const deletedMember = await jsonRequest(baseUrl, `/api/members/${bulkDeleteCandidates[0].data.member.id}`, {
    cookie: adminLogin.cookie
  });
  assert.equal(deletedMember.response.status, 404);
  const protectedBulkDelete = await jsonRequest(baseUrl, "/api/members/bulk-delete", {
    method: "POST",
    cookie: adminLogin.cookie,
    body: { ids: [adminLogin.data.user.id] }
  });
  assert.equal(protectedBulkDelete.response.status, 400);

  const created = await jsonRequest(baseUrl, "/api/members", {
    method: "POST",
    cookie: adminLogin.cookie,
    body: { name: "Nieuw Lid", email: "nieuw@example.nl", yearLayer: "2026", memberStatus: "actief" }
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.member.accountStatus, "pending");
  assert.equal(created.data.invitation.purpose, "invite");
  const inviteToken = created.data.invitation.invitePath.split("#activate=")[1];
  assert.ok(inviteToken);

  const inspected = await jsonRequest(baseUrl, "/api/account-token/inspect", {
    method: "POST",
    body: { token: inviteToken }
  });
  assert.equal(inspected.response.status, 200);
  assert.equal(inspected.data.email, "nieuw@example.nl");

  const activated = await jsonRequest(baseUrl, "/api/account/activate", {
    method: "POST",
    body: { token: inviteToken, password: "nog-een-uniek-veilig-wachtwoord" }
  });
  assert.equal(activated.response.status, 200);
  assert.equal(activated.data.user.accountStatus, "active");
  assert.match(activated.cookie, /^cassiopeia\.sid=/);

  const tokenReuse = await jsonRequest(baseUrl, "/api/account/activate", {
    method: "POST",
    body: { token: inviteToken, password: "nog-een-uniek-veilig-wachtwoord" }
  });
  assert.equal(tokenReuse.response.status, 400);

  const reset = await jsonRequest(baseUrl, `/api/members/${created.data.member.id}/invitations`, {
    method: "POST",
    cookie: adminLogin.cookie
  });
  assert.equal(reset.response.status, 201);
  assert.equal(reset.data.invitation.purpose, "reset");
  const resetToken = reset.data.invitation.invitePath.split("#activate=")[1];

  const simultaneousResetAttempts = await Promise.all([
    jsonRequest(baseUrl, "/api/account/activate", {
      method: "POST",
      body: { token: resetToken, password: "een-vervangend-veilig-wachtwoord" }
    }),
    jsonRequest(baseUrl, "/api/account/activate", {
      method: "POST",
      body: { token: resetToken, password: "een-vervangend-veilig-wachtwoord" }
    })
  ]);
  assert.deepEqual(simultaneousResetAttempts.map((attempt) => attempt.response.status).sort(), [200, 400]);

  const staleSession = await jsonRequest(baseUrl, "/api/members", { cookie: activated.cookie });
  assert.equal(staleSession.response.status, 401);

  const linkBeforeDisable = await jsonRequest(baseUrl, `/api/members/${created.data.member.id}/invitations`, {
    method: "POST",
    cookie: adminLogin.cookie
  });
  assert.equal(linkBeforeDisable.response.status, 201);
  const disabled = await jsonRequest(baseUrl, `/api/members/${created.data.member.id}`, {
    method: "PUT",
    cookie: adminLogin.cookie,
    body: {
      name: "Nieuw Lid",
      email: "nieuw@example.nl",
      yearLayer: "2026",
      roleTitle: "Lid",
      memberStatus: "actief",
      accountStatus: "disabled",
      isAdmin: false
    }
  });
  assert.equal(disabled.response.status, 200);
  assert.equal(disabled.data.member.accountStatus, "disabled");
  const disabledToken = linkBeforeDisable.data.invitation.invitePath.split("#activate=")[1];
  const activationAfterDisable = await jsonRequest(baseUrl, "/api/account/activate", {
    method: "POST",
    body: { token: disabledToken, password: "dit-wachtwoord-mag-niet-werken" }
  });
  assert.equal(activationAfterDisable.response.status, 400);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const failure = await jsonRequest(baseUrl, "/api/login", {
      method: "POST",
      body: { email: "onbekend@example.nl", password: "verkeerd-wachtwoord" }
    });
    assert.equal(failure.response.status, 401);
  }
  const limited = await jsonRequest(baseUrl, "/api/login", {
    method: "POST",
    body: { email: "onbekend@example.nl", password: "verkeerd-wachtwoord" }
  });
  assert.equal(limited.response.status, 429);
});
