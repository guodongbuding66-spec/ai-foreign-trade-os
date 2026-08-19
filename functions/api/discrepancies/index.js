import { json, requireAuth } from '../../_lib/auth.js';

export async function onRequestGet(context) {
  const { response, auth } = await requireAuth(context,'documents.read');
  if (response) return response;
  const url = new URL(context.request.url);
  const orderId = String(url.searchParams.get('orderId')||'').trim();
  const status = String(url.searchParams.get('status')||'').trim();
  const severity = String(url.searchParams.get('severity')||'').trim();
  const where = ['d.tenant_id=?'], binds = [auth.tenant.id];
  if (orderId) { where.push('d.order_id=?'); binds.push(orderId); }
  if (status) { where.push('d.status=?'); binds.push(status); }
  if (severity) { where.push('d.severity=?'); binds.push(severity); }
  try {
    const rows = await context.env.DB.prepare(`
      SELECT d.*, o.order_no, doc.document_type, doc.document_no,
             u.display_name AS resolved_by_name
      FROM document_discrepancies d
      LEFT JOIN orders o ON o.id=d.order_id
      LEFT JOIN documents doc ON doc.id=d.document_id
      LEFT JOIN users u ON u.id=d.resolved_by
      WHERE ${where.join(' AND ')}
      ORDER BY CASE d.severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Warning' THEN 3 ELSE 4 END,
               d.created_at DESC
      LIMIT 500
    `).bind(...binds).all();
    const items = (rows.results||[]).map(r=>({
      id:r.id,orderId:r.order_id,orderNo:r.order_no||'',letterOfCreditId:r.letter_of_credit_id||null,
      documentId:r.document_id||null,documentVersionId:r.document_version_id||null,documentType:r.document_type||'',documentNo:r.document_no||'',
      ruleKey:r.rule_key,fieldPath:r.field_path||'',expected:parse(r.expected_json),actual:parse(r.actual_json),severity:r.severity,status:r.status,
      message:r.message,resolutionText:r.resolution_text||'',resolvedBy:r.resolved_by||null,resolvedByName:r.resolved_by_name||'',resolvedAt:r.resolved_at||null,createdAt:r.created_at
    }));
    return json({ok:true,items});
  } catch (error) {
    return json({ok:false,error:'discrepancy_database_error',detail:String(error?.message||error).slice(0,180)},500);
  }
}

function parse(v){if(v==null)return null;try{return JSON.parse(v)}catch{return v}}
