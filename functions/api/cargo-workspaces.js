import { assertSameOrigin, json, randomId, requireAuth } from '../_lib/auth.js';
import { cargoSchema, cargoBody, validateWorkspace, cargoError } from '../_lib/cargo.js';
export async function onRequestGet(context){
  const {response,auth}=await requireAuth(context,'container.read');if(response)return response;
  try{await cargoSchema(context.env.DB);const id=new URL(context.request.url).searchParams.get('id');if(id){const row=await context.env.DB.prepare('SELECT * FROM cargo_workspaces WHERE id=? AND tenant_id=?').bind(id,auth.tenant.id).first();return row?json({ok:true,workspace:row}):json({ok:false,error:'not_found'},404);}
    const rows=await context.env.DB.prepare('SELECT id,name,version,created_at,created_by FROM cargo_workspaces WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100').bind(auth.tenant.id).all();return json({ok:true,workspaces:rows.results||[]});
  }catch(e){return cargoError(e);}
}
export async function onRequestPost(context){
  const origin=assertSameOrigin(context.request);if(origin)return origin;const {response,auth}=await requireAuth(context,'container.write');if(response)return response;
  try{const b=await cargoBody(context.request),name=String(b.name||'').trim();if(!name||name.length>100)throw Error('invalid_name');const payload=validateWorkspace(b.payload);await cargoSchema(context.env.DB);const id=randomId('cargo'),date=new Date().toISOString();
    await context.env.DB.prepare('INSERT INTO cargo_workspaces(id,tenant_id,name,version,payload,created_by,created_at) SELECT ?,?,?,COALESCE(MAX(version),0)+1,?,?,? FROM cargo_workspaces WHERE tenant_id=? AND name=?').bind(id,auth.tenant.id,name,payload,auth.user.id,date,auth.tenant.id,name).run();return json({ok:true,id},201);
  }catch(e){return cargoError(e);}
}
