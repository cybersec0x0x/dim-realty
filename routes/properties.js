const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDB } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) =>
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

const SORT_MAP = {
  date_desc:  'p.created_at DESC',
  date_asc:   'p.created_at ASC',
  price_asc:  'p.price ASC',
  price_desc: 'p.price DESC',
  area_asc:   'p.area ASC',
  area_desc:  'p.area DESC',
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
  const { type, status, city, search, sort = 'date_desc', page = 1, limit = 12 } = req.query;
  const db = getDB();
  let where = 'WHERE 1=1';
  const p = [];
  if (type)   { where += ' AND p.type=?';   p.push(type); }
  if (status) { where += ' AND p.status=?'; p.push(status); }
  if (city)   { where += ' AND p.city LIKE ?'; p.push(`%${city}%`); }
  if (search) {
    where += ' AND (p.title LIKE ? OR p.address LIKE ? OR p.city LIKE ?)';
    p.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const orderBy = SORT_MAP[sort] || SORT_MAP.date_desc;
  const base = `FROM properties p LEFT JOIN users u ON p.created_by=u.id ${where}`;
  const total = db.prepare(`SELECT COUNT(*) c ${base}`).get(...p).c;
  const rows  = db.prepare(
    `SELECT p.*, u.name agent_name ${base} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
  ).all(...p, parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
  res.json({ properties: rows, total, page: +page, limit: +limit });
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
router.post('/', authMiddleware, upload.array('images', 10), (req, res) => {
  const { type, title, description, price, area, address, city, district, rooms, floors, floor, status } = req.body;
  if (!type || !title || !price)
    return res.status(400).json({ error: 'Тип, назва та ціна обовʼязкові' });
  const images = JSON.stringify(req.files?.map(f => f.filename) ?? []);
  try {
    const r = getDB().prepare(`
      INSERT INTO properties (type,title,description,price,area,address,city,district,rooms,floors,floor,status,images,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(type, title, description, +price, area ? +area : null, address, city, district,
           rooms ? +rooms : null, floors ? +floors : null, floor ? +floor : null,
           status || 'available', images, req.user.id);
    res.json({ id: r.lastInsertRowid, message: "Об'єкт створено" });
  } catch (e) {
    console.error('[CREATE]', e?.message || String(e));
    res.status(500).json({ error: 'Помилка при створенні' });
  }
});

// Update
router.put('/:id', authMiddleware, upload.array('images', 10), (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT id FROM properties WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Об'єкт не знайдено" });

  const { type, title, description, price, area, address, city, district, rooms, floors, floor, status, keepImages } = req.body;
  const kept = keepImages ? (Array.isArray(keepImages) ? keepImages : [keepImages]) : [];
  const newFiles = req.files?.map(f => f.filename) ?? [];
  const images = JSON.stringify([...kept, ...newFiles]);
  try {
    db.prepare(`
      UPDATE properties SET type=?,title=?,description=?,price=?,area=?,address=?,city=?,district=?,
      rooms=?,floors=?,floor=?,status=?,images=?,updated_at=datetime('now') WHERE id=?
    `).run(type, title, description, +price, area ? +area : null, address, city, district,
           rooms ? +rooms : null, floors ? +floors : null, floor ? +floor : null,
           status, images, req.params.id);
    res.json({ message: "Об'єкт оновлено" });
  } catch {
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
  const existing = db.prepare('SELECT id FROM properties WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Об'єкт не знайдено" });
  db.prepare('DELETE FROM properties WHERE id=?').run(req.params.id);
  res.json({ message: "Об'єкт видалено" });
});

module.exports = router;
