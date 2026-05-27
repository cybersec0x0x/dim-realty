const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// On Railway: mount a Volume at /app/data — DB and uploads both persist there.
// Locally: falls back to  <project>/data/
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'realty.db');
let _wrapper = null;

// ── sql.js compatibility wrapper (mimics better-sqlite3 sync API) ────────────
class Stmt {
  constructor(db, sql, wrapper) {
    this._db  = db;
    this._sql = sql;
    this._w   = wrapper;
  }
  run(...args) {
    // Convert undefined → null so sql.js doesn't choke on missing body fields
    const params = args.map(v => (v === undefined ? null : v));
    this._db.run(this._sql, params);
    const rid = this._db.exec('SELECT last_insert_rowid()');
    const ch  = this._db.exec('SELECT changes()');
    this._w._save();
    return {
      lastInsertRowid: Number(rid[0]?.values[0]?.[0] ?? 0),
      changes:         Number(ch[0]?.values[0]?.[0]  ?? 0),
    };
  }
  get(...args) {
    const stmt = this._db.prepare(this._sql);
    try {
      const params = args.map(v => (v === undefined ? null : v));
      if (params.length) stmt.bind(params);
      return stmt.step() ? stmt.getAsObject() : undefined;
    } finally { stmt.free(); }
  }
  all(...args) {
    const stmt = this._db.prepare(this._sql);
    const rows = [];
    try {
      const params = args.map(v => (v === undefined ? null : v));
      if (params.length) stmt.bind(params);
      while (stmt.step()) rows.push({ ...stmt.getAsObject() });
    } finally { stmt.free(); }
    return rows;
  }
}

class DB {
  constructor(sqljs) { this._db = sqljs; }
  exec(sql)    { this._db.exec(sql); this._save(); }
  prepare(sql) { return new Stmt(this._db, sql, this); }
  pragma(str)  { try { this._db.run(`PRAGMA ${str}`); } catch {} }
  _save() {
    const data = this._db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

// ── Public API ───────────────────────────────────────────────────────────────
function getDB() {
  if (!_wrapper) throw new Error('DB not initialized — await initDB() first');
  return _wrapper;
}

async function initDB() {
  const SQL = await initSqlJs({
    locateFile: f => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', f),
  });

  const rawDb = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  _wrapper = new DB(rawDb);

  _wrapper.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      email      TEXT    UNIQUE NOT NULL,
      password   TEXT    NOT NULL,
      role       TEXT    NOT NULL DEFAULT 'agent',
      phone      TEXT,
      avatar     TEXT,
      is_active  INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now'))
    )
  `);

  _wrapper.exec(`
    CREATE TABLE IF NOT EXISTS properties (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT NOT NULL,
      title       TEXT NOT NULL,
      description TEXT,
      price       REAL NOT NULL,
      area        REAL,
      address     TEXT,
      city        TEXT,
      district    TEXT,
      rooms       INTEGER,
      floors      INTEGER,
      floor       INTEGER,
      status      TEXT DEFAULT 'available',
      images      TEXT DEFAULT '[]',
      owner_phone TEXT,
      house_type  TEXT,
      created_by  INTEGER REFERENCES users(id),
      created_at  DATETIME DEFAULT (datetime('now')),
      updated_at  DATETIME DEFAULT (datetime('now'))
    )
  `);

  // Migrate existing DB — add columns if missing (throws if already exist, that's fine)
  try { _wrapper._db.run('ALTER TABLE properties ADD COLUMN owner_phone TEXT'); _wrapper._save(); } catch {}
  try { _wrapper._db.run('ALTER TABLE properties ADD COLUMN house_type TEXT');  _wrapper._save(); } catch {}

  // Only seed the admin account — no demo data
  const admin = _wrapper.prepare('SELECT id FROM users WHERE email=?').get('admin@dimrealty.ua');
  if (!admin) {
    _wrapper.prepare('INSERT INTO users (name,email,password,role,phone,is_active) VALUES (?,?,?,?,?,?)')
      .run('Адміністратор', 'admin@dimrealty.ua', bcrypt.hashSync('admin123', 10), 'admin', '+380 44 123 4567', 1);
    console.log('\n✅ База ініціалізована');
    console.log('   admin@dimrealty.ua / admin123\n');
  }
}

module.exports = { getDB, initDB };
