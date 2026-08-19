import { assertSameOrigin, audit, json, readJson, requireAuth } from '../../_lib/auth.js';

export async function onRequestPatch(context) {
  const originError = assertSameOrigin(context.request); if (originError) return originError;
  const { response, auth } = await requireAuth(context,'documents.write');
  if (response) return response;
  const id = context.params?.id;
  let body; try { body = await readJson(context.request); } catch { return json({ok:false,error:'invalid_json'},400); }
  const status = String(body?.status||'').trim();
  if (!['Resolved','Open'].includes(status)) return json({ok:false,error:'invalid_status'},400);
  const resolutionText = String(body?.resolutionText||'').trim().slice(0,4000);
  try {
    const before = await context.env.DB.prepare('SELECT * FROM document_discrepancies WHERE id=? AND tenant_id=? LIMIT 1').bind(id,auth.tenant.id).first();
    if (!before) return json({ok:false,error:'discrepancy_not_found'},404);
    const resolved = status === 'Resolved';
    const now = new Date().toISOString();
    await context.env.DB.prepare(`
      UPDATE document_discrepancies SET status=?, resolution_text=?, resolved_by=?, resolved_at=?
      WHERE id=? AND tenant_id=?
    `).bind(status,resolutionText||null,resolved?auth.user.id:null,resolved?now:null,id,auth.tenant.id).run();
    const after = await context.env.DB.prepare('SELECT * FROM document_discrepancies WHERE id=? AND tenant_id=? LIMIT 1').bind(id,auth.tenant.id).first();
    await audit(context,{tenantId:auth.tenant.id,userId:auth.user.id},resolved?'discrepancy.resolve':'discrepancy.reopen','document_discrepancy',id,before,{status:after.status,resolution_text:after.resolution_text,resolved_at:after.resolved_at});
    return json({ok:true,item:{id:after.id,status:after.status,resolutionText:after.resolution_text||'',resolvedAt:after.resolved_at||null}});
  } catch (error) {
    return json({ok:false,error:'discrepancy_database_error',detail:String(error?.message||error).slice(0,180)},500);
  }
}
