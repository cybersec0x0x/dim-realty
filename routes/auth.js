const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDB } = require('../db/database');
const { JWT_SECRET } = require('../config');
const { authMiddleware } = require('../middleware/auth');

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email та пароль обов'язкові" });

  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Невірний email або пароль' });

  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
  });
});

router.post('/register', (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: "Ім'я, email та пароль обов'язкові" });

  const db = getDB();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email))
    return res.status(400).json({ error: 'Користувач з таким email вже існує' });

  try {
    const hash = bcrypt.hashSync(password, 10);
    const r = db
      .prepare('INSERT INTO users (name,email,password,phone,role,is_active) VALUES (?,?,?,?,?,?)')
      .run(name, email, hash, phone || null, 'agent', 1);
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(r.lastInsertRowid);
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user });
  } catch (e) {
    console.error('[REGISTER]', e?.message || String(e));
    res.status(500).json({ error: 'Помилка при реєстрації' });
  }
});

router.get('/me', authMiddleware, (req, res) => {
  const db = getDB();
  const user = db.prepare('SELECT id, name, email, role, phone, avatar FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Користувача не знайдено' });
  res.json(user);
});

router.put('/me', authMiddleware, (req, res) => {
  const { name, phone, password } = req.body;
  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const updatedPwd = password ? bcrypt.hashSync(password, 10) : user.password;
  db.prepare('UPDATE users SET name=?, phone=?, password=? WHERE id=?')
    .run(name || user.name, phone || user.phone, updatedPwd, req.user.id);
  res.json({ message: 'Профіль оновлено' });
});

module.exports = router;
