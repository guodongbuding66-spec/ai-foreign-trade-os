import { json, requireAuth } from '../../_lib/auth.js';
import { aiGatewayStatus } from '../../_lib/ai-gateway.js';

export async function onRequestGet(context){const {response}=await requireAuth(context,'ai.use');if(response)return response;return json({ok:true,...aiGatewayStatus(context.env)});}
