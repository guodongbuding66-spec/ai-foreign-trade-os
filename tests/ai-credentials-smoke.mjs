import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { decryptAIKey, encryptAIKey, validateCredentialInput } from '../functions/_lib/ai-credentials.js';

const db=new DatabaseSync(':memory:');
for(const file of ['migrations/0001_init.sql','migrations/0002_foundation.sql','migrations/0003_auth.sql','migrations/0004_commercial.sql','migrations/0005_ai_credentials.sql'])db.exec(fs.readFileSync(file,'utf8'));
const version=db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get();
assert.equal(String(version?.value),'5');
const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
assert.ok(tables.has('ai_provider_credentials'));
assert.ok(tables.has('ai_user_preferences'));

const secret='this-is-a-long-master-secret-used-only-for-tests-1234567890';
const plain='sk-test-personal-provider-key-abcdef123456';
const encrypted=await encryptAIKey(secret,'tenant_1','user_1','deepseek',plain);
assert.notEqual(encrypted.ciphertext,plain);
assert.equal(await decryptAIKey(secret,'tenant_1','user_1','deepseek',encrypted.ciphertext,encrypted.iv),plain);
await assert.rejects(()=>decryptAIKey(secret,'tenant_1','user_1','openai',encrypted.ciphertext,encrypted.iv));

assert.equal(validateCredentialInput({providerId:'deepseek',apiKey:'12345678',model:'deepseek-test'}).providerId,'deepseek');
assert.equal(validateCredentialInput({providerId:'custom-qwen',apiKey:'12345678',protocol:'openai_chat',baseUrl:'https://example.ai/v1',model:'qwen-test'}).error,undefined);
assert.equal(validateCredentialInput({providerId:'custom-bad',apiKey:'12345678',protocol:'openai_chat',baseUrl:'http://insecure.example',model:'x'}).error,'provider_base_url_invalid');

console.log('AI credentials smoke OK: schema v5 + AES-GCM BYOK');
