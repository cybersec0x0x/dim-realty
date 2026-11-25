const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { UPLOADS_DIR } = require('../config');

const MAX_SIDE = 1600;   // longest side after resize, px
const QUALITY  = 80;     // JPEG quality

// Resize + compress any uploaded picture to a JPEG (~200-300 KB instead of 1-5 MB).
// Returns the stored file name. Throws if the buffer is not a valid image.
async function saveImage(input, targetName) {
  const name = targetName || `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const dest = path.join(UPLOADS_DIR, name);
  try {
    await sharp(input, { failOn: 'none' })
      .rotate()                                   // respect EXIF orientation
      .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })         // PNG transparency -> white
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toFile(dest);
  } catch (e) {
    removeImage(name);                            // don't leave a half-written file behind
    throw e;
  }
  return name;
}

// Delete a stored file by name. Silently ignores missing files and path tricks.
function removeImage(name) {
  if (!name || typeof name !== 'string') return;
  const base = path.basename(name);
  if (base !== name) return;
  try { fs.unlinkSync(path.join(UPLOADS_DIR, base)); } catch {}
}

function removeImages(names) {
  (names || []).forEach(removeImage);
}

function parseImages(json) {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : [];
  } catch { return []; }
}

module.exports = { saveImage, removeImage, removeImages, parseImages };
