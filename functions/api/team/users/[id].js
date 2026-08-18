import {
  assertSameOrigin, audit, json, readJson, requireAuth, validatePassword
} from '../../../_lib/auth.js';
import { hashPasswordForFreePlan } from '../../../_lib/password-free.js';
import { ensureTeamRoles, getRole, publicUser } from '../../../_lib/team.js';

const ALLOWED_ROLES = new Set(['admin','sales','viewer']);

async function readUser(DB, tenantId, id) {
  return DB.prepare(`
    SELECT u.*,r.role_key,r.name role_name FROM users u
    LEFT JOIN user_roles ur ON ur.user_id=u.id
    LEFT JOIN roles r ON r.id=ur.role_id AND r.tenant_id=u.tenant_id
    WHERE u.id=? AND u.tenant_id=? LIMIT 1
  `).bind(id,tenantId).first();
}

export async function onRequestPatch(context) {
  const originError = assertSameOrigin(context.request); if (originError) return originError;
  const { response, auth } = await requireAuth(context, 'workspace.users.manage'); if (response) return response;
  const id = String(context.params?.id || '').trim();
  let body; try { body = await readJson(context.request); } catch (_) { return json({ok:false,error:'invalid_json'},400); }
  await ensureTeamRoles(context.env.DB, auth.tenant.id);
  const beforeRow = await readUser(context.env.DB, auth.tenant.id, id);
  if (!beforeRow) return json({ok:false,error:'user_not_found'},404);
  const before = publicUser(beforeRow);

  const requestedRole = body?.roleKey == null ? before.roleKey : String(body.roleKey).trim().toLowerCase();
  const requestedStatus = body?.status == null ? before.status : String(body.status).trim().toLowerCase();
  const displayName = body?.displayName == null ? before.displayName : String(body.displayName).trim().slice(0,120);
  const newPassword = body?.password == null ? '' : String(body.password);

  if (!displayName) return json({ok:false,error:'display_name_required'},400);
  if (!['active','disabled'].includes(requestedStatus)) return json({ok:false,error:'invalid_status'},400);
  if (before.roleKey === 'owner' && (requestedRole !== 'owner' || requestedStatus !== before.status || newPassword)) {
    return json({ok:false,error:'workspace_owner_protected'},409);
  }
  if (id === auth.user.id && (requestedRole !== before.roleKey || requestedStatus !== before.status || newPassword)) {
    return json({ok:false,error:'cannot_change_own_role_status_or_password_here'},409);
  }
  if (requestedRole !== 'owner' && !ALLOWED_ROLES.has(requestedRole)) return json({ok:false,error:'role_not_allowed'},400);
  if (newPassword) {
    const passwordError = validatePassword(newPassword); if (passwordError) return json({ok:false,error:passwordError},400);
  }

  let role = null;
  if (requestedRole !== before.roleKey) {
    role = await getRole(context.env.DB, auth.tenant.id, requestedRole);
    if (!role) return json({ok:false,error:'role_not_found'},404);
  }
  const now = new Date().toISOString();
  const statements = [context.env.DB.prepare('UPDATE users SET display_name=?,status=?,updated_at=? WHERE id=? AND tenant_id=?').bind(displayName,requestedStatus,now,id,auth.tenant.id)];
  if (role) {
    statements.push(context.env.DB.prepare('DELETE FROM user_roles WHERE user_id=?').bind(id));
    statements.push(context.env.DB.prepare('INSERT INTO user_roles(user_id,role_id,created_at) VALUES(?,?,?)').bind(id,role.id,now));
  }
  if (newPassword) {
    const credential = await hashPasswordForFreePlan(newPassword, context.env.SESSION_SECRET);
    statements.push(context.env.DB.prepare(`
      INSERT INTO user_credentials(user_id,password_hash,password_salt,password_iterations,password_algorithm,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash,password_salt=excluded.password_salt,
        password_iterations=excluded.password_iterations,password_algorithm=excluded.password_algorithm,updated_at=excluded.updated_at
    `).bind(id,credential.hash,credential.salt,credential.iterations,credential.algorithm,now,now));
  }
  if (requestedStatus === 'disabled' || newPassword) {
    statements.push(context.env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').bind(now,id));
  }
  try { await context.env.DB.batch(statements); }
  catch (error) { return json({ok:false,error:'member_update_failed',detail:String(error?.message||error).slice(0,180)},500); }

  const afterRow = await readUser(context.env.DB, auth.tenant.id, id);
  const after = publicUser(afterRow);
  await audit(context,{tenantId:auth.tenant.id,userId:auth.user.id},'workspace.user.update','user',id,before,{...after,passwordReset:Boolean(newPassword)});
  return json({ok:true,user:after});
}
