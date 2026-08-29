const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const projectRoot = path.join(__dirname, "..");

function runDatabaseScript(dataDir, script, extraEnv = {}) {
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: projectRoot,
    env: { ...process.env, DATA_DIR: dataDir, ...extraEnv },
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("the login form does not publish credentials", () => {
  const html = fs.readFileSync(path.join(projectRoot, "public", "index.html"), "utf8");
  const loginForm = html.match(/<form id="loginForm"[\s\S]*?<\/form>/)?.[0] || "";
  assert.doesNotMatch(html, /admin@cassiopeia\.local/);
  assert.doesNotMatch(loginForm, /value=["'][^"']+["']/);
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
