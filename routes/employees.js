const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { getDB } = require('../db/database');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const PUB = 'id, name, email, role, phone, avatar, is_active, created_at';

router.get('/', authMiddleware, (req, res) => {
  res.json(getDB().prepare(`SELECT ${PUB} FROM users ORDER BY created_at DESC`).all());
});

router.post('/', authMiddleware, adminOnly, (req, res) => {
  const { name, email, password, role, phone } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: "Ім'я, email та пароль обов'язкові" });
  const db = getDB();
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email))
    return res.status(400).json({ error: 'Email вже використовується' });
  try {
    const r = db.prepare('INSERT INTO users (name,email,password,role,phone,is_active) VALUES (?,?,?,?,?,?)')
      .run(name, email, bcrypt.hashSync(password, 10), role || 'agent', phone || null, 1);
    res.json({ id: r.lastInsertRowid, message: 'Співробітника додано' });
  } catch (e) {
    console.error('[EMP ADD]', e?.message || String(e));
    res.status(500).json({ error: 'Помилка при додаванні' });
  }
});

router.put('/:id', authMiddleware, adminOnly, (req, res) => {
  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Співробітника не знайдено' });
  const { name, email, role, phone, is_active, password } = req.body;
  const pwd = password ? bcrypt.hashSync(password, 10) : user.password;
  try {
    db.prepare('UPDATE users SET name=?,email=?,role=?,phone=?,is_active=?,password=? WHERE id=?')
      .run(name ?? user.name, email ?? user.email, role ?? user.role,
           phone ?? user.phone, is_active ?? user.is_active, pwd, req.params.id);
    res.json({ message: 'Співробітника оновлено' });
  } catch (e) {
    console.error('[EMP UPD]', e?.message || String(e));
    res.status(500).json({ error: 'Помилка при оновленні' });
  }
});

// Delete — check existence first
router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  const db = getDB();
  const user = db.prepare('SELECT id, role FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Співробітника не знайдено' });
  if (user.role === 'admin') {
    const cnt = db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get().c;
    if (cnt <= 1) return res.status(400).json({ error: 'Неможливо видалити останнього адміністратора' });
  }
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ message: 'Співробітника видалено' });
});

module.exports = router;
