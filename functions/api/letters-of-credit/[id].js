import { assertSameOrigin, audit, json, requireAuth } from '../../_lib/auth.js';
import { publicLC } from '../../_lib/lc.js';

function docPublic(r){let conditions={};try{conditions=JSON.parse(r.conditions_json||'{}')}catch{}return{id:r.id,documentType:r.document_type,description:r.description||'',originals:Number(r.originals||0),copies:Number(r.copies||0),conditions,sortOrder:Number(r.sort_order||0)}}

export async function onRequestGet(context){
  const {response,auth}=await requireAuth(context,'documents.read');if(response)return response;const id=context.params.id;
  try{const row=await context.env.DB.prepare('SELECT lc.*,o.order_no FROM letters_of_credit lc LEFT JOIN orders o ON o.id=lc.order_id WHERE lc.id=? AND lc.tenant_id=? LIMIT 1').bind(id,auth.tenant.id).first();if(!row)return json({ok:false,error:'lc_not_found'},404);const r=await context.env.DB.prepare('SELECT * FROM lc_required_documents WHERE tenant_id=? AND letter_of_credit_id=? ORDER BY sort_order').bind(auth.tenant.id,id).all();return json({ok:true,item:publicLC(row,(r.results||[]).map(docPublic))})}catch(error){return json({ok:false,error:'lc_database_error',detail:String(error?.message||error).slice(0,220)},500)}
}

export async function onRequestDelete(context){
  const originError=assertSameOrigin(context.request);if(originError)return originError;const {response,auth}=await requireAuth(context,'documents.write');if(response)return response;const id=context.params.id;
  try{const row=await context.env.DB.prepare('SELECT * FROM letters_of_credit WHERE id=? AND tenant_id=? LIMIT 1').bind(id,auth.tenant.id).first();if(!row)return json({ok:false,error:'lc_not_found'},404);const refs=await context.env.DB.prepare('SELECT COUNT(*) AS n FROM document_discrepancies WHERE tenant_id=? AND letter_of_credit_id=?').bind(auth.tenant.id,id).first();if(Number(refs?.n||0)>0)return json({ok:false,error:'lc_has_discrepancies',detail:'This L/C has linked discrepancy history and cannot be deleted; keep it for audit traceability.'},409);await context.env.DB.prepare('DELETE FROM letters_of_credit WHERE id=? AND tenant_id=?').bind(id,auth.tenant.id).run();await audit(context,{tenantId:auth.tenant.id,userId:auth.user.id},'lc.delete','letter_of_credit',id,{lcNo:row.lc_no,orderId:row.order_id},null);return json({ok:true})}catch(error){return json({ok:false,error:'lc_database_error',detail:String(error?.message||error).slice(0,220)},500)}
}
