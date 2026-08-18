import { assertSameOrigin, audit, json, readJson, requireAuth } from '../../../_lib/auth.js';
import { aiProviderErrorJson, runStructuredAI } from '../../../_lib/ai-gateway.js';
import { aiCredentialsSchemaError, buildUserAIEnv, cleanAIProviderId } from '../../../_lib/ai-credentials.js';

const schema={type:'object',additionalProperties:false,properties:{ok:{type:'boolean'}},required:['ok']};

export async function onRequestPost(context){
  const originError=assertSameOrigin(context.request);if(originError)return originError;
  const {response,auth}=await requireAuth(context,'ai.use');if(response)return response;
  let body;try{body=await readJson(context.request)}catch{return json({ok:false,error:'invalid_json'},400)}
  const providerId=cleanAIProviderId(body?.providerId);if(!providerId)return json({ok:false,error:'provider_id_required'},400);
  const now=new Date().toISOString();
  try{
    const state=await buildUserAIEnv(context,auth);
    if(!state.personalIds.has(providerId))return json({ok:false,error:'personal_ai_credential_not_found'},404);
    try{
      const result=await runStructuredAI(state.env,{task:'draft',providerId,system:'You are a connectivity test. Return only the requested structured output.',prompt:'Return {"ok":true}.',schema,maxTokens:32});
      await context.env.DB.prepare(`UPDATE ai_provider_credentials SET last_tested_at=?,last_test_status='success',last_error_code=NULL,updated_at=? WHERE tenant_id=? AND user_id=? AND provider_id=?`).bind(now,now,auth.tenant.id,auth.user.id,providerId).run();
      await audit(context,{tenantId:auth.tenant.id,userId:auth.user.id},'ai.credential.test','ai_provider_credential',providerId,null,{status:'success',providerId,model:result.model});
      return json({ok:true,provider:result.provider.id,model:result.model});
    }catch(error){
      const e=aiProviderErrorJson(error),code=String(e.body?.error||'ai_provider_test_failed').slice(0,120);
      await context.env.DB.prepare(`UPDATE ai_provider_credentials SET last_tested_at=?,last_test_status='failed',last_error_code=?,updated_at=? WHERE tenant_id=? AND user_id=? AND provider_id=?`).bind(now,code,now,auth.tenant.id,auth.user.id,providerId).run();
      await audit(context,{tenantId:auth.tenant.id,userId:auth.user.id},'ai.credential.test','ai_provider_credential',providerId,null,{status:'failed',providerId,error:code});
      return json({ok:false,error:code,detail:e.body?.detail||''},e.status||400);
    }
  }catch(error){const e=aiCredentialsSchemaError(error);return json(e,e.error==='ai_credentials_schema_not_ready'?503:500)}
}
