const PROTOCOLS = new Set(['openai_responses','openai_chat','anthropic_messages','gemini_interactions']);

const PRESETS = [
  { id:'openai', name:'OpenAI', protocol:'openai_responses', baseUrl:'https://api.openai.com/v1', keyEnv:'OPENAI_API_KEY', modelEnv:'OPENAI_MODEL', researchModelEnv:'OPENAI_RESEARCH_MODEL', draftModelEnv:'OPENAI_DRAFT_MODEL', researchDefault:'gpt-5.6-terra', draftDefault:'gpt-5.6-luna', webSearch:true, nativeSchema:true },
  { id:'anthropic', name:'Anthropic Claude', protocol:'anthropic_messages', baseUrl:'https://api.anthropic.com', keyEnv:'ANTHROPIC_API_KEY', modelEnv:'ANTHROPIC_MODEL', researchModelEnv:'ANTHROPIC_RESEARCH_MODEL', draftModelEnv:'ANTHROPIC_DRAFT_MODEL', researchDefault:'claude-sonnet-5', draftDefault:'claude-haiku-4-5-20251001', webSearch:true },
  { id:'gemini', name:'Google Gemini', protocol:'gemini_interactions', baseUrl:'https://generativelanguage.googleapis.com/v1beta', keyEnv:'GEMINI_API_KEY', modelEnv:'GEMINI_MODEL', researchModelEnv:'GEMINI_RESEARCH_MODEL', draftModelEnv:'GEMINI_DRAFT_MODEL', researchDefault:'gemini-3.6-flash', draftDefault:'gemini-3.6-flash', webSearch:true },
  { id:'deepseek', name:'DeepSeek', protocol:'openai_chat', baseUrl:'https://api.deepseek.com', keyEnv:'DEEPSEEK_API_KEY', modelEnv:'DEEPSEEK_MODEL', defaultModel:'deepseek-v4-flash' },
  { id:'xai', name:'xAI Grok', protocol:'openai_responses', baseUrl:'https://api.x.ai/v1', keyEnv:'XAI_API_KEY', modelEnv:'XAI_MODEL', defaultModel:'grok-4.5' },
  { id:'groq', name:'Groq', protocol:'openai_responses', baseUrl:'https://api.groq.com/openai/v1', keyEnv:'GROQ_API_KEY', modelEnv:'GROQ_MODEL', defaultModel:'openai/gpt-oss-120b' },
  { id:'together', name:'Together AI', protocol:'openai_chat', baseUrl:'https://api.together.ai/v1', keyEnv:'TOGETHER_API_KEY', modelEnv:'TOGETHER_MODEL', defaultModel:'openai/gpt-oss-20b' },
  { id:'mistral', name:'Mistral AI', protocol:'openai_chat', baseUrl:'https://api.mistral.ai/v1', keyEnv:'MISTRAL_API_KEY', modelEnv:'MISTRAL_MODEL', defaultModel:'mistral-large-latest' },
  { id:'openrouter', name:'OpenRouter', protocol:'openai_chat', baseUrl:'https://openrouter.ai/api/v1', keyEnv:'OPENROUTER_API_KEY', modelEnv:'OPENROUTER_MODEL', defaultModel:'' }
];

function cleanId(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g,'').slice(0,64); }
function cleanUrl(value) { const s=String(value||'').trim().replace(/\/+$/,''); return /^https:\/\//i.test(s)?s:''; }
function cleanModel(value) { return String(value||'').trim().slice(0,200); }
function bool(value, fallback=false) { if(value===undefined||value===null||value==='')return fallback; return value===true||value===1||String(value).toLowerCase()==='true'; }

function customProviderConfigs(env={}) {
  let raw=[];
  try { const parsed=JSON.parse(String(env.AI_PROVIDER_CONFIG_JSON||'[]')); raw=Array.isArray(parsed)?parsed:[]; } catch (_) { raw=[]; }
  return raw.slice(0,40).map((x,i)=>{
    const id=cleanId(x?.id||`custom-${i+1}`), protocol=String(x?.protocol||'openai_chat').trim();
    const secretEnv=String(x?.secretEnv||'').trim().toUpperCase();
    if(!id||!PROTOCOLS.has(protocol)||!cleanUrl(x?.baseUrl)||!/^[_A-Z][_A-Z0-9]{2,63}$/.test(secretEnv))return null;
    const caps=x?.capabilities&&typeof x.capabilities==='object'?x.capabilities:{};
    return { id, name:String(x?.name||id).slice(0,100), protocol, baseUrl:cleanUrl(x.baseUrl), keyEnv:secretEnv, modelEnv:'', defaultModel:cleanModel(x?.model), webSearch:bool(caps.webSearch,false), nativeSchema:bool(caps.nativeSchema,false), custom:true };
  }).filter(Boolean);
}

function modelFor(env,preset,task){
  const taskEnv=task==='research'?preset.researchModelEnv:preset.draftModelEnv;
  return cleanModel((taskEnv&&env?.[taskEnv]) || (preset.modelEnv&&env?.[preset.modelEnv]) || (task==='research'?preset.researchDefault:preset.draftDefault) || preset.defaultModel);
}

function internalProviders(env={},task='draft'){
  const all=[...PRESETS,...customProviderConfigs(env)];
  const seen=new Set();
  return all.filter(p=>{if(seen.has(p.id))return false;seen.add(p.id);return true}).map(p=>{
    const model=modelFor(env,p,task), apiKey=String(env?.[p.keyEnv]||'');
    return {...p,model,apiKey,configured:Boolean(apiKey&&model),capabilities:{text:true,structured:true,webSearch:Boolean(p.webSearch)}};
  });
}

function publicProvider(p){
  return { id:p.id,name:p.name,protocol:p.protocol,configured:p.configured,model:p.model,keyEnv:p.keyEnv,custom:Boolean(p.custom),capabilities:p.capabilities };
}

export function listAIProviders(env={}){
  const draft=internalProviders(env,'draft'), research=internalProviders(env,'research');
  const researchById=new Map(research.map(p=>[p.id,p]));
  return draft.map(d=>{const r=researchById.get(d.id)||d;const p={...d,model:d.model,researchModel:r.model};return {...publicProvider(p),researchModel:r.model,draftModel:d.model};});
}

export function resolveAIProvider(env={},task='draft',requestedId=''){
  const providers=internalProviders(env,task);
  const requested=cleanId(requestedId);
  const preferred=cleanId(requested || (task==='research'?env.AI_RESEARCH_PROVIDER:env.AI_DRAFT_PROVIDER) || env.AI_DEFAULT_PROVIDER);
  const eligible=p=>p.configured && (task!=='research'||p.capabilities.webSearch);
  if(preferred){const p=providers.find(x=>x.id===preferred);if(!p)throw new AIProviderError(`Unknown AI provider: ${preferred}`,400,'ai_provider_unknown');if(!p.configured)throw new AIProviderError(`${p.name} is not configured`,503,'ai_provider_not_configured');if(task==='research'&&!p.capabilities.webSearch)throw new AIProviderError(`${p.name} does not expose a configured web-search capability`,400,'ai_provider_no_web_search');return p;}
  const p=providers.find(eligible);
  if(!p)throw new AIProviderError(task==='research'?'No configured AI provider with web search is available':'No configured AI provider is available',503,'ai_provider_not_configured');
  return p;
}

export function aiGatewayStatus(env={}){
  const providers=listAIProviders(env);
  const configured=providers.filter(p=>p.configured);
  const researchConfigured=configured.filter(p=>p.capabilities.webSearch);
  return { configured:configured.length>0, providerCount:configured.length, providers, defaults:{ research:cleanId(env.AI_RESEARCH_PROVIDER)||researchConfigured[0]?.id||'', draft:cleanId(env.AI_DRAFT_PROVIDER)||cleanId(env.AI_DEFAULT_PROVIDER)||configured[0]?.id||'' } };
}

export class AIProviderError extends Error {
  constructor(message,status=502,code='ai_provider_error',detail=''){super(message);this.name='AIProviderError';this.status=status;this.code=code;this.detail=detail;}
}

async function fetchJson(url,options){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),60000);let response;
  try{response=await fetch(url,{...options,signal:controller.signal});}catch(error){clearTimeout(timer);throw new AIProviderError('Unable to reach AI provider',502,'ai_provider_network_error',String(error?.message||error).slice(0,240));}
  clearTimeout(timer);const raw=await response.text();let data;try{data=JSON.parse(raw)}catch{data={raw:raw.slice(0,1000)}}
  if(!response.ok){const message=data?.error?.message||data?.message||data?.error?.detail||`AI provider HTTP ${response.status}`;throw new AIProviderError(String(message),response.status>=400&&response.status<500?400:502,data?.error?.code||data?.error?.type||'ai_provider_request_failed',String(message).slice(0,240));}
  return data;
}

function schemaInstruction(schema){return `Return ONLY one valid JSON object matching this JSON Schema exactly. Do not use Markdown fences. JSON Schema: ${JSON.stringify(schema)}`;}

function parseJsonLoose(text){
  let s=String(text||'').trim();if(!s)throw new AIProviderError('AI provider returned no text output',502,'ai_empty_output');
  s=s.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  try{return JSON.parse(s)}catch{}
  const start=s.indexOf('{'),end=s.lastIndexOf('}');if(start>=0&&end>start){try{return JSON.parse(s.slice(start,end+1))}catch{}}
  throw new AIProviderError('AI provider returned invalid structured output',502,'ai_invalid_structured_output',s.slice(0,240));
}

function outputTextOpenAI(data={}){
  if(typeof data.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
  const parts=[];for(const item of data.output||[]){if(item?.type!=='message')continue;for(const c of item.content||[])if(c?.type==='output_text'&&typeof c.text==='string')parts.push(c.text)}return parts.join('\n').trim();
}
function outputTextChat(data={}){const c=data?.choices?.[0]?.message?.content;if(typeof c==='string')return c.trim();if(Array.isArray(c))return c.map(x=>x?.text||x?.content||'').join('\n').trim();return '';}
function outputTextAnthropic(data={}){return (data.content||[]).filter(x=>x?.type==='text').map(x=>x.text||'').join('\n').trim();}
function outputTextGemini(data={}){if(typeof data.output_text==='string')return data.output_text.trim();const parts=[];for(const o of data.outputs||data.output||[]){if(typeof o?.text==='string')parts.push(o.text);for(const p of o?.content?.parts||[])if(typeof p?.text==='string')parts.push(p.text)}return parts.join('\n').trim();}

function collectSources(value,out=[],seen=new Set(),depth=0){
  if(depth>8||value==null)return out;
  if(typeof value==='string'){if(/^https?:\/\//i.test(value)&&!seen.has(value)){seen.add(value);out.push({url:value,title:''})}return out;}
  if(Array.isArray(value)){for(const x of value)collectSources(x,out,seen,depth+1);return out;}
  if(typeof value==='object'){
    const url=String(value.url||value.uri||value.source_url||value.sourceUrl||'').trim();
    if(/^https?:\/\//i.test(url)&&!seen.has(url)){seen.add(url);out.push({url,title:String(value.title||value.name||value.page_title||'').slice(0,300)})}
    for(const v of Object.values(value))collectSources(v,out,seen,depth+1);
  }
  return out;
}

async function invokeOpenAIResponses(p,{system,prompt,schema,webSearch,maxTokens}){
  const body={model:p.model,store:false,input:[{role:'system',content:system},{role:'user',content:p.nativeSchema?prompt:`${prompt}\n\n${schemaInstruction(schema)}`}],max_output_tokens:maxTokens};
  if(webSearch&&p.webSearch){body.tools=[{type:'web_search'}];body.tool_choice='auto';body.include=['web_search_call.action.sources'];}
  if(p.nativeSchema)body.text={format:{type:'json_schema',name:'structured_output',strict:true,schema}};
  const data=await fetchJson(`${p.baseUrl}/responses`,{method:'POST',headers:{Authorization:`Bearer ${p.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {data,text:outputTextOpenAI(data),sources:collectSources(data),usage:data?.usage||null};
}

async function invokeOpenAIChat(p,{system,prompt,schema,maxTokens}){
  const body={model:p.model,messages:[{role:'system',content:system},{role:'user',content:`${prompt}\n\n${schemaInstruction(schema)}`}],max_tokens:maxTokens};
  const data=await fetchJson(`${p.baseUrl}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${p.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {data,text:outputTextChat(data),sources:collectSources(data),usage:data?.usage||null};
}

async function invokeAnthropic(p,{system,prompt,schema,webSearch,maxTokens}){
  const body={model:p.model,max_tokens:maxTokens,system,messages:[{role:'user',content:`${prompt}\n\n${schemaInstruction(schema)}`}]};
  if(webSearch&&p.webSearch)body.tools=[{type:'web_search_20260318',name:'web_search',max_uses:6}];
  const data=await fetchJson(`${p.baseUrl}/v1/messages`,{method:'POST',headers:{'x-api-key':p.apiKey,'anthropic-version':'2023-06-01','Content-Type':'application/json'},body:JSON.stringify(body)});
  return {data,text:outputTextAnthropic(data),sources:collectSources(data),usage:data?.usage||null};
}

async function invokeGemini(p,{system,prompt,schema,webSearch,maxTokens}){
  const body={model:p.model,input:`${system}\n\n${prompt}\n\n${schemaInstruction(schema)}`};
  if(webSearch&&p.webSearch)body.tools=[{type:'google_search'}];
  const data=await fetchJson(`${p.baseUrl}/interactions`,{method:'POST',headers:{'x-goog-api-key':p.apiKey,'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {data,text:outputTextGemini(data),sources:collectSources(data),usage:data?.usage||data?.usage_metadata||null};
}

export async function runStructuredAI(env,{task='draft',providerId='',system='',prompt='',schema={},webSearch=false,maxTokens=1800}={}){
  const provider=resolveAIProvider(env,task,providerId);let result;
  if(provider.protocol==='openai_responses')result=await invokeOpenAIResponses(provider,{system,prompt,schema,webSearch,maxTokens});
  else if(provider.protocol==='openai_chat')result=await invokeOpenAIChat(provider,{system,prompt,schema,webSearch,maxTokens});
  else if(provider.protocol==='anthropic_messages')result=await invokeAnthropic(provider,{system,prompt,schema,webSearch,maxTokens});
  else if(provider.protocol==='gemini_interactions')result=await invokeGemini(provider,{system,prompt,schema,webSearch,maxTokens});
  else throw new AIProviderError(`Unsupported AI protocol: ${provider.protocol}`,400,'ai_protocol_unsupported');
  const parsed=parseJsonLoose(result.text);
  return {provider:publicProvider(provider),model:provider.model,data:parsed,sources:result.sources.slice(0,30),usage:result.usage,raw:result.data};
}

export function aiProviderErrorJson(error){if(error instanceof AIProviderError)return{status:error.status,body:{ok:false,error:error.code,detail:error.detail||error.message}};return{status:500,body:{ok:false,error:'ai_runtime_error',detail:String(error?.message||error).slice(0,240)}};}

export { parseJsonLoose as parseStructuredText };
