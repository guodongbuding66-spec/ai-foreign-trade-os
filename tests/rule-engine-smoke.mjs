import assert from 'node:assert/strict';
import { evaluateRuleSet } from '../functions/_lib/rule-engine.js';

const base = {
  order:{id:'ord1',company_id:'c1',currency:'USD',incoterm:'FOB',payment_terms:'30% deposit',pol:'Ningbo',pod:'Hamburg',etd:'2026-09-01',eta:'2026-10-01'},
  orderItems:[{sku_id:'sku1',quantity:2,unit_price:100,currency:'USD'}],
  quote:{currency:'USD'},
  quoteItems:[{sku_id:'sku1',quantity:2,unit_price:100,currency:'USD'}],
  shipments:[{id:'s1',shipment_no:'S1',pol:'Ningbo',pod:'Hamburg',etd:'2026-09-01',eta:'2026-10-01',vessel:'A',actual_on_board_at:'2026-09-01T12:00:00Z'}],
  loadPlans:[{id:'lp1',plan_no:'LP1',total_weight:20}],
  loadItems:[{load_plan_id:'lp1',sku_id:'sku1',package_id:'p1',package_code:'A',gross_weight:10},{load_plan_id:'lp1',sku_id:'sku1',package_id:'p1',package_code:'A',gross_weight:10}],
  unloadedItems:[],
  packages:[{id:'p1',sku_id:'sku1',package_code:'A',quantity_per_set:1}],
  shipmentLegs:[],
  letterOfCredit:null,
  documentVersions:[]
};

let r = evaluateRuleSet(base);
assert.equal(r.blocking,false);
assert.equal(r.issues.length,0);

r = evaluateRuleSet({...base, quote:{currency:'EUR'}});
assert.ok(r.issues.some(x=>x.ruleKey==='ORDER-002'));

r = evaluateRuleSet({...base, loadItems:[base.loadItems[0]]});
assert.ok(r.issues.some(x=>x.ruleKey==='LOAD-001' && x.severity==='Critical'));
assert.equal(r.blocking,true);

r = evaluateRuleSet({...base, documentVersions:[
  {id:'v1',document_id:'d1',document_type:'CI',version_no:1,normalized_json:JSON.stringify({marks:'ABC'})},
  {id:'v2',document_id:'d2',document_type:'PL',version_no:1,normalized_json:JSON.stringify({marks:'XYZ'})}
]});
assert.ok(r.issues.some(x=>x.ruleKey==='DOC-003'));

r = evaluateRuleSet({...base,
  letterOfCredit:{partial_shipment:'not allowed',transshipment:'unknown'},
  shipments:[base.shipments[0],{...base.shipments[0],id:'s2',shipment_no:'S2'}]
});
assert.ok(r.issues.some(x=>x.ruleKey==='LC-002' && x.severity==='Critical'));

r = evaluateRuleSet({...base, documentVersions:[
  {id:'v3',document_id:'d3',document_type:'BL',version_no:1,normalized_json:JSON.stringify({clean_status:'unclean',on_board_date:'2026-08-31T00:00:00Z',vessel:'B',pol:'Shanghai'})}
]});
assert.ok(r.issues.some(x=>x.ruleKey==='BL-003'));
assert.ok(r.issues.some(x=>x.ruleKey==='BL-004'));
assert.ok(r.issues.some(x=>x.ruleKey==='BL-002'));

console.log('Rule engine smoke OK');
