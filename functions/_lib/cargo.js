import { json } from './auth.js';
export const CARGO_MAX_BYTES=1024*1024;
export async function cargoSchema(DB){
  await DB.batch([
    DB.prepare('CREATE TABLE IF NOT EXISTS cargo_workspaces (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL)'),
    DB.prepare('CREATE TABLE IF NOT EXISTS cargo_shares (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL)')
  ]);
}
export async function cargoBody(request){
  if(!request.headers.get('content-type')?.includes('application/json'))throw Error('invalid_content_type');
  if(Number(request.headers.get('content-length')||0)>CARGO_MAX_BYTES)throw Error('payload_too_large');
  const reader=request.body?.getReader();if(!reader)throw Error('empty_body');const parts=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>CARGO_MAX_BYTES){await reader.cancel();throw Error('payload_too_large');}parts.push(value);}
  const all=new Uint8Array(size);let offset=0;for(const p of parts){all.set(p,offset);offset+=p.byteLength;}return JSON.parse(new TextDecoder().decode(all));
}
export function validateWorkspace(payload){
  if(typeof payload!=='string'||new TextEncoder().encode(payload).length>CARGO_MAX_BYTES)throw Error('invalid_workspace');
  const p=JSON.parse(payload);if(p?.format!=='cargo-fit-workspace'||p.version!==1||!Array.isArray(p.inputs?.products)||p.inputs.products.length<1||p.inputs.products.length>1000)throw Error('invalid_workspace');
  // Stored as opaque text; client independently validates all coordinates before use.
  return payload;
}
export const cargoError=e=>json({ok:false,error:e?.message==='payload_too_large'?'payload_too_large':e?.message==='invalid_workspace'?'invalid_workspace':'cargo_operation_failed'},e?.message==='payload_too_large'?413:400);

/** Reject foreign/mismatched references before passing a plan into the existing OS writer. */
export async function validateCargoReferences(DB, tenantId, body) {
  if(!Array.isArray(body?.placed)||!body.placed.length||body.placed.length>12000)throw Error('invalid_plan');
  const skus=new Set(),packages=new Map();
  if(body.skuId)skus.add(body.skuId);
  for(const b of body.placed){
    if(!b||![b.x,b.y,b.z,b.l,b.w,b.h,b.weight].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)||Math.min(b.l,b.w,b.h)<=0)throw Error('invalid_coordinates');
    if(b.skuId)skus.add(b.skuId);
    if(b.pkgId){if(!b.skuId||packages.has(b.pkgId)&&packages.get(b.pkgId)!==b.skuId)throw Error('invalid_package');packages.set(b.pkgId,b.skuId);}
  }
  for(const id of skus)if(typeof id!=='string'||!await DB.prepare('SELECT id FROM skus WHERE id=? AND tenant_id=?').bind(id,tenantId).first())throw Error('invalid_sku');
  for(const [id,skuId] of packages)if(typeof id!=='string'||!await DB.prepare('SELECT id FROM sku_packages WHERE id=? AND sku_id=? AND tenant_id=?').bind(id,skuId,tenantId).first())throw Error('invalid_package');
  if(body.sourceOrderIds!==undefined){if(!Array.isArray(body.sourceOrderIds)||body.sourceOrderIds.length>100)throw Error('invalid_order');for(const id of new Set(body.sourceOrderIds))if(typeof id!=='string'||!await DB.prepare('SELECT id FROM orders WHERE id=? AND tenant_id=?').bind(id,tenantId).first())throw Error('invalid_order');}
}
