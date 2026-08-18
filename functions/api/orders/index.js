import { assertSameOrigin, audit, json, randomId, readJson, requireAuth } from '../../_lib/auth.js';
import { clean, commercialSchemaError, normalizeOrder, num } from '../../_lib/commercialdata.js';

async function loadItems(DB,tenantId,orderId){const r=await DB.prepare(`SELECT oi.*,s.code AS sku_code FROM order_items oi LEFT JOIN skus s ON s.id=oi.sku_id AND s.tenant_id=oi.tenant_id WHERE oi.tenant_id=? AND oi.order_id=? ORDER BY oi.created_at`).bind(tenantId,orderId).all();return r.results||[]}
async function getOrder(DB,tenantId,id){const row=await DB.prepare(`SELECT o.*,c.legal_name AS company_name,u.display_name AS owner_display_name FROM orders o JOIN companies c ON c.id=o.company_id AND c.tenant_id=o.tenant_id LEFT JOIN users u ON u.id=o.owner_user_id AND u.tenant_id=o.tenant_id WHERE o.tenant_id=? AND o.id=? LIMIT 1`).bind(tenantId,id).first();if(!row)return null;return normalizeOrder(row,await loadItems(DB,tenantId,id))}

export async function onRequestGet(context){
  const {response,auth}=await requireAuth(context,'orders.read');if(response)return response;
  try{const r=await context.env.DB.prepare(`SELECT o.*,c.legal_name AS company_name,u.display_name AS owner_display_name,(SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id AND oi.tenant_id=o.tenant_id) item_count FROM orders o JOIN companies c ON c.id=o.company_id AND c.tenant_id=o.tenant_id LEFT JOIN users u ON u.id=o.owner_user_id AND u.tenant_id=o.tenant_id WHERE o.tenant_id=? ORDER BY datetime(o.updated_at) DESC LIMIT 2000`).bind(auth.tenant.id).all();return json({ok:true,orders:(r.results||[]).map(row=>({...normalizeOrder(row,[]),itemCount:Number(row.item_count||0)}))})}catch(error){return json(commercialSchemaError(error),String(error?.message||'').includes('no such table')?503:500)}
}

export async function onRequestPost(context){
  const originError=assertSameOrigin(context.request);if(originError)return originError;
  const {response,auth}=await requireAuth(context,'orders.write');if(response)return response;
  let body;try{body=await readJson(context.request)}catch{return json({ok:false,error:'invalid_json'},400)}
  const tenantId=auth.tenant.id,now=new Date().toISOString();
  let quote=null,companyId=clean(body?.companyId,120),items=Array.isArray(body?.items)?body.items:[];
  try{
    if(body?.quoteId){quote=await context.env.DB.prepare('SELECT * FROM quotes WHERE id=? AND tenant_id=? LIMIT 1').bind(clean(body.quoteId,120),tenantId).first();if(!quote)return json({ok:false,error:'quote_not_found'},404);companyId=quote.company_id;const qr=await context.env.DB.prepare('SELECT * FROM quote_items WHERE quote_id=? AND tenant_id=? ORDER BY created_at').bind(quote.id,tenantId).all();items=(qr.results||[]).map(i=>({skuId:i.sku_id,quantity:i.quantity,unitPrice:i.unit_price,currency:i.currency,metadata:i.metadata_json?JSON.parse(i.metadata_json):{}}))}
    if(!companyId)return json({ok:false,error:'company_required'},400);
    const company=await context.env.DB.prepare('SELECT id FROM companies WHERE id=? AND tenant_id=? LIMIT 1').bind(companyId,tenantId).first();if(!company)return json({ok:false,error:'company_not_found'},404);
    if(!items.length)return json({ok:false,error:'order_items_required'},400);
    const normalized=[];for(const raw of items){const skuId=clean(raw?.skuId,120),quantity=Math.max(1,Math.trunc(num(raw?.quantity)||1)),unitPrice=Math.max(0,num(raw?.unitPrice));const sku=await context.env.DB.prepare('SELECT id,code FROM skus WHERE id=? AND tenant_id=? LIMIT 1').bind(skuId,tenantId).first();if(!sku)return json({ok:false,error:'sku_not_found',skuId},404);normalized.push({id:randomId('oi'),skuId,quantity,unitPrice,currency:clean(raw?.currency,8)||clean(body?.currency,8)||quote?.currency||'USD',lineTotal:quantity*unitPrice,metadata:raw?.metadata&&typeof raw.metadata==='object'?raw.metadata:{}})}
    const amount=normalized.reduce((s,i)=>s+i.lineTotal,0),deposit=Math.max(0,num(body?.deposit)),balance=Math.max(0,num(body?.balance)||amount-deposit),id=randomId('ord'),orderNo=clean(body?.orderNo,80)||`SO-${now.slice(0,10).replace(/-/g,'')}-${crypto.randomUUID().slice(0,6).toUpperCase()}`,currency=clean(body?.currency,8)||quote?.currency||normalized[0].currency||'USD';
    const stmts=[context.env.DB.prepare(`INSERT INTO orders(id,tenant_id,order_no,company_id,contact_id,opportunity_id,quote_id,po_number,currency,incoterm,port,payment_terms,deposit,balance,amount,production_date,etd,eta,status,owner_user_id,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,tenantId,orderNo,companyId,clean(body?.contactId,120)||null,clean(body?.opportunityId,120)||null,quote?.id||clean(body?.quoteId,120)||null,clean(body?.poNumber,120)||null,currency,clean(body?.incoterm,20)||quote?.incoterm||null,clean(body?.port,120)||null,clean(body?.paymentTerms,240)||null,deposit,balance,amount,clean(body?.productionDate,20)||null,clean(body?.etd,20)||null,clean(body?.eta,20)||null,clean(body?.status,40)||'Draft',auth.user.id,auth.user.id,now,now)];
    for(const i of normalized)stmts.push(context.env.DB.prepare(`INSERT INTO order_items(id,tenant_id,order_id,sku_id,quantity,unit_price,currency,line_total,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(i.id,tenantId,id,i.skuId,i.quantity,i.unitPrice,i.currency,i.lineTotal,JSON.stringify(i.metadata),now,now));
    await context.env.DB.batch(stmts);const order=await getOrder(context.env.DB,tenantId,id);await audit(context,{tenantId,userId:auth.user.id},quote?'order.create_from_quote':'order.create','order',id,null,order);return json({ok:true,order},201)
  }catch(error){const shape=commercialSchemaError(error);return json(shape,shape.error==='commercial_schema_not_ready'?503:500)}
}
