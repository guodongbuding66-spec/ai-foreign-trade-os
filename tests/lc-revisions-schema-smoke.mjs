import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const db=new DatabaseSync(':memory:');
for(const file of [
  'migrations/0001_init.sql','migrations/0002_foundation.sql','migrations/0003_auth.sql',
  'migrations/0004_commercial.sql','migrations/0005_ai_credentials.sql','migrations/0006_rule_engine.sql',
  'migrations/0007_lc_revisions.sql'
]) db.exec(fs.readFileSync(file,'utf8'));

const version=db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get();
assert.equal(String(version?.value),'7','schema version must be 7');
const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
assert.ok(tables.has('lc_revisions'),'missing lc_revisions');
const cols=new Set(db.prepare('PRAGMA table_info(lc_revisions)').all().map(r=>r.name));
for(const col of ['id','tenant_id','letter_of_credit_id','revision_no','source_document_id','source_document_version_id','source_type','source_ref','source_hash','snapshot_json','required_documents_json','note','created_by','created_at'])assert.ok(cols.has(col),`lc_revisions missing ${col}`);
const indexes=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r=>r.name));
for(const index of ['idx_lc_revisions_lc_rev','idx_lc_revisions_tenant_created','idx_lc_revisions_source_document'])assert.ok(indexes.has(index),`missing index ${index}`);

// Prove immutable ordered history can coexist for one L/C.
db.exec("INSERT INTO tenants(id,name,created_at,updated_at) VALUES('t1','T','2026-01-01','2026-01-01')");
db.exec("INSERT INTO letters_of_credit(id,tenant_id,lc_no,status,created_at,updated_at) VALUES('lc1','t1','LC-001','Draft','2026-01-01','2026-01-01')");
const ins=db.prepare("INSERT INTO lc_revisions(id,tenant_id,letter_of_credit_id,revision_no,source_type,snapshot_json,required_documents_json,created_at) VALUES(?,?,?,?,?,?,?,?)");
ins.run('r1','t1','lc1',1,'original',JSON.stringify({amount:100,currency:'USD'}),'[]','2026-01-01');
ins.run('r2','t1','lc1',2,'amendment',JSON.stringify({amount:110,currency:'USD'}),'[]','2026-01-02');
const rows=db.prepare('SELECT revision_no,source_type,snapshot_json FROM lc_revisions WHERE letter_of_credit_id=? ORDER BY revision_no').all('lc1');
assert.equal(rows.length,2);
assert.equal(rows[0].source_type,'original');
assert.equal(rows[1].source_type,'amendment');
assert.equal(JSON.parse(rows[1].snapshot_json).amount,110);
assert.throws(()=>ins.run('r3','t1','lc1',2,'amendment','{}','[]','2026-01-03'),/UNIQUE/,'revision number must be unique per L/C');

console.log('L/C revision schema v7 smoke OK');
