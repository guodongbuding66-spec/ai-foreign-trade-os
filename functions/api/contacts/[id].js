import { assertSameOrigin, audit, json, readJson, requireAuth } from '../../_lib/auth.js';
import { clean, dbError, normalizeContact, requireTenantEntity } from '../../_lib/masterdata.js';

function parse(body) {
  const companyId = clean(body?.companyId, 120); const name = clean(body?.name, 180);
  if (!companyId) return {error:'company_required'}; if (!name) return {error:'contact_name_required'};
  return {value:{companyId,name,title:clean(body?.title,160),department:clean(body?.department,120),seniority:clean(body?.seniority,80),email:clean(body?.email,254).toLowerCase(),emailStatus:clean(body?.emailStatus,40)||'unknown',phone:clean(body?.phone,80),whatsapp:clean(body?.whatsapp,80),linkedin:clean(body?.linkedin,500),language:clean(body?.language,32),timezone:clean(body?.timezone,80)}};
}

async function getRow(context, id, tenantId) {
  return context.env.DB.prepare(`SELECT ct.*, u.display_name AS owner_display_name FROM contacts ct LEFT JOIN users u ON u.id=ct.owner_user_id AND u.tenant_id=ct.tenant_id WHERE ct.id=? AND ct.tenant_id=? LIMIT 1`).bind(id, tenantId).first();
}

export async function onRequestPut(context) {
  const originError=assertSameOrigin(context.request); if(originError)return originError;
  const {response,auth}=await requireAuth(context,'crm.contacts.write'); if(response)return response;
  const id=clean(context.params?.id,120); const before=await getRow(context,id,auth.tenant.id); if(!before)return json({ok:false,error:'contact_not_found'},404);
  let body; try{body=await readJson(context.request)}catch(_){return json({ok:false,error:'invalid_json'},400)}
  const parsed=parse(body); if(parsed.error)return json({ok:false,error:parsed.error},400);
  if(!await requireTenantEntity(context.env.DB,'companies',parsed.value.companyId,auth.tenant.id))return json({ok:false,error:'company_not_found'},404);
  const c=parsed.value; const now=new Date().toISOString();
  try{await context.env.DB.prepare(`UPDATE contacts SET company_id=?,full_name=?,job_title=?,department=?,seniority=?,email=?,email_status=?,phone=?,whatsapp=?,linkedin_url=?,language=?,timezone=?,owner_user_id=?,updated_at=? WHERE id=? AND tenant_id=?`).bind(c.companyId,c.name,c.title||null,c.department||null,c.seniority||null,c.email||null,c.emailStatus,c.phone||null,c.whatsapp||null,c.linkedin||null,c.language||null,c.timezone||null,auth.user.id,now,id,auth.tenant.id).run()}catch(error){return dbError(error,'contact_update_failed')}
  const after=await getRow(context,id,auth.tenant.id); await audit(context,{tenantId:auth.tenant.id,userId:auth.user.id},'contact.update','contact',id,normalizeContact(before),normalizeContact(after));
  return json({ok:true,contact:normalizeContact(after)});
}

export async function onRequestDelete(context) {
  const originError=assertSameOrigin(context.request); if(originError)return originError;
  const {response,auth}=await requireAuth(context,'crm.contacts.write'); if(response)return response;
  const id=clean(context.params?.id,120); const row=await getRow(context,id,auth.tenant.id); if(!row)return json({ok:false,error:'contact_not_found'},404);
  try{await context.env.DB.prepare('DELETE FROM contacts WHERE id=? AND tenant_id=?').bind(id,auth.tenant.id).run()}catch(error){return dbError(error,'contact_delete_failed')}
  await audit(context,{tenantId:auth.tenant.id,userId:auth.user.id},'contact.delete','contact',id,normalizeContact(row),null); return json({ok:true,id});
}
