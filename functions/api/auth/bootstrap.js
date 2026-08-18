import {
  assertSameOrigin, audit, constantTimeEqual, createSession, hashPassword, json,
  normalizeEmail, randomId, readJson, requireCoreBindings, sessionCookie,
  validateEmail, validatePassword
} from '../../_lib/auth.js';

export async function onRequestPost(context) {
  const originError = assertSameOrigin(context.request);
  if (originError) return originError;
  const bindingError = requireCoreBindings(context.env);
  if (bindingError) return bindingError;
  if (!context.env?.BOOTSTRAP_TOKEN) return json({ ok: false, error: 'bootstrap_token_not_configured' }, 503);

  let body;
  try { body = await readJson(context.request); }
  catch (_) { return json({ ok: false, error: 'invalid_json' }, 400); }

  const token = String(body?.bootstrapToken || '');
  const email = normalizeEmail(body?.email);
  const displayName = String(body?.displayName || '').trim();
  const tenantName = String(body?.tenantName || '').trim();
  const password = String(body?.password || '');

  if (!await constantTimeEqual(token, context.env.BOOTSTRAP_TOKEN)) {
    return json({ ok: false, error: 'invalid_bootstrap_token' }, 403);
  }
  if (!validateEmail(email)) return json({ ok: false, error: 'invalid_email' }, 400);
  if (!displayName || displayName.length > 120) return json({ ok: false, error: 'invalid_display_name' }, 400);
  if (!tenantName || tenantName.length > 160) return json({ ok: false, error: 'invalid_tenant_name' }, 400);
  const passwordError = validatePassword(password);
  if (passwordError) return json({ ok: false, error: passwordError }, 400);

  const schema = await context.env.DB.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").first();
  if (Number(schema?.value || 0) < 3) return json({ ok: false, error: 'auth_schema_not_ready' }, 503);
  const existing = await context.env.DB.prepare('SELECT COUNT(*) AS count FROM users').first();
  if (Number(existing?.count || 0) > 0) return json({ ok: false, error: 'bootstrap_disabled' }, 409);

  const tenantId = randomId('ten');
  const userId = randomId('usr');
  const roleId = randomId('rol');
  const now = new Date().toISOString();
  const tenantSlug = `workspace-${crypto.randomUUID().slice(0, 8)}`;
  const credential = await hashPassword(password);

  try {
    await context.env.DB.batch([
      context.env.DB.prepare("INSERT INTO schema_meta(key, value, updated_at) VALUES ('bootstrap_completed', ?, ?)").bind(userId, now),
      context.env.DB.prepare(`
        INSERT INTO tenants(id, name, slug, status, timezone, locale, created_at, updated_at)
        VALUES (?, ?, ?, 'active', 'Asia/Taipei', 'zh-CN', ?, ?)
      `).bind(tenantId, tenantName, tenantSlug, now, now),
      context.env.DB.prepare(`
        INSERT INTO roles(id, tenant_id, role_key, name, permissions_json, created_at, updated_at)
        VALUES (?, ?, 'owner', 'Workspace Owner', '["*"]', ?, ?)
      `).bind(roleId, tenantId, now, now),
      context.env.DB.prepare(`
        INSERT INTO users(id, tenant_id, email, display_name, status, locale, timezone, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', 'zh-CN', 'Asia/Taipei', ?, ?)
      `).bind(userId, tenantId, email, displayName, now, now),
      context.env.DB.prepare(`
        INSERT INTO user_credentials(user_id, password_hash, password_salt, password_iterations, password_algorithm, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'PBKDF2-SHA256', ?, ?)
      `).bind(userId, credential.hash, credential.salt, credential.iterations, now, now),
      context.env.DB.prepare('INSERT INTO user_roles(user_id, role_id, created_at) VALUES (?, ?, ?)').bind(userId, roleId, now),
      context.env.DB.prepare(`
        INSERT INTO audit_logs(id, tenant_id, user_id, action, entity_type, entity_id, before_json, after_json, created_at)
        VALUES (?, ?, ?, 'workspace.bootstrap', 'tenant', ?, NULL, ?, ?)
      `).bind(randomId('aud'), tenantId, userId, tenantId, JSON.stringify({ tenantName, email, role: 'owner' }), now)
    ]);
  } catch (error) {
    const duplicateBootstrap = String(error?.message || '').includes('UNIQUE');
    return json({ ok: false, error: duplicateBootstrap ? 'bootstrap_disabled' : 'bootstrap_failed' }, duplicateBootstrap ? 409 : 500);
  }

  const session = await createSession(context, { id: userId, tenant_id: tenantId });
  return json({
    ok: true,
    tenant: { id: tenantId, name: tenantName, slug: tenantSlug },
    user: { id: userId, email, displayName },
    role: 'owner',
    sessionExpiresAt: session.expiresAt
  }, 201, { 'Set-Cookie': sessionCookie(session.token) });
}
