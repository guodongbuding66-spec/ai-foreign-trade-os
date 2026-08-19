(() => {
  'use strict';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const builtinIds=new Set(['openai','anthropic','gemini','deepseek','xai','groq','together','mistral','openrouter']);
  async function api(path,options={}){const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});const type=r.headers.get('content-type')||'',data=type.includes('application/json')?await r.json():{ok:false,error:`http_${r.status}`};if(r.status===401){location.href='/login.html';throw new Error('unauthorized')}if(!r.ok){const e=new Error(data.error||`http_${r.status}`);e.data=data;e.status=r.status;throw e}return data}
  function toast(text,bad=false){const root=$('#toastRoot');if(!root)return;const el=document.createElement('div');el.className=`toast ${bad?'bad':'ok'}`;el.textContent=text;root.appendChild(el);setTimeout(()=>el.remove(),3600)}
  const option=(v,l,selected=false)=>`<option value="${esc(v)}" ${selected?'selected':''}>${esc(l)}</option>`;
  const capsText=c=>[['Web',c?.webSearch],['Vision',c?.vision],['PDF',c?.pdf],['Schema',c?.nativeSchema]].filter(x=>x[1]).map(x=>x[0]).join(' · ')||'Text';
  let busy=false;

  async function enhance(){
    const route=location.hash.replace('#/','')||'dashboard';if(route!=='settings'||$('#universalAiProviders')||busy)return;
    const content=$('#content');if(!content)return;busy=true;
    try{
      let state;try{state=await api('/api/ai/credentials')}catch(e){const box=document.createElement('div');box.id='universalAiProviders';box.className='card mt12';box.innerHTML=`<h2>AI Providers · Personal BYOK</h2><div class="notice bad">${esc(e.data?.error||e.message)}${e.data?.expectedSchemaVersion?` · 请先升级 D1 到 schema v${esc(e.data.expectedSchemaVersion)}`:''}</div>`;content.appendChild(box);return}
      const g=state.gateway||{},providers=g.providers||[],credentials=state.credentials||[],prefs=state.preferences||{};
      const credById=new Map(credentials.map(x=>[x.providerId,x]));
      const connected=providers.filter(p=>p.configured),researchable=connected.filter(p=>p.capabilities?.webSearch);
      const rows=providers.map(p=>{const c=credById.get(p.id),source=p.personal?'Personal BYOK':p.workspaceConfigured?'Workspace fallback':'—',key=c?`••••${esc(c.last4||'')}`:'—',test=c?.lastTestStatus?`<div class="muted">Test: ${esc(c.lastTestStatus)}</div>`:'';return `<tr><td><strong>${esc(p.name)}</strong>${p.custom?'<div class="muted">Custom</div>':''}</td><td>${esc(p.protocol)}</td><td>${esc(source)}</td><td>${esc(p.draftModel||p.model||'—')}</td><td>${esc(capsText(p.capabilities))}</td><td>${key}${test}</td><td>${c?`<button class="mini-btn ai-key-test" data-id="${esc(p.id)}">Test</button> <button class="mini-btn ai-key-remove" data-id="${esc(p.id)}">Remove</button>`:'<span class="muted">Not personal</span>'}</td></tr>`}).join('');
      const box=document.createElement('div');box.id='universalAiProviders';box.className='card mt12';
      box.innerHTML=`<div class="page-head"><div><h2>AI Providers · Personal BYOK</h2><p>每位同事使用自己的 API Key。Key 仅保存为服务端加密密文；自定义 Provider 可声明 Web Search / Vision / PDF 能力。</p></div><span class="pill ${connected.length?'ok':'warn'}">${connected.length} available</span></div>
      ${state.masterKeyReady?'':'<div class="notice bad"><strong>管理员一次性配置：</strong> Cloudflare Secret <code>AI_CREDENTIALS_MASTER_KEY</code> 尚未设置。</div>'}
      <div class="table-wrap mt12"><table class="table"><thead><tr><th>Provider</th><th>Protocol</th><th>Source</th><th>Draft Model</th><th>Capabilities</th><th>Personal Key</th><th>Action</th></tr></thead><tbody>${rows||'<tr><td colspan="7"><div class="empty">No providers</div></td></tr>'}</tbody></table></div>
      <div class="sep"></div><h2>Add / Replace My API Key</h2>
      <div class="form-grid three mt12">
        <div class="field"><label>Provider</label><select id="byokProvider" class="select">${providers.filter(p=>!p.custom&&builtinIds.has(p.id)).map(p=>option(p.id,p.name)).join('')}<option value="__custom__">Custom provider…</option></select></div>
        <div class="field byok-custom hidden"><label>Provider ID</label><input id="byokCustomId" class="input" placeholder="qwen / kimi / glm / internal-ai"></div>
        <div class="field"><label>Display name</label><input id="byokName" class="input"></div>
        <div class="field"><label>Model</label><input id="byokModel" class="input" placeholder="model-id"></div>
        <div class="field byok-custom hidden"><label>Protocol</label><select id="byokProtocol" class="select"><option value="openai_chat">OpenAI Chat Compatible</option><option value="openai_responses">OpenAI Responses Compatible</option><option value="anthropic_messages">Anthropic Messages</option><option value="gemini_interactions">Gemini Interactions</option></select></div>
        <div class="field byok-custom hidden"><label>Base URL</label><input id="byokBaseUrl" class="input" placeholder="https://api.example.com/v1"></div>
        <div class="field"><label>API Key</label><input id="byokApiKey" class="input" type="password" autocomplete="new-password" placeholder="只在保存时提交一次"></div>
        <div class="field byok-custom hidden"><label><input id="byokWebSearch" type="checkbox"> Native Web Search</label></div>
        <div class="field byok-custom hidden"><label><input id="byokVision" type="checkbox"> Vision / image input</label></div>
        <div class="field byok-custom hidden"><label><input id="byokPdf" type="checkbox"> Direct PDF input</label><small id="byokPdfHint">PDF requires Responses / Anthropic / Gemini protocol.</small></div>
        <div class="field byok-custom hidden"><label><input id="byokNativeSchema" type="checkbox"> Native structured schema</label></div>
      </div>
      <div class="mt12"><button id="byokSave" class="btn primary" ${state.masterKeyReady?'':'disabled'}>Save My Key</button></div>
      <div class="sep"></div><h2>My AI Routing</h2>
      <div class="form-grid three mt12"><div class="field"><label>Research Provider</label><select id="byokResearch" class="select"><option value="">Auto</option>${researchable.map(p=>option(p.id,p.name,p.id===prefs.researchProviderId)).join('')}</select></div><div class="field"><label>Draft Provider</label><select id="byokDraft" class="select"><option value="">Auto</option>${connected.map(p=>option(p.id,p.name,p.id===prefs.draftProviderId)).join('')}</select></div><div class="field"><label><input id="byokFallback" type="checkbox" ${prefs.allowWorkspaceFallback!==false?'checked':''}> Allow Workspace fallback when my Key is unavailable</label></div></div><div class="mt12"><button id="byokRoutingSave" class="btn secondary">Save My Routing</button></div>
      <div class="notice info mt12">Vision/PDF 是能力声明，不会替供应商“猜能力”。OpenAI Chat Compatible 只允许声明图片 Vision，不提供通用 PDF 兼容；PDF 请使用明确支持文件输入的协议。</div>`;
      content.appendChild(box);
      const providerSel=$('#byokProvider',box),name=$('#byokName',box),model=$('#byokModel',box),customFields=$$('.byok-custom',box),protocol=$('#byokProtocol',box),pdf=$('#byokPdf',box);
      const syncProtocol=()=>{const chat=protocol.value==='openai_chat';pdf.disabled=chat;if(chat)pdf.checked=false;$('#byokPdfHint',box).textContent=chat?'OpenAI Chat Compatible 不提供通用 PDF Adapter。':'PDF capability will be used by direct file review.'};protocol.onchange=syncProtocol;
      const syncForm=()=>{const id=providerSel.value,isCustom=id==='__custom__';customFields.forEach(x=>x.classList.toggle('hidden',!isCustom));if(isCustom){name.value='';model.value='';syncProtocol();return}const p=providers.find(x=>x.id===id);name.value=p?.name||id;model.value=p?.draftModel||p?.model||p?.researchModel||''};providerSel.onchange=syncForm;syncForm();
      $('#byokSave',box).onclick=async()=>{const isCustom=providerSel.value==='__custom__',providerId=isCustom?$('#byokCustomId',box).value:providerSel.value,apiKey=$('#byokApiKey',box).value.trim();if(!apiKey){toast('请输入 API Key',true);return}const payload={providerId,providerName:name.value,model:model.value,apiKey};if(isCustom){payload.protocol=protocol.value;payload.baseUrl=$('#byokBaseUrl',box).value;payload.capabilities={webSearch:$('#byokWebSearch',box).checked,vision:$('#byokVision',box).checked,pdf:pdf.checked,nativeSchema:$('#byokNativeSchema',box).checked}}const b=$('#byokSave',box);b.disabled=true;b.textContent='Saving…';try{await api('/api/ai/credentials',{method:'POST',body:JSON.stringify(payload)});$('#byokApiKey',box).value='';toast('个人 API Key 与能力声明已加密保存');setTimeout(()=>location.reload(),500)}catch(e){toast(e.data?.detail||e.data?.error||e.message,true);b.disabled=false;b.textContent='Save My Key'}};
      $$('.ai-key-test',box).forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='Testing…';try{const r=await api('/api/ai/credentials/test',{method:'POST',body:JSON.stringify({providerId:b.dataset.id})});toast(`连接成功 · ${r.model}`);setTimeout(()=>location.reload(),500)}catch(e){toast(e.data?.detail||e.data?.error||e.message,true);b.disabled=false;b.textContent='Test'}});
      $$('.ai-key-remove',box).forEach(b=>b.onclick=async()=>{if(!confirm(`删除你的 ${b.dataset.id} API Key？`))return;b.disabled=true;try{await api(`/api/ai/credentials/${encodeURIComponent(b.dataset.id)}`,{method:'DELETE'});toast('个人 API Key 已删除');setTimeout(()=>location.reload(),400)}catch(e){toast(e.data?.error||e.message,true);b.disabled=false}});
      $('#byokRoutingSave',box).onclick=async()=>{const b=$('#byokRoutingSave',box);b.disabled=true;try{await api('/api/ai/credentials',{method:'PUT',body:JSON.stringify({researchProviderId:$('#byokResearch',box).value,draftProviderId:$('#byokDraft',box).value,allowWorkspaceFallback:$('#byokFallback',box).checked})});toast('个人 AI 路由已保存');setTimeout(()=>location.reload(),400)}catch(e){toast(e.data?.error||e.message,true);b.disabled=false}};
    }catch(e){if(e.message!=='unauthorized')console.error('AI provider settings',e)}finally{busy=false}
  }
  const content=$('#content');if(content)new MutationObserver(()=>setTimeout(enhance,0)).observe(content,{childList:true});window.addEventListener('hashchange',()=>setTimeout(enhance,60));setTimeout(enhance,800);
})();
