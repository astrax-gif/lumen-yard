/* POST /api/admin/login {username, password} -> {token} */
const { route, send, limit, HttpError } = require('../lib/http');
const { sign, findAccount } = require('../lib/auth');
module.exports = route(['POST'], async (req, res) => {
  limit(req, 'login', 8, 60000);
  const account = findAccount(String(req.body.username || ''), String(req.body.password || ''));
  if (!account) throw new HttpError(401, 'Wrong username or password');
  send(res, 200, { token: sign(8 * 3600, { role: account.role }), expiresIn: 8 * 3600 });
});
