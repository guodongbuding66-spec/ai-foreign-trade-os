(() => {
  'use strict';

  const STORAGE_KEY = 'aftos.v1.store';
  const nativeGet = localStorage.getItem.bind(localStorage);
  const nativeSet = localStorage.setItem.bind(localStorage);
  let serverCompanies = new Map();
  let syncChain = Promise.resolve();
  let auth = null;

  function canonical(c) {
    return {
      id: String(c?.id || ''),
      legalName: String(c?.legalName || '').trim(),
      country: String(c?.country || '').trim().toUpperCase(),
      city: String(c?.city || '').trim(),
      type: String(c?.type || 'Other').trim(),
      industry: String(c?.industry || '').trim(),
      score: Math.max(0, Math.min(100, Number(c?.score || 0))),
      stage: String(c?.stage || 'New').trim(),
      website: String(c?.website || '').trim(),
      source: String(c?.source || 'Manual').trim()
    };
  }

  function equalCompany(a, b) {
    return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
    const type = response.headers.get('content-type') || '';
    let data = null;
    if (type.includes('application/json')) data = await response.json();
    else data = { ok: false, error: `http_${response.status}`, responseType: type || 'unknown' };
    if (response.status === 401) {
      location.replace(`/login.html?return=${encodeURIComponent(location.pathname + location.hash)}`);
      throw new Error('unauthorized');
    }
    if (!response.ok) {
      const error = new Error(data?.error || `http_${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function ensureStore() {
    try {
      const parsed = JSON.parse(nativeGet(STORAGE_KEY) || 'null');
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {}
    const now = new Date().toISOString();
    return {
      meta: { version: '1.0.0-d1', tenantId: auth?.tenant?.id || '', createdAt: now },
      companies: [], contacts: [], products: [], skus: [], packages: [], quotes: [],
      opportunities: [], tasks: [], automations: [], activities: [], loadPlans: []
    };
  }

  function setBadge(text, type = 'ok') {
    const apply = () => {
      const foot = document.querySelector('.sidebar-foot');
      if (!foot) return false;
      let badge = document.getElementById('d1SyncBadge');
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'd1SyncBadge';
        badge.style.cssText = 'margin-top:8px;font-size:10px;line-height:1.4';
        foot.appendChild(badge);
      }
      const color = type === 'bad' ? '#fb7185' : type === 'busy' ? '#fbbf24' : '#34d399';
      badge.innerHTML = `<span style="color:${color}">●</span> ${text}`;
      return true;
    };
    if (!apply()) setTimeout(apply, 250);
  }

  async function restoreFromServer(message) {
    try {
      const result = await api('/api/companies');
      const store = ensureStore();
      store.companies = result.companies || [];
      store.meta = { ...(store.meta || {}), tenantId: auth?.tenant?.id || store.meta?.tenantId, d1CompanySyncAt: new Date().toISOString() };
      nativeSet(STORAGE_KEY, JSON.stringify(store));
      serverCompanies = new Map(store.companies.map(c => [c.id, canonical(c)]));
    } finally {
      setBadge(message || 'D1 sync restored', 'bad');
      setTimeout(() => location.reload(), 900);
    }
  }

  async function syncSnapshot(companies) {
    const next = new Map((companies || []).map(c => [c.id, canonical(c)]).filter(([id]) => id));
    setBadge('D1 syncing…', 'busy');

    for (const [id, company] of next) {
      const previous = serverCompanies.get(id);
      if (!previous) {
        await api('/api/companies', { method: 'POST', body: JSON.stringify(company) });
      } else if (!equalCompany(previous, company)) {
        await api(`/api/companies/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(company) });
      }
    }
    for (const [id] of serverCompanies) {
      if (!next.has(id)) await api(`/api/companies/${encodeURIComponent(id)}`, { method: 'DELETE' });
    }
    serverCompanies = next;
    setBadge(`D1 synced · ${next.size} companies`, 'ok');
  }

  function installCompanySync() {
    const originalSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(key, value) {
      originalSetItem(key, value);
      if (key !== STORAGE_KEY) return;
      let parsed;
      try { parsed = JSON.parse(value); } catch (_) { return; }
      const snapshot = Array.isArray(parsed?.companies) ? parsed.companies.map(canonical) : [];
      syncChain = syncChain
        .then(() => syncSnapshot(snapshot))
        .catch(async error => {
          console.error('D1 company sync failed', error);
          const label = error?.data?.error === 'company_has_references'
            ? '删除失败：Company 已有关联数据'
            : `D1 sync failed: ${error?.message || 'unknown'}`;
          await restoreFromServer(label);
        });
    };
  }

  function loadWorkspaceApp() {
    const script = document.createElement('script');
    script.src = '/assets/app.js';
    script.async = false;
    script.onload = () => {
      window.__AFTOS_AUTH__ = auth;
      setBadge(`D1 synced · ${serverCompanies.size} companies`, 'ok');
    };
    script.onerror = () => {
      document.getElementById('content').innerHTML = '<div class="notice">工作台脚本加载失败，请刷新页面。</div>';
    };
    document.body.appendChild(script);
  }

  async function boot() {
    try {
      const me = await api('/api/auth/me');
      auth = me;
      const companyResult = await api('/api/companies');
      const store = ensureStore();
      store.companies = companyResult.companies || [];
      store.meta = {
        ...(store.meta || {}),
        tenantId: me.tenant?.id || '',
        workspace: me.tenant?.name || '',
        userId: me.user?.id || '',
        d1CompanySyncAt: new Date().toISOString()
      };
      nativeSet(STORAGE_KEY, JSON.stringify(store));
      serverCompanies = new Map(store.companies.map(c => [c.id, canonical(c)]));
      installCompanySync();
      loadWorkspaceApp();
    } catch (error) {
      if (error?.message === 'unauthorized') return;
      const content = document.getElementById('content');
      if (content) content.innerHTML = `<div class="card"><h2>Workspace initialization failed</h2><div class="notice">${String(error?.message || 'Unable to load D1 workspace data')}</div></div>`;
    }
  }

  boot();
})();
