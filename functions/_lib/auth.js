const encoder = new TextEncoder();
export const SESSION_COOKIE = '__Host-aftos_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
export const PASSWORD_ITERATIONS = 210000;

export function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers }
  });
}

export async function readJson(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new Error('CONTENT_TYPE');
  return request.json();
}

export function assertSameOrigin(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return null;
  const origin = request.headers.get('Origin');
  const expected = new URL(request.url).origin;
  if (!origin || origin !== expected) return json({ ok: false, error: 'invalid_origin' }, 403);
  return null;
}

function toBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function randomBytes(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function randomId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function sha256Bytes(value) {
  const input = value instanceof Uint8Array ? value : encoder.encode(String(value));
  return new Uint8Array(await crypto.subtle.digest('SHA-256', input));
}

export async function sha256(value) {
  return toBase64Url(await sha256Bytes(value));
}

export async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

export async function constantTimeEqual(a, b) {
  const aa = await sha256Bytes(String(a));
  const bb = await sha256Bytes(String(b));
  if (typeof crypto.subtle.timingSafeEqual === 'function') return crypto.subtle.timingSafeEqual(aa, bb);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) diff |= (aa[i % aa.length] || 0) ^ (bb[i % bb.length] || 0);
  return diff === 0;
}

export async function hashPassword(password, saltValue = null, iterations = PASSWORD_ITERATIONS) {
  const salt = saltValue ? fromBase64Url(saltValue) : randomBytes(16);
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, baseKey, 256
  );
  return {
    hash: toBase64Url(new Uint8Array(bits)),
    salt: toBase64Url(salt),
    iterations
  };
}

export async function verifyPassword(password, credential) {
  const derived = await hashPassword(password, credential.password_salt, Number(credential.password_iterations));
  return constantTimeEqual(derived.hash, credential.password_hash);
}

export function parseCookie(request, name = SESSION_COOKIE) {
  const raw = request.headers.get('Cookie') || '';
  for (const pair of raw.split(';')) {
    const [key, ...rest] = pair.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12) return 'password_too_short';
  if (password.length > 256) return 'password_too_long';
  return null;
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function requireCoreBindings(env) {
  if (!env?.DB) return json({ ok: false, error: 'db_not_bound' }, 503);
  if (!env?.SESSION_SECRET) return json({ ok: false, error: 'session_secret_not_configured' }, 503);
  return null;
}

export async function createSession(context, user) {
  const token = toBase64Url(randomBytes(32));
  const tokenHash = await sha256(token);
  const sessionId = randomId('ses');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  const userAgent = context.request.headers.get('User-Agent') || '';
  const ip = context.request.headers.get('CF-Connecting-IP') || '';
  const userAgentHash = userAgent ? await hmac(context.env.SESSION_SECRET, userAgent) : null;
  const ipHash = ip ? await hmac(context.env.SESSION_SECRET, ip) : null;

  await context.env.DB.prepare(`
    INSERT INTO sessions(
      id, tenant_id, user_id, token_hash, expires_at, created_at, last_seen_at,
      user_agent_hash, ip_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    sessionId, user.tenant_id, user.id, tokenHash, expires.toISOString(),
    now.toISOString(), now.toISOString(), userAgentHash, ipHash
  ).run();

  return { token, sessionId, expiresAt: expires.toISOString() };
}

export async function getAuth(context) {
  if (!context.env?.DB || !context.env?.SESSION_SECRET) return null;
  const token = parseCookie(context.request);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const session = await context.env.DB.prepare(`
    SELECT
      s.id AS session_id, s.tenant_id, s.user_id, s.expires_at,
      u.email, u.display_name, u.status AS user_status,
      t.name AS tenant_name, t.slug AS tenant_slug, t.status AS tenant_status
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN tenants t ON t.id = s.tenant_id
    WHERE s.token_hash = ?
      AND s.revoked_at IS NULL
      AND datetime(s.expires_at) > datetime('now')
      AND u.status = 'active'
      AND t.status = 'active'
    LIMIT 1
  `).bind(tokenHash).first();
  if (!session) return null;

  const roleRows = await context.env.DB.prepare(`
    SELECT r.role_key, r.name, r.permissions_json
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = ? AND r.tenant_id = ?
  `).bind(session.user_id, session.tenant_id).all();

  const permissions = new Set();
  const roles = [];
  for (const row of roleRows.results || []) {
    roles.push({ key: row.role_key, name: row.name });
    try {
      for (const permission of JSON.parse(row.permissions_json || '[]')) permissions.add(permission);
    } catch (_) {}
  }

  context.waitUntil(
    context.env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), session.session_id).run()
  );

  return {
    sessionId: session.session_id,
    user: { id: session.user_id, email: session.email, displayName: session.display_name },
    tenant: { id: session.tenant_id, name: session.tenant_name, slug: session.tenant_slug },
    roles,
    permissions: [...permissions]
  };
}

export function can(auth, permission) {
  return Boolean(auth && (auth.permissions.includes('*') || auth.permissions.includes(permission)));
}

export async function requireAuth(context, permission = null) {
  const bindingError = requireCoreBindings(context.env);
  if (bindingError) return { response: bindingError, auth: null };
  const auth = await getAuth(context);
  if (!auth) return { response: json({ ok: false, error: 'unauthorized' }, 401), auth: null };
  if (permission && !can(auth, permission)) {
    return { response: json({ ok: false, error: 'forbidden', permission }, 403), auth: null };
  }
  return { response: null, auth };
}

export async function revokeCurrentSession(context) {
  const token = parseCookie(context.request);
  if (!token || !context.env?.DB) return;
  const tokenHash = await sha256(token);
  await context.env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
    .bind(new Date().toISOString(), tokenHash).run();
}

export async function audit(context, authLike, action, entityType, entityId = null, before = null, after = null) {
  if (!context.env?.DB || !authLike?.tenantId) return;
  await context.env.DB.prepare(`
    INSERT INTO audit_logs(id, tenant_id, user_id, action, entity_type, entity_id, before_json, after_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    randomId('aud'), authLike.tenantId, authLike.userId || null, action, entityType, entityId,
    before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after),
    new Date().toISOString()
  ).run();
}

export async function rateLimitKey(context, email) {
  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  return hmac(context.env.SESSION_SECRET, `${normalizeEmail(email)}|${ip}`);
}

export async function checkLoginRateLimit(context, keyHash) {
  const row = await context.env.DB.prepare('SELECT attempts, window_started_at, blocked_until FROM auth_attempts WHERE key_hash = ?')
    .bind(keyHash).first();
  if (!row) return null;
  if (row.blocked_until && Date.parse(row.blocked_until) > Date.now()) {
    return json({ ok: false, error: 'too_many_attempts', retryAfter: row.blocked_until }, 429);
  }
  return null;
}

export async function recordLoginFailure(context, keyHash) {
  const now = new Date();
  const row = await context.env.DB.prepare('SELECT attempts, window_started_at FROM auth_attempts WHERE key_hash = ?')
    .bind(keyHash).first();
  const windowMs = 15 * 60 * 1000;
  const freshWindow = !row || !row.window_started_at || (now.getTime() - Date.parse(row.window_started_at) > windowMs);
  const attempts = freshWindow ? 1 : Number(row.attempts || 0) + 1;
  const blockedUntil = attempts >= 5 ? new Date(now.getTime() + windowMs).toISOString() : null;
  await context.env.DB.prepare(`
    INSERT INTO auth_attempts(key_hash, attempts, window_started_at, blocked_until, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key_hash) DO UPDATE SET
      attempts = excluded.attempts,
      window_started_at = excluded.window_started_at,
      blocked_until = excluded.blocked_until,
      updated_at = excluded.updated_at
  `).bind(keyHash, attempts, freshWindow ? now.toISOString() : row.window_started_at, blockedUntil, now.toISOString()).run();
}

export async function clearLoginFailures(context, keyHash) {
  await context.env.DB.prepare('DELETE FROM auth_attempts WHERE key_hash = ?').bind(keyHash).run();
}
