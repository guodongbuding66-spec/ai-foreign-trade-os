import { assertSameOrigin, audit, json, randomId, readJson, requireAuth } from '../../_lib/auth.js';
import { clean, dbError, normalizeContact, requireTenantEntity } from '../../_lib/masterdata.js';

function parse(body) {
  const companyId = clean(body?.companyId, 120);
  const name = clean(body?.name, 180);
  if (!companyId) return { error: 'company_required' };
  if (!name) return { error: 'contact_name_required' };
  return { value: {
    companyId, name,
    title: clean(body?.title, 160), department: clean(body?.department, 120), seniority: clean(body?.seniority, 80),
    email: clean(body?.email, 254).toLowerCase(), emailStatus: clean(body?.emailStatus, 40) || 'unknown',
    phone: clean(body?.phone, 80), whatsapp: clean(body?.whatsapp, 80), linkedin: clean(body?.linkedin, 500),
    language: clean(body?.language, 32), timezone: clean(body?.timezone, 80)
  }};
}

export async function onRequestGet(context) {
  const { response, auth } = await requireAuth(context, 'crm.contacts.read');
  if (response) return response;
  const result = await context.env.DB.prepare(`
    SELECT ct.*, u.display_name AS owner_display_name
    FROM contacts ct
    LEFT JOIN users u ON u.id = ct.owner_user_id AND u.tenant_id = ct.tenant_id
    WHERE ct.tenant_id = ? ORDER BY datetime(ct.updated_at) DESC, ct.full_name ASC LIMIT 2000
  `).bind(auth.tenant.id).all();
  return json({ ok: true, contacts: (result.results || []).map(normalizeContact) });
}

export async function onRequestPost(context) {
  const originError = assertSameOrigin(context.request); if (originError) return originError;
  const { response, auth } = await requireAuth(context, 'crm.contacts.write'); if (response) return response;
  let body; try { body = await readJson(context.request); } catch (_) { return json({ ok:false, error:'invalid_json' }, 400); }
  const parsed = parse(body); if (parsed.error) return json({ ok:false, error:parsed.error }, 400);
  if (!await requireTenantEntity(context.env.DB, 'companies', parsed.value.companyId, auth.tenant.id)) return json({ ok:false, error:'company_not_found' }, 404);
  const id = clean(body?.id, 120) || randomId('ct'); const now = new Date().toISOString(); const c = parsed.value;
  try {
    await context.env.DB.prepare(`
      INSERT INTO contacts(id, tenant_id, company_id, full_name, job_title, department, seniority, email, email_status,
        phone, whatsapp, linkedin_url, language, timezone, owner_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, auth.tenant.id, c.companyId, c.name, c.title||null, c.department||null, c.seniority||null,
      c.email||null, c.emailStatus, c.phone||null, c.whatsapp||null, c.linkedin||null, c.language||null,
      c.timezone||null, auth.user.id, now, now).run();
  } catch (error) { return dbError(error, 'contact_create_failed'); }
  const row = await context.env.DB.prepare(`SELECT ct.*, u.display_name AS owner_display_name FROM contacts ct LEFT JOIN users u ON u.id=ct.owner_user_id WHERE ct.id=? AND ct.tenant_id=?`).bind(id, auth.tenant.id).first();
  const value = normalizeContact(row);
  await audit(context, {tenantId:auth.tenant.id,userId:auth.user.id}, 'contact.create', 'contact', id, null, value);
  return json({ok:true, contact:value}, 201);
}
