import assert from 'node:assert/strict';
import { aiGatewayStatus, listAIProviders, parseStructuredText, resolveAIProvider } from '../functions/_lib/ai-gateway.js';

const env={ANTHROPIC_API_KEY:'a',DEEPSEEK_API_KEY:'d',DEEPSEEK_MODEL:'deepseek-v4-flash',AI_DEFAULT_PROVIDER:'deepseek',AI_PROVIDER_CONFIG_JSON:JSON.stringify([{id:'custom-qwen',name:'Custom Qwen',protocol:'openai_chat',baseUrl:'https://example.ai/v1',model:'qwen-test',secretEnv:'CUSTOM_QWEN_KEY',capabilities:{webSearch:false}}]),CUSTOM_QWEN_KEY:'q'};
const providers=listAIProviders(env);
assert.ok(providers.find(p=>p.id==='anthropic')?.configured);
assert.ok(providers.find(p=>p.id==='deepseek')?.configured);
assert.ok(providers.find(p=>p.id==='custom-qwen')?.configured);
assert.equal(resolveAIProvider(env,'draft','deepseek').id,'deepseek');
assert.equal(resolveAIProvider(env,'research','').id,'anthropic');
assert.deepEqual(parseStructuredText('```json\n{"ok":true}\n```'),{ok:true});
const status=aiGatewayStatus(env);
assert.equal(status.configured,true);
assert.ok(status.providerCount>=3);
console.log('Universal AI gateway smoke OK');
