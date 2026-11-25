const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { initDB } = require('./db/database');
const { PORT, UPLOADS_DIR: uploadsDir } = require('./config');
const { migrateImages } = require('./lib/migrate-images');

async function start() {
  await initDB();

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));
  // Upload names are unique and never reused, so browsers may cache them for a long time.
  app.use('/uploads', express.static(uploadsDir, { maxAge: '30d', immutable: true }));
  app.use('/uploads', (req, res) => res.status(404).end());   // missing photo = 404, not index.html

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
