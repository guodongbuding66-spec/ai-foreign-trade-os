import { json } from './auth.js';

export function clean(value, max = 255) {
  return String(value ?? '').trim().slice(0, max);
}

export function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function integer(value, fallback = 0) {
  return Math.trunc(number(value, fallback));
}

export function boolInt(value, fallback = false) {
  if (value === undefined || value === null) return fallback ? 1 : 0;
  return value ? 1 : 0;
}

export async function requireTenantEntity(DB, table, id, tenantId) {
  if (!/^(companies|products|skus|quotes|contacts)$/.test(table)) throw new Error('invalid_table');
  return DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ? LIMIT 1`).bind(id, tenantId).first();
}

export function dbError(error, fallback = 'database_error') {
  const message = String(error?.message || '');
  if (message.includes('UNIQUE') || message.includes('PRIMARY KEY')) return json({ ok: false, error: 'conflict' }, 409);
  if (message.includes('FOREIGN KEY')) return json({ ok: false, error: 'foreign_key_conflict' }, 409);
  return json({ ok: false, error: fallback }, 500);
}

export function normalizeContact(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.full_name,
    title: row.job_title || '',
    department: row.department || '',
    seniority: row.seniority || '',
    email: row.email || '',
    emailStatus: row.email_status || 'unknown',
    phone: row.phone || '',
    whatsapp: row.whatsapp || '',
    linkedin: row.linkedin_url || '',
    language: row.language || '',
    timezone: row.timezone || '',
    ownerUserId: row.owner_user_id || null,
    owner: row.owner_display_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function normalizeProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category || '',
    series: row.series || '',
    hs: row.default_hs_code || '',
    material: row.material || '',
    market: row.market || '',
    status: row.status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function normalizeSku(row) {
  return {
    id: row.id,
    productId: row.product_id,
    code: row.code,
    variant: row.variant || '',
    color: row.color || '',
    size: row.size || '',
    grossWeight: number(row.gross_weight),
    cost: number(row.cost),
    currency: row.currency || 'USD',
    moq: integer(row.moq, 1),
    leadTime: row.lead_time == null ? null : integer(row.lead_time),
    hs: row.hs_code || '',
    status: row.status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function normalizePackage(row) {
  return {
    id: row.id,
    skuId: row.sku_id,
    code: row.package_code,
    qtyPerSet: integer(row.quantity_per_set, 1),
    l: number(row.length),
    w: number(row.width),
    h: number(row.height),
    grossWeight: number(row.gross_weight),
    netWeight: row.net_weight == null ? null : number(row.net_weight),
    stackable: Boolean(row.stackable),
    keepUpright: Boolean(row.keep_upright),
    fragile: Boolean(row.fragile),
    maxStackLayers: row.max_stack_layers == null ? null : integer(row.max_stack_layers),
    maxTopLoad: row.max_top_load == null ? null : number(row.max_top_load)
  };
}

export function normalizeQuote(row, items = []) {
  const first = items[0] || {};
  let snapshot = {};
  try { snapshot = JSON.parse(row.cost_snapshot || '{}'); } catch (_) {}
  return {
    id: row.id,
    quoteNo: row.quote_no,
    companyId: row.company_id || '',
    skuId: first.sku_id || '',
    qty: integer(first.quantity, 0),
    unitCost: number(first.unit_cost),
    unitPrice: number(first.unit_price),
    total: number(row.total),
    margin: number(row.margin),
    currency: row.currency || 'USD',
    incoterm: row.incoterm || '',
    status: row.status || 'Draft',
    costSnapshot: snapshot,
    items: items.map(i => ({
      id: i.id, skuId: i.sku_id, qty: integer(i.quantity, 1), unitCost: number(i.unit_cost),
      unitPrice: number(i.unit_price), currency: i.currency || row.currency || 'USD', lineTotal: number(i.line_total)
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
