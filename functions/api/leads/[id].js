import { assertSameOrigin, audit, json, readJson, requireAuth } from '../../_lib/auth.js';
import { normalizeLead, parseLeadPayload } from '../../_lib/leaddata.js';

async function getLead(context, tenantId, id) {
  return context.env.DB.prepare(`
    SELECT l.*,u.display_name AS owner_display_name
    FROM leads l LEFT JOIN users u ON u.id=l.owner_user_id AND u.tenant_id=l.tenant_id
    WHERE l.id=? AND l.tenant_id=? LIMIT 1
  `).bind(id, tenantId).first();
}

export async function onRequestPut(context) {
  const originError = assertSameOrigin(context.request);
  if (originError) return originError;
  const { response, auth } = await requireAuth(context, 'lead.write');
  if (response) return response;
  const id = String(context.params?.id || '').slice(0, 120);
  const before = await getLead(context, auth.tenant.id, id);
  if (!before) return json({ ok: false, error: 'lead_not_found' }, 404);
  let body;
  try { body = await readJson(context.request); }
  catch (_) { return json({ ok: false, error: 'invalid_json' }, 400); }
  const parsed = parseLeadPayload(body);
  if (parsed.error) return json({ ok: false, error: parsed.error }, 400);
  const v = parsed.value;
  const now = new Date().toISOString();
  try {
    await context.env.DB.prepare(`
      UPDATE leads SET source=?,source_url=?,company_name=?,domain=?,country_code=?,contact_name=?,contact_title=?,
        email=?,phone=?,score=?,status=?,source_evidence_json=?,updated_at=?
      WHERE id=? AND tenant_id=?
    `).bind(
      v.source,v.sourceUrl||null,v.companyName||null,v.domain||null,v.country||null,v.contactName||null,
      v.contactTitle||null,v.email||null,v.phone||null,v.score,v.status,JSON.stringify(v.evidence),now,id,auth.tenant.id
    ).run();
    const after = await getLead(context, auth.tenant.id, id);
    await audit(context,{tenantId:auth.tenant.id,userId:auth.user.id},'lead.update','lead',id,normalizeLead(before),normalizeLead(after));
    return json({ok:true,lead:normalizeLead(after)});
  } catch(error){return json({ok:false,error:'lead_update_failed',detail:String(error?.message||error).slice(0,180)},500)}
}

export async function onRequestDelete(context) {
  const originError = assertSameOrigin(context.request);
  if (originError) return originError;
  const { response, auth } = await requireAuth(context, 'lead.write');
  if (response) return response;
  const id = String(context.params?.id || '').slice(0, 120);
  const before = await getLead(context, auth.tenant.id, id);
  if (!before) return json({ ok: false, error: 'lead_not_found' }, 404);
  try {
    await context.env.DB.prepare('DELETE FROM leads WHERE id=? AND tenant_id=?').bind(id,auth.tenant.id).run();
    await audit(context,{tenantId:auth.tenant.id,userId:auth.user.id},'lead.delete','lead',id,normalizeLead(before),null);
    return json({ok:true});
  } catch(error){return json({ok:false,error:'lead_delete_failed',detail:String(error?.message||error).slice(0,180)},500)}
}
