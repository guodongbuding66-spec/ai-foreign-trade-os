import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { evaluateRuleSet } from '../functions/_lib/rule-engine.js';

const db = new DatabaseSync(':memory:');
for (const file of [
  'migrations/0001_init.sql',
  'migrations/0002_foundation.sql',
  'migrations/0003_auth.sql',
  'migrations/0004_commercial.sql',
  'migrations/0005_ai_credentials.sql',
  'migrations/0006_rule_engine.sql'
]) {
  db.exec(fs.readFileSync(file, 'utf8'));
}

const version = db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get();
assert.equal(String(version?.value), '6', 'schema version must be 6');

const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
for (const table of [
  'letters_of_credit','lc_required_documents','document_discrepancies','document_custody',
  'shipment_events','shipment_legs','load_plan_unloaded_items'
]) assert.ok(tables.has(table), `missing table ${table}`);

function columns(table) { return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name)); }
for (const col of ['pol','pod','promised_etd','promised_eta','packaging_terms','shipping_marks']) assert.ok(columns('orders').has(col), `orders missing ${col}`);
for (const col of ['normalized_json','parsed_text','extraction_status','extraction_provider','extraction_model','extracted_at','validation_status']) assert.ok(columns('document_versions').has(col), `document_versions missing ${col}`);
for (const col of ['actual_on_board_at','actual_departure_at','actual_arrival_at']) assert.ok(columns('shipments').has(col), `shipments missing ${col}`);
for (const col of ['order_id','shipment_id','package_master_snapshot_json']) assert.ok(columns('load_plans').has(col), `load_plans missing ${col}`);

const indexes = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name));
for (const index of ['idx_lc_tenant_status','idx_lc_required_lc','idx_discrepancies_order_status','idx_custody_document','idx_shipment_events_ship_time','idx_shipment_legs_ship_seq','idx_load_plans_order','idx_load_unloaded_plan']) assert.ok(indexes.has(index), `missing index ${index}`);

const base = {
  order:{id:'ord1',company_id:'c1',currency:'USD',incoterm:'FOB',payment_terms:'30% deposit',pol:'Ningbo',pod:'Hamburg',etd:'2026-09-01',eta:'2026-10-01'},
  orderItems:[{sku_id:'sku1',quantity:2,unit_price:100,currency:'USD'}],
  quote:{currency:'USD'}, quoteItems:[{sku_id:'sku1',quantity:2,unit_price:100,currency:'USD'}],
  shipments:[{id:'s1',shipment_no:'S1',pol:'Ningbo',pod:'Hamburg',etd:'2026-09-01',eta:'2026-10-01',vessel:'A',actual_on_board_at:'2026-09-01T12:00:00Z'}],
  loadPlans:[{id:'lp1',plan_no:'LP1',total_weight:20}],
  loadItems:[{load_plan_id:'lp1',sku_id:'sku1',package_id:'p1',package_code:'A',gross_weight:10},{load_plan_id:'lp1',sku_id:'sku1',package_id:'p1',package_code:'A',gross_weight:10}],
  unloadedItems:[], packages:[{id:'p1',sku_id:'sku1',package_code:'A',quantity_per_set:1}], shipmentLegs:[], letterOfCredit:null, documentVersions:[]
};
let result = evaluateRuleSet(base);
assert.equal(result.issues.length,0,'clean fixture must pass');
result = evaluateRuleSet({...base,quote:{currency:'EUR'}});
assert.ok(result.issues.some(x=>x.ruleKey==='ORDER-002'),'currency mismatch must be detected');
result = evaluateRuleSet({...base,loadItems:[base.loadItems[0]]});
assert.ok(result.issues.some(x=>x.ruleKey==='LOAD-001'&&x.severity==='Critical'),'1-set-N-carton mismatch must block');
result = evaluateRuleSet({...base,documentVersions:[{id:'v1',document_id:'d1',document_type:'CI',version_no:1,normalized_json:'{"marks":"ABC"}'},{id:'v2',document_id:'d2',document_type:'PL',version_no:1,normalized_json:'{"marks":"XYZ"}'}]});
assert.ok(result.issues.some(x=>x.ruleKey==='DOC-003'),'document mark mismatch must be detected');
result = evaluateRuleSet({...base,letterOfCredit:{partial_shipment:'not allowed'},shipments:[base.shipments[0],{...base.shipments[0],id:'s2',shipment_no:'S2'}]});
assert.ok(result.issues.some(x=>x.ruleKey==='LC-002'&&x.severity==='Critical'),'forbidden partial shipment must block');

console.log('Rule engine schema + behavior smoke OK');
