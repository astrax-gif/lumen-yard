/* Admin: GET list, PATCH ?id= {status}, DELETE ?id=
   GET (view bookings): manager, receptionist, staff. PATCH/DELETE (confirm, cancel, delete): manager, receptionist. Staff is view-only. */
const path = require('path');
const { route, send, HttpError } = require(path.join(__dirname, '../../lib/http'));
const { requireRole } = require(path.join(__dirname, '../../lib/auth'));
const { STATUSES } = require(path.join(__dirname, '../../lib/validate'));
const store = require(path.join(__dirname, '../../lib/store'));
module.exports = route(['GET', 'PATCH', 'DELETE'], async (req, res) => {
  requireRole(req, req.method === 'GET' ? ['manager', 'receptionist', 'staff'] : ['manager', 'receptionist']);
  if (req.method === 'GET') return send(res, 200, { bookings: await store.listBookings() });
  const id = String(req.query.id || '');
  if (!id) throw new HttpError(400, 'Missing id');
  if (req.method === 'DELETE') { if (!(await store.deleteBooking(id))) throw new HttpError(404, 'Not found'); return send(res, 200, { ok: true }); }
  if (!STATUSES.includes(req.body.status)) throw new HttpError(400, 'Invalid status');
  const b = await store.updateStatus(id, req.body.status);
  if (!b) throw new HttpError(404, 'Not found');
  send(res, 200, { booking: b });
});
