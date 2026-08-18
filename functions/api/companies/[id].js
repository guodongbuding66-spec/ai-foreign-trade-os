import { assertSameOrigin, audit, json, readJson, requireAuth } from '../../_lib/auth.js';

function cleanString(value, max = 255) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeCompany(row) {
  return {
    id: row.id,
    legalName: row.legal_name,
    country: row.country_code || '',
    city: row.city || '',
    type: row.company_type || 'Other',
    industry: row.industry || '',
    score: Number(row.lead_score || 0),
    stage: row.stage || 'New',
    website: row.website || '',
    source: row.source || '',
    ownerUserId: row.owner_user_id || null,
    owner: row.owner_display_name || '',
    contactCount: Number(row.contact_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getCompany(context, tenantId, id) {
  return context.env.DB.prepare(`
    SELECT c.*, u.display_name AS owner_display_name,
      (SELECT COUNT(*) FROM contacts ct WHERE ct.company_id = c.id AND ct.tenant_id = c.tenant_id) AS contact_count
    FROM companies c
    LEFT JOIN users u ON u.id = c.owner_user_id AND u.tenant_id = c.tenant_id
    WHERE c.id = ? AND c.tenant_id = ? LIMIT 1
  `).bind(id, tenantId).first();
}

export async function onRequestPut(context) {
  const originError = assertSameOrigin(context.request);
  if (originError) return originError;
  const { response, auth } = await requireAuth(context, 'crm.companies.write');
  if (response) return response;
  const id = cleanString(context.params?.id, 120);
  const beforeRow = await getCompany(context, auth.tenant.id, id);
  if (!beforeRow) return json({ ok: false, error: 'company_not_found' }, 404);

  let body;
  try { body = await readJson(context.request); }
  catch (_) { return json({ ok: false, error: 'invalid_json' }, 400); }
  const legalName = cleanString(body?.legalName, 240);
  if (!legalName) return json({ ok: false, error: 'company_name_required' }, 400);
  const rawScore = Number(body?.score ?? 0);
  const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : 0;
  const now = new Date().toISOString();

  await context.env.DB.prepare(`
    UPDATE companies SET
      legal_name = ?, website = ?, country_code = ?, city = ?, company_type = ?, industry = ?,
      lead_score = ?, stage = ?, source = ?, updated_at = ?
    WHERE id = ? AND tenant_id = ?
  `).bind(
    legalName,
    cleanString(body?.website, 500) || null,
    cleanString(body?.country, 8).toUpperCase() || null,
    cleanString(body?.city, 120) || null,
    cleanString(body?.type, 80) || 'Other',
    cleanString(body?.industry, 160) || null,
    score,
    cleanString(body?.stage, 80) || 'New',
    cleanString(body?.source, 120) || 'Manual',
    now, id, auth.tenant.id
  ).run();

  const afterRow = await getCompany(context, auth.tenant.id, id);
  const before = normalizeCompany(beforeRow);
  const after = normalizeCompany(afterRow);
  await audit(context, { tenantId: auth.tenant.id, userId: auth.user.id }, 'company.update', 'company', id, before, after);
  return json({ ok: true, company: after });
}

export async function onRequestDelete(context) {
  const originError = assertSameOrigin(context.request);
  if (originError) return originError;
  const { response, auth } = await requireAuth(context, 'crm.companies.delete');
  if (response) return response;
  const id = cleanString(context.params?.id, 120);
  const beforeRow = await getCompany(context, auth.tenant.id, id);
  if (!beforeRow) return json({ ok: false, error: 'company_not_found' }, 404);

  const refs = await context.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM contacts WHERE tenant_id = ? AND company_id = ?) +
      (SELECT COUNT(*) FROM opportunities WHERE tenant_id = ? AND company_id = ?) +
      (SELECT COUNT(*) FROM quotes WHERE tenant_id = ? AND company_id = ?) +
      (SELECT COUNT(*) FROM leads WHERE tenant_id = ? AND company_id = ?) +
      (SELECT COUNT(*) FROM documents WHERE tenant_id = ? AND company_id = ?) AS count
  `).bind(
    auth.tenant.id, id, auth.tenant.id, id, auth.tenant.id, id,
    auth.tenant.id, id, auth.tenant.id, id
  ).first();
  if (Number(refs?.count || 0) > 0) {
    return json({ ok: false, error: 'company_has_references', references: Number(refs.count) }, 409);
  }

  await context.env.DB.prepare('DELETE FROM companies WHERE id = ? AND tenant_id = ?')
    .bind(id, auth.tenant.id).run();
  await audit(context, { tenantId: auth.tenant.id, userId: auth.user.id }, 'company.delete', 'company', id, normalizeCompany(beforeRow), null);
  return json({ ok: true, deletedId: id });
}
