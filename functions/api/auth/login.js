import {
  assertSameOrigin, audit, checkLoginRateLimit, clearLoginFailures, createSession, json,
  normalizeEmail, rateLimitKey, readJson, recordLoginFailure, requireCoreBindings,
  sessionCookie, validateEmail
} from '../../_lib/auth.js';
import { PASSWORD_ALGORITHM, verifyPasswordForFreePlan } from '../../_lib/password-free.js';

export async function onRequestPost(context) {
  try {
    const originError = assertSameOrigin(context.request);
    if (originError) return originError;
    const bindingError = requireCoreBindings(context.env);
    if (bindingError) return bindingError;

    let body;
    try { body = await readJson(context.request); }
    catch (_) { return json({ ok: false, error: 'invalid_json' }, 400); }

    const email = normalizeEmail(body?.email);
    const password = String(body?.password || '');
    const workspace = String(body?.workspace || '').trim().toLowerCase();
    if (!validateEmail(email) || !password) return json({ ok: false, error: 'invalid_credentials' }, 401);

    const keyHash = await rateLimitKey(context, email);
    const limited = await checkLoginRateLimit(context, keyHash);
    if (limited) return limited;

    let query = `
      SELECT u.id, u.tenant_id, u.email, u.display_name, t.slug AS tenant_slug
      FROM users u
      JOIN tenants t ON t.id = u.tenant_id
      WHERE lower(u.email) = ? AND u.status = 'active' AND t.status = 'active'
    `;
    const params = [email];
    if (workspace) {
      query += ' AND lower(t.slug) = ?';
      params.push(workspace);
    }
    query += ' ORDER BY u.created_at ASC LIMIT 2';

    const users = await context.env.DB.prepare(query).bind(...params).all();
    const matches = users.results || [];
    if (!workspace && matches.length > 1) {
      return json({ ok: false, error: 'workspace_required' }, 409);
    }
    const user = matches[0];
    if (!user) {
      await recordLoginFailure(context, keyHash);
      return json({ ok: false, error: 'invalid_credentials' }, 401);
    }

    const credential = await context.env.DB.prepare(`
      SELECT password_hash, password_salt, password_iterations, password_algorithm
      FROM user_credentials WHERE user_id = ?
    `).bind(user.id).first();

    const valid = credential && credential.password_algorithm === PASSWORD_ALGORITHM &&
      await verifyPasswordForFreePlan(password, credential, context.env.SESSION_SECRET);
    if (!valid) {
      await recordLoginFailure(context, keyHash);
      return json({ ok: false, error: 'invalid_credentials' }, 401);
    }

    await clearLoginFailures(context, keyHash);
    const now = new Date().toISOString();
    await context.env.DB.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?')
      .bind(now, now, user.id).run();
    await audit(context, { tenantId: user.tenant_id, userId: user.id }, 'auth.login', 'user', user.id);

    const session = await createSession(context, user);
    return json({
      ok: true,
      user: { id: user.id, email: user.email, displayName: user.display_name },
      workspace: user.tenant_slug,
      sessionExpiresAt: session.expiresAt
    }, 200, { 'Set-Cookie': sessionCookie(session.token) });
  } catch (error) {
    return json({ ok: false, error: 'login_runtime_error', detail: String(error?.message || error).slice(0, 180) }, 500);
  }
}
