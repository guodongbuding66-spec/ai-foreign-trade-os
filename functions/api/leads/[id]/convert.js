import { assertSameOrigin, audit, json, randomId, requireAuth } from '../../../_lib/auth.js';
import { normalizeLead, normalizeDomain } from '../../../_lib/leaddata.js';

export async function onRequestPost(context) {
  const originError = assertSameOrigin(context.request);
  if (originError) return originError;
  const { response, auth } = await requireAuth(context, 'lead.convert');
  if (response) return response;
  const leadId = String(context.params?.id || '').slice(0, 120);
  const tenantId = auth.tenant.id;
  const lead = await context.env.DB.prepare('SELECT * FROM leads WHERE id=? AND tenant_id=? LIMIT 1').bind(leadId,tenantId).first();
  if (!lead) return json({ok:false,error:'lead_not_found'},404);
  if (lead.company_id) {
    const existing = await context.env.DB.prepare('SELECT id,legal_name,country_code,domain,website FROM companies WHERE id=? AND tenant_id=? LIMIT 1').bind(lead.company_id,tenantId).first();
    return json({ok:true,converted:true,reused:true,company:existing||{id:lead.company_id}});
  }

  let company = null;
  const domain = normalizeDomain(lead.domain || '');
  if (domain) {
    company = await context.env.DB.prepare('SELECT * FROM companies WHERE tenant_id=? AND lower(domain)=lower(?) LIMIT 1').bind(tenantId,domain).first();
  }
  if (!company && lead.company_name) {
    company = await context.env.DB.prepare(`
      SELECT * FROM companies WHERE tenant_id=? AND lower(trim(legal_name))=lower(trim(?)) AND coalesce(country_code,'')=coalesce(?, '') LIMIT 1
    `).bind(tenantId,lead.company_name,lead.country_code||'').first();
  }

  const now = new Date().toISOString();
  let companyId = company?.id || randomId('co');
  const contactId = (lead.contact_name || lead.email || lead.phone) ? randomId('ct') : null;
  const statements = [];
  if (!company) {
    const legalName = String(lead.company_name || lead.domain || lead.email || 'Lead Company').slice(0,240);
    statements.push(context.env.DB.prepare(`
      INSERT INTO companies(id,tenant_id,legal_name,domain,website,country_code,company_type,industry,lead_score,stage,owner_user_id,source,created_at,updated_at)
      VALUES(?,?,?,?,?,?,NULL,NULL,?,'New',?,?,?,?)
    `).bind(companyId,tenantId,legalName,domain||null,lead.source_url||null,lead.country_code||null,Number(lead.score||0),auth.user.id,lead.source||'Lead',now,now));
  }
  if (contactId) {
    const duplicateContact = lead.email ? await context.env.DB.prepare('SELECT id FROM contacts WHERE tenant_id=? AND lower(email)=lower(?) LIMIT 1').bind(tenantId,lead.email).first() : null;
    if (!duplicateContact) {
      statements.push(context.env.DB.prepare(`
        INSERT INTO contacts(id,tenant_id,company_id,full_name,job_title,email,email_status,phone,owner_user_id,created_at,updated_at)
        VALUES(?,?,?,?,?,?,'unknown',?,?,?,?)
      `).bind(contactId,tenantId,companyId,lead.contact_name||lead.email||lead.phone,lead.contact_title||null,lead.email||null,lead.phone||null,auth.user.id,now,now));
    }
  }
  statements.push(context.env.DB.prepare("UPDATE leads SET company_id=?,status='Converted',updated_at=? WHERE id=? AND tenant_id=?").bind(companyId,now,leadId,tenantId));

  try { await context.env.DB.batch(statements); }
  catch(error){return json({ok:false,error:'lead_convert_failed',detail:String(error?.message||error).slice(0,180)},500)}

  const afterLead = await context.env.DB.prepare('SELECT * FROM leads WHERE id=? AND tenant_id=? LIMIT 1').bind(leadId,tenantId).first();
  const afterCompany = await context.env.DB.prepare('SELECT * FROM companies WHERE id=? AND tenant_id=? LIMIT 1').bind(companyId,tenantId).first();
  await audit(context,{tenantId,userId:auth.user.id},'lead.convert','lead',leadId,normalizeLead(lead),normalizeLead(afterLead));
  await audit(context,{tenantId,userId:auth.user.id},company?'lead.link_existing_company':'company.create_from_lead','company',companyId,null,{id:companyId,legalName:afterCompany?.legal_name||''});
  return json({ok:true,converted:true,reused:Boolean(company),company:{id:companyId,legalName:afterCompany?.legal_name||'',country:afterCompany?.country_code||'',domain:afterCompany?.domain||''}});
}
