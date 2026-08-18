import { json, randomId } from './auth.js';

export const clean = (v, max=500) => String(v ?? '').trim().slice(0,max);
export const number = (v, fallback=0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
export const integer = (v, fallback=0) => Math.trunc(number(v,fallback));
export const clamp = (v,min,max) => Math.max(min,Math.min(max,number(v,min)));
export const parseJson = (v,fallback={}) => { try { return typeof v === 'string' ? JSON.parse(v) : (v ?? fallback); } catch { return fallback; } };

export function normalizeOpportunity(r){return{id:r.id,companyId:r.company_id,name:r.name,stage:r.stage||'New',value:number(r.value),currency:r.currency||'USD',probability:integer(r.probability),expectedCloseDate:r.expected_close_date||'',ownerUserId:r.owner_user_id||null,createdAt:r.created_at,updatedAt:r.updated_at}}
export function opportunityPayload(b){const name=clean(b?.name,240),companyId=clean(b?.companyId,120);if(!name)return{error:'opportunity_name_required'};if(!companyId)return{error:'company_required'};return{value:{companyId,name,stage:clean(b?.stage,80)||'New',value:Math.max(0,number(b?.value)),currency:clean(b?.currency,8)||'USD',probability:clamp(b?.probability,0,100),expectedCloseDate:clean(b?.expectedCloseDate,32)}}}

export function normalizeTask(r){return{id:r.id,title:r.title,status:r.status||'open',priority:r.priority||'normal',due:r.due_at||'',ownerUserId:r.owner_user_id||null,entityType:r.entity_type||'',entityId:r.entity_id||'',createdAt:r.created_at,updatedAt:r.updated_at}}
export function taskPayload(b){const title=clean(b?.title,300);if(!title)return{error:'task_title_required'};return{value:{title,status:clean(b?.status,40)||'open',priority:clean(b?.priority,40)||'normal',due:clean(b?.due||b?.dueAt,40),entityType:clean(b?.entityType,80),entityId:clean(b?.entityId,120)}}}

export function normalizeAutomation(r){const condition=parseJson(r.condition_json,{}),action=parseJson(r.action_json,{});return{id:r.id,name:r.name,trigger:r.trigger_key,condition:condition.expression||condition.key||'',action:action.key||action.action||'',enabled:Boolean(r.enabled),lastRun:r.last_run_at||null,createdAt:r.created_at,updatedAt:r.updated_at}}
export function automationPayload(b){const name=clean(b?.name,240);if(!name)return{error:'automation_name_required'};return{value:{name,trigger:clean(b?.trigger,120)||'manual',condition:clean(b?.condition,500)||'always',action:clean(b?.action,160),enabled:b?.enabled!==false,lastRun:b?.lastRun?clean(b.lastRun,40):null}}}

export function normalizeLoadPlan(r){const result=parseJson(r.result_json,{});return{...result,id:r.id,containerType:result.containerType||r.container_type,container:result.container||parseJson(r.container_json,{}),createdAt:result.createdAt||r.created_at,metrics:result.metrics||{volumeUtilization:number(r.volume_utilization),weightUtilization:number(r.weight_utilization),usedCBM:number(r.used_cbm),totalWeight:number(r.total_weight),cartons:number(r.cartons_placed),unloaded:number(r.cartons_unloaded)},status:r.status||'Draft',solverVersion:r.solver_version||''}}
export function loadPlanPayload(b){const containerType=clean(b?.containerType,32);const container=b?.container&&typeof b.container==='object'?b.container:null;const placed=Array.isArray(b?.placed)?b.placed:[];const unloaded=Array.isArray(b?.unloaded)?b.unloaded:[];const metrics=b?.metrics&&typeof b.metrics==='object'?b.metrics:{};if(!containerType||!container)return{error:'container_required'};return{value:{containerType,container,skuId:clean(b?.skuId,120),sets:Math.max(1,integer(b?.sets,1)),placed,unloaded,metrics,status:clean(b?.status,40)||'Draft',solverVersion:clean(b?.solverVersion,120)||'axis-greedy-v1',createdAt:clean(b?.createdAt,40)||new Date().toISOString()}}}

export async function ensureTenantCompany(DB,tenantId,id){if(!id)return false;return Boolean(await DB.prepare('SELECT id FROM companies WHERE id=? AND tenant_id=? LIMIT 1').bind(id,tenantId).first())}
export async function ensureTenantSku(DB,tenantId,id){if(!id)return false;return Boolean(await DB.prepare('SELECT id FROM skus WHERE id=? AND tenant_id=? LIMIT 1').bind(id,tenantId).first())}

export function dbError(error, fallback='database_write_failed'){const m=String(error?.message||error);return json({ok:false,error:fallback,detail:m.slice(0,180)},500)}
export { randomId };
