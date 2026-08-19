import { assertSameOrigin, audit, json, readJson, requireAuth } from '../../_lib/auth.js';
import { aiProviderErrorJson, runStructuredAI } from '../../_lib/ai-gateway.js';
import { aiCredentialsSchemaError, buildUserAIEnv } from '../../_lib/ai-credentials.js';
import { parseLCText } from '../../_lib/lc.js';

const docSchema={type:'object',additionalProperties:false,properties:{documentType:{type:'string'},description:{type:'string'},originals:{type:'integer'},copies:{type:'integer'},conditionText:{type:'string'}},required:['documentType','description','originals','copies','conditionText']};
const lcSchema={type:'object',additionalProperties:false,properties:{lcNo:{type:'string'},applicantName:{type:'string'},beneficiaryName:{type:'string'},currency:{type:'string'},amount:{type:'number'},issueDate:{type:'string'},expiryDate:{type:'string'},presentationPlace:{type:'string'},latestShipmentDate:{type:'string'},partialShipment:{type:'string'},transshipment:{type:'string'},goodsDescription:{type:'string'},pol:{type:'string'},pod:{type:'string'},presentationPeriod:{type:'string'},additionalConditions:{type:'string'},requiredDocuments:{type:'array',items:docSchema}},required:['lcNo','applicantName','beneficiaryName','currency','amount','issueDate','expiryDate','presentationPlace','latestShipmentDate','partialShipment','transshipment','goodsDescription','pol','pod','presentationPeriod','additionalConditions','requiredDocuments']};

const clean=(v,n=120000)=>String(v??'').trim().slice(0,n);
function pick(ai,base,key){const v=ai?.[key];if(typeof v==='number')return Number.isFinite(v)&&v!==0?v:base[key];if(Array.isArray(v))return v.length?v:base[key];return clean(v,12000)||base[key]||''}
function merged(base,ai){
  const out={};for(const k of ['lcNo','applicantName','beneficiaryName','currency','amount','issueDate','expiryDate','presentationPlace','latestShipmentDate','partialShipment','transshipment','goodsDescription','pol','pod','presentationPeriod','additionalConditions'])out[k]=pick(ai,base,k);
  const docs=Array.isArray(ai?.requiredDocuments)&&ai.requiredDocuments.length?ai.requiredDocuments.map((d,i)=>({documentType:clean(d.documentType,60).toUpperCase()||'OTHER',description:clean(d.description,5000),originals:Math.max(0,Number(d.originals||0)),copies:Math.max(0,Number(d.copies||0)),conditions:{text:clean(d.conditionText,5000),source:'ai'},sortOrder:i})):base.requiredDocuments;
  return{...out,requiredDocuments:docs,rawTerms:base.rawTerms};
}

async function enforceLimit(context,auth){const limit=Math.max(1,Math.min(500,Number(context.env.AI_LC_DAILY_LIMIT||60)));const since=new Date(Date.now()-86400000).toISOString();const row=await context.env.DB.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE tenant_id=? AND user_id=? AND action='ai.lc.parse' AND created_at>=?").bind(auth.tenant.id,auth.user.id,since).first();return Number(row?.count||0)>=limit?json({ok:false,error:'ai_daily_limit_reached',limit},429):null}

export async function onRequestPost(context){
  const originError=assertSameOrigin(context.request);if(originError)return originError;
  const {response,auth}=await requireAuth(context,'ai.use');if(response)return response;
  let body;try{body=await readJson(context.request)}catch{return json({ok:false,error:'invalid_json'},400)}
  const rawText=clean(body?.rawText,120000);if(rawText.length<20)return json({ok:false,error:'lc_text_required'},400);
  const deterministic=parseLCText(rawText);if(body?.useAI===false)return json({ok:true,mode:'deterministic',parsed:deterministic,provider:null,model:null});
  const limitError=await enforceLimit(context,auth);if(limitError)return limitError;
  let userAI;try{userAI=await buildUserAIEnv(context,auth)}catch(error){const e=aiCredentialsSchemaError(error);return json(e,e.error==='ai_credentials_schema_not_ready'?503:500)}
  const prompt=[
    'Extract the documentary letter of credit exactly from the supplied source text. Do not invent missing values.',
    'Use empty string, 0, or "unknown" when the source does not state a value. Dates must be YYYY-MM-DD only when the date can be determined from the source.',
    'For partialShipment and transshipment, normalize only to "allowed", "not allowed", or "unknown" when possible.',
    'For requiredDocuments, preserve each requested document separately. documentType should use CI, PL, BL, AWB, SEA_WAYBILL, INSURANCE, COO, INSPECTION, BENEFICIARY_CERT, or OTHER when clear.',
    'The deterministic SWIFT extraction below is a hint from the same source, not an external fact. Correct it only when the source text clearly supports the correction.',
    `Deterministic extraction: ${JSON.stringify({...deterministic,rawTerms:undefined})}`,
    `L/C source text:\n${rawText}`
  ].join('\n\n');
  try{
    const result=await runStructuredAI(userAI.env,{task:'draft',providerId:String(body?.providerId||''),schema:lcSchema,maxTokens:4200,system:'You are a documentary-credit extraction engine. Extract only what is evidenced by the L/C text. Never add legal conclusions, current UCP rules, or assumptions.',prompt});
    const parsed=merged(deterministic,result.data),credentialScope=userAI.personalIds.has(result.provider.id)?'personal':'workspace';parsed.rawTerms={...(parsed.rawTerms||{}),aiExtraction:{provider:result.provider.id,model:result.model,credentialScope,parsedAt:new Date().toISOString()}};
    await audit(context,{tenantId:auth.tenant.id,userId:auth.user.id},'ai.lc.parse','letter_of_credit',null,null,{provider:result.provider.id,model:result.model,credentialScope,lcNo:parsed.lcNo||null,requiredDocuments:parsed.requiredDocuments.length});
    return json({ok:true,mode:'ai+deterministic',parsed,provider:result.provider.id,providerName:result.provider.name,model:result.model,credentialScope,usage:result.usage||null});
  }catch(error){const e=aiProviderErrorJson(error);return json({ok:true,mode:'deterministic-fallback',parsed:deterministic,provider:null,model:null,aiError:e.body},200)}
}
