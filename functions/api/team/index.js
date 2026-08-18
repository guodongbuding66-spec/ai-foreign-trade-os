import { json, requireAuth } from '../../_lib/auth.js';
import { ensureTeamRoles, publicRole, publicUser } from '../../_lib/team.js';

export async function onRequestGet(context) {
  const { response, auth } = await requireAuth(context, 'workspace.users.manage');
  if (response) return response;
  await ensureTeamRoles(context.env.DB, auth.tenant.id);

  const [usersResult, rolesResult] = await context.env.DB.batch([
    context.env.DB.prepare(`
      SELECT u.*, r.role_key, r.name AS role_name
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id=u.id
      LEFT JOIN roles r ON r.id=ur.role_id AND r.tenant_id=u.tenant_id
      WHERE u.tenant_id=?
      ORDER BY CASE WHEN r.role_key='owner' THEN 0 ELSE 1 END, u.display_name, u.email
    `).bind(auth.tenant.id),
    context.env.DB.prepare(`
      SELECT * FROM roles
      WHERE tenant_id=? AND role_key IN ('owner','admin','sales','viewer')
      ORDER BY CASE role_key WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'sales' THEN 2 ELSE 3 END
    `).bind(auth.tenant.id)
  ]);

  const seen = new Set();
  const users = [];
  for (const row of usersResult.results || []) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    users.push(publicUser(row));
  }
  return json({
    ok: true,
    users,
    roles: (rolesResult.results || []).map(publicRole),
    currentUserId: auth.user.id
  });
}
