import { json, requireAuth } from '../../_lib/auth.js';
import { normalizeContact, normalizePackage, normalizeProduct, normalizeQuote, normalizeSku } from '../../_lib/masterdata.js';
import { normalizeAutomation, normalizeLoadPlan, normalizeOpportunity, normalizeTask } from '../../_lib/workflowdata.js';

export async function onRequestGet(context) {
  const { response, auth } = await requireAuth(context);
  if (response) return response;
  const tenantId = auth.tenant.id;
  try {
    const [contactsResult,productsResult,skusResult,packagesResult,quotesResult,quoteItemsResult,opportunitiesResult,tasksResult,automationsResult,loadPlansResult,auditResult] = await context.env.DB.batch([
      context.env.DB.prepare(`SELECT ct.*,u.display_name AS owner_display_name FROM contacts ct LEFT JOIN users u ON u.id=ct.owner_user_id AND u.tenant_id=ct.tenant_id WHERE ct.tenant_id=? ORDER BY datetime(ct.updated_at) DESC,ct.full_name ASC LIMIT 2000`).bind(tenantId),
      context.env.DB.prepare(`SELECT * FROM products WHERE tenant_id=? ORDER BY datetime(updated_at) DESC,name ASC LIMIT 2000`).bind(tenantId),
      context.env.DB.prepare(`SELECT * FROM skus WHERE tenant_id=? ORDER BY datetime(updated_at) DESC,code ASC LIMIT 5000`).bind(tenantId),
      context.env.DB.prepare(`SELECT * FROM sku_packages WHERE tenant_id=? ORDER BY sku_id,package_code LIMIT 10000`).bind(tenantId),
      context.env.DB.prepare(`SELECT * FROM quotes WHERE tenant_id=? ORDER BY datetime(updated_at) DESC,quote_no DESC LIMIT 3000`).bind(tenantId),
      context.env.DB.prepare(`SELECT * FROM quote_items WHERE tenant_id=? ORDER BY quote_id,created_at ASC LIMIT 10000`).bind(tenantId),
      context.env.DB.prepare(`SELECT * FROM opportunities WHERE tenant_id=? ORDER BY datetime(updated_at) DESC LIMIT 3000`).bind(tenantId),
      context.env.DB.prepare(`SELECT * FROM tasks WHERE tenant_id=? ORDER BY datetime(updated_at) DESC LIMIT 5000`).bind(tenantId),
      context.env.DB.prepare(`SELECT * FROM automations WHERE tenant_id=? ORDER BY datetime(updated_at) DESC LIMIT 2000`).bind(tenantId),
      context.env.DB.prepare(`SELECT * FROM load_plans WHERE tenant_id=? ORDER BY datetime(created_at) DESC LIMIT 1000`).bind(tenantId),
      context.env.DB.prepare(`SELECT a.*,u.display_name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id AND u.tenant_id=a.tenant_id WHERE a.tenant_id=? ORDER BY datetime(a.created_at) DESC LIMIT 100`).bind(tenantId)
    ]);
    const quoteItemsByQuote=new Map();for(const item of quoteItemsResult.results||[]){const list=quoteItemsByQuote.get(item.quote_id)||[];list.push(item);quoteItemsByQuote.set(item.quote_id,list)}
    const activities=(auditResult.results||[]).map(a=>({id:a.id,time:a.created_at,text:`${a.action} · ${a.entity_type}${a.entity_id?` · ${a.entity_id}`:''}${a.user_name?` · ${a.user_name}`:''}`}));
    return json({ok:true,tenantId,contacts:(contactsResult.results||[]).map(normalizeContact),products:(productsResult.results||[]).map(normalizeProduct),skus:(skusResult.results||[]).map(normalizeSku),packages:(packagesResult.results||[]).map(normalizePackage),quotes:(quotesResult.results||[]).map(row=>normalizeQuote(row,quoteItemsByQuote.get(row.id)||[])),opportunities:(opportunitiesResult.results||[]).map(normalizeOpportunity),tasks:(tasksResult.results||[]).map(normalizeTask),automations:(automationsResult.results||[]).map(normalizeAutomation),loadPlans:(loadPlansResult.results||[]).map(normalizeLoadPlan),activities});
  } catch(error){return json({ok:false,error:'workspace_snapshot_failed',detail:String(error?.message||error).slice(0,180)},500)}
}
