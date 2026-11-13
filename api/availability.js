/* GET /api/availability?date=YYYY-MM-DD : public */
const path = require('path');
const { route, HttpError } = require(path.join(__dirname, '../lib/http'));
const { validDate } = require(path.join(__dirname, '../lib/validate'));
const store = require(path.join(__dirname, '../lib/store'));
module.exports = route(['GET'], async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  if (!validDate(date)) throw new HttpError(400, 'Invalid date');
  const [taken, blocked, settings] = await Promise.all([store.takenOn(date), store.getBlocked(), store.getSettings()]);
  res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ date, taken, blocked, settings }));
});
