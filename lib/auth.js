/* Data layer. One interface, two backends: Supabase (Postgres) when configured, in-memory otherwise. */
const { HttpError } = require(require('path').join(__dirname, 'http'));
const { overlaps } = require(require('path').join(__dirname, 'validate'));
const crypto = require('crypto');
const useDb = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

/* ── Auth helpers (used by api/admin/login.js) ───────────── */

/** HMAC-SHA256 JWT (HS256) — no external dependency needed */
const b64url = b => Buffer.from(b).toString('base64url');
const authSecret = () => process.env.AUTH_SECRET || 'dev-secret-change-in-production';

function sign(expiresInSeconds, payload = {}) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiresInSeconds }));
  const sig = crypto.createHmac('sha256', authSecret()).update(header + '.' + claims).digest('base64url');
  return `${header}.${claims}.${sig}`;
}

function verify(token) {
  try {
    const [header, claims, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', authSecret()).update(header + '.' + claims).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(claims, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

/** Constant-time string comparison to prevent timing attacks */
function safeEqual(a, b) {
  if (!a || !b) return false;
  try {
    const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
    if (ba.length !== bb.length) {
      // Still run the comparison to avoid leaking length via timing
      crypto.timingSafeEqual(ba, Buffer.alloc(ba.length));
      return false;
    }
    return crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}

/** Returns the admin password from env, falling back to a demo value */
function adminPassword() {
  return process.env.ADMIN_PASSWORD || 'admin2026';
}

/** Staff accounts. In production these would be in the database. */
const ACCOUNTS = [
  { username: 'manager',      password: 'admin2026',      role: 'manager' },
  { username: 'receptionist', password: 'reception123',   role: 'receptionist' },
  { username: 'staff',        password: 'staff2026',      role: 'staff' },
];

function findAccount(username, password) {
  const account = ACCOUNTS.find(a => a.username === username.toLowerCase().trim());
  if (!account) return null;
  if (!safeEqual(password, account.password)) return null;
  return account;
}

/** Express/Vercel middleware: validates Bearer token and checks role.
 *  Throws HttpError(401) if missing/invalid, HttpError(403) if role not allowed. */
function requireRole(req, allowedRoles) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Not authenticated');
  const payload = verify(token);
  if (!payload) throw new HttpError(401, 'Session expired or invalid. Please sign in again.');
  const role = payload.role || 'admin';
  // 'admin' is the legacy single-password role — treat as manager
  const effective = role === 'admin' ? 'manager' : role;
  if (allowedRoles && !allowedRoles.includes(effective) && !allowedRoles.includes(role)) {
    throw new HttpError(403, 'Your role does not have permission to do that.');
  }
  req.role = effective;
  return effective;
}
const mem = globalThis.__lumen || (globalThis.__lumen = { bookings: [], blocked: [], settings: { power: 'auto', pct: 20 } });
const DEFAULTS = { power: 'auto', pct: 20, promo: '', promoPct: 0 };

// Hybrid Booking Logic: Event spaces/full floors require manual admin approval. Standard desks auto-confirm.
const getInitialStatus = (spaceId) => {
  const id = String(spaceId).toLowerCase();
  return (id.includes('event') || id.includes('floor')) ? 'pending' : 'confirmed';
};

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const k = process.env.SUPABASE_SERVICE_KEY;
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }
  });
  const text = await r.text();
  if (!r.ok) { const e = new Error('Supabase ' + r.status + ': ' + text); e.dup = text.includes('23505'); throw e; }
  return text ? JSON.parse(text) : null;
}

const fromRow = r => ({ id: r.id, ref: r.ref, space: r.space_id, name: r.name, email: r.email, date: r.date, slot: r.slot, status: r.status, drinks: r.drinks, setup: r.setup, extras: r.extras || [], notes: r.notes, wifi: { net: r.wifi_net, code: r.wifi_code }, createdAt: r.created_at });

const toRow = b => ({ ref: b.ref, space_id: b.space, name: b.name, email: b.email, date: b.date, slot: b.slot, status: getInitialStatus(b.space), drinks: b.drinks, setup: b.setup, extras: b.extras, notes: b.notes, wifi_net: b.wifi.net, wifi_code: b.wifi.code });

const uuid = id => /^[0-9a-f-]{8,40}$/i.test(String(id));
const clash = (list, b) => list.some(x => x.space === b.space && x.date === b.date && x.status !== 'cancelled' && overlaps(x.slot, b.slot));
const conflict = () => new HttpError(409, 'That space is already booked for that time. Please pick another slot or space.');

async function createBooking(b) {
  if (!useDb()) {
    if (clash(mem.bookings, b)) throw conflict();
    const row = { ...b, id: 'm' + Date.now() + Math.floor(Math.random() * 1e4), status: getInitialStatus(b.space), createdAt: new Date().toISOString() };
    mem.bookings.unshift(row); return row;
  }
  const same = await sb(`bookings?space_id=eq.${b.space}&date=eq.${b.date}&status=neq.cancelled&select=slot`);
  if (same.some(x => overlaps(x.slot, b.slot))) throw conflict();
  try { return fromRow((await sb('bookings', { method: 'POST', body: toRow(b), prefer: 'return=representation' }))[0]); }
  catch (e) { if (e.dup) throw conflict(); throw e; }
}

async function listBookings() {
  if (!useDb()) return mem.bookings;
  return (await sb('bookings?select=*&order=created_at.desc&limit=500')).map(fromRow);
}

async function takenOn(date) {
  if (!useDb()) return [...new Set(mem.bookings.filter(b => b.date === date && b.status !== 'cancelled').map(b => b.space))];
  return [...new Set((await sb(`bookings?date=eq.${date}&status=neq.cancelled&select=space_id`)).map(x => x.space_id))];
}

async function updateStatus(id, status) {
  if (!useDb()) { const b = mem.bookings.find(x => x.id === id); if (!b) return null; b.status = status; return b; }
  if (!uuid(id)) return null;
  const r = await sb(`bookings?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: { status }, prefer: 'return=representation' });
  return r[0] ? fromRow(r[0]) : null;
}

async function deleteBooking(id) {
  if (!useDb()) { const n = mem.bookings.length; mem.bookings = mem.bookings.filter(x => x.id !== id); return mem.bookings.length < n; }
  if (!uuid(id)) return false;
  return (await sb(`bookings?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', prefer: 'return=representation' })).length > 0;
}

async function getKey(key, fallback) {
  if (!useDb()) return key === 'app' ? mem.settings : mem.blocked;
  const r = await sb(`settings?key=eq.${key}&select=value`); return r[0] ? r[0].value : fallback;
}

async function setKey(key, value) {
  if (!useDb()) { if (key === 'app') mem.settings = value; else mem.blocked = value; return value; }
  await sb('settings', { method: 'POST', body: { key, value }, prefer: 'resolution=merge-duplicates' }); return value;
}

module.exports = {
  // Data layer
  createBooking, listBookings, takenOn, updateStatus, deleteBooking,
  getSettings: async () => ({ ...DEFAULTS, ...(await getKey('app', DEFAULTS)) }), saveSettings: v => setKey('app', v),
  getBlocked: async () => (await getKey('blocked', [])) || [], saveBlocked: v => setKey('blocked', v),
  // Auth helpers (used by api/admin/login.js and admin route guards)
  sign, verify, safeEqual, adminPassword, findAccount, requireRole,
};
