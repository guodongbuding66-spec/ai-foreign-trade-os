import { assertSameOrigin, audit, json, readJson, requireAuth } from '../../_lib/auth.js';
import { createOpenAIResponse, extractWebSources, openAIStatus, parseStructuredOutput, providerErrorJson } from '../../_lib/openai.js';

const researchSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    fitScore: { type: 'integer', minimum: 0, maximum: 100 },
    confidence: { type: 'string', enum: ['low','medium','high'] },
    businessModel: { type: 'string' },
    marketPosition: { type: 'string' },
    signals: { type: 'array', items: { type: 'string' } },
    painPoints: { type: 'array', items: { type: 'string' } },
    recommendedProducts: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { product: { type: 'string' }, reason: { type: 'string' } }, required: ['product','reason'] } },
    outreachAngles: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } }
  },
  required: ['summary','fitScore','confidence','businessModel','marketPosition','signals','painPoints','recommendedProducts','outreachAngles','risks']
};

async function enforceDailyLimit(context, auth) {
  const limit = Math.max(1, Math.min(500, Number(context.env.AI_RESEARCH_DAILY_LIMIT || 30)));
  const since = new Date(Date.now() - 86400000).toISOString();
  const row = await context.env.DB.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE tenant_id=? AND user_id=? AND action='ai.research' AND created_at>=?").bind(auth.tenant.id, auth.user.id, since).first();
  if (Number(row?.count || 0) >= limit) return json({ ok: false, error: 'ai_daily_limit_reached', limit }, 429);
  return null;
}

export async function onRequestPost(context) {
  const originError = assertSameOrigin(context.request); if (originError) return originError;
  const { response, auth } = await requireAuth(context, 'ai.research.use'); if (response) return response;
  const limitError = await enforceDailyLimit(context, auth); if (limitError) return limitError;
  let body; try { body = await readJson(context.request); } catch (_) { return json({ ok:false, error:'invalid_json' },400); }
  const tenantId = auth.tenant.id;
  const leadId = String(body?.leadId || '').trim();
  const companyId = String(body?.companyId || '').trim();
  const productId = String(body?.productId || '').trim();
  let lead = null, company = null, product = null;
  if (leadId) lead = await context.env.DB.prepare('SELECT * FROM leads WHERE id=? AND tenant_id=? LIMIT 1').bind(leadId, tenantId).first();
  const resolvedCompanyId = companyId || lead?.company_id || '';
  if (resolvedCompanyId) company = await context.env.DB.prepare('SELECT * FROM companies WHERE id=? AND tenant_id=? LIMIT 1').bind(resolvedCompanyId, tenantId).first();
  if (productId) product = await context.env.DB.prepare('SELECT * FROM products WHERE id=? AND tenant_id=? LIMIT 1').bind(productId, tenantId).first();
  const identity = {
    companyName: lead?.company_name || company?.legal_name || '',
    domain: lead?.domain || company?.domain || '',
    website: company?.website || lead?.source_url || '',
    country: lead?.country_code || company?.country_code || '',
    customerType: company?.company_type || '',
    industry: company?.industry || '',
    contactName: lead?.contact_name || '',
    contactTitle: lead?.contact_title || ''
  };
  if (!identity.companyName && !identity.domain && !identity.website) return json({ ok:false, error:'research_target_required' },400);
  const productContext = product ? { name:product.name, category:product.category, series:product.series, material:product.material, market:product.market } : null;
  const language = String(body?.language || 'en').slice(0,20);
  const prompt = [
    'Research this B2B foreign-trade prospect using current public web sources.',
    'Only state factual claims that are supported by sources you actually found. Clearly separate inference from fact. Do not invent revenue, employees, buyers, emails, phone numbers, certifications, imports, or purchasing activity.',
    'Evaluate fit for an outdoor home-and-garden supplier. Focus on company business model, channels, product assortment, target market, likely procurement needs, growth/commercial signals, potential pain points, and concrete outreach angles.',
    `Return the structured result in language code: ${language}.`,
    `Prospect: ${JSON.stringify(identity)}`,
    productContext ? `Optional product to evaluate: ${JSON.stringify(productContext)}` : 'No specific product was selected; recommend suitable product categories only when supported by the prospect profile.'
  ].join('\n\n');
  const ai = openAIStatus(context.env);
  try {
    const raw = await createOpenAIResponse(context.env, {
      model: ai.researchModel,
      tools: [{ type:'web_search', search_context_size:'medium' }],
      tool_choice: 'auto',
      include: ['web_search_call.action.sources'],
      input: [
        { role:'system', content:'You are a rigorous B2B customer research analyst for international trade. Evidence quality is more important than completeness.' },
        { role:'user', content:prompt }
      ],
      max_output_tokens: 2600,
      text: { format: { type:'json_schema', name:'foreign_trade_customer_research', strict:true, schema:researchSchema } }
    });
    const research = parseStructuredOutput(raw);
    const sources = extractWebSources(raw);
    const now = new Date().toISOString();
    if (lead) {
      let oldEvidence = []; try { oldEvidence = JSON.parse(lead.source_evidence_json || '[]'); } catch (_) {}
      const existingUrls = new Set(oldEvidence.map(x=>x?.url).filter(Boolean));
      const sourceEvidence = sources.filter(x=>!existingUrls.has(x.url)).map(x=>({ type:'web', provider:'openai_web_search', title:x.title, url:x.url, researchedAt:now }));
      const researchEvidence = { type:'ai_research', provider:'openai', model:ai.researchModel, researchedAt:now, fitScore:research.fitScore, confidence:research.confidence, summary:String(research.summary||'').slice(0,1200) };
      const merged = [...oldEvidence.filter(x=>x?.type!=='ai_research'), ...sourceEvidence, researchEvidence].slice(-30);
      await context.env.DB.prepare('UPDATE leads SET score=?, source_evidence_json=?, updated_at=? WHERE id=? AND tenant_id=?').bind(Math.max(0,Math.min(100,Number(research.fitScore||0))),JSON.stringify(merged),now,lead.id,tenantId).run();
    }
    await audit(context,{tenantId,userId:auth.user.id},'ai.research',lead?'lead':'company',lead?.id||resolvedCompanyId||null,null,{provider:'openai',model:ai.researchModel,fitScore:research.fitScore,confidence:research.confidence,sourceCount:sources.length});
    return json({ ok:true, provider:'openai', model:ai.researchModel, research, sources, usage:raw?.usage || null });
  } catch (error) {
    const e = providerErrorJson(error); return json(e.body,e.status);
  }
}
