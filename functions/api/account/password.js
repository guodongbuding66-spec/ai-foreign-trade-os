import { assertSameOrigin, audit, json, readJson, requireAuth, validatePassword } from '../../_lib/auth.js';
import { hashPasswordForFreePlan, verifyPasswordForFreePlan } from '../../_lib/password-free.js';

export async function onRequestPost(context) {
  const originError = assertSameOrigin(context.request); if (originError) return originError;
  const { response, auth } = await requireAuth(context); if (response) return response;
  let body; try { body = await readJson(context.request); } catch (_) { return json({ok:false,error:'invalid_json'},400); }
  const currentPassword = String(body?.currentPassword || '');
  const newPassword = String(body?.newPassword || '');
  const passwordError = validatePassword(newPassword); if (passwordError) return json({ok:false,error:passwordError},400);
  if (!currentPassword) return json({ok:false,error:'current_password_required'},400);
  if (currentPassword === newPassword) return json({ok:false,error:'new_password_must_differ'},400);

  const credential = await context.env.DB.prepare('SELECT * FROM user_credentials WHERE user_id=? LIMIT 1').bind(auth.user.id).first();
  if (!credential) return json({ok:false,error:'credential_not_found'},404);
  const valid = await verifyPasswordForFreePlan(currentPassword, credential, context.env.SESSION_SECRET);
  if (!valid) return json({ok:false,error:'current_password_invalid'},403);

  const next = await hashPasswordForFreePlan(newPassword, context.env.SESSION_SECRET);
  const now = new Date().toISOString();
  await context.env.DB.batch([
    context.env.DB.prepare(`
      UPDATE user_credentials SET password_hash=?,password_salt=?,password_iterations=?,password_algorithm=?,updated_at=?
      WHERE user_id=?
    `).bind(next.hash,next.salt,next.iterations,next.algorithm,now,auth.user.id),
    context.env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND id<>? AND revoked_at IS NULL').bind(now,auth.user.id,auth.sessionId)
  ]);
  await audit(context,{tenantId:auth.tenant.id,userId:auth.user.id},'account.password.change','user',auth.user.id,null,{otherSessionsRevoked:true});
  return json({ok:true,otherSessionsRevoked:true});
}
