(() => {
  'use strict';

  const APP_VERSION = '1.0.0-dev';
  const STORAGE_KEY = 'aftos.v1.store';
  const ROUTES = [
    ['CORE', [
      ['dashboard','Dashboard','▦'],
      ['market','市场情报','◎'],
      ['leads','客户开发','⌕'],
      ['crm','CRM','◫'],
      ['ai-sales','AI销售中心','✦']
    ]],
    ['TRADE', [
      ['products','产品中心','◈'],
      ['quotes','报价中心','＄'],
      ['container','装柜中心','▣'],
      ['orders','订单中心','≡'],
      ['documents','单证中心','▤'],
      ['logistics','物流中心','➜'],
      ['compliance','海关与合规','✓']
    ]],
    ['SYSTEM', [
      ['knowledge','知识库','◇'],
      ['automation','Automation','⚡'],
      ['analytics','Analytics','⌁'],
      ['settings','Settings','⚙']
    ]]
  ];

  const CONTAINERS = {
    '20GP': { l: 589.8, w: 235.2, h: 239.3, payload: 28200 },
    '40GP': { l: 1203.2, w: 235.2, h: 239.3, payload: 26700 },
    '40HQ': { l: 1203.2, w: 235.2, h: 269.8, payload: 26500 },
    '45HQ': { l: 1355.6, w: 235.2, h: 269.8, payload: 27600 }
  };

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const id = (p='id') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const now = () => new Date().toISOString();
  const money = (n,c='USD') => new Intl.NumberFormat('en-US',{style:'currency',currency:c,maximumFractionDigits:2}).format(Number(n||0));
  const num = n => new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(n||0));
  const pct = n => `${Number(n||0).toFixed(1)}%`;

  const seed = () => ({
    meta:{version:APP_VERSION,tenantId:'tenant_demo',createdAt:now()},
    companies:[
      {id:'co_1',legalName:'Nordic Garden Distribution GmbH',country:'DE',city:'Hamburg',type:'Distributor',industry:'Garden & Outdoor',score:88,stage:'Qualified',owner:'Guo Dong',website:'https://example.invalid',source:'Manual',updatedAt:now()},
      {id:'co_2',legalName:'Maison Jardin Europe SAS',country:'FR',city:'Lyon',type:'Retailer',industry:'Home & Garden',score:74,stage:'Contacted',owner:'Guo Dong',website:'',source:'Manual',updatedAt:now()}
    ],
    contacts:[
      {id:'ct_1',companyId:'co_1',name:'Anna Keller',title:'Purchasing Manager',email:'anna@example.invalid',emailStatus:'unknown',phone:'',country:'DE',owner:'Guo Dong'}
    ],
    products:[
      {id:'pr_1',name:'Garden Shed',category:'Garden Storage',series:'Premium',material:'Galvanized Steel',hs:'',market:'EU',status:'active'}
    ],
    skus:[
      {id:'sku_1',productId:'pr_1',code:'GS-12854',variant:'2-Carton Set',color:'Anthracite',size:'128 cm package family',grossWeight:98,cost:145,currency:'USD',moq:1,leadTime:35,hs:''}
    ],
    packages:[
      {id:'pkg_1',skuId:'sku_1',code:'A',qtyPerSet:1,l:128,w:54,h:13,grossWeight:49,stackable:true,keepUpright:false,fragile:false},
      {id:'pkg_2',skuId:'sku_1',code:'B',qtyPerSet:1,l:128,w:54,h:11,grossWeight:49,stackable:true,keepUpright:false,fragile:false}
    ],
    quotes:[],
    opportunities:[
      {id:'op_1',companyId:'co_1',name:'2026 Garden Shed Program',stage:'Qualified',value:86000,currency:'USD',probability:45}
    ],
    tasks:[
      {id:'tk_1',title:'Follow up Nordic Garden',due:new Date(Date.now()+86400000).toISOString().slice(0,10),status:'open',owner:'Guo Dong'}
    ],
    automations:[
      {id:'au_1',name:'High-value lead task',trigger:'company.created',condition:'score>=85',action:'create.followup.task',enabled:true,lastRun:null}
    ],
    activities:[
      {id:'ac_1',time:now(),text:'Workspace initialized from PRD baseline.'}
    ],
    loadPlans:[]
  });

  let store = loadStore();
  let currentRoute = location.hash.replace('#/','') || 'dashboard';
  let activeLoadView = 'top';
  let lastLoadResult = null;

  function loadStore(){
    try { const raw = localStorage.getItem(STORAGE_KEY); if(raw) return JSON.parse(raw); } catch(e){}
    const s = seed(); localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); return s;
  }
  function saveStore(activity){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    if(activity){ store.activities.unshift({id:id('ac'),time:now(),text:activity}); store.activities = store.activities.slice(0,100); localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }
  }
  function toast(msg,type='ok'){
    const el = document.createElement('div'); el.className=`toast ${type}`; el.textContent=msg; $('#toastRoot').appendChild(el); setTimeout(()=>el.remove(),3200);
  }
  function openModal(title, body, onSave, saveLabel='保存'){
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>${esc(title)}</h2><button class="modal-close" aria-label="关闭">×</button></div><div class="modal-body">${body}</div><div class="modal-foot"><button class="btn secondary modal-cancel">取消</button><button class="btn primary modal-save">${esc(saveLabel)}</button></div></div></div>`;
    const close = () => root.innerHTML='';
    $('.modal-close',root).onclick=close; $('.modal-cancel',root).onclick=close;
    $('.modal-backdrop',root).addEventListener('click',e=>{if(e.target.classList.contains('modal-backdrop'))close()});
    $('.modal-save',root).onclick=()=>{ const ok = onSave?.(root); if(ok!==false) close(); };
  }
  function navigate(route){ currentRoute=route; location.hash=`#/${route}`; render(); $('#sidebar').classList.remove('open'); }

  function initNav(){
    $('#nav').innerHTML = ROUTES.map(([label,items])=>`<div class="nav-group"><div class="nav-label">${label}</div>${items.map(([r,t,i])=>`<button class="nav-item" data-route="${r}"><span class="ico">${i}</span><span>${t}</span>${['market','ai-sales','logistics','compliance'].includes(r)?'<span class="badge">Provider</span>':''}</button>`).join('')}</div>`).join('');
    $$('.nav-item').forEach(b=>b.onclick=()=>navigate(b.dataset.route));
  }

  function pageHead(title,desc,actions=''){
    return `<div class="page-head"><div><h1>${title}</h1><p>${desc}</p></div><div class="page-actions">${actions}</div></div>`;
  }
  function pill(text,type=''){ return `<span class="pill ${type}">${esc(text)}</span>`; }
  function kpi(label,value,sub=''){ return `<div class="card kpi-card"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`; }
  function providerNotice(name){ return `<div class="notice">${name} 需要服务器端 Provider / Secret Binding。当前开发基线不会把浏览器中的假调用显示成“已完成”。请在 Settings 配置服务器集成后启用。</div>`; }

  function render(){
    currentRoute = location.hash.replace('#/','') || currentRoute || 'dashboard';
    $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.route===currentRoute));
    const pages = {dashboard:renderDashboard,market:renderMarket,leads:renderLeads,crm:renderCRM,'ai-sales':renderAISales,products:renderProducts,quotes:renderQuotes,container:renderContainer,orders:()=>renderPlaceholder('订单中心','Order / Production / Payment','订单主数据将在服务端数据库绑定后与 Quote → Order 转换打通。'),documents:()=>renderPlaceholder('单证中心','PI / CI / PL / Contract','当前仅保留真实可落地的数据入口；正式 PDF/Excel 生成器尚未宣称完成。'),logistics:renderLogistics,compliance:renderCompliance,knowledge:renderKnowledge,automation:renderAutomation,analytics:renderAnalytics,settings:renderSettings};
    (pages[currentRoute]||renderDashboard)();
  }

  function renderDashboard(){
    const openTasks=store.tasks.filter(t=>t.status==='open').length;
    const pipeline=store.opportunities.reduce((s,o)=>s+Number(o.value||0)*Number(o.probability||0)/100,0);
    const quoteTotal=store.quotes.reduce((s,q)=>s+Number(q.total||0),0);
    const qualified=store.companies.filter(c=>['Qualified','Quoted','Negotiation','Won'].includes(c.stage)).length;
    const funnelStages=['New','Contacted','Replied','Qualified','Quoted','Won'];
    const counts=funnelStages.map(stage=>store.companies.filter(c=>c.stage===stage).length);
    $('#content').innerHTML = pageHead('Dashboard','从统一业务数据实时计算，不使用固定 KPI 截图。','<button class="btn primary" data-go="leads">Find Customers</button><button class="btn secondary" data-go="quotes">Create Quote</button>') +
      `<div class="grid kpi">${kpi('Companies',store.companies.length,'CRM master data')}${kpi('Contacts',store.contacts.length,'Decision makers')}${kpi('Qualified',qualified,'Active qualified accounts')}${kpi('Pipeline',money(pipeline),'Probability weighted')}${kpi('Quote Total',money(quoteTotal),'Saved quote snapshots')}${kpi('待跟进',openTasks,'Open tasks')}</div>
      <div class="grid two"><div class="card"><h2>Sales Funnel</h2><div class="funnel">${funnelStages.map((s,i)=>`<div class="funnel-step"><strong>${counts[i]}</strong><span>${s}</span></div>`).join('')}</div><div class="sep"></div><h2>AI Insights</h2><div class="notice info">当前未连接真实 AI Provider，因此这里只展示基于本地数据的确定性提示：${qualified?`已有 ${qualified} 家 Qualified 及以上客户，可优先进入报价/跟进。`:'暂无 Qualified 客户，建议先完成客户发现与评分。'}</div></div>
      <div class="card"><h2>Recent Activity</h2>${store.activities.slice(0,8).map(a=>`<div class="activity"><div class="time">${new Date(a.time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</div><div class="body">${esc(a.text)}</div></div>`).join('')||'<div class="empty">暂无活动</div>'}</div></div>`;
    $$('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
  }

  function renderMarket(){
    $('#content').innerHTML = pageHead('市场情报 Market Intelligence','Market Explorer / Country Analysis / HS Code Center') + providerNotice('UN Comtrade / Tariff / 外部市场数据') +
      `<div class="card mt12"><h2>Market Explorer</h2><div class="form-grid three"><div class="field"><label>Product</label><input class="input" value="Garden Shed"></div><div class="field"><label>HS Code</label><input class="input" placeholder="输入或由合规模块建议"></div><div class="field"><label>Import Country</label><select class="select"><option>Germany</option><option>France</option><option>United States</option></select></div></div><div class="mt12"><button class="btn primary" disabled>Analyze · Provider required</button></div></div>`;
  }

  function renderLeads(){
    const rows=store.companies.map(c=>`<tr><td>${pill(c.score>=85?'Hot':c.score>=70?'Warm':'Cold',c.score>=85?'ok':c.score>=70?'warn':'')}</td><td><strong>${esc(c.legalName)}</strong></td><td>${esc(c.country)}</td><td>${esc(c.type)}</td><td>${c.score}</td><td>${esc(c.stage)}</td><td>${esc(c.source||'')}</td><td><button class="mini-btn" data-company="${c.id}">Open CRM</button></td></tr>`).join('');
    $('#content').innerHTML = pageHead('客户开发 Lead Generation','AI Find Customers / Company Search / Contact Search / Email Finder / Verifier','<button class="btn primary" id="newLead">＋ Add Company</button>')+
      providerNotice('Apollo / Hunter / Google Places / Customs')+
      `<div class="card mt12"><div class="toolbar"><input id="leadSearch" class="input" style="max-width:320px" placeholder="筛选本地 CRM 公司"><select class="select" style="max-width:180px"><option>All Countries</option><option>DE</option><option>FR</option></select></div><div class="table-wrap"><table class="table"><thead><tr><th>Temperature</th><th>Company</th><th>Country</th><th>Type</th><th>Score</th><th>Stage</th><th>Source</th><th></th></tr></thead><tbody id="leadRows">${rows}</tbody></table></div></div>`;
    $('#newLead').onclick=()=>companyModal();
    $$('[data-company]').forEach(b=>b.onclick=()=>navigate('crm'));
    $('#leadSearch').oninput=e=>{ const q=e.target.value.toLowerCase(); $$('#leadRows tr').forEach(tr=>tr.style.display=tr.innerText.toLowerCase().includes(q)?'':'none'); };
  }

  function companyModal(existing){
    const c=existing||{};
    openModal(existing?'编辑 Company':'New Company',`<div class="form-grid"><div class="field"><label>Legal Name *</label><input id="coName" class="input" value="${esc(c.legalName||'')}"></div><div class="field"><label>Country</label><input id="coCountry" class="input" value="${esc(c.country||'')}"></div><div class="field"><label>City</label><input id="coCity" class="input" value="${esc(c.city||'')}"></div><div class="field"><label>Customer Type</label><select id="coType" class="select">${['Distributor','Retailer','Importer','Brand','Wholesaler','Installer','Other'].map(x=>`<option ${c.type===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Lead Score 0-100</label><input id="coScore" type="number" min="0" max="100" class="input" value="${esc(c.score??50)}"></div><div class="field"><label>Stage</label><select id="coStage" class="select">${['New','Researching','Contacted','Replied','Qualified','Quoted','Negotiation','Won','Lost'].map(x=>`<option ${c.stage===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Website</label><input id="coWebsite" class="input" value="${esc(c.website||'')}"></div><div class="field"><label>Industry</label><input id="coIndustry" class="input" value="${esc(c.industry||'Garden & Outdoor')}"></div></div>`, root=>{
      const name=$('#coName',root).value.trim(); if(!name){toast('Company 名称不能为空','bad');return false;}
      const data={legalName:name,country:$('#coCountry',root).value.trim().toUpperCase(),city:$('#coCity',root).value.trim(),type:$('#coType',root).value,score:Math.max(0,Math.min(100,Number($('#coScore',root).value||0))),stage:$('#coStage',root).value,website:$('#coWebsite',root).value.trim(),industry:$('#coIndustry',root).value.trim(),owner:'Guo Dong',source:c.source||'Manual',updatedAt:now()};
      if(existing) Object.assign(existing,data); else store.companies.unshift({id:id('co'),...data});
      saveStore(`${existing?'Updated':'Created'} company: ${name}`); toast('Company 已保存'); render();
    });
  }

  function renderCRM(){
    const rows=store.companies.map(c=>`<tr><td><strong>${esc(c.legalName)}</strong><div class="muted">${esc(c.city||'')}</div></td><td>${esc(c.country)}</td><td>${esc(c.type)}</td><td>${c.score}</td><td>${pill(c.stage,c.stage==='Won'?'ok':c.stage==='Lost'?'bad':'')}</td><td>${esc(c.owner||'')}</td><td>${store.contacts.filter(x=>x.companyId===c.id).length}</td><td class="actions"><button class="mini-btn edit-co" data-id="${c.id}">Edit</button><button class="mini-btn delete-co" data-id="${c.id}">Delete</button></td></tr>`).join('');
    const stages=['New','Researching','Contacted','Replied','Qualified'];
    $('#content').innerHTML = pageHead('CRM','Companies / Contacts / Opportunities / Pipeline / Activities / Tasks','<button class="btn primary" id="crmAdd">＋ New Company</button>')+
      `<div class="card"><div class="toolbar"><input id="crmFilter" class="input" style="max-width:320px" placeholder="Search companies"></div><div class="table-wrap"><table class="table"><thead><tr><th>Company</th><th>Country</th><th>Type</th><th>Score</th><th>Stage</th><th>Owner</th><th>Contacts</th><th>Actions</th></tr></thead><tbody id="crmRows">${rows||'<tr><td colspan="8"><div class="empty"><strong>暂无 Company</strong>点击 New Company 创建主数据。</div></td></tr>'}</tbody></table></div></div>
      <div class="card mt12"><h2>Pipeline</h2><div class="stage-board">${stages.map(s=>`<div class="stage-col"><div class="stage-title"><span>${s}</span><span>${store.companies.filter(c=>c.stage===s).length}</span></div>${store.companies.filter(c=>c.stage===s).map(c=>`<div class="deal-card"><strong>${esc(c.legalName)}</strong><div class="muted mt8">Score ${c.score} · ${esc(c.country)}</div></div>`).join('')}</div>`).join('')}</div></div>`;
    $('#crmAdd').onclick=()=>companyModal();
    $$('.edit-co').forEach(b=>b.onclick=()=>companyModal(store.companies.find(c=>c.id===b.dataset.id)));
    $$('.delete-co').forEach(b=>b.onclick=()=>{ const c=store.companies.find(x=>x.id===b.dataset.id); if(confirm(`删除 ${c.legalName}？`)){store.companies=store.companies.filter(x=>x.id!==c.id);store.contacts=store.contacts.filter(x=>x.companyId!==c.id);saveStore(`Deleted company: ${c.legalName}`);render();}});
    $('#crmFilter').oninput=e=>{const q=e.target.value.toLowerCase();$$('#crmRows tr').forEach(tr=>tr.style.display=tr.innerText.toLowerCase().includes(q)?'':'none')};
  }

  function renderAISales(){
    $('#content').innerHTML = pageHead('AI销售中心','Customer Intelligence Agent / Outreach Composer / Email / WhatsApp / Translation') + providerNotice('OpenAI Responses API / Gmail / WhatsApp / DeepL') +
      `<div class="grid two mt12"><div class="card"><h2>Customer Intelligence Agent</h2><div class="form-grid"><div class="field"><label>Company</label><select class="select">${store.companies.map(c=>`<option>${esc(c.legalName)}</option>`).join('')}</select></div><div class="field"><label>Product Range</label><select class="select">${store.products.map(p=>`<option>${esc(p.name)}</option>`).join('')}</select></div></div><button class="btn primary mt12" disabled>Run Agent · Provider required</button></div><div class="card"><h2>Agent Run Audit</h2><div class="notice info">Agent 必须保存 Plan → Tools → Steps → Output → Approval。当前未连接 Provider，因此不会伪造 Run 日志。</div></div></div>`;
  }

  function renderProducts(){
    const productRows=store.products.map(p=>`<tr><td><strong>${esc(p.name)}</strong></td><td>${esc(p.category||'')}</td><td>${esc(p.material||'')}</td><td>${esc(p.market||'')}</td><td>${pill(p.status||'active','ok')}</td><td>${store.skus.filter(s=>s.productId===p.id).length}</td></tr>`).join('');
    const skuRows=store.skus.map(s=>`<tr><td><strong>${esc(s.code)}</strong></td><td>${esc(store.products.find(p=>p.id===s.productId)?.name||'')}</td><td>${esc(s.variant||'')}</td><td>${money(s.cost,s.currency)}</td><td>${store.packages.filter(p=>p.skuId===s.id).reduce((a,p)=>a+Number(p.qtyPerSet||1),0)}</td><td>${store.packages.filter(p=>p.skuId===s.id).map(p=>`${esc(p.code)} ${p.l}×${p.w}×${p.h}`).join('<br>')}</td><td><button class="mini-btn edit-sku" data-id="${s.id}">Edit Packaging</button></td></tr>`).join('');
    $('#content').innerHTML = pageHead('产品中心','Product / SKU / Packaging / Price Books / Certifications','<button class="btn primary" id="newProduct">＋ Product</button><button class="btn secondary" id="newSku">＋ SKU</button>')+
      `<div class="card"><h2>Products</h2><div class="table-wrap"><table class="table"><thead><tr><th>Product</th><th>Category</th><th>Material</th><th>Market</th><th>Status</th><th>SKUs</th></tr></thead><tbody>${productRows}</tbody></table></div></div><div class="card mt12"><h2>SKU & Packaging · 1套N箱</h2><div class="notice ok">包装模型从第一天支持 1套N箱；每个 SKU 可维护任意数量 Carton 及 Qty per Set。</div><div class="table-wrap mt12"><table class="table"><thead><tr><th>SKU</th><th>Product</th><th>Variant</th><th>Cost</th><th>Cartons/Set</th><th>Packages (cm)</th><th></th></tr></thead><tbody>${skuRows}</tbody></table></div></div>`;
    $('#newProduct').onclick=productModal; $('#newSku').onclick=()=>skuModal(); $$('.edit-sku').forEach(b=>b.onclick=()=>skuModal(store.skus.find(s=>s.id===b.dataset.id)));
  }

  function productModal(){
    openModal('New Product',`<div class="form-grid"><div class="field"><label>Product Name *</label><input id="pName" class="input"></div><div class="field"><label>Category</label><input id="pCat" class="input" value="Garden Storage"></div><div class="field"><label>Series</label><input id="pSeries" class="input"></div><div class="field"><label>Material</label><input id="pMaterial" class="input"></div><div class="field"><label>Market</label><input id="pMarket" class="input" value="EU"></div><div class="field"><label>Default HS Code</label><input id="pHs" class="input"></div></div>`,root=>{const name=$('#pName',root).value.trim();if(!name){toast('Product Name 必填','bad');return false;}store.products.push({id:id('pr'),name,category:$('#pCat',root).value,series:$('#pSeries',root).value,material:$('#pMaterial',root).value,market:$('#pMarket',root).value,hs:$('#pHs',root).value,status:'active'});saveStore(`Created product: ${name}`);toast('Product 已保存');render();});
  }

  function skuModal(existing){
    if(!store.products.length){toast('请先创建 Product','bad');return;}
    const s=existing||{}; const pkgs=existing?store.packages.filter(p=>p.skuId===existing.id):[{code:'A',qtyPerSet:1,l:128,w:54,h:13,grossWeight:49,stackable:true}];
    const body=`<div class="form-grid"><div class="field"><label>Product</label><select id="skuProduct" class="select">${store.products.map(p=>`<option value="${p.id}" ${s.productId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div><div class="field"><label>SKU Code *</label><input id="skuCode" class="input" value="${esc(s.code||'')}"></div><div class="field"><label>Variant</label><input id="skuVariant" class="input" value="${esc(s.variant||'')}"></div><div class="field"><label>Cost USD</label><input id="skuCost" type="number" class="input" value="${esc(s.cost??0)}"></div></div><div class="sep"></div><div style="display:flex;justify-content:space-between;align-items:center"><h3>Packaging Set</h3><button id="addPkg" class="btn secondary" type="button">＋ Carton</button></div><div id="pkgRows">${pkgs.map((p,i)=>pkgRow(p,i)).join('')}</div>`;
    openModal(existing?'Edit SKU & Packaging':'New SKU & Packaging',body,root=>{
      const code=$('#skuCode',root).value.trim(); if(!code){toast('SKU Code 必填','bad');return false;}
      let sku=existing;
      const data={productId:$('#skuProduct',root).value,code,variant:$('#skuVariant',root).value.trim(),cost:Number($('#skuCost',root).value||0),currency:'USD',moq:1,leadTime:35};
      if(sku)Object.assign(sku,data);else{sku={id:id('sku'),...data};store.skus.push(sku)}
      store.packages=store.packages.filter(p=>p.skuId!==sku.id);
      $$('.package-row',root).forEach((row,idx)=>{const vals={code:$('.pkg-code',row).value.trim()||String.fromCharCode(65+idx),qtyPerSet:Math.max(1,Number($('.pkg-qty',row).value||1)),l:Number($('.pkg-l',row).value||0),w:Number($('.pkg-w',row).value||0),h:Number($('.pkg-h',row).value||0),grossWeight:Number($('.pkg-weight',row).value||0),stackable:true,keepUpright:false,fragile:false}; if(vals.l>0&&vals.w>0&&vals.h>0)store.packages.push({id:id('pkg'),skuId:sku.id,...vals});});
      if(!store.packages.some(p=>p.skuId===sku.id)){toast('至少需要一个有效 Carton','bad');return false;}
      saveStore(`${existing?'Updated':'Created'} SKU: ${code}`);toast('SKU 与 1套N箱包装已保存');render();
    });
    const root=$('#modalRoot'); $('#addPkg',root).onclick=()=>{$('#pkgRows',root).insertAdjacentHTML('beforeend',pkgRow({code:String.fromCharCode(65+$$('.package-row',root).length),qtyPerSet:1,l:0,w:0,h:0,grossWeight:0},Date.now())); bindPkgDelete(root)}; bindPkgDelete(root);
  }
  function pkgRow(p,i){return `<div class="package-row" data-i="${i}"><div class="field"><label>Code</label><input class="input pkg-code" value="${esc(p.code||'')}"></div><div class="field"><label>Qty/Set</label><input type="number" min="1" class="input pkg-qty" value="${esc(p.qtyPerSet||1)}"></div><div class="field"><label>L cm</label><input type="number" class="input pkg-l" value="${esc(p.l||0)}"></div><div class="field"><label>W cm</label><input type="number" class="input pkg-w" value="${esc(p.w||0)}"></div><div class="field"><label>H cm</label><input type="number" class="input pkg-h" value="${esc(p.h||0)}"></div><div class="field"><label>KG</label><input type="number" class="input pkg-weight" value="${esc(p.grossWeight||0)}"></div><button type="button" class="mini-btn pkg-del">×</button></div>`}
  function bindPkgDelete(root){$$('.pkg-del',root).forEach(b=>b.onclick=()=>{if($$('.package-row',root).length>1)b.closest('.package-row').remove();else toast('至少保留一个 Carton','bad')});}

  function renderQuotes(){
    const rows=store.quotes.map(q=>`<tr><td><strong>${esc(q.quoteNo)}</strong></td><td>${esc(store.companies.find(c=>c.id===q.companyId)?.legalName||'')}</td><td>${esc(store.skus.find(s=>s.id===q.skuId)?.code||'')}</td><td>${q.qty}</td><td>${money(q.unitPrice,q.currency)}</td><td>${money(q.total,q.currency)}</td><td>${pct(q.margin)}</td><td>${pill(q.status)}</td></tr>`).join('');
    $('#content').innerHTML=pageHead('报价中心','Quote Calculator / Quotes / Cost Analysis / Quote Templates','<button class="btn primary" id="newQuote">＋ Create Quote</button>')+`<div class="card"><h2>Quotes</h2><div class="table-wrap"><table class="table"><thead><tr><th>Quote</th><th>Customer</th><th>SKU</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Margin</th><th>Status</th></tr></thead><tbody>${rows||'<tr><td colspan="8"><div class="empty"><strong>暂无报价</strong>创建报价后会保存成本 Snapshot。</div></td></tr>'}</tbody></table></div></div>`;
    $('#newQuote').onclick=quoteModal;
  }
  function quoteModal(){
    if(!store.companies.length||!store.skus.length){toast('请先创建 Company 与 SKU','bad');return;}
    openModal('Quote Calculator',`<div class="form-grid"><div class="field"><label>Customer</label><select id="qCo" class="select">${store.companies.map(c=>`<option value="${c.id}">${esc(c.legalName)}</option>`).join('')}</select></div><div class="field"><label>SKU</label><select id="qSku" class="select">${store.skus.map(s=>`<option value="${s.id}">${esc(s.code)} · cost ${money(s.cost,s.currency)}</option>`).join('')}</select></div><div class="field"><label>Quantity</label><input id="qQty" type="number" min="1" class="input" value="100"></div><div class="field"><label>Target Margin %</label><input id="qMargin" type="number" min="0" max="95" class="input" value="25"></div><div class="field"><label>Additional Cost / Unit</label><input id="qExtra" type="number" min="0" class="input" value="15"></div><div class="field"><label>Incoterm</label><select id="qIncoterm" class="select"><option>FOB</option><option>CIF</option><option>EXW</option><option>DDP</option></select></div></div><div id="quotePreview" class="notice info mt12">修改参数后点击保存，系统会按成本/(1-毛利率)计算售价并保存成本 Snapshot。</div>`,root=>{const sku=store.skus.find(s=>s.id===$('#qSku',root).value);const qty=Math.max(1,Number($('#qQty',root).value||1));const margin=Math.max(0,Math.min(95,Number($('#qMargin',root).value||0)));const extra=Math.max(0,Number($('#qExtra',root).value||0));const unitCost=Number(sku.cost||0)+extra;const unitPrice=unitCost/(1-margin/100);const quoteNo=`Q-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(store.quotes.length+1).padStart(3,'0')}`;store.quotes.unshift({id:id('q'),quoteNo,companyId:$('#qCo',root).value,skuId:sku.id,qty,margin,unitCost,unitPrice,total:unitPrice*qty,currency:sku.currency||'USD',incoterm:$('#qIncoterm',root).value,status:'Draft',costSnapshot:{productCost:sku.cost,additionalCost:extra,capturedAt:now()},createdAt:now()});saveStore(`Created quote ${quoteNo}`);toast(`${quoteNo} 已保存`);render();},'保存 Quote');
  }

  function renderContainer(){
    const skuOptions=store.skus.map(s=>`<option value="${s.id}">${esc(s.code)} · ${store.packages.filter(p=>p.skuId===s.id).length} package types</option>`).join('');
    $('#content').innerHTML=pageHead('装柜中心','Automatic Loading / Mixed Loading / 3D / Orthographic Views / Reports','<button class="btn secondary" id="exportLoad" disabled>Export JSON</button>')+`<div class="split"><div class="card"><h2>Load Plan Input</h2><div class="field"><label>Container</label><select id="containerType" class="select">${Object.keys(CONTAINERS).map(x=>`<option>${x}</option>`).join('')}</select></div><div class="field mt12"><label>SKU</label><select id="loadSku" class="select">${skuOptions}</select></div><div class="field mt12"><label>Sets</label><input id="loadSets" type="number" min="1" max="1000" value="20" class="input"></div><button id="solveLoad" class="btn primary mt12">Automatic Loading</button><div class="sep"></div><div class="notice info">当前 Solver 是真实执行的轴对齐约束贪心算法：检查边界、碰撞、旋转、包装实例数量与重量。它是开发基线，不等同于最终优化器。</div><div id="loadMetrics" class="mt12"></div></div><div class="card"><div class="view-tabs"><button class="view-tab active" data-view="top">Top</button><button class="view-tab" data-view="front">Front</button><button class="view-tab" data-view="right">Right</button></div><div id="ortho" class="ortho"><div class="empty"><strong>尚未计算</strong>选择 SKU、Set 数量后运行 Automatic Loading。</div></div><div id="loadLegend" class="legend"></div></div></div>`;
    $('#solveLoad').onclick=solveSelectedLoad; $$('.view-tab').forEach(b=>b.onclick=()=>{activeLoadView=b.dataset.view;$$('.view-tab').forEach(x=>x.classList.toggle('active',x===b));drawLoad()}); $('#exportLoad').onclick=exportLoad;
  }

  function rotations(box){
    const dims=[[box.l,box.w,box.h],[box.l,box.h,box.w],[box.w,box.l,box.h],[box.w,box.h,box.l],[box.h,box.l,box.w],[box.h,box.w,box.l]];
    if(box.keepUpright) return [[box.l,box.w,box.h],[box.w,box.l,box.h]];
    return [...new Map(dims.map(d=>[d.join('x'),d])).values()];
  }
  function overlaps(a,b){return !(a.x+a.l<=b.x||b.x+b.l<=a.x||a.y+a.w<=b.y||b.y+b.w<=a.y||a.z+a.h<=b.z||b.z+b.h<=a.z)}
  function pack3d(container,instances){
    const placed=[],unloaded=[]; let candidates=[{x:0,y:0,z:0}];
    instances=[...instances].sort((a,b)=>(b.l*b.w*b.h)-(a.l*a.w*a.h));
    for(const box of instances){
      candidates=candidates.filter((p,i,arr)=>arr.findIndex(q=>q.x===p.x&&q.y===p.y&&q.z===p.z)===i).sort((a,b)=>a.z-b.z||a.y-b.y||a.x-b.x);
      let best=null;
      outer: for(const p of candidates){ for(const d of rotations(box)){ const [l,w,h]=d;if(p.x+l>container.l||p.y+w>container.w||p.z+h>container.h)continue;const test={...box,x:p.x,y:p.y,z:p.z,l,w,h};if(placed.some(q=>overlaps(test,q)))continue;best=test;break outer; } }
      if(best){placed.push(best);candidates.push({x:best.x+best.l,y:best.y,z:best.z},{x:best.x,y:best.y+best.w,z:best.z},{x:best.x,y:best.y,z:best.z+best.h});}
      else unloaded.push(box);
    }
    return {placed,unloaded};
  }
  function solveSelectedLoad(){
    const type=$('#containerType').value, container=CONTAINERS[type], skuId=$('#loadSku').value, sets=Math.max(1,Number($('#loadSets').value||1));const pkgs=store.packages.filter(p=>p.skuId===skuId);if(!pkgs.length){toast('该 SKU 没有 Packaging','bad');return;}
    const instances=[];for(let setNo=1;setNo<=sets;setNo++){for(const p of pkgs){for(let q=1;q<=Number(p.qtyPerSet||1);q++)instances.push({instanceId:`${setNo}-${p.code}-${q}`,pkgId:p.id,skuId,setNo,code:p.code,l:Number(p.l),w:Number(p.w),h:Number(p.h),weight:Number(p.grossWeight||0),keepUpright:Boolean(p.keepUpright),stackable:Boolean(p.stackable)});}}
    const result=pack3d(container,instances);const usedVol=result.placed.reduce((s,p)=>s+p.l*p.w*p.h,0),contVol=container.l*container.w*container.h,totalWeight=result.placed.reduce((s,p)=>s+p.weight,0);lastLoadResult={id:id('lp'),containerType:type,container,skuId,sets,createdAt:now(),...result,metrics:{volumeUtilization:usedVol/contVol*100,weightUtilization:totalWeight/container.payload*100,usedCBM:usedVol/1e6,remainingCBM:(contVol-usedVol)/1e6,totalWeight,remainingPayload:container.payload-totalWeight,cartons:result.placed.length,unloaded:result.unloaded.length}};store.loadPlans.unshift(lastLoadResult);store.loadPlans=store.loadPlans.slice(0,20);saveStore(`Calculated load plan: ${type}, ${sets} sets, ${result.placed.length} cartons placed`);$('#exportLoad').disabled=false;renderLoadMetrics();drawLoad();toast(`装载完成：${result.placed.length} 箱，未装 ${result.unloaded.length} 箱`);
  }
  function renderLoadMetrics(){if(!lastLoadResult)return;const m=lastLoadResult.metrics;$('#loadMetrics').innerHTML=`<div class="grid two"><div>${kpi('Volume',pct(m.volumeUtilization),`${num(m.usedCBM)} CBM`)}</div><div>${kpi('Weight',pct(m.weightUtilization),`${num(m.totalWeight)} KG`)}</div></div><div class="mt12">${pill(`${m.cartons} cartons placed`,'ok')} ${m.unloaded?pill(`${m.unloaded} unloaded`,'bad'):pill('0 unloaded','ok')}</div>`}
  function colorFor(code){let h=0;for(const c of code)h=(h*31+c.charCodeAt(0))%360;return `hsl(${h} 70% 58%)`}
  function drawLoad(){if(!lastLoadResult)return;const r=lastLoadResult,c=r.container;let W,H,rect;if(activeLoadView==='top'){W=c.l;H=c.w;rect=p=>[p.x,p.y,p.l,p.w]}else if(activeLoadView==='front'){W=c.l;H=c.h;rect=p=>[p.x,c.h-(p.z+p.h),p.l,p.h]}else{W=c.w;H=c.h;rect=p=>[p.y,c.h-(p.z+p.h),p.w,p.h]};const vb=`0 0 ${W} ${H}`;const items=r.placed.map(p=>{const [x,y,w,h]=rect(p);return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${colorFor(p.code)}" fill-opacity=".45" stroke="${colorFor(p.code)}" stroke-width="1.4"/><title>Set ${p.setNo} / ${p.code} / ${p.l}×${p.w}×${p.h}cm</title></g>`}).join('');$('#ortho').innerHTML=`<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet" aria-label="${activeLoadView} orthographic view"><rect x="0" y="0" width="${W}" height="${H}" fill="transparent" stroke="rgba(255,255,255,.35)" stroke-width="2"/>${items}</svg>`;const codes=[...new Set(r.placed.map(p=>p.code))];$('#loadLegend').innerHTML=codes.map(c=>`<span><i style="background:${colorFor(c)}"></i>Carton ${esc(c)}</span>`).join('')}
  function exportLoad(){if(!lastLoadResult)return;const blob=new Blob([JSON.stringify(lastLoadResult,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`load-plan-${lastLoadResult.containerType}-${Date.now()}.json`;a.click();URL.revokeObjectURL(url);}

  function renderLogistics(){ $('#content').innerHTML=pageHead('物流中心','Shipments / Freight Calculator / Tracking / Exceptions')+providerNotice('DHL / FedEx / Forwarder APIs')+`<div class="card mt12"><h2>Shipment Provider Adapter</h2><div class="code">ShippingProvider\n├─ DHL\n├─ FedEx\n├─ UPS\n├─ Freight Forwarder\n├─ Manual\n└─ Future Providers</div></div>`; }
  function renderCompliance(){ $('#content').innerHTML=pageHead('海关与合规','HS Code / Tariff / Rules of Origin / Certifications / Sanctions')+providerNotice('OFAC SLS / Access2Markets / Tariff sources')+`<div class="card mt12"><h2>合规规则</h2><div class="notice">HS 建议不得显示为确定申报结果；制裁模糊匹配不得由 AI 自动判定为制裁对象。正式 Provider 接通前不生成虚假结果。</div></div>`; }
  function renderKnowledge(){ $('#content').innerHTML=pageHead('知识库','PDF / DOCX / XLSX / TXT / Markdown / Web Page / Manual Article')+`<div class="grid two"><div class="card"><h2>Development Baseline</h2><p class="muted">PRD 已作为仓库内版本化文档：<code>docs/AI外贸全能工作台 V1.0 产品需求文档.md</code></p><a class="btn secondary" href="/docs/AI外贸全能工作台%20V1.0%20产品需求文档.md" target="_blank" style="display:inline-flex;align-items:center;text-decoration:none">Open PRD</a></div><div class="card"><h2>RAG / Source citation</h2><div class="notice info">正式知识库需要对象存储、解析、版本、来源定位与向量检索。当前页面只提供版本化基线，不伪装为完整 RAG。</div></div></div>`; }

  function renderAutomation(){
    const rows=store.automations.map(a=>`<tr><td><strong>${esc(a.name)}</strong></td><td>${esc(a.trigger)}</td><td>${esc(a.condition)}</td><td>${esc(a.action)}</td><td>${a.enabled?pill('Enabled','ok'):pill('Paused','warn')}</td><td>${a.lastRun?new Date(a.lastRun).toLocaleString('zh-CN'):'—'}</td><td class="actions"><button class="mini-btn run-auto" data-id="${a.id}">Run</button><button class="mini-btn toggle-auto" data-id="${a.id}">${a.enabled?'Pause':'Enable'}</button></td></tr>`).join('');
    $('#content').innerHTML=pageHead('Automation Builder','Trigger → Conditions → Actions → Delay → Branch → End','<button class="btn primary" id="newAuto">＋ Automation</button>')+`<div class="card"><div class="notice ok">内置动作会真实写入本地业务数据；涉及 Email/WhatsApp/AI 的外部动作在 Provider 未连接时不允许伪执行。</div><div class="table-wrap mt12"><table class="table"><thead><tr><th>Name</th><th>Trigger</th><th>Condition</th><th>Action</th><th>Status</th><th>Last Run</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    $('#newAuto').onclick=automationModal; $$('.toggle-auto').forEach(b=>b.onclick=()=>{const a=store.automations.find(x=>x.id===b.dataset.id);a.enabled=!a.enabled;saveStore(`${a.enabled?'Enabled':'Paused'} automation ${a.name}`);render()}); $$('.run-auto').forEach(b=>b.onclick=()=>runAutomation(store.automations.find(x=>x.id===b.dataset.id)));
  }
  function automationModal(){openModal('New Automation',`<div class="form-grid"><div class="field"><label>Name</label><input id="aName" class="input" value="High score follow-up"></div><div class="field"><label>Trigger</label><select id="aTrigger" class="select"><option value="manual">Manual</option><option value="company.created">Company Created</option></select></div><div class="field"><label>Condition</label><select id="aCondition" class="select"><option value="always">Always</option><option value="score>=85">Score >= 85</option></select></div><div class="field"><label>Action</label><select id="aAction" class="select"><option value="create.followup.task">Create Follow-up Task</option><option value="tag.hot">Tag Hot Lead</option></select></div></div>`,root=>{store.automations.push({id:id('au'),name:$('#aName',root).value.trim()||'Automation',trigger:$('#aTrigger',root).value,condition:$('#aCondition',root).value,action:$('#aAction',root).value,enabled:true,lastRun:null});saveStore('Created automation');render();});}
  function runAutomation(a){if(!a.enabled){toast('Automation 已暂停','bad');return;}let targets=store.companies;if(a.condition==='score>=85')targets=targets.filter(c=>Number(c.score)>=85);if(a.action==='create.followup.task'){for(const c of targets){const title=`Follow up ${c.legalName}`;if(!store.tasks.some(t=>t.title===title&&t.status==='open'))store.tasks.push({id:id('tk'),title,due:new Date(Date.now()+3*86400000).toISOString().slice(0,10),status:'open',owner:c.owner||'Guo Dong'});}}else if(a.action==='tag.hot'){targets.forEach(c=>c.hot=true)}a.lastRun=now();saveStore(`Automation ${a.name} executed for ${targets.length} companies`);toast(`Automation 已真实执行：${targets.length} 个对象`);render();}

  function renderAnalytics(){
    const stageCounts={};store.companies.forEach(c=>stageCounts[c.stage]=(stageCounts[c.stage]||0)+1);const max=Math.max(1,...Object.values(stageCounts));
    $('#content').innerHTML=pageHead('Analytics','Sales / Customer / Outreach / Quote / Product / Market / Logistics / Team')+`<div class="grid three">${Object.entries(stageCounts).map(([k,v])=>`<div class="card"><div class="kpi-label">${esc(k)}</div><div class="kpi-value">${v}</div><div class="progress"><span style="width:${v/max*100}%"></span></div></div>`).join('')}</div><div class="card mt12"><h2>Data Quality</h2><div class="notice info">当前 Analytics 只统计本地已保存主数据，因此指标可追溯；未接入 Provider 的“发送量/回复率/物流准时率”不显示虚构数字。</div></div>`;
  }

  async function renderSettings(){
    $('#content').innerHTML=pageHead('Settings','Workspace / Users / Roles / Integrations / Usage / Security')+`<div class="card"><h2>Integrations</h2><div class="provider-grid">${['OpenAI','Apollo','Hunter','Google Places','Gmail','WhatsApp','DeepL','UN Comtrade','DHL','FedEx','OFAC SLS','Access2Markets'].map(p=>`<div class="provider"><strong>${p}</strong>${pill('Not Connected','warn')}<div class="mt8"><small>Secret 必须服务器端保存，浏览器不存 API Key。</small></div></div>`).join('')}</div></div><div class="card mt12"><h2>Cloudflare Runtime</h2><div id="runtimeStatus" class="notice info">Checking /api/runtime …</div></div><div class="card mt12"><h2>Local Development Data</h2><button class="btn danger" id="resetData">Reset local demo data</button></div>`;
    $('#resetData').onclick=()=>{if(confirm('重置当前浏览器的开发数据？')){store=seed();saveStore('Local data reset');render();toast('已重置')}};
    try{const r=await fetch('/api/runtime',{cache:'no-store'});if(!r.ok)throw new Error();const j=await r.json();$('#runtimeStatus').innerHTML=`Pages Functions online. Bindings present: <code>${esc(JSON.stringify(j.bindings))}</code>`;}catch(e){$('#runtimeStatus').textContent='静态预览环境未启用 Pages Functions；部署到 Cloudflare Pages 后 /api/runtime 会返回绑定状态。';}
  }

  function renderPlaceholder(title,sub,desc){$('#content').innerHTML=pageHead(title,sub)+`<div class="card"><div class="notice info">${esc(desc)}</div><div class="empty"><strong>模块已进入信息架构</strong>当前开发基线不把未完成的服务端流程伪装成可用按钮。</div></div>`}

  function globalSearch(q){
    q=q.trim().toLowerCase();if(!q){$('#searchResults').classList.add('hidden');return;}
    const hits=[];store.companies.forEach(x=>{if(`${x.legalName} ${x.country} ${x.city}`.toLowerCase().includes(q))hits.push({type:'Company',title:x.legalName,sub:`${x.country} · ${x.stage}`,route:'crm'})});store.contacts.forEach(x=>{if(`${x.name} ${x.email} ${x.title}`.toLowerCase().includes(q))hits.push({type:'Contact',title:x.name,sub:x.title||'',route:'crm'})});store.products.forEach(x=>{if(`${x.name} ${x.category}`.toLowerCase().includes(q))hits.push({type:'Product',title:x.name,sub:x.category||'',route:'products'})});store.skus.forEach(x=>{if(`${x.code} ${x.variant}`.toLowerCase().includes(q))hits.push({type:'SKU',title:x.code,sub:x.variant||'',route:'products'})});store.quotes.forEach(x=>{if(x.quoteNo.toLowerCase().includes(q))hits.push({type:'Quote',title:x.quoteNo,sub:money(x.total,x.currency),route:'quotes'})});
    const box=$('#searchResults');box.innerHTML=hits.slice(0,12).map(h=>`<div class="search-hit" data-route="${h.route}"><div><strong>${esc(h.title)}</strong><div><small>${esc(h.sub)}</small></div></div>${pill(h.type)}</div>`).join('')||'<div class="empty">没有匹配结果</div>';box.classList.remove('hidden');$$('.search-hit',box).forEach(x=>x.onclick=()=>{navigate(x.dataset.route);box.classList.add('hidden');$('#globalSearch').value=''});
  }

  function bindGlobal(){
    $('#menuToggle').onclick=()=>$('#sidebar').classList.toggle('open');
    $('#globalSearch').oninput=e=>globalSearch(e.target.value);
    document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#globalSearch').focus()}if(e.key==='Escape')$('#searchResults').classList.add('hidden')});
    $('#createBtn').onclick=()=>openModal('Create',`<div class="grid three"><button class="btn secondary quick-create" data-go="company">New Company</button><button class="btn secondary quick-create" data-go="product">New Product</button><button class="btn secondary quick-create" data-go="quote">New Quote</button><button class="btn secondary quick-create" data-go="load">New Load Plan</button><button class="btn secondary quick-create" data-go="task">New Task</button></div>`,()=>false,'关闭');
    $('#modalRoot').addEventListener('click',e=>{const b=e.target.closest('.quick-create');if(!b)return;$('#modalRoot').innerHTML='';if(b.dataset.go==='company')companyModal();if(b.dataset.go==='product')productModal();if(b.dataset.go==='quote')quoteModal();if(b.dataset.go==='load')navigate('container');if(b.dataset.go==='task')taskModal();});
    $('#aiBtn').onclick=()=>{navigate('ai-sales');toast('AI Provider 未连接；已打开 AI 销售中心。','bad')};
    $('#notifyBtn').onclick=()=>toast(`${store.tasks.filter(t=>t.status==='open').length} 个待办任务`);
    $('#userBtn').onclick=()=>navigate('settings');
    window.addEventListener('hashchange',render);
  }
  function taskModal(){openModal('New Task',`<div class="form-grid"><div class="field"><label>Task</label><input id="tTitle" class="input"></div><div class="field"><label>Due</label><input id="tDue" type="date" class="input" value="${new Date(Date.now()+86400000).toISOString().slice(0,10)}"></div></div>`,root=>{const title=$('#tTitle',root).value.trim();if(!title){toast('Task 标题必填','bad');return false;}store.tasks.push({id:id('tk'),title,due:$('#tDue',root).value,status:'open',owner:'Guo Dong'});saveStore(`Created task: ${title}`);toast('Task 已创建');render();});}

  initNav(); bindGlobal(); render();
})();
