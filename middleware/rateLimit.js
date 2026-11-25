// Tiny in-memory rate limiter (one process, so no shared store is needed).
// Counts only FAILED attempts when used with `limiter.fail(req)`; a success resets the counter.
function createLimiter({ max = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map();   // key -> { n, reset }

  const key = req => req.ip || req.socket?.remoteAddress || 'unknown';
  const current = k => {
    const h = hits.get(k);
    if (!h || h.reset < Date.now()) { hits.delete(k); return null; }
    return h;
  };

  return {
    check(req, res, next) {
      const h = current(key(req));
      if (h && h.n >= max) {
        const mins = Math.ceil((h.reset - Date.now()) / 60000);
        return res.status(429).json({ error: `Забагато спроб входу. Спробуйте через ${mins} хв.` });
      }
      next();
    },
    fail(req) {
      const k = key(req);
      const h = current(k) || { n: 0, reset: Date.now() + windowMs };
      h.n++;
      hits.set(k, h);
    },
    reset(req) { hits.delete(key(req)); },
  };
}

module.exports = { createLimiter };
