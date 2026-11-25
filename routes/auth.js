const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDB } = require('../db/database');
const { JWT_SECRET } = require('../config');
const { authMiddleware } = require('../middleware/auth');
const { createLimiter } = require('../middleware/rateLimit');

const loginLimiter = createLimiter({ max: 10, windowMs: 15 * 60 * 1000 });
const MIN_PASSWORD = 6;
const normEmail = e => String(e || '').trim().toLowerCase();

router.post('/login', loginLimiter.check, (req, res) => {
  const email = normEmail(req.body.email);
  const { password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email та пароль обов'язкові" });

  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = ? AND is_active = 1').get(email);
  if (!user || !bcrypt.compareSync(String(password), user.password)) {
    loginLimiter.fail(req);
    return res.status(401).json({ error: 'Невірний email або пароль' });
  }
  loginLimiter.reset(req);

  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, avatar: user.avatar },
  });
});

// Public self-registration is OFF by default: anyone could otherwise create an account and read all
// objects and owner phone numbers. Admins add staff on the "Співробітники" page.
// Set ALLOW_REGISTER=1 to turn it back on.
router.post('/register', (req, res) => {
  if (process.env.ALLOW_REGISTER !== '1')
    return res.status(403).json({ error: 'Реєстрацію вимкнено. Зверніться до адміністратора.' });

  const { name, password, phone } = req.body;
  const email = normEmail(req.body.email);
  if (!name || !email || !password)
    return res.status(400).json({ error: "Ім'я, email та пароль обов'язкові" });
  if (String(password).length < MIN_PASSWORD)
    return res.status(400).json({ error: `Пароль має містити щонайменше ${MIN_PASSWORD} символів` });

  const db = getDB();
  if (db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email))
    return res.status(400).json({ error: 'Користувач з таким email вже існує' });

  try {
    const hash = bcrypt.hashSync(String(password), 10);
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
  if (!user) return res.status(404).json({ error: 'Користувача не знайдено' });
  if (password && String(password).length < MIN_PASSWORD)
    return res.status(400).json({ error: `Пароль має містити щонайменше ${MIN_PASSWORD} символів` });
  const updatedPwd = password ? bcrypt.hashSync(String(password), 10) : user.password;
  // phone: undefined = leave as is, '' = clear it
  const newPhone = phone === undefined ? user.phone : (String(phone).trim() || null);
  db.prepare('UPDATE users SET name=?, phone=?, password=? WHERE id=?')
    .run((name && String(name).trim()) || user.name, newPhone, updatedPwd, req.user.id);
  res.json({ message: 'Профіль оновлено' });
});

module.exports = router;
