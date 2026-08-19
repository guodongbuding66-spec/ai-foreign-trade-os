import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

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
  'letters_of_credit',
  'lc_required_documents',
  'document_discrepancies',
  'document_custody',
  'shipment_events',
  'shipment_legs',
  'load_plan_unloaded_items'
]) {
  assert.ok(tables.has(table), `missing table ${table}`);
}

function columns(table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name));
}

for (const col of ['pol','pod','promised_etd','promised_eta','packaging_terms','shipping_marks']) {
  assert.ok(columns('orders').has(col), `orders missing ${col}`);
}
for (const col of ['normalized_json','parsed_text','extraction_status','extraction_provider','extraction_model','extracted_at','validation_status']) {
  assert.ok(columns('document_versions').has(col), `document_versions missing ${col}`);
}
for (const col of ['actual_on_board_at','actual_departure_at','actual_arrival_at']) {
  assert.ok(columns('shipments').has(col), `shipments missing ${col}`);
}
for (const col of ['order_id','shipment_id','package_master_snapshot_json']) {
  assert.ok(columns('load_plans').has(col), `load_plans missing ${col}`);
}

const indexes = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name));
for (const index of [
  'idx_lc_tenant_status',
  'idx_lc_required_lc',
  'idx_discrepancies_order_status',
  'idx_custody_document',
  'idx_shipment_events_ship_time',
  'idx_shipment_legs_ship_seq',
  'idx_load_plans_order',
  'idx_load_unloaded_plan'
]) {
  assert.ok(indexes.has(index), `missing index ${index}`);
}

console.log('Rule engine schema smoke OK: v6 tables, columns, and indexes present');
