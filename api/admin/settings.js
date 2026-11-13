/* Admin: GET / PUT {power: auto|on|off, pct: 5-60} : the Power Hour offer */
const path = require('path');
const { route, send, HttpError } = require(path.join(__dirname, '../../lib/http'));
const { requireAdmin } = require(path.join(__dirname, '../../lib/auth'));
const store = require(path.join(__dirname, '../../lib/store'));
module.exports = route(['GET', 'PUT'], async (req, res) => {
  requireAdmin(req);
  if (req.method === 'PUT') {
    const { power, pct } = req.body;
    if (!['auto', 'on', 'off'].includes(power) || !Number.isInteger(pct) || pct < 5 || pct > 60) throw new HttpError(400, 'Invalid settings');
    await store.saveSettings({ power, pct });
  }
  send(res, 200, await store.getSettings());
});
