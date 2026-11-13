/* POST /api/bookings : public */
const path = require('path');
const { route, send, limit, HttpError } = require(path.join(__dirname, '../lib/http'));
const { validateBooking } = require(path.join(__dirname, '../lib/validate'));
const { guestWifi, newRef } = require(path.join(__dirname, '../lib/wifi'));
const store = require(path.join(__dirname, '../lib/store'));
module.exports = route(['POST'], async (req, res) => {
  limit(req, 'book', 20, 60000);
  const b = validateBooking(req.body);
  if ((await store.getBlocked()).includes(b.space)) throw new HttpError(409, 'This space is not available.');
  const saved = await store.createBooking({ ...b, ref: newRef(), wifi: guestWifi() });
  send(res, 201, { ref: saved.ref, status: saved.status, space: saved.space, date: saved.date, slot: saved.slot, wifi: saved.wifi });
});
