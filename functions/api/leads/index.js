import { assertSameOrigin, audit, json, randomId, readJson, requireAuth } from '../../_lib/auth.js';
import { normalizeLead, parseLeadPayload } from '../../_lib/leaddata.js';

export async function onRequestGet(context) {
  const { response, auth } = await requireAuth(context, 'lead.read');
  if (response) return response;
  try {
    const result = await context.env.DB.prepare(`
      SELECT l.*, u.display_name AS owner_display_name
      FROM leads l
      LEFT JOIN users u ON u.id=l.owner_user_id AND u.tenant_id=l.tenant_id
      WHERE l.tenant_id=?
      ORDER BY l.score DESC, datetime(l.updated_at) DESC
      LIMIT 5000
    `).bind(auth.tenant.id).all();
    return json({ ok: true, leads: (result.results || []).map(normalizeLead) });
  } catch (error) {
    return json({ ok: false, error: 'lead_list_failed', detail: String(error?.message || error).slice(0, 180) }, 500);
  }
}

export async function onRequestPost(context) {
  const originError = assertSameOrigin(context.request);
  if (originError) return originError;
  const { response, auth } = await requireAuth(context, 'lead.write');
  if (response) return response;
  let body;
  try { body = await readJson(context.request); }
  catch (_) { return json({ ok: false, error: 'invalid_json' }, 400); }
  const parsed = parseLeadPayload(body);
  if (parsed.error) return json({ ok: false, error: parsed.error }, 400);
  const id = String(body?.id || '').trim().slice(0, 120) || randomId('lead');
  const now = new Date().toISOString();
  const v = parsed.value;
  try {
    await context.env.DB.prepare(`
      INSERT INTO leads(
        id, tenant_id, source, source_url, company_name, domain, country_code,
        contact_name, contact_title, email, phone, score, status,
        source_evidence_json, owner_user_id, company_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).bind(
      id, auth.tenant.id, v.source, v.sourceUrl || null, v.companyName || null,
      v.domain || null, v.country || null, v.contactName || null, v.contactTitle || null,
      v.email || null, v.phone || null, v.score, v.status, JSON.stringify(v.evidence),
      auth.user.id, now, now
    ).run();
    const row = await context.env.DB.prepare(`
      SELECT l.*, u.display_name AS owner_display_name
      FROM leads l LEFT JOIN users u ON u.id=l.owner_user_id AND u.tenant_id=l.tenant_id
      WHERE l.id=? AND l.tenant_id=? LIMIT 1
    `).bind(id, auth.tenant.id).first();
    const normalized = normalizeLead(row);
    await audit(context, { tenantId: auth.tenant.id, userId: auth.user.id }, 'lead.create', 'lead', id, null, normalized);
    return json({ ok: true, lead: normalized }, 201);
  } catch (error) {
    const detail = String(error?.message || error).slice(0, 180);
    return json({ ok: false, error: 'lead_create_failed', detail }, 500);
  }
}
