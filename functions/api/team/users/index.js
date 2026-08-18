import {
  assertSameOrigin, audit, json, normalizeEmail, randomId, readJson, requireAuth,
  validateEmail, validatePassword
} from '../../../_lib/auth.js';
import { hashPasswordForFreePlan } from '../../../_lib/password-free.js';
import { ensureTeamRoles, getRole, publicUser } from '../../../_lib/team.js';

const ALLOWED_ROLES = new Set(['admin','sales','viewer']);

export async function onRequestPost(context) {
  const originError = assertSameOrigin(context.request); if (originError) return originError;
  const { response, auth } = await requireAuth(context, 'workspace.users.manage'); if (response) return response;
  let body; try { body = await readJson(context.request); } catch (_) { return json({ok:false,error:'invalid_json'},400); }

  const email = normalizeEmail(body?.email);
  const displayName = String(body?.displayName || '').trim().slice(0,120);
  const password = String(body?.password || '');
  const roleKey = String(body?.roleKey || 'sales').trim().toLowerCase();
  if (!validateEmail(email)) return json({ok:false,error:'invalid_email'},400);
  if (!displayName) return json({ok:false,error:'display_name_required'},400);
  const passwordError = validatePassword(password); if (passwordError) return json({ok:false,error:passwordError},400);
  if (!ALLOWED_ROLES.has(roleKey)) return json({ok:false,error:'role_not_allowed'},400);

  await ensureTeamRoles(context.env.DB, auth.tenant.id);
  const role = await getRole(context.env.DB, auth.tenant.id, roleKey);
  if (!role) return json({ok:false,error:'role_not_found'},404);
  const exists = await context.env.DB.prepare('SELECT id FROM users WHERE tenant_id=? AND email=? LIMIT 1').bind(auth.tenant.id,email).first();
  if (exists) return json({ok:false,error:'email_already_exists'},409);

  const credential = await hashPasswordForFreePlan(password, context.env.SESSION_SECRET);
  const id = randomId('usr'), now = new Date().toISOString();
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(`
        INSERT INTO users(id,tenant_id,email,display_name,status,locale,timezone,created_at,updated_at)
        VALUES(?,?,?,?, 'active','zh-CN','Asia/Taipei',?,?)
      `).bind(id,auth.tenant.id,email,displayName,now,now),
      context.env.DB.prepare(`
        INSERT INTO user_credentials(user_id,password_hash,password_salt,password_iterations,password_algorithm,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?)
      `).bind(id,credential.hash,credential.salt,credential.iterations,credential.algorithm,now,now),
      context.env.DB.prepare('INSERT INTO user_roles(user_id,role_id,created_at) VALUES(?,?,?)').bind(id,role.id,now)
    ]);
  } catch (error) {
    return json({ok:false,error:'member_create_failed',detail:String(error?.message||error).slice(0,180)},500);
  }
  const row = await context.env.DB.prepare(`
    SELECT u.*,r.role_key,r.name role_name FROM users u
    JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
    WHERE u.id=? AND u.tenant_id=? LIMIT 1
  `).bind(id,auth.tenant.id).first();
  const user = publicUser(row);
  await audit(context,{tenantId:auth.tenant.id,userId:auth.user.id},'workspace.user.create','user',id,null,{...user,password:'[REDACTED]'});
  return json({ok:true,user},201);
}
