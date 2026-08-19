import { assertSameOrigin, audit, json, randomId, readJson, requireAuth } from '../../_lib/auth.js';
import { canonicalDocumentType, IMPORT_DOCUMENT_TYPES, normalizeExtractedDocument } from '../../_lib/document-intelligence.js';

const clean=(v,n=120000)=>String(v??'').trim().slice(0,n);
export async function onRequestPost(context){
  const originError=assertSameOrigin(context.request);if(originError)return originError;const {response,auth}=await requireAuth(context,'documents.write');if(response)return response;
  let body;try{body=await readJson(context.request)}catch{return json({ok:false,error:'invalid_json'},400)}
  const orderId=clean(body?.orderId,120),type=canonicalDocumentType(body?.type),rawText=clean(body?.rawText,120000),requestedId=clean(body?.documentId,120);if(!orderId)return json({ok:false,error:'order_required'},400);if(!IMPORT_DOCUMENT_TYPES.has(type))return json({ok:false,error:'document_type_invalid'},400);if(rawText.length<10)return json({ok:false,error:'document_text_required'},400);
  const normalized=normalizeExtractedDocument(body?.normalized||{},type),now=new Date().toISOString(),tenantId=auth.tenant.id;
  try{
    const order=await context.env.DB.prepare('SELECT id,order_no,company_id FROM orders WHERE id=? AND tenant_id=? LIMIT 1').bind(orderId,tenantId).first();if(!order)return json({ok:false,error:'order_not_found'},404);
    let doc=null;if(requestedId)doc=await context.env.DB.prepare('SELECT * FROM documents WHERE id=? AND tenant_id=? LIMIT 1').bind(requestedId,tenantId).first();
    const inputNo=clean(body?.documentNo||normalized.document_no,300),docNo=inputNo||`${type}-${order.order_no}-${Date.now().toString(36).toUpperCase()}`;
    if(!doc&&inputNo)doc=await context.env.DB.prepare('SELECT * FROM documents WHERE tenant_id=? AND order_id=? AND document_type=? AND document_no=? ORDER BY created_at LIMIT 1').bind(tenantId,orderId,type,docNo).first();
    if(doc&&(doc.order_id!==orderId||canonicalDocumentType(doc.document_type)!==type))return json({ok:false,error:'document_identity_mismatch'},409);
    const docId=doc?.id||randomId('doc'),vrow=doc?await context.env.DB.prepare('SELECT COALESCE(MAX(version_no),0) AS v FROM document_versions WHERE tenant_id=? AND document_id=?').bind(tenantId,docId).first():null,version=Number(vrow?.v||0)+1;
    const provider=clean(body?.provider,100)||'deterministic',model=clean(body?.model,200)||'text-parser',mode=clean(body?.mode,80)||'manual';const metadata={source:'text-import',mode,provider,model,normalizedSummary:{documentNo:normalized.document_no||docNo,type}};
    const stmts=[];if(!doc)stmts.push(context.env.DB.prepare(`INSERT INTO documents(id,tenant_id,document_type,document_no,company_id,order_id,storage_key,mime_type,metadata_json,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,NULL,'text/plain',?,'Draft',?,?,?)`).bind(docId,tenantId,type,docNo,order.company_id,orderId,JSON.stringify(metadata),auth.user.id,now,now));else stmts.push(context.env.DB.prepare(`UPDATE documents SET document_no=?,metadata_json=?,mime_type='text/plain',status='Draft',updated_at=? WHERE id=? AND tenant_id=?`).bind(docNo,JSON.stringify(metadata),now,docId,tenantId));
    stmts.push(context.env.DB.prepare(`INSERT INTO document_versions(id,tenant_id,document_id,version_no,snapshot_json,normalized_json,parsed_text,storage_key,mime_type,extraction_status,extraction_provider,extraction_model,extracted_at,validation_status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(randomId('docv'),tenantId,docId,version,JSON.stringify({source:'text-import',documentType:type,documentNo:docNo,importedAt:now}),JSON.stringify(normalized),rawText,null,'text/plain','complete',provider,model,now,'pending',auth.user.id,now));
    await context.env.DB.batch(stmts);await audit(context,{tenantId,userId:auth.user.id},doc?'document.import_revision':'document.import','document',docId,null,{orderId,type,documentNo:docNo,version,provider,model,mode});return json({ok:true,document:{id:docId,type,documentNo:docNo,orderId},version,normalized},doc?200:201);
  }catch(error){return json({ok:false,error:'document_import_error',detail:String(error?.message||error).slice(0,220)},500)}
}
