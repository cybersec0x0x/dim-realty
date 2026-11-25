require('dotenv').config({ silent: true });
const path = require('path');
const fs = require('fs');

// On Railway: mount a Volume at /app/data (or set DATA_DIR) — DB and uploads both live there.
const DATA_DIR    = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

module.exports = {
  JWT_SECRET: process.env.JWT_SECRET || 'dim-realty-jwt-secret-2024-ua',
  PORT: process.env.PORT || 3000,
  DATA_DIR,
  UPLOADS_DIR,
};
