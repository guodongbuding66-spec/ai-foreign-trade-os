import { assertSameOrigin, json, sha256, constantTimeEqual } from '../_lib/auth.js';
import { cargoBody, cargoError } from '../_lib/cargo.js';
export async function onRequestPost(context){
  const origin=assertSameOrigin(context.request);if(origin)return origin;
  if(!context.env.DB)return json({ok:false,error:'unavailable'},503);
  try{const b=await cargoBody(context.request);if(typeof b.id!=='string'||typeof b.token!=='string'||!/^[a-f0-9]{64}$/.test(b.token))return json({ok:false,error:'not_found'},404);const row=await context.env.DB.prepare('SELECT s.token_hash,w.name,w.payload FROM cargo_shares s JOIN cargo_workspaces w ON w.id=s.workspace_id AND w.tenant_id=s.tenant_id WHERE s.id=? AND s.revoked_at IS NULL AND datetime(s.expires_at)>datetime(?)').bind(b.id,new Date().toISOString()).first();if(!row||!await constantTimeEqual(row.token_hash,await sha256(b.token)))return json({ok:false,error:'expired_or_revoked'},404);return json({ok:true,name:row.name,payload:row.payload});}catch(e){return cargoError(e);}
}
