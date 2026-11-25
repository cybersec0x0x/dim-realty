const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const { initDB } = require('./db/database');
const { PORT, UPLOADS_DIR: uploadsDir } = require('./config');
const { migrateImages } = require('./lib/migrate-images');

const isProd = !!process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';

async function start() {
  await initDB();

  const app = express();
  app.set('trust proxy', 1);              // behind Railway's proxy: req.ip = the real client (rate limiting)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));
  // Upload names are unique and never reused, so browsers may cache them for a long time.
  app.use('/uploads', express.static(uploadsDir, { maxAge: '30d', immutable: true }));
  app.use('/uploads', (req, res) => res.status(404).end());   // missing photo = 404, not index.html

  app.use('/api/auth',       require('./routes/auth'));
  app.use('/api/properties', require('./routes/properties'));
  app.use('/api/employees',  require('./routes/employees'));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Не знайдено' }));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // Last-resort error handler: always answer with JSON instead of an HTML stack trace.
  app.use((err, req, res, next) => {
    console.error('[ERROR]', err?.message || err);
    if (res.headersSent) return next(err);
    res.status(err?.status || 500).json({ error: 'Внутрішня помилка сервера' });
  });

  app.listen(PORT, () => {
    console.log(`\n🏠  Dim Realty Admin Panel`);
    console.log(`    http://localhost:${PORT}`);
    if (!isProd) console.log(`    Логін: admin@dimrealty.ua / admin123\n`);
    if (isProd && !process.env.JWT_SECRET)
      console.warn('⚠️  JWT_SECRET не задано — використовується стандартний ключ з коду. Задайте змінну JWT_SECRET.');

    // One-off cleanup/compression of old photos. Runs inside this process on purpose: the DB lives
    // in memory here, so a separate script editing realty.db would be overwritten on the next save.
    // Enable by setting MIGRATE_IMAGES=1 (and CLEAN_ORPHANS=1 to also delete unused files), then unset.
    if (process.env.MIGRATE_IMAGES === '1') {
      migrateImages({ cleanOrphans: process.env.CLEAN_ORPHANS === '1' })
        .catch(e => console.error('[MIGRATE] failed:', e));
    }
  });
}

start().catch(err => { console.error(err); process.exit(1); });
