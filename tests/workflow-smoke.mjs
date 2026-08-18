import assert from 'node:assert/strict';
import { automationPayload, loadPlanPayload, opportunityPayload, taskPayload } from '../functions/_lib/workflowdata.js';

assert.equal(opportunityPayload({companyId:'co_1',name:'Program',value:1000,probability:45}).value.probability,45);
assert.equal(opportunityPayload({companyId:'',name:'Program'}).error,'company_required');
assert.equal(taskPayload({title:'Follow up',due:'2026-08-19'}).value.status,'open');
assert.equal(automationPayload({name:'Hot lead',trigger:'manual',condition:'score>=85',action:'create.followup.task'}).value.enabled,true);
const lp=loadPlanPayload({containerType:'20GP',container:{l:589.8,w:235.2,h:239.3},skuId:'sku_1',sets:20,placed:[{code:'A'}],unloaded:[],metrics:{usedCBM:1}});
assert.equal(lp.value.containerType,'20GP');
assert.equal(lp.value.placed.length,1);
assert.equal(lp.value.sets,20);
console.log('Workflow smoke OK');
