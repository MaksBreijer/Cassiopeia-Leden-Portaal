function createSqliteSessionStore(session, db) {
  const Store = session.Store;

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires INTEGER NOT NULL
    )
  `);

  return class SqliteSessionStore extends Store {
    get(sid, callback) {
      try {
        const row = db.prepare("SELECT sess, expires FROM sessions WHERE sid = ?").get(sid);
        if (!row) return callback(null, null);
        if (row.expires <= Date.now()) {
          this.destroy(sid, () => callback(null, null));
          return;
        }
        callback(null, JSON.parse(row.sess));
      } catch (error) {
        callback(error);
      }
    }

    set(sid, sess, callback = () => {}) {
      try {
        const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 1000 * 60 * 60 * 8;
        db.prepare(`
          INSERT INTO sessions (sid, sess, expires)
          VALUES (?, ?, ?)
          ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires
        `).run(sid, JSON.stringify(sess), expires);
        callback(null);
      } catch (error) {
        callback(error);
      }
    }

    destroy(sid, callback = () => {}) {
      try {
        db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
        callback(null);
      } catch (error) {
        callback(error);
      }
    }

    touch(sid, sess, callback = () => {}) {
      this.set(sid, sess, callback);
    }
  };
}

module.exports = { createSqliteSessionStore };
