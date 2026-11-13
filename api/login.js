/* POST /api/admin/login {username, password} -> {token, role}. Rate limited, constant-time comparison. */
const { route, send, limit, HttpError } = require('../../lib/http');
const { sign, safeEqual, adminPassword, findAccount, demo } = require('../../lib/auth');
module.exports = route(['POST'], async (req, res) => {
  limit(req, 'login', 8, 60000);
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  let role = 'admin';
  if (username) {
    const account = findAccount(username, password);
    if (!account) throw new HttpError(401, 'Wrong username or password');
    role = account.role;
  } else {
    if (!safeEqual(password, adminPassword())) throw new HttpError(401, 'Wrong password');
  }
  send(res, 200, { token: sign(8 * 3600, { role }), expiresIn: 8 * 3600, role });
});
