import { assertSameOrigin, audit, json, randomId, readJson, requireAuth } from '../../_lib/auth.js';
import { normalizeLCBody, publicLC } from '../../_lib/lc.js';

async function all(DB,sql,binds=[]){return (await DB.prepare(sql).bind(...binds).all()).results||[]}
function docPublic(r){let conditions={};try{conditions=JSON.parse(r.conditions_json||'{}')}catch{}return{id:r.id,documentType:r.document_type,description:r.description||'',originals:Number(r.originals||0),copies:Number(r.copies||0),conditions,sortOrder:Number(r.sort_order||0)}}

export async function onRequestGet(context){
  const {response,auth}=await requireAuth(context,'documents.read');if(response)return response;
  const url=new URL(context.request.url),orderId=String(url.searchParams.get('orderId')||'').trim();
  try{
    const binds=[auth.tenant.id],where=['lc.tenant_id=?'];if(orderId){where.push('lc.order_id=?');binds.push(orderId)}
    const rows=await all(context.env.DB,`SELECT lc.*,o.order_no FROM letters_of_credit lc LEFT JOIN orders o ON o.id=lc.order_id WHERE ${where.join(' AND ')} ORDER BY lc.updated_at DESC`,binds);
    const ids=rows.map(x=>x.id);let req=[];if(ids.length)req=await all(context.env.DB,`SELECT * FROM lc_required_documents WHERE tenant_id=? AND letter_of_credit_id IN (${ids.map(()=>'?').join(',')}) ORDER BY letter_of_credit_id,sort_order`,[auth.tenant.id,...ids]);
    const by=new Map();for(const r of req){const a=by.get(r.letter_of_credit_id)||[];a.push(docPublic(r));by.set(r.letter_of_credit_id,a)}
    return json({ok:true,items:rows.map(r=>publicLC(r,by.get(r.id)||[]))});
  }catch(error){return json({ok:false,error:'lc_database_error',detail:String(error?.message||error).slice(0,220)},500)}
}

export async function onRequestPost(context){
  const originError=assertSameOrigin(context.request);if(originError)return originError;
  const {response,auth}=await requireAuth(context,'documents.write');if(response)return response;
  let body;try{body=await readJson(context.request)}catch{return json({ok:false,error:'invalid_json'},400)}
  const data=normalizeLCBody(body);if(!data.orderId)return json({ok:false,error:'order_id_required'},400);if(!data.lcNo)return json({ok:false,error:'lc_no_required'},400);
  try{
    const order=await context.env.DB.prepare('SELECT id,order_no FROM orders WHERE id=? AND tenant_id=? LIMIT 1').bind(data.orderId,auth.tenant.id).first();if(!order)return json({ok:false,error:'order_not_found'},404);
    if(data.documentId){const d=await context.env.DB.prepare('SELECT id FROM documents WHERE id=? AND tenant_id=? LIMIT 1').bind(data.documentId,auth.tenant.id).first();if(!d)return json({ok:false,error:'document_not_found'},404)}
    const existing=await context.env.DB.prepare('SELECT * FROM letters_of_credit WHERE tenant_id=? AND lc_no=? LIMIT 1').bind(auth.tenant.id,data.lcNo).first();
    const id=existing?.id||randomId('lc'),now=new Date().toISOString();
    const rawTerms={...(data.rawTerms||{}),extracted:{goodsDescription:data.goodsDescription,pol:data.pol,pod:data.pod,presentationPeriod:data.presentationPeriod,additionalConditions:data.additionalConditions}};
    const statements=[];
    if(existing)statements.push(context.env.DB.prepare(`UPDATE letters_of_credit SET order_id=?,document_id=?,applicant_name=?,beneficiary_name=?,currency=?,amount=?,issue_date=?,expiry_date=?,presentation_place=?,latest_shipment_date=?,partial_shipment=?,transshipment=?,status=?,raw_terms_json=?,updated_at=? WHERE id=? AND tenant_id=?`).bind(data.orderId,data.documentId,data.applicantName,data.beneficiaryName,data.currency,data.amount,data.issueDate||null,data.expiryDate||null,data.presentationPlace,data.latestShipmentDate||null,data.partialShipment,data.transshipment,data.status,JSON.stringify(rawTerms),now,id,auth.tenant.id));
    else statements.push(context.env.DB.prepare(`INSERT INTO letters_of_credit(id,tenant_id,order_id,document_id,lc_no,applicant_name,beneficiary_name,currency,amount,issue_date,expiry_date,presentation_place,latest_shipment_date,partial_shipment,transshipment,status,raw_terms_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,auth.tenant.id,data.orderId,data.documentId,data.lcNo,data.applicantName,data.beneficiaryName,data.currency,data.amount,data.issueDate||null,data.expiryDate||null,data.presentationPlace,data.latestShipmentDate||null,data.partialShipment,data.transshipment,data.status,JSON.stringify(rawTerms),auth.user.id,now,now));
    statements.push(context.env.DB.prepare('DELETE FROM lc_required_documents WHERE tenant_id=? AND letter_of_credit_id=?').bind(auth.tenant.id,id));
    for(const d of data.requiredDocuments)statements.push(context.env.DB.prepare(`INSERT INTO lc_required_documents(id,tenant_id,letter_of_credit_id,document_type,description,originals,copies,conditions_json,sort_order,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(randomId('lcd'),auth.tenant.id,id,d.documentType,d.description,d.originals,d.copies,JSON.stringify(d.conditions||{}),d.sortOrder,now));
    await context.env.DB.batch(statements);
    await audit(context,{tenantId:auth.tenant.id,userId:auth.user.id},existing?'lc.update':'lc.create','letter_of_credit',id,existing?{lcNo:existing.lc_no,orderId:existing.order_id}:null,{lcNo:data.lcNo,orderId:data.orderId,requiredDocuments:data.requiredDocuments.length});
    const row=await context.env.DB.prepare('SELECT lc.*,o.order_no FROM letters_of_credit lc LEFT JOIN orders o ON o.id=lc.order_id WHERE lc.id=? AND lc.tenant_id=?').bind(id,auth.tenant.id).first();
    const req=await all(context.env.DB,'SELECT * FROM lc_required_documents WHERE tenant_id=? AND letter_of_credit_id=? ORDER BY sort_order',[auth.tenant.id,id]);
    return json({ok:true,item:publicLC(row,req.map(docPublic)),created:!existing},existing?200:201);
  }catch(error){return json({ok:false,error:'lc_database_error',detail:String(error?.message||error).slice(0,220)},500)}
}
