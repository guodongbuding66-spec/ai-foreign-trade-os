import { AIProviderError, listAIProviders, parseStructuredText, resolveAIProvider } from './ai-gateway.js';
import { documentMediaCapability } from './document-media.js';

const BUILTIN_MEDIA={openai:{vision:true,pdf:true},anthropic:{vision:true,pdf:true},gemini:{vision:true,pdf:true}};
function customConfigs(env={}){try{const x=JSON.parse(String(env.AI_PROVIDER_CONFIG_JSON||'[]'));return Array.isArray(x)?x:[]}catch{return[]}}
function capsFor(env,id){
  if(BUILTIN_MEDIA[id])return BUILTIN_MEDIA[id];
  const row=customConfigs(env).find(x=>String(x?.id||'').toLowerCase()===String(id||'').toLowerCase()),c=row?.capabilities||{};
  return{vision:Boolean(c.vision),pdf:Boolean(c.pdf)};
}
export function mediaProviderSupports(env,providerId,mime){const need=documentMediaCapability(mime),caps=capsFor(env,providerId);return Boolean(need&&caps[need])}
export function selectMediaProviderId(env={},requestedId='',mime='application/pdf'){
  const requested=String(requestedId||'').trim().toLowerCase();
  if(requested){const p=listAIProviders(env).find(x=>x.id===requested);if(!p)throw new AIProviderError(`Unknown AI provider: ${requested}`,400,'ai_provider_unknown');if(!p.configured)throw new AIProviderError(`${p.name} is not configured`,503,'ai_provider_not_configured');if(!mediaProviderSupports(env,p.id,mime))throw new AIProviderError(`${p.name} does not expose ${documentMediaCapability(mime)} input in this workspace`,400,'ai_provider_media_unsupported');return p.id}
  const providers=listAIProviders(env),preferred=[String(env.AI_DRAFT_PROVIDER||'').toLowerCase(),String(env.AI_DEFAULT_PROVIDER||'').toLowerCase(),...providers.map(p=>p.id)].filter(Boolean);
  for(const id of [...new Set(preferred)]){const p=providers.find(x=>x.id===id);if(p?.configured&&mediaProviderSupports(env,id,mime))return id}
  throw new AIProviderError('No configured AI provider supports this PDF/image input',503,'ai_media_provider_not_configured');
}
function schemaInstruction(schema){return `Return ONLY one valid JSON object matching this JSON Schema exactly. Do not use Markdown fences. JSON Schema: ${JSON.stringify(schema)}`}
async function fetchJson(url,options){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);let response;
  try{response=await fetch(url,{...options,signal:controller.signal})}catch(error){clearTimeout(timer);throw new AIProviderError('Unable to reach AI provider',502,'ai_provider_network_error',String(error?.message||error).slice(0,240))}
  clearTimeout(timer);const raw=await response.text();let data;try{data=JSON.parse(raw)}catch{data={raw:raw.slice(0,1200)}}
  if(!response.ok){const message=data?.error?.message||data?.message||`AI provider HTTP ${response.status}`;throw new AIProviderError(String(message),response.status>=400&&response.status<500?400:502,data?.error?.code||data?.error?.type||'ai_provider_request_failed',String(message).slice(0,240))}
  return data;
}
function outputOpenAI(data={}){if(typeof data.output_text==='string'&&data.output_text.trim())return data.output_text.trim();const a=[];for(const item of data.output||[])for(const c of item?.content||[])if(c?.type==='output_text'&&typeof c.text==='string')a.push(c.text);return a.join('\n').trim()}
function outputAnthropic(data={}){return(data.content||[]).filter(x=>x?.type==='text').map(x=>x.text||'').join('\n').trim()}
function outputGemini(data={}){if(typeof data.output_text==='string'&&data.output_text.trim())return data.output_text.trim();const a=[];for(const x of [...(data.outputs||data.output||[]),...(data.steps||[])]){if(typeof x?.text==='string')a.push(x.text);for(const p of x?.content?.parts||[])if(typeof p?.text==='string')a.push(p.text);if(x?.type==='model_output')for(const c of x?.content||[])if(typeof c?.text==='string')a.push(c.text)}return a.join('\n').trim()}
function usageOf(data={}){return data?.usage||data?.usage_metadata||null}
async function invokeOpenAI(p,{system,prompt,schema,media,maxTokens}){
  const content=[{type:'input_text',text:`${system}\n\n${prompt}\n\n${schemaInstruction(schema)}`}];
  for(const m of media){if(m.mimeType==='application/pdf')content.push({type:'input_file',filename:m.name,file_data:m.data});else content.push({type:'input_image',image_url:`data:${m.mimeType};base64,${m.data}`,detail:'high'})}
  const data=await fetchJson(`${p.baseUrl}/responses`,{method:'POST',headers:{Authorization:`Bearer ${p.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:p.model,store:false,input:[{role:'user',content}],max_output_tokens:maxTokens})});return{data,text:outputOpenAI(data),usage:usageOf(data)};
}
async function invokeAnthropic(p,{system,prompt,schema,media,maxTokens}){
  const content=[];for(const m of media){if(m.mimeType==='application/pdf')content.push({type:'document',source:{type:'base64',media_type:m.mimeType,data:m.data}});else content.push({type:'image',source:{type:'base64',media_type:m.mimeType,data:m.data}})}content.push({type:'text',text:`${prompt}\n\n${schemaInstruction(schema)}`});
  const data=await fetchJson(`${p.baseUrl}/v1/messages`,{method:'POST',headers:{'x-api-key':p.apiKey,'anthropic-version':'2023-06-01','Content-Type':'application/json'},body:JSON.stringify({model:p.model,max_tokens:maxTokens,system,messages:[{role:'user',content}]})});return{data,text:outputAnthropic(data),usage:usageOf(data)};
}
async function invokeGemini(p,{system,prompt,schema,media}){
  const input=[];for(const m of media)input.push({type:m.mimeType==='application/pdf'?'document':'image',data:m.data,mime_type:m.mimeType});input.push({type:'text',text:`${system}\n\n${prompt}\n\n${schemaInstruction(schema)}`});
  const data=await fetchJson(`${p.baseUrl}/interactions`,{method:'POST',headers:{'x-goog-api-key':p.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:p.model,input})});return{data,text:outputGemini(data),usage:usageOf(data)};
}
export async function runStructuredMediaAI(env,{providerId='',system='',prompt='',schema={},media=[],maxTokens=3600}={}){
  if(!Array.isArray(media)||!media.length)throw new AIProviderError('Media input is required',400,'ai_media_required');
  const mime=media[0]?.mimeType||'',id=selectMediaProviderId(env,providerId,mime),p=resolveAIProvider(env,'draft',id);let result;
  if(p.protocol==='openai_responses')result=await invokeOpenAI(p,{system,prompt,schema,media,maxTokens});
  else if(p.protocol==='anthropic_messages')result=await invokeAnthropic(p,{system,prompt,schema,media,maxTokens});
  else if(p.protocol==='gemini_interactions')result=await invokeGemini(p,{system,prompt,schema,media,maxTokens});
  else throw new AIProviderError(`${p.name} media protocol is not supported by this adapter`,400,'ai_provider_media_protocol_unsupported');
  return{provider:{id:p.id,name:p.name,protocol:p.protocol,model:p.model},model:p.model,data:parseStructuredText(result.text),usage:result.usage,raw:result.data};
}
