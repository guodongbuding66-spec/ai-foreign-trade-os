import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
for (const file of ['migrations/0001_init.sql','migrations/0002_foundation.sql','migrations/0003_auth.sql','migrations/0004_commercial.sql']) {
  db.exec(fs.readFileSync(file, 'utf8'));
}

const version = db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get();
assert.equal(String(version?.value), '4', 'schema version must be 4');

const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
for (const table of ['orders','order_items','documents','document_versions','shipments','outreach_drafts']) {
  assert.ok(tables.has(table), `missing table ${table}`);
}

const indexes = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name));
for (const index of ['idx_orders_tenant_status','idx_order_items_order','idx_document_versions_document','idx_shipments_tenant_status','idx_outreach_tenant_status']) {
  assert.ok(indexes.has(index), `missing index ${index}`);
}

console.log('Commercial schema smoke OK: v4 tables and indexes present');
