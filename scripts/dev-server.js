/* Local server: static files + /api routes. Run: npm run dev  (no install needed) */
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const hidden = /^\/(lib|tests|scripts|db|node_modules|\.git|\.env)/;
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname.startsWith('/api/')) {
    const f = path.join(root, u.pathname + '.js');
    if (!f.startsWith(path.join(root, 'api')) || !fs.existsSync(f)) { res.statusCode = 404; return res.end('{"error":"Not found"}'); }
    let raw = ''; for await (const c of req) raw += c;
    try { req.body = raw ? JSON.parse(raw) : {}; } catch (e) { req.body = {}; }
    req.query = Object.fromEntries(u.searchParams);
    return require(f)(req, res);
  }
  const p = path.join(root, u.pathname === '/' ? 'index.html' : u.pathname);
  if (hidden.test(u.pathname) || !p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('Content-Type', mime[path.extname(p)] || 'application/octet-stream'); fs.createReadStream(p).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log('Lumen Yard running at http://localhost:' + (process.env.PORT || 3000)));
