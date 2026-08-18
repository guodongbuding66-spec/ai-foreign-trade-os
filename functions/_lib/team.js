import { randomId } from './auth.js';

export const TEAM_ROLE_PRESETS = {
  admin: {
    name: 'Workspace Admin',
    permissions: ['*']
  },
  sales: {
    name: 'Sales & Trade',
    permissions: [
      'crm.*','lead.*','product.*','quotes.*','orders.*','documents.*',
      'shipments.*','outreach.*','ai.*','container.*','automation.*'
    ]
  },
  viewer: {
    name: 'Read Only',
    permissions: [
      'crm.companies.read','crm.contacts.read','crm.opportunities.read','crm.tasks.read',
      'lead.read','product.catalog.read','product.skus.read','quotes.read','orders.read',
      'documents.read','shipments.read','outreach.read','container.read','automation.read','ai.use'
    ]
  }
};

export async function ensureTeamRoles(DB, tenantId) {
  const now = new Date().toISOString();
  const existing = await DB.prepare('SELECT role_key FROM roles WHERE tenant_id=?').bind(tenantId).all();
  const keys = new Set((existing.results || []).map(r => r.role_key));
  const statements = [];
  for (const [roleKey, preset] of Object.entries(TEAM_ROLE_PRESETS)) {
    if (keys.has(roleKey)) continue;
    statements.push(DB.prepare(`
      INSERT INTO roles(id, tenant_id, role_key, name, permissions_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(randomId('rol'), tenantId, roleKey, preset.name, JSON.stringify(preset.permissions), now, now));
  }
  if (statements.length) await DB.batch(statements);
}

export async function getRole(DB, tenantId, roleKey) {
  return DB.prepare('SELECT * FROM roles WHERE tenant_id=? AND role_key=? LIMIT 1').bind(tenantId, roleKey).first();
}

export function publicRole(row) {
  let permissions = [];
  try { permissions = JSON.parse(row?.permissions_json || '[]'); } catch (_) {}
  return { id: row.id, key: row.role_key, name: row.name, permissions };
}

export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    locale: row.locale,
    timezone: row.timezone,
    roleKey: row.role_key || '',
    roleName: row.role_name || '',
    lastLoginAt: row.last_login_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
