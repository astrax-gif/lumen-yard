/* POST /api/admin/login {username, password} -> {token} */
const { route, send, limit, HttpError } = require('../../lib/http');
const { sign, findAccount } = require('../../lib/auth');
module.exports = route(['POST'], async (req, res) => {
  limit(req, 'login', 8, 60000);
  const username = String(req.body.username || '');
  const password = String(req.body.password || '');
  const account = findAccount(username, password);
  if (!account) throw new HttpError(401, 'Wrong: got username=[' + username + ']');
  send(res, 200, { token: sign(8 * 3600, { role: account.role }), role: account.role, expiresIn: 8 * 3600 });
});
