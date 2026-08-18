import { assertSameOrigin, audit, json, randomId, readJson, requireAuth } from '../../_lib/auth.js';
import { createOpenAIResponse, openAIStatus, parseStructuredOutput, providerErrorJson } from '../../_lib/openai.js';

const draftSchema = {
  type:'object', additionalProperties:false,
  properties:{
    subject:{type:'string'},
    body:{type:'string'},
    rationale:{type:'string'},
    personalizationFacts:{type:'array',items:{type:'string'}},
    callToAction:{type:'string'}
  },
  required:['subject','body','rationale','personalizationFacts','callToAction']
};

async function enforceDailyLimit(context, auth) {
  const limit = Math.max(1, Math.min(1000, Number(context.env.AI_DRAFT_DAILY_LIMIT || 100)));
  const since = new Date(Date.now() - 86400000).toISOString();
  const row = await context.env.DB.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE tenant_id=? AND user_id=? AND action='ai.outreach.generate' AND created_at>=?").bind(auth.tenant.id,auth.user.id,since).first();
  if (Number(row?.count || 0) >= limit) return json({ok:false,error:'ai_daily_limit_reached',limit},429);
  return null;
}

export async function onRequestPost(context) {
  const originError=assertSameOrigin(context.request);if(originError)return originError;
  const {response,auth}=await requireAuth(context,'ai.outreach.use');if(response)return response;
  const limitError=await enforceDailyLimit(context,auth);if(limitError)return limitError;
  let body;try{body=await readJson(context.request)}catch{return json({ok:false,error:'invalid_json'},400)}
  const tenantId=auth.tenant.id;
  const ids={leadId:String(body?.leadId||'').trim(),companyId:String(body?.companyId||'').trim(),contactId:String(body?.contactId||'').trim(),productId:String(body?.productId||'').trim()};
  let lead=null,company=null,contact=null,product=null;
  if(ids.leadId)lead=await context.env.DB.prepare('SELECT * FROM leads WHERE id=? AND tenant_id=? LIMIT 1').bind(ids.leadId,tenantId).first();
  ids.companyId=ids.companyId||lead?.company_id||'';
  if(ids.companyId)company=await context.env.DB.prepare('SELECT * FROM companies WHERE id=? AND tenant_id=? LIMIT 1').bind(ids.companyId,tenantId).first();
  if(ids.contactId)contact=await context.env.DB.prepare('SELECT * FROM contacts WHERE id=? AND tenant_id=? LIMIT 1').bind(ids.contactId,tenantId).first();
  if(ids.productId)product=await context.env.DB.prepare('SELECT * FROM products WHERE id=? AND tenant_id=? LIMIT 1').bind(ids.productId,tenantId).first();
  const prospect={companyName:lead?.company_name||company?.legal_name||'',domain:lead?.domain||company?.domain||'',country:lead?.country_code||company?.country_code||'',type:company?.company_type||'',industry:company?.industry||'',contactName:contact?.full_name||lead?.contact_name||'',contactTitle:contact?.job_title||lead?.contact_title||'',email:contact?.email||lead?.email||''};
  if(!prospect.companyName&&!prospect.domain)return json({ok:false,error:'outreach_target_required'},400);
  let evidence=[];try{evidence=JSON.parse(lead?.source_evidence_json||'[]')}catch{}
  const research=body?.research&&typeof body.research==='object'?body.research:null;
  const selectedProduct=product?{name:product.name,category:product.category,series:product.series,material:product.material,market:product.market}:null;
  const language=String(body?.language||contact?.language||'en').slice(0,20),tone=String(body?.tone||'professional concise').slice(0,80),purpose=String(body?.purpose||'Initial B2B introduction and qualification').slice(0,240),channel=String(body?.channel||'email').slice(0,30);
  const contextPayload={prospect,selectedProduct,research,evidence:evidence.slice(-12),purpose,channel,language,tone};
  const prompt=[
    'Create one B2B foreign-trade outreach draft from the supplied context.',
    'Do not invent facts, purchasing history, revenue, volumes, certifications, customer names, or personal details. Personalize only with facts explicitly present in the context. If evidence is thin, write a restrained category-relevance introduction instead of pretending to know more.',
    'Keep the message commercially useful, concise, natural, and easy to reply to. Avoid spammy superlatives and fake urgency. Do not claim an attachment exists unless the context says so.',
    `Language: ${language}. Tone: ${tone}. Channel: ${channel}. Purpose: ${purpose}.`,
    `Context: ${JSON.stringify(contextPayload)}`
  ].join('\n\n');
  const ai=openAIStatus(context.env);
  try{
    const raw=await createOpenAIResponse(context.env,{
      model:ai.draftModel,
      input:[{role:'system',content:'You write evidence-grounded B2B export sales outreach. Draft only; never send messages or claim actions were taken.'},{role:'user',content:prompt}],
      max_output_tokens:1800,
      text:{format:{type:'json_schema',name:'foreign_trade_outreach_draft',strict:true,schema:draftSchema}}
    });
    const generated=parseStructuredOutput(raw),now=new Date().toISOString(),id=randomId('out');
    const sourceContext={...contextPayload,rationale:generated.rationale,personalizationFacts:generated.personalizationFacts,callToAction:generated.callToAction};
    await context.env.DB.prepare(`INSERT INTO outreach_drafts(id,tenant_id,company_id,contact_id,product_id,lead_id,channel,purpose,language,tone,subject,body_text,status,provider,model,source_context_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,tenantId,ids.companyId||null,ids.contactId||null,ids.productId||null,ids.leadId||null,channel,purpose,language,tone,String(generated.subject||'').slice(0,300),String(generated.body||'').slice(0,12000),'Draft','openai',ai.draftModel,JSON.stringify(sourceContext),auth.user.id,now,now).run();
    const row=await context.env.DB.prepare('SELECT * FROM outreach_drafts WHERE id=? AND tenant_id=? LIMIT 1').bind(id,tenantId).first();
    const draft={id:row.id,companyId:row.company_id||null,contactId:row.contact_id||null,productId:row.product_id||null,leadId:row.lead_id||null,channel:row.channel,language:row.language,tone:row.tone||'',subject:row.subject||'',body:row.body_text,status:row.status,provider:row.provider,model:row.model,sourceContext,createdAt:row.created_at,updatedAt:row.updated_at};
    await audit(context,{tenantId,userId:auth.user.id},'ai.outreach.generate','outreach_draft',id,null,{provider:'openai',model:ai.draftModel,companyId:ids.companyId||null,leadId:ids.leadId||null,channel,language});
    return json({ok:true,provider:'openai',model:ai.draftModel,draft,usage:raw?.usage||null},201);
  }catch(error){const e=providerErrorJson(error);return json(e.body,e.status)}
}
