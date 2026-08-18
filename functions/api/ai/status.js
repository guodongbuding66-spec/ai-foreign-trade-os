import { json, requireAuth } from '../../_lib/auth.js';
import { aiGatewayStatus } from '../../_lib/ai-gateway.js';
import { aiCredentialsSchemaError, buildUserAIEnv } from '../../_lib/ai-credentials.js';

export async function onRequestGet(context){
  const {response,auth}=await requireAuth(context,'ai.use');if(response)return response;
  try{
    const state=await buildUserAIEnv(context,auth),status=aiGatewayStatus(state.env);
    const providers=(status.providers||[]).map(p=>({...p,personal:state.personalIds.has(p.id),workspaceConfigured:Boolean(p.configured&&!state.personalIds.has(p.id))}));
    return json({ok:true,...status,providers,masterKeyReady:state.masterKeyReady,preferences:state.preferences});
  }catch(error){const e=aiCredentialsSchemaError(error);return json(e,e.error==='ai_credentials_schema_not_ready'?503:500)}
}
