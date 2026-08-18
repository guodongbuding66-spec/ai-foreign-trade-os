import { json } from '../../_lib/auth.js';

export async function onRequestGet(context) {
  if (!context.env?.DB) return json({ ok: false, dbBound: false, error: 'db_not_bound' }, 503);

  let schemaVersion = null;
  let userCount = 0;
  try {
    const schema = await context.env.DB.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").first();
    schemaVersion = schema?.value || null;
    const count = await context.env.DB.prepare('SELECT COUNT(*) AS count FROM users').first();
    userCount = Number(count?.count || 0);
  } catch (error) {
    return json({ ok: false, dbBound: true, schemaVersion, error: 'auth_schema_not_ready' }, 503);
  }

  const sessionSecretConfigured = Boolean(context.env?.SESSION_SECRET);
  const bootstrapTokenConfigured = Boolean(context.env?.BOOTSTRAP_TOKEN);
  return json({
    ok: true,
    dbBound: true,
    schemaVersion,
    authSchemaReady: Number(schemaVersion) >= 3,
    sessionSecretConfigured,
    bootstrapTokenConfigured,
    hasUsers: userCount > 0,
    userCount,
    bootstrapAvailable: Number(schemaVersion) >= 3 && sessionSecretConfigured && bootstrapTokenConfigured && userCount === 0
  });
}
