import { assertSameOrigin, audit, json, randomId, readJson, requireAuth } from '../../_lib/auth.js';
import { evaluateRuleSet, RULE_KEYS } from '../../_lib/rule-engine.js';

async function all(DB, sql, binds = []) {
  return (await DB.prepare(sql).bind(...binds).all()).results || [];
}

async function loadOrderContext(DB, tenantId, orderId) {
  const order = await DB.prepare('SELECT * FROM orders WHERE id=? AND tenant_id=? LIMIT 1').bind(orderId, tenantId).first();
  if (!order) return null;
  const orderItems = await all(DB, 'SELECT * FROM order_items WHERE order_id=? AND tenant_id=? ORDER BY created_at', [orderId, tenantId]);
  let quote = null, quoteItems = [];
  if (order.quote_id) {
    quote = await DB.prepare('SELECT * FROM quotes WHERE id=? AND tenant_id=? LIMIT 1').bind(order.quote_id, tenantId).first();
    quoteItems = await all(DB, 'SELECT * FROM quote_items WHERE quote_id=? AND tenant_id=? ORDER BY created_at', [order.quote_id, tenantId]);
  }
  const shipments = await all(DB, 'SELECT * FROM shipments WHERE order_id=? AND tenant_id=? ORDER BY created_at', [orderId, tenantId]);
  const loadPlans = await all(DB, 'SELECT * FROM load_plans WHERE order_id=? AND tenant_id=? ORDER BY created_at', [orderId, tenantId]);
  const planIds = loadPlans.map(x=>x.id), shipmentIds = shipments.map(x=>x.id), skuIds = [...new Set(orderItems.map(x=>x.sku_id).filter(Boolean))];
  const inRows = async (table, column, ids) => ids.length ? all(DB, `SELECT * FROM ${table} WHERE tenant_id=? AND ${column} IN (${ids.map(()=>'?').join(',')})`, [tenantId, ...ids]) : [];
  const loadItems = planIds.length ? all(DB, `SELECT * FROM load_plan_items WHERE tenant_id=? AND load_plan_id IN (${planIds.map(()=>'?').join(',')})`, [tenantId, ...planIds]) : [];
  const unloadedItems = await inRows('load_plan_unloaded_items','load_plan_id',planIds);
  const packages = await inRows('sku_packages','sku_id',skuIds);
  const shipmentLegs = await inRows('shipment_legs','shipment_id',shipmentIds);
  const letterOfCredit = await DB.prepare('SELECT * FROM letters_of_credit WHERE order_id=? AND tenant_id=? ORDER BY updated_at DESC LIMIT 1').bind(orderId, tenantId).first();
  const lcRequiredDocuments = letterOfCredit ? await all(DB,'SELECT * FROM lc_required_documents WHERE tenant_id=? AND letter_of_credit_id=? ORDER BY sort_order',[tenantId,letterOfCredit.id]) : [];
  const documentVersions = await all(DB, `
    SELECT dv.*, d.id AS document_id, d.document_type
    FROM documents d JOIN document_versions dv ON dv.document_id=d.id
    WHERE d.order_id=? AND d.tenant_id=? AND dv.tenant_id=?
    ORDER BY d.document_type, dv.version_no DESC
  `,[orderId,tenantId,tenantId]);
  return {order,orderItems,quote,quoteItems,shipments,loadPlans,loadItems,unloadedItems,packages,shipmentLegs,letterOfCredit,lcRequiredDocuments,documentVersions};
}

async function evaluate(context, orderId, persist) {
  const permission = persist ? 'documents.write' : 'documents.read';
  const { response, auth } = await requireAuth(context, permission);
  if (response) return response;
  const orderContext = await loadOrderContext(context.env.DB, auth.tenant.id, orderId);
  if (!orderContext) return json({ok:false,error:'order_not_found'},404);
  const result = evaluateRuleSet(orderContext);
  if (!persist) return json({ok:true,orderId,...result,persisted:false});

  const placeholders = RULE_KEYS.map(()=>'?').join(',');
  const statements = [context.env.DB.prepare(`DELETE FROM document_discrepancies WHERE tenant_id=? AND order_id=? AND status='Open' AND rule_key IN (${placeholders})`).bind(auth.tenant.id,orderId,...RULE_KEYS)];
  const now = new Date().toISOString();
  for (const item of result.issues) {
    statements.push(context.env.DB.prepare(`
      INSERT INTO document_discrepancies(
        id,tenant_id,order_id,letter_of_credit_id,document_id,document_version_id,
        rule_key,field_path,expected_json,actual_json,severity,status,message,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      randomId('dsc'),auth.tenant.id,orderId,orderContext.letterOfCredit?.id||null,item.documentId||null,item.documentVersionId||null,
      item.ruleKey,item.fieldPath||null,item.expected==null?null:JSON.stringify(item.expected),item.actual==null?null:JSON.stringify(item.actual),
      item.severity,'Open',item.message,now
    ));
  }
  await context.env.DB.batch(statements);
  await audit(context,{tenantId:auth.tenant.id,userId:auth.user.id},'rules.evaluate','order',orderId,null,{counts:result.counts,blocking:result.blocking,issues:result.issues.length});
  return json({ok:true,orderId,...result,persisted:true});
}

export async function onRequestGet(context) {
  const orderId = new URL(context.request.url).searchParams.get('orderId')?.trim();
  if (!orderId) return json({ok:false,error:'order_id_required'},400);
  try { return await evaluate(context,orderId,false); }
  catch (error) { return json({ok:false,error:'rule_engine_error',detail:String(error?.message||error).slice(0,180)},500); }
}

export async function onRequestPost(context) {
  const originError = assertSameOrigin(context.request); if (originError) return originError;
  let body; try { body = await readJson(context.request); } catch { return json({ok:false,error:'invalid_json'},400); }
  const orderId = String(body?.orderId||'').trim();
  if (!orderId) return json({ok:false,error:'order_id_required'},400);
  try { return await evaluate(context,orderId,true); }
  catch (error) { return json({ok:false,error:'rule_engine_error',detail:String(error?.message||error).slice(0,180)},500); }
}
