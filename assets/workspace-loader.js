(() => {
  'use strict';

  const STORAGE_KEY = 'aftos.v1.store';
  const nativeGet = localStorage.getItem.bind(localStorage);
  const nativeSet = localStorage.setItem.bind(localStorage);
  let syncChain = Promise.resolve();
  let auth = null;
  const server = { companies:new Map(), contacts:new Map(), products:new Map(), skus:new Map(), quotes:new Map() };

  const str = v => String(v ?? '').trim();
  const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  const clamp = (v,min,max) => Math.max(min,Math.min(max,num(v)));
  const mapOf = (items, fn) => new Map((items||[]).map(x=>[String(x?.id||''),fn(x)]).filter(([id])=>id));
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

  function company(c){return{id:str(c?.id),legalName:str(c?.legalName),country:str(c?.country).toUpperCase(),city:str(c?.city),type:str(c?.type)||'Other',industry:str(c?.industry),score:clamp(c?.score,0,100),stage:str(c?.stage)||'New',website:str(c?.website),source:str(c?.source)||'Manual'}}
  function contact(c){return{id:str(c?.id),companyId:str(c?.companyId),name:str(c?.name),title:str(c?.title),department:str(c?.department),seniority:str(c?.seniority),email:str(c?.email).toLowerCase(),emailStatus:str(c?.emailStatus)||'unknown',phone:str(c?.phone),whatsapp:str(c?.whatsapp),linkedin:str(c?.linkedin),language:str(c?.language),timezone:str(c?.timezone)}}
  function product(p){return{id:str(p?.id),name:str(p?.name),category:str(p?.category),series:str(p?.series),hs:str(p?.hs),material:str(p?.material),market:str(p?.market),status:str(p?.status)||'active'}}
  function packageRow(p){return{id:str(p?.id),code:str(p?.code),qtyPerSet:Math.max(1,Math.trunc(num(p?.qtyPerSet)||1)),l:num(p?.l),w:num(p?.w),h:num(p?.h),grossWeight:Math.max(0,num(p?.grossWeight)),netWeight:p?.netWeight==null?null:Math.max(0,num(p?.netWeight)),stackable:p?.stackable!==false,keepUpright:Boolean(p?.keepUpright),fragile:Boolean(p?.fragile),maxStackLayers:p?.maxStackLayers==null?null:Math.max(1,Math.trunc(num(p.maxStackLayers))),maxTopLoad:p?.maxTopLoad==null?null:Math.max(0,num(p.maxTopLoad))}}
  function sku(s, packages){return{id:str(s?.id),productId:str(s?.productId),code:str(s?.code),variant:str(s?.variant),color:str(s?.color),size:str(s?.size),cost:Math.max(0,num(s?.cost)),currency:str(s?.currency)||'USD',moq:Math.max(1,Math.trunc(num(s?.moq)||1)),leadTime:s?.leadTime==null?null:Math.max(0,Math.trunc(num(s?.leadTime))),hs:str(s?.hs),status:str(s?.status)||'active',packages:(packages||[]).filter(p=>p.skuId===s.id).map(packageRow).sort((a,b)=>a.code.localeCompare(b.code)||a.id.localeCompare(b.id))}}
  function quote(q){return{id:str(q?.id),quoteNo:str(q?.quoteNo),companyId:str(q?.companyId),skuId:str(q?.skuId),qty:Math.max(1,Math.trunc(num(q?.qty)||1)),unitCost:Math.max(0,num(q?.unitCost)),unitPrice:Math.max(0,num(q?.unitPrice)),total:Math.max(0,num(q?.total)),margin:clamp(q?.margin,0,100),currency:str(q?.currency)||'USD',incoterm:str(q?.incoterm),status:str(q?.status)||'Draft',costSnapshot:q?.costSnapshot&&typeof q.costSnapshot==='object'?q.costSnapshot:{}}}

  async function api(path, options={}){
    const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
    const type=response.headers.get('content-type')||'';let data=null;
    if(type.includes('application/json'))data=await response.json();else data={ok:false,error:`http_${response.status}`,responseType:type||'unknown'};
    if(response.status===401){location.replace(`/login.html?return=${encodeURIComponent(location.pathname+location.hash)}`);throw new Error('unauthorized')}
    if(!response.ok){const error=new Error(data?.error||`http_${response.status}`);error.status=response.status;error.data=data;throw error}
    return data;
  }

  function ensureStore(){try{const parsed=JSON.parse(nativeGet(STORAGE_KEY)||'null');if(parsed&&typeof parsed==='object')return parsed}catch(_){}const now=new Date().toISOString();return{meta:{version:'1.0.0-d1',tenantId:auth?.tenant?.id||'',createdAt:now},companies:[],contacts:[],products:[],skus:[],packages:[],quotes:[],opportunities:[],tasks:[],automations:[],activities:[],loadPlans:[]}}

  function setBadge(text,type='ok'){const apply=()=>{const foot=document.querySelector('.sidebar-foot');if(!foot)return false;let badge=document.getElementById('d1SyncBadge');if(!badge){badge=document.createElement('div');badge.id='d1SyncBadge';badge.style.cssText='margin-top:8px;font-size:10px;line-height:1.4';foot.appendChild(badge)}const color=type==='bad'?'#fb7185':type==='busy'?'#fbbf24':'#34d399';badge.innerHTML=`<span style="color:${color}">●</span> ${text}`;return true};if(!apply())setTimeout(apply,250)}
  function badgeText(){return`D1 · ${server.companies.size}C / ${server.contacts.size}CT / ${server.products.size}P / ${server.skus.size}SKU / ${server.quotes.size}Q`}

  function loadServerMaps(store){server.companies=mapOf(store.companies,company);server.contacts=mapOf(store.contacts,contact);server.products=mapOf(store.products,product);server.skus=new Map((store.skus||[]).map(s=>[String(s.id||''),sku(s,store.packages||[])]).filter(([id])=>id));server.quotes=mapOf(store.quotes,quote)}

  async function hydrateStore(){const [companyResult,snapshot]=await Promise.all([api('/api/companies'),api('/api/workspace/snapshot')]);const store=ensureStore();store.companies=companyResult.companies||[];store.contacts=snapshot.contacts||[];store.products=snapshot.products||[];store.skus=snapshot.skus||[];store.packages=snapshot.packages||[];store.quotes=snapshot.quotes||[];store.meta={...(store.meta||{}),tenantId:auth?.tenant?.id||'',workspace:auth?.tenant?.name||'',userId:auth?.user?.id||'',d1MasterSyncAt:new Date().toISOString()};nativeSet(STORAGE_KEY,JSON.stringify(store));loadServerMaps(store);return store}

  async function restoreFromServer(message){try{await hydrateStore()}finally{setBadge(message||'D1 restored','bad');setTimeout(()=>location.reload(),900)}}

  async function upsertCompanies(next){for(const[id,value]of next){const previous=server.companies.get(id);if(!previous)await api('/api/companies',{method:'POST',body:JSON.stringify(value)});else if(!same(previous,value))await api(`/api/companies/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(value)})}}
  async function deleteCompanies(next){for(const[id]of server.companies)if(!next.has(id))await api(`/api/companies/${encodeURIComponent(id)}`,{method:'DELETE'})}
  async function syncContacts(next){for(const[id,value]of next){const previous=server.contacts.get(id);if(!previous)await api('/api/contacts',{method:'POST',body:JSON.stringify(value)});else if(!same(previous,value))await api(`/api/contacts/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(value)})}for(const[id]of server.contacts)if(!next.has(id))await api(`/api/contacts/${encodeURIComponent(id)}`,{method:'DELETE'})}
  async function upsertProducts(next){for(const[id,value]of next){const previous=server.products.get(id);if(!previous)await api('/api/products',{method:'POST',body:JSON.stringify(value)});else if(!same(previous,value))await api(`/api/products/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(value)})}}
  async function deleteProducts(next){for(const[id]of server.products)if(!next.has(id))await api(`/api/products/${encodeURIComponent(id)}`,{method:'DELETE'})}
  async function syncSkus(next){for(const[id,value]of next){const previous=server.skus.get(id);if(!previous)await api('/api/skus',{method:'POST',body:JSON.stringify(value)});else if(!same(previous,value))await api(`/api/skus/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(value)})}for(const[id]of server.skus)if(!next.has(id))await api(`/api/skus/${encodeURIComponent(id)}`,{method:'DELETE'})}
  async function syncQuotes(next){for(const[id,value]of next){const previous=server.quotes.get(id);if(!previous)await api('/api/quotes',{method:'POST',body:JSON.stringify(value)});else if(!same(previous,value))await api(`/api/quotes/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(value)})}}

  async function syncStore(store){const companies=mapOf(store.companies,company),contacts=mapOf(store.contacts,contact),products=mapOf(store.products,product),skus=new Map((store.skus||[]).map(s=>[String(s.id||''),sku(s,store.packages||[])]).filter(([id])=>id)),quotes=mapOf(store.quotes,quote);setBadge('D1 syncing…','busy');await upsertCompanies(companies);await upsertProducts(products);await syncContacts(contacts);await syncSkus(skus);await syncQuotes(quotes);await deleteProducts(products);await deleteCompanies(companies);server.companies=companies;server.contacts=contacts;server.products=products;server.skus=skus;server.quotes=quotes;setBadge(badgeText(),'ok')}

  function installSync(){const originalSetItem=localStorage.setItem.bind(localStorage);localStorage.setItem=function(key,value){originalSetItem(key,value);if(key!==STORAGE_KEY)return;let parsed;try{parsed=JSON.parse(value)}catch(_){return}syncChain=syncChain.then(()=>syncStore(parsed)).catch(async error=>{console.error('D1 master sync failed',error);let label=`D1 sync failed: ${error?.message||'unknown'}`;if(error?.data?.error==='company_has_references')label='删除失败：Company 仍有关联数据';if(error?.data?.error==='product_has_skus')label='删除失败：Product 仍有关联 SKU';if(error?.data?.error==='sku_has_references')label='删除失败：SKU 已被 Quote/Load Plan 使用';await restoreFromServer(label)})}}

  function loadWorkspaceApp(){window.__AFTOS_AUTH__=auth;const script=document.createElement('script');script.src='/assets/app.js';script.async=false;script.onload=()=>setBadge(badgeText(),'ok');script.onerror=()=>{document.getElementById('content').innerHTML='<div class="notice">工作台脚本加载失败，请刷新页面。</div>'};document.body.appendChild(script)}

  async function boot(){try{auth=await api('/api/auth/me');await hydrateStore();installSync();loadWorkspaceApp()}catch(error){if(error?.message==='unauthorized')return;const content=document.getElementById('content');if(content)content.innerHTML=`<div class="card"><h2>Workspace initialization failed</h2><div class="notice">${String(error?.message||'Unable to load D1 workspace data')}</div></div>`}}

  boot();
})();
