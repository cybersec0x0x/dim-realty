// One-off maintenance: shrink old uploaded photos and (optionally) delete files nothing refers to.
// Triggered from server.js when MIGRATE_IMAGES=1 (CLEAN_ORPHANS=1 additionally deletes unused files).
// Safe to re-run: already-compressed photos are skipped.
const fs = require('fs');
const path = require('path');
const { getDB } = require('../db/database');
const { UPLOADS_DIR, DATA_DIR } = require('../config');
const { saveImage, removeImage, parseImages } = require('./images');

const SKIP_BELOW_BYTES   = 500 * 1024;        // JPEGs smaller than this are already fine
const MIN_ORPHAN_AGE_MS  = 60 * 60 * 1000;    // never delete files younger than 1 h (upload in flight)
const mb = n => (n / 1048576).toFixed(1);
const log = (...a) => console.log('[MIGRATE]', ...a);

function freeMb() {
  try { const s = fs.statfsSync(DATA_DIR); return mb(s.bavail * s.bsize); } catch { return '?'; }
}

function referenced(db) {
  const fromProps = new Set();
  db.prepare('SELECT images FROM properties').all().forEach(r => parseImages(r.images).forEach(n => fromProps.add(n)));
  const avatars = new Set(
    db.prepare('SELECT avatar FROM users WHERE avatar IS NOT NULL').all().map(r => r.avatar)
  );
  return { fromProps, avatars };
}

function deleteOrphans(db) {
  const { fromProps, avatars } = referenced(db);
  const now = Date.now();
  let n = 0, bytes = 0;
  for (const name of fs.readdirSync(UPLOADS_DIR)) {
    if (fromProps.has(name) || avatars.has(name)) continue;
    const st = fs.statSync(path.join(UPLOADS_DIR, name));
    if (!st.isFile() || now - st.mtimeMs < MIN_ORPHAN_AGE_MS) continue;
    removeImage(name);
    n++; bytes += st.size;
  }
  log(`orphans deleted: ${n} files, ${mb(bytes)} MB`);
}

async function migrateImages({ cleanOrphans = false } = {}) {
  const db = getDB();
  log(`start. free space: ${freeMb()} MB`);

  if (cleanOrphans) deleteOrphans(db);
  log(`free space: ${freeMb()} MB`);

  // Backup of the DB before touching it. If even this fails (disk full) we stop here.
  try {
    fs.copyFileSync(path.join(DATA_DIR, 'realty.db'), path.join(DATA_DIR, 'realty.db.bak'));
    log('DB backup saved: realty.db.bak');
  } catch (e) {
    log('cannot write DB backup, aborting:', e.message);
    return;
  }

  const { fromProps, avatars } = referenced(db);
  const todo = [...fromProps].filter(name => {
    const p = path.join(UPLOADS_DIR, name);
    if (!fs.existsSync(p)) return false;
    const isJpg = /\.jpe?g$/i.test(name);
    return !isJpg || fs.statSync(p).size > SKIP_BELOW_BYTES;
  });
  log(`photos to compress: ${todo.length}`);

  let done = 0, failed = 0, before = 0, after = 0;
  for (const name of todo) {
    const src = path.join(UPLOADS_DIR, name);
    const base = name.replace(/\.[^.]+$/, '');
    let target = `${base}.jpg`;
    if (target === name) target = `${base}-c.jpg`;
    try {
      const oldSize = fs.statSync(src).size;
      await saveImage(src, target);
      const newSize = fs.statSync(path.join(UPLOADS_DIR, target)).size;
      if (newSize >= oldSize) { removeImage(target); continue; }   // no gain, keep the original

      // Re-read rows at the last moment (synchronously) so edits made meanwhile are not lost.
      const rows = db.prepare('SELECT id, images FROM properties WHERE images LIKE ?').all(`%${name}%`);
      for (const r of rows) {
        const imgs = parseImages(r.images);
        if (!imgs.includes(name)) continue;
        db.prepare('UPDATE properties SET images=? WHERE id=?')
          .run(JSON.stringify(imgs.map(i => (i === name ? target : i))), r.id);
      }
      if (!avatars.has(name)) removeImage(name);
      done++; before += oldSize; after += newSize;
    } catch (e) {
      failed++;
      removeImage(target);
      log(`failed ${name}: ${e.code || ''} ${e.message}`);
    }
    if ((done + failed) % 50 === 0) log(`progress ${done + failed}/${todo.length}, free: ${freeMb()} MB`);
  }

  log(`done. compressed: ${done}, failed: ${failed}, ${mb(before)} MB -> ${mb(after)} MB, free space: ${freeMb()} MB`);
}

module.exports = { migrateImages };
