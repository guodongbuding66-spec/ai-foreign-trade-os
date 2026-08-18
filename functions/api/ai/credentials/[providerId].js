import { assertSameOrigin, audit, json, requireAuth } from '../../../_lib/auth.js';
import { aiCredentialsSchemaError, cleanAIProviderId } from '../../../_lib/ai-credentials.js';

export async function onRequestDelete(context){
  const originError=assertSameOrigin(context.request);if(originError)return originError;
  const {response,auth}=await requireAuth(context,'ai.use');if(response)return response;
  const providerId=cleanAIProviderId(context.params?.providerId);if(!providerId)return json({ok:false,error:'provider_id_required'},400);
  try{
    const before=await context.env.DB.prepare('SELECT provider_id,provider_name,model,api_key_last4,updated_at FROM ai_provider_credentials WHERE tenant_id=? AND user_id=? AND provider_id=? LIMIT 1').bind(auth.tenant.id,auth.user.id,providerId).first();
    if(!before)return json({ok:false,error:'ai_credential_not_found'},404);
    await context.env.DB.batch([
      context.env.DB.prepare('DELETE FROM ai_provider_credentials WHERE tenant_id=? AND user_id=? AND provider_id=?').bind(auth.tenant.id,auth.user.id,providerId),
      context.env.DB.prepare('UPDATE ai_user_preferences SET research_provider_id=CASE WHEN research_provider_id=? THEN NULL ELSE research_provider_id END,draft_provider_id=CASE WHEN draft_provider_id=? THEN NULL ELSE draft_provider_id END,updated_at=? WHERE tenant_id=? AND user_id=?').bind(providerId,providerId,new Date().toISOString(),auth.tenant.id,auth.user.id)
    ]);
    await audit(context,{tenantId:auth.tenant.id,userId:auth.user.id},'ai.credential.delete','ai_provider_credential',providerId,before,null);
    return json({ok:true});
  }catch(error){const e=aiCredentialsSchemaError(error);return json(e,e.error==='ai_credentials_schema_not_ready'?503:500)}
}
