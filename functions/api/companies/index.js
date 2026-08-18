import { assertSameOrigin, audit, json, randomId, readJson, requireAuth } from '../../_lib/auth.js';

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

function cleanString(value, max = 255) {
  return String(value ?? '').trim().slice(0, max);
}

function parsePayload(body) {
  const legalName = cleanString(body?.legalName, 240);
  if (!legalName) return { error: 'company_name_required' };
  const score = Math.max(0, Math.min(100, Number(body?.score ?? 0)));
  return {
    value: {
      legalName,
      country: cleanString(body?.country, 8).toUpperCase(),
      city: cleanString(body?.city, 120),
      type: cleanString(body?.type, 80) || 'Other',
      industry: cleanString(body?.industry, 160),
      score: Number.isFinite(score) ? score : 0,
      stage: cleanString(body?.stage, 80) || 'New',
      website: cleanString(body?.website, 500),
      source: cleanString(body?.source, 120) || 'Manual'
    }
  };
}

export async function onRequestGet(context) {
  const { response, auth } = await requireAuth(context, 'crm.companies.read');
  if (response) return response;
  const result = await context.env.DB.prepare(`
    SELECT c.*, u.display_name AS owner_display_name,
      (SELECT COUNT(*) FROM contacts ct WHERE ct.company_id = c.id AND ct.tenant_id = c.tenant_id) AS contact_count
    FROM companies c
    LEFT JOIN users u ON u.id = c.owner_user_id AND u.tenant_id = c.tenant_id
    WHERE c.tenant_id = ?
    ORDER BY datetime(c.updated_at) DESC, c.legal_name ASC
    LIMIT 1000
  `).bind(auth.tenant.id).all();
  return json({ ok: true, companies: (result.results || []).map(normalizeCompany) });
}

export async function onRequestPost(context) {
  const originError = assertSameOrigin(context.request);
  if (originError) return originError;
  const { response, auth } = await requireAuth(context, 'crm.companies.write');
  if (response) return response;

  let body;
  try { body = await readJson(context.request); }
  catch (_) { return json({ ok: false, error: 'invalid_json' }, 400); }
  const parsed = parsePayload(body);
  if (parsed.error) return json({ ok: false, error: parsed.error }, 400);

  const id = cleanString(body?.id, 120) || randomId('co');
  const now = new Date().toISOString();
  const c = parsed.value;
  try {
    await context.env.DB.prepare(`
      INSERT INTO companies(
        id, tenant_id, legal_name, website, country_code, city, company_type, industry,
        lead_score, stage, owner_user_id, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, auth.tenant.id, c.legalName, c.website || null, c.country || null, c.city || null,
      c.type || null, c.industry || null, c.score, c.stage, auth.user.id, c.source, now, now
    ).run();
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('UNIQUE') || message.includes('PRIMARY KEY')) return json({ ok: false, error: 'company_id_conflict' }, 409);
    return json({ ok: false, error: 'company_create_failed' }, 500);
  }

  const row = await context.env.DB.prepare(`
    SELECT c.*, u.display_name AS owner_display_name, 0 AS contact_count
    FROM companies c LEFT JOIN users u ON u.id = c.owner_user_id
    WHERE c.id = ? AND c.tenant_id = ? LIMIT 1
  `).bind(id, auth.tenant.id).first();
  await audit(context, { tenantId: auth.tenant.id, userId: auth.user.id }, 'company.create', 'company', id, null, normalizeCompany(row));
  return json({ ok: true, company: normalizeCompany(row) }, 201);
}
