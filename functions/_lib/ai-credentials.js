const encoder = new TextEncoder();
const decoder = new TextDecoder();

const BUILTIN = {
  openai: { keyEnv:'OPENAI_API_KEY', modelEnv:'OPENAI_MODEL' },
  anthropic: { keyEnv:'ANTHROPIC_API_KEY', modelEnv:'ANTHROPIC_MODEL' },
  gemini: { keyEnv:'GEMINI_API_KEY', modelEnv:'GEMINI_MODEL' },
  deepseek: { keyEnv:'DEEPSEEK_API_KEY', modelEnv:'DEEPSEEK_MODEL' },
  xai: { keyEnv:'XAI_API_KEY', modelEnv:'XAI_MODEL' },
  groq: { keyEnv:'GROQ_API_KEY', modelEnv:'GROQ_MODEL' },
  together: { keyEnv:'TOGETHER_API_KEY', modelEnv:'TOGETHER_MODEL' },
  mistral: { keyEnv:'MISTRAL_API_KEY', modelEnv:'MISTRAL_MODEL' },
  openrouter: { keyEnv:'OPENROUTER_API_KEY', modelEnv:'OPENROUTER_MODEL' }
};

const PROTOCOLS = new Set(['openai_responses','openai_chat','anthropic_messages','gemini_interactions']);

function cleanId(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,'').slice(0,64)}
function cleanText(v,n=200){return String(v||'').trim().slice(0,n)}
function cleanUrl(v){const s=String(v||'').trim().replace(/\/+$/,'');return /^https:\/\//i.test(s)?s:''}
function bool(v,f=false){if(v===undefined||v===null||v==='')return f;return v===true||v===1||String(v).toLowerCase()==='true'}

function toB64(bytes){let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')}
function fromB64(v){const b64=String(v||'').replace(/-/g,'+').replace(/_/g,'/');const padded=b64+'='.repeat((4-(b64.length%4))%4);const binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0))}

async function deriveKey(master,tenantId,userId){
  if(!master)throw new Error('AI_CREDENTIALS_MASTER_KEY_NOT_CONFIGURED');
  const base=await crypto.subtle.importKey('raw',encoder.encode(String(master)),'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encoder.encode(`${tenantId}|${userId}`),info:encoder.encode('aftos-ai-credentials-v1')},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}

export async function encryptAIKey(master,tenantId,userId,providerId,plain){
  const key=await deriveKey(master,tenantId,userId),iv=crypto.getRandomValues(new Uint8Array(12));
  const aad=encoder.encode(`provider:${cleanId(providerId)}`);
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},key,encoder.encode(String(plain)));
  return {ciphertext:toB64(new Uint8Array(encrypted)),iv:toB64(iv),version:1};
}

export async function decryptAIKey(master,tenantId,userId,providerId,ciphertext,iv){
  const key=await deriveKey(master,tenantId,userId),aad=encoder.encode(`provider:${cleanId(providerId)}`);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(iv),additionalData:aad,tagLength:128},key,fromB64(ciphertext));
  return decoder.decode(plain);
}

export function validateCredentialInput(body={}){
  const providerId=cleanId(body.providerId),apiKey=String(body.apiKey||'').trim(),builtin=BUILTIN[providerId]||null;
  if(!providerId)return {error:'provider_id_required'};
  if(apiKey.length<8||apiKey.length>4096)return {error:'api_key_invalid'};
  let protocol='',baseUrl='',model=cleanText(body.model,200),providerName=cleanText(body.providerName,100)||providerId,capabilities={webSearch:bool(body?.capabilities?.webSearch,false),nativeSchema:bool(body?.capabilities?.nativeSchema,false),vision:bool(body?.capabilities?.vision,false),pdf:bool(body?.capabilities?.pdf,false)};
  if(!builtin){
    protocol=cleanText(body.protocol,40);baseUrl=cleanUrl(body.baseUrl);
    if(!PROTOCOLS.has(protocol))return {error:'provider_protocol_invalid'};
    if(!baseUrl)return {error:'provider_base_url_invalid'};
    if(!model)return {error:'provider_model_required'};
    if(protocol==='openai_chat'&&capabilities.pdf)capabilities.pdf=false;
  }
  return {providerId,apiKey,builtin,protocol,baseUrl,model,providerName,capabilities};
}

function safeJson(v,f={}){try{return JSON.parse(v||'')}catch{return f}}

export async function getPersonalCredentialRows(DB,auth){
  const r=await DB.prepare(`SELECT id,provider_id,provider_name,protocol,base_url,model,capabilities_json,api_key_ciphertext,api_key_iv,api_key_last4,cipher_version,status,last_tested_at,last_test_status,last_error_code,created_at,updated_at FROM ai_provider_credentials WHERE tenant_id=? AND user_id=? AND status='active' ORDER BY updated_at DESC`).bind(auth.tenant.id,auth.user.id).all();
  return r.results||[];
}

export async function getAIUserPreferences(DB,auth){
  const row=await DB.prepare('SELECT research_provider_id,draft_provider_id,allow_workspace_fallback,updated_at FROM ai_user_preferences WHERE tenant_id=? AND user_id=? LIMIT 1').bind(auth.tenant.id,auth.user.id).first();
  return {researchProviderId:cleanId(row?.research_provider_id),draftProviderId:cleanId(row?.draft_provider_id),allowWorkspaceFallback:row?Number(row.allow_workspace_fallback)!==0:true,updatedAt:row?.updated_at||null};
}

export function publicCredential(row){return {id:row.id,providerId:row.provider_id,providerName:row.provider_name||row.provider_id,protocol:row.protocol||'',baseUrl:row.base_url||'',model:row.model||'',capabilities:safeJson(row.capabilities_json,{}),last4:row.api_key_last4||'',status:row.status||'active',lastTestedAt:row.last_tested_at||null,lastTestStatus:row.last_test_status||null,lastErrorCode:row.last_error_code||null,createdAt:row.created_at,updatedAt:row.updated_at}}

function proxyEnv(base,overrides){return new Proxy(base||{}, {get(target,prop){if(Object.prototype.hasOwnProperty.call(overrides,prop))return overrides[prop];return target?.[prop]},has(target,prop){return Object.prototype.hasOwnProperty.call(overrides,prop)||prop in (target||{})}})}

export async function buildUserAIEnv(context,auth){
  const master=String(context.env?.AI_CREDENTIALS_MASTER_KEY||'');
  const prefs=await getAIUserPreferences(context.env.DB,auth);
  const rows=master?await getPersonalCredentialRows(context.env.DB,auth):[];
  const overrides={};
  if(!prefs.allowWorkspaceFallback){for(const x of Object.values(BUILTIN))overrides[x.keyEnv]='';overrides.AI_PROVIDER_CONFIG_JSON='[]'}
  const workspaceCustom=prefs.allowWorkspaceFallback?safeJson(context.env?.AI_PROVIDER_CONFIG_JSON,'[]'):[];
  const custom=Array.isArray(workspaceCustom)?workspaceCustom.slice(0,40):[];
  const personalIds=new Set();
  for(let i=0;i<rows.length;i++){
    const row=rows[i],providerId=cleanId(row.provider_id);if(!providerId)continue;
    let apiKey='';try{apiKey=await decryptAIKey(master,auth.tenant.id,auth.user.id,providerId,row.api_key_ciphertext,row.api_key_iv)}catch{continue}
    if(!apiKey)continue;personalIds.add(providerId);
    const builtin=BUILTIN[providerId];
    if(builtin){overrides[builtin.keyEnv]=apiKey;if(row.model)overrides[builtin.modelEnv]=row.model;continue}
    const secretEnv=`BYOK_AI_KEY_${i}`;overrides[secretEnv]=apiKey;
    const caps=safeJson(row.capabilities_json,{});
    custom.push({id:providerId,name:row.provider_name||providerId,protocol:row.protocol||'openai_chat',baseUrl:row.base_url||'',model:row.model||'',secretEnv,capabilities:{webSearch:Boolean(caps.webSearch),nativeSchema:Boolean(caps.nativeSchema),vision:Boolean(caps.vision),pdf:Boolean(caps.pdf)}});
  }
  overrides.AI_PROVIDER_CONFIG_JSON=JSON.stringify(custom.slice(0,40));
  if(prefs.researchProviderId)overrides.AI_RESEARCH_PROVIDER=prefs.researchProviderId;
  if(prefs.draftProviderId)overrides.AI_DRAFT_PROVIDER=prefs.draftProviderId;
  return {env:proxyEnv(context.env,overrides),preferences:prefs,personalIds,credentials:rows.map(publicCredential),masterKeyReady:Boolean(master)};
}

export function aiCredentialsSchemaError(error){const m=String(error?.message||error);if(m.includes('no such table: ai_provider_credentials')||m.includes('no such table: ai_user_preferences'))return {ok:false,error:'ai_credentials_schema_not_ready',expectedSchemaVersion:'5'};if(m.includes('AI_CREDENTIALS_MASTER_KEY_NOT_CONFIGURED'))return {ok:false,error:'ai_credentials_master_key_not_configured'};return {ok:false,error:'ai_credentials_error',detail:m.slice(0,240)}}

export { BUILTIN as BUILTIN_AI_CREDENTIALS, PROTOCOLS as AI_CREDENTIAL_PROTOCOLS, cleanId as cleanAIProviderId };
