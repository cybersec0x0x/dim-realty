const router = require('express').Router();
const multer = require('multer');
const os = require('os');
const fs = require('fs');
const { getDB } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { saveImage, removeImages, parseImages } = require('../lib/images');

const MAX_PHOTOS = 20;           // per object
const MAX_FILE_MB = 15;          // per uploaded file

// Uploads go to the OS temp dir (not into memory, not onto the volume), then each file is
// resized/compressed to JPEG into the uploads folder and the temp copy is deleted.
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: MAX_PHOTOS },
});

function dropTemp(files) {
  (files || []).forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
}

// multer + compression in one step: after this, req.savedImages holds stored file names
// (in the same order the files were sent).
function uploadImages(req, res, next) {
  upload.array('images', MAX_PHOTOS)(req, res, async (err) => {
    if (err) {
      dropTemp(req.files);
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `Файл завеликий (максимум ${MAX_FILE_MB} МБ)`
                : err.code === 'LIMIT_UNEXPECTED_FILE' ? `Максимум ${MAX_PHOTOS} фото`
                : 'Помилка завантаження файлів';
      return res.status(400).json({ error: msg });
    }
    req.savedImages = [];
    try {
      for (const f of req.files || []) req.savedImages.push(await saveImage(f.path));
      next();
    } catch (e) {
      removeImages(req.savedImages);
      console.error('[UPLOAD]', e?.code || '', e?.message || String(e));
      if (e?.code === 'ENOSPC')
        return res.status(507).json({ error: 'На сервері закінчилось місце для фото' });
      res.status(400).json({ error: 'Не вдалося обробити фото. Перевірте, що це зображення (JPG, PNG, WebP).' });
    } finally {
      dropTemp(req.files);
    }
  });
}

// Final photo list of an object, in the order chosen on the form.
// `order` is a JSON array: existing file names, or "#<n>" for the n-th newly uploaded file.
// Without `order` the old behaviour is kept: kept photos first, then the new ones.
function resolveImages(oldImages, keepRaw, orderRaw, saved) {
  let order = null;
  if (orderRaw) { try { const a = JSON.parse(orderRaw); if (Array.isArray(a)) order = a; } catch {} }
  const final = [];
  if (order) {
    for (const t of order) {
      if (typeof t !== 'string') continue;
      if (t.startsWith('#')) { const f = saved[+t.slice(1)]; if (f && !final.includes(f)) final.push(f); }
      else if (oldImages.includes(t) && !final.includes(t)) final.push(t);
    }
    saved.forEach(f => { if (!final.includes(f)) final.push(f); });      // never leave an upload orphaned
  } else {
    const wanted = keepRaw ? (Array.isArray(keepRaw) ? keepRaw : [keepRaw]) : [];
    final.push(...wanted.filter(i => oldImages.includes(i)), ...saved);
  }
  return final;
}

// Common field validation. Returns an error message or null.
function validate(b) {
  if (!b.type || !b.title || !String(b.title).trim() || b.price === undefined || b.price === '')
    return 'Тип, назва та ціна обовʼязкові';
  if (!['apartment', 'house', 'land'].includes(b.type)) return 'Невірний тип об\'єкта';
  if (!Number.isFinite(+b.price) || +b.price < 0) return 'Невірна ціна';
  if (b.area && (!Number.isFinite(+b.area) || +b.area < 0)) return 'Невірна площа';
  if (b.status && !['available', 'sold', 'reserved'].includes(b.status)) return 'Невірний статус';
  return null;
}

const SORT_MAP = {
  date_desc:  'p.created_at DESC, p.id DESC',
  date_asc:   'p.created_at ASC, p.id ASC',
  price_asc:  'p.price ASC, p.id DESC',
  price_desc: 'p.price DESC, p.id DESC',
  area_asc:   'p.area ASC, p.id DESC',
  area_desc:  'p.area DESC, p.id DESC',
};

// Stats — before /:id
router.get('/stats', authMiddleware, (req, res) => {
  const db = getDB();
  const q = sql => db.prepare(sql).get().c;
  res.json({
    total:      q('SELECT COUNT(*) c FROM properties'),
    available:  q("SELECT COUNT(*) c FROM properties WHERE status='available'"),
    sold:       q("SELECT COUNT(*) c FROM properties WHERE status='sold'"),
    reserved:   q("SELECT COUNT(*) c FROM properties WHERE status='reserved'"),
    apartments: q("SELECT COUNT(*) c FROM properties WHERE type='apartment'"),
    houses:     q("SELECT COUNT(*) c FROM properties WHERE type='house'"),
    land:       q("SELECT COUNT(*) c FROM properties WHERE type='land'"),
    totalValue: db.prepare("SELECT COALESCE(SUM(price),0) c FROM properties WHERE status!='sold'").get().c,
    employees:  q('SELECT COUNT(*) c FROM users WHERE is_active=1'),
  });
});

// List
router.get('/', authMiddleware, (req, res) => {
  const { type, status, city, search, sort = 'date_desc', house_type } = req.query;
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(2000, Math.max(1, parseInt(req.query.limit) || 12));
  const db = getDB();
  let where = 'WHERE 1=1';
  const p = [];
  if (type)       { where += ' AND p.type=?';       p.push(type); }
  if (house_type) { where += ' AND p.house_type=?'; p.push(house_type); }
  if (status)     { where += ' AND p.status=?';     p.push(status); }
  if (city)       { where += ' AND p.city LIKE ?';  p.push(`%${city}%`); }
  if (search) {
    where += ' AND (p.title LIKE ? OR p.address LIKE ? OR p.city LIKE ? OR p.district LIKE ? OR p.owner_phone LIKE ?)';
    p.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  const orderBy = SORT_MAP[sort] || SORT_MAP.date_desc;
  const base = `FROM properties p LEFT JOIN users u ON p.created_by=u.id ${where}`;
  const total = db.prepare(`SELECT COUNT(*) c ${base}`).get(...p).c;
  const rows  = db.prepare(
    `SELECT p.*, u.name agent_name ${base} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
  ).all(...p, limit, (page - 1) * limit);
  res.json({ properties: rows, total, page, limit });
});

// Single
router.get('/:id', authMiddleware, (req, res) => {
  const row = getDB().prepare(
    'SELECT p.*, u.name agent_name FROM properties p LEFT JOIN users u ON p.created_by=u.id WHERE p.id=?'
  ).get(req.params.id);
  if (!row) return res.status(404).json({ error: "Об'єкт не знайдено" });
  res.json(row);
});

// Create
router.post('/', authMiddleware, uploadImages, (req, res) => {
  const { type, title, description, price, area, address, city, district, rooms, floors, floor, status, owner_phone, house_type, imageOrder } = req.body;
  const bad = validate(req.body);
  if (bad) { removeImages(req.savedImages); return res.status(400).json({ error: bad }); }
  const finalImages = resolveImages([], null, imageOrder, req.savedImages);
  if (finalImages.length > MAX_PHOTOS) {
    removeImages(req.savedImages);
    return res.status(400).json({ error: `Максимум ${MAX_PHOTOS} фото на об'єкт` });
  }
  try {
    const r = getDB().prepare(`
      INSERT INTO properties (type,title,description,price,area,address,city,district,rooms,floors,floor,status,images,owner_phone,house_type,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(type, String(title).trim(), description, +price, area ? +area : null, address, city, district,
           rooms ? +rooms : null, floors ? +floors : null, floor ? +floor : null,
           status || 'available', JSON.stringify(finalImages), owner_phone || null, house_type || null, req.user.id);
    res.json({ id: r.lastInsertRowid, message: "Об'єкт створено" });
  } catch (e) {
    removeImages(req.savedImages);
    console.error('[CREATE]', e?.message || String(e));
    res.status(500).json({ error: 'Помилка при створенні' });
  }
});

// Update
router.put('/:id', authMiddleware, uploadImages, (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT id, images FROM properties WHERE id=?').get(req.params.id);
  if (!existing) {
    removeImages(req.savedImages);
    return res.status(404).json({ error: "Об'єкт не знайдено" });
  }
  const bad = validate(req.body);
  if (bad) { removeImages(req.savedImages); return res.status(400).json({ error: bad }); }

  const { type, title, description, price, area, address, city, district, rooms, floors, floor, status, keepImages, owner_phone, house_type, imageOrder } = req.body;
  const oldImages = parseImages(existing.images);
  const finalImages = resolveImages(oldImages, keepImages, imageOrder, req.savedImages);   // only this object's own photos
  if (finalImages.length > MAX_PHOTOS) {
    removeImages(req.savedImages);
    return res.status(400).json({ error: `Максимум ${MAX_PHOTOS} фото на об'єкт` });
  }
  const removed = oldImages.filter(i => !finalImages.includes(i));
  try {
    db.prepare(`
      UPDATE properties SET type=?,title=?,description=?,price=?,area=?,address=?,city=?,district=?,
      rooms=?,floors=?,floor=?,status=?,images=?,owner_phone=?,house_type=?,updated_at=datetime('now') WHERE id=?
    `).run(type, String(title).trim(), description, +price, area ? +area : null, address, city, district,
           rooms ? +rooms : null, floors ? +floors : null, floor ? +floor : null,
           status || 'available', JSON.stringify(finalImages), owner_phone || null, house_type || null, req.params.id);
    removeImages(removed);                                   // free disk space for dropped photos
    res.json({ message: "Об'єкт оновлено" });
  } catch (e) {
    removeImages(req.savedImages);
    console.error('[UPDATE]', e?.message || String(e));
    res.status(500).json({ error: 'Помилка при оновленні' });
  }
});

// Quick status update
router.patch('/:id/status', authMiddleware, (req, res) => {
  const { status } = req.body;
  if (!['available', 'sold', 'reserved'].includes(status))
    return res.status(400).json({ error: 'Невірний статус' });
  const db = getDB();
  const existing = db.prepare('SELECT id FROM properties WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Об'єкт не знайдено" });
  db.prepare("UPDATE properties SET status=?, updated_at=datetime('now') WHERE id=?").run(status, req.params.id);
  res.json({ message: 'Статус оновлено' });
});

// Delete — check existence first, do not rely on changes()
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT id, images FROM properties WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Об'єкт не знайдено" });
  db.prepare('DELETE FROM properties WHERE id=?').run(req.params.id);
  removeImages(parseImages(existing.images));              // don't leave orphan files on the volume
  res.json({ message: "Об'єкт видалено" });
});

module.exports = router;
