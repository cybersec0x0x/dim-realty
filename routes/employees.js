const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { getDB } = require('../db/database');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const PUB = 'id, name, email, role, phone, avatar, is_active, created_at';
const MIN_PASSWORD = 6;
const normEmail = e => String(e || '').trim().toLowerCase();
const activeAdmins = db => db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin' AND is_active=1").get().c;

router.get('/', authMiddleware, (req, res) => {
  res.json(getDB().prepare(`SELECT ${PUB} FROM users ORDER BY created_at DESC, id DESC`).all());
});

router.post('/', authMiddleware, adminOnly, (req, res) => {
  const { name, password, role, phone } = req.body;
  const email = normEmail(req.body.email);
  if (!name || !email || !password)
    return res.status(400).json({ error: "Ім'я, email та пароль обов'язкові" });
  if (String(password).length < MIN_PASSWORD)
    return res.status(400).json({ error: `Пароль має містити щонайменше ${MIN_PASSWORD} символів` });
  if (role && !['admin', 'agent'].includes(role))
    return res.status(400).json({ error: 'Невірна роль' });
  const db = getDB();
  if (db.prepare('SELECT id FROM users WHERE lower(email)=?').get(email))
    return res.status(400).json({ error: 'Email вже використовується' });
  try {
    const r = db.prepare('INSERT INTO users (name,email,password,role,phone,is_active) VALUES (?,?,?,?,?,?)')
      .run(name, email, bcrypt.hashSync(String(password), 10), role || 'agent', phone || null, 1);
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
  const { name, role, phone, is_active, password } = req.body;
  const email = req.body.email === undefined ? user.email : normEmail(req.body.email);

  if (role !== undefined && !['admin', 'agent'].includes(role))
    return res.status(400).json({ error: 'Невірна роль' });
  if (password && String(password).length < MIN_PASSWORD)
    return res.status(400).json({ error: `Пароль має містити щонайменше ${MIN_PASSWORD} символів` });
  if (email !== user.email && db.prepare('SELECT id FROM users WHERE lower(email)=? AND id<>?').get(email, user.id))
    return res.status(400).json({ error: 'Email вже використовується' });

  // Never leave the system without an active administrator
  const newRole   = role ?? user.role;
  const newActive = is_active ?? user.is_active;
  const losesAdmin = user.role === 'admin' && user.is_active && (newRole !== 'admin' || !newActive);
  if (losesAdmin && activeAdmins(db) <= 1)
    return res.status(400).json({ error: 'Це останній активний адміністратор — його не можна деактивувати чи понизити' });

  const pwd = password ? bcrypt.hashSync(String(password), 10) : user.password;
  try {
    db.prepare('UPDATE users SET name=?,email=?,role=?,phone=?,is_active=?,password=? WHERE id=?')
      .run(name ?? user.name, email, newRole, phone ?? user.phone, newActive, pwd, req.params.id);
    res.json({ message: 'Співробітника оновлено' });
  } catch (e) {
    console.error('[EMP UPD]', e?.message || String(e));
    res.status(500).json({ error: 'Помилка при оновленні' });
  }
});

// Delete — check existence first
router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  const db = getDB();
  const user = db.prepare('SELECT id, role, is_active FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Співробітника не знайдено' });
  if (user.id === req.user.id)
    return res.status(400).json({ error: 'Не можна видалити власний обліковий запис' });
  if (user.role === 'admin' && user.is_active && activeAdmins(db) <= 1)
    return res.status(400).json({ error: 'Неможливо видалити останнього адміністратора' });
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ message: 'Співробітника видалено' });
});

module.exports = router;
