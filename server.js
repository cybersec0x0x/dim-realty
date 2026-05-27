const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { initDB } = require('./db/database');
const { PORT } = require('./config');

const DATA_DIR   = process.env.DATA_DIR || path.join(__dirname, 'data');
const uploadsDir = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

async function start() {
  await initDB();

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/uploads', express.static(uploadsDir));

  app.use('/api/auth',       require('./routes/auth'));
  app.use('/api/properties', require('./routes/properties'));
  app.use('/api/employees',  require('./routes/employees'));

  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api'))
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.listen(PORT, () => {
    console.log(`\n🏠  Dim Realty Admin Panel`);
    console.log(`    http://localhost:${PORT}`);
    console.log(`    Логін: admin@dimrealty.ua / admin123\n`);
  });
}

start().catch(err => { console.error(err); process.exit(1); });
