const clean = v => String(v ?? '').trim();
const norm = v => clean(v).replace(/\s+/g, ' ').toLowerCase();
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const dateOnly = v => clean(v) ? clean(v).slice(0, 10) : '';

export const RULE_KEYS = [
  'ORDER-001','ORDER-002','ORDER-003','SHIP-001','SHIP-002','LOAD-001','LOAD-002',
  'DOC-003','LC-002','LC-004','BL-002','BL-003','BL-004'
];

export function safeJson(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function issue(ruleKey, severity, message, fieldPath = '', expected = null, actual = null, extra = {}) {
  return { ruleKey, severity, message, fieldPath, expected, actual, ...extra };
}

function valueAt(obj, names) {
  for (const name of names) {
    const parts = name.split('.');
    let cur = obj;
    for (const part of parts) cur = cur && typeof cur === 'object' ? cur[part] : undefined;
    if (cur !== undefined && cur !== null && clean(cur) !== '') return cur;
  }
  return null;
}

function latestByType(documents) {
  const out = new Map();
  for (const row of documents || []) {
    const type = clean(row.document_type).toUpperCase();
    if (!type) continue;
    const prior = out.get(type);
    if (!prior || Number(row.version_no || 0) > Number(prior.version_no || 0)) out.set(type, row);
  }
  return out;
}

function documentData(row) {
  if (!row) return {};
  return safeJson(row.normalized_json, safeJson(row.snapshot_json, {}));
}

function compareDocField(issues, docs, types, aliases, ruleKey, severity, label) {
  const values = [];
  for (const type of types) {
    const row = docs.get(type);
    if (!row) continue;
    const data = documentData(row);
    const value = valueAt(data, aliases);
    if (value !== null) values.push({ type, value, row });
  }
  if (values.length < 2) return;
  const base = norm(values[0].value);
  const mismatch = values.find(v => norm(v.value) !== base);
  if (!mismatch) return;
  issues.push(issue(ruleKey, severity, `${label}在${values.map(v=>v.type).join('/')}之间不一致。`, aliases[0],
    Object.fromEntries(values.map(v=>[v.type, values[0].value])),
    Object.fromEntries(values.map(v=>[v.type, v.value])),
    { documentId: mismatch.row.document_id || null, documentVersionId: mismatch.row.id || null }));
}

export function evaluateRuleSet(input = {}) {
  const issues = [];
  const order = input.order || {};
  const orderItems = input.orderItems || [];
  const quote = input.quote || null;
  const quoteItems = input.quoteItems || [];
  const shipments = input.shipments || [];
  const loadPlans = input.loadPlans || [];
  const loadItems = input.loadItems || [];
  const unloadedItems = input.unloadedItems || [];
  const packages = input.packages || [];
  const lc = input.letterOfCredit || null;
  const legs = input.shipmentLegs || [];
  const docs = latestByType(input.documentVersions || []);

  const missing = [];
  for (const [key, value] of [['company_id',order.company_id],['currency',order.currency],['incoterm',order.incoterm],['payment_terms',order.payment_terms]]) {
    if (!clean(value)) missing.push(key);
  }
  if (!orderItems.length) missing.push('order_items');
  if (orderItems.some(i => !clean(i.sku_id) || n(i.quantity) <= 0 || n(i.unit_price) < 0)) missing.push('order_items.sku_id/quantity/unit_price');
  if (missing.length) issues.push(issue('ORDER-001','High','订单核心商业字段不完整。','orders',missing,'missing'));

  if (quote && clean(quote.currency) && norm(quote.currency) !== norm(order.currency)) {
    issues.push(issue('ORDER-002','High','Quote→Order 币种不一致。','orders.currency',quote.currency,order.currency));
  }

  if (quoteItems.length && orderItems.length) {
    const qMap = new Map(quoteItems.map(i=>[clean(i.sku_id), i]));
    for (const oi of orderItems) {
      const qi = qMap.get(clean(oi.sku_id));
      if (!qi) continue;
      const diffs = {};
      if (n(qi.quantity) !== n(oi.quantity)) diffs.quantity = [n(qi.quantity), n(oi.quantity)];
      if (Math.abs(n(qi.unit_price)-n(oi.unit_price)) > 0.000001) diffs.unit_price = [n(qi.unit_price), n(oi.unit_price)];
      if (norm(qi.currency) !== norm(oi.currency)) diffs.currency = [qi.currency, oi.currency];
      if (Object.keys(diffs).length) issues.push(issue('ORDER-003','High',`SKU ${clean(oi.sku_id)} 从Quote转Order后发生未解释差异。`,`order_items.${clean(oi.sku_id)}`,qi,oi));
    }
  }

  for (const shipment of shipments) {
    const dateDiffs = {};
    if (order.etd && shipment.etd && dateOnly(order.etd) !== dateOnly(shipment.etd)) dateDiffs.etd = [order.etd, shipment.etd];
    if (order.eta && shipment.eta && dateOnly(order.eta) !== dateOnly(shipment.eta)) dateDiffs.eta = [order.eta, shipment.eta];
    if (Object.keys(dateDiffs).length) issues.push(issue('SHIP-001','High',`Shipment ${clean(shipment.shipment_no)} 与订单计划日期存在偏差。`,'shipments.etd/eta',dateDiffs,'mismatch'));
    const portDiffs = {};
    if (order.pol && shipment.pol && norm(order.pol) !== norm(shipment.pol)) portDiffs.pol = [order.pol, shipment.pol];
    if (order.pod && shipment.pod && norm(order.pod) !== norm(shipment.pod)) portDiffs.pod = [order.pod, shipment.pod];
    if (Object.keys(portDiffs).length) issues.push(issue('SHIP-002','High',`Shipment ${clean(shipment.shipment_no)} 的POL/POD与订单不一致。`,'shipments.pol/pod',portDiffs,'mismatch'));
  }

  const packageBySku = new Map();
  for (const p of packages) {
    const list = packageBySku.get(clean(p.sku_id)) || [];
    list.push(p); packageBySku.set(clean(p.sku_id), list);
  }
  for (const plan of loadPlans) {
    const placedForPlan = loadItems.filter(x=>x.load_plan_id===plan.id);
    const unloadedForPlan = unloadedItems.filter(x=>x.load_plan_id===plan.id);
    for (const oi of orderItems) {
      const defs = packageBySku.get(clean(oi.sku_id)) || [];
      for (const p of defs) {
        const expected = n(oi.quantity) * Math.max(1, n(p.quantity_per_set));
        const placed = placedForPlan.filter(x=>x.package_id===p.id || (x.sku_id===oi.sku_id && x.package_code===p.package_code)).length;
        const unloaded = unloadedForPlan.filter(x=>x.package_id===p.id || (x.sku_id===oi.sku_id && x.package_code===p.package_code)).length;
        if (expected !== placed + unloaded) issues.push(issue('LOAD-001','Critical',`装柜计划 ${clean(plan.plan_no||plan.id)} 中 SKU ${clean(oi.sku_id)} / ${clean(p.package_code)} 箱数不守恒。`,'load_plan_items',expected,{placed,unloaded,total:placed+unloaded}));
      }
    }
    const weight = placedForPlan.reduce((s,x)=>s+n(x.gross_weight),0);
    if (Math.abs(weight - n(plan.total_weight)) > 0.01) issues.push(issue('LOAD-002','Critical',`装柜计划 ${clean(plan.plan_no||plan.id)} 总重量与箱件汇总不一致。`,'load_plans.total_weight',weight,n(plan.total_weight)));
  }

  compareDocField(issues, docs, ['CI','PL','BL'], ['marks','shipping_marks','shippingMark'], 'DOC-003','High','运输唛头');
  compareDocField(issues, docs, ['CI','PL','BL'], ['package_count','packages_count','packageCount'], 'LC-004','High','总件数');
  compareDocField(issues, docs, ['CI','PL','BL','AWB','SEA_WAYBILL'], ['goods_description','goods','product_description'], 'LC-004','High','货物描述');
  compareDocField(issues, docs, ['CI','PL'], ['quantity','total_quantity','qty'], 'LC-004','High','数量');
  compareDocField(issues, docs, ['CI','BL','AWB','SEA_WAYBILL'], ['pol','port_of_loading','shipping.port_of_loading'], 'LC-004','High','装货港');
  compareDocField(issues, docs, ['CI','BL','AWB','SEA_WAYBILL'], ['pod','port_of_discharge','shipping.port_of_discharge'], 'LC-004','High','目的港');

  if (lc) {
    if (norm(lc.partial_shipment) === 'not allowed' || norm(lc.partial_shipment) === 'prohibited' || norm(lc.partial_shipment) === 'no') {
      if (shipments.length > 1) issues.push(issue('LC-002','Critical','信用证禁止分批装运，但该订单存在多个Shipment。','letters_of_credit.partial_shipment','not allowed',shipments.length));
    }
    if (norm(lc.transshipment) === 'not allowed' || norm(lc.transshipment) === 'prohibited' || norm(lc.transshipment) === 'no') {
      if (legs.some(x=>Number(x.transshipment_flag)===1) || legs.length > Math.max(1, shipments.length)) issues.push(issue('LC-002','Critical','信用证禁止转运，但Shipment路线存在转运迹象。','letters_of_credit.transshipment','not allowed','transshipment detected'));
    }
  }

  const bl = docs.get('BL');
  if (bl) {
    const data = documentData(bl);
    const cleanStatus = norm(valueAt(data,['clean_status','cleanStatus']));
    if (cleanStatus === 'unclean' || cleanStatus === 'claused') issues.push(issue('BL-003','Critical','B/L 被识别为不清洁/有不利批注，不得自动放行。','bl.clean_status','clean',cleanStatus,{documentId:bl.document_id,documentVersionId:bl.id}));
    const blOnBoard = valueAt(data,['on_board_date','onBoardDate','on_board.date']);
    const shipment = shipments.find(s=>s.bl_no && norm(s.bl_no)===norm(valueAt(data,['bl_no','blNo']))) || shipments[0];
    if (blOnBoard && shipment?.actual_on_board_at) {
      const a = Date.parse(blOnBoard), b = Date.parse(shipment.actual_on_board_at);
      if (Number.isFinite(a) && Number.isFinite(b) && a < b - 12*60*60*1000) issues.push(issue('BL-004','Critical','B/L装船日期早于可验证的实际装船时间，存在倒签风险。','bl.on_board_date',shipment.actual_on_board_at,blOnBoard,{documentId:bl.document_id,documentVersionId:bl.id}));
    }
    const vessel = valueAt(data,['on_board_vessel','vessel','on_board.vessel']);
    const pol = valueAt(data,['on_board_pol','pol','port_of_loading']);
    if (shipment && ((vessel && shipment.vessel && norm(vessel)!==norm(shipment.vessel)) || (pol && shipment.pol && norm(pol)!==norm(shipment.pol)))) {
      issues.push(issue('BL-002','Critical','B/L已装船批注的船名或装货港与Shipment不一致。','bl.on_board', {vessel:shipment.vessel,pol:shipment.pol},{vessel,pol},{documentId:bl.document_id,documentVersionId:bl.id}));
    }
  }

  const counts = issues.reduce((acc,x)=>(acc[x.severity]=(acc[x.severity]||0)+1,acc),{});
  return { issues, counts, blocking: (counts.Critical||0) > 0 };
}
