/* Admin: GET / PUT {power: auto|on|off, pct: 5-60, promo: string, promoPct: 0-60} : the Power Hour offer and promo code.
   GET: manager, receptionist, staff. PUT: manager only. */
const path = require('path');
const { route, send, HttpError } = require(path.join(__dirname, '../../lib/http'));
const { requireRole } = require(path.join(__dirname, '../../lib/auth'));
const store = require(path.join(__dirname, '../../lib/store'));
module.exports = route(['GET', 'PUT'], async (req, res) => {
  requireRole(req, req.method === 'PUT' ? ['manager'] : ['manager', 'receptionist', 'staff']);
  if (req.method === 'PUT') {
    const { power, pct, promo, promoPct } = req.body;
    if (!['auto', 'on', 'off'].includes(power) || !Number.isInteger(pct) || pct < 5 || pct > 60) throw new HttpError(400, 'Invalid settings');
    const code = String(promo || '').trim().toUpperCase().slice(0, 20).replace(/[^A-Z0-9]/g, '');
    const p = Number.isInteger(promoPct) ? Math.min(60, Math.max(0, promoPct)) : 0;
    await store.saveSettings({ power, pct, promo: code, promoPct: code ? p : 0 });
  }
  send(res, 200, await store.getSettings());
});
