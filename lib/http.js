/* Small HTTP helpers shared by every API route */
class HttpError extends Error { constructor(code, message) { super(message); this.code = code; } }
const hits = new Map();

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function limit(req, key, max, windowMs) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'local', k = key + ip, now = Date.now();
  const e = hits.get(k) || { n: 0, t: now };
  if (now - e.t > windowMs) { e.n = 0; e.t = now; }
  e.n++; hits.set(k, e);
  if (e.n > max) throw new HttpError(429, 'Too many requests. Try again shortly.');
}

const route = (methods, fn) => async (req, res) => {
  try {
    if (!methods.includes(req.method)) { res.setHeader('Allow', methods.join(', ')); throw new HttpError(405, 'Method not allowed'); }
    req.query = req.query || {};
    if (!req.body) {
      await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => {
          try { req.body = data ? JSON.parse(data) : {}; } catch { req.body = {}; }
          resolve();
        });
        req.on('error', reject);
      });
    }
    await fn(req, res);
  } catch (e) {
    const code = Number.isInteger(e.code) ? e.code : 500;
    if (code === 500) console.error(e);
    send(res, code, { error: code === 500 ? 'Server error' : e.message });
  }
};

module.exports = { HttpError, send, limit, route };
