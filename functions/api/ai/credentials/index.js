import { assertSameOrigin, audit, json, randomId, readJson, requireAuth } from '../../../_lib/auth.js';
import { aiGatewayStatus } from '../../../_lib/ai-gateway.js';
import { aiCredentialsSchemaError, buildUserAIEnv, encryptAIKey, getAIUserPreferences, publicCredential, validateCredentialInput, cleanAIProviderId } from '../../../_lib/ai-credentials.js';

function safeJson(v,f=[]){try{return JSON.parse(String(v||''))}catch{return f}}
const BUILTIN_MEDIA={openai:{vision:true,pdf:true},anthropic:{vision:true,pdf:true},gemini:{vision:true,pdf:true}};
export async function onRequestGet(context){
  const {response,auth}=await requireAuth(context,'ai.use');if(response)return response;
  try{
    const state=await buildUserAIEnv(context,auth),status=aiGatewayStatus(state.env),credMap=new Map((state.credentials||[]).map(c=>[c.providerId,c])),customMap=new Map((safeJson(state.env.AI_PROVIDER_CONFIG_JSON,[])||[]).map(c=>[String(c?.id||'').toLowerCase(),c]));
    const providers=(status.providers||[]).map(p=>{const personal=state.personalIds.has(p.id),stored=credMap.get(p.id),custom=customMap.get(p.id),caps={...(p.capabilities||{}),...(BUILTIN_MEDIA[p.id]||{}),...(custom?.capabilities||{}),...(stored?.capabilities||{})};if(String(p.protocol)==='openai_chat')caps.pdf=false;return {...p,capabilities:caps,personal,workspaceConfigured:Boolean(p.configured&&!personal)}});
    return json({ok:true,masterKeyReady:state.masterKeyReady,credentials:state.credentials,preferences:state.preferences,gateway:{...status,providers}});
  }catch(error){const e=aiCredentialsSchemaError(error);return json(e,e.error==='ai_credentials_schema_not_ready'?503:500)}
}

export async function onRequestPost(context){
  const originError=assertSameOrigin(context.request);if(originError)return originError;
  const {response,auth}=await requireAuth(context,'ai.use');if(response)return response;
  if(!context.env?.AI_CREDENTIALS_MASTER_KEY)return json({ok:false,error:'ai_credentials_master_key_not_configured'},503);
  let body;try{body=await readJson(context.request)}catch{return json({ok:false,error:'invalid_json'},400)}
  const input=validateCredentialInput(body);if(input.error)return json({ok:false,error:input.error},400);
  const now=new Date().toISOString(),id=randomId('aic'),tenantId=auth.tenant.id,userId=auth.user.id;
  try{
    const encrypted=await encryptAIKey(context.env.AI_CREDENTIALS_MASTER_KEY,tenantId,userId,input.providerId,input.apiKey);
    const caps=JSON.stringify(input.capabilities||{}),last4=input.apiKey.slice(-4);
    await context.env.DB.prepare(`INSERT INTO ai_provider_credentials(id,tenant_id,user_id,provider_id,provider_name,protocol,base_url,model,capabilities_json,api_key_ciphertext,api_key_iv,api_key_last4,cipher_version,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?) ON CONFLICT(tenant_id,user_id,provider_id) DO UPDATE SET provider_name=excluded.provider_name,protocol=excluded.protocol,base_url=excluded.base_url,model=excluded.model,capabilities_json=excluded.capabilities_json,api_key_ciphertext=excluded.api_key_ciphertext,api_key_iv=excluded.api_key_iv,api_key_last4=excluded.api_key_last4,cipher_version=excluded.cipher_version,status='active',last_test_status=NULL,last_error_code=NULL,updated_at=excluded.updated_at`).bind(id,tenantId,userId,input.providerId,input.providerName,input.protocol||null,input.baseUrl||null,input.model||null,caps,encrypted.ciphertext,encrypted.iv,last4,encrypted.version,now,now).run();
    const row=await context.env.DB.prepare(`SELECT id,provider_id,provider_name,protocol,base_url,model,capabilities_json,api_key_last4,status,last_tested_at,last_test_status,last_error_code,created_at,updated_at FROM ai_provider_credentials WHERE tenant_id=? AND user_id=? AND provider_id=? LIMIT 1`).bind(tenantId,userId,input.providerId).first();
    await audit(context,{tenantId,userId},'ai.credential.save','ai_provider_credential',input.providerId,null,{providerId:input.providerId,model:input.model||null,last4,personal:true,capabilities:input.capabilities||{}});
    return json({ok:true,credential:publicCredential(row)},201);
  }catch(error){const e=aiCredentialsSchemaError(error);return json(e,e.error==='ai_credentials_schema_not_ready'?503:500)}
}

export async function onRequestPut(context){
  const originError=assertSameOrigin(context.request);if(originError)return originError;
  const {response,auth}=await requireAuth(context,'ai.use');if(response)return response;
  let body;try{body=await readJson(context.request)}catch{return json({ok:false,error:'invalid_json'},400)}
  const researchProviderId=cleanAIProviderId(body?.researchProviderId),draftProviderId=cleanAIProviderId(body?.draftProviderId),allowWorkspaceFallback=body?.allowWorkspaceFallback===false?0:1,now=new Date().toISOString();
  try{
    await context.env.DB.prepare(`INSERT INTO ai_user_preferences(tenant_id,user_id,research_provider_id,draft_provider_id,allow_workspace_fallback,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(tenant_id,user_id) DO UPDATE SET research_provider_id=excluded.research_provider_id,draft_provider_id=excluded.draft_provider_id,allow_workspace_fallback=excluded.allow_workspace_fallback,updated_at=excluded.updated_at`).bind(auth.tenant.id,auth.user.id,researchProviderId||null,draftProviderId||null,allowWorkspaceFallback,now).run();
    const preferences=await getAIUserPreferences(context.env.DB,auth);
    await audit(context,{tenantId:auth.tenant.id,userId:auth.user.id},'ai.preferences.update','ai_user_preferences',auth.user.id,null,preferences);
    return json({ok:true,preferences});
  }catch(error){const e=aiCredentialsSchemaError(error);return json(e,e.error==='ai_credentials_schema_not_ready'?503:500)}
}
